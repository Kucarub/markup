const request = require('../../../../utils/request')
const { track } = require('../../../../utils/track')
const { absoluteUrl } = require('../../../../utils/upload')
const { CITIES, STYLE_OPTIONS, styleLabels } = require('../../../../utils/dict')

const PAGE_SIZE = 10
/** 空结果时引导联系运营，上线前替换为真实微信号 */
const OPS_WECHAT = 'zhuangji_kefu'

const RADIUS_OPTIONS = [
  { value: 3, label: '3km' },
  { value: 5, label: '5km' },
  { value: 10, label: '10km' },
]

const YEARS_OPTIONS = [
  { value: 0, label: '不限' },
  { value: 3, label: '3 年以上' },
  { value: 5, label: '5 年以上' },
  { value: 8, label: '8 年以上' },
]

const EMPTY_SUGGESTIONS = [
  '换一个区域或邻近城市再试试',
  '关注化妆师档期更新，稍后再来看看',
  '联系运营获取人工推荐',
]

function pad(value) {
  return value < 10 ? `0${value}` : `${value}`
}

function todayText() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function monthDay(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

function emptyFilters() {
  return { city: '', styles: [], date: '', radiusKm: 0, yearsMin: 0 }
}

function cloneFilters(filters) {
  return {
    city: filters.city,
    styles: filters.styles.slice(),
    date: filters.date,
    radiusKm: filters.radiusKm,
    yearsMin: filters.yearsMin,
  }
}

/** 接口 DTO → 卡片展示模型（E8-05） */
function toCard(item) {
  return {
    id: item.id,
    name: item.name,
    city: item.city,
    district: item.district,
    years: item.years,
    styles: styleLabels(item.styles),
    cover: item.coverPath ? absoluteUrl(item.coverPath) : '',
    distanceText:
      item.distanceKm === null || item.distanceKm === undefined ? '' : `${item.distanceKm}km`,
    availText: item.nextAvailableDate
      ? `最早可约 ${monthDay(item.nextAvailableDate)}`
      : '档期待更新',
    worksTotal: item.worksTotal || 0,
    intro: item.intro || '',
  }
}

/** 已生效筛选 → 顶部回显 chip（E8-06） */
function buildChips(filters) {
  const chips = []
  if (filters.city) chips.push({ key: 'city', label: filters.city })
  filters.styles.forEach((code) => {
    const matched = STYLE_OPTIONS.filter((item) => item.code === code)[0]
    chips.push({ key: `style:${code}`, label: matched ? matched.label : code })
  })
  if (filters.date) chips.push({ key: 'date', label: monthDay(filters.date) })
  if (filters.radiusKm) chips.push({ key: 'radiusKm', label: `距离 ${filters.radiusKm}km` })
  if (filters.yearsMin) chips.push({ key: 'yearsMin', label: `${filters.yearsMin} 年以上` })
  return chips
}

/** 面板选项的选中态在 JS 预算，WXML 不支持 indexOf 等方法调用 */
function buildOptionState(filters) {
  return {
    cityOptions: CITIES.map((city) => ({ label: city, active: filters.city === city })),
    styleOptions: STYLE_OPTIONS.map((item) => ({
      code: item.code,
      label: item.label,
      active: filters.styles.indexOf(item.code) > -1,
    })),
    radiusOptions: RADIUS_OPTIONS.map((item) => ({
      value: item.value,
      label: item.label,
      active: filters.radiusKm === item.value,
    })),
    yearsOptions: YEARS_OPTIONS.map((item) => ({
      value: item.value,
      label: item.label,
      active: filters.yearsMin === item.value,
    })),
  }
}

/**
 * 找化妆师（E8-05 / E8-06 / E8-07）。
 * - 仅返回已通过审核的化妆师；指定日期只返回该日可接的人；
 * - 城市 / 风格多选 / 档期日期 / 距离 3-5-10km / 年限，条件可回显并一键重置；
 * - 距离筛选需授权定位，未授权时不做距离过滤并给出提示；
 * - 空结果给出 3 条放宽建议，并可一键复制运营联系方式。
 */
Page({
  data: {
    today: '',
    filters: emptyFilters(),
    chips: [],
    panelOpen: false,
    draft: emptyFilters(),
    ...buildOptionState(emptyFilters()),
    list: [],
    total: 0,
    page: 1,
    loading: true,
    loadingMore: false,
    hasMore: false,
    error: '',
    suggestions: [],
  },

  onLoad() {
    this.location = null
    this.setData({ today: todayText() })
    this.fetchPage(1)
  },

  onPullDownRefresh() {
    this.fetchPage(1).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return
    this.fetchPage(this.data.page + 1)
  },

  async fetchPage(page) {
    if (page > 1) this.setData({ loadingMore: true })
    else this.setData({ loading: true, error: '' })

    const { filters } = this.data
    const params = { page, size: PAGE_SIZE }
    if (filters.city) params.city = filters.city
    if (filters.styles.length) params.styles = filters.styles.join(',')
    if (filters.date) params.date = filters.date
    if (filters.yearsMin) params.yearsMin = filters.yearsMin
    if (filters.radiusKm && this.location) {
      params.radiusKm = filters.radiusKm
      params.lat = this.location.lat
      params.lng = this.location.lng
    }

    try {
      const data = await request.get('/api/search/artists', params, { showError: false })
      const mapped = (data.list || []).map(toCard)
      const list = page > 1 ? this.data.list.concat(mapped) : mapped
      const total = data.total || 0
      const empty = list.length === 0
      this.setData({
        list,
        total,
        page,
        hasMore: list.length < total,
        loading: false,
        loadingMore: false,
        suggestions: empty ? this.buildSuggestions() : [],
      })
      if (page === 1) {
        track('search_artists', {
          city: filters.city || 'all',
          styles: filters.styles.length ? filters.styles.join(',') : 'all',
          date: filters.date || 'all',
          radiusKm: filters.radiusKm || 0,
          yearsMin: filters.yearsMin || 0,
          resultCount: total,
        })
      }
    } catch (error) {
      this.setData({
        loading: false,
        loadingMore: false,
        error: (error && error.message) || '加载失败，请下拉重试',
      })
    }
  },

  /** 空结果放宽建议（E8-07）：按当前条件给出 3 条可执行建议 */
  buildSuggestions() {
    const { filters } = this.data
    const list = []
    if (filters.radiusKm) list.push('把距离放宽到 10km，覆盖更多同城化妆师')
    if (filters.styles.length) list.push('减少风格标签，改为全部风格')
    if (filters.yearsMin) list.push('放宽从业年限要求')
    if (filters.date) list.push('更换服务日期，或暂不指定档期')
    if (filters.city) list.push('尝试邻近城市，或清除城市限制')
    EMPTY_SUGGESTIONS.forEach((item) => {
      if (list.length < 3) list.push(item)
    })
    return list.slice(0, 3)
  },

  /* ---------- 筛选面板 ---------- */

  onTogglePanel() {
    const panelOpen = !this.data.panelOpen
    if (!panelOpen) {
      this.setData({ panelOpen })
      return
    }
    const draft = cloneFilters(this.data.filters)
    this.setData({ panelOpen, draft, ...buildOptionState(draft) })
  },

  onDraftCity(event) {
    const { city } = event.currentTarget.dataset
    const draft = cloneFilters(this.data.draft)
    draft.city = draft.city === city ? '' : city
    this.setData({ draft, ...buildOptionState(draft) })
  },

  onDraftStyle(event) {
    const { code } = event.currentTarget.dataset
    const draft = cloneFilters(this.data.draft)
    const index = draft.styles.indexOf(code)
    if (index > -1) draft.styles.splice(index, 1)
    else {
      if (draft.styles.length >= 5) {
        wx.showToast({ title: '最多选择 5 个风格', icon: 'none' })
        return
      }
      draft.styles.push(code)
    }
    this.setData({ draft, ...buildOptionState(draft) })
  },

  onDraftDate(event) {
    const draft = { ...this.data.draft, date: event.detail.value }
    this.setData({ draft, ...buildOptionState(draft) })
  },

  onClearDraftDate() {
    const draft = { ...this.data.draft, date: '' }
    this.setData({ draft, ...buildOptionState(draft) })
  },

  async onDraftRadius(event) {
    const value = Number(event.currentTarget.dataset.value)
    if (this.data.draft.radiusKm === value) {
      const draft = { ...this.data.draft, radiusKm: 0 }
      this.setData({ draft, ...buildOptionState(draft) })
      return
    }
    const location = await this.ensureLocation()
    if (!location) {
      wx.showToast({ title: '未获取位置，无法按距离筛选', icon: 'none' })
      return
    }
    const draft = { ...this.data.draft, radiusKm: value }
    this.setData({ draft, ...buildOptionState(draft) })
  },

  onDraftYears(event) {
    const value = Number(event.currentTarget.dataset.value)
    const yearsMin = this.data.draft.yearsMin === value ? 0 : value
    const draft = { ...this.data.draft, yearsMin }
    this.setData({ draft, ...buildOptionState(draft) })
  },

  onReset() {
    const filters = emptyFilters()
    const draft = cloneFilters(filters)
    this.setData({
      filters,
      draft,
      ...buildOptionState(draft),
      chips: [],
      panelOpen: false,
      list: [],
    })
    this.fetchPage(1)
  },

  onApply() {
    const filters = cloneFilters(this.data.draft)
    if (filters.radiusKm && !this.location) {
      wx.showToast({ title: '未获取位置，无法按距离筛选', icon: 'none' })
      return
    }
    this.setData({
      filters,
      ...buildOptionState(filters),
      chips: buildChips(filters),
      panelOpen: false,
      list: [],
      page: 1,
    })
    this.fetchPage(1)
  },

  /** 顶部 chip 直接移除某一条件（E8-06 条件回显） */
  onRemoveChip(event) {
    const { key } = event.currentTarget.dataset
    const filters = cloneFilters(this.data.filters)
    if (key === 'city') filters.city = ''
    else if (key === 'date') filters.date = ''
    else if (key === 'radiusKm') filters.radiusKm = 0
    else if (key === 'yearsMin') filters.yearsMin = 0
    else if (key.indexOf('style:') === 0) {
      filters.styles = filters.styles.filter((code) => code !== key.slice(6))
    }
    this.setData({ filters, chips: buildChips(filters), list: [] })
    this.fetchPage(1)
  },

  /** 授权定位（仅用于距离筛选），失败静默降级 */
  ensureLocation() {
    if (this.location) return Promise.resolve(this.location)
    return new Promise((resolve) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.location = { lat: res.latitude, lng: res.longitude }
          resolve(this.location)
        },
        fail: () => resolve(null),
      })
    })
  },

  /* ---------- 列表与空态 ---------- */

  onArtistTap(event) {
    const artistId = Number(event.currentTarget.dataset.id)
    if (!artistId) return
    track('artist_card_click', { artistId, from: 'search_list' })
    wx.navigateTo({ url: `/pages/artist/detail/index?id=${artistId}` })
  },

  onCopyOps() {
    wx.setClipboardData({
      data: OPS_WECHAT,
      success: () => wx.showToast({ title: '运营微信已复制', icon: 'none' }),
    })
  },
})
