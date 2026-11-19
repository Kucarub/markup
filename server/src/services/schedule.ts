import type { Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { AppError } from '../utils/errors'

/**
 * 档期服务层（E6-03 / E6-04）。
 * 日期统一用 UTC 零点表示，与 MySQL DATE 列对齐，避免时区偏移一天。
 * 占用 / 释放由业务侧（邀约接受、订单取消）在事务内调用。
 */

/** 手工可设置的状态；booked 只能由系统占用 */
export const MANUAL_STATES = ['available', 'rest'] as const
export type ManualState = (typeof MANUAL_STATES)[number]

/** 可设置窗口：今天起 180 天内 */
export const SETTABLE_DAYS = 180

/** 单次批量设置上限（覆盖 3 个月） */
export const BATCH_MAX_DAYS = 92

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function dayOnly(base = new Date()): Date {
  return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()))
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

/** 严格解析 YYYY-MM-DD：非法格式与不存在的日期（如 02-30）都拒绝 */
export function parseDay(value: string): Date {
  if (!DAY_RE.test(value)) throw AppError.badRequest('日期格式需为 YYYY-MM-DD')
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(date.getTime()) || formatDay(date) !== value) {
    throw AppError.badRequest('日期不合法')
  }
  return date
}

/** 只允许设置今天及以后、180 天以内；过去日期不可改 */
export function assertSettable(date: Date): void {
  const today = dayOnly()
  if (date.getTime() < today.getTime()) throw AppError.badRequest('不能设置过去的日期')
  if (date.getTime() > addDays(today, SETTABLE_DAYS).getTime()) {
    throw AppError.badRequest(`最多只能设置未来 ${SETTABLE_DAYS} 天的档期`)
  }
}

export function settableRange(): { minDate: string; maxDate: string } {
  const today = dayOnly()
  return { minDate: formatDay(today), maxDate: formatDay(addDays(today, SETTABLE_DAYS)) }
}

type Client = Prisma.TransactionClient | ReturnType<typeof getPrisma>

/**
 * 占用某天档期（E6-04）：已占用 / 休息 → 冲突。
 * 依赖 (artist_id, date) 唯一索引兜底并发：两个请求同时插入只有一个能成功。
 */
export async function claimDay(
  artistId: number,
  date: Date,
  orderId: number,
  client?: Prisma.TransactionClient,
): Promise<void> {
  const db: Client = client ?? getPrisma()

  const existing = await db.artistSchedule.findUnique({
    where: { artistId_date: { artistId, date } },
  })
  // 同一订单重复占用视为幂等，避免重试路径报错
  if (existing?.state === 'booked' && existing.orderId === orderId) return
  if (existing && existing.state !== 'available') {
    throw AppError.conflict('该日期档期已被占用或设为休息')
  }

  const updated = await db.artistSchedule.updateMany({
    where: { artistId, date, state: 'available' },
    data: { state: 'booked', orderId },
  })
  if (updated.count > 0) return

  try {
    await db.artistSchedule.create({ data: { artistId, date, state: 'booked', orderId } })
  } catch (error) {
    // 并发下另一个请求已插入 → 唯一索引冲突即视为档期被抢占
    if ((error as { code?: string }).code === 'P2002') {
      throw AppError.conflict('该日期档期已被占用')
    }
    throw error
  }
}

/** 释放订单占用的档期：只释放本订单占用的那天，避免误放他人 */
export async function releaseDay(
  artistId: number,
  date: Date,
  orderId: number,
  client?: Prisma.TransactionClient,
): Promise<boolean> {
  const db: Client = client ?? getPrisma()
  const result = await db.artistSchedule.updateMany({
    where: { artistId, date, orderId, state: 'booked' },
    data: { state: 'available', orderId: null },
  })
  return result.count > 0
}
