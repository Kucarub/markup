const request = require('../../../../utils/request')
const { CITIES, STYLE_OPTIONS } = require('../../../../utils/dict')
const { getToken, redirectToLogin } = require('../../../../utils/auth')
const { businessGuard } = require('../../../../utils/guard')

const MAX_AHEAD_DAYS = 180
const MAX_STYLES = 5
const SERVICE_TYPES = [
  { code: 'bridal', label: '婚礼跟妆' },
  { code: 'daily', label: '日常妆造' },
  { code: 'event', label: '商业活动' },
  { code: 'photo', label: '写真拍摄' },
]

/** 表单字段 → 页面锚点，校验失败时滚动到首个错误 */
const FIELD_ANCHOR = {
  phone: 'field-phone',
  city: 'field-city',
  district: 'field-district',
  serviceDate: 'field-date',
  serviceType: 'field-type',
  headcount: 'field-headcount',
  budget: 'field-budget',
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function toast(title) {
  wx.showToast({ title, icon: 'none' })
}

/**
 * 发布需求（E7-02）。
 * - 必填校验完整，失败时定位首个错误字段；
 * - 预算下限不得高于上限，服务日期最早今天、最远 180 天；
 * - 未绑定手机号不可发布，可就地拉起手机号授权。
 */
Page({
  data: {
    checking: true,
    submitting: false,
    phoneBound: true,
    cities: CITIES,
    cityIndex: -1,
    serviceTypes: SERVICE_TYPES,
    styles: STYLE_OPTIONS.map((item) => ({ ...item, checked: false })),
    today: '',
    maxDate: '',
    maxStyles: MAX_STYLES,
    form: {
      city: '',
      district: '',
      serviceDate: '',
      serviceType: '',
      headcount: '1',
      budgetMin: '',
      budgetMax: '',
      stylePrefs: [],
      remark: '',
    },
    errors: {},
  },

  onLoad() {
    const now = new Date()
    const max = new Date(now.getTime())
    max.setDate(max.getDate() + MAX_AHEAD_DAYS)
    this.setData({ today: dateKey(now), maxDate: dateKey(max) })

    if (!getToken()) {
      redirectToLogin()
      return
    }

    businessGuard()
      .then((ok) => (ok ? request.get('/api/customer/me', null, { showError: false }) : null))
      .then((customer) => {
        if (!customer) return
        const index = CITIES.indexOf(customer.city)
        const patch = { phoneBound: Boolean(customer.phoneBound) }
        if (index > -1 && !this.data.form.city) {
          patch.cityIndex = index
          patch['form.city'] = customer.city
        }
        this.setData(patch)
      })
      .catch(() => {})
      .then(() => this.setData({ checking: false }))
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({
      [`form.${field}`]: event.detail.value,
      [`errors.${field}`]: '',
    })
  },

  onBudgetInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({
      [`form.${field}`]: event.detail.value,
      'errors.budget': '',
    })
  },

  onCityChange(event) {
    const index = Number(event.detail.value)
    this.setData({
      cityIndex: index,
      'form.city': this.data.cities[index] || '',
      'errors.city': '',
    })
  },

  onDateChange(event) {
    this.setData({ 'form.serviceDate': event.detail.value, 'errors.serviceDate': '' })
  },

  onTypeTap(event) {
    this.setData({
      'form.serviceType': event.currentTarget.dataset.code,
      'errors.serviceType': '',
    })
  },

  toggleStyle(event) {
    const code = event.currentTarget.dataset.code
    const styles = this.data.styles.map((item) => ({ ...item }))
    const target = styles.filter((item) => item.code === code)[0]
    if (!target) return

    if (!target.checked && styles.filter((item) => item.checked).length >= MAX_STYLES) {
      toast(`最多选择 ${MAX_STYLES} 个风格`)
      return
    }
    target.checked = !target.checked
    this.setData({
      styles,
      'form.stylePrefs': styles.filter((item) => item.checked).map((item) => item.code),
    })
  },

  onGetPhone(event) {
    const code = event.detail && event.detail.code
    if (!code) {
      toast('未授权手机号，可稍后重试')
      return
    }
    request
      .post('/api/auth/phone', { code })
      .then(() => {
        this.setData({ phoneBound: true, 'errors.phone': '' })
        wx.showToast({ title: '手机号绑定成功', icon: 'success' })
      })
      .catch(() => {})
  },

  validate() {
    const { form, today, phoneBound } = this.data
    const errors = {}
    const headcount = Number(form.headcount)
    const budgetMin = Number(form.budgetMin)
    const budgetMax = Number(form.budgetMax)

    if (!phoneBound) errors.phone = '请先绑定手机号后再发布需求'
    if (!form.city) errors.city = '请选择服务城市'
    if (!form.district.trim()) errors.district = '请填写服务区域'
    if (!form.serviceDate) errors.serviceDate = '请选择服务日期'
    else if (form.serviceDate < today) errors.serviceDate = '服务日期不得早于今天'
    if (!form.serviceType) errors.serviceType = '请选择服务类型'
    if (!form.headcount || !Number.isInteger(headcount) || headcount < 1 || headcount > 50) {
      errors.headcount = '服务人数需为 1–50 的整数'
    }
    if (form.budgetMin === '' || !Number.isInteger(budgetMin) || budgetMin < 0 || budgetMin > 100000) {
      errors.budget = '请填写 0–100000 的预算下限'
    } else if (form.budgetMax === '' || !Number.isInteger(budgetMax) || budgetMax < 0 || budgetMax > 100000) {
      errors.budget = '请填写 0–100000 的预算上限'
    } else if (budgetMin > budgetMax) {
      errors.budget = '预算下限不得高于上限'
    }

    const fields = Object.keys(errors)
    this.setData({ errors })
    if (fields.length) {
      wx.pageScrollTo({ selector: `#${FIELD_ANCHOR[fields[0]]}`, offsetTop: -120, duration: 200 })
      toast(errors[fields[0]])
      return false
    }
    return true
  },

  submit() {
    if (this.data.submitting || this.data.checking) return
    if (!this.validate()) return

    const { form } = this.data
    const payload = {
      city: form.city,
      district: form.district.trim(),
      serviceDate: form.serviceDate,
      serviceType: form.serviceType,
      headcount: Number(form.headcount),
      budgetMin: Number(form.budgetMin),
      budgetMax: Number(form.budgetMax),
      stylePrefs: form.stylePrefs,
      ...(form.remark.trim() ? { remark: form.remark.trim() } : {}),
    }

    this.setData({ submitting: true })
    request
      .post('/api/demands', payload, { showError: false })
      .then((result) => {
        if (result.duplicated) {
          wx.showModal({
            title: '已提交过相同需求',
            content: '5 分钟内相同内容只生成一条需求，可直接查看「我的需求」。',
            showCancel: false,
            success: () => this.goMine(),
          })
          return
        }
        wx.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => this.goMine(), 600)
      })
      .catch((error) => {
        const code = error && error.code
        if (code === 40300) {
          this.setData({ phoneBound: false, 'errors.phone': '请先绑定手机号后再发布需求' }, () => {
            wx.pageScrollTo({ selector: '#field-phone', offsetTop: -120, duration: 200 })
          })
          toast('请先绑定手机号')
          return
        }
        if (code === 42900) {
          wx.showModal({
            title: '今日发布已达上限',
            content: (error && error.message) || '请明天再试',
            showCancel: false,
          })
          return
        }
        toast((error && error.message) || '发布失败，请稍后重试')
      })
      .then(() => this.setData({ submitting: false }))
  },

  goMine() {
    wx.switchTab({ url: '/pages/demand/mine/index' })
  },
})
