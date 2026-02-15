<template>
  <div class="kb-root">
    <!-- 知识库已禁用时的提示界面 -->
    <div v-if="!knowledgeBaseEnabled" class="kb-disabled-overlay">
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
        <el-button type="primary" @click="enableKnowledgeBase">
          {{ t('knowledgeBase.enable') || '启用知识库' }}
        </el-button>
      </div>
    </div>

    <!-- 知识库正常界面 -->
    <div v-else class="kb-scroll-wrapper">
      <div class="kb-container">
        <!-- Left: list -->
        <div class="kb-left" :style="{ background: themeState.currentTheme.background }">
          <!-- 上半部分: 知识库列表，占50%高度 -->
          <div class="kb-list-wrapper">
            <el-card
              class="kb-panel"
              shadow="hover"
              v-loading="isUploading"
              :style="{ background: themeState.currentTheme.background2nd, height: '100%' }"
            >
              <div class="kb-panel-header">
                <h2 class="kb-panel-title">{{ t('knowledgeBase.title') }}</h2>
                <div class="kb-panel-actions">
                  <el-button type="primary" size="small" @click="triggerUpload">{{
                    t('knowledgeBase.add')
                  }}</el-button>
                  <el-button
                    type="danger"
                    size="small"
                    :disabled="!selectedItem"
                    @click="confirmDelete"
                    >{{ t('knowledgeBase.delete') }}</el-button
                  >
                  <el-button size="small" @click="confirmClearAll">{{
                    t('knowledgeBase.clear_all')
                  }}</el-button>
                  <input
                    ref="fileInput"
                    type="file"
                    style="display: none"
                    @change="onFileSelected"
                    accept=".txt,.md,.pdf,.docx"
                  />
                </div>
              </div>
              <el-scrollbar class="kb-list-scroll">
                <el-table
                  :data="items"
                  stripe
                  row-key="id"
                  :highlight-current-row="true"
                  @current-change="onSelect"
                  :current-row-key="selectedId"
                  style="width: 100%"
                  size="small"
                >
                  <el-table-column prop="name" :label="t('knowledgeBase.name')" min-width="200">
                    <template #default="{ row }">
                      <div class="list-item" @click="selectRow(row)">
                        <span class="status-dot" :class="row.enabled ? 'on' : 'off'"></span>
                        <span class="item-name">{{ row.name }}</span>
                      </div>
                    </template>
                  </el-table-column>

                  <el-table-column :label="t('knowledgeBase.size_chunks')" width="140">
                    <template #default="{ row }">
                      <div>
                        <div v-if="row.info">
                          {{ row.info.sizeText || '-' }} / {{ row.info.chunks || '-' }}
                          {{ t('knowledgeBase.chunks_unit') }}
                        </div>
                        <div v-else>-</div>
                      </div>
                    </template>
                  </el-table-column>

                  <el-table-column :label="t('knowledgeBase.enabled')" width="90">
                    <template #default="{ row }">
                      <el-switch
                        v-model="row.info.enabled"
                        @change="(val: boolean) => toggleEnable(row, val)"
                      />
                    </template>
                  </el-table-column>
                </el-table>
              </el-scrollbar>
            </el-card>
          </div>

          <!-- 下半部分: 检索测试，占50%高度 -->
          <div class="kb-search-wrapper">
            <el-card
              class="kb-panel"
              shadow="hover"
              :style="{
                background: themeState.currentTheme.background2nd,
                height: '100%',
                display: 'flex',
                flexDirection: 'column'
              }"
            >
              <h3>{{ t('knowledgeBase.searchTest.title') }}</h3>
              <el-form-item :label="$t('setting.knowledgeBaseScoreThreshold')">
                <el-slider
                  v-model="settings.knowledgeBaseScoreThreshold"
                  show-input
                  :min="0.01"
                  :max="0.99"
                  :step="0.01"
                  @change="
                    setSetting('knowledgeBaseScoreThreshold', settings.knowledgeBaseScoreThreshold)
                  "
                  :marks="{
                    0.3: {
                      style: {
                        color: '#1989FA'
                      },
                      label: $t('setting.lowPrecision')
                    },
                    0.5: {
                      style: {
                        color: '#1989FA'
                      },
                      label: $t('setting.recommended')
                    },
                    0.8: {
                      style: {
                        color: '#1989FA'
                      },
                      label: $t('setting.highPrecision')
                    }
                  }"
                  style="margin-bottom: 5px"
                />
              </el-form-item>
              <el-input
                v-model="searchQuery"
                :placeholder="t('knowledgeBase.searchTest.placeholder')"
                size="small"
                clearable
                @keyup.enter.native="doSearch"
                style="margin-bottom: 10px"
              />
              <el-button type="primary" size="small" @click="doSearch" :loading="searching">{{
                t('knowledgeBase.searchTest.searchBtn')
              }}</el-button>

              <el-scrollbar style="flex-grow: 1; margin-top: 10px; min-height: 0">
                <el-card
                  class="kb-result-card"
                  shadow="hover"
                  v-for="(result, index) in searchResults"
                  :key="index"
                  :style="{
                    background: themeState.currentTheme.SideBackgroundColor,
                    marginBottom: '6px'
                  }"
                >
                  <pre class="result-text">{{ result }}</pre>
                </el-card>

                <div
                  v-if="searchResults.length === 0 && !searching"
                  style="color: #999"
                  class="placeholder"
                >
                  {{ t('knowledgeBase.searchTest.noResult') }}
                </div>
              </el-scrollbar>
            </el-card>
          </div>
        </div>

        <!-- 右边 -->
        <div class="kb-right" :style="{ background: themeState.currentTheme.background }">
          <!-- 上：preview -->
          <el-card
            class="kb-panel kb-preview"
            shadow="hover"
            v-loading="!previewLoaded"
            :style="{ background: themeState.currentTheme.background2nd }"
          >
            <div class="kb-panel-header">
              <h2 class="kb-panel-title">{{ t('knowledgeBase.preview') }}</h2>
              <div v-if="selectedItem" class="kb-panel-actions">
                <el-button size="small" :disabled="!selectedItem" @click="openInEditor">
                  {{ t('knowledgeBase.open_in_editor') }}
                </el-button>
              </div>
            </div>

            <div class="preview-container" v-if="previewText">
              <div
                :id="previewEditorId"
                class="monaco-editor-container"
                :key="previewEditorId"
              ></div>
            </div>
            <div v-else class="placeholder">{{ t('knowledgeBase.select_placeholder') }}</div>
          </el-card>

          <!-- 下：config -->
          <el-card
            class="kb-panel kb-config"
            shadow="hover"
            :style="{ background: themeState.currentTheme.background2nd }"
          >
            <div class="kb-panel-header">
              <h2 class="kb-panel-title">{{ t('knowledgeBase.config') }}</h2>
            </div>

            <el-scrollbar class="config-scroll">
              <div v-if="selectedItem" class="config-content">
                <el-descriptions
                  column="1"
                  size="small"
                  border
                  :style="{
                    background: themeState.currentTheme.background2nd,
                    '--el-descriptions-item-bordered-label-background':
                      themeState.currentTheme.SideBackgroundColor,
                    '--el-descriptions-item-bordered-label-color':
                      themeState.currentTheme.SideTextColor,
                    '--el-descriptions-item-bordered-content-background':
                      themeState.currentTheme.background2nd,
                    '--el-descriptions-item-bordered-content-color':
                      themeState.currentTheme.textColor
                  }"
                >
                  <el-descriptions-item :label="t('knowledgeBase.filename')">
                    <template v-if="isEditing">
                      <el-input
                        v-model="editFilename"
                        size="small"
                        class="edit-filename-input"
                        @keyup.enter.native="onConfirm"
                      />
                      <el-button
                        size="small"
                        @click="onConfirm"
                        class="aero-btn"
                        circle
                        :loading="renaming"
                      >
                        <el-icon v-if="!renaming" style="font-size: 14px">
                          <Check />
                        </el-icon>
                      </el-button>
                      <el-button
                        size="small"
                        @click="onCancel"
                        :disabled="renaming"
                        class="aero-btn"
                        circle
                      >
                        <el-icon style="font-size: 14px">
                          <Close />
                        </el-icon>
                      </el-button>
                    </template>
                    <template v-else>
                      <span class="text-ellipsis">{{ selectedItem.name }}</span>
                      <el-button
                        icon="el-icon-edit"
                        @click="startEditing"
                        circle
                        class="aero-btn"
                        size="small"
                      >
                        <el-icon style="font-size: 14px">
                          <Edit />
                        </el-icon>
                      </el-button>
                    </template>
                  </el-descriptions-item>
                  <el-descriptions-item :label="t('knowledgeBase.path')">
                    <span class="config-value">{{ truncateEnd(info.path, 50) }}</span>
                  </el-descriptions-item>

                  <el-descriptions-item :label="t('knowledgeBase.chunks')">
                    <span class="config-value">{{ truncateEnd(info.chunks, 50) }}</span>
                  </el-descriptions-item>

                  <el-descriptions-item :label="t('knowledgeBase.vector_dim')">
                    <span class="config-value">{{ truncateEnd(info.vector_dim, 50) }}</span>
                  </el-descriptions-item>

                  <el-descriptions-item :label="t('knowledgeBase.vector_count')">
                    <span class="config-value">{{ truncateEnd(info.vector_count, 50) }}</span>
                  </el-descriptions-item>

                  <el-descriptions-item :label="t('knowledgeBase.size')">
                    <span class="config-value">{{ truncateEnd(info.sizeText || '-', 50) }}</span>
                  </el-descriptions-item>

                  <el-descriptions-item :label="t('knowledgeBase.enabled_state')">
                    <el-switch
                      v-if="selectedItem && selectedItem.info"
                      v-model="selectedItem.info.enabled"
                      @change="(val: boolean) => selectedItem && toggleEnable(selectedItem, val)"
                    />
                  </el-descriptions-item>
                </el-descriptions>

                <div class="config-actions">
                  <el-button size="small" @click="rebuildVectors" :loading="isRebuilding">
                    {{ t('knowledgeBase.rebuild') }}
                  </el-button>
                  <el-button size="small" @click="downloadFile">
                    {{ t('knowledgeBase.download') }}
                  </el-button>
                  <el-button size="small" @click="openFolder">
                    {{ t('knowledgeBase.open_folder') }}
                  </el-button>
                </div>
              </div>
              <div v-else class="placeholder">{{ t('knowledgeBase.choose_one') }}</div>
            </el-scrollbar>
          </el-card>
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
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import eventBus, { getWindowType } from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { Check, Close, Edit, Lock } from '@element-plus/icons-vue'
import { queryKnowledgeBase } from '../utils/rag_utils'
import { setSetting, settings } from '../utils/settings'
import { waitForService } from '../utils/service-status.ts'
import { createRendererLogger } from '../utils/logger.ts'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import * as monaco from 'monaco-editor'

