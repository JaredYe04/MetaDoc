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
            <AISuggestion :targetEl="editorEl" :trigger="triggerSuggestion" :rootNodeClass="'view-lines'"
                :context="suggestionContext" 
                @accepted="onAcceptSuggestion" @cancelled="onCancelSuggestion" @reset="onResetSuggestion" 
                @triggerSuggestion="trytriggerSuggestion"/>

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

                    <el-tooltip :content="$t('latexEditor.toolbar.showPdf')" placement="bottom">
                        <div class="toolbar-icon" @click="togglePdf">
                            <icon name="terminal" />
                        </div>
                    </el-tooltip>

                    <el-tooltip :content="$t('latexEditor.toolbar.showConsole')" placement="bottom">
                        <div class="toolbar-icon" @click="toggleConsole">
                            <icon name="terminal-rectangle" />
                        </div>
                    </el-tooltip>
                    <el-tooltip :content="$t('latexEditor.toolbar.compile')" placement="bottom">
                        <div class="toolbar-icon" @click="compile">
                            <icon name="code" />
                        </div>
                    </el-tooltip>
                </div>
                <div class="editor-pdf-container">
                    <div class="editor-console-container">
                        <!-- Monaco 编辑器 -->
                        <div class="editor" :key="editorKey" ref="editorEl">
                        </div>
                          <!-- Console 面板，绝对定位叠加 -->
                    <div v-show="showConsole" class="console-wrapper" :style="{ height: consoleHeight + 'px' }">
                        <div class="editor-resizer" @mousedown="startResizeConsole"></div>
                        <div class="console-panel" :style="{
                            background:themeState.currentTheme.background
                        }">
                        <Console />
                        </div>
                    </div>

                    </div>
                    <!-- 可调整宽度的 PDF 预览面板 -->
                    <keep-alive>
                        <div class="resizable-pdf-container" v-show="showPdfPanel">
                            <div class="resizer" @mousedown="startResizePdf"></div>
                            <div class="pdf-preview-container"
                                :style="{ width: pdfWidth + 'px', background: themeState.currentTheme.background }">
                                <!-- <iframe v-if="pdfUrl" :src="pdfUrl" frameborder="0"
                                style="width:100%; height:100%;"></iframe> -->
                                <!-- PDF 页码控制条 -->
                                <div class="pdf-toolbar" v-if="pdfUrl"
                                    style="display:flex; align-items:center; justify-content:flex-start; padding:4px 8px; " :style="{
                                        backgroundColor:themeState.currentTheme.editorToolbarBackgroundColor
                                    }">
                                    <el-button size="small" @click="goPrevPage" :disabled="currentPdfPage <= 1">
                                        {{ $t('latexEditor.prevPage') }}
                                    </el-button>

                                    <el-button size="small" @click="goNextPage"
                                        :disabled="currentPdfPage >= totalPdfPages">
                                        {{ $t('latexEditor.nextPage') }}
                                    </el-button>

                                    <span style="margin-left:8px; display:flex; align-items:center;">
                                        <input type="number" v-model.number="inputPdfPage" @change="jumpToPage" :min="1"
                                            :max="totalPdfPages"
                                            style="width:50px; text-align:center; margin-right:4px;" />
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
                                                <Refresh />
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
                    </keep-alive>

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
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed, watch, onUnmounted } from "vue";
import { ElButton, ElDialog, ElLoading } from 'element-plus';
import { Icon } from 'tdesign-icons-vue-next';

import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus, { isElectronEnv } from '../utils/event-bus';
import { generateDescriptionPrompt, generateTitlePrompt, wholeArticleContextPrompt } from '../utils/prompts';
import { addDialog, countNodes, current_article, current_article_meta_data, current_file_path, current_tex_article, defaultAiChatMessages, latest_view, renderedHtml, searchNode, sync } from "../utils/common-data";
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
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

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
const showConsole = ref(true)
const pdfUrl = ref('file:///')
const pdfWidth = ref(650)       // PDF 面板默认宽度
let isResizingPdf = ref(false)
const pdfContainer = ref(null);
const canvasWrapper = ref(null);
let isDragging = false;
let startX, startY, offsetX = 0, offsetY = 0;

