<template>
  <div class="container">
    <vue-tree ref="tree" style="width: 100%; height: 600px; border: 1px solid gray; background-color:#EAEFF1" 
  :dataset="treeData" :config="treeConfig" :direction="direction" @node-click="handleNodeClick" 
  @node-drag="handleNodeDrag" linkStyle="straight">


      <template #node="{ node, collapsed }">
        <div class="tree-node">
          {{ node.title }}
        </div>
        <el-tooltip content="编辑节点" placement="top">
          <el-button size="small" type="text" class="aero-btn" style="background-color: aliceblue" circle
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

<script>
import { ElButton, ElDialog } from 'element-plus' // 引入 Element Plus 按钮和弹框组件
import eventBus from '../utils/event-bus.js'
import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import "../assets/aero-input.css";
import {
  Plus,
  Edit,
  Delete,
  More,
  Minus,
  ArrowLeftBold,
  ArrowRightBold
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { ElNotification } from 'element-plus'
import '../assets/bottom-menu.css'
import { current_outline_tree, default_outline_tree, latest_view, sync } from '../utils/common-data'
import { searchNode, searchParentNode } from '../utils/common-data';
import { removeTextFromOutline } from '../utils/md-utils.js';
import { outlineChangePrompt } from '../utils/prompts.js';
import { answerQuestionStream } from '../utils/llm-api.js';
export default {
  name: 'Outline',
  components: {
    ElButton,
    ElDialog
  },
  data() {
    return {
      treeData: current_outline_tree,
      direction: 'vertical',
      treeConfig: {
        nodeWidth: 180,
        nodeHeight: 50,
        levelHeight: 200
      },
      currentChapterValue: '',
      editValueDialogVisible: false,
      dialogVisible: {},
      llmDialogVisible: {},
      selectedNode: null, // 当前选中的节点
      generated: false,
      generating: false,
      userPrompt: '',
      presetPrompts: [
        {
          value: '把这个章节分成几个扩展小节',
        },
        {
          value: '精简本章节的子节数，浓缩成几个小节',
        },
        {
          value: '根据上下文大意，生成合适的文章结构',
        }
      ],
      generatedText: '',
      menuToggle: false
    }

  },
  mounted() {
    sync();
    eventBus.on('refresh', () => {
      this.treeData = current_outline_tree
    });
  },
  created() { },
  watch: {
    treeData: {
      handler: function (val) {
        current_outline_tree.value = val;
        latest_view.value = 'outline';//说明最后一次操作是在大纲视图
        sync();
        //console.log('大纲数据已更新')
      },
      deep: true
    }
  },
  methods: {
    async generate() {
      this.generating = true;
      const treeWithoutText = removeTextFromOutline(this.treeData);
      const prompt = outlineChangePrompt(JSON.stringify(treeWithoutText), JSON.stringify(this.selectedNode), this.userPrompt);
      await answerQuestionStream(prompt, this.generatedText);
      console.log(this.generatedText);
      this.generating = false;

      this.generated = true;
    },
    accept() {
      // //searchNode(props.path, current_outline_tree.value).text=generatedText.value;
      // // latest_view.value='outline';
      // // sync();
      // //如果最后一位不是换行符，加上换行符
      // if (generatedText.value[generatedText.value.length - 1] !== '\n') {
      //   generatedText.value += '\n';
      // }

      // //如果第一行是标题，去掉标题
      // if (generatedText.value.startsWith('#')) {
      //   generatedText.value = generatedText.value.split('\n').slice(1).join('\n');
      // }
      // articleContent.value = generatedText.value;
      // emit('accept', generatedText.value);
      // reset();

    },
    reset() {
      this.generated = false;
      this.generatedText = '';
    },
    querySearch(queryString, cb) {
      const createFilter = (queryString) => {
        return (preset) => {
          //模糊匹配，只要包含就行
          return preset.value.toLowerCase().includes(queryString.toLowerCase())
        }
      }
      //console.log(queryString)
      const results = queryString
        ? this.presetPrompts.filter(createFilter(queryString))
        : this.presetPrompts
      // call callback function to return suggestions
      cb(results)
    },
    move2Left() {
      const cur_node = searchNode(this.selectedNode.path, this.treeData)
      const parent = searchParentNode(this.selectedNode.path, this.treeData)
      const index = parent.children.indexOf(cur_node)
      if (index > 0) {
        parent.children.splice(index, 1)
        parent.children.splice(index - 1, 0, cur_node)
        //两个节点的Path交换
        const temp = parent.children[index].path
        parent.children[index].path = parent.children[index - 1].path
        parent.children[index - 1].path = temp
      }
    },
    move2Right() {
      const cur_node = searchNode(this.selectedNode.path, this.treeData)
      const parent = searchParentNode(this.selectedNode.path, this.treeData)
      const index = parent.children.indexOf(cur_node)
      if (index < parent.children.length - 1) {
        parent.children.splice(index, 1)
        parent.children.splice(index + 1, 0, cur_node)
        //两个节点的Path交换
        const temp = parent.children[index].path
        parent.children[index].path = parent.children[index - 1].path
        parent.children[index - 1].path = temp
      }
    },
    changeNodeValue() {
      const cur_node = searchNode(this.selectedNode.path, this.treeData)
      cur_node.title = this.currentChapterValue
      this.editValueDialogVisible = false
    },
    resetScale() {
      this.$refs.tree.restoreScale()
    },
    zoomIn() {
      this.$refs.tree.zoomIn()
    },
    zoomOut() {
      this.$refs.tree.zoomOut()
    },
    toggleLayout() {
      // 切换树形图布局方向
      this.treeConfig.layout = this.treeConfig.layout === 'vertical' ? 'horizontal' : 'vertical'
    },

    handleNodeButtonClick(node) {
      //console.log(current_outline_tree);
      // 点击节点时，弹出操作框
      this.selectedNode = node
      if (this.dialogVisible[node.path] != null)
        this.dialogVisible[node.path] = !this.dialogVisible[node.path]
      else this.dialogVisible[node.path] = true
      //一次只能打开一个操作框，所以关闭其他操作框
      for (let key in this.dialogVisible) {
        if (key !== node.path) {
          this.dialogVisible[key] = false
        }
      }
      //console.log(this.dialogVisible)
    },
    // searchNode(path, node = this.treeData) {
    //   //console.log(value,node)
    //   if (node.path === path) {
    //     return node
    //   }
    //   if (node.children) {
    //     for (let child of node.children) {
    //       const result = this.searchNode(path, child)
    //       if (result) {
    //         return result
    //       }
    //     }
    //   }
    //   return null
    // },
    // searchParentNode(path, node = this.treeData) {
    //   if (node.children) {
    //     for (let child of node.children) {
    //       if (child.path === path) {
    //         return node
    //       }
    //       const result = this.searchParentNode(path, child)
    //       if (result) {
    //         return result
    //       }
    //     }
    //   }
    //   return null
    // },
    addChildNode() {
      const node = this.selectedNode
      //需要注意的是，这里传的node只是拷贝，而不是真正的树节点，所以不能直接操作
      const cur_node = searchNode(node.path, this.treeData)
      const newNode = {
        title: '新子节点',
        text: '',
        path:
          cur_node.path +
          (cur_node.path !== '' ? '.' : '') +
          (cur_node.children && cur_node.children.length > 0 ? cur_node.children.length + 1 : 1),
        children: []
      }
      //console.log(newNode.path);
      cur_node.children.push(newNode)

      this.dialogVisible[cur_node.path] = false
    },

    editNode() {
      const node = this.selectedNode
      const cur_node = searchNode(node.path, this.treeData)
      this.editValueDialogVisible = true
      this.currentChapterValue = cur_node.title
    },

    deleteNode() {
      ElMessageBox.confirm('是否要删除章节?', '警告', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          const node = this.selectedNode
          const parent = searchParentNode(node.path, this.treeData)
          const cur_node = searchNode(node.path, this.treeData)
          if (parent === null) {
            ElNotification({
              title: '错误',
              message: '不能删除根章节',
              type: 'error'
            })

            return
          }
          this.removeNode(parent, cur_node)
          this.dialogVisible[node.path] = false
          ElNotification({
            title: '消息',
            message: '删除章节成功!',
            type: 'info'
          })
        })
        .catch(() => { })
    },

    closeDialog() {
      const node = this.selectedNode
      // 关闭操作框
      this.dialogVisible[node.path] = false
    },

    removeNode(parent, node) {
      // 递归删除节点
      const index = parent.children ? parent.children.indexOf(node) : -1
      if (index !== -1) {
        parent.children.splice(index, 1)
      } else {
        parent.children.forEach((child) => this.removeNode(child, node))
      }
    }
  }
}
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
  background-color: #A3C8FF;  /* 更柔和的蓝色背景 */
  padding: 8px 16px;  /* 增加内边距，使节点更大，更易点击 */
  margin: 10px;
  cursor: pointer;
  transition: background-color 0.3s, transform 0.3s;  /* 添加过渡效果 */
}

.tree-node:hover {
  background-color: #80B4FF;  /* 悬停时的颜色变化 */
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
