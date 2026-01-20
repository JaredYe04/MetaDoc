<template>
  <div class="homepage">
    <!-- 快速开始面板 - 优先级最高，覆盖其他所有内容 -->
    <!-- 注意：快速开始面板只在 GlobalHome 中显示，Home.vue 只显示文档总览 -->
    
    <!-- 如果文档格式未选择，显示格式选择界面 -->
    <div v-if="needsFormatSelection" class="format-selection-container">
      <NewDocumentWorkspace 
        v-if="activeTabId"
        :tab-id="activeTabId"
        :active="true"
      />
    </div>

    <!-- 如果已选择格式，显示文档预览 -->
    <div v-else-if="showDocumentPreview" class="home-panel" :style="panelStyle">
      <!-- 纯文本格式：不使用滚动条，让Monaco编辑器占满高度 -->
      <div v-if="isPlainTextFormat" class="home-panel-content-plaintext">
        <div class="home-panel-content">
          <!-- 文档元信息区域 -->
          <div class="document-meta-section">
            <div class="meta-header">
              <!-- 标题：所有格式都显示 -->
              <h1 class="document-title" :style="{ color: themeState.currentTheme.textColor }">
                {{ fileName }}
              </h1>
              
              <!-- 纯文本格式：显示文件格式、创建日期、修改日期 -->
              <div class="meta-info-row">
                <div class="meta-item" v-if="fileFormat">
                  <span class="meta-label">{{ $t('home.fileFormatLabel') }}</span>
                  <span class="meta-value" :style="{ color: themeState.currentTheme.textColor }">
                    {{ fileFormat }}
                  </span>
                </div>
                <div class="meta-item" v-if="creationDate">
                  <span class="meta-label">{{ $t('home.creationDateLabel') }}</span>
                  <span class="meta-value" :style="{ color: themeState.currentTheme.textColor }">
                    {{ creationDate }}
                  </span>
                </div>
                <div class="meta-item" v-if="modificationDate">
                  <span class="meta-label">{{ $t('home.modificationDateLabel') }}</span>
                  <span class="meta-value" :style="{ color: themeState.currentTheme.textColor }">
                    {{ modificationDate }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 文档内容预览区域 -->
          <div class="document-content-section">
            <!-- 纯文本格式：使用Monaco编辑器预览（替换原来的 Vditor preview 容器） -->
            <div 
              ref="monacoPreviewRef" 
              class="content-preview monaco-preview"
              v-loading="isRendering"
            ></div>
          </div>
        </div>
      </div>
      <!-- 其他格式：使用滚动条 -->
      <el-scrollbar v-else class="home-panel-scrollbar">
        <div class="home-panel-content">
          <!-- 文档元信息区域 -->
          <div class="document-meta-section">
            <div class="meta-header">
              <!-- 标题：所有格式都显示 -->
              <h1 class="document-title" :style="{ color: themeState.currentTheme.textColor }">
                {{ metaTitle || $t('article.no_title') }}
              </h1>
              
              <!-- 其他格式（Markdown/LaTeX）：显示作者和摘要 -->
              <div class="meta-info-row">
                <div class="meta-item" v-if="metaAuthor">
                  <span class="meta-label">{{ $t('home.authorLabel') }}</span>
                  <span class="meta-value" :style="{ color: themeState.currentTheme.textColor }">
                    {{ metaAuthor }}
                  </span>
                </div>
              </div>
              <div class="meta-description" v-if="metaDescription">
                <span class="description-label">{{ $t('home.abstractLabel') }}</span>
                <p class="description-text" :style="{ color: themeState.currentTheme.textColor }">
                  {{ metaDescription }}
                </p>
              </div>
            </div>
          </div>

          <!-- 文档内容预览区域 -->
          <div class="document-content-section">
            <!-- 其他格式：使用Markdown预览 -->
            <div 
              ref="previewContainerRef" 
              class="content-preview" 
              :class="themeState.currentTheme.mdeditorClass"
              :style="{ color: themeState.currentTheme.textColor }" 
              v-loading="isRendering"
            ></div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import NewDocumentWorkspace from './NewDocumentWorkspace.vue'
import eventBus, { getWindowType } from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { getSetting } from '../utils/settings'
import { themeState, mixColors } from '../utils/themes'
import { useWorkspace } from '../stores/workspace'
import { useActiveDocument } from '../composables/useActiveDocument'
import { convertLatexToMarkdown } from '../utils/latex-utils'
import { renderMarkdownPreview, local2fileProtocol, local2httpProtocol } from '../utils/md-utils'
import { formatRegistry } from '../utils/format-registry'
import { getMonacoLanguage } from '../utils/format-initializer'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import * as monaco from 'monaco-editor'

const { t } = useI18n()

const workspace = useWorkspace()
const { activeTabId, openSystemTab } = workspace
const { activeDocument, activeTab } = useActiveDocument()

const currentFilePath = computed(() => activeDocument.value?.path ?? '')
const metaTitle = computed(() => activeDocument.value?.meta?.title ?? '')
const metaAuthor = computed(() => activeDocument.value?.meta?.author ?? '')
const metaDescription = computed(() => activeDocument.value?.meta?.description ?? '')

// 纯文本格式的文件信息
const fileName = computed(() => {
  if (!currentFilePath.value) return ''
  const parts = currentFilePath.value.split(/[/\\]/)
  return parts[parts.length - 1] || ''
})

const fileFormat = computed(() => {
  if (!currentFilePath.value) return ''
  
  // 获取文件扩展名
  const lastDotIndex = currentFilePath.value.lastIndexOf('.')
  const ext = lastDotIndex >= 0 ? currentFilePath.value.substring(lastDotIndex).toLowerCase() : ''
  
  // 尝试从格式注册表获取格式信息
  const formatId = activeDocument.value?.format || formatRegistry.getFormatByExtension(ext) || 'txt'
  const formatConfig = formatRegistry.getFormat(formatId)
  
  if (formatConfig) {
    // 如果有扩展名，显示扩展名，否则显示格式标签
    if (ext) {
      return ext.toUpperCase().substring(1) // 移除点号
    }
    return formatConfig.label || 'TXT'
  }
  
  // 回退：显示扩展名或默认格式
  if (ext) {
    return ext.toUpperCase().substring(1) // 移除点号
  }
  return 'TXT'
})

const fileStats = ref<{ birthtime: number; mtime: number; size: number } | null>(null)

const creationDate = computed(() => {
  if (!fileStats.value) return ''
  try {
    const date = new Date(fileStats.value.birthtime)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    logger.warn('格式化创建日期失败', error)
    return ''
  }
})

const modificationDate = computed(() => {
  if (!fileStats.value) return ''
  try {
    const date = new Date(fileStats.value.mtime)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    logger.warn('格式化修改日期失败', error)
    return ''
  }
})

// 加载文件统计信息
const loadFileStats = async () => {
  if (!isPlainTextFormat.value || !currentFilePath.value) {
    fileStats.value = null
    return
  }
  
  try {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      logger.warn('IPC renderer 不可用，无法获取文件统计信息')
      return
    }
    
    const stats = await ipcRenderer.invoke('get-file-stats', currentFilePath.value) as { birthtime: number; mtime: number; size: number } | null
    fileStats.value = stats
  } catch (error) {
    logger.error('获取文件统计信息失败', error)
    fileStats.value = null
  }
}

