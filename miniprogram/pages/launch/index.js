const { get } = require('../../utils/request')

Page({
  data: {
    apiStatus: '未检测',
    checking: false,
  },

  onPing() {
    if (this.data.checking) return
    this.setData({ checking: true, apiStatus: '检测中...' })
    get('/api/ping', null, { auth: false })
      .then((data) => {
        this.setData({ apiStatus: `${data.service} · ${data.env} · uptime ${data.uptime}s` })
      })
      .catch(() => {
        this.setData({ apiStatus: '连接失败，请确认服务端已启动' })
      })
      .finally(() => {
        this.setData({ checking: false })
      })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/auth/login/index' })
  },

  goArtist() {
    wx.navigateTo({ url: '/pkg-artist/pages/artist/schedule/index' })
  },

  goMerchant() {
    wx.navigateTo({ url: '/pkg-merchant/pages/search/list/index' })
  },

  goTokens() {
    wx.navigateTo({ url: '/pages/dev/tokens/index' })
  },
})
