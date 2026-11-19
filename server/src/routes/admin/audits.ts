import { Router } from 'express'
import { z } from 'zod'
import { getPrisma } from '../../lib/prisma'
import { requireAuth } from '../../middlewares/auth'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/errors'

/**
 * 入驻审核状态流转（E4-06）。
 * 仅允许 pending → approved / rejected；每次流转写 audit_log（含操作人）。
 * 驳回原因必填，通过时清空历史驳回原因。
 */
export const adminAuditRouter = Router()

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })
const rejectSchema = z.object({ reason: z.string().trim().min(2, '请填写驳回原因').max(255) })

async function transition(
  artistId: number,
  action: 'approve' | 'reject',
  operatorId: number,
  reason: string | null,
) {
  const prisma = getPrisma()
  return prisma.$transaction(async (tx) => {
    const artist = await tx.artist.findUnique({ where: { id: artistId } })
    if (!artist) throw AppError.notFound('入驻申请不存在')
    if (artist.status !== 'pending') {
      throw AppError.conflict(
        `当前状态为 ${artist.status}，仅待审核状态可${action === 'approve' ? '通过' : '驳回'}`,
      )
    }

    const updated = await tx.artist.update({
      where: { id: artistId },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        rejectReason: reason,
        auditAt: new Date(),
      },
    })

    await tx.auditLog.create({
      data: { targetType: 'artist', targetId: artistId, action, reason, operatorId },
    })

    return updated
  })
}

adminAuditRouter.post(
  '/admin/audits/artists/:id/approve',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const { id } = paramsSchema.parse(req.params)
    const artist = await transition(id, 'approve', req.auth!.uid, null)
    res.ok({ id: artist.id, status: artist.status, auditAt: artist.auditAt })
  }),
)

adminAuditRouter.post(
  '/admin/audits/artists/:id/reject',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const { id } = paramsSchema.parse(req.params)
    const { reason } = rejectSchema.parse(req.body)
    const artist = await transition(id, 'reject', req.auth!.uid, reason)
    res.ok({ id: artist.id, status: artist.status, auditAt: artist.auditAt, rejectReason: reason })
  }),
)
