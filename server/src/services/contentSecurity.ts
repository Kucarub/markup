import { getPrisma } from '../lib/prisma'
import { hasWechatConfig, mediaCheckAsync } from './wechat'
import { readObject } from './storage'

/**
 * 作品内容安全检测（E14-01）。
 * - 作品创建后提交 media_check_async（base64 ≤1MB），检测结果由微信回调推送；
 * - 回调通过 → 作品 online；回调违规 → 作品 rejected（对外不可见，可在后台恢复）；
 * - 未配置微信凭证 / 提交超时或失败 → 按「超时按通过」处理：作品先上线，
 *   但记录 result=skipped|timeout 的待复核标记，后台作品列表可见提示。
 */

/** 内容安全检测记录（artist_portfolio.content_check） */
export interface ContentCheckInfo {
  taskId?: string
  submittedAt?: string
  result: 'pending' | 'pass' | 'reject' | 'skipped' | 'timeout'
  detail?: string
  reviewedAt?: string
}

/** media_base64 上限 1MB：超出直接跳过检测并标记待复核 */
const MAX_CHECK_BYTES = 900 * 1024

/** 提交作品内容安全检测：内部消化所有异常，保证创建主流程不受影响 */
export async function submitPortfolioCheck(portfolioId: number, objectKey: string): Promise<void> {
  const prisma = getPrisma()

  if (!hasWechatConfig()) {
    await prisma.artistPortfolio.update({
      where: { id: portfolioId },
      data: {
        status: 'online',
        contentCheck: {
          result: 'skipped',
          submittedAt: new Date().toISOString(),
          detail: '未配置微信凭证，暂按通过上线，待人工复核',
        } satisfies ContentCheckInfo,
      },
    })
    return
  }

  try {
    const buffer = await readObject(objectKey)
    if (buffer.length > MAX_CHECK_BYTES) {
      await prisma.artistPortfolio.update({
        where: { id: portfolioId },
        data: {
          status: 'online',
          contentCheck: {
            result: 'skipped',
            submittedAt: new Date().toISOString(),
            detail: `文件 ${Math.round(buffer.length / 1024)}KB 超出检测上限，暂按通过上线，待人工复核`,
          } satisfies ContentCheckInfo,
        },
      })
      return
    }

    const taskId = await mediaCheckAsync({
      mediaBase64: buffer.toString('base64'),
    })
    await prisma.artistPortfolio.update({
      where: { id: portfolioId },
      data: {
        contentCheck: {
          taskId,
          submittedAt: new Date().toISOString(),
          result: 'pending',
        } satisfies ContentCheckInfo,
      },
    })
  } catch (error) {
    await prisma.artistPortfolio
      .update({
        where: { id: portfolioId },
        data: {
          status: 'online',
          contentCheck: {
            result: 'timeout',
            submittedAt: new Date().toISOString(),
            detail: `检测提交失败（${(error as Error).message?.slice(0, 120) || '未知原因'}），暂按通过上线，待人工复核`,
          } satisfies ContentCheckInfo,
        },
      })
      .catch(() => {})
  }
}

/** 按微信回调 trace_id 应用检测结果；作品不存在时返回 null（回调仍需返回 success） */
export async function applyCheckCallback(
  traceId: string,
  verdict: 'pass' | 'reject',
  detail: string,
): Promise<{ id: number; status: string } | null> {
  const prisma = getPrisma()
  const portfolio = await prisma.artistPortfolio.findFirst({
    where: { contentCheck: { path: '$.taskId', equals: traceId } },
    select: { id: true, status: true, contentCheck: true },
  })
  if (!portfolio) return null

  const nextStatus = verdict === 'pass' ? 'online' : 'rejected'
  const current = portfolio.contentCheck as ContentCheckInfo | null
  await prisma.artistPortfolio.update({
    where: { id: portfolio.id },
    data: {
      status: nextStatus,
      contentCheck: {
        ...current,
        taskId: traceId,
        result: verdict,
        detail,
        reviewedAt: new Date().toISOString(),
      } satisfies ContentCheckInfo,
    },
  })
  return { id: portfolio.id, status: nextStatus }
}
