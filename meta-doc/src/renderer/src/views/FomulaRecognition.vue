<template>
  <div class="formula-recognition-window">
    <div class="main-container">
      <!-- 左侧会话列表（含右侧 resize 与折叠，主内容通过默认 slot 传入） -->
      <SessionList
        :title="t('formulaRecognition.sessionsTitle', '公式识别会话')"
        :items="sessions"
        :active-index="activeSessionId || undefined"
        :disabled="processing || loadingSession"
        :create-button-tooltip="t('formulaRecognition.newSession', '新建会话')"
        :rename-label="t('common.rename', '重命名')"
        :duplicate-label="t('common.duplicate', '复制')"
        :delete-label="t('common.delete', '删除')"
        :rename-dialog-title="t('formulaRecognition.renameTitle', '重命名会话')"
        :rename-placeholder="t('formulaRecognition.renamePlaceholder', '请输入会话名称')"
        :cancel-label="t('common.cancel', '取消')"
        :confirm-label="t('common.confirm', '确认')"
        @create="handleCreateSession"
        @select="handleSelectSession"
        @rename="handleRenameSession"
        @duplicate="handleDuplicateSession"
        @delete="handleDeleteSession"
      >
        <!-- 右侧内容区域 -->
        <div class="content-area" :style="contentAreaStyle" style="position: relative">
          <LoadingOverlay :show="loadingSession" :message="t('common.loading', '加载中...')" />
          <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
            <p>{{ t('formulaRecognition.noSessionSelected', '请选择一个会话或创建新会话') }}</p>
          </div>

          <div v-else class="session-content-panel" :style="panelStyle">
            <!-- 顶部工具栏：工具选择、撤销/重做、重置、图片导入与粘贴、笔刷粗细调节 -->
            <div class="toolbar-group" :style="toolbarGroupStyle">
              <div class="flex flex-col items-start tool-group">
                <ToggleGroup v-model="tool" type="single" class="formula-tool-toggle-group">
                  <ToggleGroupItem
                    v-for="option in toolOptions"
                    :key="option.value"
                    :value="option.value"
                    class="formula-tool-item"
                  >
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <div
                          class="formula-tool-item-inner"
                          role="button"
                          :aria-label="$t(option.label)"
                        >
                          <img :src="option.icon" alt="" class="formula-tool-icon" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {{ $t(option.label) }}
                      </TooltipContent>
                    </Tooltip>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div class="undo-redo-group tool-group">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button size="large" @click="undo" circle>
                      <img
                        :src="
                          (themeState.currentTheme as unknown as Record<string, string>).UndoIcon
                        "
                        alt=""
                        class="formula-toolbar-icon"
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {{ $t('formulaRecognition.undo') }}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button size="large" circle @click="redo">
                      <img
                        :src="
                          (themeState.currentTheme as unknown as Record<string, string>).RedoIcon
                        "
                        alt=""
                        class="formula-toolbar-icon"
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {{ $t('formulaRecognition.redo') }}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button size="large" circle @click="resetCanvas">
                      <img
                        :src="
                          (themeState.currentTheme as unknown as Record<string, string>).ClearIcon
                        "
                        alt=""
                        class="formula-toolbar-icon"
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {{ $t('formulaRecognition.reset') }}
                  </TooltipContent>
                </Tooltip>
              </div>

              <div class="tool-group">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button @click="triggerImport">
                      <el-icon><Upload /></el-icon>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {{ $t('formulaRecognition.import_image') }}
                  </TooltipContent>
                </Tooltip>
                <el-icon size="large" style="padding: 10px">
                  <Picture />
                </el-icon>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button @click="copyImage">
                      <el-icon><CopyDocument /></el-icon>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {{ $t('formulaRecognition.copy_image') }}
                  </TooltipContent>
                </Tooltip>
              </div>

              <!-- 隐藏的文件上传 -->
              <input
                type="file"
                ref="fileInput"
                style="display: none"
                @change="handleFileChange"
                accept="image/*"
              />

              <!-- 笔刷粗细调节 -->
              <div class="brush-size tool-group" style="width: 240px">
                <span>{{ $t('formulaRecognition.brush_size') }}</span>
                <Slider v-model="brushSize" :min="1" :max="20" :step="1" style="width: 120px" />
                <div
                  class="brush-preview"
                  :style="{
                    marginLeft: '10px',
                    width: brushPreviewSize + 'px',
                    height: brushPreviewSize + 'px',
                    borderRadius: '50%',
                    backgroundColor: tool === 'eraser' ? '#fff' : '#000',
                    border: tool === 'eraser' ? '1px solid #ccc' : 'none'
                  }"
                ></div>
              </div>

              <!-- 公式识别按钮（在笔刷粗细右侧） -->
              <div class="tool-group">
                <Button type="primary" @click="recognizeFormula" :loading="processing">
                  {{ $t('formulaRecognition.recognize_formula') }}
                </Button>
              </div>
            </div>

            <!-- 上下结构：上方画布 70%，下方公式 30%，宽度占满 -->
            <div class="content content-vertical">
              <!-- 上方：画布区域 70% -->
              <div class="content-top display-panel" id="canvasContainer" ref="canvasContainerRef">
                <ScrollArea>
                  <div class="canvas-wrapper" :style="canvasWrapperStyle">
                    <canvas
                      ref="drawingCanvas"
                      class="drawing-canvas"
                      :class="{
                        'cursor-default': tool === 'pointer',
                        'cursor-none': tool === 'pen' || tool === 'eraser'
                      }"
                      :width="canvasWidth"
                      :height="canvasHeight"
                    ></canvas>
                    <!-- 画笔/橡皮擦时跟随鼠标的圆形光标（直径与笔刷/橡皮擦一致） -->
                    <div
                      v-show="showCursorCircle"
                      class="canvas-cursor-circle"
                      :class="{ 'cursor-circle-eraser': tool === 'eraser' }"
                      :style="cursorCircleStyle"
                    ></div>
                    <!-- 拖动时虚线预览：即将变成的画布大小 -->
                    <div
                      v-show="isResizingCanvas"
                      class="canvas-resize-preview"
                      :style="{
                        width: resizeTargetW + 'px',
                        height: resizeTargetH + 'px'
                      }"
                    ></div>
                    <!-- 右下角拖动调整画布大小（类似 Windows 画图） -->
                    <div
                      class="canvas-resize-handle"
                      :class="{ 'is-dragging': isResizingCanvas }"
                      @mousedown.prevent="startCanvasResize"
                    ></div>
                  </div>
                  <ScrollBar />
                </ScrollArea>
              </div>

              <!-- 下方：公式面板 30% -->
              <div class="content-bottom display-panel">
                <div class="formula-panel-header">
                  <span class="formula-panel-title">{{
                    $t('formulaRecognition.resultTitle', '识别结果')
                  }}</span>
                  <div class="fomula-toolbar">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button type="primary" class="formula-action-btn" @click="openEditDialog">
                          <el-icon class="formula-action-icon"><Edit /></el-icon>
                          <span>{{ $t('formulaRecognition.edit_formula') }}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {{ $t('formulaRecognition.edit_formula') }}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button type="primary" class="formula-action-btn" @click="copyResult">
                          <el-icon class="formula-action-icon"><DocumentCopy /></el-icon>
                          <span>{{ $t('formulaRecognition.copy_formula') }}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {{ $t('formulaRecognition.copy_formula') }}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button type="primary" class="formula-action-btn" @click="openExportDialog">
                          <el-icon class="formula-action-icon"><Picture /></el-icon>
                          <span>{{ $t('aigraph.exportImage') }}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {{ $t('aigraph.exportImage') }}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div class="formula-panel-body">
                  <MdPreview
                    :modelValue="latexResult"
                    class="latex-container"
                    previewTheme="github"
                    codeStyleReverse
                    :style="{ color: themeState.currentTheme.textColor }"
                    :class="themeState.currentTheme.mdeditorClass"
                    :codeFold="false"
                    :autoFoldThreshold="300"
                  />
                </div>
              </div>
            </div>

            <!-- SimpleTex 说明提示：同一会话第二次识别后才显示 -->
            <Alert v-if="showSimpletexHint" variant="default" class="simpletex-hint">
              <Info class="h-4 w-4" />
              <AlertDescription>
                <span>{{ t('formulaRecognition.simpletexHint') }} </span>
                <a :href="SIMPLETEX_OCR_URL" target="_blank" rel="noopener noreferrer">{{
                  t('formulaRecognition.simpletexLinkText')
                }}</a>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </SessionList>
    </div>

    <!-- 编辑公式对话框 -->
    <Dialog v-model:open="editDialogVisible">
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{{ $t('formulaRecognition.edit_formula_dialog_title') }}</DialogTitle>
        </DialogHeader>
        <div class="py-4">
          <Textarea v-model="latexResult" rows="4" />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editDialogVisible = false">{{
            $t('formulaRecognition.cancel')
          }}</Button>
          <Button @click="editDialogVisible = false">{{ $t('formulaRecognition.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 导出格式对话框 -->
    <Dialog v-model:open="exportDialogVisible">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ $t('aigraph.exportImage') }}</DialogTitle>
        </DialogHeader>
        <div class="py-4">
          <div class="space-y-4">
            <div class="text-sm font-medium">{{ $t('aigraph.exportFormat') }}</div>
            <RadioGroup v-model="exportFormat" class="flex flex-row gap-4">
              <div class="flex items-center gap-2">
                <RadioGroupItem value="svg" id="export-svg" />
                <label for="export-svg" class="text-sm cursor-pointer">{{
                  $t('aigraph.vectorImage')
                }}</label>
              </div>
              <div class="flex items-center gap-2">
                <RadioGroupItem value="png" id="export-png" />
                <label for="export-png" class="text-sm cursor-pointer">{{
                  $t('aigraph.bitmapImage')
                }}</label>
              </div>
              <div class="flex items-center gap-2">
                <RadioGroupItem value="pdf" id="export-pdf" />
                <label for="export-pdf" class="text-sm cursor-pointer">{{
                  $t('aigraph.pdfDocument')
                }}</label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="exportDialogVisible = false">{{
            $t('common.cancel')
          }}</Button>
          <Button @click="confirmExport">{{ $t('common.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '@renderer/utils/notify'

// Demo mode support
const props = defineProps({
  mode: {
    type: String,
    default: 'normal'
  }
})
const isDemo = computed(() => props.mode === 'demo')
import { CopyDocument, DocumentCopy, Edit, Picture, Upload } from '@element-plus/icons-vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Info } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { convertBase64ToBlob, toBase64 } from '../utils/image-utils'
import { simpletexOcr } from '../utils/simpletex-utils'
import { themeState } from '../utils/themes'
import { MdPreview } from 'md-editor-v3'
import '../assets/tool-group.css'
import { useI18n } from 'vue-i18n'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { Slider } from '@renderer/components/ui/slider'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import { createRendererLogger } from '../utils/logger.ts'
import { exportSingleFormula } from '../utils/math-renderer.js'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import {
  formulaRecognitionSessionsDb,
  type FormulaRecognitionSession
} from '../utils/db/tool-sessions-db'
import { useWorkspace } from '../stores/workspace'

const { t } = useI18n()
const logger = createRendererLogger('FormulaRecognition')
const workspace = useWorkspace()

const ourTabId = computed(
  () =>
    workspace.tabs.find((tab) => tab.kind === 'tool' && tab.route === '/fomula-recognition')?.id ??
    null
)

const SIMPLETEX_OCR_URL = 'https://simpletex.cn/ai/latex_ocr'

// 每个会话已发起识别的次数，用于第二次识别后才显示 SimpleTex 提示
const recognitionCountBySession = ref<Record<string, number>>({})
const showSimpletexHint = computed(() => {
  const sid = activeSessionId.value
  if (!sid) return false
  return (recognitionCountBySession.value[sid] || 0) >= 2
})

// 会话管理
const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find((s) => s.id === activeSessionId.value) as any
})
const loadingSession = ref(false)
const processing = ref(false)

// 当前工具：'pointer'、'pen'、'eraser'（顺序：指针、画笔、橡皮擦，图标来自 themes）
const tool = ref('pen')
const toolOptions = computed(() => {
  const theme = themeState.currentTheme as unknown as Record<string, string>
  return [
    { label: 'formulaRecognition.options.pointer', value: 'pointer', icon: theme.CursorIcon },
    { label: 'formulaRecognition.options.pen', value: 'pen', icon: theme.BrushIcon },
    { label: 'formulaRecognition.options.eraser', value: 'eraser', icon: theme.EraserIcon }
  ]
})
// 编辑对话框显示状态
const editDialogVisible = ref(false)
// 公式识别得到的 LaTeX 公式
const latexResult = ref('')
// 文件上传和 canvas 引用
const fileInput = ref<HTMLInputElement | null>(null)
const drawingCanvas = ref<HTMLCanvasElement | null>(null)
const canvasContainerRef = ref<HTMLElement | null>(null)
// 画布固定尺寸（像素），不随窗口变化；窗口缩小时通过滚动条查看
const canvasWidth = ref(0)
const canvasHeight = ref(0)
const canvasWrapperStyle = computed(() => ({
  width: canvasWidth.value + 'px',
  height: canvasHeight.value + 'px',
  minWidth: canvasWidth.value + 'px',
  minHeight: canvasHeight.value + 'px'
}))
let canvasContext: CanvasRenderingContext2D | null = null
let isDrawing = false
// 上一帧的 canvas 坐标，用于插值画圆
let lastCanvasX = 0
let lastCanvasY = 0
// 笔刷粗细（画笔模式下有效），范围1~20，默认2
const brushSize = ref(2)
// 画布上圆形光标（画笔/橡皮擦时）：是否在画布内、位置、直径（屏幕像素）
const isMouseOverCanvas = ref(false)
const cursorCircleX = ref(0)
const cursorCircleY = ref(0)
const cursorCircleDiameter = ref(20)
const showCursorCircle = computed(
  () => (tool.value === 'pen' || tool.value === 'eraser') && isMouseOverCanvas.value
)
const cursorCircleStyle = computed(() => {
  const r = cursorCircleDiameter.value / 2
  return {
    position: 'fixed' as const,
    left: cursorCircleX.value - r + 'px',
    top: cursorCircleY.value - r + 'px',
    width: cursorCircleDiameter.value + 'px',
    height: cursorCircleDiameter.value + 'px'
  }
})
// 导出
const exportDialogVisible = ref(false)
const exportFormat = ref('svg')

// 根据 canvas 缩放比例动态计算预览笔刷的显示尺寸
const brushPreviewSize = computed(() => {
  if (drawingCanvas.value) {
    const rect = drawingCanvas.value.getBoundingClientRect()
    const scaleX = rect.width / drawingCanvas.value.width
    return brushSize.value * scaleX
  }
  return brushSize.value
})

// 撤销与重做栈（保存 canvas ImageData 对象）
const undoStack: ImageData[] = []
const redoStack: ImageData[] = []

// 画布最小尺寸（拖动缩小不低于此值）
const MIN_CANVAS_SIZE = 100

// 右下角拖动调整画布大小（拖动过程中不改画布，松开时再应用，避免内容丢失）
const isResizingCanvas = ref(false)
const resizeTargetW = ref(0)
const resizeTargetH = ref(0)
let resizeStartX = 0
let resizeStartY = 0
let resizeStartW = 0
let resizeStartH = 0

function startCanvasResize(e: MouseEvent) {
  if (!drawingCanvas.value) return
  isResizingCanvas.value = true
  resizeStartX = e.clientX
  resizeStartY = e.clientY
  resizeStartW = canvasWidth.value
  resizeStartH = canvasHeight.value
  resizeTargetW.value = resizeStartW
  resizeTargetH.value = resizeStartH
  document.addEventListener('mousemove', onCanvasResizeMove)
  document.addEventListener('mouseup', onCanvasResizeEnd)
}

function onCanvasResizeMove(e: MouseEvent) {
  if (!isResizingCanvas.value) return
  const dx = e.clientX - resizeStartX
  const dy = e.clientY - resizeStartY
  resizeTargetW.value = Math.max(MIN_CANVAS_SIZE, Math.floor(resizeStartW + dx))
  resizeTargetH.value = Math.max(MIN_CANVAS_SIZE, Math.floor(resizeStartH + dy))
}

function onCanvasResizeEnd() {
  if (!isResizingCanvas.value) return
  const targetW = resizeTargetW.value
  const targetH = resizeTargetH.value
  isResizingCanvas.value = false
  document.removeEventListener('mousemove', onCanvasResizeMove)
  document.removeEventListener('mouseup', onCanvasResizeEnd)
  if (targetW !== canvasWidth.value || targetH !== canvasHeight.value) {
    applyCanvasResize(targetW, targetH)
  }
}

// 应用画布尺寸变化：保存当前内容后重设尺寸并重绘（扩大补白，缩小则裁剪）
function applyCanvasResize(newW: number, newH: number) {
  if (!drawingCanvas.value || !canvasContext) return
  const curW = drawingCanvas.value.width
  const curH = drawingCanvas.value.height
  if (newW === curW && newH === curH) return
  const savedImage = drawingCanvas.value.toDataURL('image/png')
  canvasWidth.value = newW
  canvasHeight.value = newH
  nextTick(() => {
    if (!drawingCanvas.value || !canvasContext) return
    const img = new Image()
    img.onload = () => {
      if (!drawingCanvas.value || !canvasContext) return
      const w = drawingCanvas.value!.width
      const h = drawingCanvas.value!.height
      canvasContext!.fillStyle = '#fff'
      canvasContext!.fillRect(0, 0, w, h)
      const drawW = Math.min(img.naturalWidth, w)
      const drawH = Math.min(img.naturalHeight, h)
      canvasContext!.drawImage(img, 0, 0, drawW, drawH, 0, 0, drawW, drawH)
      undoStack.length = 0
      redoStack.length = 0
      pushState()
    }
    img.src = savedImage
  })
}

// 加载会话列表
const loadSessions = async () => {
  try {
    const dbSessions = await formulaRecognitionSessionsDb.getAll()
    sessions.value = dbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updated_at
    }))
  } catch (error) {
    notifyError('加载会话列表失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 创建新会话
const handleCreateSession = async () => {
  try {
    const id = `formula-recognition-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = t('formulaRecognition.defaultTitle', '新公式识别会话')

    await formulaRecognitionSessionsDb.create({
      id,
      title,
      description: '',
      canvas_image: undefined,
      latex_result: undefined,
      brush_size: 2
    })

    await loadSessions()
    activeSessionId.value = id
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: id })
    // 新会话画布尺寸在 initCanvas 中从视口获取
    canvasWidth.value = 0
    canvasHeight.value = 0
    // 等待 DOM 更新
    await nextTick()
    // 确保画布已初始化
    if (!canvasContext && drawingCanvas.value) {
      initCanvas()
      await nextTick()
    }
    resetCanvas()
    latexResult.value = ''
  } catch (error) {
    notifyError('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 选择会话
const handleSelectSession = async (item: SessionListItem) => {
  if (loadingSession.value) return

  loadingSession.value = true
  try {
    // 保存当前会话
    if (activeSessionId.value) {
      await saveCurrentSession()
    }

    activeSessionId.value = item.id
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: item.id })
    const session = await formulaRecognitionSessionsDb.getById(item.id)
    if (session) {
      // 等待 DOM 更新
      await nextTick()
      // 确保画布已初始化
      if (!canvasContext && drawingCanvas.value) {
        initCanvas()
        await nextTick()
      }
      // 恢复画布
      if (session.canvas_image) {
        await restoreCanvas(session.canvas_image)
      } else {
        // 无保存内容时，画布尺寸设为当前视口
        const container = canvasContainerRef.value || document.getElementById('canvasContainer')
        if (container) {
          const rect = container.getBoundingClientRect()
          canvasWidth.value = Math.max(1, Math.floor(rect.width))
          canvasHeight.value = Math.max(1, Math.floor(rect.height))
        }
        await nextTick()
        resetCanvas()
      }
      // 恢复公式
      latexResult.value = session.latex_result || ''
      // 恢复笔刷大小
      brushSize.value = session.brush_size || 2
    }
  } catch (error) {
    notifyError('加载会话失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    loadingSession.value = false
  }
}

// 重命名会话
const handleRenameSession = async (item: SessionListItem, newTitle: string) => {
  try {
    await formulaRecognitionSessionsDb.update(item.id, { title: newTitle })
    await loadSessions()
  } catch (error) {
    notifyError('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 复制会话
const handleDuplicateSession = async (item: SessionListItem) => {
  try {
    const session = await formulaRecognitionSessionsDb.getById(item.id)
    if (!session) return

    const id = `formula-recognition-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    await formulaRecognitionSessionsDb.create({
      id,
      title: session.title + ' (副本)',
      description: session.description,
      canvas_image: session.canvas_image,
      latex_result: session.latex_result,
      brush_size: session.brush_size
    })

    await loadSessions()
    notifySuccess(t('common.duplicateSuccess', '复制成功'))
  } catch (error) {
    notifyError('复制失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 删除会话
const handleDeleteSession = async (item: SessionListItem) => {
  try {
    await formulaRecognitionSessionsDb.delete(item.id)
    await loadSessions()
    if (activeSessionId.value === item.id) {
      activeSessionId.value = null
      resetCanvas()
      latexResult.value = ''
    }
    notifySuccess(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    notifyError('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 保存当前会话
const saveCurrentSession = async () => {
  if (!activeSessionId.value || !drawingCanvas.value) return

  try {
    const canvasImage = drawingCanvas.value.toDataURL('image/png')
    await formulaRecognitionSessionsDb.update(activeSessionId.value, {
      canvas_image: canvasImage,
      latex_result: latexResult.value,
      brush_size: brushSize.value
    })
  } catch (error) {
    logger.error('保存会话失败:', error)
  }
}

// 恢复画布（从保存的图片恢复，画布尺寸取图片尺寸以保持内容不丢失）
const restoreCanvas = async (canvasImage: string) => {
  const img = new Image()
  img.onload = () => {
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (w <= 0 || h <= 0) return
    canvasWidth.value = w
    canvasHeight.value = h
    nextTick(() => {
      if (!drawingCanvas.value || !canvasContext) return
      canvasContext.clearRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
      canvasContext.drawImage(img, 0, 0, w, h)
      pushState()
    })
  }
  img.src = canvasImage
}

// 初始化画布（画布尺寸仅在未设置时从视口取一次，之后不随窗口变化）
const initCanvas = () => {
  if (!drawingCanvas.value) return

  const container = canvasContainerRef.value || document.getElementById('canvasContainer')
  if (!container) return

  canvasContext = drawingCanvas.value.getContext('2d')
  if (!canvasContext) return

  // 设置默认绘图参数
  canvasContext.lineWidth = brushSize.value
  canvasContext.lineCap = 'round'
  canvasContext.lineJoin = 'round'
  canvasContext.fillStyle = '#fff'

  // 仅当画布尺寸尚未设置时，从视口取初始尺寸（新会话或首次进入）
  if (canvasWidth.value <= 0 || canvasHeight.value <= 0) {
    const rect = container.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    canvasWidth.value = w
    canvasHeight.value = h
  }

  nextTick(() => {
    if (!drawingCanvas.value || !canvasContext) return
    const w = drawingCanvas.value.width
    const h = drawingCanvas.value.height
    if (w > 0 && h > 0) {
      canvasContext.fillStyle = '#fff'
      canvasContext.fillRect(0, 0, w, h)
      pushState()
    }
  })

  // 移除旧的事件监听器（如果存在）
  if (drawingCanvas.value) {
    drawingCanvas.value.removeEventListener('mousedown', startDrawing)
    drawingCanvas.value.removeEventListener('mouseenter', updateCursorPosition)
    drawingCanvas.value.removeEventListener('mousemove', draw)
    drawingCanvas.value.removeEventListener('mouseup', stopDrawing)
    drawingCanvas.value.removeEventListener('mouseout', stopDrawing)
    drawingCanvas.value.removeEventListener('mouseout', onCanvasMouseOut)
  }

  // 监听绘图事件
  drawingCanvas.value.addEventListener('mousedown', startDrawing)
  drawingCanvas.value.addEventListener('mouseenter', updateCursorPosition)
  drawingCanvas.value.addEventListener('mousemove', draw)
  drawingCanvas.value.addEventListener('mouseup', stopDrawing)
  drawingCanvas.value.addEventListener('mouseout', stopDrawing)
  drawingCanvas.value.addEventListener('mouseout', onCanvasMouseOut)

  // 触摸事件支持
  drawingCanvas.value.addEventListener('touchstart', (e) => {
    e.preventDefault()
    const touch = e.touches[0]
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    })
    drawingCanvas.value?.dispatchEvent(mouseEvent)
  })

  drawingCanvas.value.addEventListener('touchmove', (e) => {
    e.preventDefault()
    const touch = e.touches[0]
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    })
    drawingCanvas.value?.dispatchEvent(mouseEvent)
  })

  drawingCanvas.value.addEventListener('touchend', (e) => {
    e.preventDefault()
    const mouseEvent = new MouseEvent('mouseup', {})
    drawingCanvas.value?.dispatchEvent(mouseEvent)
  })
}

// 窗口迁移后恢复当前选中的会话
watch(
  [() => workspace.activeTabId.value, ourTabId, () => sessions.value],
  () => {
    const tid = ourTabId.value
    if (!tid || workspace.activeTabId.value !== tid || sessions.value.length === 0) return
    const state = workspace.getTabToolState(tid)
    const savedId = state.activeSessionId
    if (!savedId || !sessions.value.some((s) => s.id === savedId)) return
    if (activeSessionId.value === savedId) return
    const item = sessions.value.find((s) => s.id === savedId)!
    activeSessionId.value = savedId
    handleSelectSession(item)
  },
  { immediate: true, deep: true }
)

onMounted(async () => {
  if (isDemo.value) {
    // Demo mode: use mock data
    sessions.value = [
      { id: 'demo-1', title: '公式识别示例', updatedAt: Date.now() },
      { id: 'demo-2', title: '数学公式', updatedAt: Date.now() - 3600000 }
    ]
    activeSessionId.value = 'demo-1'
    return
  }
  await loadSessions()
  // 等待 DOM 完全渲染后再初始化画布
  await nextTick()
  // 使用 setTimeout 确保容器尺寸已计算
  setTimeout(() => {
    initCanvas()
  }, 100)
  window.addEventListener('paste', handlePaste)
  window.addEventListener('keydown', handleUndoRedoKeydown)
})

onBeforeUnmount(() => {
  if (activeSessionId.value) {
    saveCurrentSession()
  }
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('keydown', handleUndoRedoKeydown)

  // 清理事件监听器
  if (drawingCanvas.value) {
    drawingCanvas.value.removeEventListener('mousedown', startDrawing)
    drawingCanvas.value.removeEventListener('mouseenter', updateCursorPosition)
    drawingCanvas.value.removeEventListener('mousemove', draw)
    drawingCanvas.value.removeEventListener('mouseup', stopDrawing)
    drawingCanvas.value.removeEventListener('mouseout', stopDrawing)
    drawingCanvas.value.removeEventListener('mouseout', onCanvasMouseOut)
  }
})

// 监听画布变化，自动保存
watch([() => latexResult.value, () => brushSize.value], () => {
  if (activeSessionId.value) {
    // 防抖保存
    setTimeout(() => {
      saveCurrentSession()
    }, 1000)
  }
})

// 计算 canvas 内部的实际坐标（考虑缩放偏移）
function getCanvasCoordinates(e: MouseEvent) {
  if (!drawingCanvas.value) return { x: 0, y: 0 }
  const rect = drawingCanvas.value.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  const scaleX = drawingCanvas.value.width / rect.width
  const scaleY = drawingCanvas.value.height / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  }
}

// 更新画布上圆形光标位置与直径（画笔/橡皮擦时）
function updateCursorPosition(e: MouseEvent) {
  isMouseOverCanvas.value = true
  cursorCircleX.value = e.clientX
  cursorCircleY.value = e.clientY
  if (!drawingCanvas.value) return
  const rect = drawingCanvas.value.getBoundingClientRect()
  if (rect.width <= 0) return
  const scale = rect.width / drawingCanvas.value.width
  // 与绘制一致：画笔直径 = brushSize，橡皮擦直径 = 2*brushSize
  const diameter = tool.value === 'eraser' ? brushSize.value * 2 * scale : brushSize.value * scale
  cursorCircleDiameter.value = Math.max(2, Math.min(200, diameter))
}

function onCanvasMouseOut() {
  isMouseOverCanvas.value = false
}

// 系统快捷键：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y 重做
function handleUndoRedoKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  const isInput =
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  if (isInput) return
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return
  if (e.key === 'z' || e.key === 'Z') {
    if (e.shiftKey) {
      e.preventDefault()
      redo()
    } else {
      e.preventDefault()
      undo()
    }
  } else if (e.key === 'y' || e.key === 'Y') {
    e.preventDefault()
    redo()
  }
}

// 在 canvas 上画一个圆（画笔：黑色填充；橡皮擦：destination-out 擦除）
function stampCircle(cx: number, cy: number, radius: number, isEraser: boolean) {
  if (!canvasContext) return
  canvasContext.beginPath()
  canvasContext.arc(cx, cy, radius, 0, Math.PI * 2)
  if (isEraser) {
    canvasContext.save()
    canvasContext.globalCompositeOperation = 'destination-out'
    canvasContext.fillStyle = 'rgba(0,0,0,1)'
    canvasContext.fill()
    canvasContext.restore()
  } else {
    canvasContext.fillStyle = '#000'
    canvasContext.fill()
  }
}

// 绘图开始
function startDrawing(e: MouseEvent) {
  if (tool.value === 'pointer' || !canvasContext) return
  isDrawing = true
  const { x, y } = getCanvasCoordinates(e)
  lastCanvasX = x
  lastCanvasY = y
  const penRadius = brushSize.value / 2
  const eraserRadius = brushSize.value // 与光标一致：直径 2*brushSize
  const r = tool.value === 'eraser' ? eraserRadius : penRadius
  stampCircle(x, y, r, tool.value === 'eraser')
}

// 绘制过程：沿路径插值画圆，轨迹与光标圆完全一致
function draw(e: MouseEvent) {
  updateCursorPosition(e)
  if (!isDrawing || tool.value === 'pointer' || !canvasContext) return
  const { x, y } = getCanvasCoordinates(e)
  const penRadius = brushSize.value / 2
  const eraserRadius = brushSize.value
  const r = tool.value === 'eraser' ? eraserRadius : penRadius
  const dx = x - lastCanvasX
  const dy = y - lastCanvasY
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist <= 0) {
    stampCircle(x, y, r, tool.value === 'eraser')
  } else {
    const step = Math.max(r * 0.6, 1)
    const numSteps = Math.ceil(dist / step)
    for (let i = 1; i <= numSteps; i++) {
      const t = i / numSteps
      const px = lastCanvasX + t * dx
      const py = lastCanvasY + t * dy
      stampCircle(px, py, r, tool.value === 'eraser')
    }
  }
  lastCanvasX = x
  lastCanvasY = y
}

// 绘图结束
function stopDrawing() {
  if (!isDrawing || !canvasContext) return
  isDrawing = false
  canvasContext.closePath()
  pushState()
  redoStack.length = 0
}

// 保存当前 canvas 状态到撤销栈
function pushState() {
  if (!drawingCanvas.value || !canvasContext) return
  const canvas = drawingCanvas.value
  const imgData = canvasContext.getImageData(0, 0, canvas.width, canvas.height)
  undoStack.push(imgData)
}

// 撤销操作
function undo() {
  if (!canvasContext) return
  if (undoStack.length <= 1) {
    notifyWarning(t('formulaRecognition.notification.undo_fail'))
    return
  }
  const currentState = undoStack.pop()
  if (currentState) {
    redoStack.push(currentState)
    const previousState = undoStack[undoStack.length - 1]
    if (previousState) {
      canvasContext.putImageData(previousState, 0, 0)
    }
  }
}

// 重做操作
function redo() {
  if (!canvasContext || redoStack.length === 0) {
    if (redoStack.length === 0) {
      notifyWarning(t('formulaRecognition.notification.redo_fail'))
    }
    return
  }
  const state = redoStack.pop()
  if (state) {
    undoStack.push(state)
    canvasContext.putImageData(state, 0, 0)
  } else {
    notifyWarning(t('formulaRecognition.notification.redo_fail'))
  }
}

// 工具选择
function selectTool(selected: string) {
  tool.value = selected
}

// 重置画布，清空内容并保存初始状态
function resetCanvas() {
  if (!canvasContext || !drawingCanvas.value) return
  canvasContext.clearRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
  canvasContext.fillStyle = '#fff'
  canvasContext.fillRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
  undoStack.length = 0
  redoStack.length = 0
  pushState()
}

// 触发文件上传
function triggerImport() {
  fileInput.value && fileInput.value.click()
}

// 处理上传的图片文件
function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file && file.type.startsWith('image/') && canvasContext && drawingCanvas.value) {
    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (typeof result === 'string') {
        const img = new Image()
        img.onload = () => {
          if (canvasContext && drawingCanvas.value) {
            canvasContext.clearRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
            canvasContext.drawImage(
              img,
              0,
              0,
              drawingCanvas.value.width,
              drawingCanvas.value.height
            )
            pushState()
          }
        }
        img.src = result
      }
    }
    reader.readAsDataURL(file)
  }
}

