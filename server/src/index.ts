import { createApp } from './app'
import { env } from './config/env'
import { getPrisma } from './lib/prisma'
import { redis } from './lib/redis'
import { ensureStorageDir } from './services/storage'
import { startStatsScheduler } from './services/statsScheduler'

ensureStorageDir()

const app = createApp()

/** 绑定 0.0.0.0：小程序调试常用 127.0.0.1 直连，避免只监听 IPv6 导致连接被拒 */
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.info(`[server] listening on http://127.0.0.1:${env.PORT} (${env.NODE_ENV})`)
})

/** 依赖预热失败不阻塞启动，便于本地只跑 API 骨架 */
async function warmup() {
  try {
    await getPrisma().$connect()
    console.info('[db] prisma connected')
    // 每日 01:00 聚合前一日指标（E13-02）；重复调用无副作用
    startStatsScheduler()
  } catch (error) {
    console.warn(`[db] 连接跳过（E2-01 生成 Client 后生效）：${(error as Error).message}`)
  }

  try {
    await redis.connect()
    console.info('[redis] connected')
  } catch (error) {
    console.warn(`[redis] 连接跳过：${(error as Error).message}`)
  }
}

void warmup()

async function shutdown(signal: string) {
  console.info(`[server] 收到 ${signal}，正在退出...`)
  server.close()
  try {
    await getPrisma().$disconnect()
  } catch {
    // 未生成 Client 时无需断开
  }
  redis.disconnect()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection', reason)
})
