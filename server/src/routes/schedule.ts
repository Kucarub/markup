import { Router } from 'express'
import { z } from 'zod'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import {
  BATCH_MAX_DAYS,
  MANUAL_STATES,
  addDays,
  assertSettable,
  dayOnly,
  formatDay,
  parseDay,
  settableRange,
} from '../services/schedule'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'

/**
 * 档期管理（E6-01 / E6-02 / E6-03）。
 * - 按月返回整月数据，无记录视为 none（未设置）；
 * - 手工只能设 available / rest，booked 由订单占用（E6-04）；
 * - 已占用日期不可被手工覆盖，避免把订单档期改坏。
 */
export const scheduleRouter = Router()

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const monthQuery = z.object({ month: z.string().regex(MONTH_RE, '月份格式需为 YYYY-MM').optional() })

const setDaySchema = z.object({
  date: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD'),
  state: z.enum([...MANUAL_STATES, 'none'], { message: '档期状态不合法' }),
})

const batchSchema = z
  .object({
    state: z.enum(MANUAL_STATES, { message: '档期状态不合法' }),
    dates: z
      .array(z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD'))
      .min(1, '请至少选择 1 天')
      .max(BATCH_MAX_DAYS, `单次最多设置 ${BATCH_MAX_DAYS} 天`)
      .optional(),
    startDate: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD').optional(),
    endDate: z.string().regex(DAY_RE, '日期格式需为 YYYY-MM-DD').optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  })
  .refine((value) => value.dates?.length || (value.startDate && value.endDate), {
    message: '请选择日期或日期段',
  })

/** 当前登录化妆师：未入驻 / 停用直接拒绝 */
async function currentArtist(userId: number) {
  const artist = await getPrisma().artist.findUnique({ where: { userId } })
  if (!artist) throw AppError.notFound('尚未提交入驻申请')
  if (artist.status === 'disabled') throw AppError.forbidden('账号已停用，请联系平台')
  return artist
}

/** 展开月份为整月日期，weekday 用于前端首行对齐（0 = 周日） */
function monthDays(month: string) {
  const [year, mon] = month.split('-').map(Number) as [number, number]
  const total = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(Date.UTC(year, mon - 1, index + 1))
    return { date: formatDay(date), weekday: date.getUTCDay() }
  })
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** 按月查询档期（E6-03）：整月返回，无记录为 none；同时给出可设置窗口 */
scheduleRouter.get(
  '/schedule',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const { month } = monthQuery.parse(req.query)
    const artist = await currentArtist(req.auth!.uid)
    const target = month || currentMonth()
    const slots = monthDays(target)

    const records = await getPrisma().artistSchedule.findMany({
      where: {
        artistId: artist.id,
        date: { gte: parseDay(slots[0]!.date), lte: parseDay(slots[slots.length - 1]!.date) },
      },
      select: { date: true, state: true },
    })
    const stateByDate = new Map(records.map((item) => [formatDay(item.date), item.state]))
    const today = dayOnly()

    const days = slots.map((slot) => ({
      date: slot.date,
      weekday: slot.weekday,
      state: stateByDate.get(slot.date) || 'none',
      isPast: parseDay(slot.date).getTime() < today.getTime(),
    }))

    const summary = { available: 0, booked: 0, rest: 0, none: 0 }
    for (const day of days) summary[day.state as keyof typeof summary] += 1

    res.ok({
      month: target,
      days,
      summary,
      settable: settableRange(),
    })
  }),
)

/** 单日设置（E6-01）：none = 清空该日设置 */
scheduleRouter.put(
  '/schedule',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const { date, state } = setDaySchema.parse(req.body)
    const day = parseDay(date)
    assertSettable(day)

    const artist = await currentArtist(req.auth!.uid)
    const prisma = getPrisma()
    const existing = await prisma.artistSchedule.findUnique({
      where: { artistId_date: { artistId: artist.id, date: day } },
    })

    // 已被订单占用的日期不允许手工改动，否则订单档期会失真
    if (existing?.state === 'booked') {
      throw AppError.conflict('该日已被订单占用，请先处理对应订单')
    }

    if (state === 'none') {
      if (existing) {
        await prisma.artistSchedule.delete({ where: { id: existing.id } })
      }
      res.ok({ date, state: 'none' })
      return
    }

    await prisma.artistSchedule.upsert({
      where: { artistId_date: { artistId: artist.id, date: day } },
      create: { artistId: artist.id, date: day, state },
      update: { state },
    })
    res.ok({ date, state })
  }),
)

/** 批量设置（E6-02）：按日期数组或日期段 + 星期组合，已占用日期自动跳过 */
scheduleRouter.put(
  '/schedule/batch',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const input = batchSchema.parse(req.body)
    const artist = await currentArtist(req.auth!.uid)

    const targets = new Set<string>()
    if (input.dates?.length) {
      for (const value of input.dates) {
        assertSettable(parseDay(value))
        targets.add(value)
      }
      if (targets.size > BATCH_MAX_DAYS) {
        throw AppError.badRequest(`单次最多设置 ${BATCH_MAX_DAYS} 天`)
      }
    } else {
      const start = parseDay(input.startDate!)
      const end = parseDay(input.endDate!)
      if (start.getTime() > end.getTime()) throw AppError.badRequest('结束日期不能早于开始日期')
      const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
      if (span > BATCH_MAX_DAYS) {
        throw AppError.badRequest(`单次最多设置 ${BATCH_MAX_DAYS} 天`)
      }
      assertSettable(start)
      assertSettable(end)
      const weekdays = input.weekdays?.length ? new Set(input.weekdays) : null
      for (let offset = 0; offset < span; offset += 1) {
        const day = addDays(start, offset)
        if (weekdays && !weekdays.has(day.getUTCDay())) continue
        targets.add(formatDay(day))
      }
    }

    if (!targets.size) throw AppError.badRequest('没有符合条件的日期')

    const dates = [...targets].map((value) => parseDay(value))
    const prisma = getPrisma()

    const result = await prisma.$transaction(async (tx) => {
      const booked = await tx.artistSchedule.findMany({
        where: { artistId: artist.id, date: { in: dates }, state: 'booked' },
        select: { date: true },
      })
      const bookedSet = new Set(booked.map((item) => formatDay(item.date)))
      const writable = dates.filter((date) => !bookedSet.has(formatDay(date)))

      if (writable.length) {
        // 先删非占用记录再批量插入：两条 SQL 覆盖整段设置，避免逐条 upsert
        await tx.artistSchedule.deleteMany({
          where: { artistId: artist.id, date: { in: writable }, state: { not: 'booked' } },
        })
        await tx.artistSchedule.createMany({
          data: writable.map((date) => ({ artistId: artist.id, date, state: input.state })),
          skipDuplicates: true,
        })
      }
      return { updated: writable.length, skipped: bookedSet.size }
    })

    res.ok(result)
  }),
)
