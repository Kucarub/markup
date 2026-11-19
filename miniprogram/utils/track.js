const request = require('./request')

/**
 * 埋点上报（E8-08）：失败静默，不阻塞用户操作。
 * 事件名约定见 server/src/routes/events.ts：小写字母 / 数字 / 下划线。
 */
function track(event, props) {
  request
    .post('/api/events', { event, props: props || {} }, { showError: false })
    .catch(() => {})
}

module.exports = { track }
