import { Router } from 'express'

/**
 * dev Mock（E2-08）：后端接口未就绪时，小程序把 baseUrl 指向 /mock 即可联调。
 * 仅 development 挂载，生产不暴露。
 */
export const mockRouter = Router()

const demands = [
  {
    id: 1,
    title: '新娘跟妆 · 全天',
    scene: '婚礼跟妆',
    date: '2026-11-22',
    headcount: 1,
    duration: '8 小时',
    budget: '¥1,800',
    location: '上海 · 静安区',
    deadline: '还剩 2 天',
    status: '急招',
    statusTone: 'warning',
  },
  {
    id: 2,
    title: '品牌发布会 · 4 位模特',
    scene: '商业活动',
    date: '2026-11-25',
    headcount: 4,
    duration: '5 小时',
    budget: '¥2,400',
    location: '上海 · 徐汇区',
    deadline: '还剩 5 天',
    status: '可预约',
    statusTone: 'success',
  },
  {
    id: 3,
    title: '写真拍摄 · 清新妆',
    scene: '写真拍摄',
    date: '2026-11-28',
    headcount: 1,
    duration: '3 小时',
    budget: '¥680',
    location: '上海 · 长宁区',
    deadline: '还剩 8 天',
    status: '可预约',
    statusTone: 'success',
  },
]

const portfolios = [
  { id: 1, title: '森系新娘 · 晨袍', cover: '', photos: 6, tags: ['新娘', '森系'], ratio: 'portrait' },
  { id: 2, title: '复古红唇 · 写真', cover: '', photos: 4, tags: ['复古'], ratio: 'portrait' },
  { id: 3, title: '秀场后台 · 群妆', cover: '', photos: 9, tags: ['商业'], ratio: 'square' },
]

const artist = {
  id: 1,
  name: '林知夏',
  level: 'L2',
  city: '上海',
  completeness: 82,
  stats: { works: 128, likes: 23, orders: 2, reviews: 4 },
}

mockRouter.get('/demands', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { total: demands.length, page: 1, size: 20, list: demands } })
})

mockRouter.get('/portfolios', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { total: portfolios.length, page: 1, size: 20, list: portfolios } })
})

mockRouter.get('/artist', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: artist })
})
