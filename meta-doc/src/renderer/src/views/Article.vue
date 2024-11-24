<template>

    <div class="content-container">
        <!-- 左边：Vditor Markdown 编辑器 -->
        <!-- 菜单组件 -->
        <TitleMenu v-if="showTitleMenu" :title="currentTitle" :position="menuPosition" @close="handleTitleMenuClose"
            :path="currentTitlePath" :treeJson="JSON.stringify(extractOutlineTreeFromMarkdown(article, true))" @accept="async (content) => {
                await acceptGeneratedText(content);
            }" />

        <div id="vditor" class="editor" v-loading="loading" @keydown="handleTab">

        </div>

        <!-- 右边：元信息显示 -->
        <div class="meta-info">

            <div style="text-align: center; font-size: large;">
                <h1 class="interactive-text" @click="showMetaDialog">文档元信息</h1>
            </div>
            <h1 @click="genTitleDialogVisible = !genTitleDialogVisible" class="interactive-text">标题：{{ meta.title ||
                '无标题' }}
            </h1>
            <LlmDialog v-if="genTitleDialogVisible"
                :prompt="generateTitlePrompt(JSON.stringify(extractOutlineTreeFromMarkdown(article, true)))"
                title="生成标题" :llmConfig="{ max_tokens: 15, temperature: 0.0 }" @llm-content-accept="(content) => {
                    meta.title = content;
                    genTitleDialogVisible = false;
                }" @update:visible="genTitleDialogVisible = $event; genTitleDialogVisible = false"
                :defaultText="meta.title" :defaultInputSize="1"></LlmDialog>

            <p><strong>作者：</strong>{{ meta.author || '未填写' }}</p>
            <p @click="genDescriptionDialogVisible = !genDescriptionDialogVisible" class="interactive-text">
                <strong>描述：</strong>{{ meta.description || '暂无描述' }}
            </p>
            <LlmDialog v-if="genDescriptionDialogVisible"
                :prompt="generateDescriptionPrompt(JSON.stringify(extractOutlineTreeFromMarkdown(article, true)))"
                title="生成描述" :llmConfig="{ max_tokens: 100, temperature: 0.0 }" @llm-content-accept="(content) => {
                    meta.description = content;
                    genDescriptionDialogVisible = false;
                }" @update:visible="genDescriptionDialogVisible = $event; genDescriptionDialogVisible = false"
                :defaultText="meta.description" :defaultInputSize="5"></LlmDialog>

        </div>

        <el-dialog v-model="editMetaDialogVisible" title="修改文章元信息" width="30%">
            <el-form>
                <el-form-item label="标题">
                    <el-input v-model="meta.title" autocomplete="off" class="aero-input" />
                </el-form-item>
                <el-form-item label="作者">
                    <el-input v-model="meta.author" autocomplete="off" class="aero-input" />
                </el-form-item>
                <el-form-item label="描述">
                    <el-input type="textarea" placeholder="请输入文章描述" v-model="meta.description" autocomplete="off"
                        class="aero-input" />
                </el-form-item>
            </el-form>
        </el-dialog>

    </div>

</template>


