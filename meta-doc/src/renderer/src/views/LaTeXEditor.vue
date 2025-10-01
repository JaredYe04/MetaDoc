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
                        <div class="toolbar-icon" @click="showPdf">
                            <icon name="terminal" />
                        </div>
                    </el-tooltip>

                    <el-tooltip :content="$t('latexEditor.toolbar.compileAndShow')" placement="bottom">
                        <div class="toolbar-icon" @click="compileAndShow">
                            <icon name="terminal-rectangle" />
                        </div>
                    </el-tooltip>
                </div>

                <!-- Monaco 编辑器 -->
                <div class="editor" ref="editorEl"></div>
            </div>
            <div class="resizable-container">
                <el-tooltip :content="$t('article.drag_to_resize')">
                    <div class="resizer" @mousedown="startResize"></div>
                </el-tooltip>
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
import { themeState } from "../utils/themes";
import { getSetting, setSetting } from "../utils/settings";
import { useI18n } from 'vue-i18n'
import AISuggestion from "../components/AISuggestion.vue";
import "../assets/ai-suggestion.css";
import { getArticleContextMenuItems } from "../components/contextMenus/ArticleContextMenu";
import ContextMenu from "../components/ContextMenu.vue";
const { t } = useI18n();
import * as monaco from "monaco-editor";
import 'monaco-latex';
import { ArrowLeft, ArrowRight, Document, ZoomIn, ZoomOut } from "@element-plus/icons-vue";
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
const compile = () => {
    console.log("编译 LaTeX");
};
const showPdf = () => {
    console.log("显示 PDF");
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
    editor.value.setValue(current_tex_article.value, true);
});


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
onMounted(async () => {
    try {
        await refreshContextMenu();
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
        editor.value.onDidChangeModelContent((event) => {
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

        eventBus.on('sync-theme', () => {
            const isDark = themeState.currentTheme.type === 'dark';
            const themeName = isDark ? 'vs-dark' : 'vs';
            monaco.editor.setTheme(themeName);
        })

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
    try{
        // if(editor.value){
        //     editor.value.dispose();
        //     editor.value=null;
        // }
    }
    catch(e){
        console.log(e)
    }
});


</script>

<style scoped>
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
    border-top: 1px solid #ddd;
    background-color: #fff;
}

.content-container {
    display: flex;
    flex-direction: row;
    max-height: 90vh;
    height: 90vh;
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
    border-bottom: 1px solid #ddd;
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

.editor {
    flex: 1;
    overflow: hidden;
}

/* 左边的编辑器样式 */

/* 右边的元信息样式 */
.meta-info {
    color: black;
    flex: 1;
    /* 占20% */
    background-color: #f9f9f9;
    overflow: hidden;
    box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.1);
    padding: 5px;
}

.resizable-container {
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
    border-top: 1px solid #ddd;
    background-color: #fff;
}

.context-menu {
    position: fixed;
    z-index: 1000;
}
</style>
