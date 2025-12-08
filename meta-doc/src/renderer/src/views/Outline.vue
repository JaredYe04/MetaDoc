<template>
  <div class="outline-page" :data-direction="direction">
    <WorkspaceTabs
      closable
      @update:activeId="handleTabChange"
      @close="handleCloseTab"
    />
  <div class="container">
    <el-scrollbar class="aero-div generate-preview" v-if="generating || pendingAccept" :style="{
      backgroundColor: themeState.currentTheme.background, top: position.top + 'px',
      left: position.left + 'px',
    }" @mousedown.stop="startDrag">
      <div class="noselect-display">
        <h2 v-if="generating">
          {{ $t('outline.generating') }}
          <el-tooltip :content="$t('outline.cancelTasks')" placement="top">
            <el-button type="danger" plain circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
              @click.stop="cancelAllAiTasks">
              <el-icon style="font-size: 14px">
                <CloseBold />
              </el-icon>
            </el-button>
          </el-tooltip>
        </h2>
        <!-- <h3 v-if="generateChildrenContentLoading">{{ $t('outline.generatingFor') }}:{{ nodeBeingProcessed }}</h3> -->
        <div v-if="generateChildrenContentLoading">
          <div v-for="(item, index) in parallelChildren" :key="index">
            <!-- <h3>{{ $t('outline.generatingFor') }}:{{ item.title }}</h3> -->
            <div v-if="item.value">{{ item.value }}</div>
          </div>
        </div>
        <div v-if="generateChildrenChildrenLoading">
          <div v-for="(item, index) in parallelChildren" :key="index">
            <!-- <h3>{{ $t('outline.generatingFor') }}:{{ item.title }}</h3> -->
            <div v-if="item.value">{{ item.value }}</div>
          </div>
        </div>
        <h2 v-if="pendingAccept">{{ $t('outline.generationDone') }}
          <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
            @click.stop="acceptChange">
            <el-icon style="font-size: 14px">
              <Check />
            </el-icon>
          </el-button>
          <el-button type="danger" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
            @click.stop="discardChange" :loading="generateChildChapterLoading">
            <el-icon style="font-size: 14px" v-if="!generateChildChapterLoading">
              <Close />
            </el-icon>
          </el-button>
        </h2>
        <div>
          {{ rawstring }}
        </div>

      </div>
    </el-scrollbar>

    <vue-tree
      ref="treeRef"
      style="width: 100%; height: 80vh; border: 1px solid gray;"
      :style="{ backgroundColor: themeState.currentTheme.outlineBackground, marginBottom: '96px' }"
      :dataset="treeData"
      :config="treeConfig"
      :direction="direction"
      link-style="straight"
      @node-click="handleNodeClick"
      @drag-node-end="handleNodeDrag"
    >


      <template #node="{ node, collapsed }" :style="{ backgroundColor: themeState.currentTheme.outlineNode }">
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
        >
          {{ node.title }}
        </div>
        <el-tooltip :content="$t('outline.editNode')" placement="top">
          <el-button size="small" type="text" class="aero-btn" circle @click.stop="handleNodeButtonClick(node)"
            v-if="node.path !== 'dummy'" :disabled="pendingAccept || generating">
            <el-icon>
              <More />
            </el-icon>
          </el-button>
        </el-tooltip>
        <div v-if="dialogVisible[node.path]" class="aero-div node-edit-box" @click.stop @mousemove.stop @mousedown.stop
          @mouseup.stop>
          <div>
            <div class="button-group" v-if="!nodeMenuToggle">
              <el-tooltip :content="direction === 'vertical' ? $t('outline.moveLeft') : $t('outline.moveUp')" placement="top">
                <el-button type="info" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="move2Left">
                  <el-icon style="font-size: 14px">
                    <ArrowLeftBold v-if="direction === 'vertical'" />
                    <ArrowUpBold v-else />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.addChild')" placement="top">
                <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="addChildNode">
                  <el-icon style="font-size: 14px">
                    <Plus />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.editContent')" placement="top">
                <el-button type="primary" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="editNode">
                  <el-icon style="font-size: 14px">
                    <Edit />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.delete')" placement="top">
                <el-button type="danger" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="deleteNode">
                  <el-icon style="font-size: 14px">
                    <Delete />
                  </el-icon>
                </el-button>
              </el-tooltip>

              <el-tooltip :content="direction === 'vertical' ? $t('outline.moveRight') : $t('outline.moveDown')" placement="top">
                <el-button type="info" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="move2Right">
                  <el-icon style="font-size: 14px">
                    <ArrowRightBold v-if="direction === 'vertical'" />
                    <ArrowDownBold v-else />
                  </el-icon>
                </el-button>
              </el-tooltip>

            </div>
            <div class="button-group" v-if="nodeMenuToggle && !pendingAccept">
              <el-tooltip :content="$t('outline.generateContent')" placement="top">
                <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  :loading="generateContentLoading" @click.stop="generateContent" :disabled="generating">
                  <el-icon style="font-size: 14px" v-if="!generateContentLoading">
                    <EditPen />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.generateChildChapter')" placement="top">
                <el-button type="primary" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="generateChildChapter" :loading="generateChildChapterLoading" :disabled="generating">
                  <el-icon style="font-size: 14px" v-if="!generateChildChapterLoading">
                    <Finished />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.generateChildrenContent')" placement="top">
                <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="generateChildrenContent" :loading="generateChildrenContentLoading"
                  :disabled="generating">
                  <el-icon style="font-size: 14px" v-if="!generateChildrenContentLoading">
                    <Download />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.generateChildrenChildren')" placement="top">
                <el-button type="primary" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="generateChildrenChildren" :loading="generateChildrenChildrenLoading"
                  :disabled="generating">
                  <el-icon style="font-size: 14px" v-if="!generateChildrenChildrenLoading">
                    <Rank />
                  </el-icon>
                </el-button>
              </el-tooltip>
            </div>
            <PromptTextarea 
              v-if="nodeMenuToggle && !pendingAccept"
              v-model="userPrompt"
              :disabled="generating"
              :placeholder="t('outline.userPromptPlaceholder')"
              :autosize="{ minRows: 3 }"
              max-height="10vh"
              height="8vh"
            />

            <div class="button-group" v-if="pendingAccept">
              <el-tooltip :content="$t('outline.accept')" placement="top">
                <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="acceptChange">
                  <el-icon style="font-size: 14px">
                    <Check />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.reject')" placement="top">
                <el-button type="danger" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="discardChange" :loading="generateChildChapterLoading">
                  <el-icon style="font-size: 14px" v-if="!generateChildChapterLoading">
                    <Close />
                  </el-icon>
                </el-button>
              </el-tooltip>
            </div>
            <!-- 普通菜单按钮 -->


          </div>
        </div>
      </template>

    </vue-tree>
    <el-dialog v-model="formatTitleDialogVisible" :title="$t('outline.formatTitleWizard')" width="30%">
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
    <div class="bottom-menu aero-div">
      <el-tooltip :content="direction === 'vertical' ? $t('outline.switchToHorizontal') : $t('outline.switchToVertical')" placement="top">
        <el-button type="info" circle @click="toggleLayout">
          <el-icon>
            <Sort />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.zoomIn')" placement="top">
        <el-button type="success" circle @click="zoomIn">
          <el-icon>
            <Plus />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.zoomOut')" placement="top">
        <el-button type="warning" circle @click="zoomOut">
          <el-icon>
            <Minus />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.reset')" placement="top">
        <el-button type="info" circle @click="resetScale">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.formatTitle')" placement="top">
        <el-button type="warning" circle @click="formatTitle">
          <el-icon style="width: 1em; height: 1em;">
            T
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.openAiAssistant')" placement="top">
        <el-button :type="nodeMenuToggle ? 'primary' : 'danger'" circle @click="nodeMenuToggle = !nodeMenuToggle"
          :disabled="generating || pendingAccept">
          <el-icon style="width: 1em; height: 1em;">
            AI
          </el-icon>

        </el-button>
      </el-tooltip>
    </div>

  </div>
