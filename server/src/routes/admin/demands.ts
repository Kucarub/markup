import { Router } from 'express'
import { z } from 'zod'
import type { Demand, Prisma } from '@prisma/client'
import { getPrisma } from '../../lib/prisma'
import { ADMIN_ALL, ADMIN_MANAGE, requireAdminRole } from '../../middlewares/adminRole'
import { requireAuth } from '../../middlewares/auth'
import { recordEvent } from '../../services/analytics'
import { notifyUser, orderNotifyContent } from '../../services/notification'
import { addDays, dayOnly, formatDay, parseDay } from '../../services/schedule'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/errors'
import { pageResult, paginationSchema, toPageArgs } from '../../utils/pagination'

/**
 * 后台需求管理（E12-05）与冷启动代操作（E12-07）。
 * - 列表支持状态 / 城市 / 服务类型 / 来源 / 创建时间筛选；
 * - 详情展示全部响应与最终选定者；
 * - 代发布写 source=ops，代响应写 demand_response.source=ops，列表可标记与统计。
 */
export const adminDemandRouter = Router()

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DEMAND_TYPES = ['bridal', 'daily', 'event', 'photo'] as const
const MAX_AHEAD_DAYS = 180

const listQuery = paginationSchema.extend({
  status: z.enum(['pending', 'selected', 'closed']).optional(),
  city: z.string().trim().max(32).optional(),
  serviceType: z.enum(DEMAND_TYPES).optional(),
  source: z.enum(['customer', 'ops']).optional(),
  from: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD').optional(),
  to: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD').optional(),
  keyword: z.string().trim().max(32).optional(),
})

const createBody = z
  .object({
    customerId: z.coerce.number().int().positive('请选择需求所属客户'),
    city: z.string().trim().min(1, '请选择城市').max(32),
    district: z.string().trim().min(1, '请填写区域').max(32),
    serviceDate: z.string().regex(DAY_RE, '服务日期格式需为 YYYY-MM-DD'),
    serviceType: z.enum(DEMAND_TYPES, { message: '服务类型不合法' }),
    headcount: z.coerce.number().int().min(1, '人数至少 1 人').max(50, '人数过多，请分开发布'),
    budgetMin: z.coerce.number().int().min(0, '预算不能为负').max(100000, '预算超出范围'),
    budgetMax: z.coerce.number().int().min(0, '预算不能为负').max(100000, '预算超出范围'),
    stylePrefs: z.array(z.string().trim().min(1).max(32)).max(5, '最多选择 5 个风格').optional(),
    remark: z.string().trim().max(500, '备注不超过 500 字').optional(),
    targetArtistId: z.coerce.number().int().positive().optional(),
  })
  .refine((value) => value.budgetMin <= value.budgetMax, {
    message: '预算下限不得高于上限',
    path: ['budgetMin'],
  })

const respondBody = z.object({
  artistId: z.coerce.number().int().positive('请选择代响应的化妆师'),
  note: z.string().trim().max(255, '一句说明不超过 255 字').optional(),
})

type DemandWithCount = Demand & { _count: { responses: number } }

function isExpired(demand: Pick<Demand, 'expireAt'>): boolean {
  return Boolean(demand.expireAt && demand.expireAt.getTime() <= Date.now())
}

/** 服务日期：不得早于今天，且不超过 180 天 */
function resolveServiceDate(value: string): Date {
  const date = parseDay(value)
  const today = dayOnly()
  if (date.getTime() < today.getTime()) throw AppError.badRequest('服务日期不得早于今天')
  if (date.getTime() > addDays(today, MAX_AHEAD_DAYS).getTime()) {
    throw AppError.badRequest(`服务日期最多可选未来 ${MAX_AHEAD_DAYS} 天`)
  }
  return date
}

function buildWhere(query: z.infer<typeof listQuery>): Prisma.DemandWhereInput {
  const createdAt: Prisma.DateTimeFilter = {}
  if (query.from) createdAt.gte = dayOnly(parseDay(query.from))
  if (query.to) createdAt.lt = addDays(dayOnly(parseDay(query.to)), 1)

  const numeric = query.keyword && /^\d+$/.test(query.keyword) ? Number(query.keyword) : null

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.city ? { city: query.city } : {}),
    ...(query.serviceType ? { serviceType: query.serviceType } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(query.keyword
      ? {
          OR: [
            ...(numeric ? [{ id: numeric }] : []),
            { remark: { contains: query.keyword } },
            { customer: { nickname: { contains: query.keyword } } },
            { district: { contains: query.keyword } },
          ],
        }
      : {}),
  }
}

