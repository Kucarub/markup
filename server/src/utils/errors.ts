import { ErrorCode } from './response'

/** 可预期的业务异常，由全局异常处理器转换为统一响应体 */
export class AppError extends Error {
  readonly code: number
  readonly details?: unknown

  constructor(code: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }

  static badRequest(message = '请求参数有误', details?: unknown) {
    return new AppError(ErrorCode.VALIDATION_FAILED, message, details)
  }

  static unauthorized(message = '登录已失效，请重新登录') {
    return new AppError(ErrorCode.UNAUTHORIZED, message)
  }

  static forbidden(message = '没有操作权限') {
    return new AppError(ErrorCode.FORBIDDEN, message)
  }

  static notFound(message = '资源不存在') {
    return new AppError(ErrorCode.NOT_FOUND, message)
  }
}
