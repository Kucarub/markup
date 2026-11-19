const { demands } = require('../../../data/mock')

const FAVORITE_KEY = 'demand_favorites'
const APPLIED_KEY = 'demand_applied'

Page({
  data: {
    demand: null,
    expanded: false,
    isFavorite: false,
    isApplied: false,
    isFull: false,
  },

  onLoad(query) {
    const id = Number(query.id || demands[0].id)
    const demand = demands.filter((item) => item.id === id)[0] || demands[0]
    const favorites = wx.getStorageSync(FAVORITE_KEY) || []
    const applied = wx.getStorageSync(APPLIED_KEY) || []

    this.setData({
      demand,
      isFull: demand.status === '已招满',
      isFavorite: favorites.indexOf(demand.id) > -1,
      isApplied: applied.indexOf(demand.id) > -1,
    })
  },

  onToggleExpand() {
    this.setData({ expanded: !this.data.expanded })
  },

  onToggleFavorite() {
    const { demand, isFavorite } = this.data
    const favorites = wx.getStorageSync(FAVORITE_KEY) || []
    const next = isFavorite
      ? favorites.filter((id) => id !== demand.id)
      : favorites.concat(demand.id)

    wx.setStorageSync(FAVORITE_KEY, next)
    this.setData({ isFavorite: !isFavorite })
    this.toast(isFavorite ? '已取消收藏' : '已加入收藏')
  },

  onApply() {
    const { demand, isApplied } = this.data
    if (isApplied) {
      this.toast('投递进度：化妆师尚未响应')
      return
    }

    const applied = wx.getStorageSync(APPLIED_KEY) || []
    wx.setStorageSync(APPLIED_KEY, applied.concat(demand.id))
    this.setData({ isApplied: true })
    this.toast('投递成功，等待化妆师响应')
  },

  onNavigate() {
    this.toast('正在打开地图导航')
  },

  onShareAppMessage() {
    const { demand } = this.data
    return {
      title: demand ? demand.title : '妆集 · 需求详情',
      path: `/pages/demand/detail/index?id=${demand ? demand.id : 1}`,
    }
  },

  toast(title) {
    wx.showToast({ title, icon: 'none' })
  },
})
