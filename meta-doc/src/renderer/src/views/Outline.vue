<template>
  <div class="outline-page" :data-direction="direction" :class="{ 'is-dragging': isDraggingNode }">
  <div class="container">
    <!-- AI 工具栏与格式化标题：通过子组件 + inject 使用 selectedAiTool，避免 Outline 因 selectedAiTool 变化而 re-render 导致树图位置重置 -->
    <OutlineAiToolbar />

    <div class="aero-div generate-preview" v-if="generating || pendingAccept" :style="{
      backgroundColor: themeState.currentTheme.background2nd, top: position.top + 'px',
      left: position.left + 'px',
    }" @mousedown.stop="startDrag">
      <el-scrollbar class="generate-preview-scrollbar" :wrap-style="{ maxHeight: pendingAccept ? '60vh' : '70vh' }">
        <div class="noselect-display">
          <template v-if="generating">
            <h2>
              {{ $t('outline.generating') }}
              <el-tooltip :content="$t('outline.cancelTasks')" placement="top">
                <el-button type="danger" plain class="aero-btn generate-preview-btn-square"
                  @click.stop="cancelAllAiTasks">
                  <el-icon><Close /></el-icon>
                </el-button>
                <el-button
                  type="danger"
                  class="aero-btn generate-preview-btn-square"
                  @click.stop="discardChange"
                  :loading="generateChildChapterLoading"
                >
                  <el-icon v-if="!generateChildChapterLoading"><Close /></el-icon>
                </el-button>
              </el-tooltip>
            </h2>
            <div class="generate-preview-content">{{ rawstring }}</div>
          </template>
          <template v-else-if="pendingAccept">
            <h2>{{ $t('outline.previewResult') }}</h2>
            <div class="generate-preview-content">{{ rawstring }}</div>
          </template>
        </div>
      </el-scrollbar>
      <!-- 接受/拒绝固定在弹窗底部，与取消按钮一致为圆角正方形 -->
      <div v-if="pendingAccept" class="generate-preview-actions">
        <el-tooltip :content="$t('outline.accept')" placement="top">
          <el-button type="success" class="aero-btn generate-preview-btn-square" @click.stop="acceptChange">
            <el-icon><Check /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="$t('outline.reject')" placement="top">
          <el-button type="danger" class="aero-btn generate-preview-btn-square"
            @click.stop="discardChange" :loading="generateChildChapterLoading">
            <el-icon v-if="!generateChildChapterLoading"><Close /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

      <vue-tree
      ref="treeRef"
      :key="outlineTreeKey"
      class="outline-tree-container"
      :class="{ 'is-dragging': isDraggingNode }"
      style="width: 100%; height: 100%; border-radius: 18px;"
      :style="{ backgroundColor: themeState.currentTheme.background }"
      :dataset="treeData"
      :config="treeConfig"
      :direction="direction"
      link-style="straight"
      @node-click="handleNodeClick"
      @drag-node-end="handleNodeDrag"
      @wheel="handleWheelZoom"
    >

      <template #node="{ node, collapsed }" :style="{ backgroundColor: themeState.currentTheme.outlineNode }">
        <!-- 如果节点展开，显示详细节点面板 -->
        <template v-if="expandedNodes[node.path] && node.path !== 'dummy'">
          <div
            class="detailed-node-wrapper"
            :class="{ 'detailed-node-wrapper--top': lastExpandedNodePath === node.path }"
            @mousedown.stop
            @pointerdown.stop
            @click.stop
            @contextmenu.prevent="openNodeContextMenu($event, node)"
          >
            <DetailedOutlineNode
              :node="node"
              :outlineTree="treeData"
              :docPath="activeDocument?.path || ''"
              :docFormat="(activeDocument?.format ?? 'md') as 'md' | 'tex'"
              :userPrompt="aiConfig.userPrompt || userPrompt"
              :temperature="aiConfig.temperature"
              :wordCount="aiConfig.wordCount"
              @content-updated="(content: string) => handleNodeContentUpdate(node.path, content)"
              @cancel="handleNodeContentCancel(node.path)"
              @collapse="toggleNodeExpand(node.path)"
              class="detailed-node-inline"
            />
          </div>
        </template>
        <!-- 如果节点未展开，显示正常节点 -->
        <template v-else>
          <el-tooltip 
            :content="node.title || ''" 
            placement="top" 
            :disabled="!node.title || !isNodeTextTruncated(node.path)"
          >
            <div
              class="tree-node"
              :style="{ backgroundColor: themeState.currentTheme.outlineNode }"
              :class="dropPreview.targetPath === node.path ? ('drop-' + dropPreview.mode) : ''"
              draggable="true"
              @dragstart.stop="onNodeDragStart(node)"
              @dragover.prevent="onNodeDragOver($event, node)"
              @dragleave="onNodeDragLeave(node)"
              @drop.stop="onNodeDrop(node, $event)"
              @dragend.stop="onNodeDragEnd"
              @mousedown.stop
              @mousemove.stop="isDraggingNode ? $event.stopPropagation() : null"
              @contextmenu.prevent="openNodeContextMenu($event, node)"
            >
              <span class="tree-node-text" :ref="el => setTextElementRef(el, node.path)">{{ node.title }}</span>
              <!-- 展开按钮：小尺寸、扁平，不凸起 -->
              <el-tooltip :content="$t('outline.expand')" placement="top">
                <button
                  type="button"
                  class="tree-node-expand-btn"
                  @click.stop="toggleNodeExpand(node.path)"
                  v-if="node.path !== 'dummy'"
                  :disabled="pendingAccept || generating"
                  aria-label="Expand"
                >
                  <el-icon>
                    <ArrowDown />
                  </el-icon>
                </button>
              </el-tooltip>
            </div>
          </el-tooltip>
          <!-- 节点操作按钮：仅在选中 AI 工具时显示，点击打开 AI 配置 -->
          <OutlineNodeActionButton
            v-if="selectedAiTool"
            :node="node"
            :pending-accept="pendingAccept"
            :generating="generating"
          />
        </template>
      </template>

    </vue-tree>
    <!-- 节点右键菜单：Teleport 到 body，避免父级 transform 导致 fixed 定位偏移 -->
    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="nodeContextMenuPath && nodeContextMenuPosition"
          class="outline-node-context-menu item-menu-context"
          :style="{ ...nodeContextMenuStyle, ...nodeContextMenuPositionStyle }"
          @click.stop
        >
          <button type="button" class="outline-node-context-menu__item item-menu__item" @click="onNodeContextAction('moveLeft')">
            <el-icon class="outline-node-context-menu__icon"><ArrowLeftBold v-if="direction === 'vertical'" /><ArrowUpBold v-else /></el-icon>
            <span>{{ direction === 'vertical' ? $t('outline.moveLeft') : $t('outline.moveUp') }}</span>
          </button>
          <button type="button" class="outline-node-context-menu__item item-menu__item" @click="onNodeContextAction('moveRight')">
            <el-icon class="outline-node-context-menu__icon"><ArrowRightBold v-if="direction === 'vertical'" /><ArrowDownBold v-else /></el-icon>
            <span>{{ direction === 'vertical' ? $t('outline.moveRight') : $t('outline.moveDown') }}</span>
          </button>
          <button type="button" class="outline-node-context-menu__item item-menu__item" @click="onNodeContextAction('addChild')">
            <el-icon class="outline-node-context-menu__icon"><Plus /></el-icon>
            <span>{{ $t('outline.addChild') }}</span>
          </button>
          <button type="button" class="outline-node-context-menu__item item-menu__item" @click="onNodeContextAction('edit')">
            <el-icon class="outline-node-context-menu__icon"><Edit /></el-icon>
            <span>{{ $t('outline.editContent') }}</span>
          </button>
          <button type="button" class="outline-node-context-menu__item item-menu__item danger" @click="onNodeContextAction('delete')">
            <el-icon class="outline-node-context-menu__icon"><Delete /></el-icon>
            <span>{{ $t('outline.delete') }}</span>
          </button>
        </div>
      </transition>
    </Teleport>
    <el-dialog v-model="formatTitleDialogVisible" :title="$t('outline.formatTitleWizard')" width="480px" class="format-title-dialog">
      <el-form label-width="200px" class="demo-ruleForm">
        <el-form-item :label="$t('outline.adjustMarkdown')" prop="adjustMarkdown">
          <el-tooltip :content="$t('outline.adjustMarkdownTip')" placement="right">
            <el-switch v-model="formatTitleConfig.adjustMarkdown" active-color="#13ce66" inactive-color="#ff4949" />
          </el-tooltip>
        </el-form-item>
        <el-form-item v-if='formatTitleConfig.adjustMarkdown' :label="$t('outline.firstMarkdownTitleLevel')"
          prop="firstMarkdownTitleLevel">
          <el-input-number v-model="formatTitleConfig.firstMarkdownTitleLevel" :min="1" :max="6" :step="1"
            class="inline-input" />
        </el-form-item>
        <el-form-item :label="$t('outline.adjustTitle')" prop="adjustTitle">
          <el-tooltip :content="$t('outline.adjustTitleTip')" placement="right">
            <el-switch v-model="formatTitleConfig.adjustTitle" active-color="#13ce66" inactive-color="#ff4949" />
          </el-tooltip>
        </el-form-item>
        <el-form-item v-if="formatTitleConfig.adjustTitle" :label="$t('outline.coverOriginalNumber')" prop="append">
          <el-tooltip :content="$t('outline.coverTip')" placement="right">
            <el-switch v-model="formatTitleConfig.cover" active-color="#13ce66" inactive-color="#ff4949" />
          </el-tooltip>
        </el-form-item>
        <el-form-item v-if="formatTitleConfig.adjustTitle" :label="$t('outline.level1Chinese')"
          prop="level1TitleChinese">
          <el-tooltip :content="$t('outline.level1ChineseTip')" placement="right">
            <el-switch v-model="formatTitleConfig.level1TitleChinese" active-color="#13ce66" inactive-color="#ff4949" />
          </el-tooltip>
        </el-form-item>
        <div style="display: flex; justify-content: space-between; margin-top: 20px;">
          <el-button type="info" @click="formatTitleDialogVisible = false">{{ $t('outline.cancel') }}</el-button>
          <div style="display: flex; gap: 10px;">
            <el-button type="danger" @click="handleRemovePrefixes">{{ $t('outline.removePrefixes') }}</el-button>
            <el-button type="success" @click="executeFormatTitle">{{ $t('outline.confirm') }}</el-button>
          </div>
        </div>
      </el-form>
    </el-dialog>
    <el-dialog v-model="editValueDialogVisible" :title="$t('outline.editChapterTitle')" width="40%">
      <el-form>
        <el-form-item :label="$t('outline.chapterName')">
          <el-input v-model="currentChapterValue" autocomplete="off" class="aero-input" />
        </el-form-item>
        <el-form-item :label="$t('outline.chapterContent')">
          <md-editor
            v-model="currentChapterContent"
            show-code-row-number
            preview-theme="github"
            code-style-reverse
            style="text-align: left"
            :auto-fold-threshold="300"
            :theme="editorTheme"
          />

        </el-form-item>
      </el-form>
      <el-button type="primary" @click="changeNodeValue">{{ $t('outline.confirm') }}</el-button>
    </el-dialog>

    <!-- AI 配置对话框：标题随所选工具变化，如「生成子章节」「生成内容」 -->
    <el-dialog
      v-model="aiConfigDialogVisible"
      :title="aiConfigDialogTitleForDisplay"
      width="560px"
      class="ai-config-dialog"
      @opened="onAiConfigDialogOpened"
    >
      <div class="ai-config-body">
        <!-- 温度：刻度体现严谨 / 平衡 / 创意，默认 1 为平衡 -->
        <div class="ai-config-section">
          <label class="ai-config-label">{{ $t('outline.aiConfig.temperature') }}</label>
          <el-slider
            v-model="aiConfig.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            :show-tooltip="true"
            :marks="temperatureMarks"
            class="ai-config-temperature-slider"
          />
        </div>

        <!-- 关键词：KeywordInput + 下方 AI 推荐标签（标签内加号在文字左侧） -->
        <div class="ai-config-section">
          <label class="ai-config-label">{{ $t('outline.aiConfig.keywords') }}</label>
          <KeywordInput
            v-model="aiConfig.keywords"
            :placeholder="$t('outline.aiConfig.keywordsPlaceholder')"
            class="ai-config-keywords-input"
          />
          <div class="ai-config-recommended">
            <span class="ai-config-recommended-title">{{ $t('outline.aiConfig.recommendedKeywords') }}：</span>
            <template v-if="recommendedKeywordsLoading">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span class="ai-config-recommended-text">{{ $t('outline.aiConfig.generatingKeywords') }}</span>
            </template>
            <template v-else-if="recommendedKeywords.length">
              <div class="ai-config-recommended-tags">
                <el-tag
                  v-for="k in recommendedKeywords"
                  :key="k"
                  size="small"
                  type="info"
                  class="ai-config-recommended-tag"
                  @click="addRecommendedKeyword(k)"
                >
                  {{ k }}
                </el-tag>
              </div>
            </template>
          </div>
        </div>

        <!-- 用户提示词 -->
        <div class="ai-config-section">
          <label class="ai-config-label">{{ $t('outline.aiConfig.userPrompt') }}</label>
          <AutoResizeTextarea
            v-model="aiConfig.userPrompt"
            :placeholder="$t('outline.aiConfig.userPromptPlaceholder')"
            :autosize="{ minRows: 4 }"
            :preset-options="presetPrompts"
            class="ai-config-user-prompt"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="aiConfigDialogVisible = false">{{ $t('outline.cancel') }}</el-button>
        <el-button type="primary" @click="handleAiConfigConfirm">{{ $t('outline.confirm') }}</el-button>
      </template>
    </el-dialog>
    <div class="bottom-menu aero-div">
      <el-tooltip :content="direction === 'horizontal' ? $t('outline.switchToVertical') : $t('outline.switchToHorizontal')" placement="top">
        <el-button type="info" @click="toggleLayout">
          <el-icon>
            <Sort />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.zoomIn')" placement="top">
        <el-button type="success" @click="zoomIn">
          <el-icon>
            <Plus />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.zoomOut')" placement="top">
        <el-button type="warning" @click="zoomOut">
          <el-icon>
            <Minus />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.reset')" placement="top">
        <el-button type="info" @click="resetScale">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </div>
  </div>
