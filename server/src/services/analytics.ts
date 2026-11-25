import type { Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'

/**
 * 埋点规范（E13-01）。
 *
 * 5 类关键业务事件由服务端在业务动作成功后写入，前端无需重复上报；
 * 其余自定义事件（搜索、浏览等）仍走 `POST /api/events`。
 * 任何埋点失败只告警，绝不向主流程抛错。
 */

export type EventRole = 'artist' | 'customer' | 'admin'

export const EVENT_SPECS = {
  /** 首次微信登录建档 */
  user_register: { role: null, props: ['userId'] },
  /** 化妆师主页 UV（同设备同日去重后写入） */
  artist_page_view: { role: null, props: ['artistId'] },
  /** 客户发布需求（含运营代发布时 role=admin） */
  demand_publish: { role: 'customer', props: ['demandId', 'city', 'serviceType'] },
  /** 化妆师响应需求（含运营代响应时 role=admin） */
  demand_response: { role: 'artist', props: ['demandId', 'responseId'] },
  /** 服务记录双方确认完成 */
  order_finish: { role: null, props: ['orderId'] },
} as const

export type CanonicalEvent = keyof typeof EVENT_SPECS

export const CANONICAL_EVENTS = Object.keys(EVENT_SPECS) as CanonicalEvent[]

interface RecordEventInput {
  event: CanonicalEvent
  userId?: number | null
  role?: EventRole | null
  props?: Record<string, unknown>
}

/** 写一条 event_log；异常吞掉并告警，保证埋点不阻塞主流程 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    const props = input.props ?? {}
    if (JSON.stringify(props).length > 2000) return
    await getPrisma().eventLog.create({
      data: {
        userId: input.userId ?? null,
        role: input.role ?? null,
        event: input.event,
        props: props as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    console.warn(`[analytics] 埋点写入失败 ${input.event}: ${(error as Error).message}`)
  }
}
