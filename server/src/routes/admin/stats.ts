import { Router } from 'express'
import { z } from 'zod'
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