</template>
<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted, onBeforeMount, onUnmounted, nextTick, provide, type Ref, type ComponentPublicInstance } from 'vue';
import { ElButton, ElDialog, ElMessageBox, ElNotification, ElSlider, ElSelect, ElOption, ElForm, ElFormItem, ElInputNumber } from 'element-plus'; // 引入 Element Plus 组件
import AutoResizeTextarea from '../components/base/AutoResizeTextarea.vue';
import { tabs, useWorkspace, type DocumentView } from '../stores/workspace';
import eventBus, { getWindowType } from '../utils/event-bus.js';
import '../assets/aero-div.css';
import '../assets/aero-btn.css';
import "../assets/aero-input.css";
import { MdEditor, type Themes } from 'md-editor-v3';
import { Plus, Edit, Delete, More, Minus, ArrowLeftBold, ArrowRightBold, ArrowUpBold, ArrowDownBold, Finished, EditPen, Checked, Close, Check, Download, Rank, CloseBold, Sort, ArrowDown, ArrowUp, Loading } from '@element-plus/icons-vue';
import type { DocumentOutlineNode } from '../../../types';
import { TREE_NODE_SCHEMA, DEFAULT_OUTLINE_TREE } from '../constants/document';
import { searchNode, searchParentNode, syncChildrenFromNodeText } from '../utils/outline-helpers';
import { adjustTitleIndex, adjustTitleLevel, removeTextFromOutline, generateMarkdownFromOutlineTree } from '../utils/md-utils.js';
import { removeTitleIndex } from '../utils/regex-utils.js';
import { expandTreeNodePrompt, generateContentPrompt, generateParentNodeContentPrompt, outlineChangePrompt } from '../utils/prompts';

import { themeState } from '../utils/themes.js'
import { extractOuterJsonString } from '../utils/regex-utils.js'
import { getOutlineAdapter } from '../utils/outline-adapters'
import {
  generateChildNodes as generateChildNodesUtil,
  generateNodeContent as generateNodeContentUtil,
  generateChildrenChildren as generateChildrenChildrenUtil,
  generateChildrenContent as generateChildrenContentUtil,
  cleanNodeTitleMarkers,
  cleanRawContent
} from '../utils/outline-ai-utils';
import DetailedOutlineNode from '../components/outline/DetailedOutlineNode.vue';
import OutlineAiToolbar from '../components/outline/OutlineAiToolbar.vue';
import OutlineNodeActionButton from '../components/outline/OutlineNodeActionButton.vue';
import KeywordInput from '../components/KeywordInput.vue';
import '../assets/noselect-display.css';
import { generateWithSchema } from '../utils/ai-schema-task';
import { OUTLINE_SECTION_KEYWORDS_SCHEMA } from '../utils/schemas';
import { generateOutlineSectionKeywordsPrompt } from '../utils/prompts';
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask, clearAiTasks } from '../utils/ai_tasks.ts'
import { getSetting, setSetting } from '../utils/settings.js'
import { createRendererLogger } from '../utils/logger.ts'

const { t } = useI18n()
const logger = createRendererLogger('Outline', {
  windowTypeProvider: () => getWindowType()
})
const workspace = useWorkspace()
const {
  activeTabId,
  activateTab,
  ensureDocument,
  removeTab,
  updateDocumentOutline,
  updateDocumentLastView,
  updateDocumentMarkdown,
  withAutoOutlineSyncSuppressed
} = workspace

const cloneOutline = (outline?: DocumentOutlineNode): DocumentOutlineNode =>
  JSON.parse(JSON.stringify(outline ?? DEFAULT_OUTLINE_TREE))

const activeDocument = computed(() => {
  if (!activeTabId.value) return null
  try {
    return ensureDocument(activeTabId.value)
  } catch (error) {
    logger.warn('获取当前文档失败', error)
    return null
  }
})

const treeData = ref<DocumentOutlineNode>(cloneOutline(activeDocument.value?.outline))
const editorTheme = computed<Themes | undefined>(
  () => themeState.currentTheme.vditorTheme as Themes | undefined
)
const selectedNode = ref<DocumentOutlineNode | null>(null)
const nodeContextMenuPath = ref<string | null>(null)
const nodeContextMenuPosition = ref<{ x: number; y: number } | null>(null)
const nodeContextMenuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))
const nodeContextMenuPositionStyle = computed(() => {
  if (!nodeContextMenuPosition.value) return {}
  return {
    position: 'fixed',
    left: nodeContextMenuPosition.value.x + 'px',
    top: nodeContextMenuPosition.value.y + 'px'
  }
})
const generated = ref(false)
const generating = ref(false)
const rawstring = ref('')
const generatedText = ref('')

let suppressDocumentSync = false

const commitOutline = async (outline?: DocumentOutlineNode) => {
  const tabId = activeTabId.value
  if (!tabId) return
  const snapshot = cloneOutline(outline ?? treeData.value)

  // 使用 withAutoOutlineSyncSuppressed 防止死循环：
  // 从大纲生成文本 -> 自动提取大纲 -> 触发 watch -> 再次生成文本
  await withAutoOutlineSyncSuppressed(async () => {
    suppressDocumentSync = true
    try {
      updateDocumentOutline(tabId, snapshot)
      // 只有在当前视图确实是outline时才更新lastView，避免切换Tab时自动跳转到outline
      const currentView = workspace.ensureDocument(tabId).lastView
      if (currentView === 'outline') {
        updateDocumentLastView(tabId, 'outline')
      }
      // 使用适配器按不同格式同步正文文本
      const doc = activeDocument.value
      const format = doc?.format ?? 'md'
      const adapter = getOutlineAdapter(format as any)
      if (format === 'tex') {
        const nextTex = await adapter.toText(snapshot, doc?.tex ?? '')
        workspace.updateDocumentTex(tabId, nextTex)
      } else {
        const nextMd = await adapter.toText(snapshot, doc?.markdown ?? '')
        updateDocumentMarkdown(tabId, nextMd)
      }
    } finally {
      suppressDocumentSync = false
    }
  })
}

const formatTitleDialogVisible = ref(false)
const formatTitle = () => {
  formatTitleDialogVisible.value = true
}
const formatTitleConfig = reactive({
  adjustMarkdown: true,
  firstMarkdownTitleLevel: 1,
  adjustTitle: true, //是否调整标题编号
  cover: true,
  level1TitleChinese: true //第一级标题使用中文，如一 二三四五六七八九十
})

const backupOutlineTree = ref<DocumentOutlineNode | null>(null)
const generateContentLoading = ref(false)
const generateChildrenContentLoading = ref(false)
const generateChildrenChildrenLoading = ref(false)
const parallelChildren = ref<Array<Ref<string>>>([]) // 用于存储并行生成的子节点
const userPrompt = ref('') // 用户输入的提示词
//const nodeBeingProcessed = ref(''); // 用于显示正在处理的节点名称
const generateChildrenChildren = async () => {
  // 暂停文档同步，避免并发写入时 treeData 被替换导致后续引用失效
  workspace.lockUI?.()
  const prevSync = suppressDocumentSync
  suppressDocumentSync = true
  const node = selectedNode.value
  generating.value = true
  generateChildrenChildrenLoading.value = true

  const rootNode = node ? searchNode(node.path, treeData.value) : null
  if (!rootNode) {
    generateChildrenChildrenLoading.value = false
    generating.value = false
    suppressDocumentSync = prevSync
    workspace.unlockUI?.()
    return
  }
  parallelChildren.value = [];

  // 构建增强的用户提示词
  let enhancedPrompt = aiConfig.userPrompt || userPrompt.value || ''
  const kwStr = getKeywordsPromptString()
  if (kwStr) enhancedPrompt += `\n关键词：${kwStr}`

  try {
    // 使用公共工具函数
    await generateChildrenChildrenUtil(
      rootNode,
      treeData.value,
      enhancedPrompt,
      (activeDocument.value?.format ?? 'md') as 'md' | 'tex',
      undefined, // signal
      (curNode, nodeRawContentRef) => {
        // 为每个节点创建一个独立的ref用于显示原始内容
        parallelChildren.value.push(nodeRawContentRef);
      },
      undefined, // onUpdate
      aiConfig.temperature !== undefined ? aiConfig.temperature : undefined // 传递温度参数
    );
    
    eventBus.emit('show-success', t('outline.generateChildSuccess'));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    eventBus.emit('show-error', t('outline.generateChildFail', { error: message }))
  } finally {
    generateChildrenChildrenLoading.value = false
    generating.value = false
    // 恢复同步并统一提交一次，确保所有并发结果都写入
    suppressDocumentSync = prevSync
    commitOutline()
    workspace.unlockUI?.()
  }
}

