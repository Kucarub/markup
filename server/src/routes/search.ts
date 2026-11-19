import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { addDays, dayOnly, formatDay, parseDay } from '../services/schedule'
import { buildSignedPath } from '../services/storage'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'
import { pageResult, paginationSchema } from '../utils/pagination'

/**
 * 找化妆师搜索（E8-05 / E8-06）。
 * - 仅返回 status=approved 的化妆师，待审核 / 驳回 / 封禁一律不出现；
 * - 距离按经纬度球面距离计算，未填写经纬度时不做半径过滤也不返回距离；
 * - 指定 date 时只返回该日 state=available 的化妆师。
 */
export const searchRouter = Router()

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const RADIUS_OPTIONS = [3, 5, 10]
const EARTH_RADIUS_KM = 6371

const searchQuery = paginationSchema.extend({
  city: z.string().trim().max(32).optional(),
  district: z.string().trim().max(32).optional(),
  /** 风格 code，逗号分隔，命中任一即算匹配 */
  styles: z.string().trim().max(200).optional(),
  date: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD').optional(),
  radiusKm: z.coerce.number().optional(),
  yearsMin: z.coerce.number().int('年限需为整数').min(0).max(60).optional(),
  lat: z.coerce.number().min(-90, '纬度不合法').max(90, '纬度不合法').optional(),
  lng: z.coerce.number().min(-180, '经度不合法').max(180, '经度不合法').optional(),
})

/** 球面距离（km），用于 3 / 5 / 10km 半径筛选 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value.filter((item) => typeof item === 'string') as string[]) : []
}

/** 搜索列表（E8-05/E8-06）：卡片含首图、风格、年限、距离、最早可接日 */
searchRouter.get(
  '/search/artists',
  asyncHandler(async (req, res) => {
    const query = searchQuery.parse(req.query)
    if (query.radiusKm !== undefined && !RADIUS_OPTIONS.includes(query.radiusKm)) {
      throw AppError.badRequest('距离筛选仅支持 3 / 5 / 10 公里')
    }

    const prisma = getPrisma()
    const styleList = (query.styles || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const where: Prisma.ArtistWhereInput = { status: 'approved' }
    if (query.city) where.city = query.city
    if (query.district) where.district = query.district
    if (query.yearsMin !== undefined) where.years = { gte: query.yearsMin }
    if (styleList.length) {
      where.OR = styleList.map((style) => ({ styles: { array_contains: style } }))
    }
    if (query.date) where.schedules = { some: { date: parseDay(query.date), state: 'available' } }

    // 距离需要按经纬度排序后再分页，故先取全量候选（同城已通过城市/区域收窄）
    const candidates = await prisma.artist.findMany({
      where,
      select: {
        id: true,
        name: true,
        city: true,
        district: true,
        years: true,
        styles: true,
        intro: true,
        lat: true,
        lng: true,
        user: { select: { avatarUrl: true } },
      },
    })

    const withLocation = query.lat !== undefined && query.lng !== undefined
    const scored = candidates
      .map((artist) => ({
        artist,
        distanceKm:
          withLocation && artist.lat !== null && artist.lng !== null
            ? Math.round(haversineKm(query.lat!, query.lng!, artist.lat, artist.lng) * 10) / 10
            : null,
      }))
      .filter((item) => {
        if (query.radiusKm === undefined || !withLocation) return true
        return item.distanceKm !== null && item.distanceKm <= query.radiusKm
      })
      .sort((left, right) => {
        if (left.distanceKm !== null && right.distanceKm !== null) {
          if (left.distanceKm !== right.distanceKm) return left.distanceKm - right.distanceKm
        } else if (left.distanceKm !== null) return -1
        else if (right.distanceKm !== null) return 1
        if (left.artist.years !== right.artist.years) return right.artist.years - left.artist.years
        return right.artist.id - left.artist.id
      })

    const total = scored.length
    const pageItems = scored.slice((query.page - 1) * query.size, query.page * query.size)
    const pageIds = pageItems.map((item) => item.artist.id)

    const today = dayOnly()
    const [covers, counts, schedules] = pageIds.length
      ? await Promise.all([
          prisma.artistPortfolio.findMany({
            where: { artistId: { in: pageIds } },
            orderBy: [{ sort: 'asc' }, { id: 'asc' }],
            select: { artistId: true, url: true },
          }),
          prisma.artistPortfolio.groupBy({
            by: ['artistId'],
            where: { artistId: { in: pageIds } },
            _count: { _all: true },
          }),
          prisma.artistSchedule.findMany({
            where: {
              artistId: { in: pageIds },
              state: 'available',
              date: { gte: today, lte: addDays(today, 180) },
            },
            orderBy: { date: 'asc' },
            select: { artistId: true, date: true },
          }),
        ])
      : [[], [], []]

    const coverByArtist = new Map<number, string>()
    covers.forEach((item) => {
      if (!coverByArtist.has(item.artistId)) coverByArtist.set(item.artistId, item.url)
    })
    const countByArtist = new Map(counts.map((item) => [item.artistId, item._count._all]))
    const nextDayByArtist = new Map<number, string>()
    schedules.forEach((item) => {
      if (!nextDayByArtist.has(item.artistId)) nextDayByArtist.set(item.artistId, formatDay(item.date))
    })

    res.ok(
      pageResult(
        pageItems.map(({ artist, distanceKm }) => {
          const cover = coverByArtist.get(artist.id)
          return {
            id: artist.id,
            name: artist.name,
            city: artist.city,
            district: artist.district,
            years: artist.years,
            styles: asStringArray(artist.styles),
            intro: artist.intro,
            avatarUrl: artist.user?.avatarUrl || null,
            coverPath: cover ? buildSignedPath('/api/files/raw', cover) : null,
            worksTotal: countByArtist.get(artist.id) || 0,
            distanceKm,
            nextAvailableDate: nextDayByArtist.get(artist.id) || null,
          }
        }),
        total,
        query,
      ),
    )
  }),
)
