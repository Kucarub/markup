import { getPrisma } from '../lib/prisma'
import { AppError } from '../utils/errors'

/**
 * 客户档案（E7-01）。
 * 客户不做资质审核：选择客户角色时自动建档，`profileStatus` 恒为 approved。
 */
export async function ensureCustomer(userId: number) {
  const prisma = getPrisma()
  const existing = await prisma.customer.findUnique({ where: { userId } })
  if (existing) return existing

  const user = await prisma.userAuth.findUnique({ where: { id: userId } })
  if (!user) throw AppError.unauthorized('账号不存在或已禁用')

  return prisma.customer.upsert({
    where: { userId },
    update: {},
    create: { userId, nickname: user.nickname, status: 'active' },
  })
}

/** 当前登录客户的档案：停用账号直接拒绝 */
export async function currentCustomer(userId: number) {
  const customer = await ensureCustomer(userId)
  if (customer.status === 'disabled') throw AppError.forbidden('账号已停用，请联系平台')
  return customer
}
