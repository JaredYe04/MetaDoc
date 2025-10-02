<template>
    <div class="main-container">
        <div class="content-container">

            <!-- 菜单组件 -->
            <TitleMenu v-if="showTitleMenu" :title="currentTitle.replaceAll('#', '').trim()" :position="menuPosition"
                @close="handleTitleMenuClose" :path="currentTitlePath"
                :tree="extractOutlineTreeFromMarkdown(current_article, true)"
                @accept="async (payload) => { await acceptGeneratedText(payload); }" style="max-width: 500px;" />
            <SearchReplaceMenu v-if="searchReplaceDialogVisible" @close="searchReplaceDialogVisible = false"
                :position="SRMenuPosition" />

            <!-- 右键菜单组件 -->
            <ContextMenu :x="menuX" :y="menuY" :items="articleContextMenuItems" :selection="getSelection()"
                v-if="contextMenuVisible" @trigger="handleMenuClick" class="context-menu"
                @close="contextMenuVisible = false;" @insert="insertText" />
            <AISuggestion :targetEl="editorEl" :trigger="triggerSuggestion" :rootNodeClass="'vditor-reset'"
                @accepted="onAcceptSuggestion" @cancelled="onCancelSuggestion" @reset="onResetSuggestion" />

            <!-- 左边：编辑器区域 -->
            <div class="latex-editor-container">
                <!-- 顶部菜单栏 -->
                <div class="toolbar" :style="{
                    backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor
                }">
                    <el-tooltip :content="$t('latexEditor.toolbar.undo')" placement="bottom">
                        <div class="toolbar-icon" @click="undo">
                            <el-icon>
                                <ArrowLeft />
                            </el-icon>
                        </div>
                    </el-tooltip>

                    <el-tooltip :content="$t('latexEditor.toolbar.redo')" placement="bottom">
                        <div class="toolbar-icon" @click="redo">
                            <el-icon>
                                <ArrowRight />
                            </el-icon>
                        </div>
                    </el-tooltip>

                    <el-tooltip :content="$t('latexEditor.toolbar.zoomIn')" placement="bottom">
                        <div class="toolbar-icon" @click="zoomIn">
                            <el-icon>
                                <ZoomIn />
                            </el-icon>
                        </div>
                    </el-tooltip>

                    <el-tooltip :content="$t('latexEditor.toolbar.zoomOut')" placement="bottom">
                        <div class="toolbar-icon" @click="zoomOut">
                            <el-icon>
                                <ZoomOut />
                            </el-icon>
                        </div>
                    </el-tooltip>

                    <el-tooltip :content="$t('latexEditor.toolbar.toggleLineNumbers')" placement="bottom">
                        <div class="toolbar-icon" @click="toggleRowNumber">
                            <icon name="numbers-1" />
                        </div>
                    </el-tooltip>

                    <el-tooltip :content="$t('latexEditor.toolbar.togglePreview')" placement="bottom">
                        <div class="toolbar-icon" @click="toggleMinimap">
                            <el-icon>
                                <Memo />
                            </el-icon>
                        </div>
                    </el-tooltip>

                    <el-divider direction="vertical"></el-divider>

                    <el-tooltip :content="$t('latexEditor.toolbar.compile')" placement="bottom">
                        <div class="toolbar-icon" @click="compile">
                            <icon name="code" />
                        </div>
                    </el-tooltip>

                    <el-tooltip :content="$t('latexEditor.toolbar.showPdf')" placement="bottom">
                        <div class="toolbar-icon" @click="togglePdf">
                            <icon name="terminal" />
                        </div>
                    </el-tooltip>

                    <el-tooltip :content="$t('latexEditor.toolbar.compileAndShow')" placement="bottom">
                        <div class="toolbar-icon" @click="compileAndShow">
                            <icon name="terminal-rectangle" />
                        </div>
                    </el-tooltip>
                </div>
                <div class="editor-pdf-container">
                    <!-- Monaco 编辑器 -->
                    <div class="editor" :key="editorKey" ref="editorEl"></div>
                    <!-- 可调整宽度的 PDF 预览面板 -->
                    <div class="resizable-pdf-container" v-if="showPdfPanel">
                        <div class="resizer" @mousedown="startResizePdf"></div>
                        <div class="pdf-preview-container"
                            :style="{ width: pdfWidth + 'px', background: themeState.currentTheme.background }">
                            <!-- <iframe v-if="pdfUrl" :src="pdfUrl" frameborder="0"
                                style="width:100%; height:100%;"></iframe> -->
                            <!-- PDF 页码控制条 -->
                            <div class="pdf-toolbar" v-if="pdfUrl"
                                style="display:flex; align-items:center; justify-content:flex-start; padding:4px 8px; background-color: rgba(0,0,0,0.85);">
                                <el-button size="small" @click="goPrevPage" :disabled="currentPdfPage <= 1">
                                    {{ $t('latexEditor.prevPage') }}
                                </el-button>

                                <el-button size="small" @click="goNextPage" :disabled="currentPdfPage >= totalPdfPages">
                                    {{ $t('latexEditor.nextPage') }}
                                </el-button>

                                <span style="margin-left:8px; display:flex; align-items:center;">
                                    <input type="number" v-model.number="inputPdfPage" @change="jumpToPage" :min="1"
                                        :max="totalPdfPages" style="width:50px; text-align:center; margin-right:4px;" />
                                    / {{ totalPdfPages }} {{ $t('latexEditor.pages') }}
                                </span>
                                <el-tooltip :content="$t('latexEditor.toolbar.zoomIn')" placement="bottom">
                                    <div class="pdf-toolbar-icon" @click="pdfZoomIn">
                                        <el-icon>
                                            <ZoomIn />
                                        </el-icon>
                                    </div>
                                </el-tooltip>

                                <el-tooltip :content="$t('latexEditor.toolbar.zoomOut')" placement="bottom">
                                    <div class="pdf-toolbar-icon" @click="pdfZoomOut">
                                        <el-icon>
                                            <ZoomOut />
                                        </el-icon>
                                    </div>
                                </el-tooltip>
                                <el-tooltip :content="$t('latexEditor.toolbar.zoomReset')" placement="bottom">
                                    <div class="pdf-toolbar-icon" @click="pdfZoomReset">
                                        <el-icon>
                                            <Refresh/>
                                        </el-icon>
                                    </div>
                                </el-tooltip>
                            </div>

                            <!-- PDF 渲染容器 -->
                            <div ref="pdfContainer" id="pdfContainer" v-if="pdfUrl" class="pdf-container">
                                <div class="canvas-wrapper" ref="canvasWrapper">
                                    <!-- canvas 渲染在这里 -->
                                </div>
                            </div>
                            <h3 v-else class="pdf-empty-text">
                                {{ $t('latexEditor.pdfEmpty') }}
                            </h3>
                        </div>
                    </div>
                </div>


            </div>
            <div class="resizable-container">
                <div class="resizer" @mousedown="startResize"></div>
                <!-- 右边：元信息显示 -->
                <div class="meta-info"
                    :style="{ width: metaInfoWidth + 'px', backgroundColor: themeState.currentTheme.background2nd }">
                    <div style="text-align: center; font-size: large;">
                        <el-tooltip :content="$t('article.edit_meta_info')" placement="left">
                            <h1 class="interactive-text" @click="showMetaDialog"
                                :style="{ color: themeState.currentTheme.textColor }">
                                {{ $t('article.meta_info') }}
                            </h1>
                        </el-tooltip>
                    </div>

                    <el-tooltip :content="$t('article.click_to_edit_title')" placement="left">
                        <h1 @click="genTitleDialogVisible = !genTitleDialogVisible" class="interactive-text"
                            :style="{ color: themeState.currentTheme.textColor }">
                            {{ $t('article.title') }}：
                            {{ current_article_meta_data.title || $t('article.no_title') }}
                        </h1>
                    </el-tooltip>

                    <LlmDialog v-if="genTitleDialogVisible"
                        :prompt="generateTitlePrompt(JSON.stringify(extractOutlineTreeFromMarkdown(current_article, true)))"
                        :title="$t('article.generate_title')" :llmConfig="{ max_tokens: 15, temperature: 0.0 }"
                        @llm-content-accept="(content) => {
                            current_article_meta_data.title = content;
                            genTitleDialogVisible = false;
                        }" @update:visible="genTitleDialogVisible = $event; genTitleDialogVisible = false"
                        :defaultText="current_article_meta_data.title" :defaultInputSize="1"></LlmDialog>

                    <el-tooltip :content="$t('article.click_to_edit_author')" placement="left">
                        <p @click="modifyAuthorDialogVisible = !modifyAuthorDialogVisible" class="interactive-text"
                            :style="{ color: themeState.currentTheme.textColor }">
                            <strong>{{ $t('article.author') }}：</strong>
                            {{ current_article_meta_data.author || $t('article.no_author') }}
                        </p>
                    </el-tooltip>

                    <LlmDialog v-if="modifyAuthorDialogVisible" :prompt="''" :title="$t('article.modify_author')"
                        :llmConfig="{}" @llm-content-accept="(content) => {
                            current_article_meta_data.author = content;
                            modifyAuthorDialogVisible = false;
                        }" @update:visible="modifyAuthorDialogVisible = $event; modifyAuthorDialogVisible = false"
                        :defaultText="current_article_meta_data.author" :defaultInputSize="1"></LlmDialog>

                    <el-tooltip :content="$t('article.click_to_edit_description')" placement="left">
                        <p @click="genDescriptionDialogVisible = !genDescriptionDialogVisible" class="interactive-text"
                            :style="{ color: themeState.currentTheme.textColor }">
                            <strong>{{ $t('article.description') }}：</strong>
                            {{ current_article_meta_data.description || $t('article.no_description') }}
                        </p>
                    </el-tooltip>

                    <LlmDialog v-if="genDescriptionDialogVisible"
                        :prompt="generateDescriptionPrompt(JSON.stringify(extractOutlineTreeFromMarkdown(current_article, true)))"
                        :title="$t('article.generate_description')" :llmConfig="{ max_tokens: 100, temperature: 0.0 }"
                        @llm-content-accept="(content) => {
                            current_article_meta_data.description = content;
                            genDescriptionDialogVisible = false;
                        }" @update:visible="genDescriptionDialogVisible = $event; genDescriptionDialogVisible = false"
                        :defaultText="current_article_meta_data.description" :defaultInputSize="10"></LlmDialog>
                </div>


            </div>

            <el-dialog v-model="editMetaDialogVisible" :title="$t('article.edit_meta_info')" width="30%">
                <el-form>
                    <el-form-item :label="$t('article.title')">
                        <el-input v-model="current_article_meta_data.title" autocomplete="off" class="aero-input" />
                    </el-form-item>
                    <el-form-item :label="$t('article.author')">
                        <el-input v-model="current_article_meta_data.author" autocomplete="off" class="aero-input" />
                    </el-form-item>
                    <el-form-item :label="$t('article.description')">
                        <el-input type="textarea" :placeholder="$t('article.description_placeholder')"
                            v-model="current_article_meta_data.description" autocomplete="off" resize="none"
                            :autoSize="{ minRows: 3, maxRows: 5 }" class="aero-input" />
                    </el-form-item>
                </el-form>
            </el-dialog>
        </div>
    </div>
