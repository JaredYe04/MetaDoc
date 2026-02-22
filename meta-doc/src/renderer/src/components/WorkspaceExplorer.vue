<template>
  <div
    ref="workspaceExplorerRef"
    class="workspace-explorer"
    tabindex="0"
    @keydown="handleKeyDown"
    @focus="handleFocus"
    @blur="handleBlur"
    @click="handleContainerClick"
  >
    <div class="workspace-explorer-header">
      <span class="workspace-explorer-title">{{ $t('workspaceExplorer.title') }}</span>
      <div class="workspace-explorer-actions">
        <Button
          v-if="workspaceFolders.length > 0"
          variant="ghost"
          size="sm"
          @click="refreshAllWorkspaceFolders"
          :title="$t('workspaceExplorer.refresh')"
        >
          <img
            :src="(themeState.currentTheme as any).RefreshIcon"
            class="workspace-action-icon"
            alt="refresh"
          />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          @click="addWorkspaceFolder"
          :title="$t('workspaceExplorer.addFolder')"
        >
          <img
            :src="(themeState.currentTheme as any).FolderAddIcon"
            class="workspace-action-icon"
            alt="add folder"
          />
        </Button>
      </div>
    </div>
    <div v-if="workspaceFolders.length === 0" class="workspace-explorer-empty">
      <div class="custom-empty-state">
        <div class="logo-container" :class="{ shake: isShaking }" @click="handleLogoClick">
          <div class="logo-animation-wrapper">
            <img :src="logoPath" alt="Logo" class="logo-image" />
          </div>
        </div>
        <p class="custom-empty-description">{{ $t('workspaceExplorer.noWorkspaceFolder') }}</p>
        <Button variant="default" @click="addWorkspaceFolder">
          {{ $t('workspaceExplorer.addFolder') }}
        </Button>
      </div>
    </div>
    <div v-else class="workspace-explorer-main">
      <ScrollArea
        ref="treeScrollbarRef"
        class="workspace-explorer-tree h-full"
        @contextmenu.prevent="handleContentContextMenu"
      >
        <div
          class="workspace-explorer-content"
          @contextmenu.prevent="handleContentContextMenu"
          @dragover="handleContentDragOver"
          @dragleave="handleContentDragLeave"
          @drop="handleContentDrop"
        >
          <template v-for="(folderPath, index) in workspaceFolders" :key="folderPath">
            <WorkspaceTreeNode
              v-if="workspaceFolderNodes.get(folderPath)"
              :node="workspaceFolderNodes.get(folderPath)!"
              :sibling-index="index"
              :expanded-paths="expandedPaths"
              :workspace-folder="folderPath"
              :selected-paths="selectedPaths"
              :focused-path="focusedPath"
              :last-selected-index="lastSelectedIndex"
              :drag-target-path="dragTargetPath"
              @toggle="handleToggle"
              @open-file="handleOpenFile"
              @open-file-permanent="handleOpenFilePermanent"
              @context-menu="handleContextMenu"
              @node-click="handleNodeClick"
              @close-workspace="removeWorkspaceFolder"
              @drag-start="handleDragStart"
              @drag-over="handleDragOver"
              @drag-leave="handleDragLeave"
              @drop="handleDrop"
              @drag-end="handleDragEnd"
            />
          </template>
        </div>
      </ScrollArea>
    </div>
    <!-- 已打开文件列表（始终显示，如果有打开的文件） -->
    <div v-if="openedFiles.length > 0" class="workspace-explorer-opened-files">
      <div class="opened-files-header">
        <span class="opened-files-title">{{ $t('workspaceExplorer.openedFiles') }}</span>
      </div>
      <ScrollArea class="opened-files-scrollbar h-full">
        <div class="opened-files-list">
          <div
            v-for="tab in openedFiles"
            :key="tab.id"
            class="opened-file-item"
            :class="{ 'is-active': tab.id === workspace.activeTabId.value }"
            @click="workspace.activateTab(tab.id)"
          >
            <span class="opened-file-name" :title="tab.path">{{ tab.subtitle || tab.title }}</span>
            <Button
              variant="ghost"
              size="sm"
              class="opened-file-close"
              @click.stop="handleCloseFile(tab.id)"
              :title="$t('workspaceExplorer.closeFile')"
            >
              <Close class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
    <!-- 右键菜单 -->
    <ContextMenu
      v-if="contextMenuVisible"
      :x="contextMenuPosition.x"
      :y="contextMenuPosition.y"
      :items="contextMenuItems"
      @trigger="handleContextMenuCommand"
      @close="contextMenuVisible = false"
    />
    <!-- 重命名对话框 -->
    <Dialog v-model:open="renameDialogVisible" @update:open="(open) => !open && handleRenameDialogClose()">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ $t('workspaceExplorer.renameDialog.title') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label class="text-right">{{ $t('workspaceExplorer.renameDialog.name') }}</Label>
            <Input
              v-model="renameName"
              :placeholder="$t('workspaceExplorer.renameDialog.placeholder')"
              @keyup.enter="handleRenameConfirm"
              class="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" @click="handleRenameDialogClose">{{ $t('common.cancel') }}</Button>
          <Button variant="default" @click="handleRenameConfirm">{{
            $t('common.confirm')
          }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <!-- 新建文件对话框 -->
    <Dialog v-model:open="newFileDialogVisible" @update:open="(open) => !open && handleNewFileDialogClose()">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ $t('workspaceExplorer.newFileDialog.title') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label class="text-right">{{ $t('workspaceExplorer.newFileDialog.name') }}</Label>
            <Input
              v-model="newFileName"
              :placeholder="$t('workspaceExplorer.newFileDialog.placeholder')"
              @keyup.enter="handleNewFileConfirm"
              class="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" @click="handleNewFileDialogClose">{{ $t('common.cancel') }}</Button>
          <Button variant="default" @click="handleNewFileConfirm">{{
            $t('common.confirm')
          }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <!-- 新建文件夹对话框 -->
    <Dialog v-model:open="newFolderDialogVisible" @update:open="(open) => !open && handleNewFolderDialogClose()">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ $t('workspaceExplorer.newFolderDialog.title') }}</DialogTitle>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label class="text-right">{{ $t('workspaceExplorer.newFolderDialog.name') }}</Label>
            <Input
              v-model="newFolderName"
              :placeholder="$t('workspaceExplorer.newFolderDialog.placeholder')"
              @keyup.enter="handleNewFolderConfirm"
              class="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" @click="handleNewFolderDialogClose">{{ $t('common.cancel') }}</Button>
          <Button variant="default" @click="handleNewFolderConfirm">{{
            $t('common.confirm')
          }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loading, Warning, Close } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@renderer/components/ui/dialog'
import eventBus from '../utils/event-bus'
import { useWorkspace } from '../stores/workspace'
import { createRendererLogger } from '../utils/logger'
import { themeState, mixColors } from '../utils/themes'
import WorkspaceTreeNode from './WorkspaceTreeNode.vue'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from './contextMenus/types'
import { dirname, basename, extname, join, relative } from '../utils/path-utils'
import { useCloseTab } from '../composables/useCloseTab'
import { formatRegistry } from '../utils/format-registry'
import * as Comlink from 'comlink'
import type { DirectoryProcessorWorker } from '../utils/workers/directory-processor.worker'
import { useWorkspaceOperations } from '../composables/useWorkspaceOperations'
import { URIUtils, type URI } from '../utils/workspace/fs-models'
import { RefreshService } from '../utils/workspace/refresh-service'
import logoPath from '../assets/logo.svg'
import messageBridge from '../bridge/message-bridge'


const { t } = useI18n()
const logger = createRendererLogger('WorkspaceExplorer')
const workspace = useWorkspace()
const { closeTab } = useCloseTab()

// Logo 动画相关
const isShaking = ref(false)

const handleLogoClick = () => {
  isShaking.value = true
  setTimeout(() => {
    isShaking.value = false
  }, 1500) // 动画持续时间
}

// 通过消息桥获取 IPC（统一入口，便于未来迁移）
const getIpcRenderer = () => messageBridge.getIpc()
const ipcRenderer = getIpcRenderer()

// 使用新的操作模型
const operations = ipcRenderer ? useWorkspaceOperations(ipcRenderer) : null
const refreshService = ipcRenderer ? new RefreshService(ipcRenderer) : null

// 并发池工具：控制并发数量，避免同时发起过多请求
class ConcurrencyPool {
  private queue: Array<() => Promise<any>> = []
  private running = 0
  private maxConcurrency: number

  constructor(maxConcurrency: number = 15) {
    this.maxConcurrency = maxConcurrency
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          this.running--
          this.processQueue()
        }
      })
      this.processQueue()
    })
  }

  private processQueue() {
    while (this.running < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift()
      if (task) {
        this.running++
        task()
      }
    }
  }

  getQueueLength(): number {
    return this.queue.length
  }

  getRunningCount(): number {
    return this.running
  }
}

// 创建并发池实例（15 个并发）
const directoryLoadPool = new ConcurrencyPool(15)

// Worker 相关
let directoryProcessorWorker: Comlink.Remote<DirectoryProcessorWorker> | null = null
let workerInstance: Worker | null = null

// 缓存 extensionMap 对象，避免重复转换
let cachedExtensionMap: Record<string, string> | null = null

// 获取 extensionMap（带缓存）
const getExtensionMapObj = (): Record<string, string> => {
  if (!cachedExtensionMap) {
    cachedExtensionMap = Object.fromEntries(formatRegistry.getExtensionMap())
  }
  return cachedExtensionMap
}

// 初始化 Worker
const initWorker = async () => {
  if (directoryProcessorWorker) {
    return directoryProcessorWorker
  }

  try {
    // 创建 Worker 实例
    // 使用 ?worker 后缀让 Vite 正确处理 Worker
    workerInstance = new Worker(
      new URL('../utils/workers/directory-processor.worker.ts?worker', import.meta.url),
      { type: 'module' }
    )

    // 使用 Comlink 包装 Worker
    directoryProcessorWorker = Comlink.wrap<DirectoryProcessorWorker>(workerInstance)

    logger.debug('目录处理 Worker 初始化成功')
    return directoryProcessorWorker
  } catch (err) {
    logger.error('初始化目录处理 Worker 失败:', err)
    return null
  }
}

