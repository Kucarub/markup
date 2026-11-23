import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { corsOrigins, isProd } from './config/env'
import { mockRouter } from './docs/mock'
import { docsRouter } from './docs/router'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler'
import { requestLogger } from './middlewares/requestLogger'
import { attachResponse } from './middlewares/response'
import { apiRouter } from './routes'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  // 生产部署在 Nginx 之后：信任一层代理，才能用 X-Forwarded-Proto 还原 https 与客户端 IP
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  )
  // attachResponse 必须早于 body 解析：JSON 解析失败时也要有 res.fail
  app.use(attachResponse)
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  app.use(requestLogger)

  app.use('/api', apiRouter)
  app.use(docsRouter)
  if (!isProd) app.use('/mock', mockRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
