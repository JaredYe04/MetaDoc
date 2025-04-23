<template>
    <el-container style="height: 100vh">
        <el-dialog v-model="renameDialogVisible" title="重命名" width="500">
            <el-input v-model="editingTitle" style="width: 100%" placeholder="请输入新标题" />
            <template #footer>
                <div class="dialog-footer">
                    <el-button @click="renameDialogVisible = false">取消</el-button>
                    <el-button type="primary" @click="finishRename">
                        确定
                    </el-button>
                </div>
            </template>
        </el-dialog>
        <el-dialog v-model="configDialogVisible" title="新建图表" width="500">
            <div>
                <el-form label-width="80px">
                    <el-form-item label="图表名称" prop="name">
                        <el-input v-model="newGraphName" placeholder="请输入新标题" />
                    </el-form-item>

                    <el-form-item label="绘图引擎" prop="engine">
                        <el-select v-model="newSelectedEngine" placeholder="选择绘图引擎" @change="onNewEngineChange">
                            <el-option v-for="engine in engines" :key="engine" :label="engine" :value="engine" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="图表类型" prop="type">
                        <el-select v-model="newSelectedType" placeholder="选择图表类型">
                            <el-option v-for="type in newAvailableTypes" :key="type" :label="type" :value="type" />
                        </el-select>
                    </el-form-item>
                </el-form>

            </div>
            <template #footer>
                <div class="dialog-footer">
                    <el-button type="primary" @click="addScheme">
                        新建图表
                    </el-button>
                </div>
            </template>
        </el-dialog>

        <el-aside width="300px" style="overflow: hidden;">

            <el-menu class="side-menu" :default-active="activeIndex">


                <el-scrollbar class="menu-scrollbar">
                    <el-menu-item v-for="(item, index) in schemes" :key="item.id" :index="index" :loading="generating"
                        @click="setActive(item.id)">
                        <div class="menu-item-wrapper">
                            <span class="dialog-title">{{ item.name }}</span>
                            <el-button circle :icon="Edit" @click.stop="renameScheme(index)" class="rename-button"
                                type="default" />
                        </div>
                    </el-menu-item>
                </el-scrollbar>

                <div class="selectors ">
                    <el-tooltip content="当前的图表信息" placement="right">
                        <el-form label-width="80px">
                            <el-form-item label="图表名称" prop="engine">
                                <div style="font-weight: bold;">{{ activeScheme.name }}</div>
                            </el-form-item>
                            <el-form-item label="绘图引擎" prop="engine">
                                <el-select v-model="selectedEngine" placeholder="选择绘图引擎" @change="onEngineChange"
                                    style="width: 150px">
                                    <el-option v-for="engine in engines" :key="engine" :label="engine"
                                        :value="engine" />
                                </el-select>
                            </el-form-item>
                            <el-form-item label="图表类型" prop="type">
                                <el-select v-model="selectedType" placeholder="选择图表类型" @change="onTypeChange"
                                    style="width: 150px">
                                    <el-option v-for="type in availableTypes" :key="type" :label="type" :value="type" />
                                </el-select>
                            </el-form-item>
                        </el-form>
                    </el-tooltip>

                </div>
                <div class="menu-header">
                    <el-tooltip content="新增绘图方案">
                        <el-button type="primary" :icon="AddIcon" circle @click="initScheme" />
                    </el-tooltip>
                    <el-tooltip content="复制当前方案">
                        <el-button type="info" :icon="CopyDocument" circle @click="duplicateScheme(activeSchemeId)" />
                    </el-tooltip>
                    <el-tooltip content="删除当前方案">
                        <el-button type="danger" :icon="Delete" circle @click="deleteScheme(activeSchemeId)" />
                    </el-tooltip>
                </div>
            </el-menu>

        </el-aside>

        <el-main class="main-content">
            <div class="content">
                <div id="graph" ref="graphRef" class="graph" />
                <div class="toolbar">
                    <el-tooltip content="复制代码" placement="top">
                        <el-button type="primary" :icon="DocumentCopy" circle @click="copyCode" />
                    </el-tooltip>

                </div>
            </div>

            <el-scrollbar class="prompt-section">

                <el-input type="textarea" v-model="activeScheme.prompt" placeholder="请输入你的绘图需求" :rows="2"
                    :autosize="{ minRows: 2, maxRows: 3 }" :disabled="generating"/>
                <div style="width: 100%; align-items: center; align-self: center;">
                    <el-button id="sendMsg" @click="generateCode" type="primary" round size="large" text bg
                        :disabled="activeScheme.prompt && activeScheme.prompt.length === 0" :loading="generating">
                        发送
                    </el-button>
                    <el-button id="reset" @click="activeScheme.prompt = ''" round type="info" size="large"
                        :disabled="activeScheme.prompt && activeScheme.prompt.length === 0" :loading="generating" text
                        bg>
                        重置
                    </el-button>
                    <!-- <el-button id="export-image" @click="exportImage" round type="info" size="large"
                        :loading="generating" text bg>
                        导出图片
                    </el-button> -->
                </div>

            </el-scrollbar>


        </el-main>
    </el-container>