function toListItem(row: DemandWithCount & {
  customer: { id: number; nickname: string | null; city: string | null }
  targetArtist: { id: number; name: string } | null
  responses: { artist: { id: number; name: string } }[]
}) {
  return {
    id: row.id,
    city: row.city,
    district: row.district,
    serviceDate: formatDay(row.serviceDate),
    serviceType: row.serviceType,
    headcount: row.headcount,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    status: row.status,
    source: row.source,
    customer: row.customer,
    targetArtist: row.targetArtist,
    responseCount: row._count.responses,
    selectedArtist: row.responses[0]?.artist ?? null,
    expireAt: row.expireAt ? row.expireAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    declineReason: row.declineReason,
    createdAt: row.createdAt.toISOString(),
  }
}

const listInclude = {
  customer: { select: { id: true, nickname: true, city: true } },
  targetArtist: { select: { id: true, name: true } },
  responses: {
    where: { status: 'selected' },
    take: 1,
    select: { artist: { select: { id: true, name: true } } },
  },
  _count: { select: { responses: true } },
} as const

/** 需求列表（E12-05） */
adminDemandRouter.get(
  '/admin/demands',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()
    const where = buildWhere(query)
    const baseWhere = buildWhere({ ...query, status: undefined })

    const [list, total, grouped] = await Promise.all([
      prisma.demand.findMany({
        where,
        include: listInclude,
        orderBy: { id: 'desc' },
        ...toPageArgs(query),
      }),
      prisma.demand.count({ where }),
      prisma.demand.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
    ])

    const counts = { all: 0, pending: 0, selected: 0, closed: 0 }
    grouped.forEach((item) => {
      if (item.status in counts) counts[item.status as keyof typeof counts] = item._count._all
      counts.all += item._count._all
    })

    res.ok({ ...pageResult(list.map(toListItem), total, query), counts })
  }),
)

/** 运营代发布需求（E12-07）：source=ops，进入需求大厅正常可见 */
adminDemandRouter.post(
  '/admin/demands',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_MANAGE),
  asyncHandler(async (req, res) => {
    const input = createBody.parse(req.body)
    const prisma = getPrisma()

    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, userId: true, status: true, nickname: true },
    })
    if (!customer) throw AppError.notFound('需求所属客户不存在')
    if (customer.status === 'disabled') throw AppError.conflict('该客户账号已停用，无法代发布需求')

    const serviceDate = resolveServiceDate(input.serviceDate)
    let targetArtist: { id: number; userId: number } | null = null
    if (input.targetArtistId) {
      const artist = await prisma.artist.findUnique({
        where: { id: input.targetArtistId },
        select: { id: true, userId: true, status: true },
      })
      if (!artist || artist.status !== 'approved') {
        throw AppError.badRequest('该化妆师暂不可预约')
      }
      const slot = await prisma.artistSchedule.findUnique({
        where: { artistId_date: { artistId: artist.id, date: serviceDate } },
      })
      if (!slot || slot.state !== 'available') {
        throw AppError.conflict('该化妆师当日不可接，请换个日期')
      }
      targetArtist = artist
    }

    const created = await prisma.demand.create({
      data: {
        customerId: customer.id,
        targetArtistId: input.targetArtistId,
        city: input.city,
        district: input.district,
        serviceDate,
        serviceType: input.serviceType,
        headcount: input.headcount,
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        stylePrefs: input.stylePrefs?.length ? input.stylePrefs : undefined,
        remark: input.remark,
        source: 'ops',
        expireAt: addDays(serviceDate, 1),
      },
      include: listInclude,
    })

    // 埋点（E13-01）：运营代发布同样计入 demand_publish，props.source=ops 可区分
    void recordEvent({
      event: 'demand_publish',
      userId: req.auth!.uid,
      role: 'admin',
      props: {
        demandId: created.id,
        city: created.city,
        serviceType: created.serviceType,
        source: 'ops',
      },
    })

    if (targetArtist) {
      await notifyUser({
        userId: targetArtist.userId,
        type: 'demand_targeted',
        templateKey: 'invitation',
        title: '收到新的定向预约',
        content: `${customer.nickname || '客户'} · ${orderNotifyContent(created)}`,
        page: `pages/demand/detail/index?id=${created.id}`,
        demandId: created.id,
      })
    }

    res.ok(toListItem(created))
  }),
)

