const { getRole } = require('../utils/auth')

/**
 * TabBar 按角色动态渲染（E3-03）：
 * - 化妆师（M）5 项：工作台 / 需求大厅 / 作品集 / 订单 / 我的
 * - 商家（B）4 项：工作台 / 找化妆师 / 订单 / 我的
 * 小程序 tabBar 最多 5 项，B 端复用「需求大厅」槽位承载「找化妆师」（页面按角色渲染）。
 */
const TABS = {
  home: { pagePath: '/pages/home/index', text: '工作台', icon: 'home' },
  hall: { pagePath: '/pages/demand/hall/index', text: '需求大厅', icon: 'hall' },
  portfolio: { pagePath: '/pages/portfolio/list/index', text: '作品集', icon: 'portfolio' },
  order: { pagePath: '/pages/order/list/index', text: '订单', icon: 'order' },
  me: { pagePath: '/pages/mine/index', text: '我的', icon: 'me' },
}

function listFor(role) {
  if (role === 'merchant') {
    return [
      TABS.home,
      { ...TABS.hall, text: '找化妆师', icon: 'search' },
      TABS.order,
      TABS.me,
    ]
  }
  return [TABS.home, TABS.hall, TABS.portfolio, TABS.order, TABS.me]
}

Component({
  data: {
    selected: 0,
    list: [],
  },

  attached() {
    this.setData({ list: listFor(getRole()) }, () => this.syncSelected())
  },

  pageLifetimes: {
    show() {
      this.syncSelected()
    },
  },

  methods: {
    /** 按当前路由反查下标，避免各页面硬编码 selected 与角色列表错位 */
    syncSelected() {
      const pages = getCurrentPages()
      const route = pages.length ? `/${pages[pages.length - 1].route}` : ''
      const index = this.data.list.findIndex((item) => item.pagePath === route)
      if (index >= 0 && index !== this.data.selected) {
        this.setData({ selected: index })
      }
    },

    onSwitch(event) {
      const { index, path } = event.currentTarget.dataset
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
      this.setData({ selected: index })
    },
  },
})
