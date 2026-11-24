<script setup lang="ts">
import { ElMessage, type FormInstance } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import {
  createOpsDemand,
  createOpsResponse,
  fetchArtistOptions,
  fetchCustomerOptions,
  fetchDemandDetail,
  fetchDemands,
  SERVICE_TYPES,
  STATUS_OPTIONS,
  type AdminDemandItem,
} from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const loading = ref(false)
const list = ref<AdminDemandItem[]>([])
const counts = ref<Record<string, number>>({})
const total = ref(0)
const query = reactive({
  page: 1,
  size: 20,
  status: '' as '' | 'pending' | 'selected' | 'closed',
  serviceType: '',
  source: '' as '' | 'customer' | 'ops',
  keyword: '',
})

const statusTabs = computed(() => [
  { value: '', label: '全部', count: counts.value.all ?? 0 },
  ...STATUS_OPTIONS.demand.map((item) => ({
    value: item.value,
    label: item.label,
    count: counts.value[item.value] ?? 0,
  })),
])

const typeLabel: Record<string, string> = Object.fromEntries(
  SERVICE_TYPES.map((item) => [item.value, item.label]),
)

async function load() {
  loading.value = true
  try {
    const data = await fetchDemands({
      page: query.page,
      size: query.size,
      ...(query.status ? { status: query.status } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      ...(query.source ? { source: query.source } : {}),
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
  query.source = ''
  query.keyword = ''
  query.page = 1
  load()
}

// ---------- 详情抽屉 ----------
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<Awaited<ReturnType<typeof fetchDemandDetail>> | null>(null)

async function openDetail(row: AdminDemandItem) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    detail.value = await fetchDemandDetail(row.id)
  } finally {
    detailLoading.value = false
  }
}

// ---------- 代发布 ----------
const createVisible = ref(false)
const createRef = ref<FormInstance>()
const creating = ref(false)
const customerOptions = ref<{ id: number; nickname: string | null; city: string | null }[]>([])
const createForm = reactive({
  customerId: undefined as number | undefined,
  city: '上海',
  district: '',
  serviceDate: '',
  serviceType: 'bridal' as string,
  headcount: 1,
  budgetMin: 800,
  budgetMax: 1200,
  remark: '',
})

async function openCreate() {
  createVisible.value = true
  if (!customerOptions.value.length) {
    const data = await fetchCustomerOptions()
    customerOptions.value = data.list
  }
}

async function submitCreate() {
  if (!createForm.customerId) {
    ElMessage.warning('请选择需求所属客户')
    return
  }
  if (!createForm.district || !createForm.serviceDate) {
    ElMessage.warning('请填写区域与服务日期')
    return
  }
  creating.value = true
  try {
    await createOpsDemand({ ...createForm })
    ElMessage.success('代发布成功（source=ops）')
    createVisible.value = false
    await load()
  } finally {
    creating.value = false
  }
}

// ---------- 代响应 ----------
const respondVisible = ref(false)
const responding = ref(false)
const artistOptions = ref<{ id: number; name: string; city: string }[]>([])
const respondForm = reactive({ demandId: 0, artistId: undefined as number | undefined, note: '' })

async function openRespond(row?: AdminDemandItem) {
  const target = row || detail.value
  if (!target) return
  respondForm.demandId = target.id
  respondForm.artistId = undefined
  respondForm.note = ''
  respondVisible.value = true
  const data = await fetchArtistOptions()
  artistOptions.value = data.list
}

async function submitRespond() {
  if (!respondForm.artistId) {
    ElMessage.warning('请选择代为响应的化妆师')
    return
  }
  responding.value = true
  try {
    await createOpsResponse(respondForm.demandId, {
      artistId: respondForm.artistId,
      note: respondForm.note || undefined,
    })
    ElMessage.success('代响应成功（source=ops）')
    respondVisible.value = false
    if (detailVisible.value && detail.value) {
      detail.value = await fetchDemandDetail(detail.value.id)
    }
    await load()
  } finally {
    responding.value = false
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
        <el-select v-model="query.source" placeholder="来源" clearable style="width: 120px" @change="search">
          <el-option label="客户发布" value="customer" />
          <el-option label="运营代发布" value="ops" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="编号 / 客户 / 区域"
          clearable
          style="width: 190px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <el-button v-if="auth.canManage" type="primary" plain @click="openCreate">代发布需求</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" row-key="id" style="width: 100%">
      <el-table-column prop="id" label="编号" width="70" />
      <el-table-column label="客户" min-width="120">
        <template #default="{ row }">{{ row.customer.nickname || `客户 ${row.customer.id}` }}</template>
      </el-table-column>
      <el-table-column label="服务" min-width="150">
        <template #default="{ row }">{{ typeLabel[row.serviceType] || row.serviceType }} · {{ row.headcount }} 人</template>
      </el-table-column>
      <el-table-column label="城市 / 区域" min-width="130">
        <template #default="{ row }">{{ row.city }} · {{ row.district }}</template>
      </el-table-column>
      <el-table-column prop="serviceDate" label="服务日期" width="110" />
      <el-table-column label="预算" width="120">
        <template #default="{ row }">¥{{ row.budgetMin }}–{{ row.budgetMax }}</template>
      </el-table-column>
      <el-table-column label="响应" width="80">
        <template #default="{ row }">{{ row.responseCount }}</template>
      </el-table-column>
      <el-table-column label="来源" width="110">
        <template #default="{ row }">
          <el-tag :type="row.source === 'ops' ? 'warning' : 'info'" effect="light">
            {{ row.source === 'ops' ? '运营代发布' : '客户发布' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag
            :type="row.status === 'pending' ? 'warning' : row.status === 'selected' ? 'success' : 'info'"
            effect="light"
          >
            {{ row.status === 'pending' ? '待响应' : row.status === 'selected' ? '已选定' : '已关闭' }}
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

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="需求详情" size="560px">
      <div v-loading="detailLoading" class="drawer">
        <template v-if="detail">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="编号">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ detail.status }}</el-descriptions-item>
            <el-descriptions-item label="客户">{{ detail.customer.nickname || `客户 ${detail.customer.id}` }}</el-descriptions-item>
            <el-descriptions-item label="来源">{{ detail.source === 'ops' ? '运营代发布' : '客户发布' }}</el-descriptions-item>
            <el-descriptions-item label="服务类型">{{ typeLabel[detail.serviceType] || detail.serviceType }}</el-descriptions-item>
            <el-descriptions-item label="人数">{{ detail.headcount }}</el-descriptions-item>
            <el-descriptions-item label="城市 / 区域">{{ detail.city }} · {{ detail.district }}</el-descriptions-item>
            <el-descriptions-item label="服务日期">{{ detail.serviceDate }}</el-descriptions-item>
            <el-descriptions-item label="预算" :span="2">¥{{ detail.budgetMin }}–{{ detail.budgetMax }}</el-descriptions-item>
            <el-descriptions-item label="风格偏好" :span="2">
              {{ detail.stylePrefs.length ? detail.stylePrefs.join('、') : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ detail.remark || '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.declineReason" label="关闭原因" :span="2">
              {{ detail.declineReason }}
            </el-descriptions-item>
          </el-descriptions>

          <div class="drawer__section">
            <div class="drawer__title">
              <span>响应列表（{{ detail.responses.length }}）</span>
              <el-button
                v-if="auth.canManage && detail.status === 'pending'"
                size="small"
                type="primary"
                plain
                @click="openRespond()"
              >
                代响应
              </el-button>
            </div>
            <el-table :data="detail.responses" size="small">
              <el-table-column label="化妆师" min-width="110">
                <template #default="{ row }">{{ row.artist.name }}</template>
              </el-table-column>
              <el-table-column label="城市" width="80">
                <template #default="{ row }">{{ row.artist.city }}</template>
              </el-table-column>
              <el-table-column label="来源" width="90">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.source === 'ops' ? 'warning' : 'info'" effect="light">
                    {{ row.source === 'ops' ? '代响应' : '本人' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="80" />
            </el-table>
            <el-empty v-if="!detail.responses.length" description="暂无响应" :image-size="60" />
          </div>

          <div v-if="detail.serviceOrder" class="drawer__section">
            <div class="drawer__title">服务记录</div>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="记录编号">{{ detail.serviceOrder.id }}</el-descriptions-item>
              <el-descriptions-item label="状态">{{ detail.serviceOrder.status }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </template>
      </div>
    </el-drawer>

    <!-- 代发布 -->
    <el-dialog v-model="createVisible" title="运营代发布需求" width="520px">
      <el-form ref="createRef" :model="createForm" label-width="90px">
        <el-form-item label="所属客户" required>
          <el-select v-model="createForm.customerId" filterable placeholder="选择客户" style="width: 100%">
            <el-option
              v-for="item in customerOptions"
              :key="item.id"
              :label="`${item.nickname || `客户 ${item.id}`}${item.city ? `（${item.city}）` : ''}`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="城市" required>
          <el-input v-model="createForm.city" />
        </el-form-item>
        <el-form-item label="区域" required>
          <el-input v-model="createForm.district" placeholder="如 静安区" />
        </el-form-item>
        <el-form-item label="服务日期" required>
          <el-date-picker v-model="createForm.serviceDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="服务类型" required>
          <el-select v-model="createForm.serviceType" style="width: 100%">
            <el-option v-for="item in SERVICE_TYPES" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="人数" required>
          <el-input-number v-model="createForm.headcount" :min="1" :max="50" />
        </el-form-item>
        <el-form-item label="预算区间" required>
          <div class="budget">
            <el-input-number v-model="createForm.budgetMin" :min="0" :max="100000" :step="100" />
            <span>—</span>
            <el-input-number v-model="createForm.budgetMax" :min="0" :max="100000" :step="100" />
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createForm.remark" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">确认发布</el-button>
      </template>
    </el-dialog>

    <!-- 代响应 -->
    <el-dialog v-model="respondVisible" title="运营代响应" width="440px">
      <el-form :model="respondForm" label-width="80px">
        <el-form-item label="需求编号">{{ respondForm.demandId }}</el-form-item>
        <el-form-item label="化妆师" required>
          <el-select v-model="respondForm.artistId" filterable placeholder="选择已通过审核的化妆师" style="width: 100%">
            <el-option
              v-for="item in artistOptions"
              :key="item.id"
              :label="`${item.name}（${item.city}）`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="respondForm.note" type="textarea" :rows="2" maxlength="255" placeholder="将记录为运营代响应" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="respondVisible = false">取消</el-button>
        <el-button type="primary" :loading="responding" @click="submitRespond">确认响应</el-button>
      </template>
    </el-dialog>
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

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-md);
}

.drawer {
  &__section {
    margin-top: var(--space-lg);
  }

  &__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    margin-bottom: var(--space-sm);
  }
}

.budget {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
</style>
