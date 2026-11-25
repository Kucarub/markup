import { Router } from 'express'
import { z } from 'zod'
import type { ServiceOrder } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import { resolveActor, type Actor } from '../services/actor'
import { recordEvent } from '../services/analytics'
import { adjustCredit, CREDIT_CANCEL_DELTA } from '../services/credit'
import { notifyUser, orderNotifyContent } from '../services/notification'
import { releaseDay } from '../services/schedule'
import {
  finishOrderInTx,
  settleExpiredFinishes,
  toOrderDto,
} from '../services/serviceOrder'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'
import { pageResult, paginationSchema, toPageArgs } from '../utils/pagination'

/**
 * 我的服务记录（E10-01 ~ E10-05）。
 * 客户与化妆师共用同一组接口，按登录角色返回当前视角的数据与可执行动作。
 */
export const serviceOrderRouter = Router()

const statusQuery = paginationSchema.extend({
  status: z.enum(['pending', 'confirmed', 'finished', 'cancelled']).optional(),
})

const cancelBody = z.object({
  reason: z.string().trim().min(1, '请填写取消原因').max(255, '取消原因不超过 255 字'),
})

const orderInclude = {
  customer: { select: { nickname: true, userId: true } },
  artist: { select: { name: true, userId: true } },
} as const

type OrderWithInclude = ServiceOrder & {
  customer: { nickname: string | null; userId: number }
  artist: { name: string; userId: number }
}

/** 读取与我相关的服务记录；非当事人一律 404 */
async function loadOrder(id: number, actor: Actor, include?: typeof orderInclude) {
  const prisma = getPrisma()
  const order = await prisma.serviceOrder.findUnique({ where: { id }, include: include ?? orderInclude })
  if (!order) throw AppError.notFound('服务记录不存在')
  const mine =
    actor.role === 'artist' ? order.artistId === actor.artistId : order.customerId === actor.customerId
  if (!mine) throw AppError.notFound('服务记录不存在')
  return order as OrderWithInclude
}

/** 与我相对的另一方 userId（用于给对方发通知） */
function counterpartUserId(order: OrderWithInclude, actor: Actor): number {
  return actor.role === 'artist' ? order.customer.userId : order.artist.userId
}

/** 我的服务记录列表（E10-02）：四态筛选 + 各状态计数 */
serviceOrderRouter.get(
  '/service-orders',
  requireAuth('customer', 'artist'),
  asyncHandler(async (req, res) => {
    const query = statusQuery.parse(req.query)
    const actor = await resolveActor(req.auth!)
    const prisma = getPrisma()

    // 惰性结算：发起完工确认满 7 天的记录自动完成
    await settleExpiredFinishes()

    const mineWhere =
      actor.role === 'artist' ? { artistId: actor.artistId! } : { customerId: actor.customerId! }
    const where = query.status ? { ...mineWhere, status: query.status } : mineWhere

    const [total, rows, grouped, reviews] = await Promise.all([
      prisma.serviceOrder.count({ where }),
      prisma.serviceOrder.findMany({
        where,
        include: orderInclude,
        orderBy: [{ serviceDate: 'desc' }, { id: 'desc' }],
        ...toPageArgs(query),
      }),
      prisma.serviceOrder.groupBy({ by: ['status'], where: mineWhere, _count: { _all: true } }),
      prisma.review.findMany({
        where: { fromUserId: actor.userId },
        select: {
          id: true,
          rating: true,
          tags: true,
          content: true,
          status: true,
          createdAt: true,
          serviceOrderId: true,
        },
      }),
    ])

    const reviewByOrder = new Map(reviews.map((item) => [item.serviceOrderId, item]))
    const counts = { all: 0, pending: 0, confirmed: 0, finished: 0, cancelled: 0 }
    grouped.forEach((item) => {
      if (item.status in counts) counts[item.status as keyof typeof counts] = item._count._all
      counts.all += item._count._all
    })

    res.ok({
      ...pageResult(
        rows.map((row) => toOrderDto(row, actor.role, reviewByOrder.get(row.id) ?? null)),
        total,
        query,
      ),
      counts,
    })
  }),
)

/** 服务记录详情（E10-03）：当事人可见，含双方确认状态与按钮态 */
serviceOrderRouter.get(
  '/service-orders/:id',
  requireAuth('customer', 'artist'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('服务记录不存在')
    const actor = await resolveActor(req.auth!)

    await settleExpiredFinishes()
    const order = await loadOrder(id, actor)
    const review = await getPrisma().review.findUnique({
      where: { serviceOrderId_fromUserId: { serviceOrderId: id, fromUserId: actor.userId } },
    })
    res.ok(toOrderDto(order, actor.role, review))
  }),
)

