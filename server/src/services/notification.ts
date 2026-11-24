import type { Notification, Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { formatDay } from './schedule'
import { getSubscribeTemplate, isSubscribeAccepted, type SubscribeTemplateKey } from './subscription'
import { hasWechatConfig, sendSubscribeMessage } from './wechat'

/**
 * 订阅消息与站内消息（E11-02 / E11-03）。
 * - 每次业务事件先落一条 notification（站内消息），再尝试发送订阅消息；
 * - 未配置模板 / 未配置小程序凭证 / 用户未授权 → status=skipped，静默降级为站内消息，不抛错；
 * - 发送失败重试 1 次，最终 status=failed 并写入 failReason，业务主流程不受影响。
 */
export const SERVICE_TYPE_LABEL: Record<string, string> = {
  bridal: '婚礼跟妆',
  daily: '日常妆造',
  event: '商业活动',
  photo: '写真拍摄',
}

export const NOTIFICATION_STATUS = ['pending', 'sent', 'skipped', 'failed'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number]

/** 微信 thing 类型字段上限 20 字符 */
const THING_LIMIT = 20
const SEND_ATTEMPTS = 2
const RETRY_DELAY_MS = 300

export interface NotifyInput {
  userId: number
  /** 业务事件：demand_targeted / demand_response / order_confirmed / ... */
  type: string
  templateKey: SubscribeTemplateKey
  title: string
  content: string
  page?: string
  orderId?: number
  demandId?: number
}

export interface NotificationPayload {
  title: string
  content: string
  page: string
  templateKey: SubscribeTemplateKey
  templateId: string
  data: Record<string, { value: string }>
  orderId?: number
  demandId?: number
}

export interface NotificationView {
  id: number
  type: string
  title: string
  content: string
  page: string
  status: string
  failReason: string | null
  createdAt: string
}

function clip(value: string, limit = THING_LIMIT): string {
  const text = String(value || '').trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 订阅消息 time 字段：YYYY-MM-DD HH:mm */
export function formatNotifyTime(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/** 服务记录类通知的通用内容：服务类型 · 服务日期 */
export function orderNotifyContent(order: {
  serviceType: string
  serviceDate: Date
}): string {
  return `${SERVICE_TYPE_LABEL[order.serviceType] || order.serviceType} · ${formatDay(
    order.serviceDate,
  )}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function payloadOf(row: Notification): NotificationPayload {
  const raw = (row.payload || {}) as Partial<NotificationPayload>
  return {
    title: raw.title || '',
    content: raw.content || '',
    page: raw.page || '',
    templateKey: (raw.templateKey || 'result') as SubscribeTemplateKey,
    templateId: raw.templateId || '',
    data: raw.data || {},
    orderId: raw.orderId,
    demandId: raw.demandId,
  }
}

export function toNotificationDto(row: Notification): NotificationView {
  const payload = payloadOf(row)
  return {
    id: row.id,
    type: row.type,
    title: payload.title,
    content: payload.content,
    page: payload.page,
    status: row.status,
    failReason: row.failReason,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * 记录并尽力发送一条通知。
 * 永远不抛错：所有异常收敛为 status=failed 的日志，保证业务接口稳定。
 */
export async function notifyUser(input: NotifyInput): Promise<NotificationView | null> {
  const prisma = getPrisma()
  const template = getSubscribeTemplate(input.templateKey)
  const page = input.page || template?.page || 'pages/order/records/index'
  const templateId = template?.templateId() || ''
  const time = formatNotifyTime()
  const data: Record<string, { value: string }> = {
    thing1: { value: clip(input.title) },
    thing2: { value: clip(input.content) },
    time3: { value: time },
  }
  const payload: NotificationPayload = {
    title: input.title,
    content: input.content,
    page,
    templateKey: input.templateKey,
    templateId,
    data,
    ...(input.orderId ? { orderId: input.orderId } : {}),
    ...(input.demandId ? { demandId: input.demandId } : {}),
  }

  const created = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: 'pending',
    },
  })

  const settle = (status: NotificationStatus, failReason?: string) =>
    prisma.notification
      .update({
        where: { id: created.id },
        data: {
          status,
          sentAt: status === 'sent' ? new Date() : null,
          failReason: failReason ? failReason.slice(0, 255) : null,
        },
      })
      .then(toNotificationDto)
      .catch(() => null)

  if (!template || !templateId) {
    return settle('skipped', '未配置订阅消息模板，已降级为站内消息')
  }
  if (!hasWechatConfig()) {
    return settle('skipped', '未配置小程序凭证，已降级为站内消息')
  }

  const accepted = await isSubscribeAccepted(input.userId, input.templateKey).catch(() => false)
  if (!accepted) {
    return settle('skipped', '用户未授权订阅，已降级为站内消息')
  }

  const user = await prisma.userAuth
    .findUnique({ where: { id: input.userId }, select: { openid: true, status: true } })
    .catch(() => null)
  if (!user || user.status !== 'active') {
    return settle('skipped', '账号不可用，已降级为站内消息')
  }

  let lastError: unknown = null
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt += 1) {
    try {
      await sendSubscribeMessage({
        openid: user.openid,
        templateId,
        page,
        data,
      })
      return settle('sent')
    } catch (error) {
      lastError = error
      if (attempt < SEND_ATTEMPTS - 1) await sleep(RETRY_DELAY_MS)
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError || '订阅消息发送失败')
  return settle('failed', message)
}
