<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  batchAuditArtists,
  downloadArtistAudits,
  fetchArtistAudits,
  STATUS_OPTIONS,
  type AuditArtistItem,
} from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const exporting = ref(false)
const list = ref<AuditArtistItem[]>([])
const counts = ref<Record<string, number>>({})
const total = ref(0)
const selection = ref<AuditArtistItem[]>([])

const query = reactive({
  page: 1,
  size: 20,
  status: '' as '' | 'pending' | 'approved' | 'rejected' | 'disabled',
  keyword: '',
})

const statusTabs = computed(() => [
  { value: '', label: '全部', count: counts.value.all ?? 0 },
  ...STATUS_OPTIONS.audit.map((item) => ({
    value: item.value,
    label: item.label,
    count: counts.value[item.value] ?? 0,
  })),
])

const statusTagType: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  disabled: 'info',
}

async function load() {
  loading.value = true
  try {
    const data = await fetchArtistAudits({
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

function goDetail(row: AuditArtistItem) {
  router.push(`/audit/artists/${row.id}`)
}

async function handleExport() {
  exporting.value = true
  try {
    await downloadArtistAudits({
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword ? { keyword: query.keyword } : {}),
    })
    ElMessage.success('导出成功')
  } finally {
    exporting.value = false
  }
}

async function batch(action: 'approve' | 'reject') {
  const ids = selection.value.filter((item) => item.status === 'pending').map((item) => item.id)
  if (!ids.length) {
    ElMessage.warning('请选择待审核的申请')
    return
  }
  try {
    let reason: string | undefined
    if (action === 'reject') {
      const result = await ElMessageBox.prompt(
        `将驳回 ${ids.length} 条申请，请填写驳回原因（至少 2 个字）`,
        '批量驳回',
        { confirmButtonText: '确认驳回', cancelButtonText: '取消', inputPattern: /^.{2,}$/, inputErrorMessage: '请填写至少 2 个字的原因' },
      )
      reason = result.value
    } else {
      await ElMessageBox.confirm(`确认通过 ${ids.length} 条申请？`, '批量通过', {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
      })
    }
    const result = await batchAuditArtists({ ids, action, reason })
    const failedCount = result.failed.length
    ElMessage.success(`成功 ${result.success.length} 条${failedCount ? `，失败 ${failedCount} 条` : ''}`)
    await load()
  } catch {
    // 取消或错误提示由拦截器处理
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
          placeholder="姓名 / 城市 / 区域"
          clearable
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <el-button :loading="exporting" @click="handleExport">导出 xlsx</el-button>
      </div>
    </div>

    <div v-if="auth.canManage" class="batch-bar">
      <span class="text-secondary">已选 {{ selection.length }} 条（仅待审核可批量处理）</span>
      <el-button size="small" type="success" @click="batch('approve')">批量通过</el-button>
      <el-button size="small" type="danger" @click="batch('reject')">批量驳回</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="list"
      row-key="id"
      style="width: 100%"
      @selection-change="(rows: AuditArtistItem[]) => (selection = rows)"
    >
      <el-table-column v-if="auth.canManage" type="selection" width="46" />
      <el-table-column prop="id" label="编号" width="70" />
      <el-table-column prop="name" label="姓名" min-width="120" />
      <el-table-column label="城市 / 区域" min-width="130">
        <template #default="{ row }">{{ row.city }} · {{ row.district || '—' }}</template>
      </el-table-column>
      <el-table-column prop="years" label="从业年限" width="90" />
      <el-table-column prop="worksCount" label="作品数" width="80" />
      <el-table-column label="手机号" width="130">
        <template #default="{ row }">{{ row.phoneMasked || '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType[row.status] || 'info'" effect="light">
            {{ row.statusLabel }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="提交时间" width="170">
        <template #default="{ row }">{{ new Date(row.submittedAt).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row)">详情</el-button>
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
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-md);
}
</style>
