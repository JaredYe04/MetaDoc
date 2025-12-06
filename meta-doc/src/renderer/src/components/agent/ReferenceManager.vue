<template>
  <div class="reference-manager" :style="containerStyle">
    <div class="manager-header">
      <h3>{{ t('agent.reference.title') }}</h3>
      <div class="header-actions">
        <el-button 
          type="danger" 
          size="small" 
          :disabled="references.length === 0"
          @click="handleClearAll"
        >
          {{ t('agent.reference.clearAll') }}
        </el-button>
        <el-button type="primary" size="small" :icon="Plus" @click="handleAdd">
          {{ t('agent.reference.add') }}
        </el-button>
      </div>
    </div>

    <el-table
      :data="references"
      border
      stripe
      :style="tableStyle"
      v-loading="loading"
      max-height="400"
    >
      <el-table-column :label="t('agent.reference.name')" min-width="150">
        <template #default="{ row }">
          {{ row.name }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.format')" width="100">
        <template #default="{ row }">
          <el-tag size="small">{{ row.format || 'txt' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.origin')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.origin }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.description')" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.description || '-' }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.actions')" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleEdit(row)">{{ t('common.edit') }}</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">{{ t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingReference ? t('agent.reference.edit') : t('agent.reference.add')"
      width="600px"
      :style="dialogStyle"
    >
      <el-form :model="formData" label-width="100px">
        <el-form-item :label="t('agent.reference.name')" required>
          <el-input v-model="formData.name" />
        </el-form-item>
        <el-form-item :label="t('agent.reference.inputType')" required>
          <el-radio-group v-model="formData.inputType">
            <el-radio label="file">{{ t('agent.reference.type.file') }}</el-radio>
            <el-radio label="url">{{ t('agent.reference.type.url') }}</el-radio>
            <el-radio label="text">{{ t('agent.reference.type.custom') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('agent.reference.url')" required v-if="formData.inputType === 'url'">
          <el-input v-model="formData.url" :placeholder="t('agent.reference.urlPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('agent.reference.file')" required v-if="formData.inputType === 'file'">
          <el-upload
            :auto-upload="false"
            :on-change="handleFileChange"
            :show-file-list="false"
            accept="*/*"
          >
            <el-button type="primary">{{ t('agent.reference.selectFile') }}</el-button>
            <span v-if="selectedFile" style="margin-left: 8px;">{{ selectedFile.name }}</span>
          </el-upload>
        </el-form-item>
        <el-form-item :label="t('agent.reference.text')" required v-if="formData.inputType === 'text'">
          <el-input v-model="formData.text" type="textarea" :rows="5" :placeholder="t('agent.reference.textPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('agent.reference.description')">
          <el-input v-model="formData.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSave">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { themeState } from '../../utils/themes'
import type { Reference } from '../../types/agent-framework'
import type { AgentSession } from '../../types/agent'
import { agentSessionManager } from '../../utils/agent-framework'
import { processFileUpload, processUrlReference } from '../../utils/agent-framework/reference-processor'

const props = defineProps<{
  session: AgentSession
}>()

const emit = defineEmits<{
  update: []
}>()

const { t } = useI18n()

const loading = ref(false)
const dialogVisible = ref(false)
const editingReference = ref<Reference | null>(null)
const selectedFile = ref<File | null>(null)

const formData = ref({
  name: '',
  inputType: 'file' as 'file' | 'url' | 'text',
  url: '',
  text: '',
  description: ''
})

const references = computed(() => {
  return props.session.referenceStore || []
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '16px'
}))

const tableStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd
}))

const dialogStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const handleAdd = () => {
  editingReference.value = null
  selectedFile.value = null
  formData.value = {
    name: '',
    inputType: 'file',
    url: '',
    text: '',
    description: ''
  }
  dialogVisible.value = true
}

const handleFileChange = (file: any) => {
  selectedFile.value = file.raw
  formData.value.name = file.name
}

const handleEdit = (reference: Reference) => {
  editingReference.value = reference
  // 根据origin判断输入类型
  const isUrl = /^https?:\/\//.test(reference.origin)
  const isFile = /^[A-Za-z]:[\\/]/.test(reference.origin) || reference.origin.startsWith('/')
  formData.value = {
    name: reference.name,
    inputType: isUrl ? 'url' : (isFile ? 'file' : 'text'),
    url: isUrl ? reference.origin : '',
    text: !isUrl && !isFile ? reference.parsedContent : '',
    description: reference.description || ''
  }
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!formData.value.name.trim()) {
    ElMessage.warning(t('agent.reference.nameRequired'))
    return
  }

  if (formData.value.inputType === 'file' && !selectedFile.value && !editingReference.value) {
    ElMessage.warning(t('agent.reference.fileRequired'))
    return
  }

  if (formData.value.inputType === 'url' && !formData.value.url.trim()) {
    ElMessage.warning(t('agent.reference.urlRequired'))
    return
  }

  if (formData.value.inputType === 'text' && !formData.value.text.trim()) {
    ElMessage.warning(t('agent.reference.textRequired'))
    return
  }

  try {
    loading.value = true

    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...props.session,
      entityType: 'agent-session',
      createdAt: typeof props.session.createdAt === 'string' ? new Date(props.session.createdAt).getTime() : props.session.createdAt,
      updatedAt: typeof props.session.updatedAt === 'string' ? new Date(props.session.updatedAt).getTime() : props.session.updatedAt,
      messageQueue: props.session.messageQueue || [],
      referenceStore: props.session.referenceStore || [],
      publicContext: props.session.publicContext || {},
      executionNodes: props.session.executionNodes || [],
      status: props.session.status || 'idle'
    }

    if (editingReference.value) {
      // 编辑模式：只更新基本信息，不重新解析
      agentSessionManager.updateReference(
        newFormatSession,
        editingReference.value.id,
        {
          name: formData.value.name,
          description: formData.value.description
        }
      )
      ElMessage.success(t('agent.reference.updateSuccess'))
    } else {
      // 添加模式：处理文件上传、URL或文本
      let reference: Reference
      
      if (formData.value.inputType === 'file' && selectedFile.value) {
        // 处理文件上传（已在上传时解析）
        reference = await processFileUpload(selectedFile.value)
        reference.description = formData.value.description
      } else if (formData.value.inputType === 'url') {
        // 处理URL（已在下载时解析）
        reference = await processUrlReference(formData.value.url)
        reference.description = formData.value.description
      } else {
        // 处理文本引用
        const { processTextReference } = await import('../../utils/agent-framework/reference-processor')
        reference = processTextReference(formData.value.text, formData.value.name)
        reference.description = formData.value.description
      }
      
      agentSessionManager.addReferenceObject(newFormatSession, reference)
      ElMessage.success(t('agent.reference.addSuccess'))
    }

    dialogVisible.value = false
    selectedFile.value = null
    emit('update')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = false
  }
}

