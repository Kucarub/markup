/* eslint-disable */
/**
 * E3 冒烟验证脚本（可重复执行）：node scripts/verify-e3.cjs
 * 覆盖 E3-01 ~ E3-05 的验收点；依赖 dev 兜底（WX_APPID / WX_SECRET 为空）。
 */
require('dotenv').config()
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:3100'
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

async function request(method, path, { token, body, headers = {} } = {}) {
  const finalHeaders = { ...headers }
  if (body !== undefined) finalHeaders['content-type'] = 'application/json'
  if (token) finalHeaders.authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const isJson = (res.headers.get('content-type') || '').includes('json')
  const data = isJson ? await res.json() : null
  return { status: res.status, data }
}

async function main() {
  console.log(`[verify] base=${BASE}`)

  const code = `e3-test-${Date.now()}`
  const openid = `dev-openid-${code}`
  let testUser = null

  console.log('\n[E3-01] wx.login + code2session 登录')
  const first = await request('POST', '/api/auth/wx-login', { body: { code } })
  testUser = first.data.data || {}
  check(
    '首次登录返回双 token 且 needRoleSelect=true',
    first.status === 200 &&
      !!testUser.accessToken &&
      !!testUser.refreshToken &&
      testUser.needRoleSelect === true &&
      testUser.role === null,
    JSON.stringify(first.data),
  )

  const second = await request('POST', '/api/auth/wx-login', { body: { code } })
  check('同 openid 二次登录返回同一 userId', second.data.data.userId === testUser.userId)

  const created = await prisma.userAuth.findUnique({ where: { openid } })
  check('首次登录自动建 user_auth（role 为空）', !!created && created.role === null)

  const noCode = await request('POST', '/api/auth/wx-login', { body: {} })
  check('缺少 code 返回 400/40001', noCode.status === 400 && noCode.data.code === 40001)

  const artistLogin = await request('POST', '/api/auth/wx-login', {
    body: { code: 'dev-artist-openid' },
  })
  const artistSession = artistLogin.data.data || {}
  const seedArtistUser = await prisma.userAuth.findUnique({ where: { openid: 'dev-artist-openid' } })
  check(
    '种子化妆师登录命中既有账号且已入驻',
    artistSession.userId === seedArtistUser.id &&
      artistSession.role === 'artist' &&
      artistSession.profileStatus === 'approved',
    JSON.stringify(artistSession),
  )

  console.log('\n[E3-02] 手机号快速验证与加密绑定')
  const phone = await request('POST', '/api/auth/phone', {
    token: testUser.accessToken,
    body: { code: '13812345678' },
  })
  check(
    '手机号绑定成功并返回脱敏值',
    phone.status === 200 && phone.data.data.phoneBound === true &&
      phone.data.data.phoneMasked === '138****5678',
    JSON.stringify(phone.data),
  )

  const phoneRow = await prisma.userAuth.findUnique({ where: { openid } })
  check(
    '手机号密文落库（v1. 前缀且不含明文）',
    !!phoneRow.phoneCipher &&
      phoneRow.phoneCipher.startsWith('v1.') &&
      !phoneRow.phoneCipher.includes('13812345678'),
  )

  const meAfterPhone = await request('GET', '/api/auth/me', { token: testUser.accessToken })
  check('GET /auth/me 回显 phoneBound=true', meAfterPhone.data.data.phoneBound === true)

  const phoneNoAuth = await request('POST', '/api/auth/phone', { body: { code: '13812345678' } })
  check('未登录绑定手机号返回 401/40100', phoneNoAuth.status === 401 && phoneNoAuth.data.code === 40100)

  console.log('\n[E3-03] 角色选择 / 切换')
  const roleArtist = await request('POST', '/api/auth/role', {
    token: testUser.accessToken,
    body: { role: 'artist' },
  })
  const artistBound = roleArtist.data.data || {}
  check(
    '绑定化妆师后 needRoleSelect=false 且角色写入 token',
    roleArtist.status === 200 && artistBound.role === 'artist' && artistBound.needRoleSelect === false,
    JSON.stringify(artistBound),
  )

  const meAfterRole = await request('GET', '/api/auth/me', { token: artistBound.accessToken })
  check('新 token 的 /auth/me 角色为 artist', meAfterRole.data.data.role === 'artist')

  const badRole = await request('POST', '/api/auth/role', {
    token: artistBound.accessToken,
    body: { role: 'admin' },
  })
  check('非法角色返回 400/40001', badRole.status === 400 && badRole.data.code === 40001)

  const roleMerchant = await request('POST', '/api/auth/role', {
    token: artistBound.accessToken,
    body: { role: 'merchant' },
  })
  check(
    '切换为商家成功且入驻状态为 none',
    roleMerchant.data.data.role === 'merchant' && roleMerchant.data.data.profileStatus === 'none',
  )

  console.log('\n[E3-04] 登录态管理')
  const refreshed = await request('POST', '/api/auth/refresh', {
    body: { refreshToken: testUser.refreshToken },
  })
  check('refresh token 可换新 token 对', refreshed.status === 200 && !!refreshed.data.data.accessToken)

  const meWithRefreshed = await request('GET', '/api/auth/me', { token: refreshed.data.data.accessToken })
  check('新 access token 可访问 /auth/me', meWithRefreshed.status === 200 && meWithRefreshed.data.code === 0)

  const wrongType = await request('POST', '/api/auth/refresh', {
    body: { refreshToken: testUser.accessToken },
  })
  check('access token 当 refresh 使用被拒 401', wrongType.status === 401)

  const garbage = await request('GET', '/api/auth/me', { token: 'not-a-token' })
  check('非法 token 访问 /auth/me 返回 401/40100', garbage.status === 401 && garbage.data.code === 40100)

  const expiredToken = jwt.sign(
    { uid: testUser.userId, role: 'artist', type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: -1 },
  )
  const expired = await request('GET', '/api/auth/me', { token: expiredToken })
  check('过期 token 返回 401/40101', expired.status === 401 && expired.data.code === 40101)

  console.log('\n[E3-05] 入驻状态路由守卫数据')
  const noneProfile = await request('GET', '/api/auth/me', { token: roleMerchant.data.data.accessToken })
  check(
    '无入驻记录时 profileStatus=none',
    noneProfile.data.data.profileStatus === 'none' && noneProfile.data.data.profileId === null,
  )

  const pendingArtist = await prisma.artist.create({
    data: { userId: testUser.userId, name: '冒烟测试', city: '上海', status: 'pending' },
  })
  await request('POST', '/api/auth/role', {
    token: roleMerchant.data.data.accessToken,
    body: { role: 'artist' },
  })
  const pendingMe = await request('GET', '/api/auth/me', { token: roleMerchant.data.data.accessToken })
  check(
    '审核中返回 profileStatus=pending 与 profileId',
    pendingMe.data.data.profileStatus === 'pending' &&
      pendingMe.data.data.profileId === pendingArtist.id,
    JSON.stringify(pendingMe.data.data),
  )

  await prisma.artist.update({
    where: { id: pendingArtist.id },
    data: { status: 'rejected', rejectReason: '作品数量不足' },
  })
  const rejectedMe = await request('GET', '/api/auth/me', { token: roleMerchant.data.data.accessToken })
  check(
    '驳回时回传 profileStatus=rejected 与驳回原因',
    rejectedMe.data.data.profileStatus === 'rejected' &&
      rejectedMe.data.data.rejectReason === '作品数量不足',
  )

  const merchantLogin = await request('POST', '/api/auth/wx-login', {
    body: { code: 'dev-merchant-openid' },
  })
  check(
    '种子商家登录已入驻（profileStatus=approved）',
    merchantLogin.data.data.role === 'merchant' &&
      merchantLogin.data.data.profileStatus === 'approved',
  )

  console.log('\n[E3-08] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const paths = (doc.data && doc.data.paths) || {}
  check(
    'OpenAPI 已包含 E3 四个登录态接口',
    ['/api/auth/wx-login', '/api/auth/me', '/api/auth/role', '/api/auth/phone'].every(
      (path) => !!paths[path],
    ),
  )

  // 清理测试数据
  await prisma.artist.deleteMany({ where: { userId: testUser.userId } })
  await prisma.merchant.deleteMany({ where: { userId: testUser.userId } })
  await prisma.userAuth.deleteMany({ where: { openid } })

  console.log(`\n[verify] 通过 ${passed} / 失败 ${failed}`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error('[verify] 执行异常：', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
