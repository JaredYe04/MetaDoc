<template>
  <UIMenu 
    :collapse="isCollapse"
    :background-color="themeState.currentTheme.background2nd"
    :text-color="themeState.currentTheme.SideTextColor"
    :style="{ '--sub-menu-hover': activeBackgroundColor }"
  >
    <!-- 顶部菜单项 -->
    <template v-for="menuId in getMenuOrder().top" :key="menuId">
      <!-- 主页 -->
      <UIMenuItem
        v-if="menuId === 'home' && isMenuItemVisible('home')"
        :label="$t('leftMenu.home', '主页')"
        :tooltip="$t('leftMenu.home', '主页')"
        :icon="House"
        @click="openGlobalHome"
      />

      <!-- 文件菜单 -->
      <UISubMenu
        v-if="menuId === 'file' && isMenuItemVisible('file')"
        :title="$t('leftMenu.file')"
        :tooltip="$t('leftMenu.file')"
        :icon="Document"
        trigger="click"
        :level="1"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <Document />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.file') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <Document />
            </el-icon>
          </template>
          {{ $t('leftMenu.fileTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="DocumentAdd" @click="newDoc">
          {{ $t('leftMenu.new') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderOpened" @click="openDoc">
          {{ $t('leftMenu.open') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderChecked" @click="saveAll">
          {{ $t('leftMenu.saveAll') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderChecked" @click="eventBus.emit('save')">
          {{ $t('leftMenu.save') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderAdd" @click="eventBus.emit('save-as')">
          {{ $t('leftMenu.saveAs') }}
        </UISubMenuItem>

        <UISubMenu :icon="FirstAidKit" :title="$t('leftMenu.export')" trigger="hover" :level="2">
          <template #title>
            <span>{{ $t('leftMenu.export') }}</span>
          </template>

          <!-- 标题项 -->
          <UISubMenuItem :is-title="true" :disabled="true">
            <template #icon>
              <el-icon>
                <FirstAidKit />
              </el-icon>
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

        <UISubMenuItem :icon="CircleClose" @click="eventBus.emit('close-active-tab')">
          {{ $t('leftMenu.closeFile') }}
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
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.AiLogo" alt="AI" class="ai-logo-icon" />
          </div>
          <span>{{ $t('leftMenu.aiAssistant') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img :src="themeState.currentTheme.AiLogo" alt="AI" class="menu-title-icon" />
          </template>
          {{ $t('leftMenu.aiToolTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="ChatDotRound" @click="eventBus.emit('ai-chat')">
          {{ $t('leftMenu.chatWithAI') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Reading" @click="eventBus.emit('fomula-recognition')">
          {{ $t('leftMenu.handwritingFormulaRecognition') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Picture" @click="eventBus.emit('smart-drawing-assistant')">
          {{ $t('leftMenu.smartDrawingAssistant') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="DataAnalysis" @click="eventBus.emit('data-analysis')">
          {{ $t('leftMenu.dataAnalysis') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="View" @click="eventBus.emit('ocr')">
          {{ $t('leftMenu.ocr') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Paperclip" @click="eventBus.emit('attachment')">
          {{ $t('leftMenu.attachment') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 设置菜单 -->
      <UISubMenu
        v-if="menuId === 'settings' && isMenuItemVisible('settings')"
        :title="$t('leftMenu.settings')"
        :tooltip="$t('leftMenu.settings')"
        :icon="Setting"
        trigger="click"
        :level="1"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <Setting />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.settings') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <Setting />
            </el-icon>
          </template>
          {{ $t('leftMenu.settingsTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Setting" @click="eventBus.emit('setting')">
          {{ $t('leftMenu.settingsPanel') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 最近文件菜单 -->
      <UISubMenu
        v-if="menuId === 'recent-files' && isMenuItemVisible('recent-files')"
        :title="$t('leftMenu.recentFiles')"
        :tooltip="$t('leftMenu.recentFiles')"
        :icon="Clock"
        trigger="click"
        :level="1"
        class="recent-files-menu"
        @open="refreshRecentDocs"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon class="recent-files-icon">
              <Clock />
            </el-icon>
          </div>
          <span class="recent-files-text">{{ $t('leftMenu.recentFiles') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <Clock />
            </el-icon>
          </template>
          {{ $t('leftMenu.recentFilesTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem
          v-for="item in recentDocs.slice(0, 10)"
          :key="item"
          :icon="Document"
          @click="askSave(() => { eventBus.emit('open-doc', item) })"
        >
          {{ item }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 语言菜单 -->
      <UISubMenu
        v-if="menuId === 'language' && isMenuItemVisible('language')"
        :title="$t('leftMenu.langTooltip')"
        :tooltip="$t('leftMenu.langTooltip')"
        :icon="EarthIcon as any"
        trigger="click"
        :level="1"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <EarthIcon />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.langTooltip') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <EarthIcon />
            </el-icon>
          </template>
          {{ $t('leftMenu.langTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('zh_CN')">
          中文（简体）
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('en_US')">
          English (US)
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('ja_JP')">
          日本語
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('ko_KR')">
          한국어
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('fr_FR')">
          Français
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('de_DE')">
          Deutsch
        </UISubMenuItem>
      </UISubMenu>
      
      <!-- 知识库 -->
      <UIMenuItem
        v-if="menuId === 'knowledge-base' && isMenuItemVisible('knowledge-base')"
        :label="$t('leftMenu.knowledgeBase', '知识库')"
        :tooltip="$t('leftMenu.knowledgeBase', '知识库')"
        :icon="Collection"
        @click="openKnowledgeBase"
      />

      <!-- 工作目录 -->
      <UIMenuItem
        v-if="menuId === 'workspace-explorer' && isMenuItemVisible('workspace-explorer')"
        :label="$t('leftMenu.workspaceExplorer', '工作目录')"
        :tooltip="$t('leftMenu.workspaceExplorer', '工作目录')"
        :icon="FolderOpened"
        @click="toggleWorkspaceExplorer"
      />

      <!-- LLM统计 -->
      <UIMenuItem
        v-if="menuId === 'llm-statistics' && isMenuItemVisible('llm-statistics')"
        :label="$t('bottomMenu.llmStatistics', 'LLM统计')"
        :tooltip="$t('bottomMenu.llmStatistics', 'LLM统计')"
        :icon="DataAnalysis"
        @click="openLlmStatistics"
      />

      <!-- 用户资料 -->
      <UIMenuItem
        v-if="menuId === 'user-profile' && isMenuItemVisible('user-profile')"
        :label="$t('leftMenu.userProfileTooltip', '用户资料')"
        :tooltip="$t('leftMenu.userProfileTooltip', '用户资料')"
        class="bottom-menu"
        @click="toggleUserProfile"
      >
        <template #icon>
          <img v-if="avatar" :src="avatar" width="25" height="25"
            style="border-radius: 50%;" />
          <el-icon v-else>
            <UserFilled />
          </el-icon>
        </template>
      </UIMenuItem>

      <!-- 调试工具（仅在开发环境显示） -->
      <UIMenuItem
        v-if="menuId === 'debug' && isDev && isMenuItemVisible('debug')"
        :label="$t('leftMenu.debugTools', '调试工具')"
        :tooltip="$t('leftMenu.debugTools', '调试工具')"
        :icon="Tools"
        @click="openDebugTools"
      />

      <!-- 更多功能 -->
      <UISubMenu
        v-if="menuId === 'more-features' && isMenuItemVisible('more-features')"
        :title="$t('leftMenu.moreFeatures', '更多功能')"
        :tooltip="$t('leftMenu.moreFeatures', '更多功能')"
        :icon="Grid"
        trigger="click"
        :level="1"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <Grid />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.moreFeatures', '更多功能') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <Grid />
            </el-icon>
          </template>
          {{ $t('leftMenu.moreFeatures', '更多功能') }}
        </UISubMenuItem>

        <!-- LLM统计：只有在菜单配置中不可见时才显示在更多功能子菜单中 -->
        <UISubMenuItem 
          v-if="!isMenuItemVisible('llm-statistics')"
          :icon="DataAnalysis" 
          @click="openLlmStatistics"
        >
          {{ $t('bottomMenu.llmStatistics', 'LLM统计') }}
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
        :icon="SwitchButton"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <SwitchButton />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.exit') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <SwitchButton />
            </el-icon>
          </template>
          {{ $t('leftMenu.exitTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="SwitchButton" @click="saveAndQuit">
          {{ $t('leftMenu.saveAndExit') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="SwitchButton" @click="saveAllAndQuit">
          {{ $t('leftMenu.saveAllAndExit') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="SwitchButton" @click="quitWithoutSave">
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
        :icon="House"
        class="bottom-menu"
        @click="openGlobalHome"
      />

      <!-- 文件菜单 -->
      <UISubMenu
        v-if="menuId === 'file' && isMenuItemVisible('file')"
        :title="$t('leftMenu.file')"
        :tooltip="$t('leftMenu.file')"
        :icon="Document"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <Document />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.file') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <Document />
            </el-icon>
          </template>
          {{ $t('leftMenu.fileTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="DocumentAdd" @click="newDoc">
          {{ $t('leftMenu.new') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderOpened" @click="openDoc">
          {{ $t('leftMenu.open') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderChecked" @click="saveAll">
          {{ $t('leftMenu.saveAll') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderChecked" @click="eventBus.emit('save')">
          {{ $t('leftMenu.save') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="FolderAdd" @click="eventBus.emit('save-as')">
          {{ $t('leftMenu.saveAs') }}
        </UISubMenuItem>

        <UISubMenu :icon="FirstAidKit" :title="$t('leftMenu.export')" trigger="hover" :level="2">
          <template #title>
            <span>{{ $t('leftMenu.export') }}</span>
          </template>

          <!-- 标题项 -->
          <UISubMenuItem :is-title="true" :disabled="true">
            <template #icon>
              <el-icon>
                <FirstAidKit />
              </el-icon>
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

        <UISubMenuItem :icon="CircleClose" @click="eventBus.emit('close-active-tab')">
          {{ $t('leftMenu.closeFile') }}
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
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.AiLogo" alt="AI" class="ai-logo-icon" />
          </div>
          <span>{{ $t('leftMenu.aiAssistant') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img :src="themeState.currentTheme.AiLogo" alt="AI" class="menu-title-icon" />
          </template>
          {{ $t('leftMenu.aiToolTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="ChatDotRound" @click="eventBus.emit('ai-chat')">
          {{ $t('leftMenu.chatWithAI') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Reading" @click="eventBus.emit('fomula-recognition')">
          {{ $t('leftMenu.handwritingFormulaRecognition') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Picture" @click="eventBus.emit('smart-drawing-assistant')">
          {{ $t('leftMenu.smartDrawingAssistant') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="DataAnalysis" @click="eventBus.emit('data-analysis')">
          {{ $t('leftMenu.dataAnalysis') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="View" @click="eventBus.emit('ocr')">
          {{ $t('leftMenu.ocr') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Paperclip" @click="eventBus.emit('attachment')">
          {{ $t('leftMenu.attachment') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 设置菜单 -->
      <UISubMenu
        v-if="menuId === 'settings' && isMenuItemVisible('settings')"
        :title="$t('leftMenu.settings')"
        :tooltip="$t('leftMenu.settings')"
        :icon="Setting"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <Setting />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.settings') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <Setting />
            </el-icon>
          </template>
          {{ $t('leftMenu.settingsTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="Setting" @click="eventBus.emit('setting')">
          {{ $t('leftMenu.settingsPanel') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 最近文件菜单 -->
      <UISubMenu
        v-if="menuId === 'recent-files' && isMenuItemVisible('recent-files')"
        :title="$t('leftMenu.recentFiles')"
        :tooltip="$t('leftMenu.recentFiles')"
        :icon="Clock"
        trigger="click"
        :level="1"
        class="recent-files-menu bottom-menu"
        @open="refreshRecentDocs"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon class="recent-files-icon">
              <Clock />
            </el-icon>
          </div>
          <span class="recent-files-text">{{ $t('leftMenu.recentFiles') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <Clock />
            </el-icon>
          </template>
          {{ $t('leftMenu.recentFilesTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem
          v-for="item in recentDocs.slice(0, 10)"
          :key="item"
          :icon="Document"
          @click="askSave(() => { eventBus.emit('open-doc', item) })"
        >
          {{ item }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- 语言菜单 -->
      <UISubMenu
        v-if="menuId === 'language' && isMenuItemVisible('language')"
        :title="$t('leftMenu.langTooltip')"
        :tooltip="$t('leftMenu.langTooltip')"
        :icon="EarthIcon as any"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <EarthIcon />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.langTooltip') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <EarthIcon />
            </el-icon>
          </template>
          {{ $t('leftMenu.langTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('zh_CN')">
          中文（简体）
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('en_US')">
          English (US)
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('ja_JP')">
          日本語
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('ko_KR')">
          한국어
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('fr_FR')">
          Français
        </UISubMenuItem>

        <UISubMenuItem @click="changeLang('de_DE')">
          Deutsch
        </UISubMenuItem>
      </UISubMenu>
      
      <!-- 知识库 -->
      <UIMenuItem
        v-if="menuId === 'knowledge-base' && isMenuItemVisible('knowledge-base')"
        :label="$t('leftMenu.knowledgeBase', '知识库')"
        :tooltip="$t('leftMenu.knowledgeBase', '知识库')"
        :icon="Collection"
        class="bottom-menu"
        @click="openKnowledgeBase"
      />

      <!-- 工作目录 -->
      <UIMenuItem
        v-if="menuId === 'workspace-explorer' && isMenuItemVisible('workspace-explorer')"
        :label="$t('leftMenu.workspaceExplorer', '工作目录')"
        :tooltip="$t('leftMenu.workspaceExplorer', '工作目录')"
        :icon="FolderOpened"
        class="bottom-menu"
        @click="toggleWorkspaceExplorer"
      />

      <!-- LLM统计 -->
      <UIMenuItem
        v-if="menuId === 'llm-statistics' && isMenuItemVisible('llm-statistics')"
        :label="$t('bottomMenu.llmStatistics', 'LLM统计')"
        :tooltip="$t('bottomMenu.llmStatistics', 'LLM统计')"
        :icon="DataAnalysis"
        class="bottom-menu"
        @click="openLlmStatistics"
      />

      <!-- 用户资料 -->
      <UIMenuItem
        v-if="menuId === 'user-profile' && isMenuItemVisible('user-profile')"
        :label="$t('leftMenu.userProfileTooltip', '用户资料')"
        :tooltip="$t('leftMenu.userProfileTooltip', '用户资料')"
        class="bottom-menu"
        @click="toggleUserProfile"
      >
        <template #icon>
          <img v-if="avatar" :src="avatar" width="25" height="25"
            style="border-radius: 50%;" />
          <el-icon v-else>
            <UserFilled />
          </el-icon>
        </template>
      </UIMenuItem>

      <!-- 调试工具（仅在开发环境显示） -->
      <UIMenuItem
        v-if="menuId === 'debug' && isDev && isMenuItemVisible('debug')"
        :label="$t('leftMenu.debugTools', '调试工具')"
        :tooltip="$t('leftMenu.debugTools', '调试工具')"
        :icon="Tools"
        class="bottom-menu"
        @click="openDebugTools"
      />

      <!-- 更多功能 -->
      <UISubMenu
        v-if="menuId === 'more-features' && isMenuItemVisible('more-features')"
        :title="$t('leftMenu.moreFeatures', '更多功能')"
        :tooltip="$t('leftMenu.moreFeatures', '更多功能')"
        :icon="Grid"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <Grid />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.moreFeatures', '更多功能') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <Grid />
            </el-icon>
          </template>
          {{ $t('leftMenu.moreFeatures', '更多功能') }}
        </UISubMenuItem>

        <!-- LLM统计：只有在菜单配置中不可见时才显示在更多功能子菜单中 -->
        <UISubMenuItem 
          v-if="!isMenuItemVisible('llm-statistics')"
          :icon="DataAnalysis" 
          @click="openLlmStatistics"
        >
          {{ $t('bottomMenu.llmStatistics', 'LLM统计') }}
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
        :icon="SwitchButton"
        trigger="click"
        :level="1"
        class="bottom-menu"
      >
        <template #title>
          <div class="icon-wrapper">
            <el-icon>
              <SwitchButton />
            </el-icon>
          </div>
          <span>{{ $t('leftMenu.exit') }}</span>
        </template>

        <!-- 标题项 -->
        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <el-icon>
              <SwitchButton />
            </el-icon>
          </template>
          {{ $t('leftMenu.exitTooltip') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="SwitchButton" @click="saveAndQuit">
          {{ $t('leftMenu.saveAndExit') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="SwitchButton" @click="saveAllAndQuit">
          {{ $t('leftMenu.saveAllAndExit') }}
        </UISubMenuItem>

        <UISubMenuItem :icon="SwitchButton" @click="quitWithoutSave">
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
  
  <!-- 菜单配置对话框 -->
  <MenuConfigDialog
    v-model="showMenuConfigDialog"
    :items="menuConfigItems"
    @save="handleMenuConfigSave"
  />
</template>


<script lang="ts" setup>
import { updateRecentDocs, getRecentDocs, getSetting, setSetting } from '../utils/settings';
import { computed, onMounted, ref, provide, watch } from 'vue'
import UIMenu from './ui/UIMenu.vue'
import UIMenuItem from './ui/UIMenuItem.vue'
import UISubMenu from './ui/UISubMenu.vue'
import UISubMenuItem from './ui/UISubMenuItem.vue'
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
  DataAnalysis,
  DocumentAdd,
  FolderOpened,
  FolderChecked,
  FolderAdd,
  CircleClose,
  Clock,
  SwitchButton,
  Picture,
  ZoomIn,
  Connection,
  House,
  Collection,
  Tools,
  Grid,
  Reading,
  View,
  Paperclip
} from '@element-plus/icons-vue'
import eventBus from '../utils/event-bus';
import { ElMessage, ElMessageBox } from 'element-plus'
import { themeState, mixColors } from '../utils/themes';
import { avatar } from '../stores/user';
import { useActiveDocument } from '../composables/useActiveDocument';
import { EarthIcon } from 'tdesign-icons-vue-next';
import { getExportOptions } from '../services/export-manager.ts';
import type { DocumentFormat, ExportFormat } from '../../../types';
import { exportAdapterRegistry } from '../services/export-adapters';
import ExportOptionsDialog from './ExportOptionsDialog.vue';
import type { ExportOptions } from '../services/export-adapters/types';
import MenuConfigDialog, { type MenuConfigItem } from './MenuConfigDialog.vue';
const recentDocs = ref([])
const isCollapse = ref(true)
const showUserProfile = ref(false)
const showMenuConfigDialog = ref(false)
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { convertMarkdownToLatex } from '../utils/latex-utils';
import { createRendererLogger } from '../utils/logger';
import { isDevEnvironment } from '../utils/dev-env';
import { useWorkspace } from '../stores/workspace';
const { locale } = useI18n()
const logger = createRendererLogger('LeftMenu')
const workspace = useWorkspace()
const isDev = ref(false)

// 菜单配置项定义
const menuConfigItems = computed<MenuConfigItem[]>(() => {
  return [
    { id: 'home', label: t('leftMenu.home', '主页'), icon: House, visible: true, isCore: true, position: 'top' },
    { id: 'file', label: t('leftMenu.file'), icon: Document, visible: true, isCore: true, position: 'top' },
    { id: 'ai-assistant', label: t('leftMenu.aiAssistant'), iconImage: themeState.currentTheme.AiLogo, visible: true, isCore: false, position: 'top' },
    { id: 'settings', label: t('leftMenu.settings'), icon: Setting, visible: true, isCore: true, position: 'top' },
    { id: 'recent-files', label: t('leftMenu.recentFiles'), icon: Clock, visible: true, isCore: false, position: 'top' },
    { id: 'language', label: t('leftMenu.langTooltip'), icon: EarthIcon as any, visible: true, isCore: true, position: 'top' },
    { id: 'knowledge-base', label: t('leftMenu.knowledgeBase', '知识库'), icon: Collection, visible: true, isCore: false, position: 'top' },
    { id: 'workspace-explorer', label: t('leftMenu.workspaceExplorer', '工作目录'), icon: FolderOpened, visible: true, isCore: true, position: 'top' },
    { id: 'debug', label: t('leftMenu.debugTools', '调试工具'), icon: Tools, visible: isDev.value, isCore: false, position: 'top' },
    { id: 'more-features', label: t('leftMenu.moreFeatures', '更多功能'), icon: Grid, visible: true, isCore: true, position: 'top' },
    { id: 'llm-statistics', label: t('bottomMenu.llmStatistics', 'LLM统计'), icon: DataAnalysis, visible: false, isCore: false, position: 'top' },
    { id: 'user-profile', label: t('leftMenu.userProfileTooltip', '用户资料'), icon: UserFilled, visible: true, isCore: true, position: 'bottom' },
    { id: 'exit', label: t('leftMenu.exit'), icon: SwitchButton, visible: true, isCore: true, position: 'bottom' },
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
      const mergedItems = menuConfigItems.value.map(item => {
        const saved = configMap.get(item.id)
        if (saved) {
          // 将 middle 位置转换为 bottom（迁移逻辑）
          const savedPosition = (saved.position as any) || item.position || 'top'
          let position: 'top' | 'bottom' = savedPosition === 'middle' ? 'bottom' : (savedPosition === 'top' ? 'top' : 'bottom')
          
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
      const allIds = menuConfigItems.value.map(item => item.id)
      const orderedIds = [...savedOrder, ...allIds.filter(id => !savedOrder.includes(id))]
      menuConfigState.value.order = orderedIds
    } else {
      // 使用默认配置
      menuConfigState.value.items = menuConfigItems.value.map(item => ({ ...item }))
      menuConfigState.value.order = menuConfigItems.value.map(item => item.id)
    }
  } catch (error) {
    logger.error('加载菜单配置失败:', error)
    menuConfigState.value.items = menuConfigItems.value.map(item => ({ ...item }))
    menuConfigState.value.order = menuConfigItems.value.map(item => item.id)
  }
}

// 检查菜单项是否可见
const isMenuItemVisible = (menuId: string) => {
  const item = menuConfigState.value.items.find(i => i.id === menuId)
  if (!item) return true // 如果找不到配置，默认显示
  return item.visible
}

// 获取菜单项的顺序（用于渲染，分为 top 和 bottom）
const getMenuOrder = () => {
  // 根据配置的顺序排列
  const order = menuConfigState.value.order || menuConfigItems.value.map(item => item.id)
  const visibleIds = order.filter(id => {
    const item = menuConfigState.value.items.find(i => i.id === id)
    return item ? item.visible : true
  })
  
  // 分离 top 和 bottom 菜单项
  const topIds: string[] = []
  const bottomIds: string[] = []
  
  visibleIds.forEach(id => {
    const item = menuConfigState.value.items.find(i => i.id === id)
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
  const mergedItems = menuConfigItems.value.map(item => {
    const saved = configMap.get(item.id)
    if (saved) {
      // 将 middle 位置转换为 bottom（迁移逻辑）
      const savedPosition = (saved.position as any) || item.position || 'top'
      let position: 'top' | 'bottom' = savedPosition === 'middle' ? 'bottom' : (savedPosition === 'top' ? 'top' : 'bottom')
      
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

// 计算弹出菜单的背景色和悬停颜色（与 HeadMenu 保持一致）
const subMenuBackgroundColor = computed(() => themeState.currentTheme.background2nd)
// 使用与 HeadMenu 相同的 active 背景色作为 hover 和 active 颜色
const activeBackgroundColor = computed(() => mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3))
const activeTextColor = computed(() => themeState.currentTheme.textColor)
const subMenuHoverColor = computed(() => activeBackgroundColor.value)

// 提供 collapse 状态给子组件
provide('menuCollapse', isCollapse)

const changeLang = (lang: string) => {
  locale.value = lang
  localStorage.setItem('lang', lang)
  logger.info(`Language changed to ${lang}`)
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('lang-changed', lang)
}

const toggleUserProfile = () => {
  eventBus.emit('toggle-user-profile')
}

const { activeDocument } = useActiveDocument()
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
  eventBus.emit('toggle-workspace-explorer')
}

// 打开调试工具
const openDebugTools = () => {
  workspace.openSystemTab('/debug', t('leftMenu.debugTools', '调试工具'))
}

// 打开 LLM 统计
const openLlmStatistics = () => {
  workspace.openSystemTab('/llm-statistics', t('bottomMenu.llmStatistics', 'LLM统计'))
}

// 更新全局 CSS 变量以匹配 active 背景色
watch(activeBackgroundColor, (newColor) => {
  document.documentElement.style.setProperty('--sub-menu-hover', newColor)
}, { immediate: true })

onMounted(async () => {
  await refreshRecentDocs()
  // 检查是否为开发环境
  isDev.value = await isDevEnvironment()
  // 加载菜单配置
  await loadMenuConfig()
  // 初始化全局 CSS 变量
  document.documentElement.style.setProperty('--sub-menu-hover', activeBackgroundColor.value)
})
const refreshRecentDocs = async () => {
  recentDocs.value = await getRecentDocs()
}

const askSave = async (callBack:any) => {
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
const saveAll = () => {
  eventBus.emit('save-all')
}
const saveAndQuit = () => {
  eventBus.emit('save-and-quit')
}
const saveAllAndQuit = () => {
  eventBus.emit('save-all-and-quit')
}
const quitWithoutSave = () => {
  eventBus.emit('quit')
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
    eventBus.emit('export', { format, filename: exportTitle.value })
  }
}

const handleExportOptionsConfirm = (options: ExportOptions) => {
  if (currentExportFormat.value) {
    eventBus.emit('export', { 
      format: currentExportFormat.value, 
      filename: exportTitle.value,
      options 
    })
  }
  showExportOptionsDialog.value = false
  currentExportFormat.value = null
  currentExportAdapter.value = null
}
</script>

<style scoped>
/* 底部菜单项 */
.bottom-menu {
  margin-top: auto;
}

/* 图标容器 - 固定尺寸的正方形 */
.icon-wrapper {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 8px;
}

/* AI Logo 图标样式 - 在容器内自适应 */
.ai-logo-icon {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  margin: 0;
}

.menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

.modern-sidebar-menu:not(.el-menu--collapse) {
  width: 180px;
  min-height: 400px;
}

/* 菜单项基础样式 */
.modern-sidebar-menu :deep(.el-menu-item),
.modern-sidebar-menu :deep(.el-sub-menu__title) {
  height: 40px;
  line-height: 40px;
  margin: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
  position: relative;
  padding-left: 12px !important;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  cursor: pointer;
}


/* 图标左对齐 - 图标容器内的图标 */
.modern-sidebar-menu :deep(.el-menu-item .icon-wrapper .el-icon),
.modern-sidebar-menu :deep(.el-sub-menu__title .icon-wrapper .el-icon) {
  margin: 0;
  font-size: 18px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 兼容旧样式 - 没有容器的图标 */
.modern-sidebar-menu :deep(.el-menu-item .el-icon:not(.icon-wrapper .el-icon)),
.modern-sidebar-menu :deep(.el-sub-menu__title .el-icon:not(.icon-wrapper .el-icon)) {
  margin-right: 8px;
  font-size: 18px;
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-shrink: 0;
}

/* 最近文件菜单特殊样式：图标左对齐，文本居中 */
.modern-sidebar-menu :deep(.recent-files-menu .el-sub-menu__title) {
  position: relative;
  justify-content: flex-start;
}

.modern-sidebar-menu :deep(.recent-files-menu .recent-files-icon) {
  margin-right: 8px;
  flex-shrink: 0;
}

.modern-sidebar-menu :deep(.recent-files-menu .recent-files-text) {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: auto;
}

/* 折叠hover时，recent-files-text应该正常显示，不使用absolute定位 */
.modern-sidebar-menu.el-menu--collapse :deep(.recent-files-menu.is-hovered .recent-files-text) {
  position: static !important;
  left: auto !important;
  transform: none !important;
  width: 100% !important;
}

/* AI Logo 图标居中 - 已在容器内，不需要额外样式 */

/* 悬停效果 - 圆角背景框（与 HeadMenu 保持一致） */
.modern-sidebar-menu :deep(.el-menu-item:hover),
.modern-sidebar-menu :deep(.el-sub-menu__title:hover) {
  background-color: v-bind('activeBackgroundColor') !important;
  border-radius: 6px;
}

/* 激活状态（与 HeadMenu 保持一致） */
.modern-sidebar-menu :deep(.el-menu-item.is-active) {
  background-color: v-bind('activeBackgroundColor') !important;
  color: v-bind('activeTextColor') !important;
  border-radius: 6px;
}

/* 打开的 submenu 标题应该显示 active 颜色 */
.modern-sidebar-menu :deep(.el-sub-menu.is-opened > .el-sub-menu__title) {
  background-color: v-bind('activeBackgroundColor') !important;
  color: v-bind('activeTextColor') !important;
  border-radius: 6px;
}

/* 子菜单弹出框样式 - Windows 11 / QQ NT 风格圆角 */
/* 使用全局样式覆盖 Element Plus 的弹出菜单 */
.modern-sidebar-menu :deep(.el-popper[data-popper-placement^="right"]),
.modern-sidebar-menu :deep(.el-popper.is-pure),
.modern-sidebar-menu :deep(.el-sub-menu__popper) {
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid var(--el-border-color-light, rgba(0, 0, 0, 0.08)) !important;
  overflow: visible !important;
  padding: 0 !important;
  margin-left: 14px !important;
}

/* 移除外层容器的 padding 和背景 */
.modern-sidebar-menu :deep(.el-popper .el-menu--popup-container),
.modern-sidebar-menu :deep(.el-sub-menu__popper .el-menu--popup-container) {
  padding: 0 !important;
  background-color: transparent !important;
  border-radius: 10px !important;
  overflow: visible !important;
}

/* 弹出菜单内部的 el-menu */
.modern-sidebar-menu :deep(.el-popper .el-menu),
.modern-sidebar-menu :deep(.el-sub-menu__popper .el-menu) {
  border-radius: 10px !important;
  background-color: v-bind('subMenuBackgroundColor') !important;
  border: none !important;
  padding: 4px !important;
  min-width: 180px !important;
  overflow: visible !important;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 子菜单项样式 - 减小间距 */
.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-menu-item),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-menu-item) {
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

/* 嵌套子菜单项样式 */
.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-sub-menu),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-sub-menu) {
  margin: 1px 4px !important;
}

.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-menu-item:hover),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-menu-item:hover) {
  background-color: v-bind('activeBackgroundColor') !important;
  border-radius: 6px !important;
}

/* 嵌套子菜单的标题样式 */
.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-sub-menu .el-sub-menu__title),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-sub-menu .el-sub-menu__title) {
  margin: 1px 4px !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
}

.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-sub-menu .el-sub-menu__title:hover),
.modern-sidebar-menu :deep(.el-popper .el-menu .el-sub-menu .el-sub-menu__title:hover) {
  background-color: v-bind('activeBackgroundColor') !important;
  border-radius: 6px !important;
}

/* 子菜单项图标样式 */
.modern-sidebar-menu :deep(.el-sub-menu .el-menu .el-menu-item .el-icon) {
  margin-right: 8px;
  font-size: 16px;
  width: 16px;
}

/* 禁止滚动条 */
.modern-sidebar-menu {
  overflow: hidden !important;
}

.modern-sidebar-menu :deep(.el-menu) {
  overflow: hidden !important;
  overflow-y: hidden !important;
  overflow-x: hidden !important;
}

/* 折叠状态下的样式 */
.modern-sidebar-menu.el-menu--collapse {
  width: 64px;
}

.modern-sidebar-menu.el-menu--collapse :deep(.el-menu-item),
.modern-sidebar-menu.el-menu--collapse :deep(.el-sub-menu__title) {
  padding: 0 !important;
  justify-content: center;
  display: flex;
  align-items: center;
}

.modern-sidebar-menu.el-menu--collapse :deep(.el-menu-item .icon-wrapper),
.modern-sidebar-menu.el-menu--collapse :deep(.el-sub-menu__title .icon-wrapper) {
  margin: 0 auto !important;
}

.modern-sidebar-menu.el-menu--collapse :deep(.el-menu-item .icon-wrapper .el-icon),
.modern-sidebar-menu.el-menu--collapse :deep(.el-sub-menu__title .icon-wrapper .el-icon) {
  margin: 0 !important;
}

.modern-sidebar-menu.el-menu--collapse :deep(.ai-logo-icon) {
  margin: 0 !important;
}

/* 非折叠状态下，确保所有菜单项和图标左对齐 */
.modern-sidebar-menu:not(.el-menu--collapse) :deep(.el-menu-item),
.modern-sidebar-menu:not(.el-menu--collapse) :deep(.el-sub-menu__title) {
  justify-content: flex-start !important;
}

.modern-sidebar-menu:not(.el-menu--collapse) :deep(.el-menu-item .icon-wrapper),
.modern-sidebar-menu:not(.el-menu--collapse) :deep(.el-sub-menu__title .icon-wrapper) {
  margin-right: 8px !important;
  margin-left: 0 !important;
}

/* 底部菜单项 */
.bottom-menu {
  margin-top: auto;
}

/* 移除默认的边框和分隔线 */
.modern-sidebar-menu :deep(.el-menu) {
  border-right: none;
}

/* 菜单标题项样式 - 居中显示，不可点击 */
.modern-sidebar-menu :deep(.menu-title-item) {
  cursor: default !important;
  opacity: 1 !important;
  margin: 4px 4px 8px 4px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
  border-radius: 0 !important;
}

.modern-sidebar-menu :deep(.menu-title-item:hover) {
  background-color: transparent !important;
}

.modern-sidebar-menu :deep(.menu-title-item.is-disabled) {
  opacity: 1 !important;
  cursor: default !important;
  color: inherit !important;
}

.menu-title-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 8px;
  width: 100%;
}

.menu-title-content .el-icon {
  font-size: 16px;
  margin: 0;
  width: 16px;
  height: 16px;
}

.menu-title-content .menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

.menu-title-content span {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  opacity: 0.8;
}

/* 顶部和底部菜单之间的分隔符 */
.menu-spacer {
  flex: 1;
  min-height: 0;
}

/* 子菜单箭头图标 */
.modern-sidebar-menu :deep(.el-sub-menu__icon-arrow) {
  margin-top: -1px;
  font-size: 12px;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .modern-sidebar-menu:not(.el-menu--collapse) {
    width: 160px;
  }
}

</style>

<!-- 全局样式：覆盖 Element Plus 弹出菜单 - Windows 11 / QQ NT 风格 -->
<style>
/* 全局覆盖 Element Plus 弹出菜单样式 - Windows 11 / QQ NT 风格 */
/* 只作用于菜单相关的 popper，不影响 tooltip */
/* 使用类名选择器来区分菜单和 tooltip */
.el-menu--popup-container[data-popper-placement^="right"],
.el-sub-menu__popper[data-popper-placement^="right"],
.el-popper[data-popper-placement^="right"]:not(.el-tooltip__popper):has(.el-menu--popup),
.el-popper[data-popper-placement^="right"]:not(.el-tooltip__popper):has(.el-menu) {
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
.el-tooltip__popper[data-popper-placement^="right"],
.el-tooltip__popper[data-popper-placement^="top"],
.el-tooltip__popper[data-popper-placement^="bottom"],
.el-tooltip__popper[data-popper-placement^="left"] {
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
}

/* 确保嵌套子菜单可以显示 */
.el-popper[data-popper-placement^="right"] .el-menu--popup {
  overflow: visible !important;
}

/* 移除外层容器的 padding 和背景 - 只作用于菜单 */
.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu--popup-container,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu--popup-container,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu--popup-container {
  padding: 0 !important;
  background-color: transparent !important;
  border-radius: 10px !important;
  overflow: visible !important;
}

.el-popper[data-popper-placement^="right"] .el-menu {
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
.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item {
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

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item:hover,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item:hover,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item:hover {
  background-color: transparent !important;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item.is-disabled,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item.is-disabled,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item.is-disabled {
  opacity: 1 !important;
  cursor: default !important;
  color: inherit !important;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 8px;
  width: 100%;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content .el-icon,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content .el-icon,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content .el-icon {
  font-size: 16px;
  margin: 0;
  width: 16px;
  height: 16px;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content .menu-title-icon,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content .menu-title-icon,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content .menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content span,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content span,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content span {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  opacity: 0.8;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-menu-item,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-menu-item,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-menu-item {
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

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-menu-item:hover,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-menu-item:hover,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-menu-item:hover {
  border-radius: 6px !important;
}

/* 嵌套子菜单样式 - 确保嵌套子菜单也能正确显示 */
.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu {
  margin: 1px 4px !important;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu .el-sub-menu__title,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu .el-sub-menu__title,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu .el-sub-menu__title {
  margin: 0 !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
}

.el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu .el-sub-menu__title:hover,
.el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu .el-sub-menu__title:hover,
.el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu .el-sub-menu__title:hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}

/* 确保所有弹出菜单都有正确的 z-index - 只作用于菜单 */
.el-popper[data-popper-placement^="right"]:has(.el-menu),
.el-popper[data-popper-placement^="right"].el-menu--popup-container,
.el-sub-menu__popper[data-popper-placement^="right"] {
  z-index: 2000 !important;
}

/* 嵌套子菜单的弹出框 - 使用更通用的选择器 */
/* Element Plus 会将所有弹出框都添加到 body 下，嵌套子菜单是独立的弹出框 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu),
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container,
body > .el-sub-menu__popper[data-popper-placement^="right"] {
  z-index: 3000 !important;
}

/* 确保嵌套子菜单的弹出框也有圆角和正确样式 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu),
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container,
body > .el-sub-menu__popper[data-popper-placement^="right"] {
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid var(--el-border-color-light, rgba(0, 0, 0, 0.08)) !important;
  overflow: visible !important;
  padding: 0 !important;
  margin-left: 12px !important;
  background-color: var(--sub-menu-bg, var(--el-bg-color, #ffffff)) !important;
}

/* 移除嵌套子菜单外层容器的 padding 和背景 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu--popup-container,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu--popup-container,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu--popup-container {
  padding: 0 !important;
  background-color: transparent !important;
  border-radius: 10px !important;
  overflow: visible !important;
}

/* 嵌套子菜单内部的 el-menu - 确保所有嵌套子菜单都应用样式 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu {
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
body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item {
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

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item:hover,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item:hover,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item:hover {
  background-color: transparent !important;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-item.is-disabled,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-item.is-disabled,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-item.is-disabled {
  opacity: 1 !important;
  cursor: default !important;
  color: inherit !important;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 8px;
  width: 100%;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content .el-icon,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content .el-icon,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content .el-icon {
  font-size: 16px;
  margin: 0;
  width: 16px;
  height: 16px;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content .menu-title-icon,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content .menu-title-icon,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content .menu-title-icon {
  width: 16px;
  height: 16px;
  margin: 0;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .menu-title-content span,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .menu-title-content span,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .menu-title-content span {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  opacity: 0.8;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-menu-item,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-menu-item,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-menu-item {
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

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-menu-item:hover,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-menu-item:hover,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-menu-item:hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}

/* 确保嵌套子菜单项也能正常显示 */
body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu {
  margin: 1px 4px !important;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu .el-sub-menu__title,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu .el-sub-menu__title,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu .el-sub-menu__title {
  margin: 0 !important;
  border-radius: 6px !important;
  height: 34px !important;
  line-height: 34px !important;
  padding: 0 12px !important;
  background-color: transparent !important;
}

body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-menu .el-sub-menu .el-sub-menu__title:hover,
body > .el-popper[data-popper-placement^="right"].el-menu--popup-container .el-menu .el-sub-menu .el-sub-menu__title:hover,
body > .el-sub-menu__popper[data-popper-placement^="right"] .el-menu .el-sub-menu .el-sub-menu__title:hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}

/* 打开的 submenu 标题显示 active 颜色 */
.modern-sidebar-menu :deep(.el-sub-menu.is-opened > .el-sub-menu__title),
body > .el-popper[data-popper-placement^="right"]:has(.el-menu) .el-sub-menu.is-opened > .el-sub-menu__title {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px !important;
}
</style>