const generateChildrenContent = async () => {
  // 暂停文档同步，避免并发写入期间 treeData 被替换
  workspace.lockUI?.()
  const prevSync = suppressDocumentSync
  suppressDocumentSync = true
  const node = selectedNode.value
  generating.value = true
  generateChildrenContentLoading.value = true

  const rootNode = node ? searchNode(node.path, treeData.value) : null
  if (!rootNode) {
    generateChildrenContentLoading.value = false
    generating.value = false
    suppressDocumentSync = prevSync
    workspace.unlockUI?.()
    return
  }
  parallelChildren.value = []; // 清空并行生成列表

  // 构建增强的用户提示词
  let enhancedPrompt = aiConfig.userPrompt || userPrompt.value || ''
  const kwStr = getKeywordsPromptString()
  if (kwStr) enhancedPrompt += `\n关键词：${kwStr}`
  if (aiConfig.wordCount) {
    enhancedPrompt += `\n目标字数：约${aiConfig.wordCount}字`
  }

  try {
    // 使用公共工具函数
    await generateChildrenContentUtil(
      rootNode,
      treeData.value,
      enhancedPrompt,
      (activeDocument.value?.format ?? 'md') as 'md' | 'tex',
      undefined, // signal
      (curNode, nodeRawContentRef) => {
        // 为每个节点创建一个独立的ref用于显示原始内容
        parallelChildren.value.push(nodeRawContentRef);
      },
      undefined, // onUpdate
      aiConfig.temperature !== undefined ? aiConfig.temperature : undefined, // 传递温度参数
      aiConfig.wordCount !== undefined ? aiConfig.wordCount : undefined // 传递字数参数
    );

    generating.value = false;
    generateChildrenContentLoading.value = false;
    generated.value = true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('批量生成内容失败:', e);
    eventBus.emit('show-error', t('outline.generateContentFail', { error: message }));
  } finally {
    // 恢复同步并统一提交一次
    suppressDocumentSync = prevSync;
    commitOutline();
    workspace.unlockUI?.();
  }
};

const generateContent = async () => {
  workspace.lockUI?.()
  const node = selectedNode.value
  generating.value = true
  if (node) {
    backupContent.value = node.text
  }
  generateContentLoading.value = true
  const curNode = node ? searchNode(node.path, treeData.value) : null
  if (!curNode) {
    generateContentLoading.value = false
    generating.value = false
    workspace.unlockUI?.()
    return
  }
  const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'
  rawstring.value = ''; // 清空之前的内容
  
  // 构建增强的用户提示词（包含关键词）
    let enhancedPrompt = aiConfig.userPrompt || userPrompt.value || ''
    const kwStr = getKeywordsPromptString()
    if (kwStr) enhancedPrompt += `\n关键词：${kwStr}`
  // 注意：wordCount通过函数参数传递，而不是添加到提示词中（函数内部会处理）
  
  try {
    const content = await generateNodeContentUtil(
      curNode,
      treeData.value,
      enhancedPrompt,
      undefined, // signal
      docFormat,
      rawstring, // 传入rawstring ref，用于实时显示原始内容
      undefined, // onUpdate
      aiConfig.temperature !== undefined ? aiConfig.temperature : undefined, // 传递温度参数
      aiConfig.wordCount !== undefined ? aiConfig.wordCount : undefined // 传递字数参数
    );
    // rawstring.value 已经通过ref实时更新了，这里只需要设置处理后的内容
    curNode.text = content || ''
    syncChildrenFromNodeText(curNode)
  } catch (err) {
    logger.warn('任务失败或取消：', err)
    const rawContent = rawstring.value?.trim() || ''
    if (rawContent) {
      curNode.text = rawContent
      syncChildrenFromNodeText(curNode)
    } else {
      curNode.text = ''
      curNode.children = []
    }
  } finally {
    pendingAccept.value = true
    generateContentLoading.value = false
    generating.value = false
    workspace.unlockUI?.()
  }
  eventBus.emit('show-success', t('outline.generateChapterSuccess'))
}

