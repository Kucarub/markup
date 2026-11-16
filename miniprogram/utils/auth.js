const env = require('../config/env')

const TOKEN_KEY = env.storageKeys.TOKEN
const ROLE_KEY = env.storageKeys.ROLE

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token)
}

function getRole() {
  return wx.getStorageSync(ROLE_KEY) || ''
}

function setRole(role) {
  wx.setStorageSync(ROLE_KEY, role)
}

function clearAuth() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(ROLE_KEY)
}

/** 未登录 / 过期统一回登录页，避免多页重复 reLaunch */
function redirectToLogin() {
  clearAuth()
  const pages = getCurrentPages()
  const current = pages.length ? pages[pages.length - 1].route : ''
  if (current === 'pages/auth/login/index') return
  wx.reLaunch({ url: '/pages/auth/login/index' })
}

module.exports = {
  getToken,
  setToken,
  getRole,
  setRole,
  clearAuth,
  redirectToLogin,
}
