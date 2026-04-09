<template>
  <div class="homepage">
    <!-- 如果文档格式未选择，显示格式选择界面 -->
    <div v-if="needsFormatSelection" class="format-selection-container">
      <NewDocumentWorkspace v-if="activeTabId" :tab-id="activeTabId" :active="true" />
    </div>

    <!-- 如果已选择格式，显示文档预览 -->
    <div v-else-if="showDocumentPreview" class="home-panel" :style="panelStyle">
      <HomePdfAdapter v-if="isPdfTab" :pdf-url="pdfUrlForHome" class="home-panel-adapter" />
      <HomeRenderableAdapter
        v-else-if="isRenderableFormat"
        class="home-panel-adapter"
        :file-name="fileName"
        :file-format="fileFormat"
        :creation-date="creationDate"
        :modification-date="modificationDate"
        :display-type="renderableDisplayType as 'svg' | 'html' | 'image'"
        :is-image="isImageFormat(currentFilePath)"
        :content="renderableContent"
        :svg-data-url="renderableSvgDataUrl"
        :image-url="renderableFileUrl"
      />
      <HomePlainTextAdapter
        v-else-if="isPlainTextFormat"
        ref="plainTextAdapterRef"
        class="home-panel-adapter"
        :file-name="fileName"
        :file-format="fileFormat"
        :creation-date="creationDate"
        :modification-date="modificationDate"
        :content="plainTextContent"
        :file-path="currentFilePath"
      />
      <HomeMarkdownAdapter
        v-else
        class="home-panel-adapter"
        :markdown="previewMarkdown"
        :is-loading="isLatexPreviewLoading"
        :link-base="currentLinkBase"
        :doc-path="currentFilePath"
        :meta-title="metaTitle"
        :meta-author="metaAuthor"
        :meta-description="metaDescription"
        :open-system-tab="openSystemTab"
      />
      <!-- PDF：底部提供转为 Markdown 编辑（全局，非仅专注模式） -->
      <div v-if="isPdfTab" class="home-pdf-convert-bar">
        <span class="home-pdf-convert-hint">{{ $t('focusMode.pdfPreviewHint') }}</span>
        <button type="button" class="home-pdf-convert-btn" @click="handleFocusPdfConvert">
          {{ $t('focusMode.convertToMarkdown') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import NewDocumentWorkspace from './NewDocumentWorkspace.vue'
import eventBus, { getWindowType } from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { convertLatexToMarkdown } from '../utils/latex-utils'
import { svgContentToDataUrl } from '../utils/common/file-display-utils'
import messageBridge from '../bridge/message-bridge'
import {
  HomePdfAdapter,
  HomeRenderableAdapter,
  HomePlainTextAdapter,
  HomeMarkdownAdapter
} from './home/adapters'
import { useHomeDocumentPreview } from './home/useHomeDocumentPreview'

const {
  activeDocument,
  activeTab,
  workspace,
  currentFilePath,
  metaTitle,
  metaAuthor,
  metaDescription,
  fileName,
  fileFormat,
  creationDate,
  modificationDate,
  isRenderableFormat,
  renderableDisplayType,
  isPlainTextFormat,
  isPdfTab,
  showDocumentPreview,
  needsFormatSelection,
  currentLinkBase,
  encodeFilePathToUrl,
  loadFileStats,
  isImageFormat
} = useHomeDocumentPreview({ windowTypeProvider: () => getWindowType() })

const { activeTabId, openSystemTab } = workspace

const handleFocusPdfConvert = () => {
  if (activeTabId.value) {
    eventBus.emit('convert-pdf-preview-tab-to-md', { tabId: activeTabId.value })
  }
}

const pdfUrlForHome = computed(() => {
  if (!currentFilePath.value || !isPdfTab.value) return ''
  return encodeFilePathToUrl(currentFilePath.value)
})

const renderableContent = computed(
  () => (activeDocument.value?.format === 'txt' ? (activeDocument.value?.markdown ?? '') : '')
)

const renderableSvgDataUrl = computed(() => svgContentToDataUrl(renderableContent.value))

const renderableFileUrl = computed(() => {
  if (!isImageFormat(currentFilePath.value)) return ''
  return encodeFilePathToUrl(currentFilePath.value)
})

const plainTextContent = computed(
  () => (activeDocument.value?.format === 'txt' ? (activeDocument.value?.markdown ?? '') : '')
)

const previewMarkdown = ref('')
const isLatexPreviewLoading = ref(false)

const MAX_LATEX_INPUT_EXPAND_DEPTH = 12

function normalizeFsPath(path: string): string {
  let decoded = path || ''
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // 非法 URI 编码时保留原值，避免影响预览流程
  }
  const withoutFilePrefix = decoded.replace(/^file:\/\/\//, '')
  return withoutFilePrefix.replace(/\\/g, '/')
}

function isAbsolutePath(path: string): boolean {
  return /^([A-Za-z]:\/|\/)/.test(path)
}

function dirname(path: string): string {
  const normalized = normalizeFsPath(path)
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) : ''
}

function joinPath(baseDir: string, target: string): string {
  const normalizedBase = normalizeFsPath(baseDir).replace(/\/+$/, '')
  const normalizedTarget = normalizeFsPath(target).replace(/^\/+/, '')
  if (!normalizedBase) return normalizedTarget
  return `${normalizedBase}/${normalizedTarget}`
}

function resolveRelativePath(baseDir: string, targetPath: string): string {
  const direct = isAbsolutePath(targetPath) ? normalizeFsPath(targetPath) : joinPath(baseDir, targetPath)
  const segments = direct.split('/')
  const stack: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (stack.length > 1 || (stack.length > 0 && !/^[A-Za-z]:$/.test(stack[0]))) {
        stack.pop()
      }
      continue
    }
    stack.push(segment)
  }
  return stack.join('/')
}

