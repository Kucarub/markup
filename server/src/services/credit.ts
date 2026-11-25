import type { Prisma } from '@prisma/client'
import { getPrisma } from '../lib/prisma'

/**
 * 信用分（E10-07）。
 * 完善个人信息后建档，初始 0，服务完成 +2，取消 -5（被举报核实 -10 随 E14 接入）。
 * 分值限制在 0–100，每次变动写入 events 流水（仅保留最近 50 条，便于追溯）。
 */
export const CREDIT_INITIAL = 0
export const CREDIT_FINISH_DELTA = 2
export const CREDIT_CANCEL_DELTA = -5

export type CreditEventType = 'finish' | 'cancel'

export interface CreditInfo {
  score: number
  level: string
  initial: boolean
}

/** 等级阈值：0 分起步，30 分一般、60 分良好、80 分优秀 */
export function creditLevel(score: number): string {
  if (score >= 80) return '优秀'
  if (score >= 60) return '良好'
  if (score >= 30) return '一般'
  return '待提升'
}

/** 查询信用分：未产生变动时返回初始分（不落库） */
export async function getCredit(userId: number): Promise<CreditInfo> {
  const row = await getPrisma().creditScore.findUnique({ where: { userId } })
  if (!row) return { score: CREDIT_INITIAL, level: creditLevel(CREDIT_INITIAL), initial: true }
  return { score: row.score, level: row.level, initial: false }
}

/** 完善个人信息后建档（初始 0）：已存在则保持原分值，不覆盖历史流水 */
export async function ensureCredit(
  tx: Prisma.TransactionClient,
  input: { userId: number; role: 'artist' | 'customer' },
): Promise<void> {
  await tx.creditScore.upsert({
    where: { userId: input.userId },
    update: {},
    create: {
      userId: input.userId,
      role: input.role,
      score: CREDIT_INITIAL,
      level: creditLevel(CREDIT_INITIAL),
    },
  })
}

/** 按事件累加信用分（必须在业务事务内调用，保证与状态流转同成败） */
export async function adjustCredit(
  tx: Prisma.TransactionClient,
  input: {
    userId: number
    role: 'artist' | 'customer'
    delta: number
    type: CreditEventType
    orderId: number
  },
): Promise<void> {
  const existing = await tx.creditScore.findUnique({ where: { userId: input.userId } })
  const base = existing?.score ?? CREDIT_INITIAL
  const score = Math.max(0, Math.min(100, base + input.delta))
  const history = Array.isArray(existing?.events) ? (existing!.events as unknown[]) : []
  const events = [
    { at: new Date().toISOString(), type: input.type, delta: input.delta, orderId: input.orderId },
    ...history,
  ].slice(0, 50)

  const data = { score, level: creditLevel(score), events: events as Prisma.InputJsonValue }
  await tx.creditScore.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, role: input.role, ...data },
    update: data,
  })
}
