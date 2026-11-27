/* eslint-disable */
/**
 * E14 冒烟验证脚本（可重复执行）：node scripts/verify-e14.cjs
 * 覆盖 E14-01 ~ E14-04 的服务端验收点：
 * 内容安全（未配置微信时「超时按通过并记录待复核」、回调 pass/reject 更新状态、
 * 检测中作品对外不可见）、作品水印副本（watermarkFileId → displayPath）、
 * 举报提交（原因校验 / 24 小时限频 / 对象校验）、我的举报记录、
 * 后台举报处理（dismiss / offline 下架联动 / ban 封禁联动 / 结果回显与站内通知）、OpenAPI。
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

async function request(method, path, { token, body, headers = {}, raw = false } = {}) {
  const finalHeaders = { ...headers }
  if (body !== undefined && !Buffer.isBuffer(body)) finalHeaders['content-type'] = 'application/json'
  if (token) finalHeaders.authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,
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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** 签名 → PUT 直传完整链路，返回 fileId */
async function uploadFile(token, { scene, size = PNG.length, mimeType = 'image/png' }) {
  const sign = await request('POST', '/api/upload/sign', {
    token,
    body: { scene, fileName: `e14-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`, mimeType, size },
  })
  if (sign.status !== 200) throw new Error(`签名失败：${JSON.stringify(sign.data)}`)
  const payload = PNG.subarray(0, Math.min(size, PNG.length))
  const put = await request('PUT', sign.data.data.uploadPath, {
    body: payload,
    headers: { 'content-type': mimeType },
  })
  if (put.status !== 200) throw new Error(`直传失败：${JSON.stringify(put.data)}`)
  return sign.data.data.fileId
}