// 判断是否为纯文本格式
const isPlainTextFormat = computed(() => {
  const format = activeDocument.value?.format
  return format === 'txt'
})

// 获取 IPC renderer
const getIpcRenderer = () => {
  if (window && (window as any).electron) {
    return (window as any).electron.ipcRenderer
  }
  return null
}

// 判断是否需要显示格式选择界面
const needsFormatSelection = computed(() => {
  const tab = activeTab.value
  // 如果是新建文档且还没有选择格式，显示格式选择界面
  return tab?.kind === 'new' && !activeDocument.value?.format
})

// 计算当前文档的 linkBase（用于 Markdown 预览解析相对路径）
const currentLinkBase = computed(() => {
  const path = currentFilePath.value;
  if (!path) return '';
  return workspace.getLinkBase(path);
})

const previewMarkdown = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  if (doc.format === 'tex') {
    return convertLatexToMarkdown(doc.tex ?? '')
  }
  return doc.markdown ?? ''
})

const previewContainerRef = ref<HTMLElement | null>(null)
const monacoPreviewRef = ref<HTMLElement | null>(null)
const isRendering = ref(false)
let monacoPreviewEditor: monaco.editor.IStandaloneCodeEditor | null = null
let monacoPreviewEditorId: string | null = null

// 是否显示文档预览：只有当真正打开了已存在的文档或已选择格式的文档时才显示
const showDocumentPreview = computed(() => {
  const tab = activeTab.value
  if (!tab) return false
  // 如果是文件类型且有路径，显示预览
  if (tab.kind === 'file' && currentFilePath.value) return true
  // 如果是文件类型但路径为空（新建文档已选择格式但未保存），且已选择格式，显示预览
  if (tab.kind === 'file' && !currentFilePath.value && activeDocument.value?.format) return true
  // 如果是新建文档但已选择格式，显示预览
  if (tab.kind === 'new' && activeDocument.value?.format) return true
  return false
})

