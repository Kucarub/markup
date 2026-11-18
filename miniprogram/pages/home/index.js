const { profile, stats, schedule, demands } = require('../../data/mock')
const { getToken, isGuestBrowse } = require('../../utils/auth')
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
    entryGuard()
  },

  onCityTap() {
    this.toast('当前试点城市：上海')
  },

  onBellTap() {
    this.toast('你有 2 条新消息')
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