</div>
</template>
<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted, type Ref } from 'vue';
import { ElButton, ElDialog, ElMessageBox, ElNotification } from 'element-plus'; // 引入 Element Plus 组件
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue';
import PromptTextarea from '../components/base/PromptTextarea.vue';
import { tabs, useWorkspace } from '../stores/workspace';
import eventBus, { getWindowType } from '../utils/event-bus.js';
import '../assets/aero-div.css';
import '../assets/aero-btn.css';
import "../assets/aero-input.css";
import { MdEditor, type Themes } from 'md-editor-v3';
import { Plus, Edit, Delete, More, Minus, ArrowLeftBold, ArrowRightBold, ArrowUpBold, ArrowDownBold, Finished, EditPen, Checked, Close, Check, Download, Rank, CloseBold, Sort } from '@element-plus/icons-vue';
import type { DocumentOutlineNode } from '../../../types';
import { TREE_NODE_SCHEMA, DEFAULT_OUTLINE_TREE } from '../constants/document';
import { searchNode, searchParentNode } from '../utils/outline-helpers';
import { adjustTitleIndex, adjustTitleLevel, removeTextFromOutline, generateMarkdownFromOutlineTree } from '../utils/md-utils.js';
import { removeTitleIndex } from '../utils/regex-utils.js';
import { expandTreeNodePrompt, generateContentPrompt, generateParentNodeContentPrompt, outlineChangePrompt } from '../utils/prompts';

import { themeState } from '../utils/themes.js';
import { extractOuterJsonString } from '../utils/regex-utils.js';
import { getOutlineAdapter } from '../utils/outline-adapters';
import '../assets/noselect-display.css';
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask, clearAiTasks } from '../utils/ai_tasks.ts';
import { getSetting, setSetting } from '../utils/settings.js';
import { createRendererLogger } from '../utils/logger.ts';

const { t } = useI18n()
const logger = createRendererLogger('Outline', {
  windowTypeProvider: () => getWindowType()
})
const workspace = useWorkspace();
const {
  activeTabId,
  activateTab,
  ensureDocument,
  removeTab,
  updateDocumentOutline,
  updateDocumentLastView,
  updateDocumentMarkdown,
  withAutoOutlineSyncSuppressed,
} = workspace;

const cloneOutline = (outline?: DocumentOutlineNode): DocumentOutlineNode =>
  JSON.parse(JSON.stringify(outline ?? DEFAULT_OUTLINE_TREE));

const activeDocument = computed(() => {
  if (!activeTabId.value) return null;
  try {
    return ensureDocument(activeTabId.value);
  } catch (error) {
    logger.warn('获取当前文档失败', error);
    return null;
  }
});

const treeData = ref<DocumentOutlineNode>(cloneOutline(activeDocument.value?.outline));
const dialogVisible = ref<Record<string, boolean>>({});
const editorTheme = computed<Themes | undefined>(() => themeState.currentTheme.vditorTheme as Themes | undefined);
const selectedNode = ref<DocumentOutlineNode | null>(null);
const generated = ref(false);
const generating = ref(false);
const rawstring = ref('');
const generatedText = ref('');

let suppressDocumentSync = false;

const commitOutline = async (outline?: DocumentOutlineNode) => {
  const tabId = activeTabId.value;
  if (!tabId) return;
  const snapshot = cloneOutline(outline ?? treeData.value);
  
  // 使用 withAutoOutlineSyncSuppressed 防止死循环：
  // 从大纲生成文本 -> 自动提取大纲 -> 触发 watch -> 再次生成文本
  await withAutoOutlineSyncSuppressed(async () => {
    suppressDocumentSync = true;
    try {
      updateDocumentOutline(tabId, snapshot);
      updateDocumentLastView(tabId, 'outline');
      // 使用适配器按不同格式同步正文文本
      const doc = activeDocument.value;
      const format = doc?.format ?? 'md';
      const adapter = getOutlineAdapter(format as any);
      if (format === 'tex') {
        const nextTex = await adapter.toText(snapshot, doc?.tex ?? '');
        workspace.updateDocumentTex(tabId, nextTex);
      } else {
        const nextMd = await adapter.toText(snapshot, doc?.markdown ?? '');
        updateDocumentMarkdown(tabId, nextMd);
      }
    } finally {
      suppressDocumentSync = false;
    }
  });
};

const handleTabChange = (id: string) => {
  activateTab(id);
};

const handleCloseTab = (id: string) => {
  if (tabs.length <= 1) return;
  removeTab(id);
};
const formatTitleDialogVisible = ref(false);
const formatTitle = () => {
  formatTitleDialogVisible.value = true;
};
const formatTitleConfig = reactive({
  adjustMarkdown: true,
  firstMarkdownTitleLevel: 1,
  adjustTitle: true,//是否调整标题编号
  cover: true,
  level1TitleChinese: true,//第一级标题使用中文，如一 二三四五六七八九十
});

