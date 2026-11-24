import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../../lib/prisma'
import { ADMIN_ALL, requireAdminRole } from '../../middlewares/adminRole'
import { requireAuth } from '../../middlewares/auth'
import { settleExpiredFinishes } from '../../services/serviceOrder'
import { addDays, dayOnly, formatDay, parseDay } from '../../services/schedule'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/errors'
import { pageResult, paginationSchema, toPageArgs } from '../../utils/pagination'

/**
 * 后台服务记录（E12-06）。
 * 列表按状态 / 城市 / 服务类型 / 服务日期筛选；
 * 详情抽屉返回「需求 → 响应 → 服务记录 → 评价」的完整链路。
 */
export const adminServiceOrderRouter = Router()

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const SERVICE_TYPES = ['bridal', 'daily', 'event', 'photo'] as const

const listQuery = paginationSchema.extend({
  status: z.enum(['pending', 'confirmed', 'finished', 'cancelled']).optional(),
  city: z.string().trim().max(32).optional(),
  serviceType: z.enum(SERVICE_TYPES).optional(),
  from: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD').optional(),
  to: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD').optional(),
  keyword: z.string().trim().max(32).optional(),
})

function buildWhere(query: z.infer<typeof listQuery>): Prisma.ServiceOrderWhereInput {
  const serviceDate: Prisma.DateTimeFilter = {}
  if (query.from) serviceDate.gte = dayOnly(parseDay(query.from))
  if (query.to) serviceDate.lt = addDays(dayOnly(parseDay(query.to)), 1)

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.city ? { city: query.city } : {}),
    ...(query.serviceType ? { serviceType: query.serviceType } : {}),
    ...(Object.keys(serviceDate).length ? { serviceDate } : {}),
    ...(query.keyword
      ? {
          OR: [
            { customer: { nickname: { contains: query.keyword } } },
            { artist: { name: { contains: query.keyword } } },
            { district: { contains: query.keyword } },
          ],
        }
      : {}),
  }
}

/** 服务记录列表（E12-06） */
adminServiceOrderRouter.get(
  '/admin/service-orders',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()

    // 惰性结算：与小程序侧保持一致，避免后台看到过期的「待确认完成」
    await settleExpiredFinishes()

    const where = buildWhere(query)
    const baseWhere = buildWhere({ ...query, status: undefined })

    const [list, total, grouped] = await Promise.all([
      prisma.serviceOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, nickname: true, userId: true } },
          artist: { select: { id: true, name: true, city: true, userId: true } },
          demand: { select: { id: true, source: true } },
        },
        orderBy: { id: 'desc' },
        ...toPageArgs(query),
      }),
      prisma.serviceOrder.count({ where }),
      prisma.serviceOrder.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
    ])

    const counts = { all: 0, pending: 0, confirmed: 0, finished: 0, cancelled: 0 }
    grouped.forEach((item) => {
      if (item.status in counts) counts[item.status as keyof typeof counts] = item._count._all
      counts.all += item._count._all
    })

    res.ok({
      ...pageResult(
        list.map((order) => ({
          id: order.id,
          demandId: order.demandId,
          demandSource: order.demand.source,
          city: order.city,
          district: order.district,
          serviceDate: formatDay(order.serviceDate),
          serviceType: order.serviceType,
          headcount: order.headcount,
          status: order.status,
          initiatorRole: order.initiatorRole,
          confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
          finishRequestBy: order.finishRequestBy,
          finishRequestAt: order.finishRequestAt ? order.finishRequestAt.toISOString() : null,
          finishTime: order.finishTime ? order.finishTime.toISOString() : null,
          cancelBy: order.cancelBy,
          cancelReason: order.cancelReason,
          cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
          createdAt: order.createdAt.toISOString(),
          customer: order.customer,
          artist: order.artist,
        })),
        total,
        query,
      ),
      counts,
    })
  }),
)

/** 服务记录详情（E12-06）：完整链路「需求 → 响应 → 服务记录 → 评价」 */
adminServiceOrderRouter.get(
  '/admin/service-orders/:id',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const prisma = getPrisma()

    await settleExpiredFinishes()

    const order = await prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, nickname: true, userId: true, city: true } },
        artist: { select: { id: true, name: true, city: true, userId: true } },
        demand: {
          include: {
            responses: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              include: { artist: { select: { id: true, name: true, city: true } } },
            },
            customer: { select: { id: true, nickname: true, userId: true } },
          },
        },
        reviews: {
          orderBy: { id: 'desc' },
          select: {
            id: true,
            fromRole: true,
            toRole: true,
            rating: true,
            content: true,
            status: true,
            createdAt: true,
            fromUser: { select: { nickname: true } },
          },
        },
      },
    })
    if (!order) throw AppError.notFound('服务记录不存在')

    res.ok({
      id: order.id,
      demandId: order.demandId,
      city: order.city,
      district: order.district,
      serviceDate: formatDay(order.serviceDate),
      serviceType: order.serviceType,
      headcount: order.headcount,
      remark: order.remark,
      status: order.status,
      initiatorRole: order.initiatorRole,
      confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
      finishRequestBy: order.finishRequestBy,
      finishRequestAt: order.finishRequestAt ? order.finishRequestAt.toISOString() : null,
      finishTime: order.finishTime ? order.finishTime.toISOString() : null,
      cancelBy: order.cancelBy,
      cancelReason: order.cancelReason,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      customer: order.customer,
      artist: order.artist,
      demand: {
        id: order.demand.id,
        status: order.demand.status,
        source: order.demand.source,
        city: order.demand.city,
        district: order.demand.district,
        serviceDate: formatDay(order.demand.serviceDate),
        serviceType: order.demand.serviceType,
        headcount: order.demand.headcount,
        budgetMin: order.demand.budgetMin,
        budgetMax: order.demand.budgetMax,
        stylePrefs: (order.demand.stylePrefs as string[] | null) ?? [],
        remark: order.demand.remark,
        targetArtistId: order.demand.targetArtistId,
        createdAt: order.demand.createdAt.toISOString(),
        closedAt: order.demand.closedAt ? order.demand.closedAt.toISOString() : null,
        declineReason: order.demand.declineReason,
        customer: order.demand.customer,
        responses: order.demand.responses.map((item) => ({
          id: item.id,
          status: item.status,
          source: item.source,
          note: item.note,
          createdAt: item.createdAt.toISOString(),
          artist: item.artist,
        })),
      },
      reviews: order.reviews.map((item) => ({
        id: item.id,
        fromRole: item.fromRole,
        toRole: item.toRole,
        rating: item.rating,
        content: item.content,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        fromName: item.fromUser.nickname,
      })),
    })
  }),
)
