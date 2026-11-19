/**
 * 媒体选择与压缩（E5-01）。
 * 微信没有「按目标体积压缩」的接口，这里用多档质量重试逼近 500KB 上限。
 */

const IMAGE_LIMIT = 500 * 1024
const QUALITY_STEPS = [80, 60, 40, 20]

function fileSize(filePath) {
  return new Promise((resolve) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (res) => resolve(res.size || 0),
      fail: () => resolve(0),
    })
  })
}

function compressOnce(filePath, quality) {
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality,
      success: (res) => resolve(res.tempFilePath || ''),
      fail: () => resolve(''),
    })
  })
}

/**
 * 压缩单张图片至 ≤500KB。
 * @returns {Promise<{path: string, size: number, compressed: boolean}>}
 */
async function compressImageToLimit(filePath) {
  const originalSize = await fileSize(filePath)
  if (!originalSize || originalSize <= IMAGE_LIMIT) {
    return { path: filePath, size: originalSize, compressed: false }
  }

  let current = filePath
  let currentSize = originalSize
  for (let index = 0; index < QUALITY_STEPS.length; index += 1) {
    const output = await compressOnce(current, QUALITY_STEPS[index])
    if (!output) break
    current = output
    currentSize = await fileSize(output)
    if (currentSize && currentSize <= IMAGE_LIMIT) break
  }
  return { path: current, size: currentSize, compressed: current !== filePath }
}

/**
 * 选择图片 / 视频（最多 9 个）。
 * 用户取消时返回空数组，其他失败 reject。
 * @returns {Promise<Array<{path: string, size: number, type: 'image'|'video'}>>}
 */
function chooseMedia(options) {
  const { count = 9, mediaType = ['image', 'video'] } = options || {}
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      success: (res) => {
        const files = (res.tempFiles || []).map((file) => ({
          path: file.tempFilePath,
          size: file.size || 0,
          type: file.fileType === 'video' || file.duration > 0 ? 'video' : 'image',
        }))
        resolve(files)
      },
      fail: (error) => {
        const message = (error && error.errMsg) || ''
        if (message.indexOf('cancel') > -1) {
          resolve([])
          return
        }
        reject(new Error(message || '选择媒体失败'))
      },
    })
  })
}

module.exports = {
  IMAGE_LIMIT,
  chooseMedia,
  compressImageToLimit,
  fileSize,
}
