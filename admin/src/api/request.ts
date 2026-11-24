import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

const TOKEN_KEY = 'admin_token'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  traceId?: string
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
  timeout: 15000,
})

instance.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

instance.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>
    if (body && body.code === 0) {
      // 拦截器统一解包 data；调用方通过 http.* 的泛型声明还原真实类型
      return body.data as unknown as typeof response
    }
    ElMessage.error(body?.message || '请求失败')
    return Promise.reject(new Error(body?.message || '请求失败'))
  },
  (error) => {
    const status = error.response?.status as number | undefined
    const message = (error.response?.data as ApiResponse<unknown> | undefined)?.message

    if (status === 401) {
      clearToken()
      ElMessage.error(message || '登录已失效，请重新登录')
      const redirect = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.href = `/login?redirect=${redirect}`
    } else {
      ElMessage.error(message || error.message || '网络异常，请稍后重试')
    }
    return Promise.reject(error)
  },
)

/** 统一返回 data 的请求方法，业务层无需再解包 */
export const http = {
  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return instance.get(url, { params }) as unknown as Promise<T>
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.post(url, data, config) as unknown as Promise<T>
  },
  put<T>(url: string, data?: unknown): Promise<T> {
    return instance.put(url, data) as unknown as Promise<T>
  },
  delete<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return instance.delete(url, { params }) as unknown as Promise<T>
  },
}
