Page({
  data: {
    loading: false,
  },

  handleWxLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })

    wx.login({
      success: (res) => {
        // E3-01：把 code 发给 POST /api/auth/wx-login 换取 token
        console.info('[login] wx.login code =', res.code)
        wx.showToast({ title: '登录接口将在 E3 接入', icon: 'none' })
      },
      fail: () => {
        wx.showToast({ title: '微信登录失败，请重试', icon: 'none' })
      },
      complete: () => {
        this.setData({ loading: false })
      },
    })
  },

  handleSkip() {
    wx.switchTab({ url: '/pages/home/index' })
  },
})
