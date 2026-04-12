<template>
  <div
    ref="tabsWrapperRef"
    class="main-tabs-wrapper"
    :class="{
      'is-locked': isLockedEffective,
      'is-mac': isMac,
      'is-focus-mode': isFocusMode
    }"
    @dblclick="handleDoubleClick"
    @auxclick="handleWrapperAuxClick"
  >
    <!-- macOS 平台：左边预留空间给原生按钮 -->
    <div v-if="isMac" class="macos-traffic-lights-spacer"></div>

    <!-- Tab 区域：普通模式为横向标签；专注模式为「文档标题 + 下拉」+ 功能页图标 -->
    <div class="tab-region">
      <template v-if="!isFocusMode">
        <div ref="tabsViewportRef" class="tabs-viewport" @wheel.prevent="handleTabWheel">
          <div
            ref="tabsListRef"
            class="tabs-list"
            :class="{
              'is-main-tabs-external-drop-target':
                mainTabsExternalDropHighlight ||
                dropPreview.targetId === MAIN_TABS_PANE_APPEND_SENTINEL
            }"
            @dragover.prevent="handleTabsListDragOverCombined"
            @dragleave="handleTabsListDragLeave"
            @drop.prevent="handleTabsListDrop"
          >
            <div
              v-for="tab in mainBarTabs"
              :key="tab.id"
              class="tab-item"
              :class="{
                'is-active': currentActiveId === tab.id,
                'is-pinned': tab.pinned,
                'is-closing': tab._isClosing,
                'drop-before':
                  (dropPreview.targetId === tab.id && dropPreview.mode === 'before') ||
                  (pathBarInsertHint?.tabBarAnchorTabId === tab.id &&
                    pathBarInsertHint?.tabBarInsertMode === 'before'),
                'drop-after':
                  (dropPreview.targetId === tab.id && dropPreview.mode === 'after') ||
                  (pathBarInsertHint?.tabBarAnchorTabId === tab.id &&
                    pathBarInsertHint?.tabBarInsertMode === 'after'),
                'drop-split-left':
                  dropPreview.targetId === tab.id && dropPreview.splitEdge === 'left',
                'drop-split-right':
                  dropPreview.targetId === tab.id && dropPreview.splitEdge === 'right',
                'drop-split-top':
                  dropPreview.targetId === tab.id && dropPreview.splitEdge === 'top',
                'drop-split-bottom':
                  dropPreview.targetId === tab.id && dropPreview.splitEdge === 'bottom'
              }"
              :data-tab-id="tab.id"
              :draggable="canDragTab(tab)"
              @click.stop="handleTabClickActivate(tab)"
              @mousedown="handleTabMouseDown($event, tab)"
              @dblclick.stop="handleTabLabelDblclick(tab)"
              @contextmenu.prevent="openTabContextMenu($event, tab)"
              @auxclick.stop.prevent="handleTabItemAuxClick($event, tab)"
              @dragstart.stop="handleDragStart(tab.id, $event)"
              @dragover.prevent="handleDragOver(tab.id, $event)"
              @dragleave="handleDragLeave"
              @drop.stop="handleDrop(tab.id, $event)"
              @dragend.stop="handleDragEnd($event)"
            >
              <div
                class="main-tab-label"
                :class="{ 'is-preview': tab.preview, 'is-pinned': tab.pinned }"
                :title="getTabTooltip(tab)"
              >
                <span v-if="tab.pinned" class="main-tab-label__pinned-icon">
                  {{ getTabLabel(tab).charAt(0).toUpperCase() }}
                </span>
                <span v-else class="main-tab-label__text">{{ getTabLabel(tab) }}</span>
                <span v-if="tab.dirty && !tab.pinned" class="main-tab-label__dot" />
                <span
                  v-if="canCloseTab(tab) && !tab.pinned && !tab._isClosing"
                  class="main-tab-label__close"
                  :class="{ 'main-tab-label__close--active': currentActiveId === tab.id }"
                  @click.stop="handleCloseTab(tab.id)"
                  @mousedown.stop
                  @dragstart.stop
                >
                  <el-icon><Close /></el-icon>
                </span>
              </div>
            </div>
            <!-- Electron：父级 drag 会吞掉 HTML5 drop；列表保持 no-drag，仅尾部条为 drag 以拖窗 -->
            <div
              class="tabs-list-window-drag-sash"
              aria-hidden="true"
              @dragover.prevent="handleTabsListDragOverCombined"
              @dragleave="handleTabsListDragLeave"
              @drop.prevent="handleTabsListDrop"
            />
            <div class="tabs-strip-window-drag-nub" aria-hidden="true" />
          </div>
        </div>
      </template>
      <template v-else>
        <div
          ref="tabsViewportRef"
          class="tabs-viewport tabs-viewport--focus-mode"
          @wheel.prevent="handleTabWheel"
        >
          <div
            ref="tabsListRef"
            class="tabs-list tabs-list--focus-mode"
            :class="{
              'is-main-tabs-external-drop-target':
                mainTabsExternalDropHighlight ||
                dropPreview.targetId === MAIN_TABS_PANE_APPEND_SENTINEL
            }"
            @dragover.prevent="handleTabsListDragOverCombined"
            @dragleave="handleTabsListDragLeave"
            @drop.prevent="handleTabsListDrop"
          >
            <div class="focus-doc-slot">
              <button
                ref="focusDocTriggerRef"
                type="button"
                class="focus-doc-picker-trigger"
                :class="{ 'is-open': focusDocPickerOpen }"
                :title="focusDocPickerTriggerTooltip"
                :aria-expanded="focusDocPickerOpen"
                aria-haspopup="listbox"
                :aria-controls="focusDocListboxId"
                @click.stop="toggleFocusDocPicker"
                @keydown="onFocusDocTriggerKeydown"
              >
                <!-- 与 LogoTab.vue 一致：FIXED_LOGO_COLORS；专注顶栏较矮用 size 20（勿再包一层 overflow:hidden，会裁掉 scale(1.15) 的符号） -->
                <LogoIcon
                  class="focus-doc-picker-trigger__logo"
                  :size="20"
                  :bg-color="focusTriggerLogoBg"
                  :symbol-color="focusTriggerLogoSymbol"
                />
                <span class="focus-doc-picker-trigger__text">{{ focusDocPickerButtonLabel }}</span>
                <span
                  v-if="
                    focusActivePickerTab &&
                    focusActivePickerTab.dirty &&
                    !focusActivePickerTab.pinned
                  "
                  class="focus-doc-picker-trigger__dot"
                  aria-hidden="true"
                />
                <el-icon class="focus-doc-picker-trigger__chevron" aria-hidden="true">
                  <ArrowDown />
                </el-icon>
              </button>
            </div>
            <div
              class="tabs-list-window-drag-sash tabs-list-window-drag-sash--focus"
              aria-hidden="true"
              @dragover.prevent="handleTabsListDragOverCombined"
              @dragleave="handleTabsListDragLeave"
              @drop.prevent="handleTabsListDrop"
            />
            <div class="tabs-strip-window-drag-nub" aria-hidden="true" />
          </div>
        </div>
        <Teleport to="body">
          <div
            v-if="focusDocPickerOpen"
            class="focus-doc-picker-shell"
            :style="focusDocPickerShellStyle"
          >
            <div
              :id="focusDocListboxId"
              ref="focusDocPickerPanelRef"
              class="focus-doc-picker-panel"
              role="listbox"
              tabindex="-1"
              @keydown="onFocusDocListKeydown"
            >
              <template v-if="focusPickerTabs.length === 0">
                <div class="focus-doc-picker-empty" role="presentation">
                  {{ t('mainTabs.focusMode.emptyList') }}
                </div>
              </template>
              <template v-else>
                <div
                  v-for="(tab, index) in focusPickerTabs"
                  :key="tab.id"
                  class="tab-item focus-doc-picker-row"
                  :class="{
                    'is-active': currentActiveId === tab.id,
                    'is-pinned': tab.pinned,
                    'is-closing': tab._isClosing,
                    'drop-before':
                      (dropPreview.targetId === tab.id && dropPreview.mode === 'before') ||
                      (pathBarInsertHint?.tabBarAnchorTabId === tab.id &&
                        pathBarInsertHint?.tabBarInsertMode === 'before'),
                    'drop-after':
                      (dropPreview.targetId === tab.id && dropPreview.mode === 'after') ||
                      (pathBarInsertHint?.tabBarAnchorTabId === tab.id &&
                        pathBarInsertHint?.tabBarInsertMode === 'after'),
                    'is-keyboard-focus': focusDocListHighlightIndex === index
                  }"
                  :data-tab-id="tab.id"
                  role="option"
                  :aria-selected="currentActiveId === tab.id"
                  :draggable="canDragTab(tab)"
                  @click.stop="handleFocusDocRowClick(tab)"
                  @mousedown="handleTabMouseDown($event, tab)"
                  @dblclick.stop="handleTabLabelDblclick(tab)"
                  @contextmenu.prevent="openTabContextMenu($event, tab)"
                  @auxclick.stop.prevent="handleTabItemAuxClick($event, tab)"
                  @dragstart.stop="handleDragStart(tab.id, $event)"
                  @dragover.prevent="handleDragOver(tab.id, $event)"
                  @dragleave="handleDragLeave"
                  @drop.stop="handleDrop(tab.id, $event)"
                  @dragend.stop="handleDragEnd($event)"
                >
                  <img
                    class="focus-doc-picker-row__icon"
                    :src="getFocusPickerRowIcon(tab)"
                    alt=""
                    draggable="false"
                  />
                  <div
                    class="main-tab-label focus-doc-picker-row__label"
                    :class="{ 'is-preview': tab.preview, 'is-pinned': tab.pinned }"
                  >
                    <span v-if="tab.pinned" class="main-tab-label__pinned-icon">
                      {{ getTabLabel(tab).charAt(0).toUpperCase() }}
                    </span>
                    <span v-else class="main-tab-label__text">{{ getTabLabel(tab) }}</span>
                    <span v-if="tab.dirty && !tab.pinned" class="main-tab-label__dot" />
                    <span
                      v-if="canCloseTab(tab) && !tab.pinned && !tab._isClosing"
                      class="main-tab-label__close"
                      :class="{ 'main-tab-label__close--active': currentActiveId === tab.id }"
                      @click.stop="handleCloseTab(tab.id)"
                      @mousedown.stop
                      @dragstart.stop
                    >
                      <el-icon><Close /></el-icon>
                    </span>
                  </div>
                </div>
              </template>
            </div>
            <div
              class="focus-doc-picker-resize-handle"
              title=""
              aria-hidden="true"
              @mousedown.stop.prevent="onFocusDocPickerResizePointerDown"
            />
          </div>
        </Teleport>
      </template>
    </div>

    <!-- 专注模式顶栏菜单：紧靠「+」左侧（各平台一致） -->
    <div id="main-tabs-focus-menu-host" class="main-tabs-focus-menu-host"></div>

    <div class="tab-trailing-actions">
      <PopoverRoot v-if="!isFocusMode" v-model:open="openDocsPopoverOpen">
        <div class="open-docs-trigger-slot">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="focus-doc-picker-trigger"
              :class="{ 'is-open': openDocsPopoverOpen, 'is-locked': isLockedEffective }"
              :title="focusDocPickerTriggerTooltip"
              :aria-expanded="openDocsPopoverOpen"
              aria-haspopup="dialog"
              aria-controls="main-tabs-open-docs-popover"
              :disabled="isLockedEffective"
            >
              <LogoIcon
                class="focus-doc-picker-trigger__logo"
                :size="20"
                :bg-color="focusTriggerLogoBg"
                :symbol-color="focusTriggerLogoSymbol"
              />
              <span class="focus-doc-picker-trigger__text">{{ focusDocPickerButtonLabel }}</span>
              <span
                v-if="
                  focusActivePickerTab &&
                  focusActivePickerTab.dirty &&
                  !focusActivePickerTab.pinned
                "
                class="focus-doc-picker-trigger__dot"
                aria-hidden="true"
              />
              <el-icon class="focus-doc-picker-trigger__chevron" aria-hidden="true">
                <ArrowDown />
              </el-icon>
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent
          id="main-tabs-open-docs-popover"
          class="open-docs-popover z-[300010] w-[min(360px,80vw)] border bg-popover p-0 text-popover-foreground shadow-md"
          align="end"
          side="bottom"
          :side-offset="6"
        >
          <div class="open-docs-popover__header">
            {{ t('mainTabs.openDocumentsTitle', '文档') }}
          </div>
          <ScrollArea class="open-docs-popover__scroll h-[min(320px,50vh)]">
            <template v-if="focusPickerTabs.length === 0">
              <div class="open-docs-popover__empty" role="presentation">
                {{ t('mainTabs.focusMode.emptyList') }}
              </div>
            </template>
            <template v-else>
              <button
                v-for="tab in focusPickerTabs"
                :key="tab.id"
                type="button"
                class="open-docs-row"
                :class="{ 'is-active': currentActiveId === tab.id }"
                @click="activateDocumentFromOpenList(tab)"
              >
                <img
                  class="open-docs-row__icon"
                  :src="getFocusPickerRowIcon(tab)"
                  alt=""
                  draggable="false"
                />
                <span class="open-docs-row__title">{{ getTabLabel(tab) }}</span>
                <span v-if="tab.dirty && !tab.pinned" class="open-docs-row__dot" aria-hidden="true" />
                <span
                  v-if="canCloseTab(tab) && !tab.pinned && !tab._isClosing"
                  class="open-docs-row__close"
                  :class="{ 'open-docs-row__close--active': currentActiveId === tab.id }"
                  role="presentation"
                  @click.stop="handleCloseTabFromOpenDocsPopover(tab.id)"
                >
                  <el-icon><Close /></el-icon>
                </span>
              </button>
            </template>
            <ScrollBar />
          </ScrollArea>
        </PopoverContent>
      </PopoverRoot>
      <!-- 新建文档按钮 - 在 scroll 外面，永远可见 -->
      <div
        class="new-tab-button"
        :class="{ 'is-locked': isLockedEffective }"
        :title="$t('mainTabs.newDocumentTooltip')"
        @click="handleNewTabClick"
      >
        <el-icon><Plus /></el-icon>
      </div>
      <!-- 专注模式切换按钮 -->
      <div
        class="focus-mode-button"
        :class="{ 'is-locked': isLockedEffective }"
        :title="isFocusMode ? $t('focusMode.exitTooltip') : $t('focusMode.enterTooltip')"
        @click="handleToggleFocusMode"
      >
        <img
          class="focus-mode-button-icon"
          :src="focusModeButtonIconSrc"
          alt=""
          aria-hidden="true"
        />
      </div>
    </div>

    <!-- macOS 普通模式：Logo 紧贴「+ / 专注」右侧，整条顶栏与交通灯占位对齐 -->
    <LogoTab v-if="isMac && !isFocusMode" class="main-tabs-logo-tab" />

    <!-- 窗口控制按钮 (最右侧) - 仅在非 macOS 平台显示，使用主题图标 -->
    <div v-if="!isMac" class="window-controls">
      <div class="window-control-btn" @click="handleMinimize">
        <img
          class="window-control-icon"
          :src="windowControlIcons.minimize"
          alt=""
          aria-hidden="true"
        />
      </div>
      <div class="window-control-btn" @click="handleMaximize">
        <img
          class="window-control-icon"
          :src="isMaximized ? windowControlIcons.restore : windowControlIcons.maximize"
          alt=""
          aria-hidden="true"
        />
      </div>
      <div class="window-control-btn window-control-btn--close" @click="handleClose">
        <svg
          class="window-control-icon window-control-icon--close"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M2 2l8 8M10 2L2 10" />
        </svg>
      </div>
    </div>

    <!-- Tab 右键菜单 -->
    <transition name="fade">
      <div
        v-if="tabContextMenuVisible && tabContextMenuPosition"
        class="tab-context-menu"
        :style="{ ...tabContextMenuStyle, ...tabContextMenuPositionStyle }"
        @click.stop
      >
        <!-- 切换到该标签页（当前非激活时） -->
        <button
          v-if="tabContextMenuTab && tabContextMenuTab.id !== currentActiveId"
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('activateTab')"
        >
          {{ t('mainTabs.contextMenu.openTab') }}
        </button>
        <div
          v-if="tabContextMenuTab && tabContextMenuTab.id !== currentActiveId"
          class="tab-context-menu__divider"
        ></div>
        <!-- 固定/取消固定标签页 -->
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('togglePin')"
        >
          {{
            tabContextMenuTab?.pinned
              ? t('mainTabs.contextMenu.unpinTab')
              : t('mainTabs.contextMenu.pinTab')
          }}
        </button>
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('closeTab')"
        >
          {{ t('mainTabs.contextMenu.closeTab') }}
        </button>
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('closeOtherTabs')"
        >
          {{ t('mainTabs.contextMenu.closeOtherTabs') }}
        </button>
        <button
          v-if="canMoveToOtherWindow(tabContextMenuTab)"
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('openInNewWindow')"
        >
          {{ t('mainTabs.contextMenu.openInNewWindow') }}
        </button>
        <div
          v-if="canMoveToOtherWindow(tabContextMenuTab)"
          class="tab-context-menu__item tab-context-menu__submenu-trigger"
          @mouseenter="showMoveToWindowSubmenu = true"
          @mouseleave="handleMoveToWindowMouseLeave"
        >
          <span>{{ t('mainTabs.contextMenu.moveToWindow') }}</span>
          <el-icon class="arrow-icon"><ArrowRight /></el-icon>
          <div
            v-if="showMoveToWindowSubmenu"
            class="tab-context-menu__submenu"
            @mouseenter="handleMoveToWindowSubmenuEnter"
            @mouseleave="showMoveToWindowSubmenu = false"
          >
            <button
              v-for="w in otherWindowsList"
              :key="w.id"
              type="button"
              class="tab-context-menu__item"
              @click="handleMoveToWindow(w.id)"
            >
              {{ w.title }}
            </button>
            <div v-if="otherWindowsList.length === 0" class="tab-context-menu__empty">
              {{ t('common.noOtherWindow', '无其他窗口') }}
            </div>
          </div>
        </div>
        <template v-if="hasFileTabPath(tabContextMenuTab)">
          <div class="tab-context-menu__divider"></div>
          <button
            type="button"
            class="tab-context-menu__item"
            @click="handleContextMenuAction('copyPath')"
          >
            {{ t('mainTabs.contextMenu.copyPath') }}
          </button>
          <button
            type="button"
            class="tab-context-menu__item"
            @click="handleContextMenuAction('copyTitle')"
          >
            {{ t('mainTabs.contextMenu.copyTitle') }}
          </button>
          <button
            type="button"
            class="tab-context-menu__item"
            @click="handleContextMenuAction('copyFilename')"
          >
            {{ t('mainTabs.contextMenu.copyFilename') }}
          </button>
          <button
            type="button"
            class="tab-context-menu__item"
            @click="handleContextMenuAction('showInFolder')"
          >
            {{ t('mainTabs.contextMenu.showInFolder') }}
          </button>
        </template>
        <div class="tab-context-menu__divider"></div>
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('moveLeft')"
        >
          {{ t('mainTabs.contextMenu.moveLeft') }}
        </button>
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('moveRight')"
        >
          {{ t('mainTabs.contextMenu.moveRight') }}
        </button>
      </div>
    </transition>
    <!-- 全局 MessageBox：Teleport 到 body，z-index 高于 Dialog(10000)，低于顶栏浮动层(300000)；点击遮罩不关闭 -->
    <Teleport to="body">
      <GlobalMessageBox />
    </Teleport>
    <!-- 全局 Toast：替代 ElMessage，顶层显示，主题适配 -->
    <GlobalToast />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useWorkspace, type WorkspaceTab } from '../stores/workspace'
