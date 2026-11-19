const request = require('../../../utils/request')
const { setSession, getToken, setGuestBrowse } = require('../../../utils/auth')
const { routeAfterAuth, fetchProfile, clearProfileCache } = require('../../../utils/guard')

function wxLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code)
        else reject(new Error('未获取到 wx.login code'))
      },
      fail: reject,
    })
  })
}

Page({
  data: {
    loading: false,
    /** 欢迎页默认选中化妆师 */
    role: 'artist',
    agreed: false,
    roles: [
      {
        key: 'artist',
        title: '我是化妆师',
        desc: '建作品集，接真实妆面单',
        note: '6,240 位化妆师正在成长',
        icon: 'award',
      },
      {
        key: 'customer',
        title: '我是客户',
        desc: '发布妆造需求，找到合适的人',
        note: '婚礼 · 写真 · 活动',
        icon: 'users-blue',
      },
    ],
    /** 登录成功后若未绑定手机号，进入授权引导（E3-02），可跳过 */
    needPhone: false,
    phoneDenied: false,
  },

  onLoad() {
    // 已有登录态：按入驻状态直接分流，避免重复登录
    if (!getToken()) return
    fetchProfile()
      .then((profile) => routeAfterAuth(profile))
      .catch(() => {})
  },

  selectRole(event) {
    const { role } = event.currentTarget.dataset
    if (role === this.data.role) return
    this.setData({ role })
  },

  toggleAgreement() {
    this.setData({ agreed: !this.data.agreed })
  },

  /** 协议页未落地（E1-08），先以提示代替 */
  showDoc(event) {
    const doc = event.currentTarget.dataset.doc || '协议'
    wx.showToast({ title: `${doc}页面将在后续版本开放`, icon: 'none' })
  },

  /** 未勾选协议时点击登录：只提示，不拉起授权面板 */
  handleLoginTap() {
    if (this.data.loading) return
    wx.showToast({ title: '请先阅读并同意用户协议', icon: 'none' })
  },

  /** 登录 + 手机号一次授权：getPhoneNumber 面板返回后进入统一登录流程 */
  handleLoginWithPhone(event) {
    if (this.data.loading) return
    const detail = event.detail || {}
    const phoneCode = detail.code || ''
    if (!phoneCode) {
      // 用户拒绝或小程序未开通手机号快速验证权限：不阻塞登录，稍后可在「我的」绑定
      console.warn('[phone] 未授权手机号', detail)
      const noPermission = /permission|not support|invalid/i.test(detail.errMsg || '')
      wx.showToast({
        title: noPermission ? '未开通手机号权限，已跳过绑定' : '未授权手机号，可稍后绑定',
        icon: 'none',
      })
    }
    this.runLogin(phoneCode)
  },

  /** 统一登录流程：wx.login → 服务端换 token → 新用户写角色 → 绑定手机号 → 按入驻状态分流 */
  runLogin(phoneCode) {
    if (this.data.loading) return
    this.setData({ loading: true })

    wxLoginCode()
      .then((code) => request.post('/api/auth/wx-login', { code }, { auth: false, showError: false }))
      .then((session) => {
        this.session = session
        setSession(session)
        clearProfileCache()
        // 新用户：把欢迎页选中的身份写入服务端，再按入驻状态分流
        if (!session.role) {
          return request.post('/api/auth/role', { role: this.data.role })
        }
        return session
      })
      .then((session) => {
        // 选身份后服务端会重新签发 token，这里同步最新登录态
        this.session = session
        setSession(session)
        clearProfileCache()
        if (!phoneCode || session.phoneBound) return session
        // 手机号绑定失败不阻塞登录，降级为「绑定手机号」卡片
        return request
          .post('/api/auth/phone', { code: phoneCode })
          .then((res) => Object.assign({}, session, { phoneBound: true, phoneMasked: res.phoneMasked }))
          .catch(() => session)
      })
      .then((session) => {
        this.session = session
        if (!session.phoneBound) {
          this.setData({ needPhone: true, phoneDenied: true })
          return
        }
        routeAfterAuth(session)
      })
      .catch((err) => {
        // 区分网络不可达与业务失败，便于真机排查（真机不能用 127.0.0.1）
        const detail = (err && (err.errMsg || err.message)) || ''
        console.error('[login] 微信登录失败', err)
        wx.showToast({
          title: /timeout|fail|domain/i.test(detail) ? '无法连接服务器，请检查网络与接口地址' : '微信登录失败，请重试',
          icon: 'none',
        })
      })
      .then(() => {
        this.setData({ loading: false })
      })
  },

  /** getPhoneNumber 授权回调（E3-02）：拒绝时保留「重新授权」入口，不阻塞浏览 */
  handleGetPhone(event) {
    const detail = event.detail || {}
    const { code, errMsg } = detail
    if (!code) {
      // 未返回 code：可能是用户拒绝，也可能是小程序未开通「手机号快速验证」权限 / 基础库过低
      console.warn('[phone] getPhoneNumber 未返回 code', detail)
      const noPermission = /permission|not support|invalid/i.test(errMsg || '')
      this.setData({ phoneDenied: true })
      wx.showToast({
        title: noPermission ? '当前小程序未开通手机号快速验证权限' : '未授权手机号，可稍后再绑定',
        icon: 'none',
      })
      return
    }
    request
      .post('/api/auth/phone', { code })
      .then((res) => {
        clearProfileCache()
        this.setData({ needPhone: false, phoneDenied: false })
        wx.showToast({ title: '手机号绑定成功', icon: 'success' })
        setTimeout(() => {
          routeAfterAuth(Object.assign({}, this.session, { phoneBound: true, phoneMasked: res.phoneMasked }))
        }, 400)
      })
      .catch(() => {})
  },

  handleSkipPhone() {
    routeAfterAuth(this.session)
  },

  handleSkip() {
    setGuestBrowse()
    wx.switchTab({ url: '/pages/home/index' })
  },
})
