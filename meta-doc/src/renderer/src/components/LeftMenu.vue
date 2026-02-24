<template>
  <UIMenu
    :collapse="isCollapse"
    :background-color="sidebarBackground"
    :text-color="sidebarTextColor"
    :style="{
      '--sub-menu-hover': sidebarHoverColor,
      '--sub-menu-active': sidebarActiveColor,
      '--sub-menu-bg': sidebarSubMenuBg,
      '--sidebar-border': sidebarBorderColor,
      '--sidebar-bg': sidebarBackground,
      '--sidebar-text': sidebarTextColor,
      '--sidebar-text-active': sidebarActiveTextColor,
      '--sidebar-hover-bg': sidebarHoverColor,
      '--sidebar-active-bg': sidebarActiveColor
    }"
  >
    <!-- 顶部菜单项 -->
    <template v-for="menuId in getMenuOrder().top" :key="menuId">
      <!-- 文件菜单 -->
      <UISubMenu
        v-if="menuId === 'file' && isMenuItemVisible('file')"
        :title="$t('leftMenu.file')"
        :tooltip="$t('leftMenu.file')"
        :icon-image="(themeState.currentTheme as any).FileIcon"
        trigger="click"
        :level="1"
      >
        <template #title>
          <img
            :src="(themeState.currentTheme as any).FileIcon"
            class="menu-icon-image"
            alt="file"
          />
          <span>{{ $t('leftMenu.file') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img
              :src="(themeState.currentTheme as any).FileIcon"
              class="menu-title-icon"
              alt="file"
            />
          </template>
          {{ $t('leftMenu.fileTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FilePlus" @click="newDoc">
          {{ $t('leftMenu.new') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderOpen" @click="openDoc">
          {{ $t('leftMenu.open') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderCheck" @click="saveAll">
          {{ $t('leftMenu.saveAll') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderCheck" :disabled="!isDocumentTab" @click="emitMenu('save')">
          {{ $t('leftMenu.save') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderAdd" :disabled="!isDocumentTab" @click="emitMenu('save-as')">
          {{ $t('leftMenu.saveAs') }}
        </UISubMenuItem>

        <UISubMenu
          :icon="Download"
          :title="$t('leftMenu.export')"
          trigger="hover"
          :level="2"
          :disabled="!isDocumentTab"
        >
          <template #title>
            <span>{{ $t('leftMenu.export') }}</span>
          </template>

          <!-- 标题项 -->
          <UISubMenuItem :is-title="true" :disabled="true">
            <template #icon>
              <Download class="w-4 h-4" />
            </template>
            {{ $t('leftMenu.export') }}
          </UISubMenuItem>

          <UISubMenuItem
            v-for="option in exportOptions"
            :key="option.format"
            @click="handleExportClick(option.format)"
          >
            {{ exportOptionLabel(option) }}
          </UISubMenuItem>
        </UISubMenu>

        <UISubMenuItem
          :icon="FilePlus"
          :disabled="!canExportAsTemplate"
          @click="openExportAsTemplateDialog"
        >
          {{ $t('leftMenu.exportAsTemplate') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="X" :disabled="!isDocumentTab" @click="emitMenu('close-active-tab')">
          {{ $t('leftMenu.close') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- AI助手菜单 -->
      <UISubMenu
        v-if="menuId === 'ai-assistant' && isMenuItemVisible('ai-assistant')"
        :title="$t('leftMenu.aiAssistant')"
        :tooltip="$t('leftMenu.aiAssistant')"
        :icon-image="themeState.currentTheme.AiLogo"
        trigger="click"
        :level="1"
      >
        <template #title>
          <img :src="themeState.currentTheme.AiLogo" alt="AI" class="ai-logo-icon" />
          <span>{{ $t('leftMenu.aiAssistant') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img :src="themeState.currentTheme.AiLogo" alt="AI" class="menu-title-icon" />
          </template>
          {{ $t('leftMenu.aiToolTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="MessageCircle" @click="emitMenu('ai-chat')">
          {{ $t('leftMenu.chatWithAI') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="BookOpen" @click="emitMenu('fomula-recognition')">
          {{ $t('leftMenu.handwritingFormulaRecognition') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Image" @click="emitMenu('smart-drawing-assistant')">
          {{ $t('leftMenu.smartDrawingAssistant') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="BarChart3" @click="emitMenu('data-analysis')">
          {{ $t('leftMenu.dataAnalysis') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Eye" @click="emitMenu('ocr')">
          {{ $t('leftMenu.ocr') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Paperclip" @click="emitMenu('attachment')">
          {{ $t('leftMenu.attachment') }}
        </UISubMenuItem>

        <UISubMenuItem @click="emitMenu('aigc-detection')">
          <template #icon>
            <img
              :src="(themeState.currentTheme as any).PenAiIcon"
              class="menu-title-icon"
              alt="Pen AI"
            />
          </template>
          {{ $t('leftMenu.aigcDetection') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 设置菜单 -->
      <UIMenuItem
        v-if="menuId === 'settings' && isMenuItemVisible('settings')"
        :label="$t('leftMenu.settings')"
        :tooltip="$t('leftMenu.settings')"
        :icon-image="(themeState.currentTheme as any).SettingIcon"
        @click="emitMenu('setting')"
      />

      <!-- 最近文件菜单 -->
      <UISubMenu
        v-if="menuId === 'recent-files' && isMenuItemVisible('recent-files')"
        :title="$t('leftMenu.recentFiles')"
        :tooltip="$t('leftMenu.recentFiles')"
        :icon-image="(themeState.currentTheme as any).RecentIcon"
        trigger="click"
        :level="1"
        class="recent-files-menu"
        @open="refreshRecentDocs"
      >
        <template #title>
          <Clock class="recent-files-icon w-5 h-5" />
          <span class="recent-files-text">{{ $t('leftMenu.recentFiles') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <Clock class="w-4 h-4" />
          </template>
          {{ $t('leftMenu.recentFilesTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem
          v-for="item in recentDocs.slice(0, 10)"
          :key="item"
          :icon="FileText"
          @click="
            askSave(() => {
              openRecentDoc(item)
            })
          "
        >
          {{ item }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 语言菜单 -->
      <UISubMenu
        v-if="menuId === 'language' && isMenuItemVisible('language')"
        :title="$t('leftMenu.langTooltip')"
        :tooltip="$t('leftMenu.langTooltip')"
        :icon-image="(themeState.currentTheme as any).LanguageIcon"
        trigger="click"
        :level="1"
      >
        <template #title>
          <img
            :src="(themeState.currentTheme as any).LanguageIcon"
            class="menu-icon-image"
            alt="language"
          />
          <span>{{ $t('leftMenu.langTooltip') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img
              :src="(themeState.currentTheme as any).LanguageIcon"
              class="menu-title-icon"
              alt="language"
            />
          </template>
          {{ $t('leftMenu.langTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('zh_CN')"> 中文（简体） </UISubMenuItem>

        <UISubMenuItem @click="changeLang('en_US')"> English (US) </UISubMenuItem>

        <UISubMenuItem @click="changeLang('ja_JP')"> 日本語 </UISubMenuItem>

        <UISubMenuItem @click="changeLang('ko_KR')"> 한국어 </UISubMenuItem>

        <UISubMenuItem @click="changeLang('fr_FR')"> Français </UISubMenuItem>

        <UISubMenuItem @click="changeLang('de_DE')"> Deutsch </UISubMenuItem>
      </UISubMenu>

      <!-- 知识库 -->
      <UIMenuItem
        v-if="menuId === 'knowledge-base' && isMenuItemVisible('knowledge-base')"
        :label="$t('leftMenu.knowledgeBase', '知识库')"
        :tooltip="$t('leftMenu.knowledgeBase', '知识库')"
        :icon-image="(themeState.currentTheme as any).KnowledgeIcon"
        @click="openKnowledgeBase"
      />

      <!-- 工作目录 -->
      <UIMenuItem
        v-if="menuId === 'workspace-explorer' && isMenuItemVisible('workspace-explorer')"
        :label="$t('leftMenu.workspaceExplorer', '工作目录')"
        :tooltip="$t('leftMenu.workspaceExplorer', '工作目录')"
        :icon-image="(themeState.currentTheme as any).FolderIcon"
        @click="toggleWorkspaceExplorer"
      />

      <!-- LLM统计 -->
      <UIMenuItem
        v-if="menuId === 'llm-statistics' && isMenuItemVisible('llm-statistics')"
        :label="$t('bottomMenu.llmStatistics', 'LLM统计')"
        :tooltip="$t('bottomMenu.llmStatistics', 'LLM统计')"
        :icon="BarChart3"
        @click="openLlmStatistics"
      />

      <!-- 用户手册 -->
      <UIMenuItem
        v-if="menuId === 'user-manual' && isMenuItemVisible('user-manual')"
        :label="$t('leftMenu.userManual', '用户手册')"
        :tooltip="$t('leftMenu.userManual', '用户手册')"
        :icon="BookOpen"
        @click="openUserManual"
      />

      <!-- 用户资料 -->
      <UIMenuItem
        v-if="menuId === 'user-profile' && isMenuItemVisible('user-profile')"
        class="bottom-menu"
        @click="toggleUserProfile"
      >
        <template #icon>
          <img v-if="avatar" :src="avatar" width="25" height="25" style="border-radius: 50%" />
          <UserCircle v-else class="w-6 h-6" />
        </template>
      </UIMenuItem>

      <!-- 调试工具（仅在开发环境显示） -->
      <UIMenuItem
        v-if="menuId === 'debug' && isDev && isMenuItemVisible('debug')"
        :label="$t('leftMenu.debugTools', '调试工具')"
        :tooltip="$t('leftMenu.debugTools', '调试工具')"
        :icon-image="(themeState.currentTheme as any).DebugIcon"
        @click="openDebugTools"
      />

      <!-- 更多功能 -->
      <UISubMenu
        v-if="menuId === 'more-features' && isMenuItemVisible('more-features')"
        :title="$t('leftMenu.moreFeatures', '更多功能')"
        :tooltip="$t('leftMenu.moreFeatures', '更多功能')"
        :icon-image="(themeState.currentTheme as any).MoreIcon"
        trigger="click"
        :level="1"
      >
        <template #title>
          <img
            :src="(themeState.currentTheme as any).MoreIcon"
            class="menu-icon-image"
            alt="more"
          />
          <span>{{ $t('leftMenu.moreFeatures', '更多功能') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img
              :src="(themeState.currentTheme as any).MoreIcon"
              class="menu-title-icon"
              alt="more"
            />
          </template>
          {{ $t('leftMenu.moreFeatures', '更多功能') }}
        </UISubMenuItem>

        <!-- LLM统计：只有在菜单配置中不可见时才显示在更多功能子菜单中 -->
        <UISubMenuItem
          v-if="!isMenuItemVisible('llm-statistics')"
          :icon="BarChart3"
          @click="openLlmStatistics"
        >
          {{ $t('bottomMenu.llmStatistics', 'LLM统计') }}
        </UISubMenuItem>

        <!-- 用户反馈：只有在菜单配置中不可见时才显示在更多功能子菜单中 -->
        <UISubMenuItem
          v-if="!isMenuItemVisible('user-feedback')"
          :iconImage="(themeState.currentTheme as any).FeedbackIcon"
          @click="openUserFeedback"
        >
          {{ $t('leftMenu.userFeedback', '用户反馈') }}
        </UISubMenuItem>

        <!-- 用户手册：只有在菜单配置中不可见时才显示在更多功能子菜单中 -->
        <UISubMenuItem
          v-if="!isMenuItemVisible('user-manual')"
          :icon="BookOpen"
          @click="openUserManual"
        >
          {{ $t('leftMenu.userManual', '用户手册') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Grid" @click="openMenuConfigDialog">
          {{ $t('leftMenu.menuConfig.title', '菜单配置') }}
        </UISubMenuItem>
      </UISubMenu>
      <!-- 主页 -->
      <UIMenuItem
        v-if="menuId === 'home' && isMenuItemVisible('home')"
        :label="$t('leftMenu.home', '主页')"
        :tooltip="$t('leftMenu.home', '主页')"
        :icon="Home"
        class="bottom-menu"
        @click="openGlobalHome"
      />

      <!-- 退出菜单 -->
      <UISubMenu
        v-if="menuId === 'exit' && isMenuItemVisible('exit')"
        :title="$t('leftMenu.exit')"
        :tooltip="$t('leftMenu.exit')"
        :icon="Power"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <Power class="w-5 h-5" />
          <span>{{ $t('leftMenu.exit') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <Power class="w-5 h-5" />
          </template>
          {{ $t('leftMenu.exitTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Power" @click="saveAndQuit">
          {{ $t('leftMenu.saveAndExit') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Power" @click="saveAllAndQuit">
          {{ $t('leftMenu.saveAllAndExit') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Power" @click="quitWithoutSave">
          {{ $t('leftMenu.exitWithoutSaving') }}
        </UISubMenuItem>
      </UISubMenu>
    </template>

    <!-- 顶部和底部之间的分隔符（spacer） -->
    <div class="menu-spacer" v-if="getMenuOrder().bottom.length > 0"></div>

    <!-- 底部菜单项 -->
    <template v-for="menuId in getMenuOrder().bottom" :key="menuId">
      <!-- 主页 -->
      <UIMenuItem
        v-if="menuId === 'home' && isMenuItemVisible('home')"
        :label="$t('leftMenu.home', '主页')"
        :tooltip="$t('leftMenu.home', '主页')"
        :icon="Home"
        class="bottom-menu"
        @click="openGlobalHome"
      />

      <!-- 文件菜单 -->
      <UISubMenu
        v-if="menuId === 'file' && isMenuItemVisible('file')"
        :title="$t('leftMenu.file')"
        :tooltip="$t('leftMenu.file')"
        :icon-image="(themeState.currentTheme as any).FileIcon"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <img
            :src="(themeState.currentTheme as any).FileIcon"
            class="menu-icon-image"
            alt="file"
          />
          <span>{{ $t('leftMenu.file') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img
              :src="(themeState.currentTheme as any).FileIcon"
              class="menu-title-icon"
              alt="file"
            />
          </template>
          {{ $t('leftMenu.fileTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FilePlus" @click="newDoc">
          {{ $t('leftMenu.new') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderOpen" @click="openDoc">
          {{ $t('leftMenu.open') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderCheck" @click="saveAll">
          {{ $t('leftMenu.saveAll') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderCheck" :disabled="!isDocumentTab" @click="emitMenu('save')">
          {{ $t('leftMenu.save') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderAdd" :disabled="!isDocumentTab" @click="emitMenu('save-as')">
          {{ $t('leftMenu.saveAs') }}
        </UISubMenuItem>

        <UISubMenu
          :icon="Download"
          :title="$t('leftMenu.export')"
          trigger="hover"
          :level="2"
          :disabled="!isDocumentTab"
        >
          <template #title>
            <span>{{ $t('leftMenu.export') }}</span>
          </template>

          <!-- 标题项 -->
          <UISubMenuItem :is-title="true" :disabled="true">
            <template #icon>
              <Download class="w-4 h-4" />
            </template>
            {{ $t('leftMenu.export') }}
          </UISubMenuItem>

          <UISubMenuItem
            v-for="option in exportOptions"
            :key="option.format"
            @click="handleExportClick(option.format)"
          >
            {{ exportOptionLabel(option) }}
          </UISubMenuItem>
        </UISubMenu>

        <UISubMenuItem
          :icon="FilePlus"
          :disabled="!canExportAsTemplate"
          @click="openExportAsTemplateDialog"
        >
          {{ $t('leftMenu.exportAsTemplate') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="X" :disabled="!isDocumentTab" @click="emitMenu('close-active-tab')">
          {{ $t('leftMenu.close') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- AI助手菜单 -->
      <UISubMenu
        v-if="menuId === 'ai-assistant' && isMenuItemVisible('ai-assistant')"
        :title="$t('leftMenu.aiAssistant')"
        :tooltip="$t('leftMenu.aiAssistant')"
        :icon-image="themeState.currentTheme.AiLogo"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <img :src="themeState.currentTheme.AiLogo" alt="AI" class="ai-logo-icon" />
          <span>{{ $t('leftMenu.aiAssistant') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img :src="themeState.currentTheme.AiLogo" alt="AI" class="menu-title-icon" />
          </template>
          {{ $t('leftMenu.aiToolTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="MessageCircle" @click="emitMenu('ai-chat')">
          {{ $t('leftMenu.chatWithAI') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="BookOpen" @click="emitMenu('fomula-recognition')">
          {{ $t('leftMenu.handwritingFormulaRecognition') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Image" @click="emitMenu('smart-drawing-assistant')">
          {{ $t('leftMenu.smartDrawingAssistant') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="BarChart3" @click="emitMenu('data-analysis')">
          {{ $t('leftMenu.dataAnalysis') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Eye" @click="emitMenu('ocr')">
          {{ $t('leftMenu.ocr') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Paperclip" @click="emitMenu('attachment')">
          {{ $t('leftMenu.attachment') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="BarChart3" @click="emitMenu('aigc-detection')">
          {{ $t('leftMenu.aigcDetection') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 设置菜单 -->
      <UIMenuItem
        v-if="menuId === 'settings' && isMenuItemVisible('settings')"
        :label="$t('leftMenu.settings')"
        :tooltip="$t('leftMenu.settings')"
        :icon="Settings"
        class="bottom-menu"
        @click="emitMenu('setting')"
      />

      <!-- 最近文件菜单 -->
      <UISubMenu
        v-if="menuId === 'recent-files' && isMenuItemVisible('recent-files')"
        :title="$t('leftMenu.recentFiles')"
        :tooltip="$t('leftMenu.recentFiles')"
        :icon-image="(themeState.currentTheme as any).RecentIcon"
        trigger="click"
        :level="1"
        class="recent-files-menu bottom-menu"
        @open="refreshRecentDocs"
      >
        <template #title>
          <img
            :src="(themeState.currentTheme as any).RecentIcon"
            class="recent-files-icon"
            alt="recent"
          />
          <span class="recent-files-text">{{ $t('leftMenu.recentFiles') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img
              :src="(themeState.currentTheme as any).RecentIcon"
              class="menu-title-icon"
              alt="recent"
            />
          </template>
          {{ $t('leftMenu.recentFilesTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem
          v-for="item in recentDocs.slice(0, 10)"
          :key="item"
          :icon="FileText"
          @click="
            askSave(() => {
              openRecentDoc(item)
            })
          "
        >
          {{ item }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 语言菜单 -->
      <UISubMenu
        v-if="menuId === 'language' && isMenuItemVisible('language')"
        :title="$t('leftMenu.langTooltip')"
        :tooltip="$t('leftMenu.langTooltip')"
        :icon-image="(themeState.currentTheme as any).LanguageIcon"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <img
            :src="(themeState.currentTheme as any).LanguageIcon"
            class="menu-icon-image"
            alt="language"
          />
          <span>{{ $t('leftMenu.langTooltip') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img
              :src="(themeState.currentTheme as any).LanguageIcon"
              class="menu-title-icon"
              alt="language"
            />
          </template>
          {{ $t('leftMenu.langTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('zh_CN')"> 中文（简体） </UISubMenuItem>

        <UISubMenuItem @click="changeLang('en_US')"> English (US) </UISubMenuItem>

        <UISubMenuItem @click="changeLang('ja_JP')"> 日本語 </UISubMenuItem>

        <UISubMenuItem @click="changeLang('ko_KR')"> 한국어 </UISubMenuItem>

        <UISubMenuItem @click="changeLang('fr_FR')"> Français </UISubMenuItem>

        <UISubMenuItem @click="changeLang('de_DE')"> Deutsch </UISubMenuItem>
      </UISubMenu>

      <!-- 知识库 -->
      <UIMenuItem
        v-if="menuId === 'knowledge-base' && isMenuItemVisible('knowledge-base')"
        :label="$t('leftMenu.knowledgeBase', '知识库')"
        :tooltip="$t('leftMenu.knowledgeBase', '知识库')"
        :icon-image="(themeState.currentTheme as any).KnowledgeIcon"
        class="bottom-menu"
        @click="openKnowledgeBase"
      />

      <!-- 工作目录 -->
      <UIMenuItem
        v-if="menuId === 'workspace-explorer' && isMenuItemVisible('workspace-explorer')"
        :label="$t('leftMenu.workspaceExplorer', '工作目录')"
        :tooltip="$t('leftMenu.workspaceExplorer', '工作目录')"
        :icon-image="(themeState.currentTheme as any).FolderIcon"
        class="bottom-menu"
        @click="toggleWorkspaceExplorer"
      />

      <!-- LLM统计 -->
      <UIMenuItem
        v-if="menuId === 'llm-statistics' && isMenuItemVisible('llm-statistics')"
        :label="$t('bottomMenu.llmStatistics', 'LLM统计')"
        :tooltip="$t('bottomMenu.llmStatistics', 'LLM统计')"
        :icon="BarChart3"
        class="bottom-menu"
        @click="openLlmStatistics"
      />

      <!-- 用户手册 -->
      <UIMenuItem
        v-if="menuId === 'user-manual' && isMenuItemVisible('user-manual')"
        :label="$t('leftMenu.userManual', '用户手册')"
        :tooltip="$t('leftMenu.userManual', '用户手册')"
        :icon="BookOpen"
        class="bottom-menu"
        @click="openUserManual"
      />

      <!-- 用户资料 -->
      <UIMenuItem
        v-if="menuId === 'user-profile' && isMenuItemVisible('user-profile')"
        class="bottom-menu"
        @click="toggleUserProfile"
      >
        <template #icon>
          <img v-if="avatar" :src="avatar" width="25" height="25" style="border-radius: 50%" />
          <UserCircle v-else class="w-6 h-6" />
        </template>
      </UIMenuItem>

      <!-- 调试工具（仅在开发环境显示） -->
      <UIMenuItem
        v-if="menuId === 'debug' && isDev && isMenuItemVisible('debug')"
        :label="$t('leftMenu.debugTools', '调试工具')"
        :tooltip="$t('leftMenu.debugTools', '调试工具')"
        :icon-image="(themeState.currentTheme as any).DebugIcon"
        class="bottom-menu"
        @click="openDebugTools"
      />

      <!-- 更多功能 -->
      <UISubMenu
        v-if="menuId === 'more-features' && isMenuItemVisible('more-features')"
        :title="$t('leftMenu.moreFeatures', '更多功能')"
        :tooltip="$t('leftMenu.moreFeatures', '更多功能')"
        :icon-image="(themeState.currentTheme as any).MoreIcon"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <img
            :src="(themeState.currentTheme as any).MoreIcon"
            class="menu-icon-image"
            alt="more"
          />
          <span>{{ $t('leftMenu.moreFeatures', '更多功能') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img
              :src="(themeState.currentTheme as any).MoreIcon"
              class="menu-title-icon"
              alt="more"
            />
          </template>
          {{ $t('leftMenu.moreFeatures', '更多功能') }}
        </UISubMenuItem>

        <!-- LLM统计：只有在菜单配置中不可见时才显示在更多功能子菜单中 -->
        <UISubMenuItem
          v-if="!isMenuItemVisible('llm-statistics')"
          :icon="BarChart3"
          @click="openLlmStatistics"
        >
          {{ $t('bottomMenu.llmStatistics', 'LLM统计') }}
        </UISubMenuItem>

        <!-- 用户反馈：只有在菜单配置中不可见时才显示在更多功能子菜单中 -->
        <UISubMenuItem
          v-if="!isMenuItemVisible('user-feedback')"
          :iconImage="(themeState.currentTheme as any).FeedbackIcon"
          @click="openUserFeedback"
        >
          {{ $t('leftMenu.userFeedback', '用户反馈') }}
        </UISubMenuItem>

        <!-- 用户手册：只有在菜单配置中不可见时才显示在更多功能子菜单中 -->
        <UISubMenuItem
          v-if="!isMenuItemVisible('user-manual')"
          :icon="BookOpen"
          @click="openUserManual"
        >
          {{ $t('leftMenu.userManual', '用户手册') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Grid" @click="openMenuConfigDialog">
          {{ $t('leftMenu.menuConfig.title', '菜单配置') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 退出菜单 -->
      <UISubMenu
        v-if="menuId === 'exit' && isMenuItemVisible('exit')"
        :title="$t('leftMenu.exit')"
        :tooltip="$t('leftMenu.exit')"
        :icon="Power"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <Power class="w-5 h-5" />
          <span>{{ $t('leftMenu.exit') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <Power class="w-5 h-5" />
          </template>
          {{ $t('leftMenu.exitTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Power" @click="saveAndQuit">
          {{ $t('leftMenu.saveAndExit') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Power" @click="saveAllAndQuit">
          {{ $t('leftMenu.saveAllAndExit') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Power" @click="quitWithoutSave">
          {{ $t('leftMenu.exitWithoutSaving') }}
        </UISubMenuItem>
      </UISubMenu>
    </template>
  </UIMenu>

  <!-- 导出选项对话框 -->
  <ExportOptionsDialog
    v-model="showExportOptionsDialog"
    :adapter="currentExportAdapter"
    :source-format="(activeDocument?.format ?? 'md') as DocumentFormat"
    :target-format="currentExportFormat || 'pdf'"
    @confirm="handleExportOptionsConfirm"
  />

  <!-- 导出为模板对话框 -->
  <el-dialog
    v-model="showExportAsTemplateDialog"
    :title="t('leftMenu.exportAsTemplate')"
    width="480px"
    destroy-on-close
    @open="fillExportAsTemplateDefaults"
    @closed="resetExportAsTemplateForm"
  >
    <el-form label-width="auto" label-position="top">
      <el-form-item :label="t('leftMenu.exportAsTemplateTitleLabel')">
        <div class="export-as-template-field">
          <el-input
            v-model="exportAsTemplateTitle"
            :placeholder="t('leftMenu.exportAsTemplateTitleLabel')"
          />
          <el-tooltip :content="t('leftMenu.exportAsTemplateAiGenerate')" placement="top">
            <el-button
              type="primary"
              :loading="exportAsTemplateAiLoading"
              circle
              class="export-as-template-ai-btn"
              @click="generateTemplateTitleDescriptionByAi"
            >
              <el-icon v-if="!exportAsTemplateAiLoading"><MagicStick /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </el-form-item>
      <el-form-item :label="t('leftMenu.exportAsTemplateDescLabel')">
        <el-input
          v-model="exportAsTemplateDescription"
          type="textarea"
          :rows="3"
          :placeholder="t('leftMenu.exportAsTemplateDescLabel')"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showExportAsTemplateDialog = false">{{
        t('messageBox.cancel')
      }}</el-button>
      <el-button type="primary" @click="confirmExportAsTemplate">{{
        t('messageBox.confirm')
      }}</el-button>
    </template>
  </el-dialog>

  <!-- 菜单配置对话框 -->
  <MenuConfigDialog
    v-model="showMenuConfigDialog"
    :items="menuConfigItems"
    @save="handleMenuConfigSave"
  />
</template>

<script lang="ts" setup>
import { updateRecentDocs, getRecentDocs, getSetting, setSetting } from '../utils/settings'
import { extname } from '../utils/path-utils'
import { formatRegistry } from '../utils/format-registry'
import { computed, onMounted, ref, provide, watch } from 'vue'
import UIMenu from './ui/UIMenu.vue'
import UIMenuItem from './ui/UIMenuItem.vue'
import UISubMenu from './ui/UISubMenu.vue'
import UISubMenuItem from './ui/UISubMenuItem.vue'
import {
  FilePlus,
  FolderOpen,
  FolderCheck,
  FolderPlus,
  User,
  BarChart3,
  FileX,
  Clock,
  Power,
  Image,
  Home,
  LayoutGrid,
  BookOpen,
  Eye,
  Paperclip,
  Plus,
  Settings,
  MessageCircle,
  Pencil,
  UserCircle,
  Download,
  FileText,
  X,
  FolderPlus as FolderAdd,
  Wand2 as MagicStick
} from 'lucide-vue-next'

import eventBus from '../utils/event-bus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { themeState, mixColors } from '../utils/themes'
import { avatar } from '../stores/user'
import { useActiveDocument } from '../composables/useActiveDocument'
import { EarthIcon } from 'tdesign-icons-vue-next'
import { getExportOptions } from '../services/export-manager.ts'
import type { DocumentFormat, ExportFormat } from '../../../types'
import { exportAdapterRegistry } from '../services/export-adapters'
import ExportOptionsDialog from './ExportOptionsDialog.vue'
import type { ExportOptions } from '../services/export-adapters/types'
import MenuConfigDialog, { type MenuConfigItem } from './MenuConfigDialog.vue'
import { createAiTask, ai_types } from '../utils/ai_tasks'
import { generateTemplateTitleDescriptionPrompt } from '../utils/prompts'

const props = withDefaults(defineProps<{ mode?: 'normal' | 'demo' }>(), { mode: 'normal' })
const emitMenu = (name: string, ...args: any[]) => {
  if (props.mode === 'demo') return
  // mitt 的 emit 只接受两个参数，将多个参数合并为一个对象
  eventBus.emit(name, args.length === 1 ? args[0] : args.length > 1 ? args : undefined)
}

const recentDocs = ref([])
const isCollapse = ref(true)
const showUserProfile = ref(false)
const showMenuConfigDialog = ref(false)
const showExportAsTemplateDialog = ref(false)
const exportAsTemplateTitle = ref('')
const exportAsTemplateDescription = ref('')
const exportAsTemplateAiLoading = ref(false)
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { convertMarkdownToLatex } from '../utils/latex-utils'
import { createRendererLogger } from '../utils/logger'
import { isDevEnvironment } from '../utils/dev-env'
import { useWorkspace } from '../stores/workspace'
const { locale } = useI18n()
const logger = createRendererLogger('LeftMenu')
const workspace = useWorkspace()
const isDev = ref(false)

// 菜单配置项定义
const menuConfigItems = computed<MenuConfigItem[]>(() => {
  return [
    {
      id: 'file',
      label: t('leftMenu.file'),
      iconImage: (themeState.currentTheme as any).FileIcon,
      visible: true,
      isCore: true,
      position: 'top'
    },
    {
      id: 'ai-assistant',
      label: t('leftMenu.aiAssistant'),
      iconImage: themeState.currentTheme.AiLogo,
      visible: true,
      isCore: false,
      position: 'top'
    },
    {
      id: 'settings',
      label: t('leftMenu.settings'),
      iconImage: (themeState.currentTheme as any).SettingIcon,
      visible: true,
      isCore: true,
      position: 'top'
    },
    {
      id: 'recent-files',
      label: t('leftMenu.recentFiles'),
      iconImage: (themeState.currentTheme as any).RecentIcon,
      visible: true,
      isCore: false,
      position: 'top'
    },
    {
      id: 'language',
      label: t('leftMenu.langTooltip'),
      iconImage: (themeState.currentTheme as any).LanguageIcon,
      visible: true,
      isCore: true,
      position: 'top'
    },
    {
      id: 'knowledge-base',
      label: t('leftMenu.knowledgeBase', '知识库'),
      iconImage: (themeState.currentTheme as any).KnowledgeIcon,
      visible: true,
      isCore: false,
      position: 'top'
    },
    {
      id: 'workspace-explorer',
      label: t('leftMenu.workspaceExplorer', '工作目录'),
      iconImage: (themeState.currentTheme as any).FolderIcon,
      visible: true,
      isCore: true,
      position: 'top'
    },
    {
      id: 'debug',
      label: t('leftMenu.debugTools', '调试工具'),
      iconImage: (themeState.currentTheme as any).DebugIcon,
      visible: isDev.value,
      isCore: false,
      position: 'top'
    },
    {
      id: 'more-features',
      label: t('leftMenu.moreFeatures', '更多功能'),
      iconImage: (themeState.currentTheme as any).MoreIcon,
      visible: true,
      isCore: true,
      position: 'top'
    },
    {
      id: 'llm-statistics',
      label: t('bottomMenu.llmStatistics', 'LLM统计'),
      icon: BarChart3,
      visible: false,
      isCore: false,
      position: 'top'
    },
    {
      id: 'user-feedback',
      label: t('leftMenu.userFeedback', '用户反馈'),
      iconImage: (themeState.currentTheme as any).FeedbackIcon,
      visible: false,
      isCore: false,
      position: 'top'
    },
    {
      id: 'user-manual',
      label: t('leftMenu.userManual', '用户手册'),
      icon: BookOpen,
      visible: false,
      isCore: false,
      position: 'top'
    },
    {
      id: 'home',
      label: t('leftMenu.home', '主页'),
      icon: Home,
      visible: true,
      isCore: true,
      position: 'bottom'
    },
    {
      id: 'user-profile',
      label: t('leftMenu.userProfileTooltip', '用户资料'),
      icon: UserCircle,
      visible: true,
      isCore: true,
      position: 'bottom'
    },
    {
      id: 'exit',
      label: t('leftMenu.exit'),
      icon: Power,
      visible: true,
      isCore: true,
      position: 'bottom'
    }
  ]
})

// 强制核心菜单项始终可见（主页、文件、设置、更多功能、退出）
const CORE_MENU_IDS = ['home', 'file', 'settings', 'more-features', 'exit']

// 菜单配置状态（包含顺序和可见性）
const menuConfigState = ref<{
  items: MenuConfigItem[]
  order: string[]
}>({
  items: [],
  order: []
})

// 加载菜单配置
const loadMenuConfig = async () => {
  try {
    const config = await getSetting('leftMenuConfig')
    if (config && Array.isArray(config) && config.length > 0) {
      // 合并保存的配置和当前定义的配置
      const configMap = new Map(config.map((item: any) => [item.id, item]))
      const mergedItems = menuConfigItems.value.map((item) => {
        const saved = configMap.get(item.id)
        if (saved) {
          // 将 middle 位置转换为 bottom（迁移逻辑）
          const savedPosition = (saved.position as any) || item.position || 'top'
          let position: 'top' | 'bottom' =
            savedPosition === 'middle' ? 'bottom' : savedPosition === 'top' ? 'top' : 'bottom'

          return {
            ...item,
            // 核心菜单项强制可见
            visible: CORE_MENU_IDS.includes(item.id) ? true : (saved.visible ?? item.visible),
            // 恢复位置信息（确保只有 top 或 bottom）
            position
          }
        }
        return { ...item, position: item.position || 'top' }
      })
      menuConfigState.value.items = mergedItems
      // 使用保存的顺序，但确保所有项都在列表中
      const savedOrder = config.map((item: any) => item.id)
      const allIds = menuConfigItems.value.map((item) => item.id)
      const orderedIds = [...savedOrder, ...allIds.filter((id) => !savedOrder.includes(id))]
      menuConfigState.value.order = orderedIds
    } else {
      // 使用默认配置
      menuConfigState.value.items = menuConfigItems.value.map((item) => ({ ...item }))
      menuConfigState.value.order = menuConfigItems.value.map((item) => item.id)
    }
  } catch (error) {
    logger.error('加载菜单配置失败:', error)
    menuConfigState.value.items = menuConfigItems.value.map((item) => ({ ...item }))
    menuConfigState.value.order = menuConfigItems.value.map((item) => item.id)
  }
}

// 检查菜单项是否可见
const isMenuItemVisible = (menuId: string) => {
  const item = menuConfigState.value.items.find((i) => i.id === menuId)
  if (!item) return true // 如果找不到配置，默认显示
  return item.visible
}

// 获取菜单项的顺序（用于渲染，分为 top 和 bottom）
const getMenuOrder = () => {
  // 根据配置的顺序排列
  const order = menuConfigState.value.order || menuConfigItems.value.map((item) => item.id)
  const visibleIds = order.filter((id) => {
    const item = menuConfigState.value.items.find((i) => i.id === id)
    return item ? item.visible : true
  })

  // 分离 top 和 bottom 菜单项
  const topIds: string[] = []
  const bottomIds: string[] = []

  visibleIds.forEach((id) => {
    const item = menuConfigState.value.items.find((i) => i.id === id)
    const position = item?.position || 'top'
    // 将 middle 位置转换为 bottom（迁移逻辑）
    if (position === 'bottom' || (position as any) === 'middle') {
      bottomIds.push(id)
    } else {
      topIds.push(id)
    }
  })

  return { top: topIds, bottom: bottomIds }
}

// 打开菜单配置对话框
const openMenuConfigDialog = () => {
  showMenuConfigDialog.value = true
}

// 处理菜单配置保存
const handleMenuConfigSave = async (items: MenuConfigItem[]) => {
  // 合并保存的配置和当前定义的配置，保留icon等Vue组件引用
  const configMap = new Map(items.map((item: any) => [item.id, item]))
  const mergedItems = menuConfigItems.value.map((item) => {
    const saved = configMap.get(item.id)
    if (saved) {
      // 将 middle 位置转换为 bottom（迁移逻辑）
      const savedPosition = (saved.position as any) || item.position || 'top'
      let position: 'top' | 'bottom' =
        savedPosition === 'middle' ? 'bottom' : savedPosition === 'top' ? 'top' : 'bottom'

      return {
        ...item,
        // 核心菜单项强制可见
        visible: CORE_MENU_IDS.includes(item.id) ? true : (saved.visible ?? item.visible),
        // 恢复位置信息（确保只有 top 或 bottom）
        position
      }
    }
    return item
  })

  // 直接更新配置状态，使用保存后的顺序
  menuConfigState.value.items = mergedItems
  menuConfigState.value.order = items.map((item: any) => item.id)
  logger.info('菜单配置已更新', menuConfigState.value)
}

// VSCode 风格侧边栏主题颜色配置
const sidebarBackground = computed(
  () =>
    themeState.currentTheme.SideBackgroundColor ||
    themeState.currentTheme.sidebarBackground ||
    themeState.currentTheme.background2nd
)
const sidebarTextColor = computed(
  () => themeState.currentTheme.SideTextColor || themeState.currentTheme.textColor
)
const sidebarActiveTextColor = computed(
  () => themeState.currentTheme.SideActiveTextColor || themeState.currentTheme.textColor
)
const sidebarSubMenuBg = computed(
  () =>
    themeState.currentTheme.sidebarBackground2 ||
    themeState.currentTheme.sidebarBackground ||
    themeState.currentTheme.background2nd
)
const sidebarBorderColor = computed(
  () => themeState.currentTheme.borderColor || 'rgba(0, 0, 0, 0.1)'
)
// VSCode 风格：悬停颜色使用半透明的主色调叠加
const sidebarHoverColor = computed(() => {
  const baseColor = sidebarBackground.value
  const textColor = sidebarTextColor.value
  // 混合背景色和文字色，透明度较低以获得更微妙的悬停效果
  return mixColors(baseColor, textColor, 0.15)
})
// VSCode 风格：激活状态使用更明显的主色调
const sidebarActiveColor = computed(() => {
  const baseColor = sidebarBackground.value
  const textColor = sidebarTextColor.value
  // 激活状态更明显
  return mixColors(baseColor, textColor, 0.25)
})

// 保持向后兼容
const subMenuBackgroundColor = sidebarSubMenuBg
const activeBackgroundColor = sidebarActiveColor
const activeTextColor = sidebarActiveTextColor
const subMenuHoverColor = sidebarHoverColor

// 提供 collapse 状态给子组件
provide('menuCollapse', isCollapse)

const changeLang = (lang: string) => {
  locale.value = lang
  localStorage.setItem('lang', lang)
  logger.info(`Language changed to ${lang}`)
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  emitMenu('lang-changed', lang)
}

const toggleUserProfile = () => {
  emitMenu('toggle-user-profile')
}

const { activeDocument, activeTab } = useActiveDocument()

// 当前 tab 是否为文档 tab（md/tex 等），用于控制保存/另存为/导出/导出为模板 的可用性
const isDocumentTab = computed(() => activeTab.value?.kind === 'file')
const canExportAsTemplate = computed(
  () =>
    isDocumentTab.value &&
    (activeDocument.value?.format === 'md' || activeDocument.value?.format === 'tex')
)

const exportTitle = computed(() => {
  const title = activeDocument.value?.meta?.title?.trim()
  if (title && title.length > 0) {
    return title
  }
  const path = activeDocument.value?.path ?? ''
  if (path) {
    const segments = path.split(/[/\\]+/).filter(Boolean)
    return segments[segments.length - 1] ?? ''
  }
  return 'Untitled'
})

const exportOptions = computed(() => {
  const format = (activeDocument.value?.format ?? 'md') as DocumentFormat
  return getExportOptions(format)
})

const exportOptionLabel = (option: { labelKey?: string; label?: string; format: string }) => {
  if (option.labelKey) {
    return t(option.labelKey)
  }
  if (option.label) {
    return option.label
  }
  return option.format.toUpperCase()
}
// 打开全局主页
const openGlobalHome = () => {
  workspace.openSystemTab('/global-home', t('leftMenu.home', '主页'))
}

// 打开知识库
const openKnowledgeBase = () => {
  workspace.openSystemTab('/knowledge-base', t('leftMenu.knowledgeBase', '知识库'))
}

// 切换工作目录菜单
const toggleWorkspaceExplorer = () => {
  emitMenu('toggle-workspace-explorer')
}

// 打开调试工具
const openDebugTools = () => {
  workspace.openSystemTab('/debug', t('leftMenu.debugTools', '调试工具'))
}

// 打开 LLM 统计
const openLlmStatistics = () => {
  workspace.openSystemTab('/llm-statistics', t('bottomMenu.llmStatistics', 'LLM统计'))
}

// 打开用户反馈
const openUserFeedback = () => {
  workspace.openSystemTab('/user-feedback', t('leftMenu.userFeedback', '用户反馈'))
}

// 打开用户手册
const openUserManual = () => {
  workspace.openSystemTab('/user-manual', t('leftMenu.userManual', '用户手册'))
}

// 同步所有 VSCode 风格侧边栏 CSS 变量到 document
const syncSidebarCssVariables = () => {
  const root = document.documentElement
  root.style.setProperty('--sidebar-bg', sidebarBackground.value)
  root.style.setProperty('--sidebar-text', sidebarTextColor.value)
  root.style.setProperty('--sidebar-text-active', sidebarActiveTextColor.value)
  root.style.setProperty('--sidebar-hover-bg', sidebarHoverColor.value)
  root.style.setProperty('--sidebar-active-bg', sidebarActiveColor.value)
  root.style.setProperty('--sub-menu-bg', sidebarSubMenuBg.value)
  root.style.setProperty('--sub-menu-hover', sidebarHoverColor.value)
  root.style.setProperty('--sub-menu-active', sidebarActiveColor.value)
  root.style.setProperty('--sidebar-border', sidebarBorderColor.value)
}

// 监听所有侧边栏颜色变化，同步 CSS 变量
watch(
  [
    sidebarBackground,
    sidebarTextColor,
    sidebarActiveTextColor,
    sidebarHoverColor,
    sidebarActiveColor,
    sidebarSubMenuBg,
    sidebarBorderColor
  ],
  () => {
    syncSidebarCssVariables()
  },
  { immediate: true }
)

onMounted(async () => {
  await refreshRecentDocs()
  // 检查是否为开发环境
  isDev.value = await isDevEnvironment()
  // 加载菜单配置
  await loadMenuConfig()
  // 初始化所有侧边栏 CSS 变量
  syncSidebarCssVariables()
})
const refreshRecentDocs = async () => {
  recentDocs.value = await getRecentDocs()
}

// 打开最近文档：与 GlobalHome / 工作区树一致，使用 workspace-open-document，关闭后再从最近文档打开可正常打开
const openRecentDoc = (filePath: string) => {
  const fileExt = extname(filePath)
  const formatId = formatRegistry.getFormatByExtension(fileExt) || 'txt'
  eventBus.emit('workspace-open-document', {
    path: filePath,
    format: formatId,
    content: '',
    preview: false
  })
}

const askSave = async (callBack: any) => {
  // 永远不询问保存，直接执行回调
  callBack()
}
const newDoc = () => {
  // 在当前窗口新建标签页（与 Ctrl+T 行为一致）
  workspace.openNewDocumentTab()
}

const openDoc = () => {
  askSave(() => {
    emitMenu('open-doc')
  })
}
const saveAll = () => {
  emitMenu('save-all')
}
const saveAndQuit = () => {
  emitMenu('save-and-quit')
}
const saveAllAndQuit = () => {
  // 检查是否有需要保存的文档tab
  const hasFileTabs =
    workspace.tabs && workspace.tabs.length > 0 && workspace.tabs.some((tab) => tab.kind === 'file')

  // 如果没有文档tab，直接退出
  if (!hasFileTabs) {
    emitMenu('quit')
    return
  }

  // 有文档tab，执行保存全部并退出
  emitMenu('save-all-and-quit')
}
const quitWithoutSave = () => {
  emitMenu('quit')
}

// 导出选项对话框相关
const showExportOptionsDialog = ref(false)
const currentExportFormat = ref<ExportFormat | null>(null)
const currentExportAdapter = ref<any>(null)

const handleExportClick = (format: ExportFormat) => {
  const sourceFormat = (activeDocument.value?.format ?? 'md') as DocumentFormat
  const adapter = exportAdapterRegistry.get(sourceFormat, format)

  if (adapter && adapter.getOptionFields().length > 0) {
    // 如果有导出选项，显示对话框
    currentExportFormat.value = format
    currentExportAdapter.value = adapter
    showExportOptionsDialog.value = true
  } else {
    // 如果没有选项，直接导出
    emitMenu('export', { format, filename: exportTitle.value })
  }
}

const handleExportOptionsConfirm = (options: ExportOptions) => {
  if (currentExportFormat.value) {
    emitMenu('export', {
      format: currentExportFormat.value,
      filename: exportTitle.value,
      options
    })
  }
  showExportOptionsDialog.value = false
  currentExportFormat.value = null
  currentExportAdapter.value = null
}

function fillExportAsTemplateDefaults() {
  const doc = activeDocument.value
  const meta = doc?.meta
  exportAsTemplateTitle.value = meta?.title?.trim() || exportTitle.value || ''
  exportAsTemplateDescription.value = meta?.description?.trim() || ''
}

function resetExportAsTemplateForm() {
  exportAsTemplateTitle.value = ''
  exportAsTemplateDescription.value = ''
}

function openExportAsTemplateDialog() {
  if (!canExportAsTemplate.value) return
  showExportAsTemplateDialog.value = true
}

const exportAsTemplateAiResultRef = ref('')

function parseTemplateTitleDescriptionFromAi(text: string): { title: string; description: string } {
  const raw = (text || '').trim()
  const titleMatch = raw.match(/(?:标题|Title)[：:]\s*([^\n]+)/i)
  const descMatch = raw.match(/(?:描述|Description)[：:]\s*([\s\S]*)/i)
  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : ''
  }
}

async function generateTemplateTitleDescriptionByAi() {
  const doc = activeDocument.value
  if (!doc || (doc.format !== 'md' && doc.format !== 'tex')) return
  const content = doc.format === 'md' ? doc.markdown : doc.tex
  const excerpt = content.slice(0, 2000)
  const meta = doc.meta
  const prompt = generateTemplateTitleDescriptionPrompt(
    excerpt,
    meta?.title ?? '',
    meta?.description ?? ''
  )
  exportAsTemplateAiLoading.value = true
  exportAsTemplateAiResultRef.value = ''
  try {
    const messages = [{ role: 'user' as const, content: prompt }]
    await createAiTask(
      t('leftMenu.exportAsTemplate'),
      messages,
      exportAsTemplateAiResultRef,
      ai_types.chat,
      'export-as-template-ai',
      { stream: true }
    ).done
    const { title, description } = parseTemplateTitleDescriptionFromAi(
      exportAsTemplateAiResultRef.value
    )
    if (title) exportAsTemplateTitle.value = title
    if (description) exportAsTemplateDescription.value = description
  } catch (e) {
    ElMessage.error(t('llmDialog.generateFailedError'))
  } finally {
    exportAsTemplateAiLoading.value = false
  }
}

function confirmExportAsTemplate() {
  const doc = activeDocument.value
  if (!doc || (doc.format !== 'md' && doc.format !== 'tex')) return
  const content = doc.format === 'md' ? doc.markdown : doc.tex
  const loc = locale?.value ?? 'zh_CN'
  emitMenu('export-as-template', {
    title: exportAsTemplateTitle.value.trim() || exportTitle.value,
    description: exportAsTemplateDescription.value.trim(),
    format: doc.format,
    content,
    locale: String(loc).replace('-', '_')
  })
  showExportAsTemplateDialog.value = false
}
</script>

<style scoped>
/* 底部菜单项 */
.bottom-menu {
  margin-top: auto;
}

.export-as-template-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.export-as-template-field .el-input {
  flex: 1;
}
.export-as-template-ai-btn {
  flex-shrink: 0;
}

/* AI Logo 图标样式 */
.ai-logo-icon {
  width: 18px;
  height: 18px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

/* AI Logo 图标居中 */
.ai-logo-icon {
  width: 18px;
  height: 18px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 底部菜单项 */
.bottom-menu {
  margin-top: auto;
}

/* 顶部和底部菜单之间的分隔符 */
.menu-spacer {
  flex: 1;
  min-height: 0;
}
</style>

<!-- 全局样式：覆盖 Element Plus 弹出菜单 - Windows 11 / QQ NT 风格 -->
<style>
/* 全局覆盖 Element Plus 弹出菜单样式 - Windows 11 / QQ NT 风格 */
/* 只作用于菜单相关的 popper，不影响 tooltip */
/* 使用类名选择器来区分菜单和 tooltip */
.el-menu--popup-container[data-popper-placement^='right'],
.el-sub-menu__popper[data-popper-placement^='right'],
.el-popper[data-popper-placement^='right']:not(.el-tooltip__popper):has(.el-menu--popup),
.el-popper[data-popper-placement^='right']:not(.el-tooltip__popper):has(.el-menu) {
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid var(--el-border-color-light, rgba(0, 0, 0, 0.08)) !important;
  overflow: visible !important;
  padding: 0 !important;
  margin-left: 12px !important;
  background-color: var(--sub-menu-bg, var(--el-bg-color, #ffffff)) !important;
  z-index: 2000 !important;
}

/* 确保 tooltip 不受影响，恢复默认样式 */
/* tooltip 应该保持 Element Plus 的默认样式 */
/* 禁用 tooltip 的所有动画效果，瞬间显示和消失 */
.el-tooltip__popper,
.el-tooltip__popper[data-popper-placement^='right'],
.el-tooltip__popper[data-popper-placement^='top'],
.el-tooltip__popper[data-popper-placement^='bottom'],
.el-tooltip__popper[data-popper-placement^='left'] {
  border-radius: 4px !important;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1) !important;
  border: none !important;
  overflow: visible !important;
  padding: 8px 12px !important;
  margin-left: 0 !important;
  margin-top: 0 !important;
  margin-right: 0 !important;
  margin-bottom: 0 !important;
  background-color: var(--el-bg-color-overlay) !important;
  z-index: 3000 !important;
  /* 禁用 tooltip 的淡入淡出动画，瞬间显示和消失 */
  transition: none !important;
  animation: none !important;
  -webkit-transition: none !important;
  -moz-transition: none !important;
  -o-transition: none !important;
  opacity: 1 !important;
}

/* 禁用 tooltip 内部所有元素的动画效果 */
.el-tooltip__popper *,
.el-tooltip__popper[data-popper-placement^='right'] *,
.el-tooltip__popper[data-popper-placement^='top'] *,
.el-tooltip__popper[data-popper-placement^='bottom'] *,
.el-tooltip__popper[data-popper-placement^='left'] * {
  transition: none !important;
  animation: none !important;
  -webkit-transition: none !important;
  -moz-transition: none !important;
  -o-transition: none !important;
}

/* 确保 tooltip 在所有 Vue transition 状态下都是完全不透明的，瞬间显示和消失 */
.el-tooltip__popper.el-fade-in-linear-enter-active,
.el-tooltip__popper.el-fade-in-linear-leave-active,
.el-tooltip__popper.el-fade-in-linear-enter-from,
.el-tooltip__popper.el-fade-in-linear-leave-to,
.el-tooltip__popper.el-fade-in-enter-active,
.el-tooltip__popper.el-fade-in-leave-active,
.el-tooltip__popper.el-fade-in-enter-from,
.el-tooltip__popper.el-fade-in-leave-to,
.el-tooltip__popper[class*='enter-active'],
.el-tooltip__popper[class*='leave-active'],
.el-tooltip__popper[class*='enter-from'],
.el-tooltip__popper[class*='leave-to'],
.el-tooltip__popper[class*='enter-to'],
.el-tooltip__popper[class*='leave-from'] {
  transition: none !important;
  animation: none !important;
  -webkit-transition: none !important;
  -moz-transition: none !important;
  -o-transition: none !important;
  opacity: 1 !important;
}

/* 确保嵌套子菜单可以显示 */
.el-popper[data-popper-placement^='right'] .el-menu--popup {
  overflow: visible !important;
}

/* 移除外层容器的 padding 和背景 - 只作用于菜单 */
.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu--popup-container,
.el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu--popup-container,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu--popup-container {
  padding: 0 !important;
  background-color: transparent !important;
  border-radius: 10px !important;
  overflow: visible !important;
}

.el-popper[data-popper-placement^='right'] .el-menu {
  border-radius: 10px !important;
  background-color: var(--sub-menu-bg, var(--el-bg-color, #ffffff)) !important;
  border: none !important;
  padding: 4px !important;
  overflow: visible !important;
  min-width: 180px !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 全局菜单标题项样式 - 只作用于菜单 */
.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-item,
.el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu .menu-title-item,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-item {
  cursor: default !important;
  opacity: 1 !important;
  margin: 4px 4px 8px 4px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
  border-radius: 0 !important;
  background-color: transparent !important;
}

.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-item:hover,
.el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu .menu-title-item:hover,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-item:hover {
  background-color: transparent !important;
}

.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-item.is-disabled,
.el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-item.is-disabled,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-item.is-disabled {
  opacity: 1 !important;
  cursor: default !important;
  color: inherit !important;
}

.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-content,
.el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu .menu-title-content,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 8px;
  width: 100%;
}

.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-content .el-icon,
.el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-content
  .el-icon,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-content .el-icon {
  font-size: 16px;
  margin: 0;
  width: 16px;
  height: 16px;
}

.el-popper[data-popper-placement^='right']:has(.el-menu)
  .el-menu
  .menu-title-content
  .menu-title-icon,
.el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-content
  .menu-title-icon,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-content .menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-content span,
.el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-content
  span,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-content span {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  opacity: 0.8;
}

.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .el-menu-item,
.el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu .el-menu-item,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .el-menu-item {
  margin: 1px 4px !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .el-menu-item:hover,
.el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu .el-menu-item:hover,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .el-menu-item:hover {
  border-radius: 6px !important;
}

/* 嵌套子菜单样式 - 确保嵌套子菜单也能正确显示 */
.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .el-sub-menu,
.el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu .el-sub-menu,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .el-sub-menu {
  margin: 1px 4px !important;
}

.el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .el-sub-menu .el-sub-menu__title,
.el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .el-sub-menu
  .el-sub-menu__title,
.el-sub-menu__popper[data-popper-placement^='right'] .el-menu .el-sub-menu .el-sub-menu__title {
  margin: 0 !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
}

.el-popper[data-popper-placement^='right']:has(.el-menu)
  .el-menu
  .el-sub-menu
  .el-sub-menu__title:hover,
.el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .el-sub-menu
  .el-sub-menu__title:hover,
.el-sub-menu__popper[data-popper-placement^='right']
  .el-menu
  .el-sub-menu
  .el-sub-menu__title:hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}

/* 确保所有弹出菜单都有正确的 z-index - 只作用于菜单 */
.el-popper[data-popper-placement^='right']:has(.el-menu),
.el-popper[data-popper-placement^='right'].el-menu--popup-container,
.el-sub-menu__popper[data-popper-placement^='right'] {
  z-index: 2000 !important;
}

/* 嵌套子菜单的弹出框 - 使用更通用的选择器 */
/* Element Plus 会将所有弹出框都添加到 body 下，嵌套子菜单是独立的弹出框 */
body > .el-popper[data-popper-placement^='right']:has(.el-menu),
body > .el-popper[data-popper-placement^='right'].el-menu--popup-container,
body > .el-sub-menu__popper[data-popper-placement^='right'] {
  z-index: 3000 !important;
}

/* 确保嵌套子菜单的弹出框也有圆角和正确样式 */
body > .el-popper[data-popper-placement^='right']:has(.el-menu),
body > .el-popper[data-popper-placement^='right'].el-menu--popup-container,
body > .el-sub-menu__popper[data-popper-placement^='right'] {
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid var(--el-border-color-light, rgba(0, 0, 0, 0.08)) !important;
  overflow: visible !important;
  padding: 0 !important;
  margin-left: 12px !important;
  background-color: var(--sub-menu-bg, var(--el-bg-color, #ffffff)) !important;
}

/* 移除嵌套子菜单外层容器的 padding 和背景 */
body > .el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu--popup-container,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu--popup-container,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu--popup-container {
  padding: 0 !important;
  background-color: transparent !important;
  border-radius: 10px !important;
  overflow: visible !important;
}

/* 嵌套子菜单内部的 el-menu - 确保所有嵌套子菜单都应用样式 */
body > .el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu,
body > .el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu {
  border-radius: 10px !important;
  background-color: var(--sub-menu-bg, var(--el-bg-color, #ffffff)) !important;
  border: none !important;
  padding: 4px !important;
  overflow: visible !important;
  min-width: 180px !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 嵌套子菜单的标题项样式 */
body > .el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-item,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-item,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-item {
  cursor: default !important;
  opacity: 1 !important;
  margin: 4px 4px 8px 4px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
  border-radius: 0 !important;
  background-color: transparent !important;
}

body > .el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-item:hover,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-item:hover,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-item:hover {
  background-color: transparent !important;
}

body
  > .el-popper[data-popper-placement^='right']:has(.el-menu)
  .el-menu
  .menu-title-item.is-disabled,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-item.is-disabled,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-item.is-disabled {
  opacity: 1 !important;
  cursor: default !important;
  color: inherit !important;
}

body > .el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-content,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-content,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 8px;
  width: 100%;
}

body
  > .el-popper[data-popper-placement^='right']:has(.el-menu)
  .el-menu
  .menu-title-content
  .el-icon,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-content
  .el-icon,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-content .el-icon {
  font-size: 16px;
  margin: 0;
  width: 16px;
  height: 16px;
}

body
  > .el-popper[data-popper-placement^='right']:has(.el-menu)
  .el-menu
  .menu-title-content
  .menu-title-icon,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-content
  .menu-title-icon,
body
  > .el-sub-menu__popper[data-popper-placement^='right']
  .el-menu
  .menu-title-content
  .menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

body > .el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .menu-title-content span,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .menu-title-content
  span,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu .menu-title-content span {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  opacity: 0.8;
}

body > .el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .el-menu-item,
body > .el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu .el-menu-item,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu .el-menu-item {
  margin: 1px 4px !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

body > .el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .el-menu-item:hover,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .el-menu-item:hover,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu .el-menu-item:hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}

/* 确保嵌套子菜单项也能正常显示 */
body > .el-popper[data-popper-placement^='right']:has(.el-menu) .el-menu .el-sub-menu,
body > .el-popper[data-popper-placement^='right'].el-menu--popup-container .el-menu .el-sub-menu,
body > .el-sub-menu__popper[data-popper-placement^='right'] .el-menu .el-sub-menu {
  margin: 1px 4px !important;
}

body
  > .el-popper[data-popper-placement^='right']:has(.el-menu)
  .el-menu
  .el-sub-menu
  .el-sub-menu__title,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .el-sub-menu
  .el-sub-menu__title,
body
  > .el-sub-menu__popper[data-popper-placement^='right']
  .el-menu
  .el-sub-menu
  .el-sub-menu__title {
  margin: 0 !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
}

body
  > .el-popper[data-popper-placement^='right']:has(.el-menu)
  .el-menu
  .el-sub-menu
  .el-sub-menu__title:hover,
body
  > .el-popper[data-popper-placement^='right'].el-menu--popup-container
  .el-menu
  .el-sub-menu
  .el-sub-menu__title:hover,
body
  > .el-sub-menu__popper[data-popper-placement^='right']
  .el-menu
  .el-sub-menu
  .el-sub-menu__title:hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}

/* VSCode 风格 - 整体容器样式 */
.ui-menu {
  border-right: 1px solid var(--sidebar-border, rgba(0, 0, 0, 0.08)) !important;
}
</style>