const { t } = useI18n()
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
const items = ref<KnowledgeBaseItem[]>([])
const selectedId = ref<string | null>(null)
const selectedItem = computed(() => items.value.find((i) => i.id === selectedId.value) || null)
const previewText = ref<string>('')
const isTruncated = ref<boolean>(false)
const info = reactive<Record<string, any>>({})
const isUploading = ref<boolean>(false)
const isRebuilding = ref<boolean>(false)
const fileInput = ref<HTMLInputElement | null>(null)
const baseUrl = 'http://localhost:52521/api/knowledge'
const knowledgeBaseEnabled = ref<boolean>(settings.enableKnowledgeBase ?? true)
// Monaco Editor相关
const previewEditorId = `kb-preview-editor-${Date.now()}`

const ensureExpressReady = async (): Promise<void> => {
  await waitForService('express')
}

const searchQuery = ref<string>('')
const searchResults = ref<string[]>([])
const searching = ref<boolean>(false)
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
    logger.info('开始获取知识库列表')
    const r = await fetch(`${baseUrl}/list`)

    const j = (await r.json()) as { items?: KnowledgeBaseItem[] }
    logger.debug('知识库列表响应', j)
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
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    searchResults.value = ['检索失败: ' + errorMessage]
  } finally {
    searching.value = false
  }
}

