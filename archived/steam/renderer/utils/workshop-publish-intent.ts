import { ref } from 'vue'

/** 可选：预填「发布文档模板」对话框的用户模板 id（内存态）；优先使用 openWorkshopPublishDocumentDialog({ userTemplateId }) */
export const workshopPublishUserTemplateId = ref<string | undefined>(undefined)

/** 每次打开或聚焦发布页时递增，便于 keep-alive 下重复应用 intent */
export const workshopPublishIntentVersion = ref(0)

export function armWorkshopPublishUserTemplate(userTemplateId: string | undefined): void {
  workshopPublishUserTemplateId.value = userTemplateId
  workshopPublishIntentVersion.value += 1
}
