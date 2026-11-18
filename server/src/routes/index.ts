import { Router } from 'express'
import { adminAuthRouter } from './admin/auth'
import { authRouter } from './auth'
import { healthRouter } from './health'
import { fileRouter } from './upload'

/** /api 路由汇总：后续按附录 B 逐个挂载 artist / schedule / order 等子路由 */
export const apiRouter = Router()

apiRouter.use(healthRouter)
apiRouter.use(authRouter)
apiRouter.use(adminAuthRouter)
apiRouter.use(fileRouter)
