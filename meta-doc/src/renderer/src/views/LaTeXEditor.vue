<template>
    <div class="main-container">
        <div class="content-container">

            <!-- 菜单组件 -->
            <TitleMenu v-if="showTitleMenu" :title="currentTitle.replaceAll('#', '').trim()" :position="menuPosition"
                @close="handleTitleMenuClose" :path="currentTitlePath"
                :tree="extractOutlineTreeFromMarkdown(currentMarkdown, true)"
                @accept="async (payload) => { await acceptGeneratedText(payload); }" style="max-width: 500px;" />
            <SearchReplaceMenu
                v-if="searchReplaceDialogVisible"
                :adapter="textEditorAdapter"
                :position="SRMenuPosition"
                @close="handleSearchReplaceClose"
            />

            <!-- 右键菜单组件 -->
            <ContextMenu :x="menuX" :y="menuY" :items="articleContextMenuItems"
                v-if="contextMenuVisible" @trigger="handleMenuClick" class="context-menu"
                @close="contextMenuVisible = false;" />
            <AISuggestion :targetEl="editorEl" :trigger="triggerSuggestion" :rootNodeClass="'view-lines'"
                :context="suggestionContext" 
                @accepted="onAcceptSuggestion" @cancelled="onCancelSuggestion" @reset="onResetSuggestion" 
                @triggerSuggestion="trytriggerSuggestion"/>

            <div class="latex-layout">
                <ResizableContainer
                    direction="vertical"
                    :initial-sidebar-size="LATEX_LAYOUT.meta.initialWidth"
                    :min-size="LATEX_LAYOUT.meta.minWidth"
                    :max-size="LATEX_LAYOUT.meta.maxWidth"
                    :reverse="true"
                    sidebar-position="end"
                >
                    <template #main>
                        <div class="latex-main" ref="mainContainerRef">
                            <ResizableContainer
                                ref="pdfResizableRef"
                                direction="vertical"
                                :initial-sidebar-size="LATEX_LAYOUT.pdf.minWidth"
                                :min-size="LATEX_LAYOUT.pdf.minWidth"
                                :max-size="
                                    mainWidth > 0
                                        ? Math.max(
                                            LATEX_LAYOUT.pdf.minWidth,
                                            Math.min(
                                                mainWidth * LATEX_LAYOUT.pdf.maxRatio,
                                                mainWidth - LATEX_LAYOUT.left.minWidth
                                            )
                                        )
                                        : LATEX_LAYOUT.pdf.minWidth
                                "
                                sidebar-position="end"
                                :show-sidebar="showPdfPanel"
                                @resize="handlePdfResize"
                            >
                                <template #main>
                                    <div class="latex-column left-column">
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
                                <div class="editor-console-container">
                                    <div class="editor" :key="editorKey" :id="editorDomId" ref="editorEl"
                                        @contextmenu.prevent="openContextMenu($event)"></div>
                                    <div v-show="showConsole" class="console-wrapper" :style="{ height: consoleHeight + 'px' }">
                                        <div class="editor-resizer" @mousedown="startResizeConsole"></div>
                                        <div class="console-panel" :style="{
                                            background: themeState.currentTheme.background
                                        }">
                                            <Console console-key="latex" />
                                        </div>
                                    </div>
                                </div>
                                </div>
                                </template>

                                <template #sidebar>
                                    <keep-alive>
                                        <div class="latex-column pdf-column" v-show="showPdfPanel">
                                            <div class="pdf-toolbar" v-if="pdfUrl"
                                                :style="{
                                                    backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor
                                                }">
                                                <el-button size="small" @click="goPrevPage" :disabled="currentPdfPage <= 1">
                                                    {{ $t('latexEditor.prevPage') }}
                                                </el-button>

                                                <el-button size="small" @click="goNextPage"
                                                    :disabled="currentPdfPage >= totalPdfPages">
                                                    {{ $t('latexEditor.nextPage') }}
                                                </el-button>

                                                <span class="pdf-toolbar__page">
                                                    <input type="number" v-model.number="inputPdfPage" @change="jumpToPage" :min="1"
                                                        :max="totalPdfPages"
                                                    />
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

                                            <div class="pdf-preview-container"
                                                :style="{ background: themeState.currentTheme.background }">
                                                <div ref="pdfContainer" id="pdfContainer" v-if="pdfUrl" class="pdf-container">
                                                    <div class="canvas-wrapper" ref="canvasWrapper"></div>
                                                </div>
                                                <h3 v-else class="pdf-empty-text">
                                                    {{ $t('latexEditor.pdfEmpty') }}
                                                </h3>
                                            </div>
                                        </div>
                                    </keep-alive>
                                </template>
                            </ResizableContainer>
                        </div>
                    </template>

                    <template #sidebar>
                        <div
                            class="latex-column meta-column"
                            :style="{ backgroundColor: themeState.currentTheme.background2nd }"
                        >
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
                                    {{ currentMeta.title || $t('article.no_title') }}
                                </h1>
                            </el-tooltip>

                            <LlmDialog v-if="genTitleDialogVisible"
                                :prompt="generateTitlePrompt(JSON.stringify(extractOutlineTreeFromMarkdown(currentMarkdown, true)))"
                                :title="$t('article.generate_title')" :llmConfig="{ max_tokens: 15, temperature: 0.0 }"
                                @llm-content-accept="(content) => {
                                    updateMeta((meta) => { meta.title = content; });
                                    genTitleDialogVisible = false;
                                }" @update:visible="genTitleDialogVisible = $event; genTitleDialogVisible = false"
                                :defaultText="currentMeta.title" :defaultInputSize="1"></LlmDialog>

                            <el-tooltip :content="$t('article.click_to_edit_author')" placement="left">
                                <p @click="modifyAuthorDialogVisible = !modifyAuthorDialogVisible" class="interactive-text"
                                    :style="{ color: themeState.currentTheme.textColor }">
                                    <strong>{{ $t('article.author') }}：</strong>
                                    {{ currentMeta.author || $t('article.no_author') }}
                                </p>
                            </el-tooltip>

                            <LlmDialog v-if="modifyAuthorDialogVisible" :prompt="''" :title="$t('article.modify_author')"
                                :llmConfig="{}" @llm-content-accept="(content) => {
                                    updateMeta((meta) => { meta.author = content; });
                                    modifyAuthorDialogVisible = false;
                                }" @update:visible="modifyAuthorDialogVisible = $event; modifyAuthorDialogVisible = false"
                                :defaultText="currentMeta.author" :defaultInputSize="1"></LlmDialog>

                            <el-tooltip :content="$t('article.click_to_edit_description')" placement="left">
                                <p @click="genDescriptionDialogVisible = !genDescriptionDialogVisible" class="interactive-text"
                                    :style="{ color: themeState.currentTheme.textColor }">
                                    <strong>{{ $t('article.description') }}：</strong>
                                    {{ currentMeta.description || $t('article.no_description') }}
                                </p>
                            </el-tooltip>

                            <LlmDialog v-if="genDescriptionDialogVisible"
                                :prompt="generateDescriptionPrompt(JSON.stringify(extractOutlineTreeFromMarkdown(currentMarkdown, true)))"
                                :title="$t('article.generate_description')" :llmConfig="{ max_tokens: 100, temperature: 0.0 }"
                                @llm-content-accept="(content) => {
                                    updateMeta((meta) => { meta.description = content; });
                                    genDescriptionDialogVisible = false;
                                }" @update:visible="genDescriptionDialogVisible = $event; genDescriptionDialogVisible = false"
                                :defaultText="currentMeta.description" :defaultInputSize="10"></LlmDialog>
                        </div>
                    </template>
                </ResizableContainer>
            </div>

            <el-dialog v-model="editMetaDialogVisible" :title="$t('article.edit_meta_info')" width="30%">
                <el-form>
                    <el-form-item :label="$t('article.title')">
                        <el-input
                            :model-value="currentMeta.title"
                            @update:model-value="(val) => updateMeta((meta) => { meta.title = val; })"
                            autocomplete="off"
                            class="aero-input"
                        />
                    </el-form-item>
                    <el-form-item :label="$t('article.author')">
                        <el-input
                            :model-value="currentMeta.author"
                            @update:model-value="(val) => updateMeta((meta) => { meta.author = val; })"
                            autocomplete="off"
                            class="aero-input"
                        />
                    </el-form-item>
                    <el-form-item :label="$t('article.description')">
                        <el-input
                            type="textarea"
                            :placeholder="$t('article.description_placeholder')"
                            :model-value="currentMeta.description"
                            @update:model-value="(val) => updateMeta((meta) => { meta.description = val; })"
                            autocomplete="off"
                            resize="none"
                            :autoSize="{ minRows: 3, maxRows: 5 }"
                            class="aero-input"
                        />
                    </el-form-item>
                </el-form>
            </el-dialog>
        </div>
    </div>
