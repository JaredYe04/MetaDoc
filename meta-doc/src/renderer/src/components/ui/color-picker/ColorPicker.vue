<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@renderer/lib/utils'
import tinycolor from 'tinycolor2'

// Import shadcn components
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Slider } from '@renderer/components/ui/slider'

interface Props {
  modelValue?: string
  predefine?: string[]
  size?: 'large' | 'default' | 'small'
  showAlpha?: boolean
  colorFormat?: 'hex' | 'rgb' | 'hsl' | 'hsv'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '#ffffff',
  predefine: () => [],
  size: 'default',
  showAlpha: false,
  colorFormat: 'hex'
})

const emits = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
  'active-change': [value: string]
  'visible-change': [visible: boolean]
}>()

// v-model binding
const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.modelValue
})

// Popover open state
const isOpen = ref(false)

// Internal color state (HSVA for easier manipulation)
const hsva = ref({ h: 0, s: 0, v: 100, a: 1 })

// Saturation-value panel dragging state
const svPanelRef = ref<HTMLDivElement | null>(null)
const isDraggingSV = ref(false)

// Computed color string based on format
const currentColor = computed(() => {
  const color = tinycolor({
    h: hsva.value.h,
    s: hsva.value.s,
    v: hsva.value.v
  })

  if (props.showAlpha) {
    color.setAlpha(hsva.value.a)
  }

  switch (props.colorFormat) {
    case 'rgb':
      return props.showAlpha ? color.toRgbString() : color.toRgbString()
    case 'hsl':
      return props.showAlpha ? color.toHslString() : color.toHslString()
    case 'hsv':
      const { h, s, v } = hsva.value
      return props.showAlpha
        ? `hsva(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(v)}%, ${hsva.value.a.toFixed(2)})`
        : `hsv(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(v)}%)`
    case 'hex':
    default:
      return props.showAlpha ? color.toHex8String() : color.toHexString()
  }
})

// Display value for input field
const inputValue = computed(() => {
  return currentColor.value
})

// Size classes
const sizeClasses = computed(() => {
  switch (props.size) {
    case 'large':
      return 'w-10 h-10'
    case 'small':
      return 'w-6 h-6'
    case 'default':
    default:
      return 'w-8 h-8'
  }
})

// Trigger button size classes
const triggerSizeClasses = computed(() => {
  switch (props.size) {
    case 'large':
      return 'w-10 h-10 rounded-lg'
    case 'small':
      return 'w-6 h-6 rounded'
    case 'default':
    default:
      return 'w-8 h-8 rounded-md'
  }
})

// Convert modelValue to HSVA on mount and when it changes externally
const updateHsvaFromModel = () => {
  const color = tinycolor(modelValue.value)
  if (color.isValid()) {
    const hsv = color.toHsv()
    hsva.value = {
      h: hsv.h,
      s: hsv.s * 100,
      v: hsv.v * 100,
      a: color.getAlpha()
    }
  }
}

// Initialize HSVA from model value
onMounted(() => {
  updateHsvaFromModel()
})

// Watch for external model value changes
watch(() => props.modelValue, (newVal) => {
  const color = tinycolor(newVal)
  if (color.isValid()) {
    const newColorStr = props.showAlpha
      ? color.toHex8String()
      : color.toHexString()
    const currentStr = props.showAlpha
      ? tinycolor(currentColor.value).toHex8String()
      : tinycolor(currentColor.value).toHexString()
    // Only update if different to avoid loops
    if (newColorStr.toLowerCase() !== currentStr.toLowerCase()) {
      updateHsvaFromModel()
    }
  }
}, { immediate: true })

// Emit active-change when HSVA changes (while dragging or adjusting)
watch(hsva, () => {
  emits('active-change', currentColor.value)
}, { deep: true })

// Handle popover open change
const handleOpenChange = (open: boolean) => {
  isOpen.value = open
  emits('visible-change', open)
  if (open) {
    updateHsvaFromModel()
  }
}

// Saturation-Value panel handlers
const handleSVMouseDown = (e: MouseEvent) => {
  isDraggingSV.value = true
  updateSVFromMouse(e)
  document.addEventListener('mousemove', handleSVMouseMove)
  document.addEventListener('mouseup', handleSVMouseUp)
}

const handleSVMouseMove = (e: MouseEvent) => {
  if (!isDraggingSV.value) return
  updateSVFromMouse(e)
}

const handleSVMouseUp = () => {
  isDraggingSV.value = false
  document.removeEventListener('mousemove', handleSVMouseMove)
  document.removeEventListener('mouseup', handleSVMouseUp)
  // Emit change event on mouse up
  emits('change', currentColor.value)
  modelValue.value = currentColor.value
}

const updateSVFromMouse = (e: MouseEvent) => {
  if (!svPanelRef.value) return
  const rect = svPanelRef.value.getBoundingClientRect()
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))

  hsva.value.s = x * 100
  hsva.value.v = (1 - y) * 100
}

// Handle hue slider change
const handleHueChange = (value: number[]) => {
  hsva.value.h = value[0]
}

const handleHueCommit = () => {
  emits('change', currentColor.value)
  modelValue.value = currentColor.value
}

// Handle alpha slider change
const handleAlphaChange = (value: number[]) => {
  hsva.value.a = value[0] / 100
}

