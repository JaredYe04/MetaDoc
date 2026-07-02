import { createMetaDocPlugin } from '../../host-api'
import SettingKnowledgeBaseSection from '../../views/setting/SettingKnowledgeBaseSection.vue'

export default createMetaDocPlugin(
  {
    id: 'metadoc.builtin.knowledge-rag',
    name: 'Knowledge Base',
    version: '1.0.0',
    entry: './knowledge-rag',
    permissions: ['main.rag', 'llm.chat', 'settings.read'],
    activationEvents: ['onCapability:rag']
  },
  ({ host }) => {
    host.ui.registerSettingsSection({
      id: 'knowledgeBase',
      label: 'setting.knowledgeBase',
      component: SettingKnowledgeBaseSection,
      order: 30
    })
    host.ui.registerLeftMenuItem({
      id: 'knowledge-base',
      label: 'leftMenu.knowledgeBase',
      order: 6,
      onClick: () => host.events.emit('open-knowledge-base')
    })
  }
)
