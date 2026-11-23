import { Router, type Request } from 'express'
import { z } from 'zod'
import type { Artist, Demand, Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import { currentCustomer } from '../services/customer'
import { addDays, claimDay, dayOnly, formatDay, parseDay } from '../services/schedule'
import { toOrderDto } from '../services/serviceOrder'
import { buildSignedPath } from '../services/storage'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'
import { extractBearerToken, verifyToken, type TokenRole } from '../utils/jwt'
import { pageResult, paginationSchema, toPageArgs } from '../utils/pagination'
import { ErrorCode } from '../utils/response'

/**
 * 客户需求（E7-02 / E7-03 / E7-04）。
 * - 客户发布需求等待同城化妆师响应；带 targetArtistId 即为定向预约（E9-02/03）；
 * - 平台不记录成交金额，预算区间仅作撮合参考，履约与付款在线下完成；
 * - 状态只有 pending / selected / closed，「已响应」由响应数派生。
 */
export const demandRouter = Router()

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DEMAND_TYPES = ['bridal', 'daily', 'event', 'photo'] as const

/** 单客户每日发布上限（防刷） */
const DAILY_LIMIT = 5
/** 同内容重复提交的幂等窗口 */
const DEDUPE_MS = 5 * 60 * 1000
/** 服务日期最远可选范围，与档期可设置窗口一致 */
const MAX_AHEAD_DAYS = 180

const demandBody = z
  .object({
    city: z.string().trim().min(1, '请选择城市').max(32),
    district: z.string().trim().min(1, '请填写区域').max(32),
    serviceDate: z.string().regex(DAY_RE, '服务日期格式需为 YYYY-MM-DD'),
    serviceType: z.enum(DEMAND_TYPES, { message: '服务类型不合法' }),
    headcount: z.coerce.number().int('人数需为整数').min(1, '人数至少 1 人').max(50, '人数过多，请分开发布'),
    budgetMin: z.coerce.number().int('预算需为整数').min(0, '预算不能为负').max(100000, '预算超出范围'),
    budgetMax: z.coerce.number().int('预算需为整数').min(0, '预算不能为负').max(100000, '预算超出范围'),
    stylePrefs: z.array(z.string().trim().min(1).max(32)).max(5, '最多选择 5 个风格').optional(),
    remark: z.string().trim().max(500, '备注不超过 500 字').optional(),
    /** 定向预约：指定化妆师，走同一张需求表 */
    targetArtistId: z.coerce.number().int().positive().optional(),
  })
  .refine((value) => value.budgetMin <= value.budgetMax, {
    message: '预算下限不得高于上限',
    path: ['budgetMin'],
  })

const listQuery = paginationSchema.extend({
  scope: z.enum(['mine', 'hall']).default('mine'),
  status: z.enum(['pending', 'responded', 'selected', 'closed']).optional(),
  city: z.string().trim().max(32).optional(),
  serviceType: z.enum(DEMAND_TYPES).optional(),
})

const respondBody = z.object({
  note: z.string().trim().max(255, '一句说明不超过 255 字').optional(),
})

const selectBody = z.object({
  responseId: z.coerce.number().int().positive('请选择要确认的响应'),
})

const declineBody = z.object({
  reason: z
    .string()
    .trim()
    .min(1, '请填写婉拒原因')
    .max(255, '婉拒原因不超过 255 字'),
})

type DemandWithCount = Demand & { _count: { responses: number } }

function statusLabel(demand: Demand, responseCount: number): string {
  if (demand.status === 'closed') return demand.declineReason ? '已被婉拒' : '已关闭'
  if (demand.status === 'selected') return '已选定'
  return responseCount > 0 ? '已响应' : '待响应'
}

function toDto(demand: DemandWithCount) {
  const responseCount = demand._count.responses
  return {
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
    statusLabel: statusLabel(demand, responseCount),
    source: demand.source,
    targetArtistId: demand.targetArtistId,
    responseCount,
    expireAt: demand.expireAt ? demand.expireAt.toISOString() : null,
    closedAt: demand.closedAt ? demand.closedAt.toISOString() : null,
    declineReason: demand.declineReason,
    declinedAt: demand.declinedAt ? demand.declinedAt.toISOString() : null,
    createdAt: demand.createdAt.toISOString(),
  }
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

/** 未绑定手机号不可发布需求（E7-01） */
async function assertPhoneBound(userId: number): Promise<void> {
  const user = await getPrisma().userAuth.findUnique({
    where: { id: userId },
    select: { phoneCipher: true, status: true },
  })
  if (!user || user.status !== 'active') throw AppError.unauthorized('账号不存在或已禁用')
  if (!user.phoneCipher) throw AppError.forbidden('请先绑定手机号后再发布需求')
}

/** 定向预约：目标化妆师必须存在且已通过审核（档期冲突预校验在 E9-03） */
async function assertTargetArtist(artistId: number): Promise<void> {
  const artist = await getPrisma().artist.findUnique({ where: { id: artistId } })
  if (!artist || artist.status !== 'approved') throw AppError.badRequest('该化妆师暂不可预约')
}

/** 服务日次日零点已过即视为不可响应 */
function isExpired(demand: Pick<Demand, 'expireAt'>): boolean {
  return Boolean(demand.expireAt && demand.expireAt.getTime() <= Date.now())
}

/** 可选登录态：公开详情接口按游客处理 */
function optionalClaims(req: Request): { uid: number; role: TokenRole } | null {
  try {
    return verifyToken(extractBearerToken(req.header('authorization')), 'access')
  } catch {
    return null
  }
}

/** 响应 / 接单前必须是已通过审核的化妆师 */
async function currentApprovedArtist(userId: number): Promise<Artist> {
  const artist = await getPrisma().artist.findUnique({ where: { userId } })
  if (!artist) throw AppError.forbidden('请先完成化妆师入驻')
  if (artist.status === 'disabled') throw AppError.forbidden('账号已停用，请联系平台')
  if (artist.status !== 'approved') throw AppError.forbidden('入驻审核通过后才能响应需求')
  return artist
}

interface ArtistCard {
  id: number
  name: string
  city: string
  district: string | null
  years: number
  styles: string[]
  intro: string | null
  avatarUrl: string | null
  coverPath: string | null
  worksTotal: number
  nextAvailableDate: string | null
}

/** 批量装配响应者卡片：头像、首图、作品数、最近可约日 */
async function loadArtistCards(artistIds: number[]): Promise<Map<number, ArtistCard>> {
  if (!artistIds.length) return new Map()
  const prisma = getPrisma()
  const today = dayOnly()
  const [artists, covers, counts, schedules] = await Promise.all([
    prisma.artist.findMany({
      where: { id: { in: artistIds } },
      include: { user: { select: { avatarUrl: true } } },
    }),
    prisma.artistPortfolio.findMany({
      where: { artistId: { in: artistIds } },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { artistId: true, url: true },
    }),
    prisma.artistPortfolio.groupBy({
      by: ['artistId'],
      where: { artistId: { in: artistIds } },
      _count: { _all: true },
    }),
    prisma.artistSchedule.findMany({
      where: {
        artistId: { in: artistIds },
        state: 'available',
        date: { gte: today, lte: addDays(today, 180) },
      },
      orderBy: { date: 'asc' },
      select: { artistId: true, date: true },
    }),
  ])

  const coverByArtist = new Map<number, string>()
  covers.forEach((item) => {
    if (!coverByArtist.has(item.artistId)) coverByArtist.set(item.artistId, item.url)
  })
  const countByArtist = new Map(counts.map((item) => [item.artistId, item._count._all]))
  const nextDayByArtist = new Map<number, string>()
  schedules.forEach((item) => {
    if (!nextDayByArtist.has(item.artistId)) nextDayByArtist.set(item.artistId, formatDay(item.date))
  })

  return new Map(
    artists.map((artist) => [
      artist.id,
      {
        id: artist.id,
        name: artist.name,
        city: artist.city,
        district: artist.district,
        years: artist.years,
        styles: (artist.styles as string[] | null) ?? [],
        intro: artist.intro,
        avatarUrl: artist.user?.avatarUrl || null,
        coverPath: coverByArtist.has(artist.id)
          ? buildSignedPath('/api/files/raw', coverByArtist.get(artist.id)!)
          : null,
        worksTotal: countByArtist.get(artist.id) || 0,
        nextAvailableDate: nextDayByArtist.get(artist.id) || null,
      },
    ]),
  )
}

/** 发布需求（E7-03）：5 分钟内同内容幂等，超过每日上限返回 42900 */
demandRouter.post(
  '/demands',
  requireAuth('customer'),
  asyncHandler(async (req, res) => {
    const input = demandBody.parse(req.body)
    const customer = await currentCustomer(req.auth!.uid)
    await assertPhoneBound(req.auth!.uid)
    if (input.targetArtistId) await assertTargetArtist(input.targetArtistId)

    const serviceDate = resolveServiceDate(input.serviceDate)
    const prisma = getPrisma()

    if (input.targetArtistId) {
      // 定向预约：同客户 + 同化妆师 + 同服务日只保留 1 条待响应需求（E9-03）
      const targeted = await prisma.demand.findFirst({
        where: {
          customerId: customer.id,
          targetArtistId: input.targetArtistId,
          serviceDate,
          status: 'pending',
        },
        include: { _count: { select: { responses: true } } },
        orderBy: { id: 'desc' },
      })
      if (targeted) {
        res.ok({ ...toDto(targeted), duplicated: true })
        return
      }

      // 档期预校验：仅化妆师标记为可接的日期可预约，接受时还会再事务内校验一次
      const slot = await prisma.artistSchedule.findUnique({
        where: { artistId_date: { artistId: input.targetArtistId, date: serviceDate } },
      })
      if (!slot || slot.state !== 'available') {
        throw AppError.conflict('该化妆师当日不可接，请换个日期')
      }
    }

    const existing = await prisma.demand.findFirst({
      where: {
        customerId: customer.id,
        status: 'pending',
        city: input.city,
        district: input.district,
        serviceDate,
        serviceType: input.serviceType,
        headcount: input.headcount,
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        targetArtistId: input.targetArtistId ?? null,
        createdAt: { gte: new Date(Date.now() - DEDUPE_MS) },
      },
      include: { _count: { select: { responses: true } } },
      orderBy: { id: 'desc' },
    })
    if (existing) {
      res.ok({ ...toDto(existing), duplicated: true })
      return
    }

    const todayCount = await prisma.demand.count({
      where: { customerId: customer.id, createdAt: { gte: dayOnly() } },
    })
    if (todayCount >= DAILY_LIMIT) {
      throw new AppError(ErrorCode.TOO_MANY_REQUESTS, `今日最多发布 ${DAILY_LIMIT} 条需求，请明天再试`)
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
        expireAt: addDays(serviceDate, 1),
      },
      include: { _count: { select: { responses: true } } },
    })
    res.ok(toDto(created))
  }),
)

