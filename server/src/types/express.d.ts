import 'express'
import type { TokenClaims } from '../utils/jwt'

declare global {
  namespace Express {
    interface Request {
      traceId: string
      /** requireAuth 注入的登录态；未鉴权接口为 undefined */
      auth?: TokenClaims
    }

    interface Response {
      /** 成功响应：{ code: 0, message, data, traceId } */
      ok: (data?: unknown, message?: string) => void
      /** 失败响应：按业务码映射 HTTP 状态码 */
      fail: (code: number, message: string, details?: unknown) => void
    }
  }
}

export {}
