const request = require('../../../utils/request')
const { getToken, getRole } = require('../../../utils/auth')
const { fetchProfile } = require('../../../utils/guard')
const { absoluteUrl } = require('../../../utils/upload')
const { styleLabels } = require('../../../utils/dict')
const env = require('../../../config/env')

const PAGE_SIZE = 12
const DEVICE_KEY = 'device_id'
const STATE_LABEL = {
  available: '可约',
  booked: '已排',
  rest: '休息',
  none: '不可接',
}

/** 设备标识：本地持久化，服务端只存 SHA-256 用于 UV 去重 */
function deviceId() {
  let id = wx.getStorageSync(DEVICE_KEY)
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    wx.setStorageSync(DEVICE_KEY, id)
  }
  return id
}

/**
 * 化妆师公开主页（E5-04 / E5-05 / E5-06 / E5-07）。
 * - 首屏展示头像、姓名、城市、年限、风格、档期摘要与首批作品；
 * - 作品分页加载，图片懒加载；
 * - 支持转发卡片与小程序码；进入即上报一次 UV（同设备同日自动去重）。
 */
Page({
  data: {
    loading: true,
    error: '',
    artistId: null,
    profile: null,
    labels: [],
    scheduleDays: [],
    works: [],
    worksPage: 1,
    hasMore: false,
    loadingMore: false,
    isOwner: false,
    qrcodeUrl: '',
    qrcodeError: false,
    showQrcode: false,
  },

  onLoad(query) {
    const artistId = query && query.id ? Number(query.id) : 0
    if (!artistId) {
      this.setData({ loading: false, error: '缺少化妆师 ID' })
      return
    }
    this.setData({ artistId })
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return
    this.setData({ loadingMore: true })
    this.fetchWorks(this.data.worksPage + 1)
  },

  load() {
    this.setData({ loading: true, error: '' })
    return request
      .get(`/api/artist/${this.data.artistId}`, null, { showError: false })
      .then((profile) => {
        const days = (profile.schedule && profile.schedule.days) || []
        this.setData({
          profile,
          labels: styleLabels(profile.styles),
          scheduleDays: days.map((day) => ({
            date: day.date,
            month: day.date.slice(5, 7),
            day: day.date.slice(8, 10),
            state: day.state,
            stateLabel: STATE_LABEL[day.state] || '不可接',
          })),
          loading: false,
        })
        this.reportVisit()
        return this.fetchWorks(1)
      })
      .catch(() => this.setData({ loading: false, error: '主页不存在或尚未通过审核' }))
  },

  fetchWorks(page) {
    return request
      .get(
        `/api/artist/${this.data.artistId}/portfolios`,
        { page, size: PAGE_SIZE },
        { showError: false },
      )
      .then((data) => {
        const mapped = (data.list || []).map((item) => ({
          id: item.id,
          type: item.type,
          isVideo: item.type === 'video',
          cover: absoluteUrl(item.path),
          title: item.title,
        }))
        const works = page === 1 ? mapped : this.data.works.concat(mapped)
        this.setData({
          works,
          worksPage: page,
          hasMore: works.length < (data.total || 0),
          loadingMore: false,
        })
      })
      .catch(() => this.setData({ loadingMore: false }))
  },

  /** 本人预览不计 UV */
  reportVisit() {
    const artistId = this.data.artistId
    const visit = (isOwner) => {
      if (isOwner) {
        this.setData({ isOwner: true })
        return
      }
      request
        .post(`/api/artist/${artistId}/visit`, { deviceId: deviceId() }, { showError: false })
        .catch(() => {})
    }

    if (!getToken()) {
      visit(false)
      return
    }
    fetchProfile()
      .then((profile) => visit(Boolean(profile) && profile.profileId === artistId))
      .catch(() => visit(false))
  },

  onPreviewWork(event) {
    const index = Number(event.currentTarget.dataset.index)
    const item = this.data.works[index]
    if (!item) return

    if (item.isVideo) {
      const sources = this.data.works
        .filter((work) => work.isVideo)
        .map((work) => ({ url: work.cover, type: 'video' }))
      wx.previewMedia({ sources })
      return
    }
    const urls = this.data.works.filter((work) => !work.isVideo).map((work) => work.cover)
    wx.previewImage({ current: item.cover, urls })
  },

  onContact() {
    if (this.data.isOwner) {
      wx.showToast({ title: '这是你的主页', icon: 'none' })
      return
    }
    if (getRole() === 'customer') {
      wx.showToast({ title: '定向预约将在下一版本开放', icon: 'none' })
      return
    }
    wx.showToast({ title: '登录后可预约该化妆师', icon: 'none' })
  },

  onShowQrcode() {
    if (!this.data.qrcodeUrl) {
      this.setData({
        qrcodeUrl: `${env.baseURL}/api/artist/${this.data.artistId}/qrcode`,
        qrcodeError: false,
      })
    }
    this.setData({ showQrcode: true })
  },

  onQrcodeError() {
    this.setData({ qrcodeError: true })
  },

  closeQrcode() {
    this.setData({ showQrcode: false })
  },

  /** 阻止点击弹层内部时冒泡到遮罩 */
  stopProp() {},

  saveQrcode() {
    if (this.data.qrcodeError) {
      wx.showToast({ title: '暂未配置小程序 AppID，无法生成小程序码', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中', mask: true })
    wx.downloadFile({
      url: this.data.qrcodeUrl,
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.hideLoading()
          wx.showToast({ title: '小程序码暂不可用', icon: 'none' })
          return
        }
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading()
            wx.showToast({ title: '已保存到相册' })
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' })
          },
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败，请稍后重试', icon: 'none' })
      },
    })
  },

  onShareAppMessage() {
    const profile = this.data.profile || {}
    const payload = {
      title: `${profile.name || '化妆师'} · ${profile.city ? `${profile.city}专业化妆师` : '作品主页'}`,
      path: `/pages/artist/detail/index?id=${this.data.artistId}`,
    }
    const image = profile.avatarUrl || absoluteUrl(profile.coverPath)
    if (image) payload.imageUrl = image
    return payload
  },
})
