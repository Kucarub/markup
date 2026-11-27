const request = require('../../../utils/request')
const { businessGuard } = require('../../../utils/guard')
const { track } = require('../../../utils/track')
const { toDemandCard } = require('../../../utils/demand-card')

const PAGE_SIZE = 10

const SERVICE_TYPES = [
  { code: '', label: '全部类型' },
  { code: 'bridal', label: '婚礼跟妆' },
  { code: 'daily', label: '日常妆造' },
  { code: 'event', label: '商业活动' },
  { code: 'photo', label: '写真拍摄' },
]

/** 接口 DTO → 需求卡片展示模型（E8-01） */
const toCard = toDemandCard

/**
 * 需求大厅（E8-01）。
 * - 仅展示待响应且未过期的同城需求，按服务日期升序；
 * - 支持服务类型筛选与本地关键词过滤；下拉刷新 / 上拉加载；
 * - 已响应需求在卡片上标记「已响应」，避免重复响应。
 */
Page({
  data: {
    serviceTypes: SERVICE_TYPES,
    activeType: '',
    keyword: '',
    list: [],
    visibleList: [],
    total: 0,
    page: 1,
    loading: true,
    loadingMore: false,
    hasMore: false,
    error: '',
  },

  onLoad() {
    this.fetchPage(1)
  },

  onShow() {
    // 切换身份后角色可能变化：每次页面显示都让底部导航按最新角色重建
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().refresh()
    }
    businessGuard()
  },

  onPullDownRefresh() {
    this.fetchPage(1).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return
    this.fetchPage(this.data.page + 1)
  },

  async fetchPage(page) {
    if (page > 1) this.setData({ loadingMore: true })
    else this.setData({ loading: true, error: '' })

    try {
      const { activeType } = this.data
      const data = await request.get(
        '/api/demands',
        {
          scope: 'hall',
          page,
          size: PAGE_SIZE,
          ...(activeType ? { serviceType: activeType } : {}),
        },
        { showError: false },
      )
      const mapped = (data.list || []).map(toCard)
      const list = page > 1 ? this.data.list.concat(mapped) : mapped
      this.setData({
        list,
        total: data.total || 0,
        page,
        hasMore: list.length < (data.total || 0),
        loading: false,
        loadingMore: false,
      })
      this.applyKeyword()
      if (page === 1) {
        track('demand_hall_view', {
          serviceType: activeType || 'all',
          resultCount: data.total || 0,
        })
      }
    } catch (error) {
      this.setData({
        loading: false,
        loadingMore: false,
        error: (error && error.message) || '需求加载失败',
      })
    }
  },

  /** 关键词仅过滤已加载数据，不额外请求接口 */
  applyKeyword() {
    const keyword = (this.data.keyword || '').toLowerCase()
    const visibleList = keyword
      ? this.data.list.filter((item) => item.keyword.toLowerCase().indexOf(keyword) > -1)
      : this.data.list
    this.setData({ visibleList })
  },

  onTypeTap(event) {
    const { code } = event.currentTarget.dataset
    if (code === this.data.activeType) return
    this.setData({ activeType: code, list: [], page: 1, hasMore: false }, () => this.fetchPage(1))
  },

  onQueryInput(event) {
    this.setData({ keyword: (event.detail.value || '').trim() }, () => this.applyKeyword())
  },

  onClearQuery() {
    this.setData({ keyword: '' }, () => this.applyKeyword())
  },

  onResetFilter() {
    this.setData(
      { activeType: '', keyword: '', list: [], visibleList: [], page: 1, hasMore: false },
      () => this.fetchPage(1),
    )
  },

  onDemandOpen(event) {
    wx.navigateTo({ url: `/pages/demand/detail/index?id=${event.detail.id}` })
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },

  /** 分享需求大厅：好友可直接浏览同城妆造需求 */
  onShareAppMessage() {
    return {
      title: '兰妆有约 · 同城妆造需求大厅',
      path: '/pages/demand/hall/index',
    }
  },

  onShareTimeline() {
    return {
      title: '兰妆有约 · 同城妆造需求大厅',
    }
  },
})