// 复制图片到剪切板
async function copyImage() {
  if (!drawingCanvas.value) return
  // 将 canvas 转为图片
  const imgData = drawingCanvas.value.toDataURL('image/png')
  // 将图片转为Base64格式，然后转换成Blob对象
  let base64Data = await toBase64(imgData)
  //console.log(base64Data);
  const blobInput = convertBase64ToBlob(base64Data, 'image/png')
  const clipboardItemInput = new ClipboardItem({
    'image/png': blobInput
  })

  if (navigator.clipboard) {
    navigator.clipboard.write([clipboardItemInput])
  }
  notifySuccess(t('formulaRecognition.notification.copy_image_success'))
}
// 处理剪切板粘贴的图片
function handlePaste(e: ClipboardEvent, items_?: DataTransferItemList | null) {
  let items: DataTransferItemList
  if (items_) {
    items = items_
  } else {
    items = (e.clipboardData || (e as any).originalEvent?.clipboardData)?.items
    if (!items) return
  }

  for (let index in items) {
    const item = items[index]
    if (item.kind === 'file' && canvasContext && drawingCanvas.value) {
      const blob = item.getAsFile()
      if (!blob) continue
      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event.target?.result
        if (typeof result === 'string') {
          const img = new Image()
          img.onload = () => {
            if (canvasContext && drawingCanvas.value) {
              canvasContext.clearRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
              canvasContext.drawImage(
                img,
                0,
                0,
                drawingCanvas.value.width,
                drawingCanvas.value.height
              )
              pushState()
            }
          }
          img.src = result
        }
      }
      reader.readAsDataURL(blob)
      break
    }
  }
}

