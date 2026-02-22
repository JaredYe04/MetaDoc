<template>
  <div class="ui-sub-menu" ref="subMenuRef">
    <!-- 菜单标题 -->
    <el-tooltip
      v-if="tooltip && collapse && trigger === 'click'"
      :content="tooltip"
      placement="right"
      :disabled="isOpen || hasOpenSubMenu"
      transition=""
      :show-after="0"
      :hide-after="0"
    >
      <div
        class="ui-sub-menu__title"
        :class="{
          'is-collapsed': collapse && props.level === 1,
          'is-open': isOpen,
          'is-nested': props.level > 1
        }"
        @click.stop="handleTitleClick"
        @mouseenter="handleTitleMouseEnter"
        @mouseleave="handleTitleMouseLeave"
      >
        <div class="ui-sub-menu__title-content">
          <slot name="icon">
            <el-icon v-if="icon" class="ui-sub-menu__icon">
              <component :is="icon" />
            </el-icon>
            <img v-else-if="iconImage" :src="iconImage" class="ui-sub-menu__icon-image" />
          </slot>
          <template v-if="shouldShowTitle">
            <slot name="title">
              <span class="ui-sub-menu__label">{{ title }}</span>
            </slot>
            <el-icon class="ui-sub-menu__arrow">
              <ArrowRight />
            </el-icon>
          </template>
        </div>
      </div>
    </el-tooltip>
    <div
      v-else
      class="ui-sub-menu__title"
      :class="{
        'is-collapsed': collapse && props.level === 1,
        'is-open': isOpen,
        'is-nested': props.level > 1
      }"
      @click.stop="handleTitleClick"
      @mouseenter="handleTitleMouseEnter"
      @mouseleave="handleTitleMouseLeave"
    >
      <div class="ui-sub-menu__title-content">
        <slot name="icon">
          <el-icon v-if="icon" class="ui-sub-menu__icon">
            <component :is="icon" />
          </el-icon>
          <img v-else-if="iconImage" :src="iconImage" class="ui-sub-menu__icon-image" />
        </slot>
        <template v-if="shouldShowTitle">
          <slot name="title">
            <span class="ui-sub-menu__label">{{ title }}</span>
          </slot>
          <el-icon class="ui-sub-menu__arrow">
            <ArrowRight />
          </el-icon>
        </template>
      </div>
    </div>

    <!-- 子菜单弹出层 -->
    <Teleport to="body">
      <Transition name="sub-menu-fade">
        <div
          v-if="isOpen"
          ref="popupRef"
          class="ui-sub-menu__popup"
          :style="popupStyle"
          @mouseenter="handlePopupMouseEnter"
          @mouseleave="handlePopupMouseLeave"
          @click.stop
        >
          <div class="ui-sub-menu__popup-content">
            <slot />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  watch,
  type ComputedRef
} from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { themeState, mixColors } from '../../utils/themes'

// 计算与 HeadMenu 一致的 active 背景色
const activeBackgroundColor = computed(() =>
  mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3)
)
const activeTextColor = computed(() => themeState.currentTheme.textColor)

const props = withDefaults(
  defineProps<{
    title?: string
    tooltip?: string
    icon?: any
    iconImage?: string
    trigger?: 'click' | 'hover'
    level?: number
  }>(),
  {
    title: '',
    tooltip: '',
    trigger: 'click',
    level: 1
  }
)

const emit = defineEmits<{
  (e: 'open'): void
  (e: 'close'): void
}>()

const collapse = inject<boolean>('menuCollapse', false)
const hasOpenSubMenu = inject<ComputedRef<boolean>>(
  'hasOpenSubMenu',
  computed(() => false)
)
// 对于嵌套在弹出层中的子菜单（level > 1），应该总是显示 title
// 因为弹出层中的菜单不在主菜单的折叠状态控制范围内，collapse 可能无法正确获取
const shouldShowTitle = computed(() => {
  // 如果 level > 1，说明是嵌套在弹出层中的，应该总是显示
  if (props.level > 1) {
    return true
  }
  // 否则，根据 collapse 状态决定
  return !collapse
})
const closeAllClickSubMenus = inject<(() => void) | undefined>('closeAllClickSubMenus', undefined)
const registerClickSubMenu = inject<((closeFn: () => void) => void) | undefined>(
  'registerClickSubMenu',
  undefined
)
const unregisterClickSubMenu = inject<((closeFn: () => void) => void) | undefined>(
  'unregisterClickSubMenu',
  undefined
)
const registerSubMenu = inject<((closeFn: () => void) => void) | undefined>(
  'registerSubMenu',
  undefined
)
const unregisterSubMenu = inject<((closeFn: () => void) => void) | undefined>(
  'unregisterSubMenu',
  undefined
)