/** 需求详情（E12-05）：响应列表 + 最终选定者 + 服务记录入口 */
adminDemandRouter.get(
  '/admin/demands/:id',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const prisma = getPrisma()
    const demand = await prisma.demand.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            city: true,
            district: true,
            status: true,
          },
        },
        targetArtist: { select: { id: true, name: true, city: true, status: true } },
        responses: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            artist: { select: { id: true, name: true, city: true, district: true, years: true } },
          },
        },
        serviceOrder: { select: { id: true, status: true, createdAt: true } },
      },
    })
    if (!demand) throw AppError.notFound('需求不存在')

    res.ok({
      id: demand.id,
      city: demand.city,
      district: demand.district,
      serviceDate: formatDay(demand.serviceDate),
      serviceType: demand.serviceType,
      headcount: demand.headcount,
      budgetMin: demand.budgetMin,
      budgetMax: demand.budgetMax,
      stylePrefs: (demand.stylePrefs as string[] | null) ?? [],
      remark: demand.remark,
      status: demand.status,
      source: demand.source,
      expireAt: demand.expireAt ? demand.expireAt.toISOString() : null,
      closedAt: demand.closedAt ? demand.closedAt.toISOString() : null,
      declineReason: demand.declineReason,
      declinedAt: demand.declinedAt ? demand.declinedAt.toISOString() : null,
      createdAt: demand.createdAt.toISOString(),
      customer: demand.customer,
      targetArtist: demand.targetArtist,
      serviceOrder: demand.serviceOrder,
      responses: demand.responses.map((item) => ({
        id: item.id,
        status: item.status,
        source: item.source,
        note: item.note,
        createdAt: item.createdAt.toISOString(),
        artist: item.artist,
      })),
    })
  }),
)

/** 运营代响应（E12-07）：demand_response.source=ops，客户在响应列表可见 */
adminDemandRouter.post(
  '/admin/demands/:id/responses',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const input = respondBody.parse(req.body)
    const prisma = getPrisma()

    const demand = await prisma.demand.findUnique({
      where: { id },
      include: { customer: { select: { userId: true } } },
    })
    if (!demand) throw AppError.notFound('需求不存在')
    if (demand.status !== 'pending') throw AppError.conflict('需求已选定或已关闭，无法代响应')
    if (isExpired(demand)) throw AppError.conflict('需求已过期，无法代响应')

    const artist = await prisma.artist.findUnique({
      where: { id: input.artistId },
      select: { id: true, name: true, status: true },
    })
    if (!artist) throw AppError.notFound('化妆师不存在')
    if (artist.status !== 'approved') throw AppError.badRequest('该化妆师未通过审核，无法代响应')
    if (demand.targetArtistId && demand.targetArtistId !== artist.id) {
      throw AppError.conflict('该需求为定向预约，仅指定化妆师可响应')
    }

    try {
      const created = await prisma.demandResponse.create({
        data: {
          demandId: id,
          artistId: artist.id,
          note: input.note || '运营代响应',
          source: 'ops',
        },
      })
      const responseCount = await prisma.demandResponse.count({ where: { demandId: id } })

      // 埋点（E13-01）：运营代响应计入 demand_response，props.source=ops 可区分
      void recordEvent({
        event: 'demand_response',
        userId: req.auth!.uid,
        role: 'admin',
        props: { demandId: id, responseId: created.id, artistId: artist.id, source: 'ops' },
      })

      await notifyUser({
        userId: demand.customer.userId,
        type: 'demand_response',
        templateKey: 'invitation',
        title: '有化妆师响应了你的需求',
        content: `${artist.name} · ${orderNotifyContent(demand)}`,
        page: `pages/demand/detail/index?id=${id}`,
        demandId: id,
      })

      res.ok({
        id: created.id,
        demandId: created.demandId,
        status: created.status,
        source: created.source,
        note: created.note,
        createdAt: created.createdAt.toISOString(),
        responseCount,
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw AppError.conflict('该化妆师已响应过此需求')
      }
      throw error
    }
  }),
)