import * as pdfjsLib from "pdfjs-dist";
import Console from "../components/Console.vue";
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
        await renderPage(currentPdfPage.value, currentScale);
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
    if(current_file_path.value &&current_file_path.value.toLowerCase().endsWith(".tex")){
        pdfUrl.value=`file:///${current_file_path.value.toLowerCase().replace('.tex','.pdf')}`;
    }else{
        pdfUrl.value="";
    }
    loadPdf(pdfUrl.value);

}
const pdfZoomIn = async () => {
    currentScale = Math.min(Math.max(currentScale + 0.1, 0.2), 5); // 限制缩放范围
    await renderPage(currentPdfPage.value, currentScale);
}
const pdfZoomOut = async () => {
    currentScale = Math.min(Math.max(currentScale - 0.1, 0.2), 5); // 限制缩放范围
    await renderPage(currentPdfPage.value, currentScale);
}
const pdfZoomReset = async () => {
    currentScale = 1
    await renderPage(currentPdfPage.value, currentScale);
}
let pdfDoc;        // pdfjs document
const currentPdfPage = ref(1);
const totalPdfPages = ref(0);
const inputPdfPage = ref(1);

function goPrevPage() {
    if (currentPdfPage.value > 1) {
        currentPdfPage.value--;
        inputPdfPage.value = currentPdfPage.value;
        renderPage(currentPdfPage.value, currentScale);
    }
}

function goNextPage() {
    if (currentPdfPage.value < totalPdfPages.value) {
        currentPdfPage.value++;
        inputPdfPage.value = currentPdfPage.value;
        renderPage(currentPdfPage.value, currentScale);
    }
}

function jumpToPage() {
    let page = Math.min(Math.max(inputPdfPage.value, 1), totalPdfPages.value);
    currentPdfPage.value = page;
    renderPage(page, currentScale);
}

// 渲染 PDF 页面
async function renderPage(pageNumber, scale) {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(pageNumber);

  // 根据缩放计算 viewport
  const viewport = page.getViewport({ scale });
  currentScale = scale;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  // 高清渲染：乘以设备像素比
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);

  // 保持样式为逻辑像素，避免 CSS 再次缩放导致模糊
  canvas.style.width = Math.floor(viewport.width) + "px";
  canvas.style.height = Math.floor(viewport.height) + "px";

  // 缩放 context，使得 1 CSS 像素 = ratio 个物理像素
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  // 清空旧 canvas
  canvasWrapper.value.innerHTML = "";
  canvasWrapper.value.appendChild(canvas);

  // 渲染 PDF
  await page.render({ canvasContext: context, viewport }).promise;
}


// 在加载 PDF 后初始化
async function loadPdf(url) {
    const loadingTask = pdfjsLib.getDocument(url);
    pdfDoc = await loadingTask.promise;
    //console.log(pdfDoc.value)
    totalPdfPages.value = pdfDoc.numPages;
    currentPdfPage.value = 1;
    inputPdfPage.value = 1;
    renderPage(1, currentScale);
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

const compile = async () => {
    eventBus.emit('clear-console')

    if(current_file_path.value==null||!current_file_path.value.toLowerCase().endsWith(".tex")){
        eventBus.emit("show-info",t("latexEditor.notification.pleaseSaveFirst"));
        return;
    }
    triggerSuggestion.value = false;//开始编译的时候就不能修改了
    editor.value.updateOptions({
        readOnly: true
    });
    const compileResult = await ipcRenderer.invoke("compile-tex",{
        texPath:current_file_path.value,
        outputDir:""//todo:用户后续可以设置保存在哪
    })
    editor.value.updateOptions({
        readOnly: false
    });
    //console.log(compileResult)
    if(compileResult.status==='success'){
        eventBus.emit("show-success",t("latexEditor.notification.compileSuccess"));
        pdfUrl.value=(`file:///${compileResult.pdfPath}`);
        
        loadPdf(pdfUrl.value)
    }
    else{
        eventBus.emit("show-error",t("latexEditor.notification.compileFailed",{ code:compileResult.code }));
    }
    //console.log("编译 LaTeX");
};

const toggleConsole = async () => {
    showConsole.value=!showConsole.value;
};




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

// 插入文本到当前光标位置（支持多行）
const insertText = (text) => {
  const editorInstance = monaco.editor.getEditors()[0];
  if (!editorInstance) return;

  const position = editorInstance.getPosition();
  if (!position) return;

  // 构造插入范围
  const range = new monaco.Range(
    position.lineNumber,
    position.column,
    position.lineNumber,
    position.column
  );

  // 执行插入
  editorInstance.executeEdits("ai-insert", [
    {
      range,
      text,
      forceMoveMarkers: true
    }
  ]);

  // 计算新光标位置（考虑多行情况）
  const lines = text.split("\n");
  const lastLine = lines[lines.length - 1];
  const newPosition =
    lines.length === 1
      ? {
          lineNumber: position.lineNumber,
          column: position.column + lastLine.length
        }
      : {
          lineNumber: position.lineNumber + lines.length - 1,
          column: lastLine.length + 1
        };

  // 设置光标位置并滚动到可见区域
  editorInstance.setPosition(newPosition);
  editorInstance.revealPositionInCenter(newPosition);
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




const consoleHeight = ref(200);
let isResizingConsole = false;

function startResizeConsole(e) {
  if (!showConsole.value) return;
  isResizingConsole = true;
  document.addEventListener('mousemove', onResizingConsole);
  document.addEventListener('mouseup', stopResizeConsole);
}

function onResizingConsole(e) {
  if (!isResizingConsole) return;
  const container = document.querySelector('.editor-console-container');
  const containerRect = container.getBoundingClientRect();

  // 底部向上拖拽调整高度
  const newHeight = containerRect.bottom - e.clientY;
  consoleHeight.value = Math.min(Math.max(newHeight, 100), containerRect.height - 50);
}

function stopResizeConsole() {
  isResizingConsole = false;
  document.removeEventListener('mousemove', onResizingConsole);
  document.removeEventListener('mouseup', stopResizeConsole);
}

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
            //console.log("释放模型成功")
            // 5. 清空 textBuffer
            textBuffer = "";
        } catch (e) {
            console.warn("安全释放 Monaco 实例失败:", e);
        }
    }
};