</template>


<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed, watch } from "vue";
import { ElButton, ElDialog, ElLoading } from 'element-plus';
import { Icon } from 'tdesign-icons-vue-next';

import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus, { isElectronEnv } from '../utils/event-bus';
import { generateDescriptionPrompt, generateTitlePrompt, wholeArticleContextPrompt } from '../utils/prompts';
import { addDialog, countNodes, current_article, current_article_meta_data, current_tex_article, defaultAiChatMessages, latest_view, renderedHtml, searchNode, sync } from "../utils/common-data";
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils';
import { current_outline_tree } from '../utils/common-data';
import LlmDialog from "../components/LlmDialog.vue";
import TitleMenu from '../components/TitleMenu.vue';
import SearchReplaceMenu from "../components/SearchReplaceMenu.vue";
import AiLogo from "../assets/ai-logo.svg";
import AiLogoWhite from "../assets/ai-logo-white.svg";
import { mixColors, themeState } from "../utils/themes";
import { getSetting, setSetting } from "../utils/settings";
import { useI18n } from 'vue-i18n'
import AISuggestion from "../components/AISuggestion.vue";
import "../assets/ai-suggestion.css";
import { getArticleContextMenuItems } from "../components/contextMenus/ArticleContextMenu";
import ContextMenu from "../components/ContextMenu.vue";
const { t } = useI18n();
import * as monaco from "monaco-editor";
import 'monaco-latex';
import { ArrowLeft, ArrowRight, Document, Refresh, ZoomIn, ZoomOut } from "@element-plus/icons-vue";
import { debounce } from 'lodash';
// 状态变量
const genTitleDialogVisible = ref(false);
const genDescriptionDialogVisible = ref(false);
const modifyContentDialogVisible = ref(false);
const continueContentDialogVisible = ref(false);
const modifyAuthorDialogVisible = ref(false);
const searchReplaceDialogVisible = ref(false);
const editor = ref(null);
const editMetaDialogVisible = ref(false); // 编辑元信息对话框
const articleContextMenuItems = ref([]);//右键菜单项

