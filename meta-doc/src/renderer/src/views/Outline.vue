<template>
  <div class="container">
    <vue-tree ref="tree" style="width: 100%; height: 600px; border: 1px solid gray; "
    :style="{ backgroundColor: themeState.currentTheme.outlineBackground }"
  :dataset="treeData" :config="treeConfig" :direction="direction" @node-click="handleNodeClick" 
  @node-drag="handleNodeDrag" linkStyle="straight">


      <template #node="{ node, collapsed }"  :style="{backgroundColor: themeState.currentTheme.outlineNode }">
        <div class="tree-node"  :style="{backgroundColor: themeState.currentTheme.outlineNode }">
          {{ node.title }}
        </div>
        <el-tooltip content="编辑节点" placement="top">
          <el-button size="small" type="text" class="aero-btn"  circle
            @click.stop="handleNodeButtonClick(node)" v-if="node.path !== 'dummy'">
            <el-icon>
              <More />
            </el-icon>
          </el-button>
        </el-tooltip>

        <div v-if="dialogVisible[node.path]" class="aero-div node-edit-box" @click.stop @mousemove.stop @mousedown.stop
          @mouseup.stop>
          <div>
            <!-- 菜单按钮 -->
            <div class="button-group">
              <el-tooltip content="左移" placement="top">
                <el-button type="info" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="move2Left">
                  <el-icon style="font-size: 14px">
                    <ArrowLeftBold />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="添加子节点" placement="top">
                <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="addChildNode">
                  <el-icon style="font-size: 14px">
                    <Plus />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="编辑内容" placement="top">
                <el-button type="primary" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="editNode">
                  <el-icon style="font-size: 14px">
                    <Edit />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button type="danger" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="deleteNode">
                  <el-icon style="font-size: 14px">
                    <Delete />
                  </el-icon>
                </el-button>
              </el-tooltip>

              <el-tooltip content="右移" placement="top">
                <el-button type="info" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="move2Right">
                  <el-icon style="font-size: 14px">
                    <ArrowRightBold />
                  </el-icon>
                </el-button>
              </el-tooltip>

            </div>

          </div>
        </div>
      </template>
    </vue-tree>
    <el-dialog v-model="editValueDialogVisible" title="修改章节名" width="30%">
      <el-form>
        <el-form-item label="章节名称">
          <el-input v-model="currentChapterValue" autocomplete="off" class="aero-input" />
        </el-form-item>
      </el-form>
      <el-button type="primary" @click="changeNodeValue"> 确定 </el-button>
    </el-dialog>
    <div class="bottom-menu aero-div">
      <el-tooltip content="放大" placement="top">

        <el-button type="success" circle @click="zoomIn">
          <el-icon>
            <Plus />
          </el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip content="缩小" placement="top">
        <el-button type="warning" circle @click="zoomOut">
          <el-icon>
            <Minus />
          </el-icon>
        </el-button>

      </el-tooltip>
      <el-tooltip content="重置" placement="top">
        <el-button type="info" circle @click="resetScale">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </el-tooltip>


    </div>
  </div>
</template>
<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import { ElButton, ElDialog, ElMessageBox, ElNotification } from 'element-plus'; // 引入 Element Plus 组件
import eventBus from '../utils/event-bus.js';
import '../assets/aero-div.css';
import '../assets/aero-btn.css';
import "../assets/aero-input.css";
import { Plus, Edit, Delete, More, Minus, ArrowLeftBold, ArrowRightBold } from '@element-plus/icons-vue';
import { current_outline_tree, default_outline_tree, latest_view, sync } from '../utils/common-data';
import { searchNode, searchParentNode } from '../utils/common-data';
import { removeTextFromOutline } from '../utils/md-utils.js';
import { outlineChangePrompt } from '../utils/prompts.js';
import { answerQuestionStream } from '../utils/llm-api.js';
import { themeState } from '../utils/themes.js';


const treeData = ref(current_outline_tree);
const direction = ref('vertical');
const treeConfig = reactive({
  nodeWidth: 180,
  nodeHeight: 50,
  levelHeight: 200
});
const currentChapterValue = ref('');
const editValueDialogVisible = ref(false);
const dialogVisible = ref({});
const llmDialogVisible = ref({});
const selectedNode = ref(null); // 当前选中的节点
const generated = ref(false);
const generating = ref(false);
const userPrompt = ref('');
const presetPrompts = ref([
  { value: '把这个章节分成几个扩展小节' },
  { value: '精简本章节的子节数，浓缩成几个小节' },
  { value: '根据上下文大意，生成合适的文章结构' }
]);
const generatedText = ref('');
const menuToggle = ref(false);

// 生命周期钩子
onMounted(() => {
  sync();
  eventBus.on('refresh', () => {
    treeData.value = current_outline_tree;
  });
});

// 监听 treeData 变化
watch(treeData, (val) => {
  current_outline_tree.value = val;
  latest_view.value = 'outline'; // 说明最后一次操作是在大纲视图
  sync();
}, { deep: true });

// 方法
const generate = async () => {
  generating.value = true;
  const treeWithoutText = removeTextFromOutline(treeData.value);
  const prompt = outlineChangePrompt(JSON.stringify(treeWithoutText), JSON.stringify(selectedNode.value), userPrompt.value);
  await answerQuestionStream(prompt, generatedText.value);
  generating.value = false;
  generated.value = true;
};

const reset = () => {
  generated.value = false;
  generatedText.value = '';
};

