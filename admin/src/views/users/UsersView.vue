<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { fetchUsers, setUserStatus, type AdminUserItem } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const loading = ref(false)
const list = ref<AdminUserItem[]>([])
const counts = ref<Record<string, number>>({})
const total = ref(0)
const query = reactive({
  page: 1,
  size: 20,
  role: '' as '' | 'artist' | 'customer',
  status: '' as '' | 'active' | 'disabled',
  keyword: '',
})

const roleTabs = computed(() => [
  { value: '', label: '全部', count: counts.value.all ?? 0 },
  { value: 'artist', label: '化妆师', count: counts.value.artist ?? 0 },
  { value: 'customer', label: '客户', count: counts.value.customer ?? 0 },
])

const roleLabel: Record<string, string> = { artist: '化妆师', customer: '客户' }

async function load() {
  loading.value = true
  try {
    const data = await fetchUsers({
      page: query.page,
      size: query.size,
      ...(query.role ? { role: query.role } : {}),
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

function handleRole(value: string) {
  query.role = value as typeof query.role
  query.page = 1
  load()
}

function search() {
  query.page = 1
  load()
}

function reset() {
  query.role = ''
  query.status = ''
  query.keyword = ''
  query.page = 1
  load()
}

function displayName(row: AdminUserItem) {
  return row.artist?.name || row.customer?.nickname || row.nickname || `用户 ${row.userId}`
}

async function toggleStatus(row: AdminUserItem) {
  const disabling = row.status === 'active'
  try {
    let reason: string | undefined
    if (disabling) {
      const result = await ElMessageBox.prompt(
        `封禁后该账号将无法登录与操作，请填写原因（至少 2 个字）`,
        '封禁账号',
        {
          confirmButtonText: '确认封禁',
          cancelButtonText: '取消',
          inputPattern: /^.{2,}$/,
          inputErrorMessage: '请填写至少 2 个字的原因',
        },
      )
      reason = result.value
    } else {
      await ElMessageBox.confirm('确认解封该账号？', '解封账号', {
        confirmButtonText: '解封',
        cancelButtonText: '取消',
      })
    }
    await setUserStatus(row.userId, { status: disabling ? 'disabled' : 'active', reason })
    ElMessage.success(disabling ? '已封禁' : '已解封')
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
      <el-radio-group :model-value="query.role" @update:model-value="handleRole">
        <el-radio-button v-for="tab in roleTabs" :key="tab.value" :value="tab.value">
          {{ tab.label }}（{{ tab.count }}）
        </el-radio-button>
      </el-radio-group>

      <div class="toolbar__right">
        <el-select v-model="query.status" placeholder="账号状态" clearable style="width: 130px" @change="search">
          <el-option label="正常" value="active" />
          <el-option label="已禁用" value="disabled" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="昵称 / 姓名 / 城市"
          clearable
          style="width: 200px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" row-key="userId" style="width: 100%">
      <el-table-column prop="userId" label="用户 ID" width="90" />
      <el-table-column label="昵称 / 姓名" min-width="140">
        <template #default="{ row }">{{ displayName(row) }}</template>
      </el-table-column>
      <el-table-column label="角色" width="90">
        <template #default="{ row }">
          <el-tag effect="light" :type="row.role === 'artist' ? 'primary' : 'info'">
            {{ roleLabel[row.role] || row.role }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="城市" width="100">
        <template #default="{ row }">{{ row.artist?.city || row.customer?.city || '—' }}</template>
      </el-table-column>
      <el-table-column label="手机号" width="130">
        <template #default="{ row }">{{ row.phoneMasked || '—' }}</template>
      </el-table-column>
      <el-table-column label="信用分" width="100">
        <template #default="{ row }">
          <span v-if="row.credit">{{ row.credit.score }}（{{ row.credit.level }}）</span>
          <span v-else class="text-secondary">—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'danger'" effect="light">
            {{ row.status === 'active' ? '正常' : '已禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="注册时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column v-if="auth.canManage" label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            :type="row.status === 'active' ? 'danger' : 'success'"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '封禁' : '解封' }}
          </el-button>
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

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-md);
}
</style>
