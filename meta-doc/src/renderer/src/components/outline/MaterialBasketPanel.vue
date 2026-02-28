<template>
  <div
    class="material-basket-panel"
    :class="{ expanded: expanded }"
    :style="{
      backgroundColor: themeState.currentTheme.background2nd,
      borderColor: themeState.currentTheme.type === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      width: panelWidth + 'px',
      height: expanded ? panelHeight + 'px' : undefined
    }"
    @dragover.prevent="onPanelDragover"
    @dragleave="onPanelDragleave"
    @drop.prevent="onPanelDrop"
  >
    <div
      class="material-basket-header"
      :class="{ 'drop-target': isDropTarget }"
      @click="toggleExpand"
    >
      <component :is="expanded ? ChevronDown : ChevronRight" class="material-basket-chevron w-4 h-4" />
      <span class="material-basket-title">{{ $t('outline.materialBasket.title') }}</span>
      <span v-if="basket.length > 0" class="material-basket-count">{{ basket.length }}</span>
    </div>
    <transition name="basket-expand">
      <div v-show="expanded" class="material-basket-body" :style="{ maxHeight: panelHeight - headerHeight + 'px' }">
        <div v-if="basket.length > 0" class="material-basket-search-wrap">
          <input
            v-model="searchQuery"
            type="text"
            class="material-basket-search-input"
            :placeholder="$t('outline.materialBasket.searchPlaceholder')"
          />
        </div>
        <div
          class="material-basket-drop-zone"
          :class="{ 'drop-target': isDropTarget }"
          @dragover.prevent="onDropZoneDragover"
          @dragleave="onDropZoneDragleave"
          @drop.prevent="onPanelDrop"
        >
          <template v-if="basket.length === 0 && !isDropTarget">
            <p class="material-basket-empty-hint">{{ $t('outline.materialBasket.emptyHint') }}</p>
          </template>
          <template v-else-if="filteredBasket.length === 0">
            <p class="material-basket-empty-hint">{{ $t('outline.materialBasket.noSearchResult') }}</p>
          </template>
          <template v-else>
            <div
              v-for="item in filteredBasket"
              :key="item.id"
              class="material-basket-item"
              :style="{ backgroundColor: themeState.currentTheme.outlineNode }"
              draggable="true"
              @click="emit('editItem', item)"
              @dragstart="onItemDragStart($event, item)"
              @dragend="onItemDragEnd"
              @contextmenu.prevent="openItemContextMenu($event, item)"
            >
              <span class="material-basket-item-text" :title="item.title">{{ item.title || $t('outline.newNode') }}</span>
            </div>
          </template>
        </div>
        <div class="material-basket-actions">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="outline" size="sm" class="add-item-btn" @click.stop="emit('requestAddItem')">
                  <Plus class="w-4 h-4" />
                  <span>{{ $t('outline.materialBasket.addItem') }}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{{ $t('outline.materialBasket.addItem') }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </transition>
    <!-- 左下角拖动调整大小：使用 pointer 捕获，拖拽时光标离开面板仍持续生效 -->
    <div
      v-show="expanded"
      class="material-basket-resize-handle"
      @pointerdown.prevent="startResize"
    />
    <!-- 素材项右键菜单：与 SessionList 一致的结构与样式 -->
    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="itemContextMenuItem && itemContextMenuPosition"
          class="item-menu item-menu-context material-basket-item-menu"
          :style="[menuPositionStyle, menuStyle]"
          @click.stop
        >
          <div class="item-menu__submenu-label">{{ $t('outline.materialBasket.mergeToOutline') }}</div>
          <button type="button" class="item-menu__item" @click="onMergeAsChild">
            <span>{{ $t('outline.materialBasket.asChild') }}</span>
          </button>
          <button type="button" class="item-menu__item" @click="onMergeAsRightSibling">
            <span>{{ $t('outline.materialBasket.asRightSibling') }}</span>
          </button>
          <button type="button" class="item-menu__item" @click="onMergeAsLeftSibling">
            <span>{{ $t('outline.materialBasket.asLeftSibling') }}</span>
          </button>
          <button type="button" class="item-menu__item" @click="onCopyItem">
            <Copy class="item-menu__icon w-4 h-4" />
            <span>{{ $t('outline.materialBasket.copy') }}</span>
          </button>
          <button type="button" class="item-menu__item danger" @click="onDeleteItem">
            <Trash2 class="item-menu__icon w-4 h-4" />
            <span>{{ $t('outline.materialBasket.delete') }}</span>
          </button>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Plus, ChevronRight, ChevronDown, Copy, Trash2 } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { themeState } from '../../utils/themes'