const position = ref({ top: 100, left: 100 })
let isDragging = false
let offset: { x: number; y: number } = { x: 0, y: 0 }
function startDrag(e: MouseEvent) {
  isDragging = true
  offset.x = e.clientX - position.value.left
  offset.y = e.clientY - position.value.top
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}
function onDrag(e: MouseEvent) {
  if (!isDragging) return
  position.value.left = e.clientX - offset.x
  position.value.top = e.clientY - offset.y
}
function stopDrag() {
  isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

/**
 * 移除大纲树中所有节点的标题前缀
 */
function removeAllTitlePrefixes(outlineTree: DocumentOutlineNode): DocumentOutlineNode {
  const node = cloneOutline(outlineTree)

  function dfs(n: DocumentOutlineNode): void {
    if (n.title) {
      n.title = removeTitleIndex(n.title)
    }

    for (const child of n.children) {
      dfs(child)
    }
  }

  if (node.path === 'dummy') {
    for (const child of node.children) {
      dfs(child)
    }
  } else {
    dfs(node)
  }

  return node
}

const executeFormatTitle = async () => {
  backupOutlineTree.value = cloneOutline(treeData.value)

  // 暂停文档同步，避免触发 watch 导致循环
  const prevSync = suppressDocumentSync
  suppressDocumentSync = true

  try {
    let modifiedTree = cloneOutline(treeData.value)

    // 调整Markdown标题层级（如果指定）
    if (formatTitleConfig.adjustMarkdown) {
      const firstLevel = formatTitleConfig.firstMarkdownTitleLevel
      modifiedTree = cloneOutline(adjustTitleLevel(modifiedTree, firstLevel))
    }

    // 3. 调整章节编号（如果指定）
    if (formatTitleConfig.adjustTitle) {
      const cover = formatTitleConfig.cover
      const level1TitleChinese = formatTitleConfig.level1TitleChinese
      modifiedTree = cloneOutline(adjustTitleIndex(modifiedTree, cover, level1TitleChinese))
    }

    // 更新 treeData（此时 suppressDocumentSync = true，不会触发 watch）
    treeData.value = modifiedTree

    // 手动提交更改
    await commitOutline(modifiedTree)

    formatTitleDialogVisible.value = false
    eventBus.emit('show-success', t('outline.formatSuccess'))
  } finally {
    // 恢复同步状态
    suppressDocumentSync = prevSync
  }
}

const handleRemovePrefixes = () => {
  ElMessageBox.confirm(t('outline.removePrefixesConfirm'), t('outline.warning'), {
    confirmButtonText: t('outline.confirm'),
    cancelButtonText: t('outline.cancel'),
    type: 'warning'
  })
    .then(async () => {
      backupOutlineTree.value = cloneOutline(treeData.value)

      // 暂停文档同步，避免触发 watch 导致循环
      const prevSync = suppressDocumentSync
      suppressDocumentSync = true

      try {
        let modifiedTree = cloneOutline(treeData.value)
        modifiedTree = removeAllTitlePrefixes(modifiedTree)

        // 更新 treeData（此时 suppressDocumentSync = true，不会触发 watch）
        treeData.value = modifiedTree

        // 手动提交更改
        await commitOutline(modifiedTree)

        formatTitleDialogVisible.value = false
        eventBus.emit('show-success', t('outline.removePrefixesSuccess'))
      } finally {
        // 恢复同步状态
        suppressDocumentSync = prevSync
      }
    })
    .catch(() => {
      // 用户取消，不做任何操作
    })
}

const handleNodeDrag = (_dragNode: any, _targetNode: any) => {
  // 尝试将拖拽节点移动为目标节点的最后一个子节点
  try {
    if (!_dragNode || !_targetNode) return
    const drag = searchNode(_dragNode.path, treeData.value)
    if (!drag) return
    const originParent = searchParentNode(_dragNode.path, treeData.value)
    // 如果拖动的是根节点，则不允许
    if (!originParent) return

    // 暂停同步，防止频繁重新渲染
    const wasSuppressed = suppressDocumentSync
    suppressDocumentSync = true

    // 从原父节点移除
    removeNode(originParent, drag)
    // 确定目标插入位置（目标节点作为父）
    const target = searchNode(_targetNode.path, treeData.value)
    const targetParent = searchParentNode(_targetNode.path, treeData.value)
    if (target) {
      target.children = target.children || []
      target.children.push(drag)
      // 重新计算路径
      reindexChildrenPaths(target)
    } else if (targetParent) {
      // 退化为与目标同级追加
      targetParent.children = targetParent.children || []
      targetParent.children.push(drag)
      reindexChildrenPaths(targetParent)
    }

    // 恢复同步并提交更改
    suppressDocumentSync = wasSuppressed
    if (!wasSuppressed) {
      commitOutline()
    }
  } catch (err) {
    logger.warn('节点拖拽失败', err)
    // 即使出错也要恢复同步状态
    if (!suppressDocumentSync) {
      suppressDocumentSync = false
    }
  }
}

const draggingNodePath = ref<string | null>(null)
const isDraggingNode = ref(false)
function onNodeDragStart(node: DocumentOutlineNode) {
  draggingNodePath.value = node.path
  isDraggingNode.value = true
  // 拖动开始时暂停文档同步，防止频繁重新渲染
  suppressDocumentSync = true
  // 清除可能存在的 commitOutline 定时器，避免在拖拽过程中触发提交
  if (commitOutlineTimer) {
    clearTimeout(commitOutlineTimer)
    commitOutlineTimer = null
  }
  // 在拖拽时给 body 添加 class，防止其他组件受影响
  document.body.classList.add('outline-dragging')
}
type DropMode = 'before' | 'after' | 'inside' | 'parent'
const dropPreview = reactive<{ targetPath: string | null; mode: DropMode | null }>({
  targetPath: null,
  mode: null
})

// 节流定时器，用于减少拖拽过程中的 dropPreview 更新频率
let dropPreviewThrottleTimer: NodeJS.Timeout | null = null
let pendingDropPreviewUpdate: { targetPath: string; mode: DropMode } | null = null

function computeDropMode(e: DragEvent, el: HTMLElement): DropMode {
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height

  if (direction.value === 'vertical') {
    // 纵向布局：左右调整平级顺序，上下调整父子关系
    const leftZone = w * 0.25
    const rightZone = w * 0.75
    const topZone = h * 0.25
    const bottomZone = h * 0.75
    if (x <= leftZone) return 'before'
    if (x >= rightZone) return 'after'
    if (y >= bottomZone) return 'inside'
    if (y <= topZone) return 'parent'
    // 默认作为 inside
    return 'inside'
  } else {
    // 横向布局：上下调整平级顺序，左右调整父子关系
    const topZone = h * 0.25
    const bottomZone = h * 0.75
    const leftZone = w * 0.25
    const rightZone = w * 0.75
    if (y <= topZone) return 'before'
    if (y >= bottomZone) return 'after'
    if (x >= rightZone) return 'inside'
    if (x <= leftZone) return 'parent'
    // 默认作为 inside
    return 'inside'
  }
}

function onNodeDragOver(e: DragEvent, node: DocumentOutlineNode) {
  const el = e.currentTarget as HTMLElement | null
  if (!el) return
  const mode = computeDropMode(e, el)

  // 保存待更新的值
  pendingDropPreviewUpdate = { targetPath: node.path, mode }

  // 如果定时器不存在，立即更新并设置定时器
  if (!dropPreviewThrottleTimer) {
    dropPreview.targetPath = node.path
    dropPreview.mode = mode
    // 使用节流，每 50ms 最多更新一次，减少重新渲染频率
    dropPreviewThrottleTimer = setTimeout(() => {
      dropPreviewThrottleTimer = null
      // 应用最后一次待更新的值
      if (pendingDropPreviewUpdate) {
        dropPreview.targetPath = pendingDropPreviewUpdate.targetPath
        dropPreview.mode = pendingDropPreviewUpdate.mode
        pendingDropPreviewUpdate = null
      }
    }, 50)
  }
}

function onNodeDragLeave(_node: DocumentOutlineNode) {
  // 清除节流定时器
  if (dropPreviewThrottleTimer) {
    clearTimeout(dropPreviewThrottleTimer)
    dropPreviewThrottleTimer = null
  }
  pendingDropPreviewUpdate = null
  dropPreview.targetPath = null
  dropPreview.mode = null
}

function onNodeDrop(targetNode: DocumentOutlineNode, e: DragEvent) {
  try {
    // 清除节流定时器
    if (dropPreviewThrottleTimer) {
      clearTimeout(dropPreviewThrottleTimer)
      dropPreviewThrottleTimer = null
    }
    pendingDropPreviewUpdate = null

    const fromPath = draggingNodePath.value
    draggingNodePath.value = null
    const mode = dropPreview.mode
    dropPreview.targetPath = null
    dropPreview.mode = null
    isDraggingNode.value = false
    if (!fromPath) return
    if (fromPath === targetNode.path || !mode) return
    const drag = searchNode(fromPath, treeData.value)
    if (!drag) return
    const originParent = searchParentNode(fromPath, treeData.value)
    if (!originParent) return
    // 工具：判断是否为后代（防止自包含导致的子树丢失）
    const isDescendant = (candidatePath: string, ancestorPath: string): boolean => {
      if (!ancestorPath) return false
      return candidatePath === ancestorPath || candidatePath.startsWith(ancestorPath + '.')
    }
    // 工具：创建只包含标题与正文的浅拷贝（不带子节点）
    const createShallowCopy = (node: DocumentOutlineNode): DocumentOutlineNode => {
      return {
        title: node.title,
        text: node.text,
        title_level: node.title_level,
        path: '',
        children: []
      }
    }

    const target = searchNode(targetNode.path, treeData.value)
    if (!target) return

    if (mode === 'inside') {
      // 插入为子节点；如果目标是拖拽节点的后代，分两类：
      // 1) 目标是拖拽节点的“直接子节点”：将该直接子节点及其同级（即拖拽节点的所有直接子）上移到原父级；再把拖拽节点作为该目标的子节点
      // 2) 目标是更深层后代：避免形成环，仅复制“当前节点内容”插入
      target.children = target.children || []
      if (isDescendant(target.path, drag.path)) {
        const targetParent = searchParentNode(target.path, treeData.value)
        const isDirectChild = targetParent && targetParent.path === drag.path
        if (isDirectChild) {
          const hostParent = originParent ?? treeData.value
          hostParent.children = hostParent.children || []
          const indexOfA = hostParent.children.indexOf(drag)
          const oldChildren = drag.children && drag.children.length ? [...drag.children] : []
          // 1) 在祖父层用 A 的子列表替换 A，自然保持原排序位置
          if (indexOfA >= 0) {
            hostParent.children.splice(indexOfA, 1, ...oldChildren)
          } else {
            // 找不到 A 的极端情况，退化为末尾插入
            hostParent.children.push(...oldChildren)
            removeNode(originParent ?? treeData.value, drag)
          }
          // 2) 清空 A 的子列表
          drag.children = []
          // 3) 把 A 作为 B 的子节点
          target.children.push(drag)
          // 4) 重新索引
          reindexChildrenPaths(hostParent)
          reindexChildrenPaths(target)
          reindexChildrenPaths(treeData.value)
        } else {
          // 更深层后代：仅复制“当前节点内容”，避免环
          const shallow = createShallowCopy(drag)
          target.children.push(shallow)
          reindexChildrenPaths(target)
        }
      } else {
        // 正常移动：先从原父移除再插入
        removeNode(originParent, drag)
        target.children.push(drag)
        reindexChildrenPaths(target)
      }
      return
    }

    if (mode === 'before' || mode === 'after') {
      const parent = searchParentNode(target.path, treeData.value)
      if (!parent || !parent.children) return
      const targetIdx = parent.children.findIndex((c) => c.path === target.path)
      if (targetIdx === -1) return

      // 插入到目标同级；如果该"同级父节点"是拖拽节点的后代，同样只复制"当前节点内容"
      if (isDescendant(parent.path, drag.path)) {
        const insertIndex = mode === 'before' ? targetIdx : targetIdx + 1
        const shallow = createShallowCopy(drag)
        parent.children.splice(insertIndex, 0, shallow)
        reindexChildrenPaths(parent)
        return
      }

      // 检查拖拽节点和目标节点是否在同一父节点（同层级）
      const isSameParent = originParent === parent
      let dragIdx = -1
      if (isSameParent) {
        dragIdx = parent.children.findIndex((c) => c.path === drag.path)
      }

      // 计算插入位置（基于移除前的索引）
      let insertIndex: number
      if (mode === 'before') {
        insertIndex = targetIdx
      } else {
        insertIndex = targetIdx + 1
      }

      // 如果同层级移动，需要调整插入索引
      if (isSameParent && dragIdx !== -1) {
        // 如果拖拽节点已经在目标位置（before模式：dragIdx === targetIdx，after模式：dragIdx === targetIdx + 1），保持顺序不变
        if (
          (mode === 'before' && dragIdx === targetIdx) ||
          (mode === 'after' && dragIdx === targetIdx + 1)
        ) {
          // 已经在目标位置，不需要移动
          reindexChildrenPaths(parent)
          return
        }

        // 先移除拖拽节点
        parent.children.splice(dragIdx, 1)

        // 移除后，如果拖拽节点在目标节点之前，目标节点的索引会-1
        if (dragIdx < targetIdx) {
          // 目标节点索引变成 targetIdx - 1
          if (mode === 'before') {
            // 插入到目标前面，现在目标在 targetIdx - 1，所以插入位置也是 targetIdx - 1
            insertIndex = targetIdx - 1
          } else {
            // 插入到目标后面，现在目标在 targetIdx - 1，后面是 targetIdx
            insertIndex = targetIdx
          }
        } else {
          // 拖拽节点在目标节点之后（dragIdx > targetIdx），目标节点索引不变
          // 需要调整插入位置：如果 dragIdx < insertIndex，移除后 insertIndex 需要-1
          if (dragIdx < insertIndex) {
            insertIndex--
          }
        }
      } else {
        // 不同层级，直接移除
        removeNode(originParent, drag)
      }

      // 插入节点
      parent.children.splice(insertIndex, 0, drag)
      reindexChildrenPaths(parent)
      return
    }

    if (mode === 'parent') {
      const targetParent = searchParentNode(target.path, treeData.value)
      if (!targetParent) {
        // 目标无父节点（根），放不到更上层，回退为 before
        const parent = searchParentNode(target.path, treeData.value)
        if (!parent || !parent.children) return
        const idx = parent.children.findIndex((c) => c.path === target.path)
        if (idx === -1) return
        if (isDescendant(parent.path, drag.path)) {
          const shallow = createShallowCopy(drag)
          parent.children.splice(idx, 0, shallow)
        } else {
          removeNode(originParent, drag)
          parent.children.splice(idx, 0, drag)
        }
        reindexChildrenPaths(parent)
        return
      }
      const grandParent = searchParentNode(targetParent.path, treeData.value)
      if (!grandParent || !grandParent.children) return
      const idxParent = grandParent.children.findIndex((c) => c.path === targetParent.path)
      // 将拖拽节点插入到“父节点”的后面，等价于提升一层（作为父节点的同级）
      const insertIndex = idxParent + 1
      if (isDescendant(grandParent.path, drag.path)) {
        const shallow = createShallowCopy(drag)
        grandParent.children.splice(insertIndex, 0, shallow)
      } else {
        removeNode(originParent, drag)
        grandParent.children.splice(insertIndex, 0, drag)
      }
      reindexChildrenPaths(grandParent)
      return
    }

    // 拖动操作完成后恢复同步并提交更改
    if (suppressDocumentSync) {
      suppressDocumentSync = false
      commitOutline()
    }
  } catch (err) {
    logger.warn('HTML5 拖拽节点失败', err)
    // 即使出错也要恢复同步状态
    if (suppressDocumentSync) {
      suppressDocumentSync = false
    }
  }
}
function onNodeDragEnd() {
  // 清除节流定时器
  if (dropPreviewThrottleTimer) {
    clearTimeout(dropPreviewThrottleTimer)
    dropPreviewThrottleTimer = null
  }
  pendingDropPreviewUpdate = null
  draggingNodePath.value = null
  dropPreview.targetPath = null
  dropPreview.mode = null
  isDraggingNode.value = false
  // 移除 body 上的 class
  document.body.classList.remove('outline-dragging')
  // 拖动结束时恢复同步并提交更改
  if (suppressDocumentSync) {
    suppressDocumentSync = false
    commitOutline()
  }
}
const handleNodeClick = (node: DocumentOutlineNode) => {
  selectedNode.value = node
}

// 初始化方向，使用默认值
const direction = ref<'vertical' | 'horizontal'>('vertical')
const treeConfig = reactive({
  nodeWidth: 180,
  nodeHeight: 50,
  levelHeight: 200,
  layout: 'vertical' as 'vertical' | 'horizontal'
})

// 标记方向是否已加载，用于控制vue-tree的渲染时机
const directionLoaded = ref(false)

// 加载布局方向设置 - 必须在渲染前完成
const loadLayoutDirection = async () => {
  const savedDirection = await getSetting('outlineLayoutDirection')
  if (savedDirection === 'horizontal' || savedDirection === 'vertical') {
    direction.value = savedDirection
    treeConfig.layout = savedDirection
  }
  // 只有在首次加载时才设置directionLoaded，避免重复设置
  if (!directionLoaded.value) {
    directionLoaded.value = true
  }
}

// 切换布局方向
const toggleLayout = async () => {
  if (direction.value === 'vertical') {
    direction.value = 'horizontal'
    treeConfig.layout = 'horizontal'
  } else {
    direction.value = 'vertical'
    treeConfig.layout = 'vertical'
  }
  // 切换布局时重置缩放
  currentScale.value = 1.0

  // 保存设置
  await setSetting('outlineLayoutDirection', direction.value)
}
type TreeInstance = {
  restoreScale: () => void
  zoomIn: () => void
  zoomOut: () => void
}

const treeRef = ref<TreeInstance | null>(null)
const currentChapterValue = ref('')
const currentChapterContent = ref('')
const editValueDialogVisible = ref(false)

// 存储每个节点的文本元素引用，用于检查文本是否被截断
const textElementRefs = new Map<string, HTMLElement>()
// 存储每个节点的截断状态（响应式）
const textTruncatedState = reactive<Record<string, boolean>>({})

// 设置文本元素引用并检查截断状态
const setTextElementRef = (el: Element | ComponentPublicInstance | null, nodePath: string) => {
  if (el && el instanceof HTMLElement) {
    textElementRefs.set(nodePath, el)
    // 检查文本是否被截断
    nextTick(() => {
      const isTruncated = el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight
      textTruncatedState[nodePath] = isTruncated
    })
  } else if (!el) {
    textElementRefs.delete(nodePath)
    delete textTruncatedState[nodePath]
  }
}

// 检查节点的文本是否被截断
const isNodeTextTruncated = (nodePath: string): boolean => {
  return textTruncatedState[nodePath] === true
}

// 重新检查所有文本元素的截断状态（使用防抖避免频繁触发）
let recheckTextTruncationTimer: NodeJS.Timeout | null = null
const recheckTextTruncation = () => {
  // 清除之前的定时器
  if (recheckTextTruncationTimer) {
    clearTimeout(recheckTextTruncationTimer)
  }
  // 使用防抖，延迟 200ms 执行，避免在缩放过程中频繁触发
  recheckTextTruncationTimer = setTimeout(() => {
    recheckTextTruncationTimer = null
    textElementRefs.forEach((el, nodePath) => {
      const isTruncated = el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight
      textTruncatedState[nodePath] = isTruncated
    })
  }, 200)
}

// 跟踪上一次的视图状态，用于检测视图切换
const lastKnownView = ref<DocumentView | null>(null)

// 同步大纲树到treeData的函数
const syncOutlineToTreeData = (outline?: DocumentOutlineNode) => {
  if (suppressDocumentSync) return
  const doc = activeDocument.value
  if (!doc) return

  suppressDocumentSync = true
  try {
    treeData.value = cloneOutline(outline ?? doc.outline)
    selectedNode.value = null
    generated.value = false
    generatedText.value = ''
  } finally {
    suppressDocumentSync = false
  }
}

// 监听视图切换：当切换到outline视图时，从文档同步大纲树
watch(
  () => activeDocument.value?.lastView,
  async (newView, oldView) => {
    const currentView = (newView ?? 'editor') as DocumentView
    const prevView = (oldView ?? lastKnownView.value ?? 'editor') as DocumentView

    // 检测视图切换到outline
    if (currentView === 'outline' && prevView !== 'outline') {
      // 视图刚切换到outline，确保方向已加载
      if (!directionLoaded.value) {
        await loadLayoutDirection()
      }
      // 从文档同步大纲树
      const doc = activeDocument.value
      if (doc) {
        syncOutlineToTreeData(doc.outline)
      }
    }

    // 更新lastKnownView
    lastKnownView.value = currentView
  },
  { immediate: true }
)

// 监听文档切换：当切换文档时，确保方向已加载
watch(
  () => activeTabId.value,
  async () => {
    // 切换文档时，如果当前视图是outline，确保方向已加载
    const doc = activeDocument.value
    if (doc) {
      const currentView = doc.lastView ?? 'editor'
      if (currentView === 'outline' && !directionLoaded.value) {
        await loadLayoutDirection()
      }
    }
  }
)

// 监听文档outline变化：只在outline视图时同步到treeData
watch(
  () => activeDocument.value?.outline,
  async (outline) => {
    if (suppressDocumentSync) return

    // 只在当前视图是outline时才从文档同步大纲树
    // 这样可以避免在编辑器视图中编辑时，大纲树更新导致编辑器刷新
    const doc = activeDocument.value
    if (!doc) return

    const currentView = doc.lastView ?? 'editor'

    // 只在outline视图时才同步，避免编辑器视图时的干扰
    if (currentView !== 'outline') {
      return
    }

    // 确保方向已加载
    if (!directionLoaded.value) {
      await loadLayoutDirection()
    }

    syncOutlineToTreeData(outline)
  },
  { deep: true, immediate: true }
)

// 注意：文本到大纲的自动同步已被移除
// 原因：当从大纲生成文本时（commitOutline），会触发文本变化监听器，
// 导致从文本重新提取大纲树，覆盖掉 AI 生成的内容。
//
// 文本到大纲的同步应该只在以下情况发生：
// 1. 用户在编辑器中直接编辑文本（由编辑器组件内部处理）
// 2. 从外部文件加载文档时（由文档加载器处理）
//
// 在 Outline 视图中，大纲是数据源，文本是从大纲生成的，不应该反向同步。

// 防抖定时器，用于延迟 commitOutline 调用
let commitOutlineTimer: NodeJS.Timeout | null = null

watch(
  treeData,
  () => {
    if (suppressDocumentSync) return
    // 清除之前的定时器
    if (commitOutlineTimer) {
      clearTimeout(commitOutlineTimer)
    }
    // 使用防抖延迟提交，避免频繁触发（300ms）
    commitOutlineTimer = setTimeout(() => {
      commitOutlineTimer = null
      commitOutline()
    }, 300)
  },
  { deep: true }
)

const reset = () => {
  generated.value = false
  generatedText.value = ''
}

const cancelAllAiTasks = () => {
  try {
    clearAiTasks()
  } catch (_e) {
    // ignore
  } finally {
    // 清空所有ref的值
    rawstring.value = ''
    parallelChildren.value.forEach((ref) => {
      ref.value = ''
    })

    generateContentLoading.value = false
    generateChildrenContentLoading.value = false
    generateChildrenChildrenLoading.value = false
    generating.value = false
    workspace.unlockUI?.()
    eventBus.emit('show-warning', t('aiTask.taskCancelled2'))
  }
}

const move2Left = () => {
  const selected = selectedNode.value
  if (!selected) return
  const parent = searchParentNode(selected.path, treeData.value)
  const curNode = searchNode(selected.path, treeData.value)
  if (!parent || !curNode || !parent.children) return
  const index = parent.children.indexOf(curNode)

  if (direction.value === 'vertical') {
    // 纵向布局：左移 = 向前移动（index - 1）
    if (index > 0) {
      parent.children.splice(index, 1)
      parent.children.splice(index - 1, 0, curNode)
      reindexChildrenPaths(parent)
    }
  } else {
    // 横向布局：左移 = 向上移动（index - 1）
    if (index > 0) {
      parent.children.splice(index, 1)
      parent.children.splice(index - 1, 0, curNode)
      reindexChildrenPaths(parent)
    }
  }
}

const move2Right = () => {
  const selected = selectedNode.value
  if (!selected) return
  const parent = searchParentNode(selected.path, treeData.value)
  const curNode = searchNode(selected.path, treeData.value)
  if (!parent || !curNode || !parent.children) return
  const index = parent.children.indexOf(curNode)

  if (direction.value === 'vertical') {
    // 纵向布局：右移 = 向后移动（index + 1）
    if (index < parent.children.length - 1) {
      parent.children.splice(index, 1)
      parent.children.splice(index + 1, 0, curNode)
      reindexChildrenPaths(parent)
    }
  } else {
    // 横向布局：右移 = 向下移动（index + 1）
    if (index < parent.children.length - 1) {
      parent.children.splice(index, 1)
      parent.children.splice(index + 1, 0, curNode)
      reindexChildrenPaths(parent)
    }
  }
}

const changeNodeValue = () => {
  const selected = selectedNode.value
  if (!selected) return
  const curNode = searchNode(selected.path, treeData.value)
  if (!curNode) return
  curNode.title = currentChapterValue.value
  curNode.text = currentChapterContent.value
  syncChildrenFromNodeText(curNode)
  editValueDialogVisible.value = false
}

const resetScale = () => {
  currentScale.value = 1.0
  treeRef.value?.restoreScale()
}

// 缩放限制：最小30%，最大200%
const MIN_SCALE = 0.3
const MAX_SCALE = 2.0 //
// 缩放步长：每次缩放10%
const ZOOM_STEP = 0.1

// 维护当前的缩放比例
const currentScale = ref<number>(1.0)

const zoomIn = () => {
  if (currentScale.value >= MAX_SCALE) {
    return // 已达到最大缩放，不执行
  }
  // 计算新的缩放比例，但不超过最大值
  const newScale = Math.min(currentScale.value + ZOOM_STEP, MAX_SCALE)
  currentScale.value = newScale
  treeRef.value?.zoomIn()
}

const zoomOut = () => {
  if (currentScale.value <= MIN_SCALE) {
    return // 已达到最小缩放，不执行
  }
  // 计算新的缩放比例，但不低于最小值
  const newScale = Math.max(currentScale.value - ZOOM_STEP, MIN_SCALE)
  currentScale.value = newScale
  treeRef.value?.zoomOut()
}

// 以光标位置为中心的缩放
const zoomAtPoint = (deltaY: number, clientX: number, clientY: number) => {
  if (!treeRef.value) return

  // 获取 vue-tree 的 DOM 元素
  const treeElement = document.querySelector('.outline-tree-container') as HTMLElement
  if (!treeElement || !(treeElement instanceof Element)) return

  // 查找内部的滚动容器
  // vue-tree 通常会在内部有一个可滚动的容器
  let scrollContainer: HTMLElement | null = null

  // 尝试多种方式找到滚动容器
  const possibleContainers = [
    treeElement.querySelector('svg')?.parentElement,
    treeElement.querySelector('[style*="overflow"]') as HTMLElement,
    treeElement.querySelector('.vue-tree') as HTMLElement,
    treeElement
  ]

  for (const container of possibleContainers) {
    if (
      container &&
      container instanceof Element &&
      (container.scrollHeight > container.clientHeight ||
        container.scrollWidth > container.clientWidth)
    ) {
      scrollContainer = container as HTMLElement
      break
    }
  }

  if (!scrollContainer || !(scrollContainer instanceof Element)) {
    scrollContainer = treeElement
  }

  // 获取光标相对于滚动容器的位置
  try {
    const rect = scrollContainer.getBoundingClientRect()
    const pointX = clientX - rect.left
    const pointY = clientY - rect.top

    // 获取当前滚动位置
    const scrollLeft = scrollContainer.scrollLeft || 0
    const scrollTop = scrollContainer.scrollTop || 0

    // 计算光标在内容中的绝对位置（考虑滚动偏移）
    const contentX = scrollLeft + pointX
    const contentY = scrollTop + pointY

    // 确定缩放方向（向上滚动 = 放大，向下滚动 = 缩小）
    const isZoomIn = deltaY < 0

    // 检查缩放限制
    if (isZoomIn && currentScale.value >= MAX_SCALE) {
      return // 已达到最大缩放，不执行
    }
    if (!isZoomIn && currentScale.value <= MIN_SCALE) {
      return // 已达到最小缩放，不执行
    }

    // 执行缩放
    if (isZoomIn) {
      zoomIn()
    } else {
      zoomOut()
    }

    // 等待 DOM 更新后调整滚动位置
    // 使用 nextTick 和 requestAnimationFrame 确保缩放操作已完成
    nextTick(() => {
      requestAnimationFrame(() => {
        if (!scrollContainer || !(scrollContainer instanceof Element)) return
        try {
          // 重新获取容器（可能因为缩放而改变）
          const newRect = scrollContainer.getBoundingClientRect()
          const newPointX = clientX - newRect.left
          const newPointY = clientY - newRect.top

          // 计算新的滚动位置，使光标位置在内容中保持相对不变
          // 缩放后，内容尺寸变化，需要按比例调整滚动位置
          const newScrollLeft = contentX - newPointX
          const newScrollTop = contentY - newPointY

          // 设置新的滚动位置，确保不超出边界
          scrollContainer.scrollLeft = Math.max(
            0,
            Math.min(newScrollLeft, scrollContainer.scrollWidth - scrollContainer.clientWidth)
          )
          scrollContainer.scrollTop = Math.max(
            0,
            Math.min(newScrollTop, scrollContainer.scrollHeight - scrollContainer.clientHeight)
          )
        } catch (error) {
          // 如果getBoundingClientRect失败，忽略错误
          console.warn('Failed to adjust scroll position after zoom:', error)
        }
      })
    })
  } catch (error) {
    // 如果getBoundingClientRect或其他DOM操作失败，忽略错误
    console.warn('Failed to zoom at point:', error)
  }
}

// 处理滚轮缩放事件
const handleWheelZoom = (event: WheelEvent) => {
  // 检查是否按下了 Ctrl 键（Windows/Linux）或 Meta 键（Mac）
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault() // 阻止默认的滚动行为
    event.stopPropagation() // 阻止事件冒泡

    // 以光标位置为中心进行缩放
    zoomAtPoint(event.deltaY, event.clientX, event.clientY)
  }
}

