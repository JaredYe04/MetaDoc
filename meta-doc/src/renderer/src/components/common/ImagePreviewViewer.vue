<template>
  <div class="image-preview-viewer" :class="{ 'has-toolbar': showToolbar }">
    <div
      ref="containerRef"
      class="image-preview-viewer-container"
      @mousedown="handleContainerMouseDown"
      @mousemove="handleContainerMouseMove"
      @mouseup="handleContainerMouseUp"
      @mouseleave="handleContainerMouseUp"
      @wheel="handleWheelZoom"
    >
      <img
        v-if="src"
        :src="src"
        :alt="alt"
        class="image-preview-viewer-img"
        :style="previewImageStyle"
        draggable="false"
        @load="onImageLoad"
        @error="onImageError"
      />
    </div>
    <div v-if="showToolbar" class="image-preview-viewer-toolbar">
      <Button size="icon" @click="zoomOut" :disabled="imageScale <= 0.1">
        <ZoomOut class="h-4 w-4" />
      </Button>
      <NumberField
        :model-value="imageScalePercent"
        @update:model-value="handleScaleChange"
        :min="10"
        :max="500"
        :step="10"
        style="width: 100px"
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
      <Button size="sm" variant="outline" @click="resetZoom">
        {{ resetLabel }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
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
import { useImagePreview } from '../../composables/useImagePreview'

const props = withDefaults(
  defineProps<{
    src: string
    alt?: string
    showToolbar?: boolean
    resetLabel?: string
    containerPadding?: number
  }>(),
  {
    alt: '',
    showToolbar: true,
    resetLabel: undefined,
    containerPadding: 24
  }
)

const { t } = useI18n()
const containerRef = ref<HTMLElement | null>(null)
const imageUrl = computed(() => props.src)

const {
  imageScale,
  imageScalePercent,
  previewImageStyle,
  zoomIn,
  zoomOut,
  resetZoom,
  handleScaleChange,
  handleContainerMouseDown,
  handleContainerMouseMove,
  handleContainerMouseUp,
  handleWheelZoom,
  calculateAndSetFitScale
} = useImagePreview({
  imageUrl,
  containerRef,
  getImageElement: () => containerRef.value?.querySelector('.image-preview-viewer-img') as HTMLImageElement | null,
  containerPadding: props.containerPadding
})

const onImageLoad = () => {
  calculateAndSetFitScale()
}

const onImageError = () => {
  // 静默处理
}

watch(
  () => props.src,
  () => {
    if (props.src) {
      calculateAndSetFitScale()
    }
  }
)

onMounted(() => {
  if (props.src) {
    calculateAndSetFitScale()
  }
})

const resetLabel = computed(() => props.resetLabel ?? t('ocr.resetZoom') ?? '重置')
</script>

<style scoped>
.image-preview-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.image-preview-viewer-container {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background2nd || "#f5f5f5"');
  border-radius: 8px;
  cursor: grab;
  user-select: none;
}

.image-preview-viewer-container:active {
  cursor: grabbing;
}

.image-preview-viewer-img {
  max-width: none;
  max-height: none;
  width: auto;
  height: auto;
  object-fit: contain;
  user-select: none;
  pointer-events: none;
  transition: none;
  display: block;
}

.image-preview-viewer-toolbar {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}

.scale-unit {
  margin-left: 4px;
  color: v-bind('themeState.currentTheme.textColor');
}
</style>
