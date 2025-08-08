<template>
  <div class="container">
    <el-scrollbar class="aero-div generate-preview" v-if="generating || pendingAccept" :style="{
      backgroundColor: themeState.currentTheme.background, top: position.top + 'px',
      left: position.left + 'px',
    }" @mousedown.stop="startDrag">
      <div class="noselect-display">
        <h2 v-if="generating">{{ $t('outline.generating') }}</h2>
        <!-- <h3 v-if="generateChildrenContentLoading">{{ $t('outline.generatingFor') }}:{{ nodeBeingProcessed }}</h3> -->
        <div v-if="generateChildrenContentLoading">
          <div v-for="(item, index) in parallelChildren" :key="index">
            <!-- <h3>{{ $t('outline.generatingFor') }}:{{ item.title }}</h3> -->
            <div v-if="item.value">{{ item.value }}</div>
          </div>
        </div>
        <div v-if="generateChildrenChildrenLoading">
          <div v-for="(item, index) in parallelChildren" :key="index">
            <!-- <h3>{{ $t('outline.generatingFor') }}:{{ item.title }}</h3> -->
            <div v-if="item.value">{{ item.value }}</div>
          </div>
        </div>
        <h2 v-if="pendingAccept">{{ $t('outline.generationDone') }}
          <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
            @click.stop="acceptChange">
            <el-icon style="font-size: 14px">
              <Check />
            </el-icon>
          </el-button>
          <el-button type="danger" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
            @click.stop="discardChange" :loading="generateChildChapterLoading">
            <el-icon style="font-size: 14px" v-if="!generateChildChapterLoading">
              <Close />
            </el-icon>
          </el-button>
        </h2>
        <div>
          {{ rawstring }}
        </div>

      </div>
    </el-scrollbar>

    <vue-tree ref="tree" style="width: 100%; height: 80vh; border: 1px solid gray; "
      :style="{ backgroundColor: themeState.currentTheme.outlineBackground }" :dataset="treeData" :config="treeConfig"
      :direction="direction" @node-click="handleNodeClick" linkStyle="straight" @drag-node-end="handleNodeDrag">


      <template #node="{ node, collapsed }" :style="{ backgroundColor: themeState.currentTheme.outlineNode }">
        <div class="tree-node" :style="{ backgroundColor: themeState.currentTheme.outlineNode }">
          {{ node.title }}
        </div>
        <el-tooltip :content="$t('outline.editNode')" placement="top">
          <el-button size="small" type="text" class="aero-btn" circle @click.stop="handleNodeButtonClick(node)"
            v-if="node.path !== 'dummy'" :disabled="pendingAccept || generating">
            <el-icon>
              <More />
            </el-icon>
          </el-button>
        </el-tooltip>
        <div v-if="dialogVisible[node.path]" class="aero-div node-edit-box" @click.stop @mousemove.stop @mousedown.stop
          @mouseup.stop>
          <div>
            <div class="button-group" v-if="!nodeMenuToggle">
              <el-tooltip :content="$t('outline.moveLeft')" placement="top">
                <el-button type="info" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="move2Left">
                  <el-icon style="font-size: 14px">
                    <ArrowLeftBold />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.addChild')" placement="top">
                <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="addChildNode">
                  <el-icon style="font-size: 14px">
                    <Plus />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.editContent')" placement="top">
                <el-button type="primary" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="editNode">
                  <el-icon style="font-size: 14px">
                    <Edit />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.delete')" placement="top">
                <el-button type="danger" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="deleteNode">
                  <el-icon style="font-size: 14px">
                    <Delete />
                  </el-icon>
                </el-button>
              </el-tooltip>

              <el-tooltip :content="$t('outline.moveRight')" placement="top">
                <el-button type="info" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="move2Right">
                  <el-icon style="font-size: 14px">
                    <ArrowRightBold />
                  </el-icon>
                </el-button>
              </el-tooltip>

            </div>
            <div class="button-group" v-if="nodeMenuToggle && !pendingAccept">
              <el-tooltip :content="$t('outline.generateContent')" placement="top">
                <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  :loading="generateContentLoading" @click.stop="generateContent" :disabled="generating">
                  <el-icon style="font-size: 14px" v-if="!generateContentLoading">
                    <EditPen />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.generateChildChapter')" placement="top">
                <el-button type="primary" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="generateChildChapter" :loading="generateChildChapterLoading" :disabled="generating">
                  <el-icon style="font-size: 14px" v-if="!generateChildChapterLoading">
                    <Finished />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.generateChildrenContent')" placement="top">
                <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="generateChildrenContent" :loading="generateChildrenContentLoading"
                  :disabled="generating">
                  <el-icon style="font-size: 14px" v-if="!generateChildrenContentLoading">
                    <Download />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.generateChildrenChildren')" placement="top">
                <el-button type="primary" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="generateChildrenChildren" :loading="generateChildrenChildrenLoading"
                  :disabled="generating">
                  <el-icon style="font-size: 14px" v-if="!generateChildrenChildrenLoading">
                    <Rank />
                  </el-icon>
                </el-button>
              </el-tooltip>
            </div>
            <el-scrollbar v-if="nodeMenuToggle &&
              !pendingAccept" class="aero-input"
              style="max-height: 10vh;  height: 8vh; overflow: auto; margin-top: 10px; padding:5px; border-radius: 8px;">
              <el-input :autosize="{ minRows: 5 }" v-model="userPrompt" style="height: 8vh" type="textarea"
                :disabled="generating" :placeholder="t('outline.userPromptPlaceholder')" clearable />
            </el-scrollbar>

            <div class="button-group" v-if="pendingAccept">
              <el-tooltip :content="$t('outline.accept')" placement="top">
                <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="acceptChange">
                  <el-icon style="font-size: 14px">
                    <Check />
                  </el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('outline.reject')" placement="top">
                <el-button type="danger" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
                  @click.stop="discardChange" :loading="generateChildChapterLoading">
                  <el-icon style="font-size: 14px" v-if="!generateChildChapterLoading">
                    <Close />
                  </el-icon>
                </el-button>
              </el-tooltip>
            </div>
            <!-- 普通菜单按钮 -->


          </div>
        </div>
      </template>

    </vue-tree>
    <el-dialog v-model="formatTitleDialogVisible" :title="$t('outline.formatTitleWizard')" width="30%">
      <el-form label-width="200px" class="demo-ruleForm">
        <el-form-item :label="$t('outline.adjustMarkdown')" prop="adjustMarkdown">
          <el-tooltip :content="$t('outline.adjustMarkdownTip')" placement="right">
            <el-switch v-model="formatTitleConfig.adjustMarkdown" active-color="#13ce66" inactive-color="#ff4949" />
          </el-tooltip>
        </el-form-item>
        <el-form-item v-if='formatTitleConfig.adjustMarkdown' :label="$t('outline.firstMarkdownTitleLevel')"
          prop="firstMarkdownTitleLevel">
          <el-input-number v-model="formatTitleConfig.firstMarkdownTitleLevel" :min="1" :max="6" :step="1"
            class="inline-input" />
        </el-form-item>
        <el-form-item :label="$t('outline.adjustTitle')" prop="adjustTitle">
          <el-tooltip :content="$t('outline.adjustTitleTip')" placement="right">
            <el-switch v-model="formatTitleConfig.adjustTitle" active-color="#13ce66" inactive-color="#ff4949" />
          </el-tooltip>
        </el-form-item>
        <el-form-item v-if="formatTitleConfig.adjustTitle" :label="$t('outline.coverOriginalNumber')" prop="append">
          <el-tooltip :content="$t('outline.coverTip')" placement="right">
            <el-switch v-model="formatTitleConfig.cover" active-color="#13ce66" inactive-color="#ff4949" />
          </el-tooltip>
        </el-form-item>
        <el-form-item v-if="formatTitleConfig.adjustTitle" :label="$t('outline.level1Chinese')"
          prop="level1TitleChinese">
          <el-tooltip :content="$t('outline.level1ChineseTip')" placement="right">
            <el-switch v-model="formatTitleConfig.level1TitleChinese" active-color="#13ce66" inactive-color="#ff4949" />
          </el-tooltip>
        </el-form-item>
        <el-button type="info" @click="formatTitleDialogVisible = false">{{ $t('outline.cancel') }}</el-button>
        <el-button type="success" @click="executeFormatTitle">{{ $t('outline.confirm') }}</el-button>
      </el-form>
    </el-dialog>
    <el-dialog v-model="editValueDialogVisible" :title="$t('outline.editChapterTitle')" width="40%">
      <el-form>
        <el-form-item :label="$t('outline.chapterName')">
          <el-input v-model="currentChapterValue" autocomplete="off" class="aero-input" />
        </el-form-item>
        <el-form-item :label="$t('outline.chapterContent')">
          <md-editor v-model="currentChapterContent" showCodeRowNumber previewTheme="github" codeStyleReverse
            style="text-align: left" :autoFoldThreshold="300" :theme="themeState.currentTheme.vditorTheme" />

        </el-form-item>
      </el-form>
      <el-button type="primary" @click="changeNodeValue">{{ $t('outline.confirm') }}</el-button>
    </el-dialog>
    <div class="bottom-menu aero-div">
      <el-tooltip :content="$t('outline.zoomIn')" placement="top">
        <el-button type="success" circle @click="zoomIn">
          <el-icon>
            <Plus />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.zoomOut')" placement="top">
        <el-button type="warning" circle @click="zoomOut">
          <el-icon>
            <Minus />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.reset')" placement="top">
        <el-button type="info" circle @click="resetScale">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.formatTitle')" placement="top">
        <el-button type="warning" circle @click="formatTitle">
          <el-icon style="width: 1em; height: 1em;">
            T
          </el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="$t('outline.openAiAssistant')" placement="top">
        <el-button :type="nodeMenuToggle ? 'primary' : 'danger'" circle @click="nodeMenuToggle = !nodeMenuToggle"
          :disabled="generating || pendingAccept">
          <el-icon style="width: 1em; height: 1em;">
            AI
          </el-icon>

        </el-button>
      </el-tooltip>
    </div>

  </div>
