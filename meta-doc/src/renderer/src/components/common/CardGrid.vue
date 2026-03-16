<template>
  <div class="card-grid" :style="containerStyle" style="position: relative">
    <LoadingOverlay :show="loading" :message="t('common.loading', '加载中...')" />
    <ScrollArea class="flex-1 min-h-0">
      <div class="card-grid-container">
        <div
          v-for="item in items"
          :key="getItemId(item)"
          class="card-grid-item"
          :class="{
            'is-selected': isSelected(item),
            'is-disabled': isDisabled(item),
            'has-actions': showActions
          }"
          @click="handleItemClick(item)"
          @dblclick="handleItemDoubleClick(item)"
        >
          <!-- 卡片图片/缩略图区域 -->
          <div
            v-if="showThumbnail"
            class="card-item__thumbnail"
            :class="{ 'is-placeholder': !getThumbnail(item) }"
          >
            <img
              v-if="getThumbnail(item)"
              :src="getThumbnail(item) || undefined"
              :alt="getItemTitle(item)"
            />
            <div v-else class="card-item__placeholder">
              <el-icon><Document /></el-icon>
            </div>
            <div v-if="getBadge(item)" class="card-item__badge">
              <Badge size="small" :type="getBadgeType(item) || 'info'">{{ getBadge(item) }}</Badge>
            </div>
          </div>

          <!-- 卡片文本区域（无缩略图时显示） -->
          <div v-else class="card-item__text-preview">
            <div class="text-preview-content">
              {{ getItemTitle(item) }}
            </div>
            <div v-if="getBadge(item)" class="card-item__badge">
              <Badge size="small" :type="getBadgeType(item) || 'info'">{{ getBadge(item) }}</Badge>
            </div>
          </div>

          <!-- 卡片主体内容 -->
          <div class="card-item__body">
            <h3>{{ getItemTitle(item) || '' }}</h3>
            <p v-if="getItemDescription(item)">{{ getItemDescription(item) }}</p>
            <div v-if="getItemMeta(item) && getItemMeta(item).length > 0" class="card-item__meta">
              <Badge
                v-for="(meta, index) in getItemMeta(item)"
                :key="index"
                size="small"
                effect="plain"
              >
                {{ meta }}
              </Badge>
            </div>
          </div>

          <!-- 卡片操作按钮：使用 ItemActionMenu 统一规范（与 SessionList 右键菜单同源） -->
          <div v-if="showActions" class="card-item__actions" @click.stop>
            <button
              type="button"
              class="card-item__actions-btn"
              aria-haspopup="true"
              :aria-expanded="openMenuItem === item"
              @click="openMenu($event, item)"
            >
              <el-icon><More /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </ScrollArea>
    <ItemActionMenu
      :visible="!!openMenuItem"
      :position="menuPosition"
      :items="openMenuItem ? getActions(openMenuItem) : []"
      @command="handleMenuCommand"
      @close="closeMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Document, More } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../../utils/themes'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import ItemActionMenu from './ItemActionMenu.vue'
import { Badge } from '@renderer/components/ui/badge'

const { t } = useI18n()

const openMenuItem = ref<CardGridItem | null>(null)
const menuPosition = ref<{ x: number; y: number } | null>(null)

const openMenu = (e: MouseEvent, item: CardGridItem) => {
  e.stopPropagation()
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  openMenuItem.value = item
  menuPosition.value = { x: rect.left, y: rect.bottom + 4 }
}

const closeMenu = () => {
  openMenuItem.value = null
  menuPosition.value = null
}

const handleMenuCommand = (command: string) => {
  if (openMenuItem.value) {
    emit('action', command, openMenuItem.value)
  }
  closeMenu()
}

export interface CardGridAction {
  command: string
  label: string
  disabled?: boolean
  danger?: boolean
}

export interface CardGridItem {
  id?: string
  [key: string]: any
}

export interface CardGridProps {
  items: CardGridItem[]
  loading?: boolean
  showThumbnail?: boolean
  showActions?: boolean
  getItemId?: (item: CardGridItem) => string
  getItemTitle?: (item: CardGridItem) => string
  getItemDescription?: (item: CardGridItem) => string
  getItemMeta?: (item: CardGridItem) => string[]
  getThumbnail?: (item: CardGridItem) => string | null
  getBadge?: (item: CardGridItem) => string | null | undefined
  getBadgeType?: (item: CardGridItem) => 'success' | 'info' | 'warning' | 'danger' | undefined
  getActions?: (item: CardGridItem) => CardGridAction[]
  isSelected?: (item: CardGridItem) => boolean
  isDisabled?: (item: CardGridItem) => boolean
}

const props = withDefaults(defineProps<CardGridProps>(), {
  loading: false,
  showThumbnail: false,
  showActions: true,
  getItemId: (item: CardGridItem) => item.id || '',
  getItemTitle: (item: CardGridItem) => String(item.title || item.name || ''),
  getItemDescription: (item: CardGridItem) => String(item.description || ''),
  getItemMeta: () => [],
  getThumbnail: () => null,
  getBadge: () => null as string | null,
  getBadgeType: () => 'info' as 'success' | 'info' | 'warning' | 'danger',
  getActions: () => [],
  isSelected: () => false,
  isDisabled: () => false
})

const emit = defineEmits<{
  itemClick: [item: CardGridItem]
  itemDoubleClick: [item: CardGridItem]
  action: [command: string, item: CardGridItem]
}>()

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  height: '100%'
}))

const handleItemClick = (item: CardGridItem) => {
  if (!props.isDisabled(item)) {
    emit('itemClick', item)
  }
}

const handleItemDoubleClick = (item: CardGridItem) => {
  if (!props.isDisabled(item)) {
    emit('itemDoubleClick', item)
  }
}
</script>

<style scoped>
.card-grid {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.card-grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  padding: 20px;
  box-sizing: border-box;
}

.card-grid-item {
  position: relative;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border: 1px solid;
  border-color: v-bind('themeState.currentTheme.textColor2 + "20"');
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

.card-grid-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.card-grid-item.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px rgba(var(--el-color-primary-rgb), 0.3);
}

.card-grid-item.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card-item__thumbnail {
  position: relative;
  width: 100%;
  height: 160px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.card-item__thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-item__thumbnail.is-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.card-item__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: v-bind('themeState.currentTheme.textColor2');
  font-size: 48px;
}

.card-item__text-preview {
  position: relative;
  width: 100%;
  height: 80px;
  padding: 16px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border-bottom: 1px solid;
  border-bottom-color: v-bind('themeState.currentTheme.textColor2 + "20"');
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.text-preview-content {
  font-size: 16px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  word-break: break-word;
  flex: 1;
  min-width: 0;
}

.card-item__badge {
  position: absolute;
  top: 8px;
  right: 8px;
  left: auto;
  z-index: 1;
}

/* 有操作按钮时，badge 左移避免与按钮重叠 */
.card-grid-item.has-actions .card-item__badge {
  right: 44px;
}

.card-item__body {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-item__body h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
}

.card-item__body p {
  margin: 0;
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor2');
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  flex: 1;
}

.card-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}

.card-item__actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}

/* 操作按钮：圆形，与 SessionList 菜单风格统一 */
.card-item__actions-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 50%;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border: 1px solid v-bind('themeState.currentTheme.textColor2 + "30"');
  color: inherit;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.card-item__actions-btn:hover {
  background-color: v-bind('themeState.currentTheme.textColor2 + "18"');
}

@media (max-width: 768px) {
  .card-grid-container {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    padding: 12px;
  }
}
</style>