// AI工具选择状态（null 表示未选择；再次点击已选工具会取消选择）
const selectedAiTool = ref<'generateChildren' | 'generateContent' | 'generateChildrenChildren' | 'generateChildrenContent' | null>(null)

// 切换 AI 工具：已选中则取消，否则选中；选中时折叠已展开的编辑节点面板
function toggleAiTool(tool: 'generateChildren' | 'generateContent' | 'generateChildrenChildren' | 'generateChildrenContent') {
  const wasSelected = selectedAiTool.value === tool
  selectedAiTool.value = wasSelected ? null : tool
  if (!wasSelected && selectedAiTool.value) {
  }
}


// 大纲树稳定 key：仅随文档与布局变化，避免切换 AI 工具时整树刷新导致回到初始位置
const outlineTreeKey = computed(() => `${activeDocument.value?.path ?? ''}-${direction.value}`)

// 节点展开状态
const expandedNodes = ref<Record<string, boolean>>({})

// AI配置对话框
const aiConfigDialogVisible = ref(false)
const aiConfig = reactive({
  temperature: 1.0,
  keywords: [] as string[],
  wordCount: undefined as number | undefined,
  userPrompt: ''
})

/** 用于生成提示词的关键词字符串（数组转空格分隔） */
function getKeywordsPromptString(): string {
  const kw = aiConfig.keywords
  if (Array.isArray(kw) && kw.length) return kw.join(' ')
  return ''
}

