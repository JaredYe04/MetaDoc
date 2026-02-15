<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑Tool配置' : '新建Tool配置'"
    width="800px"
    :before-close="handleClose"
  >
    <el-form ref="formRef" :model="formData" :rules="rules" label-width="120px">
      <el-form-item label="Tool ID" prop="id">
        <el-input
          v-model="formData.id"
          :disabled="isEdit"
          placeholder="唯一标识符，如: my-custom-tool"
        />
      </el-form-item>

      <el-form-item label="Tool名称" prop="name">
        <el-input v-model="formData.name" placeholder="Tool显示名称" />
      </el-form-item>

      <el-form-item label="描述" prop="description">
        <el-input
          v-model="formData.description"
          type="textarea"
          :rows="3"
          placeholder="Tool功能描述"
        />
      </el-form-item>

      <el-form-item label="来源" prop="origin">
        <el-select v-model="formData.origin" placeholder="选择Tool来源">
          <el-option label="外部Tool" value="external" />
          <el-option label="MCP服务" value="mcp" />
        </el-select>
      </el-form-item>

      <el-form-item v-if="formData.origin === 'mcp'" label="MCP配置" prop="mcpConfig">
        <el-form :model="formData.mcpConfig" label-width="100px" v-if="formData.mcpConfig">
          <el-form-item label="服务器名称" prop="serverName">
            <el-input v-model="formData.mcpConfig.serverName" />
          </el-form-item>
          <el-form-item label="Tool名称" prop="toolName">
            <el-input v-model="formData.mcpConfig.toolName" />
          </el-form-item>
          <el-form-item label="服务器URL" prop="serverUrl">
            <el-input v-model="formData.mcpConfig.serverUrl" />
          </el-form-item>
        </el-form>
      </el-form-item>

      <el-form-item label="详细说明" prop="instruction">
        <el-input
          v-model="instructionText"
          type="textarea"
          :rows="10"
          placeholder="Markdown格式的Tool使用说明，包括功能、使用场景、输入输出格式等"
        />
      </el-form-item>

      <el-form-item label="标签">
        <el-select v-model="formData.tags" multiple filterable allow-create placeholder="添加标签">
          <el-option v-for="tag in commonTags" :key="tag" :label="tag" :value="tag" />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
      <el-button v-if="isEdit" type="success" @click="handleExport">导出</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import type { AgentToolConfig, MCPToolConfig } from '../../../types/agent-tool'
import { toolPluginManager } from '../../../utils/agent-tools/plugin-manager'
import { agentToolManager } from '../../../utils/agent-tool-manager'
import { getLocalizedInstruction } from '../i18n-helper'

const props = defineProps<{
  modelValue: boolean
  toolId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [toolId: string]
}>()

const formRef = ref<FormInstance>()
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

const rules: FormRules = {
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

    // 处理name和description
    let name = config.name
    if (typeof name === 'object' && name !== null) {
      name = agentToolManager.getLocalizedText(name)
    }

    let description = config.description
    if (typeof description === 'object' && description !== null) {
      description = agentToolManager.getLocalizedText(description)
    }

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

  await formRef.value.validate((valid) => {
    if (valid) {
      // 验证配置
      const validation = toolPluginManager.validateToolConfig(formData as Partial<AgentToolConfig>)
      if (!validation.valid) {
        ElMessage.error(`配置验证失败: ${validation.errors.join(', ')}`)
        return
      }

      // 保存配置
      if (isEdit.value && props.toolId) {
        agentToolManager.updateToolConfig(props.toolId, formData as Partial<AgentToolConfig>)
        ElMessage.success('Tool配置已更新')
      } else {
        // 新建Tool需要提供callback
        ElMessage.warning('新建Tool需要提供callback实现，请使用导入功能或联系开发者')
      }

      emit('saved', formData.id!)
      handleClose()
    }
  })
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
    ElMessage.success('Tool配置已导出')
  }
}
</script>

<style scoped>
/* 样式可以根据需要添加 */
</style>
