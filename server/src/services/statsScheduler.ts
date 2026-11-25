import { aggregateDay } from './stats'
import { addDays, dayOnly, formatDay } from './schedule'

/**
 * 每日聚合调度（E13-02）。
 * 每天 01:00 之后首次检查时重算「昨天」；服务重启错过 01:00 也会在启动后补跑一次。
 * UPSERT 幂等，多进程重复执行结果一致。
 */

const CHECK_INTERVAL_MS = 60_000

let timer: NodeJS.Timeout | null = null
let lastRunDay = ''

async function runYesterday(): Promise<void> {
  const yesterday = addDays(dayOnly(), -1)
  await aggregateDay(yesterday)
  console.info(`[stats] 已聚合 ${formatDay(yesterday)}`)
}

/** 启动调度（重复调用无副作用） */
export function startStatsScheduler(): void {
  if (timer) return

  const tick = () => {
    const now = new Date()
    const todayKey = formatDay(dayOnly(now))
    // 当天 01:00 前不跑；同一天只跑一次
    if (now.getHours() < 1 || lastRunDay === todayKey) return
    lastRunDay = todayKey
    void runYesterday().catch((error) => {
      console.warn(`[stats] 自动聚合失败：${(error as Error).message}`)
    })
  }

  // 启动即补跑（例如 09:00 重启，昨天数据可能还没聚合）
  tick()
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  timer.unref?.()
}
