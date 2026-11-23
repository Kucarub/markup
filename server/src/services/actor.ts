import { getPrisma } from '../lib/prisma'
import { currentCustomer } from './customer'
import { AppError } from '../utils/errors'

/** 服务记录 / 评价的当事人角色 */
export type OrderPartyRole = 'artist' | 'customer'

export interface Actor {
  role: OrderPartyRole
  userId: number
  artistId?: number
  customerId?: number
}

/** 当前登录者：客户或化妆师档案（两种角色共用服务记录与评价） */
export async function resolveActor(claims: { uid: number; role: string }): Promise<Actor> {
  const prisma = getPrisma()
  if (claims.role === 'artist') {
    const artist = await prisma.artist.findUnique({
      where: { userId: claims.uid },
      select: { id: true, status: true },
    })
    if (!artist) throw AppError.forbidden('请先完成化妆师入驻')
    if (artist.status === 'disabled') throw AppError.forbidden('账号已停用，请联系平台')
    return { role: 'artist', userId: claims.uid, artistId: artist.id }
  }
  if (claims.role === 'customer') {
    const customer = await currentCustomer(claims.uid)
    return { role: 'customer', userId: claims.uid, customerId: customer.id }
  }
  throw AppError.forbidden('仅客户或化妆师可操作')
}
