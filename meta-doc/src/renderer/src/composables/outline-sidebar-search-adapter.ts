import { shallowRef } from 'vue'
import type { TextEditorAdapter } from '../editor/text-editor-types'

/** 专注侧栏「文档内搜索」与当前激活的 Markdown 编辑器适配器同步（由 MarkdownEditor 注册/注销） */
const adapterRef = shallowRef<TextEditorAdapter | null>(null)
const registeredTabIdRef = shallowRef<string | null>(null)
/** LaTeX 专注大纲右键打开段落优化等：Monaco 编辑器实例 id（仅 LaTeX 注册时传入） */
const registeredMonacoEditorIdRef = shallowRef<string | null>(null)

export function registerOutlineSidebarSearchAdapter(
  tabId: string,
  adapter: TextEditorAdapter,
  options?: { monacoEditorId?: string | null }
) {
  registeredTabIdRef.value = tabId
  adapterRef.value = adapter
  registeredMonacoEditorIdRef.value = options?.monacoEditorId ?? null
}

export function unregisterOutlineSidebarSearchAdapter(tabId: string) {
  if (registeredTabIdRef.value === tabId) {
    registeredTabIdRef.value = null
    adapterRef.value = null
    registeredMonacoEditorIdRef.value = null
  }
}

export {
  adapterRef as outlineSidebarSearchAdapterRef,
  registeredMonacoEditorIdRef,
  registeredTabIdRef as outlineSidebarAdapterTabIdRef
}
