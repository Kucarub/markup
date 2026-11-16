import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'

/**
 * 懒加载单例：避免 tsx watch 热重载时重复创建连接池。
 * E1 阶段 schema 还没有模型，Prisma Client 尚未生成；
 * 调用方（启动预热 / 业务服务）自行处理异常，不阻塞 API 骨架启动。
 * E2-01 补齐 13 张表并执行 `prisma generate` 后即为可用客户端。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })
  }
  return globalForPrisma.prisma
}
