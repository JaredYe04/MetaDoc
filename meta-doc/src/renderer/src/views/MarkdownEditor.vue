<template>
    <div class="main-container">
        <div class="content-container">
            <!-- 左边：Vditor Markdown 编辑器 -->
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
            <AISuggestion :targetEl="vditorEl" :trigger="triggerSuggestion" :rootNodeClass="'vditor-reset'"
                @accepted="onAcceptSuggestion" @cancelled="onCancelSuggestion" @reset="onResetSuggestion" />
            <div id="vditor" ref="vditorEl" class="editor" @keydown="handleTab"
                @contextmenu.prevent="openContextMenu($event)" :style="{
                    '--panel-background-color': themeState.currentTheme.editorPanelBackgroundColor,
                    '--toolbar-background-color': themeState.currentTheme.editorToolbarBackgroundColor,
                    '--textarea-background-color': themeState.currentTheme.editorTextareaBackgroundColor,
                }"></div>

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
                    <el-button type="primary" text bg @click="convertToLatex" style="
                    width:100%">
                        {{ $t('article.convert_to_latex')  }}
                    </el-button>
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
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed } from "vue";
import { ElButton, ElDialog, ElLoading, ElMessageBox } from 'element-plus';
import Vditor from "vditor";
import "vditor/dist/index.css";
import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus, { isElectronEnv } from '../utils/event-bus';
import { generateDescriptionPrompt, generateTitlePrompt, wholeArticleContextPrompt } from '../utils/prompts';
import { addDialog, countNodes, current_article, current_article_meta_data, defaultAiChatMessages, latest_view, renderedHtml, searchNode, sync } from "../utils/common-data";
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils';
import { current_outline_tree } from '../utils/common-data';
import LlmDialog from "../components/LlmDialog.vue";
import TitleMenu from '../components/TitleMenu.vue';
import SearchReplaceMenu from "../components/SearchReplaceMenu.vue";
import AiLogo from "../assets/ai-logo.svg";
import AiLogoWhite from "../assets/ai-logo-white.svg";
import { themeState } from "../utils/themes";
import { getSetting, setSetting } from "../utils/settings";
import { localVditorCDN, vditorCDN } from "../utils/vditor-cdn";
import { useI18n } from 'vue-i18n'
import AISuggestion from "../components/AISuggestion.vue";
import "../assets/ai-suggestion.css";
import { getArticleContextMenuItems } from "../components/contextMenus/ArticleContextMenu";
import ContextMenu from "../components/ContextMenu.vue";
const { t } = useI18n()

// 状态变量
const genTitleDialogVisible = ref(false);
const genDescriptionDialogVisible = ref(false);
const modifyContentDialogVisible = ref(false);
const continueContentDialogVisible = ref(false);
const modifyAuthorDialogVisible = ref(false);
const searchReplaceDialogVisible = ref(false);
const vditor = ref(null); // Vditor 实例
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

const vditorEl = ref(null);
const triggerSuggestion = ref(false);

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
    const editor = vditor.value;
    return editor.getSelection();
};

// 插入文本到编辑器
const insertText = (text) => {
    const editor = vditor.value;
    editor.insertValue(text);
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
            await setSetting("autoCompletion",true);
             break;
        case 'closeAutoCompletion':
            await setSetting("autoCompletion",false);
             break;
        case 'openKnowledgeBase':
            await setSetting("enableKnowledgeBase",true);
             break;
        case 'closeKnowledgeBase':
            await setSetting("enableKnowledgeBase",false);
             break;
        
    }
    await refreshContextMenu();
    contextMenuVisible.value = false;
};

