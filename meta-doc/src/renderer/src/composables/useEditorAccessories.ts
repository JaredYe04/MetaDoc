import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { EditorAccessoryRegistration } from '../host-api'
import { getHost } from '../core/host-runtime'
import eventBus from '../utils/event-bus'

export function useEditorAccessories(format: string) {
  const revision = ref(0)

  function refresh() {
    revision.value++
  }

  const accessories = computed((): EditorAccessoryRegistration[] => {
    revision.value
    return getHost().editor.getAccessories(format)
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

  return { accessories, aiRuntimeReady: computed(() => accessories.value.length > 0) }
}