// 面板样式
const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderColor: themeState.currentTheme.borderColor || 'rgba(0, 0, 0, 0.1)'
}))

// 日志记录
const logger = createRendererLogger('Home', {
  windowTypeProvider: () => getWindowType()
})

// 移除粒子效果相关的 ipcRenderer 初始化，Home.vue 不再使用

// Home.vue 不再使用粒子效果，移除相关代码

const preventNavigate = () => {
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
    if (target && target.href && target.target !== '_blank') {
      event.preventDefault()
      const url = target.href
      if (url.startsWith('http')) {
        eventBus.emit('open-link', url)
      }
    }
  })
}

// 初始化Monaco预览编辑器（用于纯文本格式）
const initMonacoPreview = async () => {
  if (!monacoPreviewRef.value || !isPlainTextFormat.value) return

  // 优化：如果编辑器已存在且容器相同，不需要重新创建
  if (monacoPreviewEditor && monacoPreviewEditorId) {
    // 检查编辑器是否仍然有效
    try {
      const editors = monaco.editor.getEditors();
      const existingEditor = editors.find(e => e.getId() === monacoPreviewEditorId);
      if (existingEditor && existingEditor.getContainerDomNode() === monacoPreviewRef.value) {
        // 编辑器仍然有效，只需要更新内容和主题，不需要重新创建
        updateMonacoPreview();
        syncMonacoPreviewTheme();
        return;
      }
    } catch (e) {
      logger.warn('检查Monaco预览编辑器状态失败', e);
    }
  }

  try {
    isRendering.value = true
    
    setupMonacoWorker()
    
    // 如果已存在编辑器，先销毁
    if (monacoPreviewEditor || monacoPreviewEditorId) {
      try {
        if (monacoPreviewEditor) {
          monacoPreviewEditor.dispose()
        } else if (monacoPreviewEditorId) {
          // 如果只有 ID，从全局获取并销毁
          const editors = monaco.editor.getEditors();
          const existingEditor = editors.find(e => e.getId() === monacoPreviewEditorId);
          if (existingEditor) {
            existingEditor.dispose();
          }
        }
      } catch (e) {
        logger.warn('销毁Monaco预览编辑器失败', e)
      }
      monacoPreviewEditor = null
      monacoPreviewEditorId = null
    }

    // 对于纯文本格式，内容存储在 markdown 字段中
    const content = activeDocument.value?.format === 'txt' 
      ? (activeDocument.value?.markdown ?? '') 
      : ''
    const language = getMonacoLanguage('txt', currentFilePath.value)
    const isDark = themeState.currentTheme.type === 'dark'
    
    // 从用户设置中读取行号显示偏好
    let showLineNumbers = true
    try {
      const lineNumberSetting = await getSetting('lineNumber')
      if (typeof lineNumberSetting === 'boolean') {
        showLineNumbers = lineNumberSetting
      } else if (typeof lineNumberSetting === 'string') {
        showLineNumbers = lineNumberSetting === 'on' || lineNumberSetting === 'true'
      }
    } catch (error) {
      logger.warn('读取行号设置失败，使用默认值', error)
    }
    
    const editor = monaco.editor.create(monacoPreviewRef.value, {
      value: content,
      language: language,
      theme: isDark ? 'vs-dark' : 'vs',
      readOnly: true,
      automaticLayout: true, // 自动适应容器大小
      fontSize: 14,
      wordWrap: 'on',
      lineNumbers: showLineNumbers ? 'on' : 'off',
      minimap: { enabled: false },
      contextmenu: false,
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', 'Consolas', monospace"
    })
    
    monacoPreviewEditor = editor
    monacoPreviewEditorId = editor.getId()
    
    // 确保编辑器布局正确（等待 DOM 更新）
    nextTick(() => {
      if (monacoPreviewEditor) {
        monacoPreviewEditor.layout()
      }
    })
    
    // 同步主题
    syncMonacoPreviewTheme()
    
  } catch (error) {
    logger.error('初始化Monaco预览编辑器失败', error)
  } finally {
    isRendering.value = false
  }
}

