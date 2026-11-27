import { Router, text, type Request, type Response } from 'express'
import { applyCheckCallback } from '../services/contentSecurity'

/**
 * 微信消息推送回调（E14-01）：接收 media_check_async 的内容安全检测结果。
 * - GET：微信服务器 URL 校验（回显 echostr）；
 * - POST：XML 明文推送，正则提取 TraceId 与 result（funny/similar/spam 等）；
 *   dev 联调兼容 JSON body（{ traceId, result, detail }），便于冒烟测试。
 * 公开路由（微信服务器无登录态），写入面窄：仅按 trace_id 更新对应作品状态。
 */
export const wechatCallbackRouter = Router()

/** 从微信消息推送 XML 中提取字段 */
function xmlValue(xml: string, tag: string): string {
  const matched = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}>([^<]*)</${tag}>`).exec(xml)
  return (matched?.[1] || matched?.[2] || '').trim()
}

function verdictOf(rawResult: string, label: number | string): 'pass' | 'reject' {
  // result 取值：100 pass / 10001 similar / 20001-20006 spam 等；label 为命中类别
  if (rawResult === 'pass' || rawResult === 'risky') {
    return rawResult === 'pass' ? 'pass' : 'reject'
  }
  return Number(rawResult) === 100 ? 'pass' : 'reject'
}

function describe(label: string): string {
  const mapping: Record<string, string> = {
    '100': '正常',
    '10001': '疑似涉政',
    '20001': '涉政',
    '20002': '色情',
    '20003': '涉毒',
    '20004': '赌博',
    '20005': '暴恐',
    '20006': '其他违规',
  }
  return mapping[label] || `风险类别 ${label}`
}

wechatCallbackRouter.get(
  '/wechat/callback',
  asyncHandlerWrapper((req, res) => {
    const echostr = String(req.query.echostr || '')
    res.status(200).send(echostr)
  }),
)

wechatCallbackRouter.post(
  '/wechat/callback',
  // 全局中间件只解析 JSON；微信推送是 XML 明文，这里补一个 text 解析（JSON 已解析时会跳过）
  textBody(),
  asyncHandlerWrapper(async (req, res) => {
    let traceId = ''
    let result = ''
    let label = ''
    let detail = ''

    if (typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length) {
      // dev 联调 / 冒烟测试：JSON 形式 { traceId, result: 'pass'|'reject', detail }
      traceId = String(req.body.traceId || '')
      result = String(req.body.result || '')
      detail = String(req.body.detail || '')
    } else {
      const xml = typeof req.body === 'string' ? req.body : ''
      traceId = xmlValue(xml, 'TraceId')
      result = xmlValue(xml, 'result')
      label = xmlValue(xml, 'label')
      detail = `微信内容安全回调：${describe(label)}`
    }

    if (!traceId) {
      res.status(400).send('missing trace id')
      return
    }
    const verdict = verdictOf(result, label)
    await applyCheckCallback(traceId, verdict, detail || (verdict === 'pass' ? '检测通过' : '检测违规'))
    res.status(200).send('success')
  }),
)

/** 简易异步包装：本路由不做统一鉴权与响应体包装，错误直接 500 */
function asyncHandlerWrapper(
  handler: (req: Request, res: Response) => Promise<void> | void,
): (req: Request, res: Response, next: Next) => void {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next)
  }
}

/** XML 明文读取；仅处理非 JSON 的 content-type，避免抢占全局 express.json 解析 */
function textBody() {
  return text({
    type: (req) => {
      const contentType = req.headers['content-type'] || ''
      return contentType.indexOf('application/json') === -1
    },
    limit: '256kb',
  })
}

type Next = (error?: unknown) => void