const querySearch = (queryString, cb) => {
  const createFilter = (queryString) => {
    return (preset) => {
      return preset.value.toLowerCase().includes(queryString.toLowerCase());
    };
  };
  const results = queryString ? presetPrompts.value.filter(createFilter(queryString)) : presetPrompts.value;
  cb(results);
};

const move2Left = () => {
  const cur_node = searchNode(selectedNode.value.path, treeData.value);
  const parent = searchParentNode(selectedNode.value.path, treeData.value);
  const index = parent.children.indexOf(cur_node);
  if (index > 0) {
    parent.children.splice(index, 1);
    parent.children.splice(index - 1, 0, cur_node);
    // 两个节点的 Path 交换
    const temp = parent.children[index].path;
    parent.children[index].path = parent.children[index - 1].path;
    parent.children[index - 1].path = temp;
  }
};

const move2Right = () => {
  const cur_node = searchNode(selectedNode.value.path, treeData.value);
  const parent = searchParentNode(selectedNode.value.path, treeData.value);
  const index = parent.children.indexOf(cur_node);
  if (index < parent.children.length - 1) {
    parent.children.splice(index, 1);
    parent.children.splice(index + 1, 0, cur_node);
    // 两个节点的 Path 交换
    const temp = parent.children[index].path;
    parent.children[index].path = parent.children[index - 1].path;
    parent.children[index - 1].path = temp;
  }
};

const changeNodeValue = () => {
  const cur_node = searchNode(selectedNode.value.path, treeData.value);
  cur_node.title = currentChapterValue.value;
  editValueDialogVisible.value = false;
};

const resetScale = () => {
  refs.tree.restoreScale();
};

const zoomIn = () => {
  refs.tree.zoomIn();
};

const zoomOut = () => {
  refs.tree.zoomOut();
};

const toggleLayout = () => {
  treeConfig.layout = treeConfig.layout === 'vertical' ? 'horizontal' : 'vertical';
};

const handleNodeButtonClick = (node) => {
  selectedNode.value = node;
  if (dialogVisible.value[node.path] != null) {
    dialogVisible.value[node.path] = !dialogVisible.value[node.path];
  } else {
    dialogVisible.value[node.path] = true;
  }

  // 一次只能打开一个操作框，所以关闭其他操作框
  for (let key in dialogVisible.value) {
    if (key !== node.path) {
      dialogVisible.value[key] = false;
    }
  }
};

const addChildNode = () => {
  const node = selectedNode.value;
  const cur_node = searchNode(node.path, treeData.value);
  const newNode = {
    title: '新子节点',
    text: '',
    path:
      cur_node.path +
      (cur_node.path !== '' ? '.' : '') +
      (cur_node.children && cur_node.children.length > 0 ? cur_node.children.length + 1 : 1),
    children: []
  };
  cur_node.children.push(newNode);
  dialogVisible.value[cur_node.path] = false;
};

const editNode = () => {
  const node = selectedNode.value;
  const cur_node = searchNode(node.path, treeData.value);
  editValueDialogVisible.value = true;
  currentChapterValue.value = cur_node.title;
};

const deleteNode = () => {
  ElMessageBox.confirm('是否要删除章节?', '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      const node = selectedNode.value;
      const parent = searchParentNode(node.path, treeData.value);
      const cur_node = searchNode(node.path, treeData.value);
      if (parent === null) {
        ElNotification({
          title: '错误',
          message: '不能删除根章节',
          type: 'error'
        });
        return;
      }
      removeNode(parent, cur_node);
      dialogVisible.value[node.path] = false;
      ElNotification({
        title: '消息',
        message: '删除章节成功!',
        type: 'info'
      });
    })
    .catch(() => {});

};

const closeDialog = () => {
  const node = selectedNode.value;
  dialogVisible.value[node.path] = false;
};

const removeNode = (parent, node) => {
  const index = parent.children ? parent.children.indexOf(node) : -1;
  if (index !== -1) {
    parent.children.splice(index, 1);
  } else {
    parent.children.forEach((child) => removeNode(child, node));
  }
};

</script>


<style scoped lang="less">
.node-edit-box {
  display: flex;
  flex-direction: column;
  /* 垂直布局 */
  align-items: center;
  position: fixed;
  margin-top: 100%;
  z-index: 10;
  /* 确保覆盖其他元素 */
}

.button-group {
  display: flex;
  /* 水平布局 */
  justify-content: space-around;
  /* 按钮间隔均匀 */
  width: 100%;
  /* 满宽布局 */
}

.action-buttons {
  display: flex;
  /* 水平布局 */
  // justify-content: space-around; /* 按钮间隔均匀 */
  align-items: start;
  width: 100%;
  /* 满宽布局 */
}

.inline-input {
  width: 500px;
  /* 限制最大宽度 */
}

.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 5px;
  justify-content: center;
  /* 居中 */
}

.controls {
  margin-bottom: 20px;
}
.tree-node {
  margin-bottom: 12px;  /* 增加底部间距 */
  display: inline-block;
  border-radius: 12px;  /* 增加圆角 */
  padding: 8px 16px;  /* 增加内边距，使节点更大，更易点击 */
  margin: 10px;
  cursor: pointer;
  transition: background-color 0.3s, transform 0.3s;  /* 添加过渡效果 */
}

.tree-node:hover {
  transform: scale(1.02);  /* 节点放大效果 */
}

.tree-node span {
  display: flex;
  align-items: center;
  font-size: 14px;  /* 设置默认字体大小 */
  color: #333;  /* 设置文本颜色 */
}

.dialog-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}
</style>
