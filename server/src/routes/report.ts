import { Router } from 'express'
import { z } from 'zod'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'
import { paginationSchema, pageResult, toPageArgs } from '../utils/pagination'

/**
 * 举报（E14-03）。
 * - 对象：作品 portfolio / 化妆师 artist（用户维度举报归并到 artist）；
 * - 限频：同一用户对同一对象 24 小时（按自然日）仅可举报 1 次（唯一索引兜底）；
 * - 提交后进入后台「举报处理」（E14-04），处理结果回写 report.status 与 handle_result，
 *   举报人在 GET /api/reports/mine 可见。
 */
export const reportRouter = Router()

const REASONS = ['porn', 'fraud', 'copyright', 'inappropriate', 'other'] as const

const REPORT_STATUS = ['pending', 'handled', 'rejected'] as const

const createSchema = z.object({
  targetType: z.enum(['portfolio', 'artist'], { message: '举报对象类型不合法' }),
  targetId: z.coerce.number().int().positive('举报对象不存在'),
  reason: z.enum(REASONS, { message: '请选择举报原因' }),
  detail: z.string().trim().max(200).optional(),
})

const REASON_LABEL: Record<(typeof REASONS)[number], string> = {
  porn: '色情低俗',
  fraud: '欺诈诱导',
  copyright: '盗用作品',
  inappropriate: '内容不当',
  other: '其他问题',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  handled: '已处理',
  rejected: '未成立',
}

/** 当天零点（按服务器本地日），与唯一索引 uniq_reporter_target_date 对齐 */
function todayStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** 举报对象摘要（详情展示用） */
async function describeTarget(
  targetType: string,
  targetId: number,
): Promise<{ title: string; artistId: number | null }> {
  const prisma = getPrisma()
  if (targetType === 'portfolio') {
    const item = await prisma.artistPortfolio.findUnique({
      where: { id: targetId },
      select: { id: true, title: true, artistId: true },
    })
    if (!item) throw AppError.notFound('被举报的作品不存在或已删除')
    return { title: `作品「${item.title}」`, artistId: item.artistId }
  }
  const artist = await prisma.artist.findUnique({
    where: { id: targetId },
    select: { id: true, name: true },
  })
  if (!artist) throw AppError.notFound('被举报的化妆师不存在')
  return { title: `化妆师「${artist.name}」`, artistId: artist.id }
}

/** 提交举报（E14-03） */
reportRouter.post(
  '/reports',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body)
    const prisma = getPrisma()

    const target = await describeTarget(input.targetType, input.targetId)

    const created = await prisma.report
      .create({
        data: {
          targetType: input.targetType,
          targetId: input.targetId,
          reason: `${REASON_LABEL[input.reason]}${input.detail ? `：${input.detail}` : ''}`,
          reporterId: req.auth!.uid,
          date: todayStart(),
        },
      })
      .catch((error: { code?: string }) => {
        if (error.code === 'P2002') {
          throw AppError.conflict('该内容 24 小时内已举报过，请等待处理结果')
        }
        throw error
      })

    res.ok({
      id: created.id,
      status: created.status,
      statusLabel: STATUS_LABEL[created.status],
      message: '举报已提交，我们会在 1-2 个工作日内处理',
    })
  }),
)

/** 我的举报记录（E14-03 / E14-04 回显） */
reportRouter.get(
  '/reports/mine',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const pagination = paginationSchema.parse(req.query)
    const prisma = getPrisma()

    const where = { reporterId: req.auth!.uid }
    const [total, items] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        orderBy: { id: 'desc' },
        ...toPageArgs(pagination),
      }),
    ])

    // 补齐对象摘要（作品可能已被作者删除，此时降级展示）
    const portfolioIds = items.filter((item) => item.targetType === 'portfolio').map((item) => item.targetId)
    const artistIds = items.filter((item) => item.targetType === 'artist').map((item) => item.targetId)
    const [portfolios, artists] = await Promise.all([
      portfolioIds.length
        ? prisma.artistPortfolio.findMany({
            where: { id: { in: portfolioIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      artistIds.length
        ? prisma.artist.findMany({ where: { id: { in: artistIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ])
    const portfolioById = new Map(portfolios.map((item) => [item.id, item.title]))
    const artistById = new Map(artists.map((item) => [item.id, item.name]))

    res.ok(
      pageResult(
        items.map((item) => ({
          id: item.id,
          targetType: item.targetType,
          targetId: item.targetId,
          targetLabel:
            item.targetType === 'portfolio'
              ? `作品「${portfolioById.get(item.targetId) || '已删除'}」`
              : `化妆师「${artistById.get(item.targetId) || '已注销'}」`,
          reason: item.reason,
          status: item.status,
          statusLabel: STATUS_LABEL[item.status] || item.status,
          handleResult: item.handleResult,
          handledAt: item.updatedAt,
          createdAt: item.createdAt,
        })),
        total,
        pagination,
      ),
    )
  }),
)

export { REPORT_STATUS, REASON_LABEL }
