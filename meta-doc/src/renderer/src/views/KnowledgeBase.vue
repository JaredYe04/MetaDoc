<template>
  <div class="kb-root">
    <!-- {{ t('knowledgeBase.disabledOverlay') }} -->
    <div v-if="!isAiEnabled" class="kb-disabled-overlay">
      <div class="kb-disabled-content">
        <el-icon class="kb-disabled-icon" :size="64">
          <Lock />
        </el-icon>
        <h2 class="kb-disabled-title">
          {{ t('knowledgeBase.aiDisabledTitle', 'AI 功能已关闭') }}
        </h2>
        <p class="kb-disabled-message">
          {{
            t(
              'knowledgeBase.aiDisabledMessage',
              '当前已关闭 LLM 总控，知识库检索与 AI 功能暂不可用。请在设置中启用 LLM 后继续。'
            )
          }}
        </p>
      </div>
    </div>
    <div v-else-if="!knowledgeBaseEnabled" class="kb-disabled-overlay">
      <div class="kb-disabled-content">
        <el-icon class="kb-disabled-icon" :size="64">
          <Lock />
        </el-icon>
        <h2 class="kb-disabled-title">{{ t('knowledgeBase.disabled') || '知识库已禁用' }}</h2>
        <p class="kb-disabled-message">
          {{
            t('knowledgeBase.disabledMessage') ||
            '知识库功能当前已禁用。请在设置中启用知识库功能以使用此功能。'
          }}
        </p>
        <Button variant="default" @click="enableKnowledgeBase">
          {{ t('knowledgeBase.enable') || '启用知识库' }}
        </Button>
      </div>
    </div>

    <!-- 知识库正常界面 -->
    <div v-else class="kb-scroll-wrapper">
      <div ref="kbContainerRef" class="kb-container">
        <!-- Left column -->
        <div
          class="kb-left"
          :style="{
            background: themeState.currentTheme.background,
            width: leftWidthPercent + '%'
          }"
        >
          <!-- 上: 知识库列表（与右列共用 topPercent，底边必对齐） -->
          <div
            class="kb-list-wrapper"
            :style="{ flex: '0 0 ' + topPercent + '%', minHeight: 0 }"
          >
            <Card
              class="kb-panel kb-panel-fill"
              :style="{
                background: themeState.currentTheme.background2nd,
                position: 'relative'
              }"
            >
              <LoadingOverlay
                :show="isUploading"
                :message="t('knowledgeBase.uploading', '上传中...')"
              />
              <CardContent class="kb-card-content">
                <div class="kb-panel-header">
                  <h2 class="kb-panel-title">{{ t('knowledgeBase.title') }}</h2>
                  <div class="kb-panel-actions">
                    <Button variant="default" size="sm" @click="triggerUpload">{{
                      t('knowledgeBase.add')
                    }}</Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      :disabled="!selectedItem"
                      @click="confirmDelete"
                      >{{ t('knowledgeBase.delete') }}</Button
                    >
                    <Button variant="secondary" size="sm" @click="confirmClearAll">{{
                      t('knowledgeBase.clear_all')
                    }}</Button>
                    <input
                      ref="fileInput"
                      type="file"
                      multiple
                      style="display: none"
                      @change="onFileSelected"
                      accept=".txt,.md,.pdf,.docx"
                    />
                  </div>
                </div>
                <ScrollArea class="kb-list-scroll">
                  <Table class="kb-table">
                    <TableHeader>
                      <TableRow class="kb-table-header-row">
                        <TableHead class="w-[200px]">{{ t('knowledgeBase.name') }}</TableHead>
                        <TableHead class="w-[140px]">{{
                          t('knowledgeBase.size_chunks')
                        }}</TableHead>
                        <TableHead class="w-[90px]">{{ t('knowledgeBase.enabled') }}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow
                        v-for="row in items"
                        :key="row.id"
                        class="kb-table-row"
                        :data-selected="selectedId === row.id"
                        @click="selectRow(row)"
                      >
                        <TableCell>
                          <div class="list-item">
                            <span class="status-dot" :class="row.enabled ? 'on' : 'off'"></span>
                            <span class="item-name">{{ row.name }}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div v-if="row.info">
                            {{ row.info.sizeText || '-' }} / {{ row.info.chunks || '-' }}
                            {{ t('knowledgeBase.chunks_unit') }}
                          </div>
                          <div v-else>-</div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            :checked="row.info.enabled"
                            @update:checked="(val: boolean) => toggleEnable(row, val)"
                            @click.stop
                          />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
          <div
            class="kb-resize-bar kb-resize-h"
            role="separator"
            aria-label="调整上下高度"
            @mousedown.prevent.stop="onResizeBarMouseDown('h', $event)"
          />
          <!-- 下: 检索测试（布局与右下配置信息一致，填满剩余高度） -->
          <div class="kb-search-wrapper">
            <Card
              class="kb-panel kb-search kb-panel-fill"
              :style="{
                background: themeState.currentTheme.background2nd
              }"
            >
              <CardContent class="kb-card-content kb-search-card-content">
                <h3>{{ t('knowledgeBase.searchTest.title') }}</h3>
                <Input
                  v-model="searchQuery"
                  :placeholder="t('knowledgeBase.searchTest.placeholder')"
                  @keyup.enter="doSearch"
                  class="kb-search-query-input"
                />
                <div class="kb-search-controls-row">
                  <div class="kb-search-threshold-col">
                    <FormItem :label="$t('setting.knowledgeBaseScoreThreshold')">
                      <div class="flex items-center gap-4 kb-search-slider-row">
                        <Slider
                          :model-value="settings.knowledgeBaseScoreThreshold"
                          :min="0.01"
                          :max="0.99"
                          :step="0.01"
                          @update:model-value="
                            (val) => {
                              settings.knowledgeBaseScoreThreshold = val
                              setSetting('knowledgeBaseScoreThreshold', val)
                            }
                          "
                          class="flex-1 min-w-0"
                        />
                        <NumberField
                          :model-value="settings.knowledgeBaseScoreThreshold"
                          :min="0.01"
                          :max="0.99"
                          :step="0.01"
                          :precision="2"
                          @update:model-value="
                            (val) => {
                              settings.knowledgeBaseScoreThreshold = val
                              setSetting('knowledgeBaseScoreThreshold', val)
                            }
                          "
                          class="w-28 shrink-0"
                        >
                          <NumberFieldContent>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldContent>
                        </NumberField>
                      </div>
                      <div class="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{{ $t('setting.lowPrecision') }} (0.3)</span>
                        <span class="text-primary">{{ $t('setting.recommended') }} (0.5)</span>
                        <span>{{ $t('setting.highPrecision') }} (0.8)</span>
                      </div>
                    </FormItem>
                  </div>
                  <div class="kb-search-action-col">
                    <Button
                      variant="default"
                      size="sm"
                      class="kb-search-submit-btn"
                      @click="doSearch"
                      :loading="searching"
                      >{{ t('knowledgeBase.searchTest.searchBtn') }}</Button
                    >
                  </div>
                </div>

                <div
                  class="kb-search-results-area"
                  :class="{ 'kb-search-results-area--empty': kbSearchResultsEmpty }"
                >
                  <el-scrollbar class="kb-search-scroll">
                    <Card
                      class="kb-result-card"
                      v-for="(result, index) in searchResults"
                      :key="index"
                      :style="{
                        background: themeState.currentTheme.SideBackgroundColor,
                        marginBottom: '6px'
                      }"
                    >
                      <CardContent class="kb-result-card-content">
                        <pre class="result-text">{{ result }}</pre>
                      </CardContent>
                    </Card>

                    <div
                      v-if="kbSearchResultsEmpty"
                      :style="{ color: themeState.currentTheme.textColor2 }"
                      class="placeholder kb-search-empty-placeholder"
                    >
                      {{ t('knowledgeBase.searchTest.noResult') }}
                    </div>
                  </el-scrollbar>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        <div
          class="kb-resize-bar kb-resize-v"
          role="separator"
          aria-label="调整左右宽度"
          @mousedown.prevent.stop="onResizeBarMouseDown('v', $event)"
        />
        <!-- Right column -->
        <div
          class="kb-right"
          :style="{ background: themeState.currentTheme.background }"
        >
          <!-- 上: preview（与左列共用 topPercent，底边必对齐） -->
          <div
            class="kb-preview-wrapper"
            :style="{ flex: '0 0 ' + topPercent + '%', minHeight: 0 }"
          >
          <Card
            class="kb-panel kb-preview kb-panel-fill"
            :style="{
              background: themeState.currentTheme.background2nd,
              position: 'relative'
            }"
          >
            <CardContent class="kb-card-content">
              <div class="kb-panel-header">
                <h2 class="kb-panel-title">{{ t('knowledgeBase.preview') }}</h2>
                <div v-if="selectedItem" class="kb-panel-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="!selectedItem"
                    @click="openInEditor"
                  >
                    {{ t('knowledgeBase.open_in_editor') }}
                  </Button>
                </div>
              </div>

              <Skeleton
                :loading="!!(selectedItem && !previewLoaded)"
                :rows="12"
                animated
                class="kb-preview-skeleton"
              >
                <div class="preview-container" v-if="previewText">
                  <div
                    :id="previewEditorId"
                    class="monaco-editor-container"
                    :key="previewEditorId"
                  ></div>
                </div>
                <div v-else class="placeholder">{{ t('knowledgeBase.select_placeholder') }}</div>
              </Skeleton>
            </CardContent>
          </Card>
          </div>
          <div
            class="kb-resize-bar kb-resize-h"
            role="separator"
            aria-label="调整上下高度"
            @mousedown.prevent.stop="onResizeBarMouseDown('h', $event)"
          />
          <!-- 下: config -->
          <Card
            class="kb-panel kb-config"
            :style="{ background: themeState.currentTheme.background2nd }"
          >
            <CardContent class="kb-card-content">
              <div class="kb-panel-header">
                <h2 class="kb-panel-title">{{ t('knowledgeBase.config') }}</h2>
              </div>

              <el-scrollbar class="config-scroll">
                <Skeleton
                  :loading="!!(selectedItem && configInfoLoading)"
                  :rows="8"
                  animated
                  class="kb-config-skeleton"
                >
                <div v-if="selectedItem" class="config-content">
                  <div class="config-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      @click="rebuildVectors"
                      :loading="isRebuilding"
                    >
                      {{ t('knowledgeBase.rebuild') }}
                    </Button>
                    <Button variant="secondary" size="sm" @click="downloadFile">
                      {{ t('knowledgeBase.download') }}
                    </Button>
                    <Button variant="secondary" size="sm" @click="openFolder">
                      {{ t('knowledgeBase.open_folder') }}
                    </Button>
                  </div>
                  <Descriptions
                    class="kb-config-descriptions"
                    :column="1"
                    size="small"
                    border
                    :style="{
                      background: themeState.currentTheme.background2nd,
                      '--descriptions-item-bordered-label-background': kbDescriptionsFieldBg,
                      '--descriptions-item-bordered-label-color':
                        themeState.currentTheme.SideTextColor,
                      '--descriptions-item-bordered-content-background': kbDescriptionsFieldBg,
                      '--descriptions-item-bordered-content-color':
                        themeState.currentTheme.textColor
                    }"
                  >
                    <DescriptionsItem :label="t('knowledgeBase.filename')">
                      <template v-if="isEditing">
                        <Input
                          v-model="editFilename"
                          class="edit-filename-input"
                          @keyup.enter="onConfirm"
                        />
                        <Button
                          size="sm"
                          @click="onConfirm"
                          class="aero-btn"
                          circle
                          :loading="renaming"
                        >
                          <el-icon v-if="!renaming" style="font-size: 14px">
                            <Check />
                          </el-icon>
                        </Button>
                        <Button
                          size="sm"
                          @click="onCancel"
                          :disabled="renaming"
                          class="aero-btn"
                          circle
                        >
                          <el-icon style="font-size: 14px">
                            <Close />
                          </el-icon>
                        </Button>
                      </template>
                      <template v-else>
                        <span class="text-ellipsis">{{ selectedItem.name }}</span>
                        <Button @click="startEditing" circle class="aero-btn" size="sm">
                          <el-icon style="font-size: 14px">
                            <Edit />
                          </el-icon>
                        </Button>
                      </template>
                    </DescriptionsItem>
                    <DescriptionsItem :label="t('knowledgeBase.path')">
                      <span class="config-value">{{ truncateEnd(info.path, 50) }}</span>
                    </DescriptionsItem>

                    <DescriptionsItem :label="t('knowledgeBase.chunks')">
                      <span class="config-value">{{ truncateEnd(info.chunks, 50) }}</span>
                    </DescriptionsItem>

                    <DescriptionsItem :label="t('knowledgeBase.vector_dim')">
                      <span class="config-value">{{ truncateEnd(info.vector_dim, 50) }}</span>
                    </DescriptionsItem>

                    <DescriptionsItem :label="t('knowledgeBase.vector_count')">
                      <span class="config-value">{{ truncateEnd(info.vector_count, 50) }}</span>
                    </DescriptionsItem>

                    <DescriptionsItem :label="t('knowledgeBase.size')">
                      <span class="config-value">{{ truncateEnd(info.sizeText || '-', 50) }}</span>
                    </DescriptionsItem>

                    <DescriptionsItem :label="t('knowledgeBase.enabled_state')">
                      <Switch
                        v-if="selectedItem && selectedItem.info"
                        :checked="selectedItem.info.enabled"
                        @update:checked="
                          (val: boolean) => selectedItem && toggleEnable(selectedItem, val)
                        "
                      />
                    </DescriptionsItem>
                  </Descriptions>
                </div>
                <div v-else class="placeholder">{{ t('knowledgeBase.choose_one') }}</div>
                </Skeleton>
              </el-scrollbar>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  onActivated,
  watch,
  nextTick
} from 'vue'
import { messageBox } from '@renderer/utils/messageBox'
import { useI18n } from 'vue-i18n'

