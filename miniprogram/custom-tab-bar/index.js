Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/index', text: '工作台', icon: 'home' },
      { pagePath: '/pages/demand/hall/index', text: '需求大厅', icon: 'hall' },
      { pagePath: '/pages/portfolio/list/index', text: '作品集', icon: 'portfolio' },
      { pagePath: '/pages/mine/index', text: '我的', icon: 'me' },
    ],
  },

  methods: {
    onSwitch(event) {
      const { index, path } = event.currentTarget.dataset
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
      this.setData({ selected: index })
    },
  },
})
