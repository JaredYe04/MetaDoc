<template>
  <div class="workspace-explorer">
    <div class="workspace-explorer-header">
      <span class="workspace-explorer-title">{{ $t('workspaceExplorer.title') }}</span>
      <div class="workspace-explorer-actions">
        <el-button
          v-if="workspaceFolder"
          text
          size="small"
          @click="refreshFolder"
          :title="$t('workspaceExplorer.refresh')"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button
          text
          size="small"
          @click="openWorkspaceFolder"
          :title="$t('workspaceExplorer.openFolder')"
        >
          <el-icon><FolderOpened /></el-icon>
        </el-button>
      </div>
    </div>
    <div v-if="!workspaceFolder" class="workspace-explorer-empty">
      <el-empty :description="$t('workspaceExplorer.noWorkspaceFolder')" :image-size="80">
        <el-button type="primary" @click="openWorkspaceFolder">
          {{ $t('workspaceExplorer.openFolder') }}
        </el-button>
      </el-empty>
    </div>
    <el-scrollbar v-else class="workspace-explorer-tree">
      <div v-if="loading" class="workspace-explorer-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ $t('workspaceExplorer.loading') }}</span>
      </div>
      <div v-else-if="error" class="workspace-explorer-error">
        <el-icon><Warning /></el-icon>
        <span>{{ error }}</span>
      </div>
      <div v-else class="workspace-explorer-content">
        <WorkspaceTreeNode
          v-for="node in treeNodes"
          :key="node.path"
          :node="node"
          :expanded-paths="expandedPaths"
          @toggle="handleToggle"
          @open-file="handleOpenFile"
        />
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh, FolderOpened, Loading, Warning } from '@element-plus/icons-vue'
import { ElButton, ElIcon, ElEmpty, ElScrollbar } from 'element-plus'
import eventBus from '../utils/event-bus'
import { useWorkspace } from '../stores/workspace'
import { createRendererLogger } from '../utils/logger'
import { themeState } from '../utils/themes'
import WorkspaceTreeNode from './WorkspaceTreeNode.vue'

const { t } = useI18n()
const logger = createRendererLogger('WorkspaceExplorer')
const workspace = useWorkspace()

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  expanded?: boolean
}

const workspaceFolder = ref<string | null>(null)
const treeNodes = ref<FileNode[]>([])
const expandedPaths = ref<Set<string>>(new Set())
const loading = ref(false)
const error = ref<string | null>(null)

// 获取 IPC renderer
const getIpcRenderer = () => {
  if (window && (window as any).electron) {
    return (window as any).electron.ipcRenderer
  }
  return null
}

// 打开工作文件夹
const openWorkspaceFolder = async () => {
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
        // 如果之前有工作文件夹，先停止监听
        if (workspaceFolder.value) {
          stopDirectoryWatcher(workspaceFolder.value)
        }
        workspaceFolder.value = newFolder
        await loadFolder(workspaceFolder.value)
        // 启动新目录的监听
        startDirectoryWatcher(newFolder)
        // 保存工作文件夹路径
        localStorage.setItem('workspaceFolder', workspaceFolder.value)
      }
    } catch (err) {
    logger.error('打开工作文件夹失败:', err)
    error.value = err instanceof Error ? err.message : String(err)
  }
}

// 刷新文件夹
const refreshFolder = async () => {
  if (workspaceFolder.value) {
    await loadFolder(workspaceFolder.value)
  }
}

// 加载文件夹内容
const loadFolder = async (folderPath: string) => {
  loading.value = true
  error.value = null

  try {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
      throw new Error(t('workspaceExplorer.ipcNotAvailable'))
    }

    // 读取目录内容
    const entries = await ipcRenderer.invoke('read-directory', folderPath) as Array<{ name: string; path: string; isDirectory: boolean }>
    
    // 构建文件树
    const nodes: FileNode[] = []
    const dirs: FileNode[] = []
    const files: FileNode[] = []

    for (const entry of entries) {
      const node: FileNode = {
        name: entry.name,
        path: entry.path,
        type: entry.isDirectory ? 'directory' : 'file'
      }

      // 只显示 md 和 tex 文件
      if (entry.isDirectory) {
        dirs.push(node)
      } else {
        const ext = entry.name.split('.').pop()?.toLowerCase()
        if (ext === 'md' || ext === 'tex') {
          files.push(node)
        }
      }
    }

    // 排序：目录在前，文件在后，都按名称排序
    dirs.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))
    nodes.push(...dirs, ...files)

    treeNodes.value = nodes
  } catch (err) {
    logger.error('加载文件夹失败:', err)
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

// 加载子目录
const loadSubDirectory = async (node: FileNode) => {
  if (!node.path || node.type !== 'directory') return

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
  if (node.type !== 'directory') return

  if (expandedPaths.value.has(node.path)) {
    expandedPaths.value.delete(node.path)
  } else {
    expandedPaths.value.add(node.path)
    // 如果还没有加载子节点，则加载
    if (!node.children) {
      await loadSubDirectory(node)
    }
  }
}

// 打开文件
const handleOpenFile = async (filePath: string) => {
  // 检查文件是否已经在 Tab 中打开
  const existingTab = workspace.tabs.find(tab => tab.path === filePath)
  if (existingTab) {
    workspace.activateTab(existingTab.id)
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
  
  // 只处理当前工作目录的变化
  if (directoryPath !== workspaceFolder.value) {
    return
  }

  logger.debug('目录变化', { directoryPath, eventType, filePath })

  // 防抖：延迟刷新，避免频繁刷新
  if (loading.value) {
    return
  }

  // 延迟刷新，给文件系统一些时间稳定
  setTimeout(async () => {
    if (workspaceFolder.value) {
      await loadFolder(workspaceFolder.value)
    }
  }, 300)
}

onMounted(async () => {
  // 从 localStorage 恢复工作文件夹
  const savedFolder = localStorage.getItem('workspaceFolder')
  if (savedFolder) {
    workspaceFolder.value = savedFolder
    await loadFolder(savedFolder)
    // 启动目录监听
    startDirectoryWatcher(savedFolder)
  }

  // 监听切换事件
  eventBus.on('toggle-workspace-explorer', handleToggleWorkspaceExplorer)

  // 监听目录变化事件（来自主进程）
  const ipcRenderer = getIpcRenderer()
  if (ipcRenderer) {
    ipcRenderer.on('directory-changed', handleDirectoryChange)
  }
})

onBeforeUnmount(() => {
  // 停止目录监听
  if (workspaceFolder.value) {
    stopDirectoryWatcher(workspaceFolder.value)
  }

  // 移除事件监听
  eventBus.off('toggle-workspace-explorer', handleToggleWorkspaceExplorer)
  
  const ipcRenderer = getIpcRenderer()
  if (ipcRenderer) {
    ipcRenderer.removeListener('directory-changed', handleDirectoryChange)
  }
})

// 监听工作文件夹变化，启动/停止目录监听
watch(workspaceFolder, (newFolder, oldFolder) => {
  if (oldFolder) {
    stopDirectoryWatcher(oldFolder)
  }
  if (newFolder) {
    startDirectoryWatcher(newFolder)
  }
})
</script>

<style scoped>
.workspace-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: v-bind('themeState.currentTheme.sidebarBackground');
  border-right: 1px solid var(--el-border-color-lighter, #f0f0f0);
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

.workspace-explorer-tree {
  flex: 1;
  height: 100%;
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
}
</style>