// 更新编辑器内容
const showMetaDialog = () => {
    editMetaDialogVisible.value = true;
};
const convertToLatex=()=>{
    ElMessageBox.confirm(t('article.convert_to_latex_confirm'), t('knowledgeBase.delete_confirm_title'), {
        confirmButtonText: t('article.msgbox.confirm'),
        cancelButtonText: t('article.msgbox.cancel'),
        type: 'warning'
    }).then(() => {
        eventBus.emit('save-as',{format:"tex"});
    });
}
// 单击事件处理
const handleClick = (event, title, path) => {
    currentTitle.value = title;
    let top = event.clientY * 0.9;
    if (top > document.body.clientHeight * 0.6) {
        top = document.body.clientHeight * 0.6;
    }
    menuPosition.value = {
        top,
        left: event.clientX * 1.2,
    };
    currentTitlePath.value = path;
    showTitleMenu.value = true;
};

// 刷新文章内容
eventBus.on('refresh', () => {
    vditor.value.setValue(current_article.value, true);
});


eventBus.on('search-replace', () => {
    //console.log('search-replace');
    searchReplaceDialogVisible.value = true;
});
eventBus.on('vditor-sync-with-html', () => {
    const html = vditor.value.getHTML();
    //console.log(html);
    //console.log(vditor.value.html2md(html))
    vditor.value.setValue(vditor.value.html2md(html), true);
    current_article.value = vditor.value.getValue();
});



// 接受生成的文本
const acceptGeneratedText = async (payload) => {
    const { append, content } = payload;
    const outlineTree = extractOutlineTreeFromMarkdown(current_article.value, false);
    const path = currentTitlePath.value;
    const node = searchNode(path, outlineTree);
    if (append) {
        node.text += content;
    }
    else {
        node.text = content;
    }
    current_outline_tree.value = outlineTree;
    latest_view.value = 'outline';
    eventBus.emit('is-need-save', true)
    sync();
    vditor.value.setValue(current_article.value);
    await bindTitleMenu();
};

// 关闭标题菜单
const handleTitleMenuClose = () => {
    showTitleMenu.value = false;
};

// 更新大纲
const bindTitleMenu = async () => {
    let sections = Array.from(document.getElementsByClassName('vditor-ir__node')).filter(node =>
        ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName));

    // 处理大纲树和标题绑定
    const outlineTree = current_outline_tree.value;
    const treeNodeQueue = [];
    const dfsOutlineTree = (node) => {
        treeNodeQueue.push(node);
        if (node.children) {
            node.children.forEach(dfsOutlineTree);
        }
    };
    dfsOutlineTree(outlineTree);
    treeNodeQueue.shift(); // 移除 'dummy' 节点

    sections.forEach((section, i) => {
        const node = treeNodeQueue[i];
        if (node.path) {
            section.setAttribute('path', node.path);
        }
        section.addEventListener('mousedown', (event) => mouseDownEvent(event, section));
        section.addEventListener('mouseup', (event) => mouseUpEvent(event, section));
        section.addEventListener('mouseleave', (event) => mouseLeaveEvent(event, section));
        //添加tooltip
        section.setAttribute('title', t('article.long_press_optimize'));
    });

    const outlineNode = document.getElementsByClassName('vditor-outline__content')[0];
    //获取所有的span子标签，并且这些标签没有data-target-id属性
    const outlineSections = Array.from(outlineNode.getElementsByTagName('span'))
        .filter(node => !node.hasAttribute('data-target-id'));
    outlineSections.forEach((section, i) => {
        const node = treeNodeQueue[i];
        const target = section;
        target.setAttribute('path', node.path);
        target.addEventListener('mousedown', (event) => outlineMouseDownEvent(event, section));
        target.addEventListener('mouseup', (event) => mouseUpEvent(event, section));
        target.addEventListener('mouseleave', (event) => mouseLeaveEvent(event, section));
        //鼠标指针改成pointer
        target.style.cursor = 'pointer';
        //添加tooltip
        target.setAttribute('title', t('article.click_jump_long_press_optimize'));

    });
};

// 鼠标事件处理
let pressTimer;
let isLongPress = false;


