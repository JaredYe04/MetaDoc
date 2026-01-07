<template>
  <div class="formula-recognition-window">
    <div class="main-container">
      <!-- 左侧会话列表 -->
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
      />

      <!-- 右侧内容区域 -->
      <div class="content-area" :style="contentAreaStyle" v-loading="loadingSession">
        <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
          <p>{{ t('formulaRecognition.noSessionSelected', '请选择一个会话或创建新会话') }}</p>
        </div>
        
        <div v-else class="session-content-panel" :style="panelStyle">
          <!-- 顶部工具栏：工具选择、撤销/重做、重置、图片导入与粘贴、笔刷粗细调节 -->
          <div class="toolbar-group" :style="toolbarGroupStyle">
      <div class="flex flex-col items-start tool-group">
        <el-segmented v-model="tool" :options="options" size="default">
          <template #default="scope">
            <div :class="[
              'flex',
              'items-center',
              'gap-2',
              'flex-col',
            ]">
              <el-icon size="20">
                <component :is="scope.item.icon" />
              </el-icon>
              <div>{{ $t(scope.item.label) }}</div>
            </div>
          </template>
        </el-segmented>
      </div>

      <div class="undo-redo-group tool-group">
        <el-tooltip :content="$t('formulaRecognition.undo')" placement="top">
          <el-button size="large" @click="undo" circle>
            <el-icon><RefreshLeft /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="$t('formulaRecognition.redo')" placement="top">
          <el-button size="large" circle @click="redo">
            <el-icon><RefreshRight /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="$t('formulaRecognition.reset')" placement="top">
          <el-button size="large" circle @click="resetCanvas">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <div class="tool-group">
        <el-tooltip :content="$t('formulaRecognition.import_image')" placement="top">
          <el-button @click="triggerImport">
            <el-icon><Upload /></el-icon>
          </el-button>
        </el-tooltip>
        <el-icon size="large" style="padding: 10px;">
          <Picture />
        </el-icon>
        <el-tooltip :content="$t('formulaRecognition.copy_image')" placement="top">
          <el-button @click="copyImage">
            <el-icon><CopyDocument /></el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <!-- 隐藏的文件上传 -->
      <input type="file" ref="fileInput" style="display: none" @change="handleFileChange" accept="image/*" />
      
      <!-- 笔刷粗细调节 -->
      <div class="brush-size tool-group" style="width: 240px;">
        <span>{{ $t('formulaRecognition.brush_size') }}</span>
        <el-slider v-model="brushSize" :min="1" :max="20" :step="1" show-tooltip style="width: 120px" />
        <div class="brush-preview" :style="{
          marginLeft: '10px',
          width: brushPreviewSize + 'px',
          height: brushPreviewSize + 'px',
          borderRadius: '50%',
          backgroundColor: tool === 'eraser' ? '#fff' : '#000',
          border: tool === 'eraser' ? '1px solid #ccc' : 'none'
        }"></div>
      </div>
          </div>

          <!-- 中间内容区域 -->
          <div class="content">
      <!-- 左侧：画板 -->
      <div class="left-panel display-panel" id="canvasContainer">
        <canvas ref="drawingCanvas" class="drawing-canvas"></canvas>
      </div>

      <!-- 中间：箭头和公式识别按钮 -->
      <div class="middle-panel">
        <div class="arrow">→</div>
        <el-button type="primary" @click="recognizeFormula">
          {{ $t('formulaRecognition.recognize_formula') }}
        </el-button>
      </div>

      <!-- 右侧：公式显示 -->
      <div class="right-panel display-panel">
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
        <div class="fomula-toolbar">
          <div class="tool-group">
            <el-tooltip :content="$t('formulaRecognition.edit_formula')" placement="top">
              <el-button type="primary" :icon="Edit" circle @click="openEditDialog" />
            </el-tooltip>
            <el-tooltip :content="$t('formulaRecognition.copy_formula')" placement="top">
              <el-button type="primary" :icon="DocumentCopy" circle @click="copyResult" />
            </el-tooltip>
            <el-tooltip :content="$t('aigraph.exportImage')" placement="top">
              <el-button type="primary" :icon="Picture" circle @click="openExportDialog" />
            </el-tooltip>
          </div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>

    <!-- 编辑公式对话框 -->
    <el-dialog :title="$t('formulaRecognition.edit_formula_dialog_title')" v-model="editDialogVisible">
      <el-input type="textarea" v-model="latexResult" rows="4" />
      <template #footer>
        <el-button @click="editDialogVisible = false">{{ $t('formulaRecognition.cancel') }}</el-button>
        <el-button type="primary" @click="editDialogVisible = false">{{ $t('formulaRecognition.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 导出格式对话框 -->
    <el-dialog v-model="exportDialogVisible" :title="$t('aigraph.exportImage')" width="400">
      <div>
        <el-form label-width="100px">
          <el-form-item :label="$t('aigraph.exportFormat')">
            <el-radio-group v-model="exportFormat">
              <el-radio label="svg">{{ $t('aigraph.vectorImage') }}</el-radio>
              <el-radio label="png">{{ $t('aigraph.bitmapImage') }}</el-radio>
              <el-radio label="pdf">{{ $t('aigraph.pdfDocument') }}</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="exportDialogVisible = false">{{ $t('common.cancel') }}</el-button>
          <el-button type="primary" @click="confirmExport">{{ $t('common.confirm') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>


<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { ElNotification, ElMessage } from 'element-plus'
import { CircleClose, CopyDocument, DocumentCopy, Edit, EditPen, Picture, Pointer, Refresh, RefreshLeft, RefreshRight, Upload } from '@element-plus/icons-vue'
import { convertBase64ToBlob, toBase64 } from '../utils/image-utils'
import { simpletexOcr } from '../utils/simpletex-utils'
import { themeState } from '../utils/themes'
import { MdPreview } from 'md-editor-v3'
import '../assets/tool-group.css'
import { useI18n } from 'vue-i18n'
import { createRendererLogger } from '../utils/logger.ts'
import { exportSingleFormula } from '../utils/math-renderer.js'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { formulaRecognitionSessionsDb, type FormulaRecognitionSession } from '../utils/db/tool-sessions-db'

const { t } = useI18n()
const logger = createRendererLogger('FormulaRecognition')

// 会话管理
const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find(s => s.id === activeSessionId.value) as any
})
const loadingSession = ref(false)
const processing = ref(false)

// 当前工具：'pen'、'eraser' 或 'pointer'
const tool = ref('pen')
const options = [
    { label: t('formulaRecognition.options.pen'), value: 'pen', icon: EditPen },
    { label: t('formulaRecognition.options.eraser'), value: 'eraser', icon: CircleClose },
    { label: t('formulaRecognition.options.pointer'), value: 'pointer', icon: Pointer }
]
// 编辑对话框显示状态
const editDialogVisible = ref(false)
// 公式识别得到的 LaTeX 公式
const latexResult = ref('')
// 文件上传和 canvas 引用
const fileInput = ref<HTMLInputElement | null>(null)
const drawingCanvas = ref<HTMLCanvasElement | null>(null)
let canvasContext: CanvasRenderingContext2D | null = null
let isDrawing = false
// 笔刷粗细（画笔模式下有效），范围1~20，默认2
const brushSize = ref(2)
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

// 窗口resize处理函数
let resizeHandler: (() => void) | null = null


// 加载会话列表
const loadSessions = async () => {
  try {
    const dbSessions = await formulaRecognitionSessionsDb.getAll()
    sessions.value = dbSessions.map(s => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updated_at
    }))
  } catch (error) {
    ElMessage.error('加载会话列表失败: ' + (error instanceof Error ? error.message : String(error)))
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
    ElMessage.error('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
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
        resetCanvas()
      }
      // 恢复公式
      latexResult.value = session.latex_result || ''
      // 恢复笔刷大小
      brushSize.value = session.brush_size || 2
    }
  } catch (error) {
    ElMessage.error('加载会话失败: ' + (error instanceof Error ? error.message : String(error)))
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
    ElMessage.error('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
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
    ElMessage.success(t('common.duplicateSuccess', '复制成功'))
  } catch (error) {
    ElMessage.error('复制失败: ' + (error instanceof Error ? error.message : String(error)))
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
    ElMessage.success(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
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

// 恢复画布
const restoreCanvas = async (canvasImage: string) => {
  if (!drawingCanvas.value || !canvasContext) return
  
  const img = new Image()
  img.onload = () => {
    if (!drawingCanvas.value || !canvasContext) return
    canvasContext.clearRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
    canvasContext.drawImage(img, 0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
    pushState()
  }
  img.src = canvasImage
}

// 初始化画布
const initCanvas = () => {
  if (!drawingCanvas.value) return
  
  const container = document.getElementById('canvasContainer')
  if (!container) return
  
  canvasContext = drawingCanvas.value.getContext('2d')
  if (!canvasContext) return
  
  // 设置默认绘图参数
  canvasContext.lineWidth = brushSize.value
  canvasContext.lineCap = 'round'
  canvasContext.lineJoin = 'round'
  // 填充背景为白色
  canvasContext.fillStyle = '#fff'
  
  // 设置画布尺寸 - 使用容器的实际尺寸
  const updateCanvasSize = () => {
    if (!drawingCanvas.value || !container || !canvasContext) return
    const rect = container.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    
    if (width > 0 && height > 0) {
      // 检查是否是首次初始化（画布尺寸为0或未设置）
      const isFirstInit = drawingCanvas.value.width === 0 || drawingCanvas.value.height === 0
      
      // 如果不是首次初始化，保存当前内容
      let imgData: ImageData | null = null
      if (!isFirstInit && drawingCanvas.value.width > 0 && drawingCanvas.value.height > 0) {
        try {
          imgData = canvasContext.getImageData(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
        } catch (e) {
          // 如果获取失败，忽略
        }
      }
      
      // 设置新尺寸
      drawingCanvas.value.width = width
      drawingCanvas.value.height = height
      
      // 恢复内容或填充白色背景
      if (imgData && imgData.width > 0 && imgData.height > 0) {
        canvasContext.putImageData(imgData, 0, 0)
      } else {
        // 如果是首次初始化或没有内容，填充白色背景
        canvasContext.fillStyle = '#fff'
        canvasContext.fillRect(0, 0, width, height)
      }
    }
  }
  
  // 初始设置尺寸
  updateCanvasSize()
  
  // 保存初始状态
  pushState()
  
  // 移除旧的事件监听器（如果存在）
  if (drawingCanvas.value) {
    drawingCanvas.value.removeEventListener('mousedown', startDrawing)
    drawingCanvas.value.removeEventListener('mousemove', draw)
    drawingCanvas.value.removeEventListener('mouseup', stopDrawing)
    drawingCanvas.value.removeEventListener('mouseout', stopDrawing)
  }
  
  // 监听绘图事件
  drawingCanvas.value.addEventListener('mousedown', startDrawing)
  drawingCanvas.value.addEventListener('mousemove', draw)
  drawingCanvas.value.addEventListener('mouseup', stopDrawing)
  drawingCanvas.value.addEventListener('mouseout', stopDrawing)
  
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
  
  // 监听窗口resize
  resizeHandler = () => {
    if (!drawingCanvas.value || !canvasContext || !container) return
    updateCanvasSize()
  }
  window.addEventListener('resize', resizeHandler)
  
  // 使用 ResizeObserver 监听容器尺寸变化
  const resizeObserver = new ResizeObserver(() => {
    updateCanvasSize()
  })
  resizeObserver.observe(container)
  
  // 保存 observer 以便清理
  ;(drawingCanvas.value as any).__resizeObserver = resizeObserver
}

onMounted(async () => {
  await loadSessions()
  // 等待 DOM 完全渲染后再初始化画布
  await nextTick()
  // 使用 setTimeout 确保容器尺寸已计算
  setTimeout(() => {
    initCanvas()
  }, 100)
  window.addEventListener('paste', handlePaste)
})

onBeforeUnmount(() => {
  if (activeSessionId.value) {
    saveCurrentSession()
  }
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
  }
  window.removeEventListener('paste', handlePaste)
  
  // 清理事件监听器
  if (drawingCanvas.value) {
    drawingCanvas.value.removeEventListener('mousedown', startDrawing)
    drawingCanvas.value.removeEventListener('mousemove', draw)
    drawingCanvas.value.removeEventListener('mouseup', stopDrawing)
    drawingCanvas.value.removeEventListener('mouseout', stopDrawing)
    
    // 清理 ResizeObserver
    const observer = (drawingCanvas.value as any).__resizeObserver
    if (observer) {
      observer.disconnect()
    }
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
    const scaleX = drawingCanvas.value.width / rect.width
    const scaleY = drawingCanvas.value.height / rect.height
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    }
}

// 绘图开始
function startDrawing(e: MouseEvent) {
    if (tool.value === 'pointer' || !canvasContext) return
    isDrawing = true
    const { x, y } = getCanvasCoordinates(e)
    canvasContext.beginPath()
    canvasContext.moveTo(x, y)
}

// 绘制过程
function draw(e: MouseEvent) {
    if (!isDrawing || tool.value === 'pointer' || !canvasContext) return
    const { x, y } = getCanvasCoordinates(e)
    if (tool.value === 'eraser') {
        canvasContext.strokeStyle = '#fff'
        // 橡皮擦的实际粗细按 brushSize 放大
        canvasContext.lineWidth = brushSize.value * 5
    } else {
        canvasContext.strokeStyle = '#000'
        canvasContext.lineWidth = brushSize.value
    }
    canvasContext.lineTo(x, y)
    canvasContext.stroke()
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
        ElNotification({
            title: t('formulaRecognition.notification.title_info'),
            message: t('formulaRecognition.notification.undo_fail'),
            type: 'warning'
        })
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
            ElNotification({
                title: t('formulaRecognition.notification.title_info'),
                message: t('formulaRecognition.notification.redo_fail'),
                type: 'warning'
            })
        }
        return
    }
    const state = redoStack.pop()
    if (state) {
        undoStack.push(state)
        canvasContext.putImageData(state, 0, 0)
    } else {
ElNotification({
  title: t('formulaRecognition.notification.title_info'),
  message: t('formulaRecognition.notification.redo_fail'),
  type: 'warning'
})
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
                        canvasContext.drawImage(img, 0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
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
    let base64Data = await toBase64(imgData);
    //console.log(base64Data);
    const blobInput = convertBase64ToBlob(base64Data, "image/png");
    const clipboardItemInput = new ClipboardItem({
        "image/png": blobInput,
    });

    if (navigator.clipboard) {
        navigator.clipboard.write([clipboardItemInput]);
    }
ElNotification({
  title: t('formulaRecognition.notification.title_success'),
  message: t('formulaRecognition.notification.copy_image_success'),
  type: 'success'
})

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
                            canvasContext.drawImage(img, 0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
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
    
    // 保存结果
    if (activeSessionId.value) {
      await saveCurrentSession()
    }
  } catch (error) {
    logger.error('公式识别失败:', error)
    ElNotification({
      title: t('formulaRecognition.notification.title_error'),
      message: error instanceof Error ? error.message : String(error),
      type: 'error'
    })
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
    navigator.clipboard.writeText(latexResult.value).then(() => {
  ElNotification({
    title: t('formulaRecognition.notification.title_success'),
    message: t('formulaRecognition.notification.copy_formula_success'),
    type: 'success'
  })
    }).catch(() => {
  ElNotification({
    title: t('formulaRecognition.notification.title_error'),
    message: t('formulaRecognition.notification.copy_formula_fail'),
    type: 'error'
  })
    })
}

function openExportDialog() {
    exportDialogVisible.value = true
}

function normalizeTex(src: string) {
    // 去掉外围 ```latex 或者 $$ 包裹
    let s = (src || '').trim()
    // 去除 markdown 代码围栏
    s = s.replace(/^```(?:latex|tex)\s*\n/, '').replace(/\n```\s*$/, '').trim()
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
        ElNotification({ title: t('formulaRecognition.notification.title_error'), message: t('aigraph.error.no_code_to_export') || '无可导出的公式', type: 'error' })
        return
    }
    try {
        // 获取 IPC 渲染器
        let ipcRenderer = null
        if (window && window.electron) {
            ipcRenderer = window.electron.ipcRenderer
        } else {
            const localIpcRenderer = (await import('../utils/web-adapter/local-ipc-renderer.ts')).default
            ipcRenderer = localIpcRenderer
        }
        if (!ipcRenderer) {
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
            const resp = await fetch('http://localhost:52521/api/image/upload?keepName=1', { method: 'POST', body: formData })
            if (!resp.ok) throw new Error('上传 SVG 失败')
            const json = await resp.json()
            const uploaded = json?.data?.succMap ? Object.keys(json.data.succMap)[0] : fileName
            const imageUrl = `http://localhost:52521/images/${uploaded}`

            const saveResult = await ipcRenderer.invoke('save-image-file', imageUrl, 'formula.svg') as { success: boolean; error?: string }
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
            
            const result = await ipcRenderer.invoke('save-image-file', dataUrl, 'formula.png') as { success: boolean; error?: string }
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
            const resp = await fetch('http://localhost:52521/api/image/upload?keepName=1', { method: 'POST', body: formData })
            if (!resp.ok) throw new Error('上传 SVG 失败')
            const json = await resp.json()
            const uploaded = json?.data?.succMap ? Object.keys(json.data.succMap)[0] : fileName
            const imageUrl = `http://localhost:52521/images/${uploaded}`

            // 转本地路径
            const { image2local } = await import('../utils/md-utils.js')
            const mdTmp = `![x](${imageUrl})`
            const converted = await image2local(mdTmp)
            const m = converted.match(/!\[.*?\]\((.+?)\)/)
            const svgPath = m ? m[1] : imageUrl

            const convertResult = await ipcRenderer.invoke('convert-svg-to-pdf', svgPath) as { success: boolean; pdfPath?: string; error?: string }
            if (!convertResult.success || !convertResult.pdfPath) {
                throw new Error(convertResult.error || 'SVG 转 PDF 失败')
            }
            const saveResult = await ipcRenderer.invoke('save-image-file', convertResult.pdfPath, 'formula.pdf') as { success: boolean; error?: string }
            if (!saveResult.success) throw new Error(saveResult.error || '保存失败')
        }
        ElNotification({ title: t('aigraph.success.export_succeeded'), message: '', type: 'success' })
    } catch (error) {
        logger.error('导出公式失败:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        ElNotification({ title: t('aigraph.error.export_failed'), message: errorMessage, type: 'error' })
    }
}

// 主题样式
const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
)

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value,
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
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
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

/* 笔刷粗细设置 */
.brush-size {
    display: flex;
    align-items: center;
    gap: 5px;
}

/* 中间内容区域 */
.content {
  display: flex;
  gap: 20px;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 左侧画板 */
.left-panel {
    flex: 1;
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}

.drawing-canvas {
    background-color: #fff;
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    touch-action: none;
}

/* 中间区域 */
.middle-panel {
    flex: 0.3;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.arrow {
    font-size: 36px;
    margin-bottom: 10px;
}

/* 右侧公式显示 */
.right-panel {
    flex: 1;

    padding: 10px;
    overflow: auto;
}

.latex-container {
    width: 100%;
    height: 100%;
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

/* 底部工具栏 */
.fomula-toolbar {
    position: absolute;
    display: flex;
    justify-content: flex-end;
    transition: all 0.3s;
    gap: 10px;
}

.undo-redo-group {

    gap: 5px;

}


</style>