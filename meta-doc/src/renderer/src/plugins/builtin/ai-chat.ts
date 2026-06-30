import { createMetaDocPlugin } from '../../host-api'

export default createMetaDocPlugin(
  {
    id: 'metadoc.builtin.ai-chat',
    name: 'AI Chat',
    version: '1.0.0',
    entry: './ai-chat',
    permissions: ['documents.read', 'llm.chat'],
    activationEvents: ['onLlmEnabled']
  },
  ({ host }) => {
    host.ui.registerLeftMenuItem({
      id: 'ai-chat',
      label: 'leftMenu.chatWithAI',
      parentId: 'ai-assistant',
      order: 1,
      onClick: () => host.events.emit('ai-chat')
    })
  }
)
