<template>
  <div
    class="tool-result-simple"
    :class="[`status-${message.status}`, { 'tool-result-simple--compact': compact }]"
  >
    <header class="tool-result-simple-header">
      <div class="tool-result-simple-title-row">
        <span class="tool-result-simple-name">{{ message.tool.name }}</span>
        <Badge
          class="tool-result-simple-badge"
          size="small"
          :type="getToolStatusTagType(message.status)"
        >
          {{ getToolStatusLabel(message.status) }}
        </Badge>
      </div>
      <small v-if="!compact" class="tool-result-simple-timestamp">{{
        formatTimestamp(message.timestamp)
      }}</small>
    </header>

    <div
      v-if="message.progress && message.progress.percentage > 0"
      class="tool-result-simple-progress"
    >
      <Progress :percentage="message.progress.percentage" :stroke-width="4" :show-text="true">
        <template #default="{ percentage }">
          <span class="tool-result-simple-progress-text">{{ percentage }}%</span>
          <span v-if="message.progress?.message" class="tool-result-simple-progress-msg">
            {{ message.progress.message }}
          </span>
        </template>
      </Progress>
    </div>

    <div class="tool-result-simple-body">
      <template v-for="output in message.outputs" :key="output.id">
        <component
          v-if="
            getOutputRendererName(output) &&
            resolveToolOutputComponent(getOutputRendererName(output)!)
          "
          :is="resolveToolOutputComponent(getOutputRendererName(output)!)"
          :data="output.data"
          :status="message.status"
          :progress="message.progress"
          :error="message.error"
          :tool-config="toolConfig"
          :invocation-id="message.invocationId"
          :params-diff="message.params?.diff"
          :compact="compact"
        />
        <pre v-else class="tool-result-simple-raw">{{ formatOutput(output) }}</pre>
      </template>
    </div>

    <div v-if="message.error" class="tool-result-simple-error">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ message.error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { dayjs } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'
import type { ToolAgentMessage, ToolOutputDescriptor } from '../../types/agent'
import { Badge } from '@renderer/components/ui/badge'
import { Progress } from '@renderer/components/ui/progress'
import { agentToolManager } from '../../utils/agent-tool-manager'
import { resolveToolOutputComponent } from '../../utils/agent-tools/resolve-tool-output-component'
import { themeState } from '../../utils/themes'

const props = withDefaults(
  defineProps<{
    message: ToolAgentMessage
    compact?: boolean
  }>(),
  { compact: false }
)

const { t } = useI18n()

const toolConfig = computed(() => agentToolManager.getTool(props.message.tool.id)?.config)

function getToolStatusTagType(status: ToolAgentMessage['status']) {
  switch (status) {
    case 'pending':
      return 'info'
    case 'running':
      return 'warning'
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'info'
    default:
      return 'info'
  }
}

function getToolStatusLabel(status: ToolAgentMessage['status']) {
  switch (status) {
    case 'pending':
      return t('agent.tool.status.pending')
    case 'running':
      return t('agent.tool.status.running')
    case 'succeeded':
      return t('agent.tool.status.success')
    case 'failed':
      return t('agent.tool.status.failed')
    default:
      return status
  }
}

/** 持久化后 output.renderer 可能丢失（组件对象无 .name 时未序列化），按 toolId 回退到已知 Display */
const TOOL_ID_TO_RENDERER: Record<string, string> = {
  edit: 'EditDisplay',
  grep: 'GrepDisplay',
  todolist: 'TodoListDisplay',
  'todolist-planning': 'TodoListDisplay',
  workspace: 'WorkspaceDisplay',
  'outline-tree': 'OutlineTreeDisplay',
  'outline-optimize': 'OutlineOptimizeDisplay',
  diff: 'DiffDisplay',
  proofread: 'ProofreadDisplay',
  'title-format': 'TitleFormatDisplay',
  'chart-generation': 'ChartGenerationDisplay',
  'data-analysis': 'DataAnalysisDisplay',
  'web-crawler': 'WebCrawlerDisplay',
  terminal: 'TerminalExecutionDisplay',
  metadata: 'MetadataDisplay',
  color: 'ColorDisplay',
  rag: 'RAGToolDisplay'
}

function getOutputRendererName(output: ToolOutputDescriptor): string | null {
  if (output.renderer) return output.renderer
  const toolId = props.message.tool?.id
  if (toolId && TOOL_ID_TO_RENDERER[toolId]) return TOOL_ID_TO_RENDERER[toolId]
  return null
}

function formatOutput(output: ToolOutputDescriptor): string {
  const d = output.data
  if (typeof d === 'string') return d
  try {
    return JSON.stringify(d, null, 2)
  } catch {
    return String(d)
  }
}

function formatTimestamp(ts: string) {
  return dayjs(ts).format('HH:mm')
}
</script>

<style scoped>
.tool-result-simple {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: v-bind('themeState.currentTheme.background2nd');
  border-radius: 8px;
  border: 1px solid
    v-bind('themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"');
}

.tool-result-simple--compact {
  padding: 6px 8px;
}

.tool-result-simple-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"'
    );
}

.tool-result-simple--compact .tool-result-simple-header {
  margin-bottom: 6px;
  padding-bottom: 4px;
}

.tool-result-simple-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-result-simple-name {
  font-size: 13px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.primaryColor');
}

.tool-result-simple--compact .tool-result-simple-name {
  font-size: 12px;
}

.tool-result-simple-badge {
  cursor: default;
  pointer-events: none;
}

.tool-result-simple-timestamp {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
}

.tool-result-simple-progress {
  margin-bottom: 8px;
}

.tool-result-simple-progress-text,
.tool-result-simple-progress-msg {
  font-size: 11px;
  color: v-bind('themeState.currentTheme.textColor2');
}

.tool-result-simple-body {
  min-height: 0;
}

.tool-result-simple-body > * + * {
  margin-top: 8px;
}

.tool-result-simple-raw {
  margin: 0;
  padding: 6px 8px;
  font-size: 12px;
  white-space: pre-wrap;
  overflow: auto;
  border-radius: 4px;
  background: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor');
}

.tool-result-simple-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--el-color-danger);
  background: v-bind('themeState.currentTheme.background');
  border-radius: 4px;
}
</style>
