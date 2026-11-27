const request = require('../../../../utils/request')
const { fetchProfile, clearProfileCache } = require('../../../../utils/guard')
const { uploadWorkFile, uploadWatermarkFile, absoluteUrl } = require('../../../../utils/upload')
const { chooseMedia, compressImageToLimit, fileSize, IMAGE_LIMIT } = require('../../../../utils/media')
const { makeWatermarkedImage } = require('../../../../utils/watermark')
const { STYLE_OPTIONS } = require('../../../../utils/dict')

const MAX_WORKS = 9
const MAX_STYLES = 8

function buildStyleOptions(selected) {
  return STYLE_OPTIONS.map((item) => ({
    code: item.code,
    label: item.label,
    checked: selected.indexOf(item.code) > -1,
  }))
}

/** 商品页透传的 title / styles 可能已被编码，兼容已解码的情况 */
function safeDecode(value) {
  if (!value) return ''
  const text = String(value)
  if (text.indexOf('%') === -1) return text
  try {
    return decodeURIComponent(text)
  } catch (error) {
    return text
  }
}

/**
 * 作品上传 / 编辑（E5-01 / E5-02）。
 * - 上传模式：批量选择 → 图片压缩至 500KB → 逐张上传并展示进度 → 逐个创建作品；
 * - 编辑模式：回显封面，修改标题与风格。
 */