// 同步Monaco预览编辑器主题
const syncMonacoPreviewTheme = () => {
  if (!monacoPreviewEditor) return
  
  const isDark = themeState.currentTheme.type === 'dark'
  const themeName = isDark ? 'vs-dark' : 'vs'
  const toMonacoColor = (color: string) => color.replace('#', '') || 'FFFFFF'
  const deeperColor = (color: string) => {
    if (isDark) return mixColors(color, '#000000', 0.3)
    else return mixColors(color, '#FFFFFF', 0.3)
  }
  
  monaco.editor.defineTheme('homePreviewTheme', {
    base: themeName,
    inherit: true,
    rules: [
      {
        token: '',
        background: toMonacoColor(deeperColor(themeState.currentTheme.background)),
        fontStyle: ''
      }
    ],
    colors: {
      'editor.background': deeperColor(themeState.currentTheme.background),
    }
  })
  monaco.editor.setTheme('homePreviewTheme')
}

// 更新Monaco预览编辑器内容
const updateMonacoPreview = () => {
  if (!monacoPreviewEditor || !isPlainTextFormat.value) return
  
  try {
    // 对于纯文本格式，内容存储在 markdown 字段中
    const content = activeDocument.value?.format === 'txt' 
      ? (activeDocument.value?.markdown ?? '') 
      : ''
    const currentValue = monacoPreviewEditor.getValue()
    if (currentValue !== content) {
      monacoPreviewEditor.setValue(content)
    }
    
    // 如果路径变化，可能需要更新语言
    if (currentFilePath.value) {
      const language = getMonacoLanguage('txt', currentFilePath.value)
      const model = monacoPreviewEditor.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, language)
      }
    }
    
    // 确保编辑器布局正确
    nextTick(() => {
      if (monacoPreviewEditor) {
        monacoPreviewEditor.layout()
      }
    })
  } catch (error) {
    logger.error('更新Monaco预览编辑器内容失败', error)
  }
}

