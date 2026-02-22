<template>
  <Dialog :open="modelValue" @update:open="handleUpdateModelValue">
    <DialogContent class="sm:max-w-[90%]" class-name="image-preview-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('ocr.imagePreview') }}</DialogTitle>
      </DialogHeader>
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
      <DialogFooter>
        <div class="preview-actions">
          <Button size="icon" @click="zoomOut" :disabled="imageScale <= 0.1">
            <ZoomOut class="h-4 w-4" />
          </Button>
          <NumberField
            v-model="imageScalePercent"
            :min="10"
            :max="500"
            :step="10"
            style="width: 120px"
            @update:model-value="handleScaleChange"
          >
            <NumberFieldContent>
              <NumberFieldDecrement />
              <NumberFieldInput />
              <NumberFieldIncrement />
            </NumberFieldContent>
          </NumberField>
          <span class="scale-unit">%</span>
          <Button size="icon" @click="zoomIn" :disabled="imageScale >= 5">
            <ZoomIn class="h-4 w-4" />
          </Button>
          <Button @click="resetZoom">
            {{ t('ocr.resetZoom') }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import { themeState } from '../../utils/themes'
import { Button } from '@renderer/components/ui/button'
import {
  NumberField,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
  NumberFieldContent
} from '@renderer/components/ui/number-field'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'

const { t } = useI18n()

export interface ImagePreprocessingParams {
  brightness: number // -100 to 100
  contrast: number // -100 to 100
  saturation: number // -100 to 100
  sharpness: number // 0 to 100
  grayscale: boolean
  normalize: boolean
}

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

// 计算适合容器的缩放比例
const calculateFitScale = (img: HTMLImageElement): number => {
  // 获取容器尺寸（使用对话框的 body 区域）
  const dialogBody = document.querySelector('.image-preview-dialog .el-dialog__body') as HTMLElement
  if (!dialogBody) {
    return 1
  }

  // 使用 naturalWidth 和 naturalHeight 获取图片真实尺寸
  const imgWidth = img.naturalWidth || img.width || 1
  const imgHeight = img.naturalHeight || img.height || 1

  // 如果图片尺寸无效，返回默认值
  if (imgWidth <= 0 || imgHeight <= 0) {
    return 1
  }

  const containerWidth = dialogBody.clientWidth - 40 // 减去 padding
  const containerHeight = dialogBody.clientHeight - 40

  // 如果容器尺寸无效，返回默认值
  if (containerWidth <= 0 || containerHeight <= 0) {
    return 1
  }

  // 计算适合的缩放比例（保持宽高比，完整显示在容器内）
  const scaleX = containerWidth / imgWidth
  const scaleY = containerHeight / imgHeight
  // 使用较小的缩放比例，确保图片完整显示在容器内
  const fitScale = Math.min(scaleX, scaleY)

  // 确保缩放比例在合理范围内
  if (fitScale <= 0 || !isFinite(fitScale)) {
    return 1
  }

  return fitScale
}

// 计算并设置适合的缩放比例
const calculateAndSetFitScale = () => {
  if (!props.imageUrl) {
    return
  }

  nextTick(() => {
    const img = document.querySelector('.preview-image') as HTMLImageElement
    if (!img) {
      return
    }

    const setFitScale = () => {
      // 确保容器已经渲染完成
      setTimeout(() => {
        // 再次检查图片尺寸，确保已加载
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          const fitScale = calculateFitScale(img)
          if (fitScale > 0 && isFinite(fitScale)) {
            // 直接设置目标值
            imageScale.value = fitScale
            imagePosition.value = { x: 0, y: 0 }
          } else {
            // 如果计算出错，使用默认值
            imageScale.value = 1
          }
        } else {
          // 如果图片尺寸仍为0，再等待一下
          setTimeout(() => {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              const fitScale = calculateFitScale(img)
              if (fitScale > 0 && isFinite(fitScale)) {
                imageScale.value = fitScale
                imagePosition.value = { x: 0, y: 0 }
              }
            }
          }, 100)
        }
      }, 150)
    }

    // 如果图片已经加载完成且有有效尺寸
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setFitScale()
    } else {
      // 等待图片加载
      const onLoad = () => {
        setFitScale()
        img.removeEventListener('load', onLoad)
        img.removeEventListener('error', onError)
      }
      const onError = () => {
        imageScale.value = 1
        img.removeEventListener('load', onLoad)
        img.removeEventListener('error', onError)
      }
      img.addEventListener('load', onLoad)
      img.addEventListener('error', onError)

      // 如果图片已经加载但事件已错过，直接设置
      if (img.complete) {
        setTimeout(() => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setFitScale()
          }
        }, 50)
      }
    }
  })
}