const backupOutlineTree = ref<DocumentOutlineNode | null>(null);
const generateContentLoading = ref(false);
const generateChildrenContentLoading = ref(false);
const generateChildrenChildrenLoading = ref(false);
const parallelChildren = ref<Array<Ref<string>>>([]); // 用于存储并行生成的子节点
const userPrompt = ref(''); // 用户输入的提示词
//const nodeBeingProcessed = ref(''); // 用于显示正在处理的节点名称
const generateChildrenChildren = async () => {
  // 暂停文档同步，避免并发写入时 treeData 被替换导致后续引用失效
  workspace.lockUI?.();
  const prevSync = suppressDocumentSync;
  suppressDocumentSync = true;
  const node = selectedNode.value;
  generating.value = true;
  generateChildrenChildrenLoading.value = true;

  const rootNode = node ? searchNode(node.path, treeData.value) : null;
  if (!rootNode) {
    generateChildrenChildrenLoading.value = false;
    generating.value = false;
    suppressDocumentSync = prevSync;
    workspace.unlockUI?.();
    return;
  }
  parallelChildren.value = [];
  const taskPromises: Promise<void>[] = [];

  const traverseAndGenerate = async (curNode: DocumentOutlineNode | null): Promise<void> => {
    if (!curNode) return;

    if (curNode.children && curNode.children.length > 0) {
      await Promise.all(curNode.children.map(child => traverseAndGenerate(child)));
      return;
    }

    const prompt = expandTreeNodePrompt(
      JSON.stringify(removeTextFromOutline(treeData.value)),
      JSON.stringify(curNode),
      JSON.stringify(TREE_NODE_SCHEMA),
      userPrompt.value
    );

    const rawStringRef = ref('');
    parallelChildren.value.push(rawStringRef);
    const { done } = createAiTask(
      curNode.title,
      prompt,
      rawStringRef,
      ai_types.answer,
      'outline-children-' + curNode.title,
    );

    const task = done
      .then(() => {
        const json = extractOuterJsonString(rawStringRef.value);
        if (!json) {
          logger.warn(`节点 ${curNode.title} 未能提取 JSON，无法生成子节点`);
          return;
        }
        try {
          const newChildren = JSON.parse(json) as DocumentOutlineNode[];
          if (Array.isArray(newChildren) && newChildren.length > 0) {
            // 清理所有子节点标题中的Markdown/LaTeX标记（因为title_level已经决定了层级）
            for (const child of newChildren) {
              cleanNodeTitleMarkers(child)
            }
            
            if (!curNode.children) {
              curNode.children = [];
            }
            curNode.children.push(...newChildren);
            eventBus.emit(
              'show-success',
              t('outline.generateChildSuccessWithTitle', { title: curNode.title })
            );
          } else {
            logger.warn(`节点 ${curNode.title} 解析出的子节点列表为空或格式不正确`);
          }
        } catch (parseErr) {
          logger.warn(`节点 ${curNode.title} JSON 解析失败`, parseErr);
        }
      })
      .catch((err) => {
        logger.warn(`节点 ${curNode.title} 生成子节点失败`, err);
      });

    taskPromises.push(task);
  };

  try {
    await traverseAndGenerate(rootNode);
    await Promise.all(taskPromises);
    eventBus.emit('show-success', t('outline.generateChildSuccess'));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    eventBus.emit('show-error', t('outline.generateChildFail', { error: message }));
  } finally {
    generateChildrenChildrenLoading.value = false;
    generating.value = false;
    // 恢复同步并统一提交一次，确保所有并发结果都写入
    suppressDocumentSync = prevSync;
    commitOutline();
    workspace.unlockUI?.();
  }
};

const generateChildrenContent = async () => {
  // 暂停文档同步，避免并发写入期间 treeData 被替换
  workspace.lockUI?.();
  const prevSync = suppressDocumentSync;
  suppressDocumentSync = true;
  const node = selectedNode.value;
  generating.value = true;
  generateChildrenContentLoading.value = true;

  const rootNode = node ? searchNode(node.path, treeData.value) : null;
  if (!rootNode) {
    generateChildrenContentLoading.value = false;
    generating.value = false;
    suppressDocumentSync = prevSync;
    workspace.unlockUI?.();
    return;
  }
  parallelChildren.value = []; // 清空并行生成列表
  const taskPromises: Promise<unknown>[] = []; // 用于收集所有任务的done promise

  const traverseAndGenerate = async (curNode: DocumentOutlineNode | null): Promise<void> => {
    if (!curNode) return;

    if (curNode.children && curNode.children.length > 0) {
      await Promise.all(curNode.children.map(child => traverseAndGenerate(child)));
    }

    const prompt = curNode.children.length === 0
      ? generateContentPrompt(
          JSON.stringify(removeTextFromOutline(treeData.value)),
          JSON.stringify(curNode),
          userPrompt.value
        )
      : generateParentNodeContentPrompt(
          JSON.stringify(removeTextFromOutline(treeData.value)),
          JSON.stringify(curNode),
          userPrompt.value
        );

    const rawStringRef = ref('');
    parallelChildren.value.push(rawStringRef);
    const { done } = createAiTask(
      curNode.title,
      prompt,
      rawStringRef,
      ai_types.answer,
      'outline-content-' + curNode.title,
    );

    const task = done
      .then(() => {
        // 提取 JSON 并解析
        const rawContent = rawStringRef.value?.trim() || '';
        if (!rawContent) {
          logger.warn(`节点 ${curNode.title} AI 返回内容为空`);
          curNode.text = '';
        } else {
          const json = extractOuterJsonString(rawContent);
          if (json) {
            try {
              const result = JSON.parse(json) as { content: string };
              if (result.content) {
                curNode.text = result.content;
              } else {
                logger.warn(`节点 ${curNode.title} JSON 中 content 字段为空，使用原始内容`);
                const cleaned = cleanRawContent(rawContent);
                curNode.text = cleaned || rawContent;
              }
            } catch (parseErr) {
              logger.warn(`节点 ${curNode.title} JSON 解析失败，尝试使用原始内容`, parseErr);
              const cleaned = cleanRawContent(rawContent);
              curNode.text = cleaned || rawContent;
            }
          } else {
            // 如果提取失败，尝试清理原始内容
            logger.warn(`节点 ${curNode.title} 未能提取 JSON，尝试清理原始内容。原始内容前100字符：`, rawContent.substring(0, 100));
            const cleaned = cleanRawContent(rawContent);
            curNode.text = cleaned || rawContent;
          }
        }
        eventBus.emit(
          'show-success',
          t('outline.generateContentSuccessWithTitle', { title: curNode.title })
        );
      })
      .catch((err) => {
        logger.warn(`节点 ${curNode.title} 任务失败或取消：`, err);
        // 如果任务失败，尝试使用原始内容
        const rawContent = rawStringRef.value?.trim() || '';
        if (rawContent) {
          const cleaned = cleanRawContent(rawContent);
          curNode.text = cleaned || rawContent;
        } else {
          curNode.text = '';
        }
      });

    taskPromises.push(task);
  };

  await traverseAndGenerate(rootNode);  // 启动任务遍历

  await Promise.all(taskPromises);      // 等待所有任务完成

  generating.value = false;
  generateChildrenContentLoading.value = false;
  generated.value = true;
  // 恢复同步并统一提交一次
  suppressDocumentSync = prevSync;
  commitOutline();
  workspace.unlockUI?.();
};