// 渲染预览内容（Markdown格式）
const renderPreview = async () => {
  if (!previewContainerRef.value || isPlainTextFormat.value) return

  const container = previewContainerRef.value as HTMLDivElement
  let markdown = previewMarkdown.value

  // 修复：即使内容为空，也显示空内容提示，而不是清空容器
  if (!markdown || markdown.trim() === '') {
    const primaryColor = themeState.currentTheme.primaryColor || '#6366f1'
    const emptyContentHtml = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 200px;
        color: ${themeState.currentTheme.textColor};
        opacity: 0.5;
        font-size: 14px;
        text-align: center;
        padding: 24px;
        gap: 16px;
      ">
        <p style="margin: 0;">${t('home.emptyContent') || '文档内容为空'}</p>
        <button 
          class="quick-start-button"
          style="
            margin-top: 8px;
            padding: 10px 20px;
            background-color: ${primaryColor};
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          "
        >
          ${t('home.quickStartButton') || '快速生成内容'}
        </button>
      </div>
    `
    container.innerHTML = emptyContentHtml
    
    // 添加按钮点击事件和悬停效果
    nextTick(() => {
      const button = container.querySelector('.quick-start-button') as HTMLButtonElement
      if (button) {
        // 悬停效果
        button.addEventListener('mouseenter', () => {
          button.style.opacity = '0.9'
          button.style.transform = 'translateY(-1px)'
          button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
        })
        button.addEventListener('mouseleave', () => {
          button.style.opacity = '1'
          button.style.transform = 'translateY(0)'
          button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
        })
        
        // 点击事件：切换到或创建 GlobalHome tab，并打开快速开始面板
        button.addEventListener('click', () => {
          // 切换到或创建 GlobalHome tab
          const homeTab = openSystemTab('/global-home', t('headMenu.home') || '主页')
          
          // 等待 tab 切换和组件挂载完成后再触发快速开始
          // 使用多次 nextTick 和延迟确保 GlobalHome 组件已完全挂载并注册了事件监听器
          nextTick(() => {
            nextTick(() => {
              // 延迟一下，确保 GlobalHome 组件的 onMounted 已执行
              setTimeout(() => {
                // 触发快速开始事件（GlobalHome 会监听此事件并打开快速开始面板）
                eventBus.emit('open-quickstart')
              }, 150)
            })
          })
        })
      }
    })
    
    isRendering.value = false
    return
  }

  try {
    isRendering.value = true
    // 预览渲染需要 file:// 协议，以便浏览器能够加载本地图片
    // 转换策略：
    // 1. 先转换为 HTTP URL（统一格式，处理相对路径和预渲染的图表）
    // 2. 再转换为 file:// 协议（浏览器预览需要）
    // 注意：虽然 local2fileProtocol 可以处理相对路径，但为了统一处理预渲染的图表（HTTP URL），
    // 我们采用两步转换的方式
    const docPath = currentFilePath.value
    markdown = await local2httpProtocol(markdown, docPath)
    const processedMarkdown = await local2fileProtocol(markdown, docPath)
    
    const linkBase = currentLinkBase.value;
    await renderMarkdownPreview(container, processedMarkdown, {
      linkBase: linkBase,
      renderCode: false,
      renderMath: false
    })
  } catch (error) {
    logger.error('渲染预览失败', error)
    container.innerHTML = `<p style="color: var(--console-err, #fe8771);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
  } finally {
    isRendering.value = false
  }
}

// 监听预览内容变化
watch([previewMarkdown, () => themeState.currentTheme.type, showDocumentPreview, isPlainTextFormat], () => {
  if (!showDocumentPreview.value) return
  nextTick(() => {
    if (isPlainTextFormat.value) {
      // 纯文本格式：使用Monaco预览
      if (monacoPreviewEditor) {
        updateMonacoPreview()
      } else {
        initMonacoPreview()
      }
      // 同步主题
      syncMonacoPreviewTheme()
      // 加载文件统计信息
      loadFileStats()
    } else {
      // 其他格式：使用Markdown预览
    renderPreview()
    }
  })
}, { immediate: false })

// 监听文件路径变化，重新加载文件统计信息
watch([currentFilePath, isPlainTextFormat], () => {
  if (isPlainTextFormat.value && currentFilePath.value) {
    loadFileStats()
  } else {
    fileStats.value = null
  }
}, { immediate: true })

// 监听文档内容变化（纯文本格式）
watch([() => activeDocument.value?.markdown, currentFilePath, isPlainTextFormat], () => {
  if (isPlainTextFormat.value && monacoPreviewEditor) {
    updateMonacoPreview()
  }
})


