import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { getPrisma } from '../../lib/prisma'
import { requireAuth } from '../../middlewares/auth'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/errors'
import { issueTokenPair, verifyToken } from '../../utils/jwt'

export const adminAuthRouter = Router()

/** 连续失败 5 次锁定 10 分钟（E2-07） */
const MAX_FAILS = 5
const LOCK_MS = 10 * 60 * 1000

const loginSchema = z.object({
  username: z.string().trim().min(3, '用户名至少 3 位').max(32),
  password: z.string().min(8, '密码至少 8 位').max(64),
})

adminAuthRouter.post(
  '/admin/auth/login',
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body)
    const prisma = getPrisma()
    const admin = await prisma.adminUser.findUnique({ where: { username } })

    if (!admin) throw AppError.unauthorized('账号或密码错误')
    if (admin.status !== 'active') throw AppError.forbidden('账号已禁用，请联系管理员')

    const now = new Date()
    if (admin.lockedUntil && admin.lockedUntil > now) {
      const minutes = Math.ceil((admin.lockedUntil.getTime() - now.getTime()) / 60000)
      throw AppError.accountLocked(`账号已锁定，请 ${minutes} 分钟后重试`)
    }

    const matched = await bcrypt.compare(password, admin.passwordHash)
    if (!matched) {
      const failCount = admin.failCount + 1
      const shouldLock = failCount >= MAX_FAILS
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failCount: shouldLock ? 0 : failCount,
          lockedUntil: shouldLock ? new Date(now.getTime() + LOCK_MS) : null,
        },
      })
      if (shouldLock) throw AppError.accountLocked('密码错误次数过多，账号已锁定 10 分钟')
      throw AppError.unauthorized('账号或密码错误')
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { failCount: 0, lockedUntil: null, lastLoginAt: now },
    })

    res.ok({
      ...issueTokenPair({ uid: admin.id, role: 'admin', adminRole: admin.role }),
      admin: { id: admin.id, username: admin.username, role: admin.role },
    })
  }),
)

/** 后台当前登录态；O 端路由守卫用它校验 token 与角色 */
adminAuthRouter.get(
  '/admin/auth/me',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const admin = await getPrisma().adminUser.findUnique({
      where: { id: req.auth?.uid },
      select: { id: true, username: true, role: true, status: true, lastLoginAt: true },
    })
    if (!admin || admin.status !== 'active') throw AppError.unauthorized('账号不存在或已禁用')
    res.ok(admin)
  }),
)

/** 后台 refresh：单独入口，只接受 admin 类型的 refresh token */
adminAuthRouter.post(
  '/admin/auth/refresh',
  asyncHandler(async (req, res) => {
    const body = z.object({ refreshToken: z.string().min(10) }).parse(req.body)
    const claims = verifyToken(body.refreshToken, 'refresh')
    if (claims.role !== 'admin') throw AppError.forbidden('凭证类型不匹配')
    res.ok(issueTokenPair({ uid: claims.uid, role: 'admin', adminRole: claims.adminRole }))
  }),
)