const handleDelete = async (reference: Reference) => {
  try {
    await ElMessageBox.confirm(
      t('agent.reference.confirmDelete', { name: reference.name }),
      t('common.confirm'),
      { type: 'warning' }
    )

    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...props.session,
      entityType: 'agent-session',
      createdAt: typeof props.session.createdAt === 'string' ? new Date(props.session.createdAt).getTime() : props.session.createdAt,
      updatedAt: typeof props.session.updatedAt === 'string' ? new Date(props.session.updatedAt).getTime() : props.session.updatedAt,
      messageQueue: props.session.messageQueue || [],
      referenceStore: props.session.referenceStore || [],
      publicContext: props.session.publicContext || {},
      executionNodes: props.session.executionNodes || [],
      status: props.session.status || 'idle'
    }

    agentSessionManager.removeReference(newFormatSession, reference.id)
    ElMessage.success(t('agent.reference.deleteSuccess'))
    emit('update')
  } catch {
    // 用户取消
  }
}

const handleClearAll = async () => {
  try {
    await ElMessageBox.confirm(
      t('agent.reference.confirmClearAll', { count: references.value.length }),
      t('agent.reference.clearAllConfirmTitle'),
      {
        confirmButtonText: t('agent.reference.clearAll'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...props.session,
      entityType: 'agent-session',
      createdAt: typeof props.session.createdAt === 'string' ? new Date(props.session.createdAt).getTime() : props.session.createdAt,
      updatedAt: typeof props.session.updatedAt === 'string' ? new Date(props.session.updatedAt).getTime() : props.session.updatedAt,
      messageQueue: props.session.messageQueue || [],
      referenceStore: props.session.referenceStore || [],
      publicContext: props.session.publicContext || {},
      executionNodes: props.session.executionNodes || [],
      status: props.session.status || 'idle'
    }

    // 清空所有引用
    const refIds = references.value.map(ref => ref.id)
    refIds.forEach(id => {
      agentSessionManager.removeReference(newFormatSession, id)
    })
    
    ElMessage.success(t('agent.reference.clearAllSuccess'))
    emit('update')
  } catch {
    // 用户取消
  }
}
</script>

<style scoped>
.reference-manager {
  width: 100%;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.manager-header h3 {
  margin: 0;
  font-size: 16px;
}
</style>

