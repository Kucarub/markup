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
  CONFLICT: 40900,
  FILE_TOO_LARGE: 41301,
  UNSUPPORTED_MEDIA_TYPE: 41500,
  ACCOUNT_LOCKED: 42301,
  TOO_MANY_REQUESTS: 42900,
  INTERNAL_ERROR: 50000,
} as const

/** 业务码 → HTTP 状态码：显式映射在前，未命中的按区间兜底 */
const STATUS_MAP: Record<number, number> = {
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.FILE_TOO_LARGE]: 413,
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: 415,
  [ErrorCode.ACCOUNT_LOCKED]: 423,
  [ErrorCode.TOO_MANY_REQUESTS]: 429,
}

export function httpStatusOf(code: number): number {
  if (STATUS_MAP[code]) return STATUS_MAP[code]
  if (code >= 50000) return 500
  if (code >= 40400) return 404
  if (code >= 40300) return 403
  if (code >= 40100) return 401
  if (code >= 40000) return 400
  return 200
}
