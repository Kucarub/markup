import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth'
import {
  getSubscribeOverview,
  recordSubscribeResults,
  type SubscribeStatus,
  type SubscribeTemplateKey,
} from '../services/subscription'
import { asyncHandler } from '../utils/asyncHandler'

/**
 * 订阅消息授权（E11-01）。
 * 小程序在入驻完成 / 首次发布需求 / 首次预约时读取 shouldPrompt，
 * wx.requestSubscribeMessage 回调后把每个模板的接受/拒绝结果回写。
 */
export const subscriptionRouter = Router()

const resultsBody = z.object({
  results: z
    .array(
      z.object({
        key: z.enum(['invitation', 'result'], { message: '模板标识不合法' }),
        status: z.enum(['accepted', 'rejected'], { message: '授权结果不合法' }),
      }),
    )
    .min(1, '至少提交 1 条授权结果')
    .max(2, '模板数量超出范围'),
})

/** 当前用户订阅模板状态（含是否应弹窗） */
subscriptionRouter.get(
  '/subscriptions',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.ok({ templates: await getSubscribeOverview(req.auth!.uid) })
  }),
)

/** 回写授权结果：接受后长期有效，拒绝后 7 天内不再提示 */
subscriptionRouter.post(
  '/subscriptions',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const input = resultsBody.parse(req.body)
    await recordSubscribeResults(
      req.auth!.uid,
      input.results as { key: SubscribeTemplateKey; status: SubscribeStatus }[],
    )
    res.ok({ templates: await getSubscribeOverview(req.auth!.uid) })
  }),
)