const outlineMouseDownEvent = (event, section) => {
    const titles = document.getElementsByClassName('vditor-ir__node');
    const path = section.getAttribute('path');
    //找到titles里面的第一个包含path的元素
    const title = Array.from(titles).find(title => title.getAttribute('path') === path);
    //聚焦到这个元素
    title.scrollIntoView({ behavior: 'instant', block: 'start' });
    mouseDownEvent(event, section);
};
const mouseDownEvent = (event, section) => {
    isLongPress = false;
    pressTimer = setTimeout(() => {
        section.style.cursor = 'pointer';
        isLongPress = true;
        section.style.filter = "brightness(3.0)";
    }, 500);
};

const mouseUpEvent = (event, section) => {
    clearTimeout(pressTimer);
    if (isLongPress) {
        section.style.cursor = 'text';
        const title = section.innerText;
        handleClick(event, title, section.getAttribute('path'));
        section.style.filter = "brightness(1)";
    } else {
        section.style.filter = "brightness(1)";
    }
};

const mouseLeaveEvent = (event, section) => {
    clearTimeout(pressTimer);
    section.style.filter = "brightness(1)";
    section.style.cursor = 'text';
};

// 监听 Tab 键，插入制表符
const handleTab = (event) => {
    if (event.key === "Tab") {
        //如果AISuggestion在工作，不插入制表符
        if (triggerSuggestion.value) {
            //console.log('AI Suggestion is active, tab key pressed');
            return;
        }
        else {
            //console.log('AI Suggestion is not active, tab key pressed');
        }

        event.preventDefault();
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const tabNode = document.createTextNode("\t");
        range.insertNode(tabNode);
        range.setStartAfter(tabNode);
        range.setEndAfter(tabNode);
        selection.removeAllRanges();
        selection.addRange(range);
    }
};



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


const refreshContextMenu=async ()=>{
    articleContextMenuItems.value = await getArticleContextMenuItems();
}

