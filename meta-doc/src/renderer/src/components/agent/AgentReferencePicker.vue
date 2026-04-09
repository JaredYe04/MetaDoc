<template>
  <PopoverRoot v-model:open="openState">
    <PopoverTrigger as-child>
      <slot name="trigger">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          :class="['composer-btn', compact ? 'agent-ref-picker-trigger--compact' : '']"
          :disabled="disabled"
          :title="t('agent.reference.pickerButton', '引用工作区文件或文档')"
        >
          <AtSign :class="compact ? 'agent-ref-picker-icon--compact' : 'w-4 h-4'" />
        </Button>
      </slot>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :class="[
          'agent-reference-picker-content flex flex-col p-0',
          compact ? 'agent-reference-picker-content--compact' : 'w-[360px] max-h-[400px]'
        ]"
        align="start"
        side="top"
        :side-offset="6"
      >
        <div :class="compact ? 'p-1.5 border-b' : 'p-2 border-b'">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :class="
              compact
                ? 'agent-ref-picker-input--compact'
                : 'w-full px-3 py-2 text-sm rounded-md border bg-background'
            "
            :placeholder="t('agent.reference.pickerPlaceholder', '输入文件名、路径或目录名搜索…')"
            @keydown="onSearchKeydown"
          />
        </div>
        <ScrollArea
          :class="['flex-1 min-h-0', compact ? 'agent-ref-picker-scroll--compact' : '']"
          :style="compact ? { maxHeight: '260px' } : { maxHeight: '320px' }"
        >
          <div :class="compact ? 'p-0.5' : 'p-1'">
            <!-- 未保存文档 -->
            <div v-if="documentTabsFiltered.length > 0" :class="compact ? 'mb-1' : 'mb-2'">
              <div
                :class="
                  compact
                    ? 'px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground'
                    : 'px-2 py-1 text-xs font-medium text-muted-foreground'
                "
              >
                {{ t('agent.reference.unsavedDocs', '未保存文档') }}
              </div>
              <button
                v-for="tab in documentTabsFiltered"
                :key="tab.id"
                type="button"
                :class="[
                  'agent-ref-picker-item w-full text-left rounded-md hover:bg-accent flex items-center gap-2',
                  compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
                ]"
                @click="selectTab(tab)"
              >
                <FileText
                  :class="
                    compact
                      ? 'w-3 h-3 shrink-0 text-muted-foreground'
                      : 'w-4 h-4 shrink-0 text-muted-foreground'
                  "
                />
                <span class="truncate">{{
                  tab.title || t('agent.reference.untitled', '未命名')
                }}</span>
              </button>
            </div>
            <!-- 工作区目录 -->
            <div v-if="workspaceDirsFiltered.length > 0" :class="compact ? 'mb-1' : 'mb-2'">
              <div
                :class="
                  compact
                    ? 'px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground'
                    : 'px-2 py-1 text-xs font-medium text-muted-foreground'
                "
              >
                {{ t('agent.reference.workspaceDirs', '工作区目录') }}
              </div>
              <button
                v-for="item in workspaceDirsFiltered"
                :key="item.path"
                type="button"
                :class="[
                  'agent-ref-picker-item w-full text-left rounded-md hover:bg-accent flex items-center gap-2',
                  compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
                ]"
                :title="item.path"
                @click="selectDir(item)"
              >
                <Folder
                  :class="
                    compact
                      ? 'w-3 h-3 shrink-0 text-muted-foreground'
                      : 'w-4 h-4 shrink-0 text-muted-foreground'
                  "
                />
                <span class="truncate flex-1 min-w-0">{{ item.name }}</span>
              </button>
            </div>
            <!-- 工作区文件 -->
            <div>
              <div
                :class="
                  compact
                    ? 'px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground'
                    : 'px-2 py-1 text-xs font-medium text-muted-foreground'
                "
              >
                {{ t('agent.reference.workspaceFiles', '工作区文件') }}
              </div>
              <template v-if="fileListLoading">
                <div
                  :class="
                    compact
                      ? 'px-2 py-3 text-xs text-muted-foreground'
                      : 'px-3 py-4 text-sm text-muted-foreground'
                  "
                >
                  {{ t('common.loading', '加载中…') }}
                </div>
              </template>
              <template v-else-if="workspaceFilesFiltered.length === 0">
                <div
                  :class="
                    compact
                      ? 'px-2 py-3 text-xs text-muted-foreground'
                      : 'px-3 py-4 text-sm text-muted-foreground'
                  "
                >
                  {{
                    searchQuery
                      ? t('agent.reference.noMatch', '无匹配文件')
                      : t('agent.reference.noWorkspaceFiles', '暂无工作区或未打开工作区')
                  }}
                </div>
              </template>
              <button
                v-for="item in workspaceFilesFiltered"
                :key="item.path"
                type="button"
                :class="[
                  'agent-ref-picker-item w-full text-left rounded-md hover:bg-accent flex items-center gap-2',
                  compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
                ]"
                :title="item.path"
                @click="selectFile(item)"
              >
                <File
                  :class="
                    compact
                      ? 'w-3 h-3 shrink-0 text-muted-foreground'
                      : 'w-4 h-4 shrink-0 text-muted-foreground'
                  "
                />
                <span class="truncate flex-1 min-w-0">{{ item.name }}</span>
              </button>
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { AtSign, File, FileText, Folder } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { PopoverRoot, PopoverTrigger } from 'reka-ui'
import { PopoverContent } from '@renderer/components/ui/popover'
import { useI18n } from 'vue-i18n'
import { useWorkspace } from '../../stores/workspace'
import {
  listWorkspaceFiles,
  fuzzyMatchFile,
  fuzzyMatchDir,
  type WorkspaceFileItem
} from '../../utils/workspace/workspace-file-list'
import type { WorkspaceTab } from '../../stores/workspace'

