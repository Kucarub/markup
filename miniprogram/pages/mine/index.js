const { mineMenu } = require('../../data/menu')
const { clearAuth, getRole, getUserId, getToken } = require('../../utils/auth')
const { entryGuard, clearProfileCache, fetchProfile } = require('../../utils/guard')
const { chooseMedia, compressImageToLimit } = require('../../utils/media')
const { computeCompleteness } = require('../../utils/profile')
const request = require('../../utils/request')
const subscribe = require('../../utils/subscribe')
const { absoluteUrl, uploadAvatarFile } = require('../../utils/upload')

const DEFAULT_AVATAR = '/assets/logo.png'

/** 「关于我们」暂不上线：先从菜单隐藏，数据保留便于恢复 */
const MENU = mineMenu.filter((item) => item.key !== 'about')

/** 化妆师专属入口：客户身份不再展示，避免越权进入接单中心 / 档期管理 */
const ARTIST_ONLY = ['deliveries', 'schedule', 'skills', 'level']

const ROLE_MENU = { key: 'role', label: '切换身份', icon: 'users', separator: true }

/** 按角色裁剪菜单：仅化妆师保留接单中心 / 档期管理 / 技能认证 / 我的等级 */
function menuFor(role) {
  const items = MENU.filter((item) => role === 'artist' || ARTIST_ONLY.indexOf(item.key) === -1)
  return items.concat([ROLE_MENU])
}

