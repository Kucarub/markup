import { getPrisma } from '../lib/prisma'
import { AppError } from '../utils/errors'

/**
 * 化妆师档案（注册流程调整）。
 * 选化妆师角色即自动建档：不填表单也可正常浏览与接单；
 * 个人信息完善前 `profileCompleted=false`，不进入搜索结果与公开主页。
 */
export async function ensureArtist(userId: number) {
  const prisma = getPrisma()
  const existing = await prisma.artist.findUnique({ where: { userId } })
  if (existing) return existing

  const user = await prisma.userAuth.findUnique({ where: { id: userId } })
  if (!user) throw AppError.unauthorized('账号不存在或已禁用')

  return prisma.artist.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      name: user.nickname || '新化妆师',
      city: '',
      status: 'approved',
      profileCompleted: false,
    },
  })
}