import eventBus from '../utils/event-bus'
import messageBridge from '../bridge/message-bridge'
import { createRendererLogger } from '../utils/logger'
import { ArrowDown, Close, Plus, ArrowRight } from '@element-plus/icons-vue'
import { PopoverRoot, PopoverTrigger } from 'reka-ui'
import { PopoverContent } from './ui/popover'
import { ScrollArea, ScrollBar } from './ui/scroll-area'
import { mixColors, themeState, FIXED_LOGO_COLORS } from '../utils/themes'
import { useCloseTab } from '../composables/useCloseTab'
import {
  useTabDrag,
  cleanupDragImage,
  serializeTabData,
  checkCanDragToOtherWindow,
  setTabBarElement,
  prefetchDragThumbnail,
  consumeTabDropPreviewIfNeeded,
  consumeEditorContentDropIfNeeded,
  setTabDragSourceSurface,
  snapshotEditorPaneDropHighlightBeforeConsume,
  snapshotDragEndDropHighlightFromPreview,
  promotePaneTabToMainBarWithInsertHint,
  TAB_DRAG_MIME_TYPE,
  WORKSPACE_FILE_PATH_DRAG_MIME,
  readWorkspacePathFromDataTransfer,
  shouldTreatAsExternalWorkspacePathDrag,
  WORKBENCH_SYNTHETIC_ID,
  MAIN_TABS_PANE_APPEND_SENTINEL,
  tabDragSourceSurface,
  dndLog
} from '../composables/useTabDrag'
import { useTabAnimation } from '../composables/useTabAnimation'
import GlobalMessageBox from './global/GlobalMessageBox.vue'
import GlobalToast from './global/GlobalToast.vue'
import LogoTab from './LogoTab.vue'
import LogoIcon from './LogoIcon.vue'
import { useFocusMode } from '../composables/useFocusMode'
import { useEditorChromeLayout } from '../composables/useEditorChromeLayout'
import {
  collectTabIdsInLayout,
  forEachGroup,
  layoutQualifiesForWorkbenchMainTab
} from '../stores/workspace-layout'
import { isMacOSLayout } from '../utils/keyboard-scheme-defaults'

// 主题中的窗口控制图标（themes.js 中注册，TS 无类型声明故用 Record 访问）
const windowControlIcons = computed(() => {
  const t = themeState.currentTheme as unknown as Record<string, string>
  return { minimize: t.MinimizeIcon, maximize: t.MaximizeIcon, restore: t.RestoreIcon }
})

const logger = createRendererLogger('MainTabs')
const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const props = withDefaults(defineProps<{ mode?: 'normal' | 'demo' }>(), { mode: 'normal' })

const workspace = useWorkspace()
const openDocsPopoverOpen = ref(false)
/** 资源树路径 / 窗格 Tab 拖过顶栏时整栏高亮 */
const mainTabsExternalDropHighlight = ref(false)
/** 资源树 path 在主栏上的插入位置（与 dropPreview 分列，避免干扰 Tab 排序） */
type PathBarInsertHint = { tabBarAnchorTabId: string; tabBarInsertMode: 'before' | 'after' }
const pathBarInsertHint = ref<PathBarInsertHint | null>(null)

const tabsWrapperRef = ref<HTMLElement | null>(null)
const tabsViewportRef = ref<HTMLElement | null>(null)
const tabsListRef = ref<HTMLElement | null>(null)

const focusDocTriggerRef = ref<HTMLElement | null>(null)
const focusDocPickerPanelRef = ref<HTMLElement | null>(null)
const focusDocPickerOpen = ref(false)
const focusDocListHighlightIndex = ref(0)
const focusDocListboxId = 'main-tabs-focus-doc-listbox'
const focusDocPickerGeom = reactive({ top: 0, left: 0 })
const FOCUS_DOC_PICKER_WIDTH_KEY = 'metadoc-focus-picker-width'
const FOCUS_DOC_PICKER_MIN_W = 260
const FOCUS_DOC_PICKER_MAX_W = 720
const focusDocPickerWidth = ref(320)
// 与 LogoTab.vue 相同：固定品牌色，不随亮/暗主题变化
const focusTriggerLogoBg = FIXED_LOGO_COLORS.bgColor
const focusTriggerLogoSymbol = FIXED_LOGO_COLORS.symbolColor

const { checkCanCloseTab, doRemoveTab, isLocked } = useCloseTab()
const isLockedEffective = computed<boolean>(() => props.mode === 'demo' || isLocked.value)

const { isFocusMode, toggleFocusMode, enterFocusMode, exitFocusMode } = useFocusMode()
const { editorChromeLayout } = useEditorChromeLayout()

/** 分屏中「文档组」数量：单组为工作台1，左右分屏两组为工作台2，以此类推 */
const workbenchMainTabOrdinal = computed(() => {
  const root = workspace.workspaceLayoutRoot.value
  let n = 0
  forEachGroup(root, (g) => {
    if (g.tabIds.length > 0) n++
  })
  return Math.max(1, n)
})

const workbenchSyntheticTab = computed(
  (): WorkspaceTab => ({
    id: WORKBENCH_SYNTHETIC_ID,
    kind: 'system',
    title: t('mainTabs.workbenchTabWithSessionCount', {
      count: workbenchMainTabOrdinal.value
    }),
    subtitle: '',
    path: '',
    format: 'md',
    dirty: false,
    pinned: false
  })
)

function resolveWorkbenchMainBarTargetId(tabId: string): string {
  if (tabId !== WORKBENCH_SYNTHETIC_ID) return tabId
  const set = collectTabIdsInLayout(workspace.workspaceLayoutRoot.value)
  const first = workspace.tabs.find((x) => set.has(x.id))
  return first?.id ?? tabId
}

const focusModeButtonIconSrc = computed(() => {
  const t = themeState.currentTheme as unknown as Record<string, string>
  return isFocusMode.value ? t.WorkOnIcon : t.WorkOffIcon
})

const handleToggleFocusMode = () => {
  if (isLockedEffective.value) return
  toggleFocusMode()
}

const DEMO_TABS = computed<WorkspaceTab[]>(() => [
  {
    id: 'demo-1',
    kind: 'file',
    title: t('mainTabs.untitled'),
    subtitle: '',
    path: '',
    format: 'md',
    dirty: false
  },
  {
    id: 'demo-2',
    kind: 'system',
    title: t('mainTabs.userManual'),
    subtitle: '',
    path: '',
    format: 'md',
    dirty: false,
    route: '/user-manual'
  }
])

// 使用新的拖拽 composable
const {
  isDragging,
  draggingId,
  draggingTab,
  dropPreview,
  handleDragStart: handleTabDragStart,
  handleDragOver: handleTabDragOver,
  handleDragLeave: handleTabDragLeave,
  handleDrop: handleTabDrop,
  handleDragEnd: handleTabDragEnd,
  computeDropMode,
  findTabItemElement,
  resetDragState
} = useTabDrag({
  onDragStart: async (tab, event) => {
    await nextTick()
  },
  onDragEnd: async (tab, event) => {
    await nextTick()
  }
})

/** document capture 先消费顶栏 path drop 时不会走到 handleTabsListDrop，须同步清掉高亮 */
function clearMainTabsExternalDropUi() {
  mainTabsExternalDropHighlight.value = false
  pathBarInsertHint.value = null
  if (!isDragging.value && dropPreview.value.targetId === MAIN_TABS_PANE_APPEND_SENTINEL) {
    dropPreview.value = { targetId: null, mode: null, splitEdge: null }
  }
}

function onPathBarInsertHintBus(hint: unknown) {
  if (
    hint &&
    typeof hint === 'object' &&
    'tabBarAnchorTabId' in hint &&
    'tabBarInsertMode' in hint
  ) {
    const m = (hint as PathBarInsertHint).tabBarInsertMode
    if (m === 'before' || m === 'after') {
      pathBarInsertHint.value = hint as PathBarInsertHint
      return
    }
  }
  pathBarInsertHint.value = null
}

// Tab 右键菜单
const tabContextMenuVisible = ref(false)
const tabContextMenuPosition = ref<{ x: number; y: number } | null>(null)
const tabContextMenuTab = ref<WorkspaceTab | null>(null)
const showMoveToWindowSubmenu = ref(false)
const otherWindowsList = ref<Array<{ id: number; title: string }>>([])
let moveToWindowLeaveTimer: ReturnType<typeof setTimeout> | null = null

// 窗口是否最大化（用于标题栏最大化/还原图标切换）
const isMaximized = ref(false)

// 标签页滚动相关（只读 UI 状态，不影响布局 CSS）
const isOverflowing = ref(false)

// 检测标签页是否溢出：用真实几何尺寸判断，仅用于 UI 反馈（如滚动按钮），不切换布局
const checkTabOverflow = () => {
  if (isFocusMode.value) {
    isOverflowing.value = false
    return
  }
  const viewport = tabsViewportRef.value
  if (!viewport) return
  isOverflowing.value = viewport.scrollWidth > viewport.clientWidth + 1
}