</template>
<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue';
import { ElButton, ElDialog, ElMessageBox, ElNotification } from 'element-plus'; // 引入 Element Plus 组件
import eventBus from '../utils/event-bus.js';
import '../assets/aero-div.css';
import '../assets/aero-btn.css';
import "../assets/aero-input.css";
import { MdEditor, MdPreview, MdCatalog } from 'md-editor-v3';
import { Plus, Edit, Delete, More, Minus, ArrowLeftBold, ArrowRightBold, Finished, EditPen, Checked, Close, Check, Download, Rank } from '@element-plus/icons-vue';
import { current_outline_tree, default_outline_tree, latest_view, sync, tree_node_schema } from '../utils/common-data';
import { searchNode, searchParentNode } from '../utils/common-data';
import { adjustTitleIndex, adjustTitleLevel, removeTextFromOutline } from '../utils/md-utils.js';
import { expandTreeNodePrompt, generateContentPrompt, generateParentNodeContentPrompt, outlineChangePrompt } from '../utils/prompts.js';

import { themeState } from '../utils/themes.js';
import { extractOuterJsonString } from '../utils/regex-utils.js';
import '../assets/noselect-display.css';
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from '../utils/ai_tasks.js';

const { t } = useI18n()
const formatTitleDialogVisible = ref(false);
const formatTitle = () => {
  formatTitleDialogVisible.value = true;
};
const formatTitleConfig = reactive({
  adjustMarkdown: true,
  firstMarkdownTitleLevel: 1,
  adjustTitle: true,//是否调整标题编号
  cover: true,
  level1TitleChinese: true,//第一级标题使用中文，如一 二三四五六七八九十
});

