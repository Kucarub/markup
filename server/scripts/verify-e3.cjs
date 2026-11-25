/* eslint-disable */
/**
 * E3 冒烟验证脚本（可重复执行）：node scripts/verify-e3.cjs
 * 覆盖 E3-01 ~ E3-05 的验收点；依赖 dev 兜底（WX_APPID / WX_SECRET 为空）。
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

  console.log('\n[E3-02] 手机号（方案 A：不收集，接口已下线）')
  const phoneGone = await request('POST', '/api/auth/phone', {
    token: testUser.accessToken,
    body: { code: '13812345678' },
  })
  check('手机号绑定接口已下线（404/40400）', phoneGone.status === 404 && phoneGone.data.code === 40400)

  const meAfter = await request('GET', '/api/auth/me', { token: testUser.accessToken })
  check('GET /auth/me 不再回显手机号字段', meAfter.data.data.phoneBound === undefined)

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

  const roleCustomer = await request('POST', '/api/auth/role', {
    token: artistBound.accessToken,
    body: { role: 'customer' },
  })
  check(
    '切换为客户成功且自动建档（profileStatus=approved）',
    roleCustomer.data.data.role === 'customer' && roleCustomer.data.data.profileStatus === 'approved',
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

  console.log('\n[E3-05] 选角色即建档与资料完善状态')
  const customerProfile = await request('GET', '/api/auth/me', { token: roleCustomer.data.data.accessToken })
  check(
    '客户资料回传 profileId 且无需审核',
    customerProfile.data.data.profileStatus === 'approved' && customerProfile.data.data.profileId !== null,
    JSON.stringify(customerProfile.data.data),
  )

  const roleBack = await request('POST', '/api/auth/role', {
    token: roleCustomer.data.data.accessToken,
    body: { role: 'artist' },
  })
  check(
    '切回化妆师自动建档（profileStatus=approved / profileCompleted=false）',
    roleBack.status === 200 &&
      roleBack.data.data.profileStatus === 'approved' &&
      roleBack.data.data.profileCompleted === false,
    JSON.stringify(roleBack.data.data),
  )

  const artistMe = await request('GET', '/api/auth/me', { token: roleBack.data.data.accessToken })
  check(
    '未完善资料仍返回 profileId，可直接使用全部功能',
    typeof artistMe.data.data.profileId === 'number' &&
      artistMe.data.data.profileStatus === 'approved',
    JSON.stringify(artistMe.data.data),
  )

  await prisma.artist.update({
    where: { userId: testUser.userId },
    data: { profileCompleted: true },
  })
  const completedMe = await request('GET', '/api/auth/me', { token: roleBack.data.data.accessToken })
  check('完善资料后 profileCompleted=true', completedMe.data.data.profileCompleted === true)

  await prisma.artist.update({
    where: { userId: testUser.userId },
    data: { status: 'disabled' },
  })
  const disabledMe = await request('GET', '/api/auth/me', { token: roleBack.data.data.accessToken })
  check(
    '停用账号回传 profileStatus=disabled',
    disabledMe.data.data.profileStatus === 'disabled',
    JSON.stringify(disabledMe.data.data),
  )

  await prisma.artist.update({
    where: { userId: testUser.userId },
    data: { status: 'approved' },
  })

  const customerLogin = await request('POST', '/api/auth/wx-login', {
    body: { code: 'dev-customer-openid' },
  })
  check(
    '种子客户登录已建档（profileStatus=approved）',
    customerLogin.data.data.role === 'customer' &&
      customerLogin.data.data.profileStatus === 'approved',
  )

  console.log('\n[E3-08] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const paths = (doc.data && doc.data.paths) || {}
  check(
    'OpenAPI 已包含 E3 三个登录态接口',
    ['/api/auth/wx-login', '/api/auth/me', '/api/auth/role'].every((path) => !!paths[path]),
  )

  // 清理测试数据
  await prisma.artist.deleteMany({ where: { userId: testUser.userId } })
  await prisma.customer.deleteMany({ where: { userId: testUser.userId } })
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