// 清理 Worker
const cleanupWorker = () => {
  if (directoryProcessorWorker) {
    directoryProcessorWorker[Comlink.releaseProxy]()
    directoryProcessorWorker = null
  }
  if (workerInstance) {
    workerInstance.terminate()
    workerInstance = null
  }
  // 清理缓存
  cachedExtensionMap = null
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory' | 'workspaceRoot'
  children?: FileNode[]
  expanded?: boolean
  isWorkspaceRoot?: boolean // 是否为工作文件夹根节点
}

const workspaceFolders = ref<string[]>([]) // 支持多个工作文件夹
const workspaceFolderNodes = ref<Map<string, FileNode>>(new Map()) // 工作文件夹根节点
const expandedPaths = ref<Set<string>>(new Set())
const loading = ref<Map<string, boolean>>(new Map()) // 每个工作文件夹的加载状态
const error = ref<string | null>(null)

// 已打开文件列表（仅正式打开的文件，不含预览 tab）
const openedFiles = computed(() => {
  return workspace.tabs.filter((tab) => tab.kind === 'file' && tab.path && !tab.preview)
})

// 右键菜单相关
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuNode = ref<FileNode | null>(null)
const contextMenuTargetPath = ref<string | null>(null) // 空白位置右键时的目标路径
const isFocused = ref(false) // 组件是否获得焦点

// 剪贴板状态（兼容旧代码，实际使用 ClipboardService）
const clipboardPaths = computed(() => {
  if (operations) {
    return operations.hasClipboardContent()
      ? operations.selection.value.uris.map((uri) => URIUtils.uriToPath(uri))
      : []
  }
  return []
})
const clipboardOperation = computed(() => {
  if (operations) {
    return operations.getClipboardOperationType()
  }
  return null
})

// Focus 状态（当前聚焦的节点，只有一个）
const focusedPath = ref<string | null>(null)

// 拖拽状态
const dragTargetPath = ref<string | null>(null) // 当前拖拽目标路径（用于高亮显示）
const draggingURIs = ref<URI[]>([]) // 正在拖拽的 URI 列表

// Selection 状态（选中的节点，可以多个）
const selectedPaths = computed({
  get: () => {
    // 从新的 selection 模型转换为旧的 Set<string>
    const set = new Set<string>()
    if (operations) {
      operations.selection.value.uris.forEach((uri) => {
        set.add(URIUtils.uriToPath(uri))
      })
    }
    return set
  },
  set: (value: Set<string>) => {
    // 从旧的 Set<string> 转换为新的 selection 模型
    if (operations) {
      const uris = Array.from(value).map((path) => URIUtils.pathToURI(path))
      operations.updateSelection(uris)
    }
  }
})
const lastSelectedIndex = computed({
  get: () => operations?.lastSelectedIndex.value ?? -1,
  set: (value: number) => {
    if (operations) {
      operations.lastSelectedIndex.value = value
    }
  }
})

// 构建右键菜单项
const contextMenuItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = []
  const node = contextMenuNode.value

  // 空白位置右键菜单（没有选中节点）
  if (!node) {
    // 粘贴
    if (operations && operations.hasClipboardContent()) {
      items.push({
        type: 'action',
        value: 'paste',
        label: 'workspaceExplorer.contextMenu.paste'
      })
      items.push({
        type: 'divider'
      })
    }
    // 新建文件
    items.push({
      type: 'action',
      value: 'newFile',
      label: 'workspaceExplorer.contextMenu.newFile'
    })
    // 新建文件夹
    items.push({
      type: 'action',
      value: 'newFolder',
      label: 'workspaceExplorer.contextMenu.newFolder'
    })
    return items
  }

  // 节点右键菜单

  // 工作文件夹根节点菜单：新建文件、新建文件夹、粘贴、打开文件夹、刷新
  if (node.isWorkspaceRoot) {
    // 粘贴（如果有剪贴板内容）
    if (operations && operations.hasClipboardContent()) {
      items.push({
        type: 'action',
        value: 'paste',
        label: 'workspaceExplorer.contextMenu.paste'
      })
      items.push({
        type: 'divider'
      })
    }
    // 新建文件
    items.push({
      type: 'action',
      value: 'newFile',
      label: 'workspaceExplorer.contextMenu.newFile'
    })
    // 新建文件夹
    items.push({
      type: 'action',
      value: 'newFolder',
      label: 'workspaceExplorer.contextMenu.newFolder'
    })
    items.push({
      type: 'divider'
    })
    // 打开文件夹
    items.push({
      type: 'action',
      value: 'openFolder',
      label: 'workspaceExplorer.contextMenu.openFolder'
    })
    // 刷新
    items.push({
      type: 'action',
      value: 'refresh',
      label: 'workspaceExplorer.contextMenu.refresh'
    })
    return items
  }

  // 文件相关菜单
  if (node.type === 'file') {
    items.push({
      type: 'action',
      value: 'open',
      label: 'workspaceExplorer.contextMenu.open'
    })
  }

  // 剪切和复制（如果有选中项，会批量操作；否则操作单个节点）
  items.push(
    {
      type: 'action',
      value: 'cut',
      label: 'workspaceExplorer.contextMenu.cut'
    },
    {
      type: 'action',
      value: 'copy',
      label: 'workspaceExplorer.contextMenu.copy'
    }
  )

  // 粘贴（如果有剪贴板内容）
  if (operations && operations.hasClipboardContent()) {
    items.push({
      type: 'action',
      value: 'paste',
      label: 'workspaceExplorer.contextMenu.paste'
    })
  }

  // 重命名和删除
  items.push({
    type: 'action',
    value: 'rename',
    label: 'workspaceExplorer.contextMenu.rename'
  })
  items.push({
    type: 'divider'
  })
  items.push({
    type: 'action',
    value: 'delete',
    label: 'workspaceExplorer.contextMenu.delete',
    danger: true
  })

  // 文件特有菜单
  if (node.type === 'file') {
    items.push(
      {
        type: 'action',
        value: 'copyPath',
        label: 'workspaceExplorer.contextMenu.copyPath'
      },
      {
        type: 'action',
        value: 'copyRelativePath',
        label: 'workspaceExplorer.contextMenu.copyRelativePath'
      },
      {
        type: 'action',
        value: 'showInFolder',
        label: 'workspaceExplorer.contextMenu.showInFolder'
      }
    )
  }

  // 目录特有菜单
  if (node.type === 'directory') {
    items.push(
      {
        type: 'divider'
      },
      {
        type: 'action',
        value: 'openFolder',
        label: 'workspaceExplorer.contextMenu.openFolder'
      },
      {
        type: 'divider'
      },
      {
        type: 'action',
        value: 'refresh',
        label: 'workspaceExplorer.contextMenu.refresh'
      },
      {
        type: 'divider'
      },
      {
        type: 'action',
        value: 'newFile',
        label: 'workspaceExplorer.contextMenu.newFile'
      },
      {
        type: 'action',
        value: 'newFolder',
        label: 'workspaceExplorer.contextMenu.newFolder'
      }
    )
  }

  return items
})

// 对话框相关
const renameDialogVisible = ref(false)
const renameName = ref('')
const renameTargetPath = ref<string | null>(null)

const newFileDialogVisible = ref(false)
const newFileName = ref('')
const newFileParentPath = ref<string | null>(null)

const newFolderDialogVisible = ref(false)
const newFolderName = ref('')
const newFolderParentPath = ref<string | null>(null)

// 组件引用
const workspaceExplorerRef = ref<HTMLElement | null>(null)
const treeScrollbarRef = ref<InstanceType<typeof ScrollArea> | null>(null)

// 处理容器点击，确保获得焦点，并清空 focus 和 selection
const handleContainerClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement

  // 如果点击在节点上，不处理（由节点点击处理）
  if (target.closest('.workspace-tree-node-item')) {
    return
  }

  // 如果点击的不是按钮或输入框，让组件获得焦点，并清空 focus 和 selection
  if (!target.closest('button') && !target.closest('input') && !target.closest('.el-dialog')) {
    workspaceExplorerRef.value?.focus()
    // 清空 focus 和 selection
    focusedPath.value = null
    if (operations) {
      operations.clearSelection()
    }
  }
}

// 计算悬停颜色
const hoverColor = computed(() => {
  return mixColors(
    themeState.currentTheme.background2nd,
    themeState.currentTheme.SideTextColor,
    0.15
  )
})

// 计算活跃 Tab 背景色（不高亮背景色与 #777777 混合 0.5）
const activeTabBackgroundColor = computed(() => {
  // 使用 editorToolbarBackgroundColor（不高亮背景色）与 #777777 混合
  const baseBg =
    themeState.currentTheme.editorToolbarBackgroundColor || themeState.currentTheme.background2nd
  return mixColors(baseBg, '#777777', 0.3)
})

// 添加工作文件夹
const addWorkspaceFolder = async () => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) {
    error.value = t('workspaceExplorer.ipcNotAvailable')
    return
  }

  try {
    const result = (await messageBridge.invoke('show-open-dialog', {
      title: t('workspaceExplorer.selectFolder'),
      properties: ['openDirectory']
    })) as { canceled: boolean; filePaths?: string[] }

    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      const newFolder = result.filePaths[0]

      // 检查是否已存在
      if (workspaceFolders.value.includes(newFolder)) {
        eventBus.emit('show-warning', { message: t('workspaceExplorer.folderAlreadyAdded') })
        return
      }

      // 先创建工作文件夹根节点
      await createWorkspaceRootNode(newFolder)

      // 节点创建成功后再添加到工作文件夹列表
      workspaceFolders.value.push(newFolder)

      // 启动目录监听
      startDirectoryWatcher(newFolder)

      // 保存工作文件夹列表
      saveWorkspaceFolders()
    }
  } catch (err) {
    logger.error('添加工作文件夹失败:', err)
    error.value = err instanceof Error ? err.message : String(err)
  }
}

