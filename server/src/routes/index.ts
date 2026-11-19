import { Router } from 'express'
import { adminAuditRouter } from './admin/audits'
import { adminAuthRouter } from './admin/auth'
import { adminStatsRouter } from './admin/stats'
import { artistRouter } from './artist'
import { authRouter } from './auth'
import { healthRouter } from './health'
import { portfolioRouter } from './portfolio'
import { fileRouter } from './upload'

/** /api 路由汇总：后续按附录 B 逐个挂载 schedule / order 等子路由 */
export const apiRouter = Router()

apiRouter.use(healthRouter)
apiRouter.use(authRouter)
apiRouter.use(adminAuthRouter)
apiRouter.use(adminAuditRouter)
apiRouter.use(adminStatsRouter)
apiRouter.use(artistRouter)
apiRouter.use(portfolioRouter)
apiRouter.use(fileRouter)
