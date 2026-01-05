<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="handleUpdateModelValue"
    :title="t('ocr.imagePreview')"
    width="90%"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    class="image-preview-dialog"
  >
    <div 
      class="preview-image-container" 
      v-if="imageUrl" 
      @mousedown="handleContainerMouseDown" 
      @mousemove="handleContainerMouseMove" 
      @mouseup="handleContainerMouseUp" 
      @mouseleave="handleContainerMouseUp" 
      @wheel="handleWheelZoom"
    >
      <img 
        :src="imageUrl" 
        :alt="t('ocr.previewImage')"
        class="preview-image"
        :style="previewImageStyle"
        @error="handlePreviewImageError"
        draggable="false"
      />
    </div>
    <template #footer>
      <div class="preview-actions">
        <el-button circle @click="zoomOut" :disabled="imageScale <= 0.1">
          <el-icon><ZoomOut /></el-icon>
        </el-button>
        <el-input-number
          v-model="imageScalePercent"
          :min="10"
          :max="500"
          :step="10"
          :precision="0"
          controls-position="right"
          style="width: 120px"
          @change="handleScaleChange"
        />
        <span class="scale-unit">%</span>
        <el-button circle @click="zoomIn" :disabled="imageScale >= 5">
          <el-icon><ZoomIn /></el-icon>
        </el-button>
        <el-button @click="resetZoom">
          {{ t('ocr.resetZoom') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import { themeState } from '../../utils/themes'

const { t } = useI18n()

interface Props {
  modelValue: boolean
  imageUrl?: string
}

const props = withDefaults(defineProps<Props>(), {
  imageUrl: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

// 图片预览相关状态
const imageScale = ref(1)
const imagePosition = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

// 缩放比例百分比（与 imageScale 双向绑定）
const imageScalePercent = computed({
  get: () => Math.round(imageScale.value * 100),
  set: (val: number) => {
    imageScale.value = Math.max(0.1, Math.min(5, val / 100))
  }
})

// 图片预览样式（包含缩放和位置）
const previewImageStyle = computed(() => {
  return {
    transform: `translate(${imagePosition.value.x}px, ${imagePosition.value.y}px) scale(${imageScale.value})`,
    transformOrigin: 'center center',
    cursor: isDragging.value ? 'grabbing' : 'grab'
  }
})

// 处理对话框显示状态更新
const handleUpdateModelValue = (value: boolean) => {
  emit('update:modelValue', value)
  if (!value) {
    // 关闭时重置状态
    resetZoom()
  }
}

// 监听 imageUrl 变化，重置状态
watch(() => props.imageUrl, () => {
  if (props.imageUrl) {
    imageScale.value = 1
    imagePosition.value = { x: 0, y: 0 }
  }
})

// 缩放功能
const zoomIn = () => {
  if (imageScale.value < 5) {
    imageScale.value = Math.min(imageScale.value + 0.1, 5)
  }
}

const zoomOut = () => {
  if (imageScale.value > 0.1) {
    imageScale.value = Math.max(imageScale.value - 0.1, 0.1)
  }
}

const resetZoom = () => {
  imageScale.value = 1
  imagePosition.value = { x: 0, y: 0 }
}

// 缩放比例输入框变化处理
const handleScaleChange = (val: number | null) => {
  if (val !== null) {
    imageScale.value = Math.max(0.1, Math.min(5, val / 100))
  }
}

// 拖拽功能
const handleContainerMouseDown = (e: MouseEvent) => {
  if (e.button !== 0) return // 只处理左键
  isDragging.value = true
  dragStart.value = {
    x: e.clientX - imagePosition.value.x,
    y: e.clientY - imagePosition.value.y
  }
  e.preventDefault()
  e.stopPropagation()
}

const handleContainerMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  imagePosition.value = {
    x: e.clientX - dragStart.value.x,
    y: e.clientY - dragStart.value.y
  }
  e.preventDefault()
  e.stopPropagation()
}

const handleContainerMouseUp = (e?: MouseEvent) => {
  if (e) {
    e.preventDefault()
    e.stopPropagation()
  }
  isDragging.value = false
}

// 滚轮缩放功能（Ctrl+滚轮）
const handleWheelZoom = (e: WheelEvent) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    e.stopPropagation()
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newScale = Math.max(0.1, Math.min(5, imageScale.value + delta))
    imageScale.value = newScale
  }
}

// 预览图片加载错误处理
const handlePreviewImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  console.error('预览图片加载失败:', img.src)
}
</script>

<style scoped>
/* 图片预览对话框样式 */
.image-preview-dialog :deep(.el-dialog__body) {
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  max-height: 70vh;
  overflow: hidden;
}

.preview-image-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
  max-height: 70vh;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  background-color: #f5f5f5;
  border-radius: 8px;
  position: relative;
  cursor: grab;
  user-select: none;
}

.preview-image-container:active {
  cursor: grabbing;
}

.preview-image {
  max-width: none;
  max-height: none;
  width: auto;
  height: auto;
  object-fit: contain;
  user-select: none;
  pointer-events: none;
  transition: transform 0.1s ease-out;
  position: relative;
  display: block;
}

.preview-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
}

.scale-unit {
  margin-left: 4px;
  color: v-bind('themeState.currentTheme.textColor');
}

/* 暗色主题适配 */
:deep(.image-preview-dialog) {
  --el-dialog-bg-color: v-bind('themeState.currentTheme.background2nd');
  --el-dialog-text-color: v-bind('themeState.currentTheme.textColor');
}

.image-preview-dialog .preview-image-container {
  background-color: v-bind('themeState.currentTheme.background');
}
</style>