const loadingInstance = ElLoading.service({ fullscreen: false });
const showTitleMenu = ref(false);
const currentTitle = ref("");
const menuPosition = ref({ top: 0, left: 0 });
//屏幕中央显示
const SRMenuPosition = ref({ top: window.innerHeight / 2, left: window.innerWidth / 2 });
const currentTitlePath = ref('');
const contextMenuVisible = ref(false); // 右键菜单可见性
const menuX = ref(0); // 菜单 X 坐标
const menuY = ref(0); // 菜单 Y 坐标
const cur_selection = ref(''); // 当前选中的文本

const editorEl = ref(null);
const triggerSuggestion = ref(false);
const editorKey = ref(Date.now());

// 增量同步缓存
let textBuffer = current_tex_article.value;





const undo = () => editor.value.trigger("keyboard", "undo", null);
const redo = () => editor.value.trigger("keyboard", "redo", null);
const zoomIn = () => {
    const currentFontSize = editor.value.getOption(monaco.editor.EditorOption.fontSize);
    editor.value.updateOptions({ fontSize: currentFontSize + 1 });
}
const zoomOut = () => {
    const currentFontSize = editor.value.getOption(monaco.editor.EditorOption.fontSize);
    editor.value.updateOptions({ fontSize: currentFontSize + 1 });
}
let enableMinimap = true;
let enableRowNumber = true;
const toggleMinimap = () => {
    enableMinimap = !enableMinimap;
    editor.value.updateOptions({
        minimap: { enabled: enableMinimap }
    });
}
const toggleRowNumber = () => {
    enableRowNumber = !enableRowNumber;
    editor.value.updateOptions({
        lineNumbers: enableRowNumber ? 'on' : 'off'
    });
}

