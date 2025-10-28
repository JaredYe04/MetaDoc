/**
 * 文档状态管理
 * 使用 Pinia 管理文档相关的全局状态
 */
import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import type { 
  DocumentOutlineNode, 
  ArticleMetaData, 
  DocumentFormat,
  AIDialogMessage 
} from '../../../types'
import { 
  generateMarkdownFromOutlineTree,
  extractOutlineTreeFromMarkdown,
  createDefaultOutlineTree
} from '../utils/document/outline'
import eventBus from '../utils/event-bus'

/** 默认文档元数据 */
const defaultArticleMetaData: ArticleMetaData = {
  title: '',
  author: '',
  description: ''
}

/** 默认AI对话消息 */
const defaultAiChatMessages: AIDialogMessage[] = [
  {
    role: "system",
    content: "你是一个出色的AI文档编辑助手，现在你需要根据一篇现有的文档进行修改、优化，或者是撰写新的文档。按照对话的上下文来做出合适的回应。请按照用户需求进行回答。(用markdown语言）"
  },
  {
    role: "assistant", 
    content: "### 你好！我是你的AI文档助手！\n告诉我你的任何需求，我会尝试解决。\n"
  }
]

export const useDocumentStore = defineStore('document', () => {
  // ========== 状态定义 ==========
  
  /** 当前文件路径 */
  const currentFilePath = ref('')
  
  /** 当前文档格式 */
  const currentFormat = ref<DocumentFormat>('md')
  
  /** 大纲树 */
  const outlineTree = ref<DocumentOutlineNode>(createDefaultOutlineTree())
  
  /** 文章内容 (Markdown) */
  const articleContent = ref('')
  
  /** LaTeX文章内容 */
  const texArticleContent = ref('')
  
  /** 文档元数据 */
  const articleMetaData = ref<ArticleMetaData>({ ...defaultArticleMetaData })
  
  /** AI对话消息列表 */
  const aiDialogs = ref<AIDialogMessage[]>([...defaultAiChatMessages])
  
  /** 最后视图类型 */
  const lastView = ref<'outline' | 'article'>('outline')
  
  /** 渲染后的HTML */
  const renderedHtml = ref('')
  
  /** 是否首次加载 */
  const firstLoad = ref(true)

  // ========== 计算属性 ==========
  
  /** 文档统计信息 */
  const documentStats = computed(() => {
    const content = articleContent.value
    return {
      characterCount: content.length,
      wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
      lineCount: content.split('\n').length
    }
  })
  
  /** 是否需要保存 */
  const needsSaving = computed(() => {
    return currentFilePath.value !== '' || articleContent.value.trim() !== ''
  })

  // ========== 监听器 ==========
  
  // 监听文档元数据变化
  watch(
    articleMetaData,
    (newVal, oldVal) => {
      eventBus.emit('is-need-save', true)
    },
    { deep: true }
  )

  // ========== 操作方法 ==========
  
  /**
   * 同步大纲树和文章内容
   */
  function syncDocument(): void {
    if (currentFormat.value === 'tex') {
      // TODO: 实现 LaTeX 到 Markdown 的转换
      // articleContent.value = convertLatexToMarkdown(texArticleContent.value)
    }
    
    if (lastView.value === 'outline') {
      articleContent.value = generateMarkdownFromOutlineTree(outlineTree.value)
      lastView.value = 'article'
    } else if (lastView.value === 'article') {
      outlineTree.value = extractOutlineTreeFromMarkdown(articleContent.value)
      lastView.value = 'outline'
    }
  }

  /**
   * 初始化新文档
   */
  function initializeNewDocument(): void {
    currentFilePath.value = ''
    currentFormat.value = 'md'
    outlineTree.value = createDefaultOutlineTree()
    articleContent.value = generateMarkdownFromOutlineTree(outlineTree.value)
    articleMetaData.value = { ...defaultArticleMetaData }
    aiDialogs.value = [...defaultAiChatMessages]
    
    eventBus.emit('refresh')
    eventBus.emit('reset-quickstart')
  }

  /**
   * 自动生成标题
   */
  function autoGenerateTitle(): void {
    if (articleMetaData.value.title === '') {
      if (currentFormat.value === 'md') {
        // 从文章内容中提取第一个标题
        const firstTitleMatch = articleContent.value.match(/^(#+)\s+(.*)$/m)
        if (firstTitleMatch) {
          const title = firstTitleMatch[2].trim()
          articleMetaData.value.title = title
        } else {
          // 截取文章内容的前50个字符
          const content = articleContent.value.trim().substring(0, 50)
          articleMetaData.value.title = content.length > 0 ? content : ''
        }
      } else if (currentFormat.value === 'tex') {
        const texContent = texArticleContent.value || ''
        let title = ''

        // 正则匹配 LaTeX 标题
        const sectionMatch = texContent.match(/\\section\{([^}]*)\}/)
        const subsectionMatch = texContent.match(/\\subsection\{([^}]*)\}/)
        const subsubsectionMatch = texContent.match(/\\subsubsection\{([^}]*)\}/)

        // 优先级：section > subsection > subsubsection
        if (sectionMatch) title = sectionMatch[1].trim()
        else if (subsectionMatch) title = subsectionMatch[1].trim()
        else if (subsubsectionMatch) title = subsubsectionMatch[1].trim()
        else title = texContent.trim().substring(0, 50)

        // 截取最多50个字符
        if (title.length > 50) title = title.substring(0, 50)

        articleMetaData.value.title = title
      }
    }
  }

  /**
   * 加载JSON格式数据
   */
  function loadFromJson(json: string): void {
    const data = JSON.parse(json)
    currentFormat.value = 'md'
    outlineTree.value = JSON.parse(JSON.stringify(data.current_outline_tree))
    articleContent.value = data.current_article
    articleMetaData.value = { ...data.current_article_meta_data }
    aiDialogs.value = data.current_ai_dialogs
    autoGenerateTitle()
  }

  /**
   * 导出为JSON格式
   */
  function dumpToJson(mdReplace = ''): string {
    return JSON.stringify({
      current_outline_tree: outlineTree.value,
      current_article: mdReplace === '' ? articleContent.value : mdReplace,
      current_article_meta_data: articleMetaData.value,
      current_ai_dialogs: aiDialogs.value
    })
  }

  /**
   * 添加AI对话
   */
  function addDialog(dialog: AIDialogMessage, addToFront = false): void {
    if (addToFront) {
      aiDialogs.value.unshift(dialog)
    } else {
      aiDialogs.value.push(dialog)
    }
    broadcastAiDialogs()
  }

  /**
   * 更新AI对话
   */
  function updateDialog(index: number, newData: Partial<AIDialogMessage>): void {
    if (index >= 0 && index < aiDialogs.value.length) {
      aiDialogs.value[index] = { ...aiDialogs.value[index], ...newData }
      broadcastAiDialogs()
    }
  }

  /**
   * 删除AI对话
   */
  function deleteDialog(index: number): void {
    if (index >= 0 && index < aiDialogs.value.length) {
      aiDialogs.value.splice(index, 1)
      broadcastAiDialogs()
    }
  }

  /**
   * 广播AI对话更新
   */
  function broadcastAiDialogs(): void {
    eventBus.emit('is-need-save', true)
    eventBus.emit('send-broadcast', {
      to: 'home',
      eventName: 'sync-ai-dialogs', 
      data: JSON.parse(JSON.stringify(aiDialogs.value))
    })
  }

  // ========== 返回状态和方法 ==========
  return {
    // 状态
    currentFilePath,
    currentFormat,
    outlineTree,
    articleContent,
    texArticleContent,
    articleMetaData,
    aiDialogs,
    lastView,
    renderedHtml,
    firstLoad,
    
    // 计算属性
    documentStats,
    needsSaving,
    
    // 方法
    syncDocument,
    initializeNewDocument,
    autoGenerateTitle,
    loadFromJson,
    dumpToJson,
    addDialog,
    updateDialog,
    deleteDialog,
    broadcastAiDialogs
  }
})

// 兼容性导出（为了保持与现有代码的兼容性）
export const documentStore = useDocumentStore()