const subMenuRef = ref<HTMLElement | null>(null)
const popupRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const popupPosition = ref({ top: 0, left: 0 })

const popupStyle = computed(() => {
  const baseBg = themeState.currentTheme.background2nd
  // 使用与 HeadMenu 一致的 active 背景色作为 hover 颜色
  const hoverColor = activeBackgroundColor.value
  return {
    top: `${popupPosition.value.top}px`,
    left: `${popupPosition.value.left}px`,
    '--sub-menu-bg': baseBg,
    '--sub-menu-hover': hoverColor,
    backgroundColor: baseBg,
    zIndex: 2000 + props.level
  }
})

const updatePopupPosition = async () => {
  if (!subMenuRef.value || !popupRef.value) return

  await nextTick()

  const titleRect = subMenuRef.value.getBoundingClientRect()
  const popupRect = popupRef.value.getBoundingClientRect()

  let left = titleRect.right + 12
  let top = titleRect.top

  // 确保不超出视口
  const padding = 8
  const maxLeft = window.innerWidth - popupRect.width - padding
  const maxTop = window.innerHeight - popupRect.height - padding

  if (left > maxLeft) {
    left = titleRect.left - popupRect.width - 12
  }

  if (top + popupRect.height > window.innerHeight - padding) {
    top = window.innerHeight - popupRect.height - padding
  }

  if (top < padding) {
    top = padding
  }

  popupPosition.value = { top, left }
}

const openPopup = async () => {
  if (isOpen.value) return

  // 如果是 click 触发的，先关闭其他所有 click 触发的菜单
  if (props.trigger === 'click' && closeAllClickSubMenus) {
    closeAllClickSubMenus()
  }

  isOpen.value = true
  await nextTick()
  // 确保 popupRef 已经渲染
  if (popupRef.value) {
    updatePopupPosition()
  } else {
    // 如果还没有渲染，等待一下再更新位置
    await nextTick()
    updatePopupPosition()
  }

  // 如果是 click 触发的，注册关闭函数
  if (props.trigger === 'click' && registerClickSubMenu) {
    registerClickSubMenu(closePopup)
  }

  // 注册到所有菜单列表（用于 tooltip 控制）
  if (registerSubMenu) {
    registerSubMenu(closePopup)
  }

  emit('open')
}

const closePopup = () => {
  if (!isOpen.value) return
  isOpen.value = false

  // 如果是 click 触发的，注销关闭函数
  if (props.trigger === 'click' && unregisterClickSubMenu) {
    unregisterClickSubMenu(closePopup)
  }

  // 从所有菜单列表中注销（用于 tooltip 控制）
  if (unregisterSubMenu) {
    unregisterSubMenu(closePopup)
  }

  emit('close')
}

const handleTitleClick = () => {
  if (props.trigger === 'click') {
    if (isOpen.value) {
      closePopup()
    } else {
      openPopup()
    }
  }
}

const handleTitleMouseEnter = () => {
  if (props.trigger === 'hover') {
    // hover 触发的菜单不影响 click 触发的菜单
    openPopup()
  } else if (props.trigger === 'click') {
    // 对于 click 触发的菜单，hover 时不应该关闭其他菜单
    // 只有在点击时才关闭其他菜单（已在 openPopup 中处理）
  }
}

const handleTitleMouseLeave = () => {
  // 对于 click 触发的菜单，hover 离开时不应该关闭
  // 只有点击外部区域或点击其他菜单时才会关闭
  if (props.trigger === 'hover') {
    // 延迟关闭，给鼠标移动到弹出层的时间
    setTimeout(() => {
      if (
        popupRef.value &&
        !popupRef.value.matches(':hover') &&
        subMenuRef.value &&
        !subMenuRef.value.matches(':hover')
      ) {
        closePopup()
      }
    }, 100)
  }
  // 对于 click 触发的菜单，不做任何操作
}