// select row
function selectRow(row: KnowledgeBaseItem): void {
  if (row.id === selectedId.value) return
  selectedId.value = row.id
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
  const f = target.files?.[0]
  if (!f) return
  await uploadFile(f)
  // reset input
  target.value = ''
}

async function uploadFile(file: File): Promise<void> {
  isUploading.value = true
  const fd = new FormData()
  fd.append('file', file)
  try {
    await ensureExpressReady()
    const r = await fetch(`${baseUrl}/upload`, { method: 'POST', body: fd })

    // 检查响应类型
    const contentType = r.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await r.text()
      logger.error('服务器返回非JSON响应', {
        status: r.status,
        contentType,
        text: text.substring(0, 200)
      })
      eventBus.emit(
        'show-error',
        t('knowledgeBase.upload_error') + '服务器返回了非JSON响应，请检查服务器日志'
      )
      return
    }

    const j = await r.json()
    if (j.success) {
      eventBus.emit('show-success', t('knowledgeBase.upload_complete'))
      await fetchList()
    } else {
      eventBus.emit(
        'show-error',
        t('knowledgeBase.upload_failed') + ': ' + (j.message || j.error || '未知错误')
      )
    }
  } catch (e) {
    logger.error(e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    // 检查是否是JSON解析错误
    if (errorMessage.includes('JSON') || errorMessage.includes('<!DOCTYPE')) {
      eventBus.emit(
        'show-error',
        t('knowledgeBase.upload_error') + '服务器响应格式错误，请检查服务器是否正常运行'
      )
    } else {
      eventBus.emit('show-error', t('knowledgeBase.upload_error') + errorMessage)
    }
  } finally {
    isUploading.value = false
  }
}

