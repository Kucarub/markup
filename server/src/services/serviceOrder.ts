import type { Prisma, ServiceOrder } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { adjustCredit, CREDIT_FINISH_DELTA } from './credit'
import { notifyUser, orderNotifyContent } from './notification'
import { formatDay } from './schedule'

/**
 * 服务记录状态机（E10-01 / E10-04）。
 *
 * 合法流转：
 *   pending --confirm(非发起方)--> confirmed
 *   confirmed --finish(一方发起)--> confirmed（等待对方）
 *   confirmed --finish(对方确认)--> finished
 *   confirmed --7 天未确认--> finished（自动完成）
 *   pending/confirmed --cancel(填原因)--> cancelled（同事务释放档期）
 * 非法流转（已完成/已取消再操作、跨状态操作）统一 409。
 */
export type OrderPartyRole = 'artist' | 'customer'

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  finished: '已完成',
  cancelled: '已取消',
}

export const ORDER_STATUS_TONE: Record<string, string> = {
  pending: 'warning',
  confirmed: 'brand',
  finished: 'success',
  cancelled: 'neutral',
}

/** 发起完工确认后，对方多少天未确认则自动完成 */
export const AUTO_FINISH_DAYS = 7

export const CANCEL_BY_LABEL: Record<string, string> = {
  artist: '化妆师取消',
  customer: '客户取消',
}

export interface OrderReviewView {
  id: number
  rating: number
  tags: string[]
  content: string | null
  status: string
  createdAt: string
}

