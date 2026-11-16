const env = require('./config/env')
const { getToken } = require('./utils/auth')

App({
  globalData: {
    env,
    /** 登录态由 E3 接管，此处仅透出当前缓存 */
    token: getToken(),
    userInfo: null,
    /** 'artist' | 'merchant' | '' ，由 /api/auth/me 决定 */
    role: '',
  },

  onLaunch() {
    console.info(`[app] launch, env=${env.name} baseURL=${env.baseURL}`)

    // 小程序版本更新后提示重启
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager()
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已准备好，是否重启应用？',
          success(res) {
            if (res.confirm) updateManager.applyUpdate()
          },
        })
      })
    }
  },

  onShow() {
    this.globalData.token = getToken()
  },
})
