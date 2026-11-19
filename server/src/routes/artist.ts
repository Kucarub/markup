import crypto from 'node:crypto'
import { Router, type Request } from 'express'
import { z } from 'zod'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import { buildSignedPath } from '../services/storage'
import { getUnlimitedQrCode } from '../services/wechat'
import { asyncHandler } from '../utils/asyncHandler'
import { decryptAndMask, decryptSensitive, encryptSensitive, maskIdCard } from '../utils/crypto'
import { AppError } from '../utils/errors'
import { extractBearerToken, verifyToken, type TokenRole } from '../utils/jwt'

/**
 * 化妆师入驻（E4-02 / E4-03 / E4-05）。
 * 状态机：pending → approved | rejected；rejected → pending（重新提审）。
 * 作品文件必须先走 /api/upload/sign + /api/files/upload 完成上传，再提交 fileId。
 */
export const artistRouter = Router()

const ID_CARD_RE = /^\d{17}[\dXx]$/
const MIN_IMAGES = 6

const workSchema = z.object({
  fileId: z.coerce.number().int().positive('作品文件不合法'),
  title: z.string().trim().max(64).optional(),
  styles: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
})

const applySchema = z.object({
  name: z.string().trim().min(2, '姓名至少 2 个字').max(32),
  city: z.string().trim().min(1, '请选择所在城市').max(32),
  district: z.string().trim().max(32).optional(),
  years: z.coerce.number().int('从业年限需为整数').min(0).max(60),
  styles: z
    .array(z.string().trim().min(1).max(32))
    .min(1, '至少选择 1 个擅长风格')
    .max(3, '最多选择 3 个擅长风格'),
  intro: z.string().trim().max(500, '自我介绍不超过 500 字').optional(),
  idCard: z.string().trim().regex(ID_CARD_RE, '身份证号需为 18 位'),
  works: z.array(workSchema).min(1, '请至少上传 6 张作品图片或 1 个作品视频'),
  agreed: z.boolean().refine((value) => value === true, '请先阅读并同意入驻协议'),
})

/** 编辑资料：身份证可不传（表示不修改），其余字段仍按表单全量提交 */
const updateSchema = applySchema.partial({ idCard: true })

type WorkInput = z.infer<typeof workSchema>

interface ResolvedWork {
  type: 'image' | 'video'
  objectKey: string
  title: string
  styles?: string[]
  sort: number
}

/** 校验作品文件归属与数量规则：≥6 张图片或 ≥1 个视频 */
async function resolveWorks(userId: number, works: WorkInput[]): Promise<ResolvedWork[]> {
  const files = await getPrisma().fileObject.findMany({
    where: { id: { in: works.map((work) => work.fileId) } },
  })
  const fileById = new Map(files.map((file) => [file.id, file]))

  for (const work of works) {
    const file = fileById.get(work.fileId)
    if (!file || file.userId !== userId || file.scene !== 'portfolio' || file.status !== 'uploaded') {
      throw AppError.badRequest(`作品文件不存在或尚未上传完成（fileId=${work.fileId}）`)
    }
  }

  const imageCount = works.filter((work) => fileById.get(work.fileId)!.mimeType.startsWith('image/')).length
  const videoCount = works.filter((work) => fileById.get(work.fileId)!.mimeType.startsWith('video/')).length
  if (imageCount < MIN_IMAGES && videoCount < 1) {
    throw AppError.badRequest(`请至少上传 ${MIN_IMAGES} 张作品图片或 1 个作品视频`)
  }

  return works.map((work, index) => {
    const file = fileById.get(work.fileId)!
    return {
      type: file.mimeType.startsWith('video/') ? 'video' : 'image',
      objectKey: file.objectKey,
      title: work.title || `作品 ${index + 1}`,
      styles: work.styles,
      sort: index,
    }
  })
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value.filter((item) => typeof item === 'string') as string[]) : []
}

/** 入驻资料详情：身份证脱敏，作品返回 15 分钟签名地址 */
async function buildArtistDetail(artistId: number) {
  const prisma = getPrisma()
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: { portfolios: { orderBy: { sort: 'asc' } } },
  })
  if (!artist) throw AppError.notFound('入驻资料不存在')

  const objectKeys = artist.portfolios.map((item) => item.url)
  const files = objectKeys.length
    ? await prisma.fileObject.findMany({
        where: { objectKey: { in: objectKeys } },
        select: { id: true, objectKey: true },
      })
    : []
  const fileIdByKey = new Map(files.map((file) => [file.objectKey, file.id]))

  return {
    id: artist.id,
    name: artist.name,
    city: artist.city,
    district: artist.district,
    years: artist.years,
    styles: asStringArray(artist.styles),
    intro: artist.intro,
    idCardMasked: decryptAndMask(artist.idCardCipher, maskIdCard),
    status: artist.status,
    rejectReason: artist.rejectReason,
    auditAt: artist.auditAt,
    submittedAt: artist.createdAt,
    updatedAt: artist.updatedAt,
    works: artist.portfolios.map((item) => ({
      id: item.id,
      fileId: fileIdByKey.get(item.url) ?? null,
      type: item.type,
      title: item.title,
      styles: asStringArray(item.styles),
      // 私有桶：前端需拼接接口域名后展示，签名 15 分钟有效
      path: buildSignedPath('/api/files/raw', item.url),
    })),
  }
}