Page({
  data: {
    profile: { name: '', avatar: DEFAULT_AVATAR, city: '', completeness: 0 },
    menu: menuFor(getRole()),
    isArtist: getRole() === 'artist',
    profileCompleted: false,
    credit: null,
    stats: [],
    avatarUploading: false,
  },

  onShow() {
    // 切换身份后角色可能变化：每次页面显示都让底部导航按最新角色重建
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().refresh()
    }
    entryGuard()
      .then(() => this.loadProfile())
      .then(() => this.loadCredit())
  },

  /** 按登录角色裁剪菜单，化妆师额外拉取资料与统计 */
  loadProfile() {
    if (!getToken()) return Promise.resolve(null)
    return fetchProfile()
      .then((profileInfo) => {
        const isArtist = profileInfo.role === 'artist'
        const profileCompleted = Boolean(profileInfo.profileCompleted)
        const baseMenu = menuFor(profileInfo.role)
        const menu = isArtist
          ? [
              {
                key: 'profile',
                label: '完善个人信息',
                icon: 'file-check',
                note: profileCompleted ? '已完善' : '待完善',
              },
            ].concat(baseMenu)
          : baseMenu
        this.setData({ isArtist, profileCompleted, menu })
        return profileInfo
      })
      .then((profileInfo) => this.loadDisplayProfile(profileInfo))
      .catch(() => null)
  },

  /** 资料卡：昵称头像来自 /auth/me，化妆师姓名/城市/完整度来自 /artist/me */
  loadDisplayProfile(profileInfo) {
    const base = {
      name: (profileInfo && profileInfo.nickname) || '用户',
      avatar: absoluteUrl((profileInfo && profileInfo.avatarUrl) || '') || DEFAULT_AVATAR,
      city: '',
      completeness: 0,
    }
    if (!this.data.isArtist) {
      this.setData({ profile: base, stats: [] })
      return null
    }
    return request
      .get('/api/artist/me', null, { showError: false })
      .then((artist) => {
        if (!artist) {
          this.setData({ profile: { ...base, name: base.name || '化妆师' }, stats: [] })
          return null
        }
        this.setData({
          profile: {
            name: artist.name || base.name,
            avatar: base.avatar,
            city: artist.city || '未填写',
            completeness: computeCompleteness(artist),
          },
        })
        return this.loadArtistStats()
      })
      .catch(() => this.setData({ profile: base }))
  },

  /** 化妆师统计：作品 / 被查看 / 累计投递（真实口径见 /api/artist/stats） */
  loadArtistStats() {
    return request
      .get('/api/artist/stats', null, { showError: false })
      .then((stats) => {
        this.setData({
          stats: [
            { key: 'works', value: String(stats.works || 0), label: '作品' },
            { key: 'visits', value: String(stats.visits || 0), label: '被查看' },
            { key: 'posted', value: String(stats.responses || 0), label: '投递' },
          ],
        })
        return stats
      })
      .catch(() => null)
  },

  /** 信用分（E10-07）：公开接口，按本地缓存的 userId 查询 */
  loadCredit() {
    const userId = getUserId()
    if (!getToken() || !userId) return Promise.resolve(null)
    return request
      .get(`/api/credit/${userId}`, null, { showError: false })
      .then((credit) => {
        this.setData({ credit })
        return credit
      })
      .catch(() => null)
  },

  /** 点击头像更换：选图 → 压缩 → 上传 → 写回资料并刷新本地缓存 */
  onAvatarTap() {
    if (this.data.avatarUploading) return
    chooseMedia({ count: 1, mediaType: ['image'] })
      .then((files) => {
        if (!files.length) return null
        this.setData({ avatarUploading: true })
        return compressImageToLimit(files[0].path).then((compressed) =>
          uploadAvatarFile(compressed.path, compressed.size),
        )
      })
      .then((uploaded) => {
        if (!uploaded) return null
        return request
          .put('/api/auth/avatar', { fileId: uploaded.fileId }, { showError: false })
          .then((profile) => {
            // 资料缓存 30s，头像变更后立即失效并回填本地展示
            clearProfileCache()
            this.setData({
              avatarUploading: false,
              'profile.avatar': absoluteUrl(profile.avatarUrl) || DEFAULT_AVATAR,
            })
            wx.showToast({ title: '头像已更新', icon: 'success' })
            return profile
          })
      })
      .catch((error) => {
        this.setData({ avatarUploading: false })
        wx.showToast({ title: (error && error.message) || '头像上传失败', icon: 'none' })
      })
  },

  onEditProfile() {
    if (this.data.isArtist) {
      wx.navigateTo({ url: '/pkg-artist/pages/artist/apply/index' })
      return
    }
    this.toast('客户资料编辑功能将在下一版本开放')
  },

  onCreditTap() {
    wx.navigateTo({ url: '/pages/order/records/index' })
  },

  onStatTap(event) {
    const { key } = event.currentTarget.dataset
    const stat = this.data.stats.filter((item) => item.key === key)[0]
    if (key === 'works') {
      // 作品集为化妆师专属页面，客户不可跳转
      if (!this.data.isArtist) return
      wx.switchTab({ url: '/pages/portfolio/list/index' })
      return
    }
    if (key === 'visits') {
      this.toast(`主页累计被查看 ${stat ? stat.value : 0} 次`)
      return
    }
    if (key === 'posted') {
      wx.navigateTo({ url: '/pages/order/list/index' })
      return
    }
    this.toast('统计功能将在下一版本开放')
  },

  onMenuTap(event) {
    const { key, label } = event.currentTarget.dataset
    if (key === 'profile') {
      wx.navigateTo({ url: '/pkg-artist/pages/artist/apply/index' })
      return
    }
    if (key === 'role') {
      wx.navigateTo({ url: '/pages/auth/role/index' })
      return
    }
    if (key === 'deliveries') {
      wx.navigateTo({ url: '/pages/order/list/index' })
      return
    }
    if (key === 'records') {
      wx.navigateTo({ url: '/pages/order/records/index' })
      return
    }
    if (key === 'notifications') {
      wx.navigateTo({ url: '/pages/notification/list/index' })
      return
    }
    if (key === 'schedule') {
      wx.navigateTo({ url: '/pkg-artist/pages/artist/schedule/index' })
      return
    }
    if (key === 'about') {
      wx.navigateTo({ url: '/pages/settings/index/index' })
      return
    }
    this.toast(`${label}功能将在下一版本开放`)
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (!res.confirm) return
        clearAuth()
        clearProfileCache()
        subscribe.reset()
        wx.reLaunch({ url: '/pages/auth/login/index' })
      },
    })
  },

  /** 分享小程序：好友点开进入工作台 */
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
