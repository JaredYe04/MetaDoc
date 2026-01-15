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
        <el-button
          v-if="workspaceFolders.length > 0"
          text
          size="small"
          @click="refreshAllWorkspaceFolders"
          :title="$t('workspaceExplorer.refresh')"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button
          text
          size="small"
          @click="addWorkspaceFolder"
          :title="$t('workspaceExplorer.addFolder')"
        >
          <el-icon><FolderOpened /></el-icon>
        </el-button>
      </div>
    </div>
    <div v-if="workspaceFolders.length === 0" class="workspace-explorer-empty">
      <el-empty :description="$t('workspaceExplorer.noWorkspaceFolder')" :image-size="80">
        <el-button type="primary" @click="addWorkspaceFolder">
          {{ $t('workspaceExplorer.addFolder') }}
        </el-button>
      </el-empty>
    </div>
    <div v-else class="workspace-explorer-main">
      <el-scrollbar class="workspace-explorer-tree" @contextmenu.prevent="handleContentContextMenu">
        <div
          class="workspace-explorer-content"
          @contextmenu.prevent="handleContentContextMenu"
        >
          <template v-for="(folderPath, index) in workspaceFolders" :key="folderPath">
            <WorkspaceTreeNode
              v-if="workspaceFolderNodes.get(folderPath)"
              :node="workspaceFolderNodes.get(folderPath)!"
              :sibling-index="index"
              :expanded-paths="expandedPaths"
              :workspace-folder="folderPath"
              :selected-paths="selectedPaths"
              :last-selected-index="lastSelectedIndex"
              @toggle="handleToggle"
              @open-file="handleOpenFile"
              @context-menu="handleContextMenu"
              @node-click="handleNodeClick"
              @close-workspace="removeWorkspaceFolder"
            />
          </template>
        </div>
      </el-scrollbar>
    </div>
    <!-- 已打开文件列表（始终显示，如果有打开的文件） -->
    <div v-if="openedFiles.length > 0" class="workspace-explorer-opened-files">
      <div class="opened-files-header">
        <span class="opened-files-title">{{ $t('workspaceExplorer.openedFiles') }}</span>
      </div>
      <el-scrollbar class="opened-files-scrollbar">
        <div class="opened-files-list">
          <div
            v-for="tab in openedFiles"
            :key="tab.id"
            class="opened-file-item"
            :class="{ 'is-active': tab.id === workspace.activeTabId.value }"
            @click="workspace.activateTab(tab.id)"
          >
            <span class="opened-file-name" :title="tab.path">{{ tab.subtitle || tab.title }}</span>
            <el-button
              text
              size="small"
              class="opened-file-close"
              @click.stop="handleCloseFile(tab.id)"
              :title="$t('workspaceExplorer.closeFile')"
            >
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>
      </el-scrollbar>
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
    <el-dialog
      v-model="renameDialogVisible"
      :title="$t('workspaceExplorer.renameDialog.title')"
      width="400px"
      @close="handleRenameDialogClose"
    >
      <el-form>
        <el-form-item :label="$t('workspaceExplorer.renameDialog.name')">
          <el-input
            v-model="renameName"
            :placeholder="$t('workspaceExplorer.renameDialog.placeholder')"
            @keyup.enter="handleRenameConfirm"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handleRenameDialogClose">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleRenameConfirm">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
    <!-- 新建文件对话框 -->
    <el-dialog
      v-model="newFileDialogVisible"
      :title="$t('workspaceExplorer.newFileDialog.title')"
      width="400px"
      @close="handleNewFileDialogClose"
    >
      <el-form>
        <el-form-item :label="$t('workspaceExplorer.newFileDialog.name')">
          <el-input
            v-model="newFileName"
            :placeholder="$t('workspaceExplorer.newFileDialog.placeholder')"
            @keyup.enter="handleNewFileConfirm"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handleNewFileDialogClose">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleNewFileConfirm">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
    <!-- 新建文件夹对话框 -->
    <el-dialog
      v-model="newFolderDialogVisible"
      :title="$t('workspaceExplorer.newFolderDialog.title')"
      width="400px"
      @close="handleNewFolderDialogClose"
    >
      <el-form>
        <el-form-item :label="$t('workspaceExplorer.newFolderDialog.name')">
          <el-input
            v-model="newFolderName"
            :placeholder="$t('workspaceExplorer.newFolderDialog.placeholder')"
            @keyup.enter="handleNewFolderConfirm"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handleNewFolderDialogClose">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleNewFolderConfirm">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, FolderOpened, Loading, Warning, Close } from '@element-plus/icons-vue'
