import { z } from 'zod'

/** 列表接口统一分页入参：page 从 1 开始，size 上限 100 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationInput = z.infer<typeof paginationSchema>

export interface PageResult<T> {
  total: number
  list: T[]
  page: number
  size: number
}

/** 分页入参 → Prisma 的 skip/take */
export function toPageArgs({ page, size }: PaginationInput) {
  return { skip: (page - 1) * size, take: size }
}

/** 统一分页响应体：total / list / page / size（E2-03 约定） */
export function pageResult<T>(
  list: T[],
  total: number,
  { page, size }: PaginationInput,
): PageResult<T> {
  return { total, list, page, size }
}
