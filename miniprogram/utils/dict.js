/**
 * 业务字典（与 server/prisma/seed.ts 的 dict_item 保持一致）。
 * 风格用 code 传输，展示时映射为中文标签。
 */

const CITIES = ['上海', '北京', '杭州', '苏州', '南京', '广州', '深圳', '成都']

const STYLE_OPTIONS = [
  { code: 'fresh', label: '清新' },
  { code: 'forest', label: '森系' },
  { code: 'bridal', label: '新娘' },
  { code: 'retro', label: '复古' },
  { code: 'luxury', label: '轻奢' },
  { code: 'korean', label: '韩系' },
  { code: 'japanese', label: '日系' },
  { code: 'western', label: '欧美' },
]

const STYLE_LABEL = STYLE_OPTIONS.reduce((acc, item) => {
  acc[item.code] = item.label
  return acc
}, {})

/** code → 中文标签；未知 code 原样返回，避免展示空白 */
function styleLabel(code) {
  return STYLE_LABEL[code] || code
}

function styleLabels(codes) {
  return (codes || []).map(styleLabel)
}

module.exports = {
  CITIES,
  STYLE_OPTIONS,
  styleLabel,
  styleLabels,
}
