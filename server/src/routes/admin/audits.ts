import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getPrisma } from '../../lib/prisma'
import { ADMIN_ALL, requireAdminRole } from '../../middlewares/adminRole'
import { requireAuth } from '../../middlewares/auth'
import { buildSignedPath } from '../../services/storage'
import { asyncHandler } from '../../utils/asyncHandler'
import { decryptAndMask, decryptSensitive, maskIdCard } from '../../utils/crypto'
import { AppError } from '../../utils/errors'
import { pageResult, paginationSchema } from '../../utils/pagination'
import { buildXlsx } from '../../utils/xlsx'

/**
 * 化妆师审核（E4-06 / E12-02 / E12-03 / E12-10）。
 * - 列表：状态筛选 + 关键字搜索 + 分页，待审核（auditAt 为空）排在最前；
 * - 详情：材料与作品预览、身份证脱敏；解密查看明文会写 audit_log 留痕；
 * - 状态流转仅允许 pending → approved / rejected，驳回原因必填；
 * - 批量通过/驳回与 xlsx 导出供运营提效。
 */
export const adminAuditRouter = Router()

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })
const rejectSchema = z.object({ reason: z.string().trim().min(2, '请填写驳回原因').max(255) })

const listQuery = paginationSchema.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'disabled']).optional(),
  keyword: z.string().trim().max(32).optional(),
  city: z.string().trim().max(32).optional(),
})

