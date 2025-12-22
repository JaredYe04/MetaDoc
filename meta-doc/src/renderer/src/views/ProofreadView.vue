<template>
  <div class="proofread-view" :style="pageStyle">
    <WorkspaceTabs
      closable
      @update:activeId="handleTabChange"
      @close="handleCloseTab"
    />
    <div class="proofread-content-wrapper">
      <div class="proofread-header">
        <h2>{{ $t('proofread.title', '文章校对') }}</h2>
        <div class="header-actions">
          <el-button 
            type="primary" 
            :loading="proofreading"
            @click="handleProofread"
          >
            {{ $t('proofread.startProofread', '开始校对') }}
          </el-button>
          <el-button 
            v-if="proofreadResult && proofreadResult.errors.length > 0"
            @click="handleFixAll"
          >
            {{ $t('proofread.fixAll', '一键修复全部') }}
          </el-button>
        </div>
      </div>
      
      <div v-if="!activeDocument" class="no-document">
        <p>{{ $t('proofread.noDocument', '没有活动的文档') }}</p>
      </div>
      
      <div v-else class="proofread-content">
      <!-- 错误统计 -->
      <div v-if="proofreadResult" class="error-stats">
        <el-alert
          v-if="proofreadResult.errors.length === 0"
          :title="$t('proofread.noErrors', '未发现错误')"
          type="success"
          :closable="false"
        />
        <el-alert
          v-else
          :title="$t('proofread.errorsFound', { count: proofreadResult.errors.length }, `发现 ${proofreadResult.errors.length} 个错误`)"
          type="warning"
          :closable="false"
        />
      </div>
      
      <!-- 错误列表 -->
      <div v-if="proofreadResult && proofreadResult.errors.length > 0" class="error-list">
        <el-table :data="proofreadResult.errors" stripe>
          <el-table-column prop="line" :label="$t('proofread.line', '行号')" width="80" />
          <el-table-column prop="type" :label="$t('proofread.type', '类型')" width="120">
            <template #default="{ row }">
              <el-tag :type="getErrorTypeTag(row.type)">
                {{ $t(`proofread.errorTypes.${row.type}`, row.type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="severity" :label="$t('proofread.severity', '严重程度')" width="100">
            <template #default="{ row }">
              <el-tag :type="getSeverityTag(row.severity)">
                {{ $t(`proofread.severity.${row.severity}`, row.severity) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="text" :label="$t('proofread.text', '错误文本')" />
          <el-table-column prop="suggestion" :label="$t('proofread.suggestion', '修改建议')" />
          <el-table-column :label="$t('proofread.actions', '操作')" width="150">
            <template #default="{ row, $index }">
              <el-button 
                size="small" 
                type="primary"
                @click="handleFixError($index)"
              >
                {{ $t('proofread.fix', '修复') }}
              </el-button>
              <el-button 
                size="small"
                @click="handleIgnoreError($index)"
              >
                {{ $t('proofread.ignore', '忽略') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useWorkspace } from '../stores/workspace'
import { proofreadToolCallback } from '../utils/agent-tools/proofread-tool'
import type { ProofreadResult } from '../utils/agent-tools/proofread-tool'
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue'
import { themeState } from '../utils/themes'

const { t } = useI18n()
const { activeDocument } = useActiveDocument()
const workspace = useWorkspace()

// 主题样式
const pageStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
}))

// Tab 切换处理
const handleTabChange = (id: string) => {
  workspace.activateTab(id)
}

const handleCloseTab = (id: string) => {
  workspace.removeTab(id)
}

const proofreading = ref(false)
const proofreadResult = ref<ProofreadResult | null>(null)

// 从文档元数据加载校对结果
onMounted(() => {
  loadProofreadResult()
})

watch(() => activeDocument.value?.id, () => {
  loadProofreadResult()
})

const loadProofreadResult = () => {
  if (!activeDocument.value) {
    proofreadResult.value = null
    return
  }
  
  // 从文档元数据中读取校对结果
  const meta = activeDocument.value.meta
  if (meta && meta.proofreadResult) {
    proofreadResult.value = meta.proofreadResult as ProofreadResult
  } else {
    proofreadResult.value = null
  }
}

// 开始校对
const handleProofread = async () => {
  if (!activeDocument.value) {
    ElMessage.warning(t('proofread.noDocument', '没有活动的文档'))
    return
  }
  
  proofreading.value = true
  try {
    const content = activeDocument.value.format === 'tex' 
      ? activeDocument.value.tex 
      : activeDocument.value.markdown
    
    if (!content || !content.trim()) {
      ElMessage.warning(t('proofread.noContent', '文档内容为空'))
      return
    }
    
    // 调用校对工具
    const result = await proofreadToolCallback(
      {
        text: content,
        format: activeDocument.value.format === 'tex' ? 'latex' : 'markdown'
      },
      undefined,
      () => {}
    )
    
    if (result.status === 'succeeded' && result.data) {
      proofreadResult.value = result.data as ProofreadResult
      
      // 保存到文档元数据
      if (activeDocument.value) {
        const updatedMeta = {
          ...activeDocument.value.meta,
          proofreadResult: proofreadResult.value
        }
        workspace.updateDocumentMeta(activeDocument.value.id, updatedMeta)
      }
      
      ElMessage.success(t('proofread.proofreadSuccess', '校对完成'))
    } else {
      ElMessage.error(result.error || t('proofread.proofreadFailed', '校对失败'))
    }
  } catch (error) {
    ElMessage.error('校对失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    proofreading.value = false
  }
}

// 修复单个错误
const handleFixError = (index: number) => {
  if (!proofreadResult.value || !activeDocument.value) return
  
  const error = proofreadResult.value.errors[index]
  const content = activeDocument.value.format === 'tex' 
    ? activeDocument.value.tex 
    : activeDocument.value.markdown
  
  // 替换错误文本
  const lines = content.split('\n')
  if (error.line > 0 && error.line <= lines.length) {
    const line = lines[error.line - 1]
    const before = line.substring(0, error.column - 1)
    const after = line.substring(error.column - 1 + error.length)
    lines[error.line - 1] = before + error.suggestion + after
    
    // 更新文档内容
    const newContent = lines.join('\n')
    if (activeDocument.value.format === 'tex') {
      workspace.updateDocumentContent(activeDocument.value.id, { tex: newContent })
    } else {
      workspace.updateDocumentContent(activeDocument.value.id, { markdown: newContent })
    }
    
    // 从错误列表中移除
    proofreadResult.value.errors.splice(index, 1)
    proofreadResult.value.totalErrors--
    
    // 更新元数据
    const updatedMeta = {
      ...activeDocument.value.meta,
      proofreadResult: proofreadResult.value
    }
    workspace.updateDocumentMeta(activeDocument.value.id, updatedMeta)
    
    ElMessage.success(t('proofread.fixSuccess', '修复成功'))
  }
}

// 忽略错误
const handleIgnoreError = (index: number) => {
  if (!proofreadResult.value) return
  
  proofreadResult.value.errors.splice(index, 1)
  proofreadResult.value.totalErrors--
  
  // 更新元数据
  if (activeDocument.value) {
    const updatedMeta = {
      ...activeDocument.value.meta,
      proofreadResult: proofreadResult.value
    }
    workspace.updateDocumentMeta(activeDocument.value.id, updatedMeta)
  }
}

// 修复全部错误
const handleFixAll = () => {
  if (!proofreadResult.value || !activeDocument.value) return
  
  const content = activeDocument.value.format === 'tex' 
    ? activeDocument.value.tex 
    : activeDocument.value.markdown
  
  let newContent = content
  const fixedErrors: number[] = []
  
  // 从后往前修复，避免行号变化影响
  for (let i = proofreadResult.value.errors.length - 1; i >= 0; i--) {
    const error = proofreadResult.value.errors[i]
    const lines = newContent.split('\n')
    if (error.line > 0 && error.line <= lines.length) {
      const line = lines[error.line - 1]
      const before = line.substring(0, error.column - 1)
      const after = line.substring(error.column - 1 + error.length)
      lines[error.line - 1] = before + error.suggestion + after
      newContent = lines.join('\n')
      fixedErrors.push(i)
    }
  }
  
  // 更新文档内容
  if (activeDocument.value.format === 'tex') {
    workspace.updateDocumentContent(activeDocument.value.id, { tex: newContent })
  } else {
    workspace.updateDocumentContent(activeDocument.value.id, { markdown: newContent })
  }
  
  // 清空错误列表
  proofreadResult.value.errors = []
  proofreadResult.value.totalErrors = 0
  
  // 更新元数据
  const updatedMeta = {
    ...activeDocument.value.meta,
    proofreadResult: proofreadResult.value
  }
  workspace.updateDocumentMeta(activeDocument.value.id, updatedMeta)
  
  ElMessage.success(t('proofread.fixAllSuccess', `已修复 ${fixedErrors.length} 个错误`))
}

// 获取错误类型标签
const getErrorTypeTag = (type: string) => {
  const typeMap: Record<string, string> = {
    grammar: 'warning',
    spelling: 'danger',
    latex: 'danger',
    style: 'info',
    other: ''
  }
  return typeMap[type] || ''
}

// 获取严重程度标签
const getSeverityTag = (severity: string) => {
  const severityMap: Record<string, string> = {
    error: 'danger',
    warning: 'warning',
    info: 'info'
  }
  return severityMap[severity] || ''
}
</script>

<style scoped>
.proofread-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.proofread-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 24px;
  overflow: hidden;
}

.proofread-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-shrink: 0;
}

.proofread-header h2 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.no-document {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: v-bind('themeState.currentTheme.textColor2');
}

.proofread-content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.error-stats {
  margin-bottom: 24px;
}

.error-list {
  flex: 1;
}
</style>

