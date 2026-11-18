import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 不能为空'),
  REDIS_URL: z.string().min(1, 'REDIS_URL 不能为空'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET 至少 16 位'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(16).optional(),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGINS: z.string().default('*'),
  WX_APPID: z.string().optional(),
  WX_SECRET: z.string().optional(),
  WX_TEMPLATE_INVITATION: z.string().optional(),
  WX_TEMPLATE_RESULT: z.string().optional(),
  OSS_REGION: z.string().optional(),
  OSS_BUCKET: z.string().optional(),
  OSS_ACCESS_KEY_ID: z.string().optional(),
  OSS_ACCESS_KEY_SECRET: z.string().optional(),
  AES_KEY: z.string().optional(),
  /** 本地文件存储目录（相对 server/），E2-05 开发期私有桶 */
  STORAGE_DIR: z.string().default('storage'),
  /** 文件签名密钥，缺省复用 JWT_SECRET */
  STORAGE_SECRET: z.string().optional(),
  /** 单文件大小上限（MB） */
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(5),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(`环境变量校验失败，请复制 .env.example 为 .env 后重试:\n${details}`)
}

export const env = parsed.data

export const isProd = env.NODE_ENV === 'production'

export const corsOrigins = env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim())