onMounted(() => {
  preventNavigate()

  // 监听主题变化，同步Monaco编辑器主题
  eventBus.on('sync-editor-theme', () => {
    syncMonacoPreviewTheme()
  })

  // 初始渲染（只在需要显示文档预览时）
  nextTick(() => {
    if (showDocumentPreview.value) {
      if (isPlainTextFormat.value) {
        initMonacoPreview()
        // 加载文件统计信息
        loadFileStats()
      } else {
        renderPreview()
      }
    }
  })
})

onBeforeUnmount(() => {
  // 清理Monaco预览编辑器
  if (monacoPreviewEditor) {
    try {
      monacoPreviewEditor.dispose()
    } catch (e) {
      logger.warn('清理Monaco预览编辑器失败', e)
    }
    monacoPreviewEditor = null
    monacoPreviewEditorId = null
  }
  
  eventBus.off('sync-editor-theme')
})

</script>

<style scoped>
/* Home.vue 不使用粒子效果，所以不需要 particle-bg 容器 */

.homepage {
  position: relative;
  width: 100%;
  height: 100%;
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

/* Home.vue 不使用粒子效果，所以不需要 canvas 样式 */

/* 主页面板容器 */
.home-panel {
  position: relative;
  z-index: 1;
  width: calc(100% - 48px);
  height: calc(100% - 48px);
  margin: 24px;
  border-radius: 16px;
  border: 1px solid;
  backdrop-filter: blur(20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 纯文本格式的容器：不使用滚动条，直接使用 flex 布局 */
.home-panel-content-plaintext {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.home-panel-scrollbar {
  flex: 1;
  width: 100%;
  height: 100%;
}

.home-panel-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
}

.home-panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0; /* 允许缩小，配合 flex 布局使用 */
  padding: 32px 40px;
  box-sizing: border-box;
  gap: 24px;
}

/* 文档元信息区域 */
.document-meta-section {
  flex-shrink: 0;
  padding-bottom: 24px;
  border-bottom: 1px solid;
  border-bottom-color: v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.08)"');
}

.meta-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.document-title {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.4;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  letter-spacing: -0.02em;
}

.meta-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.meta-label {
  font-weight: 500;
  opacity: 0.7;
  color: v-bind('themeState.currentTheme.textColor');
}

.meta-value {
  font-weight: 400;
  color: v-bind('themeState.currentTheme.textColor');
}

.meta-description {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.description-label {
  font-size: 13px;
  font-weight: 500;
  opacity: 0.7;
  color: v-bind('themeState.currentTheme.textColor');
}

.description-text {
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.85;
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* 文档内容预览区域 */
.document-content-section {
  flex: 1;
  min-height: 0; /* 允许缩小，配合 flex: 1 使用 */
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止内容溢出 */
}

.content-preview {
  flex: 1;
  width: 100%;
  padding: 24px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.7;
  font-size: 15px;
  min-height: 0; /* 允许缩小 */
}

.monaco-preview {
  flex: 1;
  width: 100%;
  min-height: 0; /* 允许缩小，配合 flex: 1 使用 */
  padding: 0; /* Monaco 编辑器内部有 padding */
  box-sizing: border-box;
  overflow: hidden; /* 防止内容溢出 */
}

/* 响应式设计 */
@media (max-width: 768px) {
  .home-panel {
    width: calc(100% - 32px);
    height: calc(100% - 32px);
    margin: 16px;
    border-radius: 12px;
  }

  .home-panel-content {
    padding: 24px;
    gap: 20px;
  }

  .document-title {
    font-size: 20px;
  }

  .content-preview {
    padding: 16px;
    font-size: 14px;
  }

  /* 纯文本格式的 Monaco 预览在移动设备上也要占满高度 */
  .monaco-preview {
    padding: 0;
  }
}

/* 最近文档容器 */
.recent-docs-container {
  width: 80vw;
  max-width: 800px;
  margin-top: 32px;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.recent-docs-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  padding: 0;
}

.recent-docs-scrollbar {
  max-height: calc(52px * 8);
  /* 8条文档的高度 */
  width: 100%;
}

.recent-docs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.recent-doc-item:hover {
  opacity: 0.8;
  transform: translateX(4px);
}

.recent-doc-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.recent-doc-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
</style>