</template>


<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed, watch, onUnmounted, shallowRef } from "vue";
import { ElButton, ElDialog, ElLoading } from 'element-plus';
import { Icon } from 'tdesign-icons-vue-next';

import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus, { getWindowType, sendBroadcast } from '../utils/event-bus';
import { generateDescriptionPrompt, generateTitlePrompt, wholeArticleContextPrompt } from '../utils/prompts';
import { searchNode } from "../utils/outline-helpers";
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils';
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
import ResizableContainer from "../components/base/ResizableContainer.vue";
import { getArticleContextMenuItems } from "../components/contextMenus/ArticleContextMenu";
import ContextMenu from "../components/ContextMenu.vue";
import Console from "../components/Console.vue";
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { createRendererLogger } from '../utils/logger.ts'
import { waitForService } from "../utils/service-status.ts";
import * as monaco from "monaco-editor";
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { useWorkspace } from '../stores/workspace';

import 'monaco-latex';
import { ArrowLeft, ArrowRight, Document, Refresh, ZoomIn, ZoomOut } from "@element-plus/icons-vue";
import { debounce } from 'lodash';
import localIpcRenderer from "../utils/web-adapter/local-ipc-renderer";
import { webMainCalls } from "../utils/web-adapter/web-main-calls";
import { createMonacoAdapter } from "../editor/monaco-adapter";
import { prependAiChatDialog } from '../utils/ai-chat-storage';

