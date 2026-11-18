import type { RequestHandler } from 'express'

/**
 * Express 4 不会自动捕获 async handler 的 reject，
 * 统一包裹后交给全局 errorHandler，避免 unhandledRejection。
 */
export function asyncHandler<T extends RequestHandler>(fn: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
