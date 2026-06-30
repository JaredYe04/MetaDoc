import { ref } from 'vue'

/** 全局「发布文档模板」对话框是否打开 */
export const workshopPublishDocumentDialogOpen = ref(false)

/**
 * 打开发布对话框。可选传入用户模板 id 以预填表单。
 * 与系统 Tab 解耦，由 App 根级挂载的 Dialog 消费。
 */
export function openWorkshopPublishDocumentDialog(opts?: { userTemplateId?: string }): void {
  workshopPublishDocumentDialogPresetUserTemplateId.value = opts?.userTemplateId
  workshopPublishDocumentDialogOpenNonce.value += 1
  workshopPublishDocumentDialogOpen.value = true
}

/** 最近一次打开时传入的预填模板 id（undefined 表示不预填或清空后发布） */
export const workshopPublishDocumentDialogPresetUserTemplateId = ref<string | undefined>(undefined)

/** 递增以使 Dialog 在重复打开时重新应用预填 */
export const workshopPublishDocumentDialogOpenNonce = ref(0)
