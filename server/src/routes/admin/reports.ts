import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../../lib/prisma'
import { ADMIN_ALL, requireAdminRole } from '../../middlewares/adminRole'
import { requireAuth } from '../../middlewares/auth'
import { notifyUser } from '../../services/notification'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/errors'
import { pageResult, paginationSchema, toPageArgs } from '../../utils/pagination'

/**
 * 举报处理（E14-04）。
 * - 列表：状态 / 对象类型筛选 + 关键字 + 分页 + 状态计数，附带举报对象摘要；
 * - 处理：dismiss（未成立）/ offline（下架被举报作品）/ ban（封禁被举报化妆师账号），
 *   联动复用 E12-08（作品下架写 audit_log）与 E12-04（封禁）；
 *   处理结果回写 report，并给举报人发站内通知，小程序举报页可见结果。
 */
export const adminReportRouter = Router()

const REPORT_STATUS = ['pending', 'handled', 'rejected'] as const

const listQuery = paginationSchema.extend({
  status: z.enum(REPORT_STATUS).optional(),
  targetType: z.enum(['portfolio', 'artist']).optional(),
  keyword: z.string().trim().max(32).optional(),
})

const handleBody = z.object({
  action: z.enum(['dismiss', 'offline', 'ban'], { message: '处理动作不合法' }),
  note: z.string().trim().max(255).optional(),
})

const HANDLE_RESULT_LABEL: Record<string, string> = {
  dismissed: '未发现违规',
  offline: '作品已下架',
  ban: '账号已封禁',
}

/** 站内通知：告知举报人处理结果（E14-04 结果回显） */
async function notifyReporter(reporterId: number, resultLabel: string): Promise<void> {
  await notifyUser({
    userId: reporterId,
    type: 'report_handled',
    templateKey: 'result',
    title: '举报处理结果',
    content: `你的举报已处理完成：${resultLabel}`,
    page: 'pages/report/index',
  })
}

