import { defineComponent, h } from 'vue'
import { createMetaDocPlugin } from '../../host-api'
import Home from '../../views/Home.vue'
import Outline from '../../views/Outline.vue'
import Visualize from '../../views/Visualize.vue'
import { themeState } from '../../utils/themes'

/** Placeholder — actual editor UI is injected via WorkspaceTabPane slot */
const EditorSlotPlaceholder = defineComponent({
  name: 'EditorSlotPlaceholder',
  setup() {
    return () => h('div', { class: 'editor-slot-placeholder' })
  }
})

function standardDocViewWhen(ctx: import('../../view-api').ViewWhenContext): boolean {
  return !ctx.isPlainTextFormat && !ctx.isPdfPreviewTab && !ctx.isImageTab
}

export default createMetaDocPlugin(
  {
    id: 'metadoc.builtin.core-views',
    name: 'Core Document Views',
    version: '1.0.0',
    entry: './core-views',
    activationEvents: ['onStartup']
  },
  ({ host }) => {
    host.views.registerView({
      id: 'home',
      component: Home,
      label: () => 'headMenu.home',
      iconImage: () => themeState.currentTheme.HomeIcon,
      order: 10,
      isCore: true,
      showInViewMenu: true,
      renderMode: 'component'
    })

    host.views.registerView({
      id: 'editor',
      component: EditorSlotPlaceholder,
      label: () => 'headMenu.editor',
      iconImage: () => themeState.currentTheme.EditorIcon,
      order: 20,
      isCore: true,
      showInViewMenu: true,
      when: (ctx) => !ctx.isImageTab,
      renderMode: 'editor-slot'
    })

    host.views.registerView({
      id: 'outline',
      component: Outline,
      label: () => 'headMenu.outline',
      iconImage: () => themeState.currentTheme.OutlineIcon,
      order: 30,
      showInViewMenu: true,
      when: standardDocViewWhen,
      renderMode: 'component'
    })

    host.views.registerView({
      id: 'visualize',
      component: Visualize,
      label: () => 'headMenu.visualize',
      iconImage: () => themeState.currentTheme.VisualIcon,
      order: 40,
      showInViewMenu: true,
      when: standardDocViewWhen,
      renderMode: 'component'
    })
  }
)
