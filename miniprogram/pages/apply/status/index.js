const { getToken } = require('../../../utils/auth')
const { fetchProfile, clearProfileCache } = require('../../../utils/guard')

const COPY = {
  pending: {
    title: '资料审核中',
    desc: '我们会在 1 个工作日内完成审核，审核通过后即可进入业务页。',
    action: '刷新状态',
  },
  rejected: {
    title: '审核未通过',
    desc: '请根据驳回原因修改资料后重新提交。',
    action: '重新提交资料',
  },
  disabled: {
    title: '账号已停用',
    desc: '如有疑问请联系平台客服处理。',
    action: '联系客服',
  },
}

Page({
  data: {
    status: 'pending',
    role: '',
    copy: COPY.pending,
    rejectReason: '',
  },

  onShow() {
    this.refresh()
  },

  /** 拉取最新入驻状态（E3-05）：通过后直接进首页 */
  refresh() {
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    clearProfileCache()
    fetchProfile(true)
      .then((profile) => {
        if (profile.profileStatus === 'approved') {
          wx.switchTab({ url: '/pages/home/index' })
          return
        }
        const status = COPY[profile.profileStatus] ? profile.profileStatus : 'pending'
        this.setData({
          status,
          role: profile.role || '',
          copy: COPY[status],
          rejectReason: profile.rejectReason || '',
        })
      })
      .catch(() => {})
  },

  handleAction() {
    const { status, role } = this.data
    if (status === 'rejected') {
      wx.reLaunch({
        url:
          role === 'merchant'
            ? '/pkg-merchant/pages/merchant/apply/index'
            : '/pkg-artist/pages/artist/apply/index',
      })
      return
    }
    if (status === 'disabled') {
      wx.showToast({ title: '客服通道将在后续版本开放', icon: 'none' })
      return
    }
    this.refresh()
  },
})