async function main() {
  console.log(`[verify] base=${BASE}`)
  const stamp = Date.now()
  const city = '上海'
  const created = {
    userIds: [],
    openids: [],
    artistIds: [],
    portfolioIds: [],
    fileIds: [],
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

  try {
    // ---------- 准备：化妆师（已审核）+ 客户 ----------
    const artist = await createAccount(`dev-openid-e14a-${stamp}`, 'artist')
    created.userIds.push(artist.userId)
    created.openids.push(`dev-openid-e14a-${stamp}`)

    const apply = await request('POST', '/api/artist/apply', {
      token: artist.token,
      body: {
        name: `E14 化妆师-${stamp}`,
        city,
        district: '静安区',
        years: 5,
        styles: ['bridal'],
        agreed: true,
      },
    })
    if (apply.status !== 200) throw new Error(`化妆师资料失败：${JSON.stringify(apply.data)}`)
    const artistMe = await request('GET', '/api/artist/me', { token: artist.token })
    const artistId = artistMe.data.data.id
    created.artistIds.push(artistId)
    await prisma.artist.update({
      where: { id: artistId },
      data: { status: 'approved', auditAt: new Date() },
    })

    const cust = await createAccount(`dev-openid-e14c-${stamp}`, 'customer')
    created.userIds.push(cust.userId)
    created.openids.push(`dev-openid-e14c-${stamp}`)

    const adminLogin = await request('POST', '/api/admin/auth/login', {
      body: { username: 'admin', password: 'Admin@123456' },
    })
    const adminToken = adminLogin.data && adminLogin.data.data && adminLogin.data.data.accessToken
    if (!adminToken) throw new Error('后台登录失败')

    // ---------- E14-01 内容安全 ----------
    console.log('\n[E14-01] 作品内容安全检测')
    const workFileId = await uploadFile(artist.token, { scene: 'portfolio', size: 60 })
    created.fileIds.push(workFileId)
    const createRes = await request('POST', '/api/portfolio', {
      token: artist.token,
      body: { fileId: workFileId, title: `E14 送检作品-${stamp}`, styles: ['bridal'] },
    })
    check(
      '作品创建成功（未配置微信 → 超时按通过上线）',
      createRes.status === 200,
      JSON.stringify(createRes.data),
    )
    const portfolioId = createRes.status === 200 ? createRes.data.data.id : 0
    created.portfolioIds.push(portfolioId)
    const createdRow = portfolioId ? await prisma.artistPortfolio.findUnique({ where: { id: portfolioId } }) : null
    check(
      '未配置微信 → 作品上线 + contentCheck 记录待复核（skipped）',
      createdRow && createdRow.status === 'online' && createdRow.contentCheck && createdRow.contentCheck.result === 'skipped',
      JSON.stringify(createdRow && { status: createdRow.status, contentCheck: createdRow.contentCheck }),
    )

    // 检测中（pending）作品对外不可见：再造一个 pending 状态作品
    const pendingPortfolio = await prisma.artistPortfolio.create({
      data: {
        artistId,
        type: 'image',
        title: `E14 检测中-${stamp}`,
        url: `e14/${stamp}/pending.png`,
        sort: 9,
        status: 'pending',
        contentCheck: {
          taskId: `mock-task-${stamp}`,
          submittedAt: new Date().toISOString(),
          result: 'pending',
        },
      },
    })
    created.portfolioIds.push(pendingPortfolio.id)
    const publicList = await request('GET', `/api/artist/${artistId}/portfolios?size=50`, {
      token: cust.token,
    })
    const publicTitles = ((publicList.data.data && publicList.data.data.list) || []).map((item) => item.title)
    check(
      '对外作品列表过滤检测中/违规作品（本人可见全部）',
      !publicTitles.includes(`E14 检测中-${stamp}`),
      JSON.stringify(publicTitles),
    )
    const ownerList = await request('GET', `/api/artist/${artistId}/portfolios?size=50`, {
      token: artist.token,
    })
    const ownerTitles = ((ownerList.data.data && ownerList.data.data.list) || []).map((item) => item.title)
    check('本人作品列表可见检测中作品', ownerTitles.includes(`E14 检测中-${stamp}`), JSON.stringify(ownerTitles))

    // 模拟回调：违规 → rejected
    const cbReject = await request('POST', '/api/wechat/callback', {
      body: { traceId: `mock-task-${stamp}`, result: 'risky', detail: '疑似违规内容' },
      raw: true,
    })
    check(
      '违规回调返回 success',
      cbReject.status === 200 && cbReject.buffer.toString() === 'success',
      cbReject.buffer.toString().slice(0, 100),
    )
    const rejectedRow = await prisma.artistPortfolio.findUnique({ where: { id: pendingPortfolio.id } })
    check(
      '违规回调后作品置 rejected',
      rejectedRow && rejectedRow.status === 'rejected' && rejectedRow.contentCheck.result === 'reject',
      JSON.stringify(rejectedRow && { status: rejectedRow.status }),
    )
    const listAfterReject = await request('GET', `/api/artist/${artistId}/portfolios?size=50`, { token: cust.token })
    const visibleAfterReject = ((listAfterReject.data.data && listAfterReject.data.data.list) || []).map(
      (item) => item.id,
    )
    check('违规作品对外不可见', !visibleAfterReject.includes(pendingPortfolio.id), JSON.stringify(visibleAfterReject))

    // 模拟回调：通过（mock 复审恢复）→ online 且对外可见
    const cbPass = await request('POST', '/api/wechat/callback', {
      body: { traceId: `mock-task-${stamp}`, result: 'pass', detail: '复核通过' },
      raw: true,
    })
    const passedRow = await prisma.artistPortfolio.findUnique({ where: { id: pendingPortfolio.id } })
    check(
      '通过回调后作品上线（mock 复审场景）',
      cbPass.status === 200 && passedRow && passedRow.status === 'online' && passedRow.contentCheck.result === 'pass',
      JSON.stringify(passedRow && { status: passedRow.status }),
    )
    const listAfterPass = await request('GET', `/api/artist/${artistId}/portfolios?size=50`, { token: cust.token })
    const visibleAfterPass = ((listAfterPass.data.data && listAfterPass.data.data.list) || []).map(
      (item) => item.id,
    )
    check('复核通过后作品对外可见', visibleAfterPass.includes(pendingPortfolio.id), JSON.stringify(visibleAfterPass))

    const cbMissing = await request('POST', '/api/wechat/callback', {
      body: { result: 'pass' },
    })
    check('回调缺 trace_id → 400', cbMissing.status === 400)

    // ---------- E14-02 水印 ----------
    console.log('\n[E14-02] 作品水印副本')
    const wmFileId = await uploadFile(artist.token, { scene: 'watermark', size: 40 })
    created.fileIds.push(wmFileId)
    const wmCreate = await request('POST', '/api/portfolio', {
      token: artist.token,
      body: { fileId: workFileId, watermarkFileId: wmFileId, title: `E14 水印作品-${stamp}`, styles: ['fresh'] },
    })
    check('带水印副本创建作品成功', wmCreate.status === 200, JSON.stringify(wmCreate.data))
    const wmPortfolioId = wmCreate.status === 200 ? wmCreate.data.data.id : 0
    created.portfolioIds.push(wmPortfolioId)
    const wmRow = wmPortfolioId ? await prisma.artistPortfolio.findUnique({ where: { id: wmPortfolioId } }) : null
    check(
      'watermarkUrl 已落库',
      wmRow && !!wmRow.watermarkUrl,
      JSON.stringify(wmRow && { watermarkUrl: wmRow.watermarkUrl }),
    )
    const wmList = await request('GET', `/api/artist/${artistId}/portfolios?size=50`, { token: artist.token })
    const wmItem = ((wmList.data.data && wmList.data.data.list) || []).find((item) => item.id === wmPortfolioId)
    check(
      '列表返回 displayPath 且与原图 path 不同（均为签名地址）',
      !!wmItem && !!wmItem.displayPath && wmItem.displayPath !== wmItem.path && wmItem.displayPath.includes('/api/files/raw?'),
      JSON.stringify(wmItem),
    )
    const wmForeign = await request('POST', '/api/portfolio', {
      token: cust.token,
      body: { fileId: wmFileId },
    })
    check('客户无化妆师身份无法引用水印文件 → 403', wmForeign.status === 403, JSON.stringify(wmForeign.data))

    const wmBad = await request('POST', '/api/portfolio', {
      token: artist.token,
      body: { fileId: workFileId, watermarkFileId: 999999999 },
    })
    check('水印文件不存在 → 400/40001', wmBad.status === 400 && wmBad.data.code === 40001)

    // ---------- E14-03 举报 ----------
    console.log('\n[E14-03] 举报提交与限频')
    const reportBadTarget = await request('POST', '/api/reports', {
      token: cust.token,
      body: { targetType: 'demand', targetId: artistId, reason: 'fraud' },
    })
    check('非法对象类型 → 400/40001', reportBadTarget.status === 400 && reportBadTarget.data.code === 40001)

    const reportBadReason = await request('POST', '/api/reports', {
      token: cust.token,
      body: { targetType: 'artist', targetId: artistId, reason: 'spam' },
    })
    check('非法原因 → 400/40001', reportBadReason.status === 400 && reportBadReason.data.code === 40001)

    const reportMissing = await request('POST', '/api/reports', {
      token: cust.token,
      body: { targetType: 'artist', targetId: 999999999, reason: 'fraud' },
    })
    check('举报对象不存在 → 404/40400', reportMissing.status === 404 && reportMissing.data.code === 40400)

    const report = await request('POST', '/api/reports', {
      token: cust.token,
      body: { targetType: 'artist', targetId: artistId, reason: 'copyright', detail: '主页作品疑似盗用' },
    })
    check('举报化妆师成功受理', report.status === 200 && report.data.data.status === 'pending', JSON.stringify(report.data))
    const reportId = report.status === 200 ? report.data.data.id : 0

    const reportAgain = await request('POST', '/api/reports', {
      token: cust.token,
      body: { targetType: 'artist', targetId: artistId, reason: 'porn' },
    })
    check('24 小时内重复举报同一对象 → 409/40900', reportAgain.status === 409 && reportAgain.data.code === 40900)

    const reportWork = await request('POST', '/api/reports', {
      token: cust.token,
      body: { targetType: 'portfolio', targetId: portfolioId, reason: 'inappropriate' },
    })
    check('举报作品成功（不同对象不限频）', reportWork.status === 200, JSON.stringify(reportWork.data))
    const reportWorkId = reportWork.status === 200 ? reportWork.data.data.id : 0

    const noAuth = await request('POST', '/api/reports', {
      body: { targetType: 'artist', targetId: artistId, reason: 'fraud' },
    })
    check('未登录提交举报 → 401/40100', noAuth.status === 401 && noAuth.data.code === 40100)

    const mine = await request('GET', '/api/reports/mine', { token: cust.token })
    const mineIds = ((mine.data.data && mine.data.data.list) || []).map((item) => item.id)
    check(
      '我的举报记录可见（含对象摘要与状态）',
      mine.status === 200 && mineIds.includes(reportId) && mineIds.includes(reportWorkId),
      JSON.stringify(mine.data.data && mine.data.data.list),
    )
    const mineUnauth = await request('GET', '/api/reports/mine')
    check('未登录查看举报记录 → 401/40100', mineUnauth.status === 401 && mineUnauth.data.code === 40100)

    // ---------- E14-04 举报处理 ----------
    console.log('\n[E14-04] 后台举报处理与联动')
    const adminList = await request('GET', '/api/admin/reports?status=pending&size=50', { token: adminToken })
    check(
      '后台举报列表含状态计数与对象摘要',
      adminList.status === 200 && adminList.data.data.counts && adminList.data.data.counts.pending >= 2,
      JSON.stringify(adminList.data.data && adminList.data.data.counts),
    )

    const banNonPortfolio = await request('POST', `/api/admin/reports/${reportId}/handle`, {
      token: adminToken,
      body: { action: 'offline' },
    })
    check('化妆师类举报执行「下架作品」→ 400/40001', banNonPortfolio.status === 400 && banNonPortfolio.data.code === 40001)

    const handleArtist = await request('POST', `/api/admin/reports/${reportId}/handle`, {
      token: adminToken,
      body: { action: 'dismiss', note: '暂未发现违规' },
    })
    check(
      '处理为未成立 → status=rejected + 处理人/结果落库',
      handleArtist.status === 200 && handleArtist.data.data.status === 'rejected',
      JSON.stringify(handleArtist.data),
    )
    const handledRow = await prisma.report.findUnique({ where: { id: reportId } })
    check(
      '处理人写入 handle_operator',
      handledRow && handledRow.handleOperator !== null && !!handledRow.handleResult,
      JSON.stringify(handledRow),
    )

    const handleAgain = await request('POST', `/api/admin/reports/${reportId}/handle`, {
      token: adminToken,
      body: { action: 'dismiss' },
    })
    check('重复处理 → 409/40900', handleAgain.status === 409 && handleAgain.data.code === 40900)

    const mineAfter = await request('GET', '/api/reports/mine', { token: cust.token })
    const mineRow = ((mineAfter.data.data && mineAfter.data.data.list) || []).find((item) => item.id === reportId)
    check(
      '举报人可见处理结果（未成立）',
      mineRow && mineRow.status === 'rejected' && !!mineRow.handleResult,
      JSON.stringify(mineRow),
    )
    const notifyRow = await prisma.notification.findFirst({
      where: { userId: cust.userId, type: 'report_handled' },
      orderBy: { id: 'desc' },
    })
    const notifyPayload = (notifyRow && notifyRow.payload) || {}
    check(
      '处理结果发站内通知给举报人',
      !!notifyRow && String(notifyPayload.title || '').includes('举报'),
      JSON.stringify(notifyRow),
    )

    // 作品类举报 → 下架联动（audit_log + 对外不可见）
    const handleOffline = await request('POST', `/api/admin/reports/${reportWorkId}/handle`, {
      token: adminToken,
      body: { action: 'offline', note: '核实违规，予以下架' },
    })
    check(
      '举报处理下架作品成功',
      handleOffline.status === 200 && handleOffline.data.data.status === 'handled',
      JSON.stringify(handleOffline.data),
    )
    const offlineRow = await prisma.artistPortfolio.findUnique({ where: { id: portfolioId } })
    check('联动：被举报作品置 offline', offlineRow && offlineRow.status === 'offline', JSON.stringify(offlineRow && offlineRow.status))
    const offlineLog = await prisma.auditLog.findFirst({
      where: { targetType: 'portfolio', targetId: portfolioId, action: 'offline' },
      orderBy: { id: 'desc' },
    })
    check('下架写入 audit_log（举报处理来源）', !!offlineLog && (offlineLog.reason || '').includes('举报'), JSON.stringify(offlineLog))
    const listAfterOffline = await request('GET', `/api/artist/${artistId}/portfolios?size=50`, { token: cust.token })
    const visibleAfterOffline = ((listAfterOffline.data.data && listAfterOffline.data.data.list) || []).map(
      (item) => item.id,
    )
    check('被下架作品对外不可见', !visibleAfterOffline.includes(portfolioId), JSON.stringify(visibleAfterOffline))

    // 封禁联动（独立化妆师，避免影响后续断言）
    const banArtist = await createAccount(`dev-openid-e14b-${stamp}`, 'artist')
    created.userIds.push(banArtist.userId)
    created.openids.push(`dev-openid-e14b-${stamp}`)
    await request('POST', '/api/artist/apply', {
      token: banArtist.token,
      body: {
        name: `E14 待封禁-${stamp}`,
        city,
        district: '浦东新区',
        years: 3,
        styles: ['daily'],
        agreed: true,
      },
    })
    const banMe = await request('GET', '/api/artist/me', { token: banArtist.token })
    const banArtistId = banMe.data.data.id
    created.artistIds.push(banArtistId)
    await prisma.artist.update({ where: { id: banArtistId }, data: { status: 'approved', auditAt: new Date() } })

    const banReport = await request('POST', '/api/reports', {
      token: cust.token,
      body: { targetType: 'artist', targetId: banArtistId, reason: 'fraud', detail: '诱导线下交易' },
    })
    const banReportId = banReport.status === 200 ? banReport.data.data.id : 0
    const handleBan = await request('POST', `/api/admin/reports/${banReportId}/handle`, {
      token: adminToken,
      body: { action: 'ban', note: '多次诱导交易' },
    })
    check('举报处理封禁成功', handleBan.status === 200 && handleBan.data.data.status === 'handled', JSON.stringify(handleBan.data))
    const bannedUser = await prisma.userAuth.findUnique({ where: { id: banArtist.userId } })
    const bannedArtist = await prisma.artist.findUnique({ where: { id: banArtistId } })
    check(
      '联动：user_auth + artist 均置 disabled',
      bannedUser.status === 'disabled' && bannedArtist.status === 'disabled',
      JSON.stringify({ user: bannedUser.status, artist: bannedArtist.status }),
    )
    const banLog = await prisma.auditLog.findFirst({
      where: { targetType: 'user', targetId: banArtist.userId, action: 'ban' },
      orderBy: { id: 'desc' },
    })
    check('封禁写入 audit_log', !!banLog, JSON.stringify(banLog))
    const banMeAgain = await request('POST', '/api/portfolio', {
      token: banArtist.token,
      body: { fileId: 999999999 },
    })
    check(
      '被封禁化妆师访问业务接口 → 403',
      banMeAgain.status === 403 && banMeAgain.data.message.includes('停用'),
      JSON.stringify(banMeAgain.data),
    )

    const auditorLogin = await request('POST', '/api/admin/auth/login', {
      body: { username: 'auditor', password: 'Auditor@123456' },
    })
    const auditorToken = auditorLogin.data && auditorLogin.data.data && auditorLogin.data.data.accessToken
    if (auditorToken) {
      const auditorRead = await request('GET', '/api/admin/reports', { token: auditorToken })
      check('auditor 可查看举报列表（只读）', auditorRead.status === 200)
      const auditorWrite = await request('POST', `/api/admin/reports/${reportWorkId}/handle`, {
        token: auditorToken,
        body: { action: 'dismiss' },
      })
      check('auditor 处理举报 → 403', auditorWrite.status === 403, JSON.stringify(auditorWrite.data))
    }

    // ---------- OpenAPI ----------
    const doc = await request('GET', '/api-docs/openapi.json')
    const expectedPaths = [
      '/api/reports',
      '/api/reports/mine',
      '/api/admin/reports',
      '/api/admin/reports/{id}/handle',
      '/api/wechat/callback',
    ]
    check(
      'OpenAPI 已包含 E14 全部接口且版本 ≥ 0.10.0',
      doc.status === 200 &&
        expectedPaths.every((path) => !!doc.data.paths[path]) &&
        String(doc.data.info.version) >= '0.10.0',
      JSON.stringify(expectedPaths.filter((path) => !(doc.data && doc.data.paths && doc.data.paths[path]))),
    )
  } catch (error) {
    failed += 1
    console.log(`  ABORT ${error.message}`)
  } finally {
    // ---------- 清理 ----------
    if (created.portfolioIds.length) {
      await prisma.artistPortfolio.deleteMany({ where: { id: { in: created.portfolioIds } } })
    }
    if (created.fileIds.length) {
      await prisma.fileObject.deleteMany({ where: { id: { in: created.fileIds } } })
    }
    if (created.artistIds.length) {
      await prisma.artistSchedule.deleteMany({ where: { artistId: { in: created.artistIds } } })
      await prisma.artistPortfolio.deleteMany({ where: { artistId: { in: created.artistIds } } })
      await prisma.artist.deleteMany({ where: { id: { in: created.artistIds } } })
    }
    if (created.userIds.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: created.userIds } } })
      await prisma.report.deleteMany({ where: { reporterId: { in: created.userIds } } })
      await prisma.customer.deleteMany({ where: { userId: { in: created.userIds } } })
      await prisma.userAuth.deleteMany({ where: { id: { in: created.userIds } } })
    }
    await prisma.$disconnect()
  }

  console.log(`\n[verify] 通过 ${passed} / 失败 ${failed}`)
  if (failed > 0) process.exitCode = 1
}

main()
