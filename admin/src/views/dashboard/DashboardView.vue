<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchArtistAudits, fetchServiceOrders, fetchUsers } from '@/api/admin'

const metrics = ref([
  { label: '待审核化妆师', value: '—', hint: 'E12-02' },
  { label: '已禁用账号', value: '—', hint: 'E12-04' },
  { label: '待确认服务记录', value: '—', hint: 'E12-06' },
  { label: '本月成功撮合', value: '—', hint: 'E13-03 接入' },
])

async function load() {
  const [audits, users, orders] = await Promise.all([
    fetchArtistAudits({ page: 1, size: 1 }),
    fetchUsers({ page: 1, size: 1 }),
    fetchServiceOrders({ page: 1, size: 1 }),
  ])
  metrics.value = [
    { label: '待审核化妆师', value: String(audits.counts?.pending ?? 0), hint: '点击「化妆师审核」处理' },
    { label: '已禁用账号', value: String(users.counts?.disabled ?? 0), hint: '点击「用户管理」查看' },
    { label: '待确认服务记录', value: String(orders.counts?.pending ?? 0), hint: '点击「服务记录」查看' },
    { label: '本月成功撮合', value: '—', hint: 'E13-03 接入' },
  ]
}

onMounted(load)
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
      <h2 class="page-title">运营后台</h2>
      <p class="text-secondary">
        E12 已上线：化妆师审核（含身份证解密留痕与批量导出）、用户管理、需求代发布与代响应、服务记录完整链路、作品下架恢复与审核日志。
      </p>
      <el-space wrap>
        <span class="tag">主色 #b4566e</span>
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
