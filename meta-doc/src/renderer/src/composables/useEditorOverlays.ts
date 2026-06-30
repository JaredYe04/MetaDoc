import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { EditorOverlayRegistration } from '../host-api'
import { getHost } from '../core/host-runtime'
import { isAiRuntimeLoaded } from '../ai-runtime/loader'
import eventBus from '../utils/event-bus'

export function useEditorOverlays(format: string) {
  const ready = ref(isAiRuntimeLoaded())

  function refresh() {
    ready.value = isAiRuntimeLoaded()
  }

  const overlays = computed((): EditorOverlayRegistration[] => {
    if (!ready.value) return []
    return getHost().editor.getOverlays(format)
  })

  onMounted(() => {
    eventBus.on('ai-runtime-ready', refresh)
    eventBus.on('ai-runtime-unloaded', refresh)
  })

  onBeforeUnmount(() => {
    eventBus.off('ai-runtime-ready', refresh)
    eventBus.off('ai-runtime-unloaded', refresh)
  })

  return { overlays, aiRuntimeReady: ready }
}