<script>
import {

    Edit,

} from '@element-plus/icons-vue'
import { onMounted, ref, reactive, onBeforeUnmount } from "vue";
import { ElButton, ElDialog } from 'element-plus' // 引入 Element Plus 按钮和弹框组件
import Vditor from "vditor";
import "vditor/dist/index.css";
import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import { ElLoading } from 'element-plus'
import { countNodes, current_article, current_article_meta_data, latest_view, searchNode, sync } from "../utils/common-data";
import eventBus from '../utils/event-bus';
import LlmDialog from "../components/LlmDialog.vue";
import AiLogo from "../assets/ai-logo.svg"
import { generateDescriptionPrompt, generateTitlePrompt } from '../utils/prompts';
import { el, tr } from 'element-plus/es/locales.mjs';
import { generateMarkdownFromOutlineTree, extractOutlineTreeFromMarkdown } from '../utils/md-utils'
import { current_outline_tree } from '../utils/common-data';
import TitleMenu from '../components/TitleMenu.vue';
export default {
    name: "Article",
    setup() {
        const genTitleDialogVisible = ref(false);
        const genDescriptionDialogVisible = ref(false);
        const modifyContentDialogVisible = ref(false);
        const continueContentDialogVisible = ref(false);
        const vditor = ref(""); // Vditor 实例
        const editMetaDialogVisible = ref(false); // 编辑元信息对话框是否可见
        // 文章元信息
        const article = ref(current_article);
        var meta = reactive(current_article_meta_data);
        const loadingInstance = ElLoading.service({ fullscreen: false })

        const showTitleMenu = ref(false); // 控制菜单显示
        const currentTitle = ref(""); // 存储当前双击的标题
        const menuPosition = ref({ top: 0, left: 0 }); // 菜单位置
        const currentTitlePath = ref('');//当前双击的标题的路径
        // 双击事件处理
        const handleClick = (event, title, path) => {
            currentTitle.value = title;
            // 根据鼠标位置设置菜单位置
            //如果太靠下方，上移
            let top = event.clientY * 0.9;
            if (top > document.body.clientHeight * 0.6) {
                top = document.body.clientHeight * 0.6;
            }
            menuPosition.value = {
                top: top, // 偏移量
                left: event.clientX * 1.2, // 偏移量
            };
            currentTitlePath.value = path;
            showTitleMenu.value = true;
        };


        eventBus.on('refresh', () => {
            // //console.log( vditor.value);
            // //article.value = current_article.value;
            // if(vditor.value){
            //     if
            //     vditor.value.setValue(current_article.value);
            //     bindTitleMenu();
            // }
            // //vditor.value.setValue(current_article.value);

            meta = reactive(current_article_meta_data);
        });
        const acceptGeneratedText = async (content) => {
            //console.log('accept');
            const outlineTree = extractOutlineTreeFromMarkdown(article.value, false);
            const path = currentTitlePath.value;
            const node = searchNode(path, outlineTree);
            //console.log(node);
            node.text = content;
            current_outline_tree.value = outlineTree;
            latest_view.value = 'outline';
            sync();
            vditor.value.setValue(current_article.value);
            bindTitleMenu();
            latest_view.value = 'article';
            //handleTitleMenuClose();
        }
        const handleTitleMenuClose = () => {
            showTitleMenu.value = false;
        };
        const bindTitleMenu = async () => {
            //console.log('bindTitleMenu');
            let allNodes = document.getElementsByClassName('vditor-ir__node');

            // 将 HTMLCollection 转换为数组并筛选出 h1 到 h6 标签
            let sections = Array.from(allNodes).filter(node =>
                ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName));

            for (let i = 0; i < sections.length; i++) {
                const section = sections[i];
                section.removeEventListener('click', handleClick);
                //section.classList.remove('interactive-text');
            }//先移除原本的事件
            const outlineTree = current_outline_tree.value;
            //按理来说，大纲树的总节点数应该和section数量一致
            //为了便于数据绑定，section节点添加一个属性path，存储大纲树的路径。对应的outlineTree节点是深度优先的节点

            const treeNodeQueue = [];
            const dfsOutlineTree = (node) => {
                treeNodeQueue.push(node);
                if (node.children) {
                    for (let i = 0; i < node.children.length; i++) {
                        const child = node.children[i];
                        dfsOutlineTree(child);
                    }
                }
            }
            dfsOutlineTree(outlineTree);
            //如果第一个path是'dummy'，删除
            if (treeNodeQueue[0].path === 'dummy') {
                treeNodeQueue.shift();
            }
            console.log(treeNodeQueue);
            console.log(sections);
            //console.log(treeNodeQueue);
            for (let i = 0; i < sections.length; i++) {
                const section = sections[i];
                section.classList.add('interactive-text');
                const node = treeNodeQueue[i];
                section.setAttribute('path', node.path);

                section.addEventListener('click', function (event) {
                    const title = section.innerText;
                    //console.log(title);
                    //console.log(event);
                    //console.log(section.getAttribute('path'));
                    handleClick(event, title, section.getAttribute('path'));
                });

            }

        }
        onMounted(() => {
            //console.log(LlmDialog)
            // console.log(article.value);
            // console.log(meta.value);


            vditor.value = new Vditor('vditor', {
                height: "100%",
                mode: "ir", // 即时渲染模式
                toolbarConfig: { pin: true },
                toolbar: [
                'undo',     // 撤销
                'redo',     // 重做
                    'emoji',    // 表情
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
                    'content-theme', // 编辑区主题




                ],
                cdn: 'http://localhost:3000/vditor',
                cache: { enable: false },
                placeholder: "在此编辑 Markdown 内容...",
                value: article.value,
                input: (value) => {
                    //console.log(value)
                    article.value = value; // 监听输入事件，更新绑定的内容
                    current_article.value = value;
                    latest_view.value = 'article';
                    sync();
                    bindTitleMenu();

                },
                after: async () => {
                    sync();
                    await bindTitleMenu();
                    loadingInstance.close();

                },

            });
        });
        onBeforeUnmount(() => {

            sync();
            vditor.value.destroy();
        });
        // 更新编辑器内容
        const showMetaDialog = () => {
            editMetaDialogVisible.value = true;
        };

        const handleTab = (event) => {
            if (event.key === "Tab") {
                event.preventDefault(); // 阻止默认行为
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);
                const tabNode = document.createTextNode("\t");

                // 插入制表符
                range.insertNode(tabNode);

                // 调整光标位置
                range.setStartAfter(tabNode);
                range.setEndAfter(tabNode);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        };

        return {
            article,
            meta,
            editMetaDialogVisible,
            showMetaDialog,
            genTitleDialogVisible,
            genDescriptionDialogVisible,
            modifyContentDialogVisible,
            continueContentDialogVisible,
            generateTitlePrompt,
            generateDescriptionPrompt,
            extractOutlineTreeFromMarkdown,
            showTitleMenu,
            currentTitle,
            menuPosition,
            handleClick,
            handleTitleMenuClose,
            currentTitlePath,
            acceptGeneratedText,
            searchNode,
            handleTab
        };
    },
};
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
    overflow-y: auto;
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
    overflow: auto;
    box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.1);
}

/* 底部菜单样式 */
.footer-menu {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    border-top: 1px solid #ddd;
    background-color: #fff;
}
</style>