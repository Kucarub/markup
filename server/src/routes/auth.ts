import { Router } from 'express'
import { z } from 'zod'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import { code2session, getPhoneNumber } from '../services/wechat'
import { asyncHandler } from '../utils/asyncHandler'
import { decryptAndMask, encryptSensitive, maskPhone } from '../utils/crypto'
import { AppError } from '../utils/errors'
import { issueTokenPair, verifyToken, type TokenRole } from '../utils/jwt'

export const authRouter = Router()

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'refreshToken 不能为空'),
})

const wxLoginSchema = z.object({
  code: z.string().min(1, 'code 不能为空'),
  nickname: z.string().max(64).optional(),
  avatarUrl: z.string().max(512).optional(),
})

const roleSchema = z.object({
  role: z.enum(['artist', 'merchant'], { invalid_type_error: '角色只能是 artist 或 merchant' }),
})

const phoneSchema = z.object({
  code: z.string().min(1, 'code 不能为空'),
})

/**
 * 登录态资料（E3-03 / E3-05）：
 * profileStatus 供前端路由守卫判断入驻三态，none 表示尚未提交入驻。
 */
async function buildProfile(userId: number) {
  const user = await getPrisma().userAuth.findUnique({
    where: { id: userId },
    include: {
      artist: { select: { id: true, status: true, rejectReason: true } },
      merchant: { select: { id: true, status: true, rejectReason: true } },
    },
  })
  if (!user || user.status !== 'active') throw AppError.unauthorized('账号不存在或已禁用')

  const entity = user.role === 'artist' ? user.artist : user.role === 'merchant' ? user.merchant : null
  return {
    userId: user.id,
    role: user.role as 'artist' | 'merchant' | null,
    needRoleSelect: !user.role,
    phoneBound: Boolean(user.phoneCipher),
    phoneMasked: decryptAndMask(user.phoneCipher),
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    profileId: entity?.id ?? null,
    profileStatus: entity ? entity.status : 'none',
    rejectReason: entity && entity.status === 'rejected' ? entity.rejectReason : null,
  }
}

/** 按库内最新角色签发 token 对，避免角色切换后旧 claim 残留 */
async function issueSession(userId: number) {
  const profile = await buildProfile(userId)
  const role = (profile.role || 'guest') as TokenRole
  return { ...issueTokenPair({ uid: userId, role }), ...profile }
}

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
 * 微信登录（E3-01）：code -> openid -> user_auth upsert -> 签发双 token。
 * 同 openid 重复登录复用同一 userId；首次登录 role 为空，返回 needRoleSelect=true。
 */
authRouter.post(
  '/auth/wx-login',
  asyncHandler(async (req, res) => {
    const { code, nickname, avatarUrl } = wxLoginSchema.parse(req.body)
    const { openid, unionid } = await code2session(code)

    const user = await getPrisma().userAuth.upsert({
      where: { openid },
      update: {
        lastLoginAt: new Date(),
        ...(unionid ? { unionid } : {}),
        ...(nickname ? { nickname } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      create: { openid, unionid, nickname, avatarUrl, lastLoginAt: new Date() },
    })

    res.ok(await issueSession(user.id))
  }),
)

/** 当前登录态（E3-03 / E3-05）：数据库资料 + 入驻状态 */
authRouter.get(
  '/auth/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.ok(await buildProfile(req.auth!.uid))
  }),
)

/** 绑定 / 切换角色（E3-03）：写库后重新签发 token，前端据此渲染 TabBar */
authRouter.post(
  '/auth/role',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { role } = roleSchema.parse(req.body)
    await getPrisma().userAuth.update({ where: { id: req.auth!.uid }, data: { role } })
    res.ok(await issueSession(req.auth!.uid))
  }),
)

/** 手机号快速验证（E3-02）：code 换手机号，AES-256-GCM 加密落库 */
authRouter.post(
  '/auth/phone',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { code } = phoneSchema.parse(req.body)
    const phone = await getPhoneNumber(code)
    await getPrisma().userAuth.update({
      where: { id: req.auth!.uid },
      data: { phoneCipher: encryptSensitive(phone) },
    })
    res.ok({ phoneBound: true, phoneMasked: maskPhone(phone) })
  }),
)
