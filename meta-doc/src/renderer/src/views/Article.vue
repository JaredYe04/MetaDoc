<template>

    <div class="content-container">
        <!-- 左边：Vditor Markdown 编辑器 -->
        <!-- 菜单组件 -->
        <TitleMenu v-if="showTitleMenu" :title="currentTitle.replaceAll('#', '').trim()" :position="menuPosition"
            @close="handleTitleMenuClose" :path="currentTitlePath"
            :tree="extractOutlineTreeFromMarkdown(current_article, true)" @accept="async (content) => {
                await acceptGeneratedText(content);
            }" style="max-width: 500px;" />

        <!-- 右键菜单组件 -->
        <ContextMenu :x="menuX" :y="menuY" :selection="getSelection()" v-if="contextMenuVisible"
            @trigger="handleMenuClick" class="context-menu" @close="contextMenuVisible = false;" @insert="insertText" />



        <div id="vditor" class="editor" v-loading="loading" @keydown="handleTab" 
            @contextmenu.prevent="openContextMenu($event)">
        </div>

        <!-- 右边：元信息显示 -->
        <div class="meta-info"
            :style="{ backgroundColor: themeState.currentTheme.background2nd }">

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

            <LlmDialog v-if="modifyAuthorDialogVisible" :prompt="''" title="修改作者" :llmConfig="{}" @llm-content-accept="(content) => {
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
import { generateDescriptionPrompt, generateTitlePrompt } from '../utils/prompts';
import { countNodes, current_article, current_article_meta_data, latest_view, renderedHtml, searchNode, sync } from "../utils/common-data";
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils';
import { current_outline_tree } from '../utils/common-data';
import LlmDialog from "../components/LlmDialog.vue";
import TitleMenu from '../components/TitleMenu.vue';
import AiLogo from "../assets/ai-logo.svg";

import { themeState } from "../utils/themes";

// 状态变量
const genTitleDialogVisible = ref(false);
const genDescriptionDialogVisible = ref(false);
const modifyContentDialogVisible = ref(false);
const continueContentDialogVisible = ref(false);
const modifyAuthorDialogVisible = ref(false);
const vditor = ref(null); // Vditor 实例
const editMetaDialogVisible = ref(false); // 编辑元信息对话框
const meta = reactive(current_article_meta_data);
const loadingInstance = ElLoading.service({ fullscreen: false });
const showTitleMenu = ref(false);
const currentTitle = ref("");
const menuPosition = ref({ top: 0, left: 0 });
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
            insertText('询问AI');
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

