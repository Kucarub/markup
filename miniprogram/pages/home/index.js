const request = require('../../utils/request')
const { profile, stats, schedule, demands } = require('../../data/mock')
const { getToken, getRole } = require('../../utils/auth')
const { entryGuard, fetchProfile } = require('../../utils/guard')
const { styleLabels } = require('../../utils/dict')
const { absoluteUrl } = require('../../utils/upload')

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
  if (min === undefined || min === null) return ''
  return min === max ? `${min}` : `${min}–${max}`
}

/** 需求 DTO → 客户工作台卡片 */
function toDemandCard(demand) {
  let tone = 'warning'
  if (demand.status === 'closed') tone = 'neutral'
  else if (demand.status === 'selected') tone = 'success'
  else if (demand.responseCount > 0) tone = 'brand'

  return {
    id: demand.id,
    typeLabel: SERVICE_TYPES[demand.serviceType] || demand.serviceType || '妆造需求',
    statusLabel: demand.statusLabel || '',
    tone,
    dateText: monthDay(demand.serviceDate),
    headcount: demand.headcount || 1,
    place: `${demand.city || ''}${demand.district || ''}`,
    budgetText: budgetText(demand.budgetMin, demand.budgetMax),
    responseText:
      demand.responseCount > 0 ? `${demand.responseCount} 位化妆师已响应` : '等待化妆师响应',
  }
}

/** 化妆师 DTO → 客户工作台推荐卡 */
function toArtistCard(artist) {
  return {
    id: artist.id,
    name: artist.name,
    years: artist.years || 0,
    place: `${artist.city || ''}${artist.district || ''}`,
    styles: styleLabels(artist.styles).slice(0, 3),
    cover: artist.coverPath ? absoluteUrl(artist.coverPath) : '',
    worksTotal: artist.worksTotal || 0,
    availText: artist.nextAvailableDate
      ? `最早可约 ${monthDay(artist.nextAvailableDate)}`
      : '档期待更新',
  }
}

/**
 * 工作台（按角色区分内容）。
 * - 化妆师：资料完整度、数据概览、近期档期、匹配需求；
 * - 客户：发布需求入口、我的需求、推荐化妆师。
 */
Page({
  data: {
    /** 'artist' | 'customer'：先用本地缓存渲染，onShow 再用 /auth/me 校正 */
    role: getRole(),
    // 化妆师工作台
    profile,
    stats,
    schedule,
    recommended: demands.slice(0, 3),
    // 客户工作台
    myDemands: [],
    myDemandsLoading: true,
    myDemandsError: '',
    artists: [],
    artistsLoading: true,
    artistsError: '',
  },

  onLoad() {
    // 每次进入小程序：已登录默认停在工作台，未登录一律回登录页
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
    }
  },

  onShow() {
    // 切换身份后角色可能变化：每次页面显示都让底部导航按最新角色重建
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().refresh()
    }
    if (!getToken()) return
    entryGuard().then((ok) => {
      if (!ok) return
      this.syncRole()
    })
  },

  /** 校正当前角色，客户额外拉取需求与推荐化妆师 */
  syncRole() {
    return fetchProfile()
      .then((info) => (info && info.role) || getRole())
      .catch(() => getRole())
      .then((role) => {
        if (!role) return
        if (role !== this.data.role) this.setData({ role })
        if (role === 'customer') this.loadCustomer()
      })
  },

  loadCustomer() {
    this.loadMyDemands()
    this.loadArtists()
  },

  loadMyDemands() {
    this.setData({ myDemandsLoading: !this.data.myDemands.length, myDemandsError: '' })
    request
      .get('/api/demands', { scope: 'mine', page: 1, size: 3 }, { showError: false })
      .then((data) => {
        this.setData({
          myDemands: (data.list || []).map(toDemandCard),
          myDemandsLoading: false,
        })
      })
      .catch((error) => {
        this.setData({
          myDemandsLoading: false,
          myDemandsError: (error && error.message) || '需求加载失败',
        })
      })
  },

  loadArtists() {
    this.setData({ artistsLoading: !this.data.artists.length, artistsError: '' })
    request
      .get('/api/search/artists', { page: 1, size: 3 }, { showError: false })
      .then((data) => {
        this.setData({ artists: (data.list || []).map(toArtistCard), artistsLoading: false })
      })
      .catch((error) => {
        this.setData({
          artistsLoading: false,
          artistsError: (error && error.message) || '推荐加载失败',
        })
      })
  },

  onCityTap() {
    this.toast('当前试点城市：上海')
  },

  onBellTap() {
    // 化妆师进接单中心（E9-04），客户进消息通知
    wx.navigateTo({
      url:
        this.data.role === 'customer'
          ? '/pages/notification/list/index'
          : '/pages/order/list/index',
    })
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pkg-artist/pages/artist/apply/index' })
  },

  onEditSchedule() {
    this.toast('档期设置将在下一版本开放')
  },

  onDayTap(event) {
    const { state, day } = event.currentTarget.dataset
    this.toast(state === 'booked' ? '该日期已有预约' : `${day} 日当前可约`)
  },

  onDemandOpen(event) {
    wx.navigateTo({ url: `/pages/demand/detail/index?id=${event.detail.id}` })
  },

  goHall() {
    wx.switchTab({ url: '/pages/demand/hall/index' })
  },

  goPublishDemand() {
    wx.navigateTo({ url: '/pkg-customer/pages/demand/create/index' })
  },
  goSearchArtists() {
    wx.navigateTo({ url: '/pkg-customer/pages/search/list/index' })
  },

  goMyDemands() {
    wx.switchTab({ url: '/pages/demand/mine/index' })
  },

  onMyDemandTap(event) {
    const id = Number(event.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: `/pages/demand/detail/index?id=${id}` })
  },

  onArtistTap(event) {
    const id = Number(event.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: `/pages/artist/detail/index?id=${id}` })
  },

  /** 分享小程序：好友点开进入工作台，未登录会先引导登录 */
  onShareAppMessage() {
    return {
      title: '妆集 · 让每一次练习，都被看见',
      path: '/pages/home/index',
    }
  },

  onShareTimeline() {
    return {
      title: '妆集 · 让每一次练习，都被看见',
    }
  },

  toast(title) {
    wx.showToast({ title, icon: 'none' })
  },
})
