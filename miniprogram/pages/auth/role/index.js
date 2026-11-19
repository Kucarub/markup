const request = require('../../../utils/request')
const { setSession, getToken } = require('../../../utils/auth')
const { routeAfterAuth, clearProfileCache } = require('../../../utils/guard')

Page({
  data: {
    submitting: '',
    roles: [
      {
        key: 'artist',
        title: '我是化妆师',
        desc: '发布作品集、维护档期、响应同城需求',
      },
      {
        key: 'customer',
        title: '我是客户',
        desc: '发布预约需求，等化妆师响应或主动预约',
      },
    ],
  },

  onLoad() {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
    }
  },

  /** 角色写库并重签 token（E3-03）；切换角色同样走此入口 */
  selectRole(event) {
    const { role } = event.currentTarget.dataset
    if (this.data.submitting) return
    this.setData({ submitting: role })

    request
      .post('/api/auth/role', { role })
      .then((session) => {
        setSession(session)
        clearProfileCache()
        wx.showToast({ title: '角色已选择', icon: 'success' })
        setTimeout(() => {
          routeAfterAuth(session)
        }, 400)
      })
      .catch(() => {})
      .then(() => {
        this.setData({ submitting: '' })
      })
  },
})