const scrollActiveTabIntoView = () => {
  const viewport = tabsViewportRef.value
  if (!viewport) return
  const activeItem = viewport.querySelector('.tab-item.is-active') as HTMLElement | null
  if (!activeItem) return
  if (isFocusMode.value) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    return
  }
  const itemLeft = activeItem.offsetLeft
  const itemRight = itemLeft + activeItem.offsetWidth
  const scrollLeft = viewport.scrollLeft
  const visibleRight = scrollLeft + viewport.clientWidth
  if (itemLeft < scrollLeft) {
    viewport.scrollTo({ left: itemLeft, behavior: 'smooth' })
  } else if (itemRight > visibleRight) {
    viewport.scrollTo({ left: itemRight - viewport.clientWidth, behavior: 'smooth' })
  }
}

const tabContextMenuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))

const tabContextMenuPositionStyle = computed(() => {
  if (!tabContextMenuPosition.value) return {}
  return {
    position: 'fixed' as const,
    left: tabContextMenuPosition.value.x + 'px',
    top: tabContextMenuPosition.value.y + 'px'
  }
})

const hasFileTabPath = (tab: WorkspaceTab | null): boolean => {
  if (!tab) return false
  return tab.kind === 'file' && !!tab.path?.trim()
}

const canMoveToOtherWindow = (tab: WorkspaceTab | null): boolean => {
  return !!tab
}

const openTabContextMenu = async (e: MouseEvent, tab: WorkspaceTab) => {
  if (isLockedEffective.value) return
  if (tab.id === WORKBENCH_SYNTHETIC_ID) return
  if (tab._isClosing) return
  focusDocPickerOpen.value = false
  tabContextMenuVisible.value = true
  tabContextMenuPosition.value = { x: e.clientX, y: e.clientY }
  tabContextMenuTab.value = tab
  showMoveToWindowSubmenu.value = false
  try {
    if (messageBridge.getIpc() && canMoveToOtherWindow(tab)) {
      otherWindowsList.value = await messageBridge.invoke('get-all-windows')
    } else {
      otherWindowsList.value = []
    }
  } catch (err) {
    logger.warn('获取窗口列表失败:', err)
    otherWindowsList.value = []
  }
}

const handleMoveToWindowMouseLeave = () => {
  moveToWindowLeaveTimer = setTimeout(() => {
    moveToWindowLeaveTimer = null
    showMoveToWindowSubmenu.value = false
  }, 150)
}

const handleMoveToWindowSubmenuEnter = () => {
  if (moveToWindowLeaveTimer) {
    clearTimeout(moveToWindowLeaveTimer)
    moveToWindowLeaveTimer = null
  }
  showMoveToWindowSubmenu.value = true
}

const closeTabContextMenu = () => {
  tabContextMenuVisible.value = false
  tabContextMenuPosition.value = null
  tabContextMenuTab.value = null
  showMoveToWindowSubmenu.value = false
  if (moveToWindowLeaveTimer) {
    clearTimeout(moveToWindowLeaveTimer)
    moveToWindowLeaveTimer = null
  }
}

const handleContextMenuAction = async (action: string) => {
  const tab = tabContextMenuTab.value
  if (!tab) return
  closeTabContextMenu()

  switch (action) {
    case 'activateTab':
      workspace.activateTab(tab.id)
      if (tab.kind === 'system' || tab.kind === 'tool') {
        const toRoute = tab.route
        if (toRoute && toRoute !== route.path) {
          nextTick(() => router.push(toRoute))
        }
      }
      focusDocPickerOpen.value = false
      break
    case 'togglePin':
      workspace.togglePinTab(tab.id)
      break
    case 'closeTab':
      await handleCloseTab(tab.id)
      break
    case 'closeOtherTabs':
      const otherIds = allTabs.value.filter((t) => t.id !== tab.id).map((t) => t.id)
      for (const id of otherIds) {
        await handleCloseTab(id)
      }
      break
    case 'openInNewWindow':
      await handleOpenInNewWindow(tab)
      break
    case 'copyPath':
      if (hasFileTabPath(tab) && tab.path) {
        await navigator.clipboard.writeText(tab.path)
        eventBus.emit('show-success', { message: t('workspaceExplorer.copyPathSuccess') })
      }
      break
    case 'copyTitle':
      if (hasFileTabPath(tab)) {
        const title = tab.subtitle?.trim() || tab.title?.trim() || ''
        await navigator.clipboard.writeText(title)
        eventBus.emit('show-success', { message: t('common.copySuccess') })
      }
      break
    case 'copyFilename':
      if (hasFileTabPath(tab) && tab.path) {
        const filename = tab.path.split(/[/\\]/).filter(Boolean).pop() || ''
        await navigator.clipboard.writeText(filename)
        eventBus.emit('show-success', { message: t('common.copySuccess') })
      }
      break
    case 'showInFolder':
      if (hasFileTabPath(tab) && tab.path && messageBridge.getIpc()) {
        await messageBridge.invoke('show-item-in-folder', tab.path)
      }
      break
    case 'moveLeft': {
      const fromIdx = workspace.tabs.findIndex((t) => t.id === tab.id)
      if (fromIdx > 0) {
        const [tabItem] = workspace.tabs.splice(fromIdx, 1)
        workspace.tabs.splice(fromIdx - 1, 0, tabItem)
        workspace.refreshDocumentLayout()
        nextTick(() => workspace.activateTab(tab.id))
      }
      break
    }
    case 'moveRight': {
      const fromIdx = workspace.tabs.findIndex((t) => t.id === tab.id)
      if (fromIdx >= 0 && fromIdx < workspace.tabs.length - 1) {
        const [tabItem] = workspace.tabs.splice(fromIdx, 1)
        workspace.tabs.splice(fromIdx + 1, 0, tabItem)
        workspace.refreshDocumentLayout()
        nextTick(() => workspace.activateTab(tab.id))
      }
      break
    }
  }
}

const handleOpenInNewWindow = async (tab: WorkspaceTab) => {
  if (!canMoveToOtherWindow(tab) || !messageBridge.getIpc()) return
  const tabData = serializeTabData(tab.id)
  if (!tabData) return

  const myWindowId = await getCurrentWindowId()
  // 新窗口位置：当前窗口中心偏右下方
  const position = {
    x: window.screenX + window.innerWidth / 2 + 40,
    y: window.screenY + window.innerHeight / 2 + 40
  }

  try {
    await messageBridge.invoke('create-window-with-tab', {
      tabData,
      position,
      focusMode: isFocusMode.value
    })
    await removeTabAfterDrag(tab.id, myWindowId)
    logger.info(`Tab ${tab.id} 已在新窗口中打开`)
  } catch (error) {
    logger.error('在新窗口中打开失败:', error)
  }
}

const handleMoveToWindow = async (targetWindowId: number) => {
  const tab = tabContextMenuTab.value
  if (!tab || !canMoveToOtherWindow(tab)) return
  closeTabContextMenu()

  const tabData = serializeTabData(tab.id)
  if (!tabData || !messageBridge.getIpc()) return

  const myWindowId = await getCurrentWindowId()
  if (targetWindowId === myWindowId) return

  try {
    messageBridge.send('transfer-tab-to-window', {
      targetWindowId,
      tabData: { ...tabData, sourceWindowId: myWindowId },
      insertIndex: 0
    })
    await removeTabAfterDrag(tab.id, myWindowId)
  } catch (error) {
    logger.error('移至其他窗口失败:', error)
  }
}

const handleTabContextMenuClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (
    focusDocPickerOpen.value &&
    !target.closest('.focus-doc-picker-shell') &&
    !target.closest('.focus-doc-picker-trigger')
  ) {
    focusDocPickerOpen.value = false
  }
  if (tabContextMenuVisible.value && !target.closest('.tab-context-menu')) {
    closeTabContextMenu()
  }
}

// 检测是否为 macOS
const isMac = computed(() => isMacOSLayout())

// 使用mixColors生成辅助色 - 使用themeState.currentTheme的主题色
const tabsContainerBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.3)
  } catch {
    return '#f5f5f5'
  }
})

// Tab项的颜色 - 混合度浅0.2（原来是0.1，现在应该是0.08）
const tabItemBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.2)
  } catch {
    return '#f7f7f7'
  }
})

const tabItemHoverBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.15) // 与灰色混合8%
  } catch {
    return '#f0f0f0'
  }
})

const tabItemActiveBackgroundColor = computed(() => {
  try {
    // 使用主题的primaryColor或者background2nd
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.08) // 与灰色混合8%
  } catch {
    return '#e8f0f8'
  }
})

// Border颜色 - 使用background-color和灰色更深的混合（0.4）
const borderColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.4)
  } catch {
    return '#d0d0d0'
  }
})

// 粗野主义hover背景色 - 与UIMenuItem等组件统一
const brutalistHoverBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background2nd
    const textColor = themeState.currentTheme.textColor
    return mixColors(baseColor, textColor, 0.3)
  } catch {
    return '#acacac'
  }
})

// 按下态背景：浅白/深灰黑 80%、主题色 20%，避免纯白
const brutalistActiveBackgroundColor = computed(() => {
  try {
    const isDark = themeState.currentTheme?.type === 'dark'
    const primary = themeState.currentTheme?.primaryColor || (isDark ? '#9ca3af' : '#374151')
    const base = isDark ? '#141414' : '#f0f0f0'
    return mixColors(primary, base, 0.8)
  } catch {
    return '#e8e8e8'
  }
})

// 关闭按钮按下态：深灰黑/浅白 80%、danger 20%，无边缘感
const brutalistActiveCloseBackgroundColor = computed(() => {
  try {
    const isDark = themeState.currentTheme?.type === 'dark'
    const danger = '#ef4444'
    const base = isDark ? '#141414' : '#f0f0f0'
    return mixColors(danger, base, 0.8)
  } catch {
    return '#fde2e2'
  }
})

// 不活跃Tab的文本颜色 - 根据主题类型设置更深的灰色
const inactiveTabTextColor = computed(() => {
  try {
    const isDark = themeState.currentTheme.type === 'dark'
    // 浅色模式：使用更深的灰色（接近黑色但仍是灰色）
    // 深色模式：使用更浅的灰色（接近白色但仍是灰色）
    // 不混合纯黑/白色，而是使用固定的灰色值，让对比更明显
    if (isDark) {
      // 深色模式：使用较浅的灰色，但比默认的 secondary 更深
      return '#bbbbbb' // 比 #cccccc 更深，但仍是灰色
    } else {
      // 浅色模式：使用较深的灰色，但比纯黑色浅
      return '#555555' // 比 #666666 更深，但仍是灰色
    }
  } catch {
    return themeState.currentTheme.type === 'dark' ? '#bbbbbb' : '#555555'
  }
})

// 窗口控制函数
const handleMinimize = () => {
  if (messageBridge.getIpc()) {
    messageBridge.send('window-minimize')
  }
}

const handleMaximize = () => {
  if (messageBridge.getIpc()) {
    messageBridge.send('window-maximize')
  }
}

// 双击标题栏空白区域最大化/还原
const handleDoubleClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (
    target.closest('.tab-item') ||
    target.closest('.window-controls') ||
    target.closest('.main-tab-label') ||
    target.closest('.main-tabs-focus-menu-host') ||
    target.closest('.focus-tab-bar-menus-root') ||
    target.closest('.new-tab-button') ||
    target.closest('.focus-mode-button') ||
    target.closest('.focus-doc-picker-trigger') ||
    target.closest('.focus-doc-picker-shell')
  ) {
    return
  }
  handleMaximize()
}

const handleClose = () => {
  // 关闭当前窗口，而非退出整个应用；主进程根据可见窗口数量决定是否退出
  if (messageBridge.getIpc()) {
    messageBridge.send('close-window')
  } else {
    eventBus.emit('quit')
  }
}

// 点击新建文档按钮
const handleNewTabClick = () => {
  if (isLockedEffective.value) return
  workspace.openNewDocumentTab()
}

// 除空白页外的全部 Tab（专注下拉、滚轮切换等）
const allTabs = computed(() => {
  if (props.mode === 'demo') return DEMO_TABS.value
  return workspace.tabs.filter((tab) => !(tab.kind === 'system' && tab.route === '/dummy'))
})

/**
 * 经典：顶栏展示全部标签。
 * 工作区：满足「工作台」条件时，布局内成员不出现在顶栏，末尾追加合成「工作台」；其余为顶栏独立 Tab（placement top 等）。
 */
const mainBarTabs = computed((): WorkspaceTab[] => {
  if (props.mode === 'demo') return DEMO_TABS.value
  if (editorChromeLayout.value === 'classic') {
    return allTabs.value.filter((tab) => !tab._isInitialPlaceholder)
  }
  const root = workspace.workspaceLayoutRoot.value
  const inLayout = collectTabIdsInLayout(root)
  const qualifies = layoutQualifiesForWorkbenchMainTab(root)
  const out: WorkspaceTab[] = []
  for (const tab of workspace.tabs) {
    if (tab._isInitialPlaceholder) continue
    if (qualifies && inLayout.has(tab.id)) continue
    out.push(tab)
  }
  if (qualifies && inLayout.size > 0) {
    out.push(workbenchSyntheticTab.value)
  }
  return out
})

// 计算Tab数量，用于CSS变量
const tabCount = computed(() => mainBarTabs.value.length)

// 使用标签页动画 composable - GPU 加速 FLIP 动画
const { triggerNewTabAnimation, triggerCloseTabAnimation, cancelAnimations } =
  useTabAnimation(tabsListRef)

const currentActiveId = computed({
  get: () => {
    if (props.mode === 'demo') return 'demo-1'
    if (
      editorChromeLayout.value === 'workspace' &&
      layoutQualifiesForWorkbenchMainTab(workspace.workspaceLayoutRoot.value)
    ) {
      const aid = workspace.activeTabId.value
      const set = collectTabIdsInLayout(workspace.workspaceLayoutRoot.value)
      if (aid && set.has(aid)) return WORKBENCH_SYNTHETIC_ID
    }
    return workspace.activeTabId.value
  },
  set: (value: string) => {
    if (isLockedEffective.value) return
    if (props.mode === 'demo') return
    if (value === WORKBENCH_SYNTHETIC_ID) {
      const set = collectTabIdsInLayout(workspace.workspaceLayoutRoot.value)
      const cur = workspace.activeTabId.value
      if (cur && set.has(cur)) return
      const first = workspace.tabs.find((x) => set.has(x.id))
      if (first) workspace.activateTab(first.id)
      return
    }
    if (value !== workspace.activeTabId.value) {
      workspace.activateTab(value)
      const tab = allTabs.value.find((t) => t.id === value)
      if (tab && (tab.kind === 'system' || tab.kind === 'tool') && tab.route) {
        nextTick(() => {
          if (tab.route && tab.route !== route.path) {
            router.push(tab.route)
          }
        })
      }
    }
  }
})

