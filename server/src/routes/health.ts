import { Router } from 'express'
import { env } from '../config/env'

export const healthRouter = Router()

/** 健康检查：不依赖 MySQL/Redis，用于部署探活与前端联调 */
healthRouter.get('/ping', (_req, res) => {
  res.ok({
    service: 'wechat-markup-api',
    version: '0.1.0',
    env: env.NODE_ENV,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})
