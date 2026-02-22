<template>
  <div class="ocr-window-demo" :style="containerStyle">
    <div class="main-container">
      <!-- 左侧会话列表 -->
      <div class="session-list-panel" :style="sessionListStyle">
        <div class="session-list-header">
          <span class="session-list-title">{{ t('ocr.sessionsTitle', 'OCR会话') }}</span>
          <Button variant="ghost" size="sm" class="new-session-btn">
            <Plus class="w-4 h-4" />
          </Button>
        </div>
        <div class="session-list">
          <div
            v-for="(session, index) in demoSessions"
            :key="index"
            class="session-item"
            :class="{ active: index === 0 }"
          >
            <span class="session-title">{{ session.title }}</span>
            <span class="session-time">{{ formatTime(session.updatedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧内容区域 -->
      <div class="content-area" :style="panelStyle">
        <!-- 工具栏 -->
        <div class="toolbar" :style="toolbarStyle">
          <div class="toolbar-left">
            <Select v-model="selectedLanguage" disabled>
              <SelectTrigger class="w-[150px]">
                <SelectValue :placeholder="t('ocr.selectLanguages')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chi_sim+eng">{{
                  t('ocr.chineseEnglish', '中文+英文')
                }}</SelectItem>
              </SelectContent>
            </Select>

            <Button size="sm" disabled>
              <Upload class="w-4 h-4 mr-1" />
              {{ t('ocr.upload', '上传图片') }}
            </Button>

            <Button variant="outline" size="sm" disabled>
              <ClipboardPaste class="w-4 h-4 mr-1" />
              {{ t('ocr.paste', '粘贴') }}
            </Button>
          </div>

          <div class="toolbar-right">
            <Button variant="outline" size="sm" disabled>
              <Wand2 class="w-4 h-4 mr-1" />
              {{ t('ocr.aiFix', 'AI修复') }}
            </Button>
          </div>
        </div>

        <!-- 主体区域 -->
        <div class="main-content">
          <!-- 标签页 -->
          <div class="tabs-bar">
            <div
              v-for="(image, index) in demoImages"
              :key="index"
              class="tab-item"
              :class="{ active: activeTab === index }"
            >
              <span>{{ t('ocr.image') }} {{ index + 1 }}</span>
              <X class="w-3 h-3 tab-close" />
            </div>
          </div>

          <!-- 内容分割面板 -->
          <div class="split-panel">
            <!-- 左侧图片区域 -->
            <div class="image-panel" :style="imagePanelStyle">
              <div class="image-preview">
                <div class="image-placeholder">
                  <ImageIcon class="w-16 h-16 placeholder-icon" />
                  <span class="placeholder-text">{{ t('ocr.demoImage', '示例图片') }}</span>
                  <div class="placeholder-subtext">{{ t('ocr.clickToView', '点击查看大图') }}</div>
                </div>
              </div>

              <!-- 图片预处理参数 -->
              <div class="preprocessing-panel">
                <div class="panel-title">{{ t('ocr.preprocessing', '图片预处理') }}</div>
                <div class="param-list">
                  <div class="param-item">
                    <label>{{ t('ocr.brightness', '亮度') }}</label>
                    <Slider :model-value="0" :min="-100" :max="100" :step="1" disabled />
                    <span class="param-value">0</span>
                  </div>
                  <div class="param-item">
                    <label>{{ t('ocr.contrast', '对比度') }}</label>
                    <Slider :model-value="0" :min="-100" :max="100" :step="1" disabled />
                    <span class="param-value">0</span>
                  </div>
                  <div class="param-row">
                    <el-checkbox disabled>{{ t('ocr.grayscale', '灰度') }}</el-checkbox>
                    <el-checkbox disabled>{{ t('ocr.normalize', '归一化') }}</el-checkbox>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="image-actions">
                <Button size="sm" disabled>
                  <Scan class="w-4 h-4 mr-1" />
                  {{ t('ocr.recognize', '开始识别') }}
                </Button>
                <Button variant="outline" size="sm" disabled>
                  <Copy class="w-4 h-4 mr-1" />
                  {{ t('ocr.copy', '复制文字') }}
                </Button>
              </div>
            </div>

            <!-- 右侧文字区域 -->
            <div class="text-panel" :style="textPanelStyle">
              <div class="panel-header">
                <span class="panel-title">{{ t('ocr.recognizedText', '识别结果') }}</span>
                <div class="panel-actions">
                  <Button variant="ghost" size="sm" disabled>
                    <Edit3 class="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div class="text-content">
                <pre class="recognized-text">{{ demoRecognizedText }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import { Slider } from '@renderer/components/ui/slider'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import {
  Plus,
  Upload,
  ClipboardPaste,
  Wand2,
  X,
  ImageIcon,
  Scan,
  Copy,
  Edit3
} from 'lucide-vue-next'
import { themeState } from '@renderer/utils/themes'

const { t } = useI18n()

const selectedLanguage = ref('chi_sim+eng')
const activeTab = ref(0)

// Demo 数据
const demoSessions = [
  {
    title: '文档扫描识别',
    updatedAt: Date.now() - 1000 * 60 * 10
  },
  {
    title: '书籍摘录',
    updatedAt: Date.now() - 1000 * 60 * 60 * 2
  },
  {
    title: '名片识别',
    updatedAt: Date.now() - 1000 * 60 * 60 * 24
  }
]

const demoImages = [{ name: 'demo1.png' }, { name: 'demo2.png' }]

const demoRecognizedText = `第一章 概述

1.1 项目背景

随着人工智能技术的快速发展，OCR（光学字符识别）技术在各个领域得到了广泛应用。本文档旨在介绍如何在 MetaDoc 中使用 OCR 功能进行文字识别。

1.2 功能特点

MetaDoc 的 OCR 功能具有以下特点：

- 多语言支持：支持中文、英文等多种语言
- 高精度识别：采用先进的识别算法
- 图片预处理：支持亮度、对比度调整
- AI修复：使用AI技术修复识别错误

识别结果可以直接插入到文档中，支持进一步编辑和格式化。`

// 样式计算
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor
}))

const sessionListStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderRight: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const toolbarStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderBottom: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const imagePanelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderRight: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const textPanelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd
}))

