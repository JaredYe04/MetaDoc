<template>
  <Dialog :open="visible" @update:open="(val) => !val && handleClose()">
    <DialogContent class="sm:max-w-[800px]">
      <DialogHeader>
        <DialogTitle>{{ isEdit ? '编辑Tool配置' : '新建Tool配置' }}</DialogTitle>
      </DialogHeader>
      <Form ref="formRef">
        <FormField label="Tool ID" name="id" :rules="rules.id">
          <Input
            v-model="formData.id"
            :disabled="isEdit"
            placeholder="唯一标识符，如: my-custom-tool"
            class="w-full"
          />
        </FormField>

        <FormField label="Tool名称" name="name" :rules="rules.name">
          <Input v-model="formData.name" placeholder="Tool显示名称" class="w-full" />
        </FormField>

        <FormField label="描述" name="description" :rules="rules.description">
          <Textarea
            v-model="formData.description"
            :rows="3"
            placeholder="Tool功能描述"
            class="w-full"
          />
        </FormField>

        <FormField label="来源" name="origin" :rules="rules.origin">
          <Select v-model="formData.origin">
            <SelectTrigger>
              <SelectValue placeholder="选择Tool来源" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="external">外部Tool</SelectItem>
              <SelectItem value="mcp">MCP服务</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField v-if="formData.origin === 'mcp'" label="MCP配置" name="mcpConfig">
          <div class="space-y-4 p-4 border rounded-md" v-if="formData.mcpConfig">
            <FormField label="服务器名称" name="mcpServerName">
              <Input v-model="formData.mcpConfig.serverName" class="w-full" />
            </FormField>
            <FormField label="Tool名称" name="mcpToolName">
              <Input v-model="formData.mcpConfig.toolName" class="w-full" />
            </FormField>
            <FormField label="服务器URL" name="mcpServerUrl">
              <Input v-model="formData.mcpConfig.serverUrl" class="w-full" />
            </FormField>
          </div>
        </FormField>

        <FormField label="详细说明" name="instruction" :rules="rules.instruction">
          <Textarea
            v-model="instructionText"
            :rows="10"
            placeholder="Markdown格式的Tool使用说明，包括功能、使用场景、输入输出格式等"
            class="w-full"
          />
        </FormField>

        <FormField label="标签" name="tags">
          <div class="tags-input-container">
            <Badge
              v-for="(tag, index) in formData.tags"
              :key="tag + index"
              variant="secondary"
              class="tag-badge"
            >
              {{ tag }}
              <button type="button" class="tag-remove" @click="removeTag(index)">
                <X class="h-3 w-3" />
              </button>
            </Badge>
            <Input
              v-model="tagInputValue"
              placeholder="添加标签"
              class="tag-input-field"
              @keydown.enter.prevent="addTag"
              @keydown.backspace="handleTagBackspace"
            />
          </div>
        </FormField>
      </Form>

      <DialogFooter>
        <Button variant="outline" @click="handleClose">取消</Button>
        <Button @click="handleSave">保存</Button>
        <Button v-if="isEdit" variant="secondary" @click="handleExport">导出</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { toast } from '@renderer/utils/notification/toast'
import { X } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Badge } from '@renderer/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Form, FormField } from '@renderer/components/ui/form'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { AgentToolConfig, MCPToolConfig } from '../../../types/agent-tool'
import { toolPluginManager } from '../../../utils/agent-tools/plugin-manager'
import { agentToolManager } from '../../../utils/agent/agent-tool-manager'
import { getLocalizedInstruction } from '../i18n-helper'

const props = defineProps<{
  modelValue: boolean
  toolId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [toolId: string]
}>()

const formRef = ref()
const visible = ref(props.modelValue)
const isEdit = computed(() => !!props.toolId)

const formData = reactive<Partial<AgentToolConfig> & { mcpConfig?: Partial<MCPToolConfig> }>({
  id: '',
  name: '',
  description: '',
  origin: 'external',
  instruction: '',
  tags: [],
  mcpConfig: {
    serverName: '',
    toolName: '',
    serverUrl: ''
  }
})

// instruction的计算属性，确保始终是字符串
const instructionText = computed({
  get: () => {
    const instruction = formData.instruction
    if (typeof instruction === 'string') {
      return instruction
    }
    if (typeof instruction === 'object' && instruction !== null) {
      return getLocalizedInstruction(instruction)
    }
    return ''
  },
  set: (value: string) => {
    formData.instruction = value
  }
})

