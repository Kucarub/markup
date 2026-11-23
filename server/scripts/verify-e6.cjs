/* eslint-disable */
/**
 * E6 冒烟验证脚本（可重复执行）：node scripts/verify-e6.cjs
 * 覆盖 E6-01 ~ E6-04 的服务端验收点：
 * 月视图查询、单日三态设置、批量设置（日期段 + 星期）、已占用保护、
 * 唯一索引兜底、主页档期摘要联动、越权与角色隔离、接口文档。
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:3000'
const prisma = new PrismaClient()

const ID_CARD = '310101199001011234'
const BATCH_MAX = 92
const SETTABLE_DAYS = 180

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
  if (body !== undefined && !Buffer.isBuffer(body)) finalHeaders['content-type'] = 'application/json'
  if (token) finalHeaders.authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
  })
  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('json') ? await res.json() : null
  return { status: res.status, data, contentType }
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function uploadWorks(token, count, prefix) {
  const fileIds = []
  for (let index = 0; index < count; index += 1) {
    const sign = await request('POST', '/api/upload/sign', {
      token,
      body: {
        scene: 'portfolio',
        fileName: `${prefix}-${index}.png`,
        mimeType: 'image/png',
        size: PNG.length,
      },
    })
    if (sign.status !== 200) throw new Error(`签名失败：${JSON.stringify(sign.data)}`)

    const uploaded = await request('PUT', sign.data.data.uploadPath, {
      body: PNG,
      headers: { 'content-type': 'image/png' },
    })
    if (uploaded.status !== 200) throw new Error(`上传失败：${JSON.stringify(uploaded.data)}`)
    fileIds.push(sign.data.data.fileId)
  }
  return fileIds
}

function applyPayload(fileIds, overrides = {}) {
  return {
    name: '林小满',
    city: '上海',
    district: '浦东新区',
    years: 5,
    styles: ['fresh', 'bridal'],
    intro: '五年新娘跟妆经验',
    idCard: ID_CARD,
    works: fileIds.map((fileId) => ({ fileId })),
    agreed: true,
    ...overrides,
  }
}

/** 与服务端一致的 UTC 自然日 key */
function dayKey(offsetDays = 0) {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays))
    .toISOString()
    .slice(0, 10)
}

function dateOf(key) {
  return new Date(`${key}T00:00:00.000Z`)
}

function weekdayOf(key) {
  return dateOf(key).getUTCDay()
}