const generateContent = async () => {
  workspace.lockUI?.();
  const node = selectedNode.value;
  generating.value = true;
  if (node) {
    backupContent.value = node.text;
  }
  generateContentLoading.value = true;
  const curNode = node ? searchNode(node.path, treeData.value) : null;
  if (!curNode) {
    generateContentLoading.value = false;
    generating.value = false;
    workspace.unlockUI?.();
    return;
  }
  const prompt = generateContentPrompt(
    JSON.stringify(removeTextFromOutline(treeData.value)),
    JSON.stringify(curNode),
    userPrompt.value
  );
  const { done } = createAiTask(
    curNode.title,
    prompt,
    rawstring,
    ai_types.answer,
    'outline-content-' + curNode.title,
  );
  try {
    await done;
    // 提取 JSON 并解析
    const rawContent = rawstring.value?.trim() || '';
    if (!rawContent) {
      logger.warn('AI 返回内容为空');
      curNode.text = '';
    } else {
      const json = extractOuterJsonString(rawContent);
      if (json) {
        try {
          const result = JSON.parse(json) as { content: string };
          if (result.content) {
            curNode.text = result.content;
          } else {
            logger.warn('JSON 中 content 字段为空，尝试清理原始内容');
            const cleaned = cleanRawContent(rawContent);
            curNode.text = cleaned || rawContent;
          }
        } catch (parseErr) {
          logger.warn('JSON 解析失败，尝试使用原始内容', parseErr);
          // 尝试清理原始内容（去除可能的说明文字）
          const cleaned = cleanRawContent(rawContent);
          curNode.text = cleaned || rawContent;
        }
      } else {
        // 如果提取失败，尝试清理原始内容
        logger.warn('未能提取 JSON，尝试清理原始内容。原始内容前100字符：', rawContent.substring(0, 100));
        const cleaned = cleanRawContent(rawContent);
        curNode.text = cleaned || rawContent;
      }
    }
  } catch (err) {
    logger.warn('任务失败或取消：', err);
    // 如果任务失败，尝试使用原始内容
    const rawContent = rawstring.value?.trim() || '';
    if (rawContent) {
      const cleaned = cleanRawContent(rawContent);
      curNode.text = cleaned || rawContent;
    } else {
      curNode.text = '';
    }
  } finally {
    pendingAccept.value = true;
    generateContentLoading.value = false;
    generating.value = false;
    workspace.unlockUI?.();
  }
  eventBus.emit('show-success', t('outline.generateChapterSuccess'));

};


const position = ref({ top: 100, left: 100 });
let isDragging = false;
let offset: { x: number; y: number } = { x: 0, y: 0 };
function startDrag(e: MouseEvent) {
  isDragging = true;
  offset.x = e.clientX - position.value.left;
  offset.y = e.clientY - position.value.top;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}
function onDrag(e: MouseEvent) {
  if (!isDragging) return;
  position.value.left = e.clientX - offset.x;
  position.value.top = e.clientY - offset.y;
}
function stopDrag() {
  isDragging = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}



/**
 * 移除大纲树中所有节点的标题前缀
 */
function removeAllTitlePrefixes(outlineTree: DocumentOutlineNode): DocumentOutlineNode {
  const node = cloneOutline(outlineTree);
  
  function dfs(n: DocumentOutlineNode): void {
    if (n.title) {
      n.title = removeTitleIndex(n.title);
    }
    
    for (const child of n.children) {
      dfs(child);
    }
  }
  
  if (node.path === 'dummy') {
    for (const child of node.children) {
      dfs(child);
    }
  } else {
    dfs(node);
  }
  
  return node;
}

const executeFormatTitle = async () => {
  backupOutlineTree.value = cloneOutline(treeData.value);
  
  // 暂停文档同步，避免触发 watch 导致循环
  const prevSync = suppressDocumentSync;
  suppressDocumentSync = true;
  
  try {
    let modifiedTree = cloneOutline(treeData.value);
    
    // 调整Markdown标题层级（如果指定）
    if (formatTitleConfig.adjustMarkdown) {
      const firstLevel = formatTitleConfig.firstMarkdownTitleLevel;
      modifiedTree = cloneOutline(adjustTitleLevel(modifiedTree, firstLevel));
    }
    
    // 3. 调整章节编号（如果指定）
    if (formatTitleConfig.adjustTitle) {
      const cover = formatTitleConfig.cover;
      const level1TitleChinese = formatTitleConfig.level1TitleChinese;
      modifiedTree = cloneOutline(adjustTitleIndex(modifiedTree, cover, level1TitleChinese));
    }
    
    // 更新 treeData（此时 suppressDocumentSync = true，不会触发 watch）
    treeData.value = modifiedTree;
    
    // 手动提交更改
    await commitOutline(modifiedTree);
    
    formatTitleDialogVisible.value = false;
    eventBus.emit('show-success', t('outline.formatSuccess'));
  } finally {
    // 恢复同步状态
    suppressDocumentSync = prevSync;
  }
}

const handleRemovePrefixes = () => {
  ElMessageBox.confirm(
    t('outline.removePrefixesConfirm'),
    t('outline.warning'),
    {
      confirmButtonText: t('outline.confirm'),
      cancelButtonText: t('outline.cancel'),
      type: 'warning'
    }
  ).then(async () => {
    backupOutlineTree.value = cloneOutline(treeData.value);
    
    // 暂停文档同步，避免触发 watch 导致循环
    const prevSync = suppressDocumentSync;
    suppressDocumentSync = true;
    
    try {
      let modifiedTree = cloneOutline(treeData.value);
      modifiedTree = removeAllTitlePrefixes(modifiedTree);
      
      // 更新 treeData（此时 suppressDocumentSync = true，不会触发 watch）
      treeData.value = modifiedTree;
      
      // 手动提交更改
      await commitOutline(modifiedTree);
      
      formatTitleDialogVisible.value = false;
      eventBus.emit('show-success', t('outline.removePrefixesSuccess'));
    } finally {
      // 恢复同步状态
      suppressDocumentSync = prevSync;
    }
  }).catch(() => {
    // 用户取消，不做任何操作
  });
}

const handleNodeDrag = (_dragNode: any, _targetNode: any) => {
  // 尝试将拖拽节点移动为目标节点的最后一个子节点
  try {
    if (!_dragNode || !_targetNode) return;
    const drag = searchNode(_dragNode.path, treeData.value);
    if (!drag) return;
    const originParent = searchParentNode(_dragNode.path, treeData.value);
    // 如果拖动的是根节点，则不允许
    if (!originParent) return;
    // 从原父节点移除
    removeNode(originParent, drag);
    // 确定目标插入位置（目标节点作为父）
    const target = searchNode(_targetNode.path, treeData.value);
    const targetParent = searchParentNode(_targetNode.path, treeData.value);
    if (target) {
      target.children = target.children || [];
      target.children.push(drag);
      // 重新计算路径
      reindexChildrenPaths(target);
    } else if (targetParent) {
      // 退化为与目标同级追加
      targetParent.children = targetParent.children || [];
      targetParent.children.push(drag);
      reindexChildrenPaths(targetParent);
    }
  } catch (err) {
    logger.warn('节点拖拽失败', err);
  }
};

const draggingNodePath = ref<string | null>(null);
const isDraggingNode = ref(false);
function onNodeDragStart(node: DocumentOutlineNode) {
  draggingNodePath.value = node.path;
  isDraggingNode.value = true;
}
type DropMode = 'before' | 'after' | 'inside' | 'parent';
const dropPreview = reactive<{ targetPath: string | null; mode: DropMode | null }>({
  targetPath: null,
  mode: null,
});