const { t } = useI18n();
const logger = createRendererLogger('LaTeXEditor', {
    windowTypeProvider: () => getWindowType(),
});

const LATEX_LAYOUT = {
    meta: {
        minWidth: 260,
        maxWidth: 520,
        initialWidth: 320,
    },
    left: {
        minWidth: 360,
        maxRatio: 0.7,
    },
    pdf: {
        minWidth: 360,
        maxRatio: 0.55,
    },
};
const props = defineProps({
    tabId: {
        type: String,
        default: '',
    },
    active: {
        type: Boolean,
        default: true,
    },
    editorDomId: {
        type: String,
        default: 'latex-editor',
    },
});
const isActive = computed(() => props.active);

const workspace = useWorkspace();
const documentRef = computed(() => workspace.ensureDocument(props.tabId));

const currentTex = computed({
    get: () => documentRef.value.tex ?? '',
    set: (val) => {
        if (val === documentRef.value.tex) return;
        //logger.debug("LaTeXEditor currentTex set")//bugfix
        workspace.updateDocumentTex(props.tabId, val);
    },
});

const currentMeta = computed(() => documentRef.value.meta);

const currentOutline = computed({
    get: () => documentRef.value.outline,
    set: (val) => workspace.updateDocumentOutline(props.tabId, val),
});

const currentDialogs = computed(() => documentRef.value.aiDialogs ?? []);

const currentMarkdown = computed({
    get: () => documentRef.value.markdown ?? '',
    set: (val) => workspace.updateDocumentMarkdown(props.tabId, val),
});

const latestView = computed({
    get: () => documentRef.value.lastView ?? 'article',
    set: (val) => workspace.updateDocumentLastView(props.tabId, val),
});

const currentPath = computed(() => documentRef.value.path || '');

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
const textEditorAdapter = shallowRef(null);

const loadingInstance = ElLoading.service({ fullscreen: false });
const showTitleMenu = ref(false);
const currentTitle = ref("");
const menuPosition = ref({ top: 0, left: 0 });
const getDefaultSearchMenuPosition = () => {
    if (typeof window === "undefined") {
        return { top: 24, left: 24 };
    }
    const margin = 24;
    return {
        top: margin,
        left: margin,
    };
};
const SRMenuPosition = ref(getDefaultSearchMenuPosition());
const updateSearchMenuPosition = () => {
    SRMenuPosition.value = getDefaultSearchMenuPosition();
};
const currentTitlePath = ref('');
const contextMenuVisible = ref(false); // 右键菜单可见性
const menuX = ref(0); // 菜单 X 坐标
const menuY = ref(0); // 菜单 Y 坐标

const handleTitleMenuClose = () => {
    showTitleMenu.value = false;
};
const handleSearchReplaceClose = () => {
    searchReplaceDialogVisible.value = false;
};

