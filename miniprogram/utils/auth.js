const env = require('../config/env')

const TOKEN_KEY = env.storageKeys.TOKEN
const REFRESH_TOKEN_KEY = env.storageKeys.REFRESH_TOKEN
const ROLE_KEY = env.storageKeys.ROLE
/** 游客浏览标记：点过「先随便看看」后，冷启动不再强制回欢迎页 */
const GUEST_KEY = 'guest_browse'

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function isGuestBrowse() {
  return Boolean(wx.getStorageSync(GUEST_KEY))
}

function setGuestBrowse() {
  wx.setStorageSync(GUEST_KEY, true)
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token)
}

function getRefreshToken() {
  return wx.getStorageSync(REFRESH_TOKEN_KEY) || ''
}

function setRefreshToken(token) {
  wx.setStorageSync(REFRESH_TOKEN_KEY, token)
}

function getRole() {
  return wx.getStorageSync(ROLE_KEY) || ''
}

function setRole(role) {
  wx.setStorageSync(ROLE_KEY, role)
}

/**
 * 写入一次登录态（登录 / 刷新 / 角色切换共用）。
 * @param {{ accessToken: string, refreshToken?: string, role?: string|null }} session
 */
function setSession(session) {
  if (!session || !session.accessToken) return
  setToken(session.accessToken)
  if (session.refreshToken) setRefreshToken(session.refreshToken)
  if (session.role) setRole(session.role)
}

function clearAuth() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(REFRESH_TOKEN_KEY)
  wx.removeStorageSync(ROLE_KEY)
  wx.removeStorageSync(GUEST_KEY)
}

/** 未登录 / 过期统一回登录页，避免多页重复 reLaunch */
function redirectToLogin() {
  clearAuth()
  const pages = getCurrentPages()
  const current = pages.length ? pages[pages.length - 1].route : ''
  if (current === 'pages/auth/login/index') return
  wx.reLaunch({ url: '/pages/auth/login/index' })
}

/** 登录后回跳地址（E9-01）：仅显式设置的场景生效，其余仍走默认分流 */
const LOGIN_REDIRECT_KEY = 'login_redirect'

function setLoginRedirect(url) {
  if (url) wx.setStorageSync(LOGIN_REDIRECT_KEY, url)
}

function takeLoginRedirect() {
  const url = wx.getStorageSync(LOGIN_REDIRECT_KEY) || ''
  if (url) wx.removeStorageSync(LOGIN_REDIRECT_KEY)
  return url
}

module.exports = {
  getToken,
  isGuestBrowse,
  setGuestBrowse,
  setToken,
  getRefreshToken,
  setRefreshToken,
  getRole,
  setRole,
  setSession,
  clearAuth,
  redirectToLogin,
  setLoginRedirect,
  takeLoginRedirect,
}
