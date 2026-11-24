<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  fetchServiceOrderDetail,
  fetchServiceOrders,
  SERVICE_TYPES,
  STATUS_OPTIONS,
  type AdminServiceOrderItem,
} from '@/api/admin'

const loading = ref(false)
const list = ref<AdminServiceOrderItem[]>([])
const counts = ref<Record<string, number>>({})
const total = ref(0)
const query = reactive({
  page: 1,
  size: 20,
  status: '' as '' | 'pending' | 'confirmed' | 'finished' | 'cancelled',
  serviceType: '',
  keyword: '',
})

const statusTabs = computed(() => [
  { value: '', label: '全部', count: counts.value.all ?? 0 },
  ...STATUS_OPTIONS.order.map((item) => ({
    value: item.value,
    label: item.label,
    count: counts.value[item.value] ?? 0,
  })),
])

const typeLabel: Record<string, string> = Object.fromEntries(
  SERVICE_TYPES.map((item) => [item.value, item.label]),
)
const statusLabel: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.order.map((item) => [item.value, item.label]),
)

async function load() {
  loading.value = true
  try {
    const data = await fetchServiceOrders({
      page: query.page,
      size: query.size,
      ...(query.status ? { status: query.status } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      ...(query.keyword ? { keyword: query.keyword } : {}),
    })
    list.value = data.list
    total.value = data.total
    counts.value = data.counts || {}
  } finally {
    loading.value = false
  }
}

function handleTab(value: string) {
  query.status = value as typeof query.status
  query.page = 1
  load()
}

function search() {
  query.page = 1
  load()
}

function reset() {
  query.status = ''
  query.serviceType = ''
  query.keyword = ''
  query.page = 1
  load()
}

// ---------- 完整链路抽屉 ----------
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<Record<string, any> | null>(null)

async function openDetail(row: AdminServiceOrderItem) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    detail.value = await fetchServiceOrderDetail(row.id)
  } finally {
    detailLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-card">
    <div class="toolbar">
      <el-radio-group :model-value="query.status" @update:model-value="handleTab">
        <el-radio-button v-for="tab in statusTabs" :key="tab.value" :value="tab.value">
          {{ tab.label }}（{{ tab.count }}）
        </el-radio-button>
      </el-radio-group>

      <div class="toolbar__right">
        <el-select v-model="query.serviceType" placeholder="服务类型" clearable style="width: 130px" @change="search">
          <el-option v-for="item in SERVICE_TYPES" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="客户 / 化妆师 / 区域"
          clearable
          style="width: 190px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" row-key="id" style="width: 100%">
      <el-table-column prop="id" label="记录编号" width="90" />
      <el-table-column label="客户" min-width="110">
        <template #default="{ row }">{{ row.customer.nickname || `客户 ${row.customer.id}` }}</template>
      </el-table-column>
      <el-table-column label="化妆师" min-width="110">
        <template #default="{ row }">{{ row.artist.name }}</template>
      </el-table-column>
      <el-table-column label="服务" min-width="140">
        <template #default="{ row }">{{ typeLabel[row.serviceType] || row.serviceType }} · {{ row.headcount }} 人</template>
      </el-table-column>
      <el-table-column label="城市 / 区域" min-width="130">
        <template #default="{ row }">{{ row.city }} · {{ row.district }}</template>
      </el-table-column>
      <el-table-column prop="serviceDate" label="服务日期" width="110" />
      <el-table-column label="来源" width="110">
        <template #default="{ row }">
          <el-tag :type="row.demandSource === 'ops' ? 'warning' : 'info'" effect="light">
            {{ row.demandSource === 'ops' ? '运营代发布' : '客户发布' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag
            :type="row.status === 'finished' ? 'success' : row.status === 'cancelled' ? 'danger' : row.status === 'confirmed' ? 'primary' : 'warning'"
            effect="light"
          >
            {{ statusLabel[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="75" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.size"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="load"
        @size-change="search"
      />
    </div>

    <!-- 完整链路抽屉 -->
    <el-drawer v-model="detailVisible" title="服务记录完整链路" size="620px">
      <div v-loading="detailLoading" class="drawer">
        <template v-if="detail">
          <div class="drawer__title">服务记录</div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="编号">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ statusLabel[detail.status] || detail.status }}</el-descriptions-item>
            <el-descriptions-item label="客户">{{ detail.customer.nickname || `客户 ${detail.customer.id}` }}</el-descriptions-item>
            <el-descriptions-item label="化妆师">{{ detail.artist.name }}</el-descriptions-item>
            <el-descriptions-item label="城市 / 区域">{{ detail.city }} · {{ detail.district }}</el-descriptions-item>
            <el-descriptions-item label="服务日期">{{ detail.serviceDate }}</el-descriptions-item>
            <el-descriptions-item label="服务类型">{{ typeLabel[detail.serviceType] || detail.serviceType }}</el-descriptions-item>
            <el-descriptions-item label="人数">{{ detail.headcount }}</el-descriptions-item>
            <el-descriptions-item label="发起方">{{ detail.initiatorRole === 'artist' ? '化妆师' : '客户' }}</el-descriptions-item>
            <el-descriptions-item label="确认时间">
              {{ detail.confirmedAt ? new Date(detail.confirmedAt).toLocaleString() : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="完成时间">
              {{ detail.finishTime ? new Date(detail.finishTime).toLocaleString() : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="取消原因">{{ detail.cancelReason || '—' }}</el-descriptions-item>
          </el-descriptions>

          <div class="drawer__title drawer__title--gap">需求信息</div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="需求编号">{{ detail.demand.id }}</el-descriptions-item>
            <el-descriptions-item label="需求状态">{{ detail.demand.status }}</el-descriptions-item>
            <el-descriptions-item label="来源">
              {{ detail.demand.source === 'ops' ? '运营代发布' : '客户发布' }}
            </el-descriptions-item>
            <el-descriptions-item label="预算">¥{{ detail.demand.budgetMin }}–{{ detail.demand.budgetMax }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ detail.demand.remark || '—' }}</el-descriptions-item>
          </el-descriptions>

          <div class="drawer__title drawer__title--gap">响应记录（{{ detail.demand.responses.length }}）</div>
          <el-table :data="detail.demand.responses" size="small">
            <el-table-column label="化妆师" min-width="110">
              <template #default="{ row }">{{ row.artist.name }}</template>
            </el-table-column>
            <el-table-column label="来源" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.source === 'ops' ? 'warning' : 'info'" effect="light">
                  {{ row.source === 'ops' ? '代响应' : '本人' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
            </el-table-column>
          </el-table>

          <div class="drawer__title drawer__title--gap">评价（{{ detail.reviews.length }}）</div>
          <el-table v-if="detail.reviews.length" :data="detail.reviews" size="small">
            <el-table-column label="方向" width="110">
              <template #default="{ row }">{{ row.fromRole === 'customer' ? '客户 → 化妆师' : '化妆师 → 客户' }}</template>
            </el-table-column>
            <el-table-column prop="rating" label="评分" width="70" />
            <el-table-column prop="content" label="内容" min-width="160" />
            <el-table-column prop="status" label="状态" width="90" />
          </el-table>
          <el-empty v-else description="暂无评价" :image-size="60" />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);

  &__right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-md);
}

.drawer {
  &__title {
    font-weight: 600;
    margin-bottom: var(--space-sm);

    &--gap {
      margin-top: var(--space-lg);
    }
  }
}
</style>
