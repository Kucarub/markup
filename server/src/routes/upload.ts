import express, { Router } from 'express'
import { z } from 'zod'
import { getPrisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  STORAGE_BUCKET,
  SIGN_TTL,
  buildObjectKey,
  buildSignedPath,
  objectExists,
  readObject,
  verifySignature,
  writeObject,
} from '../services/storage'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/errors'

export const fileRouter = Router()

/** 仅本人或后台可换取敏感文件（身份证/营业执照）的访问签名 */
const SENSITIVE_SCENES = new Set(['id_card', 'license'])

const signSchema = z.object({
  scene: z.enum(['portfolio', 'watermark', 'avatar', 'license', 'id_card', 'report']),
  fileName: z.string().min(1).max(128),
  mimeType: z.string().min(3).max(64),
  size: z.coerce.number().int().positive('文件大小不合法'),
})

/** OSS 模式下签名地址本身是绝对 URL，直接透传 */
function absoluteUrl(req: express.Request, pathname: string): string {
  if (/^https?:\/\//.test(pathname)) return pathname
  return `${req.protocol}://${req.get('host')}${pathname}`
}

/** 签名参数缺失/非法统一按 403 处理，避免暴露是参数错还是签名错 */
function parseSignedQuery(query: express.Request['query']): { key: string; exp: number; sig: string } {
  const key = typeof query.key === 'string' ? query.key : ''
  const exp = Number(query.exp)
  const sig = typeof query.sig === 'string' ? query.sig : ''
  if (!key || !Number.isInteger(exp) || !sig) {
    throw AppError.forbidden('访问签名无效或已过期')
  }
  return { key, exp, sig }
}

/**
 * 获取直传签名（E2-05）。
 * 校验类型与大小 → 建 pending 文件记录 → 返回 PUT 上传地址（15 分钟有效）。
 */
fileRouter.post(
  '/upload/sign',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const input = signSchema.parse(req.body)
    const ext = ALLOWED_MIME_TYPES[input.mimeType]
    if (!ext) throw AppError.unsupportedMedia(`不支持的文件类型：${input.mimeType}`)
    if (input.size > MAX_FILE_SIZE) {
      throw AppError.fileTooLarge(`文件不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB`)
    }

    const objectKey = buildObjectKey(input.scene, ext)
    const file = await getPrisma().fileObject.create({
      data: {
        userId: req.auth?.uid,
        scene: input.scene,
        bucket: STORAGE_BUCKET,
        objectKey,
        mimeType: input.mimeType,
        size: input.size,
      },
    })

    const uploadPath = buildSignedPath('/api/files/upload', objectKey)
    res.ok({
      fileId: file.id,
      objectKey,
      uploadPath,
      uploadUrl: absoluteUrl(req, uploadPath),
      method: 'PUT',
      headers: { 'Content-Type': input.mimeType },
      expiresIn: SIGN_TTL,
    })
  }),
)

/** 直传落盘：仅凭签名访问，不依赖登录态（小程序 uploadFile 可直连） */
fileRouter.put(
  '/files/upload',
  express.raw({ type: () => true, limit: `${MAX_FILE_SIZE}b` }),
  asyncHandler(async (req, res) => {
    const { key, exp, sig } = parseSignedQuery(req.query)

    if (!verifySignature(key, exp, sig)) {
      throw AppError.forbidden('上传签名无效或已过期')
    }

    const prisma = getPrisma()
    const file = await prisma.fileObject.findUnique({ where: { objectKey: key } })
    if (!file || file.status === 'deleted') throw AppError.notFound('文件记录不存在')

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (buffer.length === 0) throw AppError.badRequest('上传内容为空')
    if (buffer.length > MAX_FILE_SIZE) throw AppError.fileTooLarge('文件超过大小限制')

    await writeObject(key, buffer)
    await prisma.fileObject.update({
      where: { objectKey: key },
      data: { size: buffer.length, status: 'uploaded' },
    })

    res.ok({ fileId: file.id, objectKey: key, size: buffer.length })
  }),
)

/** 换取私有文件访问签名（每次调用重新签发，有效期 15 分钟） */
fileRouter.get(
  '/files/sign',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { fileId } = z.object({ fileId: z.coerce.number().int().positive() }).parse(req.query)
    const file = await getPrisma().fileObject.findUnique({ where: { id: fileId } })
    if (!file || file.status === 'deleted') throw AppError.notFound('文件不存在')
    if (SENSITIVE_SCENES.has(file.scene) && req.auth?.role !== 'admin' && file.userId !== req.auth?.uid) {
      throw AppError.forbidden('无权访问该文件')
    }

    const pathname = buildSignedPath('/api/files/raw', file.objectKey)
    res.ok({
      fileId: file.id,
      objectKey: file.objectKey,
      path: pathname,
      url: absoluteUrl(req, pathname),
      expiresIn: SIGN_TTL,
    })
  }),
)

/** 私有文件读取：无签名或签名过期一律 403（不暴露存储路径） */
fileRouter.get(
  '/files/raw',
  asyncHandler(async (req, res) => {
    const { key, exp, sig } = parseSignedQuery(req.query)

    if (!verifySignature(key, exp, sig)) throw AppError.forbidden('访问签名无效或已过期')

    const file = await getPrisma().fileObject.findUnique({ where: { objectKey: key } })
    if (!file || file.status !== 'uploaded' || !(await objectExists(key))) {
      throw AppError.notFound('文件不存在')
    }

    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Length', String(file.size))
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.send(await readObject(key))
  }),
)

/**
 * 头像公开读取：非敏感内容（对全平台展示），按 fileId 直读，无需访问签名。
 * user_auth.avatarUrl 存 /api/avatars/<fileId> 相对路径，避免私有桶签名 15 分钟过期。
 */
fileRouter.get(
  '/avatars/:fileId',
  asyncHandler(async (req, res) => {
    const fileId = Number(req.params.fileId)
    if (!Number.isInteger(fileId) || fileId <= 0) throw AppError.badRequest('文件 ID 不合法')

    const file = await getPrisma().fileObject.findFirst({
      where: { id: fileId, scene: 'avatar', status: 'uploaded' },
    })
    if (!file || !(await objectExists(file.objectKey))) throw AppError.notFound('文件不存在')

    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Length', String(file.size))
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(await readObject(file.objectKey))
  }),
)