// Demo mode support
const props = defineProps({
  mode: {
    type: String,
    default: 'normal'
  }
})
const isDemo = computed(() => props.mode === 'demo')
import eventBus, { getWindowType } from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { Check, Close, Edit, Lock } from '@element-plus/icons-vue'
import { queryKnowledgeBase } from '../utils/rag_utils'
import { Card, CardContent } from '../components/ui/card'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Slider } from '@renderer/components/ui/slider'
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput
} from '@renderer/components/ui/number-field'
import { Switch } from '@renderer/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Descriptions, DescriptionsItem } from '@renderer/components/ui/descriptions'
import { FormItem } from '@renderer/components/ui/form'
import { getRuntimeServerBaseUrl } from '../config/runtime-server'
import { setSetting, settings } from '../utils/settings'
import { waitForService } from '../utils/service-status.ts'
import { createRendererLogger } from '../utils/logger.ts'
import messageBridge from '../bridge/message-bridge'
import { useNotificationStore } from '../stores/notification'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import * as monaco from 'monaco-editor'

const { t } = useI18n()
const notificationStore = useNotificationStore()
const logger = createRendererLogger('KnowledgeBase', {
  windowTypeProvider: () => getWindowType()
})

interface KnowledgeBaseItem {
  id: string
  name: string
  enabled?: boolean
  info?: {
    enabled?: boolean
    sizeText?: string
    chunks?: number | string
    path?: string
    vector_dim?: number | string
    vector_count?: number | string
    size?: number
  }
}

