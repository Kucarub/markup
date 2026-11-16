const env = require('../config/env')
const { getToken, redirectToLogin } = require('./auth')

const UNAUTHORIZED_CODES = [40100, 40101]

function buildUrl(url) {
  if (/^https?:\/\//.test(url)) return url
  return `${env.baseURL}${url.startsWith('/') ? url : `/${url}`}`
}

/**
 * 统一请求封装
 * @param {object} options
 * @param {string} options.url            相对路径（自动拼 baseURL）或完整 URL
 * @param {string} [options.method]       GET | POST | PUT | DELETE
 * @param {object} [options.data]
 * @param {object} [options.header]
 * @param {boolean} [options.auth]        是否注入 token，默认 true
 * @param {boolean} [options.loading]     是否显示 loading，默认 false
 * @param {boolean} [options.showError]   失败是否 toast，默认 true
 * @returns {Promise<any>} resolve 统一响应体中的 data
 */
function request(options) {
  const {
    url,
    method = 'GET',
    data,
    header = {},
    auth = true,
    loading = false,
    showError = true,
  } = options

  const token = getToken()

  return new Promise((resolve, reject) => {
    if (loading) {
      wx.showLoading({ title: '加载中', mask: true })
    }

    wx.request({
      url: buildUrl(url),
      method,
      data,
      timeout: 15000,
      header: {
        'content-type': 'application/json',
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...header,
      },
      success(res) {
        const body = res.data || {}

        if (res.statusCode === 401 || UNAUTHORIZED_CODES.indexOf(body.code) > -1) {
          redirectToLogin()
          reject(Object.assign(new Error(body.message || '登录已失效'), { code: body.code }))
          return
        }

        if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
          resolve(body.data)
          return
        }

        const message = body.message || `请求失败(${res.statusCode})`
        if (showError) {
          wx.showToast({ title: message, icon: 'none' })
        }
        reject(Object.assign(new Error(message), { code: body.code, statusCode: res.statusCode }))
      },
      fail(error) {
        if (showError) {
          wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
        }
        reject(error)
      },
      complete() {
        if (loading) {
          wx.hideLoading()
        }
      },
    })
  })
}

function get(url, params, options) {
  return request({ ...options, url, method: 'GET', data: params })
}

function post(url, data, options) {
  return request({ ...options, url, method: 'POST', data })
}

function put(url, data, options) {
  return request({ ...options, url, method: 'PUT', data })
}

function del(url, data, options) {
  return request({ ...options, url, method: 'DELETE', data })
}

module.exports = {
  request,
  get,
  post,
  put,
  del,
}