// 移除工作文件夹
const removeWorkspaceFolder = async (folderPath: string) => {
  const index = workspaceFolders.value.indexOf(folderPath)
  if (index === -1) return

  // 停止目录监听
  stopDirectoryWatcher(folderPath)

  // 从列表中移除
  workspaceFolders.value.splice(index, 1)

  // 移除节点
  workspaceFolderNodes.value.delete(folderPath)

  // 清除相关的选中状态
  selectedPaths.value.delete(folderPath)

  // 保存工作文件夹列表
  saveWorkspaceFolders()
}

// 创建工作文件夹根节点
const createWorkspaceRootNode = async (folderPath: string) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) {
    throw new Error(t('workspaceExplorer.ipcNotAvailable'))
  }

  try {
    loading.value.set(folderPath, true)

    const folderName = basename(folderPath)
    const rootNode: FileNode = {
      name: folderName,
      path: folderPath,
      type: 'workspaceRoot',
      isWorkspaceRoot: true,
      children: []
    }

    // 先设置节点（即使还没有子节点），这样模板可以渲染
    workspaceFolderNodes.value.set(folderPath, rootNode)

    // 默认展开
    expandedPaths.value.add(folderPath)

    // 加载子目录
    await loadWorkspaceFolderChildren(rootNode)

    // 更新节点（确保子节点已加载）
    workspaceFolderNodes.value.set(folderPath, rootNode)
  } catch (err) {
    logger.error('创建工作文件夹根节点失败:', err)
    // 如果创建失败，移除节点
    workspaceFolderNodes.value.delete(folderPath)
    throw err
  } finally {
    loading.value.set(folderPath, false)
  }
}

// 加载目录内容（懒加载：只加载直接子项，不递归）
const loadDirectoryContent = async (nodePath: string): Promise<FileNode[]> => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return []

  // 使用并发池执行目录读取
  return directoryLoadPool.execute(async () => {
    try {
      // 读取目录内容
      const entries = (await messageBridge.invoke('read-directory', nodePath)) as Array<{
        name: string
        path: string
        isDirectory: boolean
      }>

      // 初始化 Worker（如果还没有初始化）
      const worker = await initWorker()
      if (!worker) {
        // Worker 初始化失败，回退到主线程处理
        logger.warn('Worker 不可用，回退到主线程处理')
        return processDirectoryContentInMainThread(entries)
      }

      // 获取扩展名映射表（使用缓存，避免重复转换）
      const extensionMapObj = getExtensionMapObj()

      // 在 Worker 中处理目录内容（不会阻塞主线程）
      const result = await worker.processDirectoryContent({
        entries,
        extensionMap: extensionMapObj
      })

      return result
    } catch (err) {
      logger.error('加载目录内容失败:', { path: nodePath, error: err })
      // 如果 Worker 处理失败，回退到主线程处理
      try {
        const entries = (await messageBridge.invoke('read-directory', nodePath)) as Array<{
          name: string
          path: string
          isDirectory: boolean
        }>
        return processDirectoryContentInMainThread(entries)
      } catch (fallbackErr) {
        logger.error('主线程回退处理也失败:', fallbackErr)
        return []
      }
    }
  })
}

// 主线程处理目录内容（作为回退方案）
const processDirectoryContentInMainThread = (
  entries: Array<{ name: string; path: string; isDirectory: boolean }>
): FileNode[] => {
  const dirs: FileNode[] = []
  const files: FileNode[] = []

  for (const entry of entries) {
    if (entry.isDirectory) {
      dirs.push({
        name: entry.name,
        path: entry.path,
        type: 'directory',
        children: undefined
      })
    } else {
      // 只显示支持的文档格式文件
      const fileExt = extname(entry.path)
      const formatId = formatRegistry.getFormatByExtension(fileExt)
      if (formatId) {
        files.push({
          name: entry.name,
          path: entry.path,
          type: 'file'
        })
      }
    }
  }

  // 排序：目录在前，文件在后
  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))

  return [...dirs, ...files]
}

// 加载工作文件夹的子目录（懒加载：只加载直接子项）
const loadWorkspaceFolderChildren = async (rootNode: FileNode) => {
  if (!rootNode.path) return

  // 先初始化为空数组，立即更新 UI
  rootNode.children = []

  // 异步加载目录内容
  const children = await loadDirectoryContent(rootNode.path)

  // 更新节点子项（Vue 会自动响应式更新）
  rootNode.children = children
}

// 刷新指定工作文件夹
const refreshWorkspaceFolder = async (folderPath: string) => {
  // 保存当前状态
  const scrollPosition = saveScrollPosition()
  const savedExpandedPaths = new Set(expandedPaths.value)

  // 设置 loading 状态（用于防抖）
  loading.value.set(folderPath, true)

  try {
    const rootNode = workspaceFolderNodes.value.get(folderPath)
    if (rootNode) {
      await loadWorkspaceFolderChildren(rootNode)
    }

    // 恢复展开状态（使用 Set 的方法更新，保持响应式）
    const currentExpanded = expandedPaths.value
    // 先清除所有，再添加保存的
    currentExpanded.clear()
    savedExpandedPaths.forEach((path) => currentExpanded.add(path))

    // 恢复滚动位置
    restoreScrollPosition(scrollPosition)
  } finally {
    // 清除 loading 状态
    loading.value.set(folderPath, false)
  }
}

// 保存滚动位置
const saveScrollPosition = () => {
  if (!treeScrollbarRef.value) return null
  try {
    const viewport = treeScrollbarRef.value.$el?.querySelector('[data-radix-scroll-area-viewport]')
    if (viewport) {
      return {
        scrollTop: viewport.scrollTop,
        scrollLeft: viewport.scrollLeft
      }
    }
  } catch (err) {
    logger.warn('保存滚动位置失败:', err)
  }
  return null
}

// 恢复滚动位置
const restoreScrollPosition = (position: { scrollTop: number; scrollLeft: number } | null) => {
  if (!position || !treeScrollbarRef.value) return
  try {
    // 使用 nextTick 确保 DOM 已更新
    setTimeout(() => {
      const viewport = treeScrollbarRef.value?.$el?.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        viewport.scrollTop = position.scrollTop
        viewport.scrollLeft = position.scrollLeft
      }
    }, 0)
  } catch (err) {
    logger.warn('恢复滚动位置失败:', err)
  }
}

// 递归查找节点（包括未展开的节点）
const findNodeByPath = (node: FileNode, targetPath: string): FileNode | null => {
  if (node.path === targetPath) {
    return node
  }

  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByPath(child, targetPath)
      if (found) {
        return found
      }
    }
  }

  return null
}

