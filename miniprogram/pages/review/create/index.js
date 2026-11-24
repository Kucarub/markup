const request = require('../../../utils/request')
const { getRole } = require('../../../utils/auth')

const TYPE_LABEL = {
  bridal: '婚礼跟妆',
  daily: '日常妆造',
  event: '商业活动',
  photo: '写真拍摄',
}

/** 标签按评价方区分：客户评化妆师 / 化妆师评客户 */
const TAG_OPTIONS = {
  customer: ['妆效自然', '准时守约', '沟通顺畅', '细节用心', '性价比高', '愿意再约'],
  artist: ['沟通顺畅', '准时到场', '需求清晰', '配合度高', '态度友善', '愿意再合作'],
}

function monthDay(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

/**
 * 双向评价提交（E10-06）。
 * 仅已完成且本人未评价过的服务记录可进入；一单一评由服务端唯一索引兜底。
 */
Page({
  data: {
    orderId: 0,
    order: null,
    targetLabel: '',
    rating: 0,
    stars: [1, 2, 3, 4, 5],
    tags: [],
    content: '',
    loading: true,
    submitting: false,
    error: '',
  },

  onLoad(query) {
    const orderId = Number(query && query.orderId)
    if (!orderId) {
      this.setData({ loading: false, error: '服务记录不存在' })
      return
    }
    const role = getRole() === 'artist' ? 'artist' : 'customer'
    this.setData({
      orderId,
      tags: TAG_OPTIONS[role].map((label) => ({ label, selected: false })),
    })
    this.load()
  },

  load() {
    return request
      .get(`/api/service-orders/${this.data.orderId}`, null, { showError: false })
      .then((order) => {
        if (!order.canReview) {
          this.setData({
            loading: false,
            order,
            error: order.myReview ? '你已评价过该服务记录' : '服务完成后才能评价',
          })
          return
        }
        const isArtist = getRole() === 'artist'
        this.setData({
          loading: false,
          order: {
            ...order,
            typeLabel: TYPE_LABEL[order.serviceType] || order.serviceType,
            dateText: monthDay(order.serviceDate),
          },
          targetLabel: isArtist ? order.customerName || '客户' : order.artistName || '化妆师',
        })
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || '加载失败，请返回重试',
        })
      })
  },

  onRate(event) {
    this.setData({ rating: Number(event.currentTarget.dataset.value) || 0 })
  },

  onToggleTag(event) {
    const index = Number(event.currentTarget.dataset.index)
    const tags = this.data.tags.map((item, idx) =>
      idx === index ? { ...item, selected: !item.selected } : item,
    )
    const selected = tags.filter((item) => item.selected).length
    if (selected > 6) {
      wx.showToast({ title: '最多选择 6 个标签', icon: 'none' })
      return
    }
    this.setData({ tags })
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value || '' })
  },

  onSubmit() {
    if (this.data.submitting) return
    if (!this.data.rating) {
      wx.showToast({ title: '请先选择评分', icon: 'none' })
      return
    }

    const content = this.data.content.trim()
    const tags = this.data.tags.filter((item) => item.selected).map((item) => item.label)

    this.setData({ submitting: true })
    request
      .post(
        '/api/reviews',
        {
          serviceOrderId: this.data.orderId,
          rating: this.data.rating,
          tags,
          ...(content ? { content } : {}),
        },
        { showError: false },
      )
      .then((result) => {
        this.setData({ submitting: false })
        wx.showToast({ title: (result && result.message) || '评价已提交', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 900)
      })
      .catch((error) => {
        this.setData({ submitting: false })
        wx.showModal({
          title: '提交失败',
          content: (error && error.message) || '请稍后重试',
          showCancel: false,
        })
      })
  },

  onBack() {
    wx.navigateBack()
  },
})
