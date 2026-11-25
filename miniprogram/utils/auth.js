const env = require('../config/env')

const TOKEN_KEY = env.storageKeys.TOKEN
const REFRESH_TOKEN_KEY = env.storageKeys.REFRESH_TOKEN
const ROLE_KEY = env.storageKeys.ROLE
const USER_ID_KEY = env.storageKeys.USER_ID

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
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

/** 当前登录用户 id（信用分等公开接口按 userId 查询） */
function getUserId() {
  return Number(wx.getStorageSync(USER_ID_KEY)) || 0
}

function setUserId(userId) {
  if (!userId) return
  wx.setStorageSync(USER_ID_KEY, Number(userId))
}

/**
 * 写入一次登录态（登录 / 刷新 / 角色切换共用）。
 * @param {{ accessToken: string, refreshToken?: string, role?: string|null, userId?: number }} session
 */
function setSession(session) {
  if (!session || !session.accessToken) return
  setToken(session.accessToken)
  if (session.refreshToken) setRefreshToken(session.refreshToken)
  if (session.role) setRole(session.role)
  setUserId(session.userId)
}

function clearAuth() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(REFRESH_TOKEN_KEY)
  wx.removeStorageSync(ROLE_KEY)
  wx.removeStorageSync(USER_ID_KEY)
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
  setToken,
  getRefreshToken,
  setRefreshToken,
  getRole,
  setRole,
  getUserId,
  setUserId,
  setSession,
  clearAuth,
  redirectToLogin,
  setLoginRedirect,
  takeLoginRedirect,
}