/**
 * 需求列表（E7-04 / E8-01）：
 * - scope=mine：我的需求，支持 pending / responded / selected / closed 四态筛选；
 * - scope=hall：需求大厅，仅待响应且未过期，可按城市过滤。
 */
demandRouter.get(
  '/demands',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()

    if (query.scope === 'mine') {
      if (req.auth!.role !== 'customer') throw AppError.forbidden('仅客户可查看我的需求')
      const customer = await currentCustomer(req.auth!.uid)
      const where: Prisma.DemandWhereInput = { customerId: customer.id }
      if (query.status === 'pending') {
        where.status = 'pending'
        where.responses = { none: {} }
      } else if (query.status === 'responded') {
        where.status = 'pending'
        where.responses = { some: {} }
      } else if (query.status) {
        where.status = query.status
      }

      const [list, total] = await Promise.all([
        prisma.demand.findMany({
          where,
          include: { _count: { select: { responses: true } } },
          orderBy: { createdAt: 'desc' },
          ...toPageArgs(query),
        }),
        prisma.demand.count({ where }),
      ])
      res.ok(pageResult(list.map(toDto), total, query))
      return
    }

    if (req.auth!.role !== 'artist') throw AppError.forbidden('仅化妆师可浏览需求大厅')
    const now = new Date()
    const where: Prisma.DemandWhereInput = {
      status: 'pending',
      ...(query.city ? { city: query.city } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      OR: [{ expireAt: null }, { expireAt: { gt: now } }],
    }
    const [list, total] = await Promise.all([
      prisma.demand.findMany({
        where,
        include: { _count: { select: { responses: true } } },
        orderBy: [{ serviceDate: 'asc' }, { createdAt: 'desc' }],
        ...toPageArgs(query),
      }),
      prisma.demand.count({ where }),
    ])

    // 标记本人是否已响应，前端据此把按钮置为「已响应」
    const artist = await prisma.artist.findUnique({
      where: { userId: req.auth!.uid },
      select: { id: true },
    })
    const responseByDemand = new Map<number, { id: number; status: string }>()
    if (artist && list.length) {
      const responses = await prisma.demandResponse.findMany({
        where: { artistId: artist.id, demandId: { in: list.map((item) => item.id) } },
        select: { id: true, demandId: true, status: true },
      })
      responses.forEach((item) => {
        responseByDemand.set(item.demandId, { id: item.id, status: item.status })
      })
    }

    res.ok(
      pageResult(
        list.map((item) => {
          const mine = responseByDemand.get(item.id)
          return {
            ...toDto(item),
            isTargeted: Boolean(item.targetArtistId),
            myResponseId: mine?.id ?? null,
            myResponseStatus: mine?.status ?? null,
          }
        }),
        total,
        query,
      ),
    )
  }),
)