// 刷新指定目录节点（用于子目录）
const refreshDirectoryNode = async (directoryPath: string) => {
  logger.info('refreshDirectoryNode 开始', { directoryPath })

  // 保存当前状态
  const scrollPosition = saveScrollPosition()
  const savedExpandedPaths = new Set(expandedPaths.value)

  // 设置 loading 状态（用于防抖）
  loading.value.set(directoryPath, true)

  try {
    // 规范化路径格式：Windows 路径统一使用反斜杠，Unix 路径使用正斜杠
    // 判断是否为 Windows 路径（以盘符开头）
    const normalizedPath = /^[A-Za-z]:/.test(directoryPath)
      ? directoryPath.replace(/\//g, '\\')
      : directoryPath

    // 先检查是否是工作文件夹根目录（需要规范化比较）
    const isWorkspaceRoot = workspaceFolders.value.some((folder) => {
      // 规范化工作文件夹路径
      const normalizedFolder = /^[A-Za-z]:/.test(folder) ? folder.replace(/\//g, '\\') : folder
      return normalizedFolder === normalizedPath
    })

    if (isWorkspaceRoot) {
      logger.info('刷新工作文件夹根目录', { directoryPath, normalizedPath })
      // 找到匹配的工作文件夹路径（使用原始格式）
      const matchingFolder = workspaceFolders.value.find((folder) => {
        const normalizedFolder = /^[A-Za-z]:/.test(folder) ? folder.replace(/\//g, '\\') : folder
        return normalizedFolder === normalizedPath
      })
      if (matchingFolder) {
        const rootNode = workspaceFolderNodes.value.get(matchingFolder)
        if (rootNode) {
          await loadWorkspaceFolderChildren(rootNode)
        } else {
          logger.warn('工作文件夹根节点不存在', { directoryPath, matchingFolder })
        }
      }
    } else {
      // 在所有工作文件夹根节点中递归查找目标目录节点
      logger.info('查找目录节点', { directoryPath, normalizedPath })
      let targetNode: FileNode | null = null
      for (const rootNode of workspaceFolderNodes.value.values()) {
        // 使用规范化路径查找
        targetNode = findNodeByPath(rootNode, normalizedPath)
        if (!targetNode) {
          // 如果找不到，尝试使用原始路径格式查找
          targetNode = findNodeByPath(rootNode, directoryPath)
        }
        if (targetNode) {
          logger.info('找到目录节点', { directoryPath, normalizedPath, nodePath: targetNode.path })
          break
        }
      }

      if (targetNode && (targetNode.type === 'directory' || targetNode.type === 'workspaceRoot')) {
        logger.info('加载子目录', { directoryPath, normalizedPath, nodePath: targetNode.path })
        await loadSubDirectory(targetNode)
      } else {
        logger.warn('未找到目录节点或节点类型不正确', {
          directoryPath,
          normalizedPath,
          targetNode: targetNode ? targetNode.type : null
        })
      }
    }

    // 恢复展开状态（使用 Set 的方法更新，保持响应式）
    const currentExpanded = expandedPaths.value
    // 先清除所有，再添加保存的
    currentExpanded.clear()
    savedExpandedPaths.forEach((path) => currentExpanded.add(path))

    // 恢复滚动位置
    restoreScrollPosition(scrollPosition)

    logger.info('refreshDirectoryNode 完成', { directoryPath })
  } catch (err) {
    logger.error('refreshDirectoryNode 失败', { directoryPath, error: err })
    throw err
  } finally {
    // 清除 loading 状态
    loading.value.set(directoryPath, false)
  }
}

// 保存工作文件夹列表
const saveWorkspaceFolders = () => {
  localStorage.setItem('workspaceFolders', JSON.stringify(workspaceFolders.value))
}

// 加载保存的工作文件夹列表（并发处理，但根节点创建是同步的）
const loadWorkspaceFolders = async () => {
  const saved = localStorage.getItem('workspaceFolders')
  if (saved) {
    try {
      const folders = JSON.parse(saved) as string[]

      // 先同步创建所有根节点（不加载内容，避免阻塞）
      const successfulFolders: string[] = []
      for (const folderPath of folders) {
        try {
          // 创建根节点（不立即加载内容，懒加载）
          const folderName = basename(folderPath)
          const rootNode: FileNode = {
            name: folderName,
            path: folderPath,
            type: 'workspaceRoot',
            isWorkspaceRoot: true,
            children: [] // 懒加载：不在这里加载子目录
          }

          workspaceFolderNodes.value.set(folderPath, rootNode)

          // 默认展开，但延迟加载内容
          expandedPaths.value.add(folderPath)

          // 启动目录监听
          startDirectoryWatcher(folderPath)

          successfulFolders.push(folderPath)
        } catch (err) {
          logger.error(`创建工作文件夹根节点失败: ${folderPath}`, err)
        }
      }

      // 更新工作文件夹列表（只包含成功创建的）
      workspaceFolders.value = successfulFolders

      // 如果列表有变化，保存
      if (workspaceFolders.value.length !== folders.length) {
        saveWorkspaceFolders()
      }

      // 并发加载所有已展开的根节点的内容（使用并发池控制并发数量）
      await Promise.all(
        successfulFolders.map((folderPath) => {
          const rootNode = workspaceFolderNodes.value.get(folderPath)
          if (rootNode && expandedPaths.value.has(folderPath)) {
            // 确保已展开的目录启动监听
            startDirectoryWatcher(folderPath)
            return loadWorkspaceFolderChildren(rootNode)
          }
          return Promise.resolve()
        })
      )
    } catch (err) {
      logger.error('加载工作文件夹列表失败:', err)
    }
  }
}

// 刷新所有工作文件夹（并发处理）
const refreshAllWorkspaceFolders = async () => {
  // 使用 Promise.all 并发处理所有工作文件夹
  await Promise.all(workspaceFolders.value.map((folderPath) => refreshWorkspaceFolder(folderPath)))
}

// 加载子目录（懒加载：只加载直接子项，不递归）
const loadSubDirectory = async (node: FileNode) => {
  if (!node.path || (node.type !== 'directory' && node.type !== 'workspaceRoot')) return

  // 先初始化为空数组，立即更新 UI
  node.children = []

  // 使用并发池异步加载目录内容
  const children = await loadDirectoryContent(node.path)

  // 更新节点子项（Vue 会自动响应式更新）
  node.children = children
}

// 切换展开/折叠
const handleToggle = async (node: FileNode) => {
  if (node.type !== 'directory' && node.type !== 'workspaceRoot') return

  if (expandedPaths.value.has(node.path)) {
    // 折叠：停止目录监听
    expandedPaths.value.delete(node.path)
    stopDirectoryWatcher(node.path)
  } else {
    // 展开：启动目录监听
    expandedPaths.value.add(node.path)
    startDirectoryWatcher(node.path)
    // 如果还没有加载子节点，则加载
    if (!node.children || node.children.length === 0) {
      if (node.isWorkspaceRoot) {
        await loadWorkspaceFolderChildren(node)
      } else {
        await loadSubDirectory(node)
      }
    }
  }
}

// 单机打开预览用的延迟定时器（避免与双击冲突）
let previewOpenTimer: ReturnType<typeof setTimeout> | null = null

const handleOpenFilePermanent = (filePath: string) => {
  if (previewOpenTimer) {
    clearTimeout(previewOpenTimer)
    previewOpenTimer = null
  }
  handleOpenFile(filePath, { preview: false })
}

// 打开文件（preview: true 为预览模式，仅一个预览 tab；preview: false 为正式打开）
const handleOpenFile = async (filePath: string, options?: { preview?: boolean }) => {
  const isPreview = options?.preview === true
  const existingTab = workspace.tabs.find((tab) => tab.path === filePath)
  if (existingTab) {
    workspace.activateTab(existingTab.id)
    if (!isPreview) {
      workspace.pinTab(existingTab.id)
    }
    eventBus.emit('open-doc-success', {
      tabId: existingTab.id,
      path: filePath,
      fileName: existingTab.subtitle || existingTab.title
    })
    return
  }

  if (isPreview) {
    const previewTab = workspace.getPreviewTab()
    if (previewTab) {
      await closeTab(previewTab.id)
    }
  }

  try {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      error.value = t('workspaceExplorer.ipcNotAvailable')
      return
    }
    const fileExt = extname(filePath)
    const formatId = formatRegistry.getFormatByExtension(fileExt) || 'txt'
    eventBus.emit('workspace-open-document', {
      path: filePath,
      format: formatId,
      content: '',
      preview: isPreview
    })
  } catch (err) {
    logger.error('打开文件失败:', err)
    error.value = err instanceof Error ? err.message : String(err)
  }
}

// 监听工作文件夹切换事件
const handleToggleWorkspaceExplorer = () => {
  // 这个事件由 LeftMenu 触发，用于切换显示/隐藏
  // 实际逻辑在 ViewMenuContainer 中处理
}

// 启动目录监听
const startDirectoryWatcher = (folderPath: string) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) {
    logger.warn('IPC renderer 不可用，无法启动目录监听')
    return
  }

  try {
    messageBridge.send('watch-directory', folderPath)
    logger.info('启动目录监听', { folderPath })
  } catch (err) {
    logger.error('启动目录监听失败', { folderPath, error: err })
  }
}

// 停止目录监听
const stopDirectoryWatcher = (folderPath: string) => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) {
    return
  }

  try {
    messageBridge.send('unwatch-directory', folderPath)
    logger.info('停止目录监听', { folderPath })
  } catch (err) {
    logger.error('停止目录监听失败', { folderPath, error: err })
  }
}

// 处理目录变化事件
const handleDirectoryChange = async (payload: {
  directoryPath: string
  eventType: string
  filePath: string
}) => {
  const { directoryPath, eventType, filePath } = payload

  if (!refreshService) return

  // 使用刷新服务处理目录变化
  const expandedURIs = new Set(
    Array.from(expandedPaths.value).map((path) => URIUtils.pathToURI(path))
  )
  await refreshService.handleDirectoryChange(
    directoryPath,
    eventType,
    filePath,
    expandedURIs,
    async (dirURI: URI) => {
      const dirPath = URIUtils.uriToPath(dirURI)
      // 如果是工作文件夹根目录，使用 refreshWorkspaceFolder
      if (workspaceFolders.value.includes(dirPath)) {
        await refreshWorkspaceFolder(dirPath)
      } else {
        // 否则刷新对应的目录节点
        await refreshDirectoryNode(dirPath)
      }
    }
  )
}

onMounted(async () => {
  // 加载保存的工作文件夹列表
  await loadWorkspaceFolders()

  // 监听切换事件
  eventBus.on('toggle-workspace-explorer', handleToggleWorkspaceExplorer)

  // 监听目录变化事件（来自主进程）
  const ipcRenderer = getIpcRenderer()
  if (ipcRenderer) {
    messageBridge.on('directory-changed', handleDirectoryChange)
  }
})

onBeforeUnmount(() => {
  // 停止所有目录监听（包括工作文件夹和已展开的子目录）
  for (const folderPath of workspaceFolders.value) {
    stopDirectoryWatcher(folderPath)
  }

  // 停止所有已展开目录的监听
  for (const expandedPath of expandedPaths.value) {
    stopDirectoryWatcher(expandedPath)
  }

  // 移除事件监听
  eventBus.off('toggle-workspace-explorer', handleToggleWorkspaceExplorer)

  const ipcRenderer = getIpcRenderer()
  if (ipcRenderer) {
    messageBridge.removeListener('directory-changed', handleDirectoryChange)
  }

  // 清理 Worker
  cleanupWorker()
})

// 关闭文件 - 使用公共的 closeTab composable
const handleCloseFile = async (tabId: string) => {
  await closeTab(tabId)
}

// 处理节点右键菜单
const handleContextMenu = (event: { node: FileNode; x: number; y: number }) => {
  if (!operations) return
  const node = event.node

  // 右键菜单只触发 focus 和 selection，不打开文件
  if (!node.isWorkspaceRoot) {
    // 设置 focus（右键只 focus，不打开文件）
    focusedPath.value = node.path

    // 使用同步版本，因为这里只是简单的过滤操作
    const allNodesSync = getAllNodesSync()
    const nodeURI = URIUtils.pathToURI(node.path)
    const isCurrentlySelected = operations.selection.value.uris.includes(nodeURI)

    // 如果当前节点不在选中列表中，或者选中列表只有1个或0个项，则选中当前节点
    if (!isCurrentlySelected || operations.selection.value.uris.length <= 1) {
      operations.updateSelection([nodeURI])
      // 更新 lastSelectedIndex
      const currentIndex = allNodesSync.findIndex((n) => n.path === node.path)
      lastSelectedIndex.value = currentIndex >= 0 ? currentIndex : -1
    }
  }

  contextMenuNode.value = node
  contextMenuTargetPath.value = node.path
  contextMenuPosition.value = { x: event.x, y: event.y }
  contextMenuVisible.value = true
}

// 处理空白位置右键菜单
const handleContentContextMenu = (event: MouseEvent) => {
  // 检查是否点击在节点上
  const target = event.target as HTMLElement
  const clickedNode = target.closest('.workspace-tree-node-item')
  const clickedOnScrollbar =
    target.closest('[data-radix-scroll-area-scrollbar]') ||
    target.closest('[data-radix-scroll-area-thumb]')

  // 如果点击在节点上或滚动条上，不处理空白位置右键菜单
  if (clickedNode || clickedOnScrollbar) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  // 空白位置右键时，清空 focus 和 selection
  focusedPath.value = null
  if (operations) {
    operations.clearSelection()
  }

  contextMenuNode.value = null
  // 空白位置右键时，使用第一个工作文件夹作为目标路径
  contextMenuTargetPath.value = workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuVisible.value = true
}

