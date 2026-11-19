import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { AppError } from './errors'
import { ErrorCode } from './response'

/** guest 表示已登录但未选择身份（E3-03），业务接口不接受该角色 */
export type TokenRole = 'artist' | 'customer' | 'admin' | 'guest'
export type TokenType = 'access' | 'refresh'

export interface TokenClaims {
  /** user_auth.id 或 admin_user.id */
  uid: number
  role: TokenRole
  type: TokenType
  /** 后台账号细分角色：super | admin | auditor */
  adminRole?: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  /** access token 有效期（秒或 ms 字符串，与配置一致） */
  expiresIn: string
}

function accessSecret() {
  return env.JWT_SECRET
}

function refreshSecret() {
  return env.JWT_REFRESH_SECRET ?? env.JWT_SECRET
}

function sign(claims: TokenClaims, type: TokenType) {
  const expiresIn = type === 'access' ? env.JWT_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN
  const options = { expiresIn } as jwt.SignOptions
  return jwt.sign(claims, type === 'access' ? accessSecret() : refreshSecret(), options)
}

export function signAccessToken(claims: Omit<TokenClaims, 'type'>): string {
  return sign({ ...claims, type: 'access' }, 'access')
}

export function signRefreshToken(claims: Omit<TokenClaims, 'type'>): string {
  return sign({ ...claims, type: 'refresh' }, 'refresh')
}

/** 一次签发 access + refresh（登录 / 刷新共用） */
export function issueTokenPair(claims: Omit<TokenClaims, 'type'>): TokenPair {
  return {
    accessToken: signAccessToken(claims),
    refreshToken: signRefreshToken(claims),
    expiresIn: env.JWT_EXPIRES_IN,
  }
}

/**
 * 校验 token 并确保类型匹配（access 不能当 refresh 用，反之亦然）。
 * 过期 → 40101，其余非法 → 40100。
 */
export function verifyToken(token: string, expected: TokenType): TokenClaims {
  let decoded: unknown
  try {
    decoded = jwt.verify(token, expected === 'access' ? accessSecret() : refreshSecret())
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(ErrorCode.TOKEN_EXPIRED, '登录已过期，请重新登录')
    }
    throw new AppError(ErrorCode.UNAUTHORIZED, '登录凭证无效')
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '登录凭证无效')
  }

  const claims = decoded as Partial<TokenClaims>
  if (claims.type !== expected || typeof claims.uid !== 'number' || !claims.role) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '登录凭证无效')
  }
  return claims as TokenClaims
}

/** 从 Authorization: Bearer <token> 中提取 token */
export function extractBearerToken(header?: string): string {
  if (!header) throw AppError.unauthorized('缺少登录凭证')
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) throw AppError.unauthorized('登录凭证格式错误')
  return token
}
