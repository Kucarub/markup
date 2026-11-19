const request = require('../../../utils/request')
const { businessGuard } = require('../../../utils/guard')
const { track } = require('../../../utils/track')

const PAGE_SIZE = 10

const SERVICE_TYPES = [
  { code: '', label: '全部类型' },
  { code: 'bridal', label: '婚礼跟妆' },
  { code: 'daily', label: '日常妆造' },
  { code: 'event', label: '商业活动' },
  { code: 'photo', label: '写真拍摄' },
]

const TYPE_LABEL = SERVICE_TYPES.reduce((acc, item) => {
  if (item.code) acc[item.code] = item.label
  return acc
}, {})

function monthDay(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

function budgetText(min, max) {
  return min === max ? `${min}` : `${min}–${max}`
}

/** 服务日次日零点截止，剩余天数按自然日粗略计算 */
function deadlineText(expireAt) {
  if (!expireAt) return '长期有效'
  const diff = new Date(expireAt).getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (days <= 0) return '已截止'
  if (days === 1) return '今日截止'
  return `${days} 天后截止`
}

/** 接口 DTO → 需求卡片展示模型（E8-01） */
function toCard(item) {
  const typeLabel = TYPE_LABEL[item.serviceType] || item.serviceType
  const responded = Boolean(item.myResponseId)
  const dateText = monthDay(item.serviceDate)
  return {
    id: item.id,
    eyebrow: `${typeLabel} · ${item.city}`,
    title: `预算 ¥${budgetText(item.budgetMin, item.budgetMax)}`,
    occasion: typeLabel,
    people: item.headcount,
    duration: '当天服务',
    pay: budgetText(item.budgetMin, item.budgetMax),
    payUnit: '单',
    district: `${item.city} · ${item.district}`,
    distance: item.isTargeted ? '定向预约' : '同城',
    date: `${dateText} 服务`,
    deadline: responded ? '已响应，等待客户确认' : deadlineText(item.expireAt),
    status: responded ? '已响应' : item.statusLabel,
    statusTone: responded ? 'brand' : 'warning',
    keyword: `${typeLabel}${item.city}${item.district}${item.remark || ''}`,
  }
}

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
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected()
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
        { scope: 'hall', page, size: PAGE_SIZE, ...(activeType ? { serviceType: activeType } : {}) },
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
})
