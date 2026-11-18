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
        desc: '发布作品集、维护档期、接收商家邀约',
      },
      {
        key: 'merchant',
        title: '我是商家',
        desc: '按风格/档期/距离搜索化妆师并发起邀约',
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
