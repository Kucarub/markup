import type { StatsDaily } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { addDays, dayOnly, formatDay } from './schedule'

/**
 * 每日指标聚合（E13-02）。
 *
 * 口径见 PRD 第 1 章与 docs/events.md：
 * 直接读业务表，不依赖 event_log 条数；按自然日 UPSERT，重跑同一天结果一致（幂等）。
 * 日期统一用 UTC 零点表示（与 MySQL DATE、dayOnly() 对齐）。
 */

/** 看板单次查询最大天数 */
export const STATS_MAX_RANGE_DAYS = 90

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

export interface DayMetrics {
  registrations: number
  artistPageUv: number
  demands: number
  responses: number
  responseRate: number
  serviceOrders: number
  completionRate: number
  retentionD7: number
}

/** 计算某自然日的全部指标（不落库） */
export async function computeDay(day: Date): Promise<DayMetrics> {
  const prisma = getPrisma()
  const start = dayOnly(day)
  const end = addDays(start, 1)
  const range = { gte: start, lt: end }

  // 7 日留存队列：D-7 当天注册的账号
  const cohortStart = addDays(start, -7)
  const cohortRange = { gte: cohortStart, lt: addDays(cohortStart, 1) }

  const [
    registrations,
    artistPageUv,
    demands,
    respondedDemands,
    responses,
    serviceOrders,
    finishedOrders,
    cohort,
  ] = await Promise.all([
    prisma.userAuth.count({ where: { createdAt: range } }),
    prisma.artistVisit.count({ where: { visitDate: start } }),
    prisma.demand.count({ where: { createdAt: range } }),
    prisma.demand.count({ where: { createdAt: range, responses: { some: {} } } }),
    prisma.demandResponse.count({ where: { createdAt: range } }),
    prisma.serviceOrder.count({ where: { createdAt: range } }),
    prisma.serviceOrder.count({ where: { createdAt: range, status: 'finished' } }),
    prisma.userAuth.findMany({ where: { createdAt: cohortRange }, select: { id: true } }),
  ])

  // 留存：D-7 注册的账号里，D 当日登录过或有埋点行为
  const cohortIds = cohort.map((item) => item.id)
  const [loginRows, eventRows] = cohortIds.length
    ? await Promise.all([
        prisma.userAuth.findMany({
          where: { id: { in: cohortIds }, lastLoginAt: range },
          select: { id: true },
        }),
        prisma.eventLog.findMany({
          where: { userId: { in: cohortIds }, createdAt: range },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ])
    : [[], []]
  const activeIds = new Set<number>()
  loginRows.forEach((item) => activeIds.add(item.id))
  eventRows.forEach((item) => {
    if (item.userId !== null) activeIds.add(item.userId)
  })

  return {
    registrations,
    artistPageUv,
    demands,
    responses,
    responseRate: demands > 0 ? round4(respondedDemands / demands) : 0,
    serviceOrders,
    completionRate: serviceOrders > 0 ? round4(finishedOrders / serviceOrders) : 0,
    retentionD7: cohortIds.length > 0 ? round4(activeIds.size / cohortIds.length) : 0,
  }
}

/** 聚合单日并 UPSERT 到 stats_daily（幂等） */
export async function aggregateDay(day: Date): Promise<StatsDaily> {
  const date = dayOnly(day)
  const metrics = await computeDay(date)
  return getPrisma().statsDaily.upsert({
    where: { date },
    update: metrics,
    create: { date, ...metrics },
  })
}

/** 聚合闭区间 [from, to]，逐日 UPSERT */
export async function aggregateRange(from: Date, to: Date): Promise<StatsDaily[]> {
  const rows: StatsDaily[] = []
  for (let cursor = dayOnly(from); cursor.getTime() <= to.getTime(); cursor = addDays(cursor, 1)) {
    rows.push(await aggregateDay(cursor))
  }
  return rows
}

/** 序列化给接口：日期转 YYYY-MM-DD，便于前端直接使用 */
export function toDailyDto(row: StatsDaily) {
  return {
    date: formatDay(row.date),
    registrations: row.registrations,
    artistPageUv: row.artistPageUv,
    demands: row.demands,
    responses: row.responses,
    responseRate: row.responseRate,
    serviceOrders: row.serviceOrders,
    completionRate: row.completionRate,
    retentionD7: row.retentionD7,
  }
}
