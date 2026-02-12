<template>
  <div class="detailed-outline-node" :style="containerStyle">
    <!-- 标题行 -->
    <div class="detailed-outline-node__header">
      <h3 class="detailed-outline-node__title" :title="node.title">
        {{ displayTitle }}
      </h3>
    </div>

    <!-- 内容区域 -->
    <div class="detailed-outline-node__content-wrapper">
      <el-scrollbar class="detailed-outline-node__scrollbar">
        <div class="detailed-outline-node__content">
          <!-- AI执行时显示流式输出 -->
          <StreamingContentDisplay
            v-if="isGenerating"
            :contentRef="streamingContentRef"
            :done="generationDone"
            :style="{ minHeight: '200px' }"
          />
          
          <!-- 正常显示时使用VditorPreview -->
          <VditorPreview
            v-else
            :markdown="node.text || ''"
            :docPath="docPath"
          />
        </div>
      </el-scrollbar>
    </div>

    <!-- 操作按钮区域 -->
    <div class="detailed-outline-node__actions">
      <!-- AI执行中 -->
      <template v-if="isGenerating">
        <el-button
          type="danger"
          size="small"
          circle
          @click="handleCancel"
          :loading="false"
        >
          <el-icon>
            <CloseBold />
          </el-icon>
        </el-button>
      </template>
      
      <!-- AI执行完成，等待确认 -->
      <template v-else-if="pendingAccept">
        <el-button
          type="success"
          size="small"
          circle
          @click="handleAccept"
        >
          <el-icon>
            <Check />
          </el-icon>
        </el-button>
        <el-button
          type="danger"
          size="small"
          circle
          @click="handleReject"
        >
          <el-icon>
            <Close />
          </el-icon>
        </el-button>
      </template>
      
      <!-- 正常状态：显示操作按钮 -->
      <template v-else>
        <el-tooltip :content="$t('outline.expandContent')" placement="top">
          <el-button
            type="primary"
            size="small"
            circle
            @click="handleExpand"
            :disabled="isGenerating"
          >
            <el-icon>
              <EditPen />
            </el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="$t('outline.abridge')" placement="top">
          <el-button
            type="warning"
            size="small"
            circle
            @click="handleAbridge"
            :disabled="isGenerating"
          >
            <el-icon>
              <Minus />
            </el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="$t('outline.polish')" placement="top">
          <el-button
            type="info"
            size="small"
            circle
            @click="handlePolish"
            :disabled="isGenerating"
          >
            <el-icon>
              <Star />
            </el-icon>
          </el-button>
        </el-tooltip>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElButton, ElTooltip, ElIcon, ElScrollbar } from 'element-plus'
import { CloseBold, Check, Close, EditPen, Minus, Star } from '@element-plus/icons-vue'
import type { DocumentOutlineNode } from '../../../types'
import { themeState } from '../../utils/themes'
import VditorPreview from '../VditorPreview.vue'
import StreamingContentDisplay from '../common/StreamingContentDisplay.vue'
import {
  expandContent,
  abridgeContent,
  polishContent
} from '../../utils/outline-ai-utils'

const { t } = useI18n()

interface Props {
  node: DocumentOutlineNode
  outlineTree: DocumentOutlineNode
  docPath?: string
  docFormat?: 'md' | 'tex'
  userPrompt?: string
  temperature?: number
  wordCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  docPath: '',
  docFormat: 'md',
  userPrompt: '',
  temperature: undefined,
  wordCount: undefined
})

const emit = defineEmits<{
  (e: 'content-updated', content: string): void
  (e: 'cancel'): void
}>()

// 状态管理
const isGenerating = ref(false)
const pendingAccept = ref(false)
const streamingContentRef = ref('')
const generationDone = ref<Promise<any> | null>(null)
const backupContent = ref('')

// 计算显示标题（过长时截断）
const displayTitle = computed(() => {
  const title = props.node.title || ''
  if (title.length > 50) {
    return title.substring(0, 50) + '...'
  }
  return title
})

// 容器样式
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

