/* eslint-disable */
/**
 * E2 冒烟验证脚本（可重复执行）：node scripts/verify-e2.cjs
 * 覆盖 E2-03 / E2-04 / E2-05 / E2-06 / E2-07 / E2-08 的验收点。
 */
require('dotenv').config()
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:3000'
const prisma = new PrismaClient()

let passed = 0
let failed = 0

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`)
  }
}

async function request(method, path, { token, body, raw, headers = {} } = {}) {
  const finalHeaders = { ...headers }
  if (body !== undefined) finalHeaders['content-type'] = 'application/json'
  if (token) finalHeaders.authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers: finalHeaders,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  })
  const isJson = (res.headers.get('content-type') || '').includes('json')
  const data = isJson ? await res.json() : Buffer.from(await res.arrayBuffer())
  return { status: res.status, data, headers: res.headers }
}

async function main() {
  console.log(`[verify] base=${BASE}`)

  console.log('\n[E2-03] 统一响应体 / 参数校验')
  const ping = await request('GET', '/api/ping')
  check('GET /api/ping 返回 code=0', ping.status === 200 && ping.data.code === 0)
  const badLogin = await request('POST', '/api/admin/auth/login', { body: { username: 'a' } })
  check(
    '参数错误返回 400 + 字段名',
    badLogin.status === 400 && badLogin.data.code === 40001 && JSON.stringify(badLogin.data.data).includes('password'),
    JSON.stringify(badLogin.data),
  )
  const notFound = await request('GET', '/api/not-exist')
  check('未知路由返回 404 统一体', notFound.status === 404 && notFound.data.code === 40400)

  console.log('\n[E2-04] JWT 鉴权与角色拦截')
  const login = await request('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'Admin@123456' },
  })
  const tokens = login.data.data || {}
  check('后台登录成功并返回双 token', login.status === 200 && !!tokens.accessToken && !!tokens.refreshToken)

  const meAdmin = await request('GET', '/api/admin/auth/me', { token: tokens.accessToken })
  check('admin token 访问 /admin/auth/me 通过', meAdmin.status === 200 && meAdmin.data.data.username === 'admin')

  const noToken = await request('GET', '/api/admin/auth/me')
  check('无 token 返回 401/40100', noToken.status === 401 && noToken.data.code === 40100)

  const artistToken = jwt.sign(
    { uid: 1, role: 'artist', type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' },
  )
  const forbidden = await request('GET', '/api/admin/auth/me', { token: artistToken })
  check('化妆师 token 访问后台接口返回 403/40300', forbidden.status === 403 && forbidden.data.code === 40300)

  const refresh = await request('POST', '/api/admin/auth/refresh', {
    body: { refreshToken: tokens.refreshToken },
  })
  check('admin refresh token 可换新 token 对', refresh.status === 200 && !!refresh.data.data.accessToken)

  const artistRefreshToken = jwt.sign(
    { uid: 1, role: 'artist', type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: '5m' },
  )
  const artistRefresh = await request('POST', '/api/auth/refresh', {
    body: { refreshToken: artistRefreshToken },
  })
  check(
    '化妆师 refresh token 走 /auth/refresh 成功',
    artistRefresh.status === 200 && !!artistRefresh.data.data.accessToken,
    JSON.stringify(artistRefresh.data),
  )

  const wrongType = await request('POST', '/api/auth/refresh', { body: { refreshToken: tokens.accessToken } })
  check('access token 当 refresh 用被拒 401/40100', wrongType.status === 401 && wrongType.data.code === 40100)

  console.log('\n[E2-05] 上传签名与私有文件访问')
  const signBadType = await request('POST', '/api/upload/sign', {
    token: artistToken,
    body: { scene: 'portfolio', fileName: 'a.gif', mimeType: 'image/gif', size: 1024 },
  })
  check('不支持的 mime 返回 415/41500', signBadType.status === 415 && signBadType.data.code === 41500)

  const signTooLarge = await request('POST', '/api/upload/sign', {
    token: artistToken,
    body: { scene: 'portfolio', fileName: 'big.jpg', mimeType: 'image/jpeg', size: 6 * 1024 * 1024 },
  })
  check('超过 5MB 返回 413/41301', signTooLarge.status === 413 && signTooLarge.data.code === 41301)

  const sign = await request('POST', '/api/upload/sign', {
    token: artistToken,
    body: { scene: 'portfolio', fileName: 'work.jpg', mimeType: 'image/jpeg', size: 12 },
  })
  const signData = sign.data.data || {}
  check('获取直传签名成功', sign.status === 200 && !!signData.uploadPath && !!signData.fileId)

  const payload = Buffer.from('fake-jpeg-bytes')
  const put = await request('PUT', signData.uploadPath, {
    raw: payload,
    headers: { 'content-type': 'image/jpeg' },
  })
  check('按签名直传落盘成功', put.status === 200 && put.data.data.size === payload.length)

  const readSign = await request('GET', `/api/files/sign?fileId=${signData.fileId}`, { token: artistToken })
  check('换取读取签名成功', readSign.status === 200 && !!readSign.data.data.path)

  const rawOk = await request('GET', readSign.data.data.path)
  check('带签名可读取私有文件', rawOk.status === 200 && Buffer.compare(rawOk.data, payload) === 0)

  const rawDenied = await request('GET', `/api/files/raw?key=${encodeURIComponent(signData.objectKey)}`)
  check('无签名读取私有文件返回 403/40300', rawDenied.status === 403 && rawDenied.data.code === 40300)

  console.log('\n[E2-06] 敏感字段加密与脱敏（库内为密文）')
  const artistRow = await prisma.artist.findFirst({ where: { status: 'approved' } })
  check('身份证落库为 v1 密文', !!artistRow && String(artistRow.idCardCipher).startsWith('v1.'))
  check('密文不含明文身份证', !!artistRow && !String(artistRow.idCardCipher).includes('19950101'))

  console.log('\n[E2-07] 后台登录失败锁定')
  const wrongPassword = { username: 'admin', password: 'WrongPass#1' }
  let lockStatus = 0
  let lockCode = 0
  for (let i = 0; i < 5; i += 1) {
    const res = await request('POST', '/api/admin/auth/login', { body: wrongPassword })
    lockStatus = res.status
    lockCode = res.data.code
  }
  check('连续 5 次密码错误锁定 423/42301', lockStatus === 423 && lockCode === 42301)
  const lockedLogin = await request('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'Admin@123456' },
  })
  check('锁定期内正确密码也被拒', lockedLogin.status === 423)

  await prisma.adminUser.update({
    where: { username: 'admin' },
    data: { failCount: 0, lockedUntil: null },
  })
  const recovered = await request('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'Admin@123456' },
  })
  check('解锁后登录恢复（脚本已清理锁定状态）', recovered.status === 200)

  console.log('\n[E2-08] 文档与 Mock')
  const doc = await request('GET', '/api-docs/openapi.json')
  check('OpenAPI JSON 可访问', doc.status === 200 && doc.data.openapi === '3.0.3')
  const mockRes = await request('GET', '/mock/demands')
  check('dev Mock 数据可访问', mockRes.status === 200 && Array.isArray(mockRes.data.data.list))

  console.log(`\n[verify] 通过 ${passed} 项，失败 ${failed} 项`)
  process.exitCode = failed === 0 ? 0 : 1
}

main()
  .catch((error) => {
    console.error('[verify] 执行异常：', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