// delete
function confirmDelete(): void {
  if (!selectedItem.value) return
  ElMessageBox.confirm(
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
  ElMessageBox.confirm(
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
    const r = await fetch(`${baseUrl}/clear`, { method: 'POST' })
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
    const r = await fetch(`${baseUrl}/${encodedId}`, { method: 'DELETE' })
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
    logger.warn('预览编辑器容器未找到')
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
    logger.error('创建Monaco编辑器失败', e)
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
    // 对文件名进行URL编码，处理特殊字符（如 #、空格等）
    const encodedId = encodeURIComponent(id)
    const r = await fetch(`${baseUrl}/${encodedId}/preview`)
    const j = await r.json()
    previewText.value = j.preview || ''
    isTruncated.value = !!j.truncated

    // 初始化或更新编辑器
    if (previewText.value) {
      await initMonacoEditor()
      updateEditorContent()
    }
  } catch (e) {
    logger.error(e)
  } finally {
    previewLoaded.value = true
  }
}

// fetch info
async function fetchInfo(id: string): Promise<void> {
  try {
    await ensureExpressReady()
    // 对文件名进行URL编码，处理特殊字符（如 #、空格等）
    const encodedId = encodeURIComponent(id)
    const r = await fetch(`${baseUrl}/${encodedId}/info`)

    const j = await r.json()
    if (j.success) {
      delete j['success']
      logger.debug('知识库详情', j)
      // also attach to items list if present
      const it = items.value.find((x) => x.id === id)
      if (it) {
        // 更新列表中的info
        it.info = { ...it.info, ...j }
      }
      // 更新配置面板的info对象（使用Object.assign确保响应式更新）
      Object.keys(info).forEach((key) => delete info[key])
      Object.assign(info, j)
      logger.debug('更新后的info对象', info)
    } else {
      logger.warn('获取知识库详情失败', j)
    }
  } catch (e) {
    logger.error('获取知识库详情异常', e)
  }
}

// toggle enable
async function toggleEnable(row: KnowledgeBaseItem, val: boolean): Promise<void> {
  try {
    await ensureExpressReady()
    // 对文件名进行URL编码，处理特殊字符（如 #、空格等）
    const encodedId = encodeURIComponent(row.id)
    const r = await fetch(`${baseUrl}/${encodedId}/toggle`, {
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
  isRebuilding.value = true
  try {
    await ensureExpressReady()
    // 对文件名进行URL编码，处理特殊字符
    const encodedId = encodeURIComponent(selectedItem.value.id)
    const r = await fetch(`${baseUrl}/${encodedId}/rebuild`, { method: 'POST' })
    const j = await r.json()
    if (j.success) {
      eventBus.emit('show-success', t('knowledgeBase.rebuild_submitted'))
      // refresh info
      await fetchInfo(selectedItem.value.id)
    } else eventBus.emit('show-error', j.message || t('knowledgeBase.rebuild_failed'))
  } catch (e) {
    logger.error(e)
    eventBus.emit('show-error', t('knowledgeBase.rebuild_error'))
  } finally {
    isRebuilding.value = false
  }
}

// download
function downloadFile(): void {
  if (!selectedItem.value) return
  // 对文件名进行URL编码，处理特殊字符
  const encodedId = encodeURIComponent(selectedItem.value.id)
  window.open(`${baseUrl}/${encodedId}/download`, '_blank')
}

// 打开文件夹
async function openFolder(): Promise<void> {
  if (!selectedItem.value || !info.path) {
    eventBus.emit('show-error', t('knowledgeBase.open_folder_error'))
    return
  }
  try {
    // 获取 IPC renderer
    const ipcRenderer = window.electron?.ipcRenderer
    if (!ipcRenderer) {
      eventBus.emit('show-error', 'IPC Renderer 未初始化，此功能仅在 Electron 环境中可用')
      return
    }

    // 使用 IPC 调用主进程获取目录路径
    const dirPath = await ipcRenderer.invoke('get-directory-path', info.path)

    if (dirPath) {
      // 使用 shell-open 事件打开目录
      ipcRenderer.send('shell-open', dirPath)
    } else {
      eventBus.emit('show-error', t('knowledgeBase.open_folder_error'))
    }
  } catch (e) {
    logger.error('打开文件夹失败', e)
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
    eventBus.emit('show-error', '文件名不能为空')
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
    const res = await fetch(`${baseUrl}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldName: selectedItem.value.name,
        newName: editFilename.value.trim()
      })
    })
    const data = (await res.json()) as { success: boolean; message?: string }
    if (data.success) {
      eventBus.emit('show-success', '重命名成功')
      isEditing.value = false
      await fetchList()
    } else {
      eventBus.emit('show-error', data.message || '重命名失败')
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    eventBus.emit('show-error', '请求失败: ' + errorMessage)
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
    logger.info('知识库状态已更新', { enabled: data.enabled })
  }
}

onMounted(async () => {
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

/* 圆角样式 */
:deep(.el-card) {
  border-radius: 12px;
  overflow: hidden;
}

:deep(.el-card__body) {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.kb-container {
  display: flex;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
}

.kb-left,
.kb-right {
  width: 50%;
  height: 100%;
  min-height: 0;
  padding: 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.kb-preview,
.kb-config {
  flex: 0 0 50%;
  min-height: 0;
  max-height: 50%;
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

.kb-list-wrapper {
  flex: 0 0 50%;
  min-height: 0;
  max-height: 50%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kb-list-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.kb-search-wrapper {
  flex: 0 0 50%;
  min-height: 0;
  max-height: 50%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kb-result-card {
  border-radius: 8px;
  margin-bottom: 6px;
}

.kb-result-card :deep(.el-card__body) {
  padding: 12px;
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

.config-scroll {
  flex: 1;
  min-height: 0;
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
  margin-top: 16px;
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

/* 美化描述列表 */
:deep(.el-descriptions) {
  border-radius: 8px;
  overflow: hidden;
}

:deep(.el-descriptions__label) {
  font-weight: 500;
  background-color: v-bind('themeState.currentTheme.SideBackgroundColor') !important;
  color: v-bind('themeState.currentTheme.SideTextColor') !important;
}

:deep(.el-descriptions__content) {
  background-color: v-bind('themeState.currentTheme.background2nd') !important;
  color: v-bind('themeState.currentTheme.textColor') !important;
}

:deep(.el-descriptions__table) {
  border-collapse: separate;
  border-spacing: 0;
}

:deep(.el-descriptions__table td) {
  border-color: v-bind('themeState.currentTheme.borderColor') !important;
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