// 预设提示词
const presetPrompts = ref([
  { label: t('outline.aiConfig.preset.combineStructure'), value: '请结合文章结构，帮我完善这一段的内容' },
  { label: t('outline.aiConfig.preset.expand'), value: '帮我扩写' },
  { label: t('outline.aiConfig.preset.abridge'), value: '帮我精简内容，保留核心观点' },
  { label: t('outline.aiConfig.preset.polish'), value: '帮我润色，提升表达质量' },
  { label: t('outline.aiConfig.preset.detailed'), value: '生成详细内容，包含具体案例和数据支撑' },
  { label: t('outline.aiConfig.preset.professional'), value: '使用专业、准确的学术写作风格' },
  { label: t('outline.aiConfig.preset.concise'), value: '内容简洁精炼，突出重点' },
  { label: t('outline.aiConfig.preset.examples'), value: '添加具体案例和实际应用场景' },
  { label: t('outline.aiConfig.preset.theory'), value: '补充理论基础和背景知识' },
  { label: t('outline.aiConfig.preset.summary'), value: '生成总结性内容，概括要点' },
  { label: t('outline.aiConfig.preset.analysis'), value: '进行深入分析，提供多角度观点' },
  { label: t('outline.aiConfig.preset.comparison'), value: '添加对比分析，突出差异和特点' },
  { label: t('outline.aiConfig.preset.trends'), value: '分析发展趋势和未来展望' },
  { label: t('outline.aiConfig.preset.practice'), value: '提供实践建议和操作指南' },
  { label: t('outline.aiConfig.preset.custom'), value: '' }
])

const selectedPresetPrompt = ref('')

// 温度刻度：0 严谨 / 1 平衡 / 2 创意（默认 1 为平衡）
const temperatureMarks = computed(() => ({
  0: { label: t('outline.aiConfig.temperatureStrict') },
  1: { label: t('outline.aiConfig.temperatureBalance') },
  2: { label: t('outline.aiConfig.temperatureCreative') }
}))

// 目标字数：用普通输入框绑定字符串，同步到 aiConfig.wordCount
const wordCountInput = ref('')
function onWordCountInput(val: string) {
  const digits = val.replace(/\D/g, '')
  wordCountInput.value = digits
  const n = digits === '' ? undefined : parseInt(digits, 10)
  aiConfig.wordCount = n === undefined || isNaN(n) ? undefined : Math.min(999999, Math.max(0, n))
}

// AI 推荐关键词（根据当前节点标题与大纲生成）
const recommendedKeywords = ref<string[]>([])
const recommendedKeywordsLoading = ref(false)
const recommendedKeywordsOutputRef = ref('')

function onAiConfigDialogOpened() {
  recommendedKeywords.value = []
  wordCountInput.value = aiConfig.wordCount == null ? '' : String(aiConfig.wordCount)
  const node = selectedNode.value
  if (!node) return
  recommendedKeywordsLoading.value = true
  const outlineMarkdown = generateMarkdownFromOutlineTree(treeData.value)
  const prompt = generateOutlineSectionKeywordsPrompt(node.title || '', outlineMarkdown)
  generateWithSchema(
    OUTLINE_SECTION_KEYWORDS_SCHEMA,
    prompt,
    recommendedKeywordsOutputRef,
    { taskName: t('outline.aiConfig.recommendedKeywords') }
  )
    .then((result) => {
      recommendedKeywords.value = result.keywords || []
    })
    .catch(() => {
      recommendedKeywords.value = []
    })
    .finally(() => {
      recommendedKeywordsLoading.value = false
    })
}

function addRecommendedKeyword(keyword: string) {
  const kw = keyword.trim()
  if (!kw) return
  if (!aiConfig.keywords.includes(kw)) {
    aiConfig.keywords = [...aiConfig.keywords, kw]
  }
}

// 最后展开的节点 path，用于将该详细面板置于最上层
const lastExpandedNodePath = ref<string | null>(null)

// 切换节点展开/折叠；展开时同时折叠该节点的编辑框
const toggleNodeExpand = (nodePath: string) => {
  expandedNodes.value[nodePath] = !expandedNodes.value[nodePath]
  if (expandedNodes.value[nodePath]) {
    lastExpandedNodePath.value = nodePath
  } else if (lastExpandedNodePath.value === nodePath) {
    lastExpandedNodePath.value = null
  }
}

// 获取AI工具提示词
const getAiToolTip = (tool: string): string => {
  const toolTips: Record<string, string> = {
    'generateChildren': t('outline.generateChildChapter'),
    'generateContent': t('outline.generateContent'),
    'generateChildrenChildren': t('outline.generateChildrenChildren'),
    'generateChildrenContent': t('outline.generateChildrenContent')
  }
  return toolTips[tool] || ''
}

// 对话框标题：仅用打开时记录的 AI 工具，避免 Outline 因 selectedAiTool 变化而 re-render
const aiConfigDialogTitleForDisplay = ref(t('outline.aiConfig.title'))
watch(aiConfigDialogVisible, (visible) => {
  if (visible) aiConfigDialogTitleForDisplay.value = selectedAiTool.value ? t('outline.aiTool.' + selectedAiTool.value) : t('outline.aiConfig.title')
})
const aiConfigDialogTitle = computed(() => {
  if (!selectedAiTool.value) return t('outline.aiConfig.title')
  return t('outline.aiTool.' + selectedAiTool.value)
})

// 处理预设提示词选择
const handlePresetPromptChange = (value: string) => {
  const preset = presetPrompts.value.find(p => p.value === value)
  if (preset && preset.value) {
    aiConfig.userPrompt = preset.value
  }
}

// 处理AI配置确认
const handleAiConfigConfirm = () => {
  if (!selectedAiTool.value) {
    aiConfigDialogVisible.value = false
    return
  }

  const node = selectedNode.value
  if (!node) {
    aiConfigDialogVisible.value = false
    return
  }

  // 更新userPrompt
  userPrompt.value = aiConfig.userPrompt

  // 执行相应的AI操作
  if (selectedAiTool.value === 'generateChildren') {
    generateChildChapter()
  } else if (selectedAiTool.value === 'generateContent') {
    generateContent()
  } else if (selectedAiTool.value === 'generateChildrenChildren') {
    generateChildrenChildren()
  } else if (selectedAiTool.value === 'generateChildrenContent') {
    generateChildrenContent()
  }

  aiConfigDialogVisible.value = false
}

// 处理节点内容更新
const handleNodeContentUpdate = (nodePath: string, content: string) => {
  const node = searchNode(nodePath, treeData.value)
  if (node) {
    node.text = content
    syncChildrenFromNodeText(node)
    commitOutline()
  }
}

// 处理节点内容取消
const handleNodeContentCancel = (nodePath: string) => {
  // 可以在这里添加取消逻辑
}

const handleNodeButtonClick = (node: DocumentOutlineNode) => {
  selectedNode.value = node
  if (selectedAiTool.value) {
    aiConfig.temperature = 1.0
    aiConfig.keywords = []
    aiConfig.wordCount = undefined
    wordCountInput.value = ''
    aiConfig.userPrompt = userPrompt.value || ''
    selectedPresetPrompt.value = ''
    aiConfigDialogVisible.value = true
  }
}

const openNodeContextMenu = (e: MouseEvent, node: DocumentOutlineNode) => {
  if (node.path === 'dummy') return
  selectedNode.value = node
  nodeContextMenuPath.value = node.path
  nodeContextMenuPosition.value = { x: e.clientX, y: e.clientY }
}

const closeNodeContextMenu = () => {
  nodeContextMenuPath.value = null
  nodeContextMenuPosition.value = null
}

const onNodeContextAction = (action: 'moveLeft' | 'moveRight' | 'addChild' | 'edit' | 'delete') => {
  switch (action) {
    case 'moveLeft': move2Left(); break
    case 'moveRight': move2Right(); break
    case 'addChild': addChildNode(); break
    case 'edit': editNode(); break
    case 'delete': deleteNode(); break
  }
  closeNodeContextMenu()
}

const handleNodeContextMenuClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (nodeContextMenuPath.value && !target.closest('.outline-node-context-menu')) {
    closeNodeContextMenu()
  }
}

// 供子组件通过 inject 使用，避免 Outline 模板依赖 selectedAiTool 导致切换工具时整树 re-render、位置重置
provide('outlineSelectedAiTool', selectedAiTool)
provide('outlineToggleAiTool', toggleAiTool)
provide('outlineFormatTitle', formatTitle)
provide('outlineHandleNodeButtonClick', handleNodeButtonClick)

const addChildNode = () => {
  const node = selectedNode.value
  if (!node) return
  const cur_node = searchNode(node.path, treeData.value)
  if (!cur_node) return
  const newNode = {
    title: '新子节点',
    text: '',
    title_level: cur_node.title_level + 1,
    path:
      cur_node.path +
      (cur_node.path !== '' ? '.' : '') +
      (cur_node.children && cur_node.children.length > 0 ? cur_node.children.length + 1 : 1),
    children: []
  }
  cur_node.children.push(newNode)
  closeNodeContextMenu()
}

const editNode = () => {
  const node = selectedNode.value
  if (!node) return
  const cur_node = searchNode(node.path, treeData.value)
  if (!cur_node) return
  editValueDialogVisible.value = true
  currentChapterValue.value = cur_node.title
  currentChapterContent.value = cur_node.text
}

