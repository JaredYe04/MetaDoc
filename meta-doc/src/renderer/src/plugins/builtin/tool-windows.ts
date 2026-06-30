import { createMetaDocPlugin } from '../../host-api'
import { registerPluginDisposer } from '../../core/plugin-loader'

const PLUGIN_ID = 'metadoc.builtin.tool-windows'

export default createMetaDocPlugin(
  {
    id: PLUGIN_ID,
    name: 'AI Tool Windows',
    version: '1.0.0',
    entry: './tool-windows',
    permissions: ['llm.chat'],
    activationEvents: ['onLlmEnabled']
  },
  async ({ host }) => {
    const { default: GraphQuickDialog } = await import('../../components/GraphQuickDialog.vue')
    registerPluginDisposer(
      PLUGIN_ID,
      host.editor.registerAccessory({
        id: 'graph-quick',
        component: GraphQuickDialog,
        formats: ['md', 'tex'],
        order: 20
      })
    )
    const tools = [
      {
        id: 'fomula-recognition',
        event: 'fomula-recognition',
        label: 'leftMenu.handwritingFormulaRecognition',
        order: 20
      },
      {
        id: 'smart-drawing-assistant',
        event: 'smart-drawing-assistant',
        label: 'leftMenu.smartDrawingAssistant',
        order: 30
      },
      { id: 'data-analysis', event: 'data-analysis', label: 'leftMenu.dataAnalysis', order: 40 },
      { id: 'ocr', event: 'ocr', label: 'leftMenu.ocr', order: 50 },
      { id: 'attachment', event: 'attachment', label: 'leftMenu.attachment', order: 60 },
      { id: 'aigc-detection', event: 'aigc-detection', label: 'leftMenu.aigcDetection', order: 70 }
    ]
    for (const t of tools) {
      host.ui.registerLeftMenuItem({
        id: t.id,
        label: t.label,
        parentId: 'ai-assistant',
        order: t.order,
        onClick: () => host.events.emit(t.event)
      })
    }
  }
)
