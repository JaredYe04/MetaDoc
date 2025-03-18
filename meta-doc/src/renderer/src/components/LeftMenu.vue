<template>

  <el-menu class="el-menu-vertical-demo" :collapse="isCollapse" @open="handleOpen" @close="handleClose"
    style="height: 100vh;" :background-color="themeState.currentTheme.SideBackgroundColor"
    :text-color="themeState.currentTheme.SideTextColor"
    :active-text-color="themeState.currentTheme.SideActiveTextColor">
    <el-tooltip effect="light" content="MetaDoc ;-)" placement="right">
      <el-sub-menu index="0">
        <template #title>
          <el-icon>
            <Document />
          </el-icon>
          <span></span>
        </template>
      </el-sub-menu>
    </el-tooltip>

    <el-tooltip effect="light" content="文件" placement="right">

      <el-sub-menu index="1">
        <template #title>
          <el-icon>
            <Document />
          </el-icon>
          <span>文件</span>
        </template>

        <el-menu-item index="1-1" @click="newDoc">
          <el-icon>
            <DocumentAdd />
          </el-icon>
          <span>新建</span>
        </el-menu-item>
        <el-menu-item index="1-2" @click="openDoc">
          <el-icon>
            <FolderOpened />
          </el-icon>
          <span>打开</span>
        </el-menu-item>
        <el-menu-item index="1-3" @click="eventBus.emit('save')">
          <el-icon>
            <FolderChecked />
          </el-icon>
          <span>保存</span>
        </el-menu-item>
        <el-menu-item index="1-4" @click="eventBus.emit('save-as')">
          <el-icon>
            <FolderAdd />
          </el-icon>
          <span>另存为</span>
        </el-menu-item>
        <el-sub-menu index="1-5">
          <template #title>
            <el-icon>
              <FirstAidKit />
            </el-icon>
            <span>导出</span>
          </template>

          <el-menu-item index="1-5-1" @click="eventBus.emit('export', 'pdf');">
            <span>导出PDF</span>
          </el-menu-item>
          <el-menu-item index="1-5-2" @click="eventBus.emit('export', 'md');">
            <span>导出Markdown</span>
          </el-menu-item>
          <el-menu-item index="1-5-3" @click="eventBus.emit('export', 'docx');">
            <span>导出DOCX</span>
          </el-menu-item>
          <el-menu-item index="1-5-4" @click="eventBus.emit('export', 'html');">
            <span>导出HTML</span>
          </el-menu-item>


        </el-sub-menu>

        <el-menu-item index="1-6" @click="eventBus.emit('close-doc');">
          <el-icon>
            <CircleClose />
          </el-icon>
          <span>关闭文件</span>
        </el-menu-item>


      </el-sub-menu>
    </el-tooltip>

    <el-tooltip effect="light" content="AI工具" placement="right">
      <el-sub-menu index="2">
        <template #title>
          <el-icon>
            <ChatDotRound/>
          </el-icon>
          <span>AI助手</span>
        </template>

        <el-menu-item index="2-1" @click="eventBus.emit('ai-chat')">
          <el-icon>
            <ChatDotRound/>
          </el-icon>
          <span>与AI对话</span>
        </el-menu-item>
        <el-menu-item index="2-2" @click="eventBus.emit('fomula-recognition')">
          <el-icon>
            <EditPen />
          </el-icon>
          <span>手写公式识别</span>
        </el-menu-item>
      </el-sub-menu>

    </el-tooltip>
    <el-tooltip effect="light" content="设置" placement="right">
      <el-sub-menu index="3">
        <template #title>
          <el-icon>
            <Setting />
          </el-icon>
          <span>设置</span>
        </template>

        <el-menu-item index="3-1" @click="eventBus.emit('setting')">
          <el-icon>
            <Setting />
          </el-icon>
          <span>设置面板</span>
        </el-menu-item>
      </el-sub-menu>

    </el-tooltip>
    <el-tooltip effect="light" content="最近文件" placement="right">
      <el-sub-menu index="4" @click="refreshRecentDocs">
        <template #title>
          <el-icon>
            <Clock />
          </el-icon>
          <span>最近文件</span>
        </template>

        <div v-for="item in recentDocs" :key="item">
          <el-menu-item :index="`4-${item}`" @click="
            askSave(() => {
              eventBus.emit('open-doc', item)
            })
            ">
            <el-icon>
              <Document />
            </el-icon>
            <span>{{ item }}</span>
          </el-menu-item>
        </div>



      </el-sub-menu>
    </el-tooltip>

    <el-tooltip effect="light" content="退出" placement="right">
      <el-sub-menu index="5">
        <template #title>
          <el-icon>
            <SwitchButton />
          </el-icon>
          <span>退出</span>
        </template>

        <el-menu-item index="5-1" @click="saveAndQuit">
          <el-icon>
            <CircleCheck />
          </el-icon>
          <span>保存并退出</span>
        </el-menu-item>

        <el-menu-item index="5-2" @click="quitWithoutSave">
          <el-icon>
            <Warning />
          </el-icon>
          <span>退出但不保存</span>
        </el-menu-item>
      </el-sub-menu>

    </el-tooltip>


  </el-menu>
  <!-- <el-radio-group v-model="isCollapse">
    <el-radio-button :value="false">展开</el-radio-button>
    <el-radio-button :value="true">折叠</el-radio-button>
  </el-radio-group> -->
</template>

<script lang="ts" setup>



import { updateRecentDocs, getRecentDocs, getSetting } from '../utils/settings';
import { onMounted, ref } from 'vue'
import {
  Document,
  FirstAidKit,
  Menu as IconMenu,
  Location,
  Setting,
  ChatDotRound,
  EditPen
} from '@element-plus/icons-vue'
import eventBus from '../utils/event-bus';
import { ElMessage, ElMessageBox } from 'element-plus'
import { exportPDF } from '../utils/md-utils';
import { themeState } from '../utils/themes';
const recentDocs = ref([])
const isCollapse = ref(true)
const handleOpen = (_key: string, _keyPath: string[]) => {
  //console.log(key, keyPath)
}
const handleClose = (_key: string, _keyPath: string[]) => {
  //console.log(key, keyPath)
}
onMounted(async () => {
  await refreshRecentDocs()
})
const refreshRecentDocs = async () => {
  recentDocs.value = await getRecentDocs()
}

const askSave = async (callBack) => {
  const alwaysAskSave = await getSetting('alwaysAskSave');
  //console.log(alwaysAskSave)
  if (alwaysAskSave === false) {
    callBack()
    return
  }
  ElMessageBox.confirm(
    '是否要保存当前文档？',
    '提示',
    {
      confirmButtonText: '保存',
      cancelButtonText: '放弃',
      type: 'info',
    }
  )
    .then(() => {
      eventBus.emit('save')
    })
    .catch(() => {
    }).finally(() => {
      callBack()
    })
}
const newDoc = () => {
  askSave(() => {
    eventBus.emit('new-doc')
  })
}

const openDoc = () => {

  askSave(() => {
    eventBus.emit('open-doc')
  })
}
const saveAndQuit = () => {
  eventBus.emit('save-and-quit')
}
const quitWithoutSave = () => {
  eventBus.emit('quit')
}
</script>

<style>
.el-menu-vertical-demo:not(.el-menu--collapse) {
  width: 200px;
  min-height: 400px;
}
</style>