const getTabLabel = (tab: WorkspaceTab): string => {
  return tab.subtitle?.trim() || tab.title?.trim() || t('mainTabs.untitled')
}

const getTabTooltip = (tab: WorkspaceTab): string => {
  const primary = getTabLabel(tab)
  const secondary = tab.title?.trim()
  if (!secondary || secondary === primary) {
    return primary
  }
  return secondary ? `${primary} — ${secondary}` : primary
}

/** 专注模式：下拉列表与横向标签栏顺序一致（含主页、AI 会话、文档等） */
const focusPickerTabs = computed(() => allTabs.value)

const focusActivePickerTab = computed(
  () => allTabs.value.find((x) => x.id === workspace.activeTabId.value) ?? null
)

const focusDocPickerButtonLabel = computed(() => {
  if (focusActivePickerTab.value) {
    return getTabLabel(focusActivePickerTab.value)
  }
  if (focusPickerTabs.value.length === 0) {
    return t('mainTabs.focusMode.noDocuments')
  }
  return t('mainTabs.focusMode.pickDocument')
})

const focusDocPickerTriggerTooltip = computed(() => {
  if (focusActivePickerTab.value) return getTabTooltip(focusActivePickerTab.value)
  return t('mainTabs.focusMode.pickerTooltip')
})

const focusDocPickerShellStyle = computed(() => ({
  position: 'fixed' as const,
  zIndex: 100004,
  top: `${focusDocPickerGeom.top}px`,
  left: `${focusDocPickerGeom.left}px`,
  width: `${focusDocPickerWidth.value}px`,
  maxHeight: `min(420px, calc(100vh - ${focusDocPickerGeom.top + 12}px))`
}))

const getFocusPickerRowIcon = (tab: WorkspaceTab): string => {
  const th = themeState.currentTheme as unknown as Record<string, string>
  if (tab.kind === 'file') {
    const f = (tab.format || '').toLowerCase()
    if (f === 'tex' || f === 'latex') return th.TexDocIcon || th.FileIcon || ''
    if (f === 'md' || f === 'markdown') return th.MdDocIcon || th.FileIcon || ''
    return th.FileIcon || th.MdDocIcon || ''
  }
  if (tab.kind === 'new') return th.MdDocIcon || th.FileIcon || ''
  return getFocusSurfaceTabIcon(tab)
}

const getFocusSurfaceTabIcon = (tab: WorkspaceTab): string => {
  const th = themeState.currentTheme as unknown as Record<string, string>
  const route = tab.route || ''
  const map: Record<string, string> = {
    '/global-home': th.HomeIcon,
    '/knowledge-base': th.KnowledgeIcon,
    '/agent': th.AgentIcon,
    '/user-manual': th.FileIcon,
    '/debug': th.DebugIcon,
    '/dummy': th.FileIcon,
    '/setting': th.SettingIcon,
    '/ai-chat': th.PenAiIcon,
    '/fomula-recognition': th.MathIcon,
    '/data-analysis': th.MetaIcon,
    '/ocr': th.SearchIcon,
    '/attachment': th.FileIcon,
    '/graph': th.BranchIcon,
    '/ai-graph': th.BranchIcon,
    '/smart-drawing-assistant': th.BranchIcon,
    '/llm-statistics': th.MetaIcon,
    '/aigc-detection': th.FileIcon,
    '/user-feedback': th.FeedbackIcon,
    '/agent-review': th.AgentIcon
  }
  return map[route] || th.FileIcon || ''
}

const updateFocusDocPickerGeometry = () => {
  const el = focusDocTriggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  focusDocPickerGeom.top = r.bottom + 4
  focusDocPickerGeom.left = r.left
  const minW = Math.max(FOCUS_DOC_PICKER_MIN_W, Math.ceil(r.width))
  if (focusDocPickerWidth.value < minW) {
    focusDocPickerWidth.value = minW
  }
}

const onFocusDocPickerResizePointerDown = (e: MouseEvent) => {
  e.preventDefault()
  const startX = e.clientX
  const startW = focusDocPickerWidth.value
  const onMove = (ev: MouseEvent) => {
    const next = Math.min(
      FOCUS_DOC_PICKER_MAX_W,
      Math.max(FOCUS_DOC_PICKER_MIN_W, startW + (ev.clientX - startX))
    )
    focusDocPickerWidth.value = next
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    try {
      localStorage.setItem(FOCUS_DOC_PICKER_WIDTH_KEY, String(focusDocPickerWidth.value))
    } catch {
      /* ignore */
    }
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

const closeFocusDocPicker = () => {
  focusDocPickerOpen.value = false
}

const toggleFocusDocPicker = () => {
  if (isLockedEffective.value) return
  focusDocPickerOpen.value = !focusDocPickerOpen.value
}

const syncFocusDocListHighlight = () => {
  const idx = focusPickerTabs.value.findIndex((x) => x.id === workspace.activeTabId.value)
  focusDocListHighlightIndex.value = idx >= 0 ? idx : 0
}

const canCloseTab = (tab: WorkspaceTab): boolean => {
  if (tab.id === WORKBENCH_SYNTHETIC_ID) return true
  return workspace.canRemoveTab(tab.id)
}

const canDragTab = (tab: WorkspaceTab): boolean => {
  if (tab.id === WORKBENCH_SYNTHETIC_ID) return false
  return !isLockedEffective.value && !tab._isClosing
}

// 检查Tab是否可以拖拽到其他窗口（工具、系统 Tab 也可迁移）
const canDragToOtherWindow = (_tab: WorkspaceTab): boolean => {
  return true
}

// 处理 Tab 点击激活 - 通过 click 事件而非 mousedown
const handleTabClickActivate = (tab: WorkspaceTab) => {
  if (isLockedEffective.value) return
  if (tab._isClosing) return
  if (tab.id === WORKBENCH_SYNTHETIC_ID) {
    const set = collectTabIdsInLayout(workspace.workspaceLayoutRoot.value)
    const cur = workspace.activeTabId.value
    if (cur && set.has(cur)) return
    const first = workspace.tabs.find((x) => set.has(x.id))
    if (first) workspace.activateTab(first.id)
    return
  }
  if (tab.id === workspace.activeTabId.value) return

  workspace.activateTab(tab.id)
  if (tab.kind === 'system' || tab.kind === 'tool') {
    const toRoute = tab.route
    if (toRoute && toRoute !== route.path) {
      nextTick(() => router.push(toRoute))
    }
  }
}

const handleFocusDocRowClick = (tab: WorkspaceTab) => {
  handleTabClickActivate(tab)
  closeFocusDocPicker()
}

function activateDocumentFromOpenList(tab: WorkspaceTab): void {
  openDocsPopoverOpen.value = false
  handleTabClickActivate(tab)
}

function handleCloseTabFromOpenDocsPopover(tabId: string): void {
  if (isLockedEffective.value) return
  void handleCloseTab(tabId)
}

/** 下拉面板内整行按下态（挂在 focus-doc-picker-panel 的行上，mouseup 任意处释放） */
const focusPickerRowPressedId = ref<string | null>(null)

const onFocusPickerPanelRowMouseDown = (e: MouseEvent, tab: WorkspaceTab) => {
  handleTabMouseDown(e, tab)
  const el = e.target as HTMLElement
  if (el.closest('.main-tab-label__close')) return
  focusPickerRowPressedId.value = tab.id
  document.addEventListener(
    'mouseup',
    () => {
      focusPickerRowPressedId.value = null
    },
    { once: true }
  )
}

const onFocusDocTriggerKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!focusDocPickerOpen.value) {
      focusDocPickerOpen.value = true
    }
    nextTick(() => {
      syncFocusDocListHighlight()
      updateFocusDocPickerGeometry()
      focusDocPickerPanelRef.value?.focus()
    })
    return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    focusDocPickerOpen.value = !focusDocPickerOpen.value
    if (focusDocPickerOpen.value) {
      nextTick(() => {
        syncFocusDocListHighlight()
        updateFocusDocPickerGeometry()
        focusDocPickerPanelRef.value?.focus()
      })
    }
  }
}

const onFocusDocListKeydown = (e: KeyboardEvent) => {
  const list = focusPickerTabs.value
  if (list.length === 0) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeFocusDocPicker()
      focusDocTriggerRef.value?.focus()
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    closeFocusDocPicker()
    focusDocTriggerRef.value?.focus()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusDocListHighlightIndex.value = Math.min(
      list.length - 1,
      focusDocListHighlightIndex.value + 1
    )
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    focusDocListHighlightIndex.value = Math.max(0, focusDocListHighlightIndex.value - 1)
    return
  }
  if (e.key === 'Home') {
    e.preventDefault()
    focusDocListHighlightIndex.value = 0
    return
  }
  if (e.key === 'End') {
    e.preventDefault()
    focusDocListHighlightIndex.value = list.length - 1
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const tab = list[focusDocListHighlightIndex.value]
    if (tab) handleFocusDocRowClick(tab)
  }
}

// 在 mousedown 时预加载拖拽缩略图，但不切换 tab（避免拖拽时切换）
const handleTabMouseDown = async (event: MouseEvent, tab: WorkspaceTab) => {
  if (isLockedEffective.value) return
  if (tab.id === WORKBENCH_SYNTHETIC_ID) return
  if (tab._isClosing) return
  // 如果点在关闭按钮上，不处理（让关闭按钮处理）
  const target = event.target as HTMLElement
  if (target.closest('.main-tab-label__close')) return
  event.stopPropagation()

  // Issue 7: 中键点击关闭 Tab
  if (event.button === 1) {
    event.preventDefault()
    handleCloseTab(tab.id)
    return
  }

  // 预加载拖拽缩略图（为 dragstart 做准备）
  prefetchDragThumbnail()

  // Issue 3: 不在 mousedown 时切换 tab，而是在 click 时切换
  // 拖拽操作会在 dragstart 时触发，不会影响这里的逻辑
}

// 处理 Tab 项的中键点击（关闭）
const handleTabItemAuxClick = (event: MouseEvent, tab: WorkspaceTab) => {
  if (event.button !== 1) return
  event.preventDefault()
  if (isLockedEffective.value) return
  if (tab.id === WORKBENCH_SYNTHETIC_ID) return
  if (tab._isClosing) return
  handleCloseTab(tab.id)
}

// 正在关闭中的标签页ID集合（防止重复关闭）
const closingTabIds = new Set<string>()

// 自定义关闭Tab处理函数 - 先检查确认，再播放动画，最后真正移除
const handleCloseTab = async (tabId: string) => {
  if (tabId === WORKBENCH_SYNTHETIC_ID) {
    workspace.dissolveWorkbenchLayout()
    return
  }

  // 防止重复关闭
  if (closingTabIds.has(tabId)) return

  const tab = allTabs.value.find((t) => t.id === tabId)
  if (!tab) return

  // 先检查是否可以关闭（显示确认对话框等）
  const canClose = await checkCanCloseTab(tabId)
  if (!canClose) return

  closingTabIds.add(tabId)
  tab._isClosing = true

  try {
    // GPU 加速 FLIP 动画：先记录位置，然后播放动画同时移除 store
    await triggerCloseTabAnimation(tabId, () => {
      doRemoveTab(tabId)
    })
  } finally {
    closingTabIds.delete(tabId)
  }
}

const handleTabLabelDblclick = (tab: WorkspaceTab) => {
  if (tab.id === WORKBENCH_SYNTHETIC_ID) return
  if (tab.preview) {
    workspace.pinTab(tab.id)
  }
}

// IPC 监听器引用（用于 onUnmounted 时移除）
let handlerMaximizedChanged: ((...args: any[]) => void) | null = null
let handlerAddTabFromDrag: ((...args: any[]) => void) | null = null
let handlerRemoveTabFromDrag: ((...args: any[]) => void) | null = null
let handlerRequestTabCount: (() => void) | null = null
let handlerDragCreateDetached: ((...args: any[]) => void) | null = null
let handlerCanAcceptTab: ((...args: any[]) => void) | null = null
let handlerAddTabToWindow: ((...args: any[]) => void) | null = null

// 缓存当前窗口 ID（避免频繁 IPC 调用）
let cachedWindowId: number = -1

const getCurrentWindowId = async (): Promise<number> => {
  if (!messageBridge.getIpc()) return -1
  if (cachedWindowId !== -1) return cachedWindowId
  try {
    cachedWindowId = await messageBridge.invoke('get-window-id')
    return cachedWindowId
  } catch (error) {
    logger.error('获取窗口ID失败:', error)
    return -1
  }
}

// 同步获取缓存的窗口 ID（用于同步处理器）
const getCurrentWindowIdSync = (): number => {
  return cachedWindowId
}

// 检查是否可以接收标签页
const checkCanAcceptTab = (tabData: any): boolean => {
  // 检查是否有重复（除了占位标签页）
  const existingById = workspace.tabs.find((t) => t.id === tabData.tab?.id)
  if (existingById) return true // 可以接收，会激活已有标签页

  // 文件路径重复检查
  if (tabData.tab?.path) {
    const existingByPath = workspace.tabs.find((t) => t.path === tabData.tab.path)
    if (existingByPath) return true // 可以接收，会合并
  }

  // 默认可以接收
  return true
}

type DropMode = 'before' | 'after'

// 检查拖拽位置是否合法（固定标签页约束）
const isDropPositionValid = (dragTabId: string, targetTabId: string, mode: DropMode): boolean => {
  const dragTab = workspace.tabs.find((t) => t.id === dragTabId)
  const resolvedTargetId = resolveWorkbenchMainBarTargetId(targetTabId)
  const targetTab = workspace.tabs.find((t) => t.id === resolvedTargetId)
  if (!dragTab || !targetTab) return true

  // 固定标签页只能在固定区域内移动
  if (dragTab.pinned && !targetTab.pinned) return false
  // 非固定标签页不能进入固定区域
  if (!dragTab.pinned && targetTab.pinned) return false

  return true
}