// 格式化时间
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 1000 * 60) {
    return t('time.justNow', '刚刚')
  } else if (diff < 1000 * 60 * 60) {
    return t('time.minutesAgo', { n: Math.floor(diff / (1000 * 60)) })
  } else if (diff < 1000 * 60 * 60 * 24) {
    return t('time.hoursAgo', { n: Math.floor(diff / (1000 * 60 * 60)) })
  } else {
    return date.toLocaleDateString()
  }
}
</script>

<style scoped>
.ocr-window-demo {
  width: 100%;
  height: 500px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
}

.main-container {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 会话列表面板 */
.session-list-panel {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.session-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.session-list-title {
  font-size: 13px;
  font-weight: 600;
}

.new-session-btn {
  padding: 4px 6px;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.session-item {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  margin-bottom: 3px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.session-item:hover {
  background-color: var(--el-color-primary-light-9);
}

.session-item.active {
  background-color: var(--el-color-primary-light-8);
}

.session-title {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-time {
  font-size: 10px;
  opacity: 0.6;
}

/* 内容区域 */
.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

/* 主体内容 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* 标签页 */
.tabs-bar {
  display: flex;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color-light);
}

.tab-item:hover {
  background-color: var(--el-color-primary-light-9);
}

.tab-item.active {
  background-color: var(--el-color-primary-light-8);
  border-color: var(--el-color-primary-light-5);
}

.tab-close {
  opacity: 0.5;
  cursor: pointer;
}

.tab-close:hover {
  opacity: 1;
}

/* 分割面板 */
.split-panel {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* 图片面板 */
.image-panel {
  width: 45%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: var(--el-bg-color-page);
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px;
  border: 2px dashed var(--el-border-color);
  border-radius: 12px;
  color: var(--el-text-color-secondary);
}

.placeholder-icon {
  opacity: 0.5;
}

.placeholder-text {
  font-size: 14px;
  font-weight: 500;
}

.placeholder-subtext {
  font-size: 12px;
  opacity: 0.7;
}

/* 预处理面板 */
.preprocessing-panel {
  padding: 12px;
  border-top: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 10px;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-item label {
  font-size: 11px;
  width: 50px;
  flex-shrink: 0;
}

.param-item :deep(.slider) {
  flex: 1;
}

.param-value {
  font-size: 11px;
  width: 30px;
  text-align: right;
  opacity: 0.7;
}

.param-row {
  display: flex;
  gap: 16px;
  margin-top: 4px;
}

/* 图片操作按钮 */
.image-actions {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--el-border-color-light);
  justify-content: center;
}

/* 文字面板 */
.text-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.text-panel .panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.text-panel .panel-title {
  margin: 0;
}

.panel-actions {
  display: flex;
  gap: 4px;
}

.text-content {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.recognized-text {
  margin: 0;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: inherit;
  background: transparent;
}
</style>
