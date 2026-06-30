import { createMetaDocPlugin } from '../../host-api'
import AITaskQueue from '../../components/AITaskQueue.vue'
import LlmApiErrorDialog from '../../components/LlmApiErrorDialog.vue'

export default createMetaDocPlugin(
  {
    id: 'metadoc.builtin.shell-overlays',
    name: 'AI Shell Overlays',
    version: '1.0.0',
    entry: './shell-overlays',
    permissions: ['llm.completion', 'llm.chat'],
    activationEvents: ['onLlmEnabled']
  },
  ({ host }) => {
    host.ui.registerShellOverlay({
      id: 'ai-task-queue',
      component: AITaskQueue,
      position: 'main'
    })
    host.ui.registerShellOverlay({
      id: 'llm-api-error-dialog',
      component: LlmApiErrorDialog,
      position: 'main'
    })
  }
)
