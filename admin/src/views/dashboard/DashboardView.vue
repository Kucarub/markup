<script setup lang="ts">
const metrics = [
  { label: '待审核化妆师', value: '—', hint: 'E12-02 接入' },
  { label: '待审核商家', value: '—', hint: 'E12-04 接入' },
  { label: '进行中订单', value: '—', hint: 'E12-06 接入' },
  { label: '本月成功撮合', value: '—', hint: 'E13-03 接入' },
]
</script>

<template>
  <div>
    <el-row :gutter="16">
      <el-col v-for="item in metrics" :key="item.label" :xs="24" :sm="12" :md="6">
        <div class="metric page-card">
          <span class="metric__label">{{ item.label }}</span>
          <strong class="metric__value">{{ item.value }}</strong>
          <span class="metric__hint">{{ item.hint }}</span>
        </div>
      </el-col>
    </el-row>

    <div class="page-card placeholder">
      <h2 class="page-title">数据看板占位</h2>
      <p class="text-secondary">
        看板接口与图表在 E13-03 落地。当前页面用于验证后台框架布局、Element Plus 主题与路由守卫。
      </p>
      <el-space wrap>
        <span class="tag">主色 #C08552</span>
        <span class="tag tag--success">成功</span>
        <span class="tag tag--warning">警告</span>
        <span class="tag tag--danger">危险</span>
      </el-space>
    </div>
  </div>
</template>

<style scoped lang="scss">
.metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);

  &__label {
    color: var(--color-text-secondary);
  }

  &__value {
    font-size: var(--font-size-xxl);
    color: var(--color-primary-dark);
  }

  &__hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-placeholder);
  }
}

.placeholder {
  margin-top: var(--space-md);
}
</style>
