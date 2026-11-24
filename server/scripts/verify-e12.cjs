/* eslint-disable */
/**
 * E12 冒烟验证脚本（可重复执行）：node scripts/verify-e12.cjs
 * 覆盖 E12-01 ~ E12-10 的服务端验收点：
 * RBAC（super/admin/auditor）、审核列表/详情/解密留痕/批量/导出 xlsx、
 * 用户封禁解封、需求筛选与运营代发布/代响应（source=ops）、
 * 服务记录完整链路、作品下架恢复、审核日志只读查询、OpenAPI。
 */
require('dotenv').config()
const crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client')

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:3000'
const prisma = new PrismaClient()

const ID_CARD = '310101199001011234'

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

async function request(method, path, { token, body, headers = {}, raw = false } = {}) {
  const finalHeaders = { ...headers }
  if (body !== undefined) finalHeaders['content-type'] = 'application/json'
  if (token) finalHeaders.authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (raw) {
    return {
      status: res.status,
      headers: res.headers,
      buffer: Buffer.from(await res.arrayBuffer()),
    }
  }
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

/** 与 src/utils/crypto.ts 保持一致的 AES-256-GCM，用于直接构造待审核身份证密文 */
function aesKey() {
  const raw = process.env.AES_KEY || ''
  return /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : crypto.createHash('sha256').update(raw).digest()
}

function encryptSensitive(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
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
  const created = {
    userIds: [],
    openids: [],
    artistIds: [],
    customerIds: [],
    demandIds: [],
    orderIds: [],
    portfolioIds: [],
    adminIds: [],
  }
  const city = '上海'

  // ---------- 准备账号 ----------
  const adminLogin = await request('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'Admin@123456' },
  })
  const adminToken = adminLogin.data && adminLogin.data.data && adminLogin.data.data.accessToken
  const adminId = adminLogin.data && adminLogin.data.data && adminLogin.data.data.admin.id
  console.log(`\n[准备] 后台登录 status=${adminLogin.status} role=${adminLogin.data && adminLogin.data.data && adminLogin.data.data.admin.role}`)

  const cust = await createAccount(`dev-openid-e12c-${stamp}`, 'customer')
  const custNoRole = await createAccount(`dev-openid-e12n-${stamp}`, null)
  const artPending = await createAccount(`dev-openid-e12p-${stamp}`, 'artist')
  const artPending2 = await createAccount(`dev-openid-e12p2-${stamp}`, 'artist')
  const artOk = await createAccount(`dev-openid-e12a-${stamp}`, 'artist')
  created.userIds.push(cust.userId, custNoRole.userId, artPending.userId, artPending2.userId, artOk.userId)
  created.openids.push(
    `dev-openid-e12c-${stamp}`,
    `dev-openid-e12n-${stamp}`,
    `dev-openid-e12p-${stamp}`,
    `dev-openid-e12p2-${stamp}`,
    `dev-openid-e12a-${stamp}`,
  )

  const pendingArtist = await prisma.artist.create({
    data: {
      userId: artPending.userId,
      name: `E12 待审核-${stamp}`,
      city,
      district: '浦东新区',
      years: 4,
      styles: ['fresh'],
      idCardCipher: encryptSensitive(ID_CARD),
      status: 'pending',
    },
  })
  const pendingArtist2 = await prisma.artist.create({
    data: {
      userId: artPending2.userId,
      name: `E12 待审核2-${stamp}`,
      city,
      district: '徐汇区',
      years: 2,
      styles: ['bridal'],
      idCardCipher: encryptSensitive(ID_CARD),
      status: 'pending',
    },
  })
  const approvedArtist = await prisma.artist.create({
    data: {
      userId: artOk.userId,
      name: `E12 已通过-${stamp}`,
      city,
      district: '静安区',
      years: 6,
      styles: ['bridal'],
      status: 'approved',
      auditAt: new Date(Date.now() - 3600 * 1000),
    },
  })
  created.artistIds.push(pendingArtist.id, pendingArtist2.id, approvedArtist.id)

  const portfolioOffline = await prisma.artistPortfolio.create({
    data: {
      artistId: approvedArtist.id,
      type: 'image',
      title: `E12 作品-${stamp}`,
      url: `e12/${stamp}/work.png`,
      styles: ['bridal'],
      sort: 0,
      status: 'online',
    },
  })
  const portfolioApproved = await prisma.artistPortfolio.create({
    data: {
      artistId: pendingArtist.id,
      type: 'image',
      title: `E12 待审作品-${stamp}`,
      url: `e12/${stamp}/pending.png`,
      styles: ['fresh'],
      sort: 0,
      status: 'pending',
    },
  })
  created.portfolioIds.push(portfolioOffline.id, portfolioApproved.id)

  await prisma.artistSchedule.create({
    data: { artistId: approvedArtist.id, date: dayValue(6), state: 'available' },
  })

  const profile = await request('GET', '/api/customer/me', { token: cust.token })
  const customerId = profile.data.data.id
  created.customerIds.push(customerId)

  // 发布需求要求先绑定手机号（E7 规则）
  const phone = `139${String(stamp).slice(-8)}`
  const bound = await request('POST', '/api/auth/phone', {
    token: cust.token,
    body: { code: phone },
  })
  if (bound.status !== 200) throw new Error(`绑定手机号失败：${JSON.stringify(bound.data)}`)

  // auditor 账号：复用 admin 的密码哈希，仅改角色
  const adminRow = await prisma.adminUser.findUnique({ where: { username: 'admin' } })
  const auditor = await prisma.adminUser.create({
    data: {
      username: `e12audit${stamp}`.slice(0, 32),
      passwordHash: adminRow.passwordHash,
      role: 'auditor',
    },
  })
  created.adminIds.push(auditor.id)
  const auditorLogin = await request('POST', '/api/admin/auth/login', {
    body: { username: auditor.username, password: 'Admin@123456' },
  })
  const auditorToken = auditorLogin.data.data.accessToken

  // ---------- E12-01 RBAC ----------
  console.log('\n[E12-01] 后台登录与 RBAC')
  check(
    '种子账号登录返回 token 与角色 super',
    adminLogin.status === 200 && adminLogin.data.data.admin.role === 'super' && !!adminToken,
    JSON.stringify(adminLogin.data && adminLogin.data.data && adminLogin.data.data.admin),
  )
  const me = await request('GET', '/api/admin/auth/me', { token: adminToken })
  check('当前账号接口返回角色', me.status === 200 && me.data.data.role === 'super', JSON.stringify(me.data.data))

  const noToken = await request('GET', '/api/admin/users')
  check('无 token 访问后台接口 → 401/40100', noToken.status === 401 && noToken.data.code === 40100, JSON.stringify(noToken.data))

  const customerHitAdmin = await request('GET', '/api/admin/users', { token: cust.token })
  check('客户 token 访问后台接口 → 403/40300', customerHitAdmin.status === 403 && customerHitAdmin.data.code === 40300, JSON.stringify(customerHitAdmin.data))

  const auditorRead = await request('GET', '/api/admin/users', { token: auditorToken })
  check('auditor 可查询（ADMIN_ALL）', auditorRead.status === 200, JSON.stringify(auditorRead.data))

  const auditorWrite = await request('POST', `/api/admin/users/${cust.userId}/status`, {
    token: auditorToken,
    body: { status: 'disabled', reason: '审计员尝试封禁' },
  })
  check('auditor 执行写操作 → 403/40300', auditorWrite.status === 403 && auditorWrite.data.code === 40300, JSON.stringify(auditorWrite.data))

  // ---------- E12-02 审核列表 ----------
  console.log('\n[E12-02] 化妆师审核列表')
  const auditList = await request('GET', '/api/admin/audits/artists?page=1&size=50', { token: adminToken })
  const auditData = (auditList.data && auditList.data.data) || {}
  const auditIds = (auditData.list || []).map((item) => item.id)
  check(
    '列表返回分页字段与状态计数',
    auditList.status === 200 &&
      auditData.page === 1 &&
      auditData.counts &&
      auditData.counts.pending >= 2 &&
      auditData.counts.all >= auditData.counts.pending,
    JSON.stringify(auditData.counts),
  )
  check('待审核申请默认置顶', auditIds[0] === pendingArtist.id || auditIds[0] === pendingArtist2.id, JSON.stringify(auditIds.slice(0, 3)))
  check('列表项包含作品数与脱敏手机号字段', (auditData.list || []).every((item) => 'worksCount' in item && 'phoneMasked' in item))

  const auditKeyword = await request(
    'GET',
    `/api/admin/audits/artists?keyword=${encodeURIComponent(`待审核-${stamp}`)}`,
    { token: adminToken },
  )
  check(
    '关键字可按姓名检索',
    auditKeyword.status === 200 &&
      auditKeyword.data.data.list.some((item) => item.id === pendingArtist.id),
    JSON.stringify(auditKeyword.data.data && auditKeyword.data.data.total),
  )

  const auditPending = await request('GET', '/api/admin/audits/artists?status=pending', { token: adminToken })
  check(
    '按待审核状态筛选只返回 pending',
    auditPending.status === 200 && auditPending.data.data.list.every((item) => item.status === 'pending'),
    JSON.stringify(auditPending.data.data && auditPending.data.data.list.map((item) => item.status)),
  )

  // ---------- E12-03 审核详情与解密留痕 ----------
  console.log('\n[E12-03] 审核详情、身份证解密留痕')
  const detail = await request('GET', `/api/admin/audits/artists/${pendingArtist.id}`, { token: adminToken })
  const detailData = (detail.data && detail.data.data) || {}
  check(
    '详情返回脱敏身份证且不泄露明文',
    detail.status === 200 &&
      detailData.hasIdCard === true &&
      detailData.idCardMasked === '310***********1234' &&
      detailData.idCardMasked !== ID_CARD,
    JSON.stringify(detailData.idCardMasked),
  )
  check(
    '详情返回作品预览与操作流水',
    Array.isArray(detailData.works) &&
      detailData.works.length >= 1 &&
      typeof detailData.works[0].path === 'string' &&
      Array.isArray(detailData.logs),
    JSON.stringify({ works: detailData.works && detailData.works.length }),
  )

  const reveal = await request('POST', `/api/admin/audits/artists/${pendingArtist.id}/reveal`, { token: adminToken })
  check('解密接口返回身份证明文', reveal.status === 200 && reveal.data.data.idCard === ID_CARD, JSON.stringify(reveal.data))

  const revealLog = await prisma.auditLog.findFirst({
    where: { targetType: 'artist', targetId: pendingArtist.id, action: 'reveal' },
    orderBy: { id: 'desc' },
  })
  check(
    '解密查看写入 audit_log 留痕（action=reveal + 操作人）',
    !!revealLog && revealLog.operatorId === adminId && revealLog.reason === '查看身份证明文',
    JSON.stringify(revealLog),
  )

  const rejectNoReason = await request('POST', `/api/admin/audits/artists/${pendingArtist.id}/reject`, {
    token: adminToken,
    body: { reason: ' ' },
  })
  check('驳回未填原因 → 400/40001', rejectNoReason.status === 400 && rejectNoReason.data.code === 40001, JSON.stringify(rejectNoReason.data))

  const approve = await request('POST', `/api/admin/audits/artists/${pendingArtist.id}/approve`, { token: adminToken })
  check('审核通过后状态为 approved', approve.status === 200 && approve.data.data.status === 'approved', JSON.stringify(approve.data.data))

  const approveAgain = await request('POST', `/api/admin/audits/artists/${pendingArtist.id}/approve`, { token: adminToken })
  check('重复审核 → 409/40900', approveAgain.status === 409 && approveAgain.data.code === 40900, JSON.stringify(approveAgain.data))

  const revealMissing = await request('POST', '/api/admin/audits/artists/99999999/reveal', { token: adminToken })
  check('解密不存在的申请 → 404/40400', revealMissing.status === 404 && revealMissing.data.code === 40400)

  // ---------- E12-10 批量与导出 ----------
  console.log('\n[E12-10] 批量操作与导出 xlsx')
  const batch = await request('POST', '/api/admin/audits/artists/batch', {
    token: adminToken,
    body: { ids: [pendingArtist2.id, 99999999], action: 'reject', reason: '材料不完整，请补充作品' },
  })
  check(
    '批量驳回返回成功与失败明细（逐条独立事务）',
    batch.status === 200 &&
      batch.data.data.success.includes(pendingArtist2.id) &&
      batch.data.data.failed.some((item) => item.id === 99999999) &&
      batch.data.data.total === 2,
    JSON.stringify(batch.data.data),
  )
  const rejectedRow = await prisma.artist.findUnique({ where: { id: pendingArtist2.id } })
  check('批量驳回落库为 rejected 且带原因', rejectedRow.status === 'rejected' && !!rejectedRow.rejectReason, JSON.stringify(rejectedRow && rejectedRow.status))

  const batchEmpty = await request('POST', '/api/admin/audits/artists/batch', {
    token: adminToken,
    body: { ids: [], action: 'approve' },
  })
  check('批量操作为空 → 400/40001', batchEmpty.status === 400 && batchEmpty.data.code === 40001, JSON.stringify(batchEmpty.data))

  const exportRes = await request('GET', '/api/admin/audits/artists/export', { token: adminToken, raw: true })
  const isZip = exportRes.buffer.slice(0, 2).toString('latin1') === 'PK'
  check(
    '导出返回 xlsx（ZIP 魔数 PK）',
    exportRes.status === 200 && isZip,
    JSON.stringify({ status: exportRes.status, head: exportRes.buffer.slice(0, 4).toString('hex') }),
  )
  check(
    '导出响应头为 xlsx 且带文件名',
    (exportRes.headers.get('content-type') || '').includes('spreadsheetml') &&
      (exportRes.headers.get('content-disposition') || '').includes('.xlsx'),
    exportRes.headers.get('content-disposition'),
  )
  check('导出文件体积大于 1KB（含工作表结构）', exportRes.buffer.length > 1024, String(exportRes.buffer.length))

  // ---------- E12-04 用户管理 ----------
  console.log('\n[E12-04] 用户列表与封禁解封')
  const userList = await request('GET', '/api/admin/users?size=50', { token: adminToken })
  const userData = (userList.data && userList.data.data) || {}
  check(
    '统一用户列表返回角色计数',
    userList.status === 200 &&
      userData.counts &&
      userData.counts.artist >= 3 &&
      userData.counts.customer >= 1,
    JSON.stringify(userData.counts),
  )
  const userByRole = await request('GET', '/api/admin/users?role=customer&size=50', { token: adminToken })
  check(
    '按角色筛选只返回客户',
    userByRole.status === 200 && userByRole.data.data.list.every((item) => item.role === 'customer'),
    JSON.stringify(userByRole.data.data && userByRole.data.data.list.map((item) => item.role)),
  )

  const banNoReason = await request('POST', `/api/admin/users/${cust.userId}/status`, {
    token: adminToken,
    body: { status: 'disabled', reason: '' },
  })
  check('封禁未填原因 → 400/40001', banNoReason.status === 400 && banNoReason.data.code === 40001, JSON.stringify(banNoReason.data))

  const banCustomer = await request('POST', `/api/admin/users/${cust.userId}/status`, {
    token: adminToken,
    body: { status: 'disabled', reason: '发布违规需求' },
  })
  const bannedDb = await prisma.userAuth.findUnique({
    where: { id: cust.userId },
    include: { customer: true },
  })
  check(
    '封禁同步 user_auth 与 customer 档案',
    banCustomer.status === 200 &&
      banCustomer.data.data.status === 'disabled' &&
      bannedDb.status === 'disabled' &&
      bannedDb.customer.status === 'disabled',
    JSON.stringify({ api: banCustomer.data.data, db: bannedDb.status }),
  )

  const disabledFilter = await request('GET', '/api/admin/users?status=disabled&size=50', { token: adminToken })
  check(
    '禁用状态筛选包含被封禁用户',
    disabledFilter.status === 200 &&
      disabledFilter.data.data.list.some((item) => item.userId === cust.userId),
    JSON.stringify(disabledFilter.data.data && disabledFilter.data.data.counts),
  )

  const unban = await request('POST', `/api/admin/users/${cust.userId}/status`, {
    token: adminToken,
    body: { status: 'active' },
  })
  const unbannedDb = await prisma.userAuth.findUnique({
    where: { id: cust.userId },
    include: { customer: true },
  })
  check(
    '解封恢复账号与档案状态',
    unban.status === 200 &&
      unbannedDb.status === 'active' &&
      unbannedDb.customer.status === 'active',
    JSON.stringify({ api: unban.data.data, db: unbannedDb.status }),
  )

  const banNoRole = await request('POST', `/api/admin/users/${custNoRole.userId}/status`, {
    token: adminToken,
    body: { status: 'disabled', reason: '未选身份' },
  })
  check('未选择身份的账号不可封禁 → 400', banNoRole.status === 400, JSON.stringify(banNoRole.data))

  const customerOptions = await request('GET', '/api/admin/customers/options', { token: adminToken })
  check(
    '客户下拉包含目标客户',
    customerOptions.status === 200 &&
      customerOptions.data.data.list.some((item) => item.id === customerId),
    JSON.stringify(customerOptions.data.data && customerOptions.data.data.list.length),
  )

  // ---------- E12-05 / E12-07 需求管理 ----------
  console.log('\n[E12-05] 需求列表与详情')
  const customerDemand = await request('POST', '/api/demands', {
    token: cust.token,
    body: {
      city,
      district: '静安区',
      serviceDate: dayKey(9),
      serviceType: 'bridal',
      headcount: 1,
      budgetMin: 800,
      budgetMax: 1200,
      remark: `E12 客户需求-${stamp}`,
    },
  })
  const customerDemandId = customerDemand.data.data.id
  created.demandIds.push(customerDemandId)

  const demandList = await request('GET', '/api/admin/demands?size=50', { token: adminToken })
  check(
    '需求列表返回状态计数',
    demandList.status === 200 &&
      demandList.data.data.counts &&
      demandList.data.data.counts.pending >= 1,
    JSON.stringify(demandList.data.data && demandList.data.data.counts),
  )
  const demandBySource = await request('GET', '/api/admin/demands?source=customer&size=50', { token: adminToken })
  check(
    '按来源 customer 筛选只返回客户需求',
    demandBySource.status === 200 &&
      demandBySource.data.data.list.length >= 1 &&
      demandBySource.data.data.list.every((item) => item.source === 'customer'),
    JSON.stringify(demandBySource.data.data && demandBySource.data.data.list.map((item) => item.source)),
  )

  const demandDetail = await request('GET', `/api/admin/demands/${customerDemandId}`, { token: adminToken })
  check(
    '需求详情返回响应列表与服务记录入口',
    demandDetail.status === 200 &&
      Array.isArray(demandDetail.data.data.responses) &&
      'serviceOrder' in demandDetail.data.data,
    JSON.stringify(demandDetail.data.data && demandDetail.data.data.status),
  )

  console.log('\n[E12-07] 运营代发布与代响应')
  const opsDemand = await request('POST', '/api/admin/demands', {
    token: adminToken,
    body: {
      customerId,
      city,
      district: '黄浦区',
      serviceDate: dayKey(10),
      serviceType: 'daily',
      headcount: 2,
      budgetMin: 500,
      budgetMax: 800,
      remark: `E12 运营代发布-${stamp}`,
    },
  })
  check(
    '运营代发布需求标记 source=ops',
    opsDemand.status === 200 && opsDemand.data.data.source === 'ops',
    JSON.stringify(opsDemand.data && opsDemand.data.data),
  )
  const opsDemandId = opsDemand.data.data.id
  created.demandIds.push(opsDemandId)

  const opsInvalidBudget = await request('POST', '/api/admin/demands', {
    token: adminToken,
    body: {
      customerId,
      city,
      district: '黄浦区',
      serviceDate: dayKey(10),
      serviceType: 'daily',
      headcount: 1,
      budgetMin: 900,
      budgetMax: 500,
    },
  })
  check('代发布预算下限高于上限 → 400/40001', opsInvalidBudget.status === 400 && opsInvalidBudget.data.code === 40001, JSON.stringify(opsInvalidBudget.data))

  const opsMissingCustomer = await request('POST', '/api/admin/demands', {
    token: adminToken,
    body: {
      customerId: 99999999,
      city,
      district: '黄浦区',
      serviceDate: dayKey(10),
      serviceType: 'daily',
      headcount: 1,
      budgetMin: 100,
      budgetMax: 200,
    },
  })
  check('代发布客户不存在 → 404/40400', opsMissingCustomer.status === 404 && opsMissingCustomer.data.code === 40400)

  const opsResponse = await request('POST', `/api/admin/demands/${opsDemandId}/responses`, {
    token: adminToken,
    body: { artistId: approvedArtist.id, note: '运营代为沟通' },
  })
  check(
    '运营代响应写 source=ops',
    opsResponse.status === 200 && opsResponse.data.data.source === 'ops' && opsResponse.data.data.responseCount >= 1,
    JSON.stringify(opsResponse.data && opsResponse.data.data),
  )

  const opsResponseAgain = await request('POST', `/api/admin/demands/${opsDemandId}/responses`, {
    token: adminToken,
    body: { artistId: approvedArtist.id },
  })
  check('同一化妆师重复代响应 → 409/40900', opsResponseAgain.status === 409 && opsResponseAgain.data.code === 40900, JSON.stringify(opsResponseAgain.data))

  const opsDetail = await request('GET', `/api/admin/demands/${opsDemandId}`, { token: adminToken })
  check(
    '需求详情展示代响应记录（source=ops）',
    opsDetail.status === 200 &&
      opsDetail.data.data.responses.some((item) => item.source === 'ops'),
    JSON.stringify(opsDetail.data.data && opsDetail.data.data.responses),
  )

  const closedDemand = await request('POST', '/api/admin/demands', {
    token: adminToken,
    body: {
      customerId,
      city,
      district: '黄浦区',
      serviceDate: dayKey(11),
      serviceType: 'event',
      headcount: 1,
      budgetMin: 300,
      budgetMax: 600,
    },
  })
  const closedDemandId = closedDemand.data.data.id
  created.demandIds.push(closedDemandId)
  await prisma.demand.update({ where: { id: closedDemandId }, data: { status: 'closed' } })
  const respondClosed = await request('POST', `/api/admin/demands/${closedDemandId}/responses`, {
    token: adminToken,
    body: { artistId: approvedArtist.id },
  })
  check('已关闭需求不可代响应 → 409/40900', respondClosed.status === 409 && respondClosed.data.code === 40900, JSON.stringify(respondClosed.data))

  const artistOptions = await request('GET', '/api/admin/artists/options', { token: adminToken })
  check(
    '化妆师下拉只含已通过审核',
    artistOptions.status === 200 &&
      artistOptions.data.data.list.some((item) => item.id === approvedArtist.id) &&
      !artistOptions.data.data.list.some((item) => item.id === pendingArtist2.id),
    JSON.stringify(artistOptions.data.data && artistOptions.data.data.list.length),
  )

  // ---------- E12-06 服务记录 ----------
  console.log('\n[E12-06] 服务记录列表与完整链路')
  const targeted = await request('POST', '/api/demands', {
    token: cust.token,
    body: {
      city,
      district: '静安区',
      serviceDate: dayKey(6),
      serviceType: 'bridal',
      headcount: 1,
      budgetMin: 1000,
      budgetMax: 1500,
      targetArtistId: approvedArtist.id,
      remark: `E12 服务记录-${stamp}`,
    },
  })
  const targetedId = targeted.data.data.id
  created.demandIds.push(targetedId)
  const accepted = await request('POST', `/api/demands/${targetedId}/accept`, { token: artOk.token })
  const orderId = accepted.data.data.serviceOrder.id
  created.orderIds.push(orderId)

  const orderList = await request('GET', '/api/admin/service-orders?size=50', { token: adminToken })
  check(
    '服务记录列表返回四态计数',
    orderList.status === 200 &&
      orderList.data.data.counts &&
      orderList.data.data.counts.all >= 1,
    JSON.stringify(orderList.data.data && orderList.data.data.counts),
  )
  check(
    '服务记录列表含本次服务记录与需求来源',
    orderList.data.data.list.some((item) => item.id === orderId && item.demandSource === 'customer'),
    JSON.stringify(orderList.data.data && orderList.data.data.list.map((item) => item.id)),
  )

  const orderStatusFilter = await request('GET', '/api/admin/service-orders?status=pending&size=50', { token: adminToken })
  check(
    '按状态筛选服务记录',
    orderStatusFilter.status === 200 &&
      orderStatusFilter.data.data.list.every((item) => item.status === 'pending'),
    JSON.stringify(orderStatusFilter.data.data && orderStatusFilter.data.data.list.map((item) => item.status)),
  )

  const chain = await request('GET', `/api/admin/service-orders/${orderId}`, { token: adminToken })
  const chainData = (chain.data && chain.data.data) || {}
  check(
    '详情返回完整链路：需求 → 响应 → 服务记录 → 评价',
    chain.status === 200 &&
      chainData.demand &&
      Array.isArray(chainData.demand.responses) &&
      Array.isArray(chainData.reviews) &&
      chainData.customer &&
      chainData.artist,
    JSON.stringify({ demand: chainData.demand && chainData.demand.id, reviews: chainData.reviews && chainData.reviews.length }),
  )
  const chainMissing = await request('GET', '/api/admin/service-orders/99999999', { token: adminToken })
  check('服务记录不存在 → 404/40400', chainMissing.status === 404 && chainMissing.data.code === 40400)

  // ---------- E12-08 作品下架恢复 ----------
  console.log('\n[E12-08] 作品违规下架与恢复')
  const portfolioList = await request('GET', '/api/admin/portfolios?size=50', { token: adminToken })
  check(
    '作品列表返回状态计数',
    portfolioList.status === 200 &&
      portfolioList.data.data.counts &&
      portfolioList.data.data.counts.online >= 1,
    JSON.stringify(portfolioList.data.data && portfolioList.data.data.counts),
  )
  const offlineNoReason = await request('POST', `/api/admin/portfolios/${portfolioOffline.id}/status`, {
    token: adminToken,
    body: { action: 'offline', reason: ' ' },
  })
  check('下架未填原因 → 400/40001', offlineNoReason.status === 400 && offlineNoReason.data.code === 40001, JSON.stringify(offlineNoReason.data))

  const offline = await request('POST', `/api/admin/portfolios/${portfolioOffline.id}/status`, {
    token: adminToken,
    body: { action: 'offline', reason: '涉嫌盗用他人作品' },
  })
  check('下架成功状态置 offline', offline.status === 200 && offline.data.data.status === 'offline', JSON.stringify(offline.data.data))

  const offlineAgain = await request('POST', `/api/admin/portfolios/${portfolioOffline.id}/status`, {
    token: adminToken,
    body: { action: 'offline', reason: '重复下架' },
  })
  check('重复下架 → 409/40900', offlineAgain.status === 409 && offlineAgain.data.code === 40900)

  const restore = await request('POST', `/api/admin/portfolios/${portfolioOffline.id}/status`, {
    token: adminToken,
    body: { action: 'restore' },
  })
  check('恢复成功状态置 online', restore.status === 200 && restore.data.data.status === 'online', JSON.stringify(restore.data.data))

  const restoreAgain = await request('POST', `/api/admin/portfolios/${portfolioOffline.id}/status`, {
    token: adminToken,
    body: { action: 'restore' },
  })
  check('未下架作品恢复 → 409/40900', restoreAgain.status === 409 && restoreAgain.data.code === 40900)

  const portfolioLog = await prisma.auditLog.findFirst({
    where: { targetType: 'portfolio', targetId: portfolioOffline.id },
    orderBy: { id: 'desc' },
  })
  check(
    '作品下架/恢复写入 audit_log',
    !!portfolioLog && ['offline', 'restore'].includes(portfolioLog.action),
    JSON.stringify(portfolioLog),
  )

  const portfolioMissing = await request('POST', '/api/admin/portfolios/99999999/status', {
    token: adminToken,
    body: { action: 'offline', reason: '不存在' },
  })
  check('作品不存在 → 404/40400', portfolioMissing.status === 404 && portfolioMissing.data.code === 40400)

  // ---------- E12-09 审核日志 ----------
  console.log('\n[E12-09] 审核日志只读查询')
  const logList = await request('GET', '/api/admin/audit-logs?size=50', { token: adminToken })
  const logData = (logList.data && logList.data.data) || {}
  check(
    '审核日志返回分页与对象类型计数',
    logList.status === 200 &&
      logData.counts &&
      logData.counts.all >= 1 &&
      logData.counts.artist >= 1 &&
      logData.counts.portfolio >= 1 &&
      logData.counts.user >= 1,
    JSON.stringify(logData.counts),
  )
  check(
    '日志含操作人信息',
    (logData.list || []).every((item) => item.operator && item.operator.username),
    JSON.stringify(logData.list && logData.list[0]),
  )
  const logByType = await request('GET', '/api/admin/audit-logs?targetType=portfolio&size=50', { token: adminToken })
  check(
    '按对象类型筛选只返回作品日志',
    logByType.status === 200 &&
      logByType.data.data.list.length >= 1 &&
      logByType.data.data.list.every((item) => item.targetType === 'portfolio'),
    JSON.stringify(logByType.data.data && logByType.data.data.list.map((item) => item.targetType)),
  )
  const logByAction = await request('GET', '/api/admin/audit-logs?action=reveal&size=50', { token: adminToken })
  check(
    '按动作筛选可查到解密留痕',
    logByAction.status === 200 &&
      logByAction.data.data.list.some((item) => item.action === 'reveal' && item.targetId === pendingArtist.id),
    JSON.stringify(logByAction.data.data && logByAction.data.data.total),
  )
  const logAuditor = await request('GET', '/api/admin/audit-logs', { token: auditorToken })
  check('auditor 可读取审核日志', logAuditor.status === 200)

  // ---------- OpenAPI ----------
  console.log('\n[E12] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const docData = (doc.data && doc.data) || {}
  const expectedPaths = [
    '/api/admin/audits/artists',
    '/api/admin/audits/artists/export',
    '/api/admin/audits/artists/{id}',
    '/api/admin/audits/artists/{id}/reveal',
    '/api/admin/audits/artists/batch',
    '/api/admin/artists/options',
    '/api/admin/users',
    '/api/admin/users/{id}/status',
    '/api/admin/customers/options',
    '/api/admin/demands',
    '/api/admin/demands/{id}',
    '/api/admin/demands/{id}/responses',
    '/api/admin/service-orders',
    '/api/admin/service-orders/{id}',
    '/api/admin/portfolios',
    '/api/admin/portfolios/{id}/status',
    '/api/admin/audit-logs',
  ]
  check(
    'OpenAPI 已包含 E12 全部接口',
    expectedPaths.every((path) => !!docData.paths[path]),
    JSON.stringify(expectedPaths.filter((path) => !docData.paths[path])),
  )
  check(
    'OpenAPI 版本不低于 0.9.1',
    Boolean(
      docData.info &&
        /^\d+\.\d+\.\d+$/.test(docData.info.version) &&
        docData.info.version.localeCompare('0.9.1', undefined, { numeric: true }) >= 0,
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
      OR: [{ customerId: { in: created.customerIds } }, { artistId: { in: created.artistIds } }],
    },
  })
  await prisma.demandResponse.deleteMany({
    where: { OR: [{ artistId: { in: created.artistIds } }, { demandId: { in: created.demandIds } }] },
  })
  await prisma.demand.deleteMany({ where: { id: { in: created.demandIds } } })
  await prisma.artistSchedule.deleteMany({ where: { artistId: { in: created.artistIds } } })
  await prisma.artistPortfolio.deleteMany({ where: { id: { in: created.portfolioIds } } })
  await prisma.auditLog.deleteMany({ where: { targetId: { in: [...created.artistIds, ...created.portfolioIds, ...created.userIds] } } })
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
