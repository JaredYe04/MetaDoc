<template>

    <div class="main-container">
        <div class="content-container">
            <!-- 左边：Vditor Markdown 编辑器 -->
            <!-- 菜单组件 -->
            <TitleMenu v-if="showTitleMenu" :title="currentTitle.replaceAll('#', '').trim()" :position="menuPosition"
                @close="handleTitleMenuClose" :path="currentTitlePath"
                :tree="extractOutlineTreeFromMarkdown(current_article, true)" @accept="async (content) => {
                    await acceptGeneratedText(content);
                }" style="max-width: 500px;" />
            <SearchReplaceMenu v-if="searchReplaceDialogVisible" @close="searchReplaceDialogVisible = false"
                :position="SRMenuPosition" />

            <!-- 右键菜单组件 -->
            <ContextMenu :x="menuX" :y="menuY" :selection="getSelection()" v-if="contextMenuVisible"
                @trigger="handleMenuClick" class="context-menu" @close="contextMenuVisible = false;"
                @insert="insertText" />



            <div id="vditor" class="editor" v-loading="loading" @keydown="handleTab"
                @contextmenu.prevent="openContextMenu($event)">
            </div>

            <!-- 右边：元信息显示 -->
            <div class="meta-info" :style="{ backgroundColor: themeState.currentTheme.background2nd }">

                <div style="text-align: center; font-size: large;">
                    <el-tooltip content="编辑文档元信息" placement="left">
                        <h1 class="interactive-text" @click="showMetaDialog"
                            :style="{ color: themeState.currentTheme.textColor }">文档元信息</h1>
                    </el-tooltip>

                </div>
                <el-tooltip content="单击修改标题" placement="left">
                    <h1 @click="genTitleDialogVisible = !genTitleDialogVisible" class="interactive-text"
                        :style="{ color: themeState.currentTheme.textColor }">标题：{{ meta.title ||
                            '无标题' }}
                    </h1>
                </el-tooltip>

                <LlmDialog v-if="genTitleDialogVisible"
                    :prompt="generateTitlePrompt(JSON.stringify(extractOutlineTreeFromMarkdown(current_article, true)))"
                    title="生成标题" :llmConfig="{ max_tokens: 15, temperature: 0.0 }" @llm-content-accept="(content) => {
                        meta.title = content;
                        genTitleDialogVisible = false;
                    }" @update:visible="genTitleDialogVisible = $event; genTitleDialogVisible = false"
                    :defaultText="meta.title" :defaultInputSize="1"></LlmDialog>

                <el-tooltip content="单击修改作者" placement="left">
                    <p @click="modifyAuthorDialogVisible = !modifyAuthorDialogVisible" class="interactive-text"
                        :style="{ color: themeState.currentTheme.textColor }">
                        <strong>作者：</strong>{{ meta.author || '未填写' }}
                    </p>
                </el-tooltip>

                <LlmDialog v-if="modifyAuthorDialogVisible" :prompt="''" title="修改作者" :llmConfig="{}"
                    @llm-content-accept="(content) => {
                        meta.author = content;
                        modifyAuthorDialogVisible = false;
                    }" @update:visible="modifyAuthorDialogVisible = $event; modifyAuthorDialogVisible = false"
                    :defaultText="meta.author" :defaultInputSize="1"></LlmDialog>



                <el-tooltip content="单击修改文章摘要" placement="left">
                    <p @click="genDescriptionDialogVisible = !genDescriptionDialogVisible" class="interactive-text"
                        :style="{ color: themeState.currentTheme.textColor }">
                        <strong>摘要：</strong>{{ meta.description || '暂无摘要' }}
                    </p>
                </el-tooltip>

                <LlmDialog v-if="genDescriptionDialogVisible"
                    :prompt="generateDescriptionPrompt(JSON.stringify(extractOutlineTreeFromMarkdown(current_article, true)))"
                    title="生成摘要" :llmConfig="{ max_tokens: 100, temperature: 0.0 }" @llm-content-accept="(content) => {
                        meta.description = content;
                        genDescriptionDialogVisible = false;
                    }" @update:visible="genDescriptionDialogVisible = $event; genDescriptionDialogVisible = false"
                    :defaultText="meta.description" :defaultInputSize="10"></LlmDialog>

            </div>

            <el-dialog v-model="editMetaDialogVisible" title="修改文章元信息" width="30%">
                <el-form>
                    <el-form-item label="标题">
                        <el-input v-model="meta.title" autocomplete="off" class="aero-input" />
                    </el-form-item>
                    <el-form-item label="作者">
                        <el-input v-model="meta.author" autocomplete="off" class="aero-input" />
                    </el-form-item>
                    <el-form-item label="摘要">
                        <el-input type="textarea" placeholder="请输入文章摘要" v-model="meta.description" autocomplete="off"
                            resize='none' :autoSize="{ minRows: 3, maxRows: 5 }" class="aero-input" />
                    </el-form-item>
                </el-form>
            </el-dialog>

            <!-- 添加一个底部菜单，width占满整个父容器，显示编辑器的一些元信息，例如总字数，鼠标位置 -->




        </div>
        <!-- <div class="footer-menu" :style="{ backgroundColor: themeState.currentTheme.background2nd }">
            <div class="meta-info-menu" :style="{ color: themeState.currentTheme.textColor }">
                <span>字数：{{ countNodes(current_article) }}</span>
                <span>鼠标位置：{{ menuPosition.left }}, {{ menuPosition.top }}</span>
            </div>
        </div> -->
    </div>


