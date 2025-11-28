<template>
  <div class="tool-collection-manager" :style="containerStyle">
    <div class="manager-header">
      <h2>{{ t('agent.manage.toolCollection.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="handleCreate">
        {{ t('agent.manage.toolCollection.create') }}
      </el-button>
    </div>

    <el-table
      :data="collections"
      border
      stripe
      :style="tableStyle"
      v-loading="loading"
    >
      <el-table-column prop="id" label="ID" width="200" />
      <el-table-column :label="t('agent.manage.toolCollection.name')" min-width="150">
        <template #default="{ row }">
          {{ getLocalizedText(row.name) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.toolCollection.description')" min-width="200">
        <template #default="{ row }">
          {{ getLocalizedText(row.description) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.toolCollection.toolCount')" width="120">
        <template #default="{ row }">
          {{ row.toolIds.length }}
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.toolCollection.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.enabled !== false ? 'success' : 'info'" size="small">
            {{ row.enabled !== false ? t('agent.manage.enabled') : t('agent.manage.disabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.manage.actions')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleEdit(row)">{{ t('agent.manage.edit') }}</el-button>
          <el-button size="small" @click="handleExport(row)">{{ t('agent.manage.export') }}</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">{{ t('agent.manage.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingCollection ? t('agent.manage.toolCollection.edit') : t('agent.manage.toolCollection.create')"
      width="600px"
      :style="dialogStyle"
    >
      <el-form :model="formData" label-width="120px">
        <el-form-item :label="t('agent.manage.toolCollection.name')" required>
          <el-input v-model="formData.name" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.toolCollection.description')">
          <el-input v-model="formData.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('agent.manage.toolCollection.tools')">
          <el-select
            v-model="formData.toolIds"
            multiple
            filterable
            style="width: 100%"
            :placeholder="t('agent.manage.toolCollection.selectTools')"
          >
            <el-option
              v-for="tool in availableTools"
              :key="tool.id"
              :label="tool.name"
              :value="tool.id"
            />
          </el-select>
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
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { themeState } from '@/utils/themes'
import { toolCollectionManager } from '@/utils/agent-framework'
import { agentToolManager } from '@/utils/agent-tool-manager'
import type { ToolCollection } from '@/types/agent-framework'
import type { LocalizedText } from '@/types/agent-tool'

const { t } = useI18n()

const collections = ref<ToolCollection[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingCollection = ref<ToolCollection | null>(null)

const formData = ref({
  name: '',
  description: '',
  toolIds: [] as string[]
})

const availableTools = computed(() => {
  return agentToolManager.getAllTools().map(tool => ({
    id: tool.config.id,
    name: agentToolManager.getLocalizedText(tool.config.name)
  }))
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '20px'
}))

const tableStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd
}))

const dialogStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const getLocalizedText = (text: LocalizedText): string => {
  if (typeof text === 'string') {
    return text
  }
  // 简化处理，实际应该根据当前语言选择
  return text['zh_cn']?.name || text['en_us']?.name || ''
}

const loadCollections = () => {
  loading.value = true
  try {
    collections.value = toolCollectionManager.getAllCollections()
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  editingCollection.value = null
  formData.value = {
    name: '',
    description: '',
    toolIds: []
  }
  dialogVisible.value = true
}

const handleEdit = (collection: ToolCollection) => {
  editingCollection.value = collection
  formData.value = {
    name: typeof collection.name === 'string' ? collection.name : collection.name['zh_cn']?.name || '',
    description: typeof collection.description === 'string' ? collection.description : collection.description['zh_cn']?.description || '',
    toolIds: [...collection.toolIds]
  }
  dialogVisible.value = true
}

const handleSave = () => {
  if (!formData.value.name.trim()) {
    ElMessage.warning(t('agent.manage.toolCollection.nameRequired'))
    return
  }

  try {
    if (editingCollection.value) {
      // 更新
      toolCollectionManager.updateCollection(editingCollection.value.id, {
        name: formData.value.name,
        description: formData.value.description,
        toolIds: formData.value.toolIds
      })
      ElMessage.success(t('agent.manage.toolCollection.updateSuccess'))
    } else {
      // 创建
      toolCollectionManager.createCollection(
        formData.value.name,
        formData.value.description,
        formData.value.toolIds
      )
      ElMessage.success(t('agent.manage.toolCollection.createSuccess'))
    }
    dialogVisible.value = false
    loadCollections()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDelete = async (collection: ToolCollection) => {
  try {
    await ElMessageBox.confirm(
      t('agent.manage.toolCollection.confirmDelete', { name: getLocalizedText(collection.name) }),
      t('common.confirm'),
      { type: 'warning' }
    )
    toolCollectionManager.deleteCollection(collection.id)
    ElMessage.success(t('agent.manage.toolCollection.deleteSuccess'))
    loadCollections()
  } catch {
    // 用户取消
  }
}

const handleExport = (collection: ToolCollection) => {
  try {
    const entity = toolCollectionManager.exportCollection(collection.id, false)
    if (entity) {
      const json = JSON.stringify(entity, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tool-collection-${collection.id}.json`
      a.click()
      URL.revokeObjectURL(url)
      ElMessage.success(t('agent.manage.exportSuccess'))
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

onMounted(() => {
  loadCollections()
})
</script>

<style scoped>
.tool-collection-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.manager-header h2 {
  margin: 0;
}
</style>