const previewLoaded = ref<boolean>(true)
const configInfoLoading = ref<boolean>(false)
const items = ref<KnowledgeBaseItem[]>([])
const selectedId = ref<string | null>(null)
const selectedItem = computed(() => items.value.find((i) => i.id === selectedId.value) || null)
const previewText = ref<string>('')
const isTruncated = ref<boolean>(false)
const info = reactive<Record<string, any>>({})
const isUploading = ref<boolean>(false)
const uploadQueue = ref<File[]>([])
const uploadProcessorRunning = ref(false)
const isRebuilding = ref<boolean>(false)
const fileInput = ref<HTMLInputElement | null>(null)
const baseUrl = ref('')
const knowledgeBaseEnabled = ref<boolean>(settings.enableKnowledgeBase ?? true)
const isAiEnabled = computed(() => settings.llmEnabled === true)
// Monaco Editor相关
const previewEditorId = `kb-preview-editor-${Date.now()}`

// 四宫格：左右宽度 + 统一的“上方面板高度”（左右共用，保证两个底下面板底边始终对齐）
const kbContainerRef = ref<HTMLElement | null>(null)
const leftWidthPercent = ref(50)
const topPercent = ref(50) // 左右两列上方面板共用此比例，底边必对齐
const resizeMode = ref<'v' | 'h' | null>(null)

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function onResizeBarMouseDown(mode: 'v' | 'h', e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  resizeMode.value = mode
  document.body.style.userSelect = 'none'
  document.body.style.cursor = mode === 'v' ? 'col-resize' : 'row-resize'
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
}

function onResizeMove(e: MouseEvent) {
  const mode = resizeMode.value
  if (!mode || !kbContainerRef.value) return
  const cr = kbContainerRef.value.getBoundingClientRect()
  if (mode === 'v') {
    const p = ((e.clientX - cr.left) / cr.width) * 100
    leftWidthPercent.value = clamp(p, 25, 75)
    return
  }
  // 水平条：用容器整体高度算比例，左右共用 topPercent，保证底边对齐
  if (mode === 'h') {
    const p = ((e.clientY - cr.top) / cr.height) * 100
    topPercent.value = clamp(p, 20, 80)
  }
}

function onResizeUp() {
  resizeMode.value = null
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
}

const ensureExpressReady = async (): Promise<void> => {
  await waitForService('express')
}

