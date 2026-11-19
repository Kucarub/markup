import { Router, type Request } from 'express'
import { z } from 'zod'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import { buildSignedPath } from '../services/storage'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'
import { extractBearerToken, verifyToken, type TokenRole } from '../utils/jwt'
import { pageResult, paginationSchema } from '../utils/pagination'

/**
 * 作品管理（E5-01 / E5-02 / E5-03）。
 * - 列表按 sort 升序，与首页瀑布流顺序一致；
 * - 写操作全部按 artistId 隔离，越权一律 404；
 * - 删除后自动重排 sort，保证序号连续。
 */
export const portfolioRouter = Router()

const MIN_IMAGES = 6

const idParam = z.object({ id: z.coerce.number().int().positive('作品不存在') })

const styleArray = z.array(z.string().trim().min(1).max(32)).max(8)

const createSchema = z.object({
  fileId: z.coerce.number().int().positive('作品文件不合法'),
  title: z.string().trim().max(64).optional(),
  styles: styleArray.optional(),
})

const updateSchema = z
  .object({
    title: z.string().trim().min(1, '标题不能为空').max(64).optional(),
    styles: styleArray.optional(),
    move: z.enum(['up', 'down']).optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.styles !== undefined || value.move !== undefined,
    { message: '没有需要更新的内容' },
  )

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value.filter((item) => typeof item === 'string') as string[]) : []
}

function optionalClaims(req: Request): { uid: number; role: TokenRole } | null {
  try {
    return verifyToken(extractBearerToken(req.header('authorization')), 'access')
  } catch {
    return null
  }
}

/** 当前登录化妆师的 artist 记录；未入驻 / 停用直接拒绝 */
async function currentArtist(userId: number) {
  const artist = await getPrisma().artist.findUnique({ where: { userId } })
  if (!artist) throw AppError.notFound('尚未提交入驻申请')
  if (artist.status === 'disabled') throw AppError.forbidden('账号已停用，请联系平台')
  return artist
}

interface PortfolioRow {
  id: number
  artistId: number
  type: string
  url: string
  title: string
  styles: unknown
  sort: number
  status: string
  createdAt: Date
}

function toListItem(item: PortfolioRow, fileIdByKey: Map<string, number>) {
  return {
    id: item.id,
    fileId: fileIdByKey.get(item.url) ?? null,
    type: item.type,
    title: item.title,
    styles: asStringArray(item.styles),
    sort: item.sort,
    status: item.status,
    createdAt: item.createdAt,
    // 私有桶：签名 15 分钟有效，前端需拼接接口域名
    path: buildSignedPath('/api/files/raw', item.url),
  }
}

async function withFileIds(items: PortfolioRow[]) {
  const keys = items.map((item) => item.url)
  const files = keys.length
    ? await getPrisma().fileObject.findMany({
        where: { objectKey: { in: keys } },
        select: { id: true, objectKey: true },
      })
    : []
  const fileIdByKey = new Map(files.map((file) => [file.objectKey, file.id]))
  return items.map((item) => toListItem(item, fileIdByKey))
}

/**
 * 作品列表（E5-02 / E5-07）：分页返回，已通过审核对所有人可见；
 * 待审核 / 驳回仅本人或管理员可查看。
 */
portfolioRouter.get(
  '/artist/:id/portfolios',
  asyncHandler(async (req, res) => {
    const { id: artistId } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const pagination = paginationSchema.parse(req.query)
    const prisma = getPrisma()

    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { userId: true, status: true },
    })
    if (!artist) throw AppError.notFound('化妆师不存在')

    const claims = optionalClaims(req)
    const canPreview =
      claims &&
      (claims.role === 'admin' || (claims.role === 'artist' && claims.uid === artist.userId))
    if (artist.status !== 'approved' && !canPreview) {
      throw AppError.notFound('化妆师不存在或尚未通过审核')
    }

    const [total, items, counts] = await Promise.all([
      prisma.artistPortfolio.count({ where: { artistId } }),
      prisma.artistPortfolio.findMany({
        where: { artistId },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        skip: (pagination.page - 1) * pagination.size,
        take: pagination.size,
      }),
      prisma.artistPortfolio.groupBy({
        by: ['type'],
        where: { artistId },
        _count: { _all: true },
      }),
    ])

    const countByType = new Map(counts.map((item) => [item.type, item._count._all]))
    res.ok({
      ...pageResult(await withFileIds(items), total, pagination),
      counts: {
        image: countByType.get('image') || 0,
        video: countByType.get('video') || 0,
        minImages: MIN_IMAGES,
      },
    })
  }),
)

