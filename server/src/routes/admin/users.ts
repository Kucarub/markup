import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../../lib/prisma'
import { ADMIN_ALL, ADMIN_MANAGE, requireAdminRole } from '../../middlewares/adminRole'
import { requireAuth } from '../../middlewares/auth'
import { asyncHandler } from '../../utils/asyncHandler'
import { decryptAndMask } from '../../utils/crypto'
import { AppError } from '../../utils/errors'
import { pageResult, paginationSchema, toPageArgs } from '../../utils/pagination'

/**
 * 后台用户管理（E12-04）。
 * 化妆师与客户在 user_auth 上统一呈现，按角色筛选；
 * 封禁同时停用 user_auth 与对应 artist / customer 档案，
 * 业务接口（currentCustomer / resolveActor）会在下一次请求立即拒绝。
 */
export const adminUserRouter = Router()

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

const listQuery = paginationSchema.extend({
  role: z.enum(['artist', 'customer']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  keyword: z.string().trim().max(32).optional(),
})

const statusBody = z.object({
  status: z.enum(['active', 'disabled'], { message: '账号状态不合法' }),
  reason: z.string().trim().max(255).optional(),
})

function buildWhere(query: z.infer<typeof listQuery>): Prisma.UserAuthWhereInput {
  return {
    role: query.role ?? { in: ['artist', 'customer'] },
    ...(query.status ? { status: query.status } : {}),
    ...(query.keyword
      ? {
          OR: [
            { nickname: { contains: query.keyword } },
            { openid: { contains: query.keyword } },
            { artist: { name: { contains: query.keyword } } },
            { customer: { nickname: { contains: query.keyword } } },
          ],
        }
      : {}),
  }
}

/** 解封化妆师时恢复到封禁前的合理状态（已审核 → approved / 被驳回 → rejected / 未审 → pending） */
function restoreArtistStatus(artist: { auditAt: Date | null; rejectReason: string | null }): string {
  if (!artist.auditAt) return 'pending'
  return artist.rejectReason ? 'rejected' : 'approved'
}

/** 用户列表（E12-04）：化妆师 / 客户统一视图 */
adminUserRouter.get(
  '/admin/users',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const where = buildWhere(query)
    const prisma = getPrisma()

    const [list, total, allCount, artistCount, customerCount, disabledCount] = await Promise.all([
      prisma.userAuth.findMany({
        where,
        include: {
          artist: { select: { id: true, name: true, city: true, status: true, auditAt: true } },
          customer: { select: { id: true, nickname: true, city: true, status: true } },
          credit: { select: { score: true, level: true } },
        },
        orderBy: { id: 'desc' },
        ...toPageArgs(query),
      }),
      prisma.userAuth.count({ where }),
      prisma.userAuth.count({ where: { role: { in: ['artist', 'customer'] } } }),
      prisma.userAuth.count({ where: { role: 'artist' } }),
      prisma.userAuth.count({ where: { role: 'customer' } }),
      prisma.userAuth.count({ where: { role: { in: ['artist', 'customer'] }, status: 'disabled' } }),
    ])

    res.ok({
      ...pageResult(
        list.map((user) => ({
          userId: user.id,
          nickname: user.nickname,
          role: user.role,
          status: user.status,
          phoneMasked: user.phoneCipher ? decryptAndMask(user.phoneCipher) : null,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
          credit: user.credit ? { score: user.credit.score, level: user.credit.level } : null,
          artist: user.artist,
          customer: user.customer,
        })),
        total,
        query,
      ),
      counts: { all: allCount, artist: artistCount, customer: customerCount, disabled: disabledCount },
    })
  }),
)

/** 客户下拉选项（E12-07 代发布选人） */
adminUserRouter.get(
  '/admin/customers/options',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const { keyword } = z.object({ keyword: z.string().trim().max(32).optional() }).parse(req.query)
    const customers = await getPrisma().customer.findMany({
      where: {
        status: 'active',
        ...(keyword
          ? { OR: [{ nickname: { contains: keyword } }, { city: { contains: keyword } }] }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: 50,
      select: { id: true, userId: true, nickname: true, city: true, district: true },
    })
    res.ok({ list: customers })
  }),
)

/** 封禁 / 解封（E12-04）：同步 artist / customer 档案并写 audit_log */
adminUserRouter.post(
  '/admin/users/:id/status',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_MANAGE),
  asyncHandler(async (req, res) => {
    const { id } = paramsSchema.parse(req.params)
    const input = statusBody.parse(req.body)
    const prisma = getPrisma()
    const userId = id

    const user = await prisma.userAuth.findUnique({
      where: { id: userId },
      include: {
        artist: { select: { id: true, status: true, auditAt: true, rejectReason: true } },
        customer: { select: { id: true, status: true } },
      },
    })
    if (!user) throw AppError.notFound('用户不存在')
    if (!user.role || !['artist', 'customer'].includes(user.role)) {
      throw AppError.badRequest('该账号尚未选择身份，无法封禁')
    }
    if (input.status === 'disabled' && (input.reason?.length ?? 0) < 2) {
      throw AppError.badRequest('封禁需填写原因')
    }

    await prisma.$transaction(async (tx) => {
      await tx.userAuth.update({ where: { id: userId }, data: { status: input.status } })
      if (user.artist) {
        const nextStatus =
          input.status === 'disabled' ? 'disabled' : restoreArtistStatus(user.artist)
        await tx.artist.update({ where: { id: user.artist.id }, data: { status: nextStatus } })
      }
      if (user.customer) {
        await tx.customer.update({
          where: { id: user.customer.id },
          data: { status: input.status },
        })
      }
      await tx.auditLog.create({
        data: {
          targetType: 'user',
          targetId: userId,
          action: input.status === 'disabled' ? 'ban' : 'unban',
          reason: input.reason ?? null,
          operatorId: req.auth!.uid,
        },
      })
    })

    res.ok({
      userId,
      status: input.status,
      artistStatus:
        input.status === 'disabled' ? 'disabled' : user.artist ? restoreArtistStatus(user.artist) : null,
      customerStatus: user.customer ? input.status : null,
    })
  }),
)
