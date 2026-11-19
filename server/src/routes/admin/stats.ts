import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../../lib/prisma'
import { requireAuth } from '../../middlewares/auth'
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
