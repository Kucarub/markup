/**
 * 统一响应体与错误码约定。
 * 业务码规则：400xx 参数、401xx 鉴权、403xx 权限、404xx 资源、5xxxx 系统。
 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T | null
  traceId?: string
}

export const ErrorCode = {
  VALIDATION_FAILED: 40001,
  INVALID_JSON: 40002,
  UNAUTHORIZED: 40100,
  TOKEN_EXPIRED: 40101,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  INTERNAL_ERROR: 50000,
} as const

/** 业务码 → HTTP 状态码（未命中时按 500 处理） */
export function httpStatusOf(code: number): number {
  if (code >= 50000) return 500
  if (code >= 40400) return 404
  if (code >= 40300) return 403
  if (code >= 40100) return 401
  if (code >= 40000) return 400
  return 200
}
