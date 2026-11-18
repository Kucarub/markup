import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'
import { issueTokenPair, verifyToken } from '../utils/jwt'

export const authRouter = Router()

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'refreshToken 不能为空'),
})

/**
 * 刷新登录态（E2-04）：用 refresh token 换新的 access + refresh。
 * 角色与 uid 原样续期，避免前端二次拉取用户信息。
 */
authRouter.post(
  '/auth/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body)
    const claims = verifyToken(refreshToken, 'refresh')
    if (claims.role === 'admin') {
      throw AppError.forbidden('后台账号请使用后台刷新入口')
    }
    res.ok(issueTokenPair({ uid: claims.uid, role: claims.role }))
  }),
)

/**
 * 当前登录态回显（占位）：E3-03 接入 GET /api/auth/me 后替换为数据库资料。
 * 现阶段用于验证 token 有效性与角色拦截。
 */
authRouter.get(
  '/auth/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.ok({ userId: req.auth?.uid, role: req.auth?.role })
  }),
)
