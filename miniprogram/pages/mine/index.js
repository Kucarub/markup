const { profile, mineMenu } = require('../../data/mock')
const { clearAuth, getUserId, getToken } = require('../../utils/auth')
const { entryGuard, clearProfileCache } = require('../../utils/guard')
const request = require('../../utils/request')
const subscribe = require('../../utils/subscribe')

Page({
  data: {
    profile,
    menu: mineMenu.concat([{ key: 'role', label: '切换身份', icon: 'users', separator: true }]),
    credit: null,
    stats: [
      { key: 'works', value: '12', label: '作品' },
      { key: 'favorites', value: '8', label: '收藏' },
      { key: 'posted', value: '5', label: '投递' },
    ],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected()
    }
    entryGuard().then(() => this.loadCredit())
  },

  /** 信用分（E10-07）：公开接口，按本地缓存的 userId 查询 */
  loadCredit() {
    const userId = getUserId()
    if (!getToken() || !userId) return Promise.resolve(null)
    return request
      .get(`/api/credit/${userId}`, null, { showError: false })
      .then((credit) => {
        this.setData({ credit })
        return credit
      })
      .catch(() => null)
  },

  onEditProfile() {
    this.toast('资料编辑功能将在下一版本开放')
  },

  onCreditTap() {
    wx.navigateTo({ url: '/pages/order/records/index' })
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
    if (key === 'role') {
      wx.navigateTo({ url: '/pages/auth/role/index' })
      return
    }
    if (key === 'deliveries') {
      wx.navigateTo({ url: '/pages/order/list/index' })
      return
    }
    if (key === 'records') {
      wx.navigateTo({ url: '/pages/order/records/index' })
      return
    }
    if (key === 'notifications') {
      wx.navigateTo({ url: '/pages/notification/list/index' })
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
        clearProfileCache()
        subscribe.reset()
        wx.reLaunch({ url: '/pages/auth/login/index' })
      },
    })
  },

  toast(title) {
    wx.showToast({ title, icon: 'none' })
  },
})