</template>

<style scoped>
.toolbar {
    position: absolute;
    display: flex;
    justify-content: flex-end;
    transition: all 0.3s;
    padding: 20px;
    gap: 10px;

}

.sidebar {
    padding: 15px;

}



/* 1. 让 el-main 整体撑满 */
.main-content {
    display: flex;
    flex-direction: column;
    padding-top: 10px;
}

/* 2. .content 区域上下文也是 flex，垂直方向上撑满 */
.content {
    display: flex;
    flex: 1;
    /* 占满剩余高度 */
    gap: 20px;
    padding: 10px;
    margin: 10px;
    border: #666 1px solid;
    border-radius: 10px;
}

/* 3. 左右面板都 flex 布局，如果只需要一个画布占比全部，直接给 .graph flex:1 */
.graph {
    flex: 1;
    /* 在 .content 里占满剩余宽度＆高度 */
    width: 100%;
    /* 横向也铺满 */
    height: 100%;
    /* 纵向也铺满 */
    overflow: auto;
}

/* 如果你还有左右两个 panel，需要分别设置： */
.left-panel,
.right-panel {
    display: flex;
    flex-direction: column;
}

.menu-header {
    background-color: #55555511;
    padding: 10px;
    display: flex;
    gap: 10px;
    justify-content:center;

    align-self: center;
    align-items: center;

}

.prompt-section {
    margin: 5px;
    padding: 5px;
    height: fit-content;
    max-height: 30vh;
    overflow: auto;
    border: #666 1px solid;
    border-radius: 10px;
}

.editor-section {
    height: 65vh;
    max-height: 65vh;
}

.rename-button {
    position: absolute;
    /* 绝对定位 */
    right: 0px;
    /* 始终固定在右侧 */
    top: 50%;
    transform: translateY(-50%);
    /* 垂直居中 */

}

.selectors {
    display: flex;
    align-items: center;
    /* border: 1px solid #666; */

    width: 100%;
    background-color: #55555522;


    bottom: 0;
    height: 23vh;
    max-height: 23vh;

}

.menu-scrollbar {
    height: 65vh;
    max-height: 65vh;
    overflow: auto;
    border: #66666644 1px solid;

    margin-bottom: 0;
    margin-top: 5px;

}

/* 中间内容区域 */
.content {
    display: flex;
    gap: 20px;
    height: 75vh;
    border: #666 1px solid;
    border-radius: 10px;
    margin: 10px;
}

.side-menu {
    height: 100vh;
    max-height: 100vh;
    padding-top: 15px;
}
</style>
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { AddIcon } from 'tdesign-icons-vue-next'
import { CopyDocument, Delete, DocumentCopy, Edit } from '@element-plus/icons-vue'
import '../assets/tool-group.css'
import { graphEngineConfig } from '../config/graph-engine-config.js'
import Vditor from 'vditor'
import { themeState } from "../utils/themes";
import eventBus from '../utils/event-bus.js'
import { MdEditor } from 'md-editor-v3'
import { answerQuestionStream } from '../utils/llm-api.js'
import { generateGraphPrompt } from '../utils/prompts.js'
import domtoimage from 'dom-to-image-more';

