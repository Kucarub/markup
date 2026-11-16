import { Router } from 'express'
import { healthRouter } from './health'

/** /api 路由汇总：后续按附录 B 逐个挂载 auth / artist / schedule / order 等子路由 */
export const apiRouter = Router()

apiRouter.use(healthRouter)
