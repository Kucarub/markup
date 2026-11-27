/**
 * 「我的」页菜单结构：纯 UI 配置（非业务数据）。
 * - note 用于展示服务端可验证的信息，没有对应能力前不填，避免展示假数据；
 * - about 暂不上线，由页面过滤。
 */
const mineMenu = [
  { key: 'deliveries', label: '接单中心', icon: 'send' },
  { key: 'records', label: '服务记录', icon: 'check-info' },
  { key: 'notifications', label: '消息通知', icon: 'bell' },
  { key: 'favorites', label: '我的收藏', icon: 'bookmark' },
  { key: 'schedule', label: '档期管理', icon: 'calendar' },
  { key: 'skills', label: '技能认证', icon: 'file-check' },
  { key: 'level', label: '我的等级', icon: 'award' },
  { key: 'help', label: '帮助与反馈', icon: 'help', separator: true },
  { key: 'about', label: '关于我们', icon: 'info' },
]

module.exports = { mineMenu }