adminReportRouter.get(
  '/admin/reports',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()

    const buildWhere = (withStatus: boolean): Prisma.ReportWhereInput => ({
      ...(withStatus && query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.keyword ? { reason: { contains: query.keyword } } : {}),
    })
    const where = buildWhere(true)
    const baseWhere = buildWhere(false)

    const [list, total, grouped] = await Promise.all([
      prisma.report.findMany({
        where,
        include: { reporter: { select: { id: true, nickname: true } } },
        orderBy: [{ status: 'asc' }, { id: 'desc' }],
        ...toPageArgs(query),
      }),
      prisma.report.count({ where }),
      prisma.report.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
    ])

    // 批量补齐对象摘要与处理人
    const portfolioIds = list.filter((item) => item.targetType === 'portfolio').map((item) => item.targetId)
    const artistIds = list.filter((item) => item.targetType === 'artist').map((item) => item.targetId)
    const [portfolios, artists] = await Promise.all([
      portfolioIds.length
        ? prisma.artistPortfolio.findMany({
            where: { id: { in: portfolioIds } },
            select: { id: true, title: true, status: true, artist: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
      artistIds.length
        ? prisma.artist.findMany({
            where: { id: { in: artistIds } },
            select: { id: true, name: true, status: true, user: { select: { status: true } } },
          })
        : Promise.resolve([]),
    ])
    const portfolioById = new Map(portfolios.map((item) => [item.id, item]))
    const artistById = new Map(artists.map((item) => [item.id, item]))

    const counts = { all: 0, pending: 0, handled: 0, rejected: 0 }
    grouped.forEach((item) => {
      if (item.status in counts) counts[item.status as keyof typeof counts] = item._count._all
      counts.all += item._count._all
    })

    res.ok({
      ...pageResult(
        list.map((item) => {
          const portfolio = item.targetType === 'portfolio' ? portfolioById.get(item.targetId) : null
          const artist = artistById.get(item.targetId)
          return {
            id: item.id,
            targetType: item.targetType,
            targetId: item.targetId,
            targetLabel:
              item.targetType === 'portfolio'
                ? `作品「${portfolio?.title || '已删除'}」 · ${portfolio?.artist.name || ''}`
                : `化妆师「${artist?.name || '已注销'}」`,
            targetStatus: portfolio?.status || artist?.status || null,
            reporter: { id: item.reporter.id, nickname: item.reporter.nickname || `用户${item.reporter.id}` },
            reason: item.reason,
            status: item.status,
            handleOperator: item.handleOperator,
            handleResult: item.handleResult,
            createdAt: item.createdAt.toISOString(),
          }
        }),
        total,
        query,
      ),
      counts,
    })
  }),
)

adminReportRouter.post(
  '/admin/reports/:id/handle',
  requireAuth('admin'),
  requireAdminRole('super', 'admin'),
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().positive('举报不存在') }).parse(req.params)
    const input = handleBody.parse(req.body)
    const prisma = getPrisma()

    const report = await prisma.report.findUnique({ where: { id } })
    if (!report) throw AppError.notFound('举报不存在')
    if (report.status !== 'pending') throw AppError.conflict('该举报已处理，请勿重复操作')

    if (input.action === 'offline') {
      if (report.targetType !== 'portfolio') {
        throw AppError.badRequest('「下架作品」仅适用于作品类举报')
      }
      const portfolio = await prisma.artistPortfolio.findUnique({
        where: { id: report.targetId },
        select: { id: true, status: true },
      })
      if (!portfolio) throw AppError.notFound('被举报的作品不存在或已删除')
      if (portfolio.status === 'offline') throw AppError.conflict('该作品已处于下架状态')

      await prisma.$transaction([
        prisma.artistPortfolio.update({
          where: { id: portfolio.id },
          data: { status: 'offline' },
        }),
        prisma.auditLog.create({
          data: {
            targetType: 'portfolio',
            targetId: portfolio.id,
            action: 'offline',
            reason: `举报处理（举报 #${id}）：${input.note || '核实违规'}`,
            operatorId: req.auth!.uid,
          },
        }),
      ])
    }

    if (input.action === 'ban') {
      const artistId =
        report.targetType === 'artist'
          ? report.targetId
          : (
              await prisma.artistPortfolio.findUnique({
                where: { id: report.targetId },
                select: { artistId: true },
              })
            )?.artistId ?? null
      if (!artistId) throw AppError.notFound('被举报的化妆师不存在')

      const artist = await prisma.artist.findUnique({
        where: { id: artistId },
        select: { id: true, userId: true, status: true },
      })
      if (!artist) throw AppError.notFound('被举报的化妆师不存在')
      if (artist.status === 'disabled') throw AppError.conflict('该账号已处于停用状态')

      await prisma.$transaction([
        prisma.userAuth.update({
          where: { id: artist.userId },
          data: { status: 'disabled' },
        }),
        prisma.artist.update({
          where: { id: artistId },
          data: { status: 'disabled' },
        }),
        prisma.auditLog.create({
          data: {
            targetType: 'user',
            targetId: artist.userId,
            action: 'ban',
            reason: `举报处理（举报 #${id}）：${input.note || '多次违规'}`,
            operatorId: req.auth!.uid,
          },
        }),
      ])
    }

    const resultLabel = HANDLE_RESULT_LABEL[input.action] || '已处理'
    const updated = await prisma.report.update({
      where: { id },
      data: {
        status: input.action === 'dismiss' ? 'rejected' : 'handled',
        handleOperator: req.auth!.uid,
        handleResult: `${resultLabel}${input.note ? `：${input.note}` : ''}`,
      },
    })

    await notifyReporter(report.reporterId, updated.handleResult || resultLabel)

    res.ok({
      id,
      status: updated.status,
      handleResult: updated.handleResult,
    })
  }),
)