const STORAGE_KEY = 'aiGraph_schemes'
const engines = graphEngineConfig.map(e => e.name)

// 当前选中引擎／类型，而不是新的
const selectedEngine = ref(engines[0])//
const selectedType = ref(
    graphEngineConfig.find(e => e.name === selectedEngine.value)['graph-supported'][0]
)
const specialPrompt = ref(graphEngineConfig.find(e => e.name === selectedEngine.value)['special-prompt'] || '')
//新建图表时的引擎和类型
const newSelectedEngine = ref(engines[0])
const newSelectedType = ref(
    graphEngineConfig.find(e => e.name === selectedEngine.value)['graph-supported'][0]
)
const newSpecialPrompt = ref(graphEngineConfig.find(e => e.name === newSelectedEngine.value)['special-prompt'] || '')
const newGraphName = ref('')
// 动态计算当前引擎支持的类型数组
const availableTypes = computed(() => {
    const cfg = graphEngineConfig.find(e => e.name === selectedEngine.value)
    return cfg ? cfg['graph-supported'] : []
})
const newAvailableTypes = computed(() => {
    const cfg = graphEngineConfig.find(e => e.name === newSelectedEngine.value)
    return cfg ? cfg['graph-supported'] : []
})
const schemes = ref([])
const activeSchemeId = ref(0)
const generating = ref(false)
//const vditorRef = ref(null)

const activeScheme = computed(() => schemes.value.find(s => s.id === activeSchemeId.value) || {})

const renameDialogVisible = ref(false);
const editingTitle = ref('');
const editingIndex = ref(0);
//import { toPng } from 'html-to-image';
const exportImage = () => {
    // var node = document.getElementById('graph');
    // //选择svg元素
    // node=node.querySelector('svg')
    // if(!node){
    //     node = document.getElementById('graph');
    // }
    // toPng(node, {
    //     cacheBust: true,
    //     // skipFonts: true, // 避免跨域字体错误
    //     style: {

    //     }
    // }).then(function (dataUrl) {
    //     const filename = activeScheme.value.name + '.png'
    //     // 创建一个 a 标签下载 base64 图像
    //     const link = document.createElement('a');
    //     link.href = dataUrl;
    //     link.download = filename;
    //     document.body.appendChild(link);
    //     link.click();
    //     document.body.removeChild(link);

    // }).then(function () {
    //     eventBus.emit('show-success', '导出图片成功')
    // })
    //     .catch(function (error) {
    //         eventBus.emit('show-error', '导出图片失败:' + error)
    //         //console.error('oops, something went wrong!', error);
    //     });
}
const initScheme = () => {
    configDialogVisible.value = true;
    newGraphName.value = `图表 ${schemes.value.length + 1}`
    newSelectedEngine.value = engines[0]
    newSelectedType.value = graphEngineConfig.find(e => e.name === engines[0])['graph-supported'][0]
    newSpecialPrompt.value = graphEngineConfig.find(e => e.name === engines[0])['special-prompt'] || ''
}

function addScheme() {
    const id = Date.now().toString()
    const scheme = {
        id,
        name: newGraphName.value,
        engine: newSelectedEngine.value,
        type: newSelectedType.value,
        specialPrompt: specialPrompt.value,
        prompt: '',
        code: ''
    }
    schemes.value.push(scheme)
    activeSchemeId.value = id
    configDialogVisible.value = false
    saveSchemes()
}

const copyCode = () => {
    const code = activeScheme.value.code
    if (code) {
        navigator.clipboard.writeText(code).then(() => {
            eventBus.emit('show-success', '复制成功')
        }).catch(err => {
            eventBus.emit('show-error', '复制失败')
        })
    } else {
        eventBus.emit('show-error', '没有代码可复制')
    }
}
const renameScheme = (index) => {
    editingIndex.value = index;
    renameDialogVisible.value = true;
    editingTitle.value = schemes.value[index].name;

};
const finishRename = () => {
    schemes.value[editingIndex.value].name = editingTitle.value;
    renameDialogVisible.value = false;
    editingTitle.value = '';
    editingIndex.value = 0;
    saveSchemes()

};
const configDialogVisible = ref(false);
// const editCode = () => {
//     configDialogVisible.value = true;

