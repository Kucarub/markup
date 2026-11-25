import { Router } from 'express'
import { z } from 'zod'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import { currentCustomer } from '../services/customer'
import { asyncHandler } from '../utils/asyncHandler'

/**
 * 客户资料（E7-01）。
 * 账号体系仅依赖 openid（方案 A），不收集手机号。
 */
export const customerRouter = Router()

const updateSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(32, '昵称不超过 32 个字').optional(),
  city: z.string().trim().max(32).optional(),
  district: z.string().trim().max(32).optional(),
})

function toProfile(customer: {
  id: number
  nickname: string | null
  city: string | null
  district: string | null
  status: string
}) {
  return {
    id: customer.id,
    nickname: customer.nickname,
    city: customer.city,
    district: customer.district,
    status: customer.status,
  }
}

/** 我的客户资料（E7-01）：首次调用自动建档 */
customerRouter.get(
  '/customer/me',
  requireAuth('customer'),
  asyncHandler(async (req, res) => {
    res.ok(toProfile(await currentCustomer(req.auth!.uid)))
  }),
)

/** 修改客户资料（E7-01）：昵称 / 城市 / 区域，全部可选 */
customerRouter.put(
  '/customer/me',
  requireAuth('customer'),
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body)
    const customer = await currentCustomer(req.auth!.uid)
    const updated = await getPrisma().customer.update({ where: { id: customer.id }, data: input })
    res.ok(toProfile(updated))
  }),
)