async function readFileContent(filePath: string): Promise<string | null> {
  if (!messageBridge.getIpc()?.invoke) return null
  try {
    const content = await messageBridge.invoke('read-file-content', filePath)
    return typeof content === 'string' ? content : null
  } catch {
    return null
  }
}

async function readTexWithFallbackExtensions(pathWithoutExt: string): Promise<{ path: string; content: string } | null> {
  const candidates = pathWithoutExt.toLowerCase().endsWith('.tex')
    ? [pathWithoutExt]
    : [pathWithoutExt, `${pathWithoutExt}.tex`]
  for (const candidate of candidates) {
    const content = await readFileContent(candidate)
    if (typeof content === 'string') {
      return { path: candidate, content }
    }
  }
  return null
}

async function expandLatexInputs(
  latex: string,
  sourceFilePath: string,
  visited: Set<string>,
  depth = 0
): Promise<string> {
  if (!latex || !sourceFilePath) return latex
  if (depth >= MAX_LATEX_INPUT_EXPAND_DEPTH) return latex

  const inputRegex = /\\(input|include)\s*\{([^}\r\n]+)\}/g
  let output = ''
  let lastIndex = 0
  const baseDir = dirname(sourceFilePath)

  for (const match of latex.matchAll(inputRegex)) {
    const fullMatch = match[0]
    const targetRaw = (match[2] || '').trim()
    const start = match.index ?? -1
    if (start < 0) continue

    output += latex.slice(lastIndex, start)
    lastIndex = start + fullMatch.length

    if (!targetRaw) {
      output += fullMatch
      continue
    }

    const resolvedTarget = resolveRelativePath(baseDir, targetRaw)
    const fileData = await readTexWithFallbackExtensions(resolvedTarget)
    if (!fileData) {
      output += fullMatch
      continue
    }

    const normalizedResolvedPath = normalizeFsPath(fileData.path)
    if (visited.has(normalizedResolvedPath)) {
      output += fullMatch
      continue
    }

    visited.add(normalizedResolvedPath)
    const expanded = await expandLatexInputs(fileData.content, normalizedResolvedPath, visited, depth + 1)
    output += expanded
  }

  output += latex.slice(lastIndex)
  return output
}

let previewRenderToken = 0

watch(
  [activeDocument, currentFilePath],
  async () => {
    const token = ++previewRenderToken
    const doc = activeDocument.value
    if (!doc) {
      previewMarkdown.value = ''
      return
    }

    if (doc.format !== 'tex') {
      isLatexPreviewLoading.value = false
      previewMarkdown.value = doc.markdown ?? ''
      return
    }

    isLatexPreviewLoading.value = true
    const rawTex = doc.tex ?? ''
    const texPath = currentFilePath.value
    let texForPreview = rawTex

    try {
      if (rawTex && texPath && messageBridge.getIpc()?.invoke) {
        const visited = new Set<string>([normalizeFsPath(texPath)])
        texForPreview = await expandLatexInputs(rawTex, texPath, visited)
      }
      if (token !== previewRenderToken) return
      previewMarkdown.value = convertLatexToMarkdown(texForPreview)
    } finally {
      if (token === previewRenderToken) {
        isLatexPreviewLoading.value = false
      }
    }
  },
  { immediate: true }
)

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderColor: themeState.currentTheme.borderColor || 'rgba(0, 0, 0, 0.1)'
}))

const plainTextAdapterRef = ref<InstanceType<typeof HomePlainTextAdapter> | null>(null)

function preventNavigate() {
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
    if (target && target.href && target.target !== '_blank') {
      event.preventDefault()
      if (target.href.startsWith('http')) {
        eventBus.emit('open-link', target.href)
      }
    }
  })
}

// 监听文件路径变化，加载文件统计信息
watch(
  [currentFilePath, isPlainTextFormat, isRenderableFormat],
  () => {
    if ((isPlainTextFormat.value || isRenderableFormat.value) && currentFilePath.value) {
      loadFileStats()
    }
  },
  { immediate: true }
)

onMounted(() => {
  preventNavigate()
  eventBus.on('sync-editor-theme', () => {
    plainTextAdapterRef.value?.syncTheme?.()
  })
})

onBeforeUnmount(() => {
  eventBus.off('sync-editor-theme')
})
</script>

<style scoped>
.homepage {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.format-selection-container {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
}

.home-panel {
  position: relative;
  z-index: 1;
  flex: 1;
  width: calc(100% - 48px);
  max-width: calc(100% - 48px);
  min-width: 0;
  min-height: 0;
  margin: 24px;
  box-sizing: border-box;
  border-radius: 16px;
  border: 1px solid;
  backdrop-filter: blur(20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.home-panel-adapter {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .home-panel {
    width: calc(100% - 32px);
    max-width: calc(100% - 32px);
    height: calc(100% - 32px);
    margin: 16px;
    border-radius: 12px;
  }
}

.home-pdf-convert-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--el-fill-color-light);
  border-top: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.home-pdf-convert-hint {
  font-size: 13px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}

.home-pdf-convert-btn {
  padding: 6px 14px;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 6px;
  background: transparent;
  color: var(--el-color-primary);
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.home-pdf-convert-btn:hover {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}
</style>
