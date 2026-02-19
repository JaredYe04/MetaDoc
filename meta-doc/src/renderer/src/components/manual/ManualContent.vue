<template>
  <div class="manual-content">
    <ManualBreadcrumb />
    <el-scrollbar class="content-scrollbar">
      <div class="content-wrapper">
        <div v-if="processedContent && processedContent.trim()" class="markdown-wrapper">
          <VditorPreview
            :markdown="processedContent"
            :key="`content-${currentArticleId}-${locale}`"
            class="markdown-preview"
            @rendered="handleRendered"
          />
        </div>
        <div v-else class="empty-content">
          <el-empty :description="$t('userManual.emptyContent') || '暂无内容'" />
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserManual } from '../../stores/userManual'
import { parseInternalLinks } from '../../manuals/utils'
import VditorPreview from '../VditorPreview.vue'
import ManualBreadcrumb from './ManualBreadcrumb.vue'

const { locale } = useI18n()
const { currentArticleContent, currentArticleId, setCurrentArticle } = useUserManual()

// 处理内部链接：在Markdown渲染后通过DOM操作添加链接
// 不在Markdown文本中插入HTML，而是先渲染Markdown，然后替换链接文本
const processedContent = computed(() => {
  const content = currentArticleContent.value
  if (!content) return ''
  
  // 解析内部链接，但不在文本中插入HTML
  // 返回原始内容，链接将在渲染后通过DOM操作添加
  return content
})

// 使用防抖避免重复处理
let processTimer: ReturnType<typeof setTimeout> | null = null

// 监听VditorPreview的rendered事件，在渲染完成后处理内部链接
const handleRendered = () => {
  if (processTimer) {
    clearTimeout(processTimer)
  }
  processTimer = setTimeout(() => {
    nextTick(() => {
      processInternalLinks()
    })
  }, 100)
}

// 监听内容变化，延迟处理内部链接（等待渲染完成）
watch([processedContent, currentArticleId], () => {
  if (processTimer) {
    clearTimeout(processTimer)
  }
  processTimer = setTimeout(() => {
    nextTick(() => {
      processInternalLinks()
    })
  }, 200)
})

onBeforeUnmount(() => {
  if (processTimer) {
    clearTimeout(processTimer)
  }
})

// 处理内部链接：在渲染后的DOM中查找并替换
function processInternalLinks() {
  const container = document.querySelector('.vditor-preview-container')
  if (!container) {
    console.warn('ManualContent: 容器未找到')
    return
  }

  const content = currentArticleContent.value
  if (!content) return

  // 先移除所有已存在的内部链接（避免重复添加）
  const existingLinks = container.querySelectorAll('.manual-internal-link')
  existingLinks.forEach(link => {
    const text = link.textContent || ''
    const parent = link.parentNode
    if (parent) {
      parent.replaceChild(document.createTextNode(text), link)
      // 合并相邻的文本节点
      parent.normalize()
    }
  })

  // 解析内部链接
  const links = parseInternalLinks(content)
  if (links.length === 0) {
    console.log('ManualContent: 未找到内部链接')
    return
  }

  console.log('ManualContent: 找到', links.length, '个内部链接')

  // 检查节点是否在代码块中
  function isInCodeBlock(node: Node): boolean {
    let checkNode: Node | null = node
    while (checkNode && checkNode !== container) {
      if (checkNode.nodeType === Node.ELEMENT_NODE) {
        const element = checkNode as Element
        if (element.tagName === 'CODE' || element.tagName === 'PRE') {
          return true
        }
      }
      checkNode = checkNode.parentNode
    }
    return false
  }

  // 递归查找并替换文本（查找完整的链接格式或显示文本）
  function replaceTextInNode(node: Node, link: ReturnType<typeof parseInternalLinks>[0]): boolean {
    // 跳过代码块
    if (isInCodeBlock(node)) {
      return false
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text
      const text = textNode.textContent || ''
      
      // 检查是否已经在链接中
      const parent = textNode.parentElement
      if (parent && parent.tagName === 'A' && parent.classList.contains('manual-internal-link')) {
        return false
      }
      
      // 先尝试查找完整的链接格式 [[articleId|displayText]]
      let index = text.indexOf(link.fullMatch)
      let matchLength = link.fullMatch.length
      let replaceText = link.displayText
      
      // 如果没找到完整格式，再查找显示文本
      if (index < 0) {
        index = text.indexOf(link.displayText)
        matchLength = link.displayText.length
        replaceText = link.displayText
      }
      
      if (index >= 0) {
        // 创建链接元素
        const linkElement = document.createElement('a')
        linkElement.className = 'manual-internal-link'
        linkElement.setAttribute('data-article-id', link.articleId)
        linkElement.textContent = replaceText
        linkElement.href = '#'
        linkElement.style.color = 'var(--el-color-primary, #409EFF)'
        linkElement.style.textDecoration = 'none'
        linkElement.style.borderBottom = '1px solid var(--el-color-primary, #409EFF)'
        linkElement.style.cursor = 'pointer'
        
        linkElement.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          setCurrentArticle(link.articleId, 'link')
        })

        // 替换文本节点
        const beforeText = text.substring(0, index)
        const afterText = text.substring(index + matchLength)
        
        const fragment = document.createDocumentFragment()
        if (beforeText) {
          fragment.appendChild(document.createTextNode(beforeText))
        }
        fragment.appendChild(linkElement)
        if (afterText) {
          fragment.appendChild(document.createTextNode(afterText))
        }
        
        textNode.parentNode?.replaceChild(fragment, textNode)
        console.log('ManualContent: 替换链接', link.articleId, '->', replaceText)
        return true
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      // 跳过已经是内部链接的元素和代码块
      if (element.tagName === 'A' && element.classList.contains('manual-internal-link')) {
        return false
      }
      if (element.tagName === 'CODE' || element.tagName === 'PRE') {
        return false
      }
      
      // 递归处理子节点（从后往前，避免索引偏移）
      const children = Array.from(element.childNodes).reverse()
      for (const child of children) {
        if (replaceTextInNode(child, link)) {
          return true
        }
      }
    }
    
    return false
  }

  // 处理每个链接（从后往前，避免索引偏移）
  let replacedCount = 0
  for (const link of links.reverse()) {
    if (replaceTextInNode(container, link)) {
      replacedCount++
    }
  }
  console.log('ManualContent: 成功替换', replacedCount, '个链接')
}
</script>

<style scoped>
.manual-content {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: v-bind('themeState.currentTheme.background');
}

.content-scrollbar {
  flex: 1;
  height: 100%;
}

.content-wrapper {
  min-height: 100%;
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.markdown-wrapper {
  width: 100%;
}

.markdown-preview {
  width: 100%;
  min-height: 200px;
}

.markdown-preview :deep(.manual-internal-link) {
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  text-decoration: none;
  border-bottom: 1px solid v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  transition: all 0.2s;
}

.markdown-preview :deep(.manual-internal-link:hover) {
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  border-bottom-width: 2px;
}

.empty-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
