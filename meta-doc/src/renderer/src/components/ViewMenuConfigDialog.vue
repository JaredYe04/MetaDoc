<template>
  <Dialog v-model:open="visible">
    <DialogContent class="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>{{ $t('viewMenu.menuConfig.title') }}</DialogTitle>
      </DialogHeader>
      <div class="menu-config-content">
        <div class="config-description">
          <Text>{{ $t('viewMenu.menuConfig.description') }}</Text>
        </div>

        <div class="menu-items-list">
          <ScrollArea class="h-[400px]">
            <div class="menu-items-container" ref="sortableContainer">
              <div
                v-for="item in menuItems"
                :key="item.id"
                class="menu-item-row"
                :class="{ 'is-hidden': !item.visible }"
                :data-item-id="item.id"
              >
                <div class="menu-item-handle">
                  <el-icon class="drag-handle">
                    <Rank />
                  </el-icon>
                </div>
                <div class="menu-item-content">
                  <img
                    v-if="item.iconImage"
                    :src="item.iconImage"
                    alt=""
                    class="menu-item-icon-image"
                  />
                  <span class="menu-item-label">{{ item.label }}</span>
                </div>
                <div class="menu-item-actions" v-if="!item.isCore">
                  <Switch
                    :checked="item.visible"
                    @update:checked="
                      (val) => {
                        item.visible = val
                        handleVisibilityChange()
                      }
                    "
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" @click="handleReset">{{ $t('viewMenu.menuConfig.reset') }}</Button>
        <Button @click="handleSave">{{ $t('viewMenu.menuConfig.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Rank } from '@element-plus/icons-vue'
import { getSetting, setSetting } from '../utils/settings'
import { createRendererLogger } from '../utils/logger'
import Sortable from 'sortablejs'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Switch } from '@renderer/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Text } from '@renderer/components/ui/text'

const sortableContainer = ref<HTMLElement | null>(null)

const { t } = useI18n()
const logger = createRendererLogger('ViewMenuConfigDialog')

export interface ViewMenuConfigDialogItem {
  id: string
  label: string
  iconImage?: string
  visible: boolean
  isCore?: boolean
}

const props = defineProps<{
  modelValue: boolean
  items: ViewMenuConfigDialogItem[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [items: ViewMenuConfigDialogItem[]]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const menuItems = ref<ViewMenuConfigDialogItem[]>([])

const initMenuItems = () => {
  menuItems.value = props.items.map((item) => ({ ...item }))
}

const loadConfig = async () => {
  try {
    const config = await getSetting('viewMenuConfig')
    if (config && Array.isArray(config)) {
      const configMap = new Map(config.map((item: ViewMenuConfigDialogItem) => [item.id, item]))
      const orderedItems: ViewMenuConfigDialogItem[] = []
      const processedIds = new Set<string>()

      for (const savedItem of config) {
        const originalItem = props.items.find((item) => item.id === savedItem.id)
        if (originalItem) {
          orderedItems.push({
            ...originalItem,
            visible: originalItem.isCore ? true : (savedItem.visible ?? originalItem.visible)
          })
          processedIds.add(savedItem.id)
        }
      }

      for (const item of props.items) {
        if (!processedIds.has(item.id)) {
          orderedItems.push({ ...item })
        }
      }

      menuItems.value = orderedItems
    } else {
      initMenuItems()
    }
  } catch (error) {
    logger.error('加载视图菜单配置失败:', error)
    initMenuItems()
  }
}

const saveConfig = async () => {
  const serializableItems = menuItems.value.map((item) => ({
    id: item.id,
    label: item.label,
    iconImage: item.iconImage,
    visible: item.visible,
    isCore: item.isCore
  }))
  await setSetting('viewMenuConfig', serializableItems)
  emit('save', serializableItems)
}

const handleReset = () => {
  initMenuItems()
  menuItems.value.forEach((item) => {
    if (item.isCore) item.visible = true
  })
}

const handleSave = async () => {
  menuItems.value.forEach((item) => {
    if (item.isCore) item.visible = true
  })
  await saveConfig()
  visible.value = false
}

const handleVisibilityChange = () => {
  saveConfig().catch((error) => {
    logger.error('自动保存视图菜单配置失败:', error)
  })
}

let sortableInstance: Sortable | null = null
const initSortable = () => {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
  nextTick(() => {
    if (sortableContainer.value && !sortableInstance) {
      sortableInstance = Sortable.create(sortableContainer.value, {
        handle: '.drag-handle',
        animation: 150,
        onEnd: (evt) => {
          if (
            evt.oldIndex !== undefined &&
            evt.newIndex !== undefined &&
            evt.oldIndex !== evt.newIndex
          ) {
            const items = Array.from(sortableContainer.value!.children)
            const orderedItems: ViewMenuConfigDialogItem[] = []
            items.forEach((el) => {
              const itemId = (el as HTMLElement).dataset.itemId
              if (itemId) {
                const item = menuItems.value.find((i) => i.id === itemId)
                if (item) orderedItems.push(item)
              }
            })
            menuItems.value = orderedItems
            saveConfig().catch((error) => {
              logger.error('自动保存视图菜单配置失败:', error)
            })
          }
        }
      })
    }
  })
}

watch(visible, (newVal) => {
  if (newVal) {
    loadConfig().then(() => {
      setTimeout(() => initSortable(), 100)
    })
  }
})

watch(
  () => props.items,
  () => {
    if (visible.value) loadConfig()
  },
  { deep: true }
)
</script>

<style scoped>
.menu-config-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-description {
  margin-bottom: 8px;
}

.menu-items-list {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.menu-items-container {
  display: flex;
  flex-direction: column;
}

.menu-item-row {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-bg-color);
  transition: background-color 0.2s;
}

.menu-item-row:last-child {
  border-bottom: none;
}

.menu-item-row:hover {
  background-color: var(--el-fill-color-light);
}

.menu-item-row.is-hidden {
  opacity: 0.5;
}

.menu-item-handle {
  margin-right: 12px;
  cursor: move;
  color: var(--el-text-color-placeholder);
}

.menu-item-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-item-icon-image {
  width: 18px;
  height: 18px;
}

.menu-item-label {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.menu-item-actions {
  margin-left: auto;
}
</style>
