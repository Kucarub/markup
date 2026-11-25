const { getToken, getRole, takeLoginRedirect, setUserId, setRole } = require('./auth')
const request = require('./request')

/**
 * 登录态 / 角色路由守卫（E3-05，注册流程调整）。
 * 选角色即建档：未选角色 → 角色选择页；禁用 → 状态页；其余一律放行。
 * 化妆师未完善个人信息（profileCompleted=false）也全部功能可用，由页面内引导完善。
 * /auth/me 结果缓存 30s，避免切换 Tab 时重复请求；角色或资料状态变更后调用 clearProfileCache()。
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

/** 角色变化后让当前页的底部导航立即按新角色重建 */
function refreshTabBar() {
  const pages = getCurrentPages()
  const page = pages.length ? pages[pages.length - 1] : null
  const bar = page && typeof page.getTabBar === 'function' ? page.getTabBar() : null
  if (bar && typeof bar.refresh === 'function') bar.refresh()
}

function fetchProfile(force) {
  if (!force && cache.profile && Date.now() - cache.at < CACHE_MS) {
    return Promise.resolve(cache.profile)
  }
  return request.get('/api/auth/me', null, { showError: false }).then((profile) => {
    setUserId(profile.userId)
    // 以服务端角色为准，避免本地缓存过期后 TabBar 按错误角色渲染
    if (profile.role && profile.role !== getRole()) {
      setRole(profile.role)
      refreshTabBar()
    }
    cache = { at: Date.now(), profile }
    return profile
  })
}

function targetRoute(profile) {
  if (!profile.role) return '/pages/auth/role/index'
  if (profile.profileStatus === 'disabled') return '/pages/apply/status/index'
  // 历史数据兜底：化妆师角色但没有档案时，引导去完善个人信息
  if (profile.role === 'artist' && (!profile.profileStatus || profile.profileStatus === 'none')) {
    return '/pkg-artist/pages/artist/apply/index'
  }
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

/** 进入业务页前校验：仅拦截禁用账号；未登录允许游客浏览 */
function businessGuard() {
  if (!getToken()) return Promise.resolve(true)
  return fetchProfile()
    .then((profile) => {
      const route = targetRoute(profile)
      if (route) {
        go(route)
        return false
      }
      return true
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
  // 预约等场景要求在登录后回到原页面（E9-01）
  const redirect = takeLoginRedirect()
  if (redirect) {
    wx.reLaunch({ url: redirect })
    return
  }
  // 角色不再决定落点：登录 / 切换身份后统一回工作台，由工作台按角色区分内容
  go('/pages/home/index')
}

module.exports = {
  fetchProfile,
  clearProfileCache,
  entryGuard,
  businessGuard,
  routeAfterAuth,
}
