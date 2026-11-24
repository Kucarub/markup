import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../../lib/prisma'
import { ADMIN_ALL, requireAdminRole } from '../../middlewares/adminRole'
import { requireAuth } from '../../middlewares/auth'
import { addDays, dayOnly, parseDay } from '../../services/schedule'
import { asyncHandler } from '../../utils/asyncHandler'
import { pageResult, paginationSchema, toPageArgs } from '../../utils/pagination'

/**
 * 审核日志查询（E12-09）。
 * 只读：对象类型 / 动作 / 操作人 / 时间范围可组合筛选，日志不可编辑删除。
 */
export const adminAuditLogRouter = Router()

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TARGET_TYPES = ['artist', 'portfolio', 'user', 'report'] as const

const listQuery = paginationSchema.extend({
  targetType: z.enum(TARGET_TYPES).optional(),
  action: z.string().trim().max(16).optional(),
  from: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD').optional(),
  to: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD').optional(),
  keyword: z.string().trim().max(32).optional(),
})

function buildWhere(query: z.infer<typeof listQuery>): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {}
  if (query.from) createdAt.gte = dayOnly(parseDay(query.from))
  if (query.to) createdAt.lt = addDays(dayOnly(parseDay(query.to)), 1)

  return {
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(query.keyword
      ? {
          OR: [
            { reason: { contains: query.keyword } },
            { operator: { username: { contains: query.keyword } } },
          ],
        }
      : {}),
  }
}

/** 审核日志列表（E12-09） */
adminAuditLogRouter.get(
  '/admin/audit-logs',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()
    const where = buildWhere(query)
    const baseWhere = buildWhere({ ...query, targetType: undefined })

    const [list, total, grouped] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { operator: { select: { id: true, username: true, role: true } } },
        orderBy: { id: 'desc' },
        ...toPageArgs(query),
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ['targetType'],
        where: baseWhere,
        _count: { _all: true },
      }),
    ])

    const counts = { all: 0, artist: 0, portfolio: 0, user: 0, report: 0 }
    grouped.forEach((item) => {
      if (item.targetType in counts) {
        counts[item.targetType as keyof typeof counts] = item._count._all
      }
      counts.all += item._count._all
    })

    res.ok({
      ...pageResult(
        list.map((log) => ({
          id: log.id,
          targetType: log.targetType,
          targetId: log.targetId,
          action: log.action,
          reason: log.reason,
          operator: log.operator,
          createdAt: log.createdAt.toISOString(),
        })),
        total,
        query,
      ),
      counts,
    })
  }),
)
