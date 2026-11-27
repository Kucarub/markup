const request = require('../../../utils/request')
const { getToken, redirectToLogin } = require('../../../utils/auth')
const { businessGuard, fetchProfile } = require('../../../utils/guard')
const { styleLabels } = require('../../../utils/dict')

const PAGE_SIZE = 20
const TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待响应' },
  { key: 'responded', label: '已响应' },
  { key: 'selected', label: '已选定' },
  { key: 'closed', label: '已关闭' },
]

const SERVICE_TYPES = {
  bridal: '婚礼跟妆',
  daily: '日常妆造',
  event: '商业活动',
  photo: '写真拍摄',
}

function monthDay(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

function budgetText(min, max) {
  return min === max ? `${min}` : `${min}–${max}`
}

/** 接口 DTO → 列表展示模型：状态色与可关闭标记都按派生状态计算 */
function toItem(demand) {
  const responded = demand.status === 'pending' && demand.responseCount > 0
  let tone = 'warning'
  if (demand.status === 'closed') tone = 'neutral'
  else if (demand.status === 'selected') tone = 'success'
  else if (responded) tone = 'brand'

  return {
    id: demand.id,
    status: demand.status,
    statusLabel: demand.statusLabel,
    tone,
    canClose: demand.status === 'pending',
    dateText: monthDay(demand.serviceDate),
    typeLabel: SERVICE_TYPES[demand.serviceType] || demand.serviceType,
    headcount: demand.headcount,
    city: demand.city,
    district: demand.district,
    budgetText: budgetText(demand.budgetMin, demand.budgetMax),
    styles: styleLabels(demand.stylePrefs),
    remark: demand.remark || '',
    responseCount: demand.responseCount,
  }
}

/**
 * 我的需求（E7-04）。
 * - 四态 Tab 对应 scope=mine 的 status 筛选，「已响应」由响应数派生；
 * - 关闭需二次确认，成功后本地即时更新，不再整页重载；
 * - 发布入口跳 pkg-customer 分包的需求表单。
 */
Page({
  data: {
    tabs: TABS.map((tab) => ({ ...tab, count: 0 })),
    activeTab: '',
    activeTabLabel: '全部',
    list: [],
    total: 0,
    page: 1,
    loading: true,
    loadingMore: false,
    hasMore: false,
    error: '',
    errorDesc: '',
    errorKind: '',
    primaryAction: '',
  },

  onShow() {
    // 切换身份后角色可能变化：每次页面显示都让底部导航按最新角色重建
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().refresh()
    }
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return
    this.fetchPage(this.data.page + 1)
  },

  /** 登录 / 角色校验后拉首屏 */
  async load() {
    this.setData({ loading: true, error: '', errorDesc: '', errorKind: '', primaryAction: '' })

    if (!getToken()) {
      this.setData({
        loading: false,
        list: [],
        error: '登录后查看你的需求',
        errorDesc: '登录即可发布妆造需求，并跟进化妆师的响应。',
        errorKind: 'auth',
        primaryAction: '去登录',
      })
      return
    }

    const ok = await businessGuard()
    if (!ok) {
      this.setData({ loading: false, list: [] })
      return
    }

    const profile = await fetchProfile()
    if (!profile || profile.role !== 'customer') {
      this.setData({
        loading: false,
        list: [],
        error: '仅客户可查看我的需求',
        errorDesc: '当前身份为化妆师，可前往需求大厅浏览客户发布的妆造需求。',
        errorKind: 'role',
        primaryAction: '回到工作台',
      })
      return
    }

    this.refreshCounts()
    await this.fetchPage(1)
  },

  /** 各状态计数徽标：size=1 的轻量请求只取 total，失败静默 */
  async refreshCounts() {
    const statuses = TABS.filter((tab) => tab.key).map((tab) => tab.key)
    const results = await Promise.all(
      statuses.map((status) =>
        request
          .get('/api/demands', { scope: 'mine', page: 1, size: 1, status }, { showError: false })
          .catch(() => null),
      ),
    )
    const countMap = {}
    statuses.forEach((status, index) => {
      countMap[status] = (results[index] && results[index].total) || 0
    })
    this.setData({
      tabs: TABS.map((tab) => ({ ...tab, count: tab.key ? countMap[tab.key] || 0 : 0 })),
    })
  },

  async fetchPage(page) {
    if (page > 1) this.setData({ loadingMore: true })
    try {
      const { activeTab } = this.data
      const data = await request.get(
        '/api/demands',
        { scope: 'mine', page, size: PAGE_SIZE, ...(activeTab ? { status: activeTab } : {}) },
        { showError: false },
      )
      const mapped = (data.list || []).map(toItem)
      const list = page > 1 ? this.data.list.concat(mapped) : mapped
      this.setData({
        list,
        total: data.total || 0,
        page,
        hasMore: list.length < (data.total || 0),
        loading: false,
        loadingMore: false,
      })
    } catch (error) {
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({ title: (error && error.message) || '需求加载失败', icon: 'none' })
    }
  },

  onTabTap(event) {
    const { key } = event.currentTarget.dataset
    if (key === this.data.activeTab) return
    const activeTabLabel = (TABS.filter((tab) => tab.key === key)[0] || {}).label || '全部'
    this.setData({ activeTab: key, activeTabLabel, list: [], loading: true })
    this.fetchPage(1)
  },

  onClose(event) {
    const id = Number(event.currentTarget.dataset.id)
    const target = this.data.list.filter((item) => item.id === id)[0]
    if (!target) return

    wx.showModal({
      title: '关闭需求',
      content: '关闭后将不再被化妆师看到，也不能再被响应。确定关闭吗？',
      confirmText: '关闭需求',
      confirmColor: '#D9483B',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const updated = await request.put(`/api/demands/${id}/close`, null, { showError: false })
          this.applyClosed(id, updated)
          wx.showToast({ title: '需求已关闭', icon: 'none' })
          this.refreshCounts()
        } catch (error) {
          wx.showToast({ title: (error && error.message) || '关闭失败', icon: 'none' })
        }
      },
    })
  },

  /** 关闭后按当前筛选即时更新，避免整页重载闪烁 */
  applyClosed(id, updated) {
    const { activeTab, list } = this.data
    if (activeTab === 'pending' || activeTab === 'responded') {
      const next = list.filter((item) => item.id !== id)
      this.setData({ list: next, total: Math.max(0, this.data.total - 1) })
      return
    }
    const next = list.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'closed',
            statusLabel: updated.statusLabel,
            tone: 'neutral',
            canClose: false,
          }
        : item,
    )
    this.setData({ list: next })
  },

  onPublish() {
    wx.navigateTo({ url: '/pkg-customer/pages/demand/create/index' })
  },

  onOpen(event) {
    const id = Number(event.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: `/pages/demand/detail/index?id=${id}` })
  },

  onSearch() {
    wx.navigateTo({ url: '/pkg-customer/pages/search/list/index' })
  },

  onPrimaryAction() {
    if (this.data.errorKind === 'auth') {
      redirectToLogin()
      return
    }
    wx.switchTab({ url: '/pages/home/index' })
  },
})
