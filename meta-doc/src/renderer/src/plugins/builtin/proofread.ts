import { createMetaDocPlugin } from '../../host-api'
import ProofreadView from '../../views/ProofreadView.vue'

export default createMetaDocPlugin(
  {
    id: 'metadoc.builtin.proofread',
    name: 'Proofread',
    version: '1.0.0',
    entry: './proofread',
    permissions: ['documents.read', 'documents.write', 'llm.chat'],
    activationEvents: ['onLlmEnabled']
  },
  ({ host }) => {
    host.ui.registerDocumentView({
      view: 'proofread',
      component: ProofreadView,
      label: 'Proofread'
    })
  }
)