/** 提交入驻（E4-02）：已有非驳回记录返回 409，驳回状态视为重新提审 */
artistRouter.post(
  '/artist/apply',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const input = applySchema.parse(req.body)
    const userId = req.auth!.uid
    const prisma = getPrisma()

    const existing = await prisma.artist.findUnique({ where: { userId } })
    if (existing && existing.status !== 'rejected') {
      throw AppError.conflict('已提交过入驻申请，请勿重复提交')
    }

    const works = await resolveWorks(userId, input.works)
    const idCardCipher = encryptSensitive(input.idCard)

    const artist = await prisma.$transaction(async (tx) => {
      const data = {
        name: input.name,
        city: input.city,
        district: input.district || null,
        years: input.years,
        styles: input.styles,
        intro: input.intro || null,
        idCardCipher,
        status: 'pending',
        rejectReason: null,
        auditAt: null,
      }
      const saved = existing
        ? await tx.artist.update({ where: { id: existing.id }, data })
        : await tx.artist.create({ data: { userId, ...data } })

      await tx.artistPortfolio.deleteMany({ where: { artistId: saved.id } })
      await tx.artistPortfolio.createMany({
        data: works.map((work) => ({
          artistId: saved.id,
          type: work.type,
          url: work.objectKey,
          title: work.title,
          styles: work.styles,
          status: 'pending',
          sort: work.sort,
        })),
      })
      return saved
    })

    res.ok(await buildArtistDetail(artist.id))
  }),
)

/** 我的入驻资料与审核状态（E4-03）：未提交返回 data=null，便于前端区分新建/编辑 */
artistRouter.get(
  '/artist/me',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const artist = await getPrisma().artist.findUnique({ where: { userId: req.auth!.uid } })
    if (!artist) {
      res.ok(null)
      return
    }
    res.ok(await buildArtistDetail(artist.id))
  }),
)

/**
 * 编辑资料（E4-05）：
 * 姓名 / 城市 / 年限 / 风格 / 身份证 / 作品变化 → 回退待审核并清空驳回原因；
 * 仅改简介或区域 → 保持当前状态，不触发重审。
 */
artistRouter.put(
  '/artist/me',
  requireAuth('artist'),
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body)
    const userId = req.auth!.uid
    const prisma = getPrisma()

    const artist = await prisma.artist.findUnique({ where: { userId } })
    if (!artist) throw AppError.notFound('尚未提交入驻申请')
    if (artist.status === 'disabled') throw AppError.forbidden('账号已停用，请联系平台')

    const works = await resolveWorks(userId, input.works)
    const currentWorks = await prisma.artistPortfolio.findMany({
      where: { artistId: artist.id },
      orderBy: { sort: 'asc' },
      select: { url: true },
    })

    const idCardChanged = input.idCard
      ? !sameIdCard(artist.idCardCipher, input.idCard)
      : false
    const stylesChanged =
      asStringArray(artist.styles).slice().sort().join(',') !== input.styles.slice().sort().join(',')
    const worksChanged =
      currentWorks.map((item) => item.url).join(',') !== works.map((item) => item.objectKey).join(',')

    const keyChanged =
      artist.name !== input.name ||
      artist.city !== input.city ||
      artist.years !== input.years ||
      stylesChanged ||
      worksChanged ||
      idCardChanged

    const idCardCipher = input.idCard ? encryptSensitive(input.idCard) : artist.idCardCipher

    await prisma.$transaction(async (tx) => {
      await tx.artist.update({
        where: { id: artist.id },
        data: {
          name: input.name,
          city: input.city,
          district: input.district || null,
          years: input.years,
          styles: input.styles,
          intro: input.intro || null,
          idCardCipher,
          ...(keyChanged
            ? { status: 'pending', rejectReason: null, auditAt: null }
            : {}),
        },
      })

      await tx.artistPortfolio.deleteMany({ where: { artistId: artist.id } })
      await tx.artistPortfolio.createMany({
        data: works.map((work) => ({
          artistId: artist.id,
          type: work.type,
          url: work.objectKey,
          title: work.title,
          styles: work.styles,
          status: 'pending',
          sort: work.sort,
        })),
      })
    })

    res.ok({ ...(await buildArtistDetail(artist.id)), keyChanged })
  }),
)