/** 编辑需求（E7-03）：仅待响应且未过期可改 */
demandRouter.put(
  '/demands/:id',
  requireAuth('customer'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const input = demandBody.parse(req.body)
    const customer = await currentCustomer(req.auth!.uid)
    const prisma = getPrisma()

    const demand = await prisma.demand.findFirst({ where: { id, customerId: customer.id } })
    if (!demand) throw AppError.notFound('需求不存在')
    if (demand.status !== 'pending') throw AppError.conflict('需求已选定或已关闭，不可编辑')

    const serviceDate = resolveServiceDate(input.serviceDate)
    if (input.targetArtistId) await assertTargetArtist(input.targetArtistId)

    const updated = await prisma.demand.update({
      where: { id },
      data: {
        city: input.city,
        district: input.district,
        serviceDate,
        serviceType: input.serviceType,
        headcount: input.headcount,
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        stylePrefs: input.stylePrefs?.length ? input.stylePrefs : undefined,
        remark: input.remark,
        expireAt: addDays(serviceDate, 1),
      },
      include: { _count: { select: { responses: true } } },
    })
    res.ok(toDto(updated))
  }),
)

/** 关闭需求（E7-04）：关闭后不可再被响应 */
demandRouter.put(
  '/demands/:id/close',
  requireAuth('customer'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const customer = await currentCustomer(req.auth!.uid)
    const prisma = getPrisma()

    const demand = await prisma.demand.findFirst({ where: { id, customerId: customer.id } })
    if (!demand) throw AppError.notFound('需求不存在')
    if (demand.status !== 'pending') throw AppError.conflict('需求已选定或已关闭，无需重复关闭')

    const updated = await prisma.demand.update({
      where: { id },
      data: { status: 'closed', closedAt: new Date() },
      include: { _count: { select: { responses: true } } },
    })
    res.ok(toDto(updated))
  }),
)

