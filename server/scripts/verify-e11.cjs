/* eslint-disable */
/**
 * E11 冒烟验证脚本（可重复执行）：node scripts/verify-e11.cjs
 * 覆盖 E11-01 ~ E11-03 的服务端验收点：
 * 订阅授权回写与 7 天静默、需求响应 / 定向预约到达通知、服务记录四类状态通知、
 * 站内消息分页与计数、未配置模板时静默降级、已关闭需求响应回归、接口文档。
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
    serviceDate: dayKey(4),
    serviceType: 'bridal',
    headcount: 1,
    budgetMin: 800,
    budgetMax: 1200,
    stylePrefs: ['fresh'],
    remark: 'E11 订阅消息验证',
    ...overrides,
  }
}

/** 读取用户某类通知日志 */
function findNotification(userId, type) {
  return prisma.notification.findFirst({
    where: { userId, type },
    orderBy: { id: 'desc' },
  })
}

function payloadOf(row) {
  return (row && row.payload) || {}
}

async function main() {
  console.log(`[verify] base=${BASE}`)
  const stamp = Date.now()
  const created = { userIds: [], openids: [], artistIds: [], customerIds: [], orderIds: [], demandIds: [] }
  const city = '上海'

  // ---------- 准备：2 位客户 + 2 位化妆师 ----------
  const cust = await createAccount(`dev-openid-e11c1-${stamp}`, 'customer')
  const cust2 = await createAccount(`dev-openid-e11c2-${stamp}`, 'customer')
  const artA = await createAccount(`dev-openid-e11a-${stamp}`, 'artist')
  const artB = await createAccount(`dev-openid-e11b-${stamp}`, 'artist')
  created.userIds.push(cust.userId, cust2.userId, artA.userId, artB.userId)
  created.openids.push(
    `dev-openid-e11c1-${stamp}`,
    `dev-openid-e11c2-${stamp}`,
    `dev-openid-e11a-${stamp}`,
    `dev-openid-e11b-${stamp}`,
  )

  const artistA = await prisma.artist.create({
    data: {
      userId: artA.userId,
      name: `E11 化妆师A-${stamp}`,
      city,
      district: '测试区',
      years: 5,
      styles: ['fresh'],
      status: 'approved',
    },
  })
  created.artistIds.push(artistA.id)

  const artistB = await prisma.artist.create({
    data: {
      userId: artB.userId,
      name: `E11 化妆师B-${stamp}`,
      city,
      district: '测试区',
      years: 3,
      styles: ['fresh'],
      status: 'approved',
    },
  })
  created.artistIds.push(artistB.id)

  await prisma.artistSchedule.createMany({
    data: [4, 5, 6, 7, 8, 9, 10].map((offset) => ({
      artistId: artistA.id,
      date: dayValue(offset),
      state: 'available',
    })),
  })

  const phone1 = await request('POST', '/api/auth/phone', {
    token: cust.token,
    body: { code: '13800006601' },
  })
  await request('POST', '/api/auth/phone', {
    token: cust2.token,
    body: { code: '13800006602' },
  })
  check('两位客户绑定手机号成功', phone1.data.data.phoneBound === true)

  const profile = await request('GET', '/api/customer/me', { token: cust.token })
  created.customerIds.push(profile.data.data.id)

  // ---------- E11-01 订阅授权与 7 天静默 ----------
  console.log('\n[E11-01] 订阅授权状态与 7 天静默')
  const overviewInit = await request('GET', '/api/subscriptions', { token: cust.token })
  const templatesInit = (overviewInit.data.data && overviewInit.data.data.templates) || []
  check(
    '授权概览返回 2 个模板且初始应弹窗',
    overviewInit.status === 200 &&
      templatesInit.length === 2 &&
      templatesInit.every((item) => item.accepted === false && item.shouldPrompt === true),
    JSON.stringify(templatesInit.map((item) => ({ key: item.key, shouldPrompt: item.shouldPrompt }))),
  )
  check(
    '未配置模板 ID 时 configured=false（小程序跳过弹窗）',
    templatesInit.every((item) => item.configured === false && item.templateId === null),
  )

  const accepted = await request('POST', '/api/subscriptions', {
    token: cust.token,
    body: {
      results: [
        { key: 'invitation', status: 'accepted' },
        { key: 'result', status: 'accepted' },
      ],
    },
  })
  const acceptedTemplates = (accepted.data.data && accepted.data.data.templates) || []
  check(
    '接受授权后 accepted=true 且不再弹窗',
    accepted.status === 200 &&
      acceptedTemplates.every((item) => item.accepted === true && item.shouldPrompt === false),
    JSON.stringify(acceptedTemplates),
  )

  const record = await prisma.subscribeRecord.findUnique({
    where: { userId_templateKey: { userId: cust.userId, templateKey: 'invitation' } },
  })
  check(
    '授权结果写入订阅记录（promptCount=1，无拒绝时间）',
    record && record.status === 'accepted' && record.promptCount === 1 && !record.lastRejectedAt,
    JSON.stringify(record),
  )

  await request('POST', '/api/subscriptions', {
    token: cust.token,
    body: { results: [{ key: 'invitation', status: 'accepted' }] },
  })
  const recordAgain = await prisma.subscribeRecord.findUnique({
    where: { userId_templateKey: { userId: cust.userId, templateKey: 'invitation' } },
  })
  check(
    '重复回写累积提示次数（幂等 upsert，promptCount=2）',
    recordAgain && recordAgain.promptCount === 2,
    JSON.stringify({ promptCount: recordAgain && recordAgain.promptCount }),
  )

  const rejected = await request('POST', '/api/subscriptions', {
    token: cust.token,
    body: { results: [{ key: 'result', status: 'rejected' }] },
  })
  const rejectedResult = ((rejected.data.data && rejected.data.data.templates) || []).find(
    (item) => item.key === 'result',
  )
  check(
    '拒绝后 accepted=false 且 shouldPrompt=false（7 天静默）',
    rejectedResult &&
      rejectedResult.accepted === false &&
      rejectedResult.shouldPrompt === false &&
      !!rejectedResult.lastRejectedAt,
    JSON.stringify(rejectedResult),
  )

  const rejectRecord = await prisma.subscribeRecord.findUnique({
    where: { userId_templateKey: { userId: cust.userId, templateKey: 'result' } },
  })
  const suppressMs = Date.now() - (rejectRecord.lastRejectedAt?.getTime() || 0)
  check(
    '拒绝时间落库且在 7 天窗口内',
    rejectRecord.status === 'rejected' && suppressMs >= 0 && suppressMs < 7 * 24 * 60 * 60 * 1000,
    JSON.stringify({ status: rejectRecord.status, suppressMs }),
  )

  const badKey = await request('POST', '/api/subscriptions', {
    token: cust.token,
    body: { results: [{ key: 'unknown', status: 'accepted' }] },
  })
  check(
    '非法模板标识 → 400/40001',
    badKey.status === 400 && badKey.data.code === 40001,
    JSON.stringify(badKey.data),
  )

  const emptyResults = await request('POST', '/api/subscriptions', {
    token: cust.token,
    body: { results: [] },
  })
  check(
    '空授权结果 → 400/40001',
    emptyResults.status === 400 && emptyResults.data.code === 40001,
  )

  const noTokenOverview = await request('GET', '/api/subscriptions')
  check('未登录查看授权概览 → 401', noTokenOverview.status === 401)

  // ---------- E11-02 定向预约与需求响应通知 ----------
  console.log('\n[E11-02] 定向预约与需求响应通知')
  const targeted = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ targetArtistId: artistA.id, serviceDate: dayKey(4), remark: '定向预约通知' }),
  })
  const targetedId = targeted.data.data.id
  created.demandIds.push(targetedId)
  check('定向预约创建成功', targeted.status === 200 && targetedId > 0)

  const targetedNotify = await findNotification(artA.userId, 'demand_targeted')
  check(
    '定向预约到达：化妆师收到站内消息（未配置模板降级 skipped）',
    targetedNotify &&
      targetedNotify.status === 'skipped' &&
      payloadOf(targetedNotify).title === '收到新的定向预约' &&
      String(payloadOf(targetedNotify).page || '').indexOf('/demand/detail') > -1,
    JSON.stringify(targetedNotify && { status: targetedNotify.status, payload: targetedNotify.payload }),
  )
  check(
    '降级原因写入 failReason（可查发送日志）',
    targetedNotify &&
      typeof targetedNotify.failReason === 'string' &&
      targetedNotify.failReason.indexOf('降级') > -1,
    targetedNotify && targetedNotify.failReason,
  )

  const acceptedDemand = await request('POST', `/api/demands/${targetedId}/accept`, {
    token: artA.token,
  })
  const order1 = acceptedDemand.data.data.serviceOrder
  created.orderIds.push(order1.id)
  check(
    '接受定向预约生成待确认服务记录',
    acceptedDemand.status === 200 && order1.status === 'pending' && order1.initiatorRole === 'artist',
    JSON.stringify({ status: order1.status, initiatorRole: order1.initiatorRole }),
  )

  const acceptedNotify = await findNotification(cust.userId, 'demand_accepted')
  check(
    '预约被接受：客户收到站内消息',
    acceptedNotify && acceptedNotify.status === 'skipped' && payloadOf(acceptedNotify).title === '化妆师已接受你的预约',
    JSON.stringify(acceptedNotify && acceptedNotify.payload),
  )

  const hallDemand = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ serviceDate: dayKey(9), remark: '大厅需求响应通知' }),
  })
  const hallId = hallDemand.data.data.id
  created.demandIds.push(hallId)
  const responded = await request('POST', `/api/demands/${hallId}/respond`, {
    token: artA.token,
    body: { note: '档期合适，期待合作' },
  })
  check('化妆师响应大厅需求成功', responded.status === 200 && responded.data.data.responseCount === 1)

  const respondNotify = await findNotification(cust.userId, 'demand_response')
  check(
    '需求响应：客户收到站内消息且内容含化妆师名',
    respondNotify &&
      respondNotify.status === 'skipped' &&
      payloadOf(respondNotify).title === '有化妆师响应了你的需求' &&
      String(payloadOf(respondNotify).content || '').indexOf('E11 化妆师A') > -1,
    JSON.stringify(respondNotify && respondNotify.payload),
  )

  // ---------- E11-03 服务记录状态通知 ----------
  console.log('\n[E11-03] 服务记录确认 / 完成 / 取消通知')
  const confirmed = await request('POST', `/api/service-orders/${order1.id}/confirm`, {
    token: cust.token,
  })
  check('客户确认接单成功', confirmed.status === 200 && confirmed.data.data.status === 'confirmed')
  const confirmedNotify = await findNotification(artA.userId, 'order_confirmed')
  check(
    '已确认：发起方（化妆师）收到站内消息',
    confirmedNotify &&
      confirmedNotify.status === 'skipped' &&
      payloadOf(confirmedNotify).title === '服务记录已确认',
    JSON.stringify(confirmedNotify && confirmedNotify.payload),
  )

  const finishRequest = await request('POST', `/api/service-orders/${order1.id}/finish`, {
    token: artA.token,
  })
  check(
    '化妆师发起完工确认，等待客户确认',
    finishRequest.status === 200 && finishRequest.data.data.finishState === 'waiting',
  )
  const requestNotify = await findNotification(cust.userId, 'order_finish_requested')
  check(
    '发起完工：对方（客户）收到待确认通知',
    requestNotify &&
      requestNotify.status === 'skipped' &&
      payloadOf(requestNotify).title === '对方已发起完工确认',
    JSON.stringify(requestNotify && requestNotify.payload),
  )

  const finished = await request('POST', `/api/service-orders/${order1.id}/finish`, {
    token: cust.token,
  })
  check('客户确认完成，记录闭环', finished.status === 200 && finished.data.data.status === 'finished')
  const finishedNotify = await findNotification(artA.userId, 'order_finished')
  check(
    '已完成：发起方收到完成通知',
    finishedNotify &&
      finishedNotify.status === 'skipped' &&
      payloadOf(finishedNotify).title === '服务记录已完成',
    JSON.stringify(finishedNotify && finishedNotify.payload),
  )

  // 取消：新建一条服务记录后由客户取消
  const cancelDemand = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ targetArtistId: artistA.id, serviceDate: dayKey(7), remark: '取消通知' }),
  })
  const cancelDemandId = cancelDemand.data.data.id
  created.demandIds.push(cancelDemandId)
  const cancelAccept = await request('POST', `/api/demands/${cancelDemandId}/accept`, {
    token: artA.token,
  })
  const order2 = cancelAccept.data.data.serviceOrder
  created.orderIds.push(order2.id)
  const cancelled = await request('POST', `/api/service-orders/${order2.id}/cancel`, {
    token: cust.token,
    body: { reason: '客户行程有变，抱歉' },
  })
  check('客户取消服务记录成功', cancelled.status === 200 && cancelled.data.data.status === 'cancelled')
  const cancelNotify = await findNotification(artA.userId, 'order_cancelled')
  check(
    '已取消：对方（化妆师）收到通知且含取消原因',
    cancelNotify &&
      cancelNotify.status === 'skipped' &&
      payloadOf(cancelNotify).title === '服务记录已取消' &&
      String(payloadOf(cancelNotify).content || '').indexOf('客户行程有变') > -1,
    JSON.stringify(cancelNotify && cancelNotify.payload),
  )

  // 自动完成：发起完工确认后回拨 8 天，读取详情触发惰性结算
  const autoDemand = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ targetArtistId: artistA.id, serviceDate: dayKey(8), remark: '自动完成通知' }),
  })
  const autoDemandId = autoDemand.data.data.id
  created.demandIds.push(autoDemandId)
  const autoAccept = await request('POST', `/api/demands/${autoDemandId}/accept`, {
    token: artA.token,
  })
  const order3 = autoAccept.data.data.serviceOrder
  created.orderIds.push(order3.id)
  await request('POST', `/api/service-orders/${order3.id}/confirm`, { token: cust.token })
  await request('POST', `/api/service-orders/${order3.id}/finish`, { token: artA.token })
  await prisma.serviceOrder.update({
    where: { id: order3.id },
    data: { finishRequestAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
  })
  const autoDetail = await request('GET', `/api/service-orders/${order3.id}`, { token: cust.token })
  check(
    '7 天未确认自动完成',
    autoDetail.status === 200 && autoDetail.data.data.status === 'finished',
    autoDetail.data.data && autoDetail.data.data.status,
  )
  const autoNotifyCount = await prisma.notification.count({
    where: { type: 'order_auto_finished', userId: { in: [cust.userId, artA.userId] } },
  })
  check('自动完成通知双方各一条（共 2 条）', autoNotifyCount === 2, String(autoNotifyCount))

  // ---------- E11-02 降级与回归 ----------
  console.log('\n[E11-02] 静默降级与已关闭需求回归')
  const allNotify = await prisma.notification.findMany({
    where: { userId: { in: [cust.userId, artA.userId] } },
    select: { status: true, type: true },
  })
  check(
    '未配置模板：全部通知 status=skipped，无 failed / pending',
    allNotify.length > 0 && allNotify.every((item) => item.status === 'skipped'),
    JSON.stringify(allNotify.map((item) => item.status)),
  )

  const closedDemand = await request('POST', '/api/demands', {
    token: cust.token,
    body: demandBody({ serviceDate: dayKey(10), remark: '已关闭需求回归' }),
  })
  const closedId = closedDemand.data.data.id
  created.demandIds.push(closedId)
  const closed = await request('PUT', `/api/demands/${closedId}/close`, { token: cust.token })
  check('客户关闭需求成功', closed.status === 200 && closed.data.data.status === 'closed')
  const respondClosed = await request('POST', `/api/demands/${closedId}/respond`, {
    token: artB.token,
    body: { note: '尝试响应已关闭需求' },
  })
  check(
    '已关闭需求响应 → 409/40900（回归）',
    respondClosed.status === 409 && respondClosed.data.code === 40900,
    JSON.stringify(respondClosed.data),
  )

  // ---------- 站内消息列表 ----------
  console.log('\n[站内消息] 分页、筛选与计数')
  const listRes = await request('GET', '/api/notifications?page=1&size=2', { token: cust.token })
  const listData = (listRes.data && listRes.data.data) || {}
  check(
    '消息列表返回分页字段与四态计数',
    listRes.status === 200 &&
      listData.page === 1 &&
      listData.size === 2 &&
      Array.isArray(listData.list) &&
      listData.list.length <= 2 &&
      listData.counts &&
      listData.counts.all >= 3,
    JSON.stringify({ counts: listData.counts, total: listData.total }),
  )
  check(
    '未配置模板时计数集中在 skipped，sent / failed 为 0',
    listData.counts.skipped === listData.counts.all &&
      listData.counts.sent === 0 &&
      listData.counts.failed === 0,
    JSON.stringify(listData.counts),
  )
  check(
    '消息条目含标题、内容、跳转页与时间',
    listData.list.length > 0 &&
      listData.list.every(
        (item) => item.title && item.content && typeof item.page === 'string' && item.createdAt,
      ),
    JSON.stringify(listData.list[0]),
  )

  const filtered = await request('GET', '/api/notifications?status=skipped', { token: cust.token })
  const filteredList = (filtered.data.data && filtered.data.data.list) || []
  check(
    '按状态筛选只返回对应状态',
    filtered.status === 200 && filteredList.length > 0 && filteredList.every((item) => item.status === 'skipped'),
    JSON.stringify(filteredList.map((item) => item.status)),
  )

  const otherList = await request('GET', '/api/notifications', { token: cust2.token })
  check(
    '其他用户看不到我的消息',
    otherList.status === 200 && otherList.data.data.total === 0,
    JSON.stringify(otherList.data.data && otherList.data.data.total),
  )

  const noTokenList = await request('GET', '/api/notifications')
  check('未登录查看消息列表 → 401', noTokenList.status === 401)

  const badStatus = await request('GET', '/api/notifications?status=unknown', { token: cust.token })
  check('非法状态筛选 → 400/40001', badStatus.status === 400 && badStatus.data.code === 40001)

  // ---------- 接口文档 ----------
  console.log('\n[E11] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const docData = (doc.data && doc.data) || {}
  const expectedPaths = ['/api/subscriptions', '/api/notifications']
  check(
    'OpenAPI 已包含 E11 全部接口',
    expectedPaths.every((path) => !!docData.paths[path]),
    JSON.stringify(expectedPaths.filter((path) => !docData.paths[path])),
  )
  check(
    'OpenAPI 版本不低于 0.9.0',
    Boolean(
      docData.info &&
        /^\d+\.\d+\.\d+$/.test(docData.info.version) &&
        docData.info.version.localeCompare('0.9.0', undefined, { numeric: true }) >= 0,
    ),
    docData.info && docData.info.version,
  )
  check(
    'OpenAPI 含订阅模板与消息条目 schema',
    !!(docData.components.schemas.SubscribeTemplate && docData.components.schemas.NotificationItem),
  )

  // ---------- 清理 ----------
  await prisma.notification.deleteMany({ where: { userId: { in: created.userIds } } })
  await prisma.subscribeRecord.deleteMany({ where: { userId: { in: created.userIds } } })
  await prisma.review.deleteMany({
    where: {
      OR: [{ fromUserId: { in: created.userIds } }, { toUserId: { in: created.userIds } }],
    },
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
  await prisma.creditScore.deleteMany({ where: { userId: { in: created.userIds } } })
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
