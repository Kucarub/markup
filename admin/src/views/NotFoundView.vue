<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="not-found">
    <h1 class="not-found__code">404</h1>
    <p class="text-secondary">页面不存在或已被移除</p>
    <el-button type="primary" @click="router.replace('/dashboard')">返回后台首页</el-button>
  </div>
</template>

<style scoped lang="scss">
.not-found {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);

  &__code {
    margin: 0;
    font-size: 64px;
    color: var(--color-primary);
  }
}
</style>