const updateMeta = (updater) => {
    if (typeof updater === 'function') {
        workspace.updateDocumentMeta(props.tabId, updater);
    }
};

const replaceDialogs = (builder) => {
    const base = [...currentDialogs.value];
    const next = builder(base);
    workspace.updateDocumentAiDialogs(props.tabId, next);
};

const addDialogEntry = (dialog, addToFront = false) => {
    replaceDialogs((dialogs) => {
        if (addToFront) {
            dialogs.unshift(dialog);
        } else {
            dialogs.push(dialog);
        }
        return dialogs;
    });
};

const acceptGeneratedText = async (payload) => {
    if (!payload) return;
    const { append, content } = payload;
    if (!currentTitlePath.value) return;
    const clonedOutline = JSON.parse(JSON.stringify(currentOutline.value));
    const node = searchNode(currentTitlePath.value, clonedOutline);
    if (node) {
        node.text = append ? `${node.text || ''}${content}` : content;
        currentOutline.value = clonedOutline;
        latestView.value = 'outline';
    }
    showTitleMenu.value = false;
};

const editorEl = ref(null);
const editorKey = ref(Date.now());
const mainContainerRef = ref(null);
const pdfResizableRef = ref(null);
const mainWidth = ref(0);
let mainObserver = null;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const clampPdfWidth = (size) => {
    if (!showPdfPanel.value) return LATEX_LAYOUT.pdf.minWidth;
    const width = mainWidth.value || size + LATEX_LAYOUT.left.minWidth;
    const minAllowed = LATEX_LAYOUT.pdf.minWidth;
    const maxByEditor = width - LATEX_LAYOUT.left.minWidth;
    const maxByRatio = width * LATEX_LAYOUT.pdf.maxRatio;
    const maxAllowed = Math.max(minAllowed, Math.min(maxByEditor, maxByRatio));
    return clamp(size, minAllowed, maxAllowed);
};

const ensurePdfWithinBounds = () => {
    if (!pdfResizableRef.value || !showPdfPanel.value) return;
    const current = pdfResizableRef.value.getSidebarSize
        ? pdfResizableRef.value.getSidebarSize()
        : undefined;
    if (typeof current === 'number') {
        const clamped = clampPdfWidth(current);
        if (clamped !== current) {
            pdfResizableRef.value.setSidebarSize(clamped);
        }
    } else {
        const fallback = clampPdfWidth(LATEX_LAYOUT.pdf.minWidth);
        pdfResizableRef.value.setSidebarSize(fallback);
    }
};

const handlePdfResize = (size) => {
    const clamped = clampPdfWidth(size);
    if (clamped !== size && pdfResizableRef.value?.setSidebarSize) {
        pdfResizableRef.value.setSidebarSize(clamped);
    }
};

const editorDomId = computed(() => props.editorDomId || 'latex-editor');

// 增量同步缓存
let textBuffer = currentTex.value;


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
const pdfContainer = ref(null);
const canvasWrapper = ref(null);
let isDragging = false;
let startX, startY, offsetX = 0, offsetY = 0;

import * as pdfjsLib from "pdfjs-dist";
let pdfInitialized = false;

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
    if(currentPath.value && currentPath.value.toLowerCase().endsWith(".tex")){
        pdfUrl.value=`file:///${currentPath.value.toLowerCase().replace('.tex','.pdf')}`;
    }else{
        pdfUrl.value="";
    }
    loadPdf(pdfUrl.value);
    pdfInitialized = true;
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

watch(
    () => currentTex.value,
    (incoming) => {
        //logger.debug("LaTeXEditor currentTex changed", { incoming })
        const nextValue = incoming ?? '';
        textBuffer = nextValue;
        if (!isActive.value) return;
        if (!editor.value) return;
    },
);

watch(
    () => props.active,
    (active) => {
        //logger.debug("LaTeXEditor props.active changed", { active })
        if (!editor.value) return;
        if (!active) {
            textBuffer = currentTex.value ?? '';
            return;
        }
        if (pdfUrl.value && pdfInitialized && pdfContainer.value) {
            loadPdf(pdfUrl.value);
        }
    },
    { immediate: true },
);

watch(
    currentPath,
    (path) => {
        //logger.debug("LaTeXEditor currentPath changed", { path })
        if (!path || !path.toLowerCase().endsWith('.tex')) {
            pdfUrl.value = '';
            return;
        }
        const nextUrl = `file:///${path.toLowerCase().replace('.tex', '.pdf')}`;
        pdfUrl.value = nextUrl;
        if (!isActive.value) return;
        if (pdfInitialized && pdfContainer.value) {
            loadPdf(nextUrl);
        }
    },
);