const isSplitDropValid = (dragTabId: string, targetTabId: string): boolean => {
  const dragTab = workspace.tabs.find((t) => t.id === dragTabId)
  const resolvedTargetId = resolveWorkbenchMainBarTargetId(targetTabId)
  const targetTab = workspace.tabs.find((t) => t.id === resolvedTargetId)
  if (!dragTab || !targetTab) return false
  if (dragTab.pinned !== targetTab.pinned) return false
  return true
}

// 归一化：同一缝隙只显示一条高亮线
const normalizeDropPreview = (
  targetId: string,
  mode: DropMode
): { targetId: string; mode: DropMode } => {
  if (mode === 'after') return { targetId, mode }
  const idx = workspace.tabs.findIndex((t) => t.id === targetId)
  if (idx <= 0) return { targetId, mode }
  const prevTab = workspace.tabs[idx - 1]
  return { targetId: prevTab.id, mode: 'after' }
}

const handleDragStart = async (id: string, event: DragEvent) => {
  if (isLockedEffective.value) {
    event.preventDefault()
    return
  }

  const tab = allTabs.value.find((t) => t.id === id)
  if (!tab || tab._isClosing) {
    event.preventDefault()
    return
  }

  setTabDragSourceSurface('main')
  dndLog('dragstart', 'main-tab', { tabId: id, title: tab.title || tab.subtitle || '' })
  handleTabDragStart(tab, event)
}

const handleDragOver = (targetId: string, event: DragEvent) => {
  if (isLockedEffective.value) return

  const dt = event.dataTransfer
  const types = dt?.types ?? []
  if (shouldTreatAsExternalWorkspacePathDrag(dt)) {
    event.preventDefault()
    if (dt) dt.dropEffect = 'copy'
    mainTabsExternalDropHighlight.value = true
    return
  }

  if (types.includes(TAB_DRAG_MIME_TYPE) && tabDragSourceSurface.value === 'pane' && draggingId.value) {
    event.preventDefault()
    if (dt) dt.dropEffect = 'move'
    mainTabsExternalDropHighlight.value = true
    dropPreview.value = {
      targetId: MAIN_TABS_PANE_APPEND_SENTINEL,
      mode: 'after',
      splitEdge: null
    }
    return
  }

  const resolvedId = resolveWorkbenchMainBarTargetId(targetId)
  const tab = workspace.tabs.find((t) => t.id === resolvedId)
  if (!tab) return

  // 使用 useTabDrag 处理拖拽经过
  handleTabDragOver(tab, event)

  if (targetId === WORKBENCH_SYNTHETIC_ID) {
    const labelEl = event.currentTarget as HTMLElement
    const tabItemEl = findTabItemElement(labelEl)
    const mode = tabItemEl ? computeDropMode(event, tabItemEl) : dropPreview.value.mode
    dropPreview.value = {
      targetId: WORKBENCH_SYNTHETIC_ID,
      mode,
      splitEdge: null
    }
  }

  // 验证拖拽位置是否合法（固定标签页约束）
  if (
    dropPreview.value.targetId &&
    dropPreview.value.targetId !== MAIN_TABS_PANE_APPEND_SENTINEL &&
    draggingId.value
  ) {
    if (dropPreview.value.splitEdge) {
      if (!isSplitDropValid(draggingId.value, dropPreview.value.targetId)) {
        dropPreview.value = { targetId: null, mode: null, splitEdge: null }
        return
      }
    } else if (dropPreview.value.mode) {
      if (
        !isDropPositionValid(draggingId.value, dropPreview.value.targetId, dropPreview.value.mode)
      ) {
        dropPreview.value = { targetId: null, mode: null, splitEdge: null }
        return
      }
    }
  }

  // 更新 dropPreview 样式
  if (dropPreview.value.targetId && dropPreview.value.mode) {
    const { targetId: normId, mode: normMode } = normalizeDropPreview(
      dropPreview.value.targetId,
      dropPreview.value.mode
    )
    // 更新 preview 为归一化后的值
    if (normId !== dropPreview.value.targetId || normMode !== dropPreview.value.mode) {
      // 这里不需要手动更新，因为 composable 会处理
    }
  }
}

const handleDragLeave = () => {
  handleTabDragLeave()
}

const handleDrop = async (targetId: string, event: DragEvent) => {
  if (isLockedEffective.value) return

  const pathFromDrop = readWorkspacePathFromDataTransfer(event.dataTransfer)
  if (pathFromDrop) {
    dndLog('drop', 'main-tab-item', { path: pathFromDrop, anchorTargetId: targetId })
    event.preventDefault()
    event.stopPropagation()
    clearMainTabsExternalDropUi()
    const resolvedBarId = resolveWorkbenchMainBarTargetId(targetId)
    const payload: {
      path: string
      workspacePlacement: 'top'
      tabBarAnchorTabId?: string
      tabBarInsertMode?: 'before' | 'after'
    } = { path: pathFromDrop, workspacePlacement: 'top' }
    const anchorTab = workspace.tabs.find((t) => t.id === resolvedBarId)
    if (anchorTab) {
      const labelEl = event.currentTarget as HTMLElement
      const tabItemEl = findTabItemElement(labelEl)
      if (tabItemEl) {
        payload.tabBarAnchorTabId = resolvedBarId
        payload.tabBarInsertMode = computeDropMode(event, tabItemEl)
      }
    }
    eventBus.emit('workspace-open-document', payload)
    return
  }

  const resolvedId = resolveWorkbenchMainBarTargetId(targetId)
  const tab = workspace.tabs.find((t) => t.id === resolvedId)
  if (!tab) return

  if (
    draggingId.value &&
    dropPreview.value.targetId &&
    dropPreview.value.targetId !== MAIN_TABS_PANE_APPEND_SENTINEL
  ) {
    if (dropPreview.value.splitEdge) {
      if (!isSplitDropValid(draggingId.value, dropPreview.value.targetId)) {
        return
      }
    } else if (dropPreview.value.mode) {
      if (
        !isDropPositionValid(draggingId.value, dropPreview.value.targetId, dropPreview.value.mode)
      ) {
        return
      }
    }
    // 仅有 targetId、无 mode/split（少见）仍交给 handleTabDrop，避免误拦工作台合成 Tab 等路径
  }

  // 使用 useTabDrag 处理投放（传入原始 targetId 以识别「工作台」合成 Tab）
  await handleTabDrop(tab, event, targetId)
  mainTabsExternalDropHighlight.value = false
  pathBarInsertHint.value = null

  // 重新激活当前 Tab
  nextTick(() => {
    const currentActiveId = workspace.activeTabId.value
    if (currentActiveId) {
      workspace.activateTab(currentActiveId)
    }
  })
}

const handleDragEnd = async (event: DragEvent) => {
  clearMainTabsExternalDropUi()
  snapshotEditorPaneDropHighlightBeforeConsume()
  await consumeEditorContentDropIfNeeded(workspace)
  const previewSnap = { ...dropPreview.value }
  dndLog('dragend', 'main-tab', {
    draggingId: draggingId.value,
    dropPreview: previewSnap
  })
  snapshotDragEndDropHighlightFromPreview(previewSnap)
  await consumeTabDropPreviewIfNeeded(workspace, previewSnap, draggingId.value)

  await handleTabDragEnd(event)
  cleanupDragImage()
}

// 从拖拽添加Tab
const addTabFromDrag = async (tabTransferData: any, insertIndex?: number) => {
  const { tab, document, sourceWindowId } = tabTransferData
  let placeholderRemoved = false
  let transferSuccess = false
  let mergedToExistingTabId: string | null = null

  // 辅助函数：通知源窗口转移已完成
  const notifyTransferCompleted = async (completed: boolean, targetTabId?: string) => {
    if (sourceWindowId != null && messageBridge.getIpc()) {
      try {
        await messageBridge.invoke('notify-tab-transfer-completed', {
          sourceWindowId,
          tabId: tab?.id,
          completed,
          targetTabId,
          merged: !!mergedToExistingTabId
        })
      } catch (err) {
        logger.warn('通知源窗口转移完成失败:', err)
      }
    }
  }

  // 辅助函数：清理占位标签页（只清理一个）
  const cleanupPlaceholder = () => {
    if (placeholderRemoved) return
    const placeholder = workspace.tabs.find((t) => t._isInitialPlaceholder)
    if (placeholder) {
      workspace.removeTab(placeholder.id)
      placeholderRemoved = true
      logger.debug('已清理占位标签页:', placeholder.id)
    }
  }

  try {
    if (!tab) {
      logger.error('Tab数据无效:', tabTransferData)
      // 即使失败也要尝试通知源窗口
      await notifyTransferCompleted(false)
      return
    }

    // ========== 第1步：清理占位标签页（必须在最前面）==========
    cleanupPlaceholder()

    // ========== 第2步：检查Tab ID重复（同窗口拖拽或重复添加）==========
    // 注意：新建文档标签页（kind === 'new'）允许重复，不检查ID重复
    const existingTab = workspace.tabs.find((t) => t.id === tab.id)
    if (existingTab && tab.kind !== 'new') {
      logger.warn('Tab已存在，直接激活:', tab.id)
      workspace.activateTab(tab.id)
      transferSuccess = true
      mergedToExistingTabId = tab.id
      await notifyTransferCompleted(true, tab.id)
      return
    }
    // 对于 kind === 'new' 的Tab，即使ID已存在也继续添加（允许重复）

    // ========== 第3步：检查文件路径（允许重复，只合并未保存内容）==========
    // 注意：普通文件标签页允许重复打开，不强制唯一性
    // 对于 new 类型的 Tab，如果 path 为空，跳过路径检查（避免空路径匹配）
    if (tab.path && tab.path !== '' && (tab.kind === 'file' || tab.kind === 'new')) {
      const existingFileTab = workspace.tabs.find((t) => t.path === tab.path && t.path !== '')
      if (existingFileTab && document?.dirty && document.markdown) {
        // 如果已有相同文件的Tab，且被拖拽的Tab有未保存内容，提示用户选择
        logger.info('检测到相同文件的Tab，合并未保存内容:', tab.path)

        try {
          const targetDoc = workspace.ensureDocument(existingFileTab.id)
          if (targetDoc) {
            // 合并内容到已有Tab（保留两个Tab，但内容已同步）
            const baseContent = targetDoc.savedMarkdown || targetDoc.markdown || ''
            targetDoc.markdown = document.markdown
            targetDoc.tex = document.tex || targetDoc.tex
            targetDoc.outline = document.outline || targetDoc.outline
            targetDoc.meta = document.meta || targetDoc.meta
            targetDoc.aiDialogs = document.aiDialogs || targetDoc.aiDialogs
            targetDoc.agentSessions = document.agentSessions || targetDoc.agentSessions
            targetDoc.renderedHtml = document.renderedHtml || ''
            targetDoc.dirty = true
            targetDoc.savedMarkdown = baseContent
            existingFileTab.dirty = true
            logger.info('已合并未保存内容到已有Tab:', existingFileTab.id)

            // 激活已有Tab并通知转移完成（不添加新Tab，因为内容已合并）
            workspace.activateTab(existingFileTab.id)
            transferSuccess = true
            mergedToExistingTabId = existingFileTab.id
            await notifyTransferCompleted(true, existingFileTab.id)
            return
          }
        } catch (mergeError) {
          logger.warn('合并文档内容失败:', mergeError)
        }
      }
      // 如果没有相同文件的Tab，或者没有未保存内容，继续添加新Tab
    }

    // ========== 第4步：检查工具/系统Tab重复 ==========
    if (tab.kind === 'tool' && tab.toolType) {
      const sameTool = workspace.tabs.find((t) => t.kind === 'tool' && t.toolType === tab.toolType)
      if (sameTool) {
        logger.info('工具Tab已存在，激活:', tab.toolType)
        workspace.activateTab(sameTool.id)
        transferSuccess = true
        mergedToExistingTabId = sameTool.id
        await notifyTransferCompleted(true, sameTool.id)
        return
      }
    }
    if (tab.kind === 'system' && tab.route) {
      const sameSystem = workspace.tabs.find((t) => t.kind === 'system' && t.route === tab.route)
      if (sameSystem) {
        logger.info('系统Tab已存在，激活:', tab.route)
        workspace.activateTab(sameSystem.id)
        transferSuccess = true
        mergedToExistingTabId = sameSystem.id
        await notifyTransferCompleted(true, sameSystem.id)
        return
      }
    }

    // ========== 第5步：添加新Tab ==========
    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < allTabs.value.length) {
      workspace.tabs.splice(insertIndex, 0, tab)
    } else {
      workspace.tabs.push(tab)
    }

    const p = tabTransferData.tab?.workspacePlacement
    if (p === 'top' || p === 'workbench') {
      tab.workspacePlacement = p
    }

    // 恢复文档内容（包括新文档和未保存的文档）
    if ((tab.kind === 'file' || tab.kind === 'new') && document) {
      try {
        const doc = workspace.ensureDocument(tab.id)

        // 恢复文档内容（包括所有状态）
        doc.markdown = document.markdown || ''
        doc.tex = document.tex || ''
        doc.outline = document.outline || doc.outline
        doc.meta = document.meta || doc.meta
        doc.aiDialogs = document.aiDialogs || doc.aiDialogs
        doc.agentSessions = document.agentSessions || doc.agentSessions
        doc.lastView = document.lastView || doc.lastView
        if (document.activeAgentSessionId !== undefined) {
          doc.activeAgentSessionId = document.activeAgentSessionId
        }
        doc.renderedHtml = document.renderedHtml || ''
        // 重要：保持dirty状态
        doc.dirty = document.dirty !== undefined ? document.dirty : false
        doc.savedMarkdown =
          document.savedMarkdown !== undefined ? document.savedMarkdown : doc.markdown
        doc.savedTex = document.savedTex !== undefined ? document.savedTex : doc.tex
        doc.savedOutline = document.savedOutline || doc.outline
        doc.savedMeta = document.savedMeta || doc.meta
        doc.savedAiDialogs = document.savedAiDialogs || doc.aiDialogs
        doc.savedAgentSessions = document.savedAgentSessions || doc.agentSessions
        // 关键：恢复 path 和 format，否则保存会无反应（会当作"新文件"）
        doc.path = document.path ?? doc.path ?? ''
        doc.format = document.format ?? doc.format ?? tab.format
        tab.path = doc.path
        tab.format = doc.format
        if (doc.path) {
          tab.subtitle = doc.path.split(/[/\\]/).filter(Boolean).pop() || tab.subtitle || ''
        }

        // 确保Tab的dirty状态也同步
        tab.dirty = doc.dirty
      } catch (error) {
        logger.warn('恢复文档内容失败，可能是新文档:', error)
        // 对于新文档，即使ensureDocument失败也要继续
      }
    }

    // 工具 Tab：恢复当前选中的会话/对话索引
    if (tab.kind === 'tool' && tabTransferData.toolState) {
      workspace.setTabToolState(tab.id, tabTransferData.toolState)
    }

    // 激活Tab
    await nextTick()
    workspace.activateTab(tab.id)
    workspace.refreshDocumentLayout()

    // 转移文件所有权到新窗口的 tab
    if (tab.path && (tab.kind === 'file' || tab.kind === 'new')) {
      if (messageBridge.getIpc()?.invoke) {
        await messageBridge.invoke('transfer-file-ownership', {
          filePath: tab.path,
          newTabId: tab.id
        })
      }
    }

    transferSuccess = true
    await notifyTransferCompleted(true, tab.id)
    logger.info('成功添加并激活Tab:', tab.id, { kind: tab.kind, dirty: tab.dirty })
  } catch (error) {
    logger.error('添加Tab失败:', error)
    await notifyTransferCompleted(false)
  } finally {
    // 确保占位标签页总是被清理
    cleanupPlaceholder()
  }
}