/* ------------------------------------------------------------------ */
/* 需求详情与响应（E8-02 / E8-03 / E8-04）                              */
/* ------------------------------------------------------------------ */

/**
 * 需求详情：客户看自己的需求；化妆师只能看待响应/未过期/非定向他人的需求。
 * 附「我是否已响应」与不可响应原因，前端据此直接渲染按钮态。
 */
demandRouter.get(
  '/demands/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('需求不存在')
    const prisma = getPrisma()

    const demand = await prisma.demand.findUnique({
      where: { id },
      include: {
        _count: { select: { responses: true } },
        customer: { select: { nickname: true, city: true, district: true } },
      },
    })
    if (!demand) throw AppError.notFound('需求不存在')

    const claims = optionalClaims(req)
    const customer =
      claims?.role === 'customer'
        ? await prisma.customer.findUnique({
            where: { userId: claims.uid },
            select: { id: true },
          })
        : null
    const artist =
      claims?.role === 'artist'
        ? await prisma.artist.findUnique({
            where: { userId: claims.uid },
            select: { id: true, status: true },
          })
        : null

    const isOwner = Boolean(customer && customer.id === demand.customerId)
    const expired = isExpired(demand)

    // 定向预约：客户侧展示被预约的化妆师（婉拒后可据此提示并推荐备选，E9-06）
    const targetArtist = demand.targetArtistId
      ? await prisma.artist.findUnique({
          where: { id: demand.targetArtistId },
          select: { id: true, name: true },
        })
      : null

    if (!isOwner && claims?.role !== 'admin') {
      const artistVisible = Boolean(
        artist &&
          artist.status === 'approved' &&
          demand.status === 'pending' &&
          !expired &&
          (!demand.targetArtistId || demand.targetArtistId === artist.id),
      )
      if (!artistVisible) throw AppError.notFound('需求不存在或已不可见')
    }

    let myResponse: { id: number; status: string; note: string | null; createdAt: string } | null =
      null
    if (artist) {
      const response = await prisma.demandResponse.findUnique({
        where: { demandId_artistId: { demandId: id, artistId: artist.id } },
      })
      if (response) {
        myResponse = {
          id: response.id,
          status: response.status,
          note: response.note,
          createdAt: response.createdAt.toISOString(),
        }
      }
    }

    let respondBlockedReason: string | null = null
    if (isOwner) respondBlockedReason = '这是你发布的需求'
    else if (!claims) respondBlockedReason = '登录后可响应需求'
    else if (claims.role !== 'artist') respondBlockedReason = '仅化妆师可响应需求'
    else if (!artist || artist.status !== 'approved') respondBlockedReason = '入驻审核通过后才能响应需求'
    else if (demand.status === 'closed') respondBlockedReason = '需求已关闭'
    else if (demand.status === 'selected') respondBlockedReason = '需求已选定化妆师'
    else if (expired) respondBlockedReason = '需求已过期'
    else if (demand.targetArtistId && demand.targetArtistId !== artist.id) {
      respondBlockedReason = '该需求为定向预约，仅指定化妆师可响应'
    } else if (myResponse) respondBlockedReason = '你已响应过该需求'

    const responseCount = demand._count.responses
    res.ok({
      ...toDto(demand),
      customer: {
        nickname: demand.customer.nickname || '客户',
        city: demand.customer.city,
        district: demand.customer.district,
      },
      expired,
      isOwner,
      isTargeted: Boolean(demand.targetArtistId),
      targetArtist,
      canRespond: !respondBlockedReason,
      respondBlockedReason,
      canSelect: isOwner && demand.status === 'pending' && !expired && responseCount > 0,
      myResponse,
    })
  }),
)

