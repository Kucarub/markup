/**
 * 作品水印生成（E14-02）。
 * 使用离屏 Canvas（OffscreenCanvas 2d）为原图叠加平铺文字水印后导出 JPEG：
 * - 画布按原图宽高等比缩放（长边 ≤1080），竖构图按原比例绘制，不拉伸变形；
 * - 水印文字按画布宽度自适应字号，-30° 平铺 + 半透明，兼顾防盗与观感；
 * - 视频不生成水印，由调用方跳过。
 * 生成失败时抛错，由上传页标记失败并支持重试（复用上传失败重试通道）。
 */

const MAX_EDGE = 1080
const EXPORT_QUALITY = 0.85

function readImageInfo(filePath) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: filePath,
      success: resolve,
      fail: (error) => reject(new Error((error && error.errMsg) || '读取图片信息失败')),
    })
  })
}

function drawWatermark(canvas, width, height, text) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, width, height)
  const img = canvas.createImage()
  return new Promise((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height)
      // 字号随画布自适应，保证不同尺寸下水印疏密一致
      const fontSize = Math.max(14, Math.round(Math.min(width, height) / 18))
      ctx.save()
      ctx.globalAlpha = 0.22
      ctx.fillStyle = '#ffffff'
      ctx.font = `500 ${fontSize}px sans-serif`
      ctx.textBaseline = 'middle'
      const stepX = Math.max(fontSize * 9, width / 3)
      const stepY = Math.max(fontSize * 5, height / 6)
      const angle = (-30 * Math.PI) / 180
      ctx.translate(width / 2, height / 2)
      ctx.rotate(angle)
      const span = Math.ceil(Math.sqrt(width * width + height * height))
      for (let y = -span; y <= span; y += stepY) {
        for (let x = -span; x <= span; x += stepX) {
          ctx.fillText(text, x, y)
        }
      }
      ctx.restore()
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('水印底图加载失败'))
    img.src = filePath
  })
}

/**
 * 生成带水印的作品图。
 * @param {string} filePath 本地原图路径（已压缩）
 * @param {string} text 水印文字（化妆师昵称 / 品牌名）
 * @returns {Promise<string>} 水印图临时文件路径
 */
async function makeWatermarkedImage(filePath, text) {
  const info = await readImageInfo(filePath)
  const scale = Math.min(1, MAX_EDGE / Math.max(info.width, info.height))
  const width = Math.max(1, Math.round(info.width * scale))
  const height = Math.max(1, Math.round(info.height * scale))

  const canvas = wx.createOffscreenCanvas({ type: '2d', width, height })
  await drawWatermark(canvas, width, height, text)

  const dataUrl = canvas.toDataURL('image/jpeg', EXPORT_QUALITY)
  const base64 = String(dataUrl || '').split(',')[1] || ''
  if (!base64) throw new Error('水印图导出失败')

  const targetPath = `${wx.env.USER_DATA_PATH}/watermark-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`
  await new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath: targetPath,
      data: base64,
      encoding: 'base64',
      success: () => resolve(targetPath),
      fail: (error) => reject(new Error((error && error.errMsg) || '水印图写入失败')),
    })
  })
  return targetPath
}

module.exports = {
  makeWatermarkedImage,
  MAX_EDGE,
}