// 拖拽后移除Tab
const removeTabAfterDrag = async (tabId: string, windowId: number) => {
  try {
    const tab = workspace.tabs.find((t) => t.id === tabId)
    const tabIndex = workspace.tabs.findIndex((t) => t.id === tabId)
    const wasActive = workspace.activeTabId.value === tabId

    // 标记文件正在关闭
    if (tab?.path && messageBridge.getIpc()) {
      await messageBridge.invoke('mark-file-closing', tab.path)
    }

    // 移除Tab
    if (tabIndex !== -1) {
      workspace.tabs.splice(tabIndex, 1)
    }

    // 若移除的是当前激活Tab，需激活其他Tab，避免黑屏
    if (wasActive && workspace.tabs.length > 0) {
      const nextIndex = Math.min(tabIndex, workspace.tabs.length - 1)
      const nextTab = workspace.tabs[nextIndex >= 0 ? nextIndex : 0]
      if (nextTab) {
        workspace.activateTab(nextTab.id)
      }
    }
    workspace.refreshDocumentLayout()

    // 检查窗口是否可以关闭
    if (messageBridge.getIpc()) {
      const { canClose, tabCount } = await messageBridge.invoke('check-window-can-close')
      if (canClose && tabCount === 0) {
        // 窗口可以关闭
        messageBridge.send('close-window')
      }
    }
  } catch (error) {
    logger.error('移除Tab失败:', error)
  }
}

function handleTabsListDragOverCombined(event: DragEvent): void {
  const dt = event.dataTransfer
  if (!dt) return
  const types = dt.types ?? []
  if (shouldTreatAsExternalWorkspacePathDrag(dt)) {
    event.preventDefault()
    dt.dropEffect = 'copy'
    mainTabsExternalDropHighlight.value = true
    return
  }
  if (types.includes(TAB_DRAG_MIME_TYPE) && tabDragSourceSurface.value === 'pane' && isDragging.value) {
    event.preventDefault()
    dt.dropEffect = 'move'
    mainTabsExternalDropHighlight.value = true
    dropPreview.value = {
      targetId: MAIN_TABS_PANE_APPEND_SENTINEL,
      mode: 'after',
      splitEdge: null
    }
    return
  }
  handleWrapperDragOver(event)
}

function handleTabsListDragLeave(event: DragEvent): void {
  const rel = event.relatedTarget as Node | null
  if (rel && tabsListRef.value?.contains(rel)) return
  if (shouldTreatAsExternalWorkspacePathDrag(event.dataTransfer)) {
    clearMainTabsExternalDropUi()
  }
}

async function handleTabsListDrop(event: DragEvent): Promise<void> {
  const path = readWorkspacePathFromDataTransfer(event.dataTransfer)
  if (path) {
    dndLog('drop', 'main-tabs-list', { path, kind: 'workspace-path' })
    event.preventDefault()
    event.stopPropagation()
    const insertFromPointer = pathBarInsertHint.value
    clearMainTabsExternalDropUi()
    const list = mainBarTabs.value
    const last = list[list.length - 1]
    const payload =
      insertFromPointer && list.some((t) => t.id === insertFromPointer.tabBarAnchorTabId)
        ? {
            path,
            workspacePlacement: 'top' as const,
            tabBarAnchorTabId: insertFromPointer.tabBarAnchorTabId,
            tabBarInsertMode: insertFromPointer.tabBarInsertMode
          }
        : last
          ? {
              path,
              workspacePlacement: 'top' as const,
              tabBarAnchorTabId: last.id,
              tabBarInsertMode: 'after' as const
            }
          : { path, workspacePlacement: 'top' as const }
    eventBus.emit('workspace-open-document', payload)
    return
  }

  const fromId = event.dataTransfer?.getData(TAB_DRAG_MIME_TYPE) || draggingId.value
  if (
    fromId &&
    tabDragSourceSurface.value === 'pane' &&
    dropPreview.value.targetId === MAIN_TABS_PANE_APPEND_SENTINEL
  ) {
    dndLog('drop', 'main-tabs-list', { fromId, kind: 'pane-to-main-append' })
    event.preventDefault()
    event.stopPropagation()
    const paneInsertHint = pathBarInsertHint.value
    clearMainTabsExternalDropUi()
    await promotePaneTabToMainBarWithInsertHint(workspace, fromId, paneInsertHint)
    dropPreview.value = { targetId: null, mode: null, splitEdge: null }
  }
}

// Issue 5 & 6: 处理 wrapper 的 dragover - 在首 tab 左侧（交通灯/外侧 Logo 区）与末 tab 右侧（窗口按钮 / Mac 尾部区）显示指示器
const handleWrapperDragOver = (event: DragEvent) => {
  if (isLockedEffective.value) return
  if (dropPreview.value.targetId === MAIN_TABS_PANE_APPEND_SENTINEL) return
  if (!isDragging.value || !draggingId.value) return
  if (isFocusMode.value ? allTabs.value.length === 0 : mainBarTabs.value.length === 0) return

  const wrapperRect = tabsWrapperRef.value?.getBoundingClientRect()
  if (!wrapperRect) return

  const trafficLeft = isMac.value ? 88 : 0 // .macos-traffic-lights-spacer
  const outerLogoLeft = !isMac.value ? 52 : 0 // Main.vue 左侧 LogoTab（与 UIMenu 折叠宽一致）
  const tabAreaLeft = wrapperRect.left + trafficLeft + outerLogoLeft

  let rightChrome = 0
  if (!isMac.value) {
    rightChrome = 140 // .window-controls
  } else {
    const trailingAndLogo = isFocusMode.value ? 74 : 52 + 74
    rightChrome = trailingAndLogo
  }
  const tabAreaRight = wrapperRect.right - rightChrome

  if (isFocusMode.value) {
    const viewport = tabsViewportRef.value
    if (!viewport) return
    const zoneRect = viewport.getBoundingClientRect()
    const firstTabId = allTabs.value[0]?.id
    const lastTabId = allTabs.value[allTabs.value.length - 1]?.id
    if (
      event.clientX < zoneRect.left + 28 &&
      event.clientX >= tabAreaLeft - 20 &&
      firstTabId &&
      firstTabId !== draggingId.value
    ) {
      dropPreview.value = { targetId: firstTabId, mode: 'before', splitEdge: null }
    } else if (
      event.clientX > zoneRect.right - 28 &&
      event.clientX <= tabAreaRight + 20 &&
      lastTabId &&
      lastTabId !== draggingId.value
    ) {
      dropPreview.value = { targetId: lastTabId, mode: 'after', splitEdge: null }
    }
    return
  }

  const tabItems = tabsListRef.value?.querySelectorAll('.tab-item')
  if (!tabItems || tabItems.length === 0) return

  const firstTabRect = tabItems[0].getBoundingClientRect()
  const lastTabRect = tabItems[tabItems.length - 1].getBoundingClientRect()

  if (event.clientX < firstTabRect.left && event.clientX >= tabAreaLeft - 20) {
    const firstTabId = mainBarTabs.value[0]?.id
    if (firstTabId && firstTabId !== draggingId.value) {
      dropPreview.value = { targetId: firstTabId, mode: 'before', splitEdge: null }
    }
    return
  }

  if (event.clientX > lastTabRect.right && event.clientX <= tabAreaRight + 20) {
    const lastTabId = mainBarTabs.value[mainBarTabs.value.length - 1]?.id
    if (lastTabId && lastTabId !== draggingId.value) {
      dropPreview.value = { targetId: lastTabId, mode: 'after', splitEdge: null }
    }
    return
  }
}

// Issue 8: 鼠标滚轮切换 tab
const handleTabWheel = (event: WheelEvent) => {
  if (isLockedEffective.value) return
  if (allTabs.value.length <= 1) return

  const currentIndex = allTabs.value.findIndex((t) => t.id === workspace.activeTabId.value)
  if (currentIndex === -1) return

  let newIndex: number
  if (event.deltaY > 0) {
    // 向下/右滚动 -> 下一个 tab
    newIndex = (currentIndex + 1) % allTabs.value.length
  } else {
    // 向上/左滚动 -> 上一个 tab
    newIndex = (currentIndex - 1 + allTabs.value.length) % allTabs.value.length
  }

  const newTab = allTabs.value[newIndex]
  if (newTab) {
    workspace.activateTab(newTab.id)
    nextTick(() => {
      scrollActiveTabIntoView()
      if ((newTab.kind === 'system' || newTab.kind === 'tool') && newTab.route) {
        if (newTab.route && newTab.route !== route.path) {
          router.push(newTab.route)
        }
      }
    })
    eventBus.emit('tab-switch-indicator', newTab.id)
  }
}

// 中键点击关闭 Tab（事件委托，覆盖 .tab-item 的完整区域）
const handleWrapperAuxClick = (event: MouseEvent) => {
  if (event.button !== 1) return
  event.preventDefault()
  event.stopPropagation()
  if (isLockedEffective.value) return
  const target = event.target as HTMLElement
  const tabItem = target.closest('.tab-item') as HTMLElement | null
  if (!tabItem) return
  const tabId = tabItem.dataset.tabId
  if (!tabId) return
  const tab = allTabs.value.find((t) => t.id === tabId)
  if (tab?._isClosing) return
  handleCloseTab(tabId)
}

// 在 Tab 项上添加拖拽事件监听（扩大拖拽区域）
onMounted(async () => {
  // 设置 Tab 栏元素引用（用于拖拽结束时的边界计算）
  setTabBarElement(tabsWrapperRef.value)

  try {
    const stored = parseInt(localStorage.getItem(FOCUS_DOC_PICKER_WIDTH_KEY) || '', 10)
    if (
      !Number.isNaN(stored) &&
      stored >= FOCUS_DOC_PICKER_MIN_W &&
      stored <= FOCUS_DOC_PICKER_MAX_W
    ) {
      focusDocPickerWidth.value = stored
    }
  } catch {
    /* ignore */
  }

  // 获取当前窗口ID
  getCurrentWindowId()

  // 获取当前窗口最大化状态并监听变化（用于标题栏最大化/还原图标）
  if (messageBridge.getIpc()) {
    try {
      isMaximized.value = await messageBridge.invoke('get-window-maximized')
    } catch {
      isMaximized.value = false
    }
    handlerMaximizedChanged = (_e: any, maximized: boolean) => {
      isMaximized.value = maximized
    }
    messageBridge.on('window-maximized-changed', handlerMaximizedChanged)
  }

  // Tab 右键菜单：点击外部关闭
  document.addEventListener('click', handleTabContextMenuClickOutside)

  eventBus.on('main-tabs-external-drop-ui-reset', clearMainTabsExternalDropUi)
  eventBus.on('main-tabs-path-bar-insert-hint', onPathBarInsertHintBus)
  eventBus.on('main-tabs-external-drop-ui-highlight', (active: unknown) => {
    mainTabsExternalDropHighlight.value = Boolean(active)
  })

  // 初始化标签页溢出检测
  nextTick(() => {
    checkTabOverflow()
    const viewport = tabsViewportRef.value
    if (viewport) {
      const resizeObserver = new ResizeObserver(() => checkTabOverflow())
      resizeObserver.observe(viewport)
    }
  })

  // 监听标签页数量变化，重新检查溢出
  watch(
    () => allTabs.value.length,
    () => {
      nextTick(() => checkTabOverflow())
    }
  )

  // 监听新标签页的添加，触发动画
  watch(
    () => allTabs.value.filter((t) => t._isNewTab).map((t) => t.id),
    async (newTabIds, oldTabIds) => {
      // 找出新添加的标签页
      const addedTabIds = newTabIds.filter((id) => !oldTabIds?.includes(id))
      for (const tabId of addedTabIds) {
        await triggerNewTabAnimation(tabId)
      }
    },
    { flush: 'post' }
  )

  // 监听来自主进程的Tab添加请求
  if (messageBridge.getIpc()) {
    handlerAddTabFromDrag = async (_event: any, data: any) => {
      try {
        await nextTick()
        const tabData = data.tabData || data
        const insertIndex = data.insertIndex
        if (!tabData || !tabData.tab) {
          logger.error('接收到的Tab数据无效:', data)
          return
        }
        await addTabFromDrag(tabData, insertIndex)
        if (data.initialFocusMode === true) {
          enterFocusMode()
        } else if (data.initialFocusMode === false) {
          exitFocusMode()
        }
        logger.info('成功添加Tab到新窗口:', tabData.tab.id)
      } catch (error) {
        logger.error('添加Tab失败:', error)
      }
    }
    messageBridge.on('add-tab-from-drag', handlerAddTabFromDrag)

    handlerRemoveTabFromDrag = async (_event: any, tabId: string) => {
      await removeTabAfterDrag(tabId, await getCurrentWindowId())
    }
    messageBridge.on('remove-tab-from-drag', handlerRemoveTabFromDrag)

    handlerRequestTabCount = () => {
      if (messageBridge.getIpc()) {
        messageBridge.send('window-tab-count-response', { tabCount: allTabs.value.length })
      }
    }
    messageBridge.on('request-tab-count', handlerRequestTabCount)

    handlerDragCreateDetached = async (_event: any, data: any) => {
      try {
        const { tabData, position, width, height, focusMode } = data
        const tabId = tabData?.tab?.id as string | undefined
        if (!tabId) {
          logger.error('drag:create-detached-window 缺少 tab id')
          return
        }
        const sourceWindowId = await getCurrentWindowId()
        const result = await messageBridge.invoke('create-window-with-tab', {
          tabData,
          position,
          width,
          height,
          focusMode: !!focusMode
        })
        // 与「在新窗口打开」一致：成功迁入新窗口后必须从源窗口移除 Tab。
        // 池内有窗口时 drag:end 走 remove-tab-from-drag；池为空时走本分支，此前漏掉移除会导致
        // 源窗口与新窗口各有一份同一 tab（空白/重复/焦点异常）。
        const isExisting =
          result &&
          typeof result === 'object' &&
          'isExisting' in result &&
          (result as { isExisting?: boolean }).isExisting === true
        if (!isExisting) {
          await removeTabAfterDrag(tabId, sourceWindowId)
        }
        logger.info('通过拖拽分离创建新窗口:', result)
      } catch (error) {
        logger.error('创建分离窗口失败:', error)
      }
    }
    messageBridge.on('drag:create-detached-window', handlerDragCreateDetached)

    // 处理主进程的 drag:can-accept-tab 请求（跨窗口拖拽预检）
    handlerCanAcceptTab = async (_event: any, data: any) => {
      const { _requestId, tabData } = data

      // 检查是否可以接收该 tab
      const canAccept = checkCanAcceptTab(tabData)

      // 发送响应回主进程
      if (messageBridge.getIpc()) {
        messageBridge.send('drag:renderer-response', {
          _requestId,
          result: canAccept
        })
      }
    }
    messageBridge.on('drag:can-accept-tab', handlerCanAcceptTab)

    // 处理主进程的 drag:add-tab-to-window 请求（实际添加 tab）
    handlerAddTabToWindow = async (_event: any, data: any) => {
      const { _requestId, tabData, insertIndex } = data

      try {
        if (!tabData || !tabData.tab) {
          throw new Error('无效的 tab 数据')
        }

        await addTabFromDrag(tabData, insertIndex)
        logger.info('成功通过拖拽添加 Tab:', tabData.tab.id)

        // 发送成功响应回主进程
        if (messageBridge.getIpc()) {
          messageBridge.send('drag:renderer-response', {
            _requestId,
            result: { success: true }
          })
        }
      } catch (error) {
        logger.error('通过拖拽添加 Tab 失败:', error)

        // 发送失败响应回主进程
        if (messageBridge.getIpc()) {
          messageBridge.send('drag:renderer-response', {
            _requestId,
            _error:
              error instanceof Error ? error.message : t('mainTabs.addTabFailed', '添加 Tab 失败'),
            result: {
              success: false,
              error:
                error instanceof Error ? error.message : t('mainTabs.addTabFailed', '添加 Tab 失败')
            }
          })
        }
      }
    }
    messageBridge.on('drag:add-tab-to-window', handlerAddTabToWindow)
  }

  // 监听来自 Main.vue 的关闭动画请求（用于 Ctrl+W 快捷键）
  eventBus.on('tab-close-with-animation', handleCloseTab)
})

