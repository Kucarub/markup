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
        key: 'merchant',
        title: '我是商家',
        desc: '发布用人需求，快速找到合适的人',
        note: '影楼 · 婚庆 · 工作室',
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

  handleWxLogin() {
    if (this.data.loading) return
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意用户协议', icon: 'none' })
      return
    }
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
        if (!session.phoneBound) {
          this.setData({ needPhone: true, phoneDenied: false })
          return
        }
        routeAfterAuth(session)
      })
      .catch(() => {
        wx.showToast({ title: '微信登录失败，请重试', icon: 'none' })
      })
      .then(() => {
        this.setData({ loading: false })
      })
  },

  /** getPhoneNumber 授权回调（E3-02）：拒绝时保留「重新授权」入口，不阻塞浏览 */
  handleGetPhone(event) {
    const { code } = event.detail || {}
    if (!code) {
      this.setData({ phoneDenied: true })
      wx.showToast({ title: '未授权手机号，可稍后再绑定', icon: 'none' })
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
