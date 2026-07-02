import { createMetaDocPlugin } from '../../host-api'

export default createMetaDocPlugin(
  {
    id: 'metadoc.builtin.outline-ai',
    name: 'Outline AI',
    version: '1.0.0',
    entry: './outline-ai',
    permissions: ['outline.read', 'outline.write', 'llm.chat'],
    activationEvents: ['onCapability:editor-ai']
  },
  ({ host }) => {
    host.events.emit('outline-ai-plugin-ready')
  }
)
