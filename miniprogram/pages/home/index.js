const request = require('../../utils/request')
const { SERVICE_TYPE_LABELS, toDemandCard, monthDay, budgetText } = require('../../utils/demand-card')
const { computeCompleteness } = require('../../utils/profile')
const { getToken, getRole } = require('../../utils/auth')
const { entryGuard, fetchProfile } = require('../../utils/guard')
const { styleLabels } = require('../../utils/dict')
const { absoluteUrl } = require('../../utils/upload')

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const DEFAULT_AVATAR = '/assets/logo.png'

/** 接口 DTO → 客户工作台需求行 */
function toDemandRow(demand) {
  let tone = 'warning'
  if (demand.status === 'closed') tone = 'neutral'
  else if (demand.status === 'selected') tone = 'success'
  else if (demand.responseCount > 0) tone = 'brand'

  return {
    id: demand.id,
    typeLabel: SERVICE_TYPE_LABELS[demand.serviceType] || demand.serviceType || '妆造需求',
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

/** 档期接口数据 → 近 7 天档期条（今天置顶标记） */
function toScheduleDay(item, index) {
  return {
    weekday: index === 0 ? '今天' : `周${WEEKDAY_LABELS[item.weekday] || ''}`,
    day: String(Number(String(item.date).split('-')[2]) || ''),
    state: item.state === 'booked' ? 'booked' : index === 0 ? 'today' : 'available',
  }
}

function currentMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 工作台（按角色区分内容）。
 * - 化妆师：资料卡、统计概览、近期档期、推荐需求（全部来自 /api 真实接口）；
 * - 客户：发布需求入口、我的需求、推荐化妆师。
 */
Page({
  data: {
    /** 'artist' | 'customer'：先用本地缓存渲染，onShow 再用 /auth/me 校正 */
    role: getRole(),
    // 化妆师工作台
    profile: { city: '上海' },
    stats: [],
    schedule: [],
    recommended: [],
    recommendedLoading: true,
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

  /** 校正当前角色，化妆师拉工作台数据，客户拉需求与推荐化妆师 */
  syncRole() {
    return fetchProfile()
      .then((info) => {
        const role = (info && info.role) || getRole()
        if (!role) return
        if (role !== this.data.role) this.setData({ role })
        if (role === 'artist') this.loadArtist(info)
        if (role === 'customer') this.loadCustomer()
      })
      .catch(() => {})
  },

  /** 化妆师工作台：资料卡 / 统计 / 近期档期 / 推荐需求 并行加载 */
  loadArtist(authInfo) {
    this.loadArtistProfile(authInfo)
    this.loadArtistStats()
    this.loadSchedule()
    this.loadRecommended()
  },

  /** 资料卡：/auth/me 提供头像昵称，/artist/me 提供资料与信用等级 */
  loadArtistProfile(authInfo) {
    request
      .get('/api/artist/me', null, { showError: false })
      .then((artist) => {
        const nickname = (authInfo && authInfo.nickname) || ''
        const avatar = absoluteUrl((authInfo && authInfo.avatarUrl) || '') || DEFAULT_AVATAR
        if (!artist) {
          this.setData({
            profile: {
              name: nickname || '化妆师',
              avatar,
              level: '',
              city: '',
              subtitle: '完善个人信息后展示更多',
              completeness: 0,
            },
          })
          return
        }
        this.setData({
          profile: {
            name: artist.name || nickname || '化妆师',
            avatar,
            level: (artist.credit && artist.credit.level) || '',
            city: artist.city || '',
            subtitle: `${artist.years || 0} 年经验 · 作品 ${(artist.works || []).length} 个`,
            completeness: computeCompleteness(artist),
          },
        })
      })
      .catch(() => {})
  },

  /** 统计概览：作品 / 被查看 / 待定向 / 本月服务 */
  loadArtistStats() {
    request
      .get('/api/artist/stats', null, { showError: false })
      .then((stats) => {
        this.setData({
          stats: [
            { value: String(stats.works || 0), label: '作品' },
            { value: String(stats.visits || 0), label: '被查看' },
            { value: String(stats.targeted || 0), label: '待定向' },
            { value: String(stats.monthOrders || 0), label: '本月服务' },
          ],
        })
      })
      .catch(() => {})
  },

  /** 近期档期：取当月起未来 7 天，不足时向下月补齐 */
  loadSchedule() {
    const now = new Date()
    const month = currentMonthKey(now)
    request
      .get('/api/schedule', { month }, { showError: false })
      .then((data) => {
        const upcoming = (data.days || []).filter((day) => !day.isPast)
        if (upcoming.length >= 7) {
          this.setData({ schedule: upcoming.slice(0, 7).map(toScheduleDay) })
          return
        }
        const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        return request
          .get('/api/schedule', { month: currentMonthKey(nextDate) }, { showError: false })
          .then((next) => {
            const merged = upcoming.concat((next.days || []).filter((day) => !day.isPast))
            this.setData({ schedule: merged.slice(0, 7).map(toScheduleDay) })
          })
          .catch(() => this.setData({ schedule: upcoming.slice(0, 7).map(toScheduleDay) }))
      })
      .catch(() => {})
  },

  /** 推荐需求：与需求大厅同一口径，取最近 3 条 */
  loadRecommended() {
    if (this.data.recommended.length) return
    request
      .get('/api/demands', { scope: 'hall', page: 1, size: 3 }, { showError: false })
      .then((data) => {
        this.setData({
          recommended: (data.list || []).map(toDemandCard),
          recommendedLoading: false,
        })
      })
      .catch(() => this.setData({ recommendedLoading: false }))
  },

  loadCustomer() {
    this.loadMyDemands()
    this.loadArtists()
    this.loadCustomerCity()
  },

  /** 顶部城市条：客户资料里的城市（首次调用 /customer/me 自动建档） */
  loadCustomerCity() {
    request
      .get('/api/customer/me', null, { showError: false })
      .then((me) => {
        if (me && me.city) this.setData({ 'profile.city': me.city })
      })
      .catch(() => {})
  },

  loadMyDemands() {
    this.setData({ myDemandsLoading: !this.data.myDemands.length, myDemandsError: '' })
    request
      .get('/api/demands', { scope: 'mine', page: 1, size: 3 }, { showError: false })
      .then((data) => {
        this.setData({
          myDemands: (data.list || []).map(toDemandRow),
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
    wx.navigateTo({ url: '/pkg-artist/pages/artist/schedule/index' })
  },

  onDayTap(event) {
    const { state } = event.currentTarget.dataset
    if (state === 'booked') {
      this.toast('该日期已有预约')
      return
    }
    wx.navigateTo({ url: '/pkg-artist/pages/artist/schedule/index' })
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
      title: '兰妆有约 · 让每一次练习，都被看见',
      path: '/pages/home/index',
    }
  },

  onShareTimeline() {
    return {
      title: '兰妆有约 · 让每一次练习，都被看见',
    }
  },

  toast(title) {
    wx.showToast({ title, icon: 'none' })
  },
})
