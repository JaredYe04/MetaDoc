<template>
    <div class="main-container">
        <!-- 顶部工具栏：工具选择、撤销/重做、重置、图片导入与粘贴、笔刷粗细调节 -->
        <div class="toolbar-group">
            <div class="flex flex-col items-start tool-group">
                <el-segmented v-model="tool" :options="options" size="default">

                    <template #default="scope">
                        <div :class="[
                            'flex',
                            'items-center',
                            'gap-2',
                            'flex-col',
                            direction === 'horizontal' && 'p-2',
                        ]">
                            <el-icon size="20">
                                <component :is="scope.item.icon" />
                            </el-icon>
                            <div>{{ scope.item.label }}</div>
                        </div>
                    </template>
                </el-segmented>
            </div>
            <div class="undo-redo-group tool-group">
                <el-tooltip content="撤销" placement="top">
                    <el-button size="large" @click="undo" circle><el-icon>
                            <RefreshLeft />
                        </el-icon></el-button>
                </el-tooltip>
                <el-tooltip content="重做" placement="top">
                    <el-button size="large" circle @click="redo"><el-icon>
                            <RefreshRight />
                        </el-icon></el-button>
                </el-tooltip>
                <el-tooltip content="重置" placement="top">
                    <el-button size="large" circle @click="resetCanvas"><el-icon>
                            <Refresh />
                        </el-icon></el-button>
                </el-tooltip>
            </div>


            <div class="tool-group">
                <el-tooltip content="导入图片" placement="top">
                    <el-button @click="triggerImport"><el-icon>
                            <Upload />
                        </el-icon></el-button>
                </el-tooltip>
                <el-icon size="large" style="padding: 10px;">
                    <Picture />
                </el-icon>
                <el-tooltip content="复制图片" placement="top">
                    <el-button @click="copyImage"><el-icon>
                            <CopyDocument />
                        </el-icon></el-button>
                </el-tooltip>

            </div>




            <!-- 隐藏的文件上传 -->
            <input type="file" ref="fileInput" style="display: none" @change="handleFileChange" accept="image/*" />
            <!-- 笔刷粗细调节 -->
            <div class="brush-size tool-group" style="width: 240px;">
                <span>笔刷粗细：</span>
                <el-slider v-model="brushSize" :min="1" :max="20" :step="1" show-tooltip style="width: 120px" />
                <!-- 根据 canvas 缩放比例显示预览的笔刷粗细 -->
                <div class="brush-preview" :style="{
                    marginLeft: '10px',
                    width: brushPreviewSize + 'px',
                    height: brushPreviewSize + 'px',
                    borderRadius: '50%',
                    backgroundColor: tool === 'eraser' ? '#fff' : '#000',
                    border: tool === 'eraser' ? '1px solid #ccc' : 'none'
                }"></div>
            </div>

        </div>

        <!-- 中间内容区域 -->
        <div class="content">
            <!-- 左侧：画板 -->
            <div class="left-panel display-panel" id="canvasContainer">
                <canvas ref="drawingCanvas" class="drawing-canvas"></canvas>
            </div>
            <!-- 中间：箭头和公式识别按钮 -->
            <div class="middle-panel">
                <div class="arrow">→</div>
                <el-button type="primary" @click="recognizeFormula">
                    公式识别
                </el-button>
            </div>
            <!-- 右侧：公式显示 -->
            <div class="right-panel display-panel">
                <MdPreview :modelValue="latexResult" class="latex-container" previewTheme="github" codeStyleReverse
                    :style="{
                        textColor: themeState.currentTheme.textColor,
                    }" :class="themeState.currentTheme.mdeditorClass" :codeFold="false" :autoFoldThreshold="300" />
                <div class="fomula-toolbar">
                    <div class="tool-group" >
                        <el-tooltip content="编辑公式" placement="top">
                            <el-button type="primary" :icon="Edit" circle @click="openEditDialog" />
                        </el-tooltip>
                        <el-tooltip content="复制公式" placement="top">
                            <el-button type="primary" :icon="DocumentCopy" circle @click="copyResult" />
                        </el-tooltip>
                    </div>

                </div>
            </div>
        </div>

        <!-- 底部工具栏：编辑和复制 -->


        <!-- 编辑公式对话框 -->
        <el-dialog title="编辑公式" v-model="editDialogVisible">
            <el-input type="textarea" v-model="latexResult" rows="4"></el-input>
            <template #footer>
                <el-button @click="editDialogVisible = false">取消</el-button>
                <el-button type="primary" @click="editDialogVisible = false">
                    确定
                </el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElNotification } from 'element-plus'