const initEditor = () => {
    window.MonacoEnvironment = {
        getWorker: function (moduleId, label) {
            let workerPath = '';

            switch (label) {
                case 'json':
                    workerPath = 'http://localhost:3000/monaco/language/json/json.worker.js';
                    break;
                case 'css':
                case 'scss':
                case 'less':
                    workerPath = 'http://localhost:3000/monaco/language/css/css.worker.js';
                    break;
                case 'html':
                case 'handlebars':
                case 'razor':
                    workerPath = 'http://localhost:3000/monaco/language/html/html.worker.js';
                    break;
                case 'typescript':
                case 'javascript':
                    workerPath = 'http://localhost:3000/monaco/language/typescript/ts.worker.js';
                    break;
                default:
                    workerPath = 'http://localhost:3000/monaco/editor/editor.worker.js';
            }

            // ESM worker: 用 import() 动态导入
            const blob = new Blob(
                [`import("${workerPath}");`],
                { type: 'application/javascript' }
            );

            return new Worker(URL.createObjectURL(blob), { type: 'module' });
        }
    };

    editor.value = monaco.editor.create(editorEl.value, {
        value: current_tex_article.value,
        language: "latex", // 语言模式
        theme: themeState.currentTheme.type === 'dark' ? "vs-dark" : "vs",  // 主题 (vs, vs-dark, hc-black)
        mouseWheelZoom: true,
        automaticLayout: true, // 自动适应容器大小
        fontSize: 14,
        wordWrap: "on",  // 自动换行
        wordWrapMinified: true, // 对于 minified 文件也自动换行
        wrappingIndent: "same", // 缩进方式，"none" | "same" | "indent" | "deepIndent"
        lineNumbers: enableRowNumber ? 'on' : 'off',
        minimap: { enabled: enableMinimap }
    })
    //editor.value.onKeyDown((e)=>console.log(e));
    // 增量监听
    contentChangeListener = editor.value.onDidChangeModelContent((event) => {
        // 先保存原始文本
        let oldText = textBuffer;

    // 使用原始旧文本作为基底
    let newText = textBuffer;

    // 按 **从后到前** 的顺序应用 changes，避免偏移被修改
    for (let i = event.changes.length - 1; i >= 0; i--) {
      const change = event.changes[i];
      const start = change.rangeOffset;
      const end = start + change.rangeLength;
      newText = newText.slice(0, start) + change.text + newText.slice(end);
    }

    // 更新缓存（完整文本）
    textBuffer = newText;

        
        // 按需同步到 Vue 响应式变量，比如防抖或定时同步
        debounceSync();
        
    });
    const debounceSync = debounce(() => {
        triggerSuggestion.value = false;
        if(current_tex_article.value!==textBuffer){
            current_tex_article.value = textBuffer;
            //initiativeSuggestion.value=true;
            //trytriggerSuggestion();//等文章内容更新之后再尝试补全
            //console.log("建议已刷新")
        }
        else{
            //console.log(textBuffer)
        }
        
        sync();
    }, 100);
    eventBus.emit("monaco-ready")
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
            const deeperColor = (color) => {
                if (isDark) return mixColors(color, '#000000', 0.3)
                else return mixColors(color, '#FFFFFF', 0.3)
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
onUnmounted(() => {
    eventBus.emit('is-need-save', true)
    try {
        const editors = monaco.editor.getEditors();

        // 遍历销毁
        editors.forEach(editor => {
            editor.dispose(); // 释放 editor 的所有资源，包括模型、事件监听等
        });
    }
    catch (e) {
        console.log(e)
    }
});

const triggerSuggestion = ref(false);

function onAcceptSuggestion(text) {
    //console.log("补全已接受:", text);
    //insertText(text);
    //AISuggestion已经帮忙插入了
    triggerSuggestion.value = false;
}
function onCancelSuggestion() {
    //console.log("补全已取消");
    triggerSuggestion.value = false;
    //initiativeSuggestion.value=false;
    //状态不切换回false,保持为true
}
function onResetSuggestion() {
    //console.log("补全已重置");
    triggerSuggestion.value = false;
}

// 监听输入 -> 1秒后触发
const suggestionContext=ref({
    preContext:"",
    postContext:""
})
// 控制是否主动触发补全
//const initiativeSuggestion = ref(true);
let suggestionTimer = null; // AI suggestion 专用防抖
function getSuggestionContext(contextSize=1000){
    const model = editor.value.getModel();
    //console.log(selection)

    const sel = editor.value.getSelection();
    // 选择 caret 位置：若是折叠（无选区）用 start，若有选区，默认用 end（caret 通常在 end）
    const isCollapsed = (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn);
    const caretLine = isCollapsed ? sel.startLineNumber : sel.endLineNumber;
    const caretColumn = isCollapsed ? sel.startColumn : sel.endColumn;
    //console.log("caretColumn")
        // 把位置转为 offset（字符索引）
    const caretPos = { lineNumber: caretLine, column: caretColumn };
    const caretOffset = model.getOffsetAt(caretPos);
    //console.log("caretOffset")
    const fullLength = model.getOffsetAt(model.getFullModelRange().getEndPosition());;
    //console.log("fullLength",fullLength)
    const startOffset = Math.max(0, caretOffset - contextSize);
    const endOffset = Math.min(fullLength, caretOffset + contextSize);
    // console.log(startOffset)
    // console.log(endOffset)
    const fullText = current_tex_article.value || "";
    suggestionContext.value.preContext = fullText.slice(startOffset, caretOffset);
    suggestionContext.value.postContext = fullText.slice(caretOffset, endOffset);
}
function trytriggerSuggestion() {
    //console.log("尝试触发Suggestion")
    // AI suggestion 防抖逻辑
    
    //if (initiativeSuggestion.value ==false) return;//只生成一次，不是这里的问题
    triggerSuggestion.value = false;
    if (suggestionTimer) clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(() => {
        triggerSuggestion.value = false;
        getSuggestionContext();
        //console.log("触发Suggestion")
        triggerSuggestion.value = true;
    }, 1500); // 1.5 秒防抖


}
// 监听输入 -> 1秒后触发

</script>

<style scoped>
/* .editor {
    flex: 1;
} */
.editor-console-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--editor-background);
}

