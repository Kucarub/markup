const request = require('../../../utils/request')
const { getRole } = require('../../../utils/auth')
const { styleLabels } = require('../../../utils/dict')

const TYPE_LABEL = {
  bridal: '婚礼跟妆',
  daily: '日常妆造',
  event: '商业活动',
  photo: '写真拍摄',
}

const RESPONSE_STATUS = {
  pending: '等待确认',
  selected: '已选中',
  rejected: '未选中',
  withdrawn: '已撤回',
}

const TABS = [
  { key: 'pending', label: '待处理' },
  { key: 'handled', label: '已处理' },
  { key: 'responses', label: '我的响应' },
  { key: 'orders', label: '服务记录' },
]

function monthDay(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

function budgetText(min, max) {
  return min === max ? `${min}` : `${min}–${max}`
}

function toast(title) {
  wx.showToast({ title, icon: 'none' })
}

/** 需求 DTO → 卡片展示模型（待处理 / 已处理 / 我的响应共用） */
function toCard(demand) {
  return {
    ...demand,
    dateText: monthDay(demand.serviceDate),
    typeLabel: TYPE_LABEL[demand.serviceType] || demand.serviceType,
    budgetText: budgetText(demand.budgetMin, demand.budgetMax),
    styles: styleLabels(demand.stylePrefs),
  }
}

/**
 * 化妆师接单中心（E9-04 / E9-05）。
 * - 待处理：发给我的定向预约，可就地接受或婉拒；
 * - 已处理：已接受 / 已婉拒的定向预约；
 * - 我的响应：需求大厅报名状态；
 * - 服务记录：待确认 / 已确认，接受定向预约后生成。
 */
Page({
  data: {
    tabs: TABS,
    activeTab: 'pending',
    loading: true,
    error: '',
    unread: 0,
    pending: [],
    handled: [],
    responses: [],
    orders: [],
    submittingId: 0,
    emptyTitle: '',
    emptyDesc: '',
  },

  onLoad() {
    if (getRole() !== 'artist') {
      this.setData({
        loading: false,
        error: '接单中心仅对化妆师开放',
      })
      return
    }
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({ loading: true, error: '' })
    return request
      .get('/api/inbox', null, { showError: false })
      .then((data) => {
        const pending = (data.pending || []).map(toCard)
        const handled = (data.handled || []).map((item) => ({
          ...toCard(item),
          statusLabel: item.handledStatus === 'accepted' ? '已接受' : '已婉拒',
          tone: item.handledStatus === 'accepted' ? 'success' : 'neutral',
        }))
        const responses = (data.responses || []).map((item) => ({
          id: item.id,
          status: item.status,
          statusLabel: RESPONSE_STATUS[item.status] || item.status,
          note: item.note || '',
          demand: toCard(item.demand),
        }))
        const orders = (data.orders || []).map((item) => ({
          ...item,
          dateText: monthDay(item.serviceDate),
          typeLabel: TYPE_LABEL[item.serviceType] || item.serviceType,
        }))

        this.setData({
          loading: false,
          unread: data.unread || 0,
          pending,
          handled,
          responses,
          orders,
        })
        this.applyTab(this.data.activeTab)
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || '加载失败，请下拉重试',
        })
      })
  },

  onTabTap(event) {
    this.applyTab(event.currentTarget.dataset.key)
  },

  /** 切换 Tab 时同步列表与空态文案 */
  applyTab(key) {
    const empty = {
      pending: ['暂无待处理预约', '客户在化妆师主页发起的定向预约会出现在这里'],
      handled: ['暂无已处理记录', '接受或婉拒的定向预约会归档在这里'],
      responses: ['还没有响应记录', '去需求大厅看看同城客户的需求'],
      orders: ['暂无服务记录', '接受定向预约后会自动生成服务记录'],
    }[key] || ['', '']

    this.setData({
      activeTab: key,
      emptyTitle: empty[0],
      emptyDesc: empty[1],
    })
  },

  /** 接受定向预约（E9-05）：生成待确认服务记录并占用档期 */
  onAccept(event) {
    const id = Number(event.currentTarget.dataset.id)
    if (!id || this.data.submittingId) return

    wx.showModal({
      title: '接受这条预约',
      content: '接受后将生成待确认服务记录，并占用该日档期。',
      confirmText: '确认接受',
      confirmColor: '#B4566E',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ submittingId: id })
        request
          .post(`/api/demands/${id}/accept`, {}, { showError: false })
          .then(() => {
            this.setData({ submittingId: 0 })
            wx.showToast({ title: '已接受预约', icon: 'success' })
            this.load()
          })
          .catch((error) => {
            this.setData({ submittingId: 0 })
            wx.showModal({
              title: '接受失败',
              content: (error && error.message) || '请刷新后重试',
              showCancel: false,
            })
            this.load()
          })
      },
    })
  },

  /** 婉拒定向预约（E9-05）：原因必填，客户可看到婉拒原因 */
  onDecline(event) {
    const id = Number(event.currentTarget.dataset.id)
    if (!id || this.data.submittingId) return

    wx.showModal({
      title: '婉拒这条预约',
      editable: true,
      placeholderText: '请说明婉拒原因（必填）',
      confirmText: '提交婉拒',
      confirmColor: '#B4566E',
      success: (res) => {
        if (!res.confirm) return
        const reason = (res.content || '').trim()
        if (!reason) {
          toast('请填写婉拒原因')
          return
        }
        this.setData({ submittingId: id })
        request
          .post(`/api/demands/${id}/decline`, { reason }, { showError: false })
          .then(() => {
            this.setData({ submittingId: 0 })
            wx.showToast({ title: '已婉拒', icon: 'success' })
            this.load()
          })
          .catch((error) => {
            this.setData({ submittingId: 0 })
            toast((error && error.message) || '婉拒失败，请重试')
          })
      },
    })
  },

  onOpenDemand(event) {
    const id = Number(event.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: `/pages/demand/detail/index?id=${id}` })
  },

  /** 服务记录卡片跳记录详情（E10-03），不再跳需求详情 */
  onOpenOrder(event) {
    const id = Number(event.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: `/pages/order/detail/index?id=${id}` })
  },

  onRetry() {
    if (this.data.error === '接单中心仅对化妆师开放') {
      wx.switchTab({ url: '/pages/mine/index' })
      return
    }
    this.load()
  },
})
