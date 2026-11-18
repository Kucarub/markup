import crypto from 'node:crypto'
import { env } from '../config/env'

/**
 * 敏感字段加密（E2-06）。
 * 算法：AES-256-GCM；密文格式 `v1.<iv>.<tag>.<cipher>`（Base64URL）。
 * 身份证、营业执照、手机号禁止明文落库；列表接口一律返回脱敏值。
 */

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = env.AES_KEY
  if (!raw) {
    throw new Error('缺少 AES_KEY，请在 .env 中配置 32 位十六进制密钥')
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    cachedKey = Buffer.from(raw, 'hex')
  } else {
    // 兼容非 32 字节密钥：统一 SHA-256 派生，避免长度不符直接崩溃
    cachedKey = crypto.createHash('sha256').update(raw).digest()
  }
  return cachedKey
}

export function encryptSensitive(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

/** 解密失败（密钥变更 / 数据被篡改）统一抛错，由调用方决定降级策略 */
export function decryptSensitive(cipherText: string): string {
  const [version, ivPart, tagPart, dataPart] = cipherText.split('.')
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error('密文格式不合法')
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/** 手机号脱敏：138****8000 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return '***'
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

/** 身份证脱敏：前 3 后 4 */
export function maskIdCard(idCard: string): string {
  if (idCard.length < 8) return '***'
  return `${idCard.slice(0, 3)}${'*'.repeat(idCard.length - 7)}${idCard.slice(-4)}`
}

/** 营业执照/统一社会信用代码脱敏：前 3 后 4 */
export function maskLicense(license: string): string {
  return maskIdCard(license)
}

/** 解密后脱敏，用于列表/详情接口；解密失败返回占位符而非抛错 */
export function decryptAndMask(cipherText: string | null | undefined, masker = maskPhone): string {
  if (!cipherText) return ''
  try {
    return masker(decryptSensitive(cipherText))
  } catch {
    return '***'
  }
}
