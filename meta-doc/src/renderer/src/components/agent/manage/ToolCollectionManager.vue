<template>
  <div class="tool-collection-manager" :style="containerStyle">
    <div class="manager-header">
      <h2>{{ t('agent.manage.toolCollection.title') }}</h2>
      <Button type="primary" @click="handleCreate">
        <Plus class="h-4 w-4 mr-1" />
        {{ t('agent.manage.toolCollection.create') }}
      </Button>
    </div>

    <CardGrid
      :items="collections"
      :loading="loading"
      :show-thumbnail="false"
      :get-item-id="(item) => item.id"
      :get-item-title="(item) => getLocalizedText(item.name)"
      :get-item-description="(item) => getLocalizedText(item.description)"
      :get-item-meta="
        (item) => [
          t('agent.manage.toolCollection.toolCount') + ': ' + item.toolIds.length,
          item.enabled !== false ? t('agent.manage.enabled') : t('agent.manage.disabled')
        ]
      "
      :get-badge="(item) => (item.isBuiltIn ? t('agent.manage.toolCollection.builtIn') : null)"
      :get-actions="getActions"
      :is-disabled="() => false"
      @item-click="handleEdit"
      @action="handleAction"
    />

    <!-- 创建/编辑对话框 -->
    <Dialog v-model:open="dialogVisible">
      <DialogContent class="max-w-[600px]" :style="dialogStyle">
        <DialogHeader>
          <DialogTitle>
            {{
              editingCollection
                ? t('agent.manage.toolCollection.edit')
                : t('agent.manage.toolCollection.create')
            }}
          </DialogTitle>
        </DialogHeader>
        <Form class="space-y-4">
          <FormField :label="t('agent.manage.toolCollection.name')" name="name" required>
            <Input v-model="formData.name" class="w-full" />
          </FormField>
          <FormField :label="t('agent.manage.toolCollection.description')" name="description">
            <Textarea v-model="formData.description" :rows="3" class="w-full" />
          </FormField>
          <FormField :label="t('agent.manage.toolCollection.tools')" name="tools">
            <Select v-model="formData.toolIds" multiple>
              <SelectTrigger style="width: 100%">
                <SelectValue :placeholder="t('agent.manage.toolCollection.selectTools')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="tool in availableTools" :key="tool.id" :value="tool.id">
                  {{ tool.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </Form>
        <DialogFooter>
          <Button @click="dialogVisible = false">{{ t('common.cancel') }}</Button>
          <Button type="primary" @click="handleSave" :disabled="editingCollection?.isBuiltIn">{{
            t('common.save')
          }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from '@renderer/utils/toast'
import { messageBox } from '../../../utils/messageBox'
import { Plus } from '@element-plus/icons-vue'
import { themeState } from '../../../utils/themes'
import { toolCollectionManager } from '../../../utils/agent-framework'
import { agentToolManager } from '../../../utils/agent-tool-manager'
import type { ToolCollection } from '../../../types/agent-framework'
import type { LocalizedText } from '../../../types/agent-tool'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Form, FormField } from '@renderer/components/ui/form'
import CardGrid from '../../common/CardGrid.vue'
import type { CardGridAction } from '../../common/CardGrid.vue'

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
  return agentToolManager.getAllTools().map((tool) => ({
    id: tool.config.id,
    name: agentToolManager.getLocalizedToolName(tool.config.id, String(tool.config.name ?? tool.config.id))
  }))
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '20px'
}))

const getActions = (item: ToolCollection): CardGridAction[] => {
  return [
    { command: 'edit', label: t('agent.manage.edit'), disabled: item.isBuiltIn },
    { command: 'duplicate', label: t('agent.sessions.duplicate') },
    { command: 'export', label: t('agent.manage.export') },
    { command: 'delete', label: t('agent.manage.delete'), disabled: item.isBuiltIn, danger: true }
  ]
}

const handleAction = async (command: string, collection: ToolCollection) => {
  if (command === 'edit') {
    handleEdit(collection)
  } else if (command === 'duplicate') {
    await handleDuplicate(collection)
  } else if (command === 'export') {
    handleExport(collection)
  } else if (command === 'delete') {
    await handleDelete(collection)
  }
}

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
    name:
      typeof collection.name === 'string' ? collection.name : collection.name['zh_cn']?.name || '',
    description:
      typeof collection.description === 'string'
        ? collection.description
        : collection.description['zh_cn']?.description || '',
    toolIds: [...collection.toolIds]
  }
  dialogVisible.value = true
}

const handleSave = () => {
  if (!formData.value.name.trim()) {
    toast.warning(t('agent.manage.toolCollection.nameRequired'))
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
      toast.success(t('agent.manage.toolCollection.updateSuccess'))
    } else {
      // 创建
      toolCollectionManager.createCollection(
        formData.value.name,
        formData.value.description,
        formData.value.toolIds
      )
      toast.success(t('agent.manage.toolCollection.createSuccess'))
    }
    dialogVisible.value = false
    loadCollections()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDelete = async (collection: ToolCollection) => {
  if (collection.isBuiltIn) {
    toast.warning(t('agent.manage.toolCollection.cannotDeleteDefault'))
    return
  }

  try {
    await messageBox.confirm(
      t('agent.manage.toolCollection.confirmDelete', { name: getLocalizedText(collection.name) }),
      t('common.confirm'),
      { type: 'warning' }
    )
    toolCollectionManager.deleteCollection(collection.id)
    toast.success(t('agent.manage.toolCollection.deleteSuccess'))
    loadCollections()
  } catch (error) {
    if (error !== 'cancel') {
      toast.error(error instanceof Error ? error.message : String(error))
    }
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
      toast.success(t('agent.manage.exportSuccess'))
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

const handleDuplicate = async (collection: ToolCollection) => {
  try {
    const baseName = getLocalizedText(collection.name) || collection.id
    const newName = `${baseName} - ${t('agent.sessions.duplicate')}`
    const desc =
      typeof collection.description === 'string'
        ? collection.description
        : collection.description['zh_cn']?.description ||
          collection.description['en_us']?.description ||
          ''

    toolCollectionManager.createCollection(newName, desc, [...collection.toolIds])
    toast.success(t('agent.sessions.duplicateSuccess'))
    loadCollections()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
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