/**
 * 响应需求（E8-03）：同一化妆师对同一需求只允许 1 条，初始状态 pending。
 * 已选定 / 已关闭 / 已过期 / 定向他人一律拒绝。
 */
demandRouter.post(
  '/demands/:id/respond',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('需求不存在')
    const input = respondBody.parse(req.body)
    const artist = await currentApprovedArtist(req.auth!.uid)
    const prisma = getPrisma()

    const demand = await prisma.demand.findUnique({ where: { id } })
    if (!demand) throw AppError.notFound('需求不存在')
    if (demand.status === 'closed') throw AppError.conflict('需求已关闭，无法响应')
    if (demand.status === 'selected') throw AppError.conflict('需求已选定化妆师，无法响应')
    if (isExpired(demand)) throw AppError.conflict('需求已过期，无法响应')
    if (demand.targetArtistId && demand.targetArtistId !== artist.id) {
      throw AppError.forbidden('该需求为定向预约，仅指定化妆师可响应')
    }

    try {
      const created = await prisma.demandResponse.create({
        data: { demandId: id, artistId: artist.id, note: input.note || null },
      })
      const responseCount = await prisma.demandResponse.count({ where: { demandId: id } })
      res.ok({
        id: created.id,
        demandId: created.demandId,
        status: created.status,
        note: created.note,
        createdAt: created.createdAt.toISOString(),
        responseCount,
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw AppError.conflict('你已响应过该需求')
      }
      throw error
    }
  }),
)