/** 解密比对身份证：同一号码重新输入不算变更（避免误触发重审） */
function sameIdCard(cipherText: string | null, plain: string): boolean {
  if (!cipherText) return false
  try {
    return decryptSensitive(cipherText) === plain
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* 公开主页（E5-04 / E5-05 / E5-06）                                    */
/* ------------------------------------------------------------------ */

const artistIdParam = z.object({ id: z.coerce.number().int().positive('化妆师不存在') })

const visitSchema = z.object({
  deviceId: z.string().trim().min(8, '设备标识不合法').max(128),
})

/** 可选登录态：公开接口拿到 token 时用于判断本人 / 管理员预览 */
function optionalClaims(req: Request): { uid: number; role: TokenRole } | null {
  try {
    return verifyToken(extractBearerToken(req.header('authorization')), 'access')
  } catch {
    return null
  }
}

/** 以 UTC 零点表示自然日，与 MySQL DATE 对齐（避免时区偏移一天） */
function dayOnly(base = new Date()): Date {
  return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()))
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

/** 主页档期摘要：未来 14 天，可接 / 已排 / 休息，无记录视为不可接 */
async function buildScheduleSummary(artistId: number) {
  const prisma = getPrisma()
  const today = dayOnly()
  const schedules = await prisma.artistSchedule.findMany({
    where: { artistId, date: { gte: today, lt: addDays(today, 14) } },
    orderBy: { date: 'asc' },
    select: { date: true, state: true },
  })
  const stateByDate = new Map(schedules.map((item) => [formatDay(item.date), item.state]))

  const days = Array.from({ length: 14 }, (_, index) => {
    const date = formatDay(addDays(today, index))
    return { date, state: stateByDate.get(date) || 'none' }
  })
  const availableDays = days.filter((item) => item.state === 'available').length
  const nextAvailableDate = days.find((item) => item.state === 'available')?.date || null
  return { days, availableDays, nextAvailableDate }
}

/** 主页资料：不含身份证，仅返回已通过审核者（本人 / 管理员可预览） */
async function buildPublicProfile(artistId: number) {
  const prisma = getPrisma()
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: {
      user: { select: { avatarUrl: true } },
      portfolios: {
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        take: 60,
        select: { id: true, type: true, url: true, title: true, styles: true },
      },
    },
  })
  if (!artist) throw AppError.notFound('化妆师不存在')

  const worksTotal = await prisma.artistPortfolio.count({ where: { artistId } })
  const schedule = await buildScheduleSummary(artistId)

  return {
    id: artist.id,
    name: artist.name,
    city: artist.city,
    district: artist.district,
    years: artist.years,
    styles: asStringArray(artist.styles),
    intro: artist.intro,
    avatarUrl: artist.user?.avatarUrl || null,
    status: artist.status,
    worksTotal,
    coverPath: artist.portfolios[0] ? buildSignedPath('/api/files/raw', artist.portfolios[0].url) : null,
    schedule,
  }
}

/** 化妆师公开主页（E5-04）：待审核 / 驳回 / 封禁对外 404，本人与管理员可预览 */
artistRouter.get(
  '/artist/:id',
  asyncHandler(async (req, res) => {
    const { id } = artistIdParam.parse(req.params)
    const artist = await getPrisma().artist.findUnique({
      where: { id },
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

    res.ok(await buildPublicProfile(id))
  }),
)

/**
 * 主页 UV 上报（E5-06）：同设备同自然日只计 1 次。
 * deviceId 由小程序本地生成，服务端只存 SHA-256，不落明文。
 */
artistRouter.post(
  '/artist/:id/visit',
  asyncHandler(async (req, res) => {
    const { id } = artistIdParam.parse(req.params)
    const { deviceId } = visitSchema.parse(req.body)

    const prisma = getPrisma()
    const artist = await prisma.artist.findUnique({ where: { id }, select: { status: true } })
    if (!artist || artist.status !== 'approved') throw AppError.notFound('化妆师不存在')

    const visitDate = dayOnly()
    const deviceHash = crypto.createHash('sha256').update(deviceId).digest('hex')
    let deduped = false

    try {
      await prisma.artistVisit.create({ data: { artistId: id, deviceHash, visitDate } })
    } catch (error) {
      // 唯一索引冲突 = 当天已访问过
      if ((error as { code?: string }).code === 'P2002') {
        deduped = true
      } else {
        throw error
      }
    }

    if (!deduped) {
      await prisma.statsDaily.upsert({
        where: { date: visitDate },
        update: { artistPageUv: { increment: 1 } },
        create: { date: visitDate, artistPageUv: 1 },
      })
    }
    const stats = await prisma.statsDaily.findUnique({ where: { date: visitDate } })
    res.ok({ deduped, uv: stats?.artistPageUv ?? 0 })
  }),
)

/** 主页小程序码（E5-05）：未配置 WX_APPID / WX_SECRET 时返回明确错误 */
artistRouter.get(
  '/artist/:id/qrcode',
  asyncHandler(async (req, res) => {
    const { id } = artistIdParam.parse(req.params)
    const artist = await getPrisma().artist.findUnique({ where: { id }, select: { status: true } })
    if (!artist || artist.status !== 'approved') throw AppError.notFound('化妆师不存在')

    const buffer = await getUnlimitedQrCode(`artist_${id}`, 'pages/artist/detail/index')
    res.setHeader('content-type', 'image/png')
    res.setHeader('cache-control', 'public, max-age=86400')
    res.send(buffer)
  }),
)
