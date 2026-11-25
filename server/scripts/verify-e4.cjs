/* eslint-disable */
/**
 * E4 冒烟验证脚本（可重复执行）：node scripts/verify-e4.cjs
 * 覆盖 E4-01 ~ E4-06 的服务端验收点：
 * 入驻提交 / 作品与身份证处理 / 重复提交 / 审核状态机 / 编辑重审规则 / audit_log。
 * 依赖 dev 兜底（WX_APPID / WX_SECRET 为空）与种子后台账号。
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:3000'
const prisma = new PrismaClient()

const ID_CARD = '310101199001011234'
const ID_CARD_MASKED = '310***********1234'

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
  const isJson = (res.headers.get('content-type') || '').includes('json')
  const data = isJson ? await res.json() : null
  return { status: res.status, data }
}

/** 走「签名 → PUT 二进制」完整链路，返回可提交的 fileId 列表 */
async function uploadWorks(token, count) {
  const fileIds = []
  for (let index = 0; index < count; index += 1) {
    const sign = await request('POST', '/api/upload/sign', {
      token,
      body: {
        scene: 'portfolio',
        fileName: `e4-work-${index}.png`,
        mimeType: 'image/png',
        size: 68,
      },
    })
    if (sign.status !== 200) throw new Error(`签名失败：${JSON.stringify(sign.data)}`)

    const payload = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const uploaded = await request('PUT', sign.data.data.uploadPath, {
      body: payload,
      headers: { 'content-type': 'image/png' },
    })
    if (uploaded.status !== 200) throw new Error(`上传失败：${JSON.stringify(uploaded.data)}`)
    fileIds.push(sign.data.data.fileId)
  }
  return fileIds
}

