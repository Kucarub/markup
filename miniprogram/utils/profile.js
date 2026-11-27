/**
 * 展示层资料组装：化妆师资料完整度与工作台 profile 卡片。
 * 完整度按「姓名 / 城市 / 从业年限 / 擅长风格 / 自我介绍 / 作品」6 项等权计算。
 */

const FIELDS_TOTAL = 6

function computeCompleteness(artist) {
  if (!artist) return 0
  const filled = [
    artist.name,
    artist.city,
    Number(artist.years) > 0,
    (artist.styles || []).length,
    artist.intro,
    (artist.works || []).length,
  ].filter(Boolean).length
  return Math.round((filled / FIELDS_TOTAL) * 100)
}

module.exports = { computeCompleteness }
