<template>
  <div class="session-list-wrapper" :style="panelStyle">
    <header class="pane-header">
      <h2>{{ title }}</h2>
      <div class="actions">
        <el-tooltip :content="createButtonTooltip">
          <el-button 
            size="small" 
            type="info" 
            :icon="AddIcon" 
            circle 
            @click="handleCreate" 
            :disabled="disabled"
          />
        </el-tooltip>
      </div>
    </header>
    <el-scrollbar class="menu-scrollbar">
      <el-menu class="side-menu" :default-active="activeIndex?.toString()">
        <template v-for="group in groupedItems" :key="group.label">
          <el-menu-item disabled class="group-header" :class="{ 'is-ui-locked': disabled }">
            <span class="group-label">{{ group.label }}</span>
          </el-menu-item>
          <el-menu-item 
            v-for="item in group.items" 
            :key="item.id" 
            :index="item.id"
            @click="handleSelect(item)" 
            :disabled="disabled"
            :class="{ 'menu-item-open': openMenuId === item.id }"
          >
            <div class="menu-item-wrapper">
              <span class="item-title">{{ item.title }}</span>
              <div class="menu-item-actions">
                <el-button
                  text
                  circle
                  size="small"
                  class="more-btn"
                  :disabled="disabled"
                  @click.stop="toggleMenu(item.id)"
                >
                  <el-icon><More /></el-icon>
                </el-button>
                <transition name="fade">
                  <div
                    v-if="openMenuId === item.id && !disabled"
                    class="item-menu"
                    :style="menuStyle"
                    @click.stop
                  >
                    <button 
                      type="button" 
                      class="item-menu__item" 
                      @click="handleMenuAction('rename', item)"
                    >
                      {{ renameLabel }}
                    </button>
                    <button 
                      type="button" 
                      class="item-menu__item" 
                      @click="handleMenuAction('duplicate', item)"
                      v-if="showDuplicate"
                    >
                      {{ duplicateLabel }}
                    </button>
                    <button 
                      type="button" 
                      class="item-menu__item danger" 
                      @click="handleMenuAction('delete', item)"
                    >
                      {{ deleteLabel }}
                    </button>
                  </div>
                </transition>
              </div>
            </div>
          </el-menu-item>
        </template>
      </el-menu>
    </el-scrollbar>
    
    <!-- 重命名对话框 -->
    <el-dialog 
      v-model="renameDialogVisible" 
      :title="renameDialogTitle" 
      width="500"
    >
      <el-input 
        v-model="editingTitle" 
        style="width: 100%" 
        :placeholder="renamePlaceholder" 
      />
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="renameDialogVisible = false">{{ cancelLabel }}</el-button>
          <el-button type="primary" @click="finishRename">
            {{ confirmLabel }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { AddIcon } from 'tdesign-icons-vue-next'
import { More } from '@element-plus/icons-vue'
import { themeState, mixColors } from '../../utils/themes'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

export interface SessionListItem {
  id: string
  title: string
  updatedAt: number | string | Date
  [key: string]: any
}

export interface SessionListGroup {
  label: string
  items: SessionListItem[]
}

const props = withDefaults(defineProps<{
  title: string
  items: SessionListItem[]
  activeIndex?: string | number
  disabled?: boolean
  createButtonTooltip?: string
  renameLabel?: string
  duplicateLabel?: string
  deleteLabel?: string
  renameDialogTitle?: string
  renamePlaceholder?: string
  cancelLabel?: string
  confirmLabel?: string
  showDuplicate?: boolean
  groupByDate?: boolean
}>(), {
  disabled: false,
  createButtonTooltip: '',
  renameLabel: '',
  duplicateLabel: '',
  deleteLabel: '',
  renameDialogTitle: '',
  renamePlaceholder: '',
  cancelLabel: '',
  confirmLabel: '',
  showDuplicate: true,
  groupByDate: true
})

const emit = defineEmits<{
  create: []
  select: [item: SessionListItem]
  rename: [item: SessionListItem, newTitle: string]
  duplicate: [item: SessionListItem]
  delete: [item: SessionListItem]
}>()

const openMenuId = ref<string | null>(null)
const renameDialogVisible = ref(false)
const editingItem = ref<SessionListItem | null>(null)
const editingTitle = ref('')

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: themeState.currentTheme.type === 'dark' 
    ? 'rgba(255, 255, 255, 0.18)' 
    : 'rgba(0, 0, 0, 0.12)'
}))

const menuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: themeState.currentTheme.type === 'dark' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : 'rgba(0, 0, 0, 0.08)'
}))

