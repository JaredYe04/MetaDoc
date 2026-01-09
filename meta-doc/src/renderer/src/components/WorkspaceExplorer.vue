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
          <template v-for="folderPath in workspaceFolders" :key="folderPath">
            <WorkspaceTreeNode
              v-if="workspaceFolderNodes.get(folderPath)"
              :node="workspaceFolderNodes.get(folderPath)!"
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

const { t } = useI18n()
const logger = createRendererLogger('WorkspaceExplorer')
const workspace = useWorkspace()
const { closeTab } = useCloseTab()

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

// 加载工作文件夹的子目录
const loadWorkspaceFolderChildren = async (rootNode: FileNode) => {
  if (!rootNode.path) return

  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return

  try {
    const entries = await ipcRenderer.invoke('read-directory', rootNode.path) as Array<{ name: string; path: string; isDirectory: boolean }>
    
    const children: FileNode[] = []
    const dirs: FileNode[] = []
    const files: FileNode[] = []

    for (const entry of entries) {
      const child: FileNode = {
        name: entry.name,
        path: entry.path,
        type: entry.isDirectory ? 'directory' : 'file'
      }

      // 只显示 md 和 tex 文件
      if (entry.isDirectory) {
        dirs.push(child)
      } else {
        const ext = entry.name.split('.').pop()?.toLowerCase()
        if (ext === 'md' || ext === 'tex') {
          files.push(child)
        }
      }
    }

    // 排序：目录在前，文件在后，都按名称排序
    dirs.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))
    children.push(...dirs, ...files)

    rootNode.children = children
  } catch (err) {
    logger.error('加载工作文件夹子目录失败:', err)
  }
}

// 刷新指定工作文件夹
const refreshWorkspaceFolder = async (folderPath: string) => {
  const rootNode = workspaceFolderNodes.value.get(folderPath)
  if (rootNode) {
    await loadWorkspaceFolderChildren(rootNode)
  }
}

// 保存工作文件夹列表
const saveWorkspaceFolders = () => {
  localStorage.setItem('workspaceFolders', JSON.stringify(workspaceFolders.value))
}

// 加载保存的工作文件夹列表
const loadWorkspaceFolders = async () => {
  const saved = localStorage.getItem('workspaceFolders')
  if (saved) {
    try {
      const folders = JSON.parse(saved) as string[]
      
      // 先为每个工作文件夹创建根节点
      for (const folderPath of folders) {
        try {
          await createWorkspaceRootNode(folderPath)
          startDirectoryWatcher(folderPath)
        } catch (err) {
          logger.error(`加载工作文件夹失败: ${folderPath}`, err)
          // 如果某个文件夹加载失败，继续加载其他文件夹
        }
      }
      
      // 所有节点创建完成后再添加到列表（只添加成功创建的）
      workspaceFolders.value = folders.filter(folderPath => workspaceFolderNodes.value.has(folderPath))
      
      // 如果列表有变化，保存
      if (workspaceFolders.value.length !== folders.length) {
        saveWorkspaceFolders()
      }
    } catch (err) {
      logger.error('加载工作文件夹列表失败:', err)
    }
  }
}

// 刷新所有工作文件夹
const refreshAllWorkspaceFolders = async () => {
  for (const folderPath of workspaceFolders.value) {
    await refreshWorkspaceFolder(folderPath)
  }
}

// 加载子目录（递归查找节点）
const loadSubDirectory = async (node: FileNode) => {
  if (!node.path || (node.type !== 'directory' && node.type !== 'workspaceRoot')) return

  try {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      throw new Error(t('workspaceExplorer.ipcNotAvailable'))
    }

    const entries = await ipcRenderer.invoke('read-directory', node.path) as Array<{ name: string; path: string; isDirectory: boolean }>
    const children: FileNode[] = []
    const dirs: FileNode[] = []
    const files: FileNode[] = []

    for (const entry of entries) {
      const child: FileNode = {
        name: entry.name,
        path: entry.path,
        type: entry.isDirectory ? 'directory' : 'file'
      }

      if (entry.isDirectory) {
        dirs.push(child)
      } else {
        const ext = entry.name.split('.').pop()?.toLowerCase()
        if (ext === 'md' || ext === 'tex') {
          files.push(child)
        }
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))
    children.push(...dirs, ...files)

    node.children = children
  } catch (err) {
    logger.error('加载子目录失败:', err)
  }
}

