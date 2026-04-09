import { ref } from 'vue'

/**
 * 保存流程期间禁止对 Vditor 进行任何写操作（setValue/setTheme 等）。
 * 由 event-bus 的 save() 在开始时设为 true，结束时设为 false。
 * MarkdownEditor 在 scheduleSetValue、watch、handleSyncEditorTheme 等路径中检查此标志。
 */
export const isSaveInProgress = ref(false)
