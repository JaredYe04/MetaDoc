<script setup lang="ts">
import { computed } from 'vue'
import { ElColorPicker } from 'element-plus'

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

// 映射 size 到 Element Plus 的 size
const elSize = computed(() => {
  switch (props.size) {
    case 'large':
      return 'large'
    case 'small':
      return 'small'
    case 'default':
    default:
      return 'default'
  }
})

// 处理值变化
const handleChange = (val: string) => {
  emits('update:modelValue', val)
  emits('change', val)
}

// 处理活跃变化（选择过程中）
const handleActiveChange = (val: string) => {
  emits('active-change', val)
}

// 处理显示/隐藏
const handleVisibleChange = (visible: boolean) => {
  emits('visible-change', visible)
}
</script>

<template>
  <ElColorPicker
    :model-value="modelValue"
    :predefine="predefine"
    :size="elSize"
    :show-alpha="showAlpha"
    :color-format="colorFormat"
    @change="handleChange"
    @active-change="handleActiveChange"
    @visible-change="handleVisibleChange"
  />
</template>

<style scoped>
/* Element Plus ColorPicker 样式调整 */
:deep(.el-color-picker) {
  display: inline-flex;
}
</style>