const batchBody = z
  .object({
    ids: z.array(z.coerce.number().int().positive()).min(1, '请选择要处理的对象').max(50),
    action: z.enum(['approve', 'reject'], { message: '批量操作类型不合法' }),
    reason: z.string().trim().max(255).optional(),
  })
  .refine((value) => value.action !== 'reject' || (value.reason?.length ?? 0) >= 2, {
    message: '批量驳回需填写原因',
    path: ['reason'],
  })

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  disabled: '已停用',
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value.filter((item) => typeof item === 'string') as string[]) : []
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return ''
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`
}

/** 状态流转：仅 pending 可操作，事务内写 audit_log */
async function transition(
  artistId: number,
  action: 'approve' | 'reject',
  operatorId: number,
  reason: string | null,
) {
  const prisma = getPrisma()
  return prisma.$transaction(async (tx) => {
    const artist = await tx.artist.findUnique({ where: { id: artistId } })
    if (!artist) throw AppError.notFound('入驻申请不存在')
    if (artist.status !== 'pending') {
      throw AppError.conflict(
        `当前状态为 ${artist.status}，仅待审核状态可${action === 'approve' ? '通过' : '驳回'}`,
      )
    }

    const updated = await tx.artist.update({
      where: { id: artistId },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        rejectReason: reason,
        auditAt: new Date(),
      },
    })

    await tx.auditLog.create({
      data: { targetType: 'artist', targetId: artistId, action, reason, operatorId },
    })

    return updated
  })
}

/** 审核列表项：作品数 + 首图 + 脱敏手机号 */
async function toListItems(rows: Awaited<ReturnType<typeof queryArtists>>['list']) {
  return rows.map((artist) => ({
    id: artist.id,
    userId: artist.userId,
    name: artist.name,
    city: artist.city,
    district: artist.district,
    years: artist.years,
    styles: asStringArray(artist.styles),
    status: artist.status,
    statusLabel: STATUS_LABEL[artist.status] ?? artist.status,
    rejectReason: artist.rejectReason,
    submittedAt: artist.createdAt.toISOString(),
    auditAt: artist.auditAt ? artist.auditAt.toISOString() : null,
    worksCount: artist._count.portfolios,
    coverPath: artist.portfolios[0]
      ? buildSignedPath('/api/files/raw', artist.portfolios[0].url)
      : null,
    phoneMasked: artist.user.phoneCipher ? decryptAndMask(artist.user.phoneCipher) : null,
    accountStatus: artist.user.status,
  }))
}

function buildWhere(query: z.infer<typeof listQuery>): Prisma.ArtistWhereInput {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.city ? { city: query.city } : {}),
    ...(query.keyword
      ? {
          OR: [
            { name: { contains: query.keyword } },
            { city: { contains: query.keyword } },
            { district: { contains: query.keyword } },
          ],
        }
      : {}),
  }
}

function queryArtists(where: Prisma.ArtistWhereInput, page: number, size: number) {
  const prisma = getPrisma()
  return Promise.all([
    prisma.artist.findMany({
      where,
      include: {
        user: { select: { phoneCipher: true, status: true } },
        portfolios: {
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
          take: 1,
          select: { url: true },
        },
        _count: { select: { portfolios: true } },
      },
      // auditAt 为空的即待审核，MySQL 升序 NULL 在前；其余按提交时间倒序
      orderBy: [{ auditAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.artist.count({ where }),
  ]).then(([list, total]) => ({ list, total }))
}

/** 审核列表（E12-02） */
adminAuditRouter.get(
  '/admin/audits/artists',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()
    const where = buildWhere(query)
    const baseWhere = buildWhere({ ...query, status: undefined })

    const [{ list, total }, grouped] = await Promise.all([
      queryArtists(where, query.page, query.size),
      prisma.artist.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
    ])

    const counts = { all: 0, pending: 0, approved: 0, rejected: 0, disabled: 0 }
    grouped.forEach((item) => {
      if (item.status in counts) {
        counts[item.status as keyof typeof counts] = item._count._all
      }
      counts.all += item._count._all
    })

    res.ok({ ...pageResult(await toListItems(list), total, query), counts })
  }),
)

/** 审核列表导出（E12-10）：字段与列表一致，UTF-8 + inlineStr 保证中文不乱码 */
adminAuditRouter.get(
  '/admin/audits/artists/export',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query)
    const prisma = getPrisma()
    const where = buildWhere(query)

    const [artists, dicts] = await Promise.all([
      prisma.artist.findMany({
        where,
        include: { user: { select: { phoneCipher: true } } },
        orderBy: [{ auditAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: 2000,
      }),
      prisma.dictItem.findMany({ where: { type: 'style' }, select: { code: true, label: true } }),
    ])
    const styleLabel = new Map(dicts.map((item) => [item.code, item.label]))

    const rows = artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      city: artist.city,
      district: artist.district ?? '',
      years: artist.years,
      styles: asStringArray(artist.styles)
        .map((code) => styleLabel.get(code) ?? code)
        .join('/'),
      status: STATUS_LABEL[artist.status] ?? artist.status,
      submittedAt: formatDateTime(artist.createdAt),
      auditAt: formatDateTime(artist.auditAt),
      rejectReason: artist.rejectReason ?? '',
      phone: artist.user.phoneCipher ? decryptAndMask(artist.user.phoneCipher) : '',
    }))

    const file = buildXlsx('化妆师审核', [
      { key: 'id', title: '编号', width: 8 },
      { key: 'name', title: '姓名', width: 14 },
      { key: 'city', title: '城市', width: 12 },
      { key: 'district', title: '区域', width: 14 },
      { key: 'years', title: '从业年限', width: 10 },
      { key: 'styles', title: '擅长风格', width: 22 },
      { key: 'status', title: '审核状态', width: 10 },
      { key: 'submittedAt', title: '提交时间', width: 18 },
      { key: 'auditAt', title: '审核时间', width: 18 },
      { key: 'rejectReason', title: '驳回原因', width: 30 },
      { key: 'phone', title: '手机号', width: 16 },
    ], rows)

    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    res.setHeader(
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader('content-disposition', `attachment; filename="artists-${day}.xlsx"`)
    res.send(file)
  }),
)

/** 化妆师下拉选项（E12-07 代响应选人） */
adminAuditRouter.get(
  '/admin/artists/options',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const { keyword } = z.object({ keyword: z.string().trim().max(32).optional() }).parse(req.query)
    const artists = await getPrisma().artist.findMany({
      where: {
        status: 'approved',
        ...(keyword
          ? { OR: [{ name: { contains: keyword } }, { city: { contains: keyword } }] }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: 50,
      select: { id: true, name: true, city: true, district: true, years: true },
    })
    res.ok({ list: artists })
  }),
)

/** 审核详情（E12-03）：材料预览 + 身份证脱敏 + 操作流水 */
adminAuditRouter.get(
  '/admin/audits/artists/:id',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const { id } = paramsSchema.parse(req.params)
    const prisma = getPrisma()
    const artist = await prisma.artist.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            phoneCipher: true,
            status: true,
            createdAt: true,
            lastLoginAt: true,
          },
        },
        portfolios: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
      },
    })
    if (!artist) throw AppError.notFound('入驻申请不存在')

    const keys = artist.portfolios.map((item) => item.url)
    const files = keys.length
      ? await prisma.fileObject.findMany({
          where: { objectKey: { in: keys } },
          select: { id: true, objectKey: true },
        })
      : []
    const fileIdByKey = new Map(files.map((file) => [file.objectKey, file.id]))

    const logs = await prisma.auditLog.findMany({
      where: { targetType: 'artist', targetId: id },
      orderBy: { id: 'desc' },
      include: { operator: { select: { username: true } } },
    })

    res.ok({
      id: artist.id,
      userId: artist.userId,
      name: artist.name,
      city: artist.city,
      district: artist.district,
      years: artist.years,
      styles: asStringArray(artist.styles),
      intro: artist.intro,
      status: artist.status,
      statusLabel: STATUS_LABEL[artist.status] ?? artist.status,
      rejectReason: artist.rejectReason,
      auditAt: artist.auditAt,
      submittedAt: artist.createdAt,
      updatedAt: artist.updatedAt,
      idCardMasked: decryptAndMask(artist.idCardCipher, maskIdCard),
      hasIdCard: Boolean(artist.idCardCipher),
      user: {
        nickname: artist.user.nickname,
        avatarUrl: artist.user.avatarUrl,
        phoneMasked: artist.user.phoneCipher ? decryptAndMask(artist.user.phoneCipher) : null,
        status: artist.user.status,
        createdAt: artist.user.createdAt,
        lastLoginAt: artist.user.lastLoginAt,
      },
      works: artist.portfolios.map((item) => ({
        id: item.id,
        fileId: fileIdByKey.get(item.url) ?? null,
        type: item.type,
        title: item.title,
        styles: asStringArray(item.styles),
        status: item.status,
        path: buildSignedPath('/api/files/raw', item.url),
      })),
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        reason: log.reason,
        operator: log.operator.username,
        createdAt: log.createdAt,
      })),
    })
  }),
)

/** 解密查看身份证（E12-03）：二次确认由前端负责，服务端写 audit_log 留痕 */
adminAuditRouter.post(
  '/admin/audits/artists/:id/reveal',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const { id } = paramsSchema.parse(req.params)
    const prisma = getPrisma()
    const artist = await prisma.artist.findUnique({
      where: { id },
      select: { idCardCipher: true },
    })
    if (!artist) throw AppError.notFound('入驻申请不存在')
    if (!artist.idCardCipher) throw AppError.badRequest('该申请未提交身份证信息')

    let idCard = ''
    try {
      idCard = decryptSensitive(artist.idCardCipher)
    } catch {
      throw AppError.badRequest('身份证解密失败，请联系技术排查密钥配置')
    }

    await prisma.auditLog.create({
      data: {
        targetType: 'artist',
        targetId: id,
        action: 'reveal',
        reason: '查看身份证明文',
        operatorId: req.auth!.uid,
      },
    })

    res.ok({ idCard })
  }),
)

/** 批量通过/驳回（E12-10）：逐条独立事务，返回成功与失败明细 */
adminAuditRouter.post(
  '/admin/audits/artists/batch',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  asyncHandler(async (req, res) => {
    const input = batchBody.parse(req.body)
    const ids = Array.from(new Set(input.ids))

    const success: number[] = []
    const failed: { id: number; message: string }[] = []
    for (const id of ids) {
      try {
        await transition(
          id,
          input.action,
          req.auth!.uid,
          input.action === 'reject' ? input.reason! : null,
        )
        success.push(id)
      } catch (error) {
        failed.push({ id, message: error instanceof Error ? error.message : '操作失败' })
      }
    }

    res.ok({ success, failed, total: ids.length })
  }),
)

const approveHandler = asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params)
  const artist = await transition(id, 'approve', req.auth!.uid, null)
  res.ok({ id: artist.id, status: artist.status, auditAt: artist.auditAt })
})

const rejectHandler = asyncHandler(async (req, res) => {
  const { id } = paramsSchema.parse(req.params)
  const { reason } = rejectSchema.parse(req.body)
  const artist = await transition(id, 'reject', req.auth!.uid, reason)
  res.ok({ id: artist.id, status: artist.status, auditAt: artist.auditAt, rejectReason: reason })
})

adminAuditRouter.post(
  '/admin/audits/artists/:id/approve',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  approveHandler,
)

adminAuditRouter.post(
  '/admin/audits/artists/:id/reject',
  requireAuth('admin'),
  requireAdminRole(...ADMIN_ALL),
  rejectHandler,
)