// 扩写
const handleExpand = async () => {
  if (!props.node.text) {
    return
  }
  
  isGenerating.value = true
  pendingAccept.value = false
  backupContent.value = props.node.text
  streamingContentRef.value = ''
  generationDone.value = null
  
  try {
    // 从父组件获取配置（通过props传递）
    const result = await expandContent(
      props.node,
      props.outlineTree,
      props.userPrompt || '', // userPrompt
      undefined, // signal
      props.docFormat,
      streamingContentRef,
      undefined, // onUpdate
      props.temperature, // temperature
      props.wordCount // wordCount
    )
    
    // 保存生成的内容，等待用户确认
    streamingContentRef.value = result
    generationDone.value = Promise.resolve()
    pendingAccept.value = true
  } catch (error) {
    console.error('扩写失败:', error)
    // 恢复原内容
    streamingContentRef.value = backupContent.value
    pendingAccept.value = false
  } finally {
    isGenerating.value = false
  }
}

// 略写
const handleAbridge = async () => {
  if (!props.node.text) {
    return
  }
  
  isGenerating.value = true
  pendingAccept.value = false
  backupContent.value = props.node.text
  streamingContentRef.value = ''
  generationDone.value = null
  
  try {
    const result = await abridgeContent(
      props.node,
      props.outlineTree,
      props.userPrompt || '', // userPrompt
      undefined, // signal
      props.docFormat,
      streamingContentRef,
      undefined, // onUpdate
      props.temperature, // temperature
      props.wordCount // wordCount
    )
    
    streamingContentRef.value = result
    generationDone.value = Promise.resolve()
    pendingAccept.value = true
  } catch (error) {
    console.error('略写失败:', error)
    streamingContentRef.value = backupContent.value
    pendingAccept.value = false
  } finally {
    isGenerating.value = false
  }
}

// 润色
const handlePolish = async () => {
  if (!props.node.text) {
    return
  }
  
  isGenerating.value = true
  pendingAccept.value = false
  backupContent.value = props.node.text
  streamingContentRef.value = ''
  generationDone.value = null
  
  try {
    const result = await polishContent(
      props.node,
      props.outlineTree,
      props.userPrompt || '', // userPrompt
      undefined, // signal
      props.docFormat,
      streamingContentRef,
      undefined, // onUpdate
      props.temperature // temperature
    )
    
    streamingContentRef.value = result
    generationDone.value = Promise.resolve()
    pendingAccept.value = true
  } catch (error) {
    console.error('润色失败:', error)
    streamingContentRef.value = backupContent.value
    pendingAccept.value = false
  } finally {
    isGenerating.value = false
  }
}

// 接受生成的内容
const handleAccept = () => {
  const newContent = streamingContentRef.value || backupContent.value
  emit('content-updated', newContent)
  resetState()
}

// 拒绝生成的内容
const handleReject = () => {
  streamingContentRef.value = backupContent.value
  resetState()
}

// 取消生成
const handleCancel = () => {
  streamingContentRef.value = backupContent.value
  resetState()
  emit('cancel')
}

// 重置状态
const resetState = () => {
  isGenerating.value = false
  pendingAccept.value = false
  streamingContentRef.value = ''
  generationDone.value = null
  backupContent.value = ''
}

// 暴露方法供父组件调用（用于传递配置参数）
defineExpose({
  expand: handleExpand,
  abridge: handleAbridge,
  polish: handlePolish,
  cancel: handleCancel
})
</script>

<style scoped lang="less">
.detailed-outline-node {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  padding: 16px;
  gap: 12px;
  width: 100%;
  min-width: 300px;
  max-width: 600px;
  box-sizing: border-box;
}

.detailed-outline-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detailed-outline-node__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.detailed-outline-node__content-wrapper {
  border-radius: 8px;
  overflow: hidden;
  min-height: 200px;
  max-height: 400px;
  border: 1px solid rgba(145, 145, 145, 0.3);
}

.detailed-outline-node__scrollbar {
  height: 100%;
  width: 100%;
}

.detailed-outline-node__scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.detailed-outline-node__content {
  padding: 12px;
  min-height: 200px;
}

.detailed-outline-node__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
}
</style>