// 切换展开/折叠
const handleToggle = async (node: FileNode) => {
  if (node.type !== 'directory' && node.type !== 'workspaceRoot') return

  if (expandedPaths.value.has(node.path)) {
    expandedPaths.value.delete(node.path)
  } else {
    expandedPaths.value.add(node.path)
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

  // 读取文件内容并通过事件总线打开文件
  try {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      error.value = t('workspaceExplorer.ipcNotAvailable')
      return
    }

    const content = await ipcRenderer.invoke('read-file-content', filePath) as string | null
    if (content === null) {
      error.value = t('workspaceExplorer.fileNotFound')
      return
    }

    const format = filePath.endsWith('.tex') ? 'tex' : 'md'
    
    // 通过事件总线打开文件
    eventBus.emit('workspace-open-document', {
      path: filePath,
      format,
      content
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
  
  // 检查是否是某个工作文件夹的变化
  if (!workspaceFolders.value.includes(directoryPath)) {
    return
  }

  logger.debug('目录变化', { directoryPath, eventType, filePath })

  // 防抖：延迟刷新，避免频繁刷新
  if (loading.value.get(directoryPath)) {
    return
  }

  // 延迟刷新，给文件系统一些时间稳定
  setTimeout(async () => {
    await refreshWorkspaceFolder(directoryPath)
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
  // 停止所有目录监听
  for (const folderPath of workspaceFolders.value) {
    stopDirectoryWatcher(folderPath)
  }

  // 移除事件监听
  eventBus.off('toggle-workspace-explorer', handleToggleWorkspaceExplorer)
  
  const ipcRenderer = getIpcRenderer()
  if (ipcRenderer) {
    ipcRenderer.removeListener('directory-changed', handleDirectoryChange)
  }
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
    const selectedFilePaths = Array.from(selectedPaths.value).filter(path => {
      const foundNode = getAllNodes().find(n => n.path === path && n.type === 'file')
      return foundNode !== undefined
    })
    
    // 如果没有选中文档或只选中一个文档，则选中当前右键的文档
    if (selectedFilePaths.length <= 1) {
      selectedPaths.value.clear()
      selectedPaths.value.add(node.path)
      // 更新 lastSelectedIndex
      const allNodes = getAllNodes()
      const currentIndex = allNodes.findIndex(n => n.path === node.path)
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
  const allNodes = getAllNodes()
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
          const selectedFilePaths = Array.from(selectedPaths.value).filter(path => {
            const foundNode = getAllNodes().find(n => n.path === path && n.type === 'file')
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
        const pasteTargetPath = contextMenuTargetPath.value || (workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null)
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
        newFileParentPath.value = contextMenuTargetPath.value || (workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null)
        newFileName.value = ''
        newFileDialogVisible.value = true
        break
      case 'newFolder':
        newFolderParentPath.value = contextMenuTargetPath.value || (workspaceFolders.value.length > 0 ? workspaceFolders.value[0] : null)
        newFolderName.value = ''
        newFolderDialogVisible.value = true
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

    // 批量粘贴
    for (const sourcePath of clipboardPaths.value) {
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

// 获取所有节点（包括子节点）
const getAllNodes = (): FileNode[] => {
  const allNodes: FileNode[] = []
  
  const traverse = (nodes: FileNode[]) => {
    for (const node of nodes) {
      allNodes.push(node)
      if (node.children) {
        traverse(node.children)
      }
    }
  }
  
  // 遍历所有工作文件夹根节点
  for (const rootNode of workspaceFolderNodes.value.values()) {
    allNodes.push(rootNode)
    if (rootNode.children) {
      traverse(rootNode.children)
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
    for (const path of selectedPaths.value) {
      const foundNode = getAllNodes().find(n => n.path === path)
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
    if (!fileName.endsWith('.md') && !fileName.endsWith('.tex')) {
      fileName = fileName + '.md' // 默认使用 .md
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
    handleSelectAll()
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

// 全选
const handleSelectAll = () => {
  selectedPaths.value.clear()
  const allNodes = getAllNodes()
  for (const node of allNodes) {
    // 工作文件夹根节点不可选中
    if (!node.isWorkspaceRoot) {
      selectedPaths.value.add(node.path)
    }
  }
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

