<template>
  <div class="workspace-tabs-wrapper" :class="{ 'is-locked': isLocked }">
    <el-tabs
      ref="tabsRef"
      :key="tabsKey"
      v-model="currentActiveId"
      type="card"
      class="workspace-tabs"
      @tab-remove="handleRemove"
      :before-leave="handleBeforeLeave"
    >
      <el-tab-pane
        v-for="tab in workspace.tabs"
        :key="tab.id"
        :name="tab.id"
        :closable="closable && !tab.readonly"
      >
        <template #label>
          <div
            class="workspace-tab-label"
            :title="tooltipLabel(tab)"
            @mousedown.stop
            draggable="true"
            @dragstart.stop="handleDragStart(tab.id, $event)"
            @dragover.prevent="handleDragOver(tab.id, $event)"
            @dragleave="handleDragLeave"
            @drop.stop="handleDrop(tab.id, $event)"
            @dragend.stop="handleDragEnd"
          >
            <span class="workspace-tab-label__primary">
              {{ primaryLabel(tab) }}
            </span>
            <span
              v-if="tab.dirty"
              class="workspace-tab-label__dot"
            />
          </div>
        </template>
      </el-tab-pane>
      
      <el-tab-pane
        :key="ADD_TAB_ID"
        :name="ADD_TAB_ID"
        :closable="false"
        class="workspace-tab-pane workspace-tab-pane--add"
      >
        <template #label>
          <el-tooltip :content="t('home.tabActions.title')" placement="bottom">
            <div class="workspace-tab-label workspace-tab-label--plus">
              <Plus />
            </div>
          </el-tooltip>
        </template>
      </el-tab-pane>

    </el-tabs>
  </div>

  <el-dialog
    v-model="addDialogVisible"
    :title="t('home.tabActions.title')"
    width="360px"
    append-to-body
    :close-on-click-modal="false"
  >
    <div class="workspace-tabs__dialog-actions">
      <el-tooltip :content="t('home.tabActions.new')" placement="bottom">
        <el-button
          circle
          size="large"
          @click="handleAddSelect('new')"
        >
          <el-icon>
            <DocumentAdd />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="t('home.tabActions.open')" placement="bottom">
        <el-button
          circle
          size="large"
          @click="handleAddSelect('open')"
        >
          <el-icon>
            <FolderAdd />
          </el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useWorkspace, type WorkspaceTab } from '../../stores/workspace';
import eventBus from '../../utils/event-bus';
import { Plus, DocumentAdd, FolderAdd } from '@element-plus/icons-vue';
import { createRendererLogger } from '../../utils/logger';

