<template>
  <el-dialog
    v-model="visible"
    :title="$t('leftMenu.menuConfig.title')"
    width="600px"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
  >
    <div class="menu-config-content">
      <div class="config-description">
        <el-text>{{ $t('leftMenu.menuConfig.description') }}</el-text>
      </div>

      <!-- 菜单项列表 -->
      <div class="menu-items-list">
        <el-scrollbar height="400px">
          <div class="menu-items-container" ref="sortableContainer">
            <template
              v-for="(item, index) in sortedMenuItems"
              :key="
                'type' in item && item.type === 'divider'
                  ? item.key
                  : 'id' in item
                    ? item.id
                    : index
              "
            >
              <!-- 分割线 -->
              <div v-if="'type' in item && item.type === 'divider'" class="menu-divider">
                <div class="divider-line"></div>
                <span class="divider-label">{{
                  $t('leftMenu.menuConfig.bottomMenuDivider', '下侧菜单')
                }}</span>
                <div class="divider-line"></div>
              </div>
              <!-- 菜单项 -->
              <div
                v-else-if="'id' in item"
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
                  <el-icon
                    v-if="item.icon && !item.iconImage && typeof item.icon !== 'string'"
                    class="menu-item-icon"
                  >
                    <component :is="item.icon" />
                  </el-icon>
                  <span
                    v-else-if="item.icon && typeof item.icon === 'string'"
                    class="menu-item-icon-text"
                    >{{ item.icon }}</span
                  >
                  <img
                    v-if="item.iconImage"
                    :src="item.iconImage"
                    alt=""
                    class="menu-item-icon-image"
                  />
                  <span class="menu-item-label">{{ item.label }}</span>
                </div>
                <div class="menu-item-actions" v-if="!item.isCore">
                  <el-switch
                    v-model="item.visible"
                    :active-text="$t('leftMenu.menuConfig.visible')"
                    :inactive-text="$t('leftMenu.menuConfig.hidden')"
                    inline-prompt
                    @change="handleVisibilityChange"
                  />
                </div>
              </div>
            </template>
          </div>
        </el-scrollbar>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleReset">{{ $t('leftMenu.menuConfig.reset') }}</el-button>
        <el-button type="primary" @click="handleSave">{{
          $t('leftMenu.menuConfig.save')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Rank } from '@element-plus/icons-vue'
import { getSetting, setSetting } from '../utils/settings'
import { createRendererLogger } from '../utils/logger'
import Sortable from 'sortablejs'

const sortableContainer = ref<HTMLElement | null>(null)

const { t } = useI18n()
const logger = createRendererLogger('MenuConfigDialog')

export interface MenuConfigItem {
  id: string
  label: string
  icon?: any
  iconImage?: string
  visible: boolean
  isCore?: boolean // 核心功能不能隐藏
  position?: 'top' | 'bottom' // 菜单位置：上侧或下侧
}

interface MenuDivider {
  type: 'divider'
  key: string
}

type MenuItemOrDivider = MenuConfigItem | MenuDivider

const props = defineProps<{
  modelValue: boolean
  items: MenuConfigItem[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [items: MenuConfigItem[]]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const menuItems = ref<MenuConfigItem[]>([])

// 计算是否有上侧和下侧菜单
const hasTopMenu = computed(() => {
  return menuItems.value.some((item) => item.position === 'top' || !item.position)
})

const hasBottomMenu = computed(() => {
  return menuItems.value.some((item) => item.position === 'bottom')
})

// 获取排序后的菜单项（用于显示，包含分割线）
const sortedMenuItems = computed(() => {
  const items: MenuItemOrDivider[] = []
  let lastPosition: 'top' | 'bottom' | null = null

  for (const item of menuItems.value) {
    const currentPosition = item.position || 'top'

    // 如果从top切换到bottom，添加分割线
    if (lastPosition === 'top' && currentPosition === 'bottom') {
      items.push({ type: 'divider', key: 'divider-top-bottom' })
    }

    items.push(item)
    lastPosition = currentPosition
  }

  return items
})

// 初始化菜单项
const initMenuItems = () => {
  menuItems.value = props.items.map((item) => ({ ...item, position: item.position || 'top' }))
}

// 加载配置
const loadConfig = async () => {
  try {
    const config = await getSetting('leftMenuConfig')
    if (config && Array.isArray(config)) {
      // 按照保存的顺序和配置合并
      const configMap = new Map(config.map((item: any) => [item.id, item]))

      // 先按照保存的顺序排列
      const orderedItems: MenuConfigItem[] = []
      const processedIds = new Set<string>()

      // 先添加保存顺序中的项目
      for (const savedItem of config) {
        const originalItem = props.items.find((item) => item.id === savedItem.id)
        if (originalItem) {
          // 将 middle 位置转换为 bottom（迁移逻辑）
          const savedPosition = (savedItem.position as any) || originalItem.position || 'top'
          let position: 'top' | 'bottom' =
            savedPosition === 'middle' ? 'bottom' : savedPosition === 'top' ? 'top' : 'bottom'

          orderedItems.push({
            ...originalItem,
            // 核心菜单项强制可见
            visible: originalItem.isCore ? true : (savedItem.visible ?? originalItem.visible),
            // 恢复位置信息（确保只有 top 或 bottom）
            position
          })
          processedIds.add(savedItem.id)
        }
      }

      // 再添加新增的项目（不在保存配置中的）
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
    logger.error('加载菜单配置失败:', error)
    initMenuItems()
  }
}

// 保存配置（只保存可序列化的字段）
const saveConfig = async () => {
  try {
    // 只保存可序列化的字段，移除Vue组件引用
    const serializableItems = menuItems.value.map((item) => {
      // 将 middle 位置转换为 bottom（迁移逻辑）
      let position: 'top' | 'bottom' = item.position || 'top'
      if ((position as any) === 'middle') {
        position = 'bottom'
      }
      // 确保只有 top 或 bottom
      position = position === 'top' ? 'top' : 'bottom'

      return {
        id: item.id,
        label: item.label,
        iconImage: item.iconImage,
        visible: item.visible,
        isCore: item.isCore,
        position
      }
    })
    await setSetting('leftMenuConfig', serializableItems)
    logger.info('菜单配置已保存', serializableItems)
    // emit保存的序列化数据，而不是包含Vue组件的原始数据
    emit('save', serializableItems)
  } catch (error) {
    logger.error('保存菜单配置失败:', error)
    throw error
  }
}

// 重置配置
const handleReset = () => {
  initMenuItems()
  // 确保核心菜单项始终可见
  menuItems.value.forEach((item) => {
    if (item.isCore) {
      item.visible = true
    }
  })
}

// 保存配置
const handleSave = async () => {
  try {
    // 确保核心菜单项始终可见
    menuItems.value.forEach((item) => {
      if (item.isCore) {
        item.visible = true
      }
    })
    await saveConfig()
    visible.value = false
  } catch (error) {
    // 保存失败，已记录日志
  }
}

// 可见性改变
const handleVisibilityChange = () => {
  // 自动保存
  saveConfig().catch((error) => {
    logger.error('自动保存菜单配置失败:', error)
  })
}

// 初始化拖拽排序
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
        filter: '.menu-divider', // 过滤掉分割线，不允许拖拽
        onEnd: (evt) => {
          if (
            evt.oldIndex !== undefined &&
            evt.newIndex !== undefined &&
            evt.oldIndex !== evt.newIndex
          ) {
            // 获取DOM中所有元素（包括分割线）
            const items = Array.from(sortableContainer.value!.children)

            // 找到分割线在DOM中的实际索引位置
            let dividerDomIndex = -1
            items.forEach((el, index) => {
              if (el.classList.contains('menu-divider')) {
                dividerDomIndex = index
              }
            })

            // 根据DOM中的实际位置更新position
            items.forEach((el, domIndex) => {
              if (!el.classList.contains('menu-divider')) {
                const itemId = (el as HTMLElement).dataset.itemId
                if (itemId) {
                  const item = menuItems.value.find((i) => i.id === itemId)
                  if (item) {
                    // 如果分割线存在，根据分割线的位置判断
                    if (dividerDomIndex !== -1) {
                      // 分割线存在：在分割线之前的是top，之后的是bottom
                      item.position = domIndex < dividerDomIndex ? 'top' : 'bottom'
                    } else {
                      // 分割线不存在：全部是top
                      item.position = 'top'
                    }
                  }
                }
              }
            })

            // 重新排序 menuItems 以匹配 DOM 顺序
            const orderedItems: MenuConfigItem[] = []
            items.forEach((el) => {
              if (!el.classList.contains('menu-divider')) {
                const itemId = (el as HTMLElement).dataset.itemId
                if (itemId) {
                  const item = menuItems.value.find((i) => i.id === itemId)
                  if (item) {
                    orderedItems.push(item)
                  }
                }
              }
            })

            menuItems.value = orderedItems
            // 自动保存排序
            saveConfig().catch((error) => {
              logger.error('自动保存菜单配置失败:', error)
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
      // 等待DOM更新后初始化拖拽
      setTimeout(() => {
        initSortable()
      }, 100)
    })
  }
})

watch(
  () => props.items,
  () => {
    if (visible.value) {
      loadConfig()
    }
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

.menu-item-handle:hover {
  color: var(--el-text-color-primary);
}

.menu-item-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-item-icon {
  font-size: 18px;
  width: 18px;
  height: 18px;
}

.menu-item-icon-image {
  width: 18px;
  height: 18px;
}

.menu-item-icon-text {
  width: 18px;
  height: 18px;
  display: inline-block;
  text-align: center;
  font-size: 14px;
}

.menu-item-label {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.menu-item-actions {
  margin-left: auto;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.menu-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  margin: 8px 0;
}

.divider-line {
  flex: 1;
  height: 1px;
  background-color: var(--el-border-color-light);
}

.divider-label {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
}
</style>
