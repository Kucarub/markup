const { businessGuard } = require('../../../utils/guard')

Page({
  data: {
    orders: [],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected()
    }
    businessGuard()
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },
})
