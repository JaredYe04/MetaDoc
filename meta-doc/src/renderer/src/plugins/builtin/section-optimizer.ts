import { createMetaDocPlugin } from '../../host-api'
import { registerPluginDisposer } from '../../core/plugin-loader'

const PLUGIN_ID = 'metadoc.builtin.section-optimizer'

export default createMetaDocPlugin(
  {
    id: PLUGIN_ID,
    name: 'Section Optimizer',
    version: '1.0.0',
    entry: './section-optimizer',
    permissions: ['documents.read', 'documents.write', 'llm.chat'],
    activationEvents: ['onLlmEnabled']
  },
  async ({ host }) => {
    const { default: SectionOptimizer } = await import('../../components/SectionOptimizer.vue')
    registerPluginDisposer(
      PLUGIN_ID,
      host.editor.registerAccessory({
        id: 'section-optimizer',
        component: SectionOptimizer,
        formats: ['md', 'tex'],
        order: 10
      })
    )
    host.ui.registerContextMenuItem({
      id: 'section-optimizer',
      label: 'contextMenu.sectionOptimizer',
      group: 'ai',
      order: 10,
      onClick: ({ tabId }) => {
        host.events.emit('open-section-optimizer', { tabId })
      }
    })
  }
)