const showPdfPanel = ref(true)
const pdfUrl = ref('file:///C:/Users/tange/Documents/如何为你的程序接入大模型.pdf')
const pdfWidth = ref(650)       // PDF 面板默认宽度
let isResizingPdf = ref(false)
const pdfContainer = ref(null);
const canvasWrapper = ref(null);
let isDragging = false;
let startX, startY, offsetX = 0, offsetY = 0;

import * as pdfjsLib from "pdfjs-dist";
let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer

} else {
  webMainCalls();
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}
let currentScale = 1;
async function initPdfJs() {
    const resourcePath = await ipcRenderer.invoke('resources-path')
    pdfjsLib.GlobalWorkerOptions.workerSrc = resourcePath + "/pdf.worker.min.mjs";
    const container = document.querySelector("#pdfContainer");
    
    container.addEventListener("wheel", async (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1; // 上滚放大，下滚缩小
        currentScale = Math.min(Math.max(currentScale + delta, 0.2), 5); // 限制缩放范围
        await renderPage(currentPdfPage.value,currentScale);
    });
      container.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;
    container.classList.add("dragging");
  });

  container.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    offsetX = e.clientX - startX;
    offsetY = e.clientY - startY;
    canvasWrapper.value.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  });

  container.addEventListener("mouseup", () => {
    isDragging = false;
    container.classList.remove("dragging");
  });
    loadPdf(pdfUrl.value);

}
const pdfZoomIn=async ()=>{
        currentScale = Math.min(Math.max(currentScale + 0.1, 0.2), 5); // 限制缩放范围
        await renderPage(currentPdfPage.value,currentScale);
}
const pdfZoomOut=async ()=>{
        currentScale = Math.min(Math.max(currentScale - 0.1, 0.2), 5); // 限制缩放范围
        await renderPage(currentPdfPage.value,currentScale);
}
const pdfZoomReset=async ()=>{
        currentScale = 1
        await renderPage(currentPdfPage.value,currentScale);
}
let pdfDoc;        // pdfjs document
const currentPdfPage = ref(1);
const totalPdfPages = ref(0);
const inputPdfPage = ref(1);