function computeDropMode(e: DragEvent, el: HTMLElement): DropMode {
  const rect = el.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = rect.width;
  const h = rect.height;
  
  if (direction.value === 'vertical') {
    // 纵向布局：左右调整平级顺序，上下调整父子关系
    const leftZone = w * 0.25;
    const rightZone = w * 0.75;
    const topZone = h * 0.25;
    const bottomZone = h * 0.75;
    if (x <= leftZone) return 'before';
    if (x >= rightZone) return 'after';
    if (y >= bottomZone) return 'inside';
    if (y <= topZone) return 'parent';
    // 默认作为 inside
    return 'inside';
  } else {
    // 横向布局：上下调整平级顺序，左右调整父子关系
    const topZone = h * 0.25;
    const bottomZone = h * 0.75;
    const leftZone = w * 0.25;
    const rightZone = w * 0.75;
    if (y <= topZone) return 'before';
    if (y >= bottomZone) return 'after';
    if (x >= rightZone) return 'inside';
    if (x <= leftZone) return 'parent';
    // 默认作为 inside
    return 'inside';
  }
}

function onNodeDragOver(e: DragEvent, node: DocumentOutlineNode) {
  const el = e.currentTarget as HTMLElement | null;
  if (!el) return;
  const mode = computeDropMode(e, el);
  dropPreview.targetPath = node.path;
  dropPreview.mode = mode;
}

function onNodeDragLeave(_node: DocumentOutlineNode) {
  dropPreview.targetPath = null;
  dropPreview.mode = null;
}

function onNodeDrop(targetNode: DocumentOutlineNode, e: DragEvent) {
  try {
    const fromPath = draggingNodePath.value;
    draggingNodePath.value = null;
    const mode = dropPreview.mode;
    dropPreview.targetPath = null;
    dropPreview.mode = null;
    isDraggingNode.value = false;
    if (!fromPath) return;
    if (fromPath === targetNode.path || !mode) return;
    const drag = searchNode(fromPath, treeData.value);
    if (!drag) return;
    const originParent = searchParentNode(fromPath, treeData.value);
    if (!originParent) return;
    // 工具：判断是否为后代（防止自包含导致的子树丢失）
    const isDescendant = (candidatePath: string, ancestorPath: string): boolean => {
      if (!ancestorPath) return false;
      return candidatePath === ancestorPath || candidatePath.startsWith(ancestorPath + '.');
    };
    // 工具：创建只包含标题与正文的浅拷贝（不带子节点）
    const createShallowCopy = (node: DocumentOutlineNode): DocumentOutlineNode => {
      return {
        title: node.title,
        text: node.text,
        title_level: node.title_level,
        path: '',
        children: [],
      };
    };

    const target = searchNode(targetNode.path, treeData.value);
    if (!target) return;

    if (mode === 'inside') {
      // 插入为子节点；如果目标是拖拽节点的后代，分两类：
      // 1) 目标是拖拽节点的“直接子节点”：将该直接子节点及其同级（即拖拽节点的所有直接子）上移到原父级；再把拖拽节点作为该目标的子节点
      // 2) 目标是更深层后代：避免形成环，仅复制“当前节点内容”插入
      target.children = target.children || [];
      if (isDescendant(target.path, drag.path)) {
        const targetParent = searchParentNode(target.path, treeData.value);
        const isDirectChild = targetParent && targetParent.path === drag.path;
        if (isDirectChild) {
          const hostParent = originParent ?? treeData.value;
          hostParent.children = hostParent.children || [];
          const indexOfA = hostParent.children.indexOf(drag);
          const oldChildren = (drag.children && drag.children.length) ? [...drag.children] : [];
          // 1) 在祖父层用 A 的子列表替换 A，自然保持原排序位置
          if (indexOfA >= 0) {
            hostParent.children.splice(indexOfA, 1, ...oldChildren);
          } else {
            // 找不到 A 的极端情况，退化为末尾插入
            hostParent.children.push(...oldChildren);
            removeNode(originParent ?? treeData.value, drag);
          }
          // 2) 清空 A 的子列表
          drag.children = [];
          // 3) 把 A 作为 B 的子节点
          target.children.push(drag);
          // 4) 重新索引
          reindexChildrenPaths(hostParent);
          reindexChildrenPaths(target);
          reindexChildrenPaths(treeData.value);
        } else {
          // 更深层后代：仅复制“当前节点内容”，避免环
          const shallow = createShallowCopy(drag);
          target.children.push(shallow);
          reindexChildrenPaths(target);
        }
      } else {
        // 正常移动：先从原父移除再插入
        removeNode(originParent, drag);
        target.children.push(drag);
        reindexChildrenPaths(target);
      }
      return;
    }

    if (mode === 'before' || mode === 'after') {
      const parent = searchParentNode(target.path, treeData.value);
      if (!parent || !parent.children) return;
      const idx = parent.children.findIndex((c) => c.path === target.path);
      if (idx === -1) return;
      const insertIndex = mode === 'before' ? idx : idx + 1;
      // 插入到目标同级；如果该“同级父节点”是拖拽节点的后代，同样只复制“当前节点内容”
      if (isDescendant(parent.path, drag.path)) {
        const shallow = createShallowCopy(drag);
        parent.children.splice(insertIndex, 0, shallow);
      } else {
        removeNode(originParent, drag);
        parent.children.splice(insertIndex, 0, drag);
      }
      reindexChildrenPaths(parent);
      return;
    }

    if (mode === 'parent') {
      const targetParent = searchParentNode(target.path, treeData.value);
      if (!targetParent) {
        // 目标无父节点（根），放不到更上层，回退为 before
        const parent = searchParentNode(target.path, treeData.value);
        if (!parent || !parent.children) return;
        const idx = parent.children.findIndex((c) => c.path === target.path);
        if (idx === -1) return;
        if (isDescendant(parent.path, drag.path)) {
          const shallow = createShallowCopy(drag);
          parent.children.splice(idx, 0, shallow);
        } else {
          removeNode(originParent, drag);
          parent.children.splice(idx, 0, drag);
        }
        reindexChildrenPaths(parent);
        return;
      }
      const grandParent = searchParentNode(targetParent.path, treeData.value);
      if (!grandParent || !grandParent.children) return;
      const idxParent = grandParent.children.findIndex((c) => c.path === targetParent.path);
      // 将拖拽节点插入到“父节点”的后面，等价于提升一层（作为父节点的同级）
      const insertIndex = idxParent + 1;
      if (isDescendant(grandParent.path, drag.path)) {
        const shallow = createShallowCopy(drag);
        grandParent.children.splice(insertIndex, 0, shallow);
      } else {
        removeNode(originParent, drag);
        grandParent.children.splice(insertIndex, 0, drag);
      }
      reindexChildrenPaths(grandParent);
      return;
    }
  } catch (err) {
    logger.warn('HTML5 拖拽节点失败', err);
  }
}
function onNodeDragEnd() {
  draggingNodePath.value = null;
  dropPreview.targetPath = null;
  dropPreview.mode = null;
  isDraggingNode.value = false;
}
const handleNodeClick = (node: DocumentOutlineNode) => {
  selectedNode.value = node;
};
const direction = ref<'vertical' | 'horizontal'>('vertical');
const treeConfig = reactive({
  nodeWidth: 180,
  nodeHeight: 50,
  levelHeight: 200,
  layout: 'vertical' as 'vertical' | 'horizontal',
});

