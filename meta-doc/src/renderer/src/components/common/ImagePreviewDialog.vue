<template>
  <Dialog :open="modelValue" @update:open="handleUpdateModelValue">
    <DialogContent class="sm:max-w-[90%]" class-name="image-preview-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('ocr.imagePreview') }}</DialogTitle>
      </DialogHeader>
      <ImagePreviewViewer
        v-if="imageUrl"
        :src="imageUrl"
        :alt="t('ocr.previewImage')"
        :show-toolbar="true"
        :container-padding="20"
        class="image-preview-dialog-viewer"
      />
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ImagePreviewViewer from './ImagePreviewViewer.vue'
import { themeState } from '../../utils/themes'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

const { t } = useI18n()

export interface ImagePreprocessingParams {
  brightness: number
  contrast: number
  saturation: number
  sharpness: number
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

const handleUpdateModelValue = (value: boolean) => {
  emit('update:modelValue', value)
}
</script>

<style scoped>
.image-preview-dialog-viewer {
  min-height: 400px;
  max-height: 70vh;
}

:deep(.image-preview-dialog) {
  --el-dialog-bg-color: v-bind('themeState.currentTheme.background2nd');
  --el-dialog-text-color: v-bind('themeState.currentTheme.textColor');
}

:deep(.image-preview-dialog .el-dialog__body) {
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-height: 400px;
  max-height: 70vh;
  overflow: hidden;
}
</style>