/** 确认接单（E10-01）：待确认 → 已确认，仅非发起方操作 */
serviceOrderRouter.post(
  '/service-orders/:id/confirm',
  requireAuth('customer', 'artist'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const actor = await resolveActor(req.auth!)
    const order = await loadOrder(id, actor)

    if (order.status !== 'pending') {
      throw AppError.conflict(
        order.status === 'cancelled' ? '服务记录已取消，无法确认' : '服务记录已确认，无需重复操作',
      )
    }
    if (order.initiatorRole === actor.role) throw AppError.forbidden('请等待对方确认这条服务记录')

    const updated = await getPrisma().serviceOrder.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'confirmed', confirmedAt: new Date() },
    })
    if (updated.count === 0) throw AppError.conflict('服务记录状态已变化，请刷新后重试')

    // 已确认通知（E11-03）：告知发起方对方已确认接单
    await notifyUser({
      userId: counterpartUserId(order, actor),
      type: 'order_confirmed',
      templateKey: 'result',
      title: '服务记录已确认',
      content: orderNotifyContent(order),
      page: `pages/order/detail/index?id=${id}`,
      orderId: id,
    })

    res.ok(toOrderDto(await loadOrder(id, actor), actor.role))
  }),
)

/**
 * 完工确认（E10-04）：任一方发起、另一方确认闭单。
 * 第一次调用记录发起方并等待；对方再调用即完成，双方信用 +2。
 */
serviceOrderRouter.post(
  '/service-orders/:id/finish',
  requireAuth('customer', 'artist'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const actor = await resolveActor(req.auth!)
    const order = await loadOrder(id, actor)

    if (order.status !== 'confirmed') {
      throw AppError.conflict(
        order.status === 'pending'
          ? '服务记录待确认，确认后才能发起完成'
          : '当前状态不可发起完成确认',
      )
    }
    if (order.finishRequestBy === actor.role) {
      throw AppError.conflict('你已发起完成确认，请等待对方确认或 7 天后自动完成')
    }

    const prisma = getPrisma()
    const firstRequest = !order.finishRequestBy
    if (firstRequest) {
      const marked = await prisma.serviceOrder.updateMany({
        where: { id, status: 'confirmed', finishRequestBy: null },
        data: { finishRequestBy: actor.role, finishRequestAt: new Date() },
      })
      if (marked.count === 0) throw AppError.conflict('服务记录状态已变化，请刷新后重试')
    } else {
      await prisma.$transaction(async (tx) => {
        const reloaded = await tx.serviceOrder.findUnique({
          where: { id },
          select: { status: true, finishRequestBy: true },
        })
        if (!reloaded || reloaded.status !== 'confirmed') {
          throw AppError.conflict('服务记录状态已变化，请刷新后重试')
        }
        await finishOrderInTx(tx, order)
      })
    }

    // 埋点（E13-01）：双方确认完成时记一条 order_finish
    if (!firstRequest) {
      void recordEvent({
        event: 'order_finish',
        userId: req.auth!.uid,
        role: actor.role,
        props: { orderId: id, serviceType: order.serviceType },
      })
    }

    // 完工通知（E11-03）：首次发起提醒对方确认；双方确认完成提醒发起方
    await notifyUser({
      userId: counterpartUserId(order, actor),
      type: firstRequest ? 'order_finish_requested' : 'order_finished',
      templateKey: 'result',
      title: firstRequest ? '对方已发起完工确认' : '服务记录已完成',
      content: orderNotifyContent(order),
      page: `pages/order/detail/index?id=${id}`,
      orderId: id,
    })

    res.ok(toOrderDto(await loadOrder(id, actor), actor.role))
  }),
)

/** 取消服务记录（E10-05）：填原因、记取消方、同事务释放档期、取消方信用 -5 */
serviceOrderRouter.post(
  '/service-orders/:id/cancel',
  requireAuth('customer', 'artist'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const input = cancelBody.parse(req.body)
    const actor = await resolveActor(req.auth!)
    const order = await loadOrder(id, actor)

    if (order.status !== 'pending' && order.status !== 'confirmed') {
      throw AppError.conflict(
        order.status === 'finished' ? '服务已完成，不可取消' : '服务记录已取消',
      )
    }

    const prisma = getPrisma()
    await prisma.$transaction(async (tx) => {
      const updated = await tx.serviceOrder.updateMany({
        where: { id, status: { in: ['pending', 'confirmed'] } },
        data: {
          status: 'cancelled',
          cancelReason: input.reason,
          cancelBy: actor.role,
          cancelledAt: new Date(),
        },
      })
      if (updated.count === 0) throw AppError.conflict('服务记录状态已变化，请刷新后重试')

      // 仅释放本记录占用的档期，避免误伤手工标记的休息日
      await releaseDay(order.artistId, order.serviceDate, order.id, tx)
      await adjustCredit(tx, {
        userId: actor.userId,
        role: actor.role,
        delta: CREDIT_CANCEL_DELTA,
        type: 'cancel',
        orderId: order.id,
      })
    })

    // 取消通知（E11-03）：通知被取消的一方
    await notifyUser({
      userId: counterpartUserId(order, actor),
      type: 'order_cancelled',
      templateKey: 'result',
      title: '服务记录已取消',
      content: `${actor.role === 'artist' ? '化妆师' : '客户'}取消 · ${input.reason}`,
      page: `pages/order/detail/index?id=${id}`,
      orderId: id,
    })

    res.ok(toOrderDto(await loadOrder(id, actor), actor.role))
  }),
)