// 加载布局方向设置
const loadLayoutDirection = async () => {
  const savedDirection = await getSetting('outlineLayoutDirection');
  if (savedDirection === 'horizontal' || savedDirection === 'vertical') {
    direction.value = savedDirection;
    treeConfig.layout = savedDirection;
  }
};

// 切换布局方向
const toggleLayout = async () => {
  if (direction.value === 'vertical') {
    direction.value = 'horizontal';
    treeConfig.layout = 'horizontal';
  } else {
    direction.value = 'vertical';
    treeConfig.layout = 'vertical';
  }
  // 保存设置
  await setSetting('outlineLayoutDirection', direction.value);
};
type TreeInstance = {
  restoreScale: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const treeRef = ref<TreeInstance | null>(null);
const currentChapterValue = ref('');
const currentChapterContent = ref('');
const editValueDialogVisible = ref(false);

watch(
  () => activeDocument.value?.outline,
  (outline) => {
    if (suppressDocumentSync) return;
    suppressDocumentSync = true;
    try {
      treeData.value = cloneOutline(outline);
      dialogVisible.value = {};
      selectedNode.value = null;
      generated.value = false;
      generatedText.value = '';
    } finally {
      suppressDocumentSync = false;
    }
  },
  { deep: true, immediate: true },
);

// 注意：文本到大纲的自动同步已被移除
// 原因：当从大纲生成文本时（commitOutline），会触发文本变化监听器，
// 导致从文本重新提取大纲树，覆盖掉 AI 生成的内容。
// 
// 文本到大纲的同步应该只在以下情况发生：
// 1. 用户在编辑器中直接编辑文本（由编辑器组件内部处理）
// 2. 从外部文件加载文档时（由文档加载器处理）
// 
// 在 Outline 视图中，大纲是数据源，文本是从大纲生成的，不应该反向同步。

watch(
  treeData,
  () => {
    if (suppressDocumentSync) return;
    commitOutline();
  },
  { deep: true },
);

const reset = () => {
  generated.value = false;
  generatedText.value = '';
};

const cancelAllAiTasks = () => {
  try {
    clearAiTasks();
  } catch (_e) {
    // ignore
  } finally {
    generateContentLoading.value = false;
    generateChildrenContentLoading.value = false;
    generateChildrenChildrenLoading.value = false;
    generating.value = false;
    workspace.unlockUI?.();
    eventBus.emit('show-warning', t('aiTask.taskCancelled2'));
  }
};

const move2Left = () => {
  const selected = selectedNode.value;
  if (!selected) return;
  const parent = searchParentNode(selected.path, treeData.value);
  const curNode = searchNode(selected.path, treeData.value);
  if (!parent || !curNode || !parent.children) return;
  const index = parent.children.indexOf(curNode);
  
  if (direction.value === 'vertical') {
    // 纵向布局：左移 = 向前移动（index - 1）
    if (index > 0) {
      parent.children.splice(index, 1);
      parent.children.splice(index - 1, 0, curNode);
      reindexChildrenPaths(parent);
    }
  } else {
    // 横向布局：左移 = 向上移动（index - 1）
    if (index > 0) {
      parent.children.splice(index, 1);
      parent.children.splice(index - 1, 0, curNode);
      reindexChildrenPaths(parent);
    }
  }
};

const move2Right = () => {
  const selected = selectedNode.value;
  if (!selected) return;
  const parent = searchParentNode(selected.path, treeData.value);
  const curNode = searchNode(selected.path, treeData.value);
  if (!parent || !curNode || !parent.children) return;
  const index = parent.children.indexOf(curNode);
  
  if (direction.value === 'vertical') {
    // 纵向布局：右移 = 向后移动（index + 1）
    if (index < parent.children.length - 1) {
      parent.children.splice(index, 1);
      parent.children.splice(index + 1, 0, curNode);
      reindexChildrenPaths(parent);
    }
  } else {
    // 横向布局：右移 = 向下移动（index + 1）
    if (index < parent.children.length - 1) {
      parent.children.splice(index, 1);
      parent.children.splice(index + 1, 0, curNode);
      reindexChildrenPaths(parent);
    }
  }
};

const changeNodeValue = () => {
  const selected = selectedNode.value;
  if (!selected) return;
  const curNode = searchNode(selected.path, treeData.value);
  if (!curNode) return;
  curNode.title = currentChapterValue.value;
  curNode.text = currentChapterContent.value;
  editValueDialogVisible.value = false;
};

const resetScale = () => {
  treeRef.value?.restoreScale();
};

const zoomIn = () => {
  treeRef.value?.zoomIn();
};

const zoomOut = () => {
  treeRef.value?.zoomOut();
};

const nodeMenuToggle = ref(false);//false为普通节点，true为AI辅助节点
const handleNodeButtonClick = (node: DocumentOutlineNode) => {
  selectedNode.value = node;
  if (dialogVisible.value[node.path] != null) {
    dialogVisible.value[node.path] = !dialogVisible.value[node.path];
  } else {
    dialogVisible.value[node.path] = true;
  }

  // 一次只能打开一个操作框，所以关闭其他操作框
  for (let key in dialogVisible.value) {
    if (key !== node.path) {
      dialogVisible.value[key] = false;
    }
  }
};


const addChildNode = () => {
  const node = selectedNode.value;
  if (!node) return;
  const cur_node = searchNode(node.path, treeData.value);
  if (!cur_node) return;
  const newNode = {
    title: '新子节点',
    text: '',
    title_level: cur_node.title_level + 1,
    path:
      cur_node.path +
      (cur_node.path !== '' ? '.' : '') +
      (cur_node.children && cur_node.children.length > 0 ? cur_node.children.length + 1 : 1),
    children: []
  };
  cur_node.children.push(newNode);
  dialogVisible.value[cur_node.path] = false;
};

const editNode = () => {
  const node = selectedNode.value;
  if (!node) return;
  const cur_node = searchNode(node.path, treeData.value);
  if (!cur_node) return;
  editValueDialogVisible.value = true;
  currentChapterValue.value = cur_node.title;
  currentChapterContent.value = cur_node.text;
};

const deleteNode = () => {
  ElMessageBox.confirm(
    t('outline.confirmDeleteChapter'),
    t('outline.warning'),
    {
      confirmButtonText: t('outline.confirm'),
      cancelButtonText: t('outline.cancel'),
      type: 'warning'
    }
  ).then(() => {
    const node = selectedNode.value;
    if (!node) return;
    const parent = searchParentNode(node.path, treeData.value);
    const cur_node = searchNode(node.path, treeData.value);
    if (!cur_node) return;
    if (parent === null) {
      ElNotification({
        title: t('outline.error'),
        message: t('outline.cannotDeleteRoot'),
        type: 'error'
      });
      return;
    }
    if (parent) {
      removeNode(parent, cur_node);
    }
    dialogVisible.value[node.path] = false;
    ElNotification({
      title: t('outline.message'),
      message: t('outline.deleteSuccess'),
      type: 'info'
    });
  })
    .catch(() => { });

};
const generateChildChapterLoading = ref(false);
const pendingAccept = ref(false);
const backupChildren = ref<DocumentOutlineNode[] | null>(null);
const backupContent = ref<string>('');
const generateChildChapter = async () => {
  workspace.lockUI?.();
  generateChildChapterLoading.value = true;
  generating.value = true;
  rawstring.value = '';
  try {
    const node = selectedNode.value;
    if (!node) throw new Error('未选择节点');
    const currentNode = searchNode(node.path, treeData.value);
    if (!currentNode) throw new Error('节点不存在');

    const prompt = expandTreeNodePrompt(
      JSON.stringify(removeTextFromOutline(treeData.value)),
      JSON.stringify(currentNode),
      JSON.stringify(TREE_NODE_SCHEMA),
      userPrompt.value
    );

    const { done } = createAiTask(
      currentNode.title,
      prompt,
      rawstring,
      ai_types.answer,
      'outline-children-' + currentNode.title,
    );
    try {
      await done;
      const json = extractOuterJsonString(rawstring.value);
      const newChildren = JSON.parse(json) as DocumentOutlineNode[];
      
      // 清理所有子节点标题中的Markdown/LaTeX标记（因为title_level已经决定了层级）
      for (const child of newChildren) {
        cleanNodeTitleMarkers(child)
      }
      
      backupChildren.value = currentNode.children ? [...currentNode.children] : [];
      currentNode.children = [...currentNode.children, ...newChildren];
      pendingAccept.value = true;
    } catch (err) {
      logger.warn('任务失败或取消：', err);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('大纲 JSON 解析失败', e);
    eventBus.emit('show-error', t('outline.generateChildRetryFail', { error: message }));
  } finally {
    generateChildChapterLoading.value = false;
    generating.value = false;
    workspace.unlockUI?.();
  }
}

const closeDialog = () => {
  const node = selectedNode.value;
  if (!node) return;
  dialogVisible.value[node.path] = false;
};

const removeNode = (parent: DocumentOutlineNode, node: DocumentOutlineNode) => {
  if (!parent.children) return;
  const index = parent.children.indexOf(node);
  if (index !== -1) {
    parent.children.splice(index, 1);
  } else {
    parent.children.forEach((child) => removeNode(child, node));
  }
};

/**
 * 清理标题中的Markdown和LaTeX标记
 * 因为title_level字段已经决定了标题层级，所以标题中不应该包含#、##、\section{}等标记
 * 
 * 使用精确匹配，避免误清除其他LaTeX命令（如\textbf{}、\textit{}等）
 */
function cleanTitleMarkers(title: string): string {
  if (!title || typeof title !== 'string') {
    return title
  }
  
  let cleaned = title.trim()
  
  // 1. 移除Markdown标题标记（#、##、###等）
  // 确保：行首 + 一个或多个# + 至少一个空格
  // 避免匹配代码中的 # 符号（通过要求后面必须有空格）
  cleaned = cleaned.replace(/^#+\s+/, '')
  
  // 2. 移除LaTeX标题命令标记
  // 只匹配已知的标题命令，避免误匹配其他LaTeX命令
  // 支持的标题命令：\part, \chapter, \section, \subsection, \subsubsection, \paragraph, \subparagraph, \title
  // 也支持带星号的变体：\section*, \subsection* 等（用于不编号的章节）
  
  // 匹配嵌套大括号的辅助函数
  const extractBracedContent = (str: string, startPos: number): { content: string; endPos: number } | null => {
    if (str[startPos] !== '{') return null
    
    let depth = 0
    let i = startPos
    let content = ''
    
    while (i < str.length) {
      const char = str[i]
      
      // 检查是否是转义的字符（\ 后面跟 { 或 } 或 \）
      if (char === '\\' && i + 1 < str.length) {
        const nextChar = str[i + 1]
        if (nextChar === '{' || nextChar === '}' || nextChar === '\\') {
          // 转义字符，作为普通字符处理
          if (depth >= 1) {
            content += char + nextChar
          }
          i += 2
          continue
        }
      }
      
      if (char === '{') {
        depth++
        // 只有深度大于1时才加入content（跳过最外层的大括号）
        if (depth > 1) {
          content += char
        }
      } else if (char === '}') {
        depth--
        if (depth === 0) {
          // 找到匹配的右括号，返回内容
          return { content, endPos: i }
        } else {
          // 嵌套的大括号，加入content
          content += char
        }
      } else {
        // 普通字符，如果在大括号内则加入content
        if (depth >= 1) {
          content += char
        }
      }
      i++
    }
    
    return null // 未找到匹配的右括号
  }
  
  // 精确匹配LaTeX标题命令
  // 匹配模式：\命令名[*]{内容}
  const latexTitleCommands = [
    'part', 'chapter', 'section', 'subsection', 'subsubsection',
    'paragraph', 'subparagraph', 'title'
  ]
  
  for (const cmd of latexTitleCommands) {
    // 匹配 \command 或 \command*
    const cmdPattern = new RegExp(`^\\\\${cmd}\\*?`, 'i')
    const match = cleaned.match(cmdPattern)
    
    if (match) {
      const afterCmd = cleaned.substring(match[0].length).trim()
      
      // 如果后面跟着 {，尝试提取大括号内容
      if (afterCmd.startsWith('{')) {
        const result = extractBracedContent(afterCmd, 0)
        if (result) {
          cleaned = result.content
          break
        }
      }
    }
  }
  
  return cleaned.trim()
}

/**
 * 递归清理节点及其所有子节点的标题标记
 */
function cleanNodeTitleMarkers(node: DocumentOutlineNode): void {
  if (node.title) {
    node.title = cleanTitleMarkers(node.title)
  }
  
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      cleanNodeTitleMarkers(child)
    }
  }
}

/**
 * 清理原始内容，去除可能的说明文字和格式标记
 */
function cleanRawContent(raw: string): string {
  if (!raw) return '';
  
  let cleaned = raw.trim();
  
  // 首先尝试提取 JSON（如果内容被包裹在说明文字中）
  const jsonMatch = cleaned.match(/\{[\s\S]*"content"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const result = JSON.parse(jsonMatch[0]) as { content?: string };
      if (result.content) {
        return result.content.trim();
      }
    } catch {
      // 解析失败，继续清理
    }
  }
  
  // 去除代码块标记（如果 AI 错误地使用了代码块）
  cleaned = cleaned.replace(/^```(?:json|markdown)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  
  // 去除常见的说明文字段落（这些通常出现在内容开头，后面跟着换行和实际内容）
  const instructionPatterns = [
    // 匹配完整的说明文字段落（包括换行）
    /^请严格按照示例格式输出[，,，。.]?\s*不要添加任何其他内容[。.]?\s*[\n\r]+/i,
    /^现在[，,，]?\s*请直接输出\s*JSON\s*结果[，,，。.]?\s*不要添加任何其他内容[。.]?\s*[\n\r]+/i,
    /^请严格按照\s*JSON\s*格式输出[，,，。.]?\s*不要添加任何解释或多余文本[。.]?\s*[\n\r]+/i,
    /^请严格按照\s*JSON\s*格式输出[，,，。.]?\s*不要添加任何其他内容[。.]?\s*[\n\r]+/i,
    /^请严格按照\s*JSON\s*Schema\s*格式输出[，,，。.]?\s*不要添加任何解释或多余文本[。.]?\s*[\n\r]+/i,
    /^输出必须从第一行开始就是\s*JSON\s*对象[，,，。.]?\s*没有任何其他文字[。.]?\s*[\n\r]+/i,
    // 匹配单独的说明文字（没有换行，直接跟内容）
    /^请严格按照示例格式输出[，,，。.]?\s*不要添加任何其他内容[。.]?\s*/i,
    /^现在[，,，]?\s*请直接输出\s*JSON\s*结果[，,，。.]?\s*不要添加任何其他内容[。.]?\s*/i,
    /^请严格按照\s*JSON\s*格式输出[，,，。.]?\s*不要添加任何解释或多余文本[。.]?\s*/i,
    /^请严格按照\s*JSON\s*格式输出[，,，。.]?\s*不要添加任何其他内容[。.]?\s*/i,
    /^请严格按照\s*JSON\s*Schema\s*格式输出[，,，。.]?\s*不要添加任何解释或多余文本[。.]?\s*/i,
    /^输出必须从第一行开始就是\s*JSON\s*对象[，,，。.]?\s*没有任何其他文字[。.]?\s*/i,
    // 其他常见前缀
    /^根据您的要求[，,]\s*/i,
    /^我将为您[，,]\s*/i,
    /^好的[，,]\s*/i,
    /^明白了[，,]\s*/i,
    /^以下是[：:]\s*/i,
    /^内容如下[：:]\s*/i,
    /^生成的内容[：:]\s*/i,
  ];
  
  for (const pattern of instructionPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // 去除开头的空行和空白
  cleaned = cleaned.replace(/^[\s\n\r]+/, '');
  
  // 如果清理后内容为空，尝试从原始内容中提取（可能是说明文字在中间）
  if (!cleaned.trim()) {
    // 尝试找到第一个看起来像实际内容的段落（不是说明文字）
    const lines = raw.split('\n');
    const contentLines: string[] = [];
    let foundContent = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      // 跳过空行和明显的说明文字
      if (!trimmedLine) continue;
      if (/^(请|现在|输出|根据|我将|好的|明白了)/i.test(trimmedLine) && 
          /(格式|输出|JSON|示例|不要|添加)/i.test(trimmedLine)) {
        continue;
      }
      // 找到第一个看起来像实际内容的行
      if (trimmedLine.length > 10 || foundContent) {
        foundContent = true;
        contentLines.push(line);
      }
    }
    
    if (contentLines.length > 0) {
      cleaned = contentLines.join('\n').trim();
    }
  }
  
  // 去除首尾的多余空白
  cleaned = cleaned.trim();
  
  return cleaned;
}
function reindexChildrenPaths(parent: DocumentOutlineNode) {
  if (!parent.children) return;
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const base = parent.path ? parent.path + '.' : '';
    child.path = base + (i + 1);
    child.title_level = parent.title_level + 1;
    if (child.children && child.children.length > 0) {
      reindexChildrenPaths(child);
    }
  }
}
const acceptChange = () => {
  backupChildren.value = null;
  backupContent.value = '';
  rawstring.value = '';
  pendingAccept.value = false;
};
const discardChange = () => {
  const node = selectedNode.value;
  if (!node) return;
  const curNode = searchNode(node.path, treeData.value);
  if (!curNode) return;
  if (Array.isArray(backupChildren.value)) {
    curNode.children = [...backupChildren.value];
    backupChildren.value = null;
  }
  if (backupContent.value) {
    curNode.text = backupContent.value;
    backupContent.value = '';
  }
  pendingAccept.value = false;
};

// 组件挂载时加载布局方向设置
onMounted(() => {
  loadLayoutDirection();
});

</script>


<style scoped lang="less">
.outline-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 设置主题背景色 */
  background-color: v-bind('themeState.currentTheme.background');
}

.outline-page > .container {
  flex: 1;
  padding-bottom: 96px; /* 预留底部菜单高度，避免与状态栏重叠 */
}

.el-scrollbar__wrap {
  overflow-x: hidden;
}

.generate-preview {
  position: absolute;
  max-width: 500px;
  width: 500px;
  max-height: 500px;
  opacity: 0.9;
  z-index: 10000;
  overflow: auto;
}

.node-edit-box {
  display: flex;
  flex-direction: column;
  /* 垂直布局 */
  align-items: center;
  position: fixed;
  margin-top: 100%;
  width: fit-content;
  transition: width 0.8s ease, all 0.3s ease;
  z-index: 10;
  /* 确保覆盖其他元素 */
}

.button-group {
  display: flex;
  /* 水平布局 */
  justify-content: space-around;
  /* 按钮间隔均匀 */
  width: fit-content;
  transition: all 0.3s;
  /* 满宽布局 */
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

.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 5px;
  justify-content: center;
  /* 居中 */
}

.controls {
  margin-bottom: 20px;
}

.tree-node {
  margin-bottom: 12px;
  /* 增加底部间距 */
  display: inline-block;
  border-radius: 12px;
  /* 增加圆角 */
  padding: 8px 16px;
  /* 增加内边距，使节点更大，更易点击 */
  margin: 10px;
  cursor: pointer;
  transition: background-color 0.3s, transform 0.3s;
  /* 添加过渡效果 */
}

.tree-node:hover {
  transform: scale(1.02);
  /* 节点放大效果 */
}

/* 纵向布局的拖拽高亮样式 */
.tree-node.drop-before {
  box-shadow: inset 4px 0 0 #409eff;
}
.tree-node.drop-after {
  box-shadow: inset -4px 0 0 #67c23a;
}
.tree-node.drop-inside {
  outline: 2px dashed rgba(103, 194, 58, 0.6);
  border-radius: 10px;
}
.tree-node.drop-parent {
  box-shadow: inset 0 4px 0 #e6a23c;
  border-radius: 10px;
}

/* 横向布局的拖拽高亮样式 */
.outline-page[data-direction="horizontal"] :deep(.tree-node.drop-before) {
  box-shadow: inset 0 4px 0 #409eff;
}
.outline-page[data-direction="horizontal"] :deep(.tree-node.drop-after) {
  box-shadow: inset 0 -4px 0 #67c23a;
}
.outline-page[data-direction="horizontal"] :deep(.tree-node.drop-inside) {
  outline: 2px dashed rgba(103, 194, 58, 0.6);
  border-radius: 10px;
}
.outline-page[data-direction="horizontal"] :deep(.tree-node.drop-parent) {
  box-shadow: inset 4px 0 0 #e6a23c;
  border-radius: 10px;
}

.tree-node span {
  display: flex;
  align-items: center;
  font-size: 14px;
  /* 设置默认字体大小 */
  color: #333;
  /* 设置文本颜色 */
}

.dialog-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}

.bottom-menu {
  position: fixed;


  bottom: 12px;
  display: flex;
  gap: 10px;
  z-index: 1000;
  padding: 6px 10px;
  border-radius: 12px;
  box-sizing: border-box;
}
</style>