const handleAlphaCommit = () => {
  emits('change', currentColor.value)
  modelValue.value = currentColor.value
}

// Handle predefined color click
const handlePredefineClick = (color: string) => {
  const tc = tinycolor(color)
  if (tc.isValid()) {
    const hsv = tc.toHsv()
    hsva.value = {
      h: hsv.h,
      s: hsv.s * 100,
      v: hsv.v * 100,
      a: tc.getAlpha()
    }
    emits('change', currentColor.value)
    modelValue.value = currentColor.value
  }
}

// Handle manual input
const handleInputChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  const color = tinycolor(target.value)
  if (color.isValid()) {
    const hsv = color.toHsv()
    hsva.value = {
      h: hsv.h,
      s: hsv.s * 100,
      v: hsv.v * 100,
      a: color.getAlpha()
    }
    emits('change', currentColor.value)
    modelValue.value = currentColor.value
  }
}

// Compute gradient backgrounds
const svPanelBackground = computed(() => {
  return `hsl(${hsva.value.h}, 100%, 50%)`
})

// Cursor position for SV panel
const svCursorStyle = computed(() => {
  return {
    left: `${hsva.value.s}%`,
    top: `${100 - hsva.value.v}%`
  }
})
</script>

<template>
  <Popover :open="isOpen" @update:open="handleOpenChange">
    <PopoverTrigger as-child>
      <button
        type="button"
        :class="cn(
          'relative inline-flex items-center justify-center border border-border bg-background transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          triggerSizeClasses
        )"
        :style="{ backgroundColor: modelValue }"
      >
        <!-- Checkerboard pattern for alpha indication -->
        <span
          v-if="showAlpha"
          class="absolute inset-0 rounded-[inherit] opacity-30"
          style="background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 8px 8px; background-position: 0 0, 0 4px, 4px -4px, -4px 0px;"
        />
        <span
          class="absolute inset-1 rounded-[inherit] border border-black/10"
          :style="{ backgroundColor: modelValue }"
        />
      </button>
    </PopoverTrigger>
    <PopoverContent
      class="w-auto p-3"
      align="start"
      :side-offset="4"
    >
      <div class="flex flex-col gap-3">
        <!-- Saturation-Value Panel -->
        <div
          ref="svPanelRef"
          class="relative w-[200px] h-[150px] cursor-crosshair rounded-md overflow-hidden"
          :style="{ backgroundColor: svPanelBackground }"
          @mousedown="handleSVMouseDown"
        >
          <!-- White gradient (saturation) -->
          <div
            class="absolute inset-0"
            style="background: linear-gradient(to right, #fff, rgba(255,255,255,0))"
          />
          <!-- Black gradient (value) -->
          <div
            class="absolute inset-0"
            style="background: linear-gradient(to top, #000, rgba(0,0,0,0))"
          />
          <!-- Cursor -->
          <div
            class="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow-md"
            :style="svCursorStyle"
          />
        </div>

        <!-- Hue Slider -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground w-8">H</span>
          <div
            class="flex-1 h-3 rounded-full relative"
            style="background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
          >
            <Slider
              :model-value="[hsva.h]"
              :min="0"
              :max="360"
              :step="1"
              class="absolute inset-0"
              @update:model-value="handleHueChange"
              @value-commit="handleHueCommit"
            />
          </div>
        </div>

        <!-- Alpha Slider -->
        <div v-if="showAlpha" class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground w-8">A</span>
          <div class="flex-1 h-3 rounded-full relative overflow-hidden">
            <!-- Checkerboard background -->
            <div
              class="absolute inset-0"
              style="background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 8px 8px; background-position: 0 0, 0 4px, 4px -4px, -4px 0px;"
            />
            <!-- Color gradient -->
            <div
              class="absolute inset-0"
              :style="{ background: `linear-gradient(to right, transparent, ${tinycolor({ h: hsva.h, s: hsva.s, v: hsva.v }).toHexString()})` }"
            />
            <Slider
              :model-value="[hsva.a * 100]"
              :min="0"
              :max="100"
              :step="1"
              class="absolute inset-0"
              @update:model-value="handleAlphaChange"
              @value-commit="handleAlphaCommit"
            />
          </div>
        </div>

        <!-- Predefined Colors -->
        <div v-if="predefine.length > 0" class="flex flex-col gap-2">
          <div class="h-px bg-border" />
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="(color, index) in predefine"
              :key="index"
              type="button"
              class="w-5 h-5 rounded-sm border border-border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :style="{ backgroundColor: color }"
              @click="handlePredefineClick(color)"
            />
          </div>
        </div>

        <!-- Color Input -->
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <input
              :value="inputValue"
              type="text"
              class="w-full h-8 px-2 text-xs rounded-md border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @change="handleInputChange"
            />
          </div>
          <!-- Current color preview -->
          <div
            class="w-8 h-8 rounded-md border border-border flex-shrink-0"
            :style="{ backgroundColor: currentColor }"
          />
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
/* Custom styles for the color picker */
:deep(.slider-track) {
  background: transparent !important;
}

:deep(.slider-range) {
  background: transparent !important;
}

:deep(.slider-thumb) {
  width: 12px;
  height: 12px;
  background: white;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
</style>
