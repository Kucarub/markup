import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { env } from '../config/env'

/**
 * 私有文件存储（E2-05）。
 * - local：开发期落盘 server/storage，读写必须带 HMAC 签名；
 * - oss：生产期直连阿里云 OSS，读取直接返回签名地址（不占服务器带宽），
 *   上传由服务器用 OSS 预签名 PUT 转发。
 * 依据 OSS_* 四个变量是否齐全自动切换，对路由暴露的协议保持一致。
 */

interface OssConfig {
  bucket: string
  endpoint: string
  accessKeyId: string
  accessKeySecret: string
}

/** OSS_REGION 兼容 “oss-cn-hangzhou” 与 “oss-cn-hangzhou.aliyuncs.com” 两种写法 */
function resolveOssConfig(): OssConfig | null {
  const { OSS_BUCKET, OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET } = env
  if (!OSS_BUCKET || !OSS_REGION || !OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET) return null

  const host = OSS_REGION.includes('.') ? OSS_REGION : `${OSS_REGION}.aliyuncs.com`
  return {
    bucket: OSS_BUCKET,
    endpoint: `${OSS_BUCKET}.${host.replace(/^https?:\/\//, '')}`,
    accessKeyId: OSS_ACCESS_KEY_ID,
    accessKeySecret: OSS_ACCESS_KEY_SECRET,
  }
}

const oss = resolveOssConfig()

export const STORAGE_DRIVER: 'local' | 'oss' = oss ? 'oss' : 'local'

export const STORAGE_BUCKET = oss?.bucket || env.OSS_BUCKET || 'local-private'

/** 允许上传的类型 → 落盘扩展名 */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
}

export const MAX_FILE_SIZE = env.MAX_UPLOAD_MB * 1024 * 1024

/** 签名有效期（秒） */
export const SIGN_TTL = 15 * 60

const rootDir = path.resolve(process.cwd(), env.STORAGE_DIR)

function secret(): string {
  return env.STORAGE_SECRET ?? env.JWT_SECRET
}

function sign(objectKey: string, exp: number): string {
  return crypto.createHmac('sha256', secret()).update(`${objectKey}:${exp}`).digest('base64url')
}

/**
 * OSS V1 签名（GET / PUT / HEAD）。
 * 签名串固定为 METHOD\nContent-MD5\nContent-Type\nExpires\n/{bucket}/{objectKey}，
 * 空行必须保留，否则 OSS 返回 SignatureDoesNotMatch。
 */
function ossSignedUrl(method: 'GET' | 'PUT' | 'HEAD', objectKey: string, ttl: number): string {
  if (!oss) throw new Error('未配置 OSS')

  const expires = Math.floor(Date.now() / 1000) + ttl
  const canonical = `/${oss.bucket}/${objectKey.replace(/^\/+/, '')}`
  const signature = crypto
    .createHmac('sha1', oss.accessKeySecret)
    .update(`${method}\n\n\n${expires}\n${canonical}`)
    .digest('base64')
  const query = [
    `OSSAccessKeyId=${encodeURIComponent(oss.accessKeyId)}`,
    `Expires=${expires}`,
    `Signature=${encodeURIComponent(signature)}`,
  ].join('&')

  return `https://${oss.endpoint}/${encodeURI(objectKey)}?${query}`
}

export function ensureStorageDir(): void {
  if (oss) return
  fs.mkdirSync(rootDir, { recursive: true })
}

/** 生成对象键：scene/yyyyMMdd/uuid.ext，避免用户原始文件名进入路径 */
export function buildObjectKey(scene: string, ext: string): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${scene}/${day}/${crypto.randomUUID()}.${ext}`
}

export function createSignature(objectKey: string, ttl = SIGN_TTL) {
  const exp = Math.floor(Date.now() / 1000) + ttl
  return { exp, sig: sign(objectKey, exp) }
}

/** 校验签名：先验有效期，再定时安全比较，避免时序攻击 */
export function verifySignature(objectKey: string, exp: number, sig: string): boolean {
  if (!Number.isInteger(exp) || exp * 1000 < Date.now()) return false
  const expected = sign(objectKey, exp)
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * 生成文件访问地址。
 * - oss 模式：读取（/api/files/raw）直接返回 OSS 签名 GET，客户端走 OSS 不占服务器带宽；
 *   上传仍返回站内 HMAC 路径，由服务器转发到 OSS（避免客户端直传时的 Content-Type 签名问题）。
 * - local 模式：两者都是站内 HMAC 签名路径。
 */
export function buildSignedPath(
  pathname: '/api/files/upload' | '/api/files/raw',
  objectKey: string,
  ttl = SIGN_TTL,
): string {
  if (oss && pathname === '/api/files/raw') return ossSignedUrl('GET', objectKey, ttl)

  const { exp, sig } = createSignature(objectKey, ttl)
  return `${pathname}?key=${encodeURIComponent(objectKey)}&exp=${exp}&sig=${sig}`
}

/** 解析落盘路径，禁止 ../ 越界访问 */
function resolvePath(objectKey: string): string {
  const target = path.resolve(rootDir, objectKey)
  if (target !== rootDir && !target.startsWith(rootDir + path.sep)) {
    throw new Error('非法的对象键')
  }
  return target
}

export async function writeObject(objectKey: string, data: Buffer): Promise<void> {
  if (oss) {
    // 上传经服务器转发：预签名 PUT 有效期够用即可，避免暴露长期可写地址
    const res = await fetch(ossSignedUrl('PUT', objectKey, 120), {
      method: 'PUT',
      body: new Uint8Array(data),
    })
    if (!res.ok) throw new Error(`OSS 上传失败(${res.status})`)
    return
  }

  const target = resolvePath(objectKey)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, data)
}

export async function objectExists(objectKey: string): Promise<boolean> {
  if (oss) {
    const res = await fetch(ossSignedUrl('HEAD', objectKey, 60), { method: 'HEAD' })
    return res.ok
  }

  try {
    return fs.existsSync(resolvePath(objectKey))
  } catch {
    return false
  }
}

export async function readObject(objectKey: string): Promise<Buffer> {
  if (oss) {
    const res = await fetch(ossSignedUrl('GET', objectKey, 60))
    if (!res.ok) throw new Error(`OSS 读取失败(${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  }

  return fs.readFileSync(resolvePath(objectKey))
}
