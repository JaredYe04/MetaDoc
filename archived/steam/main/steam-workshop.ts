import type { GreenworksApi } from './greenworks-loader'

/** 与 greenworks SteamUGCDetails 对齐的订阅项摘要（用于下载须带 file 句柄） */
export type WorkshopItemSummary = {
  publishedFileId: string
  /** UGCHandle_t 字符串，ugcDownloadItem 第一个参数 */
  file: string
  title: string
  description: string
  fileName: string
  steamIDOwner: string
  tags: string
  timeCreated: number
  timeUpdated: number
  timeAddedToUserList: number
  fileType: number
  previewFile: string
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
      (publishFileId: string) => resolve({ success: true, publishedFileId: String(publishFileId) }),
      (err: Error | string) =>
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        }),
      undefined
    )
  })
}

/** greenworks.ugcDownloadItem(download_file_handle, download_dir, success, error) — 第一参为 SteamUGCDetails.file */
export function ugcDownloadItem(
  gw: GreenworksApi,
  downloadFileHandle: string,
  targetDir: string
): Promise<{ success: true } | { success: false; error: string }> {
  return new Promise((resolve) => {
    if (typeof gw.ugcDownloadItem !== 'function') {
      resolve({ success: false, error: 'ugcDownloadItem_not_available' })
      return
    }
    if (!downloadFileHandle || downloadFileHandle === '0') {
      resolve({ success: false, error: 'invalid_ugc_file_handle' })
      return
    }
    gw.ugcDownloadItem(
      downloadFileHandle,
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
          const file = it.file != null ? String(it.file) : ''
          out.push({
            publishedFileId: id,
            file,
            title: it.title != null ? String(it.title) : '',
            description: it.description != null ? String(it.description) : '',
            fileName: it.fileName != null ? String(it.fileName) : '',
            steamIDOwner: it.steamIDOwner != null ? String(it.steamIDOwner) : '',
            tags: it.tags != null ? String(it.tags) : '',
            timeCreated: typeof it.timeCreated === 'number' ? it.timeCreated : 0,
            timeUpdated: typeof it.timeUpdated === 'number' ? it.timeUpdated : 0,
            timeAddedToUserList:
              typeof it.timeAddedToUserList === 'number' ? it.timeAddedToUserList : 0,
            fileType: typeof it.fileType === 'number' ? it.fileType : 0,
            previewFile: it.previewFile != null ? String(it.previewFile) : ''
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