/** 新增作品（E5-01 / E5-03）：追加到列表末尾 */
portfolioRouter.post(
  '/portfolio',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body)
    const prisma = getPrisma()
    const artist = await currentArtist(req.auth!.uid)

    const file = await prisma.fileObject.findUnique({ where: { id: input.fileId } })
    if (
      !file ||
      file.userId !== req.auth!.uid ||
      file.scene !== 'portfolio' ||
      file.status !== 'uploaded'
    ) {
      throw AppError.badRequest('作品文件不存在或尚未上传完成')
    }

    const aggregate = await prisma.artistPortfolio.aggregate({
      where: { artistId: artist.id },
      _max: { sort: true },
      _count: { _all: true },
    })
    const total = aggregate._count._all
    const nextSort = total ? (aggregate._max.sort ?? 0) + 1 : 0

    const created = await prisma.artistPortfolio.create({
      data: {
        artistId: artist.id,
        type: file.mimeType.startsWith('video/') ? 'video' : 'image',
        url: file.objectKey,
        title: input.title || `作品 ${total + 1}`,
        styles: input.styles,
        sort: nextSort,
        status: 'pending',
      },
    })

    res.ok(toListItem(created, new Map([[created.url, file.id]])))
  }),
)

/**
 * 编辑作品（E5-02）：
 * - title / styles 直接更新；
 * - move=up|down 与相邻作品交换 sort，结果同步到首页瀑布流。
 */
portfolioRouter.put(
  '/portfolio/:id',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params)
    const input = updateSchema.parse(req.body)
    const prisma = getPrisma()
    const artist = await currentArtist(req.auth!.uid)

    const current = await prisma.artistPortfolio.findFirst({ where: { id, artistId: artist.id } })
    if (!current) throw AppError.notFound('作品不存在')

    if (input.move) {
      const siblings = await prisma.artistPortfolio.findMany({
        where: { artistId: artist.id },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        select: { id: true },
      })
      const index = siblings.findIndex((item) => item.id === id)
      const target = input.move === 'up' ? index - 1 : index + 1
      const neighbor = siblings[target]
      if (!neighbor || target < 0) {
        res.ok({ moved: false })
        return
      }
      await prisma.$transaction([
        prisma.artistPortfolio.update({ where: { id }, data: { sort: target } }),
        prisma.artistPortfolio.update({ where: { id: neighbor.id }, data: { sort: index } }),
      ])
      res.ok({ moved: true })
      return
    }

    const updated = await prisma.artistPortfolio.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.styles !== undefined ? { styles: input.styles } : {}),
      },
    })
    const [item] = await withFileIds([updated])
    res.ok(item)
  }),
)

/** 删除作品（E5-02 / E5-03）：二次确认由前端负责，删除后重排 sort */
portfolioRouter.delete(
  '/portfolio/:id',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params)
    const prisma = getPrisma()
    const artist = await currentArtist(req.auth!.uid)

    const current = await prisma.artistPortfolio.findFirst({ where: { id, artistId: artist.id } })
    if (!current) throw AppError.notFound('作品不存在')

    const total = await prisma.$transaction(async (tx) => {
      await tx.artistPortfolio.delete({ where: { id } })
      const remaining = await tx.artistPortfolio.findMany({
        where: { artistId: artist.id },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        select: { id: true, sort: true },
      })
      for (let index = 0; index < remaining.length; index += 1) {
        const item = remaining[index]
        if (item && item.sort !== index) {
          await tx.artistPortfolio.update({
            where: { id: item.id },
            data: { sort: index },
          })
        }
      }
      return remaining.length
    })

    res.ok({ deleted: true, total })
  }),
)
