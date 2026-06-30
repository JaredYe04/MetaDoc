import { createMetaDocPlugin } from '../../host-api'
import AgentView from '../../views/AgentView.vue'
import GlobalHomeAgentSection from '../../components/home/GlobalHomeAgentSection.vue'

export default createMetaDocPlugin(
  {
    id: 'metadoc.builtin.agent',
    name: 'Agent',
    version: '1.0.0',
    entry: './agent',
    permissions: ['documents.read', 'documents.write', 'llm.chat', 'main.terminal'],
    activationEvents: ['onLlmEnabled']
  },
  ({ host }) => {
    host.ui.registerDocumentView({
      view: 'agent',
      component: AgentView,
      label: 'Agent'
    })
    host.ui.registerHomeSection({
      id: 'global-home-agent',
      component: GlobalHomeAgentSection,
      order: 1
    })
    host.ui.registerLeftMenuItem({
      id: 'agent',
      label: 'headMenu.agent',
      order: 5,
      onClick: () => {
        const tabId = host.documents.getActiveTabId()
        if (tabId) host.events.emit('switch-document-view', { tabId, view: 'agent' })
      }
    })
  }
)
