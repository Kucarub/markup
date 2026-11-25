const request = require('../../../utils/request')
const { getToken } = require('../../../utils/auth')
const { businessGuard, fetchProfile } = require('../../../utils/guard')
const { absoluteUrl } = require('../../../utils/upload')
const { styleLabels } = require('../../../utils/dict')

const PAGE_SIZE = 12

/**
 * 作品管理列表（E5-02 / E5-03 / E5-07）。
 * - 分页拉取，顺序与首页瀑布流一致（sort 升序）；
 * - 长按作品可编辑 / 上移 / 下移 / 删除；
 * - 首屏骨架屏 + 图片懒加载。
 */
Page({
  data: {
    loading: true,
    artistId: null,
    list: [],
    page: 1,
    total: 0,
    hasMore: false,
    loadingMore: false,
    counts: { image: 0, video: 0, minImages: 6 },
    belowThreshold: false,
  },

  onShow() {
    // 切换身份后角色可能变化：每次页面显示都让底部导航按最新角色重建
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().refresh()
    }
    this.load()
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return
    this.fetchPage(this.data.page + 1, true)
  },

  /** 守卫 + 当前 artistId + 首屏数据 */
  load(fromPullDown) {
    return businessGuard()
      .then((ok) => {
        if (!ok) {
          this.setData({ loading: false })
          return null
        }
        return fetchProfile()
      })
      .then((profile) => {
        if (!profile) return null
        // 作品集为化妆师专属：客户越权进入时退回「我的」
        if (profile.role !== 'artist') {
          this.setData({ loading: false, list: [], total: 0, hasMore: false })
          wx.switchTab({
            url: '/pages/mine/index',
            success: () => wx.showToast({ title: '作品集仅对化妆师开放', icon: 'none' }),
          })
          return null
        }
        const artistId = profile.profileId || null
        this.setData({ artistId })
        if (!artistId) {
          this.setData({ loading: false, list: [], total: 0, hasMore: false })
          return null
        }
        return this.fetchPage(1, false, !fromPullDown)
      })
      .catch(() => this.setData({ loading: false, loadingMore: false }))
  },

  fetchPage(page, append, showSkeleton) {
    if (showSkeleton) this.setData({ loading: true })

    return request
      .get(
        `/api/artist/${this.data.artistId}/portfolios`,
        { page, size: PAGE_SIZE },
        { showError: false },
      )
      .then((data) => {
        const counts = data.counts || { image: 0, video: 0, minImages: 6 }
        const mapped = (data.list || []).map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          isVideo: item.type === 'video',
          cover: absoluteUrl(item.path),
          styles: item.styles || [],
          labels: styleLabels(item.styles),
          index: item.sort + 1,
        }))
        const list = append ? this.data.list.concat(mapped) : mapped
        this.setData({
          list,
          page,
          total: data.total || 0,
          hasMore: list.length < (data.total || 0),
          counts,
          belowThreshold: counts.image < counts.minImages && counts.video < 1,
          loading: false,
          loadingMore: false,
        })
      })
      .catch(() => {
        this.setData({ loading: false, loadingMore: false })
      })
  },

  onCreate() {
    if (!this.data.artistId) {
      wx.showToast({ title: '请先登录并完善个人信息', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/artist/portfolio/edit/index' })
  },

  onPreview() {
    if (!this.data.artistId) {
      wx.showToast({ title: '请先登录并完善个人信息', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/artist/detail/index?id=${this.data.artistId}` })
  },

  /** 游客 / 未建档：先登录选角色，再引导完善个人信息 */
  onGoApply() {
    if (!getToken()) {
      wx.switchTab({ url: '/pages/mine/index' })
      return
    }
    wx.navigateTo({ url: '/pkg-artist/pages/artist/apply/index' })
  },

  onOpen(event) {
    const item = this.data.list.filter((work) => work.id === event.currentTarget.dataset.id)[0]
    if (!item) return
    wx.navigateTo({
      url:
        `/pages/artist/portfolio/edit/index?id=${item.id}` +
        `&title=${encodeURIComponent(item.title)}` +
        `&styles=${encodeURIComponent(item.styles.join(','))}`,
    })
  },

  onLongPress(event) {
    const id = event.currentTarget.dataset.id
    const item = this.data.list.filter((work) => work.id === id)[0]
    if (!item) return

    wx.showActionSheet({
      itemList: ['编辑标题与风格', '上移', '下移', '删除作品'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.onOpen(event)
          return
        }
        if (res.tapIndex === 3) {
          this.confirmDelete(item)
          return
        }
        this.move(id, res.tapIndex === 1 ? 'up' : 'down')
      },
    })
  },

  move(id, direction) {
    request
      .put(`/api/portfolio/${id}`, { move: direction }, { showError: false })
      .then((result) => {
        if (!result.moved) {
          wx.showToast({ title: direction === 'up' ? '已经是第一个' : '已经是最后一个', icon: 'none' })
          return
        }
        return this.fetchPage(1)
      })
      .catch(() => {})
  },

  confirmDelete(item) {
    wx.showModal({
      title: '删除作品',
      content: `确定删除「${item.title}」吗？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#D9534F',
      success: (res) => {
        if (!res.confirm) return
        request
          .del(`/api/portfolio/${item.id}`, null, { showError: false })
          .then(() => {
            wx.showToast({ title: '已删除' })
            return this.fetchPage(1)
          })
          .catch(() => {})
      },
    })
  },
})