// 处理节点点击（支持多选，实现 selection/focus 分离）
const handleNodeClick = async (event: { node: FileNode; ctrlKey: boolean; shiftKey: boolean }) => {
  if (!operations) return
  const { node, ctrlKey, shiftKey } = event

  // 工作文件夹根节点不可选中，但可以展开/折叠
  if (node.isWorkspaceRoot) {
    return
  }

  // 左键点击时同时设置 focus 和 selection
  // focus 表示当前聚焦的节点（显示边框），selection 表示选中的节点（显示高亮）

  // 使用同步版本，因为这里需要立即获取索引
  const allNodes = getAllNodesSync()
  const currentIndex = allNodes.findIndex((n) => n.path === node.path)
  const nodeURI = URIUtils.pathToURI(node.path)

  let shouldOpenFile = false // 是否应该打开文件

  if (shiftKey && lastSelectedIndex.value >= 0) {
    // Shift 范围选择：不打开文件，但设置 focus
    focusedPath.value = node.path
    const start = Math.min(lastSelectedIndex.value, currentIndex)
    const end = Math.max(lastSelectedIndex.value, currentIndex)
    const urisToAdd: URI[] = []
    for (let i = start; i <= end; i++) {
      if (allNodes[i] && !allNodes[i].isWorkspaceRoot) {
        urisToAdd.push(URIUtils.pathToURI(allNodes[i].path))
      }
    }
    // 添加所有范围内的节点到选择中
    urisToAdd.forEach((uri) => operations.addSelection(uri))
    lastSelectedIndex.value = currentIndex
  } else if (ctrlKey) {
    // Ctrl 多选：不打开文件，但设置 focus
    focusedPath.value = node.path
    if (operations.selection.value.uris.includes(nodeURI)) {
      operations.removeSelection(nodeURI)
      // 如果清空了所有选择，重置 lastSelectedIndex 和 focus
      if (operations.selection.value.uris.length === 0) {
        lastSelectedIndex.value = -1
        focusedPath.value = null
      }
    } else {
      operations.addSelection(nodeURI)
      lastSelectedIndex.value = currentIndex
    }
  } else {
    // 单选：清空原来的选择，选中当前节点，并设置 focus
    focusedPath.value = node.path
    operations.updateSelection([nodeURI])
    lastSelectedIndex.value = currentIndex

    if (node.type === 'file') {
      shouldOpenFile = true
    }
  }

  // 单机打开文件：延迟执行预览打开，以便双击时可取消并改为正式打开
  if (shouldOpenFile) {
    if (previewOpenTimer) {
      clearTimeout(previewOpenTimer)
      previewOpenTimer = null
    }
    previewOpenTimer = setTimeout(() => {
      previewOpenTimer = null
      handleOpenFile(node.path, { preview: true })
    }, 280)
  }
}

// 处理右键菜单命令
const handleContextMenuCommand = async (command: string) => {
  const node = contextMenuNode.value
  const ipcRenderer = getIpcRenderer()

  if (!ipcRenderer) {
    error.value = t('workspaceExplorer.ipcNotAvailable')
    return
  }

  try {
    switch (command) {
      case 'open':
        if (node && node.type === 'file') {
          // 检查是否有选中的文件列表
          const allNodesSync = getAllNodesSync()
          const selectedFilePaths = Array.from(selectedPaths.value).filter((path) => {
            const foundNode = allNodesSync.find((n) => n.path === path && n.type === 'file')
            return foundNode !== undefined
          })

          // 如果右键的文件在选中列表中，打开所有选中的文件
          if (selectedFilePaths.length > 0 && selectedFilePaths.includes(node.path)) {
            // 打开所有选中的文件
            for (const filePath of selectedFilePaths) {
              await handleOpenFile(filePath)
            }
          } else {
            // 如果没有选中文档，或者右键的文件不在选中列表中，只打开右键的文件
            await handleOpenFile(node.path)
          }
        }
        break
      case 'cut':
        await handleCut(node)
        break
      case 'copy':
        await handleCopy(node)
        break
      case 'paste':
        if (!operations || !operations.hasClipboardContent()) return
        // 如果右键的是工作文件夹节点，使用该节点的路径；否则使用 contextMenuTargetPath 或第一个工作文件夹
        let pasteTargetPath: string | null = null
        if (node && node.isWorkspaceRoot) {
          pasteTargetPath = node.path
        } else {
          pasteTargetPath =
            contextMenuTargetPath.value ||
            (workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null)
        }
        if (!pasteTargetPath) return
        await handlePaste(pasteTargetPath)
        break
      case 'rename':
        if (node) {
          renameTargetPath.value = node.path
          renameName.value = node.name
          renameDialogVisible.value = true
        }
        break
      case 'delete':
        await handleDelete(node)
        break
      case 'copyPath':
        if (node) {
          await navigator.clipboard.writeText(node.path)
          eventBus.emit('show-success', { message: t('workspaceExplorer.copyPathSuccess') })
        }
        break
      case 'copyRelativePath':
        if (node) {
          const workspacePath = findWorkspaceFolderForPath(node.path)
          if (workspacePath) {
            const relativePath = relative(workspacePath, node.path)
            await navigator.clipboard.writeText(relativePath)
            eventBus.emit('show-success', {
              message: t('workspaceExplorer.copyRelativePathSuccess')
            })
          }
        }
        break
      case 'showInFolder':
        if (node) {
          await messageBridge.invoke('show-item-in-folder', node.path)
        }
        break
      case 'openFolder':
        if (node && (node.type === 'directory' || node.isWorkspaceRoot)) {
          await messageBridge.invoke('show-item-in-folder', node.path)
        }
        break
      case 'newFile':
        // 如果右键的是工作文件夹节点或目录节点，使用该节点的路径；否则使用 contextMenuTargetPath 或第一个工作文件夹
        if (node && (node.isWorkspaceRoot || node.type === 'directory')) {
          newFileParentPath.value = node.path
        } else {
          newFileParentPath.value =
            contextMenuTargetPath.value ||
            (workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null)
        }
        newFileName.value = ''
        newFileDialogVisible.value = true
        break
      case 'newFolder':
        // 如果右键的是工作文件夹节点或目录节点，使用该节点的路径；否则使用 contextMenuTargetPath 或第一个工作文件夹
        if (node && (node.isWorkspaceRoot || node.type === 'directory')) {
          newFolderParentPath.value = node.path
        } else {
          newFolderParentPath.value =
            contextMenuTargetPath.value ||
            (workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null)
        }
        newFolderName.value = ''
        newFolderDialogVisible.value = true
        break
      case 'refresh':
        if (node) {
          // 如果是工作文件夹根节点，使用 refreshWorkspaceFolder
          if (node.isWorkspaceRoot) {
            await refreshWorkspaceFolder(node.path)
          } else if (node.type === 'directory') {
            // 如果是普通目录，刷新该目录
            await refreshDirectoryNode(node.path)
          }
          eventBus.emit('show-success', { message: t('workspaceExplorer.refreshSuccess') })
        }
        break
    }
  } catch (err) {
    logger.error('执行右键菜单命令失败:', err)
    eventBus.emit('show-error', { message: err instanceof Error ? err.message : String(err) })
  }
}

// 处理复制
const handleCopy = async (node: FileNode | null) => {
  if (!operations) return

  if (selectedPaths.value.size > 0) {
    // 批量复制选中的项
    const uris = Array.from(selectedPaths.value).map((path) => URIUtils.pathToURI(path))
    operations.copy(uris)
  } else if (node) {
    // 单个复制
    const uri = URIUtils.pathToURI(node.path)
    operations.copy([uri])
  }
}

// 处理剪切
const handleCut = async (node: FileNode | null) => {
  if (!operations) return

  if (selectedPaths.value.size > 0) {
    // 批量剪切选中的项
    const uris = Array.from(selectedPaths.value).map((path) => URIUtils.pathToURI(path))
    operations.cut(uris)
  } else if (node) {
    // 单个剪切
    const uri = URIUtils.pathToURI(node.path)
    operations.cut([uri])
  }
}

// 处理粘贴（支持批量）
const handlePaste = async (targetPathParam: string | null) => {
  if (!operations || !ipcRenderer) return
  if (!operations.hasClipboardContent()) return
  if (!targetPathParam && workspaceFolders.value.length === 0) return

  try {
    let targetDir = targetPathParam || workspaceFolders.value[0]

    // 检查目标路径是否存在
    const exists = (await messageBridge.invoke('check-path-exists', targetDir)) as boolean
    if (exists) {
      // 检查是否为目录
      try {
        await messageBridge.invoke('read-directory', targetDir)
        // 是目录，直接使用
      } catch {
        // 不是目录，使用其父目录
        targetDir = dirname(targetDir)
      }
    } else {
      // 如果路径不存在，使用第一个工作文件夹
      if (workspaceFolders.value.length > 0) {
        targetDir = workspaceFolders.value[0]
      } else {
        throw new Error('无法确定粘贴目标目录')
      }
    }

    const targetDirURI = URIUtils.pathToURI(targetDir)

    // 使用新的操作模型执行粘贴
    const pastedURIs = await operations.paste(targetDirURI)

    // 刷新目标目录
    await refreshDirectoryNode(targetDir)

    // 选中粘贴后生成的文件（已在 operations.paste 中处理）
    if (pastedURIs.length > 0) {
      // 更新 lastSelectedIndex
      const allNodes = getAllNodesSync()
      const lastPastedPath = URIUtils.uriToPath(pastedURIs[pastedURIs.length - 1])
      const lastIndex = allNodes.findIndex((n) => n.path === lastPastedPath)
      if (operations) {
        operations.lastSelectedIndex.value = lastIndex >= 0 ? lastIndex : -1
      }
    }
  } catch (err) {
    logger.error('粘贴失败:', err)
    // 错误已在 operations.paste 中处理
  }
}

