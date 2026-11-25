/**
 * 业务字典（与 server/prisma/seed.ts 的 dict_item 保持一致）。
 * 风格用 code 传输，展示时映射为中文标签。
 */

/** 试点城市收敛为上海 / 太仓 / 昆山；服务端 dict_item 的城市字典需同步，否则历史数据城市可能不在选项内 */
const CITIES = ['上海', '太仓', '昆山']

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
