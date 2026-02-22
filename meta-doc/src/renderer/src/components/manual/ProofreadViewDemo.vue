<template>
  <div class="proofread-view-demo" :style="containerStyle">
    <!-- 左侧校对区域 -->
    <div class="proofread-panel" :style="panelStyle">
      <div class="panel-header">
        <div class="header-title">
          <CheckCircle class="w-5 h-5 header-icon" />
          <span>{{ t('proofread.title', 'AI 校对') }}</span>
        </div>
        <div class="header-actions">
          <Button variant="outline" size="sm" disabled>
            <Settings class="w-4 h-4 mr-1" />
            {{ t('proofread.settings', '设置') }}
          </Button>
        </div>
      </div>

      <div class="panel-content">
        <!-- 原文输入 -->
        <div class="text-section">
          <div class="section-label">{{ t('proofread.original', '原文') }}</div>
          <div class="text-area original-text" :style="textAreaStyle">
            <p>
              本文档详细介绍了 MetaDoc 的各项功能特性。MetaDoc 是一款功能强大的文档处理工具，支持
              Markdown、LaTeX 等多种格式的编辑和预览。
            </p>
            <p>
              通过 AI
              助手功能，用户可以高效的完成文档创作、公式识别、图表生成等任务。系统提供了丰富的模板和快捷操作，使文档编辑更加便捷。
            </p>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-bar">
          <Button size="sm" disabled>
            <Play class="w-4 h-4 mr-1" />
            {{ t('proofread.start', '开始校对') }}
          </Button>

          <Select disabled>
            <SelectTrigger class="w-[140px]">
              <SelectValue :placeholder="t('proofread.selectMode')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">{{
                t('proofread.mode.standard', '标准校对')
              }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 校对结果 -->
        <div class="text-section">
          <div class="section-label">
            {{ t('proofread.result', '校对结果') }}
            <Badge variant="secondary">{{ t('proofread.issuesFound', { count: 3 }) }}</Badge>
          </div>
          <div class="text-area result-text" :style="textAreaStyle">
            <div class="correction-item">
              <div class="correction-header">
                <AlertCircle class="w-4 h-4 correction-icon warning" />
                <span class="correction-type">{{ t('proofread.issue.grammar', '语法问题') }}</span>
              </div>
              <div class="correction-content">
                <div class="original">用户可以<mark>高效的</mark>完成文档创作</div>
                <div class="suggestion">
                  <ArrowRight class="w-4 h-4" />
                  用户可以<strong>高效地</strong>完成文档创作
                </div>
              </div>
            </div>

            <div class="correction-item">
              <div class="correction-header">
                <AlertCircle class="w-4 h-4 correction-icon suggestion" />
                <span class="correction-type">{{ t('proofread.issue.style', '表达优化') }}</span>
              </div>
              <div class="correction-content">
                <div class="original">使文档编辑更加<mark>便捷</mark></div>
                <div class="suggestion">
                  <ArrowRight class="w-4 h-4" />
                  使文档编辑更加<strong>便捷高效</strong>
                </div>
              </div>
            </div>

            <div class="correction-item">
              <div class="correction-header">
                <AlertCircle class="w-4 h-4 correction-icon info" />
                <span class="correction-type">{{
                  t('proofread.issue.punctuation', '标点符号')
                }}</span>
              </div>
              <div class="correction-content">
                <div class="original">支持 Markdown、LaTeX 等<mark>多种格式的</mark>编辑</div>
                <div class="suggestion">
                  <ArrowRight class="w-4 h-4" />
                  支持 Markdown、LaTeX 等<strong>多种格式文档的</strong>编辑
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="panel-footer">
        <Button variant="outline" size="sm" disabled>
          <X class="w-4 h-4 mr-1" />
          {{ t('proofread.ignoreAll', '全部忽略') }}
        </Button>
        <Button size="sm" disabled>
          <Check class="w-4 h-4 mr-1" />
          {{ t('proofread.applyAll', '应用全部') }}
        </Button>
      </div>
    </div>

    <!-- 右侧统计 -->
    <div class="stats-sidebar" :style="sidebarStyle">
      <div class="stats-header">{{ t('proofread.statistics', '校对统计') }}</div>

      <div class="stats-list">
        <div class="stat-item">
          <span class="stat-label">{{ t('proofread.stats.total', '总字数') }}</span>
          <span class="stat-value">128</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">{{ t('proofread.stats.issues', '问题数') }}</span>
          <span class="stat-value error">3</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">{{ t('proofread.stats.suggestions', '建议数') }}</span>
          <span class="stat-value warning">2</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">{{ t('proofread.stats.confidence', '置信度') }}</span>
          <span class="stat-value success">92%</span>
        </div>
      </div>

      <div class="issue-types">
        <div class="issue-type-header">{{ t('proofread.issueTypes', '问题类型') }}</div>

        <div class="issue-type-item">
          <div class="issue-dot grammar"></div>
          <span>{{ t('proofread.type.grammar', '语法错误') }}</span>
          <span class="issue-count">1</span>
        </div>

        <div class="issue-type-item">
          <div class="issue-dot style"></div>
          <span>{{ t('proofread.type.style', '风格优化') }}</span>
          <span class="issue-count">1</span>
        </div>

        <div class="issue-type-item">
          <div class="issue-dot punctuation"></div>
          <span>{{ t('proofread.type.punctuation', '标点符号') }}</span>
          <span class="issue-count">1</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { CheckCircle, Settings, Play, AlertCircle, ArrowRight, X, Check } from 'lucide-vue-next'
import { themeState } from '@renderer/utils/themes'

const { t } = useI18n()

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background
}))

const sidebarStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderLeft: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const textAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background
}))
</script>

<style scoped>
.proofread-view-demo {
  width: 100%;
  height: 500px;
  display: flex;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
}

/* 校对面板 */
.proofread-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.header-icon {
  color: var(--el-color-success);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 文本区域 */
.text-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-area {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
  font-size: 14px;
  line-height: 1.8;
}

.original-text {
  min-height: 100px;
}

.original-text p {
  margin: 0 0 12px 0;
}

.original-text p:last-child {
  margin-bottom: 0;
}

/* 操作栏 */
.action-bar {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 8px 0;
}

/* 结果文本 */
.result-text {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.correction-item {
  padding: 12px;
  border-radius: 6px;
  background-color: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color-light);
}

.correction-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.correction-icon {
  flex-shrink: 0;
}

.correction-icon.warning {
  color: var(--el-color-warning);
}

.correction-icon.suggestion {
  color: var(--el-color-primary);
}

.correction-icon.info {
  color: var(--el-color-info);
}

.correction-type {
  font-size: 12px;
  font-weight: 600;
}

.correction-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.original mark {
  background-color: var(--el-color-warning-light-8);
  color: var(--el-color-warning);
  padding: 2px 4px;
  border-radius: 3px;
}

.suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-color-success);
}

.suggestion strong {
  color: var(--el-color-success);
  font-weight: 600;
}

/* 底部操作 */
.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--el-border-color-light);
}

/* 统计侧边栏 */
.stats-sidebar {
  width: 220px;
  flex-shrink: 0;
  padding: 20px;
}

.stats-header,
.issue-type-header {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: 13px;
  opacity: 0.8;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
}

.stat-value.error {
  color: var(--el-color-danger);
}

.stat-value.warning {
  color: var(--el-color-warning);
}

.stat-value.success {
  color: var(--el-color-success);
}

/* 问题类型 */
.issue-types {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.issue-type-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.issue-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.issue-dot.grammar {
  background-color: var(--el-color-danger);
}

.issue-dot.style {
  background-color: var(--el-color-primary);
}

.issue-dot.punctuation {
  background-color: var(--el-color-info);
}

.issue-count {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.6;
}
</style>
