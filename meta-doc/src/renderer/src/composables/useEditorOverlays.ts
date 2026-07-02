import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { EditorOverlayRegistration } from '../host-api'
import { getHost } from '../core/host-runtime'
import eventBus from '../utils/event-bus'

export function useEditorOverlays(format: string) {
  const revision = ref(0)

  function refresh() {
    revision.value++
  }

  const overlays = computed((): EditorOverlayRegistration[] => {
    revision.value
    return getHost().editor.getOverlays(format)
  })

  onMounted(() => {
    eventBus.on('ai-capability-loaded', refresh)
    eventBus.on('ai-capability-unloaded', refresh)
    eventBus.on('ai-runtime-ready', refresh)
    eventBus.on('ai-runtime-unloaded', refresh)
  })

  onBeforeUnmount(() => {
    eventBus.off('ai-capability-loaded', refresh)
    eventBus.off('ai-capability-unloaded', refresh)
    eventBus.off('ai-runtime-ready', refresh)
    eventBus.off('ai-runtime-unloaded', refresh)
  })

  return { overlays, aiRuntimeReady: computed(() => overlays.value.length > 0) }
}
