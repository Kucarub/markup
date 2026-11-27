<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import {
  fetchReports,
  handleReport,
  STATUS_OPTIONS,
  type AdminReportItem,
} from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const loading = ref(false)
const list = ref<AdminReportItem[]>([])
const counts = ref<Record<string, number>>({})
const total = ref(0)
const query = reactive({
  page: 1,
  size: 20,
  status: '' as '' | 'pending' | 'handled' | 'rejected',
  targetType: '' as '' | 'portfolio' | 'artist',
  keyword: '',
})

const statusTabs = computed(() => [
  { value: '', label: '全部', count: counts.value.all ?? 0 },
  ...STATUS_OPTIONS.report.map((item) => ({
    value: item.value,
    label: item.label,
    count: counts.value[item.value] ?? 0,
  })),
])

const statusTag: Record<string, string> = {
  pending: 'warning',
  handled: 'success',
  rejected: 'info',
}

async function load() {
  loading.value = true
  try {
    const data = await fetchReports({
      page: query.page,
      size: query.size,
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
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
  query.targetType = ''
  query.keyword = ''
  query.page = 1
  load()
}

/** 处理为未成立：举报不属实，仅记录结果 */
async function dismiss(row: AdminReportItem) {
  try {
    const { value } = await ElMessageBox.prompt('确认该举报不成立？可填写处理备注（同步给举报人）。', '未成立', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '处理备注（选填）',
    })
    await handleReport(row.id, { action: 'dismiss', ...(value ? { note: value } : {}) })
    ElMessage.success('已标记未成立')
    await load()
  } catch {
    // 取消
  }
}

/** 处理为下架：作品立即从对外展示中隐藏（同 E12-08） */
async function offline(row: AdminReportItem) {
  try {
    const { value } = await ElMessageBox.prompt('下架后该作品立即对外不可见，请填写处理原因。', '下架作品', {
      confirmButtonText: '确认下架',
      cancelButtonText: '取消',
      inputPattern: /^.{1,}$/,
      inputErrorMessage: '请填写处理原因',
    })
    await handleReport(row.id, { action: 'offline', ...(value ? { note: value } : {}) })
    ElMessage.success('作品已下架')
    await load()
  } catch {
    // 取消
  }
}

/** 处理为封禁：停用被举报化妆师账号（同 E12-04） */
async function ban(row: AdminReportItem) {
  try {
    await ElMessageBox.confirm(
      '封禁后该化妆师账号立即停用，不可进入业务页。确认封禁？',
      '封禁账号',
      { confirmButtonText: '确认封禁', cancelButtonText: '取消' },
    )
    await handleReport(row.id, { action: 'ban' })
    ElMessage.success('账号已封禁')
    await load()
  } catch {
    // 取消
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
        <el-select
          v-model="query.targetType"
          placeholder="对象类型"
          clearable
          style="width: 130px"
          @change="search"
        >
          <el-option label="作品" value="portfolio" />
          <el-option label="化妆师" value="artist" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="举报原因关键字"
          clearable
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" row-key="id" style="width: 100%">
      <el-table-column prop="id" label="编号" width="70" />
      <el-table-column label="举报对象" min-width="220">
        <template #default="{ row }">
          <span>{{ row.targetLabel }}</span>
        </template>
      </el-table-column>
      <el-table-column label="举报人" min-width="110">
        <template #default="{ row }">{{ row.reporter.nickname }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="原因" min-width="200" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTag[row.status] || 'info'" effect="light">
            {{ STATUS_OPTIONS.report.find((item) => item.value === row.status)?.label || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="处理结果" min-width="180">
        <template #default="{ row }">{{ row.handleResult || '—' }}</template>
      </el-table-column>
      <el-table-column label="举报时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column v-if="auth.canManage" label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button link type="info" @click="dismiss(row)">未成立</el-button>
            <el-button v-if="row.targetType === 'portfolio'" link type="warning" @click="offline(row)">
              下架
            </el-button>
            <el-button link type="danger" @click="ban(row)">封禁</el-button>
          </template>
          <span v-else class="muted-text">已处理</span>
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

.muted-text {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-md);
}
</style>
