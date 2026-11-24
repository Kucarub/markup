<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { fetchPortfolios, setPortfolioStatus, STATUS_OPTIONS, type AdminPortfolioItem } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const loading = ref(false)
const list = ref<AdminPortfolioItem[]>([])
const counts = ref<Record<string, number>>({})
const total = ref(0)
const query = reactive({
  page: 1,
  size: 20,
  status: '' as '' | 'pending' | 'online' | 'offline' | 'rejected',
  keyword: '',
})

const statusTabs = computed(() => [
  { value: '', label: '全部', count: counts.value.all ?? 0 },
  ...STATUS_OPTIONS.portfolio.map((item) => ({
    value: item.value,
    label: item.label,
    count: counts.value[item.value] ?? 0,
  })),
])

const statusTag: Record<string, string> = {
  pending: 'warning',
  online: 'success',
  offline: 'danger',
  rejected: 'info',
}

async function load() {
  loading.value = true
  try {
    const data = await fetchPortfolios({
      page: query.page,
      size: query.size,
      ...(query.status ? { status: query.status } : {}),
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
  query.keyword = ''
  query.page = 1
  load()
}

async function offline(row: AdminPortfolioItem) {
  try {
    const result = await ElMessageBox.prompt(
      '下架后该作品不再对外展示，请填写违规原因（至少 2 个字）',
      '违规下架',
      {
        confirmButtonText: '确认下架',
        cancelButtonText: '取消',
        inputPattern: /^.{2,}$/,
        inputErrorMessage: '请填写至少 2 个字的原因',
      },
    )
    await setPortfolioStatus(row.id, { action: 'offline', reason: result.value })
    ElMessage.success('已下架')
    await load()
  } catch {
    // 取消或错误
  }
}

async function restore(row: AdminPortfolioItem) {
  try {
    await ElMessageBox.confirm('确认恢复该作品？恢复后将重新对外展示。', '恢复作品', {
      confirmButtonText: '恢复',
      cancelButtonText: '取消',
    })
    await setPortfolioStatus(row.id, { action: 'restore' })
    ElMessage.success('已恢复')
    await load()
  } catch {
    // 取消或错误
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
        <el-input
          v-model="query.keyword"
          placeholder="作品标题 / 化妆师"
          clearable
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" row-key="id" style="width: 100%">
      <el-table-column label="封面" width="90">
        <template #default="{ row }">
          <el-image
            :src="row.path"
            :preview-src-list="[row.path]"
            fit="cover"
            class="cover"
            preview-teleported
          />
        </template>
      </el-table-column>
      <el-table-column prop="id" label="编号" width="70" />
      <el-table-column prop="title" label="标题" min-width="150" />
      <el-table-column label="化妆师" min-width="120">
        <template #default="{ row }">{{ row.artist.name }}（{{ row.artist.city }}）</template>
      </el-table-column>
      <el-table-column label="风格" min-width="120">
        <template #default="{ row }">{{ row.styles.length ? row.styles.join('、') : '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTag[row.status] || 'info'" effect="light">
            {{ STATUS_OPTIONS.portfolio.find((item) => item.value === row.status)?.label || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="上传时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column v-if="auth.canManage" label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'offline'" link type="success" @click="restore(row)">恢复</el-button>
          <el-button v-else link type="danger" @click="offline(row)">下架</el-button>
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

.cover {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-md);
}
</style>
