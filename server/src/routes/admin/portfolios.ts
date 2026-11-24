import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../../lib/prisma'
import { ADMIN_ALL, requireAdminRole } from '../../middlewares/adminRole'
import { requireAuth } from '../../middlewares/auth'
import { buildSignedPath } from '../../services/storage'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/errors'
import { pageResult, paginationSchema, toPageArgs } from '../../utils/pagination'

/**
 * 后台作品管理（E12-08）。
 * 违规下架后小程序主页/作品列表不再展示，恢复后重新出现；
 * 每次下架 / 恢复都写 audit_log（含原因与操作人）。
 */
export const adminPortfolioRouter = Router()

const PORTFOLIO_STATUS = ['pending', 'online', 'offline', 'rejected'] as const

const listQuery = paginationSchema.extend({
  status: z.enum(PORTFOLIO_STATUS).optional(),
  artistId: z.coerce.number().int().positive().optional(),
  keyword: z.string().trim().max(32).optional(),
})

const statusBody = z
  .object({
    action: z.enum(['offline', 'restore'], { message: '操作类型不合法' }),
    reason: z.string().trim().max(255).optional(),
  })
  .refine((value) => value.action !== 'offline' || (value.reason?.length ?? 0) >= 2, {
    message: '下架需填写原因',
    path: ['reason'],
  })

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value.filter((item) => typeof item === 'string') as string[]) : []
}

function buildWhere(query: z.infer<typeof listQuery>): Prisma.ArtistPortfolioWhereInput {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.artistId ? { artistId: query.artistId } : {}),
    ...(query.keyword
      ? {
          OR: [
            { title: { contains: query.keyword } },
            { artist: { name: { contains: query.keyword } } },
          ],
        }
      : {}),
  }
}

/** 作品列表（E12-08） */
adminPortfolioRouter.get(
  '/admin/portfolios',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()
    const where = buildWhere(query)
    const baseWhere = buildWhere({ ...query, status: undefined })

    const [list, total, grouped] = await Promise.all([
      prisma.artistPortfolio.findMany({
        where,
        include: { artist: { select: { id: true, name: true, city: true, status: true } } },
        orderBy: { id: 'desc' },
        ...toPageArgs(query),
      }),
      prisma.artistPortfolio.count({ where }),
      prisma.artistPortfolio.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
    ])

    const counts = { all: 0, pending: 0, online: 0, offline: 0, rejected: 0 }
    grouped.forEach((item) => {
      if (item.status in counts) counts[item.status as keyof typeof counts] = item._count._all
      counts.all += item._count._all
    })

    res.ok({
      ...pageResult(
        list.map((item) => ({
          id: item.id,
          artistId: item.artistId,
          type: item.type,
          title: item.title,
          styles: asStringArray(item.styles),
          sort: item.sort,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
          path: buildSignedPath('/api/files/raw', item.url),
          artist: item.artist,
        })),
        total,
        query,
      ),
      counts,
    })
  }),
)

/** 下架 / 恢复（E12-08）：写 audit_log，小程序侧公开列表按 status 过滤 */
adminPortfolioRouter.post(
  '/admin/portfolios/:id/status',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const input = statusBody.parse(req.body)
    const prisma = getPrisma()

    const portfolio = await prisma.artistPortfolio.findUnique({
      where: { id },
      select: { id: true, status: true, title: true },
    })
    if (!portfolio) throw AppError.notFound('作品不存在')

    if (input.action === 'offline') {
      if (portfolio.status === 'offline') throw AppError.conflict('该作品已处于下架状态')
    } else if (portfolio.status !== 'offline') {
      throw AppError.conflict('仅已下架作品可恢复')
    }

    const nextStatus = input.action === 'offline' ? 'offline' : 'online'
    await prisma.$transaction([
      prisma.artistPortfolio.update({ where: { id }, data: { status: nextStatus } }),
      prisma.auditLog.create({
        data: {
          targetType: 'portfolio',
          targetId: id,
          action: input.action,
          reason: input.reason ?? null,
          operatorId: req.auth!.uid,
        },
      }),
    ])

    res.ok({ id, status: nextStatus })
  }),
)
