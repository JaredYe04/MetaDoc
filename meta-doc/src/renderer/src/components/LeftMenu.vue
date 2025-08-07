<template>
  <el-menu class="el-menu-vertical-demo" :collapse="isCollapse" @open="handleOpen" @close="handleClose"
    style="height: 100vh;" :background-color="themeState.currentTheme.SideBackgroundColor"
    :text-color="themeState.currentTheme.SideTextColor"
    :active-text-color="themeState.currentTheme.SideActiveTextColor">
    <el-tooltip :content="$t('leftMenu.metaDocTooltip')" placement="right">
      <el-sub-menu index="0">
        <template #title>
          <el-icon>
            <Document />
          </el-icon>
          <span></span>
        </template>
      </el-sub-menu>
    </el-tooltip>

    <el-tooltip :content="$t('leftMenu.fileTooltip')" placement="right">
      <el-sub-menu index="1">
        <template #title>
          <el-icon>
            <Document />
          </el-icon>
          <span>{{ $t('leftMenu.file') }}</span>
        </template>

        <el-menu-item index="1-1" @click="newDoc">
          <el-icon>
            <DocumentAdd />
          </el-icon>
          <span>{{ $t('leftMenu.new') }}</span>
        </el-menu-item>

        <el-menu-item index="1-2" @click="openDoc">
          <el-icon>
            <FolderOpened />
          </el-icon>
          <span>{{ $t('leftMenu.open') }}</span>
        </el-menu-item>

        <el-menu-item index="1-3" @click="eventBus.emit('save')">
          <el-icon>
            <FolderChecked />
          </el-icon>
          <span>{{ $t('leftMenu.save') }}</span>
        </el-menu-item>

        <el-menu-item index="1-4" @click="eventBus.emit('save-as')">
          <el-icon>
            <FolderAdd />
          </el-icon>
          <span>{{ $t('leftMenu.saveAs') }}</span>
        </el-menu-item>

        <el-sub-menu index="1-5">
          <template #title>
            <el-icon>
              <FirstAidKit />
            </el-icon>
            <span>{{ $t('leftMenu.export') }}</span>
          </template>

          <el-menu-item index="1-5-1"
            @click="eventBus.emit('export', { format: 'pdf', filename: current_article_meta_data.title })">
            <span>{{ $t('leftMenu.exportPdf') }}</span>
          </el-menu-item>
          <el-menu-item index="1-5-2"
            @click="eventBus.emit('export', { format: 'md', filename: current_article_meta_data.title })">
            <span>{{ $t('leftMenu.exportMarkdown') }}</span>
          </el-menu-item>
          <el-menu-item index="1-5-3"
            @click="eventBus.emit('export', { format: 'docx', filename: current_article_meta_data.title })">
            <span>{{ $t('leftMenu.exportDocx') }}</span>
          </el-menu-item>
          <el-menu-item index="1-5-4"
            @click="eventBus.emit('export', { format: 'html', filename: current_article_meta_data.title })">
            <span>{{ $t('leftMenu.exportHtml') }}</span>
          </el-menu-item>
          <el-menu-item index="1-5-4"
            @click="eventBus.emit('export', { format: 'tex',filename: current_article_meta_data.title})">
            <span>{{ $t('leftMenu.exportLatex') }}</span>
          </el-menu-item>
        </el-sub-menu>

        <el-menu-item index="1-6" @click="eventBus.emit('close-doc')">
          <el-icon>
            <CircleClose />
          </el-icon>
          <span>{{ $t('leftMenu.closeFile') }}</span>
        </el-menu-item>
      </el-sub-menu>
    </el-tooltip>

    <el-tooltip :content="$t('leftMenu.aiToolTooltip')" placement="right">
      <el-sub-menu index="2">
        <template #title>
          <img :src="themeState.currentTheme.AiLogo" alt="AI" style="width: 18px; height: 18px; margin-left: 3px;" />
          <span>{{ $t('leftMenu.aiAssistant') }}</span>
        </template>

        <el-menu-item index="2-1" @click="eventBus.emit('ai-chat')">
          <el-icon>
            <ChatDotRound />
          </el-icon>
          <span>{{ $t('leftMenu.chatWithAI') }}</span>
        </el-menu-item>
        <el-menu-item index="2-2" @click="eventBus.emit('fomula-recognition')">
          <el-icon>
            <EditPen />
          </el-icon>
          <span>{{ $t('leftMenu.handwritingFormulaRecognition') }}</span>
        </el-menu-item>
        <el-menu-item index="2-3" @click="eventBus.emit('ai-graph')">
          <el-icon>
            <DataAnalysis />
          </el-icon>
          <span>{{ $t('leftMenu.smartDrawingAssistant') }}</span>
        </el-menu-item>
      </el-sub-menu>
    </el-tooltip>

    <el-tooltip :content="$t('leftMenu.settingsTooltip')" placement="right">
      <el-sub-menu index="3">
        <template #title>
          <el-icon>
            <Setting />
          </el-icon>
          <span>{{ $t('leftMenu.settings') }}</span>
        </template>

        <el-menu-item index="3-1" @click="eventBus.emit('setting')">
          <el-icon>
            <Setting />
          </el-icon>
          <span>{{ $t('leftMenu.settingsPanel') }}</span>
        </el-menu-item>
      </el-sub-menu>
    </el-tooltip>

    <el-tooltip :content="$t('leftMenu.recentFilesTooltip')" placement="right">
      <el-sub-menu index="4" @click="refreshRecentDocs">
        <template #title>
          <el-icon>
            <Clock />
          </el-icon>
          <span>{{ $t('leftMenu.recentFiles') }}</span>
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

    <el-tooltip :content="$t('leftMenu.exitTooltip')" placement="right">
      <el-sub-menu index="5">
        <template #title>
          <el-icon>
            <SwitchButton />
          </el-icon>
          <span>{{ $t('leftMenu.exit') }}</span>
        </template>

        <el-menu-item index="5-1" @click="saveAndQuit">
          <el-icon>
            <CircleCheck />
          </el-icon>
          <span>{{ $t('leftMenu.saveAndExit') }}</span>
        </el-menu-item>

        <el-menu-item index="5-2" @click="quitWithoutSave">
          <el-icon>
            <Warning />
          </el-icon>
          <span>{{ $t('leftMenu.exitWithoutSaving') }}</span>
        </el-menu-item>
      </el-sub-menu>
    </el-tooltip>
    <el-tooltip :content="$t('leftMenu.langTooltip')" placement="right">
      <el-sub-menu index="6">
        <template #title>
          <el-icon>
            <EarthIcon />
          </el-icon>
          <span>{{ $t('leftMenu.langTooltip') }}</span>
        </template>

        <el-menu-item index="6-1" @click="changeLang('zh_CN')">
          <span>中文（简体）</span>
        </el-menu-item>

        <el-menu-item index="6-2" @click="changeLang('en_US')">
          <span>English (US)</span>
        </el-menu-item>
        <el-menu-item index="6-3" @click="changeLang('ja_JP')">
          <span>日本語</span>
        </el-menu-item>

        <el-menu-item index="6-4" @click="changeLang('ko_KR')">
          <span>한국어</span>
        </el-menu-item>
        
        <el-menu-item index="6-5" @click="changeLang('fr_FR')">
          <span>Français</span>
        </el-menu-item>
        
        <el-menu-item index="6-6" @click="changeLang('de_DE')">
          <span>Deutsch</span>
        </el-menu-item>
      </el-sub-menu>


    </el-tooltip>

    <el-tooltip :content="$t('leftMenu.userProfileTooltip')" placement="right">
      <el-menu-item @click="toggleUserProfile">
        <img v-if="avatar" :src="avatar" width="25" height="25"
          style="border-radius: 50%; display: flex; align-items: center; align-self: center;" />
        <el-icon v-else>
          <UserFilled />
        </el-icon>
      </el-menu-item>
    </el-tooltip>
  </el-menu>
