/* eslint-disable */
/**
 * E5 冒烟验证脚本（可重复执行）：node scripts/verify-e5.cjs
 * 覆盖 E5-01 ~ E5-07 的服务端验收点：
 * 作品增删改查与排序、越权隔离、公开主页 / 档期摘要、UV 去重、后台 UV 查询、小程序码、接口文档。
 * 依赖 dev 兜底（WX_APPID / WX_SECRET 为空）与种子后台账号。
 */
require('dotenv').config()
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

/** 走「签名 → PUT 二进制」完整链路，返回可提交的 fileId 列表 */
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

function dayKey(offsetDays = 0) {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays))
    .toISOString()
    .slice(0, 10)
}

/** 注册 + 绑定化妆师角色 */
async function createArtistAccount(code) {
  const login = await request('POST', '/api/auth/wx-login', { body: { code } })
  const userId = login.data.data.userId
  const role = await request('POST', '/api/auth/role', {
    token: login.data.data.accessToken,
    body: { role: 'artist' },
  })
  return { userId, token: role.data.data.accessToken }
}

async function main() {
  console.log(`[verify] base=${BASE}`)

  const stamp = Date.now()
  const created = { userIds: [], artistIds: [] }

  // ---------- 准备：已完善个人信息的主账号 A ----------
  const accountA = await createArtistAccount(`dev-openid-e5a-${stamp}`)
  created.userIds.push(accountA.userId)
  const worksA = await uploadWorks(accountA.token, 6, 'e5-a')
  const appliedA = await request('POST', '/api/artist/apply', {
    token: accountA.token,
    body: applyPayload(worksA),
  })
  const artistIdA = (appliedA.data.data || {}).id
  created.artistIds.push(artistIdA)
  check(
    '准备：化妆师 A 提交个人信息（提交即生效 approved）',
    appliedA.status === 200 &&
      !!artistIdA &&
      appliedA.data.data.status === 'approved' &&
      appliedA.data.data.profileCompleted === true,
    JSON.stringify(appliedA.data).slice(0, 200),
  )

  // 档期：明天可接、后天已排（用于主页档期摘要）
  await prisma.artistSchedule.create({
    data: { artistId: artistIdA, date: new Date(`${dayKey(1)}T00:00:00.000Z`), state: 'available' },
  })
  await prisma.artistSchedule.create({
    data: { artistId: artistIdA, date: new Date(`${dayKey(2)}T00:00:00.000Z`), state: 'booked' },
  })

  console.log('\n[E5-04] 公开主页与可见性')
  // 未完善个人信息（profileCompleted=false）时对外 404，本人仍可预览
  await prisma.artist.update({ where: { id: artistIdA }, data: { profileCompleted: false } })
  const pendingPublic = await request('GET', `/api/artist/${artistIdA}`)
  check(
    '未完善个人信息主页对外 404',
    pendingPublic.status === 404 && pendingPublic.data.code === 40400,
    JSON.stringify(pendingPublic.data),
  )

  const ownerPreview = await request('GET', `/api/artist/${artistIdA}`, { token: accountA.token })
  check(
    '本人可预览未完善信息的主页，档期为 14 天',
    ownerPreview.status === 200 &&
      ownerPreview.data.data.schedule.days.length === 14 &&
      ownerPreview.data.data.status === 'approved',
    JSON.stringify(ownerPreview.data).slice(0, 200),
  )

  await prisma.artist.update({ where: { id: artistIdA }, data: { profileCompleted: true } })

  const publicProfile = await request('GET', `/api/artist/${artistIdA}`)
  const profile = publicProfile.data.data || {}
  check(
    '公开主页返回姓名 / 城市 / 年限 / 风格 / 作品数',
    publicProfile.status === 200 &&
      profile.name === '林小满' &&
      profile.city === '上海' &&
      profile.years === 5 &&
      Array.isArray(profile.styles) &&
      profile.styles.length === 2 &&
      profile.worksTotal === 6,
    JSON.stringify(profile).slice(0, 300),
  )
  check(
    '首图返回私有签名地址（/api/files/raw）',
    typeof profile.coverPath === 'string' && profile.coverPath.indexOf('/api/files/raw') === 0,
    profile.coverPath,
  )
  check(
    '档期摘要：明天可接 / 后天已排 / 其余不可接',
    profile.schedule.availableDays === 1 &&
      profile.schedule.days[1].state === 'available' &&
      profile.schedule.days[2].state === 'booked' &&
      profile.schedule.days[3].state === 'none' &&
      profile.schedule.nextAvailableDate === dayKey(1),
    JSON.stringify(profile.schedule).slice(0, 300),
  )

  console.log('\n[E5-02 / E5-03 / E5-07] 作品列表、分页与越权')
  const page1 = await request('GET', `/api/artist/${artistIdA}/portfolios?page=1&size=4`)
  const page1Data = page1.data.data || {}
  check(
    '作品列表分页：total=6，首屏 4 条',
    page1.status === 200 && page1Data.total === 6 && page1Data.list.length === 4,
    JSON.stringify(page1Data).slice(0, 200),
  )
  check(
    '统计返回图片 6 / 视频 0 / 阈值 6',
    page1Data.counts &&
      page1Data.counts.image === 6 &&
      page1Data.counts.video === 0 &&
      page1Data.counts.minImages === 6,
    JSON.stringify(page1Data.counts),
  )
  check(
    '列表按 sort 升序（与首页瀑布流一致）',
    page1Data.list.every((item, index) => item.sort === index),
    JSON.stringify(page1Data.list.map((item) => item.sort)),
  )

  const page2 = await request('GET', `/api/artist/${artistIdA}/portfolios?page=2&size=4`)
  const page2Data = page2.data.data || {}
  const ids1 = page1Data.list.map((item) => item.id)
  const ids2 = (page2Data.list || []).map((item) => item.id)
  check(
    '第二页 2 条且与第一页无重复（分页无重复）',
    page2Data.list.length === 2 && ids2.every((id) => ids1.indexOf(id) === -1),
    JSON.stringify({ ids1, ids2 }),
  )

  // ---------- 越权：B 未入驻 / 引用他人文件 ----------
  const accountB = await createArtistAccount(`dev-openid-e5b-${stamp}`)
  created.userIds.push(accountB.userId)
  const worksB = await uploadWorks(accountB.token, 1, 'e5-b')

  const foreignCreate = await request('POST', '/api/portfolio', {
    token: accountA.token,
    body: { fileId: worksB[0] },
  })
  check(
    '引用他人 fileId 新增作品 → 400/40001',
    foreignCreate.status === 400 && foreignCreate.data.code === 40001,
    JSON.stringify(foreignCreate.data),
  )

  const draftCreate = await request('POST', '/api/portfolio', {
    token: accountB.token,
    body: { fileId: worksB[0] },
  })
  check(
    '未完善个人信息的化妆师仍可新增作品（功能不设限）',
    draftCreate.status === 200 && draftCreate.data.data.status === 'pending',
    JSON.stringify(draftCreate.data).slice(0, 200),
  )

  const otherLogin = await request('POST', '/api/auth/wx-login', {
    body: { code: `dev-openid-e5m-${stamp}` },
  })
  const otherUser = otherLogin.data.data
  created.userIds.push(otherUser.userId)
  const otherToken = otherUser.accessToken
  const wrongRole = await request('POST', '/api/portfolio', {
    token: otherToken,
    body: { fileId: worksB[0] },
  })
  check('未入驻账号新增作品 → 403/40300', wrongRole.status === 403 && wrongRole.data.code === 40300)

  console.log('\n[E5-01] 新增作品与默认命名')
  const extraWorks = await uploadWorks(accountA.token, 1, 'e5-a-extra')
  const createdWork = await request('POST', '/api/portfolio', {
    token: accountA.token,
    body: { fileId: extraWorks[0], title: '法式复古新娘', styles: ['retro', 'bridal'] },
  })
  const newWork = createdWork.data.data || {}
  check(
    '新增作品追加到末尾（sort=6）并写入标题 / 风格',
    createdWork.status === 200 &&
      newWork.sort === 6 &&
      newWork.title === '法式复古新娘' &&
      Array.isArray(newWork.styles) &&
      newWork.styles.length === 2,
    JSON.stringify(newWork).slice(0, 300),
  )

  const autoTitle = await request('POST', '/api/portfolio', {
    token: accountA.token,
    body: { fileId: (await uploadWorks(accountA.token, 1, 'e5-a-auto'))[0] },
  })
  check(
    '未传标题时自动命名为「作品 N」',
    autoTitle.status === 200 && autoTitle.data.data.title === '作品 8',
    JSON.stringify(autoTitle.data).slice(0, 200),
  )

  console.log('\n[E5-02] 编辑、排序与删除重排')
  const foreignUpdate = await request('PUT', `/api/portfolio/${newWork.id}`, {
    token: accountB.token,
    body: { title: '篡改标题' },
  })
  check(
    '他人编辑作品 → 404/40400',
    foreignUpdate.status === 404 && foreignUpdate.data.code === 40400,
    JSON.stringify(foreignUpdate.data),
  )

  const firstMoveUp = await request('PUT', `/api/portfolio/${page1Data.list[0].id}`, {
    token: accountA.token,
    body: { move: 'up' },
  })
  check(
    '首个作品上移 → moved=false',
    firstMoveUp.status === 200 && firstMoveUp.data.data.moved === false,
    JSON.stringify(firstMoveUp.data),
  )

  const lastMoveUp = await request('PUT', `/api/portfolio/${autoTitle.data.data.id}`, {
    token: accountA.token,
    body: { move: 'up' },
  })
  check(
    '末位作品上移 → moved=true',
    lastMoveUp.status === 200 && lastMoveUp.data.data.moved === true,
    JSON.stringify(lastMoveUp.data),
  )

  const reordered = await request('GET', `/api/artist/${artistIdA}/portfolios?page=1&size=100`)
  const orderedIds = reordered.data.data.list.map((item) => item.id)
  check(
    '上移后 sort 连续且被移动项前移一位',
    reordered.data.data.list.every((item, index) => item.sort === index) &&
      orderedIds.indexOf(autoTitle.data.data.id) === orderedIds.length - 2,
    JSON.stringify(orderedIds),
  )

  const titleUpdate = await request('PUT', `/api/portfolio/${newWork.id}`, {
    token: accountA.token,
    body: { title: '法式复古新娘（改）', styles: ['retro'] },
  })
  check(
    '修改标题与风格生效',
    titleUpdate.status === 200 &&
      titleUpdate.data.data.title === '法式复古新娘（改）' &&
      titleUpdate.data.data.styles.length === 1,
    JSON.stringify(titleUpdate.data).slice(0, 200),
  )

  const foreignDelete = await request('DELETE', `/api/portfolio/${newWork.id}`, {
    token: accountB.token,
  })
  check(
    '他人删除作品 → 404/40400',
    foreignDelete.status === 404 && foreignDelete.data.code === 40400,
    JSON.stringify(foreignDelete.data),
  )

  const deleted = await request('DELETE', `/api/portfolio/${newWork.id}`, { token: accountA.token })
  check(
    '删除作品返回剩余数量',
    deleted.status === 200 && deleted.data.data.deleted === true && deleted.data.data.total === 7,
    JSON.stringify(deleted.data),
  )

  const afterDelete = await request('GET', `/api/artist/${artistIdA}/portfolios?page=1&size=100`)
  const afterList = afterDelete.data.data.list || []
  check(
    '删除后 sort 重排为连续 0..n-1',
    afterList.length === 7 && afterList.every((item, index) => item.sort === index),
    JSON.stringify(afterList.map((item) => item.sort)),
  )

  console.log('\n[E5-06] 主页 UV 去重与后台查询')
  const adminLogin = await request('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'Admin@123456' },
  })
  const adminToken = (adminLogin.data.data || {}).accessToken
  check('后台账号可登录', adminLogin.status === 200 && !!adminToken)

  const deviceId = `verify-e5-device-${stamp}`
  const visit1 = await request('POST', `/api/artist/${artistIdA}/visit`, { body: { deviceId } })
  const visit2 = await request('POST', `/api/artist/${artistIdA}/visit`, { body: { deviceId } })
  check(
    '同设备同日首次上报 deduped=false',
    visit1.status === 200 && visit1.data.data.deduped === false && visit1.data.data.uv >= 1,
    JSON.stringify(visit1.data),
  )
  check(
    '同设备同日再次上报 deduped=true 且 UV 不累加',
    visit2.status === 200 &&
      visit2.data.data.deduped === true &&
      visit2.data.data.uv === visit1.data.data.uv,
    JSON.stringify(visit2.data),
  )

  const shortDevice = await request('POST', `/api/artist/${artistIdA}/visit`, {
    body: { deviceId: 'abc' },
  })
  check('设备标识过短 → 400/40001', shortDevice.status === 400 && shortDevice.data.code === 40001)

  const stats = await request('GET', `/api/admin/stats/artist-uv?date=${dayKey(0)}`, {
    token: adminToken,
  })
  const statsData = stats.data.data || {}
  const topA = (statsData.topArtists || []).filter((item) => item.artistId === artistIdA)[0]
  check(
    '后台按日期查询主页 UV（含 Top 榜单）',
    stats.status === 200 && statsData.date === dayKey(0) && statsData.totalUv >= 1 && !!topA,
    JSON.stringify(statsData).slice(0, 300),
  )
  check('Top 榜单含化妆师姓名与城市', !!topA && topA.name === '林小满' && topA.city === '上海')

  const statsForbidden = await request('GET', '/api/admin/stats/artist-uv', {
    token: accountA.token,
  })
  check('非管理员查询 UV → 403/40300', statsForbidden.status === 403)

  const statsBadDate = await request('GET', '/api/admin/stats/artist-uv?date=2026/11/19', {
    token: adminToken,
  })
  check('日期格式错误 → 400/40001', statsBadDate.status === 400 && statsBadDate.data.code === 40001)

  console.log('\n[E5-05] 小程序码')
  const qrcode = await request('GET', `/api/artist/${artistIdA}/qrcode`)
  check(
    '未配置 AppID 时返回明确错误（500/50000）',
    qrcode.status === 500 &&
      qrcode.data.code === 50000 &&
      String(qrcode.data.message).indexOf('AppID') > -1,
    JSON.stringify(qrcode.data),
  )

  const pendingArtist = await createArtistAccount(`dev-openid-e5c-${stamp}`)
  created.userIds.push(pendingArtist.userId)
  const worksC = await uploadWorks(pendingArtist.token, 6, 'e5-c')
  const appliedC = await request('POST', '/api/artist/apply', {
    token: pendingArtist.token,
    body: applyPayload(worksC, { name: '周小西' }),
  })
  const artistIdC = (appliedC.data.data || {}).id
  created.artistIds.push(artistIdC)
  // 提交即生效后，手工把 C 置为未完善个人信息，验证对外不可见
  await prisma.artist.update({ where: { id: artistIdC }, data: { profileCompleted: false } })

  const cProfile = await request('GET', `/api/artist/${artistIdC}`)
  const cWorks = await request('GET', `/api/artist/${artistIdC}/portfolios`)
  const cVisit = await request('POST', `/api/artist/${artistIdC}/visit`, {
    body: { deviceId: `verify-e5-c-${stamp}` },
  })
  const cQrcode = await request('GET', `/api/artist/${artistIdC}/qrcode`)
  check(
    '未完善个人信息化妆师的公开主页 / 作品 / UV / 小程序码一律 404',
    cProfile.status === 404 &&
      cWorks.status === 404 &&
      cVisit.status === 404 &&
      cQrcode.status === 404,
    JSON.stringify({
      profile: cProfile.status,
      works: cWorks.status,
      visit: cVisit.status,
      qrcode: cQrcode.status,
    }),
  )

  console.log('\n[E5-08] 接口文档')
  const doc = await request('GET', '/api-docs/openapi.json')
  const paths = (doc.data && doc.data.paths) || {}
  check(
    'OpenAPI 已包含 E5 八个接口',
    [
      '/api/artist/{id}',
      '/api/artist/{id}/visit',
      '/api/artist/{id}/qrcode',
      '/api/artist/{id}/portfolios',
      '/api/portfolio',
      '/api/portfolio/{id}',
      '/api/admin/stats/artist-uv',
    ].every((path) => !!paths[path]) &&
      !!paths['/api/portfolio/{id}'].put &&
      !!paths['/api/portfolio/{id}'].delete,
  )

  // 清理测试数据（作品 / 档期 / UV 随 artist 级联删除）
  for (const artistId of created.artistIds) {
    if (!artistId) continue
    await prisma.auditLog.deleteMany({ where: { targetType: 'artist', targetId: artistId } })
    await prisma.artist.deleteMany({ where: { id: artistId } })
  }
  // 兼容历史失败用例残留：按 userId 兜底清理 artist 记录
  await prisma.artist.deleteMany({ where: { userId: { in: created.userIds } } })
  await prisma.fileObject.deleteMany({ where: { userId: { in: created.userIds } } })
  await prisma.userAuth.deleteMany({
    where: { openid: { startsWith: `dev-openid-e5` } },
  })

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