/** 响应者列表（E8-04）：仅需求所属客户可见，按响应时间升序 */
demandRouter.get(
  '/demands/:id/responses',
  requireAuth('customer'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('需求不存在')
    const customer = await currentCustomer(req.auth!.uid)
    const prisma = getPrisma()

    const demand = await prisma.demand.findFirst({ where: { id, customerId: customer.id } })
    if (!demand) throw AppError.notFound('需求不存在')

    const responses = await prisma.demandResponse.findMany({
      where: { demandId: id },
      orderBy: { createdAt: 'asc' },
    })
    const cards = await loadArtistCards(responses.map((item) => item.artistId))

    res.ok({
      total: responses.length,
      selectedResponseId: responses.find((item) => item.status === 'selected')?.id ?? null,
      list: responses.map((item) => ({
        id: item.id,
        status: item.status,
        note: item.note,
        createdAt: item.createdAt.toISOString(),
        artist: cards.get(item.artistId) ?? null,
      })),
    })
  }),
)

/**
 * 择一确认（E8-04）：需求置 selected、选中响应置 selected、其余置 rejected，
 * 同一事务内生成待确认服务记录。档期占用在化妆师接受时完成（E9-05）。
 */
demandRouter.post(
  '/demands/:id/select',
  requireAuth('customer'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('需求不存在')
    const input = selectBody.parse(req.body)
    const customer = await currentCustomer(req.auth!.uid)
    const prisma = getPrisma()

    const demand = await prisma.demand.findFirst({ where: { id, customerId: customer.id } })
    if (!demand) throw AppError.notFound('需求不存在')
    if (demand.status !== 'pending') throw AppError.conflict('需求已选定或已关闭，无法重复确认')
    if (isExpired(demand)) throw AppError.conflict('需求已过期，无法确认')

    const response = await prisma.demandResponse.findUnique({ where: { id: input.responseId } })
    if (!response || response.demandId !== id) throw AppError.notFound('响应不存在')
    if (response.status !== 'pending') throw AppError.conflict('该响应已处理，请刷新后重试')

    const serviceOrder = await prisma.$transaction(async (tx) => {
      const claimed = await tx.demand.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'selected' },
      })
      if (claimed.count === 0) throw AppError.conflict('需求已被处理，请刷新后重试')

      const selected = await tx.demandResponse.updateMany({
        where: { id: response.id, status: 'pending' },
        data: { status: 'selected' },
      })
      if (selected.count === 0) throw AppError.conflict('该响应已处理，请刷新后重试')

      await tx.demandResponse.updateMany({
        where: { demandId: id, id: { not: response.id }, status: 'pending' },
        data: { status: 'rejected' },
      })

      return tx.serviceOrder.create({
        data: {
          demandId: id,
          customerId: customer.id,
          artistId: response.artistId,
          serviceDate: demand.serviceDate,
          serviceType: demand.serviceType,
          headcount: demand.headcount,
          city: demand.city,
          district: demand.district,
          remark: demand.remark,
          status: 'pending',
          // 客户择一确认发起，待化妆师确认接单（E10-01）
          initiatorRole: 'customer',
        },
      })
    })

    const latest = await prisma.demand.findUnique({
      where: { id },
      include: { _count: { select: { responses: true } } },
    })
    res.ok({
      demand: toDto(latest!),
      responseId: response.id,
      serviceOrder: { id: serviceOrder.id, status: serviceOrder.status },
    })
  }),
)

