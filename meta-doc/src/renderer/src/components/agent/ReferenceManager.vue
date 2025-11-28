<template>
  <div class="reference-manager" :style="containerStyle">
    <div class="manager-header">
      <h3>{{ t('agent.reference.title') }}</h3>
      <el-button type="primary" size="small" :icon="Plus" @click="handleAdd">
        {{ t('agent.reference.add') }}
      </el-button>
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
      <el-table-column :label="t('agent.reference.typeLabel')" width="120">
        <template #default="{ row }">
          <el-tag size="small">{{ getTypeLabel(row.type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.url')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.url }}
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
        <el-form-item :label="t('agent.reference.type')" required>
          <el-select v-model="formData.type" style="width: 100%">
            <el-option label="文件" value="file" />
            <el-option label="URL" value="url" />
            <el-option label="知识库" value="knowledge-base" />
            <el-option label="文章服务" value="article-service" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('agent.reference.url')" required>
          <el-input v-model="formData.url" :placeholder="t('agent.reference.urlPlaceholder')" />
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
import { themeState } from '@/utils/themes'
import type { Reference } from '@/types/agent-framework'
import type { AgentSession } from '@/types/agent'
import { agentSessionManager } from '@/utils/agent-framework'

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

const formData = ref({
  name: '',
  type: 'file' as Reference['type'],
  url: '',
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

const getTypeLabel = (type: Reference['type']): string => {
  const labels: Record<Reference['type'], string> = {
    'file': t('agent.reference.type.file'),
    'url': t('agent.reference.type.url'),
    'knowledge-base': t('agent.reference.type.knowledgeBase'),
    'article-service': t('agent.reference.type.articleService'),
    'custom': t('agent.reference.type.custom')
  }
  return labels[type] || type
}

const handleAdd = () => {
  editingReference.value = null
  formData.value = {
    name: '',
    type: 'file',
    url: '',
    description: ''
  }
  dialogVisible.value = true
}

const handleEdit = (reference: Reference) => {
  editingReference.value = reference
  formData.value = {
    name: reference.name,
    type: reference.type,
    url: reference.url,
    description: reference.description || ''
  }
  dialogVisible.value = true
}

const handleSave = () => {
  if (!formData.value.name.trim() || !formData.value.url.trim()) {
    ElMessage.warning(t('agent.reference.nameAndUrlRequired'))
    return
  }

  try {
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
      agentSessionManager.updateReference(
        newFormatSession,
        editingReference.value.id,
        formData.value
      )
      ElMessage.success(t('agent.reference.updateSuccess'))
    } else {
      agentSessionManager.addReference(
        newFormatSession,
        formData.value.name,
        formData.value.type,
        formData.value.url,
        formData.value.description
      )
      ElMessage.success(t('agent.reference.addSuccess'))
    }

    dialogVisible.value = false
    emit('update')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
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

