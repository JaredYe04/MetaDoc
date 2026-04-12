import { ref } from 'vue'

export type EditorChromeLayoutMode = 'classic' | 'workspace'

/** 仅依赖 Vue，供 workspace 与 useTabDrag 同步读取，避免 workspace → composable → settings 循环依赖 */
const editorChromeLayoutRef = ref<EditorChromeLayoutMode>('classic')

export function getEditorChromeLayoutSync(): EditorChromeLayoutMode {
  return editorChromeLayoutRef.value
}

export function setEditorChromeLayoutValue(mode: EditorChromeLayoutMode): void {
  editorChromeLayoutRef.value = mode
}

export { editorChromeLayoutRef as editorChromeLayout }