const searchQuery = ref<string>('')
const searchResults = ref<string[]>([])
const searching = ref<boolean>(false)

/** 与手册大纲列一致：主题内 75% 灰 + 25% 主题色（manualOutlineColumnBackground） */
const kbDescriptionsFieldBg = computed(() => {
  const t = themeState.currentTheme as {
    manualOutlineColumnBackground?: string
    sidebarPanelBackground?: string
    background2nd?: string
    background?: string
  }
  return (
    t.manualOutlineColumnBackground ||
    t.sidebarPanelBackground ||
    t.background2nd ||
    t.background ||
    '#ebebeb'
  )
})

const kbSearchResultsEmpty = computed(
  () => searchResults.value.length === 0 && !searching.value
)
const truncateEnd = (value: any, maxLength: number = 50): string => {
  if (!value) return '-'
  const str = String(value)
  return str.length > maxLength ? '...' + str.slice(-maxLength) : str
}

// helper: format size
function humanSize(bytes: number | undefined): string {
  if (!bytes && bytes !== 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let u = 0
  let n = bytes
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  return `${n.toFixed(1)} ${units[u]}`
}

// fetch list from backend
async function fetchList(): Promise<void> {
  try {
    await ensureExpressReady()
    logger.info(t('knowledgeBase.fetchListStarted') || '开始获取知识库列表')
    const r = await fetch(`${baseUrl.value}/list`)

    const j = (await r.json()) as { items?: KnowledgeBaseItem[] }
    logger.debug(t('knowledgeBase.fetchListResponse') || '知识库列表响应', j)
    items.value = (j.items || []).map((it) => ({ ...it, info: it.info || {} }))
  } catch (e) {
    logger.error(e)
  }
}

// 这里调用你的检索接口，示例是异步请求
async function doSearch(): Promise<void> {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }
  searching.value = true
  try {
    await queryKnowledgeBase(searchQuery.value).then((res) => {
      searchResults.value = res
      const failLabel = t('knowledgeBase.searchFailed') || '检索失败'
      const hasHit =
        Array.isArray(res) &&
        res.some((line) => {
          const s = typeof line === 'string' ? line.trim() : ''
          return s.length > 0 && !s.startsWith(failLabel)
        })
      if (hasHit) {
        void import('../services/steam-client').then((m) =>
          m.tryUnlockSteamAchievementByApi('ACH_KB_QUERY_HIT')
        )
      }
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    searchResults.value = [(t('knowledgeBase.searchFailed') || '检索失败') + ': ' + errorMessage]
  } finally {
    searching.value = false
  }
}

// select row（仅右上、右下 panel 用 skeleton 加载，无全局 loading）
function selectRow(row: KnowledgeBaseItem): void {
  if (row.id === selectedId.value) return
  selectedId.value = row.id
  configInfoLoading.value = true
  fetchInfo(row.id)
  fetchPreview(row.id)
}

function onSelect(row: KnowledgeBaseItem | null): void {
  if (row) selectRow(row)
}

// upload flow
function triggerUpload(): void {
  fileInput.value && fileInput.value.click()
}

async function onFileSelected(e: Event): Promise<void> {
  const target = e.target as HTMLInputElement
  const list = target.files ? Array.from(target.files) : []
  target.value = ''
  if (list.length === 0) return
  uploadQueue.value.push(...list)
  isUploading.value = true
  void processUploadQueue()
}

async function processUploadQueue(): Promise<void> {
  if (uploadProcessorRunning.value) return
  uploadProcessorRunning.value = true
  try {
    while (uploadQueue.value.length > 0) {
      const file = uploadQueue.value.shift()!
      await uploadSingleFileWithTask(file)
    }
  } finally {
    uploadProcessorRunning.value = false
    if (uploadQueue.value.length > 0) {
      void processUploadQueue()
    } else {
      isUploading.value = false
    }
  }
}

async function uploadSingleFileWithTask(file: File): Promise<void> {
  const requestId = `knowledge-upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const taskTitle = t('knowledgeBase.embeddingTaskTitle', '知识库向量化')
  const phaseRunning = t('knowledgeBase.embeddingRunning', '向量化处理中…')
  const phaseDone = t('knowledgeBase.embeddingDone', '已完成')
  const phaseFail = t('knowledgeBase.embeddingFailed', '失败')

  const notifId = notificationStore.notify({
    title: taskTitle,
    message: `${file.name} — ${phaseRunning}`,
    type: 'info',
    showToast: false,
    duration: 86400000,
    metadata: {
      kind: 'knowledge-task',
      requestId,
      fileLabel: file.name,
      phase: 'running',
      canCancel: true
    }
  })
  eventBus.emit('show-notification-stack-task')

  const fd = new FormData()
  fd.append('file', file)
  try {
    await ensureExpressReady()
    const r = await fetch(`${baseUrl.value}/upload`, {
      method: 'POST',
      headers: { 'X-Knowledge-Request-Id': requestId },
      body: fd
    })

    const contentType = r.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await r.text()
      logger.error(t('knowledgeBase.nonJsonResponse') || '服务器返回非JSON响应', {
        status: r.status,
        contentType,
        text: text.substring(0, 200)
      })
      notificationStore.updateNotification(notifId, {
        type: 'error',
        message: `${file.name} — ${phaseFail}: ${t('knowledgeBase.nonJsonResponseMessage') || '非 JSON 响应'}`,
        metadata: { phase: 'error', canCancel: false }
      })
      return
    }

    const j = await r.json()
    if (j.success) {
      notificationStore.updateNotification(notifId, {
        type: 'success',
        message: `${file.name} — ${phaseDone}`,
        metadata: { phase: 'done', canCancel: false }
      })
      setTimeout(() => notificationStore.remove(notifId), 6000)
      await fetchList()
      void import('../services/steam-client').then((m) =>
        m.tryUnlockSteamAchievementByApi('ACH_KB_UPLOAD_FIRST')
      )
    } else {
      const msg = j.message || j.error || t('knowledgeBase.unknownError') || '未知错误'
      notificationStore.updateNotification(notifId, {
        type: 'error',
        message: `${file.name} — ${phaseFail}: ${msg}`,
        metadata: { phase: 'error', canCancel: false }
      })
    }
  } catch (e) {
    logger.error(e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    if (errorMessage.includes('JSON') || errorMessage.includes('<!DOCTYPE')) {
      notificationStore.updateNotification(notifId, {
        type: 'error',
        message: `${file.name} — ${phaseFail}: ${t('knowledgeBase.invalidResponseFormat') || '响应格式错误'}`,
        metadata: { phase: 'error', canCancel: false }
      })
    } else if (errorMessage.includes('取消') || errorMessage.includes('aborted')) {
      notificationStore.remove(notifId)
    } else {
      notificationStore.updateNotification(notifId, {
        type: 'error',
        message: `${file.name} — ${phaseFail}: ${errorMessage}`,
        metadata: { phase: 'error', canCancel: false }
      })
    }
  }
}

// delete
function confirmDelete(): void {
  if (!selectedItem.value) return
  messageBox.confirm(
    t('knowledgeBase.delete_confirm', { name: selectedItem.value.name }),
    t('knowledgeBase.delete_confirm_title'),
    {
      confirmButtonText: t('knowledgeBase.delete'),
      cancelButtonText: t('knowledgeBase.cancel'),
      type: 'warning'
    }
  ).then(() => deleteItem(selectedItem.value!.id))
}
function confirmClearAll(): void {
  messageBox.confirm(
    t('knowledgeBase.clear_all_confirm'),
    t('knowledgeBase.clear_all_confirm_title'),
    {
      confirmButtonText: t('knowledgeBase.clear_all'),
      cancelButtonText: t('knowledgeBase.cancel'),
      type: 'warning'
    }
  ).then(() => clearAllItems())
}

async function clearAllItems(): Promise<void> {
  try {
    await ensureExpressReady()
    const r = await fetch(`${baseUrl.value}/clear`, { method: 'POST' })
    const j = await r.json()
    if (j.success) {
      eventBus.emit('show-success', t('knowledgeBase.clear_all_success'))
      selectedId.value = null
      items.value = []
      previewText.value = ''
      Object.keys(info).forEach((k) => delete info[k])
    } else {
      eventBus.emit('show-error', t('knowledgeBase.clear_all_failed') + j.message)
    }
  } catch (e) {
    logger.error(e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    eventBus.emit('show-error', t('knowledgeBase.clear_all_error') + errorMessage)
  }
}

async function deleteItem(id: string): Promise<void> {
  try {
    await ensureExpressReady()
    // 对文件名进行URL编码，处理特殊字符
    const encodedId = encodeURIComponent(id)
    const r = await fetch(`${baseUrl.value}/${encodedId}`, { method: 'DELETE' })
    const j = await r.json()
    if (j.success) {
      eventBus.emit('show-success', t('knowledgeBase.deleted'))
      if (selectedId.value === id) selectedId.value = null
      await fetchList()
      previewText.value = ''
      Object.keys(info).forEach((k) => delete info[k])
    } else {
      eventBus.emit('show-error', j.message || t('knowledgeBase.delete_failed'))
    }
  } catch (e) {
    logger.error(e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    eventBus.emit('show-error', t('knowledgeBase.delete_error') + errorMessage)
  }
}

// 获取Monaco编辑器实例
const getPreviewEditor = (): monaco.editor.IStandaloneCodeEditor | null => {
  const editors = monaco.editor.getEditors() || []
  const found = editors.find((e) => {
    try {
      const editor = e as monaco.editor.IStandaloneCodeEditor
      const container = editor.getContainerDomNode()
      return container && container.id === previewEditorId
    } catch {
      return false
    }
  })
  return found as monaco.editor.IStandaloneCodeEditor | null
}

// 初始化Monaco编辑器
const initMonacoEditor = async (): Promise<void> => {
  await nextTick()

  const container = document.getElementById(previewEditorId)
  if (!container) {
    logger.warn(t('knowledgeBase.previewEditorContainerNotFound') || '预览编辑器容器未找到')
    return
  }

  // 检查是否已存在编辑器
  const existingEditor = getPreviewEditor()
  if (existingEditor) {
    existingEditor.dispose()
  }

  // 确保Monaco Worker已配置
  setupMonacoWorker()

  try {
    const isDark = themeState.currentTheme.type === 'dark'
    const editor = monaco.editor.create(container, {
      value: previewText.value || '',
      language: 'plaintext',
      theme: isDark ? 'vs-dark' : 'vs',
      readOnly: true,
      automaticLayout: true,
      fontSize: 13,
      wordWrap: 'on',
      lineNumbers: 'on',
      minimap: { enabled: false },
      contextmenu: false,
      scrollBeyondLastLine: false,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      renderLineHighlight: 'all',
      lineDecorationsWidth: 10
    })

    // 监听主题变化
    watch(
      () => themeState.currentTheme.type,
      (newType) => {
        const editor = getPreviewEditor()
        if (editor) {
          monaco.editor.setTheme(newType === 'dark' ? 'vs-dark' : 'vs')
        }
      }
    )
  } catch (e) {
    logger.error(t('knowledgeBase.createMonacoEditorFailed') || '创建Monaco编辑器失败', e)
  }
}

// 更新编辑器内容
const updateEditorContent = (): void => {
  const editor = getPreviewEditor()
  if (editor) {
    const currentValue = editor.getValue()
    if (currentValue !== previewText.value) {
      editor.setValue(previewText.value || '')
    }
  }
}

// fetch preview
async function fetchPreview(id: string): Promise<void> {
  previewLoaded.value = false
  previewText.value = ''
  isTruncated.value = false
  try {
    await ensureExpressReady()
    const encodedId = encodeURIComponent(id)
    const r = await fetch(`${baseUrl.value}/${encodedId}/preview`)
    const j = await r.json()
    previewText.value = j.preview || ''
    isTruncated.value = !!j.truncated

    // 先让 Skeleton 隐藏、插槽渲染出预览容器，再初始化 Monaco（否则 getElementById 取不到）
    previewLoaded.value = true
    if (previewText.value) {
      await nextTick()
      await initMonacoEditor()
      updateEditorContent()
    }
  } catch (e) {
    logger.error(e)
    previewLoaded.value = true
  }
}

// fetch info
async function fetchInfo(id: string): Promise<void> {
  try {
    await ensureExpressReady()
    // 对文件名进行URL编码，处理特殊字符（如 #、空格等）
    const encodedId = encodeURIComponent(id)
    const r = await fetch(`${baseUrl.value}/${encodedId}/info`)

    const j = await r.json()
    if (j.success) {
      delete j['success']
      logger.debug(t('knowledgeBase.kbDetails') || '知识库详情', j)
      // also attach to items list if present
      const it = items.value.find((x) => x.id === id)
      if (it) {
        // 更新列表中的info
        it.info = { ...it.info, ...j }
      }
      // 更新配置面板的info对象（使用Object.assign确保响应式更新）
      Object.keys(info).forEach((key) => delete info[key])
      Object.assign(info, j)
      logger.debug(t('knowledgeBase.updatedInfoObject') || '更新后的info对象', info)
    } else {
      logger.warn(t('knowledgeBase.fetchKbDetailsFailed') || '获取知识库详情失败', j)
    }
  } catch (e) {
    logger.error(t('knowledgeBase.fetchKbDetailsError') || '获取知识库详情异常', e)
  } finally {
    configInfoLoading.value = false
  }
}

// toggle enable
async function toggleEnable(row: KnowledgeBaseItem, val: boolean): Promise<void> {
  try {
    await ensureExpressReady()
    // 对文件名进行URL编码，处理特殊字符（如 #、空格等）
    const encodedId = encodeURIComponent(row.id)
    const r = await fetch(`${baseUrl.value}/${encodedId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !!val })
    })
    const j = (await r.json()) as { success: boolean; enabled?: boolean; message?: string }
    if (j.success) {
      if (!row.info) {
        row.info = {}
      }
      row.info.enabled = !!j.enabled
      // reflect to items list
      const it = items.value.find((x) => x.id === row.id)
      if (it) {
        if (!it.info) {
          it.info = {}
        }
        it.info.enabled = row.info.enabled
      }
    } else {
      eventBus.emit('show-error', j.message || t('knowledgeBase.set_failed'))
      if (row.info) {
        row.info.enabled = !val // rollback
      }
    }
  } catch (e) {
    logger.error(e)
    eventBus.emit('show-error', t('knowledgeBase.set_error'))
    if (row.info) {
      row.info.enabled = !val // rollback
    }
  }
}

