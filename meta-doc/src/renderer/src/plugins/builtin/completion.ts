import { createMetaDocPlugin } from '../../host-api'
import AISuggestionGhost from '../../components/AISuggestionGhost.vue'
import { registerPluginDisposer } from '../../core/plugin-loader'

const PLUGIN_ID = 'metadoc.builtin.completion'

export default createMetaDocPlugin(
  {
    id: PLUGIN_ID,
    name: 'AI Auto Completion',
    version: '1.0.0',
    entry: './completion',
    permissions: ['documents.read', 'documents.write', 'llm.completion'],
    activationEvents: ['onCapability:completion']
  },
  async ({ host }) => {
    registerPluginDisposer(PLUGIN_ID, host.editor.registerOverlay({
      id: 'ai-suggestion-ghost',
      component: AISuggestionGhost,
      formats: ['md', 'tex', 'txt']
    }))

    const { aiCompletionService } = await import('../../utils/ai-completion-service')

    const disposers = [
      host.events.on('ai-completion-delay', (minutes: unknown) => {
        aiCompletionService.delay(typeof minutes === 'number' ? minutes : 5)
      }),
      host.events.on('ai-completion-cancel-delay', () => {
        aiCompletionService.cancelDelay()
      }),
      host.events.on('cancel-suggestion', () => {
        aiCompletionService.cancelCurrentCompletion()
      }),
      host.events.on(
        'editor-completion-set-adapter',
        (payload: { adapter?: unknown; tabId?: string } | undefined) => {
          if (payload?.adapter) {
            aiCompletionService.setAdapter(payload.adapter as never)
          }
        }
      ),
      host.events.on('editor-completion-remove-adapter', () => {
        aiCompletionService.removeAdapter()
      }),
      host.events.on(
        'editor-completion-trigger',
        (payload: { reason?: string; key?: string; setupAdapter?: unknown } | undefined) => {
          if (payload?.setupAdapter) {
            aiCompletionService.setAdapter(payload.setupAdapter as never)
          }
          if (!aiCompletionService.getAdapter()) return
          const reason = payload?.reason === 'input' || payload?.reason === 'key' ? payload.reason : 'manual'
          aiCompletionService.triggerCompletion(reason, payload?.key)
        }
      ),
      host.events.on('editor-completion-cancel-current', () => {
        aiCompletionService.cancelCurrentCompletion()
      }),
      host.events.on('editor-completion-mouse-click', () => {
        aiCompletionService.handleMouseClick()
      })
    ]
    disposers.forEach((d) => registerPluginDisposer(PLUGIN_ID, d))
  }
)
