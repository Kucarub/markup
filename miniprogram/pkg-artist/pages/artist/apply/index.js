const request = require('../../../../utils/request')
const { fetchProfile, clearProfileCache } = require('../../../../utils/guard')
const { uploadWorkFile, signWorkUrl, absoluteUrl } = require('../../../../utils/upload')
const { CITIES, STYLE_OPTIONS } = require('../../../../utils/dict')
const subscribe = require('../../../../utils/subscribe')

const DRAFT_KEY = 'artist_apply_draft_v1'
const MAX_STYLES = 3
const MIN_IMAGES = 6
const MAX_WORKS = 9
const ID_CARD_RE = /^\d{17}[\dXx]$/

/** 表单字段 → 页面锚点，用于校验失败定位 */
const FIELD_ANCHOR = {
  name: 'field-name',
  city: 'field-city',
  years: 'field-years',
  styles: 'field-styles',
  idCard: 'field-id-card',
  works: 'field-works',
  agreed: 'field-agreed',
}

Page({
  data: {
    loading: true,
    submitting: false,
    mode: 'create',
    status: '',
    rejectReason: '',
    idCardMasked: '',
    cities: CITIES,
    cityIndex: -1,
    styles: STYLE_OPTIONS.map((item) => ({ ...item, checked: false })),
    form: {
      name: '',
      city: '',
      district: '',
      years: '',
      styles: [],
      intro: '',
      idCard: '',
      agreed: false,
    },
    works: [],
    imageCount: 0,
    videoCount: 0,
    errors: {},
    minImages: MIN_IMAGES,
    maxWorks: MAX_WORKS,
  },

  onLoad() {
    this.draftRestored = false
    this.restoreDraft()
    subscribe.prefetch()
    fetchProfile()
      .then((profile) => {
        if (profile.role !== 'artist') {
          wx.reLaunch({ url: '/pages/auth/role/index' })
          return
        }
        return this.loadExisting()
      })
      .catch(() => {})
      .then(() => this.setData({ loading: false }))
  },

  onUnload() {
    if (this.draftTimer) clearTimeout(this.draftTimer)
  },

  /** 拉取已有入驻资料：有记录即编辑模式，驳回时展示原因并回填 */
  loadExisting() {
    return request
      .get('/api/artist/me', null, { showError: false })
      .then((artist) => {
        if (!artist) return
        this.setData({
          mode: 'edit',
          status: artist.status,
          rejectReason: artist.rejectReason || '',
          idCardMasked: artist.idCardMasked || '',
        })
        if (this.draftRestored) return

        const works = (artist.works || []).map((work) => ({
          key: `file-${work.fileId || work.id}`,
          fileId: work.fileId,
          type: work.type,
          title: work.title || '',
          styles: work.styles || [],
          path: work.path,
          preview: absoluteUrl(work.path),
          status: 'done',
        }))

        this.applyForm(
          {
            name: artist.name,
            city: artist.city,
            district: artist.district || '',
            years: String(artist.years),
            styles: artist.styles || [],
            intro: artist.intro || '',
            idCard: '',
            agreed: false,
          },
          works,
        )
      })
  },

  /** 表单与风格选中态一起更新 */
  applyForm(form, works) {
    const styles = this.data.styles.map((item) => ({
      ...item,
      checked: form.styles.indexOf(item.code) > -1,
    }))
    const cityIndex = this.data.cities.indexOf(form.city)
    this.setData({ form, styles, cityIndex, works: works || this.data.works }, () => this.countWorks())
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    const patch = {}
    patch[`form.${field}`] = value
    patch[`errors.${field}`] = ''
    this.setData(patch)
    this.scheduleDraft()
  },

  onCityChange(event) {
    const index = Number(event.detail.value)
    this.setData({
      cityIndex: index,
      'form.city': this.data.cities[index] || '',
      'errors.city': '',
    })
    this.scheduleDraft()
  },

  toggleStyle(event) {
    const code = event.currentTarget.dataset.code
    const styles = this.data.styles.map((item) => ({ ...item }))
    const target = styles.find((item) => item.code === code)
    if (!target) return

    if (!target.checked && styles.filter((item) => item.checked).length >= MAX_STYLES) {
      wx.showToast({ title: `最多选择 ${MAX_STYLES} 个风格`, icon: 'none' })
      return
    }
    target.checked = !target.checked

    this.setData({
      styles,
      'form.styles': styles.filter((item) => item.checked).map((item) => item.code),
      'errors.styles': '',
    })
    this.scheduleDraft()
  },

  toggleAgreement() {
    this.setData({ 'form.agreed': !this.data.form.agreed, 'errors.agreed': '' })
  },

  /** 选择并立即上传作品；已上传的 fileId 会写进草稿，恢复时不会重复上传 */
  chooseWorks() {
    const remain = MAX_WORKS - this.data.works.length
    if (remain <= 0) {
      wx.showToast({ title: `最多上传 ${MAX_WORKS} 个作品`, icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        ;(res.tempFiles || []).forEach((file, index) => {
          this.addWork(file, `${Date.now()}-${index}`)
        })
      },
    })
  },

  addWork(file, suffix) {
    const key = `local-${suffix}`
    const works = this.data.works.concat([
      {
        key,
        fileId: null,
        type: file.fileType === 'video' ? 'video' : 'image',
        preview: file.tempFilePath,
        status: 'uploading',
      },
    ])
    this.setData({ works, 'errors.works': '' }, () => this.countWorks())

    uploadWorkFile({
      filePath: file.tempFilePath,
      size: file.size,
      mediaType: file.fileType,
    })
      .then((uploaded) => {
        const next = this.data.works.map((item) =>
          item.key === key
            ? {
                ...item,
                fileId: uploaded.fileId,
                type: uploaded.type,
                path: uploaded.path,
                preview: absoluteUrl(uploaded.path),
                status: 'done',
              }
            : item,
        )
        this.setData({ works: next }, () => this.countWorks())
        this.scheduleDraft()
      })
      .catch((error) => {
        const next = this.data.works.filter((item) => item.key !== key)
        this.setData({ works: next }, () => this.countWorks())
        wx.showToast({ title: (error && error.message) || '上传失败，请重试', icon: 'none' })
      })
  },

  removeWork(event) {
    const key = event.currentTarget.dataset.key
    const works = this.data.works.filter((item) => item.key !== key)
    this.setData({ works }, () => this.countWorks())
    this.scheduleDraft()
  },

  countWorks() {
    const done = this.data.works.filter((item) => item.status === 'done')
    this.setData({
      imageCount: done.filter((item) => item.type === 'image').length,
      videoCount: done.filter((item) => item.type === 'video').length,
    })
  },

  /** 草稿：本地缓存表单 + 已上传 fileId（E4-04 断点续填） */
  scheduleDraft() {
    if (this.draftTimer) clearTimeout(this.draftTimer)
    this.draftTimer = setTimeout(() => this.saveDraft(), 300)
  },

  saveDraft() {
    const works = this.data.works
      .filter((item) => item.fileId)
      .map((item) => ({ fileId: item.fileId, type: item.type }))
    // 身份证不落本地缓存（敏感信息仅提交时加密上送），协议勾选每次需重新确认
    wx.setStorageSync(DRAFT_KEY, {
      form: { ...this.data.form, idCard: '', agreed: false },
      works,
      savedAt: Date.now(),
    })
  },

  restoreDraft() {
    const draft = wx.getStorageSync(DRAFT_KEY)
    if (!draft || !draft.form) return
    this.draftRestored = true

    const fallback = (draft.works || []).map((item) => ({
      key: `file-${item.fileId}`,
      fileId: item.fileId,
      type: item.type,
      path: '',
      preview: '',
      status: 'done',
    }))
    this.applyForm({ ...this.data.form, ...draft.form, agreed: false }, fallback)

    // 私有地址 15 分钟过期，恢复草稿时重新换取预览地址
    fallback.forEach((item) => {
      signWorkUrl(item.fileId)
        .then((signed) => {
          const next = this.data.works.map((work) =>
            work.key === item.key
              ? { ...work, path: signed.path, preview: absoluteUrl(signed.path) }
              : work,
          )
          this.setData({ works: next })
        })
        .catch(() => {})
    })
  },

  clearDraft() {
    if (this.draftTimer) clearTimeout(this.draftTimer)
    wx.removeStorageSync(DRAFT_KEY)
  },

  validate() {
    const { form, mode } = this.data
    const errors = {}
    const years = Number(form.years)

    if (!form.name || form.name.trim().length < 2) errors.name = '请填写真实姓名（至少 2 个字）'
    if (!form.city) errors.city = '请选择所在城市'
    if (form.years === '' || !Number.isInteger(years) || years < 0 || years > 60) {
      errors.years = '请填写 0–60 的从业年限'
    }
    if (!form.styles.length) errors.styles = '请至少选择 1 个擅长风格'
    if (mode === 'create' && !form.idCard) errors.idCard = '请填写身份证号'
    if (form.idCard && !ID_CARD_RE.test(form.idCard)) errors.idCard = '身份证号需为 18 位'
    if (this.data.works.some((item) => item.status === 'uploading')) {
      errors.works = '作品仍在上传，请稍候再提交'
    } else if (this.data.imageCount < MIN_IMAGES && this.data.videoCount < 1) {
      errors.works = `请至少上传 ${MIN_IMAGES} 张图片或 1 个视频`
    }
    if (!form.agreed) errors.agreed = '请先阅读并同意入驻协议'

    const fields = Object.keys(errors)
    this.setData({ errors })
    if (fields.length) {
      const first = fields[0]
      wx.pageScrollTo({ selector: `#${FIELD_ANCHOR[first]}`, offsetTop: -120, duration: 200 })
      wx.showToast({ title: errors[first], icon: 'none' })
      return false
    }
    return true
  },

  submit() {
    if (this.data.submitting || this.data.loading) return
    if (!this.validate()) return

    const { form, mode } = this.data
    const payload = {
      name: form.name.trim(),
      city: form.city,
      district: form.district.trim(),
      years: Number(form.years),
      styles: form.styles,
      intro: form.intro.trim(),
      works: this.data.works
        .filter((item) => item.fileId)
        .map((item) => ({
          fileId: item.fileId,
          ...(item.title ? { title: item.title } : {}),
          ...(item.styles && item.styles.length ? { styles: item.styles } : {}),
        })),
      agreed: true,
    }
    if (form.idCard.trim()) payload.idCard = form.idCard.trim()

    this.setData({ submitting: true })
    const task = mode === 'edit' ? request.put('/api/artist/me', payload) : request.post('/api/artist/apply', payload)

    task
      .then(() => {
        this.clearDraft()
        clearProfileCache()
        // 入驻完成引导订阅（E11-01）：拒绝后服务端 7 天内不再弹窗
        return subscribe.ensure(['invitation', 'result']).then(() => {
          wx.showToast({ title: mode === 'edit' ? '资料已更新' : '已提交审核' })
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/apply/status/index' })
          }, 600)
        })
      })
      .catch(() => {})
      .then(() => this.setData({ submitting: false }))
  },

  openAgreement() {
    wx.showToast({ title: '入驻协议页面将在后续版本开放', icon: 'none' })
  },

  previewWork(event) {
    const key = event.currentTarget.dataset.key
    const target = this.data.works.find((item) => item.key === key)
    if (!target || !target.preview) return

    if (target.type === 'video') {
      wx.previewMedia({ sources: [{ url: target.preview, type: 'video' }], showmenu: false })
      return
    }
    const urls = this.data.works
      .filter((item) => item.type === 'image' && item.preview)
      .map((item) => item.preview)
    wx.previewImage({ current: target.preview, urls })
  },
})
