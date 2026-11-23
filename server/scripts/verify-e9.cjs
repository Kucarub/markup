/* eslint-disable */
/**
 * E9 冒烟验证脚本（可重复执行）：node scripts/verify-e9.cjs
 * 覆盖 E9-03 ~ E9-06 的服务端验收点：
 * 定向预约创建（防重 + 档期预校验）、接单中心、接受（生成服务记录并占档）、
 * 婉拒（原因必填）、婉拒后备选推荐、接口文档。
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
    serviceDate: dayKey(5),
    serviceType: 'bridal',
    headcount: 2,
    budgetMin: 900,
    budgetMax: 1600,
    stylePrefs: ['fresh'],
    remark: '定向预约：希望清透底妆',
    ...overrides,
  }
}

async function main() {
  console.log(`[verify] base=${BASE}`)
  const stamp = Date.now()
  const created = { userIds: [], openids: [], artistIds: [] }
  const city = '上海'
  const dayA = 5
  const dayB = 7

  // ---------- 准备：客户与 4 位化妆师 ----------
  const cust = await createAccount(`dev-openid-e9c1-${stamp}`, 'customer')
  const cust2 = await createAccount(`dev-openid-e9c2-${stamp}`, 'customer')
  const artA = await createAccount(`dev-openid-e9a-${stamp}`, 'artist')
  const artB = await createAccount(`dev-openid-e9b-${stamp}`, 'artist')
  const artC = await createAccount(`dev-openid-e9x-${stamp}`, 'artist')
  const artD = await createAccount(`dev-openid-e9d-${stamp}`, 'artist')
  const artE = await createAccount(`dev-openid-e9e-${stamp}`, 'artist')
  const artF = await createAccount(`dev-openid-e9f-${stamp}`, 'artist')
  created.userIds.push(
    cust.userId,
    cust2.userId,
    artA.userId,
    artB.userId,
    artC.userId,
    artD.userId,
    artE.userId,
    artF.userId,
  )
  created.openids.push(
    `dev-openid-e9c1-${stamp}`,
    `dev-openid-e9c2-${stamp}`,
    `dev-openid-e9a-${stamp}`,
    `dev-openid-e9b-${stamp}`,
    `dev-openid-e9x-${stamp}`,
    `dev-openid-e9d-${stamp}`,
    `dev-openid-e9e-${stamp}`,
    `dev-openid-e9f-${stamp}`,
  )

  const artistA = await prisma.artist.create({
    data: {
      userId: artA.userId,
      name: `E9 目标化妆师-${stamp}`,
      city,
      district: '测试区',
      years: 6,
      styles: ['fresh'],
      status: 'approved',
    },
  })
  const artistB = await prisma.artist.create({
    data: {
      userId: artB.userId,
      name: `E9 备选B-${stamp}`,
      city,
      district: '测试区',
      years: 4,
      styles: ['fresh', 'retro'],
      status: 'approved',
    },
  })
  const artistC = await prisma.artist.create({
    data: {
      userId: artC.userId,
      name: `E9 备选C-${stamp}`,
      city,
      district: '测试区',
      years: 3,
      styles: ['fresh'],
      status: 'approved',
    },
  })
  const artistD = await prisma.artist.create({
    data: {
      userId: artD.userId,
      name: `E9 异城化妆师-${stamp}`,
      city: '杭州',
      district: '测试区',
      years: 8,
      styles: ['fresh'],
      status: 'approved',
    },
  })
  const artistE = await prisma.artist.create({
    data: {
      userId: artE.userId,
      name: `E9 风格不符-${stamp}`,
      city,
      district: '测试区',
      years: 9,
      styles: ['luxury'],
      status: 'approved',
    },
  })
  created.artistIds.push(artistA.id, artistB.id, artistC.id, artistD.id, artistE.id)

  const artistF = await prisma.artist.create({
    data: {
      userId: artF.userId,
      name: `E9 备选F-${stamp}`,
      city,
      district: '测试区',
      years: 2,
      styles: ['fresh'],
      status: 'approved',
    },
  })
  created.artistIds.push(artistF.id)

  await prisma.artistSchedule.createMany({
    data: [
      { artistId: artistA.id, date: dayValue(dayA), state: 'available' },
      { artistId: artistA.id, date: dayValue(dayB), state: 'available' },
      { artistId: artistB.id, date: dayValue(dayB), state: 'available' },
      { artistId: artistC.id, date: dayValue(dayB), state: 'available' },
      { artistId: artistD.id, date: dayValue(dayB), state: 'available' },
      { artistId: artistE.id, date: dayValue(dayB), state: 'available' },
      { artistId: artistF.id, date: dayValue(dayB), state: 'available' },
    ],
  })

  const phone = await request('POST', '/api/auth/phone', {
    token: cust.token,
    body: { code: '13800003333' },
  })
  check('客户绑定手机号成功', phone.status === 200 && phone.data.data.phoneBound === true)

  const profile = await request('GET', '/api/customer/me', { token: cust.token })
  const customerId = profile.data.data.id

  // ---------- E9-03 定向预约创建 ----------
  console.log('\n[E9-03] 定向预约创建')
  const created1 = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ targetArtistId: artistA.id }),
  })
  const demand1 = created1.data.data || {}
  check(
    '创建定向预约成功且携带目标化妆师',
    created1.status === 200 && demand1.targetArtistId === artistA.id && demand1.status === 'pending',
    JSON.stringify(created1.data),
  )

  const duplicated = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ targetArtistId: artistA.id, remark: '重复提交' }),
  })
  check(
    '同客户 + 同化妆师 + 同日期重复提交只生成 1 条',
    duplicated.status === 200 &&
      duplicated.data.data.duplicated === true &&
      duplicated.data.data.id === demand1.id,
    JSON.stringify(duplicated.data.data && { id: duplicated.data.data.id }),
  )

  const unavailableDay = dayKey(6)
  const slotNone = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ targetArtistId: artistA.id, serviceDate: unavailableDay }),
  })
  check(
    '化妆师当日未设可接 → 409/40900',
    slotNone.status === 409 && slotNone.data.code === 40900,
    JSON.stringify(slotNone.data),
  )

  // ---------- E9-04 接单中心 ----------
  console.log('\n[E9-04] 接单中心')
  const inboxA = await request('GET', '/api/inbox', { token: artA.token })
  const inboxData = (inboxA.data && inboxA.data.data) || {}
  check(
    '待处理包含发给我的定向预约且角标 >= 1',
    inboxA.status === 200 &&
      inboxData.unread >= 1 &&
      (inboxData.pending || []).some((item) => item.id === demand1.id),
    JSON.stringify(inboxData.pending && inboxData.pending.map((item) => item.id)),
  )
  check(
    '待处理按创建时间倒序',
    (inboxData.pending || []).every(
      (item, index, list) => index === 0 || list[index - 1].createdAt >= item.createdAt,
    ),
  )

  const inboxB = await request('GET', '/api/inbox', { token: artB.token })
  check(
    '非目标化妆师看不到该定向预约',
    !((inboxB.data.data && inboxB.data.data.pending) || []).some((item) => item.id === demand1.id),
  )

  const inboxCustomer = await request('GET', '/api/inbox', { token: cust.token })
  check(
    '客户访问接单中心 → 403/40300',
    inboxCustomer.status === 403 && inboxCustomer.data.code === 40300,
  )

  // ---------- E9-05 接受 ----------
  console.log('\n[E9-05] 接受定向预约与档期占用')
  const acceptByOther = await request('POST', `/api/demands/${demand1.id}/accept`, {
    token: artB.token,
  })
  check(
    '非目标化妆师接受 → 403/40300',
    acceptByOther.status === 403 && acceptByOther.data.code === 40300,
  )

  const accepted = await request('POST', `/api/demands/${demand1.id}/accept`, {
    token: artA.token,
  })
  const acceptedData = (accepted.data && accepted.data.data) || {}
  check(
    '接受后需求置已选定且生成待确认服务记录',
    accepted.status === 200 &&
      acceptedData.demand &&
      acceptedData.demand.status === 'selected' &&
      acceptedData.serviceOrder &&
      acceptedData.serviceOrder.status === 'pending',
    JSON.stringify(accepted.data),
  )

  const orderId = acceptedData.serviceOrder && acceptedData.serviceOrder.id
  const bookedSlot = await prisma.artistSchedule.findUnique({
    where: { artistId_date: { artistId: artistA.id, date: dayValue(dayA) } },
  })
  check(
    '接受后档期变已排且绑定服务记录',
    bookedSlot && bookedSlot.state === 'booked' && bookedSlot.serviceOrderId === orderId,
    JSON.stringify(bookedSlot),
  )

  const myResponse = await prisma.demandResponse.findUnique({
    where: { demandId_artistId: { demandId: demand1.id, artistId: artistA.id } },
  })
  check('接受时写入已选中的响应记录', !!myResponse && myResponse.status === 'selected')

  const acceptAgain = await request('POST', `/api/demands/${demand1.id}/accept`, {
    token: artA.token,
  })
  check(
    '重复接受 → 409/40900',
    acceptAgain.status === 409 && acceptAgain.data.code === 40900,
  )

  const rebookBookedDay = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ targetArtistId: artistA.id }),
  })
  check(
    '已被占用的日期再次发起预约 → 409/40900',
    rebookBookedDay.status === 409 && rebookBookedDay.data.code === 40900,
  )

  const inboxAfterAccept = await request('GET', '/api/inbox', { token: artA.token })
  const afterData = (inboxAfterAccept.data && inboxAfterAccept.data.data) || {}
  check(
    '接受后从待处理移除并进入已处理',
    !(afterData.pending || []).some((item) => item.id === demand1.id) &&
      (afterData.handled || []).some(
        (item) => item.id === demand1.id && item.handledStatus === 'accepted',
      ),
  )
  check(
    '服务记录出现在接单中心',
    (afterData.orders || []).some((item) => item.id === orderId && item.statusLabel === '待确认'),
  )

  // ---------- E9-05 婉拒 ----------
  console.log('\n[E9-05] 婉拒与原因校验')
  const created2 = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ targetArtistId: artistA.id, serviceDate: dayKey(dayB) }),
  })
  const demand2 = created2.data.data || {}
  check('创建第二条定向预约成功', created2.status === 200 && demand2.status === 'pending')

  const declineByOther = await request('POST', `/api/demands/${demand2.id}/decline`, {
    token: artB.token,
    body: { reason: '档期冲突' },
  })
  check('非目标化妆师婉拒 → 403/40300', declineByOther.status === 403)

  const declineNoReason = await request('POST', `/api/demands/${demand2.id}/decline`, {
    token: artA.token,
    body: { reason: '' },
  })
  check(
    '婉拒不填原因 → 400/40001',
    declineNoReason.status === 400 && declineNoReason.data.code === 40001,
    JSON.stringify(declineNoReason.data),
  )

  const declined = await request('POST', `/api/demands/${demand2.id}/decline`, {
    token: artA.token,
    body: { reason: '该日已有婚礼档期' },
  })
  check(
    '婉拒成功：需求关闭并记录原因',
    declined.status === 200 &&
      declined.data.data.status === 'closed' &&
      declined.data.data.statusLabel === '已被婉拒' &&
      declined.data.data.declineReason === '该日已有婚礼档期',
    JSON.stringify(declined.data),
  )

  const inboxAfterDecline = await request('GET', '/api/inbox', { token: artA.token })
  check(
    '婉拒后从待处理移除并进入已处理',
    !((inboxAfterDecline.data.data.pending || []).some((item) => item.id === demand2.id)) &&
      (inboxAfterDecline.data.data.handled || []).some(
        (item) => item.id === demand2.id && item.handledStatus === 'declined',
      ),
  )

  const detailAfterDecline = await request('GET', `/api/demands/${demand2.id}`, {
    token: cust.token,
  })
  check(
    '客户详情可见婉拒原因',
    detailAfterDecline.status === 200 &&
      detailAfterDecline.data.data.declineReason === '该日已有婚礼档期',
  )
  check(
    '客户详情返回定向标记与被预约化妆师',
    detailAfterDecline.data.data.isTargeted === true &&
      detailAfterDecline.data.data.targetArtist &&
      detailAfterDecline.data.data.targetArtist.id === artistA.id,
    JSON.stringify(detailAfterDecline.data.data.targetArtist),
  )

  // ---------- E9-06 备选推荐 ----------
  console.log('\n[E9-06] 婉拒后备选推荐')
  const alternatives = await request('GET', `/api/demands/${demand2.id}/alternatives`, {
    token: cust.token,
  })
  const altList = (alternatives.data.data && alternatives.data.data.list) || []
  const altIds = altList.map((item) => item.id)
  check(
    '备选返回 3 人且排除被婉拒化妆师',
    alternatives.status === 200 && altList.length === 3 && !altIds.includes(artistA.id),
    JSON.stringify(altIds),
  )
  check(
    '备选同城且风格有交集',
    altList.every((item) => item.city === city && item.styles.includes('fresh')),
    JSON.stringify(altList.map((item) => ({ id: item.id, city: item.city, styles: item.styles }))),
  )
  check(
    '异城化妆师与风格不符者被排除',
    !altIds.includes(artistD.id) && !altIds.includes(artistE.id),
    JSON.stringify(altIds),
  )

  const alternativesBeforeDecline = await request('GET', `/api/demands/${demand1.id}/alternatives`, {
    token: cust.token,
  })
  check(
    '未被婉拒的需求不返回备选 → 409/40900',
    alternativesBeforeDecline.status === 409 && alternativesBeforeDecline.data.code === 40900,
  )

  const alternativesByOther = await request('GET', `/api/demands/${demand2.id}/alternatives`, {
    token: cust2.token,
  })
  check(
    '非需求所属客户查看备选 → 404/40400',
    alternativesByOther.status === 404 && alternativesByOther.data.code === 40400,
  )

  // ---------- 接口文档 ----------
  console.log('\n[E9] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const docData = (doc.data && doc.data) || {}
  const expectedPaths = [
    '/api/demands/{id}/accept',
    '/api/demands/{id}/decline',
    '/api/demands/{id}/alternatives',
    '/api/inbox',
  ]
  check(
    'OpenAPI 已包含 E9 全部接口',
    expectedPaths.every((path) => !!docData.paths[path]),
    JSON.stringify(expectedPaths.filter((path) => !docData.paths[path])),
  )
  check(
    'OpenAPI 版本不低于 0.7.0',
    Boolean(
      docData.info &&
        /^\d+\.\d+\.\d+$/.test(docData.info.version) &&
        docData.info.version.localeCompare('0.7.0', undefined, { numeric: true }) >= 0,
    ),
    docData.info && docData.info.version,
  )

  // ---------- 清理 ----------
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
