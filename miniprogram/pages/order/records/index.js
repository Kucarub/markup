const request = require('../../../utils/request')
const { getRole } = require('../../../utils/auth')

const TYPE_LABEL = {
  bridal: '婚礼跟妆',
  daily: '日常妆造',
  event: '商业活动',
  photo: '写真拍摄',
}

const TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'finished', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

const EMPTY = {
  '': ['还没有服务记录', '接受定向预约后会生成服务记录'],
  pending: ['暂无待确认记录', '对方发起定向预约并接受后会出现在这里'],
  confirmed: ['暂无已确认记录', '双方确认接单后服务记录进入已确认'],
  finished: ['暂无已完成记录', '双方完成确认后记录归档到这里'],
  cancelled: ['暂无已取消记录', '取消的服务记录会保留取消方与原因'],
}

const SIZE = 10

function monthDay(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

/** 服务记录 DTO → 卡片展示模型（E10-02） */
function toCard(order, role) {
  const counterpart =
    role === 'artist' ? order.customerName || '客户' : order.artistName || '化妆师'
  return {
    ...order,
    dateText: monthDay(order.serviceDate),
    typeLabel: TYPE_LABEL[order.serviceType] || order.serviceType,
    counterpartLabel: role === 'artist' ? '客户' : '化妆师',
    counterpart,
    cancelText: order.cancelByLabel
      ? `${order.cancelByLabel}：${order.cancelReason || '未填写原因'}`
      : '',
  }
}

function tabViews(counts) {
  return TABS.map((tab) => ({
    ...tab,
    count: tab.key ? counts[tab.key] || 0 : counts.all || 0,
  }))
}

/**
 * 我的服务记录列表（E10-02，客户与化妆师共用）。
 * 四态筛选由服务端按登录角色过滤，前端只渲染与分页。
 */
Page({
  data: {
    tabs: tabViews({}),
    activeStatus: '',
    counts: { all: 0, pending: 0, confirmed: 0, finished: 0, cancelled: 0 },
    list: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    page: 1,
    error: '',
    emptyTitle: EMPTY[''][0],
    emptyDesc: EMPTY[''][1],
  },

  onLoad() {
    this.load(true)
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.load(false)
  },

  onTabTap(event) {
    const key = event.currentTarget.dataset.key || ''
    if (key === this.data.activeStatus) return
    const empty = EMPTY[key] || EMPTY['']
    this.setData({ activeStatus: key, emptyTitle: empty[0], emptyDesc: empty[1] })
    this.load(true)
  },

  load(reset) {
    const page = reset ? 1 : this.data.page + 1
    const params = { page, size: SIZE }
    if (this.data.activeStatus) params.status = this.data.activeStatus

    if (reset) {
      this.setData({ loading: true, error: '' })
    } else {
      this.setData({ loadingMore: true })
    }

    const role = getRole()
    return request
      .get('/api/service-orders', params, { showError: false })
      .then((data) => {
        const rows = (data.list || []).map((item) => toCard(item, role))
        const list = reset ? rows : this.data.list.concat(rows)
        const counts = data.counts || this.data.counts
        this.setData({
          loading: false,
          loadingMore: false,
          page,
          list,
          counts,
          tabs: tabViews(counts),
          hasMore: list.length < (data.total || 0),
        })
      })
      .catch((error) => {
        this.setData({
          loading: false,
          loadingMore: false,
          error: (error && error.message) || '加载失败，请下拉重试',
        })
      })
  },

  onOpen(event) {
    const id = Number(event.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: `/pages/order/detail/index?id=${id}` })
  },

  onRetry() {
    this.load(true)
  },
})
