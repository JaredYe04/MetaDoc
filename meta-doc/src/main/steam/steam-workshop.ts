import type { GreenworksApi } from './greenworks-loader'

export type WorkshopItemSummary = {
  publishedFileId: string
  title: string
  description: string
}

/**
 * greenworks.ugcPublish(file_path, title, description, image_path, success, error, progress?)
 */
export function ugcPublish(
  gw: GreenworksApi,
  fileName: string,
  title: string,
  description: string,
  imageName: string
): Promise<{ success: true; publishedFileId: string } | { success: false; error: string }> {
  return new Promise((resolve) => {
    gw.ugcPublish(
      fileName,
      title,
      description,
      imageName,
      (publishFileId: string) =>
        resolve({ success: true, publishedFileId: String(publishFileId) }),
      (err: Error | string) =>
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        }),
      undefined
    )
  })
}

/** greenworks.ugcDownloadItem(published_file_id, download_dir, success, error) */
export function ugcDownloadItem(
  gw: GreenworksApi,
  publishedFileId: string,
  targetDir: string
): Promise<{ success: true } | { success: false; error: string }> {
  return new Promise((resolve) => {
    if (typeof gw.ugcDownloadItem !== 'function') {
      resolve({ success: false, error: 'ugcDownloadItem_not_available' })
      return
    }
    gw.ugcDownloadItem(
      publishedFileId,
      targetDir,
      () => resolve({ success: true }),
      (err: Error | string) =>
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        })
    )
  })
}

/** 拉取当前用户已订阅的 Workshop 条目摘要（分页第一页） */
export function listSubscribedWorkshopItems(
  gw: GreenworksApi
): Promise<{ success: true; items: WorkshopItemSummary[] } | { success: false; error: string }> {
  return new Promise((resolve) => {
    if (
      typeof gw.ugcGetUserItems !== 'function' ||
      !gw.UserUGCList ||
      !gw.UserUGCListSortOrder ||
      !gw.UGCMatchingType
    ) {
      resolve({ success: true, items: [] })
      return
    }
    const opts: Record<string, unknown> = { page_num: 1 }
    if (typeof gw.getAppId === 'function') {
      opts.app_id = gw.getAppId()
    }
    gw.ugcGetUserItems(
      opts,
      gw.UGCMatchingType.Items,
      gw.UserUGCListSortOrder.SubscriptionDateDesc,
      gw.UserUGCList.Subscribed,
      (items: unknown) => {
        const raw = Array.isArray(items) ? items : []
        const out: WorkshopItemSummary[] = []
        for (const it of raw as Record<string, unknown>[]) {
          const id = it?.publishedFileId != null ? String(it.publishedFileId) : ''
          if (!id) {
            continue
          }
          out.push({
            publishedFileId: id,
            title: it.title != null ? String(it.title) : '',
            description: it.description != null ? String(it.description) : ''
          })
        }
        resolve({ success: true, items: out })
      },
      (err: Error | string) =>
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        })
    )
  })
}