// 模拟调用公式识别 API
async function recognizeFormula() {
  if (!drawingCanvas.value) return

  processing.value = true
  try {
    const imageData = drawingCanvas.value.toDataURL('image/png')
    const res = await simpletexOcr(imageData)
    latexResult.value = '$$\n' + res + '\n$$'

    // 同一会话第二次识别后显示 SimpleTex 提示
    const sid = activeSessionId.value
    if (sid) {
      const prev = recognitionCountBySession.value[sid] || 0
      recognitionCountBySession.value = { ...recognitionCountBySession.value, [sid]: prev + 1 }
    }

    // 若当前会话标题仍是默认，则改为「时间戳 + 识别公式（过长截断）」
    const defaultTitle = t('formulaRecognition.defaultTitle', '新公式识别会话')
    const session = activeSession.value
    if (session && session.title === defaultTitle && sid) {
      const now = new Date()
      const dateStr = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`
      const formulaPart = (res || '').replace(/\s+/g, ' ').trim()
      const maxLen = 28
      const truncated =
        formulaPart.length > maxLen ? formulaPart.slice(0, maxLen) + '…' : formulaPart
      const newTitle = truncated ? `${dateStr} - ${truncated}` : `${dateStr} - `
      await formulaRecognitionSessionsDb.update(sid, { title: newTitle })
      await loadSessions()
    }

    // 保存结果
    if (activeSessionId.value) {
      await saveCurrentSession()
    }
  } catch (error) {
    logger.error('公式识别失败:', error)
    notifyError(error instanceof Error ? error.message : String(error))
  } finally {
    processing.value = false
  }
}

// 打开编辑对话框
function openEditDialog() {
  editDialogVisible.value = true
}

// 复制公式到剪切板
function copyResult() {
  navigator.clipboard
    .writeText(latexResult.value)
    .then(() => {
      notifySuccess(t('formulaRecognition.notification.copy_formula_success'))
    })
    .catch(() => {
      notifyError(t('formulaRecognition.notification.copy_formula_fail'))
    })
}

function openExportDialog() {
  exportDialogVisible.value = true
}

function normalizeTex(src: string) {
  // 去掉外围 ```latex 或者 $$ 包裹
  let s = (src || '').trim()
  // 去除 markdown 代码围栏
  s = s
    .replace(/^```(?:latex|tex)\s*\n/, '')
    .replace(/\n```\s*$/, '')
    .trim()
  // 去除块公式 $$...$$ 或 \[...\]
  if (/^\$\$[\s\S]*\$\$$/m.test(s)) {
    s = s.replace(/^\$\$\s*/, '').replace(/\s*\$\$$/, '')
  } else if (/^\\\[[\s\S]*\\\]$/.test(s)) {
    s = s.replace(/^\\\[\s*/, '').replace(/\s*\\\]$/, '')
  } else if (/^\$[\s\S]*\$$/.test(s)) {
    // 去除行内公式 $...$
    s = s.replace(/^\$\s*/, '').replace(/\s*\$$/, '')
  } else if (/^\\\([\s\S]*\\\)$/.test(s)) {
    // 行内 \(...\)
    s = s.replace(/^\\\(\s*/, '').replace(/\s*\\\)$/, '')
  }
  return s
}

async function confirmExport() {
  exportDialogVisible.value = false
  const tex = normalizeTex(latexResult.value)
  if (!tex) {
    notifyError(t('aigraph.error.no_code_to_export') || '无可导出的公式')
    return
  }
  try {
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('无法获取 IPC 渲染器')
    }

    if (exportFormat.value === 'svg') {
      // 按照 PDF 的前半段链路：生成 SVG -> 上传 -> 保存
      const svgDataUrl = await exportSingleFormula(tex, 'svg')
      // Data URL -> Blob
      const res = await fetch(svgDataUrl)
      const blob = await res.blob()
      const fileName = `formula_${Date.now()}.svg`
      const formData = new FormData()
      const file = new File([blob], fileName, { type: 'image/svg+xml' })
      formData.append('file[]', file, fileName)
      const baseUrl = await import('../config/runtime-server').then((m) =>
        m.getRuntimeServerBaseUrl()
      )
      const resp = await fetch(`${baseUrl}/api/image/upload?keepName=1`, {
        method: 'POST',
        body: formData
      })
      if (!resp.ok) throw new Error('上传 SVG 失败')
      const json = await resp.json()
      const uploaded = json?.data?.succMap ? Object.keys(json.data.succMap)[0] : fileName
      const imageUrl = `${baseUrl}/images/${uploaded}`

      const saveResult = (await messageBridge.invoke(
        'save-image-file',
        imageUrl,
        'formula.svg'
      )) as {
        success: boolean
        error?: string
      }
      if (!saveResult.success) throw new Error(saveResult.error || '保存失败')
    } else if (exportFormat.value === 'png') {
      // 矢量生成后再转位图
      const svgDataUrl = await exportSingleFormula(tex, 'svg')
      const svgBlob = await (await fetch(svgDataUrl)).blob()
      const svgText = await svgBlob.text()
      const { convertSvgToPng } = await import('../utils/chart-pre-renderer.js')
      const pngBlob = await convertSvgToPng(svgText)
      // Blob -> data URL
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(pngBlob)
      })

      const result = (await messageBridge.invoke('save-image-file', dataUrl, 'formula.png')) as {
        success: boolean
        error?: string
      }
      if (!result.success) throw new Error(result.error || '保存失败')
    } else if (exportFormat.value === 'pdf') {
      // 先拿到 SVG data URL，再转 PDF（上传到本地再转换）
      const svgDataUrl = await exportSingleFormula(tex, 'svg')
      // Data URL -> Blob
      const res = await fetch(svgDataUrl)
      const blob = await res.blob()
      const fileName = `formula_${Date.now()}.svg`
      const formData = new FormData()
      const file = new File([blob], fileName, { type: 'image/svg+xml' })
      formData.append('file[]', file, fileName)
      const baseUrl = await import('../config/runtime-server').then((m) =>
        m.getRuntimeServerBaseUrl()
      )
      const resp = await fetch(`${baseUrl}/api/image/upload?keepName=1`, {
        method: 'POST',
        body: formData
      })
      if (!resp.ok) throw new Error('上传 SVG 失败')
      const json = await resp.json()
      const uploaded = json?.data?.succMap ? Object.keys(json.data.succMap)[0] : fileName
      const imageUrl = `${baseUrl}/images/${uploaded}`

      // 转本地路径
      const { image2local } = await import('../utils/md-utils.js')
      const mdTmp = `![x](${imageUrl})`
      const converted = await image2local(mdTmp)
      const m = converted.match(/!\[.*?\]\((.+?)\)/)
      const svgPath = m ? m[1] : imageUrl

      const convertResult = (await messageBridge.invoke('convert-svg-to-pdf', svgPath)) as {
        success: boolean
        pdfPath?: string
        error?: string
      }
      if (!convertResult.success || !convertResult.pdfPath) {
        throw new Error(convertResult.error || 'SVG 转 PDF 失败')
      }
      const saveResult = (await messageBridge.invoke(
        'save-image-file',
        convertResult.pdfPath,
        'formula.pdf'
      )) as { success: boolean; error?: string }
      if (!saveResult.success) throw new Error(saveResult.error || '保存失败')
    }
    notifySuccess(t('aigraph.success.export_succeeded'))
  } catch (error) {
    logger.error('导出公式失败:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    notifyError(errorMessage)
  }
}

