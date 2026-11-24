import { Router } from 'express'
import { z } from 'zod'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import {
  NOTIFICATION_STATUS,
  toNotificationDto,
} from '../services/notification'
import { asyncHandler } from '../utils/asyncHandler'
import { pageResult, paginationSchema, toPageArgs } from '../utils/pagination'

/**
 * 站内消息（E11-02 降级通道）。
 * 订阅消息无论发送成功、跳过还是失败，都会落一条 notification；
 * 小程序「消息通知」页直接读取这里，发送日志也可据此排查。
 */
export const notificationRouter = Router()

const listQuery = paginationSchema.extend({
  status: z.enum(NOTIFICATION_STATUS).optional(),
})

notificationRouter.get(
  '/notifications',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()
    const userId = req.auth!.uid
    const mine = { userId }
    const where = query.status ? { ...mine, status: query.status } : mine

    const [rows, total, grouped] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toPageArgs(query),
      }),
      prisma.notification.count({ where }),
      prisma.notification.groupBy({ by: ['status'], where: mine, _count: { _all: true } }),
    ])

    const counts = { all: 0, pending: 0, sent: 0, skipped: 0, failed: 0 }
    grouped.forEach((item) => {
      if (item.status in counts) counts[item.status as keyof typeof counts] = item._count._all
      counts.all += item._count._all
    })

    res.ok({
      ...pageResult(rows.map(toNotificationDto), total, query),
      counts,
    })
  }),
)
