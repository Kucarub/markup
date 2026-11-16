import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { corsOrigins } from './config/env'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler'
import { requestLogger } from './middlewares/requestLogger'
import { attachResponse } from './middlewares/response'
import { apiRouter } from './routes'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  app.use(attachResponse)
  app.use(requestLogger)

  app.use('/api', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
