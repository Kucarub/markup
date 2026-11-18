import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { encryptSensitive } from '../src/utils/crypto'

/**
 * 基线种子（E2-02）：可重复执行（全部 upsert），不产生重复数据。
 * 覆盖：后台管理员、风格/城市/服务类型字典、一对演示 M/B 账号。
 */

const prisma = new PrismaClient()

const DICTS: Array<{ type: string; code: string; label: string; sort: number }> = [
  { type: 'style', code: 'fresh', label: '清新', sort: 1 },
  { type: 'style', code: 'forest', label: '森系', sort: 2 },
  { type: 'style', code: 'bridal', label: '新娘', sort: 3 },
  { type: 'style', code: 'retro', label: '复古', sort: 4 },
  { type: 'style', code: 'luxury', label: '轻奢', sort: 5 },
  { type: 'style', code: 'korean', label: '韩系', sort: 6 },
  { type: 'style', code: 'japanese', label: '日系', sort: 7 },
  { type: 'style', code: 'western', label: '欧美', sort: 8 },
  { type: 'city', code: 'shanghai', label: '上海', sort: 1 },
  { type: 'city', code: 'beijing', label: '北京', sort: 2 },
  { type: 'city', code: 'hangzhou', label: '杭州', sort: 3 },
  { type: 'city', code: 'suzhou', label: '苏州', sort: 4 },
  { type: 'city', code: 'nanjing', label: '南京', sort: 5 },
  { type: 'city', code: 'guangzhou', label: '广州', sort: 6 },
  { type: 'city', code: 'shenzhen', label: '深圳', sort: 7 },
  { type: 'city', code: 'chengdu', label: '成都', sort: 8 },
  { type: 'service_type', code: 'bridal', label: '婚礼跟妆', sort: 1 },
  { type: 'service_type', code: 'daily', label: '日常妆造', sort: 2 },
  { type: 'service_type', code: 'event', label: '商业活动', sort: 3 },
  { type: 'service_type', code: 'photo', label: '写真拍摄', sort: 4 },
  { type: 'merchant_type', code: 'studio', label: '摄影工作室', sort: 1 },
  { type: 'merchant_type', code: 'wedding', label: '婚庆公司', sort: 2 },
  { type: 'merchant_type', code: 'photo', label: '影楼', sort: 3 },
  { type: 'merchant_type', code: 'other', label: '其他', sort: 4 },
]

async function seedAdmin() {
  const passwordHash = await bcrypt.hash('Admin@123456', 10)
  await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: { passwordHash, role: 'super', status: 'active', failCount: 0, lockedUntil: null },
    create: { username: 'admin', passwordHash, role: 'super', status: 'active' },
  })
  console.info('[seed] admin_user: admin / Admin@123456')
}

async function seedDicts() {
  for (const item of DICTS) {
    await prisma.dictItem.upsert({
      where: { type_code: { type: item.type, code: item.code } },
      update: { label: item.label, sort: item.sort, enabled: true },
      create: item,
    })
  }
  console.info(`[seed] dict_item: ${DICTS.length} 条`)
}

async function seedDemoArtist() {
  const phoneCipher = encryptSensitive('13800001234')
  const user = await prisma.userAuth.upsert({
    where: { openid: 'dev-artist-openid' },
    update: { role: 'artist', status: 'active' },
    create: {
      openid: 'dev-artist-openid',
      role: 'artist',
      nickname: '林知夏',
      phoneCipher,
    },
  })

  await prisma.artist.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      name: '林知夏',
      city: '上海',
      district: '静安区',
      years: 5,
      styles: ['fresh', 'forest', 'bridal'],
      intro: '擅长清新新娘妆与森系写真，服务过 120+ 场婚礼。',
      idCardCipher: encryptSensitive('310101199501011234'),
      status: 'approved',
      auditAt: new Date(),
      lat: 31.2291,
      lng: 121.4447,
    },
  })
  console.info('[seed] artist: 林知夏（approved）')
}

async function seedDemoMerchant() {
  const phoneCipher = encryptSensitive('13900002345')
  const user = await prisma.userAuth.upsert({
    where: { openid: 'dev-merchant-openid' },
    update: { role: 'merchant', status: 'active' },
    create: {
      openid: 'dev-merchant-openid',
      role: 'merchant',
      nickname: '知夏造型工作室',
      phoneCipher,
    },
  })

  await prisma.merchant.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      shopName: '知夏造型工作室',
      type: 'studio',
      address: '上海市静安区南京西路 1266 号',
      licenseCipher: encryptSensitive('91310101MA1FL0XXXX'),
      status: 'approved',
      auditAt: new Date(),
      lat: 31.2291,
      lng: 121.4447,
    },
  })
  console.info('[seed] merchant: 知夏造型工作室（approved）')
}

async function main() {
  await seedAdmin()
  await seedDicts()
  await seedDemoArtist()
  await seedDemoMerchant()
}

main()
  .catch((error) => {
    console.error('[seed] 失败：', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
