const request = require('../../../utils/request')

const TYPE_LABEL = {
  bridal: '婚礼跟妆',
  daily: '日常妆造',
  event: '商业活动',
  photo: '写真拍摄',
}

const ROLE_LABEL = { artist: '化妆师', customer: '客户' }

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function monthDay(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

/** 按 DTO 的按钮态推导主操作，前端不重复实现状态机（E10-03） */
function resolvePrimary(order) {
  if (order.canConfirm) return { action: 'confirm', label: '确认接单' }
  if (order.finishState === 'requestable') return { action: 'finish', label: '发起完成' }
  if (order.finishState === 'confirmable') return { action: 'finish', label: '确认完成' }
  if (order.canReview) return { action: 'review', label: '去评价' }
  return null
}

function resolveHint(order) {
  if (order.status === 'pending') {
    return order.canConfirm
      ? '对方发起了服务记录，请确认接单'
      : `等待${ROLE_LABEL[order.initiatorRole] || '对方'}确认接单`
  }
  if (order.status === 'confirmed') {
    if (order.finishState === 'requestable') return '服务完成后可发起完工确认，双方确认后闭单'
    if (order.finishState === 'waiting') {
      return `已发起完成确认，等待对方确认${
        order.autoFinishAt ? `（${formatTime(order.autoFinishAt)} 自动完成）` : ''
      }`
    }
    if (order.finishState === 'confirmable') return '对方已发起完成确认，请你确认'
    return '服务进行中'
  }
  if (order.status === 'finished') return '服务已完成，欢迎留下真实评价'
  return '这条服务记录已取消'
}

function buildTimeline(order) {
  const items = [{ label: '服务记录创建', time: formatTime(order.createdAt), tone: 'neutral' }]
  if (order.confirmedAt) {
    items.push({ label: '双方确认接单', time: formatTime(order.confirmedAt), tone: 'brand' })
  }
  if (order.finishRequestBy && !order.finishTime) {
    items.push({
      label: `${ROLE_LABEL[order.finishRequestBy] || '一方'}发起完成确认`,
      time: formatTime(order.finishRequestAt),
      tone: 'warning',
    })
  }
  if (order.finishTime) {
    items.push({ label: '服务已完成', time: formatTime(order.finishTime), tone: 'success' })
  }
  if (order.cancelledAt) {
    items.push({
      label: `${order.cancelByLabel || '一方'}取消服务记录`,
      time: formatTime(order.cancelledAt),
      tone: 'danger',
    })
  }
  return items
}

function decorate(order) {
  return {
    ...order,
    dateText: monthDay(order.serviceDate),
    typeLabel: TYPE_LABEL[order.serviceType] || order.serviceType,
    primary: resolvePrimary(order),
    hint: resolveHint(order),
    timeline: buildTimeline(order),
    reviewStars: order.myReview ? '★★★★★'.slice(0, order.myReview.rating) : '',
  }
}

/**
 * 服务记录详情（E10-03）。
 * 三种按钮态由服务端 DTO 给出：未发起 / 待对方确认 / 已完成。
 */
Page({
  data: {
    id: 0,
    order: null,
    loading: true,
    error: '',
    submitting: false,
  },

  onLoad(query) {
    const id = Number(query && query.id)
    if (!id) {
      this.setData({ loading: false, error: '服务记录不存在' })
      return
    }
    this.setData({ id })
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({ loading: true, error: '' })
    return request
      .get(`/api/service-orders/${this.data.id}`, null, { showError: false })
      .then((order) => {
        this.setData({ loading: false, order: decorate(order) })
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || '加载失败，请下拉重试',
        })
      })
  },

  onSubmit(event) {
    const action = event.currentTarget.dataset.action
    if (action === 'review') {
      wx.navigateTo({ url: `/pages/review/create/index?orderId=${this.data.id}` })
      return
    }
    if (this.data.submitting) return
    if (action === 'confirm') this.confirmOrder()
    if (action === 'finish') this.finishOrder()
  },

  /** 确认接单：待确认 → 已确认（仅非发起方可见按钮） */
  confirmOrder() {
    wx.showModal({
      title: '确认接单',
      content: '确认后服务记录进入已确认，请按约定时间履约。',
      confirmText: '确认接单',
      confirmColor: '#B4566E',
      success: (res) => {
        if (!res.confirm) return
        this.post(`/api/service-orders/${this.data.id}/confirm`, {}, '已确认接单')
      },
    })
  },

  /** 完工确认：我方发起 → 等对方；对方已发起 → 我方确认闭单 */
  finishOrder() {
    const order = this.data.order || {}
    const isConfirm = order.finishState === 'confirmable'
    wx.showModal({
      title: isConfirm ? '确认完成' : '发起完成确认',
      content: isConfirm
        ? '确认后服务记录立即完成，双方信用分各 +2。'
        : '发起后需对方确认才闭单，7 天未确认将自动完成。',
      confirmText: isConfirm ? '确认完成' : '发起完成',
      confirmColor: '#B4566E',
      success: (res) => {
        if (!res.confirm) return
        this.post(
          `/api/service-orders/${this.data.id}/finish`,
          {},
          isConfirm ? '服务已完成' : '已发起完成确认',
        )
      },
    })
  },

  /** 取消服务记录：原因必填，提交后释放档期并记录取消方（E10-05） */
  onCancel() {
    if (this.data.submitting) return
    wx.showModal({
      title: '取消服务记录',
      editable: true,
      placeholderText: '请填写取消原因（必填）',
      confirmText: '确认取消',
      confirmColor: '#B4566E',
      success: (res) => {
        if (!res.confirm) return
        const reason = (res.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '请填写取消原因', icon: 'none' })
          return
        }
        this.post(`/api/service-orders/${this.data.id}/cancel`, { reason }, '已取消服务记录')
      },
    })
  },

  post(url, body, successText) {
    this.setData({ submitting: true })
    request
      .post(url, body, { showError: false })
      .then((order) => {
        this.setData({ submitting: false, order: decorate(order) })
        wx.showToast({ title: successText, icon: 'success' })
      })
      .catch((error) => {
        this.setData({ submitting: false })
        wx.showModal({
          title: '操作失败',
          content: (error && error.message) || '请刷新后重试',
          showCancel: false,
        })
        this.load()
      })
  },

  onRetry() {
    if (this.data.id) {
      this.load()
      return
    }
    wx.navigateBack()
  },
})