// 序列化节点树为普通对象（用于传递给 Worker）
// 只序列化已展开的文件夹，折叠的文件夹不序列化其子节点（即使已加载）
// 优化：避免递归调用，使用迭代方式减少函数调用开销
const serializeNodeTree = (node: FileNode, expandedPathsSet: Set<string>): FileNode => {
  const isExpanded = expandedPathsSet.has(node.path)
  const isFolder = node.type === 'directory' || node.type === 'workspaceRoot'

  // 如果节点没有子节点或者是文件，直接返回
  if (!node.children || (!isFolder && !isExpanded)) {
    return {
      name: node.name,
      path: node.path,
      type: node.type,
      isWorkspaceRoot: node.isWorkspaceRoot,
      children: undefined
    }
  }

  // 对于文件夹：只有展开时才序列化其子节点
  if (isExpanded && isFolder && node.children) {
    const serializedChildren: FileNode[] = []

    // 使用 for 循环而不是 map，减少函数调用开销
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      const childIsFolder = child.type === 'directory' || child.type === 'workspaceRoot'
      const childIsExpanded = expandedPathsSet.has(child.path)

      if (childIsFolder && !childIsExpanded) {
        // 折叠的文件夹：只序列化本身，不序列化子节点
        serializedChildren.push({
          name: child.name,
          path: child.path,
          type: child.type,
          isWorkspaceRoot: child.isWorkspaceRoot,
          children: undefined
        })
      } else {
        // 文件或展开的文件夹：递归序列化
        serializedChildren.push(serializeNodeTree(child, expandedPathsSet))
      }
    }

    return {
      name: node.name,
      path: node.path,
      type: node.type,
      isWorkspaceRoot: node.isWorkspaceRoot,
      children: serializedChildren
    }
  }

  // 折叠的文件夹：只返回本身
  return {
    name: node.name,
    path: node.path,
    type: node.type,
    isWorkspaceRoot: node.isWorkspaceRoot,
    children: undefined
  }
}

// 获取所有节点（包括子节点）- 优化：直接使用同步版本，避免序列化和 Worker 通信开销
// 对于300个节点，同步遍历非常快，使用 Worker 反而会增加开销
const getAllNodes = async (): Promise<FileNode[]> => {
  // 直接使用同步版本，因为：
  // 1. 只遍历已展开的节点，数量通常不会太多
  // 2. 同步遍历很快，不会造成明显卡顿
  // 3. 避免序列化和 Worker 通信的开销
  return getAllNodesSync()
}

// 同步版本的 getAllNodes（用于简单场景，如果节点数量少）
// 只遍历已展开的文件夹，折叠的文件夹不遍历其子节点
// 优化：使用迭代而不是递归，减少函数调用开销
const getAllNodesSync = (): FileNode[] => {
  const allNodes: FileNode[] = []
  const expandedPathsSet = expandedPaths.value

  // 使用栈进行迭代遍历，避免递归调用开销
  const stack: FileNode[] = []

  // 将所有根节点加入栈
  for (const rootNode of workspaceFolderNodes.value.values()) {
    allNodes.push(rootNode)
    const rootIsExpanded = expandedPathsSet.has(rootNode.path)
    if (rootIsExpanded && rootNode.children) {
      // 将子节点逆序加入栈（这样遍历时是正序）
      for (let i = rootNode.children.length - 1; i >= 0; i--) {
        stack.push(rootNode.children[i])
      }
    }
  }

  // 迭代处理栈中的节点
  while (stack.length > 0) {
    const node = stack.pop()!
    allNodes.push(node)

    // 只有文件夹节点且展开时，才处理其子节点
    const isFolder = node.type === 'directory' || node.type === 'workspaceRoot'
    const isExpanded = expandedPathsSet.has(node.path)

    if (isFolder && isExpanded && node.children) {
      // 将子节点逆序加入栈
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i])
      }
    }
  }

  return allNodes
}

// 查找文件/文件夹所在的工作文件夹
const findWorkspaceFolderForPath = (filePath: string): string | null => {
  for (const workspacePath of workspaceFolders.value) {
    if (filePath.startsWith(workspacePath)) {
      return workspacePath
    }
  }
  return null
}

// 刷新包含指定路径的目录（只刷新受影响的目录，而不是整个工作文件夹）
const refreshWorkspaceFolderForPath = async (filePath: string) => {
  // 找到文件/文件夹所在的目录
  const targetDir = dirname(filePath)

  // 刷新该目录（refreshDirectoryNode 内部已经处理了状态保存和恢复）
  await refreshDirectoryNode(targetDir)
}