</template>


<script lang="ts" setup>


import UserProfileCard from './UserProfileCard.vue'


import { updateRecentDocs, getRecentDocs, getSetting } from '../utils/settings';
import { onMounted, ref } from 'vue'
import {
  Document,
  FirstAidKit,
  Menu as IconMenu,
  Location,
  Setting,
  ChatDotRound,
  EditPen,
  UserFilled,
  User,
  DataAnalysis
} from '@element-plus/icons-vue'
import eventBus from '../utils/event-bus';
import { ElMessage, ElMessageBox } from 'element-plus'
import { themeState } from '../utils/themes';
import { avatar, current_article, current_article_meta_data } from '../utils/common-data';
import { EarthIcon } from 'tdesign-icons-vue-next';
const recentDocs = ref([])
const isCollapse = ref(true)
const showUserProfile = ref(false)
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { convertMarkdownToLatex } from '../utils/latex-utils';
const { locale } = useI18n()
const changeLang = (lang) => {
  locale.value = lang
  localStorage.setItem('lang', lang)
  eventBus.emit('send-broadcast', {
    to: 'all',
    eventName: 'lang-changed',
    data: lang
  })
}
const toggleUserProfile = () => {
  eventBus.emit('toggle-user-profile')
}

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
    t('leftMenu.askSave'),
    t('leftMenu.tip'),
    {
      confirmButtonText: t('leftMenu.save'),
      cancelButtonText: t('leftMenu.discard'),
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