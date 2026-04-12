import type { InjectionKey, ComputedRef } from 'vue'

/** ViewMenuContainer 提供：有值时侧栏大纲/Meta 等绑定该文档 Tab，否则用全局 active */
export const VIEW_MENU_DOCUMENT_TAB_ID: InjectionKey<ComputedRef<string | null>> =
  Symbol.for('metaDoc.viewMenuDocumentTabId')
