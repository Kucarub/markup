import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { isProd } from '../config/env'
import { AppError } from '../utils/errors'
import { ErrorCode } from '../utils/response'

/** 未匹配到任何路由 */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.fail(ErrorCode.NOT_FOUND, `接口不存在: ${req.method} ${req.originalUrl}`)
}

/** 全局异常处理：zod 校验错误 → 400；业务异常 → 对应业务码；其余 → 500 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.fail(
      ErrorCode.VALIDATION_FAILED,
      '参数校验失败',
      err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    )
    return
  }

  if (err instanceof AppError) {
    res.fail(err.code, err.message, err.details)
    return
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.fail(ErrorCode.INVALID_JSON, '请求体不是合法 JSON')
    return
  }

  console.error(`[error] trace=${req.traceId}`, err)
  const message = err instanceof Error ? err.message : '未知错误'
  res.fail(ErrorCode.INTERNAL_ERROR, isProd ? '服务内部错误，请稍后重试' : message)
}
