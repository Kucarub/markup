import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { env } from '../config/env'

/**
 * 私有文件存储（E2-05）。
 * 开发期落在 server/storage 私有目录，所有读写必须带 HMAC 签名；
 * 生产切换对象存储时只需替换本文件的 write/read 实现，路由与签名协议不变。
 */

export const STORAGE_BUCKET = env.OSS_BUCKET || 'local-private'

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

export function ensureStorageDir(): void {
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

export function buildSignedPath(
  pathname: '/api/files/upload' | '/api/files/raw',
  objectKey: string,
  ttl = SIGN_TTL,
): string {
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

export function writeObject(objectKey: string, data: Buffer): void {
  const target = resolvePath(objectKey)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, data)
}

export function objectExists(objectKey: string): boolean {
  try {
    return fs.existsSync(resolvePath(objectKey))
  } catch {
    return false
  }
}

export function readObject(objectKey: string): Buffer {
  return fs.readFileSync(resolvePath(objectKey))
}