/* ------------------------------------------------------------------ */
/* 接单中心与定向预约处理（E9-04 / E9-05 / E9-06）                     */
/* ------------------------------------------------------------------ */

/** 当前登录化妆师（接单中心仅对已通过审核者开放） */
async function currentInboxArtist(userId: number): Promise<Artist> {
  const artist = await getPrisma().artist.findUnique({ where: { userId } })
  if (!artist) throw AppError.forbidden('请先完成化妆师入驻')
  if (artist.status === 'disabled') throw AppError.forbidden('账号已停用，请联系平台')
  if (artist.status !== 'approved') throw AppError.forbidden('入驻审核通过后才能接单')
  return artist
}

/**
 * 化妆师接单中心（E9-04）：
 * - pending 待处理：发给我的定向预约（待响应且未过期，按时间倒序）；
 * - handled 已处理：已接受 / 已婉拒的定向预约；
 * - responses 我的响应：对需求大厅需求的报名状态；
 * - orders 服务记录：待确认 / 已确认，按服务日期升序。
 * unread 作为接单中心角标数。
 */
demandRouter.get(
  '/inbox',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const artist = await currentInboxArtist(req.auth!.uid)
    const prisma = getPrisma()
    const now = new Date()

    const [pending, handled, responses, orders] = await Promise.all([
      prisma.demand.findMany({
        where: {
          targetArtistId: artist.id,
          status: 'pending',
          OR: [{ expireAt: null }, { expireAt: { gt: now } }],
        },
        include: {
          _count: { select: { responses: true } },
          customer: { select: { nickname: true, city: true, district: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.demand.findMany({
        where: {
          targetArtistId: artist.id,
          OR: [{ status: 'selected' }, { declineReason: { not: null } }],
        },
        include: {
          _count: { select: { responses: true } },
          customer: { select: { nickname: true, city: true, district: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      prisma.demandResponse.findMany({
        where: { artistId: artist.id, status: { in: ['selected', 'rejected', 'withdrawn'] } },
        include: {
          demand: { include: { _count: { select: { responses: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      prisma.serviceOrder.findMany({
        where: { artistId: artist.id, status: { in: ['pending', 'confirmed'] } },
        orderBy: [{ serviceDate: 'asc' }, { id: 'asc' }],
        take: 20,
      }),
    ])

    res.ok({
      unread: pending.length,
      pending: pending.map((item) => ({
        ...toDto(item),
        customer: {
          nickname: item.customer.nickname || '客户',
          city: item.customer.city,
          district: item.customer.district,
        },
      })),
      handled: handled.map((item) => ({
        ...toDto(item),
        handledStatus: item.status === 'selected' ? 'accepted' : 'declined',
        customer: {
          nickname: item.customer.nickname || '客户',
          city: item.customer.city,
          district: item.customer.district,
        },
      })),
      responses: responses.map((item) => ({
        id: item.id,
        status: item.status,
        note: item.note,
        createdAt: item.createdAt.toISOString(),
        demand: toDto(item.demand),
      })),
      orders: orders.map((order) => toOrderDto(order, 'artist')),
    })
  }),
)

/**
 * 接受定向预约（E9-05）：需求置已选定、生成待确认服务记录，并在同一事务占用档期。
 * 并发两次接受只有一次成功，另一次因状态已变更返回 409。
 */
demandRouter.post(
  '/demands/:id/accept',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('需求不存在')
    const artist = await currentApprovedArtist(req.auth!.uid)
    const prisma = getPrisma()

    const demand = await prisma.demand.findUnique({ where: { id } })
    if (!demand) throw AppError.notFound('需求不存在')
    if (demand.targetArtistId !== artist.id) {
      throw AppError.forbidden('该需求不是发给你的定向预约')
    }
    if (demand.status !== 'pending') throw AppError.conflict('该需求已被处理，请刷新后重试')
    if (isExpired(demand)) throw AppError.conflict('该需求已过期，无法接受')

    const order = await prisma.$transaction(async (tx) => {
      const claimed = await tx.demand.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'selected' },
      })
      if (claimed.count === 0) throw AppError.conflict('该需求已被处理，请刷新后重试')

      const created = await tx.serviceOrder.create({
        data: {
          demandId: id,
          customerId: demand.customerId,
          artistId: artist.id,
          serviceDate: demand.serviceDate,
          serviceType: demand.serviceType,
          headcount: demand.headcount,
          city: demand.city,
          district: demand.district,
          remark: demand.remark,
          status: 'pending',
          // 化妆师接受定向预约发起，待客户确认接单（E10-01）
          initiatorRole: 'artist',
        },
      })
      // 档期被占用 / 休息时抛 409，事务整体回滚
      await claimDay(artist.id, demand.serviceDate, created.id, tx)

      await tx.demandResponse.upsert({
        where: { demandId_artistId: { demandId: id, artistId: artist.id } },
        create: { demandId: id, artistId: artist.id, status: 'selected', note: '定向预约已接受' },
        update: { status: 'selected' },
      })
      return created
    })

    const latest = await prisma.demand.findUnique({
      where: { id },
      include: { _count: { select: { responses: true } } },
    })
    res.ok({
      demand: toDto(latest!),
      serviceOrder: toOrderDto(order),
    })
  }),
)

/** 婉拒定向预约（E9-05）：原因必填，需求置已关闭并记录原因，客户侧可看备选（E9-06） */
demandRouter.post(
  '/demands/:id/decline',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('需求不存在')
    const input = declineBody.parse(req.body)
    const artist = await currentApprovedArtist(req.auth!.uid)
    const prisma = getPrisma()

    const demand = await prisma.demand.findUnique({ where: { id } })
    if (!demand) throw AppError.notFound('需求不存在')
    if (demand.targetArtistId !== artist.id) {
      throw AppError.forbidden('该需求不是发给你的定向预约')
    }
    if (demand.status !== 'pending') throw AppError.conflict('该需求已被处理，请刷新后重试')

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const updated = await tx.demand.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'closed',
          closedAt: now,
          declineReason: input.reason,
          declinedAt: now,
        },
      })
      if (updated.count === 0) throw AppError.conflict('该需求已被处理，请刷新后重试')
      await tx.demandResponse.updateMany({
        where: { demandId: id, artistId: artist.id, status: 'pending' },
        data: { status: 'rejected' },
      })
    })

    const latest = await prisma.demand.findUnique({
      where: { id },
      include: { _count: { select: { responses: true } } },
    })
    res.ok(toDto(latest!))
  }),
)

/**
 * 婉拒后备选推荐（E9-06）：同城、风格有交集、服务日可接的 3 位化妆师，
 * 排除被婉拒的那位；客户可直接进入其主页发起新的定向预约。
 */
demandRouter.get(
  '/demands/:id/alternatives',
  requireAuth('customer'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('需求不存在')
    const customer = await currentCustomer(req.auth!.uid)
    const prisma = getPrisma()

    const demand = await prisma.demand.findFirst({ where: { id, customerId: customer.id } })
    if (!demand) throw AppError.notFound('需求不存在')
    if (!demand.targetArtistId || !demand.declineReason) {
      throw AppError.conflict('该需求未被婉拒，暂无备选推荐')
    }

    const stylePrefs = (demand.stylePrefs as string[] | null) ?? []
    const artists = await prisma.artist.findMany({
      where: {
        status: 'approved',
        city: demand.city,
        id: { not: demand.targetArtistId },
        ...(stylePrefs.length
          ? { OR: stylePrefs.map((style) => ({ styles: { array_contains: style } })) }
          : {}),
        schedules: { some: { date: demand.serviceDate, state: 'available' } },
      },
      select: { id: true },
      orderBy: [{ years: 'desc' }, { id: 'asc' }],
      take: 3,
    })

    const cards = await loadArtistCards(artists.map((item) => item.id))
    res.ok({
      total: artists.length,
      list: artists.map((item) => cards.get(item.id)).filter(Boolean),
    })
  }),
)