const logger = createRendererLogger('WorkspaceTabs');
const props = defineProps({
  closable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits<{
  (event: 'update:activeId', id: string): void;
  (event: 'close', id: string): void;
  (event: 'reorder', payload: { fromId: string; toId: string }): void;
}>();

const workspace = useWorkspace();
const ADD_TAB_ID = '__workspace_add_tab__';

const tabs = computed(() => [...workspace.tabs]);
const { t } = useI18n();
const addDialogVisible = ref(false);
const isLocked = computed(() => workspace.uiLocked?.value === true);
const tabsRef = ref<any>(null);
const tabsKey = ref(0); // 用于强制重新渲染 tabs

const primaryLabel = (tab: WorkspaceTab) => {
  return tab.subtitle?.trim() || tab.title?.trim() || '未命名文档';
};

const tooltipLabel = (tab: WorkspaceTab) => {
  const primary = primaryLabel(tab);
  const secondary = tab.title?.trim();
  if (!secondary || secondary === primary) {
    return primary;
  }
  return secondary ? `${primary} — ${secondary}` : primary;
};

const currentActiveId = computed({
  get: () => workspace.activeTabId.value,
  set: (value: string) => {
    if (isLocked.value) return;
    if (value !== workspace.activeTabId.value) {
      workspace.activateTab(value);
      emit('update:activeId', value);
    }
  },
});

const handleRemove = async (id: string | number) => {
  if (isLocked.value) return;
  const tabId = String(id);
  const doc = workspace.ensureDocument?.(tabId);

  if (doc?.dirty) {
    try {
      await ElMessageBox.confirm(
        t('main.dialogs.closeTabMessage'),
        t('main.dialogs.closeTabTitle'),
        {
          type: 'warning',
          confirmButtonText: t('main.dialogs.closeTabConfirm'),
          cancelButtonText: t('main.dialogs.closeTabCancel'),
        },
      );
    } catch {
      return;
    }
  }

  emit('close', tabId);
};

let draggingId: string | null = null;

type DropMode = 'before' | 'after';
const dropPreview = reactive<{ targetId: string | null; mode: DropMode | null }>({
  targetId: null,
  mode: null,
});

const computeDropMode = (e: DragEvent, tabItemEl: HTMLElement): DropMode => {
  const rect = tabItemEl.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const w = rect.width;
  const midPoint = w / 2;
  // 如果鼠标在 Tab 的左半部分，插入到左侧；否则插入到右侧
  return x < midPoint ? 'before' : 'after';
};

const findTabItemElement = (labelElement: HTMLElement): HTMLElement | null => {
  // 从 label div 向上查找对应的 .el-tabs__item
  let current: HTMLElement | null = labelElement;
  while (current) {
    if (current.classList.contains('el-tabs__item')) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const handleDragStart = (id: string, event: DragEvent) => {
  logger.debug('[Drag] dragstart', id);
  if (isLocked.value) {
    event.preventDefault();
    return;
  }
  draggingId = id;
  event.dataTransfer?.setData('text/plain', id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
};

const updateDropPreviewClasses = () => {
  nextTick(() => {
    // tabsRef.value 是 el-tabs 组件实例，需要通过 $el 访问 DOM
    const tabsEl = tabsRef.value?.$el || tabsRef.value;
    if (!tabsEl || !(tabsEl instanceof HTMLElement)) return;
    const allItems = tabsEl.querySelectorAll('.el-tabs__item');
    allItems.forEach((item) => {
      if (item instanceof HTMLElement) {
        item.classList.remove('drop-before', 'drop-after');
      }
    });
    
    if (dropPreview.targetId && dropPreview.mode) {
      // 通过 tab.id 查找对应的 DOM 元素
      // Element Plus tabs 中，每个 tab item 的 aria-controls 指向对应的 pane
      // pane 的 id 格式是 'pane-{name}'，其中 name 就是 tab.id
      for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        if (!(item instanceof HTMLElement)) continue;
        const ariaControls = item.getAttribute('aria-controls');
        if (ariaControls) {
          // 移除 'pane-' 前缀，得到 tab.id
          const paneId = ariaControls.replace(/^pane-/, '');
          if (paneId === dropPreview.targetId) {
            item.classList.add(`drop-${dropPreview.mode}`);
            break;
          }
        }
      }
    }
  });
};

const handleDragOver = (targetId: string, event: DragEvent) => {
  if (isLocked.value) return;
  if (!draggingId || draggingId === targetId) {
    dropPreview.targetId = null;
    dropPreview.mode = null;
    updateDropPreviewClasses();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  const labelEl = event.currentTarget as HTMLElement | null;
  if (!labelEl) return;
  // 找到对应的 .el-tabs__item 元素
  const tabItemEl = findTabItemElement(labelEl);
  if (!tabItemEl) return;
  const mode = computeDropMode(event, tabItemEl);
  dropPreview.targetId = targetId;
  dropPreview.mode = mode;
  updateDropPreviewClasses();
};

const handleDragLeave = () => {
  // 不立即清除，避免快速移动时闪烁
  // dropPreview 会在 dragend 时清除
};

const handleDrop = (targetId: string, event: DragEvent) => {
  logger.debug('[Drag] drop', { targetId, draggingId, dropPreview: { ...dropPreview } });
  if (isLocked.value) {
    logger.debug('[Drag] drop blocked: isLocked');
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  
  const fromId = draggingId;
  const mode = dropPreview.mode;
  
  if (!fromId) {
    logger.debug('[Drag] drop: no fromId');
    draggingId = null;
    dropPreview.targetId = null;
    dropPreview.mode = null;
    updateDropPreviewClasses();
    return;
  }
  
  // 如果拖拽到自己，不需要移动
  if (fromId === targetId) {
    logger.debug('[Drag] drop: same tab');
    draggingId = null;
    dropPreview.targetId = null;
    dropPreview.mode = null;
    updateDropPreviewClasses();
    return;
  }
  
  if (!mode) {
    logger.debug('[Drag] drop: no mode');
    draggingId = null;
    dropPreview.targetId = null;
    dropPreview.mode = null;
    updateDropPreviewClasses();
    return;
  }
  
  // 直接使用 workspace.tabs，而不是 tabs.value（computed 的副本）
  const fromIndex = workspace.tabs.findIndex((tab) => tab.id === fromId);
  const targetIndex = workspace.tabs.findIndex((tab) => tab.id === targetId);
  
  logger.debug('[Drag] drop indices', { fromIndex, targetIndex, mode });
  
  if (fromIndex === -1 || targetIndex === -1) {
    logger.debug('[Drag] drop: invalid indices');
    draggingId = null;
    dropPreview.targetId = null;
    dropPreview.mode = null;
    updateDropPreviewClasses();
    return;
  }
  
  // 如果拖拽到自己的位置，不需要移动
  if (fromIndex === targetIndex) {
    logger.debug('[Drag] drop: same index');
    draggingId = null;
    dropPreview.targetId = null;
    dropPreview.mode = null;
    updateDropPreviewClasses();
    return;
  }
  
  // 计算插入位置
  let insertIndex = targetIndex;
  if (mode === 'after') {
    insertIndex = targetIndex + 1;
  }
  
  // 如果从源位置拖到目标位置，需要调整插入索引
  // 因为我们先移除元素，所以如果目标索引在源索引之后，需要减1
  if (fromIndex < insertIndex) {
    insertIndex -= 1;
  }
  
  // 确保 insertIndex 有效
  insertIndex = Math.max(0, Math.min(insertIndex, workspace.tabs.length));
  
  logger.debug('[Drag] drop: moving', { fromIndex, insertIndex, tabsBefore: workspace.tabs.map(t => t.id) });
  
  // 执行移动：直接修改 workspace.tabs（它是 reactive 的）
  // 注意：splice 会直接修改数组，Vue 的响应式系统会自动检测变化
  if (fromIndex !== insertIndex) {
    const [tab] = workspace.tabs.splice(fromIndex, 1);
    workspace.tabs.splice(insertIndex, 0, tab);
    logger.debug('[Drag] drop: moved', { tabsAfter: workspace.tabs.map(t => t.id) });
    
    // 强制 Element Plus tabs 组件更新：通过改变 key 来强制重新渲染
    // 这样可以让组件检测到 tabs 数组顺序的变化
    const currentActiveId = workspace.activeTabId.value;
    nextTick(() => {
      tabsKey.value++;
      // 确保活动 tab 保持不变
      if (currentActiveId) {
        workspace.activateTab(currentActiveId);
      }
    });
    
    // 移动完成后立即清除状态，防止 handleDragEnd 重复移动
    draggingId = null;
    dropPreview.targetId = null;
    dropPreview.mode = null;
    updateDropPreviewClasses();
    return;
  }
  
  logger.debug('[Drag] drop: no move needed');
  draggingId = null;
  dropPreview.targetId = null;
  dropPreview.mode = null;
  updateDropPreviewClasses();
};

const handleDragEnd = () => {
  logger.debug('[Drag] dragend', { draggingId, dropPreview: { ...dropPreview } });
  // 如果 drop 事件没有被触发，在 dragend 中尝试处理
  // 注意：这只是一个后备方案，正常情况下应该在 handleDrop 中处理
  if (draggingId && dropPreview.targetId && dropPreview.mode) {
    const fromId = draggingId;
    const targetId = dropPreview.targetId;
    const mode = dropPreview.mode;
    
    logger.debug('[Drag] dragend: trying to move', { fromId, targetId, mode });
    
    if (fromId !== targetId) {
      const fromIndex = workspace.tabs.findIndex((tab) => tab.id === fromId);
      const targetIndex = workspace.tabs.findIndex((tab) => tab.id === targetId);
      
      logger.debug('[Drag] dragend: indices', { fromIndex, targetIndex });
      
      if (fromIndex !== -1 && targetIndex !== -1 && fromIndex !== targetIndex) {
        let insertIndex = targetIndex;
        if (mode === 'after') {
          insertIndex = targetIndex + 1;
        }
        
        if (fromIndex < insertIndex) {
          insertIndex -= 1;
        }
        
        insertIndex = Math.max(0, Math.min(insertIndex, workspace.tabs.length));
        
        logger.debug('[Drag] dragend: moving', { fromIndex, insertIndex, tabsBefore: workspace.tabs.map(t => t.id) });
        
        if (fromIndex !== insertIndex) {
          const [tab] = workspace.tabs.splice(fromIndex, 1);
          workspace.tabs.splice(insertIndex, 0, tab);
          logger.debug('[Drag] dragend: moved', { tabsAfter: workspace.tabs.map(t => t.id) });
          
          // 强制更新 tabs 组件
          const currentActiveId = workspace.activeTabId.value;
          nextTick(() => {
            tabsKey.value++;
            if (currentActiveId) {
              workspace.activateTab(currentActiveId);
            }
          });
        }
      }
    }
  }
  
  draggingId = null;
  dropPreview.targetId = null;
  dropPreview.mode = null;
  updateDropPreviewClasses();
};

const handleAddClick = () => {
  if (isLocked.value) return;
  addDialogVisible.value = true;
};

const handleBeforeLeave = (nextName?: string, _currentName?: string) => {
  if (isLocked.value) return false;
  if (nextName === ADD_TAB_ID) {
    handleAddClick();
    return false;
  }
  return true;
};

const handleAddSelect = (action: 'new' | 'open') => {
  addDialogVisible.value = false;
  if (action === 'new') {
    eventBus.emit('new-doc');
  } else {
    eventBus.emit('open-doc');
  }
};

// 在 DOM 上直接绑定 drop 事件，因为 label div 上的事件可能没有正确触发
const handleNativeDrop = (event: DragEvent) => {
  logger.debug('[Drag] native drop', event.target);
  if (isLocked.value) return;
  
  // 找到最近的 .el-tabs__item
  let target = event.target as HTMLElement | null;
  while (target && !target.classList.contains('el-tabs__item')) {
    target = target.parentElement;
  }
  
  if (!target) return;
  
  // 从 aria-controls 获取 tab id
  const ariaControls = target.getAttribute('aria-controls');
  if (!ariaControls) return;
  
  const tabId = ariaControls.replace(/^pane-/, '');
  if (!tabId || tabId === ADD_TAB_ID) return;
  
  logger.debug('[Drag] native drop: calling handleDrop', tabId);
  event.preventDefault();
  event.stopPropagation();
  handleDrop(tabId, event);
};

const handleNativeDragOver = (event: DragEvent) => {
  // 允许 drop，这样 drop 事件才能触发
  if (draggingId && !isLocked.value) {
    event.preventDefault();
  }
};

onMounted(() => {
  nextTick(() => {
    const tabsEl = tabsRef.value?.$el || tabsRef.value;
    if (tabsEl && tabsEl instanceof HTMLElement) {
      logger.debug('[Drag] mounting: adding native drop/dragover listeners');
      tabsEl.addEventListener('drop', handleNativeDrop, true); // 使用 capture 阶段
      tabsEl.addEventListener('dragover', handleNativeDragOver, true);
    }
  });
});

onUnmounted(() => {
  const tabsEl = tabsRef.value?.$el || tabsRef.value;
  if (tabsEl && tabsEl instanceof HTMLElement) {
    tabsEl.removeEventListener('drop', handleNativeDrop, true);
    tabsEl.removeEventListener('dragover', handleNativeDragOver, true);
  }
});
</script>

<style scoped>
.workspace-tabs-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}

.workspace-tabs {
  flex: 1;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.workspace-tabs-wrapper.is-locked {
  cursor: not-allowed;
  opacity: 0.9;
}
.workspace-tabs-wrapper.is-locked :deep(.el-tabs__item) {
  pointer-events: none;
  cursor: not-allowed !important;
  opacity: 0.6;
}
.workspace-tabs-wrapper.is-locked :deep(.el-tabs__nav-wrap .el-icon-close) {
  pointer-events: none;
  opacity: 0.4;
}
.workspace-tabs-wrapper.is-locked :deep(.workspace-tab-label) {
  cursor: not-allowed;
}

.workspace-tab-label {
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
  max-width: 180px;
  white-space: nowrap;
  user-select: none;
  cursor: grab;
}

.workspace-tab-label__primary {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-tab-label__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-danger);
}

.workspace-tabs :deep(.el-tabs__header.is-top) {
  margin: 0;
}

.workspace-tabs :deep(.el-tabs__item) {
  padding: 0 12px !important;
  height: 32px;
  line-height: 32px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.workspace-tabs :deep(.el-tabs__nav-wrap) {
  margin-bottom: 0;
}

.workspace-tabs :deep(.el-tabs__item.is-active) {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 6px 6px 0 0;
  font-weight: 600;
}

.workspace-tabs :deep(.el-tabs__item:not(.is-active):hover) {
  background-color: var(--el-fill-color-light);
}

.workspace-tabs__add {
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.workspace-tabs__dialog-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.workspace-tab-label--plus {
  width: 13px;
  height: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-primary);
  gap: 0;
}

.workspace-tab-label--plus:hover {
  color: var(--el-color-primary);
}

.workspace-tabs :deep(.workspace-tab-pane--add .el-tabs__item .el-icon-close),
.workspace-tabs :deep(.workspace-tab-pane--add .el-icon-close) {
  display: none !important;
}

/* 拖拽高亮样式 */
.workspace-tabs :deep(.el-tabs__item.drop-before) {
  position: relative;
}

.workspace-tabs :deep(.el-tabs__item.drop-before::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--el-color-primary);
  z-index: 10;
  border-radius: 0 2px 2px 0;
}

.workspace-tabs :deep(.el-tabs__item.drop-after) {
  position: relative;
}

.workspace-tabs :deep(.el-tabs__item.drop-after::after) {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--el-color-primary);
  z-index: 10;
  border-radius: 2px 0 0 2px;
}
</style>



