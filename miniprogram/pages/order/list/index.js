Page({
  data: {
    orders: [],
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },
})
