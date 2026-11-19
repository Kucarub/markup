const { getToken } = require('./auth')
const request = require('./request')

/**
 * 登录态 / 入驻状态路由守卫（E3-05）。
 * 三态映射：未选角色 → 角色选择页；未入驻 → 入驻页；审核中/驳回/禁用 → 状态页；通过 → 业务页。
 * /auth/me 结果缓存 30s，避免切换 Tab 时重复请求；角色或入驻状态变更后调用 clearProfileCache()。
 */

const CACHE_MS = 30 * 1000
const TAB_ROUTES = [
  '/pages/home/index',
  '/pages/demand/hall/index',
  '/pages/portfolio/list/index',
  '/pages/demand/mine/index',
  '/pages/mine/index',
]

let cache = { at: 0, profile: null }

function clearProfileCache() {
  cache = { at: 0, profile: null }
}

function fetchProfile(force) {
  if (!force && cache.profile && Date.now() - cache.at < CACHE_MS) {
    return Promise.resolve(cache.profile)
  }
  return request.get('/api/auth/me', null, { showError: false }).then((profile) => {
    cache = { at: Date.now(), profile }
    return profile
  })
}

function targetRoute(profile) {
  if (!profile.role) return '/pages/auth/role/index'
  // 客户免审核：选完角色即视为通过，直接进我的需求
  if (profile.role === 'customer') {
    return profile.profileStatus === 'disabled' ? '/pages/apply/status/index' : ''
  }
  if (!profile.profileStatus || profile.profileStatus === 'none') {
    return '/pkg-artist/pages/artist/apply/index'
  }
  if (profile.profileStatus !== 'approved') return '/pages/apply/status/index'
  return ''
}

function go(route) {
  const pages = getCurrentPages()
  const current = pages.length ? `/${pages[pages.length - 1].route}` : ''
  if (current === route) return
  if (TAB_ROUTES.indexOf(route) > -1) {
    wx.switchTab({ url: route })
    return
  }
  wx.reLaunch({ url: route })
}

/** 进入业务页前校验：已登录但未入驻 / 审核中一律拦截；未登录允许游客浏览 */
function businessGuard() {
  if (!getToken()) return Promise.resolve(true)
  return fetchProfile()
    .then((profile) => {
      if (profile.profileStatus === 'approved') return true
      const route = targetRoute(profile)
      if (route) go(route)
      return false
    })
    .catch(() => false)
}

/** 冷启动 / 首页入口校验：未登录允许「先随便看看」，已登录按入驻状态分流 */
function entryGuard() {
  if (!getToken()) return Promise.resolve(true)
  return fetchProfile()
    .then((profile) => {
      const route = targetRoute(profile)
      if (!route) return true
      go(route)
      return false
    })
    .catch(() => false)
}

/** 登录 / 选角色成功后按入驻状态跳转 */
function routeAfterAuth(profile) {
  if (profile) cache = { at: Date.now(), profile }
  const route = profile ? targetRoute(profile) : ''
  if (route) {
    go(route)
    return
  }
  go(profile && profile.role === 'customer' ? '/pages/demand/mine/index' : '/pages/home/index')
}

module.exports = {
  fetchProfile,
  clearProfileCache,
  entryGuard,
  businessGuard,
  routeAfterAuth,
}