// rebuild vectors
async function rebuildVectors(): Promise<void> {
  if (!selectedItem.value) return
  const row = selectedItem.value
  const requestId = `knowledge-rebuild-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const taskTitle = t('knowledgeBase.rebuildTaskTitle', '知识库重建向量')
  const phaseRunning = t('knowledgeBase.rebuildRunning', '重建中…')
  const phaseDone = t('knowledgeBase.rebuildDone', '重建完成')
  const phaseFail = t('knowledgeBase.rebuildFailed', '重建失败')

  const notifId = notificationStore.notify({
    title: taskTitle,
    message: `${row.name} — ${phaseRunning}`,
    type: 'info',
    showToast: false,
    duration: 86400000,
    metadata: {
      kind: 'knowledge-task',
      requestId,
      fileLabel: row.name,
      phase: 'running',
      canCancel: true
    }
  })
  eventBus.emit('show-notification-stack-task')

  isRebuilding.value = true
  try {
    await ensureExpressReady()
    const encodedId = encodeURIComponent(row.id)
    const r = await fetch(`${baseUrl.value}/${encodedId}/rebuild`, {
      method: 'POST',
      headers: { 'X-Knowledge-Request-Id': requestId }
    })
    const j = await r.json()
    if (j.success) {
      notificationStore.updateNotification(notifId, {
        type: 'success',
        message: `${row.name} — ${phaseDone}`,
        metadata: { phase: 'done', canCancel: false }
      })
      setTimeout(() => notificationStore.remove(notifId), 6000)
      await fetchInfo(row.id)
    } else {
      notificationStore.updateNotification(notifId, {
        type: 'error',
        message: `${row.name} — ${phaseFail}: ${j.message || ''}`,
        metadata: { phase: 'error', canCancel: false }
      })
    }
  } catch (e) {
    logger.error(e)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('取消') || msg.includes('aborted')) {
      notificationStore.remove(notifId)
    } else {
      notificationStore.updateNotification(notifId, {
        type: 'error',
        message: `${row.name} — ${phaseFail}: ${msg}`,
        metadata: { phase: 'error', canCancel: false }
      })
    }
  } finally {
    isRebuilding.value = false
  }
}

// download
function downloadFile(): void {
  if (!selectedItem.value) return
  // 对文件名进行URL编码，处理特殊字符
  const encodedId = encodeURIComponent(selectedItem.value.id)
  window.open(`${baseUrl.value}/${encodedId}/download`, '_blank')
}

// 打开文件夹
async function openFolder(): Promise<void> {
  if (!selectedItem.value || !info.path) {
    eventBus.emit('show-error', t('knowledgeBase.open_folder_error'))
    return
  }
  try {
    if (!messageBridge.getIpc()) {
      eventBus.emit(
        'show-error',
        t('knowledgeBase.ipcNotInitialized') ||
          'IPC Renderer 未初始化，此功能仅在 Electron 环境中可用'
      )
      return
    }

    const dirPath = await messageBridge.invoke('get-directory-path', info.path)

    if (dirPath) {
      messageBridge.send('shell-open', dirPath)
    } else {
      eventBus.emit('show-error', t('knowledgeBase.open_folder_error'))
    }
  } catch (e) {
    logger.error(t('knowledgeBase.openFolderFailedLog') || '打开文件夹失败', e)
    eventBus.emit('show-error', t('knowledgeBase.open_folder_error'))
  }
}

function openInEditor(): void {
  if (!selectedItem.value) return
  const filePath = info.path
  eventBus.emit('shell-open', filePath)
}

const isEditing = ref<boolean>(false)
const editFilename = ref<string>('')
const renaming = ref<boolean>(false)

function startEditing(): void {
  if (!selectedItem.value) return
  editFilename.value = selectedItem.value.name
  isEditing.value = true
}

function onCancel(): void {
  editFilename.value = ''
  isEditing.value = false
}

async function onConfirm(): Promise<void> {
  if (!selectedItem.value) return
  if (!editFilename.value.trim()) {
    eventBus.emit('show-error', t('knowledgeBase.filenameRequired') || '文件名不能为空')
    return
  }
  if (editFilename.value === selectedItem.value.name) {
    // 文件名没改，直接退出编辑状态
    isEditing.value = false
    return
  }
  renaming.value = true
  try {
    await ensureExpressReady()
    // 这里调用你的重命名接口，传入旧名和新名
    // 假设接口是 /api/knowledge/rename，POST请求
    const res = await fetch(`${baseUrl.value}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldName: selectedItem.value.name,
        newName: editFilename.value.trim()
      })
    })
    const data = (await res.json()) as { success: boolean; message?: string }
    if (data.success) {
      eventBus.emit('show-success', t('knowledgeBase.renameSuccess') || '重命名成功')
      isEditing.value = false
      await fetchList()
    } else {
      eventBus.emit('show-error', data.message || t('knowledgeBase.renameFailed') || '重命名失败')
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    eventBus.emit(
      'show-error',
      (t('knowledgeBase.requestFailed') || '请求失败') + ': ' + errorMessage
    )
  } finally {
    renaming.value = false
  }
}