watch(
    () => showPdfPanel.value,
    (visible) => {
        //logger.debug("LaTeXEditor showPdfPanel changed", { visible })
        nextTick(() => {
            if (visible) {
                ensurePdfWithinBounds();
            } else if (pdfResizableRef.value?.setSidebarSize) {
                pdfResizableRef.value.setSidebarSize(LATEX_LAYOUT.pdf.minWidth);
            }
        });
    },
);

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
    //logger.log(pdfDoc.value)
    totalPdfPages.value = pdfDoc.numPages;
    currentPdfPage.value = 1;
    inputPdfPage.value = 1;
    renderPage(1, currentScale);
}
// 切换 PDF 显示
function togglePdf() {
    showPdfPanel.value = !showPdfPanel.value
}

const compile = async () => {
    eventBus.emit('clear-console', { key: 'latex' })
    eventBus.emit('cancel-suggestion')
    if(!currentPath.value || !currentPath.value.toLowerCase().endsWith(".tex")){
        eventBus.emit("show-warning",t("latexEditor.notification.pleaseSaveFirst"));
        eventBus.emit('save');
        return;
    }
    triggerSuggestion.value = false;//开始编译的时候就不能修改了
    editor.value.updateOptions({
        readOnly: true
    });
    const compileResult = await ipcRenderer.invoke("compile-tex",{
        tex:currentTex.value,
        texPath:currentPath.value??'',
        outputDir:"",//todo:用户后续可以设置保存在哪
        customPdfFileName:"",//todo
    })
    editor.value.updateOptions({
        readOnly: false
    });
    //logger.log(compileResult)
    if(compileResult.status==='success'){
        eventBus.emit("show-success",t("latexEditor.notification.compileSuccess"));
        pdfUrl.value=(`file:///${compileResult.pdfPath}`);
        
        loadPdf(pdfUrl.value)
    }
    else{
        eventBus.emit("show-error",t("latexEditor.notification.compileFailed",{ code:compileResult.code }));
    }
    //logger.log("编译 LaTeX");
};

const toggleConsole = async () => {
    showConsole.value = !showConsole.value;
};




// 打开右键菜单
const openContextMenu = (event) => {
    event.preventDefault();
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    contextMenuVisible.value = true;
};

// 插入文本到当前光标位置（支持多行）
const insertText = (text) => {
  textEditorAdapter.value?.insertText(text);
};


