import { getSetting, setSetting } from '../utils/settings'
import {
  editorChromeLayout,
  setEditorChromeLayoutValue,
  type EditorChromeLayoutMode
} from '../stores/editor-chrome-layout-state'

export type { EditorChromeLayoutMode }

const SETTING_KEY = 'editorChromeLayout'

void getSetting(SETTING_KEY).then((v) => {
  if (v === 'workspace' || v === 'classic') {
    setEditorChromeLayoutValue(v)
  }
})

export { getEditorChromeLayoutSync } from '../stores/editor-chrome-layout-state'

export function useEditorChromeLayout() {
  async function setEditorChromeLayout(mode: EditorChromeLayoutMode): Promise<void> {
    setEditorChromeLayoutValue(mode)
    await setSetting(SETTING_KEY, mode)
  }

  return {
    editorChromeLayout,
    setEditorChromeLayout
  }
}
