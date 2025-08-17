<template>
    <el-container style="height: 100vh">
        <el-dialog v-model="renameDialogVisible" :title="$t('aigraph.renameTitle')" width="500">
            <el-input v-model="editingTitle" style="width: 100%" :placeholder="$t('aigraph.renamePlaceholder')" />
            <template #footer>
                <div class="dialog-footer">
                    <el-button @click="renameDialogVisible = false">{{ $t('common.cancel') }}</el-button>
                    <el-button type="primary" @click="finishRename">{{ $t('common.confirm') }}</el-button>
                </div>
            </template>
        </el-dialog>

        <el-dialog v-model="configDialogVisible" :title="$t('aigraph.newChartTitle')" width="500">
            <div>
                <el-form label-width="80px">
                    <el-form-item :label="$t('aigraph.chartName')" prop="name">
                        <el-input v-model="newGraphName" :placeholder="$t('aigraph.newChartPlaceholder')" />
                    </el-form-item>

                    <el-form-item :label="$t('aigraph.engine')" prop="engine">
                        <el-select v-model="newSelectedEngine" :placeholder="$t('aigraph.selectEngine')"
                            @change="onNewEngineChange">
                            <el-option v-for="engine in engines" :key="engine" :label="engine" :value="engine" />
                        </el-select>
                    </el-form-item>

                    <el-form-item :label="$t('aigraph.chartType')" prop="type">
                        <el-select v-model="newSelectedType" :placeholder="$t('aigraph.selectChartType')">
                            <el-option v-for="type in newAvailableTypes" :key="type" :label="type" :value="type" />
                        </el-select>
                    </el-form-item>
                </el-form>
            </div>
            <template #footer>
                <div class="dialog-footer">
                    <el-button type="primary" @click="addScheme">{{ $t('aigraph.newChartBtn') }}</el-button>
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
                                type="default" :title="$t('aigraph.renameTitle')" />
                        </div>
                    </el-menu-item>
                </el-scrollbar>

                <div class="selectors ">
                    <el-tooltip :content="$t('aigraph.currentChartInfo')" placement="right">
                        <el-form label-width="80px">
                            <el-form-item :label="$t('aigraph.chartName')" prop="engine">
                                <div style="font-weight: bold;">{{ activeScheme.name }}</div>
                            </el-form-item>

                            <el-form-item :label="$t('aigraph.engine')" prop="engine">
                                <el-select v-model="selectedEngine" :placeholder="$t('aigraph.selectEngine')"
                                    @change="onEngineChange" style="width: 150px">
                                    <el-option v-for="engine in engines" :key="engine" :label="engine"
                                        :value="engine" />
                                </el-select>
                            </el-form-item>

                            <el-form-item :label="$t('aigraph.chartType')" prop="type">
                                <el-select v-model="selectedType" :placeholder="$t('aigraph.selectChartType')"
                                    @change="onTypeChange" style="width: 150px">
                                    <el-option v-for="type in availableTypes" :key="type" :label="type" :value="type" />
                                </el-select>
                            </el-form-item>
                        </el-form>
                    </el-tooltip>
                </div>

                <div class="menu-header">
                    <el-tooltip :content="$t('aigraph.addScheme')">
                        <el-button type="primary" :icon="AddIcon" circle @click="initScheme" />
                    </el-tooltip>
                    <el-tooltip :content="$t('aigraph.duplicateScheme')">
                        <el-button type="info" :icon="CopyDocument" circle @click="duplicateScheme(activeSchemeId)" />
                    </el-tooltip>
                    <el-tooltip :content="$t('aigraph.deleteScheme')">
                        <el-button type="danger" :icon="Delete" circle @click="deleteScheme(activeSchemeId)" />
                    </el-tooltip>
                </div>
            </el-menu>
        </el-aside>

        <el-main class="main-content">
            <div class="content">
                <div id="graph" ref="graphRef" class="graph" />
                <div class="toolbar">
                    <el-tooltip :content="$t('aigraph.copyCode')" placement="top">
                        <el-button type="primary" :icon="DocumentCopy" circle @click="copyCode" />
                    </el-tooltip>
                    <el-tooltip :content="$t('aigraph.exportImage')" placement="top">
                        <el-button type="primary" :icon="Picture" circle @click="exportImage" />
                    </el-tooltip>
                </div>
            </div>

            <el-scrollbar class="prompt-section">
                <el-input  type="textarea" v-model="activeScheme.prompt" :placeholder="$t('aigraph.promptPlaceholder')"
                    :rows="2" :autosize="{ minRows: 2, maxRows: 3 }" :disabled="generating ||!activeScheme" />
                <div style="width: 100%; align-items: center; align-self: center;">
                    <el-button id="sendMsg" @click="generateCode" type="primary" round size="large" text bg
                        :disabled="!activeScheme.prompt || activeScheme.prompt.length === 0 ||!activeScheme" :loading="generating">
                        {{ $t('aigraph.send') }}
                    </el-button>
                    <el-button id="reset" @click="activeScheme.prompt = ''" round type="info" size="large"
                        :disabled="!activeScheme.prompt || activeScheme.prompt.length === 0 || !activeScheme" :loading="generating" text
                        bg>
                        {{ $t('aigraph.reset') }}
                    </el-button>
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
    justify-content: center;

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
import { ref, computed, onMounted, watch, onBeforeMount } from 'vue'
import { AddIcon } from 'tdesign-icons-vue-next'
import { CopyDocument, Delete, DocumentCopy, Edit, Picture } from '@element-plus/icons-vue'
import '../assets/tool-group.css'
import { graphEngineConfig } from '../config/graph-engine-config.js'
import Vditor from 'vditor'
import { themeState } from "../utils/themes";
import eventBus, { isElectronEnv } from '../utils/event-bus.js'
import { MdEditor } from 'md-editor-v3'

