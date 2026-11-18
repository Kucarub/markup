const { profile, mineMenu } = require('../../data/mock')
const { clearAuth } = require('../../utils/auth')

Page({
  data: {
    profile,
    menu: mineMenu,
    stats: [
      { key: 'works', value: '12', label: '作品' },
      { key: 'favorites', value: '8', label: '收藏' },
      { key: 'posted', value: '5', label: '投递' },
    ],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  },

  onEditProfile() {
    this.toast('资料编辑功能将在下一版本开放')
  },

  onStatTap(event) {
    const { key } = event.currentTarget.dataset
    if (key === 'works') {
      wx.switchTab({ url: '/pages/portfolio/list/index' })
      return
    }
    if (key === 'favorites') {
      this.toast('你收藏了 8 条需求')
      return
    }
    this.toast('本月已投递 5 次')
  },

  onMenuTap(event) {
    const { key, label } = event.currentTarget.dataset
    if (key === 'deliveries') {
      wx.navigateTo({ url: '/pages/order/list/index' })
      return
    }
    if (key === 'schedule') {
      wx.navigateTo({ url: '/pkg-artist/pages/artist/schedule/index' })
      return
    }
    if (key === 'about') {
      wx.navigateTo({ url: '/pages/settings/index/index' })
      return
    }
    this.toast(`${label}功能将在下一版本开放`)
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (!res.confirm) return
        clearAuth()
        wx.reLaunch({ url: '/pages/auth/login/index' })
      },
    })
  },

  toast(title) {
    wx.showToast({ title, icon: 'none' })
  },
})
