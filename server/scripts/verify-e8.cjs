/* eslint-disable */
/**
 * E8 冒烟验证脚本（可重复执行）：node scripts/verify-e8.cjs
 * 覆盖 E8-01 ~ E8-06 / E8-08 的服务端验收点：
 * 需求大厅过滤、需求详情四视角、响应唯一与状态校验、择一确认与服务记录、
 * 响应者列表、找化妆师搜索与筛选、埋点上报与后台统计、接口文档。
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

function dayValue(offsetDays = 0) {
  return new Date(`${dayKey(offsetDays)}T00:00:00.000Z`)
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
    stylePrefs: ['fresh'],
    remark: '希望清透底妆',
    ...overrides,
  }
}

async function main() {
  console.log(`[verify] base=${BASE}`)
  const stamp = Date.now()
  const created = { userIds: [], openids: [], artistIds: [], eventIds: [] }
  const city = `测试城E8-${stamp}`

  // ---------- 准备：客户与化妆师账号 ----------
  const cust = await createAccount(`dev-openid-e8c1-${stamp}`, 'customer')
  const cust2 = await createAccount(`dev-openid-e8c2-${stamp}`, 'customer')
  const artA = await createAccount(`dev-openid-e8a-${stamp}`, 'artist')
  const artB = await createAccount(`dev-openid-e8b-${stamp}`, 'artist')
  const artC = await createAccount(`dev-openid-e8x-${stamp}`, 'artist')
  const artPending = await createAccount(`dev-openid-e8p-${stamp}`, 'artist')
  created.userIds.push(cust.userId, cust2.userId, artA.userId, artB.userId, artC.userId, artPending.userId)
  created.openids.push(
    `dev-openid-e8c1-${stamp}`,
    `dev-openid-e8c2-${stamp}`,
    `dev-openid-e8a-${stamp}`,
    `dev-openid-e8b-${stamp}`,
    `dev-openid-e8x-${stamp}`,
    `dev-openid-e8p-${stamp}`,
  )

  // 选角色即自动建档，这里按 userId 覆盖为测试资料
  const artistA = await prisma.artist.upsert({
    where: { userId: artA.userId },
    update: {
      name: `E8 化妆师A-${stamp}`,
      city,
      district: '测试区',
      years: 6,
      styles: ['fresh'],
      status: 'approved',
      profileCompleted: true,
      lat: 31.2304,
      lng: 121.4737,
    },
    create: {
      userId: artA.userId,
      name: `E8 化妆师A-${stamp}`,
      city,
      district: '测试区',
      years: 6,
      styles: ['fresh'],
      status: 'approved',
      profileCompleted: true,
      lat: 31.2304,
      lng: 121.4737,
    },
  })
  const artistB = await prisma.artist.upsert({
    where: { userId: artB.userId },
    update: {
      name: `E8 化妆师B-${stamp}`,
      city,
      district: '测试区',
      years: 1,
      styles: ['retro'],
      status: 'approved',
      profileCompleted: true,
      lat: 31.4,
      lng: 121.6,
    },
    create: {
      userId: artB.userId,
      name: `E8 化妆师B-${stamp}`,
      city,
      district: '测试区',
      years: 1,
      styles: ['retro'],
      status: 'approved',
      profileCompleted: true,
      lat: 31.4,
      lng: 121.6,
    },
  })
  const artistC = await prisma.artist.upsert({
    where: { userId: artC.userId },
    update: {
      name: `E8 化妆师C-${stamp}`,
      city,
      district: '测试区',
      years: 3,
      styles: ['fresh', 'retro'],
      status: 'approved',
      profileCompleted: true,
      lat: 31.2306,
      lng: 121.4739,
    },
    create: {
      userId: artC.userId,
      name: `E8 化妆师C-${stamp}`,
      city,
      district: '测试区',
      years: 3,
      styles: ['fresh', 'retro'],
      status: 'approved',
      profileCompleted: true,
      lat: 31.2306,
      lng: 121.4739,
    },
  })
  // 历史遗留 pending 数据（新流程不再产生），验证不可见 / 不可响应
  const artistPending = await prisma.artist.upsert({
    where: { userId: artPending.userId },
    update: {
      name: `E8 待审化妆师-${stamp}`,
      city,
      district: '测试区',
      years: 9,
      styles: ['fresh'],
      status: 'pending',
      lat: 31.2304,
      lng: 121.4737,
    },
    create: {
      userId: artPending.userId,
      name: `E8 待审化妆师-${stamp}`,
      city,
      district: '测试区',
      years: 9,
      styles: ['fresh'],
      status: 'pending',
      lat: 31.2304,
      lng: 121.4737,
    },
  })
  created.artistIds.push(artistA.id, artistB.id, artistC.id, artistPending.id)

  const profile = await request('GET', '/api/customer/me', { token: cust.token })
  const customerId = profile.data.data.id

  // ---------- E8-01 需求大厅 ----------
  console.log('\n[E8-01] 需求大厅')
  const created1 = await request('POST', '/api/demands', { token: cust.token, body: demandBody() })
  const demand1 = created1.data.data
  check('发布待响应需求成功', created1.status === 200 && demand1.status === 'pending')

  const expiredDemand = await prisma.demand.create({
    data: {
      customerId,
      city: '上海',
      district: '静安区',
      serviceDate: dayValue(1),
      serviceType: 'daily',
      headcount: 1,
      budgetMin: 100,
      budgetMax: 200,
      status: 'pending',
      expireAt: new Date(Date.now() - 3600 * 1000),
    },
  })
  const closedDemand = await prisma.demand.create({
    data: {
      customerId,
      city: '上海',
      district: '静安区',
      serviceDate: dayValue(2),
      serviceType: 'photo',
      headcount: 1,
      budgetMin: 100,
      budgetMax: 200,
      status: 'closed',
      closedAt: new Date(),
      expireAt: new Date(Date.now() + 86400000),
    },
  })

  const hall = await request('GET', '/api/demands?scope=hall&size=100', { token: artA.token })
  const hallList = (hall.data.data || {}).list || []
  const hallIds = hallList.map((item) => item.id)
  check(
    '大厅包含待响应且未过期需求',
    hall.status === 200 && hallIds.includes(demand1.id),
    JSON.stringify({ total: hall.data.data && hall.data.data.total }),
  )
  check('大厅排除已过期需求', !hallIds.includes(expiredDemand.id))
  check('大厅排除已关闭需求', !hallIds.includes(closedDemand.id))
  check(
    '大厅卡片字段完整（日期/区域/类型/人数/预算/风格）',
    hallList.every(
      (item) =>
        item.serviceDate &&
        item.district &&
        item.serviceType &&
        item.headcount >= 1 &&
        typeof item.budgetMin === 'number' &&
        typeof item.budgetMax === 'number' &&
        Array.isArray(item.stylePrefs),
    ),
  )

  const hallByCustomer = await request('GET', '/api/demands?scope=hall', { token: cust.token })
  check('客户访问需求大厅 → 403/40300', hallByCustomer.status === 403 && hallByCustomer.data.code === 40300)

  const hallBridal = await request('GET', '/api/demands?scope=hall&serviceType=bridal&size=100', {
    token: artA.token,
  })
  check(
    '服务类型筛选生效',
    ((hallBridal.data.data || {}).list || []).every((item) => item.serviceType === 'bridal'),
  )

  // ---------- E8-02 需求详情 ----------
  console.log('\n[E8-02] 需求详情与可见性')
  const guestDetail = await request('GET', `/api/demands/${demand1.id}`)
  check('游客看需求详情 → 404/40400', guestDetail.status === 404 && guestDetail.data.code === 40400)

  const ownerDetail = await request('GET', `/api/demands/${demand1.id}`, { token: cust.token })
  check(
    '客户看自己的需求：isOwner=true 且不可响应',
    ownerDetail.status === 200 &&
      ownerDetail.data.data.isOwner === true &&
      ownerDetail.data.data.canRespond === false &&
      ownerDetail.data.data.canSelect === false,
    JSON.stringify(ownerDetail.data.data),
  )

  const artistDetail = await request('GET', `/api/demands/${demand1.id}`, { token: artA.token })
  check(
    '已通过化妆师可看详情且可响应',
    artistDetail.status === 200 &&
      artistDetail.data.data.canRespond === true &&
      artistDetail.data.data.respondBlockedReason === null &&
      !!artistDetail.data.data.customer.nickname,
    JSON.stringify(artistDetail.data.data),
  )

  const pendingDetail = await request('GET', `/api/demands/${demand1.id}`, { token: artPending.token })
  check('待审核化妆师看详情 → 404/40400', pendingDetail.status === 404)

  const foreignDetail = await request('GET', `/api/demands/${demand1.id}`, { token: cust2.token })
  check('其他客户看需求详情 → 404/40400', foreignDetail.status === 404)

  // ---------- E8-03 响应需求 ----------
  console.log('\n[E8-03] 响应需求')
  const respondA = await request('POST', `/api/demands/${demand1.id}/respond`, {
    token: artA.token,
    body: { note: '档期合适，可接' },
  })
  check(
    '响应成功且初始状态待选',
    respondA.status === 200 && respondA.data.data.status === 'pending' && respondA.data.data.responseCount === 1,
    JSON.stringify(respondA.data),
  )
  const responseAId = respondA.data.data.id

  const respondAgain = await request('POST', `/api/demands/${demand1.id}/respond`, {
    token: artA.token,
  })
  check('同一化妆师重复响应 → 409/40900', respondAgain.status === 409 && respondAgain.data.code === 40900)

  const respondB = await request('POST', `/api/demands/${demand1.id}/respond`, {
    token: artB.token,
    body: { note: '可提供跟妆' },
  })
  check(
    '第二位化妆师响应成功（responseCount=2）',
    respondB.status === 200 && respondB.data.data.responseCount === 2,
    JSON.stringify(respondB.data),
  )
  const responseBId = respondB.data.data.id

  const respondPending = await request('POST', `/api/demands/${demand1.id}/respond`, {
    token: artPending.token,
  })
  check('待审核化妆师响应 → 403/40300', respondPending.status === 403 && respondPending.data.code === 40300)

  const respondCustomer = await request('POST', `/api/demands/${demand1.id}/respond`, {
    token: cust.token,
  })
  check('客户响应需求 → 403/40300', respondCustomer.status === 403 && respondCustomer.data.code === 40300)

  const detailAfterRespond = await request('GET', `/api/demands/${demand1.id}`, { token: artA.token })
  check(
    '响应后详情按钮置已响应',
    detailAfterRespond.data.data.canRespond === false &&
      detailAfterRespond.data.data.myResponse.id === responseAId &&
      detailAfterRespond.data.data.respondBlockedReason === '你已响应过该需求',
    JSON.stringify(detailAfterRespond.data.data),
  )

  const hallAfterRespond = await request('GET', '/api/demands?scope=hall&size=100', { token: artA.token })
  const hallMine = ((hallAfterRespond.data.data || {}).list || []).find((item) => item.id === demand1.id)
  check(
    '大厅列表回显本人响应态',
    !!hallMine && hallMine.myResponseId === responseAId && hallMine.myResponseStatus === 'pending',
    JSON.stringify(hallMine),
  )

  // ---------- E8-04 响应者列表与择一确认 ----------
  console.log('\n[E8-04] 响应者列表与择一确认')
  const responses = await request('GET', `/api/demands/${demand1.id}/responses`, { token: cust.token })
  const responseList = (responses.data.data || {}).list || []
  check(
    '响应者列表返回 2 条且带化妆师卡片',
    responses.status === 200 &&
      responses.data.data.total === 2 &&
      responses.data.data.selectedResponseId === null &&
      responseList.every((item) => !!item.artist && !!item.artist.name),
    JSON.stringify(responses.data.data),
  )

  const responsesForeign = await request('GET', `/api/demands/${demand1.id}/responses`, { token: cust2.token })
  check('非需求所属客户看响应者 → 404/40400', responsesForeign.status === 404)

  const responsesByArtist = await request('GET', `/api/demands/${demand1.id}/responses`, {
    token: artA.token,
  })
  check('化妆师看响应者列表 → 403/40300', responsesByArtist.status === 403)

  const select = await request('POST', `/api/demands/${demand1.id}/select`, {
    token: cust.token,
    body: { responseId: responseAId },
  })
  check(
    '择一确认：需求置已选定并生成待确认服务记录',
    select.status === 200 &&
      select.data.data.demand.status === 'selected' &&
      select.data.data.serviceOrder.status === 'pending',
    JSON.stringify(select.data),
  )

  const serviceOrder = await prisma.serviceOrder.findUnique({ where: { demandId: demand1.id } })
  check(
    '服务记录落库且双方/日期/类型一致',
    !!serviceOrder &&
      serviceOrder.artistId === artistA.id &&
      serviceOrder.customerId === customerId &&
      serviceOrder.serviceType === 'bridal' &&
      serviceOrder.headcount === 1,
    JSON.stringify(serviceOrder),
  )

  const responsesAfter = await prisma.demandResponse.findMany({ where: { demandId: demand1.id } })
  check(
    '其余响应自动置未选中',
    responsesAfter.find((item) => item.id === responseAId)?.status === 'selected' &&
      responsesAfter.find((item) => item.id === responseBId)?.status === 'rejected',
    JSON.stringify(responsesAfter.map((item) => ({ id: item.id, status: item.status }))),
  )

  const selectAgain = await request('POST', `/api/demands/${demand1.id}/select`, {
    token: cust.token,
    body: { responseId: responseBId },
  })
  check('重复择一 → 409/40900', selectAgain.status === 409 && selectAgain.data.code === 40900)

  const respondSelected = await request('POST', `/api/demands/${demand1.id}/respond`, {
    token: artC.token,
  })
  check('已选定需求响应 → 409/40900', respondSelected.status === 409 && respondSelected.data.code === 40900)

  const detailSelected = await request('GET', `/api/demands/${demand1.id}`, { token: artA.token })
  check('已选定需求对化妆师不可见 → 404', detailSelected.status === 404)

  const ownerAfterSelect = await request('GET', `/api/demands/${demand1.id}`, { token: cust.token })
  check(
    '客户视角：已选定且不可再择一',
    ownerAfterSelect.status === 200 &&
      ownerAfterSelect.data.data.status === 'selected' &&
      ownerAfterSelect.data.data.statusLabel === '已选定' &&
      ownerAfterSelect.data.data.canSelect === false,
    JSON.stringify(ownerAfterSelect.data.data),
  )

  // ---------- E8-05 找化妆师列表 ----------
  console.log('\n[E8-05] 找化妆师列表')
  const searchAll = await request('GET', `/api/search/artists?city=${encodeURIComponent(city)}&size=100`)
  const searchIds = ((searchAll.data.data || {}).list || []).map((item) => item.id)
  check(
    '搜索返回已通过审核的化妆师',
    searchAll.status === 200 && searchIds.includes(artistA.id) && searchIds.includes(artistB.id),
    JSON.stringify({ total: searchAll.data.data && searchAll.data.data.total }),
  )
  check('待审核化妆师不出现在结果中', !searchIds.includes(artistPending.id))

  const searchPaged = await request(
    'GET',
    `/api/search/artists?city=${encodeURIComponent(city)}&page=1&size=2`,
  )
  check(
    '分页 total 准确且当页条数受 size 限制',
    searchPaged.data.data.total === 3 && searchPaged.data.data.list.length === 2,
    JSON.stringify({ total: searchPaged.data.data.total, length: searchPaged.data.data.list.length }),
  )

  const searchCard = (searchAll.data.data.list || []).find((item) => item.id === artistA.id)
  check(
    '卡片字段完整（风格/年限/最早可接日字段存在）',
    !!searchCard &&
      Array.isArray(searchCard.styles) &&
      typeof searchCard.years === 'number' &&
      'distanceKm' in searchCard &&
      'nextAvailableDate' in searchCard &&
      'coverPath' in searchCard,
    JSON.stringify(searchCard),
  )

  // ---------- E8-06 搜索与筛选 ----------
  console.log('\n[E8-06] 搜索筛选（风格 / 档期 / 半径 / 年限）')
  const byStyle = await request(
    'GET',
    `/api/search/artists?city=${encodeURIComponent(city)}&styles=fresh&size=100`,
  )
  const styleIds = ((byStyle.data.data || {}).list || []).map((item) => item.id)
  check(
    '风格筛选命中任一即匹配',
    styleIds.includes(artistA.id) && styleIds.includes(artistC.id) && !styleIds.includes(artistB.id),
    JSON.stringify(styleIds),
  )

  const byYears = await request(
    'GET',
    `/api/search/artists?city=${encodeURIComponent(city)}&yearsMin=4&size=100`,
  )
  const yearIds = ((byYears.data.data || {}).list || []).map((item) => item.id)
  check('年限筛选只保留 >= 年限者', yearIds.includes(artistA.id) && !yearIds.includes(artistC.id))

  await prisma.artistSchedule.create({
    data: { artistId: artistA.id, date: dayValue(2), state: 'available' },
  })
  const byDate = await request(
    'GET',
    `/api/search/artists?city=${encodeURIComponent(city)}&date=${dayKey(2)}&size=100`,
  )
  const dateIds = ((byDate.data.data || {}).list || []).map((item) => item.id)
  check(
    '指定日期只返回该日可接者',
    dateIds.includes(artistA.id) && !dateIds.includes(artistB.id) && !dateIds.includes(artistC.id),
    JSON.stringify(dateIds),
  )

  const byRadius = await request(
    'GET',
    `/api/search/artists?city=${encodeURIComponent(city)}&lat=31.2304&lng=121.4737&radiusKm=5&size=100`,
  )
  const radiusList = (byRadius.data.data || {}).list || []
  const radiusIds = radiusList.map((item) => item.id)
  check(
    '5km 半径过滤保留近处、排除远处',
    radiusIds.includes(artistA.id) && radiusIds.includes(artistC.id) && !radiusIds.includes(artistB.id),
    JSON.stringify(radiusIds),
  )
  check(
    '距离按球面距离计算且不超过半径',
    radiusList.every((item) => item.distanceKm !== null && item.distanceKm <= 5),
    JSON.stringify(radiusList.map((item) => item.distanceKm)),
  )

  const badRadius = await request('GET', `/api/search/artists?radiusKm=7`)
  check('非法距离档位 → 400/40001', badRadius.status === 400 && badRadius.data.code === 40001)

  // ---------- E8-08 埋点 ----------
  console.log('\n[E8-08] 埋点上报与后台统计')
  const eventGuest = await request('POST', '/api/events', {
    body: {
      event: 'search_artists',
      props: { city, styles: ['fresh'], radiusKm: 5, resultCount: 2 },
    },
  })
  check('游客埋点上报成功', eventGuest.status === 200 && !!eventGuest.data.data.id)
  if (eventGuest.data && eventGuest.data.data) created.eventIds.push(eventGuest.data.data.id)

  const eventUser = await request('POST', '/api/events', {
    token: artA.token,
    body: { event: 'artist_card_click', props: { artistId: artistA.id } },
  })
  check('登录态埋点上报成功', eventUser.status === 200)
  if (eventUser.data && eventUser.data.data) created.eventIds.push(eventUser.data.data.id)

  const badEvent = await request('POST', '/api/events', { body: { event: 'Search Artists' } })
  check('非法事件名 → 400/40001', badEvent.status === 400 && badEvent.data.code === 40001)

  const guestEventRow = await prisma.eventLog.findUnique({ where: { id: eventGuest.data.data.id } })
  check(
    'event_log 落库且游客无 userId',
    !!guestEventRow && guestEventRow.userId === null && guestEventRow.event === 'search_artists',
  )

  const adminLogin = await request('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'Admin@123456' },
  })
  const adminToken = adminLogin.data && adminLogin.data.data && adminLogin.data.data.accessToken
  check('后台管理员登录成功', adminLogin.status === 200 && !!adminToken)

  const statsByCity = await request(
    'GET',
    `/api/admin/stats/events?event=search_artists&key=city&from=${dayKey(0)}&to=${dayKey(0)}`,
    { token: adminToken },
  )
  const dimensionValues = (statsByCity.data.data.dimension || {}).values || []
  check(
    '后台可按事件 + 条件维度统计',
    statsByCity.status === 200 &&
      statsByCity.data.data.total >= 1 &&
      dimensionValues.some((item) => item.value === city && item.count >= 1),
    JSON.stringify(statsByCity.data.data),
  )

  const statsByCustomer = await request('GET', '/api/admin/stats/events', { token: cust.token })
  check('客户访问埋点统计 → 403/40300', statsByCustomer.status === 403)

  // ---------- 接口文档 ----------
  console.log('\n[E8] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const docData = (doc.data && doc.data) || {}
  const expectedPaths = [
    '/api/demands/{id}',
    '/api/demands/{id}/respond',
    '/api/demands/{id}/responses',
    '/api/demands/{id}/select',
    '/api/search/artists',
    '/api/events',
    '/api/admin/stats/events',
  ]
  check(
    'OpenAPI 已包含 E8 全部接口',
    expectedPaths.every((path) => !!docData.paths[path]),
    JSON.stringify(Object.keys(docData.paths || {}).filter((key) => !expectedPaths.includes(key))),
  )
  check(
    'OpenAPI 版本不低于 0.6.0',
    Boolean(
      docData.info &&
        /^\d+\.\d+\.\d+$/.test(docData.info.version) &&
        docData.info.version.localeCompare('0.6.0', undefined, { numeric: true }) >= 0,
    ),
    docData.info && docData.info.version,
  )

  // ---------- 清理 ----------
  await prisma.eventLog.deleteMany({ where: { id: { in: created.eventIds } } })
  // service_order 对 customer / artist 是 RESTRICT，需先删再删账号
  await prisma.serviceOrder.deleteMany({
    where: { OR: [{ customerId }, { artistId: { in: created.artistIds } }] },
  })
  await prisma.customer.deleteMany({ where: { userId: { in: created.userIds } } })
  await prisma.artist.deleteMany({ where: { id: { in: created.artistIds } } })
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