function payloadOf(fileIds, overrides = {}) {
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

async function main() {
  console.log(`[verify] base=${BASE}`)

  const stamp = Date.now()
  const openid = `dev-openid-e4-${stamp}`
  const openidB = `dev-openid-e4b-${stamp}`
  let userIdA = null
  let userIdB = null
  let artistId = null

  // 准备：两个化妆师账号 + 一个后台账号
  const loginA = await request('POST', '/api/auth/wx-login', { body: { code: openid } })
  userIdA = loginA.data.data.userId
  const roleA = await request('POST', '/api/auth/role', {
    token: loginA.data.data.accessToken,
    body: { role: 'artist' },
  })
  const tokenA = roleA.data.data.accessToken

  const loginB = await request('POST', '/api/auth/wx-login', { body: { code: openidB } })
  userIdB = loginB.data.data.userId
  const roleB = await request('POST', '/api/auth/role', {
    token: loginB.data.data.accessToken,
    body: { role: 'artist' },
  })
  const tokenB = roleB.data.data.accessToken

  const adminLogin = await request('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'Admin@123456' },
  })
  const adminToken = (adminLogin.data.data || {}).accessToken
  const adminId = (adminLogin.data.data || {}).admin
    ? adminLogin.data.data.admin.id
    : null
  check('后台账号可登录（审核入口可用）', adminLogin.status === 200 && !!adminToken)

  console.log('\n[E4-02] 选角色即建档 / 完善个人信息')
  const autoProfile = await request('GET', '/api/artist/me', { token: tokenA })
  check(
    '选角色后自动建档（profileCompleted=false / status=approved）',
    autoProfile.status === 200 &&
      !!autoProfile.data.data &&
      autoProfile.data.data.profileCompleted === false &&
      autoProfile.data.data.status === 'approved',
    JSON.stringify(autoProfile.data).slice(0, 300),
  )

  const creditBefore = await request('GET', `/api/credit/${userIdA}`)
  check(
    '完善前信用分为初始 0 分 / 待提升',
    creditBefore.status === 200 &&
      creditBefore.data.data.score === 0 &&
      creditBefore.data.data.level === '待提升',
    JSON.stringify(creditBefore.data),
  )

  const minimal = await request('POST', '/api/artist/apply', {
    token: tokenA,
    body: { name: '林小满', city: '上海', agreed: true },
  })
  artistId = (minimal.data.data || {}).id
  check(
    '仅姓名 + 城市即可提交，提交即生效（approved）',
    minimal.status === 200 &&
      !!artistId &&
      minimal.data.data.status === 'approved' &&
      minimal.data.data.profileCompleted === true,
    JSON.stringify(minimal.data).slice(0, 300),
  )

  const creditRow = await prisma.creditScore.findUnique({ where: { userId: userIdA } })
  check(
    '完善信息后信用分建档，初始 0 分',
    !!creditRow && creditRow.score === 0 && creditRow.level === '待提升',
    JSON.stringify(creditRow && { score: creditRow.score, level: creditRow.level }),
  )

  const duplicate = await request('POST', '/api/artist/apply', {
    token: tokenA,
    body: { name: '林小满', city: '上海', agreed: true },
  })
  check(
    '重复提交视为覆盖更新（不再 409）',
    duplicate.status === 200 && duplicate.data.data.status === 'approved',
    JSON.stringify(duplicate.data),
  )

  const noAuth = await request('POST', '/api/artist/apply', {
    body: { name: '林小满', city: '上海', agreed: true },
  })
  check('未登录提交 → 401/40100', noAuth.status === 401 && noAuth.data.code === 40100)

  const customerLogin = await request('POST', '/api/auth/wx-login', {
    body: { code: 'dev-customer-openid' },
  })
  const customerToken = customerLogin.data.data.accessToken
  const wrongRole = await request('POST', '/api/artist/apply', {
    token: customerToken,
    body: { name: '林小满', city: '上海', agreed: true },
  })
  check('客户角色提交 → 403/40300', wrongRole.status === 403 && wrongRole.data.code === 40300)

  const foreignWorks = await uploadWorks(tokenB, 1)
  const foreign = await request('PUT', '/api/artist/me', {
    token: tokenA,
    body: payloadOf(foreignWorks),
  })
  check(
    '引用他人 fileId 提交 → 400/40001',
    foreign.status === 400 && foreign.data.code === 40001,
    JSON.stringify(foreign.data),
  )

  console.log('\n[E4-02] 作品与身份证（选填）')
  const sixWorks = await uploadWorks(tokenA, 6)
  const applied = await request('PUT', '/api/artist/me', {
    token: tokenA,
    body: payloadOf(sixWorks),
  })
  check(
    '提交作品与身份证成功且保持 approved',
    applied.status === 200 &&
      applied.data.data.status === 'approved' &&
      applied.data.data.works.length === 6,
    JSON.stringify(applied.data).slice(0, 300),
  )
  check(
    '返回身份证脱敏值（不含明文）',
    applied.data.data.idCardMasked === ID_CARD_MASKED &&
      !JSON.stringify(applied.data).includes(ID_CARD),
    applied.data.data.idCardMasked,
  )
  check(
    '作品返回私有签名地址（/api/files/raw）',
    applied.data.data.works.length === 6 &&
      applied.data.data.works.every((work) => work.path.indexOf('/api/files/raw') === 0),
  )

  const artistRow = await prisma.artist.findUnique({ where: { id: artistId } })
  check(
    '身份证仅存 AES 密文（v1. 前缀，不含明文）',
    !!artistRow.idCardCipher &&
      artistRow.idCardCipher.startsWith('v1.') &&
      !artistRow.idCardCipher.includes(ID_CARD),
  )

  console.log('\n[E4-05] 资料编辑（不再回退审核）')
  const introOnly = await request('PUT', '/api/artist/me', {
    token: tokenA,
    body: payloadOf(sixWorks, { intro: '补充：擅长法式盘发与妈妈妆' }),
  })
  check(
    '仅改简介 keyChanged=false 且状态保持 approved',
    introOnly.status === 200 &&
      introOnly.data.data.keyChanged === false &&
      introOnly.data.data.status === 'approved',
    JSON.stringify({ keyChanged: introOnly.data.data.keyChanged, status: introOnly.data.data.status }),
  )

  const nameChanged = await request('PUT', '/api/artist/me', {
    token: tokenA,
    body: payloadOf(sixWorks, { name: '林小满满' }),
  })
  check(
    '改姓名 keyChanged=true 且仍为 approved（不回退审核）',
    nameChanged.status === 200 &&
      nameChanged.data.data.keyChanged === true &&
      nameChanged.data.data.status === 'approved',
    JSON.stringify({ keyChanged: nameChanged.data.data.keyChanged, status: nameChanged.data.data.status }),
  )

  const worksOmitted = await request('PUT', '/api/artist/me', {
    token: tokenA,
    body: { name: '林小满满', city: '上海', agreed: true },
  })
  check(
    '不传 works 时保留原有作品',
    worksOmitted.status === 200 && worksOmitted.data.data.works.length === 6,
    JSON.stringify({ works: (worksOmitted.data.data.works || []).length }),
  )

  console.log('\n[E4-06] 审核状态机与 audit_log（历史 pending 数据）')
  const artistB = await prisma.artist.findUnique({ where: { userId: userIdB } })
  const artistIdB = artistB.id
  await prisma.artist.update({
    where: { id: artistIdB },
    data: { status: 'pending', profileCompleted: false },
  })

  const artistApprove = await request('POST', `/api/admin/audits/artists/${artistIdB}/approve`, {
    token: tokenB,
  })
  check('化妆师 token 调用审核接口 → 403', artistApprove.status === 403)

  const approved = await request('POST', `/api/admin/audits/artists/${artistIdB}/approve`, {
    token: adminToken,
  })
  check(
    'pending → approved 成功',
    approved.status === 200 && approved.data.data.status === 'approved',
    JSON.stringify(approved.data),
  )

  const approveAgain = await request('POST', `/api/admin/audits/artists/${artistIdB}/approve`, {
    token: adminToken,
  })
  check(
    '已通过再次审核 → 409（状态机限制）',
    approveAgain.status === 409 && approveAgain.data.code === 40900,
  )

  await prisma.artist.update({ where: { id: artistIdB }, data: { status: 'pending' } })

  const rejectNoReason = await request('POST', `/api/admin/audits/artists/${artistIdB}/reject`, {
    token: adminToken,
    body: {},
  })
  check('驳回缺少原因 → 400/40001', rejectNoReason.status === 400 && rejectNoReason.data.code === 40001)

  const rejected = await request('POST', `/api/admin/audits/artists/${artistIdB}/reject`, {
    token: adminToken,
    body: { reason: '作品风格与资料描述不一致，请补充婚礼跟妆作品' },
  })
  check(
    'pending → rejected 并记录原因',
    rejected.status === 200 &&
      rejected.data.data.status === 'rejected' &&
      rejected.data.data.rejectReason === '作品风格与资料描述不一致，请补充婚礼跟妆作品',
    JSON.stringify(rejected.data),
  )

  const approveRejected = await request('POST', `/api/admin/audits/artists/${artistIdB}/approve`, {
    token: adminToken,
  })
  check('驳回状态直接通过 → 409（须先重新提审）', approveRejected.status === 409)

  const resubmitted = await request('POST', '/api/artist/apply', {
    token: tokenB,
    body: { name: '林小满', city: '上海', intro: '已补充婚礼跟妆作品', agreed: true },
  })
  check(
    '驳回 → 重新提交直接生效 approved 且清空原因',
    resubmitted.status === 200 &&
      resubmitted.data.data.status === 'approved' &&
      resubmitted.data.data.rejectReason === null,
    JSON.stringify(resubmitted.data).slice(0, 300),
  )

  const logs = await prisma.auditLog.findMany({
    where: { targetType: 'artist', targetId: artistIdB },
    orderBy: { id: 'asc' },
  })
  check(
    'audit_log 记录通过/驳回且包含操作人',
    logs.length === 2 &&
      logs[0].action === 'approve' &&
      logs[1].action === 'reject' &&
      logs.every((log) => log.operatorId === adminId) &&
      logs[1].reason === '作品风格与资料描述不一致，请补充婚礼跟妆作品',
    JSON.stringify(logs.map((log) => ({ action: log.action, operatorId: log.operatorId }))),
  )

  console.log('\n[E4-08] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const paths = (doc.data && doc.data.paths) || {}
  check(
    'OpenAPI 已包含 E4 五个接口',
    [
      '/api/artist/apply',
      '/api/artist/me',
      '/api/admin/audits/artists/{id}/approve',
      '/api/admin/audits/artists/{id}/reject',
    ].every((path) => !!paths[path]) && !!paths['/api/artist/me'].put,
  )

  // 清理测试数据（作品随 artist 级联删除，文件与信用分按用户清理）
  const testArtistIds = (
    await prisma.artist.findMany({
      where: { userId: { in: [userIdA, userIdB] } },
      select: { id: true },
    })
  ).map((item) => item.id)
  if (testArtistIds.length) {
    await prisma.auditLog.deleteMany({ where: { targetType: 'artist', targetId: { in: testArtistIds } } })
    await prisma.artist.deleteMany({ where: { id: { in: testArtistIds } } })
  }
  await prisma.fileObject.deleteMany({ where: { userId: { in: [userIdA, userIdB] } } })
  await prisma.userAuth.deleteMany({ where: { openid: { in: [openid, openidB] } } })

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
