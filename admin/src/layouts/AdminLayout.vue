<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore, type AdminRole } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const allRoles: AdminRole[] = ['super', 'admin', 'auditor']
const menus = [
  { path: '/dashboard', label: '数据看板', roles: allRoles },
  { path: '/audit/artists', label: '化妆师审核', roles: allRoles },
  { path: '/users', label: '用户管理', roles: allRoles },
  { path: '/demands', label: '需求管理', roles: allRoles },
  { path: '/orders', label: '服务记录', roles: allRoles },
  { path: '/portfolios', label: '作品管理', roles: allRoles },
  { path: '/reports', label: '举报处理', roles: allRoles },
  { path: '/logs', label: '审核日志', roles: allRoles },
]

/** 按登录角色隐藏无权限菜单 */
const visibleMenus = computed(() => menus.filter((item) => item.roles.includes(auth.role)))
const activeMenu = computed(() => (route.meta.activeMenu as string) || route.path)
const displayName = computed(() => auth.name || '运营同学')

async function handleLogout() {
  await ElMessageBox.confirm('确认退出登录？', '提示', {
    confirmButtonText: '退出',
    cancelButtonText: '取消',
    type: 'warning',
  })
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <el-container class="layout">
    <el-aside width="220px" class="layout__aside">
      <div class="layout__brand">后台管理系统</div>
      <el-menu :default-active="activeMenu" router class="layout__menu">
        <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
          {{ item.label }}
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="layout__header">
        <span class="layout__header-title">{{ route.meta.title }}</span>
        <div class="layout__header-right">
          <span class="layout__role">{{ auth.roleLabel }}</span>
          <span class="layout__user">{{ displayName }}</span>
          <el-button link type="primary" @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>

      <el-main class="layout__main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped lang="scss">
.layout {
  height: 100vh;

  &__aside {
    background: #ffffff;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
  }

  &__brand {
    height: 60px;
    display: flex;
    align-items: center;
    padding: 0 var(--space-lg);
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--color-primary-dark);
    border-bottom: 1px solid var(--color-divider);
  }

  &__menu {
    border-right: none;
    flex: 1;
  }

  &__header {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #ffffff;
    border-bottom: 1px solid var(--color-border);
  }

  &__header-title {
    font-size: var(--font-size-md);
    font-weight: 600;
  }

  &__header-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  &__role {
    padding: 2px var(--space-sm);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    color: var(--color-primary);
    background: var(--color-primary-tint);
  }

  &__user {
    color: var(--color-text-secondary);
  }

  &__main {
    padding: var(--space-lg);
    background: var(--color-bg-page);
  }
}
</style>