// 主题样式
const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
)

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value
}))

const contentAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  overflow: 'hidden' as const,
  height: '100%',
  minHeight: 0,
  padding: '16px',
  boxSizing: 'border-box' as const
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%'
}))

const toolbarGroupStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))
</script>

<style scoped>
.formula-recognition-window {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.session-content-panel {
  border-radius: 16px;
  border: 1px solid;
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  margin: 0;
  height: 100%;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
  gap: 16px;
}

/* 顶部工具栏 */
.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  flex-shrink: 0;
}

.formula-tool-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.formula-tool-toggle-group {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: v-bind('themeState.currentTheme.background2nd || "#f5f5f5"');
  border-radius: 8px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "#dcdcdc"');
}

.formula-tool-item {
  min-width: 60px;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.formula-tool-item-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.formula-tool-item[data-state='on'] {
  background: v-bind('themeState.currentTheme.primary || "#409eff"');
  color: white;
}

.formula-toolbar-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
}

/* 笔刷粗细设置 */
.brush-size {
  display: flex;
  align-items: center;
  gap: 5px;
}

/* 中间内容区域：上下结构，上方 70% 画布，下方 30% 公式，宽度占满 */
.content {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.content.content-vertical {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

/* 上方：画布区域 70% */
.content-top {
  flex: 0 0 70%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;
}

.content-top [data-radix-scroll-area-viewport] {
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: auto;
}

/* 下方：公式面板 30% */
.content-bottom {
  flex: 0 0 30%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.formula-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  flex-shrink: 0;
  border-bottom: 1px solid v-bind('borderColor');
}

.formula-panel-title {
  font-weight: 500;
}

.formula-panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 0;
}

.canvas-wrapper {
  position: relative;
  flex-shrink: 0;
}

/* 拖动时虚线框：即将变成的画布大小预览 */
.canvas-resize-preview {
  position: absolute;
  left: 0;
  top: 0;
  box-sizing: border-box;
  border: 2px dashed rgba(0, 0, 0, 0.5);
  pointer-events: none;
  z-index: 1;
}

/* 画布右下角拖动调整大小手柄（类似 Windows 画图） */
.canvas-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.2) 50%);
  border-radius: 0 0 2px 0;
  z-index: 2;
}
.canvas-resize-handle:hover,
.canvas-resize-handle.is-dragging {
  background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.35) 50%);
}

