import 'express'

declare global {
  namespace Express {
    interface Request {
      traceId: string
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
