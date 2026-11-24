import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore, type AdminRole } from '@/stores/auth'

/** 全角色可访问（只读页）；写操作由页面内 canManage 控制 */
const ALL_ROLES: AdminRole[] = ['super', 'admin', 'auditor']

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/LoginView.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/dashboard/DashboardView.vue'),
          meta: { title: '数据看板' },
        },
        {
          path: 'audit/artists',
          name: 'audit-artists',
          component: () => import('@/views/audit/ArtistAuditView.vue'),
          meta: { title: '化妆师审核', roles: ALL_ROLES },
        },
        {
          path: 'audit/artists/:id',
          name: 'audit-artist-detail',
          component: () => import('@/views/audit/ArtistAuditDetailView.vue'),
          meta: { title: '审核详情', roles: ALL_ROLES, activeMenu: '/audit/artists' },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/users/UsersView.vue'),
          meta: { title: '用户管理', roles: ALL_ROLES },
        },
        {
          path: 'demands',
          name: 'demands',
          component: () => import('@/views/demands/DemandsView.vue'),
          meta: { title: '需求管理', roles: ALL_ROLES },
        },
        {
          path: 'orders',
          name: 'orders',
          component: () => import('@/views/orders/ServiceOrdersView.vue'),
          meta: { title: '服务记录', roles: ALL_ROLES },
        },
        {
          path: 'portfolios',
          name: 'portfolios',
          component: () => import('@/views/portfolios/PortfoliosView.vue'),
          meta: { title: '作品管理', roles: ALL_ROLES },
        },
        {
          path: 'logs',
          name: 'logs',
          component: () => import('@/views/logs/AuditLogsView.vue'),
          meta: { title: '审核日志', roles: ALL_ROLES },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { public: true, title: '页面不存在' },
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    // 已登录访问 /login 直接进后台
    if (to.path === '/login' && auth.isLoggedIn) {
      return { path: '/dashboard' }
    }
    return true
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 角色守卫：无权限页面回看板（菜单同时隐藏）
  const roles = to.meta.roles as AdminRole[] | undefined
  if (roles && !roles.includes(auth.role)) {
    return { path: '/dashboard' }
  }

  return true
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · 化妆师接单门户后台` : '化妆师接单门户后台'
})

export default router