function monthKeyOf(key) {
  return key.slice(0, 7)
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

async function createArtistAccount(code, stamp) {
  const account = await createAccount(code, 'artist')
  const works = await uploadWorks(account.token, 6, code)
  const applied = await request('POST', '/api/artist/apply', {
    token: account.token,
    body: applyPayload(works),
  })
  return { ...account, artistId: (applied.data.data || {}).id }
}

async function main() {
  console.log(`[verify] base=${BASE}`)

  const stamp = Date.now()
  const created = { userIds: [], artistIds: [] }

  // ---------- 准备账号 ----------
  const accountA = await createArtistAccount(`dev-openid-e6a-${stamp}`, stamp)
  created.userIds.push(accountA.userId)
  created.artistIds.push(accountA.artistId)
  check('准备：化妆师 A 入驻成功', !!accountA.artistId, JSON.stringify(accountA).slice(0, 160))

  const accountB = await createArtistAccount(`dev-openid-e6b-${stamp}`, stamp)
  created.userIds.push(accountB.userId)
  created.artistIds.push(accountB.artistId)
  check('准备：化妆师 B 入驻成功', !!accountB.artistId)

  const noProfile = await createAccount(`dev-openid-e6c-${stamp}`, 'artist')
  created.userIds.push(noProfile.userId)

  const customer = await createAccount(`dev-openid-e6d-${stamp}`, 'customer')
  created.userIds.push(customer.userId)

  // ---------- E6-03 按月查询 ----------
  console.log('\n[E6-03] 档期按月查询')

  const anonymous = await request('GET', '/api/schedule')
  check('未登录查询 → 401/40100', anonymous.status === 401 && anonymous.data.code === 40100)

  const notApplied = await request('GET', '/api/schedule', { token: noProfile.token })
  check('未入驻化妆师 → 404/40400', notApplied.status === 404 && notApplied.data.code === 40400)

  const wrongRole = await request('GET', '/api/schedule', { token: customer.token })
  check('非化妆师角色 → 403/40300', wrongRole.status === 403 && wrongRole.data.code === 40300)

  const currentMonth = monthKeyOf(dayKey())
  const monthView = await request('GET', `/api/schedule?month=${currentMonth}`, {
    token: accountA.token,
  })
  const monthData = (monthView.data && monthView.data.data) || {}
  const daysInMonth = new Date(
    Number(currentMonth.slice(0, 4)),
    Number(currentMonth.slice(5, 7)),
    0,
  ).getDate()
  check(
    '整月返回且默认全部未设置',
    monthView.status === 200 &&
      monthData.days.length === daysInMonth &&
      monthData.days.every((day) => day.state === 'none') &&
      monthData.summary.none === daysInMonth,
    JSON.stringify(monthData.summary || {}),
  )
  check(
    '返回可设置窗口（今天 ~ +180 天）',
    monthData.settable &&
      monthData.settable.minDate === dayKey() &&
      monthData.settable.maxDate === dayKey(SETTABLE_DAYS),
    JSON.stringify(monthData.settable || {}),
  )
  check(
    '星期字段与真实星期一致',
    monthData.days[0].weekday === weekdayOf(monthData.days[0].date),
    `${monthData.days[0].date} -> ${monthData.days[0].weekday}`,
  )

  const badMonth = await request('GET', '/api/schedule?month=2026-13', {
    token: accountA.token,
  })
  check('月份格式错误 → 400/40001', badMonth.status === 400 && badMonth.data.code === 40001)

  const nextMonth = await request('GET', `/api/schedule?month=${monthKeyOf(dayKey(32))}`, {
    token: accountA.token,
  })
  check(
    '查询下个月返回对应月份',
    nextMonth.status === 200 && nextMonth.data.data.month === monthKeyOf(dayKey(32)),
  )

  // ---------- E6-01 单日设置 ----------
  console.log('\n[E6-01] 单日档期设置')

  const tomorrow = dayKey(1)
  const setAvailable = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: tomorrow, state: 'available' },
  })
  check(
    '设为可接 → 200 且回显状态',
    setAvailable.status === 200 && setAvailable.data.data.state === 'available',
    JSON.stringify(setAvailable.data),
  )

  const viewAfterAvailable = await request('GET', `/api/schedule?month=${monthKeyOf(tomorrow)}`, {
    token: accountA.token,
  })
  const tomorrowRow = (viewAfterAvailable.data.data.days || []).find((day) => day.date === tomorrow)
  check(
    '查询回读到 available 且汇总同步',
    tomorrowRow && tomorrowRow.state === 'available' && viewAfterAvailable.data.data.summary.available >= 1,
  )

  const overwriteRest = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: tomorrow, state: 'rest' },
  })
  check('同一天重复设置只保留一条（改为休息）', overwriteRest.status === 200)

  const rows = await prisma.artistSchedule.findMany({
    where: { artistId: accountA.artistId, date: dateOf(tomorrow) },
  })
  check('数据库同日仅一条且为 rest', rows.length === 1 && rows[0].state === 'rest', `rows=${rows.length}`)

  const clearDay = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: tomorrow, state: 'none' },
  })
  const clearedRows = await prisma.artistSchedule.findMany({
    where: { artistId: accountA.artistId, date: dateOf(tomorrow) },
  })
  check('清空设置删除记录', clearDay.status === 200 && clearedRows.length === 0)

  const pastDay = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: dayKey(-1), state: 'available' },
  })
  check('过去日期 → 400', pastDay.status === 400 && pastDay.data.code === 40001)

  const tooFar = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: dayKey(SETTABLE_DAYS + 1), state: 'available' },
  })
  check('超过 180 天 → 400', tooFar.status === 400 && tooFar.data.code === 40001)

  const manualBooked = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: tomorrow, state: 'booked' },
  })
  check('手工设置 booked → 400（仅系统可占用）', manualBooked.status === 400)

  const invalidDate = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: '2026-02-30', state: 'available' },
  })
  check('不存在的日期 → 400', invalidDate.status === 400)

  const setByNoProfile = await request('PUT', '/api/schedule', {
    token: noProfile.token,
    body: { date: tomorrow, state: 'available' },
  })
  check('未入驻设置 → 404', setByNoProfile.status === 404)

  // ---------- E6-02 批量设置 ----------
  console.log('\n[E6-02] 批量设置')

  const windowStart = dayKey(1)
  const windowEnd = dayKey(14)
  const targetWeekdays = [1, 3]
  const expectedKeys = []
  for (let offset = 1; offset <= 14; offset += 1) {
    const key = dayKey(offset)
    if (targetWeekdays.indexOf(weekdayOf(key)) > -1) expectedKeys.push(key)
  }

  const batchByRange = await request('PUT', '/api/schedule/batch', {
    token: accountA.token,
    body: {
      state: 'available',
      startDate: windowStart,
      endDate: windowEnd,
      weekdays: targetWeekdays,
    },
  })
  check(
    '日期段 + 星期批量设置数量正确',
    batchByRange.status === 200 && batchByRange.data.data.updated === expectedKeys.length,
    JSON.stringify(batchByRange.data.data || {}),
  )

  const batchRows = await prisma.artistSchedule.findMany({
    where: { artistId: accountA.artistId, state: 'available' },
  })
  const batchKeys = batchRows.map((row) => row.date.toISOString().slice(0, 10)).sort()
  check(
    '批量结果与单日设置口径一致（只落在目标星期）',
    batchKeys.length === expectedKeys.length &&
      expectedKeys.every((key) => batchKeys.indexOf(key) > -1),
    JSON.stringify(batchKeys),
  )

  const singleSet = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: dayKey(20), state: 'rest' },
  })
  const batchOverSingle = await request('PUT', '/api/schedule/batch', {
    token: accountA.token,
    body: { state: 'available', dates: [dayKey(20)] },
  })
  const day20 = await prisma.artistSchedule.findFirst({
    where: { artistId: accountA.artistId, date: dateOf(dayKey(20)) },
  })
  check(
    '按日期数组批量覆盖单日设置',
    singleSet.status === 200 &&
      batchOverSingle.status === 200 &&
      batchOverSingle.data.data.updated === 1 &&
      day20.state === 'available',
    JSON.stringify(day20),
  )

  const reversed = await request('PUT', '/api/schedule/batch', {
    token: accountA.token,
    body: { state: 'rest', startDate: dayKey(5), endDate: dayKey(2) },
  })
  check('结束早于开始 → 400', reversed.status === 400)

  const tooWide = await request('PUT', '/api/schedule/batch', {
    token: accountA.token,
    body: { state: 'rest', startDate: dayKey(1), endDate: dayKey(BATCH_MAX + 2) },
  })
  check(`跨度超过 ${BATCH_MAX} 天 → 400`, tooWide.status === 400)

  const noDates = await request('PUT', '/api/schedule/batch', {
    token: accountA.token,
    body: { state: 'rest' },
  })
  check('既无日期也无日期段 → 400', noDates.status === 400)

  // ---------- E6-04 已占用保护与唯一索引 ----------
  console.log('\n[E6-04] 档期占用保护')

  const bookedDay = dayKey(3)
  await prisma.artistSchedule.upsert({
    where: { artistId_date: { artistId: accountA.artistId, date: dateOf(bookedDay) } },
    create: {
      artistId: accountA.artistId,
      date: dateOf(bookedDay),
      state: 'booked',
      serviceOrderId: 999901,
    },
    update: { state: 'booked', serviceOrderId: 999901 },
  })

  const editBooked = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: bookedDay, state: 'rest' },
  })
  check('已占用日期改为休息 → 409/40900', editBooked.status === 409 && editBooked.data.code === 40900)

  const clearBooked = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: bookedDay, state: 'none' },
  })
  check('已占用日期清空 → 409', clearBooked.status === 409)

  const batchSkip = await request('PUT', '/api/schedule/batch', {
    token: accountA.token,
    body: { state: 'rest', dates: [bookedDay, dayKey(4)] },
  })
  const bookedAfterBatch = await prisma.artistSchedule.findFirst({
    where: { artistId: accountA.artistId, date: dateOf(bookedDay) },
  })
  check(
    '批量设置自动跳过已占用日期',
    batchSkip.status === 200 &&
      batchSkip.data.data.skipped === 1 &&
      batchSkip.data.data.updated === 1 &&
      bookedAfterBatch.state === 'booked' &&
      bookedAfterBatch.serviceOrderId === 999901,
    JSON.stringify({ result: batchSkip.data.data, row: bookedAfterBatch }),
  )

  let duplicateRejected = false
  try {
    await prisma.artistSchedule.create({
      data: { artistId: accountA.artistId, date: dateOf(bookedDay), state: 'available' },
    })
  } catch (error) {
    duplicateRejected = (error && error.code) === 'P2002'
  }
  check('(artist_id, date) 唯一索引兜底并发写入', duplicateRejected)

  await prisma.artistSchedule.deleteMany({
    where: { artistId: accountA.artistId, date: dateOf(bookedDay) },
  })
  const afterRelease = await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: bookedDay, state: 'available' },
  })
  check('释放占用后可重新设置（取消订单路径）', afterRelease.status === 200)

  // ---------- 主页档期摘要联动 ----------
  console.log('\n[E5-04 联动] 主页档期摘要')

  await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: dayKey(1), state: 'available' },
  })
  await request('PUT', '/api/schedule', {
    token: accountA.token,
    body: { date: dayKey(2), state: 'rest' },
  })
  const profile = await request('GET', `/api/artist/${accountA.artistId}`, { token: accountA.token })
  const summaryDays = (profile.data.data || {}).schedule?.days || []
  check(
    '主页 14 天摘要与档期设置一致',
    profile.status === 200 &&
      summaryDays[0]?.date === dayKey() &&
      summaryDays[1]?.state === 'available' &&
      summaryDays[2]?.state === 'rest' &&
      summaryDays.length === 14,
    JSON.stringify(summaryDays.slice(0, 3)),
  )

  const profileB = await request('GET', `/api/artist/${accountB.artistId}`, { token: accountB.token })
  const bDays = (profileB.data.data || {}).schedule?.days || []
  check(
    '档期按 artistId 隔离（B 不受 A 影响）',
    bDays.length === 14 && bDays.every((day) => day.state === 'none'),
    JSON.stringify(bDays.slice(0, 3)),
  )

  // ---------- 接口文档 ----------
  console.log('\n[E6-08] 接口文档')

  const doc = await request('GET', '/api-docs/openapi.json')
  const paths = (doc.data && doc.data.paths) || {}
  check(
    'OpenAPI 包含档期三接口',
    !!paths['/api/schedule'] &&
      !!paths['/api/schedule'].get &&
      !!paths['/api/schedule'].put &&
      !!paths['/api/schedule/batch'] &&
      !!paths['/api/schedule/batch'].put,
  )

  // ---------- 清理 ----------
  for (const artistId of created.artistIds) {
    if (!artistId) continue
    await prisma.artist.deleteMany({ where: { id: artistId } })
  }
  const staleUsers = await prisma.userAuth.findMany({
    where: { openid: { startsWith: 'dev-openid-e6' } },
    select: { id: true },
  })
  const userIds = Array.from(new Set([...created.userIds, ...staleUsers.map((user) => user.id)]))
  await prisma.artist.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.customer.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.fileObject.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.userAuth.deleteMany({ where: { id: { in: userIds } } })

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