const backupOutlineTree = ref(null);
const generateContentLoading = ref(false);
const generateChildrenContentLoading = ref(false);
const generateChildrenChildrenLoading = ref(false);
const parallelChildren = ref([]); // 用于存储并行生成的子节点
const userPrompt = ref(''); // 用户输入的提示词
//const nodeBeingProcessed = ref(''); // 用于显示正在处理的节点名称
const generateChildrenChildren = async () => {
  const node = selectedNode.value;
  generating.value = true;
  generateChildrenChildrenLoading.value = true;

  const cur_node = searchNode(node.path, treeData.value);
  parallelChildren.value = [];
  const taskPromises = [];

  const traverseAndGenerate = async (curNode) => {
    if (!curNode) return;

    if (curNode.children && curNode.children.length > 0) {
      for (let child of curNode.children) {
        traverseAndGenerate(child); // 不 await，保留并发
      }
      return; //  不是叶子节点，跳过创建
    }

    // 是叶子节点，生成子节点
    const prompt = expandTreeNodePrompt(
      JSON.stringify(removeTextFromOutline(treeData.value)),
      JSON.stringify(curNode),
      JSON.stringify(tree_node_schema),
      userPrompt.value
    );

    const myRawString = ref('');
    parallelChildren.value.push(myRawString);

    const { handle, done } = createAiTask(
      curNode.title,
      prompt,
      myRawString,
      ai_types.answer,
      'outline-children-' + curNode.title
    );

    const taskPromise = done
      .then(() => {
        const json = extractOuterJsonString(myRawString.value);
        const newChildren = JSON.parse(json);
        curNode.children.push(...newChildren);
        eventBus.emit(
          'show-success',
          t('outline.generateChildSuccessWithTitle', { title: curNode.title })
        );
      })
      .catch((err) => {
        //console.warn('任务失败或取消：', err);
        // 可选 emit
      });

    taskPromises.push(taskPromise);
  };

  try {
    await traverseAndGenerate(cur_node);      // 启动所有任务
    await Promise.all(taskPromises);          // 等待所有生成完成
    eventBus.emit('show-success', t('outline.generateChildSuccess'));
  } catch (e) {
    eventBus.emit('show-error', t('outline.generateChildFail', { error: e.message }));
  } finally {
    generateChildrenChildrenLoading.value = false;
    generating.value = false;
  }
};

