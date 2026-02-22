<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  ColorPickerRoot,
  ColorPickerCanvas,
  ColorPickerSliderHue,
  ColorPickerSliderAlpha,
  ColorPickerInputHex
} from '@vuelor/picker'
import '@vuelor/picker/style.css'

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

// 内部颜色状态
const color = ref(props.modelValue)
const isInteracting = ref(false)

// 同步外部值变化（仅当不在交互中时）
watch(
  () => props.modelValue,
  (newVal) => {
    if (!isInteracting.value && newVal !== color.value) {
      color.value = newVal
    }
  }
)

// 处理颜色变化（拖拽过程中）- 只更新内部状态和 active-change
const handleActiveChange = (newColor: string) => {
  color.value = newColor
  isInteracting.value = true
  emits('active-change', newColor)
}

// 处理颜色确认（拖拽结束/输入完成）- 触发 change 和 update:modelValue
const handleChange = (newColor: string) => {
  isInteracting.value = false
  color.value = newColor
  emits('update:modelValue', newColor)
  emits('change', newColor)
}

// 处理预定义颜色点击
const handlePredefineClick = (preColor: string) => {
  color.value = preColor
  emits('update:modelValue', preColor)
  emits('change', preColor)
  emits('active-change', preColor)
}
</script>

<template>
  <ColorPickerRoot v-model="color" styling="vanillacss" @update:model-value="handleChange">
    <div class="flex flex-col gap-2">
      <ColorPickerCanvas
        class="w-[200px] h-[150px] rounded-md"
        @update:model-value="handleActiveChange"
      />

      <div class="flex gap-2">
        <ColorPickerSliderHue class="flex-1 h-4" @update:model-value="handleActiveChange" />
      </div>

      <div v-if="showAlpha" class="flex gap-2">
        <ColorPickerSliderAlpha class="flex-1 h-4" @update:model-value="handleActiveChange" />
      </div>

      <ColorPickerInputHex class="w-full" @update:model-value="handleChange" />

      <!-- 预定义颜色 -->
      <div v-if="predefine.length > 0" class="flex flex-wrap gap-1.5 mt-2">
        <button
          v-for="(preColor, index) in predefine"
          :key="index"
          type="button"
          class="w-5 h-5 rounded-sm border border-gray-300 transition-transform hover:scale-110"
          :style="{ backgroundColor: preColor }"
          @click="handlePredefineClick(preColor)"
        />
      </div>
    </div>
  </ColorPickerRoot>
</template>

<style scoped>
/* 确保 vuelor picker 样式正确应用 */
:deep([data-vuelor]) {
  --vuelor-primary: hsl(var(--primary));
  --vuelor-surface: hsl(var(--background));
  --vuelor-border: hsl(var(--border));
  --vuelor-input: hsl(var(--input));
}
</style>
