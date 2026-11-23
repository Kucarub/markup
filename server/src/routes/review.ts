import { Router } from 'express'
import { z } from 'zod'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import { resolveActor } from '../services/actor'
import { moderateReview } from '../services/moderation'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'
import { pageResult, paginationSchema, toPageArgs } from '../utils/pagination'

/**
 * 双向评价（E10-06）：仅已完成服务记录可评、一单一评、1–5 星 + 标签 + 文字。
 * 文本命中敏感词先置「待审」，未命中直接可见；对外只展示 visible。
 */
export const reviewRouter = Router()

const createBody = z.object({
  serviceOrderId: z.coerce.number().int().positive('请选择服务记录'),
  rating: z.coerce.number().int().min(1, '请选择评分').max(5, '评分最高 5 星'),
  tags: z.array(z.string().trim().min(1).max(16)).max(6, '最多选择 6 个标签').optional(),
  content: z.string().trim().max(500, '评价不超过 500 字').optional(),
})

const listQuery = paginationSchema.extend({
  artistId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  serviceOrderId: z.coerce.number().int().positive().optional(),
})

const ROLE_LABEL: Record<string, string> = { customer: '客户', artist: '化妆师' }

reviewRouter.post(
  '/reviews',
  requireAuth('customer', 'artist'),
  asyncHandler(async (req, res) => {
    const input = createBody.parse(req.body)
    const actor = await resolveActor(req.auth!)
    const prisma = getPrisma()

    const order = await prisma.serviceOrder.findUnique({
      where: { id: input.serviceOrderId },
      include: {
        customer: { select: { userId: true } },
        artist: { select: { userId: true } },
      },
    })
    if (!order) throw AppError.notFound('服务记录不存在')

    const mine =
      actor.role === 'artist'
        ? order.artistId === actor.artistId
        : order.customerId === actor.customerId
    if (!mine) throw AppError.notFound('服务记录不存在')
    if (order.status !== 'finished') throw AppError.conflict('服务完成后才能评价')

    const existing = await prisma.review.findUnique({
      where: {
        serviceOrderId_fromUserId: { serviceOrderId: order.id, fromUserId: actor.userId },
      },
      select: { id: true },
    })
    if (existing) throw AppError.conflict('你已评价过该服务记录')

    const toRole = actor.role === 'artist' ? 'customer' : 'artist'
    const toUserId = toRole === 'artist' ? order.artist.userId : order.customer.userId
    const moderation = moderateReview(input.content)

    try {
      const review = await prisma.review.create({
        data: {
          serviceOrderId: order.id,
          fromUserId: actor.userId,
          fromRole: actor.role,
          toUserId,
          toRole,
          rating: input.rating,
          tags: input.tags?.length ? input.tags : undefined,
          content: input.content || null,
          status: moderation.status,
        },
      })
      res.ok({
        id: review.id,
        status: review.status,
        visible: review.status === 'visible',
        message:
          review.status === 'visible' ? '评价已发布' : '评价已提交，审核通过后展示',
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw AppError.conflict('你已评价过该服务记录')
      }
      throw error
    }
  }),
)

/** 评价列表：按化妆师（artistId）/ 用户（userId）/ 服务记录查询，仅展示可见评价 */
reviewRouter.get(
  '/reviews',
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()

    let toUserId = query.userId
    if (!toUserId && query.artistId) {
      const artist = await prisma.artist.findUnique({
        where: { id: query.artistId },
        select: { userId: true },
      })
      if (!artist) throw AppError.notFound('化妆师不存在')
      toUserId = artist.userId
    }
    if (!toUserId && !query.serviceOrderId) {
      throw AppError.badRequest('请指定 artistId、userId 或 serviceOrderId')
    }

    const where = {
      status: 'visible',
      ...(toUserId ? { toUserId } : {}),
      ...(query.serviceOrderId ? { serviceOrderId: query.serviceOrderId } : {}),
    }

    const [total, rows, agg] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          rating: true,
          tags: true,
          content: true,
          fromRole: true,
          createdAt: true,
          serviceOrderId: true,
          fromUser: { select: { nickname: true, avatarUrl: true } },
        },
        ...toPageArgs(query),
      }),
      prisma.review.aggregate({ where, _avg: { rating: true } }),
    ])

    res.ok({
      ...pageResult(
        rows.map((row) => ({
          id: row.id,
          serviceOrderId: row.serviceOrderId,
          rating: row.rating,
          tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
          content: row.content,
          fromRole: row.fromRole,
          fromRoleLabel: ROLE_LABEL[row.fromRole] || row.fromRole,
          fromName: row.fromUser.nickname || ROLE_LABEL[row.fromRole] || '用户',
          fromAvatar: row.fromUser.avatarUrl || null,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        query,
      ),
      avgRating: agg._avg.rating ? Number(agg._avg.rating.toFixed(1)) : null,
    })
  }),
)