// 监听activeTabId变化，确保路由同步（用于首次打开系统Tab时）
watch(
  () => workspace.activeTabId.value,
  (newTabId) => {
    const activeTab = allTabs.value.find((t) => t.id === newTabId)
    if (
      activeTab &&
      (activeTab.kind === 'system' || activeTab.kind === 'tool') &&
      activeTab.route
    ) {
      nextTick(() => {
        if (activeTab.route && activeTab.route !== route.path) {
          router.push(activeTab.route)
        }
      })
    }
    nextTick(() => scrollActiveTabIntoView())
  },
  { immediate: true }
)

// 监听路由变化，确保Tab与路由同步
watch(
  () => route.path,
  (newPath) => {
    // 如果当前激活的Tab有route，且与当前路由不匹配，需要更新Tab
    const activeTab = allTabs.value.find((t) => t.id === workspace.activeTabId.value)
    if (activeTab && activeTab.route && activeTab.route !== newPath) {
      // 查找是否有匹配该路由的Tab
      const matchingTab = allTabs.value.find((t) => t.route === newPath)
      if (matchingTab) {
        workspace.activateTab(matchingTab.id)
      }
    }
  }
)

const onFocusDocPickerScrollOrResize = () => updateFocusDocPickerGeometry()

watch(isFocusMode, () => {
  focusDocPickerOpen.value = false
  nextTick(() => checkTabOverflow())
})

watch(focusDocPickerOpen, (open) => {
  if (open) {
    syncFocusDocListHighlight()
    nextTick(() => {
      updateFocusDocPickerGeometry()
      focusDocPickerPanelRef.value?.focus()
    })
    window.addEventListener('scroll', onFocusDocPickerScrollOrResize, true)
    window.addEventListener('resize', onFocusDocPickerScrollOrResize)
  } else {
    focusPickerRowPressedId.value = null
    window.removeEventListener('scroll', onFocusDocPickerScrollOrResize, true)
    window.removeEventListener('resize', onFocusDocPickerScrollOrResize)
  }
})

// 清理事件监听器
onUnmounted(() => {
  // Cancel any running tab animations
  cancelAnimations()

  document.removeEventListener('click', handleTabContextMenuClickOutside)

  eventBus.off('main-tabs-external-drop-ui-reset', clearMainTabsExternalDropUi)
  eventBus.off('main-tabs-path-bar-insert-hint', onPathBarInsertHintBus)
  eventBus.off('main-tabs-external-drop-ui-highlight')

  window.removeEventListener('scroll', onFocusDocPickerScrollOrResize, true)
  window.removeEventListener('resize', onFocusDocPickerScrollOrResize)

  eventBus.off('tab-close-with-animation', handleCloseTab)

  if (moveToWindowLeaveTimer) {
    clearTimeout(moveToWindowLeaveTimer)
    moveToWindowLeaveTimer = null
  }

  resetDragState()
  cleanupDragImage()

  if (handlerMaximizedChanged) {
    messageBridge.removeListener('window-maximized-changed', handlerMaximizedChanged)
  }
  if (handlerAddTabFromDrag) {
    messageBridge.removeListener('add-tab-from-drag', handlerAddTabFromDrag)
  }
  if (handlerRemoveTabFromDrag) {
    messageBridge.removeListener('remove-tab-from-drag', handlerRemoveTabFromDrag)
  }
  if (handlerRequestTabCount) {
    messageBridge.removeListener('request-tab-count', handlerRequestTabCount)
  }
  if (handlerDragCreateDetached) {
    messageBridge.removeListener('drag:create-detached-window', handlerDragCreateDetached)
  }
  if (handlerCanAcceptTab) {
    messageBridge.removeListener('drag:can-accept-tab', handlerCanAcceptTab)
  }
  if (handlerAddTabToWindow) {
    messageBridge.removeListener('drag:add-tab-to-window', handlerAddTabToWindow)
  }
})
</script>

<style scoped>
/* MainTabs 无条件始终在最顶层，GlobalMessageBox 渲染于其内 */
.tabs-list.is-main-tabs-external-drop-target {
  box-shadow: inset 0 0 0 2px hsl(var(--primary) / 0.55);
  border-radius: 4px;
}

.main-tabs-wrapper {
  display: flex;
  align-items: stretch;
  height: 34px;
  max-height: 34px;
  min-width: 0; /* 确保作为 flex item 时可以收缩 */
  background-color: v-bind('tabsContainerBackgroundColor');
  user-select: none;
  -webkit-user-select: none;
  -webkit-app-region: drag;
  position: relative;
  box-sizing: border-box;
  z-index: 99999;
  /* 与 Main.vue .top-header-floating 一致：避免 body 在模态下 pointer-events:none 经 el-header 等中间层影响顶栏 */
  pointer-events: auto !important;
}

.main-tabs-wrapper.is-focus-mode .tabs-viewport.tabs-viewport--focus-mode {
  display: flex;
  align-items: center;
  min-height: 0;
}

.main-tabs-wrapper.is-focus-mode .focus-doc-slot {
  display: flex;
  align-items: center;
  align-self: stretch;
  min-height: 0;
}

/* 可交互元素需要禁用拖拽窗口功能 */
.main-tabs-wrapper .window-controls,
.main-tabs-wrapper .window-control-btn,
.main-tabs-wrapper .main-tabs-focus-menu-host,
.main-tabs-wrapper .tab-trailing-actions,
.main-tabs-wrapper .new-tab-button,
.main-tabs-wrapper .focus-mode-button,
.main-tabs-wrapper .main-tabs-logo-tab,
.main-tabs-wrapper .tab-item,
.main-tabs-wrapper .focus-doc-picker-trigger {
  -webkit-app-region: no-drag !important;
  position: relative;
  z-index: 10 !important;
}

/* sash 必须为 drag 才能拖窗；其上的 HTML5 drop 由全局 capture 处理 */
.main-tabs-wrapper .tabs-list-window-drag-sash {
  -webkit-app-region: drag !important;
  position: relative;
  z-index: 10 !important;
}

.main-tab-label,
.main-tab-label__close {
  -webkit-app-region: no-drag !important;
  position: relative;
  z-index: 10;
}

.main-tabs-wrapper.is-locked {
  cursor: not-allowed;
  opacity: 0.9;
}

.main-tabs-wrapper.is-locked .tab-item {
  pointer-events: none;
  cursor: not-allowed !important;
  opacity: 0.6;
}

/* 正在关闭的 tab：降低 z-index 让它滑到左边 tab 下面 */
.tab-item.is-closing {
  z-index: 1 !important;
  pointer-events: none;
}

/* macOS：为左侧系统交通灯预留宽度（略宽于经典 78px，避免与标签挤在一起） */
.macos-traffic-lights-spacer {
  width: 88px;
  min-width: 88px;
  flex-shrink: 0;
  height: 34px;
  -webkit-app-region: drag;
}

.main-tabs-focus-menu-host {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 34px;
  max-height: 34px;
  padding-right: 6px;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.tab-trailing-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  height: 34px;
  max-height: 34px;
  -webkit-app-region: no-drag;
}

/* macOS 非专注：标签区相对交通灯略向内，避免贴边；专注模式略收紧 */
.main-tabs-wrapper.is-mac:not(.is-focus-mode) .tab-region {
  padding-left: 6px;
}

.main-tabs-wrapper.is-mac.is-focus-mode .tab-region {
  padding-left: 4px;
}

/* Tab 区域：占满 spacer/window-controls 之间的整块都可拖窗（子项 tab / 按钮仍为 no-drag） */
.tab-region {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 34px;
  max-height: 34px;
  overflow: hidden;
  -webkit-app-region: drag;
}

/* 可滚动的 Tab 视口 —— 与 tab-region 一致铺满可拖窗区域 */
.tabs-viewport {
  flex: 1;
  min-width: 0;
  height: 34px;
  max-height: 34px;
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--el-border-color-darker, rgba(0, 0, 0, 0.2)) transparent;
  -webkit-app-region: drag;
}

.tabs-viewport::-webkit-scrollbar {
  height: 4px;
}

.tabs-viewport::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-viewport::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker, rgba(0, 0, 0, 0.2));
  border-radius: 2px;
}

.tabs-viewport--focus-mode {
  overflow-x: auto;
  overflow-y: hidden;
}

.tabs-list--focus-mode {
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  box-sizing: border-box;
}

.focus-doc-slot {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  display: flex;
  align-items: center;
}

.focus-doc-picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background-color: v-bind('tabItemBackgroundColor');
  color: inherit;
  font: inherit;
  cursor: pointer;
  box-sizing: border-box;
}

.focus-doc-picker-trigger:hover:not(:disabled) {
  background-color: v-bind('tabItemHoverBackgroundColor');
}

.focus-doc-picker-trigger:disabled,
.focus-doc-picker-trigger.is-locked {
  cursor: not-allowed;
  opacity: 0.6;
}

.focus-doc-picker-trigger.is-open {
  background-color: v-bind('tabItemActiveBackgroundColor');
}

/* 与 LogoTab .logo-tab__image 一致 */
.focus-doc-picker-trigger__logo {
  display: block;
  flex-shrink: 0;
}

.focus-doc-picker-trigger__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-size: 13px;
  font-weight: 400;
  color: var(--el-text-color-primary);
}

.focus-doc-picker-trigger__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: var(--el-color-warning, #e6a23c);
}

.focus-doc-picker-trigger__chevron {
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.75;
}

.tab-item.tab-item--focus-surface {
  flex: 0 0 34px;
  min-width: 34px;
  max-width: 34px;
  width: 34px;
  padding: 0;
  margin-right: 2px;
  justify-content: center;
  border-radius: 6px;
}

.tab-item--focus-surface__icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  pointer-events: none;
}

.focus-doc-picker-shell {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  box-sizing: border-box;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  background-color: v-bind('tabsContainerBackgroundColor');
  color: var(--el-text-color-primary);
  border: 1px solid v-bind('borderColor');
  overflow: hidden;
  -webkit-app-region: no-drag !important;
}

.focus-doc-picker-panel {
  flex: 1;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  /* 与顶栏 trigger（26px 高、约 8px 水平内边距）视觉对齐，略紧 */
  padding: 2px 4px;
  margin: 0;
  outline: none;
  background: transparent;
  box-sizing: border-box;
  -webkit-app-region: no-drag !important;
}

.focus-doc-picker-resize-handle {
  flex: 0 0 5px;
  cursor: col-resize;
  align-self: stretch;
  background: transparent;
}

.focus-doc-picker-resize-handle:hover {
  background: rgba(128, 128, 128, 0.22);
}

.focus-doc-picker-empty {
  padding: 8px 10px;
  font-size: 13px;
  opacity: 0.75;
}

