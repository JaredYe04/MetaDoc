<template>
  <Home
    v-if="showWorkspaceHomePreview"
    :key="`workspace-home-${tab.id}`"
    class="workspace-tab-pane workspace-tab-pane--home-preview"
  />
  <WorkspaceDocumentViews
    v-else-if="useDocumentMultiViewShell"
    :key="`multiview-${tab.id}`"
    :tab-id="tab.id"
    :use-nested-editor="false"
    class="workspace-tab-pane workspace-tab-pane--multiview"
  >
    <template #editor>
      <component
        :is="editorComponent"
        :tab-id="tab.id"
        :active="active"
        :editor-dom-id="editorDomId"
        class="workspace-tab-pane"
      />
    </template>
  </WorkspaceDocumentViews>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownEditor from '../../views/MarkdownEditor.vue'
import LaTeXEditor from '../../views/LaTeXEditor.vue'
import PlainTextEditor from '../../views/PlainTextEditor.vue'
import NewDocumentWorkspace from '../../views/NewDocumentWorkspace.vue'
import Home from '../../views/Home.vue'
import WorkspaceDocumentViews from './WorkspaceDocumentViews.vue'
import type { WorkspaceTab } from '../../stores/workspace'
import { formatRegistry } from '../../utils/format-registry'
import { useFocusMode } from '../../composables/useFocusMode'
import { IMAGE_EXTENSIONS, RENDERABLE_TEXT_EXTENSIONS } from '../../utils/file-display-utils'
import { extname } from '../../utils/path-utils'

const { isFocusMode } = useFocusMode()

const props = withDefaults(
  defineProps<{
    tab: WorkspaceTab
    active: boolean
  }>(),
  {
    active: true
  }
)

/**
 * PDF 预览 tab：任意布局下用 Home（含 PDF 适配器），避免挂载 Markdown 编辑器导致空白。
 * 专注模式下：图片 / SVG 等不可编辑资源同样走 Home，避免挂载 Vditor。
 */
const showWorkspaceHomePreview = computed(() => {
  if (props.tab.kind !== 'file') return false
  if (props.tab.format === 'pdf' && props.tab.preview === true) return true
  if (!isFocusMode.value) return false
  if (props.tab.format === 'pdf') return true
  const path = props.tab.path || ''
  const ext = extname(path).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext) || RENDERABLE_TEXT_EXTENSIONS.has(ext)
})

/** 普通文档 / 新建：按 lastView 切换主页、编辑器、大纲树、可视化、Agent、校对 */
const useDocumentMultiViewShell = computed(() => {
  return props.tab.kind === 'file' || props.tab.kind === 'new'
})

const editorComponent = computed(() => {
  if (props.tab.kind === 'new') return NewDocumentWorkspace

  // 使用格式注册系统获取编辑器组件
  const format = formatRegistry.getFormat(props.tab.format)
  if (format && format.editorComponent) {
    return format.editorComponent
  }

  // 回退到硬编码的映射（向后兼容）
  if (props.tab.format === 'tex') return LaTeXEditor
  if (props.tab.format === 'txt') return PlainTextEditor
  return MarkdownEditor
})

const editorDomId = computed(() => {
  if (props.tab.kind === 'new') return ''

  // 根据格式生成编辑器DOM ID
  const format = props.tab.format
  if (format === 'tex') return `latex-editor-${props.tab.id}`
  if (format === 'txt') return `plaintext-editor-${props.tab.id}`
  return `vditor-${props.tab.id}`
})
</script>

<style scoped>
.workspace-tab-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

/* 关键：无论渲染的是 MarkdownEditor/LaTeXEditor/NewDocumentWorkspace，
   都确保其“根节点元素”在 flex 容器中铺满可用空间，避免首次布局宽度/高度为 0 或不稳定 */
.workspace-tab-pane > :first-child {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
