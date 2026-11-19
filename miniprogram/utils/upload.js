const env = require('../config/env')
const request = require('./request')

/**
 * 作品文件上传（E4-01 / E4-04）。
 * 流程：POST /api/upload/sign 取签名 → wx.request PUT 二进制 → GET /api/files/sign 换展示地址。
 * 私有桶地址 15 分钟过期，草稿恢复时要重新换取。
 */

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
}

function extOf(filePath) {
  const matched = /\.([a-zA-Z0-9]+)$/.exec(filePath || '')
  return matched ? matched[1].toLowerCase() : ''
}

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data),
      fail: (error) => reject(new Error((error && error.errMsg) || '读取文件失败')),
    })
  })
}

/** 用签名地址直传字节流：服务端按 express.raw 读取，不能用 wx.uploadFile（只支持 POST 表单） */
function putBinary(url, buffer, mimeType) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'PUT',
      data: buffer,
      timeout: 60000,
      header: { 'Content-Type': mimeType },
      success: (res) => {
        const body = res.data || {}
        if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
          resolve(body.data)
          return
        }
        reject(new Error(body.message || `上传失败(${res.statusCode})`))
      },
      fail: (error) => reject(new Error((error && error.errMsg) || '上传失败')),
    })
  })
}

/** 换取私有文件读取地址（含签名） */
function signWorkUrl(fileId) {
  return request.get('/api/files/sign', { fileId }, { showError: false })
}

/** 完整可访问地址（私有桶签名路径） */
function absoluteUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${env.baseURL}${path}`
}

/**
 * 上传单个作品文件。
 * @param {{filePath: string, size: number, mediaType?: 'image'|'video'}} options
 * @returns {Promise<{fileId: number, type: 'image'|'video', path: string}>}
 */
function uploadWorkFile(options) {
  const { filePath, size, mediaType } = options
  const ext = extOf(filePath) || (mediaType === 'video' ? 'mp4' : 'jpg')
  const mimeType = MIME_BY_EXT[ext]
  if (!mimeType) return Promise.reject(new Error('仅支持 jpg / png / webp / mp4 文件'))

  return request
    .post(
      '/api/upload/sign',
      { scene: 'portfolio', fileName: `work-${Date.now()}.${ext}`, mimeType, size },
      { showError: false },
    )
    .then((sign) =>
      readFile(filePath)
        .then((buffer) => putBinary(`${env.baseURL}${sign.uploadPath}`, buffer, mimeType))
        .then(() => sign),
    )
    .then((sign) =>
      signWorkUrl(sign.fileId).then((signed) => ({
        fileId: sign.fileId,
        type: mimeType.startsWith('video/') ? 'video' : 'image',
        path: signed.path,
      })),
    )
}

module.exports = {
  uploadWorkFile,
  signWorkUrl,
  absoluteUrl,
}
