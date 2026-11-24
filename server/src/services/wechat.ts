import { env, isProd } from '../config/env'
import { AppError } from '../utils/errors'
import { ErrorCode } from '../utils/response'

/**
 * 微信开放能力封装（E3-01 / E3-02 / E11-02）。
 * - code2session：wx.login 的 code 换 openid
 * - getAccessToken：client_credential，内存缓存至过期前 5 分钟
 * - getPhoneNumber：getPhoneNumber 的 code 换手机号
 * - sendSubscribeMessage：服务通知订阅消息（E11-02）
 * 未配置 WX_APPID / WX_SECRET 时走 dev 兜底，保证本地全链路可联调。
 */

interface Code2SessionResult {
  openid: string
  unionid?: string
  sessionKey?: string
}

interface WechatErrorBody {
  errcode?: number
  errmsg?: string
}

const CODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session'
const ACCESS_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token'
const PHONE_URL = 'https://api.weixin.qq.com/wxa/business/getuserphonenumber'
const WXACODE_URL = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit'
const SUBSCRIBE_SEND_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send'
const TIMEOUT_MS = 8000
/** 订阅消息发送单次超时：配合重试控制在 10s 送达 SLA 内 */
const SUBSCRIBE_TIMEOUT_MS = 3000

let warnedDevFallback = false

function hasWxConfig() {
  return Boolean(env.WX_APPID && env.WX_SECRET)
}

/** 是否已配置小程序 AppID / Secret（E11-02 降级判断） */
export function hasWechatConfig() {
  return hasWxConfig()
}

function warnDevFallback(scene: string) {
  if (warnedDevFallback) return
  warnedDevFallback = true
  console.warn(`[wechat] WX_APPID / WX_SECRET 未配置，${scene}使用 dev 兜底（仅限本地联调）`)
}

async function wxGet<T>(url: string): Promise<T & WechatErrorBody> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `微信接口请求失败(${res.status})`)
  }
  return (await res.json()) as T & WechatErrorBody
}

async function wxPost<T>(
  url: string,
  body: unknown,
  timeoutMs: number = TIMEOUT_MS,
): Promise<T & WechatErrorBody> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `微信接口请求失败(${res.status})`)
  }
  return (await res.json()) as T & WechatErrorBody
}

/** wx.login code -> openid；dev 模式下以 dev- 前缀 code 直接作为 openid，便于复用种子账号 */
export async function code2session(code: string): Promise<Code2SessionResult> {
  if (!hasWxConfig()) {
    warnDevFallback('登录')
    return { openid: code.startsWith('dev-') ? code : `dev-openid-${code}` }
  }

  const params = new URLSearchParams({
    appid: env.WX_APPID as string,
    secret: env.WX_SECRET as string,
    js_code: code,
    grant_type: 'authorization_code',
  })
  const body = await wxGet<{ openid?: string; unionid?: string; session_key?: string }>(
    `${CODE2SESSION_URL}?${params.toString()}`,
  )
  if (body.errcode || !body.openid) {
    throw AppError.badRequest(`微信登录失败：${body.errmsg || 'code 无效'}`)
  }
  return { openid: body.openid, unionid: body.unionid, sessionKey: body.session_key }
}

let accessTokenCache: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token
  }
  const params = new URLSearchParams({
    grant_type: 'client_credential',
    appid: env.WX_APPID as string,
    secret: env.WX_SECRET as string,
  })
  const body = await wxGet<{ access_token?: string; expires_in?: number }>(
    `${ACCESS_TOKEN_URL}?${params.toString()}`,
  )
  if (body.errcode || !body.access_token) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `获取微信 access_token 失败：${body.errmsg || body.errcode}`)
  }
  accessTokenCache = {
    token: body.access_token,
    // 提前 5 分钟过期，避免边界失效
    expiresAt: Date.now() + Math.max((body.expires_in || 7200) - 300, 60) * 1000,
  }
  return accessTokenCache.token
}

/** getPhoneNumber code -> 手机号；dev 模式下 code 为 11 位手机号时直接回显 */
export async function getPhoneNumber(code: string): Promise<string> {
  if (!hasWxConfig()) {
    warnDevFallback('手机号解析')
    return /^1\d{10}$/.test(code) ? code : '13800000000'
  }

  const token = await getAccessToken()
  const body = await wxPost<{ phone_info?: { purePhoneNumber?: string; phoneNumber?: string } }>(
    `${PHONE_URL}?access_token=${token}`,
    { code },
  )
  if (body.errcode) {
    // 40029 / 40163：code 无效或已使用
    throw AppError.badRequest(`手机号验证失败：${body.errmsg || body.errcode}`)
  }
  const phone = body.phone_info?.purePhoneNumber || body.phone_info?.phoneNumber
  if (!phone) throw AppError.badRequest('手机号验证失败：未返回手机号')
  return phone
}

/**
 * 生成小程序码（E5-05）：未配置 AppID/Secret 时抛出明确错误。
 * scene 上限 32 字符，page 必须为已发布页面路径。
 */
export async function getUnlimitedQrCode(
  scene: string,
  page: string,
  width = 430,
): Promise<Buffer> {
  if (!hasWxConfig()) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, '未配置小程序 AppID / Secret，暂无法生成小程序码')
  }

  const token = await getAccessToken()
  const res = await fetch(`${WXACODE_URL}?access_token=${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scene, page, width, check_path: false }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const contentType = res.headers.get('content-type') || ''
  if (!res.ok || !contentType.includes('image')) {
    const body = (await res.json().catch(() => ({}))) as WechatErrorBody
    throw new AppError(ErrorCode.INTERNAL_ERROR, `生成小程序码失败：${body.errmsg || res.status}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/**
 * 发送订阅消息（E11-02）。
 * data 为模板字段键值对（thing1 / thing2 / time3，与微信后台模板保持一致）。
 * access_token 失效时清缓存并重试一次；其余错误直接抛出，由通知服务记录失败并降级。
 */
export async function sendSubscribeMessage(input: {
  openid: string
  templateId: string
  page?: string
  data: Record<string, { value: string }>
}): Promise<void> {
  if (!hasWxConfig()) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, '未配置小程序凭证，无法发送订阅消息')
  }

  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const token = await getAccessToken()
      const body = await wxPost<Record<string, never>>(
        `${SUBSCRIBE_SEND_URL}?access_token=${token}`,
        {
          touser: input.openid,
          template_id: input.templateId,
          page: input.page,
          data: input.data,
          miniprogram_state: isProd ? 'formal' : 'trial',
          lang: 'zh_CN',
        },
        SUBSCRIBE_TIMEOUT_MS,
      )
      if (body.errcode) {
        if ([40001, 42001, 40014].includes(body.errcode) && attempt === 0) {
          accessTokenCache = null
          lastError = new AppError(
            ErrorCode.INTERNAL_ERROR,
            `access_token 失效：${body.errmsg || body.errcode}`,
          )
          continue
        }
        throw new AppError(
          ErrorCode.INTERNAL_ERROR,
          `订阅消息发送失败：${body.errmsg || body.errcode}`,
        )
      }
      return
    } catch (error) {
      lastError = error
      break
    }
  }
  throw lastError instanceof Error ? lastError : new Error('订阅消息发送失败')
}
