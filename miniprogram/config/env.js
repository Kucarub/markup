/**
 * 环境配置：按小程序 envVersion 自动切换域名。
 * - develop：开发者工具 / 开发版
 * - trial：体验版
 * - release：正式版
 * 本地联调需在开发者工具中勾选「不校验合法域名」。
 *
 * 注意：真机无法访问 127.0.0.1（指向手机自身），develop 必须用电脑的局域网 IP，
 * 且手机与电脑在同一 Wi-Fi。IP 变化时改这里（可用 ipconfig 查看）。
 */
const DEV_LAN_HOST = '192.168.0.251'

const ENVS = {
  develop: {
    name: 'dev',
    baseURL: `http://${DEV_LAN_HOST}:3000`,
    debug: true,
  },
  trial: {
    name: 'trial',
    baseURL: 'http://106.15.8.132',
    debug: true,
  },
  release: {
    name: 'prod',
    baseURL: 'http://106.15.8.132',
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
    USER_ID: 'userId',
  },
}
