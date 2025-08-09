<template>
    <el-scrollbar height="90vh">
        <div class="kb-scroll-wrapper">
            <div class="kb-container">

                <!-- Left: list -->
                <div class="kb-left" :style="{ background: themeState.currentTheme.background }">
                    <el-card class="kb-panel" shadow="hover"
                        :style="{ background: themeState.currentTheme.background2nd }">
                        <div class="kb-panel-header">
                            <h2 class="kb-panel-title">{{ t('knowledgeBase.title') }}</h2>
                            <div class="kb-panel-actions">
                                <el-button type="primary" size="small" @click="triggerUpload">{{ t('knowledgeBase.add')
                                    }}</el-button>
                                <el-button type="danger" size="small" :disabled="!selectedItem"
                                    @click="confirmDelete">{{
                                        t('knowledgeBase.delete') }}</el-button>
                                <input ref="fileInput" type="file" style="display:none" @change="onFileSelected" />
                            </div>
                        </div>

                        <el-scrollbar class="kb-list-scroll">
                            <el-table :data="items" stripe row-key="id" :highlight-current-row="true"
                                @current-change="onSelect" :current-row-key="selectedId" style="width:100%"
                                size="small">
                                <el-table-column prop="name" :label="t('knowledgeBase.name')" min-width="200">
                                    <template #default="{ row }">
                                        <div class="list-item" @click="selectRow(row)">
                                            <span class="status-dot" :class="row.enabled ? 'on' : 'off'"></span>
                                            <span class="item-name">{{ row.name }}</span>
                                        </div>
                                    </template>
                                </el-table-column>

                                <el-table-column :label="t('knowledgeBase.size_chunks')" width="140">
                                    <template #default="{ row }">
                                        <div>
                                            <div v-if="row.info">{{ row.info.sizeText || '-' }} / {{ row.info.chunks ||
                                                '-'
                                                }}
                                                {{ t('knowledgeBase.chunks_unit') }}</div>
                                            <div v-else>-</div>
                                        </div>
                                    </template>
                                </el-table-column>

                                <el-table-column :label="t('knowledgeBase.enabled')" width="90">
                                    <template #default="{ row }">
                                        <el-switch v-model="row.enabledLocal"
                                            @change="(val) => toggleEnable(row, val)" />
                                    </template>
                                </el-table-column>

                            </el-table>
                        </el-scrollbar>
                    </el-card>
                </div>

                <!-- 右边 -->
                <div class="kb-right" :style="{ background: themeState.currentTheme.background }">
                    <!-- 上：preview -->
                    <el-card class="kb-panel kb-preview" shadow="hover"
                        :style="{ background: themeState.currentTheme.background2nd }">
                        <div class="kb-panel-header">
                            <h2 class="kb-panel-title">{{ t('knowledgeBase.preview') }}</h2>
                            <div v-if="selectedItem" class="kb-panel-actions">
                                <el-button size="small" :disabled="!selectedItem" @click="openInEditor">
                                    {{ t('knowledgeBase.open_in_editor') }}
                                </el-button>
                            </div>
                        </div>

                        <el-scrollbar class="preview-scroll kb-scroll-wrapper">
                            <div class="preview-content" v-if="previewText">
                                <pre>{{ displayText }}</pre>
                            </div>
                            <div v-else class="placeholder">{{ t('knowledgeBase.select_placeholder') }}</div>
                        </el-scrollbar>
                    </el-card>

                    <!-- 下：config -->
                    <el-card class="kb-panel kb-config" shadow="hover"
                        :style="{ background: themeState.currentTheme.background2nd }">
                        <div class="kb-panel-header">
                            <h2 class="kb-panel-title">{{ t('knowledgeBase.config') }}</h2>
                        </div>

                        <el-scrollbar class="kb-scroll-wrapper">
                            <div v-if="selectedItem">
                                <el-descriptions column="1" size="small" border
                                    :style="{ background: themeState.currentTheme.background2nd }">
                                    <el-descriptions-item :label="t('knowledgeBase.filename')">
                                        <template v-if="isEditing">
                                            <el-input v-model="editFilename" size="small" class="edit-filename-input"
                                                @keyup.enter.native="onConfirm" />
                                            <el-button size="small" @click="onConfirm" class="aero-btn" circle
                                                :loading="renaming"> <el-icon v-if="!renaming" style="font-size: 14px">
                                                    <Check />
                                                </el-icon></el-button>
                                            <el-button size="small" @click="onCancel" :disabled="renaming"
                                                class="aero-btn" circle>
                                                <el-icon style="font-size: 14px">
                                                    <Close />
                                                </el-icon>
                                            </el-button>
                                        </template>
                                        <template v-else>
                                            {{ selectedItem.name }}
                                            <el-button icon="el-icon-edit" @click="startEditing" circle class="aero-btn"
                                                size="small"><el-icon style="font-size: 14px">
                                                    <Edit />
                                                </el-icon></el-button>
                                        </template>
                                    </el-descriptions-item>
                                    <el-descriptions-item :label="t('knowledgeBase.path')">
                                        {{ info.path || '-' }}
                                    </el-descriptions-item>
                                    <el-descriptions-item :label="t('knowledgeBase.chunks')">
                                        {{ info.chunks ?? '-' }}
                                    </el-descriptions-item>
                                    <el-descriptions-item :label="t('knowledgeBase.vector_dim')">
                                        {{ info.vector_dim ?? '-' }}
                                    </el-descriptions-item>
                                    <el-descriptions-item :label="t('knowledgeBase.vector_count')">
                                        {{ info.vector_count ?? '-' }}
                                    </el-descriptions-item>
                                    <el-descriptions-item :label="t('knowledgeBase.size')">
                                        {{ info.sizeText || '-' }}
                                    </el-descriptions-item>
                                    <el-descriptions-item :label="t('knowledgeBase.enabled_state')">
                                        <el-switch v-model="selectedItem.enabledLocal"
                                            @change="(val) => toggleEnable(selectedItem, val)" />
                                    </el-descriptions-item>
                                </el-descriptions>

                                <div class="config-actions">
                                    <el-button size="small" @click="rebuildVectors" :loading="isRebuilding">
                                        {{ t('knowledgeBase.rebuild') }}
                                    </el-button>
                                    <el-button size="small" @click="downloadFile">
                                        {{ t('knowledgeBase.download') }}
                                    </el-button>
                                </div>
                            </div>
                            <div v-else class="placeholder">{{ t('knowledgeBase.choose_one') }}</div>
                        </el-scrollbar>
                    </el-card>
                </div>



            </div>
        </div>

    </el-scrollbar>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import eventBus from '../utils/event-bus';
