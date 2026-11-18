const { clearAuth } = require('../../../utils/auth')
const { clearProfileCache } = require('../../../utils/guard')

Page({
  data: {
    version: '0.1.0',
  },

  goRole() {
    wx.navigateTo({ url: '/pages/auth/role/index' })
  },

  goTokens() {
    wx.navigateTo({ url: '/pages/dev/tokens/index' })
  },

  handleLogout() {
    clearAuth()
    clearProfileCache()
    wx.reLaunch({ url: '/pages/auth/login/index' })
  },
})