function goPrevPage() {
  if (currentPdfPage.value > 1) {
    currentPdfPage.value--;
    inputPdfPage.value = currentPdfPage.value;
    renderPage(currentPdfPage.value,currentScale);
  }
}

function goNextPage() {
  if (currentPdfPage.value < totalPdfPages.value) {
    currentPdfPage.value++;
    inputPdfPage.value = currentPdfPage.value;
    renderPage(currentPdfPage.value,currentScale);
  }
}

function jumpToPage() {
  let page = Math.min(Math.max(inputPdfPage.value, 1), totalPdfPages.value);
  currentPdfPage.value = page;
  renderPage(page,currentScale);
}

// 渲染 PDF 页面
async function renderPage(pageNumber,scale) {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: scale });
    currentScale = scale;

    
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    // 支持高清显示
    const ratio = window.devicePixelRatio || 1;
    canvas.width = viewport.width * ratio;
    canvas.height = viewport.height * ratio;
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    canvasWrapper.value.innerHTML = ""; // 清空旧的
    canvasWrapper.value.appendChild(canvas);

    await page.render({ canvasContext: context, viewport: viewport }).promise;
}

// 在加载 PDF 后初始化
async function loadPdf(url) {
  const loadingTask = pdfjsLib.getDocument(url);
  pdfDoc = await loadingTask.promise;
  //console.log(pdfDoc.value)
  totalPdfPages.value = pdfDoc.numPages;
  currentPdfPage.value = 1;
  inputPdfPage.value = 1;
  renderPage(1,currentScale);
}
// 切换 PDF 显示
function togglePdf() {
  showPdfPanel.value = !showPdfPanel.value
}

// PDF 拖拽
function startResizePdf(e) {
  isResizingPdf.value = true
  document.addEventListener('mousemove', onResizingPdf)
  document.addEventListener('mouseup', stopResizePdf)
}

function onResizingPdf(e) {
  if (!isResizingPdf.value) return
    const containerLeft = document.querySelector('.resizable-pdf-container').getBoundingClientRect().left
    const newWidth = pdfWidth.value + (containerLeft - e.clientX)  // 反向计算宽度
    pdfWidth.value = Math.min(Math.max(newWidth, 400), 1000)

}

function stopResizePdf() {
  isResizingPdf.value = false
  document.removeEventListener('mousemove', onResizingPdf)
  document.removeEventListener('mouseup', stopResizePdf)
}

const compile = () => {
    console.log("编译 LaTeX");
};

