const { setRole } = require('../../../utils/auth')

Page({
  data: {
    roles: [
      {
        key: 'artist',
        title: '我是化妆师',
        desc: '发布作品集、维护档期、接收商家邀约',
      },
      {
        key: 'merchant',
        title: '我是商家',
        desc: '按风格/档期/距离搜索化妆师并发起邀约',
      },
    ],
  },

  selectRole(event) {
    const { role } = event.currentTarget.dataset
    setRole(role)
    wx.showToast({ title: '角色已选择', icon: 'success' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/home/index' })
    }, 400)
  },
})