const generateChildrenContent = async () => {
  const node = selectedNode.value;
  generating.value = true;
  generateChildrenContentLoading.value = true;

  const cur_node = searchNode(node.path, treeData.value);
  parallelChildren.value = []; // 清空并行生成列表
  const taskPromises = []; //  用于收集所有任务的done promise

  const traverseAndGenerate = async (curNode) => {
    if (!curNode) return;

    if (curNode.children && curNode.children.length > 0) {
      for (let child of curNode.children) {
        // 递归处理子节点（并发触发）
        traverseAndGenerate(child); // ❗不要 await，保留并发
      }
    }

    let prompt = '';
    if (curNode.children.length === 0) {
      prompt = generateContentPrompt(
        JSON.stringify(removeTextFromOutline(treeData.value)),
        JSON.stringify(curNode),
        userPrompt.value
      );
    } else {
      prompt = generateParentNodeContentPrompt(
        JSON.stringify(removeTextFromOutline(treeData.value)),
        JSON.stringify(curNode),
        userPrompt.value
      );
    }

    const myRawString = ref('');
    parallelChildren.value.push(myRawString);

    const { handle, done } = createAiTask(
      curNode.title,
      prompt,
      myRawString,
      ai_types.answer,
      'outline-content-' + curNode.title
    );

    const taskPromise = done
      .then(() => {
        eventBus.emit(
          'show-success',
          t('outline.generateContentSuccessWithTitle', { title: curNode.title })
        );
      })
      .catch((err) => {
        console.warn('任务失败或取消：', err);
      })
      .finally(() => {
        curNode.text = myRawString.value;
      });

    taskPromises.push(taskPromise); //  收集这个 promise
  };

  await traverseAndGenerate(cur_node);  // 启动任务遍历（递归中是并发）

  await Promise.all(taskPromises);      //  等待所有任务完成

  generating.value = false;
  generateChildrenContentLoading.value = false;
  generated.value = true;
};