Page({
  data: {
    loading: true,
    mode: 'create',
    portfolioId: null,
    artistId: null,
    preview: '',
    type: 'image',
    title: '',
    selectedStyles: [],
    styleOptions: buildStyleOptions([]),
    pending: [],
    maxWorks: MAX_WORKS,
    uploading: false,
    uploadProgress: 0,
    saving: false,
  },

  onLoad(query) {
    const portfolioId = query && query.id ? Number(query.id) : null
    const title = safeDecode(query && query.title)
    const styles = safeDecode(query && query.styles)
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean)
    const mode = portfolioId ? 'edit' : 'create'

    this.setData({
      mode,
      portfolioId,
      title,
      selectedStyles: styles,
      styleOptions: buildStyleOptions(styles),
    })

    if (mode === 'edit') {
      this.loadPreview()
      return
    }
    this.resolveArtist()
  },

  /** 上传模式：确认已入驻后再允许选图 */
  resolveArtist() {
    fetchProfile()
      .then((profile) => {
        const artistId = (profile && profile.profileId) || null
        this.setData({ artistId, loading: false })
        if (!artistId) {
          wx.showToast({ title: '请先完善个人信息', icon: 'none' })
        }
      })
      .catch(() => this.setData({ loading: false }))
  },

  /** 编辑模式：列表页只透传标题与风格，封面按 artistId + 作品 id 反查 */
  loadPreview() {
    fetchProfile()
      .then((profile) => {
        const artistId = (profile && profile.profileId) || null
        this.setData({ artistId })
        if (!artistId) return null
        return request.get(
          `/api/artist/${artistId}/portfolios`,
          { page: 1, size: 100 },
          { showError: false },
        )
      })
      .then((data) => {
        if (!data) return
        const found = (data.list || []).filter((item) => item.id === this.data.portfolioId)[0]
        if (found) {
          this.setData({ preview: absoluteUrl(found.path), type: found.type })
        }
      })
      .catch(() => {})
      .then(() => this.setData({ loading: false }))
  },

  findPending(key) {
    return this.data.pending.filter((item) => item.key === key)[0] || null
  },

  patchPending(key, patch) {
    const pending = this.data.pending.map((item) =>
      item.key === key ? Object.assign({}, item, patch) : item,
    )
    this.setData({ pending })
  },

  chooseWorks() {
    if (this.data.uploading) {
      wx.showToast({ title: '正在上传，请稍候', icon: 'none' })
      return
    }
    const remaining = this.data.maxWorks - this.data.pending.length
    if (remaining <= 0) {
      wx.showToast({ title: `最多上传 ${this.data.maxWorks} 个作品`, icon: 'none' })
      return
    }

    chooseMedia({ count: remaining })
      .then((files) => {
        if (!files.length) return null
        const base = Date.now()
        const additions = files.map((file, index) => ({
          key: `pending-${base}-${index}`,
          rawPath: file.path,
          path: file.path,
          size: file.size,
          type: file.type,
          preview: file.type === 'image' ? file.path : '',
          status: 'waiting',
          message: '',
          fileId: null,
          watermarkFileId: null,
          created: false,
        }))
        this.setData({ pending: this.data.pending.concat(additions) })
        return this.processQueue(additions.map((item) => item.key))
      })
      .catch((error) =>
        wx.showToast({ title: (error && error.message) || '选择作品失败', icon: 'none' }),
      )
  },

  async processQueue(keys) {
    if (!keys.length) return
    this.setData({ uploading: true, uploadProgress: 0 })
    let finished = 0
    for (let index = 0; index < keys.length; index += 1) {
      await this.uploadOne(keys[index])
      finished += 1
      this.setData({ uploadProgress: Math.round((finished / keys.length) * 100) })
    }
    this.setData({ uploading: false })
  },

  async uploadOne(key) {
    const target = this.findPending(key)
    if (!target || target.status === 'done' || target.created) return

    try {
      let current = target
      if (current.type === 'image' && !current.fileId) {
        this.patchPending(key, { status: 'compressing' })
        const compressed = await compressImageToLimit(current.rawPath)
        this.patchPending(key, {
          path: compressed.path,
          size: compressed.size,
          preview: compressed.path,
          status: 'uploading',
        })
        if (compressed.size > IMAGE_LIMIT) {
          wx.showToast({ title: '图片仍超过 500KB，已按最高压缩上传', icon: 'none' })
        }
        current = this.findPending(key)
      } else if (!current.fileId) {
        this.patchPending(key, { status: 'uploading' })
        current = this.findPending(key)
      }

      if (!current.fileId) {
        const uploaded = await uploadWorkFile({
          filePath: current.path,
          size: current.size,
          mediaType: current.type,
        })
        this.patchPending(key, { fileId: uploaded.fileId, path: uploaded.path })
        current = this.findPending(key)
      }

      // 水印生成（E14-02）：原图上传成功后叠加平铺水印并上传副本，对外展示用水印版本；
      // 失败标记 error 可重试（重试时原图 fileId 已存在，不会重复上传）
      if (current.type === 'image' && !current.watermarkFileId) {
        this.patchPending(key, { status: 'watermarking' })
        const profile = await fetchProfile().catch(() => null)
        const text = `${(profile && profile.nickname) || '兰妆有约'} · 兰妆有约`
        const wmPath = await makeWatermarkedImage(current.path, text)
        const wmSize = await fileSize(wmPath)
        const watermark = await uploadWatermarkFile(wmPath, wmSize)
        this.patchPending(key, { watermarkFileId: watermark.fileId, status: 'done' })
      } else {
        this.patchPending(key, { status: 'done' })
      }
    } catch (error) {
      this.patchPending(key, {
        status: 'error',
        message: (error && error.message) || '上传失败',
      })
    }
  },

  onPendingTap(event) {
    const key = event.currentTarget.dataset.key
    const item = this.findPending(key)
    if (!item) return
    if (item.status === 'error') {
      this.patchPending(key, { status: 'waiting', message: '' })
      this.processQueue([key])
      return
    }
    if (item.status === 'done' && item.type === 'image') {
      wx.previewImage({ current: item.path, urls: [item.path] })
    }
  },

  removePending(event) {
    const key = event.currentTarget.dataset.key
    const item = this.findPending(key)
    if (!item) return
    if (item.status === 'uploading' || item.status === 'compressing' || item.status === 'watermarking') {
      wx.showToast({ title: '上传中，请稍候', icon: 'none' })
      return
    }
    this.setData({ pending: this.data.pending.filter((entry) => entry.key !== key) })
  },

  onTitleInput(event) {
    this.setData({ title: event.detail.value })
  },

  toggleStyle(event) {
    const code = event.currentTarget.dataset.code
    const selected = this.data.selectedStyles.slice()
    const index = selected.indexOf(code)
    if (index > -1) {
      selected.splice(index, 1)
    } else {
      if (selected.length >= MAX_STYLES) {
        wx.showToast({ title: `最多选择 ${MAX_STYLES} 个风格`, icon: 'none' })
        return
      }
      selected.push(code)
    }
    this.setData({ selectedStyles: selected, styleOptions: buildStyleOptions(selected) })
  },

  submit() {
    if (this.data.saving) return
    if (this.data.mode === 'edit') {
      this.saveEdit()
      return
    }
    this.saveCreate()
  },

  async saveCreate() {
    if (this.data.uploading) {
      wx.showToast({ title: '作品上传中，请稍候', icon: 'none' })
      return
    }
    const failed = this.data.pending.filter((item) => item.status === 'error')
    if (failed.length) {
      wx.showToast({ title: '有作品上传失败，请点击重试', icon: 'none' })
      return
    }
    const done = this.data.pending.filter(
      (item) => item.status === 'done' && item.fileId && !item.created,
    )
    if (!done.length) {
      wx.showToast({ title: '请先选择并上传作品', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    let created = 0
    try {
      for (let index = 0; index < done.length; index += 1) {
        const item = done[index]
        const payload = { fileId: item.fileId }
        if (item.watermarkFileId) payload.watermarkFileId = item.watermarkFileId
        const title = this.data.title.trim()
        if (title) payload.title = title
        if (this.data.selectedStyles.length) payload.styles = this.data.selectedStyles
        await request.post('/api/portfolio', payload, { showError: false })
        this.patchPending(item.key, { created: true })
        created += 1
      }
      clearProfileCache()
      wx.showToast({ title: `已添加 ${created} 个作品` })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  async saveEdit() {
    const title = this.data.title.trim()
    if (!title) {
      wx.showToast({ title: '请填写作品标题', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      await request.put(
        `/api/portfolio/${this.data.portfolioId}`,
        { title, styles: this.data.selectedStyles },
        { showError: false },
      )
      clearProfileCache()
      wx.showToast({ title: '已保存' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