.drawing-canvas {
  background-color: #fff;
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
.drawing-canvas.cursor-default {
  cursor: default;
}
.drawing-canvas.cursor-none {
  cursor: none;
}

/* 画笔/橡皮擦时跟随鼠标的圆形光标 */
.canvas-cursor-circle {
  pointer-events: none;
  border-radius: 50%;
  border: 1px solid #000;
  background: transparent;
  position: fixed;
  z-index: 10;
  box-sizing: border-box;
}
.canvas-cursor-circle.cursor-circle-eraser {
  border-color: #666;
  background: rgba(255, 255, 255, 0.5);
}

.latex-container {
  width: 100%;
  min-height: 100%;
}

.display-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid v-bind('borderColor');
  border-radius: 8px;
  padding: 10px;
  background-color: v-bind('themeState.currentTheme.background');
}

/* 公式面板内工具栏 */
.fomula-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.formula-action-btn {
  border-radius: 10px;
  padding: 0 10px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.formula-action-icon {
  font-size: 16px;
  line-height: 1;
}

.undo-redo-group {
  gap: 5px;
}

.simpletex-hint {
  flex-shrink: 0;
}
.simpletex-hint a {
  color: var(--el-color-primary);
  text-decoration: none;
}
.simpletex-hint a:hover {
  text-decoration: underline;
}
</style>
