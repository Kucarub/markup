import Redis from 'ioredis'
import { env } from '../config/env'

/**
 * HTTP 层共用连接。lazyConnect：首次命令时才建连，
 * 本机未启动 Redis 也不阻塞服务启动（E1 骨架阶段仅验证连通性）。
 */
const globalForRedis = globalThis as unknown as { redis?: Redis }

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    // 本地未启动 Redis 时最多重试 3 次后放弃，避免日志刷屏
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
  })

redis.on('error', (err: Error) => {
  console.warn(`[redis] ${err.message}`)
})

if (env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}
