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
            <ContextMenu :x="menuX" :y="menuY" :selection="getSelection()" v-if="contextMenuVisible"
                @trigger="handleMenuClick" class="context-menu" @close="contextMenuVisible = false;"
                @insert="insertText" />

            <div id="vditor" class="editor" v-loading="loading" @keydown="handleTab"
                @contextmenu.prevent="openContextMenu($event)"></div>

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
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed } from "vue";
import { ElButton, ElDialog, ElLoading } from 'element-plus';
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
import { getSetting } from "../utils/settings";
import { bin } from "d3";
import { localVditorCDN, vditorCDN } from "../utils/vditor-cdn";
import { useI18n } from 'vue-i18n'
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


// 打开右键菜单
const openContextMenu = (event) => {
    event.preventDefault();
    menuX.value = event.clientX;
    menuY.value = event.clientY + 20;
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

// 更新编辑器内容
const updateValue = (value) => {
    const editor = vditor.value;
    editor.updateValue(value);
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
    }
    contextMenuVisible.value = false;
};

// 更新编辑器内容
const showMetaDialog = () => {
    editMetaDialogVisible.value = true;
};
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
        section.setAttribute('path', node.path);
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




// 编辑器初始化
onMounted(async () => {
    try {
        let cdn = '';
        if (isElectronEnv()) {
            cdn = localVditorCDN;
        }
        else {
            cdn = vditorCDN;
        }
        const autoSaveExternalImage = await getSetting('autoSaveExternalImage');
        vditor.value = new Vditor('vditor', {
            lang: t('lang'),
            toolbarConfig: { pin: true },
            theme: themeState.currentTheme.vditorTheme,
            preview: {
                theme: {
                    current: themeState.currentTheme.vditorTheme,
                },
                hljs: {
                    style: themeState.currentTheme.codeTheme,
                    lineNumber: true,
                },
            },
            upload: {
                url: 'http://localhost:3000/upload',
                linkToImgUrl: autoSaveExternalImage ? 'http://localhost:3000/url-upload' : false,
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
                    icon: `<img src="${themeState.currentTheme.AiLogo}" style="width: 20px; height: 20px; " />`,
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
                //console.log('input');
                //article.value = value; // 监听输入事件，更新绑定的内容
                current_article.value = value;
                //console.log(current_article.value)
                latest_view.value = 'article';
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
                loadingInstance.close();
            },
        });
    }
    catch (e) {
        console.error(e);
        eventBus.emit('show-error',
            this.$t('article.vditor_init_failed') + e
        );
        loadingInstance.close();

    }
});

// 清理资源
onBeforeUnmount(() => {
    eventBus.emit('is-need-save', true)
    sync();
    vditor.value.destroy();
});

eventBus.on('sync-vditor-theme', async () => {
    vditor.value.setTheme(themeState.currentTheme.vditorTheme, themeState.currentTheme.vditorTheme, themeState.currentTheme.codeTheme);
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
    position: absolute;
    z-index: 1000;

}
</style>