const props = withDefaults(
  defineProps<{
    open?: boolean
    disabled?: boolean
    /** 紧凑模式：与 AgentViewCompact 字号、组件大小一致 */
    compact?: boolean
  }>(),
  { open: false, disabled: false, compact: false }
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'select-file', payload: { type: 'file'; path: string }): void
  (e: 'select-tab', payload: { type: 'tab'; tabId: string }): void
  (e: 'select-dir', payload: { type: 'dir'; path: string }): void
}>()

const { t } = useI18n()
const workspace = useWorkspace()
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const openState = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v)
})

// 文档 tab：file 或 new，用于“未保存/当前文档”引用
const documentTabs = computed<WorkspaceTab[]>(() => {
  return workspace.tabs.filter((tab) => tab.kind === 'file' || tab.kind === 'new') as WorkspaceTab[]
})

const documentTabsFiltered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return documentTabs.value.slice(0, 20)
  return documentTabs.value
    .filter((tab) => {
      const title = (tab.title || '').toLowerCase()
      return title.includes(q)
    })
    .slice(0, 20)
})

// 工作区文件列表
const workspaceFileList = ref<WorkspaceFileItem[]>([])
const fileListLoading = ref(false)

async function loadWorkspaceFiles() {
  fileListLoading.value = true
  try {
    workspaceFileList.value = await listWorkspaceFiles({
      maxDepth: 4,
      maxEntries: 400,
      includeDirectories: true,
      maxDirEntries: 150
    })
  } finally {
    fileListLoading.value = false
  }
}

const workspaceDirsFiltered = computed(() => {
  const q = searchQuery.value.trim()
  const dirs = workspaceFileList.value.filter((item) => item.isDirectory)
  if (!q) return dirs.slice(0, 40)
  return dirs.filter((item) => fuzzyMatchDir(q, item)).slice(0, 40)
})

const workspaceFilesFiltered = computed(() => {
  const q = searchQuery.value.trim()
  const files = workspaceFileList.value.filter((item) => !item.isDirectory)
  if (!q) return files.slice(0, 50)
  return files.filter((item) => fuzzyMatchFile(q, item)).slice(0, 50)
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      searchQuery.value = ''
      loadWorkspaceFiles()
      setTimeout(() => searchInputRef.value?.focus(), 50)
    }
  }
)

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    openState.value = false
  }
}

function selectFile(item: WorkspaceFileItem) {
  emit('select-file', { type: 'file', path: item.path })
  openState.value = false
}

function selectTab(tab: WorkspaceTab) {
  emit('select-tab', { type: 'tab', tabId: tab.id })
  openState.value = false
}

function selectDir(item: WorkspaceFileItem) {
  if (!item.isDirectory) return
  emit('select-dir', { type: 'dir', path: item.path })
  openState.value = false
}
</script>

<style scoped>
.agent-ref-picker-trigger--compact {
  width: 22px;
  height: 22px;
  padding: 0;
}
.agent-reference-picker-content--compact {
  width: 300px;
  max-height: 340px;
  font-size: 12px;
}
.agent-ref-picker-input--compact {
  width: 100%;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.35;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--background);
}

/* @ icon 与回形针一致：12px */
.agent-ref-picker-icon--compact {
  width: 12px;
  height: 12px;
}

/* 确保下拉列表区域可滚动并显示滚动条 */
.agent-ref-picker-scroll--compact :deep(.h-full) {
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