/* 覆盖顶栏 .tab-item 的 flex / max-width:200px，否则行比面板窄一截 */
.focus-doc-picker-panel > .tab-item.focus-doc-picker-row {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  flex: none !important;
  flex-grow: 0 !important;
  flex-shrink: 0 !important;
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  height: auto !important;
  min-height: 26px !important;
  margin: 0 0 1px !important;
  margin-right: 0 !important;
  padding-left: 8px !important;
  padding-right: 8px !important;
  gap: 6px;
  box-sizing: border-box !important;
  border-radius: 6px;
  transition:
    background-color 0.14s ease,
    box-shadow 0.12s ease,
    transform 0.08s ease;
}

/* hover / 按下质感：只写在 .focus-doc-picker-panel 下的行，整行（含图标）一致 */
.focus-doc-picker-panel > .tab-item.focus-doc-picker-row:not(.is-active):not(.is-closing):hover {
  background-color: v-bind('tabItemHoverBackgroundColor') !important;
  box-shadow: inset 0 0 0 1px var(--el-border-color-lighter, #ebeef5);
}

.focus-doc-picker-panel > .tab-item.focus-doc-picker-row.is-active:not(.is-closing):hover {
  box-shadow: inset 0 0 0 1px var(--el-color-primary-light-5, rgba(64, 158, 255, 0.35));
}

.focus-doc-picker-panel > .tab-item.focus-doc-picker-row:active:not(.is-closing),
.focus-doc-picker-panel > .tab-item.focus-doc-picker-row.is-row-pressed:not(.is-closing) {
  transform: scale(0.993);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.12);
  background-color: v-bind('tabItemActiveBackgroundColor') !important;
}

.focus-doc-picker-panel > .tab-item.focus-doc-picker-row:last-child {
  margin-bottom: 0 !important;
}

.focus-doc-picker-panel > .tab-item.focus-doc-picker-row.is-pinned {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  flex: none !important;
  justify-content: flex-start !important;
}

.focus-doc-picker-panel .tab-item.is-pinned + .tab-item:not(.is-pinned) {
  border-left: none !important;
  margin-left: 0 !important;
}

.focus-doc-picker-row__icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex-shrink: 0;
  pointer-events: none;
}

.focus-doc-picker-panel .focus-doc-picker-row__label.main-tab-label {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
  padding: 0 2px;
  margin: 0;
  border-radius: 4px;
  box-sizing: border-box;
}

.focus-doc-picker-row.is-keyboard-focus:not(.is-active) {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

/*
 * 列表容器 no-drag，保证 .tab-item 上 HTML5 drop 正常。
 * sash 为 drag（见上条规则）；在 sash 上投放 path/窗格 Tab 走 document capture + isPointOverMainTabsStrip 兜底。
 */
.tabs-list {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  align-self: stretch;
  align-items: stretch;
  min-width: 0;
  width: 100%;
  height: 34px;
  margin: 0;
  padding: 0;
  background-color: v-bind('tabsContainerBackgroundColor');
  -webkit-app-region: no-drag;
}

.tabs-list-window-drag-sash {
  flex: 1 1 auto;
  min-width: 8px;
  width: 0;
  align-self: stretch;
  flex-shrink: 0;
  box-sizing: border-box;
  /* 与 .main-tabs-wrapper .tabs-list-window-drag-sash 的 drag 一致，避免仅依赖父级选择器 */
  -webkit-app-region: drag;
}

.tabs-strip-window-drag-nub {
  flex: 0 0 6px;
  min-width: 6px;
  align-self: stretch;
  -webkit-app-region: drag;
  box-sizing: border-box;
}

.tabs-list-window-drag-sash--focus {
  min-height: 34px;
  flex: 1 1 auto;
}

/* 单个 Tab 项 —— 统一 flex 规则：未溢出时等分，溢出时自然滚动 */
.tab-item {
  display: flex;
  align-items: center;
  height: 34px;
  padding-left: 12px;
  padding-right: 2px;
  margin-right: 2px;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  -webkit-app-region: no-drag;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  position: relative;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  background-color: v-bind('tabItemBackgroundColor');
  flex: 1 1 100px;
  min-width: 100px;
  max-width: 200px;
  /* GPU 加速优化 */
  will-change: transform;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}

/* 活跃 Tab */
.tab-item.is-active {
  background-color: v-bind('tabItemActiveBackgroundColor');
  color: var(--el-text-color-primary);
}

/* 非活跃悬浮 */
.tab-item:not(.is-active):hover {
  background-color: v-bind('tabItemHoverBackgroundColor');
}

/* 固定标签页 */
.tab-item.is-pinned {
  flex: 0 0 auto;
  min-width: 36px;
  max-width: 36px;
  width: 36px;
  justify-content: center;
  padding: 0;
  overflow: hidden;
}

/* 固定与非固定分隔线 */
.tab-item.is-pinned + .tab-item:not(.is-pinned) {
  border-left: 2px solid var(--el-border-color, rgba(0, 0, 0, 0.1));
  margin-left: 4px;
}

/* 拖拽高亮 */
.tab-item.drop-before::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--el-color-primary);
  z-index: 10;
}

.tab-item.drop-after::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--el-color-primary);
  z-index: 10;
}

.tab-item.drop-split-left {
  box-shadow: inset 3px 0 0 var(--el-color-primary);
}

.tab-item.drop-split-right {
  box-shadow: inset -3px 0 0 var(--el-color-primary);
}

.tab-item.drop-split-top {
  box-shadow: inset 0 3px 0 var(--el-color-primary);
}

.tab-item.drop-split-bottom {
  box-shadow: inset 0 -3px 0 var(--el-color-primary);
}

/* 普通模式「文档」触发器：与专注模式同结构，限制最大宽度避免挤占 + / 专注按钮 */
.open-docs-trigger-slot {
  min-width: 0;
  max-width: min(260px, 42vw);
  flex-shrink: 1;
  display: flex;
  align-items: center;
  margin-left: 4px;
  box-sizing: border-box;
}

.open-docs-trigger-slot .focus-doc-picker-trigger {
  width: 100%;
  min-width: 0;
}

.open-docs-popover__header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid hsl(var(--border));
}

.open-docs-popover__empty {
  padding: 16px 12px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.open-docs-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px 6px 12px;
  text-align: left;
  font-size: 13px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(var(--foreground));
  box-sizing: border-box;
}

.open-docs-row__icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex-shrink: 0;
}

.open-docs-row__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  margin-left: auto;
  border-radius: 4px;
  cursor: pointer;
  color: inherit;
  -webkit-app-region: no-drag;
}

.open-docs-row__close:hover {
  background: hsl(var(--muted) / 0.55);
}

.open-docs-row__close .el-icon {
  font-size: 14px;
}

.open-docs-row:hover {
  background: hsl(var(--muted) / 0.5);
}

.open-docs-row.is-active {
  background: hsl(var(--muted) / 0.65);
}

.open-docs-row__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.open-docs-row__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: hsl(var(--primary));
  flex-shrink: 0;
}

.main-tab-label {
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
  width: 100%;
  min-width: 0 !important; /* 允许缩小到内容以下，使用 !important 确保生效 */
  max-width: 100%; /* 确保不会超出父容器 */
  height: 100%;
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  position: relative;
  flex-shrink: 1; /* 允许缩小 */
  box-sizing: border-box;
  overflow: hidden; /* 确保内容不会溢出 */
  /* 确保 flex 容器本身可以缩小 */
  flex: 0 1 auto;
}

.main-tab-label__text {
  font-size: 13px;
  font-weight: 400;
  color: v-bind('inactiveTabTextColor');
  overflow: hidden !important; /* 确保溢出隐藏 */
  text-overflow: ellipsis !important; /* 确保显示省略号 */
  white-space: nowrap !important; /* 确保不换行 */
  flex: 1 1 0; /* 允许缩小 */
  min-width: 0 !important; /* 确保可以缩小到0 */
  max-width: 100%;
  /* 确保文本元素有明确的宽度限制，text-overflow 才能生效 */
  width: 0; /* 设置为 0，让 flex: 1 来控制宽度 */
}

/* 活跃 Tab：正色 */
.tab-item.is-active .main-tab-label__text {
  font-weight: 400;
  color: var(--el-text-color-primary);
}

/* 预览 Tab：斜体（与是否活跃无关） */
.main-tab-label.is-preview .main-tab-label__text {
  font-style: italic;
}

.main-tab-label__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-text-color-primary);
  flex-shrink: 0;
}

.main-tab-label__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  position: relative;
  margin: 0;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  color: var(--el-text-color-primary);
  transition: none !important;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  z-index: 10;
  padding: 0;
  opacity: 1;
  pointer-events: auto;
}

.main-tab-label__close--active {
  opacity: 1 !important;
  pointer-events: auto !important;
  visibility: visible !important;
}

.main-tab-label__close:hover {
  background-color: v-bind('brutalistHoverBackgroundColor');
  border: 1px solid transparent;
  color: var(--el-text-color-primary);
}

.main-tab-label__close:active {
  border: 1px solid transparent !important;
  background-color: v-bind('brutalistActiveBackgroundColor') !important;
  color: var(--el-color-primary) !important;
  box-shadow: none !important;
}

.main-tab-label__close .el-icon {
  font-size: 12px;
}

/* 窗口控制按钮样式 - 与 tabs 区域同高，严禁底部凸出 */
.window-controls {
  display: flex;
  align-items: center;
  align-self: stretch;
  height: 34px;
  min-height: 34px;
  max-height: 34px;
  margin: 0;
  padding: 0 4px;
  border: none;
  border-left: 1px solid color-mix(in srgb, v-bind('borderColor') 12%, transparent);
  gap: 4px;
  flex-shrink: 0;
  overflow: hidden;
  box-sizing: border-box;
  line-height: 0;
}

.window-control-btn {
  width: 32px;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: none !important;
  color: var(--el-text-color-primary);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  box-sizing: border-box;
  line-height: 0;
}

.window-control-btn:hover {
  background-color: v-bind('brutalistHoverBackgroundColor');
  border: 1px solid transparent;
}

.window-control-btn:active {
  border: 1px solid transparent !important;
  background-color: v-bind('brutalistActiveBackgroundColor') !important;
  color: var(--el-color-primary) !important;
  box-shadow: none !important;
}

.window-control-btn--close:hover {
  background-color: var(--el-color-danger);
  border: 1px solid transparent;
  color: var(--el-color-white);
}

.window-control-btn--close:active {
  background-color: v-bind('brutalistActiveCloseBackgroundColor') !important;
  border: 1px solid transparent !important;
  color: var(--el-color-danger) !important;
  box-shadow: none !important;
}

.window-control-btn .el-icon {
  font-size: 16px;
  line-height: 0;
  display: block;
}

/* 标准窗口控制 SVG 图标 */
.window-control-icon {
  width: 16px;
  height: 16px;
  display: block;
  flex-shrink: 0;
  object-fit: contain;
}

.window-control-btn--close .window-control-icon--close {
  width: 14px;
  height: 14px;
}

/* 新建文档按钮样式 - 严禁底部凸出 */
.new-tab-button {
  width: 32px;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  margin: 0 0 0 6px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: none !important;
  color: var(--el-text-color-primary);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  flex-shrink: 0;
  background-color: v-bind('tabItemBackgroundColor');
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 10;
  box-sizing: border-box;
  line-height: 0;
  overflow: hidden;
}

.new-tab-button:hover:not(.is-locked) {
  background-color: v-bind('brutalistHoverBackgroundColor');
  border: 1px solid transparent;
}

.new-tab-button:active:not(.is-locked) {
  border: 1px solid transparent !important;
  background-color: v-bind('brutalistActiveBackgroundColor') !important;
  color: var(--el-color-primary) !important;
  box-shadow: none !important;
}

.new-tab-button.is-locked {
  cursor: not-allowed;
  opacity: 0.6;
}

.new-tab-button .el-icon {
  font-size: 16px;
  font-weight: 600;
  line-height: 0;
  display: block;
}

.focus-mode-button {
  width: 32px;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  margin: 0 0 0 4px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: none !important;
  color: var(--el-text-color-primary);
  user-select: none;
  -webkit-user-select: none;
  flex-shrink: 0;
  background-color: v-bind('tabItemBackgroundColor');
}

.focus-mode-button:hover:not(.is-locked) {
  background-color: v-bind('brutalistHoverBackgroundColor');
  border: 1px solid transparent;
}

.focus-mode-button:active:not(.is-locked) {
  border: 1px solid transparent !important;
  background-color: v-bind('brutalistActiveBackgroundColor') !important;
  box-shadow: none !important;
}

.focus-mode-button-icon {
  width: 15px;
  height: 15px;
  display: block;
  object-fit: contain;
  pointer-events: none;
}

.focus-mode-button.is-locked {
  cursor: not-allowed;
  opacity: 0.6;
}

/* Tab 右键菜单 - 参考 SessionList.item-menu 样式 */
.tab-context-menu {
  position: fixed;
  z-index: 1002;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  min-width: 140px;
  width: max-content;
  max-width: 280px;
  border: 1px solid v-bind('tabContextMenuStyle.borderColor');
  display: flex;
  flex-direction: column;
}

.tab-context-menu__item {
  background: transparent;
  border: none;
  padding: 8px 10px;
  text-align: left;
  color: v-bind('tabContextMenuStyle.color');
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.2;
  transition: background-color 0.2s ease;
  width: 100%;
}

.tab-context-menu__item:hover {
  background-color: rgba(64, 158, 255, 0.16);
}

.tab-context-menu__divider {
  height: 1px;
  margin: 4px 0;
  background-color: v-bind('tabContextMenuStyle.borderColor');
  opacity: 0.5;
}

.tab-context-menu__submenu-trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
}

.tab-context-menu__submenu-trigger .arrow-icon {
  margin-left: 8px;
  font-size: 12px;
  flex-shrink: 0;
  line-height: 1;
}

.tab-context-menu__submenu {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 4px;
  min-width: 160px;
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid v-bind('tabContextMenuStyle.borderColor');
  background-color: v-bind('tabContextMenuStyle.backgroundColor');
  display: flex;
  flex-direction: column;
}

.tab-context-menu__empty {
  padding: 8px 10px;
  font-size: 13px;
  color: v-bind('tabContextMenuStyle.color');
  opacity: 0.6;
}

/* 固定标签页图标样式 */
.main-tab-label__pinned-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  user-select: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Tab 入场动画 - 粗野主义，原生感 */
.tab-item {
  will-change: transform;
}

.tab-item[data-animating='true'] {
  pointer-events: none;
}
</style>