const generateContent = async () => {
  const node = selectedNode.value;
  generating.value = true;
  backupContent.value = node.text;
  generateContentLoading.value = true;
  const cur_node = searchNode(node.path, treeData.value);
  const prompt = generateContentPrompt(
    JSON.stringify(removeTextFromOutline(treeData.value)),
    JSON.stringify(cur_node),
    userPrompt.value
  );

  const { handle, done } = createAiTask(cur_node.title, prompt, rawstring, ai_types.answer, 'outline-content-' + cur_node.title);
  try {
    await done;
  } catch (err) {
    console.warn('任务失败或取消：', err);
  } finally {
    cur_node.text = rawstring.value;
    pendingAccept.value = true;
    generateContentLoading.value = false;
    generating.value = false;
  }
  eventBus.emit('show-success', t('outline.generateChapterSuccess'));

};


const position = ref({ top: 100, left: 100 });
let isDragging = false;
let offset = { x: 0, y: 0 };
function startDrag(e) {
  isDragging = true;
  offset.x = e.clientX - position.value.left;
  offset.y = e.clientY - position.value.top;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}
function onDrag(e) {
  if (isDragging) {
    position.value.left = e.clientX - offset.x;
    position.value.top = e.clientY - offset.y;
  }
}
function stopDrag() {
  isDragging = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}



const executeFormatTitle = () => {
  backupOutlineTree.value = current_outline_tree.value;
  if (formatTitleConfig.adjustMarkdown) {
    // 调整Markdown标题层级
    const firstLevel = formatTitleConfig.firstMarkdownTitleLevel;
    current_outline_tree.value = adjustTitleLevel(current_outline_tree.value, firstLevel);
  }
  //console.log('current_outline_tree', current_outline_tree.value);
  if (formatTitleConfig.adjustTitle) {
    // 调整章节编号
    const cover = formatTitleConfig.cover;
    const level1TitleChinese = formatTitleConfig.level1TitleChinese;
    current_outline_tree.value = adjustTitleIndex(current_outline_tree.value, cover, level1TitleChinese);
  }
  //console.log('current_outline_tree', current_outline_tree.value);
  formatTitleDialogVisible.value = false;
  eventBus.emit('show-success', t('outline.formatSuccess'));

}

const handleNodeDrag = (dragNode, targetNode) => {
  console.log('dragNode', dragNode);
  console.log('targetNode', targetNode);
}
const treeData = ref(current_outline_tree);
const direction = ref('vertical');
const treeConfig = reactive({
  nodeWidth: 180,
  nodeHeight: 50,
  levelHeight: 200
});
const tree = ref(null);
const currentChapterValue = ref('');
const currentChapterContent = ref('');
const editValueDialogVisible = ref(false);
const dialogVisible = ref({});
const selectedNode = ref(null); // 当前选中的节点
const generated = ref(false);
const generating = ref(false);
const rawstring = ref('');//所有AI生成的文本
const generatedText = ref('');

// 生命周期钩子
onMounted(() => {

  sync();
  // eventBus.on('refresh', () => {
  //   treeData.value = current_outline_tree;
  // });
});

// 监听 treeData 变化
watch(treeData, (val) => {
  current_outline_tree.value = val;
  latest_view.value = 'outline'; // 说明最后一次操作是在大纲视图
  eventBus.emit('is-need-save', true)
  sync();
}, { deep: true });



const reset = () => {
  generated.value = false;
  generatedText.value = '';
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
  cur_node.text = currentChapterContent.value;
  editValueDialogVisible.value = false;
};

const resetScale = () => {
  tree.value.restoreScale();
};

const zoomIn = () => {
  tree.value.zoomIn();
};

const zoomOut = () => {
  tree.value.zoomOut();
};

const toggleLayout = () => {
  treeConfig.layout = treeConfig.layout === 'vertical' ? 'horizontal' : 'vertical';
};
const nodeMenuToggle = ref(false);//false为普通节点，true为AI辅助节点
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
    title_level: cur_node.title_level + 1,
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
  currentChapterContent.value = cur_node.text;
};

