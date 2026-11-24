import axios from 'axios'
import { getToken, http } from './request'

/** 后台 E12 接口封装：统一返回解包后的 data */

export interface PageResult<T> {
  total: number
  page: number
  size: number
  list: T[]
  counts?: Record<string, number>
}

export interface PageQuery {
  page?: number
  size?: number
}

export interface AuditArtistItem {
  id: number
  userId: number
  name: string
  city: string
  district: string | null
  years: number
  styles: string[]
  status: 'pending' | 'approved' | 'rejected' | 'disabled'
  statusLabel: string
  rejectReason: string | null
  submittedAt: string
  auditAt: string | null
  worksCount: number
  coverPath: string | null
  phoneMasked: string | null
  accountStatus: string
}

export interface AuditArtistDetail extends Omit<AuditArtistItem, 'worksCount' | 'coverPath'> {
  intro: string | null
  idCardMasked: string
  hasIdCard: boolean
  submittedAt: string
  updatedAt: string
  user: {
    nickname: string | null
    avatarUrl: string | null
    phoneMasked: string | null
    status: string
    createdAt: string
    lastLoginAt: string | null
  }
  works: {
    id: number
    fileId: number | null
    type: string
    title: string
    styles: string[]
    status: string
    path: string
  }[]
  logs: {
    id: number
    action: string
    reason: string | null
    operator: string
    createdAt: string
  }[]
}

export interface AdminUserItem {
  userId: number
  nickname: string | null
  role: 'artist' | 'customer'
  status: 'active' | 'disabled'
  phoneMasked: string | null
  createdAt: string
  lastLoginAt: string | null
  credit: { score: number; level: string } | null
  artist: { id: number; name: string; city: string; status: string; auditAt: string | null } | null
  customer: { id: number; nickname: string | null; city: string | null; status: string } | null
}

export interface AdminDemandItem {
  id: number
  city: string
  district: string
  serviceDate: string
  serviceType: string
  headcount: number
  budgetMin: number
  budgetMax: number
  status: 'pending' | 'selected' | 'closed'
  source: 'customer' | 'ops'
  customer: { id: number; nickname: string | null; city: string | null }
  targetArtist: { id: number; name: string } | null
  responseCount: number
  selectedArtist: { id: number; name: string } | null
  expireAt: string | null
  closedAt: string | null
  declineReason: string | null
  createdAt: string
}

export interface AdminServiceOrderItem {
  id: number
  demandId: number
  demandSource: 'customer' | 'ops'
  city: string
  district: string
  serviceDate: string
  serviceType: string
  headcount: number
  status: 'pending' | 'confirmed' | 'finished' | 'cancelled'
  initiatorRole: 'artist' | 'customer'
  confirmedAt: string | null
  finishTime: string | null
  cancelBy: string | null
  cancelReason: string | null
  createdAt: string
  customer: { id: number; nickname: string | null; userId: number }
  artist: { id: number; name: string; city: string; userId: number }
}

export interface AdminPortfolioItem {
  id: number
  artistId: number
  type: string
  title: string
  styles: string[]
  sort: number
  status: 'pending' | 'online' | 'offline' | 'rejected'
  createdAt: string
  path: string
  artist: { id: number; name: string; city: string; status: string }
}

export interface AuditLogItem {
  id: number
  targetType: 'artist' | 'portfolio' | 'user' | 'report'
  targetId: number
  action: string
  reason: string | null
  operator: { id: number; username: string; role: string }
  createdAt: string
}

type Query = Record<string, unknown>

/** 化妆师审核列表（E12-02） */
export function fetchArtistAudits(params: Query) {
  return http.get<PageResult<AuditArtistItem>>('/api/admin/audits/artists', params)
}

/** 化妆师审核详情（E12-03） */
export function fetchArtistAuditDetail(id: number | string) {
  return http.get<AuditArtistDetail>(`/api/admin/audits/artists/${id}`)
}

/** 解密查看身份证（E12-03）：服务端写 audit_log */
export function revealArtistIdCard(id: number | string) {
  return http.post<{ idCard: string }>(`/api/admin/audits/artists/${id}/reveal`)
}

/** 审核通过 / 驳回（E12-03） */
export function approveArtist(id: number, reason?: string) {
  return http.post(`/api/admin/audits/artists/${id}/approve`, reason ? { reason } : undefined)
}
export function rejectArtist(id: number, reason: string) {
  return http.post(`/api/admin/audits/artists/${id}/reject`, { reason })
}

/** 批量通过 / 驳回（E12-10） */
export function batchAuditArtists(payload: { ids: number[]; action: 'approve' | 'reject'; reason?: string }) {
  return http.post<{ success: number[]; failed: { id: number; message: string }[]; total: number }>(
    '/api/admin/audits/artists/batch',
    payload,
  )
}