const handlePopupMouseEnter = () => {
  // 鼠标进入弹出层，保持打开
}

const handlePopupMouseLeave = () => {
  if (props.trigger === 'hover') {
    closePopup()
  }
}

// 点击外部关闭
const handleDocumentClick = (e: MouseEvent) => {
  if (props.trigger === 'click' && isOpen.value) {
    const target = e.target as Node | null
    if (
      target &&
      subMenuRef.value &&
      !subMenuRef.value.contains(target) &&
      popupRef.value &&
      !popupRef.value.contains(target)
    ) {
      closePopup()
    }
  }
}

// 监听窗口大小变化
const handleResize = () => {
  if (isOpen.value) {
    updatePopupPosition()
  }
}

watch(isOpen, (newVal) => {
  if (newVal) {
    document.addEventListener('click', handleDocumentClick)
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
  } else {
    document.removeEventListener('click', handleDocumentClick)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('scroll', handleResize, true)
  }
})

onMounted(() => {
  if (isOpen.value) {
    updatePopupPosition()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleResize, true)
  // 清理注册的关闭函数
  if (props.trigger === 'click' && unregisterClickSubMenu) {
    unregisterClickSubMenu(closePopup)
  }
  if (unregisterSubMenu) {
    unregisterSubMenu(closePopup)
  }
})
</script>

<style scoped>
.ui-sub-menu {
  position: relative;
}

.ui-sub-menu__title {
  height: 36px;
  line-height: 36px;
  margin: 2px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  position: relative;
  padding-left: 10px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  cursor: pointer;
  color: var(--sidebar-text, var(--el-text-color-primary));
  font-size: 13px;
}

/* VSCode 风格悬停效果 */
.ui-sub-menu__title:hover {
  background-color: var(--sidebar-hover-bg, v-bind('activeBackgroundColor'));
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  color: var(--sidebar-text-active, var(--el-text-color-primary));
}

/* VSCode 风格 - 打开的菜单 */
.ui-sub-menu__title.is-open {
  border: 1px solid var(--el-border-color) !important;
  background-color: var(--sidebar-active-bg, v-bind('activeBackgroundColor')) !important;
  color: var(--sidebar-text-active, var(--el-text-color-primary)) !important;
  border-radius: 4px !important;
  box-shadow: none !important;
}

.ui-sub-menu__title.is-open .ui-sub-menu__icon,
.ui-sub-menu__title.is-open .ui-sub-menu__icon-image,
.ui-sub-menu__title.is-open .ui-sub-menu__label,
.ui-sub-menu__title.is-open .ui-sub-menu__arrow {
  color: var(--el-text-color-primary) !important;
}

/* is-open 状态下 hover 保持 */
.ui-sub-menu__title.is-open:hover {
  background-color: v-bind('activeBackgroundColor') !important;
  border: 1px solid var(--el-border-color) !important;
  color: var(--el-text-color-primary) !important;
}

.ui-sub-menu__title.is-open:hover .ui-sub-menu__icon,
.ui-sub-menu__title.is-open:hover .ui-sub-menu__icon-image,
.ui-sub-menu__title.is-open:hover .ui-sub-menu__label,
.ui-sub-menu__title.is-open:hover .ui-sub-menu__arrow {
  color: var(--el-text-color-primary) !important;
}

/* 粗野主义按压效果 */
.ui-sub-menu__title:active {
  border: 1px solid var(--el-color-primary) !important;
  background-color: var(--el-color-primary-light-9) !important;
  color: var(--el-color-primary) !important;
  border-radius: 4px !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15) !important;
}

/* 已打开状态下的按压效果 - 使用更深的颜色区分 */
.ui-sub-menu__title.is-open:active {
  background-color: var(--el-color-primary-light-7) !important;
  box-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.2) !important;
}

.ui-sub-menu__title:active .ui-sub-menu__icon,
.ui-sub-menu__title:active .ui-sub-menu__icon-image,
.ui-sub-menu__title:active .ui-sub-menu__label,
.ui-sub-menu__title:active .ui-sub-menu__arrow {
  color: var(--el-color-primary) !important;
}

