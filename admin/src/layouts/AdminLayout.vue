<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const activeMenu = computed(() => route.path)
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
      <div class="layout__brand">化妆师接单门户</div>
      <el-menu :default-active="activeMenu" router class="layout__menu">
        <el-menu-item index="/dashboard">数据看板</el-menu-item>
        <el-menu-item index="/audit/artists" disabled>化妆师审核（E12）</el-menu-item>
        <el-menu-item index="/audit/merchants" disabled>商家审核（E12）</el-menu-item>
        <el-menu-item index="/orders" disabled>邀约与订单（E12）</el-menu-item>
        <el-menu-item index="/reports" disabled>举报处理（E14）</el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="layout__header">
        <span class="layout__header-title">{{ route.meta.title }}</span>
        <div class="layout__header-right">
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

  &__user {
    color: var(--color-text-secondary);
  }

  &__main {
    padding: var(--space-lg);
    background: var(--color-bg-page);
  }
}
</style>
