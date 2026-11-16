import type { RequestHandler } from 'express'

/** 简易请求日志：方法、路径、状态码、耗时 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const costMs = Number(process.hrtime.bigint() - start) / 1e6
    console.info(
      `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${costMs.toFixed(1)}ms trace=${req.traceId}`,
    )
  })
  next()
}