.ui-sub-menu__title.is-collapsed {
  padding: 0;
  justify-content: center;
}

.ui-sub-menu__title-content {
  display: flex;
  font-size: 13px;
  align-items: center;
  width: 100%;
  justify-content: flex-start;
}

.ui-sub-menu__title.is-collapsed .ui-sub-menu__title-content {
  justify-content: center;
}

.ui-sub-menu__icon {
  margin-right: 8px;
  font-size: 18px;
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-shrink: 0;
}

.ui-sub-menu__icon-image {
  width: 18px;
  height: 18px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-shrink: 0;
}

/* 嵌套菜单（level > 1）的icon大小与普通菜单项一致 */
.ui-sub-menu__title.is-nested .ui-sub-menu__icon {
  font-size: 16px;
  width: 16px;
}

/* 嵌套菜单（level > 1）的icon-image大小与普通菜单项一致 */
.ui-sub-menu__title.is-nested .ui-sub-menu__icon-image {
  width: 16px;
  height: 16px;
}

.ui-sub-menu__title.is-collapsed .ui-sub-menu__icon,
.ui-sub-menu__title.is-collapsed .ui-sub-menu__icon-image {
  margin: 0 auto;
}

.ui-sub-menu__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: inherit;
}

/* 嵌套菜单（level > 1）的文字大小与普通菜单项一致 */
.ui-sub-menu__title.is-nested .ui-sub-menu__label {
  font-size: 13px;
}

/* 嵌套菜单（level > 1）的title整体样式与普通菜单项一致 */
.ui-sub-menu__title.is-nested {
  height: 34px;
  line-height: 34px;
  margin: 1px 4px;
  padding: 0 12px;
  border-radius: 4px;
  border: 1px solid transparent;
}

.ui-sub-menu__title.is-nested:hover {
  background-color: v-bind('activeBackgroundColor');
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}

.ui-sub-menu__title.is-nested.is-open {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border: 1px solid var(--el-color-primary);
  border-radius: 4px;
}

.ui-sub-menu__title.is-nested.is-open:hover {
  background-color: v-bind('activeBackgroundColor');
  border: 1px solid var(--el-border-color);
  color: var(--el-text-color-primary);
}

.ui-sub-menu__arrow {
  font-size: 12px;
  margin-left: auto;
  transition: none !important;
  color: var(--el-text-color-placeholder);
}

.ui-sub-menu__title:hover .ui-sub-menu__arrow {
  color: var(--el-text-color-secondary);
}

.ui-sub-menu__title.is-open .ui-sub-menu__arrow {
  transform: rotate(90deg);
  color: var(--el-color-primary);
}

/* 覆盖 el-tooltip__trigger 的默认样式 */
.ui-sub-menu__title.el-tooltip__trigger {
  border-radius: 4px !important;
  transition: none !important;
  border: 1px solid transparent !important;
  color: var(--el-text-color-primary) !important;
}

.ui-sub-menu__title.el-tooltip__trigger:hover {
  background-color: v-bind('activeBackgroundColor') !important;
  border: 1px solid var(--el-border-color) !important;
  color: var(--el-text-color-primary) !important;
}

.ui-sub-menu__title.el-tooltip__trigger.is-open {
  background-color: var(--el-color-primary-light-9) !important;
  border: 1px solid var(--el-color-primary) !important;
  color: var(--el-color-primary) !important;
}

.ui-sub-menu__title.el-tooltip__trigger.is-open:hover {
  background-color: v-bind('activeBackgroundColor') !important;
  border: 1px solid var(--el-border-color) !important;
  color: var(--el-text-color-primary) !important;
}

.ui-sub-menu__popup {
  position: fixed;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--el-border-color);
  overflow: visible;
  padding: 0;
  min-width: 180px;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.ui-sub-menu__popup-content {
  border-radius: 4px;
  background-color: var(--sub-menu-bg);
  border: none;
  padding: 4px;
  overflow: visible;
}

/* 粗野主义动画 - fade + slide，无弹性 */
.sub-menu-fade-enter-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.sub-menu-fade-leave-active {
  transition: opacity 0.1s ease-in, transform 0.1s ease-in;
}

.sub-menu-fade-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.sub-menu-fade-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.sub-menu-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.sub-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