/** 已通过化妆师下拉（E12-07） */
export function fetchArtistOptions(keyword?: string) {
  return http.get<{ list: { id: number; name: string; city: string; district: string | null; years: number }[] }>(
    '/api/admin/artists/options',
    keyword ? { keyword } : undefined,
  )
}

/** 客户下拉（E12-07） */
export function fetchCustomerOptions(keyword?: string) {
  return http.get<{ list: { id: number; userId: number; nickname: string | null; city: string | null; district: string | null }[] }>(
    '/api/admin/customers/options',
    keyword ? { keyword } : undefined,
  )
}

/** 用户列表（E12-04） */
export function fetchUsers(params: Query) {
  return http.get<PageResult<AdminUserItem>>('/api/admin/users', params)
}

/** 封禁 / 解封（E12-04） */
export function setUserStatus(id: number, payload: { status: 'active' | 'disabled'; reason?: string }) {
  return http.post(`/api/admin/users/${id}/status`, payload)
}

/** 需求列表 / 详情（E12-05） */
export function fetchDemands(params: Query) {
  return http.get<PageResult<AdminDemandItem>>('/api/admin/demands', params)
}
export function fetchDemandDetail(id: number) {
  return http.get<{
    id: number
    city: string
    district: string
    serviceDate: string
    serviceType: string
    headcount: number
    budgetMin: number
    budgetMax: number
    stylePrefs: string[]
    remark: string | null
    status: string
    source: string
    declineReason: string | null
    createdAt: string
    customer: { id: number; userId: number; nickname: string | null; city: string | null; district: string | null; status: string }
    targetArtist: { id: number; name: string; city: string; status: string } | null
    serviceOrder: { id: number; status: string; createdAt: string } | null
    responses: {
      id: number
      status: string
      source: string
      note: string | null
      createdAt: string
      artist: { id: number; name: string; city: string; district: string | null; years: number }
    }[]
  }>(`/api/admin/demands/${id}`)
}

/** 运营代发布（E12-07） */
export function createOpsDemand(payload: Record<string, unknown>) {
  return http.post<AdminDemandItem>('/api/admin/demands', payload)
}

/** 运营代响应（E12-07） */
export function createOpsResponse(demandId: number, payload: { artistId: number; note?: string }) {
  return http.post(`/api/admin/demands/${demandId}/responses`, payload)
}

/** 服务记录列表 / 详情（E12-06） */
export function fetchServiceOrders(params: Query) {
  return http.get<PageResult<AdminServiceOrderItem>>('/api/admin/service-orders', params)
}
export function fetchServiceOrderDetail(id: number) {
  return http.get<Record<string, any>>(`/api/admin/service-orders/${id}`)
}

/** 作品列表 / 下架恢复（E12-08） */
export function fetchPortfolios(params: Query) {
  return http.get<PageResult<AdminPortfolioItem>>('/api/admin/portfolios', params)
}
export function setPortfolioStatus(id: number, payload: { action: 'offline' | 'restore'; reason?: string }) {
  return http.post<{ id: number; status: string }>(`/api/admin/portfolios/${id}/status`, payload)
}

/** 审核日志（E12-09） */
export function fetchAuditLogs(params: Query) {
  return http.get<PageResult<AuditLogItem>>('/api/admin/audit-logs', params)
}

/** 导出 xlsx：绕开统一响应拦截（响应体是二进制） */
export async function downloadArtistAudits(params: Query) {
  const res = await axios.get('/api/admin/audits/artists/export', {
    baseURL: import.meta.env.VITE_API_BASE || '',
    params,
    responseType: 'blob',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  const disposition = (res.headers['content-disposition'] as string | undefined) || ''
  const matched = /filename=\"?([^\";]+)\"?/.exec(disposition)
  const filename = matched ? matched[1] : 'artists.xlsx'
  const url = URL.createObjectURL(res.data as Blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const STATUS_OPTIONS = {
  audit: [
    { value: 'pending', label: '待审核' },
    { value: 'approved', label: '已通过' },
    { value: 'rejected', label: '已驳回' },
    { value: 'disabled', label: '已停用' },
  ],
  demand: [
    { value: 'pending', label: '待响应' },
    { value: 'selected', label: '已选定' },
    { value: 'closed', label: '已关闭' },
  ],
  order: [
    { value: 'pending', label: '待确认' },
    { value: 'confirmed', label: '已确认' },
    { value: 'finished', label: '已完成' },
    { value: 'cancelled', label: '已取消' },
  ],
  portfolio: [
    { value: 'pending', label: '待审核' },
    { value: 'online', label: '在线' },
    { value: 'offline', label: '已下架' },
    { value: 'rejected', label: '已驳回' },
  ],
} as const

export const SERVICE_TYPES = [
  { value: 'bridal', label: '新娘跟妆' },
  { value: 'daily', label: '日常妆' },
  { value: 'event', label: '活动妆' },
  { value: 'photo', label: '写真妆' },
] as const
