import { Router } from 'express'
import { adminAuditLogRouter } from './admin/auditLogs'
import { adminAuditRouter } from './admin/audits'
import { adminAuthRouter } from './admin/auth'
import { adminDemandRouter } from './admin/demands'
import { adminPortfolioRouter } from './admin/portfolios'
import { adminReportRouter } from './admin/reports'
import { adminServiceOrderRouter } from './admin/serviceOrders'
import { adminStatsRouter } from './admin/stats'
import { adminUserRouter } from './admin/users'
import { artistRouter } from './artist'
import { authRouter } from './auth'
import { customerRouter } from './customer'
import { demandRouter } from './demand'
import { creditRouter } from './credit'
import { eventRouter } from './events'
import { healthRouter } from './health'
import { notificationRouter } from './notification'
import { portfolioRouter } from './portfolio'
import { reportRouter } from './report'
import { reviewRouter } from './review'
import { scheduleRouter } from './schedule'
import { searchRouter } from './search'
import { serviceOrderRouter } from './serviceOrder'
import { subscriptionRouter } from './subscription'
import { wechatCallbackRouter } from './wechat'
import { fileRouter } from './upload'

/** /api 路由汇总：后续按附录 B 逐个挂载 schedule / order 等子路由 */
export const apiRouter = Router()

apiRouter.use(healthRouter)
apiRouter.use(authRouter)
apiRouter.use(adminAuthRouter)
apiRouter.use(adminAuditRouter)
apiRouter.use(adminUserRouter)
apiRouter.use(adminDemandRouter)
apiRouter.use(adminServiceOrderRouter)
apiRouter.use(adminPortfolioRouter)
apiRouter.use(adminReportRouter)
apiRouter.use(adminAuditLogRouter)
apiRouter.use(adminStatsRouter)
apiRouter.use(artistRouter)
apiRouter.use(portfolioRouter)
apiRouter.use(scheduleRouter)
apiRouter.use(customerRouter)
apiRouter.use(demandRouter)
apiRouter.use(serviceOrderRouter)
apiRouter.use(reviewRouter)
apiRouter.use(creditRouter)
apiRouter.use(subscriptionRouter)
apiRouter.use(notificationRouter)
apiRouter.use(searchRouter)
apiRouter.use(reportRouter)
apiRouter.use(eventRouter)
apiRouter.use(wechatCallbackRouter)
apiRouter.use(fileRouter)