// 编辑器初始化
onMounted(async () => {
    try {
        await refreshContextMenu();
        let cdn = '';
        if (isElectronEnv()) {
            cdn = localVditorCDN;
        }
        else {
            cdn = vditorCDN;
        }
        const autoSaveExternalImage = await getSetting('autoSaveExternalImage');
        const supportedLang = ["en_US", "fr_FR", "pt_BR", "ja_JP", "ko_KR", "ru_RU", "sv_SE", "zh_CN", "zh_TW"]
        vditor.value = new Vditor('vditor', {
            lang: supportedLang.includes(t('lang')) ? t('lang') : 'en_US',
            toolbarConfig: { pin: true },
            theme: themeState.currentTheme.vditorTheme,
            preview: {
                theme: {
                    current: themeState.currentTheme.vditorTheme,
                },
                hljs: {
                    style: themeState.currentTheme.codeTheme,
                    lineNumber: await getSetting('lineNumber'),
                },
            },
            upload: {
                url: 'http://localhost:3000/api/image/upload',
                linkToImgUrl: autoSaveExternalImage ? 'http://localhost:3000/api/image/url-upload' : false,
                success: (editor, msg) => {
                    const data = JSON.parse(msg);
                    const filePaths = data.data.succMap;
                    for (const key in filePaths) {
                        const imageUrl = filePaths[key]; // 直接使用返回的路径
                        vditor.value.insertValue(`![](${imageUrl})`);  // 插入图片链接
                    }
                },
                error: (msg) => {
                    console.error('Upload Error:', msg);
                },
            },
            toolbar: [
                {
                    name: 'undo',
                    tip: t('article.toolbar.undo'),
                    tipPosition: 's',
                },
                {
                    name: 'redo',
                    tip: t('article.toolbar.redo'),
                    tipPosition: 's',
                },
                {
                    name: 'headings',
                    tip: t('article.toolbar.headings'),
                    tipPosition: 's',
                },
                {
                    name: 'bold',
                    tip: t('article.toolbar.bold'),
                    tipPosition: 's',
                },
                {
                    name: 'italic',
                    tip: t('article.toolbar.italic'),
                    tipPosition: 's',
                },
                {
                    name: 'strike',
                    tip: t('article.toolbar.strike'),
                    tipPosition: 's',
                },
                {
                    name: 'link',
                    tip: t('article.toolbar.link'),
                    tipPosition: 's',
                },
                {
                    name: 'list',
                    tip: t('article.toolbar.list'),
                    tipPosition: 's',
                },
                {
                    name: 'table',
                    tip: t('article.toolbar.table'),
                    tipPosition: 's',
                },
                {
                    name: 'code',
                    tip: t('article.toolbar.code'),
                    tipPosition: 's',
                },
                {
                    name: 'preview',
                    tip: t('article.toolbar.preview'),
                    tipPosition: 's',
                },
                {
                    name: 'fullscreen',
                    tip: t('article.toolbar.fullscreen'),
                    tipPosition: 's',
                },
                {
                    name: "quote",
                    tip: t('article.toolbar.quote'),
                    tipPosition: "s",
                },
                {
                    name: 'search-replace',
                    tip: t('article.toolbar.search_replace'),
                    tipPosition: 's',
                    className: 'right',
                    icon: '<svg><use xlink:href="#vditor-icon-info"></use></svg>',
                    click() { eventBus.emit('search-replace') },
                },
                {
                    name: 'ai-assistant',
                    tip: t('article.toolbar.ai_assistant'),
                    tipPosition: 's',
                    className: 'right',
                    icon: `<img src="${currentAiLogo.value}" style="width: 20px; height: 20px; " />`,
                    click() { handleMenuClick('ai-assistant') },
                },
            ],

            cdn: cdn,
            cache: { enable: false },
            placeholder: t('article.input_placeholder'),
            outline: {
                enable: true,
                position: "left",
            },
            value: current_article.value,
            input: async (value) => {

                current_article.value = value;
                latest_view.value = 'article';
                trytriggerSuggestion();

                eventBus.emit('is-need-save', true)
                sync();
                await bindTitleMenu();

            },
            after: async () => {

                //console.log(themeState);
                try {
                    sync();
                    await bindTitleMenu();
                } catch (e) {
                    console.error(e);
                }
                finally {
                    loadingInstance.close();
                }

            },
        });
    }
    catch (e) {
        console.error(e);
        eventBus.emit('show-error',
            this.$t('article.vditor_init_failed') + e
        );
    }
    finally {
        loadingInstance.close();
    }
});
const currentAiLogo = computed(() => {

    return themeState.currentTheme.type === 'dark' ? AiLogoWhite : AiLogo;
});
// 清理资源
onBeforeUnmount(() => {
    eventBus.emit('is-need-save', true)
    sync();
    vditor.value.destroy();
});

eventBus.on('sync-editor-theme', async () => {
    let contentTheme = await getSetting('contentTheme');
    if (contentTheme === 'auto') {
        contentTheme = themeState.currentTheme.vditorTheme;
    }
    let codeTheme = await getSetting('codeTheme');
    if (codeTheme === 'auto') {
        codeTheme = themeState.currentTheme.vditorTheme;
    }

    vditor.value.setTheme(themeState.currentTheme.vditorTheme, contentTheme, codeTheme);
    vditor.value.setValue(current_article.value);
});

</script>

<style scoped>
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

/* 上下两部分 */
.content-container {
    display: flex;
    flex: 1;
    /*占满整个父容器 */
    max-height: 90vh;
    height: 90vh;

    /* 唯一允许滚动的区域 */

}

/* 左边的编辑器样式 */
.editor {
    flex: 4;
    border-right: 1px solid #ddd;
    max-width: 85vw;
    width: 85vw;
    overflow: auto;
    /*滚动条样式修改 */
    scrollbar-color: #888 #63636300;
    scrollbar-width: thin;
}


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
