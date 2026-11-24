import { env } from '../config/env'
import { getPrisma } from '../lib/prisma'

/**
 * 订阅消息授权（E11-01）。
 * - 模板键固定为 invitation（预约与响应）/ result（服务进度），与 env 中的模板 ID 对应；
 * - 授权结果落 subscribe_record，拒绝后 7 天内不再弹窗打扰；
 * - 未配置模板 ID 时 configured=false，小程序端跳过弹窗，避免 wx.requestSubscribeMessage 报错。
 */
export type SubscribeTemplateKey = 'invitation' | 'result'
export type SubscribeStatus = 'accepted' | 'rejected'

export const SUBSCRIBE_SUPPRESS_DAYS = 7
const SUPPRESS_MS = SUBSCRIBE_SUPPRESS_DAYS * 24 * 60 * 60 * 1000

interface TemplateDefinition {
  key: SubscribeTemplateKey
  title: string
  description: string
  page: string
  templateId: () => string
}

export const SUBSCRIBE_TEMPLATES: TemplateDefinition[] = [
  {
    key: 'invitation',
    title: '预约与响应通知',
    description: '有人响应你的需求，或收到新的定向预约时提醒',
    page: 'pages/order/list/index',
    templateId: () => env.WX_TEMPLATE_INVITATION || '',
  },
  {
    key: 'result',
    title: '服务进度通知',
    description: '服务记录确认、完成或取消时提醒',
    page: 'pages/order/records/index',
    templateId: () => env.WX_TEMPLATE_RESULT || '',
  },
]

export function getSubscribeTemplate(key: string): TemplateDefinition | undefined {
  return SUBSCRIBE_TEMPLATES.find((item) => item.key === key)
}

export function isSubscribeTemplateKey(value: string): value is SubscribeTemplateKey {
  return SUBSCRIBE_TEMPLATES.some((item) => item.key === value)
}

export interface SubscribeTemplateView {
  key: SubscribeTemplateKey
  title: string
  description: string
  templateId: string | null
  configured: boolean
  accepted: boolean
  shouldPrompt: boolean
  lastPromptAt: string | null
  lastRejectedAt: string | null
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/** 当前用户各模板的授权状态与是否应弹窗（E11-01） */
export async function getSubscribeOverview(userId: number): Promise<SubscribeTemplateView[]> {
  const records = await getPrisma().subscribeRecord.findMany({ where: { userId } })
  const byKey = new Map(records.map((item) => [item.templateKey, item]))
  const now = Date.now()

  return SUBSCRIBE_TEMPLATES.map((template) => {
    const row = byKey.get(template.key)
    const templateId = template.templateId()
    const accepted = row?.status === 'accepted'
    const suppressed = Boolean(
      row?.lastRejectedAt && now - row.lastRejectedAt.getTime() < SUPPRESS_MS,
    )
    return {
      key: template.key,
      title: template.title,
      description: template.description,
      templateId: templateId || null,
      configured: Boolean(templateId),
      accepted,
      shouldPrompt: !accepted && !suppressed,
      lastPromptAt: iso(row?.lastPromptAt),
      lastRejectedAt: iso(row?.lastRejectedAt),
    }
  })
}

/** 写入小程序授权结果：接受/拒绝都累加提示次数，拒绝记录时间用于 7 天静默 */
export async function recordSubscribeResults(
  userId: number,
  results: { key: SubscribeTemplateKey; status: SubscribeStatus }[],
): Promise<void> {
  const prisma = getPrisma()
  const now = new Date()

  for (const item of results) {
    const rejected = item.status === 'rejected'
    await prisma.subscribeRecord.upsert({
      where: { userId_templateKey: { userId, templateKey: item.key } },
      create: {
        userId,
        templateKey: item.key,
        status: item.status,
        promptCount: 1,
        lastPromptAt: now,
        lastRejectedAt: rejected ? now : null,
      },
      update: {
        status: item.status,
        promptCount: { increment: 1 },
        lastPromptAt: now,
        lastRejectedAt: rejected ? now : null,
      },
    })
  }
}

/** 发送前校验：只有明确接受的模板才调用微信接口 */
export async function isSubscribeAccepted(
  userId: number,
  key: SubscribeTemplateKey,
): Promise<boolean> {
  const record = await getPrisma().subscribeRecord.findUnique({
    where: { userId_templateKey: { userId, templateKey: key } },
    select: { status: true },
  })
  return record?.status === 'accepted'
}