import type { MaterialBasketItem } from '../../../types'

const MIME_BASKET = 'application/x-metadoc-material-basket'

const DEFAULT_WIDTH = 320
const DEFAULT_HEIGHT = 200
const MIN_WIDTH = 220
const MIN_HEIGHT = 120
const MAX_WIDTH = 480
const MAX_HEIGHT = 360
const headerHeight = 36

const props = withDefaults(
  defineProps<{
    basket: MaterialBasketItem[]
    expanded: boolean
    isDraggingFromOutline?: boolean
  }>(),
  { isDraggingFromOutline: false }
)

const emit = defineEmits<{
  (e: 'update:expanded', v: boolean): void
  (e: 'dropFromOutline'): void
  (e: 'mergeToTree', item: MaterialBasketItem, mode: 'child' | 'after' | 'before'): void
  (e: 'copyItem', item: MaterialBasketItem): void
  (e: 'deleteItem', item: MaterialBasketItem): void
  (e: 'updateBasket', items: MaterialBasketItem[]): void
  (e: 'dragStartBasket', id: string): void
  (e: 'dragEndBasket'): void
  (e: 'requestAddItem'): void
  (e: 'editItem', item: MaterialBasketItem): void
}>()

const panelWidth = ref(DEFAULT_WIDTH)
const panelHeight = ref(DEFAULT_HEIGHT)
let resizeStart = { x: 0, y: 0, w: 0, h: 0 }
function startResize(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  resizeStart = { x: e.clientX, y: e.clientY, w: panelWidth.value, h: panelHeight.value }
  document.addEventListener('pointermove', onResizeMove, true)
  document.addEventListener('pointerup', onResizeEnd, { once: true, capture: true })
}
// 左下角手柄：往左拖 = 加宽，往下拖 = 加高（光标离开面板仍持续生效）
function onResizeMove(e: PointerEvent) {
  const dx = e.clientX - resizeStart.x
  const dy = e.clientY - resizeStart.y
  panelWidth.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeStart.w - dx))
  panelHeight.value = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeStart.h + dy))
}
function onResizeEnd() {
  document.removeEventListener('pointermove', onResizeMove, true)
}

const menuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: themeState.currentTheme.type === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
}))
const menuPositionStyle = computed(() => {
  if (!itemContextMenuPosition.value) return {}
  return {
    position: 'fixed' as const,
    left: itemContextMenuPosition.value.x + 'px',
    top: itemContextMenuPosition.value.y + 'px'
  }
})

const searchQuery = ref('')
const filteredBasket = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.basket
  return props.basket.filter((item) => {
    const title = (item.title || '').toLowerCase()
    const text = (item.text || '').toLowerCase()
    const keywordsStr = (item.keywords || []).join(' ').toLowerCase()
    return title.includes(q) || text.includes(q) || keywordsStr.includes(q)
  })
})

const isDropTarget = ref(false)
const toggleExpand = () => emit('update:expanded', !props.expanded)

const onPanelDragover = (e: DragEvent) => {
  if (props.isDraggingFromOutline) {
    isDropTarget.value = true
    if (!props.expanded) emit('update:expanded', true)
  }
}
const onPanelDragleave = () => { isDropTarget.value = false }
const onDropZoneDragover = (e: DragEvent) => {
  if (props.isDraggingFromOutline) {
    isDropTarget.value = true
    if (!props.expanded) emit('update:expanded', true)
  }
}
const onDropZoneDragleave = () => { isDropTarget.value = false }
const onPanelDrop = () => {
  isDropTarget.value = false
  if (props.isDraggingFromOutline) emit('dropFromOutline')
}

const onItemDragStart = (e: DragEvent, item: MaterialBasketItem) => {
  if (e.dataTransfer) {
    e.dataTransfer.setData(MIME_BASKET, item.id)
    e.dataTransfer.effectAllowed = 'move'
  }
  emit('dragStartBasket', item.id)
}
const onItemDragEnd = () => { emit('dragEndBasket') }

const itemContextMenuItem = ref<MaterialBasketItem | null>(null)
const itemContextMenuPosition = ref<{ x: number; y: number } | null>(null)
const openItemContextMenu = (e: MouseEvent, item: MaterialBasketItem) => {
  itemContextMenuItem.value = item
  itemContextMenuPosition.value = { x: e.clientX, y: e.clientY }
}
const closeItemContextMenu = () => {
  itemContextMenuItem.value = null
  itemContextMenuPosition.value = null
}