// 菜单项点击事件处理
const handleMenuClick = async (item) => {
    switch (item) {
        case 'ai-assistant':
            let text = currentMarkdown.value;
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
            addDialogEntry(newDialog, true)
            prependAiChatDialog(newDialog);
            sendBroadcast('ai-chat', 'ai-chat-dialogs-updated', null);
            eventBus.emit('ai-chat')
            break;
        case 'cut':
            await textEditorAdapter.value?.cut();
            break;
        case 'copy':
            await textEditorAdapter.value?.copy();
            break;
        case 'paste':
            await textEditorAdapter.value?.paste();
            break;
        case 'selectAll':
            textEditorAdapter.value?.selectAll();
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
    //         logger.warn("释放 Monaco 实例失败：", e);
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

eventBus.on('search-replace', (payload) => {
    //logger.log('search-replace');
    searchReplaceDialogVisible.value = true;
    if (payload && payload.expandReplace) {
        nextTick(() => eventBus.emit('search-replace-expand'));
    }
});

watch(isActive, (active) => {
    if (!active) {
        searchReplaceDialogVisible.value = false;
    }
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
  if (!container) return;
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
        //logger.debug("LaTeXEditor disposeEditor")
        try {
            // 1. 移除监听
            if (contentChangeListener) {
                contentChangeListener.dispose();
                contentChangeListener = null;
                //logger.log("移除监听成功")
            }

            // 2. 保存引用的 model
            const oldModel = editor.value.getModel();

            // 3. 释放 Monaco 实例
            // editor.value.dispose();
            // editor.value = null;
            // logger.log("释放Monaco成功")
            // 4. 释放模型
            if (oldModel) oldModel.dispose();
            //logger.log("释放模型成功")
            // 5. 清空 textBuffer
            textBuffer = "";
        } catch (e) {
            logger.warn("安全释放 Monaco 实例失败:", e);
        }
    }
    textEditorAdapter.value = null;
};
let editorId = null;
const initEditor = () => {
    window.MonacoEnvironment = {
        getWorker: function (moduleId, label) {
            let workerPath = '';

            switch (label) {
                case 'json':
                    workerPath = 'http://localhost:52521/monaco/language/json/json.worker.js';
                    break;
                case 'css':
                case 'scss':
                case 'less':
                    workerPath = 'http://localhost:52521/monaco/language/css/css.worker.js';
                    break;
                case 'html':
                case 'handlebars':
                case 'razor':
                    workerPath = 'http://localhost:52521/monaco/language/html/html.worker.js';
                    break;
                case 'typescript':
                case 'javascript':
                    workerPath = 'http://localhost:52521/monaco/language/typescript/ts.worker.js';
                    break;
                default:
                    workerPath = 'http://localhost:52521/monaco/editor/editor.worker.js';
            }

            // ESM worker: 用 import() 动态导入
            const blob = new Blob(
                [`import("${workerPath}");`],
                { type: 'application/javascript' }
            );

            return new Worker(URL.createObjectURL(blob), { type: 'module' });
        }
    };

    //logger.debug("LaTeXEditor initEditor")
    editor.value = monaco.editor.create(editorEl.value, {
        value: currentTex.value,
        language: "latex", // 语言模式
        theme: themeState.currentTheme.type === 'dark' ? "vs-dark" : "vs",  // 主题 (vs, vs-dark, hc-black)
        mouseWheelZoom: true,
        automaticLayout: true, // 自动适应容器大小
        fontSize: 14,
        wordWrap: "on",  // 自动换行
        wordWrapMinified: true, // 对于 minified 文件也自动换行
        wrappingIndent: "same", // 缩进方式，"none" | "same" | "indent" | "deepIndent"
        lineNumbers: enableRowNumber ? 'on' : 'off',
        minimap: { enabled: enableMinimap },
        contextmenu: false
    })
    editorId = editor.value.getId();
    textEditorAdapter.value = createMonacoAdapter(editorId);
    //editor.value.onKeyDown((e)=>logger.log(e));
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

        //BUG:这里同步会卡死
        debounceSync();
        
    });
    const debounceSync = debounce(() => {
        triggerSuggestion.value = false;
        if(currentTex.value!==textBuffer){
            currentTex.value = textBuffer;
        }
    }, 100);
    eventBus.emit("monaco-ready")
}

