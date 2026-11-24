<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  approveArtist,
  fetchArtistAuditDetail,
  rejectArtist,
  revealArtistIdCard,
  type AuditArtistDetail,
} from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const id = Number(route.params.id)
const loading = ref(false)
const detail = ref<AuditArtistDetail | null>(null)
const idCardPlain = ref('')
const submitting = ref(false)

const statusTagType: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  disabled: 'info',
}

async function load() {
  loading.value = true
  try {
    detail.value = await fetchArtistAuditDetail(id)
  } finally {
    loading.value = false
  }
}

/** 解密明文：二次确认后请求，服务端写 audit_log 留痕 */
async function reveal() {
  try {
    await ElMessageBox.confirm(
      '查看身份证明文会记录到审核日志（操作人、时间、对象），请确认确有审核需要。',
      '二次确认',
      { confirmButtonText: '确认查看', cancelButtonText: '取消', type: 'warning' },
    )
    const data = await revealArtistIdCard(id)
    idCardPlain.value = data.idCard
    ElMessage.success('已解密，本次查看已留痕')
    await load()
  } catch {
    // 取消
  }
}

async function handleApprove() {
  try {
    await ElMessageBox.confirm('确认通过该化妆师的入驻申请？', '审核通过', {
      confirmButtonText: '通过',
      cancelButtonText: '取消',
    })
    submitting.value = true
    await approveArtist(id)
    ElMessage.success('已通过')
    await load()
  } catch {
    // 取消或错误
  } finally {
    submitting.value = false
  }
}

async function handleReject() {
  try {
    const result = await ElMessageBox.prompt('请填写驳回原因（至少 2 个字）', '审核驳回', {
      confirmButtonText: '确认驳回',
      cancelButtonText: '取消',
      inputPattern: /^.{2,}$/,
      inputErrorMessage: '请填写至少 2 个字的原因',
    })
    submitting.value = true
    await rejectArtist(id, result.value)
    ElMessage.success('已驳回')
    await load()
  } catch {
    // 取消或错误
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading">
    <div class="header">
      <el-button link type="primary" @click="router.back()">← 返回列表</el-button>
      <div v-if="detail" class="header__actions">
        <template v-if="detail.status === 'pending' && auth.canManage">
          <el-button type="success" :loading="submitting" @click="handleApprove">审核通过</el-button>
          <el-button type="danger" :loading="submitting" @click="handleReject">驳回</el-button>
        </template>
        <el-tag :type="statusTagType[detail.status] || 'info'" effect="light">
          {{ detail.statusLabel }}
        </el-tag>
      </div>
    </div>

    <template v-if="detail">
      <div class="page-card section">
        <h2 class="page-title">入驻资料</h2>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="姓名">{{ detail.name }}</el-descriptions-item>
          <el-descriptions-item label="城市 / 区域">
            {{ detail.city }} · {{ detail.district || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="从业年限">{{ detail.years }} 年</el-descriptions-item>
          <el-descriptions-item label="擅长风格">
            {{ detail.styles.length ? detail.styles.join('、') : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="手机号">{{ detail.user.phoneMasked || '—' }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">
            {{ new Date(detail.submittedAt).toLocaleString() }}
          </el-descriptions-item>
          <el-descriptions-item label="身份证" :span="2">
            <span class="id-card">{{ idCardPlain || detail.idCardMasked || '未提交' }}</span>
            <el-button
              v-if="detail.hasIdCard && !idCardPlain"
              link
              type="primary"
              style="margin-left: 8px"
              @click="reveal"
            >
              查看明文
            </el-button>
            <el-tag v-if="idCardPlain" type="warning" effect="light" style="margin-left: 8px">
              已留痕
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="驳回原因" :span="3">
            {{ detail.rejectReason || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="个人简介" :span="3">
            {{ detail.intro || '—' }}
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <div class="page-card section">
        <h2 class="page-title">作品材料（{{ detail.works.length }}）</h2>
        <div v-if="detail.works.length" class="works">
          <div v-for="work in detail.works" :key="work.id" class="works__item">
            <el-image
              v-if="work.type === 'image'"
              :src="work.path"
              :preview-src-list="[work.path]"
              fit="cover"
              class="works__image"
            />
            <div v-else class="works__video">{{ work.title }}</div>
            <span class="works__title">{{ work.title }}</span>
          </div>
        </div>
        <el-empty v-else description="暂无作品" />
      </div>

      <div class="page-card section">
        <h2 class="page-title">操作流水</h2>
        <el-timeline v-if="detail.logs.length">
          <el-timeline-item
            v-for="log in detail.logs"
            :key="log.id"
            :timestamp="new Date(log.createdAt).toLocaleString()"
          >
            <strong>{{ log.action }}</strong>
            <span class="text-secondary"> · {{ log.operator }}</span>
            <span v-if="log.reason" class="text-secondary"> · {{ log.reason }}</span>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无操作记录" />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
}

.section + .section {
  margin-top: var(--space-md);
}

.id-card {
  font-family: 'SFMono-Regular', Consolas, monospace;
  letter-spacing: 0.5px;
}

.works {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-md);

  &__image,
  &__video {
    width: 100%;
    height: 140px;
    border-radius: var(--radius-sm);
    background: var(--color-bg-muted);
  }

  &__video {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__title {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