const compileAndShow = () => {
    console.log("编译并显示");
};
function onAcceptSuggestion(text) {
    //console.log("补全已接受:", text);
    insertText(text);
    triggerSuggestion.value = false;
}
function onCancelSuggestion() {
    //console.log("补全已取消");
    triggerSuggestion.value = false;
    //状态不切换回false,保持为true
}
function onResetSuggestion() {
    //console.log("补全已重置");
    //triggerSuggestion.value = false;
}

// 监听输入 -> 1秒后触发
let debounceTimer = null;
function trytriggerSuggestion() {
    triggerSuggestion.value = false;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        triggerSuggestion.value = true;
    }, 500);

}


// 打开右键菜单
const openContextMenu = (event) => {
    event.preventDefault();
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    contextMenuVisible.value = true;
    cur_selection.value = getSelection();
};

// 获取选中的文本
const getSelection = () => {
    const selection = editor.value.getSelection(); // Range 对象
    return editor.value.getModel().getValueInRange(selection); // 返回选中的字符串
};

// 插入文本到编辑器
const insertText = (text) => {
    const selection = editor.value.getSelection();
    const id = { major: 1, minor: 1 }; // 编辑器操作 ID，可任意
    const op = {
        range: selection,
        text: text,
        forceMoveMarkers: true
    };
    editor.value.executeEdits('insert-text', [op], [selection]); // 插入文本
};

// 菜单项点击事件处理
const handleMenuClick = async (item) => {
    switch (item) {
        case 'ai-assistant':
            let text = current_article.value;
            const bypassCodeBlock = await getSetting('bypassCodeBlock');
            if (bypassCodeBlock) {
                text = text.replace(/```[\s\S]*?```/g, '');
            }
            let messages = []
            messages.push({
                role: 'system',
                content: wholeArticleContextPrompt(text)
            })
            messages.push({
                role: 'assistant',
                content: t('article.ai_understood')
            })
            const newDialog = {
                title: t('article.ai_analyze_title'),
                messages: messages
            };
            //console.log(newDialog)
            addDialog(newDialog, true)
            eventBus.emit('ai-chat')
            break;
        case 'cut':
            insertText("a");
            await navigator.clipboard.writeText(cur_selection.value);
            break;
        case 'copy':
            await navigator.clipboard.writeText(cur_selection.value);
            break;
        case 'paste':
            const txt2paste = await navigator.clipboard.readText();
            insertText(txt2paste);
            break;
        case 'openAutoCompletion':
            await setSetting("autoCompletion", true);
            break;
        case 'closeAutoCompletion':
            await setSetting("autoCompletion", false);
            break;
        case 'openKnowledgeBase':
            await setSetting("enableKnowledgeBase", true);
            break;
        case 'closeKnowledgeBase':
            await setSetting("enableKnowledgeBase", false);
            break;

    }
    await refreshContextMenu();
    contextMenuVisible.value = false;
};

// 更新编辑器内容
const showMetaDialog = () => {
    editMetaDialogVisible.value = true;
};

// 刷新文章内容
eventBus.on('refresh', () => {
    // 1. 先清理旧的
    // if (editor.value) {           // editor.value 是 Monaco 实例
    //     try {
    //         const oldModel = editor.value.getModel(); // 获取模型
    //         editor.value.dispose();                  // 销毁 Monaco 实例
    //         if (oldModel) oldModel.dispose();       // 销毁模型
    //     } catch (e) {
    //         console.warn("释放 Monaco 实例失败：", e);
    //     }
    //     editor.value = null;
    // }
    resetEditor();

});
const resetEditor = () => {
    disposeEditor();
    editorKey.value = Date.now(); // Vue 会销毁原 DOM，创建新 DOM
    nextTick(() => initEditor());
};

eventBus.on('search-replace', () => {
    //console.log('search-replace');
    searchReplaceDialogVisible.value = true;
});



// 定义右侧元信息面板的宽度
const metaInfoWidth = ref(300)  // 初始宽度为300px
let isResizing = ref(false)     // 是否正在调整宽度