// 处理删除（支持单个或批量）
const handleDelete = async (node: FileNode | null) => {
  if (!operations || !ipcRenderer) return

  let urisToDelete: string[] = []

  if (selectedPaths.value.size > 0) {
    // 批量删除选中的项
    urisToDelete = Array.from(selectedPaths.value).map((path) => URIUtils.pathToURI(path))
  } else if (node) {
    // 单个删除
    urisToDelete = [URIUtils.pathToURI(node.path)]
  } else {
    return
  }

  // 收集需要刷新的目录（在删除前收集）
  const directoriesToRefresh = new Set<string>()
  for (const uri of urisToDelete) {
    const path = URIUtils.uriToPath(uri)
    // 获取目录路径（dirname 返回正斜杠，需要转换为 Windows 格式）
    const dirPath = dirname(path)
    // 规范化路径格式：Windows 路径统一使用反斜杠，Unix 路径使用正斜杠
    // 判断是否为 Windows 路径（以盘符开头）
    const normalizedDirPath = /^[A-Za-z]:/.test(dirPath) ? dirPath.replace(/\//g, '\\') : dirPath
    directoriesToRefresh.add(normalizedDirPath)

    // 如果删除的是当前打开的文件，关闭对应的标签
    const tab = workspace.tabs.find((t) => t.path === path)
    if (tab) {
      workspace.removeTab(tab.id)
    }
  }

  // 使用新的操作模型执行删除
  const success = await operations.deleteItems(urisToDelete, async () => {
    // 删除前回调：可以在这里做额外处理
  })

  logger.info('删除操作完成', { success, directoriesToRefresh: Array.from(directoriesToRefresh) })

  // 无论删除成功与否，都尝试刷新受影响的目录（确保 UI 同步）
  // 因为即使部分删除失败，已删除的项目也应该从 UI 中移除
  // 注意：删除操作是异步的，executor.execute 会等待所有步骤完成，所以这里可以直接刷新
  // 使用与粘贴操作相同的刷新方式，确保一致性（粘贴操作没有延迟，直接刷新）
  const refreshPromises = Array.from(directoriesToRefresh).map(async (dirPath) => {
    try {
      logger.info('开始刷新目录', { dirPath })
      // 直接刷新目录节点（与粘贴操作使用相同的方法，不延迟）
      await refreshDirectoryNode(dirPath)
      logger.info('目录刷新完成', { dirPath })
    } catch (err) {
      logger.error(`刷新目录失败: ${dirPath}`, err)
    }
  })
  await Promise.all(refreshPromises)
  logger.info('所有目录刷新完成')
}

// 处理重命名
const handleRenameConfirm = async () => {
  if (!renameTargetPath.value || !renameName.value.trim()) return
  if (!operations || !ipcRenderer) return

  try {
    const oldURI = URIUtils.pathToURI(renameTargetPath.value)
    const newURI = await operations.rename(oldURI, renameName.value.trim())

    if (newURI) {
      const newPath = URIUtils.uriToPath(newURI)

      // 如果重命名的是当前打开的文件，更新标签路径
      const tab = workspace.tabs.find((t) => t.path === renameTargetPath.value)
      if (tab) {
        tab.path = newPath
        const doc = workspace.documents[tab.id]
        if (doc) {
          doc.path = newPath
        }
      }

      // 刷新相关的工作文件夹
      await refreshWorkspaceFolderForPath(renameTargetPath.value)

      handleRenameDialogClose()
    }
  } catch (err) {
    logger.error('重命名失败:', err)
    // 错误已在 operations.rename 中处理
  }
}

const handleRenameDialogClose = () => {
  renameDialogVisible.value = false
  renameName.value = ''
  renameTargetPath.value = null
}

// 处理新建文件
const handleNewFileConfirm = async () => {
  if (!newFileParentPath.value || !newFileName.value.trim()) return

  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return

  try {
    // 确保文件名有扩展名
    let fileName = newFileName.value.trim()
    if (!fileName.includes('.')) {
      // 如果没有扩展名，使用 Markdown 格式的默认扩展名（从 formatRegistry 获取）
      const mdFormat = formatRegistry.getFormat('md')
      const defaultExtension = mdFormat?.defaultExtension || '.md'
      fileName = fileName + defaultExtension
    }

    const filePath = await messageBridge.invoke('create-file', {
      parentPath: newFileParentPath.value,
      fileName,
      content: ''
    })

    // 刷新相关的工作文件夹
    await refreshWorkspaceFolderForPath(newFileParentPath.value)

    // 清除选中状态
    selectedPaths.value.clear()
    lastSelectedIndex.value = -1

    handleNewFileDialogClose()
    eventBus.emit('show-success', { message: t('workspaceExplorer.newFileSuccess') })

    // 自动打开新文件
    await handleOpenFile(filePath)
  } catch (err) {
    logger.error('新建文件失败:', err)
    eventBus.emit('show-error', { message: err instanceof Error ? err.message : String(err) })
  }
}

const handleNewFileDialogClose = () => {
  newFileDialogVisible.value = false
  newFileName.value = ''
  newFileParentPath.value = null
}

// 处理新建文件夹
const handleNewFolderConfirm = async () => {
  if (!newFolderParentPath.value || !newFolderName.value.trim()) return

  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return

  try {
    await messageBridge.invoke('create-directory', {
      parentPath: newFolderParentPath.value,
      folderName: newFolderName.value.trim()
    })

    // 刷新相关的工作文件夹
    await refreshWorkspaceFolderForPath(newFolderParentPath.value)

    // 清除选中状态
    selectedPaths.value.clear()
    lastSelectedIndex.value = -1

    handleNewFolderDialogClose()
    eventBus.emit('show-success', { message: t('workspaceExplorer.newFolderSuccess') })
  } catch (err) {
    logger.error('新建文件夹失败:', err)
    eventBus.emit('show-error', { message: err instanceof Error ? err.message : String(err) })
  }
}

const handleNewFolderDialogClose = () => {
  newFolderDialogVisible.value = false
  newFolderName.value = ''
  newFolderParentPath.value = null
}

// 处理焦点
const handleFocus = () => {
  isFocused.value = true
}

const handleBlur = () => {
  isFocused.value = false
  // 失去焦点时不清空选择（保持 selection 状态）
  // 只有在点击空白处时才清空选择
}

// 处理拖拽开始
const handleDragStart = (event: { node: FileNode; event: DragEvent }) => {
  if (!operations) return

  const { node } = event

  // 收集要拖拽的 URI（选中的项，如果没有选中则拖拽当前节点）
  const urisToDrag: URI[] = []
  if (selectedPaths.value.size > 0) {
    // 批量拖拽选中的项
    urisToDrag.push(...Array.from(selectedPaths.value).map((path) => URIUtils.pathToURI(path)))
  } else if (!node.isWorkspaceRoot) {
    // 单个拖拽
    urisToDrag.push(URIUtils.pathToURI(node.path))
  }

  if (urisToDrag.length === 0) {
    event.event.preventDefault()
    return
  }

  // 保存拖拽的 URI
  draggingURIs.value = urisToDrag

  // 设置拖拽数据
  if (event.event.dataTransfer) {
    event.event.dataTransfer.effectAllowed = 'move'
    event.event.dataTransfer.setData('application/json', JSON.stringify(urisToDrag))
  }

  logger.info('开始拖拽', { uris: urisToDrag })
}

// 处理拖拽悬停（在节点上）
const handleDragOver = (event: { node: FileNode; event: DragEvent }) => {
  if (!operations || draggingURIs.value.length === 0) return

  const { node, event: dragEvent } = event

  // 只有目录节点可以作为拖拽目标
  if (node.type === 'directory' || node.isWorkspaceRoot) {
    dragEvent.preventDefault()
    dragEvent.stopPropagation()

    if (dragEvent.dataTransfer) {
      dragEvent.dataTransfer.dropEffect = 'move'
    }

    // 检查是否可以将源移动到目标（不能移动到自己的子目录）
    const targetURI = URIUtils.pathToURI(node.path)
    const canDrop = draggingURIs.value.every((sourceURI) => {
      // 不能移动到自己的子目录
      if (URIUtils.isSubPath(sourceURI, targetURI)) {
        return false
      }
      // 如果目标就是源所在的目录，直接取消操作（不报错）
      const sourceDirURI = URIUtils.dirname(sourceURI)
      if (sourceDirURI === targetURI) {
        return false
      }
      // 不能移动到源目录本身
      return sourceURI !== targetURI
    })

    if (canDrop) {
      dragTargetPath.value = node.path
    } else {
      dragTargetPath.value = null
      if (dragEvent.dataTransfer) {
        dragEvent.dataTransfer.dropEffect = 'none'
      }
    }
  }
}

// 处理拖拽离开（从节点上）
const handleDragLeave = (event: { node: FileNode; event: DragEvent }) => {
  // 延迟清除高亮，避免快速移动时闪烁
  // 检查 relatedTarget 是否还在树节点内，如果是则不清除
  const relatedTarget = event.event.relatedTarget as HTMLElement | null
  if (relatedTarget && relatedTarget.closest('.workspace-tree-node')) {
    return // 如果移动到另一个节点，不清除高亮
  }

  setTimeout(() => {
    // 再次检查，确保没有移动到其他节点
    if (dragTargetPath.value === event.node.path) {
      dragTargetPath.value = null
    }
  }, 100)
}

// 处理拖拽释放（在节点上）
const handleDrop = async (event: { node: FileNode; event: DragEvent }) => {
  if (!operations || !ipcRenderer || draggingURIs.value.length === 0) return

  const { node, event: dragEvent } = event

  dragEvent.preventDefault()
  dragEvent.stopPropagation()

  // 只有目录节点可以作为拖拽目标
  if (node.type !== 'directory' && !node.isWorkspaceRoot) {
    dragTargetPath.value = null
    draggingURIs.value = []
    return
  }

  const targetURI = URIUtils.pathToURI(node.path)

  // 检查是否可以将源移动到目标
  const canDrop = draggingURIs.value.every((sourceURI) => {
    // 不能移动到自己的子目录
    if (URIUtils.isSubPath(sourceURI, targetURI)) {
      return false
    }
    // 如果目标就是源所在的目录，直接取消操作（不报错）
    const sourceDirURI = URIUtils.dirname(sourceURI)
    if (sourceDirURI === targetURI) {
      return false
    }
    // 不能移动到源目录本身
    return sourceURI !== targetURI
  })

  if (!canDrop) {
    // 检查是否是移动到当前目录（如果是，静默取消，不显示警告）
    const isMovingToCurrentDir = draggingURIs.value.every((sourceURI) => {
      const sourceDirURI = URIUtils.dirname(sourceURI)
      return sourceDirURI === targetURI
    })

    if (!isMovingToCurrentDir) {
      eventBus.emit('show-warning', { message: '不能将文件/文件夹移动到自己的子目录中' })
    }
    dragTargetPath.value = null
    draggingURIs.value = []
    return
  }

  // 执行移动操作
  try {
    await performMoveOperation(draggingURIs.value, targetURI)
  } catch (err) {
    logger.error('拖拽移动失败:', err)
    eventBus.emit('show-error', { message: err instanceof Error ? err.message : String(err) })
  } finally {
    dragTargetPath.value = null
    draggingURIs.value = []
  }
}

// 处理拖拽悬停（在展开目录的文件区域）
const handleContentDragOver = (event: DragEvent) => {
  if (!operations || draggingURIs.value.length === 0) return

  // 检查是否在展开目录的文件区域
  const target = event.target as HTMLElement
  const treeNode = target.closest('.workspace-tree-node') as HTMLElement | null
  if (!treeNode) return

  // 查找最近的展开目录节点（向上遍历）
  let currentNode: HTMLElement | null = treeNode
  while (currentNode) {
    const nodeItem = currentNode.querySelector('.workspace-tree-node-item') as HTMLElement | null
    if (nodeItem) {
      const nodePath = nodeItem.getAttribute('data-path')
      if (nodePath) {
        // 检查是否是展开的目录
        const isExpanded = expandedPaths.value.has(nodePath)
        const nodeType =
          nodeItem.classList.contains('is-directory') ||
          nodeItem.classList.contains('is-workspace-root')

        if (isExpanded && nodeType) {
          event.preventDefault()
          event.stopPropagation()

          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move'
          }

          // 检查是否可以移动
          const targetURI = URIUtils.pathToURI(nodePath)
          const canDrop = draggingURIs.value.every((sourceURI) => {
            // 不能移动到自己的子目录
            if (URIUtils.isSubPath(sourceURI, targetURI)) {
              return false
            }
            // 如果目标就是源所在的目录，直接取消操作（不报错）
            const sourceDirURI = URIUtils.dirname(sourceURI)
            if (sourceDirURI === targetURI) {
              return false
            }
            // 不能移动到源目录本身
            return sourceURI !== targetURI
          })

          if (canDrop) {
            dragTargetPath.value = nodePath
          } else {
            dragTargetPath.value = null
            if (event.dataTransfer) {
              event.dataTransfer.dropEffect = 'none'
            }
          }
          return
        }
      }
    }
    // 向上查找父节点
    currentNode = currentNode.parentElement?.closest('.workspace-tree-node') as HTMLElement | null
  }
}

// 处理拖拽离开（从展开目录的文件区域）
const handleContentDragLeave = (event: DragEvent) => {
  // 延迟清除高亮，避免快速移动时闪烁
  const relatedTarget = event.relatedTarget as HTMLElement | null
  if (relatedTarget && relatedTarget.closest('.workspace-tree-node')) {
    return // 如果移动到另一个节点，不清除高亮
  }

  setTimeout(() => {
    // 再次检查，确保没有移动到其他节点
    const finalRelatedTarget = event.relatedTarget as HTMLElement | null
    if (!finalRelatedTarget || !finalRelatedTarget.closest('.workspace-tree-node')) {
      dragTargetPath.value = null
    }
  }, 100)
}

// 处理拖拽释放（在展开目录的文件区域）
const handleContentDrop = async (event: DragEvent) => {
  if (!operations || !ipcRenderer || draggingURIs.value.length === 0) return

  event.preventDefault()
  event.stopPropagation()

  // 查找最近的展开目录节点（向上遍历）
  const target = event.target as HTMLElement
  const treeNode = target.closest('.workspace-tree-node') as HTMLElement | null
  if (!treeNode) {
    dragTargetPath.value = null
    draggingURIs.value = []
    return
  }

  let currentNode: HTMLElement | null = treeNode
  while (currentNode) {
    const nodeItem = currentNode.querySelector('.workspace-tree-node-item') as HTMLElement | null
    if (nodeItem) {
      const nodePath = nodeItem.getAttribute('data-path')
      if (nodePath) {
        const isExpanded = expandedPaths.value.has(nodePath)
        const nodeType =
          nodeItem.classList.contains('is-directory') ||
          nodeItem.classList.contains('is-workspace-root')

        if (isExpanded && nodeType) {
          const targetURI = URIUtils.pathToURI(nodePath)

          // 检查是否可以移动
          const canDrop = draggingURIs.value.every((sourceURI) => {
            if (URIUtils.isSubPath(sourceURI, targetURI)) {
              return false
            }
            return sourceURI !== targetURI
          })

          if (!canDrop) {
            eventBus.emit('show-warning', { message: '不能将文件/文件夹移动到自己的子目录中' })
            dragTargetPath.value = null
            draggingURIs.value = []
            return
          }

          // 执行移动操作
          try {
            await performMoveOperation(draggingURIs.value, targetURI)
          } catch (err) {
            logger.error('拖拽移动失败:', err)
            eventBus.emit('show-error', {
              message: err instanceof Error ? err.message : String(err)
            })
          } finally {
            dragTargetPath.value = null
            draggingURIs.value = []
          }
          return
        }
      }
    }
    // 向上查找父节点
    currentNode = currentNode.parentElement?.closest('.workspace-tree-node') as HTMLElement | null
  }

  dragTargetPath.value = null
  draggingURIs.value = []
}

