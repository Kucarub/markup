import type { RequestHandler } from 'express'
import { AppError } from '../utils/errors'
import { extractBearerToken, verifyToken, type TokenRole } from '../utils/jwt'

/**
 * 登录态 + 角色拦截（E2-04）。
 * 不传 roles 表示只要求登录；传了 roles 则角色不在白名单返回 403。
 */
export function requireAuth(...roles: TokenRole[]): RequestHandler {
  return (req, _res, next) => {
    try {
      const token = extractBearerToken(req.header('authorization'))
      const claims = verifyToken(token, 'access')
      if (roles.length > 0 && !roles.includes(claims.role)) {
        throw AppError.forbidden('没有操作权限')
      }
      req.auth = claims
      next()
    } catch (error) {
      next(error)
    }
  }
}