// 开始拖动
function startResize(e) {
    isResizing.value = true
    // 添加鼠标移动和释放事件监听
    document.addEventListener('mousemove', onResizing)
    document.addEventListener('mouseup', stopResize)
}

// 拖动时更新宽度
function onResizing(e) {
    if (isResizing.value) {
        const containerLeft = document.querySelector('.resizable-container').getBoundingClientRect().left
        const newWidth = metaInfoWidth.value + (containerLeft - e.clientX)  // 反向计算宽度
        metaInfoWidth.value = Math.min(Math.max(newWidth, 200), 600)
    }
}

// 停止拖动
function stopResize() {
    isResizing.value = false
    document.removeEventListener('mousemove', onResizing)
    document.removeEventListener('mouseup', stopResize)
}


const refreshContextMenu = async () => {
    articleContextMenuItems.value = await getArticleContextMenuItems();
}

// 注册 LaTeX
monaco.languages.register({ id: 'latex' });
monaco.languages.setMonarchTokensProvider('latex', {
    defaultToken: '',
    tokenPostfix: '.tex',

    // 这里是关键，必须有 tokenizer 对象
    tokenizer: {
        root: [
            [/\\[a-zA-Z]+/, 'keyword'],      // LaTeX 命令
            [/%.*$/, 'comment'],             // 注释
            [/\$[^$]*\$/, 'string'],         // 行内公式
            [/{|}/, 'delimiter'],            // 花括号
            [/\[|\]/, 'delimiter'],          // 中括号
            [/[^\s]+/, '']                   // 其他文本
        ]
    }
});

let contentChangeListener = null;
const disposeEditor = () => {
    if (editor.value) {
        try {
            // 1. 移除监听
            if (contentChangeListener) {
                contentChangeListener.dispose();
                contentChangeListener = null;
                //console.log("移除监听成功")
            }

            // 2. 保存引用的 model
            const oldModel = editor.value.getModel();

            // 3. 释放 Monaco 实例
            // editor.value.dispose();
            // editor.value = null;
            // console.log("释放Monaco成功")
            // 4. 释放模型
            if (oldModel) oldModel.dispose();
            console.log("释放模型成功")
            // 5. 清空 textBuffer
            textBuffer = "";
        } catch (e) {
            console.warn("安全释放 Monaco 实例失败:", e);
        }
    }
};

const initEditor = () => {
    editor.value = monaco.editor.create(editorEl.value, {
        value: current_tex_article.value,
        language: "latex", // 语言模式
        theme: themeState.currentTheme.type === 'dark' ? "vs-dark" : "vs",  // 主题 (vs, vs-dark, hc-black)
        mouseWheelZoom: true,
        automaticLayout: true, // 自动适应容器大小
        fontSize: 14,
        lineNumbers: enableRowNumber ? 'on' : 'off',
        minimap: { enabled: enableMinimap }
    })
    // 增量监听
    contentChangeListener = editor.value.onDidChangeModelContent((event) => {
        event.changes.forEach((change) => {
            // change.rangeOffset: 变化起始位置
            // change.rangeLength: 被替换的长度
            // change.text: 新插入的文本
            textBuffer =
                textBuffer.slice(0, change.rangeOffset) +
                change.text +
                textBuffer.slice(change.rangeOffset + change.rangeLength);
        });

        // 按需同步到 Vue 响应式变量，比如防抖或定时同步
        debounceSync();
    });
    const debounceSync = debounce(() => {
        //console.log("已同步")
        current_tex_article.value = textBuffer;
        sync();
    }, 100);

}
onMounted(async () => {
    try {
        await refreshContextMenu();
        initEditor();
        eventBus.on('sync-editor-theme', () => {
            const isDark = themeState.currentTheme.type === 'dark';
            const themeName = isDark ? 'vs-dark' : 'vs';
            //monaco.editor.setTheme(themeName);
            const toMonacoColor = (color) => color.replace('#', '') || 'FFFFFF';
            const deeperColor=(color)=>{
                if(isDark)return mixColors(color,'#000000',0.3)
                else return mixColors(color,'#FFFFFF',0.3)
            }
            monaco.editor.defineTheme('myCustomTheme', {
                base: themeName,
                inherit: true, // 继承基础主题
                rules: [
                    {
                        token: '',
                        background: toMonacoColor(deeperColor(themeState.currentTheme.background)),
                        fontStyle: ''
                    }
                ],
                colors: {
                    'editor.background': deeperColor(themeState.currentTheme.background),
                }
            });
            monaco.editor.setTheme('myCustomTheme');
        })
        eventBus.emit('sync-editor-theme')
        initPdfJs();
    }
    catch (e) {
        console.error(e);
        eventBus.emit('show-error',
            t('article.latex_init_failed') + e
        );
    }
    finally {
        loadingInstance.close();
    }
});