const deleteNode = () => {
  ElMessageBox.confirm(t('outline.confirmDeleteChapter'), t('outline.warning'), {
    confirmButtonText: t('outline.confirm'),
    cancelButtonText: t('outline.cancel'),
    type: 'warning'
  })
    .then(() => {
      const node = selectedNode.value
      if (!node) return
      const parent = searchParentNode(node.path, treeData.value)
      const cur_node = searchNode(node.path, treeData.value)
      if (!cur_node) return
      if (parent === null) {
        ElNotification({
          title: t('outline.error'),
          message: t('outline.cannotDeleteRoot'),
          type: 'error'
        })
        return
      }
      if (parent) {
        removeNode(parent, cur_node)
      }
      closeNodeContextMenu()
      ElNotification({
        title: t('outline.message'),
        message: t('outline.deleteSuccess'),
        type: 'info'
      })
    })
    .catch(() => {})
}
const generateChildChapterLoading = ref(false)
const pendingAccept = ref(false)
const backupChildren = ref<DocumentOutlineNode[] | null>(null)
const backupContent = ref<string>('')
const generateChildChapter = async () => {
  workspace.lockUI?.()
  generateChildChapterLoading.value = true
  generating.value = true
  rawstring.value = ''
  try {
    const node = selectedNode.value
    if (!node) throw new Error('未选择节点')
    const currentNode = searchNode(node.path, treeData.value)
    if (!currentNode) throw new Error('节点不存在')

    const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'
    rawstring.value = ''; // 清空之前的内容
    
    // 构建增强的用户提示词
  let enhancedPrompt = aiConfig.userPrompt || userPrompt.value || ''
  const kwStr = getKeywordsPromptString()
  if (kwStr) enhancedPrompt += `\n关键词：${kwStr}`

  try {
    const newChildren = await generateChildNodesUtil(
        currentNode,
        treeData.value,
        enhancedPrompt,
        undefined, // signal
        docFormat,
        rawstring, // 传入rawstring ref，用于实时显示原始内容
        undefined, // onUpdate
        true, // enableFallback
        aiConfig.temperature !== undefined ? aiConfig.temperature : undefined // 传递温度参数
      );
      
      // rawstring.value 已经通过ref实时更新了，这里只在最终显示格式化后的JSON
      if (!rawstring.value) {
        rawstring.value = JSON.stringify(newChildren, null, 2)
      }
      backupChildren.value = currentNode.children ? [...currentNode.children] : []
      currentNode.children = [...currentNode.children, ...newChildren]
      pendingAccept.value = true
    } catch (err) {
      logger.warn('任务失败或取消：', err)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error('大纲 JSON 解析失败', e)
    eventBus.emit('show-error', t('outline.generateChildRetryFail', { error: message }))
  } finally {
    generateChildChapterLoading.value = false
    generating.value = false
    workspace.unlockUI?.()
  }
}

const removeNode = (parent: DocumentOutlineNode, node: DocumentOutlineNode) => {
  if (!parent.children) return
  const index = parent.children.indexOf(node)
  if (index !== -1) {
    parent.children.splice(index, 1)
  } else {
    parent.children.forEach((child) => removeNode(child, node))
  }
}

// cleanRawContent 函数已迁移到 outline-ai-utils.ts，使用导入的版本
function reindexChildrenPaths(parent: DocumentOutlineNode) {
  if (!parent.children) return
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i]
    const base = parent.path ? parent.path + '.' : ''
    child.path = base + (i + 1)
    child.title_level = parent.title_level + 1
    if (child.children && child.children.length > 0) {
      reindexChildrenPaths(child)
    }
  }
}
const acceptChange = () => {
  backupChildren.value = null
  backupContent.value = ''
  rawstring.value = ''
  pendingAccept.value = false
}
const discardChange = () => {
  const node = selectedNode.value
  if (!node) return
  const curNode = searchNode(node.path, treeData.value)
  if (!curNode) return
  if (Array.isArray(backupChildren.value)) {
    curNode.children = [...backupChildren.value]
    backupChildren.value = null
  }
  if (backupContent.value) {
    curNode.text = backupContent.value
    backupContent.value = ''
  }
  pendingAccept.value = false
}

// 处理窗口大小改变，重新检查文本截断状态
const handleResize = () => {
  recheckTextTruncation()
}

onMounted(async () => {
  // 首先加载布局方向设置，确保在渲染vue-tree之前方向已确定
  await loadLayoutDirection()

  // 确保初始状态同步：如果当前视图是outline，同步大纲树
  const doc = activeDocument.value
  if (doc) {
    const currentView = doc.lastView ?? 'editor'
    if (currentView === 'outline') {
      lastKnownView.value = currentView
      syncOutlineToTreeData(doc.outline)
    }
  }

  // 等待 DOM 渲染完成后初始检查文本截断状态
  nextTick(() => {
    recheckTextTruncation()
  })

  // 添加窗口大小改变监听器
  window.addEventListener('resize', handleResize)
  document.addEventListener('click', handleNodeContextMenuClickOutside)
})

// 组件卸载时移除事件监听器并清理定时器
onUnmounted(() => {
  document.removeEventListener('click', handleNodeContextMenuClickOutside)
  window.removeEventListener('resize', handleResize)

  // 清理所有定时器
  if (commitOutlineTimer) {
    clearTimeout(commitOutlineTimer)
    commitOutlineTimer = null
  }
  if (dropPreviewThrottleTimer) {
    clearTimeout(dropPreviewThrottleTimer)
    dropPreviewThrottleTimer = null
  }
  if (recheckTextTruncationTimer) {
    clearTimeout(recheckTextTruncationTimer)
    recheckTextTruncationTimer = null
  }
})
</script>

<style scoped lang="less">
.outline-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 设置主题背景色 */
  background-color: v-bind('themeState.currentTheme.background');
  /* 创建新的层叠上下文，隔离渲染，防止影响其他组件 */
  isolation: isolate;
  /* 使用 containment 限制重绘范围 */
  contain: layout style;
}

/* 拖拽时进一步优化，防止影响其他组件 */
.outline-page.is-dragging {
  /* 禁用所有过渡效果 */
  --transition-disabled: none;
  /* 提示浏览器优化 */
  will-change: contents;
  /* 更严格的 containment */
  contain: strict layout style paint;
}

/* 标题格式化对话框：固定宽度 480px，窗口变窄时限制最大宽度不溢出 */
.format-title-dialog {
  width: 480px !important;
  max-width: calc(100vw - 24px) !important;
}

.outline-page > .container {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  /* 使用 containment 限制重绘范围 */
  contain: layout style;
  /* 创建新的层叠上下文 */
  isolation: isolate;
}

.outline-tree-container {
  position: relative;
  width: 100%;
  height: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  /* 使用严格的 CSS containment，限制重绘和重排范围，防止影响其他组件 */
  contain: strict;
  /* 创建新的层叠上下文，隔离渲染 */
  isolation: isolate;
  /* 使用 GPU 加速 */
  transform: translateZ(0);
  will-change: scroll-position;
}

/* 拖拽时进一步优化性能 */
.outline-tree-container.is-dragging {
  /* 拖拽时禁用所有过渡效果 */
  --transition-disabled: none;
  /* 提示浏览器优化滚动和重绘 */
  will-change: scroll-position, transform;
  /* 使用更激进的 containment */
  contain: strict layout style paint;
}

.el-scrollbar__wrap {
  overflow-x: hidden;
}

.generate-preview {
  position: absolute;
  max-width: 500px;
  width: 500px;
  max-height: 70vh;
  opacity: 0.95;
  z-index: 10000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.generate-preview-scrollbar {
  flex: 1;
  min-height: 0;
}

.generate-preview-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.node-edit-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: fixed;
  margin-top: 100%;
  width: fit-content;
  transition:
    width 0.8s ease,
    all 0.3s ease;
  z-index: 10;
  border-radius: 18px !important;
}
.node-edit-box.aero-div {
  border-radius: 18px !important;
}
/* node-edit-box 内按钮：圆角矩形且长宽相等（正方形），缩小 20% */
.node-edit-box :deep(.el-button),
.node-edit-box :deep(.aero-btn) {
  border-radius: 10px !important;
  width: 32px !important;
  min-width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
.node-edit-box :deep(.el-button.is-circle),
.node-edit-box :deep(.aero-btn.is-circle) {
  border-radius: 50% !important;
}

.button-group {
  display: flex;
  justify-content: space-around;
  width: fit-content;
  transition: all 0.3s;
  border-radius: 18px;
}

/* 大纲页内按钮：圆角矩形（约 10px），圆形按钮保持 50% */
.outline-page .aero-btn:not(.is-circle) {
  border-radius: 10px !important;
}
.outline-page .aero-btn.is-circle {
  border-radius: 50% !important;
}
/* bottom-menu 按钮：与 AI 工具按钮一致 44×38，圆角矩形 */
.outline-page .bottom-menu .el-button {
  border-radius: 10px !important;
  width: 44px !important;
  min-width: 44px !important;
  height: 38px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
/* 生成预览弹窗内按钮：圆角正方形，与界面其他 UI 一致 */
.outline-page .generate-preview .generate-preview-btn-square {
  width: 36px !important;
  min-width: 36px !important;
  height: 36px !important;
  padding: 0 !important;
  border-radius: 10px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
.outline-page .generate-preview .el-button.is-circle {
  border-radius: 50% !important;
}
.outline-tree-container :deep(.el-button) {
  border-radius: 10px !important;
}
.outline-tree-container :deep(.el-button.is-circle) {
  border-radius: 50% !important;
}

.action-buttons {
  display: flex;
  /* 水平布局 */
  // justify-content: space-around; /* 按钮间隔均匀 */
  align-items: start;
  width: 100%;
  /* 满宽布局 */
}

.inline-input {
  width: 500px;
  /* 限制最大宽度 */
}

.controls {
  margin-bottom: 20px;
}

.tree-node {
  margin-bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 18px !important;
  padding: 8px 16px;
  margin: 10px;
  cursor: pointer;
  transition: background-color 0.3s, filter 0.15s ease;
  max-width: 200px;
  max-height: 60px;
  overflow: hidden;
  box-sizing: border-box;
  contain: layout style paint;
  isolation: isolate;
  -webkit-tap-highlight-color: transparent;
}

/* mousedown 时颜色变化减弱，仅轻微变暗 */
.tree-node:active {
  filter: brightness(0.97);
}
.outline-tree-container :deep(.tree-node:active) {
  filter: brightness(0.97);
}

/* 节点展开按钮：小尺寸、扁平、圆角更大 */
.tree-node-expand-btn {
  flex-shrink: 0;
  margin-left: 4px;
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.15);
  color: v-bind('themeState.currentTheme.textColor');
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

.tree-node-expand-btn:hover:not(:disabled) {
  background: rgba(128, 128, 128, 0.28);
}

.tree-node-expand-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tree-node-expand-btn .el-icon {
  font-size: 12px;
}

/* 拖拽时禁用所有过渡和动画，减少重绘 */
.outline-page.is-dragging .tree-node,
.outline-tree-container.is-dragging .tree-node {
  transition: none !important;
  animation: none !important;
  /* 使用 GPU 加速 */
  transform: translateZ(0);
  will-change: transform;
}

/* 纵向布局的拖拽高亮样式 */
.tree-node.drop-before {
  box-shadow: inset 4px 0 0 #409eff;
  /* 使用 GPU 加速 */
  transform: translateZ(0);
  will-change: box-shadow;
}
.tree-node.drop-after {
  box-shadow: inset -4px 0 0 #67c23a;
  transform: translateZ(0);
  will-change: box-shadow;
}
.tree-node.drop-inside {
  outline: 2px dashed rgba(103, 194, 58, 0.6);
  border-radius: 18px;
  transform: translateZ(0);
  will-change: outline;
}
.tree-node.drop-parent {
  box-shadow: inset 0 4px 0 #e6a23c;
  border-radius: 18px;
  transform: translateZ(0);
  will-change: box-shadow;
}

/* 横向布局的拖拽高亮样式 */
.outline-page[data-direction='horizontal'] :deep(.tree-node.drop-before) {
  box-shadow: inset 0 4px 0 #409eff;
}
.outline-page[data-direction='horizontal'] :deep(.tree-node.drop-after) {
  box-shadow: inset 0 -4px 0 #67c23a;
}
.outline-page[data-direction='horizontal'] :deep(.tree-node.drop-inside) {
  outline: 2px dashed rgba(103, 194, 58, 0.6);
  border-radius: 18px;
}
.outline-page[data-direction='horizontal'] :deep(.tree-node.drop-parent) {
  box-shadow: inset 4px 0 0 #e6a23c;
  border-radius: 18px;
}

.tree-node-text {
  display: -webkit-box;
  /* 使用 webkit 的 box 模型以支持多行截断 */
  font-size: 14px;
  /* 设置默认字体大小 */
  color: v-bind('themeState.currentTheme.textColor');
  /* 设置文本颜色 - 使用主题文字颜色 */
  flex: 1;
  /* 占据剩余空间 */
  min-width: 0;
  /* 允许收缩 */
  overflow: hidden;
  /* 隐藏溢出内容 */
  text-overflow: ellipsis;
  /* 文本溢出时显示省略号 */
  word-break: break-word;
  /* 允许在单词内换行，处理长单词 */
  line-height: 1.4;
  /* 设置行高 */
  -webkit-line-clamp: 2;
  line-clamp: 2;
  /* 限制显示2行 */
  -webkit-box-orient: vertical;
  /* 垂直方向排列 */
}

.dialog-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}

/* 底部菜单：覆盖 aero-div 圆角，使用更大圆角 */
.outline-page .bottom-menu.aero-div,
.bottom-menu {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%) !important;
  align-items: center;
  display: flex;
  gap: 10px;
  z-index: 1000;
  padding: 6px 10px;
  border-radius: 18px !important;
  box-sizing: border-box;
  width: fit-content;
  transition:
    backdrop-filter 0.3s ease,
    box-shadow 0.3s ease !important;

  &:hover {
    transform: translateX(-50%) !important;
  }
}

/* 左上角AI工具工具栏：标题与按钮左对齐，容器固定宽度，仅选中按钮向右溢出且按钮宽度随内容展开 */
/* 覆盖 aero-div 的 padding，保证标题和按钮在 44px 宽列内左对齐，仅选中按钮向右溢出 */
.ai-toolbar.aero-div {
  padding: 10px 0 !important;
}
.ai-toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  z-index: 1000;
  padding: 10px 0;
  border-radius: 18px;
  box-sizing: border-box;
  width: 44px;
  min-width: 44px;
  overflow: visible;
}

