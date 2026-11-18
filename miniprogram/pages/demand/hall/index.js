const { demands } = require('../../../data/mock')
const { getRole } = require('../../../utils/auth')
const { businessGuard } = require('../../../utils/guard')

const OCCASIONS = ['全部场合', '婚礼跟妆', '影楼拍摄', '活动会展']

Page({
  data: {
    query: '',
    occasion: OCCASIONS[0],
    activeFilter: '',
    availableOnly: false,
    filters: ['报酬', '日期', '距离'],
    list: [],
    /** B 端复用本 Tab 承载「找化妆师」（E3-03），E8 接入完整搜索 */
    isMerchant: false,
  },

  onLoad() {
    this.applyFilter()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected()
    }
    this.setData({ isMerchant: getRole() === 'merchant' })
    businessGuard()
  },

  applyFilter() {
    const { query, occasion, availableOnly } = this.data
    const keyword = (query || '').trim().toLowerCase()
    const list = demands.filter((demand) => {
      const haystack = `${demand.title}${demand.merchant}${demand.occasion}${demand.district}`.toLowerCase()
      const queryMatched = !keyword || haystack.indexOf(keyword) > -1
      const occasionMatched = occasion === '全部场合' || demand.occasion === occasion
      const availabilityMatched = !availableOnly || demand.status !== '已招满'
      return queryMatched && occasionMatched && availabilityMatched
    })
    this.setData({ list })
  },

  onQueryInput(event) {
    this.setData({ query: event.detail.value }, () => this.applyFilter())
  },

  onClearQuery() {
    this.setData({ query: '' }, () => this.applyFilter())
  },

  onCycleOccasion() {
    const next = OCCASIONS[(OCCASIONS.indexOf(this.data.occasion) + 1) % OCCASIONS.length]
    this.setData({ occasion: next }, () => this.applyFilter())
  },

  onToggleFilter(event) {
    const { name } = event.currentTarget.dataset
    const active = this.data.activeFilter === name
    this.setData({ activeFilter: active ? '' : name })
    this.toast(active ? `已取消${name}筛选` : `已按${name}优先展示`)
  },

  onToggleAvailable() {
    this.setData({ availableOnly: !this.data.availableOnly }, () => this.applyFilter())
  },

  onSmartFilter() {
    this.toast('已展示与你技能匹配的需求')
  },

  onResetFilter() {
    this.setData(
      {
        query: '',
        occasion: OCCASIONS[0],
        activeFilter: '',
        availableOnly: false,
      },
      () => this.applyFilter()
    )
  },

  onDemandOpen(event) {
    wx.navigateTo({ url: `/pages/demand/detail/index?id=${event.detail.id}` })
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },

  toast(title) {
    wx.showToast({ title, icon: 'none' })
  },
})