import { themeState } from '../utils/themes';
import { Check, Close, Edit } from '@element-plus/icons-vue';

const { t } = useI18n();

const items = ref([]);
const selectedId = ref(null);
const selectedItem = computed(() => items.value.find(i => i.id === selectedId.value) || null);
const previewText = ref('');
const isTruncated = ref(false);
const info = reactive({});
const isUploading = ref(false);
const isRebuilding = ref(false);
const fileInput = ref(null);
const baseUrl = 'http://localhost:3000/api/knowledge'
//kb-panel的背景设置为themeState中的background
// helper: format size
function humanSize(bytes) {
    if (!bytes && bytes !== 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let u = 0; let n = bytes;
    while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
    return `${n.toFixed(1)} ${units[u]}`;
}

// fetch list from backend
async function fetchList() {
    try {
        console.log("Fetching knowledge base list...");
        const r = await fetch(`${baseUrl}/list`);

        const j = await r.json();

        // expected j.items = [{id,name,enabled, info?}]
        items.value = (j.items || []).map(it => ({ ...it, enabledLocal: !!it.enabled, info: it.info || {} }));
    } catch (e) {
        console.error(e);
    }
}

// select row
function selectRow(row) {
    selectedId.value = row.id;
    fetchPreview(row.id);
    fetchInfo(row.id);
}

function onSelect(row) {
    if (row) selectRow(row);
}

// upload flow
function triggerUpload() {
    fileInput.value && fileInput.value.click();
}

async function onFileSelected(e) {
    const f = e.target.files[0];
    if (!f) return;
    await uploadFile(f);
    // reset input
    e.target.value = ''; knowledgeItems.push
}

async function uploadFile(file) {
    isUploading.value = true;
    const fd = new FormData();
    fd.append('file', file);
    try {
        const r = await fetch(`${baseUrl}/upload`, { method: 'POST', body: fd });
        const j = await r.json();
        if (j.success) {
            eventBus.emit('show-success', t('knowledgeBase.upload_complete'));
            await fetchList();
        } else {
            eventBus.emit('show-error', j.message || t('knowledgeBase.upload_failed'));
        }
    } catch (e) {
        console.error(e);
        eventBus.emit('show-error', t('knowledgeBase.upload_error') + e.message);
    } finally {
        isUploading.value = false;
    }
}

// delete
function confirmDelete() {
    if (!selectedItem.value) return;
    ElMessageBox.confirm(t('knowledgeBase.delete_confirm', { name: selectedItem.value.name }), t('knowledgeBase.delete_confirm_title'), {
        confirmButtonText: t('knowledgeBase.delete'),
        cancelButtonText: t('knowledgeBase.cancel'),
        type: 'warning'
    }).then(() => deleteItem(selectedItem.value.id))
}

async function deleteItem(id) {
    try {
        const r = await fetch(`${baseUrl}/${id}`, { method: 'DELETE' });
        const j = await r.json();
        if (j.success) {
            eventBus.emit('show-success', t('knowledgeBase.deleted'));
            if (selectedId.value === id) selectedId.value = null;
            await fetchList();
            previewText.value = '';
            Object.keys(info).forEach(k => delete info[k]);
        } else {
            eventBus.emit('show-error', j.message || t('knowledgeBase.delete_failed'));
        }
    } catch (e) {
        console.error(e);
        eventBus.emit('show-error', t('knowledgeBase.delete_error') + e.message);
    }
}

// fetch preview
async function fetchPreview(id) {
    previewText.value = '';
    isTruncated.value = false;
    try {
        const r = await fetch(`${baseUrl}/${id}/preview`);
        const j = await r.json();
        previewText.value = j.preview || '';
        isTruncated.value = !!j.truncated;
    } catch (e) {
        console.error(e);
    }
}

// fetch info
async function fetchInfo(id) {
    try {
        const r = await fetch(`${baseUrl}/${id}/info`);
        const j = await r.json();
        if (j.success) {
            info.path = j.path;
            info.chunks = j.chunks;
            info.vector_dim = j.vector_dim;
            info.vector_count = j.vector_count;
            info.sizeText = j.sizeText || (j.size ? humanSize(j.size) : '-');
            // also attach to items list if present
            const it = items.value.find(x => x.id === id);
            if (it) it.info = { chunks: j.chunks, sizeText: info.sizeText };
        }
    } catch (e) {
        console.error(e);
    }
}

// toggle enable
async function toggleEnable(row, val) {
    try {
        const r = await fetch(`${baseUrl}/${row.id}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !!val })
        });
        const j = await r.json();
        if (j.success) {
            row.enabledLocal = !!j.enabled;
            // reflect to items list
            const it = items.value.find(x => x.id === row.id);
            if (it) it.enabled = row.enabledLocal;
        } else {
            eventBus.emit('show-error', j.message || t('knowledgeBase.set_failed'));
            row.enabledLocal = !val; // rollback
        }
    } catch (e) {
        console.error(e);
        eventBus.emit('show-error', t('knowledgeBase.set_error'));
        row.enabledLocal = !val; // rollback
    }
}

// rebuild vectors
async function rebuildVectors() {
    if (!selectedItem.value) return;
    isRebuilding.value = true;
    try {
        const r = await fetch(`${baseUrl}/${selectedItem.value.id}/rebuild`, { method: 'POST' });
        const j = await r.json();
        if (j.success) {
            eventBus.emit('show-success', t('knowledgeBase.rebuild_submitted'));
            // refresh info
            await fetchInfo(selectedItem.value.id);
        } else eventBus.emit('show-error', j.message || t('knowledgeBase.rebuild_failed'));
    } catch (e) {
        console.error(e);
        eventBus.emit('show-error', t('knowledgeBase.rebuild_error'));
    } finally { isRebuilding.value = false; }
}

// download
function downloadFile() {
    if (!selectedItem.value) return;
    window.open(`${baseUrl}/${selectedItem.value.id}/download`, '_blank');
}

function openInEditor() {
    if (!selectedItem.value) return;
    const filePath = info.path;
    //console.log('Opening file in editor:', filePath);
    eventBus.emit('shell-open', filePath);

}

const displayText = computed(() => {
    if (!previewText.value) return '';
    // truncate to ~4000 characters for preview
    const limit = 4000;
    if (previewText.value.length <= limit) return previewText.value;
    return previewText.value.slice(0, limit) + '\n...';
});

onMounted(async () => {
    await fetchList();
});


const isEditing = ref(false);
const editFilename = ref('');
const renaming = ref(false);

function startEditing() {
    editFilename.value = selectedItem.value.name;
    isEditing.value = true;
}

function onCancel() {
    editFilename.value = "";
    isEditing.value = false;
}

async function onConfirm() {
    if (!editFilename.value.trim()) {
        eventBus.emit('show-error', '文件名不能为空');
        return;
    }
    if (editFilename.value === selectedItem.value.name) {
        // 文件名没改，直接退出编辑状态
        isEditing.value = false;
        return;
    }
    renaming.value = true;
    try {
        // 这里调用你的重命名接口，传入旧名和新名
        // 假设接口是 /api/knowledge/rename，POST请求
        const res = await fetch(`${baseUrl}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                oldName: selectedItem.value.name,
                newName: editFilename.value.trim(),
            }),
        });
        const data = await res.json();
        if (data.success) {
            eventBus.emit('show-success', '重命名成功');
            isEditing.value = false;
            await fetchList();
        } else {
            eventBus.emit('show-error', data.message || '重命名失败');
        }
    } catch (e) {
        eventBus.emit('show-error', '请求失败: ' + e.message);
    } finally {
        renaming.value = false;
    }
}
</script>

<style scoped>
.kb-scroll-wrapper {
    height: 100%;
}

.kb-preview,
.kb-config {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.kb-preview .el-scrollbar,
.kb-config .el-scrollbar {
    flex: 1;
    /* 关键：让滚动条填满剩余空间 */
}

.preview-scroll pre {
    white-space: pre-wrap;
    word-break: break-word;
}

.kb-scroll-wrapper {
    height: 90vh;
    /* 关键：给 el-scrollbar 内部一个固定高度的父容器 */
}

.kb-container {
    display: flex;
    width: 100%;
    height: 100%;
    padding: 10px;
    margin: 0;
    box-sizing: border-box;
}

.kb-left {
    width: 50%;
    height: 100%;
    padding: 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
}

.kb-right {
    width: 50%;
    height: 100%;
    padding: 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.kb-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.kb-list-scroll {
    flex: 1;
}

.kb-preview {
    flex: 1;
}

.kb-config {
    flex: 1;
}
</style>