const onMergeAsChild = () => {
  if (itemContextMenuItem.value) emit('mergeToTree', itemContextMenuItem.value, 'child')
  closeItemContextMenu()
}
const onMergeAsRightSibling = () => {
  if (itemContextMenuItem.value) emit('mergeToTree', itemContextMenuItem.value, 'after')
  closeItemContextMenu()
}
const onMergeAsLeftSibling = () => {
  if (itemContextMenuItem.value) emit('mergeToTree', itemContextMenuItem.value, 'before')
  closeItemContextMenu()
}
const onCopyItem = () => {
  if (itemContextMenuItem.value) emit('copyItem', itemContextMenuItem.value)
  closeItemContextMenu()
}
const onDeleteItem = () => {
  if (itemContextMenuItem.value) emit('deleteItem', itemContextMenuItem.value)
  closeItemContextMenu()
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (itemContextMenuItem.value && target && !target.closest('.material-basket-item-menu')) {
    closeItemContextMenu()
  }
}
onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

defineExpose({ closeItemContextMenu })
</script>

<style scoped>
.material-basket-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 100;
  border-radius: 8px;
  border: 1px solid;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

.material-basket-panel:not(.expanded) .material-basket-header {
  padding: 2px 8px;
  min-height: 24px;
}

.material-basket-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
  flex-shrink: 0;
}
.material-basket-header:hover,
.material-basket-header.drop-target {
  filter: brightness(1.05);
}

.material-basket-chevron {
  flex-shrink: 0;
  opacity: 0.8;
}

.material-basket-title {
  flex: 1;
  font-weight: 600;
  font-size: 12px;
  min-width: 0;
}

.material-basket-count {
  font-size: 11px;
  opacity: 0.8;
  min-width: 18px;
  text-align: right;
}

.material-basket-body {
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  flex: 1;
}

.material-basket-search-wrap {
  flex-shrink: 0;
  padding: 0 2px 2px;
}
.material-basket-search-input {
  width: 100%;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 6px;
  background: var(--background);
  color: var(--foreground);
  outline: none;
}
.material-basket-search-input::placeholder {
  color: var(--muted-foreground);
}
.material-basket-search-input:focus {
  border-color: rgba(64, 158, 255, 0.6);
}

.material-basket-drop-zone {
  flex: 1;
  min-height: 40px;
  border-radius: 6px;
  padding: 6px;
  overflow-y: auto;
  transition: background 0.2s;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
  align-content: start;
}
.material-basket-drop-zone.drop-target {
  background: rgba(64, 158, 255, 0.12);
  outline: 2px dashed rgba(64, 158, 255, 0.5);
  outline-offset: -2px;
}

.material-basket-empty-hint {
  margin: 0;
  font-size: 13px;
  color: var(--muted-foreground);
  line-height: 1.4;
  padding: 4px 0;
  grid-column: 1 / -1;
}

.material-basket-item {
  padding: 4px 8px;
  border-radius: 6px;
  cursor: grab;
  transition: filter 0.2s;
  min-width: 0;
}
.material-basket-item:active {
  cursor: grabbing;
}
.material-basket-item:hover {
  filter: brightness(1.06);
}

.material-basket-item-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.material-basket-actions {
  flex-shrink: 0;
  padding-top: 2px;
}

.add-item-btn {
  width: 100%;
  justify-content: center;
}

.material-basket-resize-handle {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 20px;
  height: 20px;
  cursor: nesw-resize;
  z-index: 2;
}
.material-basket-resize-handle::after {
  content: '';
  position: absolute;
  left: 4px;
  bottom: 4px;
  width: 8px;
  height: 8px;
  border-left: 2px solid rgba(128, 128, 128, 0.5);
  border-bottom: 2px solid rgba(128, 128, 128, 0.5);
  border-radius: 0 0 0 4px;
}

/* 右键菜单：与 SessionList 一致 */
.material-basket-item-menu {
  z-index: 1002;
  width: max-content;
  max-width: 280px;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid;
  display: flex;
  flex-direction: column;
}

.material-basket-item-menu .item-menu__submenu-label {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.material-basket-item-menu .item-menu__item {
  background: transparent;
  border: none;
  padding: 8px 10px;
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s ease;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
}
.material-basket-item-menu .item-menu__item:hover {
  background-color: rgba(64, 158, 255, 0.16);
}
.material-basket-item-menu .item-menu__item.danger {
  color: #f56c6c;
}
.material-basket-item-menu .item-menu__item.danger:hover {
  background-color: rgba(245, 108, 108, 0.18);
}
.material-basket-item-menu .item-menu__icon {
  flex-shrink: 0;
}

.basket-expand-enter-active,
.basket-expand-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.basket-expand-enter-from,
.basket-expand-leave-to {
  opacity: 0;
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