// 监听previewText变化，更新编辑器
watch(previewText, () => {
  updateEditorContent()
})

// 启用知识库
const enableKnowledgeBase = async () => {
  try {
    await setSetting('enableKnowledgeBase', true)
    knowledgeBaseEnabled.value = true
    eventBus.emit('knowledge-base-toggle', { enabled: true })
    eventBus.emit('show-success', t('knowledgeBase.enabled') || '知识库已启用')
  } catch (error) {
    logger.error('启用知识库失败', error)
    eventBus.emit('show-error', t('knowledgeBase.enableError') || '启用知识库失败')
  }
}

// 监听知识库开关事件
const handleKnowledgeBaseToggle = (payload: unknown) => {
  const data = payload as { enabled?: boolean }
  if (typeof data?.enabled === 'boolean') {
    knowledgeBaseEnabled.value = data.enabled
    logger.info(t('knowledgeBase.kbStatusUpdated') || '知识库状态已更新', { enabled: data.enabled })
  }
}

onMounted(async () => {
  if (isDemo.value) {
    knowledgeBaseEnabled.value = true
    items.value = [
      {
        id: '1',
        name: '课堂笔记-示例.md',
        enabled: true,
        info: {
          sizeText: '12.5 KB',
          chunks: 24,
          enabled: true,
          vector_dim: 1536,
          vector_count: 24,
          path: '~/KnowledgeBase/demo/课堂笔记-示例.md'
        }
      },
      {
        id: '2',
        name: 'README.md',
        enabled: true,
        info: { sizeText: '8.2 KB', chunks: 12, enabled: true }
      }
    ]
    selectedId.value = '1'
    previewLoaded.value = true
    previewText.value =
      '# 课堂笔记（示例预览）\n\n' +
      '这是模拟的知识库正文片段，真实使用时会上传你自己的 PDF、Word、TXT 等文件。\n\n' +
      '## 重点\n\n- 定义与公式\n- 老师强调的例题\n'
    Object.keys(info).forEach((k) => delete info[k])
    Object.assign(info, {
      sizeText: '12.5 KB',
      chunks: 24,
      path: '~/KnowledgeBase/demo/课堂笔记-示例.md',
      vector_dim: 1536,
      vector_count: 24,
      enabled: true
    })
    await nextTick()
    await initMonacoEditor()
    updateEditorContent()
    return
  }
  // 初始化运行时服务器地址
  baseUrl.value = (await getRuntimeServerBaseUrl()) + '/api/knowledge'
  // 初始化知识库状态
  knowledgeBaseEnabled.value = settings.enableKnowledgeBase ?? true

  // 监听知识库开关事件
  eventBus.on('knowledge-base-toggle', handleKnowledgeBaseToggle)

  await fetchList()
})

