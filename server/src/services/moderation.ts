/**
 * 评价内容安全检测（E10-06）。
 * V1 不接微信内容安全接口（未配置云环境），先用本地敏感词规则兜底：
 * 命中即置为 pending 待后台审核，未命中直接 visible。
 * 后续接入官方接口时只替换本文件实现。
 */
const RISKY_WORDS = [
  '代刷',
  '刷单',
  '返现',
  '微信支付',
  '支付宝转账',
  '加我微信',
  '私下交易',
  '裸',
  '色情',
  '赌博',
  '毒品',
  '诈骗',
]

export type ReviewStatus = 'visible' | 'pending' | 'hidden'

export interface ModerationResult {
  status: Exclude<ReviewStatus, 'hidden'>
  hit?: string
}

/** 检查评价文本：命中敏感词进入待审，否则直接可见 */
export function moderateReview(content: string | null | undefined): ModerationResult {
  const text = (content || '').toLowerCase()
  if (!text) return { status: 'visible' }
  const hit = RISKY_WORDS.find((word) => text.includes(word.toLowerCase()))
  return hit ? { status: 'pending', hit } : { status: 'visible' }
}