const deleteNode = () => {
  ElMessageBox.confirm(
    t('outline.confirmDeleteChapter'),
    t('outline.warning'),
    {
      confirmButtonText: t('outline.confirm'),
      cancelButtonText: t('outline.cancel'),
      type: 'warning'
    }
  ).then(() => {
    const node = selectedNode.value;
    const parent = searchParentNode(node.path, treeData.value);
    const cur_node = searchNode(node.path, treeData.value);
    if (parent === null) {
      ElNotification({
        title: t('outline.error'),
        message: t('outline.cannotDeleteRoot'),
        type: 'error'
      });
      return;
    }
    removeNode(parent, cur_node);
    dialogVisible.value[node.path] = false;
    ElNotification({
      title: t('outline.message'),
      message: t('outline.deleteSuccess'),
      type: 'info'
    });
  })
    .catch(() => { });

};
const generateChildChapterLoading = ref(false);
const pendingAccept = ref(false);
const backupChildren = ref([]);
const backupContent = ref('');
const generateChildChapter = async () => {
  generateChildChapterLoading.value = true;
  generating.value = true;
  rawstring.value = '';
  try {
    const node = selectedNode.value;
    const cur_node = searchNode(node.path, treeData.value);

    const prompt = expandTreeNodePrompt(
      JSON.stringify(removeTextFromOutline(treeData.value)),
      JSON.stringify(cur_node),
      JSON.stringify(tree_node_schema),
      userPrompt.value
    );



    const { handle, done } = createAiTask(cur_node.title, prompt, rawstring, ai_types.answer, 'outline-children-' + cur_node.title);
    try {
      await done;
      const json = extractOuterJsonString(rawstring.value);
      //console.log('json', json);
      const newChildren = JSON.parse(json);
      backupChildren.value = cur_node.children;
      cur_node.children = [...cur_node.children, ...newChildren];
      //rawstring.value = '';
      pendingAccept.value = true;
    } catch (err) {
      console.warn('任务失败或取消：', err);
    } finally {

      //generating.value = false;
    }





  }
  catch (e) {
    console.log('json parse error', e);
    eventBus.emit('show-error', t('outline.generateChildRetryFail', { error: e.message }));

  }
  generateChildChapterLoading.value = false;
  generating.value = false;
}

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
const acceptChange = () => {
  backupChildren.value = [];
  backupContent.value = '';
  rawstring.value = '';
  pendingAccept.value = false;
};
const discardChange = () => {
  const node = selectedNode.value;
  const cur_node = searchNode(node.path, treeData.value);
  if (backupChildren.value != []) {
    cur_node.children = backupChildren.value;
    backupChildren.value = [];
  }
  if (backupContent.value != '') {
    cur_node.text = backupContent.value;
    backupContent.value = '';
  }
  pendingAccept.value = false;
};



</script>


<style scoped lang="less">
.el-scrollbar__wrap {
  overflow-x: hidden;
}

.generate-preview {
  position: absolute;
  max-width: 500px;
  width: 500px;
  max-height: 500px;
  opacity: 0.9;
  z-index: 10000;
  overflow: auto;
}

.node-edit-box {
  display: flex;
  flex-direction: column;
  /* 垂直布局 */
  align-items: center;
  position: fixed;
  margin-top: 100%;
  width: fit-content;
  transition: width 0.8s ease, all 0.3s ease;
  z-index: 10;
  /* 确保覆盖其他元素 */
}

.button-group {
  display: flex;
  /* 水平布局 */
  justify-content: space-around;
  /* 按钮间隔均匀 */
  width: fit-content;
  transition: all 0.3s;
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
  margin-bottom: 12px;
  /* 增加底部间距 */
  display: inline-block;
  border-radius: 12px;
  /* 增加圆角 */
  padding: 8px 16px;
  /* 增加内边距，使节点更大，更易点击 */
  margin: 10px;
  cursor: pointer;
  transition: background-color 0.3s, transform 0.3s;
  /* 添加过渡效果 */
}

.tree-node:hover {
  transform: scale(1.02);
  /* 节点放大效果 */
}

.tree-node span {
  display: flex;
  align-items: center;
  font-size: 14px;
  /* 设置默认字体大小 */
  color: #333;
  /* 设置文本颜色 */
}

.dialog-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}
</style>
