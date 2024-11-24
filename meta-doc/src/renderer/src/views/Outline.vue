<template>
  <div class="container">
    <vue-tree ref="tree" style="width: 100%; height: 600px; border: 1px solid gray" :dataset="treeData"
      :config="treeConfig" :direction="direction" @node-click="handleNodeClick" @node-drag="handleNodeDrag">
      <template #node="{ node, collapsed }">
        <div class="tree-node">
          {{ node.title }}
        </div>
        <el-button size="small" type="text" class="aero-btn" style="background-color: aliceblue" circle
          @click.stop="handleNodeButtonClick(node)" v-if="node.path !== 'dummy'">
          <el-icon>
            <More />
          </el-icon>
        </el-button>

        <div v-if="dialogVisible[node.path]" class="aero-div node-edit-box">
          <el-button type="info" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
            @click.stop="move2Left">
            <el-icon style="font-size: 14px">
              <ArrowLeftBold />
            </el-icon>
          </el-button>
          <el-button type="success" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
            @click.stop="addChildNode">
            <el-icon style="font-size: 14px">
              <Plus />
            </el-icon>
          </el-button>
          <el-button type="primary" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
            @click.stop="editNode">
            <el-icon style="font-size: 14px">
              <Edit />
            </el-icon>
          </el-button>
          <el-button type="danger" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
            @click.stop="deleteNode">
            <el-icon style="font-size: 14px">
              <Delete />
            </el-icon>
          </el-button>
          <el-button type="info" circle class="aero-btn" style="font-size: 12px; padding: 2px 6px"
            @click.stop="move2Right">
            <el-icon style="font-size: 14px">
              <ArrowRightBold />
            </el-icon>
          </el-button>
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
      <el-button type="success" circle @click="zoomIn"><el-icon>
          <Plus />
        </el-icon></el-button>
      <el-button type="warning" circle @click="zoomOut"><el-icon>
          <Minus />
        </el-icon></el-button>
      <el-button type="info" circle @click="resetScale"><el-icon>
          <Refresh />
        </el-icon></el-button>
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
import { searchNode,searchParentNode } from '../utils/common-data';
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
        nodeWidth: 250,
        nodeHeight: 100,
        levelHeight: 120
      },
      currentChapterValue: '',
      editValueDialogVisible: false,
      dialogVisible: {},
      selectedNode: null // 当前选中的节点
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
  justify-content: space-around;
  align-items: center;
  position: fixed;
  margin-top: 50%;
  z-index: 10;
  /* 使其显示在其他元素之上 */
}

.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  justify-content: center;
  /* 居中 */
}

.controls {
  margin-bottom: 20px;
}

.tree-node {
  margin-bottom: 10px;
  size: 150%;
  display: inline-block;
  border-radius: 8px;
  background-color: #f3f3f3;
  padding: 5px 10px;
  cursor: pointer;
}

.tree-node span {
  display: flex;
  align-items: center;
}

.dialog-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}
</style>
