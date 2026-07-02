import { createMetaDocPlugin } from '../../host-api'
import ProofreadView from '../../views/ProofreadView.vue'
import { themeState } from '../../utils/themes'

function standardDocViewWhen(ctx: import('../../view-api').ViewWhenContext): boolean {
  return (
    ctx.hasActiveDocument &&
    !ctx.isPlainTextFormat &&
    !ctx.isPdfPreviewTab &&
    !ctx.isImageTab
  )
}

export default createMetaDocPlugin(
  {
    id: 'metadoc.builtin.proofread',
    name: 'Proofread',
    version: '1.0.0',
    entry: './proofread',
    permissions: ['documents.read', 'documents.write', 'llm.chat'],
    activationEvents: ['onCapability:editor-ai']
  },
  ({ host }) => {
    host.views.registerView({
      id: 'proofread',
      component: ProofreadView,
      label: () => 'headMenu.proofread',
      iconImage: () => themeState.currentTheme.ProofreadIcon,
      order: 50,
      requiresLlm: true,
      showInViewMenu: true,
      when: standardDocViewWhen,
      renderMode: 'component'
    })
  }
)
