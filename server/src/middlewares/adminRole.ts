import type { RequestHandler } from 'express'
import { AppError } from '../utils/errors'

/**
 * 后台 RBAC（E12-01）。
 * 数据库约定三类账号：super（管理员）、admin（运营）、auditor（审核员）。
 * 必须在 requireAuth('admin') 之后使用；adminRole 来自登录时签发的 token。
 */
export type AdminRole = 'super' | 'admin' | 'auditor'

/** 全部后台角色：查询类接口 */
export const ADMIN_ALL: AdminRole[] = ['super', 'admin', 'auditor']
/** 管理动作：用户封禁、运营代发布/代响应 */
export const ADMIN_MANAGE: AdminRole[] = ['super', 'admin']

export function requireAdminRole(...roles: AdminRole[]): RequestHandler {
  return (req, _res, next) => {
    const role = req.auth?.adminRole as AdminRole | undefined
    if (!role || !roles.includes(role)) {
      next(AppError.forbidden('当前后台账号无权执行该操作'))
      return
    }
    next()
  }
}