type OrderWithParties = ServiceOrder & {
  customer?: { nickname: string | null } | null
  artist?: { name: string } | null
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function reviewView(review: {
  id: number
  rating: number
  tags: unknown
  content: string | null
  status: string
  createdAt: Date
}): OrderReviewView {
  return {
    id: review.id,
    rating: review.rating,
    tags: Array.isArray(review.tags) ? (review.tags as string[]) : [],
    content: review.content,
    status: review.status,
    createdAt: review.createdAt.toISOString(),
  }
}

/**
 * 服务记录 DTO（E10-02 / E10-03）：不含金额，含双方确认状态与当前视角可执行动作。
 * 传 viewerRole 时计算按钮态，小程序直接渲染，避免前端重复推导状态机。
 */
export function toOrderDto(
  order: OrderWithParties,
  viewerRole?: OrderPartyRole,
  myReview?: Parameters<typeof reviewView>[0] | null,
) {
  const autoFinishAt = order.finishRequestAt
    ? new Date(order.finishRequestAt.getTime() + AUTO_FINISH_DAYS * 24 * 60 * 60 * 1000)
    : null

  const isPending = order.status === 'pending'
  const isConfirmed = order.status === 'confirmed'

  /** 待确认时由「非发起方」确认接单 */
  const canConfirm = Boolean(viewerRole && isPending && viewerRole !== order.initiatorRole)

  /** 完工确认：未发起→可发起；对方已发起→我来确认；我已发起→等待对方 */
  let finishState: 'none' | 'requestable' | 'confirmable' | 'waiting' = 'none'
  if (isConfirmed) {
    if (!order.finishRequestBy) finishState = 'requestable'
    else if (viewerRole && order.finishRequestBy === viewerRole) finishState = 'waiting'
    else if (viewerRole) finishState = 'confirmable'
  }

  const canCancel = isPending || isConfirmed
  const canReview = Boolean(viewerRole && order.status === 'finished' && !myReview)

  return {
    id: order.id,
    demandId: order.demandId,
    status: order.status,
    statusLabel: ORDER_STATUS_LABEL[order.status] || order.status,
    tone: ORDER_STATUS_TONE[order.status] || 'neutral',
    serviceDate: formatDay(order.serviceDate),
    serviceType: order.serviceType,
    headcount: order.headcount,
    city: order.city,
    district: order.district,
    remark: order.remark,
    initiatorRole: order.initiatorRole,
    artistConfirmed: order.artistConfirmed,
    customerConfirmed: order.customerConfirmed,
    finishState,
    canConfirm,
    canCancel,
    canReview,
    confirmedAt: iso(order.confirmedAt),
    finishRequestBy: order.finishRequestBy,
    finishRequestAt: iso(order.finishRequestAt),
    autoFinishAt: iso(autoFinishAt),
    finishTime: iso(order.finishTime),
    cancelReason: order.cancelReason,
    cancelBy: order.cancelBy,
    cancelByLabel: order.cancelBy ? CANCEL_BY_LABEL[order.cancelBy] || order.cancelBy : null,
    cancelledAt: iso(order.cancelledAt),
    artistName: order.artist?.name ?? null,
    customerName: order.customer?.nickname || '客户',
    myReview: myReview ? reviewView(myReview) : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

/**
 * 到期自动完成（E10-04）：发起完工确认后 7 天对方未确认，视为完成并给双方加分。
 * 在服务记录列表 / 详情读取前惰性结算，避免依赖外部定时任务。
 */
export async function settleExpiredFinishes(): Promise<number> {
  const prisma = getPrisma()
  const deadline = new Date(Date.now() - AUTO_FINISH_DAYS * 24 * 60 * 60 * 1000)
  const expired = await prisma.serviceOrder.findMany({
    where: { status: 'confirmed', finishRequestAt: { not: null, lte: deadline } },
    select: {
      id: true,
      finishRequestAt: true,
      serviceType: true,
      serviceDate: true,
      customer: { select: { userId: true } },
      artist: { select: { userId: true } },
    },
  })

  let settled = 0
  for (const order of expired) {
    const finishTime = new Date(
      (order.finishRequestAt as Date).getTime() + AUTO_FINISH_DAYS * 24 * 60 * 60 * 1000,
    )
    const done = await prisma.$transaction(async (tx) => {
      const updated = await tx.serviceOrder.updateMany({
        where: { id: order.id, status: 'confirmed' },
        data: {
          status: 'finished',
          artistConfirmed: true,
          customerConfirmed: true,
          finishTime,
        },
      })
      if (updated.count === 0) return false

      await adjustCredit(tx, {
        userId: order.customer.userId,
        role: 'customer',
        delta: CREDIT_FINISH_DELTA,
        type: 'finish',
        orderId: order.id,
      })
      await adjustCredit(tx, {
        userId: order.artist.userId,
        role: 'artist',
        delta: CREDIT_FINISH_DELTA,
        type: 'finish',
        orderId: order.id,
      })
      return true
    })
    if (done) {
      settled += 1
      // 自动完成通知（E11-03）：双方各收一条站内消息
      const content = orderNotifyContent(order)
      for (const userId of [order.customer.userId, order.artist.userId]) {
        await notifyUser({
          userId,
          type: 'order_auto_finished',
          templateKey: 'result',
          title: '服务记录已自动完成',
          content,
          page: `pages/order/detail/index?id=${order.id}`,
          orderId: order.id,
        })
      }
    }
  }
  return settled
}

/** 事务内完成服务记录：双方确认 + 写完成时间 + 双方信用 +2 */
export async function finishOrderInTx(
  tx: Prisma.TransactionClient,
  order: { id: number; customer: { userId: number }; artist: { userId: number } },
): Promise<void> {
  const updated = await tx.serviceOrder.updateMany({
    where: { id: order.id, status: 'confirmed' },
    data: {
      status: 'finished',
      artistConfirmed: true,
      customerConfirmed: true,
      finishTime: new Date(),
    },
  })
  if (updated.count === 0) return

  await adjustCredit(tx, {
    userId: order.customer.userId,
    role: 'customer',
    delta: CREDIT_FINISH_DELTA,
    type: 'finish',
    orderId: order.id,
  })
  await adjustCredit(tx, {
    userId: order.artist.userId,
    role: 'artist',
    delta: CREDIT_FINISH_DELTA,
    type: 'finish',
    orderId: order.id,
  })
}