// 执行移动操作
const performMoveOperation = async (sourceURIs: URI[], targetDirURI: URI) => {
  if (!operations || !ipcRenderer) return

  try {
    // 动态导入 FSPlanner 和 FSExecutor
    const { FSPlanner } = await import('../utils/workspace/fs-planner')
    const { FSExecutor } = await import('../utils/workspace/fs-executor')

    const planner = new FSPlanner(ipcRenderer)
    const executor = new FSExecutor(ipcRenderer)

    // 为每个源生成移动步骤
    const steps: Array<{ type: 'move'; from: URI; to: URI }> = []

    for (const sourceURI of sourceURIs) {
      const sourcePath = URIUtils.uriToPath(sourceURI)
      const sourceName = URIUtils.basename(sourceURI)

      // 构建目标 URI
      const targetURI = URIUtils.join(targetDirURI, sourceName)

      // 检查是否可以将源移动到目标
      if (URIUtils.isSubPath(sourceURI, targetDirURI)) {
        throw new Error(`不能将目录移动到自己的子目录中: ${sourcePath}`)
      }

      // 如果目标就是源所在的目录，直接跳过（不报错）
      const sourceDirURI = URIUtils.dirname(sourceURI)
      if (sourceDirURI === targetDirURI) {
        logger.info('目标目录就是源目录，跳过移动', { sourceURI, targetDirURI })
        continue
      }

      steps.push({
        type: 'move',
        from: sourceURI,
        to: targetURI
      })
    }

    const plan = { steps }

    // 执行移动计划
    const result = await executor.execute(plan)

    if (!result.success) {
      const errorMsg = result.errors?.[0]?.error.message || '移动失败'
      eventBus.emit('show-error', { message: errorMsg })
      return
    }

    // 更新选择（选中移动后的文件）
    if (result.createdURIs && result.createdURIs.length > 0) {
      operations.updateSelection(result.createdURIs)
    }

    // 刷新目标目录
    const targetPath = URIUtils.uriToPath(targetDirURI)
    await refreshDirectoryNode(targetPath)

    // 刷新源目录（如果源和目标不在同一目录）
    const sourceDirs = new Set<string>()
    for (const sourceURI of sourceURIs) {
      const sourcePath = URIUtils.uriToPath(sourceURI)
      sourceDirs.add(dirname(sourcePath))
    }

    for (const sourceDir of sourceDirs) {
      if (sourceDir !== targetPath) {
        await refreshDirectoryNode(sourceDir)
      }
    }

    eventBus.emit('show-success', { message: `已移动 ${sourceURIs.length} 项` })
  } catch (error) {
    logger.error('移动操作失败:', error)
    throw error
  }
}

// 处理拖拽结束
const handleDragEnd = (event: DragEvent) => {
  // 清除拖拽状态
  dragTargetPath.value = null
  draggingURIs.value = []
}

// 处理键盘快捷键
const handleKeyDown = async (event: KeyboardEvent) => {
  // 检查是否在输入框或文本区域中
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  if (!isFocused.value) return

  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return

  // Ctrl+A: 全选
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    event.stopPropagation()
    await handleSelectAll()
    return
  }

  // Ctrl+C: 复制
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    event.preventDefault()
    event.stopPropagation()
    if (selectedPaths.value.size > 0) {
      await handleCopy(null)
      // 成功消息已在 operations.copy 中显示
    }
    return
  }

  // Ctrl+X: 剪切
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
    event.preventDefault()
    event.stopPropagation()
    if (selectedPaths.value.size > 0) {
      await handleCut(null)
      // 成功消息已在 operations.cut 中显示
    }
    return
  }

  // Ctrl+V: 粘贴
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
    event.preventDefault()
    event.stopPropagation()
    if (operations && operations.hasClipboardContent()) {
      // 如果没有选中文件夹，使用剪贴板中源文件所在的目录作为目标目录
      let targetPath: string | null = null

      // 检查是否有选中的文件夹节点
      if (selectedPaths.value.size > 0) {
        const allNodes = getAllNodesSync()
        const selectedNode = allNodes.find(
          (n) => selectedPaths.value.has(n.path) && (n.type === 'directory' || n.isWorkspaceRoot)
        )
        if (selectedNode) {
          targetPath = selectedNode.path
        }
      }

      // 如果没有选中文件夹，使用剪贴板中第一个源文件所在的目录
      if (!targetPath) {
        // 通过 clipboardService 直接获取 payload
        const { ClipboardService } = await import('../utils/workspace/clipboard-service')
        const clipboardService = ClipboardService.getInstance()
        const clipboardPayload = clipboardService.getPayload()
        if (clipboardPayload && clipboardPayload.sources.length > 0) {
          const firstSourceURI = clipboardPayload.sources[0]
          const firstSourcePath = URIUtils.uriToPath(firstSourceURI)
          targetPath = dirname(firstSourcePath)
        }
      }

      // 如果还是没有目标路径，使用第一个工作文件夹
      if (!targetPath && workspaceFolders.value.length > 0) {
        targetPath = workspaceFolders.value[0]
      }

      if (targetPath) {
        await handlePaste(targetPath)
        // 成功消息已在 operations.paste 中显示
      }
    }
    return
  }

  // Delete: 删除
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    event.stopPropagation()
    if (selectedPaths.value.size > 0) {
      await handleDelete(null)
    }
    return
  }
}

// 全选 - 优化：批量添加，减少 Vue 响应式更新开销
const handleSelectAll = async () => {
  if (!operations) return

  // 先收集所有节点
  const allNodes = getAllNodesSync()

  // 使用新的操作模型
  operations.selectAll(
    allNodes.map((node) => ({
      uri: URIUtils.pathToURI(node.path),
      isWorkspaceRoot: node.isWorkspaceRoot
    }))
  )
}
</script>

<style scoped>
.workspace-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: v-bind('themeState.currentTheme.editorToolbarBackgroundColor');
  border-right: 1px solid var(--el-border-color-lighter, #f0f0f0);
  outline: none;
}

.workspace-explorer:focus {
  outline: none;
}

.workspace-explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter, #f0f0f0);
  font-size: 13px;
  font-weight: 600;
  min-height: 32px;
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.workspace-explorer-title {
  color: v-bind('themeState.currentTheme.SideTextColor');
  user-select: none;
}

.workspace-explorer-actions {
  display: flex;
  gap: 4px;
}

.workspace-action-icon {
  width: 16px;
  height: 16px;
  display: block;
}

.workspace-explorer-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.custom-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.custom-empty-description {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.workspace-explorer-main {
  background-color: v-bind('themeState.currentTheme.background2nd');
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.workspace-explorer-tree {
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 1; /* 确保 el-scrollbar 容器有 z-index，sticky 元素在其内部 */
}

/* 确保 el-scrollbar 的滚动条在 sticky 元素之上 */
.workspace-explorer-tree :deep(.el-scrollbar__bar) {
  z-index: 10; /* 滚动条的 z-index 应该高于所有 sticky 元素 */
}

.workspace-explorer-loading,
.workspace-explorer-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.workspace-explorer-content {
  padding: 0;
  min-height: 100%;
}

.workspace-explorer-content:empty {
  min-height: 0;
}

.workspace-explorer-opened-files {
  border-top: 1px solid var(--el-border-color-lighter, #f0f0f0);
  max-height: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background-color: v-bind('themeState.currentTheme.editorToolbarBackgroundColor');
}

.opened-files-scrollbar {
  flex: 1;
  min-height: 0;
  max-height: calc(200px - 40px); /* 减去header高度 */
}

.opened-files-header {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.SideTextColor');
  background-color: v-bind('themeState.currentTheme.background2nd');
  border-bottom: 1px solid var(--el-border-color-lighter, #f0f0f0);
  user-select: none;
}

.opened-files-list {
  padding: 4px 0;
  display: flex;
  flex-direction: column-reverse;
}

.opened-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 8px;
  font-size: 13px;
  color: v-bind('themeState.currentTheme.SideTextColor');
  cursor: pointer;
  min-height: 20px;
  gap: 4px;
}

.opened-file-item:hover {
  background-color: v-bind('hoverColor');
}

.opened-file-item.is-active {
  background-color: v-bind('activeTabBackgroundColor');
  color: v-bind('themeState.currentTheme.SideTextColor');
}

.opened-file-item.is-active:hover {
  background-color: v-bind('activeTabBackgroundColor');
}

.opened-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.opened-file-close {
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.opened-file-item:hover .opened-file-close {
  opacity: 1;
}

.opened-file-item.is-active .opened-file-close {
  opacity: 1;
}

/* Logo 容器样式 */
.logo-container {
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform 0.3s ease;
  cursor: pointer;
  margin: 0 auto;
}

.logo-container:hover {
  transform: scale(1.2);
}

/* 摇晃时也应用 scale(1.2)，transition 会平滑过渡 */
.logo-container.shake {
  transform: scale(1.2);
}

.logo-container.shake:hover {
  transform: scale(1.2);
}

.logo-animation-wrapper {
  display: inline-block;
}

.logo-image {
  width: 80px;
  height: 80px;
  display: block;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15));
}

/* 摇晃动画 - 只包含位移和旋转，scale 由外层容器处理 */
@keyframes shake {
  0%,
  100% {
    transform: translateX(0) rotate(0deg);
  }
  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-10px) rotate(-5deg);
  }
  20%,
  40%,
  60%,
  80% {
    transform: translateX(10px) rotate(5deg);
  }
}

/* 摇晃时内层容器应用动画 */
.logo-container.shake .logo-animation-wrapper {
  animation: shake 1.5s ease-in-out;
}
</style>