// 点击外部区域关闭菜单
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  // 检查点击是否在菜单内部
  if (openMenuId.value && !target.closest('.item-menu') && !target.closest('.more-btn')) {
    openMenuId.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 按日期分组
const groupedItems = computed<SessionListGroup[]>(() => {
  if (!props.groupByDate) {
    return [{
      label: '',
      items: props.items
    }]
  }
  
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  
  const groups: SessionListGroup[] = []
  const todayItems: SessionListItem[] = []
  const yesterdayItems: SessionListItem[] = []
  const thisWeekItems: SessionListItem[] = []
  const thisMonthItems: SessionListItem[] = []
  const olderItems: SessionListItem[] = []
  
  props.items.forEach(item => {
    const updatedAt = typeof item.updatedAt === 'string' 
      ? new Date(item.updatedAt) 
      : (item.updatedAt instanceof Date ? item.updatedAt : new Date(item.updatedAt))
    
    if (updatedAt >= today) {
      todayItems.push(item)
    } else if (updatedAt >= yesterday) {
      yesterdayItems.push(item)
    } else if (updatedAt >= thisWeek) {
      thisWeekItems.push(item)
    } else if (updatedAt >= thisMonth) {
      thisMonthItems.push(item)
    } else {
      olderItems.push(item)
    }
  })
  
  if (todayItems.length > 0) {
    groups.push({ label: t('common.today', '今天'), items: todayItems })
  }
  if (yesterdayItems.length > 0) {
    groups.push({ label: t('common.yesterday', '昨天'), items: yesterdayItems })
  }
  if (thisWeekItems.length > 0) {
    groups.push({ label: t('common.thisWeek', '本周'), items: thisWeekItems })
  }
  if (thisMonthItems.length > 0) {
    groups.push({ label: t('common.thisMonth', '本月'), items: thisMonthItems })
  }
  if (olderItems.length > 0) {
    groups.push({ label: t('common.older', '更早'), items: olderItems })
  }
  
  return groups
})

const handleCreate = () => {
  emit('create')
}

const handleSelect = (item: SessionListItem) => {
  emit('select', item)
}

const toggleMenu = (id: string) => {
  if (props.disabled) return
  openMenuId.value = openMenuId.value === id ? null : id
}

const handleMenuAction = async (
  action: 'rename' | 'duplicate' | 'delete',
  item: SessionListItem
) => {
  openMenuId.value = null
  
  if (action === 'rename') {
    editingItem.value = item
    editingTitle.value = item.title
    renameDialogVisible.value = true
  } else if (action === 'duplicate') {
    emit('duplicate', item)
  } else if (action === 'delete') {
    try {
      await ElMessageBox.confirm(
        t('common.confirmDelete', { name: item.title }, `确定要删除"${item.title}"吗？`),
        t('common.delete', '删除'),
        { type: 'warning' }
      )
      emit('delete', item)
    } catch {
      // canceled
    }
  }
}

const finishRename = () => {
  if (editingItem.value && editingTitle.value.trim()) {
    emit('rename', editingItem.value, editingTitle.value.trim())
    renameDialogVisible.value = false
    editingItem.value = null
    editingTitle.value = ''
  }
}
</script>

<style scoped>
.session-list-wrapper {
  width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid v-bind('panelStyle.borderColor');
}

.pane-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid v-bind('panelStyle.borderColor');
}

.pane-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.menu-scrollbar {
  flex: 1;
  overflow: hidden;
}

.side-menu {
  border: none;
  background: transparent;
}

.side-menu :deep(.el-menu-item) {
  height: auto;
  line-height: 1.5;
  padding: 8px 16px;
  margin: 2px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.side-menu :deep(.el-menu-item:hover),
.side-menu :deep(.el-menu-item.is-active) {
  background-color: rgba(0, 0, 0, 0.05);
}

.side-menu :deep(.el-menu-item.menu-item-open) {
  background-color: rgba(0, 0, 0, 0.08);
}

/* group-header正常情况下的样式 */
.side-menu :deep(.group-header) {
  padding: 8px 16px !important;
  height: auto !important;
  opacity: 0.6 !important;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

/* UI锁启用时，group-header应该和disabled的item一样 */
.side-menu :deep(.group-header.is-ui-locked) {
  opacity: 0.5 !important;
}

/* disabled的item样式（排除group-header） */
.side-menu :deep(.el-menu-item.is-disabled:not(.group-header)) {
  opacity: 0.5 !important;
}

.menu-item-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.item-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.menu-item-actions {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.item-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 140px;
  border: 1px solid v-bind('menuStyle.borderColor');
  display: flex;
  flex-direction: column;
}

.item-menu__item {
  background: transparent;
  border: none;
  padding: 8px 10px;
  text-align: left;
  color: v-bind('menuStyle.color');
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s ease;
  width: 100%;
}

.item-menu__item:hover {
  background-color: rgba(64, 158, 255, 0.16);
}

.item-menu__item.danger {
  color: #f56c6c;
}

.item-menu__item.danger:hover {
  background-color: rgba(245, 108, 108, 0.18);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