import { CircleClose, CopyDocument, DocumentCopy, Edit, EditPen, Picture, Pointer, Refresh, RefreshLeft, RefreshRight, Upload } from '@element-plus/icons-vue'
import { getElement } from 'element-plus/es/utils/index.mjs'
import { convertBase64ToBlob, toBase64 } from '../utils/image-utils'
import { simpletexOcr } from '../utils/simpletex-utils'
import { md2html } from '../utils/md-utils'
import { themeState } from '../utils/themes'
import { MdPreview } from 'md-editor-v3'

// 当前工具：'pen'、'eraser' 或 'pointer'
const tool = ref('pen')
const options = [
    { label: '画笔', value: 'pen', icon: EditPen },
    { label: '橡皮擦', value: 'eraser', icon: CircleClose },
    { label: '箭头', value: 'pointer', icon: Pointer }
]
// 编辑对话框显示状态
const editDialogVisible = ref(false)
// 公式识别得到的 LaTeX 公式
const latexResult = ref('')
// 文件上传和 canvas 引用
const fileInput = ref(null)
const drawingCanvas = ref(null)
let canvasContext = null
let isDrawing = false
// 笔刷粗细（画笔模式下有效），范围1~20，默认2
const brushSize = ref(2)

// 根据 canvas 缩放比例动态计算预览笔刷的显示尺寸
const brushPreviewSize = computed(() => {
    if (drawingCanvas.value) {
        const rect = drawingCanvas.value.getBoundingClientRect()
        const scaleX = rect.width / drawingCanvas.value.width
        return brushSize.value * scaleX
    }
    return brushSize.value
})

// 撤销与重做栈（保存 canvas ImageData 对象）
const undoStack = []
const redoStack = []

//监听窗口的resize事件，重新设置canvas的宽高
window.addEventListener('resize', () => {
    //先保留原来的画布内容
    const imgData = canvasContext.getImageData(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
    //重新设置画布的宽高
    drawingCanvas.value.width = document.getElementById('canvasContainer').clientWidth
    drawingCanvas.value.height = document.getElementById('canvasContainer').clientHeight
    //重新绘制画布内容
    canvasContext.putImageData(imgData, 0, 0)

})


onMounted(() => {
    if (drawingCanvas.value) {
        canvasContext = drawingCanvas.value.getContext('2d')
        // 设置默认绘图参数
        canvasContext.lineWidth = brushSize.value
        canvasContext.lineCap = 'round'
        // 填充背景为白色
        canvasContext.fillStyle = '#fff'
        canvasContext.fillRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
        // drawingCanvas.value.width = document.getElementById('canvasContainer').offsetWidth
        // drawingCanvas.value.height = document.getElementById('canvasContainer').offsetHeight
        drawingCanvas.value.width = document.getElementById('canvasContainer').clientWidth
        drawingCanvas.value.height = document.getElementById('canvasContainer').clientHeight


        // drawingCanvas.value.height = drawingCanvas.value.offsetHeight
        // 保存初始状态
        pushState()
        // 监听绘图事件
        drawingCanvas.value.addEventListener('mousedown', startDrawing)
        drawingCanvas.value.addEventListener('mousemove', draw)
        drawingCanvas.value.addEventListener('mouseup', stopDrawing)
        drawingCanvas.value.addEventListener('mouseout', stopDrawing)
    }
    window.addEventListener('paste', handlePaste)
})

// 计算 canvas 内部的实际坐标（考虑缩放偏移）
function getCanvasCoordinates(e) {
    const rect = drawingCanvas.value.getBoundingClientRect()
    const scaleX = drawingCanvas.value.width / rect.width
    const scaleY = drawingCanvas.value.height / rect.height
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    }
}

// 绘图开始
function startDrawing(e) {
    if (tool.value === 'pointer') return
    isDrawing = true
    const { x, y } = getCanvasCoordinates(e)
    canvasContext.beginPath()
    canvasContext.moveTo(x, y)
}

// 绘制过程
function draw(e) {
    if (!isDrawing || tool.value === 'pointer') return
    const { x, y } = getCanvasCoordinates(e)
    if (tool.value === 'eraser') {
        canvasContext.strokeStyle = '#fff'
        // 橡皮擦的实际粗细按 brushSize 放大
        canvasContext.lineWidth = brushSize.value * 5
    } else {
        canvasContext.strokeStyle = '#000'
        canvasContext.lineWidth = brushSize.value
    }
    canvasContext.lineTo(x, y)
    canvasContext.stroke()
}

// 绘图结束
function stopDrawing() {
    if (!isDrawing) return
    isDrawing = false
    canvasContext.closePath()
    pushState()
    redoStack.length = 0
}

// 保存当前 canvas 状态到撤销栈
function pushState() {
    const canvas = drawingCanvas.value
    if (canvas && canvasContext) {
        const imgData = canvasContext.getImageData(0, 0, canvas.width, canvas.height)
        undoStack.push(imgData)
    }
}

