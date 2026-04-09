<template>
  <div class="home-panel-pdf">
    <PdfPreviewPanel :pdf-url="pdfUrl" :default-pages-per-row="2" />
  </div>
</template>

<script setup lang="ts">
import PdfPreviewPanel from '../../../components/editor/PdfPreviewPanel.vue'

defineProps<{
  pdfUrl: string
}>()
</script>

<style scoped>
.home-panel-pdf {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
}
</style>
