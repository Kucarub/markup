/* eslint-disable */
/**
 * E13 冒烟验证脚本（可重复执行）：node scripts/verify-e13.cjs
 * 覆盖 E13-01 ~ E13-03 的服务端验收点：
 * 5 类规范事件落库、客户端埋点上报、每日聚合幂等与口径核对、
 * 看板区间/补零/权限、OpenAPI 0.9.2。
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

/** 以 UTC 零点表示自然日，与 stats 聚合口径一致 */
function dayKey(offsetDays = 0) {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays))
    .toISOString()
    .slice(0, 10)
}

function dayValue(offsetDays = 0) {
  return new Date(`${dayKey(offsetDays)}T00:00:00.000Z`)
}

function round4(value) {
  return Math.round(value * 10000) / 10000
}

/** 埋点为异步写入，轮询等待落库 */
async function waitFor(fn, timeout = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const result = await fn()
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

async function createAccount(code, role) {
  const login = await request('POST', '/api/auth/wx-login', { body: { code } })
  if (login.status !== 200) throw new Error(`wx-login 失败：${JSON.stringify(login.data)}`)
  const userId = login.data.data.userId
  if (!role) return { userId, token: login.data.data.accessToken }
  const assigned = await request('POST', '/api/auth/role', {
    token: login.data.data.accessToken,
    body: { role },
  })
  if (assigned.status !== 200) throw new Error(`选择身份失败：${JSON.stringify(assigned.data)}`)
  return { userId, token: assigned.data.data.accessToken }
}

async function main() {
  console.log(`[verify] base=${BASE}`)
  const stamp = Date.now()
  const city = '上海'
  const created = {
    userIds: [],
    openids: [],
    artistIds: [],
    customerIds: [],
    demandIds: [],
    orderIds: [],
    adminIds: [],
  }

  const maxEvent = await prisma.eventLog.aggregate({ _max: { id: true } })
  const maxEventId = maxEvent._max.id || 0

  // ---------- 准备账号 ----------
  const adminLogin = await request('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'Admin@123456' },
  })
  const adminToken = adminLogin.data && adminLogin.data.data && adminLogin.data.data.accessToken
  console.log(
    `\n[准备] 后台登录 status=${adminLogin.status} role=${adminLogin.data && adminLogin.data.data && adminLogin.data.data.admin.role}`,
  )

  const cust = await createAccount(`dev-openid-e13c-${stamp}`, 'customer')
  const artOk = await createAccount(`dev-openid-e13a-${stamp}`, 'artist')
  const newbie = await createAccount(`dev-openid-e13n-${stamp}`, null)
  created.userIds.push(cust.userId, artOk.userId, newbie.userId)
  created.openids.push(
    `dev-openid-e13c-${stamp}`,
    `dev-openid-e13a-${stamp}`,
    `dev-openid-e13n-${stamp}`,
  )

  const artist = await prisma.artist.create({
    data: {
      userId: artOk.userId,
      name: `E13 化妆师-${stamp}`,
      city,
      district: '静安区',
      years: 5,
      styles: ['bridal'],
      status: 'approved',
      auditAt: new Date(),
    },
  })
  created.artistIds.push(artist.id)

  // 定向预约要求化妆师当日档期为可接（E9-03）
  await prisma.artistSchedule.create({
    data: { artistId: artist.id, date: dayValue(7), state: 'available' },
  })

  const profile = await request('GET', '/api/customer/me', { token: cust.token })
  created.customerIds.push(profile.data.data.id)

  // 发布需求需先绑定手机号（E7 规则）
  const phone = `137${String(stamp).slice(-8)}`
  const bound = await request('POST', '/api/auth/phone', {
    token: cust.token,
    body: { code: phone },
  })
  if (bound.status !== 200) throw new Error(`绑定手机号失败：${JSON.stringify(bound.data)}`)

  // auditor 账号：复用种子 admin 的密码哈希，仅改角色
  const adminRow = await prisma.adminUser.findUnique({ where: { username: 'admin' } })
  const auditor = await prisma.adminUser.create({
    data: {
      username: `e13audit${stamp}`.slice(0, 32),
      passwordHash: adminRow.passwordHash,
      role: 'auditor',
    },
  })
  created.adminIds.push(auditor.id)
  const auditorLogin = await request('POST', '/api/admin/auth/login', {
    body: { username: auditor.username, password: 'Admin@123456' },
  })
  const auditorToken = auditorLogin.data.data.accessToken

  // ---------- E13-01 埋点 ----------
  console.log('\n[E13-01] 埋点事件规范与上报')
  const registerEvent = await waitFor(() =>
    prisma.eventLog.findFirst({
      where: { event: 'user_register', userId: newbie.userId },
      orderBy: { id: 'desc' },
    }),
  )
  check(
    '首次登录写入 user_register（仅建档时）',
    !!registerEvent && registerEvent.props.channel === 'wechat',
    JSON.stringify(registerEvent && registerEvent.props),
  )

  const clientEvent = await request('POST', '/api/events', {
    body: { event: 'search_artists', props: { city, keyword: '新娘' } },
  })
  const clientRow = clientEvent.data
    ? await waitFor(() => prisma.eventLog.findUnique({ where: { id: clientEvent.data.data.id } }))
    : null
  check(
    '客户端埋点上报落库（游客可上报）',
    clientEvent.status === 200 && !!clientRow && clientRow.event === 'search_artists',
    JSON.stringify(clientEvent.data),
  )

  const badEvent = await request('POST', '/api/events', { body: { event: 'Bad-Name' } })
  check('事件名不合规 → 400/40001', badEvent.status === 400 && badEvent.data.code === 40001, JSON.stringify(badEvent.data))
  const ping = await request('GET', '/api/ping')
  check('异常埋点不影响主流程（/api/ping 正常）', ping.status === 200, JSON.stringify(ping.data))

  const deviceId = `e13-device-${stamp}-abcdefgh`
  const visit = await request('POST', `/api/artist/${artist.id}/visit`, { body: { deviceId } })
  check(
    '主页访问去重成功并累加 UV',
    visit.status === 200 && visit.data.data.deduped === false && visit.data.data.uv >= 1,
    JSON.stringify(visit.data && visit.data.data),
  )
  const visitAgain = await request('POST', `/api/artist/${artist.id}/visit`, { body: { deviceId } })
  check('同设备同日重复访问去重', visitAgain.status === 200 && visitAgain.data.data.deduped === true)
  const visitEvent = await waitFor(() =>
    prisma.eventLog.findFirst({ where: { event: 'artist_page_view' }, orderBy: { id: 'desc' } }),
  )
  check(
    '主页访问事件落库（props.artistId）',
    !!visitEvent && visitEvent.props.artistId === artist.id,
    JSON.stringify(visitEvent && visitEvent.props),
  )

  const demand = await request('POST', '/api/demands', {
    token: cust.token,
    body: {
      city,
      district: '静安区',
      serviceDate: dayKey(6),
      serviceType: 'bridal',
      headcount: 1,
      budgetMin: 800,
      budgetMax: 1200,
      remark: `E13 冒烟-${stamp}`,
    },
  })
  const demandId = demand.data && demand.data.data && demand.data.data.id
  if (!demandId) throw new Error(`发布需求失败：${JSON.stringify(demand.data)}`)
  created.demandIds.push(demandId)
  const publishEvent = await waitFor(() =>
    prisma.eventLog.findFirst({
      where: { event: 'demand_publish', userId: cust.userId },
      orderBy: { id: 'desc' },
    }),
  )
  check(
    '需求发布事件落库（props.demandId 匹配）',
    !!publishEvent && publishEvent.props.demandId === demandId && publishEvent.role === 'customer',
    JSON.stringify(publishEvent && publishEvent.props),
  )

  const respond = await request('POST', `/api/demands/${demandId}/respond`, {
    token: artOk.token,
    body: { note: `E13 响应-${stamp}` },
  })
  check('化妆师响应需求成功', respond.status === 200, JSON.stringify(respond.data))
  const respondEvent = await waitFor(() =>
    prisma.eventLog.findFirst({
      where: { event: 'demand_response', userId: artOk.userId },
      orderBy: { id: 'desc' },
    }),
  )
  check(
    '需求响应事件落库（props.demandId / responseId）',
    !!respondEvent && respondEvent.props.demandId === demandId && !!respondEvent.props.responseId,
    JSON.stringify(respondEvent && respondEvent.props),
  )

  // 定向需求 → 接单 → 双方确认完成，验证 order_finish 埋点
  const targeted = await request('POST', '/api/demands', {
    token: cust.token,
    body: {
      city,
      district: '静安区',
      serviceDate: dayKey(7),
      serviceType: 'bridal',
      headcount: 1,
      budgetMin: 1000,
      budgetMax: 1500,
      targetArtistId: artist.id,
      remark: `E13 定向-${stamp}`,
    },
  })
  const targetedId = targeted.data.data.id
  created.demandIds.push(targetedId)
  const accepted = await request('POST', `/api/demands/${targetedId}/accept`, { token: artOk.token })
  const orderId = accepted.data && accepted.data.data && accepted.data.data.serviceOrder.id
  if (!orderId) throw new Error(`接单失败：${JSON.stringify(accepted.data)}`)
  created.orderIds.push(orderId)
  const confirmed = await request('POST', `/api/service-orders/${orderId}/confirm`, { token: cust.token })
  const firstFinish = await request('POST', `/api/service-orders/${orderId}/finish`, { token: artOk.token })
  const secondFinish = await request('POST', `/api/service-orders/${orderId}/finish`, { token: cust.token })
  check(
    '服务记录双方确认完成',
    confirmed.status === 200 &&
      firstFinish.status === 200 &&
      secondFinish.status === 200 &&
      secondFinish.data.data.status === 'finished',
    JSON.stringify({ confirmed: confirmed.status, first: firstFinish.status, second: secondFinish.status }),
  )
  const finishEvent = await waitFor(() =>
    prisma.eventLog.findFirst({
      where: { event: 'order_finish', userId: cust.userId },
      orderBy: { id: 'desc' },
    }),
  )
  check(
    '服务完成事件落库（props.orderId，非自动完成）',
    !!finishEvent && finishEvent.props.orderId === orderId && finishEvent.props.auto !== true,
    JSON.stringify(finishEvent && finishEvent.props),
  )

  // ---------- E13-02 每日聚合 ----------
  console.log('\n[E13-02] 每日聚合与幂等')
  const today = dayKey(0)
  const todayStart = dayValue(0)
  const tomorrowStart = dayValue(1)

  const firstAgg = await request('POST', '/api/admin/stats/aggregate', {
    token: adminToken,
    body: { date: today },
  })
  const secondAgg = await request('POST', '/api/admin/stats/aggregate', {
    token: adminToken,
    body: { date: today },
  })
  const aggRow = firstAgg.data && firstAgg.data.data && firstAgg.data.data.rows[0]
  check(
    '手动聚合单日返回该日指标',
    firstAgg.status === 200 && firstAgg.data.data.days === 1 && aggRow && aggRow.date === today,
    JSON.stringify(firstAgg.data && firstAgg.data.data),
  )
  check(
    '重跑同一天结果一致（幂等）',
    JSON.stringify(secondAgg.data && secondAgg.data.data.rows) ===
      JSON.stringify(firstAgg.data && firstAgg.data.data.rows),
    JSON.stringify(secondAgg.data && secondAgg.data.data.rows),
  )

  const range = { gte: todayStart, lt: tomorrowStart }
  const [regCount, uvCount, demandCount, respondedCount, responseCount, orderCount, finishedCount] =
    await Promise.all([
      prisma.userAuth.count({ where: { createdAt: range } }),
      prisma.artistVisit.count({ where: { visitDate: todayStart } }),
      prisma.demand.count({ where: { createdAt: range } }),
      prisma.demand.count({ where: { createdAt: range, responses: { some: {} } } }),
      prisma.demandResponse.count({ where: { createdAt: range } }),
      prisma.serviceOrder.count({ where: { createdAt: range } }),
      prisma.serviceOrder.count({ where: { createdAt: range, status: 'finished' } }),
    ])

  check('聚合注册数与 user_auth 一致', aggRow && aggRow.registrations === regCount, `${aggRow && aggRow.registrations} vs ${regCount}`)
  check('聚合主页 UV 与 artist_visit 一致', aggRow && aggRow.artistPageUv === uvCount, `${aggRow && aggRow.artistPageUv} vs ${uvCount}`)
  check(
    '聚合需求数 / 响应数与业务表一致',
    aggRow && aggRow.demands === demandCount && aggRow.responses === responseCount,
    JSON.stringify({ agg: { demands: aggRow && aggRow.demands, responses: aggRow && aggRow.responses }, db: { demandCount, responseCount } }),
  )
  check(
    '响应率口径 = 有响应需求数 ÷ 需求数',
    aggRow && aggRow.responseRate === (demandCount > 0 ? round4(respondedCount / demandCount) : 0),
    `${aggRow && aggRow.responseRate} vs ${demandCount > 0 ? round4(respondedCount / demandCount) : 0}`,
  )
  check(
    '聚合服务记录数与完成率一致',
    aggRow &&
      aggRow.serviceOrders === orderCount &&
      aggRow.completionRate === (orderCount > 0 ? round4(finishedCount / orderCount) : 0),
    JSON.stringify({ agg: { orders: aggRow && aggRow.serviceOrders, rate: aggRow && aggRow.completionRate }, db: { orderCount, finishedCount } }),
  )
  check(
    '7 日留存口径落在 0–1',
    aggRow && aggRow.retentionD7 >= 0 && aggRow.retentionD7 <= 1,
    JSON.stringify(aggRow && aggRow.retentionD7),
  )

  const persisted = await prisma.statsDaily.findUnique({ where: { date: todayStart } })
  check(
    'stats_daily 已持久化当日指标',
    !!persisted && persisted.registrations === aggRow.registrations && persisted.demands === aggRow.demands,
    JSON.stringify(persisted && { registrations: persisted.registrations, demands: persisted.demands }),
  )

  const rangeAgg = await request('POST', '/api/admin/stats/aggregate', {
    token: adminToken,
    body: { from: dayKey(-2), to: today },
  })
  check(
    '区间聚合逐日返回 3 条',
    rangeAgg.status === 200 && rangeAgg.data.data.days === 3 && rangeAgg.data.data.rows.length === 3,
    JSON.stringify(rangeAgg.data && rangeAgg.data.data.days),
  )

  const futureAgg = await request('POST', '/api/admin/stats/aggregate', {
    token: adminToken,
    body: { date: dayKey(1) },
  })
  check('聚合未来日期 → 400/40001', futureAgg.status === 400 && futureAgg.data.code === 40001, JSON.stringify(futureAgg.data))
  const conflictAgg = await request('POST', '/api/admin/stats/aggregate', {
    token: adminToken,
    body: { date: today, from: today },
  })
  check('date 与 from/to 同时传 → 400/40001', conflictAgg.status === 400 && conflictAgg.data.code === 40001, JSON.stringify(conflictAgg.data))
  const wideAgg = await request('POST', '/api/admin/stats/aggregate', {
    token: adminToken,
    body: { from: '2020-01-01', to: today },
  })
  check('聚合区间超过 90 天 → 400/40001', wideAgg.status === 400 && wideAgg.data.code === 40001, JSON.stringify(wideAgg.data))
  const auditorAgg = await request('POST', '/api/admin/stats/aggregate', {
    token: auditorToken,
    body: { date: today },
  })
  check('auditor 重跑聚合 → 403/40300', auditorAgg.status === 403 && auditorAgg.data.code === 40300, JSON.stringify(auditorAgg.data))

  // ---------- E13-03 看板 ----------
  console.log('\n[E13-03] 看板数据与区间联动')
  // 先补跑 7 天区间聚合，避免历史日缺行导致 totals 与当前业务表不一致
  const backfill = await request('POST', '/api/admin/stats/aggregate', {
    token: adminToken,
    body: { from: dayKey(-6), to: today },
  })
  check(
    '区间补跑聚合 7 天',
    backfill.status === 200 && backfill.data.data.days === 7,
    JSON.stringify(backfill.data && backfill.data.data.days),
  )

  const dash7 = await request('GET', `/api/admin/stats/dashboard?from=${dayKey(-6)}&to=${today}`, {
    token: adminToken,
  })
  const d7 = (dash7.data && dash7.data.data) || {}
  check(
    '看板返回 7 天逐日序列（日期升序、无缺日）',
    dash7.status === 200 &&
      d7.days === 7 &&
      d7.series.length === 7 &&
      d7.series[0].date === dayKey(-6) &&
      d7.series[6].date === today,
    JSON.stringify(d7.series && d7.series.map((item) => item.date)),
  )

  const weekStart = dayValue(-6)
  const [weekReg, weekUv, weekDemand] = await Promise.all([
    prisma.userAuth.count({ where: { createdAt: { gte: weekStart, lt: tomorrowStart } } }),
    prisma.artistVisit.count({ where: { visitDate: { gte: weekStart, lte: todayStart } } }),
    prisma.demand.count({ where: { createdAt: { gte: weekStart, lt: tomorrowStart } } }),
  ])
  check('看板注册数与数据库一致', d7.totals && d7.totals.registrations === weekReg, `${d7.totals && d7.totals.registrations} vs ${weekReg}`)
  check('看板主页 UV 与数据库一致', d7.totals && d7.totals.artistPageUv === weekUv, `${d7.totals && d7.totals.artistPageUv} vs ${weekUv}`)
  check('看板需求数与数据库一致', d7.totals && d7.totals.demands === weekDemand, `${d7.totals && d7.totals.demands} vs ${weekDemand}`)
  check(
    '看板比率均在 0–1 之间',
    d7.totals &&
      [d7.totals.responseRate, d7.totals.completionRate, d7.totals.retentionD7].every(
        (value) => typeof value === 'number' && value >= 0 && value <= 1,
      ),
    JSON.stringify(d7.totals),
  )
  check(
    '每日序列包含 8 个指标字段',
    d7.series &&
      d7.series.every((row) =>
        ['registrations', 'artistPageUv', 'demands', 'responses', 'responseRate', 'serviceOrders', 'completionRate', 'retentionD7'].every(
          (key) => typeof row[key] === 'number',
        ),
      ),
  )
  check(
    '今日序列与当日聚合一致',
    d7.series && d7.series[6].registrations === aggRow.registrations && d7.series[6].demands === aggRow.demands,
    JSON.stringify(d7.series && d7.series[6]),
  )
  check(
    '看板返回运营待办四项计数',
    d7.counts &&
      ['pendingArtists', 'disabledUsers', 'pendingOrders', 'finishedOrders'].every(
        (key) => typeof d7.counts[key] === 'number',
      ),
    JSON.stringify(d7.counts),
  )

  const dash30 = await request('GET', `/api/admin/stats/dashboard?from=${dayKey(-29)}&to=${today}`, {
    token: adminToken,
  })
  check(
    '切换 30 天区间图表联动（序列长度同步）',
    dash30.status === 200 && dash30.data.data.days === 30 && dash30.data.data.series.length === 30,
    JSON.stringify(dash30.data && dash30.data.data.days),
  )

  const emptyDash = await request('GET', '/api/admin/stats/dashboard?from=2000-01-01&to=2000-01-05', {
    token: adminToken,
  })
  const emptyData = (emptyDash.data && emptyDash.data.data) || {}
  check(
    '空区间返回 5 天全 0，不报错',
    emptyDash.status === 200 &&
      emptyData.days === 5 &&
      emptyData.series.length === 5 &&
      emptyData.series.every(
        (row) => row.registrations === 0 && row.demands === 0 && row.serviceOrders === 0 && row.responseRate === 0,
      ) &&
      emptyData.totals.demands === 0 &&
      emptyData.totals.completionRate === 0,
    JSON.stringify(emptyData.totals),
  )

  const wideDash = await request('GET', `/api/admin/stats/dashboard?from=2020-01-01&to=${today}`, {
    token: adminToken,
  })
  check('看板区间超过 90 天 → 400/40001', wideDash.status === 400 && wideDash.data.code === 40001, JSON.stringify(wideDash.data))
  const auditorDash = await request('GET', '/api/admin/stats/dashboard', { token: auditorToken })
  check('auditor 可读看板', auditorDash.status === 200, JSON.stringify(auditorDash.data && auditorDash.data.code))
  const customerDash = await request('GET', '/api/admin/stats/dashboard', { token: cust.token })
  check('客户 token 访问看板 → 403/40300', customerDash.status === 403 && customerDash.data.code === 40300)
  const anonymousDash = await request('GET', '/api/admin/stats/dashboard')
  check('未登录访问看板 → 401/40100', anonymousDash.status === 401 && anonymousDash.data.code === 40100)

  // ---------- OpenAPI ----------
  console.log('\n[E13] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const docData = (doc.data && doc.data) || {}
  const expectedPaths = ['/api/admin/stats/dashboard', '/api/admin/stats/aggregate']
  check(
    'OpenAPI 已包含 E13 接口',
    expectedPaths.every((path) => !!docData.paths[path]),
    JSON.stringify(expectedPaths.filter((path) => !docData.paths[path])),
  )
  check(
    'OpenAPI 版本不低于 0.9.2',
    Boolean(
      docData.info &&
        /^\d+\.\d+\.\d+$/.test(docData.info.version) &&
        docData.info.version.localeCompare('0.9.2', undefined, { numeric: true }) >= 0,
    ),
    docData.info && docData.info.version,
  )

  // ---------- 清理 ----------
  await prisma.review.deleteMany({
    where: { OR: [{ fromUserId: { in: created.userIds } }, { toUserId: { in: created.userIds } }] },
  })
  await prisma.serviceOrder.deleteMany({
    where: {
      OR: [{ customerId: { in: created.customerIds } }, { artistId: { in: created.artistIds } }],
    },
  })
  await prisma.demandResponse.deleteMany({
    where: { OR: [{ artistId: { in: created.artistIds } }, { demandId: { in: created.demandIds } }] },
  })
  await prisma.demand.deleteMany({ where: { id: { in: created.demandIds } } })
  await prisma.artistSchedule.deleteMany({ where: { artistId: { in: created.artistIds } } })
  await prisma.artistVisit.deleteMany({ where: { artistId: { in: created.artistIds } } })
  await prisma.eventLog.deleteMany({ where: { id: { gt: maxEventId } } })
  await prisma.creditScore.deleteMany({ where: { userId: { in: created.userIds } } })
  await prisma.customer.deleteMany({ where: { userId: { in: created.userIds } } })
  await prisma.artist.deleteMany({ where: { id: { in: created.artistIds } } })
  await prisma.userAuth.deleteMany({ where: { openid: { in: created.openids } } })
  await prisma.adminUser.deleteMany({ where: { id: { in: created.adminIds } } })

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