import { ElButton, ElIcon, ElEmpty, ElScrollbar, ElMessageBox, ElMessage } from 'element-plus'
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

const { t } = useI18n()
const logger = createRendererLogger('WorkspaceExplorer')
const workspace = useWorkspace()
const { closeTab } = useCloseTab()

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

// 已打开文件列表
const openedFiles = computed(() => {
  return workspace.tabs.filter(tab => tab.kind === 'file' && tab.path)
})

// 右键菜单相关
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuNode = ref<FileNode | null>(null)
const contextMenuTargetPath = ref<string | null>(null) // 空白位置右键时的目标路径
const clipboardPaths = ref<string[]>([]) // 支持批量复制/剪切
const clipboardOperation = ref<'cut' | 'copy' | null>(null)
const isFocused = ref(false) // 组件是否获得焦点

// 多选相关
const selectedPaths = ref<Set<string>>(new Set())
const lastSelectedIndex = ref<number>(-1) // 上次选中的节点在 treeNodes 中的索引

// 构建右键菜单项
const contextMenuItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = []
  const node = contextMenuNode.value

  // 空白位置右键菜单（没有选中节点）
  if (!node) {
    // 粘贴
    if (clipboardPaths.value.length > 0) {
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

  // 工作文件夹根节点菜单：新建文件、新建文件夹、粘贴
  if (node.isWorkspaceRoot) {
    // 粘贴（如果有剪贴板内容）
    if (clipboardPaths.value.length > 0) {
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
  if (clipboardPaths.value.length > 0) {
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

  // 工作文件夹根节点也添加刷新选项
  if (node.isWorkspaceRoot) {
    items.push({
      type: 'divider'
    })
    items.push({
      type: 'action',
      value: 'refresh',
      label: 'workspaceExplorer.contextMenu.refresh'
    })
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

// 处理容器点击，确保获得焦点
const handleContainerClick = (event: MouseEvent) => {
  // 如果点击的不是按钮或输入框，让组件获得焦点
  const target = event.target as HTMLElement
  if (!target.closest('button') && !target.closest('input') && !target.closest('.el-dialog')) {
    workspaceExplorerRef.value?.focus()
  }
}

// 计算悬停颜色
const hoverColor = computed(() => {
  return mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.SideTextColor, 0.15)
})

// 计算活跃 Tab 背景色（不高亮背景色与 #777777 混合 0.5）
const activeTabBackgroundColor = computed(() => {
  // 使用 editorToolbarBackgroundColor（不高亮背景色）与 #777777 混合
  const baseBg = themeState.currentTheme.editorToolbarBackgroundColor || themeState.currentTheme.background2nd
  return mixColors(baseBg, '#777777', 0.3)
})

// 获取 IPC renderer
const getIpcRenderer = () => {
  if (window && (window as any).electron) {
    return (window as any).electron.ipcRenderer
  }
  return null
}

// 添加工作文件夹
const addWorkspaceFolder = async () => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) {
    error.value = t('workspaceExplorer.ipcNotAvailable')
    return
  }

  try {
    const result = await ipcRenderer.invoke('show-open-dialog', {
      title: t('workspaceExplorer.selectFolder'),
      properties: ['openDirectory']
    }) as { canceled: boolean; filePaths?: string[] }

    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      const newFolder = result.filePaths[0]
      
      // 检查是否已存在
      if (workspaceFolders.value.includes(newFolder)) {
        ElMessage.warning(t('workspaceExplorer.folderAlreadyAdded'))
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
      const entries = await ipcRenderer.invoke('read-directory', nodePath) as Array<{ name: string; path: string; isDirectory: boolean }>
      
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
        const entries = await ipcRenderer.invoke('read-directory', nodePath) as Array<{ name: string; path: string; isDirectory: boolean }>
        return processDirectoryContentInMainThread(entries)
      } catch (fallbackErr) {
        logger.error('主线程回退处理也失败:', fallbackErr)
        return []
      }
    }
  })
}

// 主线程处理目录内容（作为回退方案）
const processDirectoryContentInMainThread = (entries: Array<{ name: string; path: string; isDirectory: boolean }>): FileNode[] => {
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
  const rootNode = workspaceFolderNodes.value.get(folderPath)
  if (rootNode) {
    await loadWorkspaceFolderChildren(rootNode)
  }
}

// 刷新指定目录节点（用于子目录）
const refreshDirectoryNode = async (directoryPath: string) => {
  // 在所有节点中查找对应的目录节点
  const allNodes = getAllNodesSync()
  const targetNode = allNodes.find(n => n.path === directoryPath && (n.type === 'directory' || n.type === 'workspaceRoot'))
  
  if (targetNode) {
    await loadSubDirectory(targetNode)
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
        successfulFolders.map(folderPath => {
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
  await Promise.all(
    workspaceFolders.value.map(folderPath => refreshWorkspaceFolder(folderPath))
  )
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

// 打开文件
const handleOpenFile = async (filePath: string) => {
  // 检查文件是否已经在 Tab 中打开
  const existingTab = workspace.tabs.find(tab => tab.path === filePath)
  if (existingTab) {
    workspace.activateTab(existingTab.id)
    // 即使文件已经在 Tab 中打开，也应该更新 recent-docs
    // 触发 open-doc-success 事件以统一处理逻辑
    eventBus.emit('open-doc-success', {
      tabId: existingTab.id,
      path: filePath,
      fileName: existingTab.subtitle || existingTab.title
    })
    return
  }

  // 通过扩展名检测格式并打开文件（不读取文件内容进行检测）
  try {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      error.value = t('workspaceExplorer.ipcNotAvailable')
      return
    }

    // 只通过扩展名检测格式，不读取文件内容进行检测
    const fileExt = extname(filePath)
    const formatId = formatRegistry.getFormatByExtension(fileExt) || 'txt'
    
    // 通过事件总线打开文件（让接收方负责读取文件内容）
    // 这样避免在这里读取文件内容，减少开销
    eventBus.emit('workspace-open-document', {
      path: filePath,
      format: formatId,
      content: '' // 不在这里读取内容，让接收方读取
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
    ipcRenderer.send('watch-directory', folderPath)
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
    ipcRenderer.send('unwatch-directory', folderPath)
    logger.info('停止目录监听', { folderPath })
  } catch (err) {
    logger.error('停止目录监听失败', { folderPath, error: err })
  }
}

// 处理目录变化事件
const handleDirectoryChange = async (payload: { directoryPath: string; eventType: string; filePath: string }) => {
  const { directoryPath, eventType, filePath } = payload
  
  // 检查是否是已展开的目录（包括工作文件夹根目录和子目录）
  const isExpanded = expandedPaths.value.has(directoryPath)
  if (!isExpanded) {
    // 如果目录未展开，不需要刷新
    return
  }

  logger.debug('目录变化', { directoryPath, eventType, filePath })

  // 防抖：延迟刷新，避免频繁刷新
  if (loading.value.get(directoryPath)) {
    return
  }

  // 延迟刷新，给文件系统一些时间稳定
  setTimeout(async () => {
    // 如果是工作文件夹根目录，使用 refreshWorkspaceFolder
    if (workspaceFolders.value.includes(directoryPath)) {
      await refreshWorkspaceFolder(directoryPath)
    } else {
      // 否则刷新对应的目录节点
      await refreshDirectoryNode(directoryPath)
    }
  }, 300)
}

onMounted(async () => {
  // 加载保存的工作文件夹列表
  await loadWorkspaceFolders()

  // 监听切换事件
  eventBus.on('toggle-workspace-explorer', handleToggleWorkspaceExplorer)

  // 监听目录变化事件（来自主进程）
  const ipcRenderer = getIpcRenderer()
  if (ipcRenderer) {
    ipcRenderer.on('directory-changed', handleDirectoryChange)
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
    ipcRenderer.removeListener('directory-changed', handleDirectoryChange)
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
  const node = event.node
  
  // 如果右键的是文件，且当前没有选中文档或只选中一个文档，则取消选中，选中当前右键的文档
  if (node.type === 'file') {
    // 使用同步版本，因为这里只是简单的过滤操作
    const allNodesSync = getAllNodesSync()
    const selectedFilePaths = Array.from(selectedPaths.value).filter(path => {
      const foundNode = allNodesSync.find(n => n.path === path && n.type === 'file')
      return foundNode !== undefined
    })
    
    // 如果没有选中文档或只选中一个文档，则选中当前右键的文档
    if (selectedFilePaths.length <= 1) {
      selectedPaths.value.clear()
      selectedPaths.value.add(node.path)
      // 更新 lastSelectedIndex
      const currentIndex = allNodesSync.findIndex(n => n.path === node.path)
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
  const clickedOnScrollbar = target.closest('.el-scrollbar__bar') || target.closest('.el-scrollbar__thumb')
  
  // 如果点击在节点上或滚动条上，不处理空白位置右键菜单
  if (clickedNode || clickedOnScrollbar) {
    return
  }
  
  event.preventDefault()
  event.stopPropagation()
  contextMenuNode.value = null
  // 空白位置右键时，使用第一个工作文件夹作为目标路径
  contextMenuTargetPath.value = workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuVisible.value = true
}

// 处理节点点击（支持多选）
const handleNodeClick = async (event: { node: FileNode; ctrlKey: boolean; shiftKey: boolean }) => {
  const { node, ctrlKey, shiftKey } = event
  // 使用同步版本，因为这里需要立即获取索引
  const allNodes = getAllNodesSync()
  const currentIndex = allNodes.findIndex(n => n.path === node.path)

  if (shiftKey && lastSelectedIndex.value >= 0) {
    // Shift 范围选择
    const start = Math.min(lastSelectedIndex.value, currentIndex)
    const end = Math.max(lastSelectedIndex.value, currentIndex)
    for (let i = start; i <= end; i++) {
      if (allNodes[i] && !allNodes[i].isWorkspaceRoot) {
        selectedPaths.value.add(allNodes[i].path)
      }
    }
    lastSelectedIndex.value = currentIndex
  } else if (ctrlKey) {
    // Ctrl 多选（切换选中状态）
    if (selectedPaths.value.has(node.path)) {
      selectedPaths.value.delete(node.path)
    } else {
      selectedPaths.value.add(node.path)
    }
    lastSelectedIndex.value = currentIndex
  } else {
    // 单选：如果点击的是已选中的节点，则取消选择；否则选中并执行操作
    if (selectedPaths.value.has(node.path)) {
      // 如果当前节点已选中，取消选择
      selectedPaths.value.delete(node.path)
      lastSelectedIndex.value = -1
    } else {
      // 清除原先的选择，选中当前节点
      selectedPaths.value.clear()
      selectedPaths.value.add(node.path)
      lastSelectedIndex.value = currentIndex
      
      // 执行默认操作：文件打开，目录只选中不展开/折叠（展开/折叠由图标点击处理）
      if (node.type === 'file') {
        await handleOpenFile(node.path)
      }
      // 目录点击只选中，不展开/折叠（展开/折叠由图标点击处理）
    }
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
          const selectedFilePaths = Array.from(selectedPaths.value).filter(path => {
            const foundNode = allNodesSync.find(n => n.path === path && n.type === 'file')
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
        if (clipboardPaths.value.length === 0 || !clipboardOperation.value) return
        // 如果右键的是工作文件夹节点，使用该节点的路径；否则使用 contextMenuTargetPath 或第一个工作文件夹
        let pasteTargetPath: string | null = null
        if (node && node.isWorkspaceRoot) {
          pasteTargetPath = node.path
        } else {
          pasteTargetPath = contextMenuTargetPath.value || (workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null)
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
          ElMessage.success(t('workspaceExplorer.copyPathSuccess'))
        }
        break
      case 'copyRelativePath':
        if (node) {
          const workspacePath = findWorkspaceFolderForPath(node.path)
          if (workspacePath) {
            const relativePath = relative(workspacePath, node.path)
            await navigator.clipboard.writeText(relativePath)
            ElMessage.success(t('workspaceExplorer.copyRelativePathSuccess'))
          }
        }
        break
      case 'showInFolder':
        if (node) {
          await ipcRenderer.invoke('show-item-in-folder', node.path)
        }
        break
      case 'newFile':
        // 如果右键的是工作文件夹节点或目录节点，使用该节点的路径；否则使用 contextMenuTargetPath 或第一个工作文件夹
        if (node && (node.isWorkspaceRoot || node.type === 'directory')) {
          newFileParentPath.value = node.path
        } else {
          newFileParentPath.value = contextMenuTargetPath.value || (workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null)
        }
        newFileName.value = ''
        newFileDialogVisible.value = true
        break
      case 'newFolder':
        // 如果右键的是工作文件夹节点或目录节点，使用该节点的路径；否则使用 contextMenuTargetPath 或第一个工作文件夹
        if (node && (node.isWorkspaceRoot || node.type === 'directory')) {
          newFolderParentPath.value = node.path
        } else {
          newFolderParentPath.value = contextMenuTargetPath.value || (workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null)
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
          ElMessage.success(t('workspaceExplorer.refreshSuccess'))
        }
        break
    }
  } catch (err) {
    logger.error('执行右键菜单命令失败:', err)
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

// 处理复制
const handleCopy = async (node: FileNode | null) => {
  if (selectedPaths.value.size > 0) {
    // 批量复制选中的项
    clipboardPaths.value = Array.from(selectedPaths.value)
    clipboardOperation.value = 'copy'
  } else if (node) {
    // 单个复制
    clipboardPaths.value = [node.path]
    clipboardOperation.value = 'copy'
  }
}

// 处理剪切
const handleCut = async (node: FileNode | null) => {
  if (selectedPaths.value.size > 0) {
    // 批量剪切选中的项
    clipboardPaths.value = Array.from(selectedPaths.value)
    clipboardOperation.value = 'cut'
  } else if (node) {
    // 单个剪切
    clipboardPaths.value = [node.path]
    clipboardOperation.value = 'cut'
  }
}

// 处理粘贴（支持批量）
const handlePaste = async (targetPathParam: string | null) => {
  if (clipboardPaths.value.length === 0 || !clipboardOperation.value) return
  if (!targetPathParam && workspaceFolders.value.length === 0) return

  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return

  try {
    let targetDir = targetPathParam || workspaceFolders.value[0]
    
    // 检查目标路径是否存在
    const exists = await ipcRenderer.invoke('check-path-exists', targetDir) as boolean
    if (exists) {
      // 检查是否为目录
      const isDir = await ipcRenderer.invoke('check-path-is-directory', targetDir) as boolean
      if (!isDir) {
        // 如果是文件，使用其父目录
        targetDir = dirname(targetDir)
      }
    } else {
      // 如果路径不存在（空白位置右键或传入的是不存在的路径），使用第一个工作文件夹
      if (workspaceFolders.value.length > 0) {
        targetDir = workspaceFolders.value[0]
      } else {
        throw new Error('无法确定粘贴目标目录')
      }
    }

    // 批量粘贴 - 分批处理，避免一次性操作太多文件
    const BATCH_SIZE = 10 // 每批处理 10 个文件
    const pathsToPaste = clipboardPaths.value
    
    for (let i = 0; i < pathsToPaste.length; i += BATCH_SIZE) {
      const batch = pathsToPaste.slice(i, i + BATCH_SIZE)
      
      // 并发处理当前批次
      await Promise.all(batch.map(async (sourcePath) => {
        // 获取源文件/文件夹名称
        const sourceName = basename(sourcePath)
        let finalTargetPath = join(targetDir, sourceName)

        // 检查目标路径是否存在，如果存在则添加序号
        let counter = 1
        while (await ipcRenderer.invoke('check-path-exists', finalTargetPath) as boolean) {
          const ext = extname(sourceName)
          const baseNameWithoutExt = sourceName.substring(0, sourceName.length - ext.length)
          const newName = `${baseNameWithoutExt} (${counter})${ext}`
          finalTargetPath = join(targetDir, newName)
          counter++
        }

        if (clipboardOperation.value === 'cut') {
          // 移动
          await ipcRenderer.invoke('move-file-or-folder', {
            sourcePath,
            targetPath: finalTargetPath
          })
        } else {
          // 复制
          await ipcRenderer.invoke('copy-file-or-folder', {
            sourcePath,
            targetPath: finalTargetPath
          })
        }
      }))
      
      // 如果不是最后一批，让出执行权，允许 UI 更新
      if (i + BATCH_SIZE < pathsToPaste.length) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    // 如果是剪切操作，清空剪贴板
    if (clipboardOperation.value === 'cut') {
      clipboardPaths.value = []
      clipboardOperation.value = null
    }

    // 清除选中状态
    selectedPaths.value.clear()
    lastSelectedIndex.value = -1

    // 刷新相关的工作文件夹
    await refreshWorkspaceFolderForPath(targetDir)
  } catch (err) {
    logger.error('粘贴失败:', err)
    throw err
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

// 刷新包含指定路径的工作文件夹
const refreshWorkspaceFolderForPath = async (filePath: string) => {
  const workspacePath = findWorkspaceFolderForPath(filePath)
  if (workspacePath) {
    await refreshWorkspaceFolder(workspacePath)
  }
}

// 处理删除（支持单个或批量）
const handleDelete = async (node: FileNode | null) => {
  const pathsToDelete: string[] = []
  const namesToDelete: string[] = []

  if (selectedPaths.value.size > 0) {
    // 批量删除选中的项
    const allNodesSync = getAllNodesSync()
    for (const path of selectedPaths.value) {
      const foundNode = allNodesSync.find(n => n.path === path)
      if (foundNode) {
        pathsToDelete.push(path)
        namesToDelete.push(foundNode.name)
      }
    }
  } else if (node) {
    // 单个删除
    pathsToDelete.push(node.path)
    namesToDelete.push(node.name)
  } else {
    return
  }

  try {
    const nameList = namesToDelete.length > 1 
      ? `${namesToDelete.slice(0, 3).join('、')}${namesToDelete.length > 3 ? ` 等 ${namesToDelete.length} 项` : ''}`
      : namesToDelete[0]
    
    await ElMessageBox.confirm(
      t('workspaceExplorer.deleteConfirm', { name: nameList }),
      t('workspaceExplorer.deleteTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) return

    // 批量删除
    for (const path of pathsToDelete) {
      await ipcRenderer.invoke('delete-file-or-folder', path)
      
      // 如果删除的是当前打开的文件，关闭对应的标签
      const tab = workspace.tabs.find(t => t.path === path)
      if (tab) {
        workspace.removeTab(tab.id)
      }
    }

    // 清除选中状态
    selectedPaths.value.clear()
    lastSelectedIndex.value = -1

    // 刷新相关的工作文件夹
    for (const path of pathsToDelete) {
      await refreshWorkspaceFolderForPath(path)
    }

    ElMessage.success(t('workspaceExplorer.deleteSuccess'))
  } catch (err) {
    if (err !== 'cancel') {
      logger.error('删除失败:', err)
      ElMessage.error(err instanceof Error ? err.message : String(err))
    }
  }
}

// 处理重命名
const handleRenameConfirm = async () => {
  if (!renameTargetPath.value || !renameName.value.trim()) return

  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return

  try {
    const newPath = await ipcRenderer.invoke('rename-file-or-folder', {
      oldPath: renameTargetPath.value,
      newName: renameName.value.trim()
    })

    // 如果重命名的是当前打开的文件，更新标签路径
    const tab = workspace.tabs.find(t => t.path === renameTargetPath.value)
    if (tab) {
      tab.path = newPath
      const doc = workspace.documents[tab.id]
      if (doc) {
        doc.path = newPath
      }
    }

    // 清除选中状态
    selectedPaths.value.clear()
    lastSelectedIndex.value = -1

    // 刷新相关的工作文件夹
    await refreshWorkspaceFolderForPath(renameTargetPath.value)

    handleRenameDialogClose()
    ElMessage.success(t('workspaceExplorer.renameSuccess'))
  } catch (err) {
    logger.error('重命名失败:', err)
    ElMessage.error(err instanceof Error ? err.message : String(err))
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

    const filePath = await ipcRenderer.invoke('create-file', {
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
    ElMessage.success(t('workspaceExplorer.newFileSuccess'))

    // 自动打开新文件
    await handleOpenFile(filePath)
  } catch (err) {
    logger.error('新建文件失败:', err)
    ElMessage.error(err instanceof Error ? err.message : String(err))
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
    await ipcRenderer.invoke('create-directory', {
      parentPath: newFolderParentPath.value,
      folderName: newFolderName.value.trim()
    })

    // 刷新相关的工作文件夹
    await refreshWorkspaceFolderForPath(newFolderParentPath.value)

    // 清除选中状态
    selectedPaths.value.clear()
    lastSelectedIndex.value = -1

    handleNewFolderDialogClose()
    ElMessage.success(t('workspaceExplorer.newFolderSuccess'))
  } catch (err) {
    logger.error('新建文件夹失败:', err)
    ElMessage.error(err instanceof Error ? err.message : String(err))
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
      ElMessage.success(t('workspaceExplorer.copySuccess', { count: selectedPaths.value.size }))
    }
    return
  }

  // Ctrl+X: 剪切
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
    event.preventDefault()
    event.stopPropagation()
    if (selectedPaths.value.size > 0) {
      await handleCut(null)
      ElMessage.success(t('workspaceExplorer.cutSuccess', { count: selectedPaths.value.size }))
    }
    return
  }

  // Ctrl+V: 粘贴
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
    event.preventDefault()
    event.stopPropagation()
    if (clipboardPaths.value.length > 0 && clipboardOperation.value) {
      const targetPath = workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null
      if (targetPath) {
        await handlePaste(targetPath)
        ElMessage.success(t('workspaceExplorer.pasteSuccess', { count: clipboardPaths.value.length }))
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
  // 先收集所有路径，然后一次性更新，减少响应式更新次数
  const allNodes = getAllNodesSync()
  const pathsToSelect = new Set<string>()
  
  // 收集所有需要选中的路径
  for (const node of allNodes) {
    // 工作文件夹根节点不可选中
    if (!node.isWorkspaceRoot) {
      pathsToSelect.add(node.path)
    }
  }
  
  // 一次性更新选中状态，只触发一次响应式更新
  selectedPaths.value = pathsToSelect
  
  if (allNodes.length > 0) {
    const lastNode = allNodes[allNodes.length - 1]
    lastSelectedIndex.value = allNodes.findIndex(n => n.path === lastNode.path)
  }
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

.workspace-explorer-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.workspace-explorer-main {
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
  padding: 4px 0;
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
</style>