// 清理资源
onBeforeUnmount(() => {
    eventBus.emit('is-need-save', true)
    try {
        // if(editor.value){
        //     editor.value.dispose();
        //     editor.value=null;
        // }
    }
    catch (e) {
        console.log(e)
    }
});


</script>

<style scoped>
.pdf-container {
  width: 100%;
  height: 100%;
  overflow: hidden;   /* 防止 canvas 溢出 */
  position: relative;
  cursor: grab;
}

.pdf-container.dragging {
  cursor: grabbing;
}

.canvas-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0; /* 缩放从左上角开始 */
}
.pdf-toolbar {
  z-index: 10;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.pdf-preview-container {
  position: relative;
  height: 100%;
}

.pdf-empty-text {
  color: #999;
  font-weight: normal;
}
.pdf-empty-text {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;  /* 水平居中 */
    align-items: center;      /* 垂直居中 */
    user-select: none;        /* 禁止选中 */
    pointer-events: none;     /* 防止交互（可选） */
    margin: 0;                /* 移除默认 margin */
    font-size: 1.1rem;        /* 可根据需要调整字体大小 */
    color: var(--text-color, #999); /* 可设置默认灰色 */
    text-align: center;
}
.editor-pdf-wrapper {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
}
.pdf-preview-container {
  border-left: 1px solid #bbb;
  height: 100%;
}
/* 顶部菜单栏 */

.meta-info-menu {
    display: flex;
    justify-content: center;
    align-items: center;
    align-self: center;
}

.footer-menu {
    display: flex;
    justify-content: center;
    align-items: center;
    border-top: 1px solid #bbb;
}

.content-container {
    display: flex;
    flex-direction: row;
    max-height: 90vh;
    height: 90vh;
}
.editor-pdf-container{
    display: flex;
    flex-direction: row;
    height:100%;
}
.latex-editor-container {
    flex: 1;
    /* 占满剩余空间 */
    display: flex;
    flex-direction: column;
    min-width: 200px;
    /* 防止过窄 */
}

.toolbar {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid #bbb;
    gap: 8px;
    flex-shrink: 0;
}

.toolbar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    cursor: pointer;

    border-radius: 4px;
    transition: background-color 0.2s;
}
.pdf-toolbar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 5px;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.toolbar-icon:hover {
    background-color: rgba(0, 0, 0, 0.05);
}

.editor {
    flex: 1;
    overflow: hidden;
    min-width: 200px;
}

/* 左边的编辑器样式 */

/* 右边的元信息样式 */
.meta-info {
    color: black;
    flex: 1;
    /* 占20% */
    overflow: hidden;
    box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.1);
    padding: 5px;
}

.resizable-container {
    display: flex;
    height: 100%;
    position: relative;
}
.resizable-pdf-container {
    display: flex;
    height: 100%;
    position: relative;
}
.meta-info {
    min-width: 200px;
    max-width: 600px;
    overflow: auto;
}

.resizer {
    width: 5px;
    cursor: col-resize;
    background-color: #55555555;
    height: 100%;
    position: relative;
}


/* 底部菜单样式 */
.footer-menu {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    border-top: 1px solid #bbb;
}

.context-menu {
    position: fixed;
    z-index: 1000;
}
</style>
