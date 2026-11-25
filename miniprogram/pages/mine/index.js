const { profile, mineMenu } = require('../../data/mock')
const { clearAuth, getRole, getUserId, getToken } = require('../../utils/auth')
const { entryGuard, clearProfileCache, fetchProfile } = require('../../utils/guard')
const request = require('../../utils/request')
const subscribe = require('../../utils/subscribe')

/** 「关于我们」暂不上线：先从菜单隐藏，数据保留便于恢复 */
const MENU = mineMenu.filter((item) => item.key !== 'about')

/** 化妆师专属入口：客户身份不再展示，避免越权进入接单中心 / 档期管理 */
const ARTIST_ONLY = ['deliveries', 'schedule', 'skills', 'level']

const ROLE_MENU = { key: 'role', label: '切换身份', icon: 'users', separator: true }

/** 化妆师工作台统计（mock）；客户不展示，改为工作台内的需求入口 */
const ARTIST_STATS = [
  { key: 'works', value: '12', label: '作品' },
  { key: 'favorites', value: '8', label: '收藏' },
  { key: 'posted', value: '5', label: '投递' },
]

/** 按角色裁剪菜单：仅化妆师保留接单中心 / 档期管理 / 技能认证 / 我的等级 */
function menuFor(role) {
  const items = MENU.filter((item) => role === 'artist' || ARTIST_ONLY.indexOf(item.key) === -1)
  return items.concat([ROLE_MENU])
}

Page({
  data: {
    profile,
    menu: menuFor(getRole()),
    isArtist: getRole() === 'artist',
    profileCompleted: false,
    credit: null,
    stats: getRole() === 'artist' ? ARTIST_STATS : [],
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

  /** 按登录角色裁剪菜单：客户隐藏化妆师专属入口与统计 */
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
        this.setData({
          isArtist,
          profileCompleted,
          menu,
          stats: isArtist ? ARTIST_STATS : [],
        })
        return profileInfo
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
    if (key === 'works') {
      // 作品集为化妆师专属页面，客户不可跳转
      if (!this.data.isArtist) return
      wx.switchTab({ url: '/pages/portfolio/list/index' })
      return
    }
    if (key === 'favorites') {
      this.toast('你收藏了 8 条需求')
      return
    }
    this.toast('本月已投递 5 次')
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