onMounted(async () => {
    try {
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', updateSearchMenuPosition);
        }
        //logger.debug("LaTeXEditor onMounted")
        await waitForService('express');
        await refreshContextMenu();
        initEditor();

        eventBus.on('sync-editor-theme', () => {
            const isDark = themeState.currentTheme.type === 'dark';
            const themeName = isDark ? 'vs-dark' : 'vs';
            const toMonacoColor = (color) => color.replace('#', '') || 'FFFFFF';
            const deeperColor = (color) => {
                if (isDark) return mixColors(color, '#000000', 0.3)
                else return mixColors(color, '#FFFFFF', 0.3)
            }
            monaco.editor.defineTheme('myCustomTheme', {
                base: themeName,
                inherit: true,
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
        await nextTick();

        if (mainContainerRef.value) {
            const initialWidth = mainContainerRef.value.clientWidth;
            if (initialWidth) {
                mainWidth.value = initialWidth;
                ensurePdfWithinBounds();
            }
            mainObserver = new ResizeObserver((entries) => {
                if (!entries.length) return;
                const width = entries[0].contentRect.width;
                if (width !== mainWidth.value) {
                    mainWidth.value = width;
                    ensurePdfWithinBounds();
                }
            });
            mainObserver.observe(mainContainerRef.value);
        }
    }
    catch (e) {
        logger.error(e);
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
    //logger.debug("LaTeXEditor onUnmounted")
    if (mainObserver) {
        mainObserver.disconnect();
        mainObserver = null;
    }
    eventBus.emit('is-need-save', true)
    try {
        const editors = monaco.editor.getEditors();

        // 遍历销毁
        editors.forEach(editor => {
            if (editor.getId() === editorId) {
                editor.dispose(); // 释放 editor 的所有资源，包括模型、事件监听等
            }
        });
    }
    catch (e) {
        logger.error('LaTeX 编辑器错误', e)
    }
    if (typeof window !== 'undefined') {
        window.removeEventListener('resize', updateSearchMenuPosition);
    }
});

const triggerSuggestion = ref(false);

function onAcceptSuggestion(text) {
    //logger.log("补全已接受:", text);
    //insertText(text);
    //AISuggestion已经帮忙插入了
    triggerSuggestion.value = false;
}
function onCancelSuggestion() {
    //logger.log("补全已取消");
    triggerSuggestion.value = false;
    //initiativeSuggestion.value=false;
    //状态不切换回false,保持为true
}
function onResetSuggestion() {
    //logger.log("补全已重置");
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
    //logger.log(selection)

    const sel = editor.value.getSelection();
    // 选择 caret 位置：若是折叠（无选区）用 start，若有选区，默认用 end（caret 通常在 end）
    const isCollapsed = (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn);
    const caretLine = isCollapsed ? sel.startLineNumber : sel.endLineNumber;
    const caretColumn = isCollapsed ? sel.startColumn : sel.endColumn;
    //logger.log("caretColumn")
        // 把位置转为 offset（字符索引）
    const caretPos = { lineNumber: caretLine, column: caretColumn };
    const caretOffset = model.getOffsetAt(caretPos);
    //logger.log("caretOffset")
    const fullLength = model.getOffsetAt(model.getFullModelRange().getEndPosition());;
    //logger.log("fullLength",fullLength)
    const startOffset = Math.max(0, caretOffset - contextSize);
    const endOffset = Math.min(fullLength, caretOffset + contextSize);
    // logger.log(startOffset)
    // logger.log(endOffset)
    const fullText = currentTex.value || "";
    suggestionContext.value.preContext = fullText.slice(startOffset, caretOffset);
    suggestionContext.value.postContext = fullText.slice(caretOffset, endOffset);
}
function trytriggerSuggestion() {
    //logger.log("尝试触发Suggestion")
    // AI suggestion 防抖逻辑
    
    //if (initiativeSuggestion.value ==false) return;//只生成一次，不是这里的问题
    triggerSuggestion.value = false;
    if (suggestionTimer) clearTimeout(suggestionTimer);
    eventBus.on('cancel-suggestion',()=>{clearTimeout(suggestionTimer);})
    suggestionTimer = setTimeout(() => {
        triggerSuggestion.value = false;
        getSuggestionContext();
        //logger.log("触发Suggestion")
        triggerSuggestion.value = true;
    }, 1500); // 1.5 秒防抖


}
// 监听输入 -> 1秒后触发

</script>

<style scoped>
.content-container {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.latex-layout {
    display: flex;
    height: 100%;
    width: 100%;
}

.latex-main {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
}

.latex-column {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    box-sizing: border-box;
}

.left-column {
    min-width: 360px;
    border-right: 1px solid var(--el-border-color-lighter);
    flex: 1 1 auto;
}

.pdf-column {
    min-width: 360px;
    border-right: 1px solid var(--el-border-color-lighter);
    background-color: var(--el-bg-color-page);
    position: relative;
    flex: 0 0 auto;
}

.meta-column {
    min-width: 260px;
    max-width: 520px;
    overflow-y: auto;
    padding: 12px;
    box-sizing: border-box;
    color: var(--el-text-color-primary);
    flex: 0 0 auto;
}

.resize-handle {
    width: 6px;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
}

.resize-handle::after {
    content: '';
    width: 2px;
    height: 60%;
    background-color: var(--el-border-color);
    border-radius: 1px;
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

.toolbar-icon:hover {
    background-color: rgba(0, 0, 0, 0.05);
}

.editor-console-container {
    position: relative;
    flex: 1;
    min-height: 0;
    background: var(--el-bg-color-page);
}

.editor {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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

.pdf-toolbar {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);
}

.pdf-toolbar__page {
    display: flex;
    align-items: center;
    gap: 6px;
}

.pdf-toolbar__page input {
    width: 60px;
    text-align: center;
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

.pdf-toolbar-icon:hover {
    background-color: rgba(0, 0, 0, 0.05);
}

.pdf-preview-container {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--el-border-color-lighter);
}

.pdf-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
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
}

.pdf-empty-text {
    color: #999;
    font-weight: normal;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    user-select: none;
    pointer-events: none;
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-color, #999);
    text-align: center;
}

.context-menu {
    position: fixed;
    z-index: 1000;
}
</style>
