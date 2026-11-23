const { profile, stats, schedule, demands } = require('../../data/mock')
const { getToken, isGuestBrowse, getRole } = require('../../utils/auth')
const { entryGuard } = require('../../utils/guard')

Page({
  data: {
    profile,
    stats,
    schedule,
    recommended: demands.slice(0, 3),
  },

  onLoad() {
    // 新用户默认进入欢迎页；点过「先随便看看」的游客放行
    if (!getToken() && !isGuestBrowse()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected()
    }
    // 客户首页即「我的需求」，工作台仅服务化妆师
    if (getRole() === 'customer') {
      wx.switchTab({ url: '/pages/demand/mine/index' })
      return
    }
    entryGuard()
  },

  onCityTap() {
    this.toast('当前试点城市：上海')
  },

  onBellTap() {
    // 接单中心（E9-04）：待处理定向预约与未读提示集中在这里
    wx.navigateTo({ url: '/pages/order/list/index' })
  },

  onEditProfile() {
    this.toast('资料编辑功能将在下一版本开放')
  },

  onEditSchedule() {
    this.toast('档期设置将在下一版本开放')
  },

  onDayTap(event) {
    const { state, day } = event.currentTarget.dataset
    this.toast(state === 'booked' ? '该日期已有预约' : `${day} 日当前可约`)
  },

  onDemandOpen(event) {
    wx.navigateTo({ url: `/pages/demand/detail/index?id=${event.detail.id}` })
  },

  goHall() {
    wx.switchTab({ url: '/pages/demand/hall/index' })
  },

  toast(title) {
    wx.showToast({ title, icon: 'none' })
  },
})
