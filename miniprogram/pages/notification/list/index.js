const request = require('../../../utils/request')

const TABS = [
  { key: '', label: '全部' },
  { key: 'sent', label: '已推送' },
  { key: 'pending', label: '发送中' },
  { key: 'skipped', label: '站内' },
  { key: 'failed', label: '失败' },
]

const STATUS_LABEL = {
  pending: '发送中',
  sent: '已推送',
  skipped: '站内消息',
  failed: '发送失败',
}

const STATUS_TONE = {
  pending: 'warning',
  sent: 'success',
  skipped: 'brand',
  failed: 'danger',
}

const EMPTY = {
  '': ['还没有消息', '需求响应、定向预约与服务进度提醒会出现在这里'],
  sent: ['暂无已推送消息', '授权订阅后，通知会同步推送到微信'],
  pending: ['暂无发送中的消息', '消息通常几秒内完成发送'],
  skipped: ['暂无站内消息', '未授权订阅时通知只在这里展示'],
  failed: ['暂无发送失败的消息', '偶发失败可在微信服务通知中重试'],
}

const SIZE = 10

function pad(value) {
  return String(value).padStart(2, '0')
}

function timeText(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

function toCard(item) {
  return {
    ...item,
    timeText: timeText(item.createdAt),
    statusLabel: STATUS_LABEL[item.status] || item.status,
    tone: STATUS_TONE[item.status] || 'neutral',
  }
}

function tabViews(counts) {
  return TABS.map((tab) => ({
    ...tab,
    count: tab.key ? counts[tab.key] || 0 : counts.all || 0,
  }))
}

/** 站内消息（E11-02 降级通道）：订阅消息成功、跳过、失败都会在此留痕 */
Page({
  data: {
    tabs: tabViews({}),
    activeStatus: '',
    counts: { all: 0, pending: 0, sent: 0, skipped: 0, failed: 0 },
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

    return request
      .get('/api/notifications', params, { showError: false })
      .then((data) => {
        const rows = (data.list || []).map(toCard)
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
    const page = event.currentTarget.dataset.page
    if (!page) return
    wx.navigateTo({
      url: page.charAt(0) === '/' ? page : `/${page}`,
      fail: () => wx.showToast({ title: '页面暂不可用', icon: 'none' }),
    })
  },

  onRetry() {
    this.load(true)
  },
})