// 监听 imageUrl 变化，重置状态并计算适合的缩放
watch(
  () => props.imageUrl,
  () => {
    if (props.imageUrl) {
      imagePosition.value = { x: 0, y: 0 }
      // 不先设置为1，直接计算目标值
      calculateAndSetFitScale()
    }
  }
)

// 监听对话框打开状态，每次打开时重新计算缩放
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue && props.imageUrl) {
      // 对话框打开时，先等待对话框完全渲染，然后计算适合的缩放
      // 不先设置为1，直接计算目标值
      nextTick(() => {
        setTimeout(() => {
          calculateAndSetFitScale()
        }, 50)
      })
    }
  }
)

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
  // 重置到适合容器的缩放比例
  const img = document.querySelector('.preview-image') as HTMLImageElement
  if (img && img.complete) {
    imageScale.value = calculateFitScale(img)
  } else {
    imageScale.value = 1
  }
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
  // 记录鼠标相对于容器中心的位置和当前图片位置
  const container = e.currentTarget as HTMLElement
  const rect = container.getBoundingClientRect()
  const containerCenterX = rect.width / 2
  const containerCenterY = rect.height / 2
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  // 计算鼠标相对于容器中心的偏移
  const offsetX = mouseX - containerCenterX
  const offsetY = mouseY - containerCenterY
  dragStart.value = {
    x: offsetX - imagePosition.value.x,
    y: offsetY - imagePosition.value.y
  }
  e.preventDefault()
  e.stopPropagation()
}

const handleContainerMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  // 计算鼠标相对于容器中心的位置
  const container = e.currentTarget as HTMLElement
  const rect = container.getBoundingClientRect()
  const containerCenterX = rect.width / 2
  const containerCenterY = rect.height / 2
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  // 计算鼠标相对于容器中心的偏移
  const offsetX = mouseX - containerCenterX
  const offsetY = mouseY - containerCenterY
  imagePosition.value = {
    x: offsetX - dragStart.value.x,
    y: offsetY - dragStart.value.y
  }
  e.preventDefault()
  e.stopPropagation()
}

const handleContainerMouseUp = (e?: MouseEvent) => {
  // 立即停止拖拽，避免滞后
  isDragging.value = false
  if (e) {
    e.preventDefault()
    e.stopPropagation()
  }
}

// 滚轮缩放功能（以鼠标位置为中心点缩放）
const handleWheelZoom = (e: WheelEvent) => {
  e.preventDefault()
  e.stopPropagation()

  const container = e.currentTarget as HTMLElement
  const rect = container.getBoundingClientRect()
  const img = document.querySelector('.preview-image') as HTMLImageElement
  if (!img) return

  // 获取容器中心点
  const containerCenterX = rect.width / 2
  const containerCenterY = rect.height / 2

  // 获取鼠标相对于容器的位置
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  // 计算鼠标相对于容器中心的位置
  const offsetX = mouseX - containerCenterX
  const offsetY = mouseY - containerCenterY

  // 计算鼠标在图片上的位置（考虑当前缩放和位置，transformOrigin是center center）
  // 图片中心在容器中心，所以需要加上当前偏移
  const imageX = (offsetX - imagePosition.value.x) / imageScale.value
  const imageY = (offsetY - imagePosition.value.y) / imageScale.value

  // 计算新的缩放比例
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.max(0.1, Math.min(5, imageScale.value + delta))

  // 计算缩放后，鼠标位置对应的新图片位置
  const newImageX = imageX * newScale
  const newImageY = imageY * newScale

  // 调整图片位置，使鼠标位置对应的图片点保持不变
  imagePosition.value = {
    x: offsetX - newImageX,
    y: offsetY - newImageY
  }

  imageScale.value = newScale
}

// 预览图片加载错误处理
const handlePreviewImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  console.error('预览图片加载失败:', img.src)
}

// 边框颜色
const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
)
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
  transition: none;
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