.editor {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 0;
}

.console-wrapper {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: var(--console-background);
  box-shadow: 0 -2px 6px rgba(0,0,0,0.3);
}

.console-panel {
  flex: 1;
  overflow: auto;
  z-index: 1000;
}

.editor-resizer {
  height: 2px;
  cursor: row-resize;
}
/* .editor-console-container {
flex: 1;
overflow: hidden;
min-width: 200px;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  width: 100%;
} */



/* 拖拽条 */
/* .editor-resizer {
  height: 5px;
  cursor: row-resize;
} */

/* Console 区域 */
/* .console-panel {
  flex: 1;
  min-height: 50px;
  max-height:600px;
  height: var(--console-height, 200px);
  overflow: auto;
  position: relative;
} */
.pdf-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    /* 防止 canvas 溢出 */
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
    transform-origin: 0 0;
    /* 缩放从左上角开始 */
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
    justify-content: center;
    /* 水平居中 */
    align-items: center;
    /* 垂直居中 */
    user-select: none;
    /* 禁止选中 */
    pointer-events: none;
    /* 防止交互（可选） */
    margin: 0;
    /* 移除默认 margin */
    font-size: 1.1rem;
    /* 可根据需要调整字体大小 */
    color: var(--text-color, #999);
    /* 可设置默认灰色 */
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

.editor-pdf-container {
    display: flex;
    flex-direction: row;
    height: 100%;
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
