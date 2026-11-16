const { getRole } = require('../../utils/auth')

Page({
  data: {
    role: '',
    roleText: '未选择角色',
  },

  onShow() {
    const role = getRole()
    this.setData({
      role,
      roleText: role === 'artist' ? '化妆师' : role === 'merchant' ? '商家' : '未选择角色',
    })
  },

  goRole() {
    wx.navigateTo({ url: '/pages/auth/role/index' })
  },

  goArtistWorkspace() {
    wx.navigateTo({ url: '/pkg-artist/pages/artist/schedule/index' })
  },

  goMerchantSearch() {
    wx.navigateTo({ url: '/pkg-merchant/pages/search/list/index' })
  },
})
