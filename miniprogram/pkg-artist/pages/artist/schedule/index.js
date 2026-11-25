const request = require('../../../../utils/request')
const { fetchProfile } = require('../../../../utils/guard')
const { getToken } = require('../../../../utils/auth')

/**
 * 档期日历（E6-01 / E6-02）。
 * - 月视图按整月渲染，未设置视为 none（客户视角不可接）；
 * - 点选日期在 ActionSheet 里切换 可接 / 休息 / 清空，保存后本地即时刷新；
 * - booked 由订单占用，只读，手工改动会被服务端拒绝。
 */

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const STATE_LABELS = { available: '可接', booked: '已排', rest: '休息', none: '未设置' }
const STATE_ACTIONS = [
  { label: '设为可接单', state: 'available' },
  { label: '设为休息', state: 'rest' },
  { label: '清空设置', state: 'none' },
]
const MAX_MONTH_OFFSET = 6

function pad(value) {
  return String(value).padStart(2, '0')
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function toast(title) {
  wx.showToast({ title, icon: 'none' })
}

Page({
  data: {
    loading: true,
    error: '',
    year: 0,
    month: 0,
    cells: [],
    days: [],
    summary: { available: 0, booked: 0, rest: 0, none: 0 },
    settable: { minDate: '', maxDate: '' },
    canPrev: false,
    canNext: true,
    batchOpen: false,
    batchSaving: false,
    batchStart: '',
    batchEnd: '',
    weekdayOptions: [
      { value: 0, label: '日', active: true },
      { value: 1, label: '一', active: true },
      { value: 2, label: '二', active: true },
      { value: 3, label: '三', active: true },
      { value: 4, label: '四', active: true },
      { value: 5, label: '五', active: true },
      { value: 6, label: '六', active: true },
    ],
    batchState: 'available',
    weekLabels: WEEK_LABELS,
  },

  onLoad() {
    const now = new Date()
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 })
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  async load() {
    if (!this.data.year) return
    this.setData({ loading: true, error: '' })

    if (!getToken()) {
      this.setData({ loading: false, error: '登录后才能维护档期' })
      return
    }

    try {
      const profile = await fetchProfile(true)
      if (!profile || profile.role !== 'artist') {
        this.setData({ loading: false, error: '仅化妆师可维护档期' })
        return
      }

      const month = `${this.data.year}-${pad(this.data.month)}`
      const data = await request.get('/api/schedule', { month }, { showError: false })
      this.applyMonth(data)
    } catch (error) {
      this.setData({ loading: false, error: (error && error.message) || '档期加载失败' })
    }
  },

  applyMonth(data) {
    const today = todayKey()
    const leading = data.days.length ? data.days[0].weekday : 0
    const cells = []
    for (let index = 0; index < leading; index += 1) {
      cells.push({ key: `blank-${index}`, blank: true })
    }
    data.days.forEach((day) => {
      cells.push({
        key: day.date,
        blank: false,
        date: day.date,
        day: Number(day.date.slice(8)),
        state: day.state,
        isPast: day.isPast,
        isToday: day.date === today,
      })
    })

    const now = new Date()
    const currentIndex = now.getFullYear() * 12 + now.getMonth()
    const index = this.data.year * 12 + (this.data.month - 1)

    this.setData({
      loading: false,
      error: '',
      days: data.days,
      cells,
      summary: data.summary,
      settable: data.settable,
      canPrev: index > currentIndex,
      canNext: index < currentIndex + MAX_MONTH_OFFSET,
      batchStart: this.data.batchStart || data.settable.minDate,
      batchEnd: this.data.batchEnd || data.settable.minDate,
    })
  },

  /** 本地更新某天状态，避免整月重载造成日历闪烁 */
  renderDays(days) {
    const today = todayKey()
    const summary = { available: 0, booked: 0, rest: 0, none: 0 }
    days.forEach((day) => {
      summary[day.state] = (summary[day.state] || 0) + 1
    })
    const cells = this.data.cells.map((cell) => {
      if (cell.blank) return cell
      const next = days.find((day) => day.date === cell.date)
      return next ? { ...cell, state: next.state, isToday: cell.date === today } : cell
    })
    this.setData({ days, cells, summary })
  },

  prevMonth() {
    if (!this.data.canPrev) return
    const month = this.data.month === 1 ? 12 : this.data.month - 1
    const year = this.data.month === 1 ? this.data.year - 1 : this.data.year
    this.setData({ year, month })
    this.load()
  },

  nextMonth() {
    if (!this.data.canNext) return
    const month = this.data.month === 12 ? 1 : this.data.month + 1
    const year = this.data.month === 12 ? this.data.year + 1 : this.data.year
    this.setData({ year, month })
    this.load()
  },

  onDayTap(event) {
    const { date, state, isPast } = event.currentTarget.dataset
    if (!date) return
    if (isPast) {
      toast('过去的日期不可修改')
      return
    }
    if (state === 'booked') {
      toast('该日已被订单占用，需先处理对应订单')
      return
    }

    wx.showActionSheet({
      itemList: STATE_ACTIONS.map((item) => item.label),
      success: (res) => {
        const action = STATE_ACTIONS[res.tapIndex]
        if (!action) return
        this.saveDay(date, action.state)
      },
    })
  },

  async saveDay(date, state) {
    wx.showLoading({ title: '保存中', mask: true })
    try {
      await request.put('/api/schedule', { date, state })
      const days = this.data.days.map((day) => (day.date === date ? { ...day, state } : day))
      this.renderDays(days)
      wx.hideLoading()
      wx.showToast({ title: `已设为${STATE_LABELS[state]}`, icon: 'none' })
    } catch (error) {
      wx.hideLoading()
    }
  },

  toggleBatch() {
    this.setData({ batchOpen: !this.data.batchOpen })
  },

  onBatchStartChange(event) {
    this.setData({ batchStart: event.detail.value })
  },

  onBatchEndChange(event) {
    this.setData({ batchEnd: event.detail.value })
  },

  onWeekdayTap(event) {
    const weekday = Number(event.currentTarget.dataset.weekday)
    const options = this.data.weekdayOptions.map((item) =>
      item.value === weekday ? { ...item, active: !item.active } : item,
    )
    if (!options.some((item) => item.active)) {
      toast('至少保留一个星期')
      return
    }
    this.setData({ weekdayOptions: options })
  },

  onBatchStateTap(event) {
    this.setData({ batchState: event.currentTarget.dataset.state })
  },

  async submitBatch() {
    const { batchStart, batchEnd, weekdayOptions, batchState } = this.data
    const weekdays = weekdayOptions.filter((item) => item.active).map((item) => item.value)
    if (!batchStart || !batchEnd) {
      toast('请选择日期段')
      return
    }
    if (batchStart > batchEnd) {
      toast('结束日期不能早于开始日期')
      return
    }
    if (!weekdays.length) {
      toast('请至少选择一个星期')
      return
    }

    this.setData({ batchSaving: true })
    try {
      const result = await request.put('/api/schedule/batch', {
        startDate: batchStart,
        endDate: batchEnd,
        weekdays,
        state: batchState,
      })
      const skipped = result.skipped ? `，跳过 ${result.skipped} 天已占用` : ''
      toast(`已更新 ${result.updated} 天${skipped}`)
      this.setData({ batchOpen: false })
      this.load()
    } finally {
      this.setData({ batchSaving: false })
    }
  },

  onGoApply() {
    if (!getToken()) {
      wx.switchTab({ url: '/pages/mine/index' })
      return
    }
    wx.redirectTo({ url: '/pkg-artist/pages/artist/apply/index' })
  },
})