/* tooltip 触发器不限制宽度（仅格式化标题等仍用 tooltip 的按钮） */
.ai-toolbar :deep(.el-tooltip__trigger) {
  display: block;
  width: fit-content;
}

.ai-toolbar-btn {
  width: 44px;
  height: 38px;
  margin: 0;
  padding: 0;
  flex-shrink: 0;
  border-radius: 10px !important;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease,
    max-width 0.45s ease,
    min-width 0.45s ease,
    width 0.45s ease,
    padding 0.45s ease;
}

.ai-toolbar-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.ai-toolbar-btn--selected,
.ai-toolbar-btn:active {
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

/* 按下时圆角与选中态一致，避免视觉跳动 */
.ai-toolbar :deep(.el-button:active) {
  border-radius: 10px !important;
}

/* 未选中的 AI 工具按钮：黑白灰配色，浅色主题用浅灰、深色主题用深灰 */
.ai-toolbar :deep(.el-button.ai-toolbar-btn--expandable:not(.ai-toolbar-btn--selected)) {
  background-color: var(--el-fill-color-light) !important;
  border-color: var(--el-border-color-lighter) !important;
  color: var(--el-text-color-regular) !important;
}
.ai-toolbar :deep(.el-button.ai-toolbar-btn--expandable:not(.ai-toolbar-btn--selected):hover) {
  background-color: var(--el-fill-color) !important;
  border-color: var(--el-border-color) !important;
  color: var(--el-text-color-primary) !important;
}

/* 收起态：带过渡时长，这样从收起→展开时会有动画（过渡由“变化前”的规则决定） */
.ai-toolbar :deep(.el-button) {
  width: 44px !important;
  height: 38px !important;
  min-width: 44px !important;
  max-width: 44px !important;
  margin: 0 !important;
  padding: 0 0 0 0 !important;
  flex-shrink: 0;
  border-radius: 10px !important;
  overflow: hidden;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease,
    max-width 0.45s ease,
    min-width 0.45s ease,
    width 0.45s ease,
    padding 0.45s ease;
}

/* 展开态：与收起态使用相同的 transition 时长，展开时才有动画（若这里写 0s 会覆盖掉过渡导致完全没动画） */
.ai-toolbar :deep(.el-button.ai-toolbar-btn--expanded),
.ai-toolbar :deep(.el-button.ai-toolbar-btn--expandable:hover) {
  width: auto !important;
  min-width: 44px !important;
  max-width: 220px !important;
  padding: 0 12px 0 10px !important;
  flex-shrink: 0;
  justify-content: flex-start !important;
  gap: 8px;
  overflow: visible !important;
  box-sizing: border-box !important;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease,
    max-width 0.45s ease,
    min-width 0.45s ease,
    width 0.45s ease,
    padding 0.45s ease;
}
.ai-toolbar :deep(.el-button .el-icon) {
  flex-shrink: 0;
  margin: 0;
}
/* 图标尺寸：用 :deep() 穿透到子组件（OutlineAiToolbar、OutlineNodeActionButton）内的 img */
:deep(.ai-toolbar-btn__icon) {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: block;
  object-fit: contain;
}
:deep(.node-action-btn__icon) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: block;
  object-fit: contain;
  vertical-align: middle;
}
.node-edit-box__icon {
  width: 14px;
  height: 14px;
  display: block;
  object-fit: contain;
}
.ai-toolbar-btn--expanded,
.ai-toolbar-btn--expandable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 未选中且未 hover 时：只显示图标，文字不占位、不显示（无过渡，避免 icon/文字 从左向右滑动） */
.ai-toolbar :deep(.el-button.ai-toolbar-btn--expandable:not(:hover):not(.ai-toolbar-btn--expanded) .ai-toolbar-btn__label) {
  max-width: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  min-width: 0 !important;
  transition: none !important;
}
/* 选中或 hover 时：文字直接显示，无滑动过渡 */
.ai-toolbar :deep(.el-button.ai-toolbar-btn--expanded .ai-toolbar-btn__label),
.ai-toolbar :deep(.el-button.ai-toolbar-btn--expandable:hover .ai-toolbar-btn__label) {
  max-width: 200px !important;
  opacity: 1 !important;
  transition: none !important;
}
.ai-toolbar :deep(.ai-toolbar-btn__label) {
  margin-left: 0;
  white-space: nowrap;
  font-size: 13px;
  display: inline-block;
  vertical-align: middle;
}

/* 底部直接操作按钮（如格式化标题）：与未选中 AI 工具按钮同风格（黑白灰），同尺寸 44×38，顶边自动撑满到底部 */
.ai-toolbar-btn--action {
  margin-top: auto;
}
.ai-toolbar :deep(.el-button.ai-toolbar-btn--action) {
  width: 44px !important;
  min-width: 44px !important;
  height: 38px !important;
  max-width: 44px !important;
  background-color: var(--el-fill-color-light) !important;
  border-color: var(--el-border-color-lighter) !important;
  color: var(--el-text-color-regular) !important;
}
.ai-toolbar :deep(.el-button.ai-toolbar-btn--action:hover) {
  background-color: var(--el-fill-color) !important;
  border-color: var(--el-border-color) !important;
  color: var(--el-text-color-primary) !important;
}

/* 节点操作按钮：选中 AI 工具时仅用 success 颜色区分，边距/大小/阴影与普通节点操作按钮一致，不再叠加额外阴影 */

/* vue3-tree-chart 的 .node-slot 是每个节点的容器；含详细面板的 slot 必须最上层且不裁剪 */
.outline-tree-container :deep(.node-slot:has(> .detailed-node-wrapper)) {
  z-index: 10000;
  position: relative;
  overflow: visible;
}

.outline-tree-container :deep(.node-slot:has(> .detailed-node-wrapper.detailed-node-wrapper--top)) {
  z-index: 10001;
}

/* 树节点层级压低，圆角与 .tree-node 一致 */
.outline-tree-container :deep(.tree-node) {
  position: relative;
  z-index: 1;
  border-radius: 18px !important;
}

/* 详细节点面板外层：参与排版、替代 tree-node 的同一 slot */
.detailed-node-wrapper {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.detailed-node-wrapper--top {
  z-index: 2;
}

/* 详细节点面板（内联显示） */
.detailed-node-inline,
.outline-tree-container :deep(.detailed-outline-node) {
  position: relative;
  z-index: 1;
}

.detailed-node-inline {
  width: 100%;
  max-width: 600px;
  margin: 0;
}

.generate-preview-actions {
  display: flex;
  gap: 8px;
  padding: 12px 0 0;
  margin-top: 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
}

.generate-preview-content {
  white-space: pre-wrap;
  word-break: break-word;
  padding: 8px 0;
}

/* 配置提示文字 */
/* AI 配置对话框：Tailwind 风格、科技感 */
.ai-config-dialog :deep(.el-dialog__body) {
  padding: 16px 20px;
}
.ai-config-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ai-config-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ai-config-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.ai-config-temperature-slider {
  margin: 0;
}
.ai-config-temperature-slider :deep(.el-slider__marks-text) {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ai-config-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0;
  line-height: 1.4;
}
.ai-config-keywords-input {
  width: 100%;
}
.ai-config-keywords-input :deep(.keyword-input) {
  width: 100%;
}
.ai-config-recommended {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  width: 100%;
}
.ai-config-recommended-title {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.ai-config-recommended-text {
  color: var(--el-text-color-secondary);
}
.ai-config-recommended-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.ai-config-recommended-tag {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  flex-shrink: 0;
}
.ai-config-recommended-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}
.ai-config-user-prompt {
  width: 100%;
}

.config-hint {
  font-size: 12px;
  color: rgba(145, 145, 145, 0.8);
  margin-top: 4px;
}

/* 节点右键菜单（样式参考 SessionList.vue） */
.outline-node-context-menu.item-menu-context {
  position: fixed;
  z-index: 1002;
  top: auto;
  right: auto;
  width: max-content;
  max-width: 280px;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid v-bind('nodeContextMenuStyle.borderColor');
  background-color: v-bind('nodeContextMenuStyle.backgroundColor');
  color: v-bind('nodeContextMenuStyle.color');
  display: flex;
  flex-direction: column;
}

.outline-node-context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 8px 10px;
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s ease;
  width: 100%;
  color: inherit;
}

.outline-node-context-menu__item:hover {
  background-color: rgba(64, 158, 255, 0.16);
}

.outline-node-context-menu__item.danger {
  color: #f56c6c;
}

.outline-node-context-menu__item.danger:hover {
  background-color: rgba(245, 108, 108, 0.18);
}

.outline-node-context-menu__icon {
  font-size: 14px;
  flex-shrink: 0;
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

<!-- 全局样式：拖拽时优化性能，防止影响其他组件 -->
<style lang="less">
/* 拖拽时禁用其他组件的动画，防止画面撕裂 */
body.outline-dragging * {
  /* 禁用所有过渡和动画，减少重绘 */
  transition: none !important;
  animation: none !important;
  /* 提示浏览器优化渲染 */
  will-change: auto;
}

/* 但保留必要的交互元素 */
body.outline-dragging input,
body.outline-dragging textarea,
body.outline-dragging button:not(.tree-node) {
  transition:
    background-color 0.1s,
    border-color 0.1s;
}
</style>
