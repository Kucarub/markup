import { Router, type Request } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'
import { extractBearerToken, verifyToken, type TokenRole } from '../utils/jwt'

/**
 * 埋点上报（E8-08）：需求浏览 / 搜索 / 响应等操作各落一条 event_log。
 * 上报失败不影响主流程，前端一律 `showError:false` 静默处理。
 */
export const eventRouter = Router()

const EVENT_RE = /^[a-z][a-z0-9_]{2,63}$/

const eventSchema = z.object({
  event: z.string().trim().regex(EVENT_RE, '事件名仅支持小写字母、数字与下划线'),
  props: z.record(z.unknown()).optional(),
})

/** 可选登录态：未登录也允许上报（如游客浏览需求大厅） */
function optionalClaims(req: Request): { uid: number; role: TokenRole } | null {
  try {
    return verifyToken(extractBearerToken(req.header('authorization')), 'access')
  } catch {
    return null
  }
}

eventRouter.post(
  '/events',
  asyncHandler(async (req, res) => {
    const input = eventSchema.parse(req.body)
    const propsJson = JSON.stringify(input.props ?? {})
    if (propsJson.length > 2000) throw AppError.badRequest('事件属性过多')

    const claims = optionalClaims(req)
    const role = claims ? (claims.role === 'guest' ? null : claims.role) : null

    const saved = await getPrisma().eventLog.create({
      data: {
        userId: claims?.uid ?? null,
        role,
        event: input.event,
        props: (input.props ?? {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    res.ok({ id: saved.id })
  }),
)