// 当组件激活时（Tab 切换回来时），重新检查知识库状态
onActivated(() => {
  // 重新读取设置，确保状态同步
  knowledgeBaseEnabled.value = settings.enableKnowledgeBase ?? true
})

onBeforeUnmount(() => {
  // 清理事件监听器
  eventBus.off('knowledge-base-toggle', handleKnowledgeBaseToggle)

  // 清理Monaco编辑器
  const editor = getPreviewEditor()
  if (editor) {
    editor.dispose()
  }
})
</script>

<style scoped>
.kb-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.kb-scroll-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* shadcn Card styles */
:deep(.kb-panel) {
  border-radius: 12px;
  overflow: hidden;
}

.kb-card-content {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.kb-result-card-content {
  padding: 12px;
}

/* 两列同高，保证下方两个 panel 底边始终对齐 */
.kb-container {
  display: flex;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.kb-left {
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  padding: 10px 0 10px 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kb-right {
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 0;
  padding: 10px 10px 10px 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* resize 条默认隐形，hover 时显示细线，保留拖拽热区 */
.kb-resize-bar.kb-resize-v {
  width: 8px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  z-index: 2;
}
.kb-resize-bar.kb-resize-v:hover,
.kb-resize-bar.kb-resize-v:active {
  background: v-bind('themeState.currentTheme.borderColor');
  opacity: 0.6;
}

.kb-resize-bar.kb-resize-h {
  height: 8px;
  flex-shrink: 0;
  cursor: row-resize;
  background: transparent;
  transition: background 0.15s;
  z-index: 2;
}
.kb-resize-bar.kb-resize-h:hover,
.kb-resize-bar.kb-resize-h:active {
  background: v-bind('themeState.currentTheme.borderColor');
  opacity: 0.6;
}

.kb-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* 上方面板高度由 inline style 控制，下方面板 flex:1 填满剩余，保证底边对齐 */
/* 左列上：固定比例，由 inline flex 控制；下：flex:1 填满，与右列底边对齐 */
.kb-list-wrapper {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kb-search-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 与右下配置信息一致：Card 填满 wrapper，CardContent 弹性布局，滚动区 flex:1 */
.kb-search-wrapper .kb-card-content.kb-search-card-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.kb-search-query-input {
  margin-top: 4px;
  width: 100%;
}

.kb-search-controls-row {
  display: grid;
  grid-template-columns: 4fr 1fr;
  gap: 12px;
  margin-top: 12px;
  align-items: center;
}

.kb-search-threshold-col {
  min-width: 0;
}

.kb-search-slider-row {
  margin-bottom: 4px;
}

.kb-search-action-col {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.kb-search-submit-btn {
  width: 100%;
  min-width: 0;
}

.kb-search-results-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}

.kb-search-results-area--empty {
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 8px;
  box-sizing: border-box;
  padding: 10px 12px;
  min-height: 120px;
}

.kb-search-empty-placeholder {
  padding: 8px 4px;
}

.kb-search-scroll {
  flex: 1;
  min-height: 0;
}

/* 上方面板用 wrapper 定高，内部 Card 填满，避免组件覆盖 flex */
.kb-preview-wrapper {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kb-panel-fill {
  height: 100%;
  min-height: 0;
}

.kb-preview {
  display: flex;
  flex-direction: column;
}

.kb-config {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kb-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.kb-panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.kb-panel-actions {
  display: flex;
  gap: 8px;
}

.kb-list-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.kb-result-card {
  border-radius: 8px;
  margin-bottom: 6px;
}

.result-text {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: v-bind('themeState.currentTheme.textColor');
}

.preview-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}

.kb-config .kb-card-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.config-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.kb-preview-skeleton,
.kb-config-skeleton {
  padding: 8px 0;
  flex: 1;
  min-height: 0;
}
.kb-preview-skeleton :deep(> div),
.kb-config-skeleton :deep(> div) {
  gap: 10px;
}

.config-content {
  padding: 8px;
}

.config-value {
  color: v-bind('themeState.currentTheme.textColor2');
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
}

.config-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.placeholder {
  text-align: center;
  color: v-bind('themeState.currentTheme.textColor2');
  padding: 20px;
  font-size: 14px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.on {
  background-color: #67c23a;
}

.status-dot.off {
  background-color: #909399;
}

.item-name {
  color: v-bind('themeState.currentTheme.textColor');
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
  display: inline-block;
}

.edit-filename-input {
  width: 200px;
  margin-right: 8px;
}

.aero-btn {
  margin-left: 4px;
}

/* shadcn-vue Table styles */
.kb-table {
  font-size: 13px;
}

.kb-table-header-row {
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.kb-table-row {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.kb-table-row:nth-child(even) {
  background-color: v-bind('themeState.currentTheme.background');
}

.kb-table-row[data-selected='true'] {
  background-color: v-bind('themeState.currentTheme.SideBackgroundColor') !important;
}

.kb-table-row:hover {
  background-color: v-bind('themeState.currentTheme.SideBackgroundColor');
}

/* 配置区描述列表：行间分割线、混色底、更宽松的 cell 内边距 */
.config-content :deep(.kb-config-descriptions.descriptions) {
  border-radius: 8px;
  overflow: hidden;
}

.config-content :deep(.kb-config-descriptions .descriptions__table) {
  border-collapse: separate;
  border-spacing: 0;
}

.config-content :deep(.kb-config-descriptions .descriptions__table td) {
  border-color: v-bind('themeState.currentTheme.borderColor') !important;
}

/* 行与行之间的横向分割线（覆盖 descriptions 内对非首行去顶边的规则） */
.config-content
  :deep(
    .kb-config-descriptions.descriptions--border
      .descriptions__row:not(:first-child)
      .descriptions__cell--label
  ),
.config-content
  :deep(
    .kb-config-descriptions.descriptions--border
      .descriptions__row:not(:first-child)
      .descriptions__cell--content
  ) {
  border-top: 1px solid v-bind('themeState.currentTheme.borderColor') !important;
}

.config-content :deep(.kb-config-descriptions .descriptions__cell--label) {
  font-weight: 500;
  background-color: v-bind('kbDescriptionsFieldBg') !important;
  color: v-bind('themeState.currentTheme.SideTextColor') !important;
}

.config-content :deep(.kb-config-descriptions .descriptions__cell--content) {
  background-color: v-bind('kbDescriptionsFieldBg') !important;
  color: v-bind('themeState.currentTheme.textColor') !important;
}

.config-content
  :deep(
    .kb-config-descriptions.descriptions--small.descriptions--border .descriptions__cell--label
  ),
.config-content
  :deep(
    .kb-config-descriptions.descriptions--small.descriptions--border .descriptions__cell--content
  ) {
  padding: 12px 16px !important;
}

/* 知识库禁用状态样式 */
.kb-disabled-overlay {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: v-bind('themeState.currentTheme.background');
}

.kb-disabled-content {
  text-align: center;
  padding: 40px;
  max-width: 500px;
}

.kb-disabled-icon {
  color: v-bind('themeState.currentTheme.textColor2');
  margin-bottom: 24px;
  opacity: 0.6;
}

.kb-disabled-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: v-bind('themeState.currentTheme.textColor');
}

.kb-disabled-message {
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 32px 0;
  color: v-bind('themeState.currentTheme.textColor2');
  opacity: 0.8;
}
</style>