// 撤销操作
function undo() {
    if (undoStack.length > 1) {
        const currentState = undoStack.pop()
        redoStack.push(currentState)
        const previousState = undoStack[undoStack.length - 1]
        canvasContext.putImageData(previousState, 0, 0)
    } else {
        ElNotification({
            title: '提示',
            message: '无法撤销',
            type: 'warning'
        })
    }
}

// 重做操作
function redo() {
    if (redoStack.length > 0) {
        const state = redoStack.pop()
        undoStack.push(state)
        canvasContext.putImageData(state, 0, 0)
    } else {
        ElNotification({
            title: '提示',
            message: '无法重做',
            type: 'warning'
        })
    }
}

// 工具选择
function selectTool(selected) {
    tool.value = selected
}

// 重置画布，清空内容并保存初始状态
function resetCanvas() {
    canvasContext.clearRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
    canvasContext.fillStyle = '#fff'
    canvasContext.fillRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
    undoStack.length = 0
    redoStack.length = 0
    pushState()
}

// 触发文件上传
function triggerImport() {
    fileInput.value && fileInput.value.click()
}

// 处理上传的图片文件
function handleFileChange(e) {
    const file = e.target.files[0]
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (event) => {
            const img = new Image()
            img.onload = () => {
                canvasContext.clearRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
                canvasContext.drawImage(img, 0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
                pushState()
            }
            img.src = event.target.result
        }
        reader.readAsDataURL(file)
    }
}

// 粘贴图片提示
async function copyImage() {
    // 将 canvas 转为图片
    const imgData = drawingCanvas.value.toDataURL('image/png')
    // 将图片转为Base64格式，然后转换成Blob对象
    let base64Data = await toBase64(imgData);
    //console.log(base64Data);
    const blobInput = convertBase64ToBlob(base64Data, "image/png");
    const clipboardItemInput = new ClipboardItem({
        "image/png": blobInput,
    });

    if (navigator.clipboard) {
        navigator.clipboard.write([clipboardItemInput]);
    }
    ElNotification({
        title: '提示',
        message: '复制成功，请使用 Ctrl+V 粘贴图片',
        type: 'success'
    })

}
// 处理剪切板粘贴的图片
function handlePaste(e, items_ = null) {
    let items;
    if (items_) {
        items = items_
        console.log(items)
    } else {
        items = (e.clipboardData || e.originalEvent.clipboardData).items
    }

    for (let index in items) {
        const item = items[index]
        if (item.kind === 'file') {
            const blob = item.getAsFile()
            const reader = new FileReader()
            reader.onload = (event) => {
                const img = new Image()
                img.onload = () => {
                    canvasContext.clearRect(0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
                    canvasContext.drawImage(img, 0, 0, drawingCanvas.value.width, drawingCanvas.value.height)
                    pushState()
                }
                img.src = event.target.result
            }
            reader.readAsDataURL(blob)
            break
        }
    }
}

// 模拟调用公式识别 API
async function recognizeFormula() {
    const imageData = drawingCanvas.value.toDataURL('image/png')
    simpletexOcr(imageData).then((res) => {
        res = '$$\n' + res + '\n$$'
        res =
            latexResult.value = res
    })

}

// 打开编辑对话框
function openEditDialog() {
    editDialogVisible.value = true
}

// 复制公式到剪切板
function copyResult() {
    navigator.clipboard.writeText(latexResult.value).then(() => {
        ElNotification({
            title: '成功',
            message: '复制成功',
            type: 'success'
        })
    }).catch(() => {
        ElNotification({
            title: '错误',
            message: '复制失败',
            type: 'error'
        })
    })
}
</script>

<style scoped>
.main-container {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

/* 顶部工具栏 */
.toolbar-group {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
}

/* 笔刷粗细设置 */
.brush-size {
    display: flex;
    align-items: center;
    gap: 5px;
}

/* 中间内容区域 */
.content {
    display: flex;
    gap: 20px;
    width: 100%;
    height: 400px;
}

/* 左侧画板 */
.left-panel {
    flex: 1;
    position: relative;

}

.drawing-canvas {

    background-color: #fff;
    display: block;
    position: absolute;
    bottom: 0;
    left: 0;


}

/* 中间区域 */
.middle-panel {
    flex: 0.3;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.arrow {
    font-size: 36px;
    margin-bottom: 10px;
}

/* 右侧公式显示 */
.right-panel {
    flex: 1;

    padding: 10px;
    overflow: auto;
}

.latex-container {
    width: 100%;
    height: 100%;
}

.display-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;

    border: 1px solid #8d8d8d;
}

/* 底部工具栏 */
.fomula-toolbar {
    position: absolute;
    display: flex;
    justify-content: flex-end;
    transition: all 0.3s;
    gap: 10px;
}

.undo-redo-group {

    gap: 5px;

}

.tool-group {
    display: flex;
    height: 50px;
    align-items: center;
    border: 1px solid #ccc;
    padding: 5px;
    border-radius: 10px;
}
</style>