import { generateGraphPrompt } from '../utils/prompts.js'
import domtoimage from 'dom-to-image-more';
import { exportPng } from '../utils/image-utils.js'
import { localVditorCDN, vditorCDN } from '../utils/vditor-cdn.js'
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from '../utils/ai_tasks.js'
const { t } = useI18n()

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
    let node = document.getElementById('graph');
    node = node.querySelector('svg')
    if (!node) {
        console.error(t('aigraph.error.no_svg_found'))
        node = document.getElementById('graph');
    }
    exportPng(node, activeScheme.value.name)
}
const initScheme = () => {
    configDialogVisible.value = true;
    newGraphName.value = `${t('aigraph.graph.chart')} ${schemes.value.length + 1}`
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
            eventBus.emit('show-success', t('aigraph.success.copy_succeeded'))
        }).catch(err => {
            eventBus.emit('show-error', t('aigraph.error.copy_failed'))
        })
    } else {
        eventBus.emit('show-error', t('aigraph.error.no_code_to_copy'))
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

    if (schemes.value.length === 0) {
        createDefaultScheme()
    } else {
        activeSchemeId.value = schemes.value[0].id
        setActive(activeSchemeId.value)
    }
}

function saveSchemes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schemes.value))
}

function deleteScheme(id) {
    schemes.value = schemes.value.filter(s => s.id !== id)

    if (schemes.value.length === 0) {
        createDefaultScheme()
    } else {
        activeSchemeId.value = schemes.value[0].id
        setActive(activeSchemeId.value)
    }
    saveSchemes()
}
// 新增：创建默认图表
function createDefaultScheme() {
    const defaultId = Date.now().toString()
    const defaultEngine = engines[0]
    const defaultType = graphEngineConfig.find(e => e.name === defaultEngine)['graph-supported'][0]
    const defaultSpecialPrompt = graphEngineConfig.find(e => e.name === defaultEngine)['special-prompt'] || ''

    const defaultScheme = {
        id: defaultId,
        name: t('aigraph.graph.default_chart'), // 可以换成你想要的默认名称
        engine: defaultEngine,
        type: defaultType,
        specialPrompt: defaultSpecialPrompt,
        prompt: '',
        code: ''
    }

    schemes.value.push(defaultScheme)
    activeSchemeId.value = defaultId
    setActive(defaultId)
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
    eventBus.emit('sync-vditor-theme')
    //initVditor()
    //console.log(activeScheme.value)
    await refreshVditor();
}
const graphRef = ref(null)
let isInit = false
async function initVditor() {
    let cdn = '';
    if (isElectronEnv()) {
        cdn = localVditorCDN;
    }
    else {
        cdn = vditorCDN;
    }
    graphRef.value = new Vditor('graph', {
        mode: 'wysiwyg',
        theme: themeState.currentTheme.vditorTheme,
        cdn: cdn,
        toolbar: [],
        value: activeScheme.value.code,
        input: async (value) => {
            activeScheme.value.code = value;
        },
    })
}

onMounted(async () => {


    eventBus.on('sync-vditor-theme', async () => {
        await new Promise(
            (resolve) => {
                //一直等待，直到vditor实例化完成
                const interval = setInterval(() => {
                    if (graphRef.value) {
                        clearInterval(interval)
                        resolve()
                    }
                }, 100)
            }
        ).then(() => {
            graphRef.value.setTheme(themeState.currentTheme.vditorTheme, themeState.currentTheme.vditorTheme, themeState.currentTheme.codeTheme);
            graphRef.value.setValue(activeScheme.value.code)
        })

    });
    initVditor()
    loadSchemes()
    //graphRef.value.setValue(activeScheme.value.code)
})

async function refreshVditor() {
    if (graphRef.value)
        graphRef.value.setValue(activeScheme.value.code)
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
    const { handle, done } = createAiTask(activeScheme.value.prompt, prompt, codeRef, ai_types.answer, 'ai-graph', false);
    generating.value = true;

    try {
        await done;
    } catch (err) {
        console.warn('任务失败或取消：', err);
    } finally {

        generating.value = false;
    }


}



watch(
    () => activeScheme.value && activeScheme.value.code,
    () => {
        saveSchemes()
        refreshVditor()
    },
    { deep: true }
)

</script>
