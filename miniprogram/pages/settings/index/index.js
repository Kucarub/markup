const { clearAuth } = require('../../../utils/auth')

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
    wx.reLaunch({ url: '/pages/auth/login/index' })
  },
})
