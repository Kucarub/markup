/* eslint-disable */
/**
 * E10 冒烟验证脚本（可重复执行）：node scripts/verify-e10.cjs
 * 覆盖 E10-01 ~ E10-07 的服务端验收点：
 * 状态机（确认 / 完工确认 / 7 天自动完成 / 取消）、服务记录列表四态与计数、
 * 详情按钮态、双向评价（一单一评 + 敏感词待审）、信用分增减与等级、接口文档。
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
    remark: 'E10 服务记录状态机验证',
    ...overrides,
  }
}

async function main() {
  console.log(`[verify] base=${BASE}`)
  const stamp = Date.now()
  const created = { userIds: [], openids: [], artistIds: [], customerIds: [], orderIds: [], demandIds: [] }
  const city = '上海'

  // ---------- 准备：2 位客户 + 2 位化妆师 ----------
  const cust = await createAccount(`dev-openid-e10c1-${stamp}`, 'customer')
  const cust2 = await createAccount(`dev-openid-e10c2-${stamp}`, 'customer')
  const artA = await createAccount(`dev-openid-e10a-${stamp}`, 'artist')
  const artB = await createAccount(`dev-openid-e10b-${stamp}`, 'artist')
  created.userIds.push(cust.userId, cust2.userId, artA.userId, artB.userId)
  created.openids.push(
    `dev-openid-e10c1-${stamp}`,
    `dev-openid-e10c2-${stamp}`,
    `dev-openid-e10a-${stamp}`,
    `dev-openid-e10b-${stamp}`,
  )

  const artistA = await prisma.artist.create({
    data: {
      userId: artA.userId,
      name: `E10 化妆师A-${stamp}`,
      city,
      district: '测试区',
      years: 5,
      styles: ['fresh'],
      status: 'approved',
    },
  })
  const artistB = await prisma.artist.create({
    data: {
      userId: artB.userId,
      name: `E10 化妆师B-${stamp}`,
      city,
      district: '测试区',
      years: 3,
      styles: ['fresh'],
      status: 'approved',
    },
  })
  created.artistIds.push(artistA.id, artistB.id)

  await prisma.artistSchedule.createMany({
    data: [4, 5, 6].map((offset) => ({
      artistId: artistA.id,
      date: dayValue(offset),
      state: 'available',
    })),
  })

  const phone1 = await request('POST', '/api/auth/phone', {
    token: cust.token,
    body: { code: '13800005501' },
  })
  const phone2 = await request('POST', '/api/auth/phone', {
    token: cust2.token,
    body: { code: '13800005502' },
  })
  check(
    '两位客户绑定手机号成功',
    phone1.data.data.phoneBound === true && phone2.data.data.phoneBound === true,
  )

  const profile = await request('GET', '/api/customer/me', { token: cust.token })
  const customerId = profile.data.data.id
  created.customerIds.push(customerId)

  /** 走「客户定向预约 → 化妆师接受」生成待确认服务记录（initiatorRole=artist） */
  async function createOrder(dayOffset, remark) {
    const createdDemand = await request('POST', '/api/demands', {
      token: cust.token,
      body: demandBody({ targetArtistId: artistA.id, serviceDate: dayKey(dayOffset), remark }),
    })
    const demandId = createdDemand.data.data.id
    created.demandIds.push(demandId)
    const accepted = await request('POST', `/api/demands/${demandId}/accept`, {
      token: artA.token,
    })
    const order = accepted.data.data.serviceOrder
    created.orderIds.push(order.id)
    return order
  }

  // ---------- E10-07 初始信用分 ----------
  console.log('\n[E10-07] 初始信用分')
  const creditInit = await request('GET', `/api/credit/${cust.userId}`)
  check(
    '未产生变动时返回初始 60 分（一般）',
    creditInit.status === 200 &&
      creditInit.data.data.score === 60 &&
      creditInit.data.data.level === '一般' &&
      creditInit.data.data.initial === true,
    JSON.stringify(creditInit.data.data),
  )
  const creditMissing = await request('GET', '/api/credit/99999999')
  check('查询不存在的用户信用分 → 404/40400', creditMissing.status === 404)

  // ---------- E10-01 确认接单 ----------
  console.log('\n[E10-01] 确认接单状态机')
  const order1 = await createOrder(4, 'order1 确认/完工/评价')
  check(
    '客户定向预约被接受后生成待确认服务记录（发起方=化妆师）',
    order1.status === 'pending' && order1.initiatorRole === 'artist',
    JSON.stringify({ status: order1.status, initiatorRole: order1.initiatorRole }),
  )

  const confirmByInitiator = await request('POST', `/api/service-orders/${order1.id}/confirm`, {
    token: artA.token,
  })
  check(
    '发起方确认自己的记录 → 403/40300',
    confirmByInitiator.status === 403 && confirmByInitiator.data.code === 40300,
    JSON.stringify(confirmByInitiator.data),
  )

  const confirmByCustomer = await request('POST', `/api/service-orders/${order1.id}/confirm`, {
    token: cust.token,
  })
  check(
    '非发起方（客户）确认后置为已确认并记录确认时间',
    confirmByCustomer.status === 200 &&
      confirmByCustomer.data.data.status === 'confirmed' &&
      !!confirmByCustomer.data.data.confirmedAt,
    JSON.stringify(confirmByCustomer.data.data && confirmByCustomer.data.data.status),
  )

  const confirmAgain = await request('POST', `/api/service-orders/${order1.id}/confirm`, {
    token: cust.token,
  })
  check(
    '重复确认 → 409/40900',
    confirmAgain.status === 409 && confirmAgain.data.code === 40900,
    JSON.stringify(confirmAgain.data),
  )

  // ---------- E10-02 列表与四态计数 ----------
  console.log('\n[E10-02] 服务记录列表与计数')
  const listAll = await request('GET', '/api/service-orders?page=1&size=10', { token: cust.token })
  const listData = (listAll.data && listAll.data.data) || {}
  check(
    '列表返回分页字段与四态计数',
    listAll.status === 200 &&
      listData.page === 1 &&
      listData.size === 10 &&
      listData.counts &&
      listData.counts.all >= 1 &&
      listData.counts.pending === 0 &&
      listData.counts.confirmed >= 1,
    JSON.stringify(listData.counts),
  )

  const listConfirmed = await request('GET', '/api/service-orders?status=confirmed', {
    token: cust.token,
  })
  const confirmedList = (listConfirmed.data.data && listConfirmed.data.data.list) || []
  check(
    '按状态筛选只返回对应状态',
    listConfirmed.status === 200 &&
      confirmedList.length >= 1 &&
      confirmedList.every((item) => item.status === 'confirmed'),
    JSON.stringify(confirmedList.map((item) => item.status)),
  )

  const listByOtherCustomer = await request('GET', '/api/service-orders', { token: cust2.token })
  check(
    '非当事人列表为空',
    listByOtherCustomer.status === 200 && listByOtherCustomer.data.data.total === 0,
    JSON.stringify(listByOtherCustomer.data.data && listByOtherCustomer.data.data.total),
  )

  const listByArtist = await request('GET', '/api/service-orders', { token: artA.token })
  const artistList = (listByArtist.data.data && listByArtist.data.data.list) || []
  check(
    '化妆师视角含客户昵称与服务记录状态标签',
    listByArtist.status === 200 &&
      artistList.some((item) => item.id === order1.id && item.customerName && item.statusLabel),
  )

  const detailByOtherArtist = await request('GET', `/api/service-orders/${order1.id}`, {
    token: artB.token,
  })
  check(
    '非当事人查看详情 → 404/40400',
    detailByOtherArtist.status === 404 && detailByOtherArtist.data.code === 40400,
  )

  // ---------- E10-03 详情按钮态 ----------
  console.log('\n[E10-03] 详情按钮态')
  const detailArtist = await request('GET', `/api/service-orders/${order1.id}`, { token: artA.token })
  const dtoArtist = detailArtist.data.data || {}
  check(
    '已确认未发起完工：双方均可发起（requestable）',
    dtoArtist.status === 'confirmed' && dtoArtist.finishState === 'requestable',
    JSON.stringify({ status: dtoArtist.status, finishState: dtoArtist.finishState }),
  )
  check(
    '已确认后不可再确认，可取消',
    dtoArtist.canConfirm === false && dtoArtist.canCancel === true,
  )
  check('已完成前不可评价', dtoArtist.canReview === false)

  // ---------- E10-04 完工双方确认 ----------
  console.log('\n[E10-04] 完工双方确认与 7 天自动完成')
  const finishOnce = await request('POST', `/api/service-orders/${order1.id}/finish`, {
    token: artA.token,
  })
  const onceDto = (finishOnce.data && finishOnce.data.data) || {}
  check(
    '一方发起完成后等待对方确认（waiting）并给出自动完成时间',
    finishOnce.status === 200 &&
      onceDto.status === 'confirmed' &&
      onceDto.finishState === 'waiting' &&
      onceDto.finishRequestBy === 'artist' &&
      !!onceDto.autoFinishAt,
    JSON.stringify({ status: onceDto.status, finishState: onceDto.finishState }),
  )

  const finishTwice = await request('POST', `/api/service-orders/${order1.id}/finish`, {
    token: artA.token,
  })
  check(
    '同一方重复发起完成 → 409/40900',
    finishTwice.status === 409 && finishTwice.data.code === 40900,
  )

  const detailCustomer = await request('GET', `/api/service-orders/${order1.id}`, {
    token: cust.token,
  })
  check(
    '对方视角可确认完成（confirmable）',
    detailCustomer.data.data.finishState === 'confirmable',
    detailCustomer.data.data.finishState,
  )

  const finishByCustomer = await request('POST', `/api/service-orders/${order1.id}/finish`, {
    token: cust.token,
  })
  const finishedDto = (finishByCustomer.data && finishByCustomer.data.data) || {}
  check(
    '对方确认后记录完成并写入完成时间',
    finishByCustomer.status === 200 &&
      finishedDto.status === 'finished' &&
      finishedDto.statusLabel === '已完成' &&
      !!finishedDto.finishTime &&
      finishedDto.canCancel === false,
    JSON.stringify({ status: finishedDto.status, finishTime: finishedDto.finishTime }),
  )
  check('完成后双方可评价', finishedDto.canReview === true)

  const creditAfterFinish = await request('GET', `/api/credit/${cust.userId}`)
  const creditArtistAfterFinish = await request('GET', `/api/credit/${artA.userId}`)
  check(
    '完成后双方信用 +2（60 → 62）',
    creditAfterFinish.data.data.score === 62 && creditArtistAfterFinish.data.data.score === 62,
    JSON.stringify({ customer: creditAfterFinish.data.data, artist: creditArtistAfterFinish.data.data }),
  )

  const finishCancelledLater = await request('POST', `/api/service-orders/${order1.id}/finish`, {
    token: cust.token,
  })
  check(
    '已完成再发起完成 → 409/40900',
    finishCancelledLater.status === 409 && finishCancelledLater.data.code === 40900,
  )

  // 自动完成：发起完工确认后把 finishRequestAt 回拨 8 天，读取详情触发惰性结算
  const order3 = await createOrder(6, 'order3 7 天自动完成')
  await request('POST', `/api/service-orders/${order3.id}/confirm`, { token: cust.token })
  const autoRequest = await request('POST', `/api/service-orders/${order3.id}/finish`, {
    token: artA.token,
  })
  await prisma.serviceOrder.update({
    where: { id: order3.id },
    data: { finishRequestAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
  })
  const autoDetail = await request('GET', `/api/service-orders/${order3.id}`, { token: cust.token })
  const autoDto = (autoDetail.data && autoDetail.data.data) || {}
  check(
    '发起完成后 7 天未确认自动完成',
    autoRequest.status === 200 && autoDto.status === 'finished' && !!autoDto.finishTime,
    JSON.stringify({ status: autoDto.status, finishTime: autoDto.finishTime }),
  )
  const autoSlot = await prisma.artistSchedule.findUnique({
    where: { artistId_date: { artistId: artistA.id, date: dayValue(6) } },
  })
  check('自动完成不释放档期（仍为已排）', autoSlot && autoSlot.state === 'booked')

  // ---------- E10-05 取消 ----------
  console.log('\n[E10-05] 取消与档期释放')
  const order2 = await createOrder(5, 'order2 取消')
  const cancelNoReason = await request('POST', `/api/service-orders/${order2.id}/cancel`, {
    token: artA.token,
    body: { reason: '  ' },
  })
  check(
    '取消不填原因 → 400/40001',
    cancelNoReason.status === 400 && cancelNoReason.data.code === 40001,
    JSON.stringify(cancelNoReason.data),
  )

  const cancelled = await request('POST', `/api/service-orders/${order2.id}/cancel`, {
    token: artA.token,
    body: { reason: '临时有婚礼档期冲突' },
  })
  const cancelledDto = (cancelled.data && cancelled.data.data) || {}
  check(
    '取消成功：记录取消方与原因，状态置已取消',
    cancelled.status === 200 &&
      cancelledDto.status === 'cancelled' &&
      cancelledDto.cancelBy === 'artist' &&
      cancelledDto.cancelByLabel === '化妆师取消' &&
      cancelledDto.cancelReason === '临时有婚礼档期冲突' &&
      cancelledDto.canCancel === false,
    JSON.stringify({ status: cancelledDto.status, cancelByLabel: cancelledDto.cancelByLabel }),
  )

  const releasedSlot = await prisma.artistSchedule.findUnique({
    where: { artistId_date: { artistId: artistA.id, date: dayValue(5) } },
  })
  check(
    '取消后释放该日档期',
    releasedSlot && releasedSlot.state === 'available' && releasedSlot.serviceOrderId === null,
    JSON.stringify(releasedSlot),
  )

  const cancelAgain = await request('POST', `/api/service-orders/${order2.id}/cancel`, {
    token: cust.token,
    body: { reason: '重复取消' },
  })
  check(
    '已取消再次取消 → 409/40900',
    cancelAgain.status === 409 && cancelAgain.data.code === 40900,
  )

  const cancelFinished = await request('POST', `/api/service-orders/${order1.id}/cancel`, {
    token: cust.token,
    body: { reason: '已完成不可取消' },
  })
  check(
    '已完成记录取消 → 409/40900',
    cancelFinished.status === 409 && cancelFinished.data.code === 40900,
  )

  const creditAfterCancel = await request('GET', `/api/credit/${artA.userId}`)
  check(
    '取消方（化妆师）信用 -5（64 → 59）',
    creditAfterCancel.data.data.score === 59,
    JSON.stringify(creditAfterCancel.data.data),
  )

  const creditEvents = await prisma.creditScore.findUnique({ where: { userId: artA.userId } })
  check(
    '信用流水按时间倒序记录最近事件',
    Array.isArray(creditEvents.events) &&
      creditEvents.events.length >= 2 &&
      creditEvents.events[0].type === 'cancel',
    JSON.stringify(creditEvents.events && creditEvents.events.slice(0, 2)),
  )

  // ---------- E10-06 双向评价 ----------
  console.log('\n[E10-06] 双向评价与审核')
  const reviewUnfinished = await request('POST', '/api/reviews', {
    token: cust.token,
    body: { serviceOrderId: order2.id, rating: 5 },
  })
  check(
    '非已完成记录评价 → 409/40900',
    reviewUnfinished.status === 409 && reviewUnfinished.data.code === 40900,
    JSON.stringify(reviewUnfinished.data),
  )

  const reviewByCustomer = await request('POST', '/api/reviews', {
    token: cust.token,
    body: {
      serviceOrderId: order1.id,
      rating: 5,
      tags: ['妆效自然', '准时守约'],
      content: '妆效自然，沟通顺畅，值得推荐',
    },
  })
  check(
    '已完成记录评价成功并直接可见',
    reviewByCustomer.status === 200 &&
      reviewByCustomer.data.data.visible === true &&
      reviewByCustomer.data.data.message === '评价已发布',
    JSON.stringify(reviewByCustomer.data.data),
  )

  const reviewAgain = await request('POST', '/api/reviews', {
    token: cust.token,
    body: { serviceOrderId: order1.id, rating: 4 },
  })
  check(
    '一单一评：重复评价 → 409/40900',
    reviewAgain.status === 409 && reviewAgain.data.code === 40900,
    JSON.stringify(reviewAgain.data),
  )

  const reviewByOther = await request('POST', '/api/reviews', {
    token: cust2.token,
    body: { serviceOrderId: order1.id, rating: 5 },
  })
  check(
    '非当事人评价 → 404/40400',
    reviewByOther.status === 404 && reviewByOther.data.code === 40400,
  )

  const reviewSensitive = await request('POST', '/api/reviews', {
    token: artA.token,
    body: {
      serviceOrderId: order1.id,
      rating: 4,
      tags: ['配合度高'],
      content: '客户很好沟通，有需要可以加我微信',
    },
  })
  check(
    '命中敏感词的评价进入待审核且对外不可见',
    reviewSensitive.status === 200 &&
      reviewSensitive.data.data.status === 'pending' &&
      reviewSensitive.data.data.visible === false,
    JSON.stringify(reviewSensitive.data.data),
  )

  const reviewInvalidRating = await request('POST', '/api/reviews', {
    token: cust.token,
    body: { serviceOrderId: order3.id, rating: 6 },
  })
  check(
    '评分超出 1–5 → 400/40001',
    reviewInvalidRating.status === 400 && reviewInvalidRating.data.code === 40001,
    JSON.stringify(reviewInvalidRating.data),
  )

  const listByArtistReviews = await request('GET', `/api/reviews?artistId=${artistA.id}`)
  const artistReviewData = (listByArtistReviews.data && listByArtistReviews.data.data) || {}
  check(
    '化妆师评价列表只含可见评价且带平均分',
    listByArtistReviews.status === 200 &&
      artistReviewData.total === 1 &&
      artistReviewData.avgRating === 5 &&
      artistReviewData.list[0].rating === 5 &&
      Array.isArray(artistReviewData.list[0].tags),
    JSON.stringify({ total: artistReviewData.total, avgRating: artistReviewData.avgRating }),
  )

  const listToCustomer = await request('GET', `/api/reviews?userId=${cust.userId}`)
  check(
    '待审核评价不对外展示',
    listToCustomer.status === 200 && listToCustomer.data.data.total === 0,
    JSON.stringify(listToCustomer.data.data && listToCustomer.data.data.total),
  )

  const listByOrder = await request('GET', `/api/reviews?serviceOrderId=${order1.id}`)
  check(
    '按服务记录查询只返回可见评价',
    listByOrder.status === 200 &&
      listByOrder.data.data.total === 1 &&
      listByOrder.data.data.list[0].rating === 5,
    JSON.stringify(listByOrder.data.data && listByOrder.data.data.total),
  )

  const orderDetailAfterReview = await request('GET', `/api/service-orders/${order1.id}`, {
    token: cust.token,
  })
  check(
    '详情回显我的评价且不可重复评价',
    orderDetailAfterReview.data.data.canReview === false &&
      orderDetailAfterReview.data.data.myReview &&
      orderDetailAfterReview.data.data.myReview.status === 'visible',
  )

  // ---------- E10-07 信用分汇总 ----------
  console.log('\n[E10-07] 信用分汇总')
  const finalCustCredit = await request('GET', `/api/credit/${cust.userId}`)
  const finalArtistCredit = await request('GET', `/api/credit/${artA.userId}`)
  check(
    '两次完成累计加分（客户 60 → 64）',
    finalCustCredit.data.data.score === 64 &&
      finalCustCredit.data.data.level === '一般' &&
      finalCustCredit.data.data.initial === false,
    JSON.stringify(finalCustCredit.data.data),
  )
  check(
    '化妆师完成两次 +4、取消一次 -5（60 → 59）',
    finalArtistCredit.data.data.score === 59,
    JSON.stringify(finalArtistCredit.data.data),
  )

  // ---------- 接口文档 ----------
  console.log('\n[E10] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const docData = (doc.data && doc.data) || {}
  const expectedPaths = [
    '/api/service-orders',
    '/api/service-orders/{id}',
    '/api/service-orders/{id}/confirm',
    '/api/service-orders/{id}/finish',
    '/api/service-orders/{id}/cancel',
    '/api/reviews',
    '/api/credit/{userId}',
  ]
  check(
    'OpenAPI 已包含 E10 全部接口',
    expectedPaths.every((path) => !!docData.paths[path]),
    JSON.stringify(expectedPaths.filter((path) => !docData.paths[path])),
  )
  check(
    'OpenAPI 版本不低于 0.8.0',
    Boolean(
      docData.info &&
        /^\d+\.\d+\.\d+$/.test(docData.info.version) &&
        docData.info.version.localeCompare('0.8.0', undefined, { numeric: true }) >= 0,
    ),
    docData.info && docData.info.version,
  )

  // ---------- 清理 ----------
  await prisma.review.deleteMany({
    where: {
      OR: [{ fromUserId: { in: created.userIds } }, { toUserId: { in: created.userIds } }],
    },
  })
  await prisma.serviceOrder.deleteMany({
    where: {
      OR: [
        { customerId: { in: created.customerIds } },
        { artistId: { in: created.artistIds } },
      ],
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
