const { portfolios } = require('../../../data/mock')
const { businessGuard } = require('../../../utils/guard')

const CATEGORIES = ['全部', '新娘妆', '生活妆', '舞台妆', '证件照']

Page({
  data: {
    categories: CATEGORIES,
    category: '全部',
    list: portfolios,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected()
    }
    businessGuard()
  },

  onSelectCategory(event) {
    const { name } = event.currentTarget.dataset
    const list = name === '全部' ? portfolios : portfolios.filter((item) => item.category === name)
    this.setData({ category: name, list })
  },

  onCreate() {
    this.toast('作品集编辑器将在下一版本开放')
  },

  onOpen(event) {
    const item = portfolios.filter((portfolio) => portfolio.id === event.detail.id)[0]
    if (item) this.toast(`${item.title} · 共 ${item.count} 张作品`)
  },

  toast(title) {
    wx.showToast({ title, icon: 'none' })
  },
})
