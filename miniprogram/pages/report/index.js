const request = require('../../utils/request')
const { getToken } = require('../../utils/auth')

/**
 * 举报与安全（E14-03 / E14-04）。
 * - 从化妆师主页进入：query 携带 targetType / targetId / artistId / targetLabel，可直接举报；
 *   化妆师类举报可在页面内切换为举报其某个作品（作品列表实时拉取）；
 * - 从设置页进入：仅查看「我的举报记录」，展示后台处理结果（E14-04 回显）。
 * 限频由服务端保证：同一用户对同一对象 24 小时内仅可举报 1 次。
 */

const REASONS = [
  { code: 'copyright', label: '盗用作品' },
  { code: 'porn', label: '色情低俗' },
  { code: 'fraud', label: '欺诈诱导' },
  { code: 'inappropriate', label: '内容不当' },
  { code: 'other', label: '其他问题' },
]

const PAGE_SIZE = 10

function pad(value) {
  return String(value).padStart(2, '0')
}

function timeText(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

Page({
  data: {
    // 举报对象
    targetType: '',
    targetId: 0,
    targetLabel: '',
    artistId: null,
    artistName: '',
    works: [],
    reasons: REASONS,
    reason: '',
    detail: '',
    submitting: false,
    // 我的举报记录
    history: [],
    historyPage: 1,
    hasMoreHistory: false,
    historyLoading: false,
  },

  onLoad(query) {
    const targetType = query && query.targetType === 'portfolio' ? 'portfolio' : 'artist'
    const targetId = query && query.targetId ? Number(query.targetId) : 0
    const artistId = query && query.artistId ? Number(query.artistId) : null
    const targetLabel = (query && query.targetLabel) || ''

    this.setData({
      targetType: targetId ? targetType : '',
      targetId,
      artistId,
      artistName: targetLabel.replace(/^化妆师「|」$/g, ''),
      targetLabel: targetId ? targetLabel : '',
      reason: '',
    })

    if (artistId && targetType === 'artist') {
      this.loadWorks(artistId)
    }
    this.loadHistory(true)
  },

  /** 拉取该化妆师作品，供「举报作品」选择 */
  loadWorks(artistId) {
    request
      .get(`/api/artist/${artistId}/portfolios`, { page: 1, size: 30 }, { showError: false })
      .then((data) => {
        this.setData({ works: (data.list || []).map((item) => ({ id: item.id, title: item.title })) })
      })
      .catch(() => {})
  },

  /** 化妆师本人 ↔ 作品之间切换举报对象 */
  onSwitchTargetType() {
    const next = this.data.targetType === 'artist' ? 'portfolio' : 'artist'
    if (next === 'portfolio' && !this.data.works.length && this.data.artistId) {
      this.loadWorks(this.data.artistId)
    }
    this.setData({
      targetType: next,
      targetId: next === 'artist' ? this.data.artistId || 0 : 0,
      targetLabel:
        next === 'artist'
          ? `化妆师「${this.data.artistName}」`
          : '请选择要举报的作品',
    })
  },

  onPickWork(event) {
    const id = Number(event.currentTarget.dataset.id)
    const title = event.currentTarget.dataset.title || ''
    if (!id) return
    this.setData({ targetId: id, targetLabel: `作品「${title}」` })
  },

  onPickReason(event) {
    this.setData({ reason: event.currentTarget.dataset.code || '' })
  },

  onDetailInput(event) {
    this.setData({ detail: event.detail.value })
  },

  onSubmit() {
    if (this.data.submitting) return
    if (!getToken()) {
      wx.showToast({ title: '请先登录后再举报', icon: 'none' })
      return
    }
    if (!this.data.targetId) {
      wx.showToast({ title: this.data.works.length ? '请选择要举报的作品' : '举报对象缺失', icon: 'none' })
      return
    }
    if (!this.data.reason) {
      wx.showToast({ title: '请选择举报原因', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    request
      .post(
        '/api/reports',
        {
          targetType: this.data.targetType,
          targetId: this.data.targetId,
          reason: this.data.reason,
          ...(this.data.detail.trim() ? { detail: this.data.detail.trim() } : {}),
        },
        { showError: false },
      )
      .then(() => {
        wx.showToast({ title: '举报已提交', icon: 'success' })
        this.setData({ detail: '', reason: '' })
        this.loadHistory(true)
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || '举报提交失败', icon: 'none' })
      })
      .then(() => this.setData({ submitting: false }))
  },

  loadHistory(reset) {
    if (this.data.historyLoading) return
    const page = reset ? 1 : this.data.historyPage + 1
    this.setData({ historyLoading: true })
    request
      .get('/api/reports/mine', { page, size: PAGE_SIZE }, { showError: false })
      .then((data) => {
        const rows = (data.list || []).map((item) => ({ ...item, timeText: timeText(item.createdAt) }))
        this.setData({
          history: reset ? rows : this.data.history.concat(rows),
          historyPage: page,
          hasMoreHistory: page * PAGE_SIZE < (data.total || 0),
        })
      })
      .catch(() => {})
      .then(() => this.setData({ historyLoading: false }))
  },
})