// }
// const finishEdit = () => {
//     configDialogVisible.value = false;

// }



function loadSchemes() {
    const data = localStorage.getItem(STORAGE_KEY)
    schemes.value = data ? JSON.parse(data) : []
    if (schemes.value.length > 0) activeSchemeId.value = schemes.value[0].id
}

function saveSchemes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schemes.value))
}

function deleteScheme(id) {
    schemes.value = schemes.value.filter(s => s.id !== id)
    activeSchemeId.value = schemes.value.length ? schemes.value[0].id : null
    setActive(activeSchemeId.value)
    saveSchemes()
}
function duplicateScheme(id) {
    const scheme = schemes.value.find(s => s.id === id)
    if (scheme) {
        const newScheme = { ...scheme, id: Date.now().toString(), name: scheme.name + ' - 副本' }
        schemes.value.push(newScheme)
        activeSchemeId.value = newScheme.id
        saveSchemes()
    }
}
async function setActive(id) {
    activeSchemeId.value = id
    selectedEngine.value = activeScheme.value.engine
    selectedType.value = activeScheme.value.type
    //console.log(activeScheme.value)
    await refreshVditor();
}
const graphRef = ref(null)

onMounted(async () => {
    eventBus.emit('sync-theme')
    graphRef.value = new Vditor('graph', {
        mode: 'wysiwyg',
        theme: themeState.currentTheme.vditorTheme,
        cdn: 'http://localhost:3000/vditor',
        toolbar: [],

        value: activeScheme.value.code,
        input: async (value) => {
            activeScheme.value.code = value;


        },
    })
    eventBus.on('sync-vditor-theme', async () => {
        graphRef.value.setTheme(themeState.currentTheme.vditorTheme, themeState.currentTheme.vditorTheme, themeState.currentTheme.codeTheme);
        graphRef.value.setValue(activeScheme.value.code)
    });

    //graphRef.value.setValue(activeScheme.value.code)
})
async function refreshVditor() {
    if (graphRef.value)
        graphRef.value.setValue(activeScheme.value.code)
    // const graph= document.getElementById('graph')

    // await Vditor.preview(graph, activeScheme.value.code, {
    //     theme: themeState.currentTheme.vditorTheme,
    //     cdn: 'http://localhost:3000/vditor',
    // })
}
function onEngineChange(engine) {
    selectedEngine.value = engine
    const cfg = graphEngineConfig.find(e => e.name === engine)
    selectedType.value = cfg['graph-supported'][0]
    specialPrompt.value = cfg['special-prompt'][0] || ''
    // 同步到当前方案
    if (activeScheme.value) {
        activeScheme.value.engine = engine
        activeScheme.value.type = selectedType.value
        activeScheme.value.specialPrompt = cfg['special-prompt'][0] || ''
        saveSchemes()
    }
}

function onTypeChange(type) {
    selectedType.value = type
    if (activeScheme.value) {
        activeScheme.value.type = type
        saveSchemes()
    }
}
function onNewEngineChange(engine) {
    newSelectedEngine.value = engine
    const cfg = graphEngineConfig.find(e => e.name === engine)
    newSelectedType.value = cfg['graph-supported'][0]
    newSpecialPrompt.value = cfg['special-prompt'][0] || ''
}


async function generateCode() {
    if (!activeScheme.value) return
    generating.value = true
    activeScheme.value.code = ''
    const prompt = generateGraphPrompt(activeScheme.value.engine,
        activeScheme.value.type,
        activeScheme.value.prompt,
        activeScheme.value.specialPrompt);
    console.log(prompt)
    const codeRef = ref('')
    watch(
        () => codeRef.value,
        (newCode) => {
            activeScheme.value.code = newCode
            refreshVditor()
        },
        { immediate: true }
    )
    await answerQuestionStream(prompt, codeRef)
    generating.value = false
}



watch(
    () => activeScheme.value && activeScheme.value.code,
    () => {
        saveSchemes()
        refreshVditor()
    },
    { deep: true }
)

onMounted(() => {
    loadSchemes()
    // 初始化 Vditor 可选
})
</script>
