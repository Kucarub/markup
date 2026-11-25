const request = require('../../../utils/request')
const { setSession, getToken } = require('../../../utils/auth')
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

  /** 未勾选协议时只提示，不发起登录 */
  handleLogin() {
    if (this.data.loading) return
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意用户协议', icon: 'none' })
      return
    }
    this.runLogin()
  },

  /** 统一登录流程：wx.login → 服务端换 token → 新用户写角色 → 按入驻状态分流 */
  runLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })

    wxLoginCode()
      .then((code) => request.post('/api/auth/wx-login', { code }, { auth: false, showError: false }))
      .then((session) => {
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
        setSession(session)
        clearProfileCache()
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
})
