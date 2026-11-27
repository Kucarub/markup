const request = require('../../../utils/request')
const { getToken, redirectToLogin } = require('../../../utils/auth')
const { track } = require('../../../utils/track')
const { styleLabels } = require('../../../utils/dict')
const { absoluteUrl } = require('../../../utils/upload')

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

const RESPONSE_TONE = {
  pending: 'warning',
  selected: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
}

/** 需求状态 → 标签色：已选定绿、已响应品牌、已关闭灰、其余警示 */
function demandTone(detail) {
  if (detail.status === 'selected') return 'success'
  if (detail.status === 'closed') return 'neutral'
  if (detail.responseCount > 0) return 'brand'
  return 'warning'
}

function monthDay(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

function budgetText(min, max) {
  return min === max ? `${min}` : `${min}–${max}`
}

function expireText(expireAt) {
  if (!expireAt) return '长期有效'
  const days = Math.ceil((new Date(expireAt).getTime() - Date.now()) / 86400000)
  if (days <= 0) return '已过期'
  if (days === 1) return '今日截止响应'
  return `还有 ${days} 天可响应`
}

/**
 * 需求详情（E8-02 / E8-04）。
 * - 化妆师视角：展示需求详情与响应入口，已响应 / 已选定 / 已关闭 / 已过期给出原因；
 * - 客户视角：展示响应者列表，可择一确认并生成待确认服务记录；
 * - 游客可浏览公开需求（仅待响应且未过期），点击响应引导登录。
 */
Page({
  data: {
    id: 0,
    loading: true,
    error: '',
    detail: null,
    typeLabel: '',
    styles: [],
    budgetText: '',
    dateText: '',
    expireText: '',
    isOwner: false,
    myResponse: null,
    actionLabel: '响应需求',
    actionDisabled: true,
    actionKind: 'respond',
    responses: [],
    responsesLoading: false,
    alternatives: [],
    alternativesLoading: false,
    submitting: false,
    selectingId: 0,
    expanded: false,
  },

  onLoad(query) {
    const id = query && query.id ? Number(query.id) : 0
    if (!id) {
      this.setData({ loading: false, error: '缺少需求 ID' })
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
      .get(`/api/demands/${this.data.id}`, null, { showError: false })
      .then((detail) => {
        this.setData(this.buildView(detail))
        if (detail.isOwner) this.loadResponses()
        else this.setData({ responses: [] })
        // 定向预约被婉拒：加载同城备选化妆师（E9-06）
        if (detail.isOwner && detail.declineReason) this.loadAlternatives()
        else this.setData({ alternatives: [] })
        track('demand_detail_view', {
          demandId: detail.id,
          serviceType: detail.serviceType,
          responded: Boolean(detail.myResponse),
        })
      })
      .catch((error) => {
        const notFound = error && error.statusCode === 404
        this.setData({
          loading: false,
          error: notFound ? '需求不存在或已不可见' : '加载失败，请下拉重试',
        })
      })
  },

  /** 详情 DTO → 展示模型 + 底部操作按钮态 */
  buildView(detail) {
    let actionLabel = '响应需求'
    let actionKind = 'respond'
    let actionDisabled = true

    if (detail.isOwner) {
      actionKind = 'owner'
      actionLabel =
        detail.responseCount > 0 ? `查看 ${detail.responseCount} 位响应` : '等待化妆师响应'
      actionDisabled = detail.responseCount === 0
      // 定向预约被婉拒：底部引导查看备选化妆师（E9-06）
      if (detail.declineReason) {
        actionKind = 'alternatives'
        actionLabel = '查看备选化妆师'
        actionDisabled = false
      }
    } else if (!getToken()) {
      actionLabel = '登录后响应'
      actionDisabled = false
    } else if (detail.myResponse) {
      actionLabel = '已响应，等待客户确认'
      actionDisabled = true
    } else if (detail.canRespond) {
      actionLabel = '响应需求'
      actionDisabled = false
    } else {
      actionLabel = detail.respondBlockedReason || '暂不可响应'
      actionDisabled = true
    }

    return {
      loading: false,
      detail,
      typeLabel: TYPE_LABEL[detail.serviceType] || detail.serviceType,
      statusTone: demandTone(detail),
      styles: styleLabels(detail.stylePrefs),
      budgetText: budgetText(detail.budgetMin, detail.budgetMax),
      dateText: monthDay(detail.serviceDate),
      expireText: expireText(detail.expireAt),
      remarkLong: Boolean(detail.remark && detail.remark.length > 60),
      expanded: false,
      isOwner: detail.isOwner,
      myResponse: detail.myResponse
        ? {
            ...detail.myResponse,
            statusLabel: RESPONSE_STATUS[detail.myResponse.status] || detail.myResponse.status,
          }
        : null,
      actionLabel,
      actionKind,
      actionDisabled,
    }
  },

  /** 响应者列表（仅需求所属客户可请求） */
  loadResponses() {
    this.setData({ responsesLoading: true })
    return request
      .get(`/api/demands/${this.data.id}/responses`, null, { showError: false })
      .then((data) => {
        const responses = (data.list || []).map((item) => {
          const artist = item.artist || {}
          return {
            id: item.id,
            status: item.status,
            statusLabel: RESPONSE_STATUS[item.status] || item.status,
            statusTone: RESPONSE_TONE[item.status] || 'neutral',
            note: item.note || '',
            createdAt: item.createdAt,
            artistId: artist.id,
            name: artist.name || '化妆师',
            years: artist.years || 0,
            city: artist.city || '',
            district: artist.district || '',
            styles: styleLabels(artist.styles),
            intro: artist.intro || '',
            cover: artist.coverPath ? absoluteUrl(artist.coverPath) : '',
            avatar: artist.avatarUrl ? absoluteUrl(artist.avatarUrl) : '',
            worksTotal: artist.worksTotal || 0,
            nextAvailableDate: artist.nextAvailableDate || '',
            selectable:
              item.status === 'pending' &&
              Boolean(this.data.detail) &&
              this.data.detail.status === 'pending',
          }
        })
        this.setData({ responses, responsesLoading: false })
      })
      .catch(() => this.setData({ responsesLoading: false }))
  },

  /** 婉拒后备选推荐（E9-06）：同城、风格有交集、当日可接的化妆师 */
  loadAlternatives() {
    this.setData({ alternativesLoading: true })
    return request
      .get(`/api/demands/${this.data.id}/alternatives`, null, { showError: false })
      .then((data) => {
        const alternatives = (data.list || []).map((artist) => ({
          id: artist.id,
          name: artist.name || '化妆师',
          years: artist.years || 0,
          city: artist.city || '',
          district: artist.district || '',
          styles: styleLabels(artist.styles),
          cover: artist.coverPath ? absoluteUrl(artist.coverPath) : '',
          avatar: artist.avatarUrl ? absoluteUrl(artist.avatarUrl) : '',
          worksTotal: artist.worksTotal || 0,
          nextAvailableDate: artist.nextAvailableDate || '',
        }))
        this.setData({ alternatives, alternativesLoading: false })
      })
      .catch(() => this.setData({ alternativesLoading: false }))
  },

  onAction() {
    const { actionKind, actionLabel } = this.data
    if (this.data.actionDisabled) {
      if (actionLabel) wx.showToast({ title: actionLabel, icon: 'none' })
      return
    }
    if (actionKind === 'owner') {
      wx.pageScrollTo({ selector: '#responses', duration: 240 })
      return
    }
    if (actionKind === 'alternatives') {
      wx.pageScrollTo({ selector: '#alternatives', duration: 240 })
      return
    }
    if (!getToken()) {
      redirectToLogin()
      return
    }
    if (this.data.submitting) return

    wx.showModal({
      title: '响应这条需求',
      editable: true,
      placeholderText: '一句话说明（可选），如：档期合适，可提供跟妆',
      confirmText: '提交响应',
      confirmColor: '#B4566E',
      success: (res) => {
        if (!res.confirm) return
        this.submitResponse((res.content || '').trim())
      },
    })
  },

  submitResponse(note) {
    this.setData({ submitting: true })
    request
      .post(`/api/demands/${this.data.id}/respond`, note ? { note } : {}, { showError: false })
      .then(() => {
        this.setData({ submitting: false })
        wx.showToast({ title: '已响应，等待客户确认', icon: 'none' })
        track('demand_respond', { demandId: this.data.id })
        this.load()
      })
      .catch((error) => {
        this.setData({ submitting: false })
        wx.showToast({ title: (error && error.message) || '响应失败', icon: 'none' })
        if (error && error.statusCode === 409) this.load()
      })
  },

  onSelect(event) {
    const responseId = Number(event.currentTarget.dataset.id)
    const target = this.data.responses.filter((item) => item.id === responseId)[0]
    if (!target || this.data.selectingId) return

    wx.showModal({
      title: '确认选择该化妆师',
      content: `确认后将生成一条待确认服务记录，其余 ${Math.max(
        0,
        this.data.responses.length - 1,
      )} 位响应者自动置为未选中，且不可撤销。`,
      confirmText: '确认选择',
      confirmColor: '#B4566E',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ selectingId: responseId })
        request
          .post(`/api/demands/${this.data.id}/select`, { responseId }, { showError: false })
          .then((data) => {
            this.setData({ selectingId: 0 })
            track('demand_select', { demandId: this.data.id, responseId })
            wx.showModal({
              title: '已确认',
              content: `已选定 ${target.name}，服务记录 ${data.serviceOrder.id} 待双方确认。`,
              showCancel: false,
              confirmText: '知道了',
              success: () => this.load(),
            })
          })
          .catch((error) => {
            this.setData({ selectingId: 0 })
            wx.showToast({ title: (error && error.message) || '确认失败', icon: 'none' })
            this.load()
          })
      },
    })
  },

  onArtistTap(event) {
    const artistId = Number(event.currentTarget.dataset.id)
    if (!artistId) return
    track('artist_card_click', { artistId, from: 'demand_detail' })
    wx.navigateTo({ url: `/pages/artist/detail/index?id=${artistId}` })
  },

  onToggleExpand() {
    this.setData({ expanded: !this.data.expanded })
  },

  onShareAppMessage() {
    const { detail, typeLabel } = this.data
    return {
      title: detail ? `${typeLabel}需求 · ${detail.city}${detail.district}` : '兰妆有约 · 需求详情',
      path: `/pages/demand/detail/index?id=${this.data.id}`,
    }
  },

  onShareTimeline() {
    const { detail, typeLabel } = this.data
    return {
      title: detail ? `${typeLabel}需求 · ${detail.city}${detail.district}` : '兰妆有约 · 需求详情',
      query: `id=${this.data.id}`,
    }
  },
})
