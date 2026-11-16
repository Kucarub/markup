import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { httpStatusOf } from '../utils/response'

/** 注入 traceId 与 res.ok / res.fail，保证所有接口响应结构一致 */
export const attachResponse: RequestHandler = (req, res, next) => {
  const traceId = req.header('x-request-id') ?? randomUUID()
  req.traceId = traceId
  res.setHeader('x-request-id', traceId)

  res.ok = (data = null, message = 'ok') => {
    res.status(200).json({ code: 0, message, data, traceId })
  }

  res.fail = (code, message, details) => {
    res.status(httpStatusOf(code)).json({
      code,
      message,
      data: details ?? null,
      traceId,
    })
  }

  next()
}
