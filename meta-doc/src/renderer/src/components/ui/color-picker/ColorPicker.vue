<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useForwardPropsEmits } from 'reka-ui'
import {
  ColorPickerRoot,
  ColorPickerCanvas,
  ColorPickerSliderHue,
  ColorPickerSliderAlpha,
  ColorPickerInputHex,
  type ColorPickerRootProps,
  type ColorPickerRootEmits
} from '@vuelor/picker'
import '@vuelor/picker/style.css'

interface Props extends Omit<ColorPickerRootProps, 'styling' | 'ui'> {
  predefine?: string[]
  size?: 'large' | 'default' | 'small'
  showAlpha?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '#ffffff',
  predefine: () => [],
  size: 'default',
  showAlpha: false
})

const emits = defineEmits<ColorPickerRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)

// Handle predefined color click
const handlePredefineClick = (color: string) => {
  // Update the model value directly
  emits('update:modelValue', color)
  emits('change', color)
}
</script>

<template>
  <ColorPickerRoot v-bind="forwarded" styling="vanillacss" :ui="{ input: { label: 'hidden' } }">
    <div class="flex flex-col gap-3">
      <ColorPickerCanvas class="w-[200px] h-[150px] rounded-md" />

      <div class="flex flex-col gap-2">
        <ColorPickerSliderHue class="h-3" />
        <ColorPickerSliderAlpha v-if="showAlpha" class="h-3" />
      </div>

      <ColorPickerInputHex class="w-full" />

      <!-- Predefined Colors -->
      <div v-if="predefine.length > 0" class="flex flex-col gap-2">
        <div class="h-px bg-border" />
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="(color, index) in predefine"
            :key="index"
            type="button"
            class="w-5 h-5 rounded-sm border border-gray-300 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :style="{ backgroundColor: color }"
            @click="handlePredefineClick(color)"
          />
        </div>
      </div>
    </div>
  </ColorPickerRoot>
</template>

<style scoped>
/* Override vuelor picker styles to match shadcn theme */
:deep([data-vuelor]) {
  --vuelor-primary: hsl(var(--primary));
  --vuelor-surface: hsl(var(--background));
  --vuelor-border: hsl(var(--border));
  --vuelor-input: hsl(var(--input));
}

:deep(.vuelor-picker-canvas) {
  border-radius: 0.375rem;
}

:deep(.vuelor-slider) {
  border-radius: 9999px;
}

:deep(.vuelor-input) {
  font-size: 0.75rem;
}
</style>
