/**
 * 需求 DTO → demand-card 组件展示模型的公共映射。
 * 需求大厅（E8-01）与工作台「适合你的需求」共用同一口径。
 */

const SERVICE_TYPE_LABELS = {
  bridal: '婚礼跟妆',
  daily: '日常妆造',
  event: '商业活动',
  photo: '写真拍摄',
}

function monthDay(value) {
  const parts = String(value || '').split('-')
  if (parts.length !== 3) return value || ''
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

function budgetText(min, max) {
  return min === max ? `${min}` : `${min}–${max}`
}

/** 服务日次日零点截止，剩余天数按自然日粗略计算 */
function deadlineText(expireAt) {
  if (!expireAt) return '长期有效'
  const diff = new Date(expireAt).getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (days <= 0) return '已截止'
  if (days === 1) return '今日截止'
  return `${days} 天后截止`
}

/** 接口 DTO → 需求卡片展示模型（E8-01） */
function toDemandCard(item) {
  const typeLabel = SERVICE_TYPE_LABELS[item.serviceType] || item.serviceType
  const responded = Boolean(item.myResponseId)
  const dateText = monthDay(item.serviceDate)
  const remarkText = (item.remark || '').trim()
  return {
    id: item.id,
    eyebrow: `${typeLabel} · ${item.city}`,
    title: remarkText
      ? remarkText.length > 16
        ? `${remarkText.slice(0, 16)}…`
        : remarkText
      : `${typeLabel}需求`,
    occasion: typeLabel,
    people: item.headcount,
    duration: '当天服务',
    pay: budgetText(item.budgetMin, item.budgetMax),
    payUnit: '单',
    district: `${item.city} · ${item.district}`,
    distance: item.isTargeted ? '定向预约' : '同城',
    date: `${dateText} 服务`,
    deadline: responded ? '已响应，等待客户确认' : deadlineText(item.expireAt),
    status: responded ? '已响应' : item.statusLabel,
    statusTone: responded ? 'brand' : 'warning',
    keyword: `${typeLabel}${item.city}${item.district}${item.remark || ''}`,
  }
}

module.exports = {
  SERVICE_TYPE_LABELS,
  monthDay,
  budgetText,
  deadlineText,
  toDemandCard,
}