// 接受生成的文本
const acceptGeneratedText = async (content) => {
    const outlineTree = extractOutlineTreeFromMarkdown(current_article.value, false);
    const path = currentTitlePath.value;
    const node = searchNode(path, outlineTree);
    node.text = content;
    current_outline_tree.value = outlineTree;
    latest_view.value = 'outline';
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
            'code-theme', // 代码主题
            // {
            //     hotkey: '⇧⌘S',
            //     name: 'sponsor',
            //     tipPosition: 's',
            //     tip: '成为赞助者',
            //     className: 'right',
            //     icon: '<svg t="1589994565028" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2808" width="32" height="32"><path d="M506.6 423.6m-29.8 0a29.8 29.8 0 1 0 59.6 0 29.8 29.8 0 1 0-59.6 0Z" fill="#0F0F0F" p-id="2809"></path><path d="M717.8 114.5c-83.5 0-158.4 65.4-211.2 122-52.7-56.6-127.7-122-211.2-122-159.5 0-273.9 129.3-273.9 288.9C21.5 562.9 429.3 913 506.6 913s485.1-350.1 485.1-509.7c0.1-159.5-114.4-288.8-273.9-288.8z" fill="#FAFCFB" p-id="2810"></path><path d="M506.6 926c-22 0-61-20.1-116-59.6-51.5-37-109.9-86.4-164.6-139-65.4-63-217.5-220.6-217.5-324 0-81.4 28.6-157.1 80.6-213.1 53.2-57.2 126.4-88.8 206.3-88.8 40 0 81.8 14.1 124.2 41.9 28.1 18.4 56.6 42.8 86.9 74.2 30.3-31.5 58.9-55.8 86.9-74.2 42.5-27.8 84.3-41.9 124.2-41.9 79.9 0 153.2 31.5 206.3 88.8 52 56 80.6 131.7 80.6 213.1 0 103.4-152.1 261-217.5 324-54.6 52.6-113.1 102-164.6 139-54.8 39.5-93.8 59.6-115.8 59.6zM295.4 127.5c-72.6 0-139.1 28.6-187.3 80.4-47.5 51.2-73.7 120.6-73.7 195.4 0 64.8 78.3 178.9 209.6 305.3 53.8 51.8 111.2 100.3 161.7 136.6 56.1 40.4 88.9 54.8 100.9 54.8s44.7-14.4 100.9-54.8c50.5-36.3 108-84.9 161.7-136.6 131.2-126.4 209.6-240.5 209.6-305.3 0-74.9-26.2-144.2-73.7-195.4-48.2-51.9-114.7-80.4-187.3-80.4-61.8 0-127.8 38.5-201.7 117.9-2.5 2.6-5.9 4.1-9.5 4.1s-7.1-1.5-9.5-4.1C423.2 166 357.2 127.5 295.4 127.5z" fill="#141414" p-id="2811"></path><path d="M353.9 415.6m-33.8 0a33.8 33.8 0 1 0 67.6 0 33.8 33.8 0 1 0-67.6 0Z" fill="#0F0F0F" p-id="2812"></path><path d="M659.3 415.6m-33.8 0a33.8 33.8 0 1 0 67.6 0 33.8 33.8 0 1 0-67.6 0Z" fill="#0F0F0F" p-id="2813"></path><path d="M411.6 538.5c0 52.3 42.8 95 95 95 52.3 0 95-42.8 95-95v-31.7h-190v31.7z" fill="#5B5143" p-id="2814"></path><path d="M506.6 646.5c-59.6 0-108-48.5-108-108v-31.7c0-7.2 5.8-13 13-13h190.1c7.2 0 13 5.8 13 13v31.7c0 59.5-48.5 108-108.1 108z m-82-126.7v18.7c0 45.2 36.8 82 82 82s82-36.8 82-82v-18.7h-164z" fill="#141414" p-id="2815"></path><path d="M450.4 578.9a54.7 27.5 0 1 0 109.4 0 54.7 27.5 0 1 0-109.4 0Z" fill="#EA64F9" p-id="2816"></path><path d="M256 502.7a32.1 27.5 0 1 0 64.2 0 32.1 27.5 0 1 0-64.2 0Z" fill="#EFAFF9" p-id="2817"></path><path d="M703.3 502.7a32.1 27.5 0 1 0 64.2 0 32.1 27.5 0 1 0-64.2 0Z" fill="#EFAFF9" p-id="2818"></path></svg>',
            //     click() { alert('捐赠地址：https://ld246.com/sponsor') },
            // }


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
            console.log('input');
            //article.value = value; // 监听输入事件，更新绑定的内容
            current_article.value = value;
            //console.log(current_article.value)
            latest_view.value = 'article';
            //sync();
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
    sync();
    vditor.value.destroy();
});

</script>

<style scoped>
.meta-info-menu {
    display: flex;
    justify-content: center;
    align-items: center;
    align-self: center;
}


/* 上下两部分 */
.content-container {
    display: flex;
    flex: 1;
    /*占满整个父容器 */
    height: 85vh;
    overflow: hidden;

    /* 唯一允许滚动的区域 */

}

/* 左边的编辑器样式 */
.editor {
    flex: 4;
    /* 占 80% 空间 */
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