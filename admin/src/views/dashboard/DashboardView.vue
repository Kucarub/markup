<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchDashboardStats, type DashboardDay, type DashboardStats } from '@/api/admin'

/**
 * 数据看板（E13-03）：
 * - 6 个核心指标 + 7 日留存，口径与 PRD 第 1 章一致；
 * - 趋势图零依赖手写 SVG，按所选区间联动；
 * - 空数据（无记录）一律展示 0，不报错。
 */

const DAY_MS = 24 * 60 * 60 * 1000
const range = ref(14)
const loading = ref(false)
const data = ref<DashboardStats | null>(null)

const EMPTY_TOTALS = {
  registrations: 0,
  artistPageUv: 0,
  demands: 0,
  responses: 0,
  responseRate: 0,
  serviceOrders: 0,
  completionRate: 0,
  retentionD7: 0,
}

const totals = computed(() => data.value?.totals ?? EMPTY_TOTALS)
const series = computed(() => data.value?.series ?? [])

/** 比率 0–1：0 直接显示 0，避免出现「0.0%」 */
function formatRate(value: number): string {
  if (!value) return '0'
  return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`
}

const cards = computed(() => [
  { label: '新注册账号', value: String(totals.value.registrations), hint: '区间内新建账号数' },
  { label: '主页 UV', value: String(totals.value.artistPageUv), hint: '按设备 + 自然日去重' },
  { label: '需求发布数', value: String(totals.value.demands), hint: '含运营代发布' },
  {
    label: '需求响应率',
    value: formatRate(totals.value.responseRate),
    hint: '≥1 条响应的需求 ÷ 需求总数',
  },
  { label: '服务记录数', value: String(totals.value.serviceOrders), hint: '区间内新建服务记录' },
  {
    label: '服务完成率',
    value: formatRate(totals.value.completionRate),
    hint: '已完成 ÷ 服务记录总数',
  },
  {
    label: '7 日留存',
    value: formatRate(totals.value.retentionD7),
    hint: 'D-7 注册用户当日回访占比',
  },
])

const opsItems = computed(() => [
  { label: '待审核化妆师', value: data.value?.counts.pendingArtists ?? 0, to: '/audit/artists' },
  { label: '已禁用账号', value: data.value?.counts.disabledUsers ?? 0, to: '/users' },
  { label: '待确认服务记录', value: data.value?.counts.pendingOrders ?? 0, to: '/orders' },
  { label: '累计完成服务记录', value: data.value?.counts.finishedOrders ?? 0, to: '/orders' },
])

/** 趋势图展示的数量类指标（比率另有卡片展示） */
const METRICS = [
  { key: 'registrations', label: '注册数', color: 'var(--color-primary)' },
  { key: 'artistPageUv', label: '主页 UV', color: 'var(--color-info)' },
  { key: 'demands', label: '需求数', color: 'var(--color-warning)' },
  { key: 'serviceOrders', label: '服务记录数', color: 'var(--color-success)' },
] as const satisfies readonly { key: keyof Omit<DashboardDay, 'date'>; label: string; color: string }[]

const CHART = { w: 720, h: 240, left: 44, right: 16, top: 16, bottom: 28 }

/** 把最大值向上取整到 1/2/5 的整十倍，保证刻度可读 */
function niceCeil(value: number): number {
  if (value <= 4) return 4
  const base = Math.pow(10, Math.floor(Math.log10(value)))
  const norm = value / base
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * base
}

const chart = computed(() => {
  const rows = series.value
  const count = rows.length
  const innerW = CHART.w - CHART.left - CHART.right
  const innerH = CHART.h - CHART.top - CHART.bottom
  const rawMax = rows.reduce(
    (max, row) => Math.max(max, ...METRICS.map((metric) => row[metric.key])),
    0,
  )
  const max = niceCeil(rawMax)
  const xAt = (index: number) =>
    count <= 1 ? CHART.left + innerW / 2 : CHART.left + (index / (count - 1)) * innerW
  const yAt = (value: number) => CHART.top + (1 - value / max) * innerH

  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: yAt(max * ratio),
    label: Math.round(max * ratio),
  }))

  // 横轴最多 7 个刻度，30 天时抽稀
  const step = Math.max(1, Math.ceil(count / 7))
  const ticks = rows
    .map((row, index) => ({ x: xAt(index), label: row.date.slice(5) }))
    .filter((_, index) => index % step === 0 || index === count - 1)

  const lines = METRICS.map((metric) => ({
    ...metric,
    points: rows
      .map((row, index) => `${xAt(index).toFixed(1)},${yAt(row[metric.key]).toFixed(1)}`)
      .join(' '),
  }))

  // 点太多会糊成一片，区间短时才画
  const dots =
    count <= 14
      ? METRICS.flatMap((metric) =>
          rows.map((row, index) => ({
            cx: xAt(index),
            cy: yAt(row[metric.key]),
            color: metric.color,
          })),
        )
      : []

  return { grid, ticks, lines, dots, rawMax }
})

const chartEmpty = computed(() => chart.value.rawMax === 0)

function dayStr(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

async function load() {
  loading.value = true
  const to = new Date()
  const from = new Date(to.getTime() - (range.value - 1) * DAY_MS)
  try {
    data.value = await fetchDashboardStats({ from: dayStr(from), to: dayStr(to) })
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <div class="toolbar page-card">
      <div>
        <h2 class="page-title">数据看板</h2>
        <p class="toolbar__hint text-secondary">
          <template v-if="data">{{ data.from }} ~ {{ data.to }}（{{ data.days }} 天）·</template>
          指标口径与 PRD 第 1 章一致
        </p>
      </div>
      <div class="toolbar__right">
        <el-radio-group v-model="range" @change="load">
          <el-radio-button :value="7">近 7 天</el-radio-button>
          <el-radio-button :value="14">近 14 天</el-radio-button>
          <el-radio-button :value="30">近 30 天</el-radio-button>
        </el-radio-group>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <div class="metrics">
      <div v-for="card in cards" :key="card.label" class="metric page-card">
        <span class="metric__label">{{ card.label }}</span>
        <strong class="metric__value">{{ card.value }}</strong>
        <span class="metric__hint">{{ card.hint }}</span>
      </div>
    </div>

    <div class="page-card">
      <div class="chart-head">
        <h3 class="chart-head__title">每日趋势</h3>
        <div class="legend">
          <span v-for="metric in METRICS" :key="metric.key" class="legend__item">
            <i class="legend__dot" :style="{ background: metric.color }" />{{ metric.label }}
          </span>
        </div>
      </div>

      <div class="chart-wrap">
        <svg
          class="chart"
          :viewBox="`0 0 ${CHART.w} ${CHART.h}`"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="每日指标趋势"
        >
          <line
            v-for="(item, index) in chart.grid"
            :key="`grid-${index}`"
            class="chart__grid"
            :x1="CHART.left"
            :x2="CHART.w - CHART.right"
            :y1="item.y"
            :y2="item.y"
          />
          <text
            v-for="(item, index) in chart.grid"
            :key="`grid-label-${index}`"
            class="chart__axis"
            :x="CHART.left - 8"
            :y="item.y + 4"
            text-anchor="end"
          >
            {{ item.label }}
          </text>
          <text
            v-for="(item, index) in chart.ticks"
            :key="`x-${index}`"
            class="chart__axis"
            :x="item.x"
            :y="CHART.h - 8"
            text-anchor="middle"
          >
            {{ item.label }}
          </text>
          <polyline
            v-for="line in chart.lines"
            :key="line.key"
            :points="line.points"
            fill="none"
            :stroke="line.color"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <circle
            v-for="(dot, dotIndex) in chart.dots"
            :key="`dot-${dotIndex}`"
            :cx="dot.cx"
            :cy="dot.cy"
            r="3"
            :fill="dot.color"
          />
        </svg>
        <p v-if="chartEmpty" class="chart__empty">所选区间暂无指标数据</p>
      </div>
    </div>

    <div class="page-card">
      <h3 class="chart-head__title">运营待办</h3>
      <div class="ops">
        <router-link v-for="item in opsItems" :key="item.label" :to="item.to" class="ops__item">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;

  .page-title {
    margin-bottom: var(--space-xs);
  }

  &__hint {
    margin: 0;
    font-size: var(--font-size-xs);
  }

  &__right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  gap: var(--space-md);
}

.metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  &__label {
    color: var(--color-text-secondary);
  }

  &__value {
    font-size: var(--font-size-xxl);
    line-height: 1.2;
    color: var(--color-primary-dark);
  }

  &__hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-placeholder);
  }
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);

  &__title {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: 600;
  }
}

.legend {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);

  &__item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pill);
  }
}

.chart-wrap {
  position: relative;
}

.chart {
  display: block;
  width: 100%;
  height: auto;

  &__grid {
    stroke: var(--color-divider);
    stroke-width: 1;
  }

  &__axis {
    fill: var(--color-text-placeholder);
    font-size: 11px;
  }

  &__empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    color: var(--color-text-secondary);
    pointer-events: none;
  }
}

.ops {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-md);

  &__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-md);
    border-radius: var(--radius-sm);
    background: var(--color-primary-soft);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);

    strong {
      font-size: var(--font-size-xl);
      color: var(--color-primary-dark);
    }

    &:hover {
      background: var(--color-primary-tint);
    }
  }
}
</style>
