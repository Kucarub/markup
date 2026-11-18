/**
 * 环境配置：按小程序 envVersion 自动切换域名。
 * - develop：开发者工具 / 开发版
 * - trial：体验版
 * - release：正式版
 * 本地联调需在开发者工具中勾选「不校验合法域名」。
 */
const ENVS = {
  develop: {
    name: 'dev',
    baseURL: 'http://127.0.0.1:3100',
    debug: true,
  },
  trial: {
    name: 'trial',
    baseURL: 'https://staging-api.example.com',
    debug: true,
  },
  release: {
    name: 'prod',
    baseURL: 'https://api.example.com',
    debug: false,
  },
}

function resolveEnvVersion() {
  try {
    const info = wx.getAccountInfoSync()
    return (info && info.miniProgram && info.miniProgram.envVersion) || 'develop'
  } catch (error) {
    return 'develop'
  }
}

const envVersion = resolveEnvVersion()
const current = ENVS[envVersion] || ENVS.develop

module.exports = {
  ...current,
  envVersion,
  storageKeys: {
    TOKEN: 'token',
    REFRESH_TOKEN: 'refreshToken',
    ROLE: 'role',
  },
}
