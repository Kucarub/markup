/* eslint-disable */
/**
 * E7 冒烟验证脚本（可重复执行）：node scripts/verify-e7.cjs
 * 覆盖 E7-01 ~ E7-04 的服务端验收点：
 * 客户自动建档与资料修改、未绑手机号拦截、需求发布（幂等 / 每日上限 / 日期与预算校验）、
 * 定向预约校验、我的需求四态筛选、需求大厅过滤、编辑与关闭、越权隔离、接口文档。
 */
require('dotenv').config()
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

/** 与服务端一致的 UTC 自然日 key */
function dayKey(offsetDays = 0) {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays))
    .toISOString()
    .slice(0, 10)
}

async function createAccount(code, role) {
  const login = await request('POST', '/api/auth/wx-login', { body: { code } })
  const userId = login.data.data.userId
  const assigned = await request('POST', '/api/auth/role', {
    token: login.data.data.accessToken,
    body: { role },
  })
  return { userId, token: assigned.data.data.accessToken }
}

function demandBody(overrides = {}) {
  return {
    city: '上海',
    district: '静安区',
    serviceDate: dayKey(3),
    serviceType: 'bridal',
    headcount: 1,
    budgetMin: 800,
    budgetMax: 1500,
    stylePrefs: ['fresh', 'bridal'],
    remark: '希望清透底妆',
    ...overrides,
  }
}