</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from "vue";
import { ElButton, ElDialog, ElLoading } from 'element-plus';
import Vditor from "vditor";
import "vditor/dist/index.css";
import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus from '../utils/event-bus';
import { generateDescriptionPrompt, generateTitlePrompt, wholeArticleContextPrompt } from '../utils/prompts';
import { addDialog, countNodes, current_article, current_article_meta_data, defaultAiChatMessages, latest_view, renderedHtml, searchNode, sync } from "../utils/common-data";
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils';
import { current_outline_tree } from '../utils/common-data';
import LlmDialog from "../components/LlmDialog.vue";
import TitleMenu from '../components/TitleMenu.vue';
import SearchReplaceMenu from "../components/SearchReplaceMenu.vue";
import AiLogo from "../assets/ai-logo.svg";

import { themeState } from "../utils/themes";

// 状态变量
const genTitleDialogVisible = ref(false);
const genDescriptionDialogVisible = ref(false);
const modifyContentDialogVisible = ref(false);
const continueContentDialogVisible = ref(false);
const modifyAuthorDialogVisible = ref(false);
const searchReplaceDialogVisible = ref(false);
const vditor = ref(null); // Vditor 实例
const editMetaDialogVisible = ref(false); // 编辑元信息对话框
const meta = reactive(current_article_meta_data);
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
            let messages = []
            messages.push({
                role: 'system',
                content: wholeArticleContextPrompt(current_article.value)
            })
            messages.push({
                role: 'assistant',
                content: "我已经了解了整篇文章的内容，有什么可以帮助您的吗？"
            })
            const newDialog = {
                title: "AI分析整篇文章",
                messages: messages
            };
            addDialog(newDialog,true)
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
    Object.assign(meta, current_article_meta_data); // 更新文章元数据
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
const acceptGeneratedText = async (content) => {
    const outlineTree = extractOutlineTreeFromMarkdown(current_article.value, false);
    const path = currentTitlePath.value;
    const node = searchNode(path, outlineTree);
    node.text = content;
    current_outline_tree.value = outlineTree;
    latest_view.value = 'outline';
    eventBus.emit('is-need-save', true)
    sync();
    vditor.value.setValue(current_article.value);
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
    });
};

// 鼠标事件处理
let pressTimer;
let isLongPress = false;

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


// 编辑器初始化
onMounted(() => {
    vditor.value = new Vditor('vditor', {
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
            linkToImgUrl: true,
            success: (editor, msg) => {
                const data = JSON.parse(msg);
                const filePaths = data.data.succMap;
                for (const key in filePaths) {
                    const filePath = filePaths[key].substring(7);//去掉images\前缀,
                    //console.log(filePath);

                    //const filePath = filePaths[key];
                    //const imageUrl=filePath;
                    const imageUrl = `http://localhost:3000/images/${filePath}`;
                    vditor.value.insertValue(`![](${imageUrl})`);  // 插入图片链接
                }
            },
            error: (msg) => {
                console.error('上传失败:', msg);
            },
        },
        toolbar: [
            'undo',     // 撤销
            'redo',     // 重做
            'headings', // 标题
            'bold',     // 加粗
            'italic',   // 斜体
            'strike',   // 删除线
            'link',     // 超链接
            'list',     // 列表
            'table',    // 表格
            'code',     // 代码块
            'preview',  // 预览
            'fullscreen', // 全屏
            'quote',    // 引用
            {
                name: 'search-replace',
                tipPosition: 's',
                tip: '查找与替换',
                className: 'right',
                icon: '<svg><use xlink:href="#vditor-icon-info"></use></svg>',
                click() { eventBus.emit('search-replace') },
            }


        ],
        cdn: 'http://localhost:3000/vditor',
        cache: { enable: false },
        placeholder: "在此编辑 Markdown 内容...",
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
});

// 清理资源
onBeforeUnmount(() => {
    eventBus.emit('is-need-save', true)
    sync();
    vditor.value.destroy();
});

eventBus.on('sync-vditor-theme', async () => {
    vditor.value.setTheme(themeState.currentTheme.vditorTheme, themeState.currentTheme.vditorTheme, themeState.currentTheme.codeTheme);
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
    max-height: 92vh;
    height: 92vh;

    /* 唯一允许滚动的区域 */

}

/* 左边的编辑器样式 */
.editor {
    flex: 4;
    border-right: 1px solid #ddd;
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