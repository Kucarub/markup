import { Router } from 'express'
import { z } from 'zod'
import type { Prisma, StatsDaily } from '@prisma/client'
import { getPrisma } from '../../lib/prisma'
import { ADMIN_ALL, ADMIN_MANAGE, requireAdminRole } from '../../middlewares/adminRole'
import { requireAuth } from '../../middlewares/auth'
import { aggregateDay, aggregateRange, STATS_MAX_RANGE_DAYS, toDailyDto } from '../../services/stats'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/errors'

/**
 * 运营看板基础统计（E5-06）。
 * 主页 UV 按「设备 + 自然日」去重后落 artist_visit，同时累加 stats_daily。
 */
export const adminStatsRouter = Router()

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式需为 YYYY-MM-DD')
    .optional(),
})

/** 以 UTC 零点表示自然日，与 MySQL DATE 对齐 */
function resolveDay(value?: string): Date {
  if (!value) {
    const now = new Date()
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(date.getTime())) throw AppError.badRequest('日期不合法')
  return date
}

/** 日期偏移（天），用于把「结束日」转成开区间上界 */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

const eventsQuery = z.object({
  /** 指定事件名时额外输出 props 维度统计 */
  event: z.string().trim().max(64).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式需为 YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式需为 YYYY-MM-DD').optional(),
  /** props 里的统计维度，如 city / styles / radiusKm */
  key: z.string().trim().max(32).optional(),
})

/**
 * 埋点统计（E8-08）：按事件汇总条数；指定 event + key 时按该属性值分组，
 * 例如 event=search_artists&key=city 可看各城市搜索量。
 */
adminStatsRouter.get(
  '/admin/stats/events',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const query = eventsQuery.parse(req.query)
    const from = query.from ? resolveDay(query.from) : resolveDay()
    const to = query.to ? addDays(resolveDay(query.to), 1) : addDays(from, 7)
    if (from.getTime() >= to.getTime()) throw AppError.badRequest('结束日期需晚于开始日期')

    const prisma = getPrisma()
    const where: Prisma.EventLogWhereInput = {
      createdAt: { gte: from, lt: to },
      ...(query.event ? { event: query.event } : {}),
    }

    const [total, grouped] = await Promise.all([
      prisma.eventLog.count({ where }),
      prisma.eventLog.groupBy({
        by: ['event'],
        where,
        _count: { _all: true },
        orderBy: { _count: { event: 'desc' } },
      }),
    ])

    let dimension: { key: string; values: { value: string; count: number }[] } | null = null
    if (query.event && query.key) {
      const rows = await prisma.eventLog.findMany({
        where,
        orderBy: { id: 'desc' },
        take: 5000,
        select: { props: true },
      })
      const counter = new Map<string, number>()
      rows.forEach((row) => {
        const props = (row.props ?? {}) as Record<string, unknown>
        const raw = props[query.key!]
        const values = Array.isArray(raw) ? raw.map(String) : [String(raw ?? '')]
        values
          .filter((value) => value !== '' && value !== 'null' && value !== 'undefined')
          .forEach((value) => counter.set(value, (counter.get(value) || 0) + 1))
      })
      dimension = {
        key: query.key,
        values: Array.from(counter.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 20),
      }
    }

    res.ok({
      from: from.toISOString().slice(0, 10),
      to: new Date(to.getTime() - 86400000).toISOString().slice(0, 10),
      total,
      byEvent: grouped.map((item) => ({ event: item.event, count: item._count._all })),
      dimension,
    })
  }),
)

/** 按日期查询主页 UV（默认今天）：总 UV + 累计指标 + TOP 化妆师 */
adminStatsRouter.get(
  '/admin/stats/artist-uv',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const { date } = querySchema.parse(req.query)
    const visitDate = resolveDay(date)
    const prisma = getPrisma()

    const [totalUv, daily, grouped] = await Promise.all([
      prisma.artistVisit.count({ where: { visitDate } }),
      prisma.statsDaily.findUnique({ where: { date: visitDate } }),
      prisma.artistVisit.groupBy({
        by: ['artistId'],
        where: { visitDate },
        _count: { _all: true },
        orderBy: { _count: { artistId: 'desc' } },
        take: 20,
      }),
    ])

    const artistIds = grouped.map((item) => item.artistId)
    const artists = artistIds.length
      ? await prisma.artist.findMany({
          where: { id: { in: artistIds } },
          select: { id: true, name: true, city: true },
        })
      : []
    const artistById = new Map(artists.map((artist) => [artist.id, artist]))

    res.ok({
      date: visitDate.toISOString().slice(0, 10),
      totalUv,
      statsUv: daily?.artistPageUv ?? 0,
      topArtists: grouped.map((item) => ({
        artistId: item.artistId,
        name: artistById.get(item.artistId)?.name || '已删除',
        city: artistById.get(item.artistId)?.city || '',
        uv: item._count._all,
      })),
    })
  }),
)

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式需为 YYYY-MM-DD')

const rangeQuery = z.object({
  from: daySchema.optional(),
  to: daySchema.optional(),
})

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

function rangeDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1
}

/**
 * 看板数据（E13-03）：6 个核心指标 + 按日趋势 + 运营待办计数。
 * 查询区间含当天时先实时聚合今天，避免 01:00 前看板全为 0。
 */
adminStatsRouter.get(
  '/admin/stats/dashboard',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const query = rangeQuery.parse(req.query)
    const today = resolveDay()
    const to = query.to ? resolveDay(query.to) : today
    const from = query.from ? resolveDay(query.from) : addDays(to, -13)
    if (from.getTime() > to.getTime()) throw AppError.badRequest('结束日期需晚于开始日期')
    const days = rangeDays(from, to)
    if (days > STATS_MAX_RANGE_DAYS) {
      throw AppError.badRequest(`时间范围最多 ${STATS_MAX_RANGE_DAYS} 天`)
    }

    const prisma = getPrisma()
    if (to.getTime() >= today.getTime()) await aggregateDay(today)

    const rows = await prisma.statsDaily.findMany({ where: { date: { gte: from, lte: to } } })
    const byDate = new Map(rows.map((row) => [row.date.toISOString().slice(0, 10), row]))

    // 补齐区间内缺失日期，前端无需处理空数据
    const series: ReturnType<typeof toDailyDto>[] = []
    for (let cursor = from; cursor.getTime() <= to.getTime(); cursor = addDays(cursor, 1)) {
      const key = cursor.toISOString().slice(0, 10)
      const row = byDate.get(key)
      series.push(
        row
          ? toDailyDto(row)
          : {
              date: key,
              registrations: 0,
              artistPageUv: 0,
              demands: 0,
              responses: 0,
              responseRate: 0,
              serviceOrders: 0,
              completionRate: 0,
              retentionD7: 0,
            },
      )
    }

    const totalOf = (key: 'registrations' | 'artistPageUv' | 'demands' | 'responses' | 'serviceOrders') =>
      series.reduce((acc, item) => acc + item[key], 0)
    const demands = totalOf('demands')
    const serviceOrders = totalOf('serviceOrders')
    // 比率按分母加权，避免直接平均导致口径失真
    const responded = series.reduce((acc, item) => acc + item.responseRate * item.demands, 0)
    const finished = series.reduce((acc, item) => acc + item.completionRate * item.serviceOrders, 0)
    const retentionDays = series.filter((item) => item.retentionD7 > 0)

    const [pendingArtists, disabledUsers, pendingOrders, finishedOrders] = await Promise.all([
      prisma.artist.count({ where: { status: 'pending' } }),
      prisma.userAuth.count({ where: { status: 'disabled' } }),
      prisma.serviceOrder.count({ where: { status: 'pending' } }),
      prisma.serviceOrder.count({ where: { status: 'finished' } }),
    ])

    res.ok({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      days: series.length,
      totals: {
        registrations: totalOf('registrations'),
        artistPageUv: totalOf('artistPageUv'),
        demands,
        responses: totalOf('responses'),
        responseRate: demands > 0 ? round4(responded / demands) : 0,
        serviceOrders,
        completionRate: serviceOrders > 0 ? round4(finished / serviceOrders) : 0,
        retentionD7:
          retentionDays.length > 0
            ? round4(
                retentionDays.reduce((acc, item) => acc + item.retentionD7, 0) / retentionDays.length,
              )
            : 0,
      },
      series,
      counts: { pendingArtists, disabledUsers, pendingOrders, finishedOrders },
    })
  }),
)

const aggregateBody = z.object({
  date: daySchema.optional(),
  from: daySchema.optional(),
  to: daySchema.optional(),
})

/** 手动重跑聚合（E13-02）：支持单日或区间，幂等；供运维补数与冒烟验证 */
adminStatsRouter.post(
  '/admin/stats/aggregate',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_MANAGE),
  asyncHandler(async (req, res) => {
    const input = aggregateBody.parse(req.body ?? {})
    if (input.date && (input.from || input.to)) {
      throw AppError.badRequest('date 与 from/to 不能同时传')
    }

    const today = resolveDay()
    let rows: StatsDaily[]
    if (input.from || input.to) {
      const from = input.from ? resolveDay(input.from) : today
      const to = input.to ? resolveDay(input.to) : from
      if (from.getTime() > to.getTime()) throw AppError.badRequest('结束日期需晚于开始日期')
      const days = rangeDays(from, to)
      if (days > STATS_MAX_RANGE_DAYS) {
        throw AppError.badRequest(`时间范围最多 ${STATS_MAX_RANGE_DAYS} 天`)
      }
      if (to.getTime() > today.getTime()) throw AppError.badRequest('不能聚合未来日期')
      rows = await aggregateRange(from, to)
    } else {
      const day = input.date ? resolveDay(input.date) : today
      if (day.getTime() > today.getTime()) throw AppError.badRequest('不能聚合未来日期')
      rows = [await aggregateDay(day)]
    }

    res.ok({ days: rows.length, rows: rows.map(toDailyDto) })
  }),
)