async function main() {
  console.log(`[verify] base=${BASE}`)

  const stamp = Date.now()
  const created = { userIds: [], openids: [] }

  // ---------- 准备：已通过的化妆师（用于定向预约 / 需求大厅） ----------
  const seededArtist = await prisma.artist.findFirst({ where: { status: 'approved' } })
  if (!seededArtist) throw new Error('缺少 approved 化妆师，请先执行 prisma db seed')

  const openidA = `dev-openid-e7a-${stamp}`
  const openidB = `dev-openid-e7b-${stamp}`
  const openidArtist = `dev-openid-e7r-${stamp}`
  created.openids.push(openidA, openidB, openidArtist)

  // ---------- E7-01 客户资料 ----------
  console.log('\n[E7-01] 客户角色初始化与资料')
  const customerA = await createAccount(openidA, 'customer')
  created.userIds.push(customerA.userId)

  const profileA = await request('GET', '/api/customer/me', { token: customerA.token })
  check(
    '选择客户角色后自动建档（active，未绑手机号）',
    profileA.status === 200 &&
      profileA.data.data.status === 'active' &&
      profileA.data.data.phoneBound === false &&
      profileA.data.data.phoneMasked === null,
    JSON.stringify(profileA.data),
  )

  const updatedProfile = await request('PUT', '/api/customer/me', {
    token: customerA.token,
    body: { nickname: '小满', city: '上海', district: '徐汇区' },
  })
  check(
    '修改昵称 / 城市 / 区域生效',
    updatedProfile.status === 200 &&
      updatedProfile.data.data.nickname === '小满' &&
      updatedProfile.data.data.district === '徐汇区',
    JSON.stringify(updatedProfile.data),
  )

  const customerB = await createAccount(openidB, 'customer')
  created.userIds.push(customerB.userId)
  const customerArtist = await createAccount(openidArtist, 'artist')
  created.userIds.push(customerArtist.userId)

  // ---------- E7-03 发布需求 ----------
  console.log('\n[E7-03] 需求创建与防刷')
  const noPhone = await request('POST', '/api/demands', {
    token: customerA.token,
    body: demandBody(),
  })
  check(
    '未绑手机号发布 → 403/40300',
    noPhone.status === 403 && noPhone.data.code === 40300,
    JSON.stringify(noPhone.data),
  )

  const withoutRole = await request('POST', '/api/demands', {
    token: customerArtist.token,
    body: demandBody(),
  })
  check(
    '化妆师角色发布需求 → 403/40300',
    withoutRole.status === 403 && withoutRole.data.code === 40300,
    JSON.stringify(withoutRole.data),
  )

  const phone = await request('POST', '/api/auth/phone', {
    token: customerA.token,
    body: { code: '13800001111' },
  })
  check('客户绑定手机号成功', phone.status === 200 && phone.data.data.phoneBound === true)

  const firstCreate = await request('POST', '/api/demands', {
    token: customerA.token,
    body: demandBody(),
  })
  const demand1 = firstCreate.data.data || {}
  check(
    '发布需求成功（pending / 待响应 / responseCount=0）',
    firstCreate.status === 200 &&
      demand1.status === 'pending' &&
      demand1.statusLabel === '待响应' &&
      demand1.responseCount === 0,
    JSON.stringify(firstCreate.data),
  )
  check(
    '过期时间落在服务日次日零点',
    demand1.expireAt === `${dayKey(4)}T00:00:00.000Z`,
    demand1.expireAt,
  )

  const duplicate = await request('POST', '/api/demands', {
    token: customerA.token,
    body: demandBody(),
  })
  check(
    '5 分钟内同内容重复提交 → 幂等返回 duplicated=true',
    duplicate.status === 200 &&
      duplicate.data.data.duplicated === true &&
      duplicate.data.data.id === demand1.id,
    JSON.stringify(duplicate.data),
  )

  const pastDate = await request('POST', '/api/demands', {
    token: customerA.token,
    body: demandBody({ serviceDate: dayKey(-1) }),
  })
  check('服务日期早于今天 → 400/40001', pastDate.status === 400 && pastDate.data.code === 40001)

  const badBudget = await request('POST', '/api/demands', {
    token: customerA.token,
    body: demandBody({ serviceDate: dayKey(9), budgetMin: 2000, budgetMax: 1000 }),
  })
  check('预算下限高于上限 → 400/40001', badBudget.status === 400 && badBudget.data.code === 40001)

  const badTarget = await request('POST', '/api/demands', {
    token: customerA.token,
    body: demandBody({ serviceDate: dayKey(10), targetArtistId: 999999 }),
  })
  check('定向预约不存在 / 未过审化妆师 → 400/40001', badTarget.status === 400 && badTarget.data.code === 40001)

  // E9-03 起定向预约要求目标化妆师当日可接：显式造一个可约档期
  const targetDay = new Date(`${dayKey(5)}T00:00:00.000Z`)
  const targetSlot = await prisma.artistSchedule.findUnique({
    where: { artistId_date: { artistId: seededArtist.id, date: targetDay } },
  })
  if (!targetSlot) {
    await prisma.artistSchedule.create({
      data: { artistId: seededArtist.id, date: targetDay, state: 'available' },
    })
  } else if (targetSlot.state !== 'available') {
    await prisma.artistSchedule.update({
      where: { id: targetSlot.id },
      data: { state: 'available', serviceOrderId: null },
    })
  }

  const targeted = await request('POST', '/api/demands', {
    token: customerA.token,
    body: demandBody({ serviceDate: dayKey(5), targetArtistId: seededArtist.id }),
  })
  check(
    '定向预约写入 targetArtistId',
    targeted.status === 200 && targeted.data.data.targetArtistId === seededArtist.id,
    JSON.stringify(targeted.data),
  )

  const more = []
  for (const offset of [6, 7, 8]) {
    const res = await request('POST', '/api/demands', {
      token: customerA.token,
      body: demandBody({ serviceDate: dayKey(offset), headcount: offset - 4 }),
    })
    more.push(res)
  }
  check(
    '累计 5 条需求（含定向）均可创建',
    more.every((res) => res.status === 200),
  )

  const overLimit = await request('POST', '/api/demands', {
    token: customerA.token,
    body: demandBody({ serviceDate: dayKey(11), headcount: 9 }),
  })
  check(
    '超过每日 5 条上限 → 429/42900',
    overLimit.status === 429 && overLimit.data.code === 42900,
    JSON.stringify(overLimit.data),
  )

  // ---------- E7-04 我的需求四态 ----------
  console.log('\n[E7-04] 我的需求列表与关闭')
  const mineAll = await request('GET', '/api/demands?scope=mine', { token: customerA.token })
  check(
    '我的需求返回全部 5 条',
    mineAll.status === 200 && mineAll.data.data.total === 5,
    JSON.stringify({ total: mineAll.data.data && mineAll.data.data.total }),
  )

  const minePending = await request('GET', '/api/demands?scope=mine&status=pending', {
    token: customerA.token,
  })
  check('待响应筛选 5 条', minePending.data.data.total === 5)

  await prisma.demandResponse.create({
    data: { demandId: demand1.id, artistId: seededArtist.id, note: '档期合适，可接' },
  })

  const mineResponded = await request('GET', '/api/demands?scope=mine&status=responded', {
    token: customerA.token,
  })
  const respondedItem = (mineResponded.data.data.list || []).find((item) => item.id === demand1.id)
  check(
    '已响应筛选命中并派生 statusLabel=已响应',
    !!respondedItem && respondedItem.statusLabel === '已响应' && respondedItem.responseCount === 1,
    JSON.stringify(respondedItem),
  )

  const pendingAfterResponse = await request('GET', '/api/demands?scope=mine&status=pending', {
    token: customerA.token,
  })
  check('已响应需求不再计入待响应', pendingAfterResponse.data.data.total === 4)

  const mineB = await request('GET', '/api/demands?scope=mine', { token: customerB.token })
  check('其他客户看不到我的需求', mineB.data.data.total === 0)

  const foreignEdit = await request('PUT', `/api/demands/${demand1.id}`, {
    token: customerB.token,
    body: demandBody({ remark: '篡改' }),
  })
  check('编辑他人需求 → 404/40400', foreignEdit.status === 404 && foreignEdit.data.code === 40400)

  const edited = await request('PUT', `/api/demands/${demand1.id}`, {
    token: customerA.token,
    body: demandBody({ remark: '改为森系' }),
  })
  check(
    '待响应需求可编辑',
    edited.status === 200 && edited.data.data.remark === '改为森系',
    JSON.stringify(edited.data),
  )

  // ---------- 需求大厅 ----------
  const hall = await request('GET', '/api/demands?scope=hall', { token: customerArtist.token })
  const hallIds = ((hall.data.data || {}).list || []).map((item) => item.id)
  check(
    '需求大厅仅化妆师可见且含待响应需求',
    hall.status === 200 && hallIds.includes(demand1.id),
    JSON.stringify({ total: hall.data.data && hall.data.data.total }),
  )

  const published = more[0].data.data
  await request('PUT', `/api/demands/${published.id}/close`, { token: customerA.token })
  const hallAfterClose = await request('GET', '/api/demands?scope=hall', { token: customerArtist.token })
  const hallAfterIds = ((hallAfterClose.data.data || {}).list || []).map((item) => item.id)
  check('已关闭需求不再进入需求大厅', !hallAfterIds.includes(published.id))

  const closed = await request('PUT', `/api/demands/${demand1.id}/close`, { token: customerA.token })
  check(
    '主动关闭需求写入 closedAt',
    closed.status === 200 && closed.data.data.status === 'closed' && !!closed.data.data.closedAt,
    JSON.stringify(closed.data),
  )

  const closeAgain = await request('PUT', `/api/demands/${demand1.id}/close`, { token: customerA.token })
  check('重复关闭 → 409/40900', closeAgain.status === 409 && closeAgain.data.code === 40900)

  const editClosed = await request('PUT', `/api/demands/${demand1.id}`, {
    token: customerA.token,
    body: demandBody({ remark: '关闭后再改' }),
  })
  check('已关闭需求不可编辑 → 409/40900', editClosed.status === 409 && editClosed.data.code === 40900)

  const mineClosed = await request('GET', '/api/demands?scope=mine&status=closed', {
    token: customerA.token,
  })
  check('已关闭筛选返回 2 条', mineClosed.data.data.total === 2)

  // ---------- 接口文档 ----------
  console.log('\n[E7-01] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const paths = (doc.data && doc.data.paths) || {}
  check(
    'OpenAPI 已包含 E7 四个接口',
    ['/api/customer/me', '/api/demands', '/api/demands/{id}', '/api/demands/{id}/close'].every(
      (path) => !!paths[path],
    ),
  )

  // 清理测试数据（customer 级联删除 demand / demand_response）
  await prisma.customer.deleteMany({ where: { userId: { in: created.userIds } } })
  await prisma.userAuth.deleteMany({ where: { openid: { in: created.openids } } })

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