const commonTags = ['ai', 'utility', 'data', 'api', 'mcp']
const tagInputValue = ref('')

const addTag = () => {
  const value = tagInputValue.value.trim()
  if (!value) return
  if (!formData.tags?.includes(value)) {
    formData.tags = [...(formData.tags || []), value]
  }
  tagInputValue.value = ''
}

const removeTag = (index: number) => {
  if (formData.tags) {
    formData.tags.splice(index, 1)
  }
}

const handleTagBackspace = () => {
  if (tagInputValue.value === '' && formData.tags?.length > 0) {
    removeTag(formData.tags.length - 1)
  }
}

const rules = {
  id: [{ required: true, message: '请输入Tool ID', trigger: 'blur' }],
  name: [{ required: true, message: '请输入Tool名称', trigger: 'blur' }],
  description: [{ required: true, message: '请输入描述', trigger: 'blur' }],
  instruction: [{ required: true, message: '请输入详细说明', trigger: 'blur' }],
  origin: [{ required: true, message: '请选择来源', trigger: 'change' }]
}

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val && props.toolId) {
      loadToolConfig(props.toolId)
    } else if (val) {
      resetForm()
    }
  }
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

const loadToolConfig = (toolId: string) => {
  const tool = agentToolManager.getTool(toolId)
  if (tool) {
    const config = tool.config
    // 处理instruction，如果是对象则转换为字符串
    let instruction = config.instruction
    if (typeof instruction === 'object' && instruction !== null) {
      instruction = getLocalizedInstruction(instruction)
    }

    // 处理 name 和 description（使用 locales 中的 toolLabels 以支持界面本地化）
    const name =
      typeof config.name === 'string'
        ? agentToolManager.getLocalizedToolName(config.id, config.name)
        : agentToolManager.getLocalizedToolName(config.id, String((config.name as any)?.en_us?.name ?? config.id))
    const description =
      typeof config.description === 'string'
        ? agentToolManager.getLocalizedToolDescription(config.id, config.description)
        : agentToolManager.getLocalizedToolDescription(
            config.id,
            String((config.description as any)?.en_us?.description ?? '')
          )

    Object.assign(formData, {
      ...config,
      instruction: instruction || '',
      name: name || '',
      description: description || '',
      mcpConfig: {
        serverName: config.mcpConfig?.serverName || '',
        toolName: config.mcpConfig?.toolName || '',
        serverUrl: config.mcpConfig?.serverUrl || ''
      }
    })
  }
}

const resetForm = () => {
  Object.assign(formData, {
    id: '',
    name: '',
    description: '',
    origin: 'external',
    instruction: '',
    tags: [],
    mcpConfig: {
      serverName: '',
      toolName: '',
      serverUrl: ''
    }
  })
  formRef.value?.resetFields()
}

const handleClose = () => {
  visible.value = false
  resetForm()
}

const handleSave = async () => {
  if (!formRef.value) return

  const valid = await formRef.value.validate()
  if (valid) {
    // 验证配置
    const validation = toolPluginManager.validateToolConfig(formData as Partial<AgentToolConfig>)
    if (!validation.valid) {
      toast.error(`配置验证失败: ${validation.errors.join(', ')}`)
      return
    }

    // 保存配置
    if (isEdit.value && props.toolId) {
      agentToolManager.updateToolConfig(props.toolId, formData as Partial<AgentToolConfig>)
      toast.success('Tool配置已更新')
    } else {
      // 新建Tool需要提供callback
      toast.warning('新建Tool需要提供callback实现，请使用导入功能或联系开发者')
    }

    emit('saved', formData.id!)
    handleClose()
  }
}

const handleExport = () => {
  if (!props.toolId) return

  const exported = toolPluginManager.exportToolConfigAsJSON(props.toolId)
  if (exported) {
    // 创建下载
    const blob = new Blob([exported], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.toolId}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Tool配置已导出')
  }
}
</script>

<style scoped>
.tags-input-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  min-height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background-color: var(--background);
}

.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
}

.tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: currentColor;
  opacity: 0.6;
}

.tag-remove:hover {
  opacity: 1;
}

.tag-input-field {
  flex: 1;
  min-width: 80px;
  border: none;
  background: transparent;
  padding: 0;
  outline: none;
  box-shadow: none;
}

.tag-input-field:focus {
  outline: none;
  box-shadow: none;
  border: none;
}
</style>
