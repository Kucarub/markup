const request = require('./request')

/**
 * 订阅消息授权（E11-01）。
 * - 服务端 GET /api/subscriptions 返回各模板的配置与 shouldPrompt 决策（拒绝后 7 天静默）；
 * - 页面 onLoad 先 prefetch() 预热，用户点击时 ensure() 直接用缓存，
 *   保证 wx.requestSubscribeMessage 仍在点击手势的有效期内；
 * - 授权/拒绝结果统一回写服务端，失败不打断主流程。
 */
let cachedTemplates = null
let prefetching = null

function prefetch() {
  if (cachedTemplates || prefetching) return prefetching || Promise.resolve(cachedTemplates)
  prefetching = request
    .get('/api/subscriptions', null, { showError: false })
    .then((data) => {
      cachedTemplates = (data && data.templates) || []
      return cachedTemplates
    })
    .catch(() => [])
    .then((list) => {
      prefetching = null
      return list
    })
  return prefetching
}

function submitResults(results) {
  if (!results.length) return Promise.resolve(null)
  return request
    .post('/api/subscriptions', { results }, { showError: false })
    .then((data) => {
      if (data && data.templates) cachedTemplates = data.templates
      return data
    })
    .catch(() => null)
}

/**
 * 按需申请订阅授权。
 * @param {string[]} [keys] 需要授权的模板（invitation / result），缺省为全部模板
 * @returns {Promise<Array<{key: string, status: string}>|null>} 用户本次的授权结果
 */
function ensure(keys) {
  if (!wx.requestSubscribeMessage) return Promise.resolve(null)

  return prefetch().then((templates) => {
    const wanted = keys && keys.length ? keys : templates.map((item) => item.key)
    const targets = templates.filter(
      (item) => wanted.indexOf(item.key) > -1 && item.configured && item.shouldPrompt,
    )
    if (!targets.length) return null

    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: targets.slice(0, 3).map((item) => item.templateId),
        success: (res) => {
          const results = targets.map((item) => ({
            key: item.key,
            status: res[item.templateId] === 'accept' ? 'accepted' : 'rejected',
          }))
          submitResults(results).then(() => resolve(results))
        },
        fail: () => resolve(null),
      })
    })
  })
}

/** 清除缓存（退出登录 / 切换身份时调用） */
function reset() {
  cachedTemplates = null
  prefetching = null
}

module.exports = {
  prefetch,
  ensure,
  reset,
}
