import { createMetaDocPlugin } from '../../host-api'
import { registerPluginDisposer } from '../../core/plugin-loader'

const PLUGIN_ID = 'metadoc.builtin.translate-selection'

export default createMetaDocPlugin(
  {
    id: PLUGIN_ID,
    name: 'Translate Selection',
    version: '1.0.0',
    entry: './translate-selection',
    permissions: ['documents.read', 'documents.write', 'llm.chat'],
    activationEvents: ['onLlmEnabled']
  },
  async ({ host }) => {
    const { default: SelectionTranslateDialog } = await import(
      '../../components/SelectionTranslateDialog.vue'
    )
    registerPluginDisposer(
      PLUGIN_ID,
      host.editor.registerAccessory({
        id: 'selection-translate',
        component: SelectionTranslateDialog,
        formats: ['md', 'tex'],
        order: 30
      })
    )
    host.ui.registerContextMenuItem({
      id: 'translate-selection',
      label: 'contextMenu.translateSelection',
      group: 'ai',
      order: 20,
      onClick: ({ tabId }) => {
        host.events.emit('open-translate-selection', { tabId })
      }
    })
  }
)
