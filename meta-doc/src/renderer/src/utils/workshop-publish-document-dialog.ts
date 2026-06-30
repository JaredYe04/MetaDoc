import { ref } from 'vue'
import { isSteamEnabled } from '@common/build-env'

/** 全局「发布文档模板」对话框是否打开（仅 Steam 构建；完整实现见 archived/steam/renderer/） */
export const workshopPublishDocumentDialogOpen = ref(false)

/**
 * 打开发布对话框。开源版为 no-op；Steam 实现见 archived/steam/renderer/utils/workshop-publish-document-dialog.ts
 */
export function openWorkshopPublishDocumentDialog(opts?: { userTemplateId?: string }): void {
  if (!isSteamEnabled()) return
  workshopPublishDocumentDialogPresetUserTemplateId.value = opts?.userTemplateId
  workshopPublishDocumentDialogOpenNonce.value += 1
  workshopPublishDocumentDialogOpen.value = true
}

/** 最近一次打开时传入的预填模板 id（undefined 表示不预填或清空后发布） */
export const workshopPublishDocumentDialogPresetUserTemplateId = ref<string | undefined>(undefined)

/** 递增以使 Dialog 在重复打开时重新应用预填 */
export const workshopPublishDocumentDialogOpenNonce = ref(0)
