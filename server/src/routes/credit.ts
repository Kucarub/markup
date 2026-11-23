import { Router } from 'express'
import { getPrisma } from '../lib/prisma'
import { getCredit } from '../services/credit'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'

/** 信用分与等级（E10-07）：公开只读，供个人中心与化妆师主页展示。 */
export const creditRouter = Router()

creditRouter.get(
  '/credit/:userId',
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId)
    if (!Number.isInteger(userId) || userId <= 0) throw AppError.notFound('用户不存在')

    const user = await getPrisma().userAuth.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    if (!user) throw AppError.notFound('用户不存在')

    const credit = await getCredit(userId)
    res.ok({ userId, role: user.role, ...credit })
  }),
)
