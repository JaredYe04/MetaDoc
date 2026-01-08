<template>
  <div class="debug-section">
    <el-tabs v-model="activeTab" type="border-card" tab-position="top">
      <!-- EventBus 事件（合并 EventBus 和广播事件） -->
      <el-tab-pane :label="$t('setting.debug.eventBus')" name="eventbus">
        <el-tabs v-model="eventBusActiveTab" type="border-card" tab-position="top" style="height: 100%;">
          <!-- EventBus 事件测试 -->
          <el-tab-pane :label="$t('setting.debug.eventBus')" name="eventbus">
            <div class="test-panel" :style="testPanelStyle">
              <el-form :model="eventBusForm" label-width="140px">
                <el-form-item :label="$t('setting.debug.eventName')">
                  <el-input
                    v-model="eventBusForm.eventName"
                    :placeholder="$t('setting.debug.eventNamePlaceholder')"
                  />
                </el-form-item>
                <el-form-item :label="$t('setting.debug.eventData')">
                  <el-input
                    v-model="eventBusForm.eventData"
                    type="textarea"
                    :rows="6"
                    :placeholder="$t('setting.debug.eventDataPlaceholder')"
                  />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="sendEventBusEvent">
                    {{ $t('setting.debug.sendEvent') }}
                  </el-button>
                </el-form-item>
              </el-form>
            </div>
          </el-tab-pane>

          <!-- 广播事件测试 -->
          <el-tab-pane :label="$t('setting.debug.broadcast')" name="broadcast">
            <div class="test-panel" :style="testPanelStyle">
              <el-form :model="broadcastForm" label-width="140px">
                <el-form-item :label="$t('setting.debug.targetWindow')">
                  <el-select v-model="broadcastForm.to" style="width: 100%">
                    <el-option :label="$t('setting.debug.targetAll')" value="all" />
                    <el-option
                      v-for="windowType in availableWindowTypes"
                      :key="windowType"
                      :label="getWindowTypeLabel(windowType)"
                      :value="windowType"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item :label="$t('setting.debug.eventName')">
                  <el-input
                    v-model="broadcastForm.eventName"
                    :placeholder="$t('setting.debug.eventNamePlaceholder')"
                  />
                </el-form-item>
                <el-form-item :label="$t('setting.debug.eventData')">
                  <el-input
                    v-model="broadcastForm.eventData"
                    type="textarea"
                    :rows="6"
                    :placeholder="$t('setting.debug.eventDataPlaceholder')"
                  />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="sendBroadcastEvent">
                    {{ $t('setting.debug.sendBroadcast') }}
                  </el-button>
                </el-form-item>
              </el-form>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-tab-pane>

      <!-- 更新测试 -->
      <el-tab-pane label="更新测试" name="updatetest">
        <div class="test-panel" :style="testPanelStyle">
          <el-form :model="updateTestForm" label-width="140px">
            <el-form-item label="当前版本">
              <el-input
                v-model="updateTestForm.currentVersion"
                placeholder="例如: 0.13.4"
                style="width: 200px"
              />
            </el-form-item>

            <el-form-item label="模拟更新版本">
              <el-input
                v-model="updateTestForm.mockUpdateVersion"
                placeholder="例如: 0.14.0"
                style="width: 200px"
              />
            </el-form-item>

            <el-form-item label="更新渠道">
              <el-radio-group v-model="updateTestForm.channel">
                <el-radio label="release">正式版</el-radio>
                <el-radio label="dev">内测版</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="测试场景">
              <el-radio-group v-model="updateTestForm.scenario">
                <el-radio label="hasUpdate">有更新可用</el-radio>
                <el-radio label="noUpdate">已是最新版本</el-radio>
                <el-radio label="error">模拟网络错误</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                :loading="updateTestChecking"
                :disabled="updateTestChecking"
                @click="handleMockCheckUpdate"
              >
                {{ updateTestChecking ? '检查中...' : '检查更新' }}
              </el-button>
              <el-button
                @click="handleMockReset"
              >
                重置状态
              </el-button>
            </el-form-item>
          </el-form>

          <!-- 更新状态显示 -->
          <div v-if="updateTestStatus" class="update-test-status" style="margin-top: 20px;">
            <el-divider style="margin-top: 0;">更新状态</el-divider>
            <el-alert
              v-if="updateTestStatus.updateAvailable"
              type="success"
              :title="`发现新版本: ${updateTestStatus.updateInfo?.version || ''}`"
              :description="updateTestStatus.updateInfo?.releaseNotes || ''"
              show-icon
              :closable="false"
              style="margin-bottom: 16px;"
            />
            <el-alert
              v-else-if="updateTestStatus.updateNotAvailable"
              type="info"
              title="已是最新版本"
              :description="`当前版本: ${updateTestStatus.updateInfo?.version || ''}`"
              show-icon
              :closable="false"
              style="margin-bottom: 16px;"
            />
            <el-alert
              v-else-if="updateTestStatus.error"
              type="error"
              title="检查更新失败"
              :description="updateTestStatus.error"
              show-icon
              :closable="false"
              style="margin-bottom: 16px;"
            />

            <!-- 下载和安装按钮 -->
            <div v-if="updateTestStatus?.updateAvailable" class="update-test-actions">
              <el-button
                v-if="!updateTestDownloaded && !updateTestDownloading"
                type="primary"
                @click="handleMockDownloadUpdate"
              >
                下载更新
              </el-button>
              <el-button
                v-if="updateTestDownloading"
                type="primary"
                :loading="true"
                disabled
              >
                正在下载 ({{ updateTestDownloadProgress }}%)
              </el-button>
              <el-button
                v-if="updateTestDownloaded"
                type="success"
                @click="handleMockInstallUpdate"
              >
                安装并重启
              </el-button>
              <el-button
                v-if="updateTestDownloading"
                @click="handleMockCancelDownload"
              >
                取消下载
              </el-button>
              <el-alert
                v-if="updateTestDownloadError"
                type="error"
                :title="updateTestDownloadError"
                show-icon
                :closable="true"
                @close="updateTestDownloadError = null"
                style="margin-top: 16px;"
              />
            </div>
          </div>

          <!-- 测试历史 -->
          <div v-if="updateTestHistory.length > 0" class="update-test-history" style="margin-top: 20px;">
            <el-divider>测试历史</el-divider>
            <el-scrollbar height="200px">
              <div
                v-for="(entry, index) in updateTestHistory"
                :key="index"
                class="test-history-item"
                :style="testHistoryItemStyle"
              >
                <div class="test-history-header">
                  <span class="test-name">{{ entry.action }}</span>
                  <span class="test-time">{{ formatTime(entry.timestamp) }}</span>
                </div>
                <div v-if="entry.result" class="test-result-data" :style="{ color: themeState.currentTheme.textColor }">
                  <pre :style="codeBlockStyle">{{ JSON.stringify(entry.result, null, 2) }}</pre>
                </div>
                <div v-if="entry.error" class="test-error-message" :style="{ color: themeState.currentTheme.textColor }">
                  <strong>错误:</strong>
                  <pre :style="{ ...codeBlockStyle, backgroundColor: themeState.currentTheme.type === 'dark' ? 'rgba(245, 108, 108, 0.15)' : '#fef0f0', color: '#f56c6c' }">{{ entry.error }}</pre>
                </div>
              </div>
            </el-scrollbar>
          </div>
        </div>
      </el-tab-pane>

      <!-- Agent Tool测试 -->
      <el-tab-pane label="Agent Tool测试" name="agenttool">
        <div class="test-panel" :style="testPanelStyle">
          <el-form :model="toolTestForm" label-width="140px">
            <!-- 从test-cases.json选择测试用例 - 移到最顶部 -->
            <el-form-item label="测试用例">
              <div style="display: flex; gap: 8px; flex-direction: column;">
                <div style="display: flex; gap: 8px;">
                  <el-input
                    v-model="testCaseIdInput"
                    placeholder="输入测试用例ID（如：color-processing::mix-001）"
                    style="flex: 1"
                    clearable
                    @keyup.enter="loadTestCaseById"
                  >
                    <template #append>
                      <el-button :icon="Search" @click="loadTestCaseById">加载</el-button>
                    </template>
                  </el-input>
                </div>
                <el-select
                  v-model="selectedTestCase"
                  placeholder="从test-cases.json选择测试用例"
                  style="flex: 1"
                  @change="loadTestCase"
                  clearable
                  filterable
                >
                  <el-option-group
                    v-for="(testCases, toolId) in availableTestCases"
                    :key="toolId"
                    :label="getToolDisplayName(agentToolManager.getTool(toolId)?.config || { id: toolId })"
                  >
                    <el-option
                      v-for="testCase in testCases.testCases"
                      :key="`${toolId}-${testCase.name}`"
                      :label="testCase.name"
                      :value="`${toolId}::${testCase.name}`"
                    >
                      <span>{{ testCase.name }}</span>
                      <span v-if="testCase.id" style="color: var(--el-text-color-secondary); font-size: 12px; margin-left: 8px;">
                        (ID: {{ testCase.id }})
                      </span>
                      <span v-else style="color: var(--el-text-color-secondary); font-size: 12px; margin-left: 8px;">
                        ({{ toolId }})
                      </span>
                    </el-option>
                  </el-option-group>
                </el-select>
              </div>
            </el-form-item>

            <el-form-item label="选择Tool">
              <el-select
                v-model="toolTestForm.toolId"
                placeholder="选择要测试的Tool"
                style="width: 100%"
                @change="handleToolChange"
              >
                <el-option
                  v-for="tool in availableTools"
                  :key="tool.config.id"
                  :label="getToolDisplayName(tool?.config || { id: tool?.config?.id || '' })"
                  :value="tool?.config?.id || ''"
                />
              </el-select>
            </el-form-item>

            <!-- 保存的配置列表 -->
            <el-form-item label="保存的配置">
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <el-select
                  v-model="selectedConfigId"
                  placeholder="选择已保存的配置"
                  style="flex: 1"
                  @change="loadSavedConfig"
                  clearable
                >
                  <el-option
                    v-for="config in savedConfigs"
                    :key="config.id"
                    :label="config.name"
                    :value="config.id"
                  />
                </el-select>
                <el-button
                  type="success"
                  size="small"
                  :icon="Plus"
                  @click="handleSaveConfigClick"
                >
                  新建配置
                </el-button>
                <el-button
                  type="primary"
                  size="small"
                  :icon="Edit"
                  :disabled="!selectedConfigId"
                  @click="handleEditConfigClick"
                >
                  编辑
                </el-button>
                <el-button
                  type="danger"
                  size="small"
                  :icon="Delete"
                  :disabled="!selectedConfigId"
                  @click="deleteSavedConfig"
                >
                  删除
                </el-button>
              </div>
            </el-form-item>

            <!-- 参数编辑区域 -->
            <el-divider>参数配置</el-divider>
            <el-form-item label="工具说明">
              <el-input
                :value="currentToolInstruction"
                type="textarea"
                :rows="6"
                readonly
                placeholder="请先选择一个Tool查看说明"
                style="font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 12px;"
              />
              <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
                <el-icon><InfoFilled /></el-icon>
                <span>这是工具的详细说明，包含参数格式、使用场景等信息</span>
              </div>
            </el-form-item>
            <el-form-item label="参数JSON">
              <el-input
                v-model="toolTestForm.paramsJson"
                type="textarea"
                :rows="8"
                placeholder='请输入JSON格式的参数，例如: {"prompt": "生成一个流程图", "chartType": "mermaid"}'
              />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="executeToolTest" :loading="toolTestExecuting">
                执行Tool
              </el-button>
              <el-button @click="clearToolTestHistory">
                清空历史
              </el-button>
            </el-form-item>
          </el-form>

          <!-- 测试结果 -->
          <div class="test-result" :style="{ ...testResultStyle, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginTop: '20px' }">
            <el-divider style="margin-top: 0;">执行结果</el-divider>
            <el-scrollbar style="flex: 1; height: 0;">
                <div
                v-for="(entry, index) in toolTestHistory"
                :key="index"
                class="test-history-item"
                :class="{ 'test-error': entry.error }"
                :style="entry.error ? testHistoryItemErrorStyle : testHistoryItemStyle"
              >
                <div class="test-history-header">
                  <span class="test-name">{{ entry.toolName }}</span>
                  <div class="test-header-right">
                    <el-button
                      text
                      size="small"
                      :icon="Download"
                      @click="exportEntrySnapshot(entry)"
                      :title="$t('agent.tool.exportSnapshot')"
                    >
                      {{ $t('agent.tool.exportSnapshot') }}
                    </el-button>
                    <el-tag 
                      v-if="entry.status === 'running'" 
                      type="warning" 
                      size="small"
                      effect="dark"
                    >
                      执行中
                    </el-tag>
                    <el-tag 
                      v-else-if="entry.status === 'succeeded'" 
                      type="success" 
                      size="small"
                    >
                      成功
                    </el-tag>
                    <el-tag 
                      v-else-if="entry.status === 'failed'" 
                      type="danger" 
                      size="small"
                    >
                      失败
                    </el-tag>
                    <span class="test-time">{{ formatTime(entry.timestamp) }}</span>
                  </div>
                </div>
                
                <!-- 进度条 -->
                <div v-if="entry.progress && entry.progress.percentage > 0" class="test-progress">
                  <el-progress
                    :percentage="entry.progress.percentage"
                    :status="entry.status === 'failed' ? 'exception' : undefined"
                    :stroke-width="6"
                  >
                    <template #default="{ percentage }">
                      <span class="progress-text">{{ percentage }}%</span>
                      <span v-if="entry.progress?.message" class="progress-message">
                        {{ entry.progress.message }}
                      </span>
                    </template>
                  </el-progress>
                </div>
                
                <div v-if="entry.params" class="test-params" :style="{ color: themeState.currentTheme.textColor }">
                  <strong>参数:</strong>
                  <pre :style="codeBlockStyle">{{ typeof entry.params === 'string' ? entry.params : JSON.stringify(entry.params, null, 2) }}</pre>
                </div>
                <div v-if="entry.error" class="test-error-message" :style="{ color: themeState.currentTheme.textColor }">
                  <strong>错误:</strong>
                  <pre :style="{ ...codeBlockStyle, backgroundColor: themeState.currentTheme.type === 'dark' ? 'rgba(245, 108, 108, 0.15)' : '#fef0f0', color: '#f56c6c' }">{{ entry.error }}</pre>
                </div>
                
                <!-- 如果有显示组件，展示渲染卡片 -->
                <div v-if="entry.displayComponent && entry.outputs && entry.outputs.length > 0" class="test-display-component">
                  <el-divider>渲染结果</el-divider>
                  <el-collapse :model-value="getActivePanels(entry)" accordion>
                    <el-collapse-item
                      v-for="output in entry.outputs"
                      :key="output.id"
                      :name="output.id"
                    >
                      <template #title>
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <span>{{ output.label }}</span>
                          <el-tag size="small" effect="light">{{ output.format }}</el-tag>
                        </div>
                      </template>
                      <div class="output-body">
                        <!-- 如果有渲染组件，使用组件渲染 -->
                        <component
                          v-if="getDisplayComponent(output.renderer || entry.displayComponent)"
                          :is="getDisplayComponent(output.renderer || entry.displayComponent)"
                          :data="output.data"
                          :status="entry.error ? 'failed' : (entry.status || 'succeeded')"
                          :progress="entry.progress"
                          :error="entry.error"
                          :tool-config="entry.toolConfig"
                          :invocation-id="entry.invocationId"
                        />
                        <!-- 否则使用纯文本渲染 -->
                        <pre v-else class="raw-text" :style="codeBlockStyle">{{ formatResult(output.data) }}</pre>
                      </div>
                    </el-collapse-item>
                  </el-collapse>
                </div>
                
                <!-- 原始结果数据 -->
                <div v-if="entry.result !== undefined" class="test-result-data" :style="{ color: themeState.currentTheme.textColor }">
                  <el-divider>原始结果</el-divider>
                  <pre :style="codeBlockStyle">{{ formatResult(entry.result) }}</pre>
                </div>
              </div>
              <div v-if="toolTestHistory.length === 0" class="test-empty" :style="testEmptyStyle">
                暂无测试历史
              </div>
            </el-scrollbar>
          </div>
        </div>
      </el-tab-pane>

      <!-- 导入工具执行快照 -->
      <el-tab-pane :label="$t('setting.debug.importSnapshot')" name="importsnapshot">
        <div class="test-panel" :style="testPanelStyle">
          <el-form :model="importSnapshotForm" label-width="140px">
            <el-form-item :label="$t('setting.debug.importSnapshotTitle')">
              <p style="color: var(--el-text-color-secondary); font-size: 13px; margin: 0;">
                {{ $t('setting.debug.importSnapshotDescription') }}
              </p>
            </el-form-item>
            <el-form-item :label="$t('setting.debug.snapshotFile')">
              <el-input
                v-model="importSnapshotForm.snapshotContent"
                type="textarea"
                :rows="12"
                :placeholder="$t('setting.debug.snapshotFilePlaceholder')"
              />
              <div style="margin-top: 8px;">
                <el-button
                  type="primary"
                  size="small"
                  :icon="Upload"
                  @click="selectSnapshotFile"
                >
                  {{ $t('setting.debug.selectSnapshotFile') }}
                </el-button>
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".json"
                  style="display: none"
                  @change="handleFileSelect"
                />
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="importSnapshot" :loading="importSnapshotLoading">
                {{ $t('setting.debug.importButton') }}
              </el-button>
              <el-button @click="clearImportForm">
                {{ $t('common.cancel') }}
              </el-button>
            </el-form-item>
          </el-form>

          <!-- 导入后的渲染结果 -->
          <div v-if="importedSnapshot" class="imported-snapshot-display" style="margin-top: 20px;">
            <el-divider style="margin-top: 0;">{{ $t('setting.debug.importSuccess') }}</el-divider>
            <div class="test-history-item" :style="testHistoryItemStyle">
              <div class="test-history-header">
                <span class="test-name">{{ importedSnapshot.toolName }}</span>
                <div class="test-header-right">
                  <el-tag 
                    v-if="importedSnapshot.status === 'running'" 
                    type="warning" 
                    size="small"
                    effect="dark"
                  >
                    {{ $t('agent.tool.status.running') }}
                  </el-tag>
                  <el-tag 
                    v-else-if="importedSnapshot.status === 'succeeded'" 
                    type="success" 
                    size="small"
                  >
                    {{ $t('agent.tool.status.success') }}
                  </el-tag>
                  <el-tag 
                    v-else-if="importedSnapshot.status === 'failed'" 
                    type="danger" 
                    size="small"
                  >
                    {{ $t('agent.tool.status.failed') }}
                  </el-tag>
                  <span class="test-time">{{ formatTime(importedSnapshot.timestamp) }}</span>
                </div>
              </div>
              
              <div v-if="importedSnapshot.params" class="test-params" :style="{ color: themeState.currentTheme.textColor }">
                <strong>{{ $t('setting.debug.parameters') }}:</strong>
                <pre :style="codeBlockStyle">{{ typeof importedSnapshot.params === 'string' ? importedSnapshot.params : JSON.stringify(importedSnapshot.params, null, 2) }}</pre>
              </div>
              
              <div v-if="importedSnapshot.error" class="test-error-message" :style="{ color: themeState.currentTheme.textColor }">
                <strong>{{ $t('setting.debug.error') }}:</strong>
                <pre :style="{ ...codeBlockStyle, backgroundColor: themeState.currentTheme.type === 'dark' ? 'rgba(245, 108, 108, 0.15)' : '#fef0f0', color: '#f56c6c' }">{{ importedSnapshot.error }}</pre>
              </div>
              
              <!-- 如果有显示组件，展示渲染卡片 -->
              <div v-if="importedSnapshot.displayComponent && importedSnapshot.outputs && importedSnapshot.outputs.length > 0" class="test-display-component">
                <el-divider>{{ $t('setting.debug.renderResult') }}</el-divider>
                <el-collapse :model-value="getActivePanels(importedSnapshot)" accordion>
                  <el-collapse-item
                    v-for="output in importedSnapshot.outputs"
                    :key="output.id"
                    :name="output.id"
                  >
                    <template #title>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span>{{ output.label }}</span>
                        <el-tag size="small" effect="light">{{ output.format }}</el-tag>
                      </div>
                    </template>
                    <div class="output-body">
                      <!-- 如果有渲染组件，使用组件渲染 -->
                      <component
                        v-if="getDisplayComponent(output.renderer || importedSnapshot.displayComponent)"
                        :is="getDisplayComponent(output.renderer || importedSnapshot.displayComponent)"
                        :data="output.data"
                        :status="importedSnapshot.error ? 'failed' : (importedSnapshot.status || 'succeeded')"
                        :progress="importedSnapshot.progress"
                        :error="importedSnapshot.error"
                        :tool-config="importedSnapshot.toolConfig"
                        :invocation-id="importedSnapshot.invocationId"
                      />
                      <!-- 否则使用纯文本渲染 -->
                      <pre v-else class="raw-text" :style="codeBlockStyle">{{ formatResult(output.data && typeof output.data === 'object' && 'content' in output.data ? output.data.content : output.data) }}</pre>
                    </div>
                  </el-collapse-item>
                </el-collapse>
              </div>
              
              <!-- 原始结果数据 -->
              <div v-if="importedSnapshot.result !== undefined" class="test-result-data" :style="{ color: themeState.currentTheme.textColor }">
                <el-divider>{{ $t('setting.debug.rawResult') }}</el-divider>
                <pre :style="codeBlockStyle">{{ formatResult(importedSnapshot.result) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- Agent Tool自动测试 -->
      <el-tab-pane label="Tool自动测试" name="autotest">
        <div class="test-panel" :style="testPanelStyle">
          <el-form :model="autoTestForm" label-width="140px">
            <el-form-item label="选择要测试的Tool">
              <el-select
                v-model="autoTestForm.selectedTools"
                multiple
                placeholder="选择要测试的Tool（留空则测试所有）"
                style="width: 100%"
                filterable
              >
                <el-option
                  v-for="tool in availableTools"
                  :key="tool.config.id"
                  :label="getToolDisplayName(tool?.config || { id: tool?.config?.id || '' })"
                  :value="tool?.config?.id || ''"
                />
              </el-select>
            </el-form-item>

            <el-form-item>
              <el-button 
                type="primary" 
                @click="runAutoTests" 
                :loading="autoTestRunning"
                :disabled="autoTestRunning"
              >
                {{ autoTestRunning ? '测试中...' : '开始自动测试' }}
              </el-button>
              <el-button 
                @click="stopAutoTests" 
                :disabled="!autoTestRunning"
              >
                停止测试
              </el-button>
            </el-form-item>
          </el-form>

          <!-- 测试结果 -->
          <div v-if="autoTestResults.length > 0 || autoTestRunning" class="auto-test-results" style="margin-top: 20px;">
            <el-divider style="margin-top: 0;">测试结果</el-divider>
            <AutoTestResultDisplay
              v-if="autoTestResults.length > 0"
              :test-results="autoTestResults"
              :summary="autoTestSummary"
              :markdown-summary="autoTestMarkdown"
            />
            <div v-else-if="autoTestRunning" class="test-progress-info">
              <el-progress
                :percentage="autoTestProgress"
                :status="autoTestRunning ? undefined : 'success'"
              >
                <template #default="{ percentage }">
                  <span>{{ autoTestCurrentTest }}</span>
                  <span style="margin-left: 8px;">{{ percentage }}%</span>
                </template>
              </el-progress>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 单元测试 -->
      <el-tab-pane :label="$t('setting.debug.unitTest.title')" name="unittest">
        <el-tabs v-model="unitTestActiveTab" type="border-card" tab-position="top" style="height: 100%;">
          <!-- 单个测试 -->
          <el-tab-pane :label="$t('setting.debug.unitTest.singleTest')" name="single">
          <div class="test-panel" :style="testPanelStyle">
            <el-form :model="testForm" label-width="140px">
              <el-form-item :label="$t('setting.debug.module')">
                <el-select
                  v-model="testForm.module"
                  :placeholder="$t('setting.debug.selectModule')"
                  style="width: 100%"
                  @change="handleModuleChange"
                >
                  <el-option
                    v-for="module in modules"
                    :key="module"
                    :label="module"
                    :value="module"
                  />
                </el-select>
              </el-form-item>
              <el-form-item :label="$t('setting.debug.testFunction')">
                <el-select
                  v-model="testForm.testId"
                  :placeholder="$t('setting.debug.selectTestFunction')"
                  style="width: 100%"
                  @change="handleTestChange"
                >
                  <el-option
                    v-for="test in availableTests"
                    :key="test.id"
                    :label="`${test.name}${test.description ? ' - ' + test.description : ''}`"
                    :value="test.id"
                  />
                </el-select>
              </el-form-item>

              <!-- 参数编辑区域 -->
              <template v-if="selectedTest && selectedTest.params && selectedTest.params.length > 0">
                <el-divider>{{ $t('setting.debug.parameters') }}</el-divider>
                <el-form-item
                  v-for="param in selectedTest.params"
                  :key="param.name"
                  :label="`${param.name} (${param.type})`"
                >
                  <template v-if="param.type === 'string' || param.type === 'number' || param.type === 'boolean'">
                    <el-input
                      v-if="param.type === 'string'"
                      v-model="testForm.params[param.name]"
                      :placeholder="param.description || param.name"
                    />
                    <el-input-number
                      v-else-if="param.type === 'number'"
                      v-model="testForm.params[param.name]"
                      style="width: 100%"
                    />
                    <el-switch
                      v-else-if="param.type === 'boolean'"
                      v-model="testForm.params[param.name]"
                    />
                  </template>
                  <el-input
                    v-else
                    v-model="testForm.params[param.name]"
                    type="textarea"
                    :rows="4"
                    :placeholder="$t('setting.debug.jsonPlaceholder')"
                  />
                </el-form-item>
              </template>

              <el-form-item>
                <el-button type="primary" @click="executeTest" :loading="testExecuting">
                  {{ $t('setting.debug.executeTest') }}
                </el-button>
                <el-button @click="clearTestHistory">
                  {{ $t('setting.debug.clearHistory') }}
                </el-button>
              </el-form-item>
            </el-form>

            <!-- 测试结果 -->
            <el-divider>{{ $t('setting.debug.testResult') }}</el-divider>
            <div class="test-result">
              <el-scrollbar height="300px">
                <div
                  v-for="(entry, index) in testHistory"
                  :key="index"
                  class="test-history-item"
                  :class="{ 'test-error': entry.error }"
                  :style="entry.error ? testHistoryItemErrorStyle : testHistoryItemStyle"
                >
                  <div class="test-history-header">
                    <span class="test-name">{{ entry.name }}</span>
                    <span class="test-time">{{ formatTime(entry.timestamp) }}</span>
                  </div>
                  <div v-if="entry.params && entry.params.length > 0" class="test-params">
                    <strong>{{ $t('setting.debug.parameters') }}:</strong>
                    <pre>{{ JSON.stringify(entry.params, null, 2) }}</pre>
                  </div>
                  <div v-if="entry.error" class="test-error-message">
                    <strong>{{ $t('setting.debug.error') }}:</strong>
                    <pre>{{ entry.error }}</pre>
                  </div>
                  <div v-else-if="entry.result !== undefined" class="test-result-data">
                    <strong>{{ $t('setting.debug.result') }}:</strong>
                    <pre>{{ formatResult(entry.result) }}</pre>
                  </div>
                </div>
                <div v-if="testHistory.length === 0" class="test-empty">
                  {{ $t('setting.debug.noHistory') }}
                </div>
              </el-scrollbar>
            </div>
          </div>
        </el-tab-pane>

        <!-- 批量测试 -->
        <el-tab-pane :label="$t('setting.debug.unitTest.batchTest')" name="batch">
          <div class="test-panel" :style="testPanelStyle">
            <el-form :model="unitTestBatchForm" label-width="140px">
              <el-form-item :label="$t('setting.debug.unitTest.selectModules')">
                <el-select
                  v-model="unitTestBatchForm.selectedModules"
                  multiple
                  placeholder="选择要测试的模块（留空则测试所有）"
                  style="width: 100%"
                  filterable
                >
                  <el-option
                    v-for="module in modules"
                    :key="module"
                    :label="module"
                    :value="module"
                  />
                </el-select>
              </el-form-item>

              <el-form-item>
                <el-button 
                  type="primary" 
                  @click="runUnitTestBatch" 
                  :loading="unitTestBatchRunning"
                  :disabled="unitTestBatchRunning"
                >
                  {{ unitTestBatchRunning ? '测试中...' : '开始批量测试' }}
                </el-button>
                <el-button 
                  @click="stopUnitTestBatch" 
                  :disabled="!unitTestBatchRunning"
                >
                  停止测试
                </el-button>
              </el-form-item>
            </el-form>

            <!-- 测试结果 -->
            <div v-if="unitTestBatchResults.length > 0 || unitTestBatchRunning" class="unit-test-batch-results" style="margin-top: 20px;">
              <el-divider style="margin-top: 0;">测试结果</el-divider>
              <UnitTestResultDisplay
                v-if="unitTestBatchResults.length > 0"
                :test-results="unitTestBatchResults"
                :summary="unitTestBatchSummary"
                :markdown-summary="unitTestBatchMarkdown"
              />
              <div v-else-if="unitTestBatchRunning" class="test-progress-info">
                <el-progress
                  :percentage="unitTestBatchProgress"
                  :status="unitTestBatchRunning ? undefined : 'success'"
                >
                  <template #default="{ percentage }">
                    <span>{{ unitTestBatchCurrentTest }}</span>
                    <span style="margin-left: 8px;">{{ percentage }}%</span>
                  </template>
                </el-progress>
              </div>
            </div>
          </div>
        </el-tab-pane>
        </el-tabs>
      </el-tab-pane>
    </el-tabs>

    <!-- 保存配置对话框 -->
    <el-dialog
      v-model="showSaveConfigDialog"
      :title="selectedConfigId ? '编辑配置' : '新建配置'"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="配置名称" required>
          <el-input
            v-model="saveConfigName"
            placeholder="请输入配置名称"
            @keyup.enter="saveCurrentConfig"
          />
        </el-form-item>
        <el-form-item label="Tool">
          <el-input
            :value="toolTestForm.toolId ? getToolDisplayName(agentToolManager.getTool(toolTestForm.toolId)?.config || { id: toolTestForm.toolId }) : ''"
            disabled
          />
        </el-form-item>
        <el-form-item label="参数预览">
          <el-input
            :value="toolTestForm.paramsJson"
            type="textarea"
            :rows="4"
            disabled
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSaveConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCurrentConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, reactive, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete, Edit, InfoFilled, Search, Download, Upload } from '@element-plus/icons-vue';
import eventBus, { sendBroadcast } from '../../utils/event-bus';
import { testFramework, type TestFunction } from '../../utils/test-framework';
// 移除 dayjs 导入，改用原生 Date 格式化
import localIpcRenderer from '../../utils/web-adapter/local-ipc-renderer';
import { webMainCalls } from '../../utils/web-adapter/web-main-calls';
import { agentToolManager } from '../../utils/agent-tool-manager';
import type { LocalizedText } from '../../types/agent-tool';
import { getLocalizedInstruction } from '../../utils/agent-tools/i18n-helper';
// 导入显示组件
import ChartGenerationDisplay from '../../utils/agent-tools/components/ChartGenerationDisplay.vue';
import RAGToolDisplay from '../../utils/agent-tools/components/RAGToolDisplay.vue';
import TodoListDisplay from '../../utils/agent-tools/components/TodoListDisplay.vue';
import DataAnalysisDisplay from '../../utils/agent-tools/components/DataAnalysisDisplay.vue';
import TerminalExecutionDisplay from '../../utils/agent-tools/components/TerminalExecutionDisplay.vue';
import GrepDisplay from '../../utils/agent-tools/components/GrepDisplay.vue';
import WebCrawlerDisplay from '../../utils/agent-tools/components/WebCrawlerDisplay.vue';
import EditDisplay from '../../utils/agent-tools/components/EditDisplay.vue';
import ProofreadDisplay from '../../utils/agent-tools/components/ProofreadDisplay.vue';
import DiffDisplay from '../../utils/agent-tools/components/DiffDisplay.vue';
import ColorDisplay from '../../utils/agent-tools/components/ColorDisplay.vue';
import MetadataDisplay from '../../utils/agent-tools/components/MetadataDisplay.vue';
import OutlineTreeDisplay from '../../utils/agent-tools/components/OutlineTreeDisplay.vue';
import OutlineOptimizeDisplay from '../../utils/agent-tools/components/OutlineOptimizeDisplay.vue';
import AutoTestResultDisplay, { type TestResult } from '../../utils/agent-tools/components/AutoTestResultDisplay.vue';
import UnitTestResultDisplay, { type UnitTestResult } from '../../utils/UnitTestResultDisplay.vue';
import { onToolUpdate, onToolComplete, onToolFailed } from '../../utils/agent-tools/tool-display-communication';
import testCasesData from '../../utils/agent-tools/test-data/test-cases.json';
import { themeState } from '../../utils/themes';
import { updateMockService } from '../../utils/update-mock-service';
import {
  createSnapshotFromHistoryEntry,
  serializeToolExecutionSnapshot,
  deserializeToolExecutionSnapshot
} from '../../utils/agent-tools/tool-serialization';
import { createRendererLogger } from '../../utils/logger';

// 组件映射
const componentMap: Record<string, any> = {
  'ChartGenerationDisplay': ChartGenerationDisplay,
  'RAGToolDisplay': RAGToolDisplay,
  'TodoListDisplay': TodoListDisplay,
  'DataAnalysisDisplay': DataAnalysisDisplay,
  'TerminalExecutionDisplay': TerminalExecutionDisplay,
  'GrepDisplay': GrepDisplay,
  'WebCrawlerDisplay': WebCrawlerDisplay,
  'EditDisplay': EditDisplay,
  'ProofreadDisplay': ProofreadDisplay,
  'DiffDisplay': DiffDisplay,
  'ColorDisplay': ColorDisplay,
  'MetadataDisplay': MetadataDisplay,
  'OutlineTreeDisplay': OutlineTreeDisplay,
  'OutlineOptimizeDisplay': OutlineOptimizeDisplay
}

// 从工具配置中提取组件名称
const extractComponentName = (displayComponent: any): string | undefined => {
  if (!displayComponent) return undefined
  
  // 如果是字符串，直接返回
  if (typeof displayComponent === 'string') {
    return displayComponent
  }
  
  // 如果是组件对象，尝试提取名称
  if (typeof displayComponent === 'object') {
    // 方法1：从组件对象的name属性获取
    const name = displayComponent.name || 
                 displayComponent.__name || 
                 displayComponent.displayName
    
    // 如果找到名称，检查它是否在componentMap中
    if (name && typeof name === 'string' && componentMap[name]) {
      return name
    }
    
    // 方法2：通过对象引用在componentMap中查找
    for (const [key, value] of Object.entries(componentMap)) {
      if (value === displayComponent) {
        return key
      }
    }
  }
  
  return undefined
}

// 获取组件
const getDisplayComponent = (componentName: string | undefined) => {
  if (!componentName || typeof componentName !== 'string') return null
  return componentMap[componentName] || null
}

const { t } = useI18n();

let ipcRenderer: typeof localIpcRenderer | null = null;
if (typeof window !== 'undefined') {
  if (window.electron?.ipcRenderer) {
    ipcRenderer = window.electron.ipcRenderer;
  } else {
    webMainCalls();
    ipcRenderer = localIpcRenderer;
  }
}

const activeTab = ref('eventbus');
const eventBusActiveTab = ref('eventbus');

// EventBus 表单
const eventBusForm = reactive({
  eventName: '',
  eventData: ''
});

// 广播表单
const broadcastForm = reactive({
  to: 'all',
  eventName: '',
  eventData: ''
});

// 测试表单
const testForm = reactive({
  module: '',
  testId: '',
  params: {} as Record<string, any>
});

const testExecuting = ref(false);
const modules = ref<string[]>([]);
const availableTests = ref<TestFunction[]>([]);
const selectedTest = ref<TestFunction | null>(null);
const availableWindowTypes = ref<string[]>([]);
const testHistory = ref<Array<{
  id: string;
  name: string;
  timestamp: number;
  params: any[];
  result?: any;
  error?: string;
}>>([]);

// 单元测试批量测试相关
const unitTestActiveTab = ref('single');
const unitTestBatchForm = reactive({
  selectedModules: [] as string[]
});

const unitTestBatchRunning = ref(false);
const unitTestBatchResults = ref<UnitTestResult[]>([]);
const unitTestBatchProgress = ref(0);
const unitTestBatchCurrentTest = ref('');
const unitTestBatchAbortController = ref<AbortController | null>(null);

// Agent Tool测试相关
const toolTestForm = reactive({
  toolId: '',
  paramsJson: '{}'
});

const toolTestExecuting = ref(false);
const availableTools = ref(agentToolManager.getAllTools());
const toolTestHistory = ref<Array<{
  toolId: string;
  toolName: string;
  timestamp: number;
  status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  params: any;
  result?: any;
  error?: string;
  outputs?: Array<{
    id: string;
    label: string;
    format: string;
    data: any;
    renderer?: string;
    invocationId?: string;
  }>;
  displayComponent?: string;
  toolConfig?: any;
  progress?: any;
  invocationId?: string;
}>>([]);

// 保存的配置相关
const STORAGE_KEY = 'agent-tool-test-configs';
interface SavedConfig {
  id: string;
  name: string;
  toolId: string;
  paramsJson: string;
  createdAt: number;
  updatedAt: number;
}

// 测试用例项类型
type TestCaseItem = {
  toolId: string;
  toolName: string;
  testCase: { name: string; params: Record<string, any> };
};

const savedConfigs = ref<SavedConfig[]>([]);
const selectedConfigId = ref<string>('');
const showSaveConfigDialog = ref(false);
const saveConfigName = ref('');

// 测试用例相关
const selectedTestCase = ref<string>('');
const testCaseIdInput = ref<string>('');
const availableTestCases = computed(() => {
  return testCases as Record<string, {
    description: string;
    testCases: Array<{
      id?: string;
      name: string;
      params: Record<string, any>;
    }>;
  }>;
});

// 自动测试相关
const autoTestForm = reactive({
  selectedTools: [] as string[]
});

const autoTestRunning = ref(false);
const autoTestResults = ref<TestResult[]>([]);
const autoTestProgress = ref(0);
const autoTestCurrentTest = ref('');
const autoTestAbortController = ref<AbortController | null>(null);

// 导入快照相关
const importSnapshotForm = reactive({
  snapshotContent: ''
});
const importSnapshotLoading = ref(false);
const importedSnapshot = ref<any>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// 更新测试相关
const updateTestForm = reactive({
  currentVersion: '0.13.4',
  mockUpdateVersion: '0.14.0',
  channel: 'release' as 'dev' | 'release',
  scenario: 'hasUpdate' as 'hasUpdate' | 'noUpdate' | 'error'
});

const updateTestChecking = ref(false);
const updateTestStatus = ref<any>(null);
const updateTestDownloading = ref(false);
const updateTestDownloaded = ref(false);
const updateTestDownloadProgress = ref(0);
const updateTestDownloadError = ref<string | null>(null);
const updateTestHistory = ref<Array<{
  action: string;
  timestamp: number;
  result?: any;
  error?: string;
}>>([]);

// 测试用例数据
const testCases = testCasesData as Record<string, {
  description: string;
  testCases: Array<{
    name: string;
    params: Record<string, any>;
  }>;
}>;

// 发送 EventBus 事件
const sendEventBusEvent = () => {
  if (!eventBusForm.eventName.trim()) {
    ElMessage.warning(t('setting.debug.eventNameRequired'));
    return;
  }

  try {
    let data: any = undefined;
    if (eventBusForm.eventData.trim()) {
      data = JSON.parse(eventBusForm.eventData);
    }
    eventBus.emit(eventBusForm.eventName, data);
    ElMessage.success(t('setting.debug.eventSent'));
  } catch (error) {
    ElMessage.error(t('setting.debug.invalidJson'));
  }
};

// 发送广播事件
const sendBroadcastEvent = () => {
  if (!broadcastForm.eventName.trim()) {
    ElMessage.warning(t('setting.debug.eventNameRequired'));
    return;
  }

  try {
    let data: any = {};
    if (broadcastForm.eventData.trim()) {
      data = JSON.parse(broadcastForm.eventData);
    }
    // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
    // 注意：这是调试工具，保留sendBroadcast调用以便测试，但实际会直接使用eventBus
    eventBus.emit(broadcastForm.eventName, data);
    ElMessage.success(t('setting.debug.broadcastSent'));
  } catch (error) {
    ElMessage.error(t('setting.debug.invalidJson'));
  }
};

// 处理模块变化
const handleModuleChange = () => {
  testForm.testId = '';
  testForm.params = {};
  selectedTest.value = null;
  if (testForm.module) {
    availableTests.value = testFramework.getTestsByModule(testForm.module);
  } else {
    availableTests.value = [];
  }
};

// 处理测试函数变化
const handleTestChange = () => {
  testForm.params = {};
  if (testForm.testId) {
    selectedTest.value = testFramework.getAllTests().find(t => t.id === testForm.testId) || null;
    if (selectedTest.value?.params) {
      selectedTest.value.params.forEach(param => {
        if (param.defaultValue !== undefined) {
          testForm.params[param.name] = param.defaultValue;
        }
      });
    }
  } else {
    selectedTest.value = null;
  }
};

// 执行测试
const executeTest = async () => {
  if (!testForm.testId) {
    ElMessage.warning(t('setting.debug.selectTestFunctionFirst'));
    return;
  }

  testExecuting.value = true;
  try {
    const test = testFramework.getAllTests().find(t => t.id === testForm.testId);
    if (!test) {
      throw new Error(t('setting.debug.testNotFound'));
    }

    // 解析参数
    let params: any[] = [];
    if (test.params && test.params.length > 0) {
      params = testFramework.parseParams(test.params, testForm.params);
    }

    const result = await testFramework.execute(testForm.testId, params);
    ElMessage.success(t('setting.debug.testExecuted'));
    refreshTestHistory();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ElMessage.error(`${t('setting.debug.testFailed')}: ${errorMessage}`);
    refreshTestHistory();
  } finally {
    testExecuting.value = false;
  }
};

// 刷新测试历史
const refreshTestHistory = () => {
  testHistory.value = testFramework.getHistory();
};

// 清空测试历史
const clearTestHistory = () => {
  testFramework.clearHistory();
  refreshTestHistory();
};

// 格式化时间
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// 格式化结果
const formatResult = (result: any) => {
  if (result === undefined || result === null) {
    return t('setting.debug.undefined');
  }
  if (typeof result === 'object') {
    return JSON.stringify(result, null, 2);
  }
  return String(result);
};

// 获取窗口类型标签
const getWindowTypeLabel = (windowType: string): string => {
  const labelMap: Record<string, string> = {
    'home': t('setting.debug.targetHome'),
    'ai-chat': t('setting.debug.targetAiChat'),
    'setting': t('setting.debug.targetSetting'),
    'fomula-recognition': t('setting.debug.targetFormulaRecognition'),
    'ai-graph': t('setting.debug.targetAiGraph')
  };
  return labelMap[windowType] || windowType;
};

// 获取所有窗口类型
const fetchWindowTypes = async () => {
  const logger = createRendererLogger('SettingDebugSection')
  if (!ipcRenderer) return;
  try {
    const windowTypes = await ipcRenderer.invoke('get-all-window-types') as string[];
    availableWindowTypes.value = windowTypes || ['home'];
  } catch (error) {
    logger.error('获取窗口类型失败:', error);
    // 如果获取失败，使用默认值
    availableWindowTypes.value = ['home', 'ai-chat'];
  }
};

// Agent Tool测试相关函数
// 获取每个entry的activePanels（用于控制折叠面板）
const getActivePanels = (entry: any): string[] => {
  if (!entry._activePanels) {
    entry._activePanels = entry.outputs?.map((o: any) => o.id) || []
  }
  return entry._activePanels
}

const getToolDisplayName = (config: any): string => {
  if (!config) return ''
  
  const name = config.name
  if (typeof name === 'string') {
    return name
  }
  
  if (typeof name === 'object' && name !== null) {
    // 使用agentToolManager的getLocalizedText方法
    return agentToolManager.getLocalizedText(name) || config.id
  }
  
  return config.id || ''
}

// 获取当前选中工具的instruction
// 测试界面主题样式
const testResultStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  borderColor: themeState.currentTheme.borderColor,
  color: themeState.currentTheme.textColor
}))

const testHistoryItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  borderColor: themeState.currentTheme.borderColor,
  color: themeState.currentTheme.textColor
}))

const testHistoryItemErrorStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.type === 'dark' ? 'rgba(245, 108, 108, 0.15)' : '#fef0f0',
  borderColor: '#f56c6c',
  color: themeState.currentTheme.textColor
}))

const testPanelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const codeBlockStyle = computed(() => {
  const theme = themeState.currentTheme as any
  return {
    backgroundColor: theme.codeBgColor || themeState.currentTheme.background2nd,
    color: themeState.currentTheme.codeColor || themeState.currentTheme.textColor,
    borderColor: themeState.currentTheme.borderColor
  }
})

const codeBgColor = computed(() => {
  const theme = themeState.currentTheme as any
  return theme.codeBgColor || themeState.currentTheme.background2nd
})

const testEmptyStyle = computed(() => ({
  color: themeState.currentTheme.textColor2
}))

const currentToolInstruction = computed(() => {
  if (!toolTestForm.toolId) {
    return '';
  }
  const tool = agentToolManager.getTool(toolTestForm.toolId);
  if (tool && tool.config.instruction) {
    const instruction = tool.config.instruction;
    if (typeof instruction === 'string') {
      return instruction;
    }
    if (typeof instruction === 'object' && instruction !== null) {
      return getLocalizedInstruction(instruction);
    }
  }
  return '该工具没有提供详细说明';
});

const clearToolTestHistory = () => {
  toolTestHistory.value = [];
};

// 保存配置相关函数
const loadSavedConfigs = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      savedConfigs.value = JSON.parse(stored);
    }
  } catch (error) {
    const logger = createRendererLogger('SettingDebugSection')
    logger.error('加载保存的配置失败:', error);
    savedConfigs.value = [];
  }
};

const saveSavedConfigs = () => {
  const logger = createRendererLogger('SettingDebugSection')
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedConfigs.value));
  } catch (error) {
    logger.error('保存配置失败:', error);
    ElMessage.error('保存配置失败');
  }
};

const loadSavedConfig = (configId: string) => {
  if (!configId) return;
  const config = savedConfigs.value.find(c => c.id === configId);
  if (config) {
    toolTestForm.toolId = config.toolId;
    toolTestForm.paramsJson = config.paramsJson;
    ElMessage.success('配置已加载');
  }
};

const saveCurrentConfig = async () => {
  if (!toolTestForm.toolId) {
    ElMessage.warning('请先选择Tool');
    return;
  }

  if (!saveConfigName.value.trim()) {
    ElMessage.warning('请输入配置名称');
    return;
  }

  // 验证JSON格式
  try {
    JSON.parse(toolTestForm.paramsJson || '{}');
  } catch {
    ElMessage.error('参数JSON格式错误');
    return;
  }

  // 检查是否已存在同名配置（且不是当前选中的配置）
  const existingConfig = savedConfigs.value.find(
    c => c.name === saveConfigName.value.trim() && c.id !== selectedConfigId.value
  );
  if (existingConfig) {
    try {
      await ElMessageBox.confirm(
        `配置名称"${saveConfigName.value.trim()}"已存在，是否覆盖？`,
        '确认覆盖',
        {
          confirmButtonText: '覆盖',
          cancelButtonText: '取消',
          type: 'warning'
        }
      );
      // 用户确认覆盖，删除旧配置
      savedConfigs.value = savedConfigs.value.filter(c => c.id !== existingConfig.id);
    } catch {
      // 用户取消
      return;
    }
  }

  const config: SavedConfig = {
    id: selectedConfigId.value || `config_${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: saveConfigName.value.trim(),
    toolId: toolTestForm.toolId,
    paramsJson: toolTestForm.paramsJson,
    createdAt: selectedConfigId.value
      ? (savedConfigs.value.find(c => c.id === selectedConfigId.value)?.createdAt || Date.now())
      : Date.now(),
    updatedAt: Date.now()
  };

  if (selectedConfigId.value) {
    // 更新现有配置
    const index = savedConfigs.value.findIndex(c => c.id === selectedConfigId.value);
    if (index !== -1) {
      savedConfigs.value[index] = config;
      ElMessage.success('配置已更新');
    } else {
      // 如果找不到，作为新配置添加
      savedConfigs.value.push(config);
      ElMessage.success('配置已保存');
    }
  } else {
    // 添加新配置
    savedConfigs.value.push(config);
    ElMessage.success('配置已保存');
  }

  saveSavedConfigs();
  showSaveConfigDialog.value = false;
  saveConfigName.value = '';
  // 保存后不自动选中，让用户可以选择是否加载
  // selectedConfigId.value = config.id;
};

const deleteSavedConfig = async () => {
  if (!selectedConfigId.value) return;

  try {
    await ElMessageBox.confirm(
      '确定要删除这个配置吗？',
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    savedConfigs.value = savedConfigs.value.filter(c => c.id !== selectedConfigId.value);
    saveSavedConfigs();
    selectedConfigId.value = '';
    toolTestForm.toolId = '';
    toolTestForm.paramsJson = '{}';
    ElMessage.success('配置已删除');
  } catch {
    // 用户取消
  }
};

const handleToolChange = () => {
  // 切换Tool时，如果有保存的配置，尝试加载第一个匹配的配置
  if (toolTestForm.toolId) {
    const matchingConfig = savedConfigs.value.find(c => c.toolId === toolTestForm.toolId);
    if (matchingConfig) {
      selectedConfigId.value = matchingConfig.id;
      toolTestForm.paramsJson = matchingConfig.paramsJson;
    } else {
      toolTestForm.paramsJson = '{}';
      selectedConfigId.value = '';
    }
  }
  // 清空测试用例选择
  selectedTestCase.value = '';
};

// 通过ID加载测试用例
const loadTestCaseById = () => {
  if (!testCaseIdInput.value.trim()) {
    ElMessage.warning('请输入测试用例ID');
    return;
  }
  
  const testCaseId = testCaseIdInput.value.trim();
  
  // 遍历所有工具的测试用例，查找匹配的ID
  for (const [toolId, toolTestCases] of Object.entries(availableTestCases.value)) {
    const testCase = toolTestCases.testCases.find(tc => tc.id === testCaseId);
    if (testCase) {
      // 设置Tool ID
      toolTestForm.toolId = toolId;
      
      // 设置参数JSON
      toolTestForm.paramsJson = JSON.stringify(testCase.params, null, 2);
      
      // 更新选择框
      selectedTestCase.value = `${toolId}::${testCase.name}`;
      
      // 清空保存的配置选择
      selectedConfigId.value = '';
      
      ElMessage.success(`测试用例已加载: ${testCase.name}`);
      return;
    }
  }
  
  ElMessage.warning(`找不到ID为 "${testCaseId}" 的测试用例`);
};

// 加载测试用例
const loadTestCase = (testCaseValue: string) => {
  if (!testCaseValue) {
    return;
  }
  
  const [toolId, testCaseName] = testCaseValue.split('::');
  if (!toolId || !testCaseName) {
    return;
  }
  
  const toolTestCases = availableTestCases.value[toolId];
  if (!toolTestCases) {
    ElMessage.warning('找不到该工具的测试用例');
    return;
  }
  
  const testCase = toolTestCases.testCases.find(tc => tc.name === testCaseName);
  if (!testCase) {
    ElMessage.warning('找不到该测试用例');
    return;
  }
  
  // 设置Tool ID
  toolTestForm.toolId = toolId;
  
  // 设置参数JSON
  toolTestForm.paramsJson = JSON.stringify(testCase.params, null, 2);
  
  // 更新ID输入框（如果有id）
  if (testCase.id) {
    testCaseIdInput.value = testCase.id;
  }
  
  // 清空保存的配置选择
  selectedConfigId.value = '';
  
  ElMessage.success('测试用例已加载');
};

const handleSaveConfigClick = () => {
  if (!toolTestForm.toolId) {
    ElMessage.warning('请先选择Tool');
    return;
  }
  
  // 重置对话框状态
  saveConfigName.value = '';
  selectedConfigId.value = ''; // 清空选中，表示新建配置
  
  // 使用Tool名称和时间戳作为默认配置名称
  const tool = agentToolManager.getTool(toolTestForm.toolId);
  if (tool) {
    const toolName = getToolDisplayName(tool.config);
    const timestamp = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    saveConfigName.value = `${toolName}_${timestamp}`;
  } else {
    saveConfigName.value = '';
  }
  
  showSaveConfigDialog.value = true;
};

// 编辑配置（更新现有配置）
const handleEditConfigClick = () => {
  if (!selectedConfigId.value) {
    ElMessage.warning('请先选择一个配置');
    return;
  }
  
  const config = savedConfigs.value.find(c => c.id === selectedConfigId.value);
  if (config) {
    saveConfigName.value = config.name;
    showSaveConfigDialog.value = true;
  }
};


const executeToolTest = async () => {
  if (!toolTestForm.toolId) {
    ElMessage.warning('请先选择Tool');
    return;
  }

  toolTestExecuting.value = true;
  try {
    // 解析参数
    let params: Record<string, any> = {};
    try {
      params = JSON.parse(toolTestForm.paramsJson || '{}');
    } catch (error) {
      ElMessage.error('参数JSON格式错误');
      return;
    }

    const tool = agentToolManager.getTool(toolTestForm.toolId);
    if (!tool) {
      throw new Error('Tool不存在');
    }

    // 创建当前执行项，实时更新
    let invocationId: string | undefined = undefined;
    const entryTimestamp = Date.now();
    
    const currentEntry: {
      toolId: string;
      toolName: string;
      timestamp: number;
      status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
      params: any;
      result?: any;
      error?: string;
      outputs?: Array<{
        id: string;
        label: string;
        format: string;
        data: any;
        renderer?: string;
        invocationId?: string;
      }>;
      displayComponent?: string;
      toolConfig?: any;
      progress?: any;
      invocationId?: string;
    } = {
      toolId: toolTestForm.toolId,
      toolName: getToolDisplayName(tool.config),
      timestamp: entryTimestamp,
      status: 'running',
      params: JSON.stringify(params, null, 2),
      outputs: [],
      progress: undefined,
      displayComponent: extractComponentName(tool.config.displayComponent),
      error: undefined,
      invocationId: undefined,
      toolConfig: tool.config
    };

    // 立即添加到历史记录，以便实时显示
    toolTestHistory.value.unshift(currentEntry);
    
    // 辅助函数：通过 toolId 和 timestamp 查找 entry（更可靠的方式）
    const findEntryByToolIdAndTimestamp = () => {
      return toolTestHistory.value.findIndex(entry => 
        entry.toolId === toolTestForm.toolId && entry.timestamp === entryTimestamp
      )
    }
    
    // 监听tool invocation开始事件，获取invocationId
    const handleInvocationStarted = (eventData: unknown) => {
      const logger = createRendererLogger('SettingDebugSection');
      const data = eventData as { invocationId: string; toolId: string; params: any };
      logger.debug(`[SettingDebugSection] 收到 tool-invocation-started 事件:`, data)
      if (data.toolId === toolTestForm.toolId) {
        invocationId = data.invocationId;
        logger.debug(`[SettingDebugSection] 设置 invocationId: ${invocationId}`)
        
        // 使用更可靠的方式查找 entry：通过 toolId 和 timestamp
        let index = findEntryByToolIdAndTimestamp();
        if (index === -1) {
          // 如果找不到，尝试通过引用查找（后备方案）
          index = toolTestHistory.value.findIndex(entry => entry === currentEntry);
        }
        
        logger.debug(`[SettingDebugSection] 找到 entry 的 index: ${index}`)
        if (index !== -1) {
          // 使用 Vue 的响应式更新方式设置 invocationId
          const oldEntry = toolTestHistory.value[index]
          toolTestHistory.value.splice(index, 1, {
            ...oldEntry,
            invocationId: invocationId
          })
          logger.debug(`[SettingDebugSection] 更新 entry[${index}].invocationId = ${invocationId}`)
          logger.debug(`[SettingDebugSection] 验证更新后的 entry.invocationId:`, toolTestHistory.value[index].invocationId)
        } else {
          console.warn(`[SettingDebugSection] 找不到 entry，无法设置 invocationId。所有 entry:`, toolTestHistory.value.map((e, i) => ({ index: i, toolId: e.toolId, timestamp: e.timestamp })))
        }
        
        // 设置eventBus监听器，实时更新Display组件
        const updateUnsub = onToolUpdate(invocationId, (updateData) => {
          const entryIndex = toolTestHistory.value.findIndex(entry => entry.invocationId === invocationId);
          if (entryIndex !== -1) {
            const toolCallbackData = updateData.data as any;
            const outputId = `output-${Date.now()}-${Math.random()}`;
            
            const outputData = toolCallbackData.content !== undefined 
              ? toolCallbackData
              : toolCallbackData;
            
            const existingOutputs = toolTestHistory.value[entryIndex].outputs || [];
            const newOutput = {
              id: outputId,
              label: `输出 ${existingOutputs.length + 1}`,
              format: toolCallbackData.format || 'json',
              data: outputData,
              renderer: toolCallbackData.componentName,
              invocationId: invocationId
            };
            
            // 更新outputs
            const updatedOutputs = [...existingOutputs];
            updatedOutputs.push(newOutput);
            
            // 更新entry - 使用 Vue 的响应式更新方式
            const oldEntry = toolTestHistory.value[entryIndex]
            toolTestHistory.value.splice(entryIndex, 1, {
              ...oldEntry,
              outputs: updatedOutputs,
              progress: updateData.progress
            })
          }
        });
        
        const completeUnsub = onToolComplete(invocationId, (completeData) => {
          logger.debug(`[SettingDebugSection] 收到 tool-complete 事件，准备更新 entry，invocationId: ${invocationId}`, completeData)
          // 调试：打印所有 entry 的 invocationId
          logger.debug(`[SettingDebugSection] 所有 entry 的 invocationId:`, toolTestHistory.value.map((e, i) => ({ index: i, invocationId: e.invocationId, toolId: e.toolId, status: e.status })))
          
          // 先尝试通过 invocationId 查找
          let entryIndex = toolTestHistory.value.findIndex(entry => entry.invocationId === invocationId);
          
          // 如果找不到，尝试通过 toolId 和 timestamp 查找（作为后备方案）
          if (entryIndex === -1) {
            console.warn(`[SettingDebugSection] 通过 invocationId 找不到 entry，尝试通过 toolId 和 timestamp 查找`)
            entryIndex = findEntryByToolIdAndTimestamp();
            if (entryIndex === -1) {
              // 如果还是找不到，尝试通过引用查找
              entryIndex = toolTestHistory.value.findIndex(entry => entry === currentEntry);
            }
            if (entryIndex !== -1) {
              // 如果找到了，更新它的 invocationId
              const oldEntry = toolTestHistory.value[entryIndex]
              toolTestHistory.value.splice(entryIndex, 1, {
                ...oldEntry,
                invocationId: invocationId
              })
              logger.debug(`[SettingDebugSection] 通过后备方案找到 entry[${entryIndex}]，已更新 invocationId`)
            }
          }
          
          logger.debug(`[SettingDebugSection] 找到 entryIndex: ${entryIndex}`)
          if (entryIndex !== -1) {
            const oldEntry = toolTestHistory.value[entryIndex]
            logger.debug(`[SettingDebugSection] 更新前 entry.status: ${oldEntry.status}`)
            // 使用 Vue 的响应式更新方式
            toolTestHistory.value.splice(entryIndex, 1, {
              ...oldEntry,
              status: completeData.status as any,
              progress: completeData.progress,
              error: completeData.error
            })
            const newEntry = toolTestHistory.value[entryIndex]
            logger.debug(`[SettingDebugSection] 更新后 entry.status: ${newEntry.status}`)
            
            // 如果有最终数据，添加到outputs
            if (completeData.data) {
              const toolCallbackData = completeData.data as any;
              const outputId = `output-${Date.now()}-${Math.random()}`;
              
              const outputData = toolCallbackData.content !== undefined 
                ? toolCallbackData
                : toolCallbackData;
              
              const finalOutput = {
                id: outputId,
                label: '最终结果',
                format: toolCallbackData.format || 'json',
                data: outputData,
                renderer: toolCallbackData.componentName,
                invocationId: invocationId
              };
              
              const existingOutputs = toolTestHistory.value[entryIndex].outputs || [];
              const updatedOutputs = [...existingOutputs];
              updatedOutputs.push(finalOutput);
              
              // 使用 Vue 的响应式更新方式
              const oldEntry = toolTestHistory.value[entryIndex]
              toolTestHistory.value.splice(entryIndex, 1, {
                ...oldEntry,
                outputs: updatedOutputs
              })
            }
          }
          
          // 清理监听器
          updateUnsub();
          completeUnsub();
          eventBus.off('tool-invocation-started', handleInvocationStarted as any);
        });
        
        const failedUnsub = onToolFailed(invocationId, (errorData) => {
          logger.debug(`[SettingDebugSection] 收到 tool-failed 事件，准备更新 entry，invocationId: ${invocationId}`, errorData)
          const entryIndex = toolTestHistory.value.findIndex(entry => entry.invocationId === invocationId);
          if (entryIndex !== -1) {
            const oldEntry = toolTestHistory.value[entryIndex]
            toolTestHistory.value.splice(entryIndex, 1, {
              ...oldEntry,
              status: 'failed' as any,
              error: errorData.error
            })
          }
          
          // 清理监听器
          updateUnsub();
          failedUnsub();
          eventBus.off('tool-invocation-started', handleInvocationStarted as any);
        });
      }
    };
    
    eventBus.on('tool-invocation-started', handleInvocationStarted as any);

    // 执行Tool
    let collectedOutputs: Array<{
      id: string;
      label: string;
      format: string;
      data: any;
      renderer?: string;
    }> = [];

    const result = await agentToolManager.invokeTool(
      toolTestForm.toolId,
      params,
      (status, data, progress) => {
        // 收集中间输出
        // data是ToolCallbackData类型，包含content、format、componentName
        if (data) {
          const toolCallbackData = data as any;
          const outputId = `output-${Date.now()}-${Math.random()}`;
          
          // 创建输出项
          // 如果toolCallbackData有content字段，保留整个结构以便Display组件能正确解析
          // 否则直接使用toolCallbackData
          const outputData = toolCallbackData.content !== undefined 
            ? toolCallbackData  // 保留完整结构，Display组件会提取content
            : toolCallbackData; // 直接使用数据
          
          const newOutput = {
            id: outputId,
            label: `输出 ${collectedOutputs.length + 1}`,
            format: toolCallbackData.format || 'json',
            data: outputData,
            renderer: toolCallbackData.componentName
          };

          collectedOutputs.push(newOutput);
        }

        // 实时更新当前项 - 使用Vue的响应式更新
        // 优先通过 invocationId 查找，如果找不到则通过 toolId 和 timestamp 查找
        let index = invocationId 
          ? toolTestHistory.value.findIndex(entry => entry.invocationId === invocationId)
          : -1;
        
        if (index === -1) {
          index = findEntryByToolIdAndTimestamp();
        }
        
        if (index === -1) {
          index = toolTestHistory.value.findIndex(entry => entry === currentEntry);
        }
        
        if (index !== -1) {
          // 创建新对象确保响应式更新
          const oldEntry = toolTestHistory.value[index]
          const updatedEntry = {
            ...oldEntry,
            outputs: [...collectedOutputs], // 总是使用最新的collectedOutputs
            status: status as any,
            progress: progress
          };
          // 使用Vue的响应式更新 - 使用 splice 替换数组项
          toolTestHistory.value.splice(index, 1, updatedEntry);
          // 同步更新currentEntry引用
          Object.assign(currentEntry, updatedEntry);
        } else {
          console.warn(`[SettingDebugSection] onStatusUpdate: 找不到 entry 进行更新，invocationId: ${invocationId}`)
        }
        
        // 可以在这里更新UI显示进度
        const logger = createRendererLogger('SettingDebugSection')
        logger.debug('Tool状态更新:', status, data, progress);
      }
    );

    // 去重：只保留最后一个有renderer的输出
    // 优先保留stage为'completed'的输出，如果没有则保留最后一个有renderer的输出
    let finalOutputs = collectedOutputs;
    
    if (collectedOutputs.length > 0) {
      // 先尝试找completed状态的输出
      const completedOutput = collectedOutputs.find((output: any) => 
        output.data?.content?.stage === 'completed' || output.data?.stage === 'completed'
      );
      
      if (completedOutput) {
        // 只保留completed的输出
        finalOutputs = [completedOutput];
      } else {
        // 如果没有completed，只保留最后一个有renderer的输出
        const outputsWithRenderer = collectedOutputs.filter((output: any) => output.renderer);
        if (outputsWithRenderer.length > 0) {
          finalOutputs = [outputsWithRenderer[outputsWithRenderer.length - 1]];
        } else {
          // 如果都没有renderer，只保留最后一个输出
          finalOutputs = [collectedOutputs[collectedOutputs.length - 1]];
        }
      }
    }
    const logger = createRendererLogger('SettingDebugSection')
    // 更新当前项为最终状态（而不是创建新项）
    // 优先通过 invocationId 查找，如果找不到则通过 toolId 和 timestamp 查找
    let finalIndex = invocationId 
      ? toolTestHistory.value.findIndex(entry => entry.invocationId === invocationId)
      : -1;
    
    if (finalIndex === -1) {
      finalIndex = findEntryByToolIdAndTimestamp();
    }
    
    if (finalIndex === -1) {
      finalIndex = toolTestHistory.value.findIndex(entry => entry === currentEntry);
    }
    
    if (finalIndex !== -1) {
      const oldEntry = toolTestHistory.value[finalIndex]
      // 使用 Vue 的响应式更新方式
      toolTestHistory.value.splice(finalIndex, 1, {
        ...oldEntry,
        status: result.status,
        result: result.result || result.data,
        error: result.error,
        outputs: finalOutputs.length > 0 ? finalOutputs : (result as any).outputs,
        progress: undefined, // 完成后清除进度
        toolConfig: tool.config,
        invocationId: invocationId || oldEntry.invocationId // 确保 invocationId 被设置
      });
      const updatedEntry = toolTestHistory.value[finalIndex]
      
      logger.debug(`[SettingDebugSection] 最终更新 entry[${finalIndex}].status = ${updatedEntry.status}`)
    } else {
      console.warn(`[SettingDebugSection] 无法找到 entry 进行最终更新，invocationId: ${invocationId}`)
      // 如果找不到，至少尝试通过 toolId 和 timestamp 查找并更新
      let fallbackIndex = findEntryByToolIdAndTimestamp();
      if (fallbackIndex === -1) {
        fallbackIndex = toolTestHistory.value.findIndex(entry => entry === currentEntry);
      }
      if (fallbackIndex !== -1) {
        const oldEntry = toolTestHistory.value[fallbackIndex]
        toolTestHistory.value.splice(fallbackIndex, 1, {
          ...oldEntry,
          status: result.status,
          result: result.result || result.data,
          error: result.error,
          outputs: finalOutputs.length > 0 ? finalOutputs : (result as any).outputs,
          progress: undefined,
          toolConfig: tool.config,
          invocationId: invocationId || oldEntry.invocationId
        });
        logger.debug(`[SettingDebugSection] 通过 fallback 更新 entry[${fallbackIndex}].status = ${result.status}`)
      }
    }

    if (result.status === 'succeeded') {
      ElMessage.success('Tool执行成功');
    } else {
      ElMessage.error(`Tool执行失败: ${result.error || '未知错误'}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ElMessage.error(`Tool执行失败: ${errorMessage}`);
    
    const tool = agentToolManager.getTool(toolTestForm.toolId);
    if (tool) {
      toolTestHistory.value.unshift({
        toolId: toolTestForm.toolId,
        toolName: getToolDisplayName(tool.config),
        timestamp: Date.now(),
        params: JSON.parse(toolTestForm.paramsJson || '{}'),
        error: errorMessage
      });
    }
  } finally {
    toolTestExecuting.value = false;
  }
};

// 计算自动测试摘要
const autoTestSummary = computed(() => {
  const total = autoTestResults.value.length;
  const passed = autoTestResults.value.filter(r => r.passed).length;
  const failed = total - passed;
  const passedRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const failedRate = total > 0 ? Math.round((failed / total) * 100) : 0;
  
  // 计算总执行时间
  const duration = autoTestResults.value.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  return {
    total,
    passed,
    failed,
    passedRate,
    failedRate,
    duration
  };
});

// 生成Markdown摘要
const autoTestMarkdown = computed(() => {
  const summary = autoTestSummary.value;
  const timestamp = new Date().toISOString();
  
  let markdown = `# Agent Tool 自动测试报告\n\n`;
  markdown += `**测试时间**: ${timestamp}\n\n`;
  markdown += `## 测试摘要\n\n`;
  markdown += `- **总测试数**: ${summary.total}\n`;
  markdown += `- **通过**: ${summary.passed} (${summary.passedRate}%)\n`;
  markdown += `- **失败**: ${summary.failed} (${summary.failedRate}%)\n`;
  markdown += `- **总执行时间**: ${summary.duration}ms\n\n`;
  
  // 按Tool分组
  const groupedByTool = autoTestResults.value.reduce((acc, result) => {
    if (!acc[result.toolId]) {
      acc[result.toolId] = [];
    }
    acc[result.toolId].push(result);
    return acc;
  }, {} as Record<string, TestResult[]>);
  
  markdown += `## 详细结果\n\n`;
  
  for (const [toolId, results] of Object.entries(groupedByTool)) {
    const toolName = results[0]?.toolName || toolId;
    const toolPassed = results.filter(r => r.passed).length;
    const toolFailed = results.length - toolPassed;
    
    markdown += `### ${toolName}\n\n`;
    markdown += `- 测试用例数: ${results.length}\n`;
    markdown += `- 通过: ${toolPassed}\n`;
    markdown += `- 失败: ${toolFailed}\n\n`;
    
    // 失败的测试用例
    const failedTests = results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      markdown += `#### 失败的测试用例\n\n`;
      for (const test of failedTests) {
        markdown += `**${test.testCaseName}**\n\n`;
        markdown += `- 参数:\n\`\`\`json\n${JSON.stringify(test.params, null, 2)}\n\`\`\`\n\n`;
        if (test.error) {
          markdown += `- 错误信息:\n\`\`\`\n${test.error}\n\`\`\`\n\n`;
        }
      }
    }
    
    // 通过的测试用例
    const passedTests = results.filter(r => r.passed);
    if (passedTests.length > 0) {
      markdown += `#### 通过的测试用例\n\n`;
      for (const test of passedTests) {
        markdown += `- ✅ ${test.testCaseName}\n`;
      }
      markdown += `\n`;
    }
  }
  
  // 错误总结（供AI修复使用）
  const allFailedTests = autoTestResults.value.filter(r => !r.passed);
  if (allFailedTests.length > 0) {
    markdown += `## 错误总结（供AI修复参考）\n\n`;
    for (const test of allFailedTests) {
      markdown += `### ${test.toolName} - ${test.testCaseName}\n\n`;
      markdown += `**参数**:\n\`\`\`json\n${JSON.stringify(test.params, null, 2)}\n\`\`\`\n\n`;
      markdown += `**错误信息**:\n\`\`\`\n${test.error || '未知错误'}\n\`\`\`\n\n`;
      if (test.result) {
        markdown += `**执行结果**:\n\`\`\`json\n${JSON.stringify(test.result, null, 2)}\n\`\`\`\n\n`;
      }
      markdown += `---\n\n`;
    }
  }
  
  return markdown;
});

// 并发执行测试用例（使用并发池）
const runTestWithConcurrency = async function(
  testCases: TestCaseItem[],
  concurrency: number = 5
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let completedCount = 0;
  const totalTests = testCases.length;
  let currentIndex = 0;
  
  // 更新进度
  const updateProgress = () => {
    completedCount++;
    autoTestProgress.value = Math.round((completedCount / totalTests) * 100);
    
    // 更新当前测试信息（显示正在执行的测试）
    const runningTests = totalTests - completedCount;
    if (runningTests > 0) {
      autoTestCurrentTest.value = `已完成 ${completedCount}/${totalTests}，剩余 ${runningTests} 个测试用例...`;
    } else {
      autoTestCurrentTest.value = '测试完成';
    }
  };
  
  // 处理测试用例参数中的占位符
  const processTestParams = (params: Record<string, any>): Record<string, any> => {
    const processed = JSON.parse(JSON.stringify(params)); // 深拷贝
    
    // 获取测试数据目录路径
    // 在 Electron 环境中，路径会在主进程中解析
    // 这里使用相对路径，基于项目结构: meta-doc/src/renderer/src/utils/agent-tools/test-data
    const getTestDataDir = (): string => {
      try {
        // 尝试获取当前工作目录（在 Electron 中可用）
        if (typeof process !== 'undefined' && process.cwd) {
          const cwd = process.cwd();
          // cwd 可能是 D:/MetaDoc/MetaDoc 或 D:/MetaDoc/MetaDoc/meta-doc
          // 需要找到 meta-doc 目录
          const normalizedCwd = cwd.replace(/\\/g, '/');
          const hasMetaDoc = normalizedCwd.includes('/meta-doc/') || normalizedCwd.endsWith('/meta-doc');
          
          if (hasMetaDoc) {
            // 如果 cwd 中已经包含 meta-doc，构建路径时不要重复
            // 找到 meta-doc 的位置
            const metaDocIndex = normalizedCwd.indexOf('/meta-doc/');
            if (metaDocIndex !== -1) {
              const basePath = normalizedCwd.substring(0, metaDocIndex + '/meta-doc'.length);
              return `${basePath}/src/renderer/src/utils/agent-tools/test-data`;
            } else if (normalizedCwd.endsWith('/meta-doc')) {
              return `${normalizedCwd}/src/renderer/src/utils/agent-tools/test-data`;
            }
          }
          // 如果 cwd 中不包含 meta-doc，需要添加
          return `${cwd}/meta-doc/src/renderer/src/utils/agent-tools/test-data`;
        }
        // 非 Node.js 环境，使用相对路径（工具会在主进程中解析）
        return './meta-doc/src/renderer/src/utils/agent-tools/test-data';
      } catch {
        // 如果无法获取，使用相对路径
        return './src/renderer/src/utils/agent-tools/test-data';
      }
    };
    
    // 递归处理对象中的所有字符串值
    const replacePlaceholders = (obj: any): any => {
      if (typeof obj === 'string' && obj.includes('__TEST_DATA_DIR__')) {
        // 替换测试数据目录占位符
        const testDataDir = getTestDataDir();
        return obj.replace(/__TEST_DATA_DIR__/g, testDataDir);
      } else if (Array.isArray(obj)) {
        return obj.map(item => replacePlaceholders(item));
      } else if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const key in obj) {
          result[key] = replacePlaceholders(obj[key]);
        }
        return result;
      }
      return obj;
    };
    
    return replacePlaceholders(processed);
  };

  // 执行单个测试用例
  const executeSingleTest = async (testItem: {
    toolId: string;
    toolName: string;
    testCase: { id?: string; name: string; params: Record<string, any> };
  }): Promise<TestResult> => {
    if (autoTestAbortController.value?.signal.aborted) {
      throw new Error('测试已取消');
    }
    
    const { toolId, toolName, testCase } = testItem;
    const startTime = Date.now();
    
    // 处理测试参数中的占位符
    const processedParams = processTestParams(testCase.params);
    
    let testResult: TestResult = {
      toolId,
      toolName,
      testCaseName: testCase.name,
      testCaseId: testCase.id,
      params: processedParams,
      passed: false,
      duration: 0
    };
    
    // 监听tool-invocation-started事件，获取invocationId
    // 需要匹配toolId和params，避免并发执行时错配
    let invocationId: string | undefined = undefined;
    const handleInvocationStarted = (eventData: unknown) => {
      // 如果已经找到匹配的invocationId，不再处理后续事件
      if (invocationId) {
        return;
      }
      
      const data = eventData as { invocationId: string; toolId: string; params: any };
      // 首先检查toolId是否匹配
      if (data.toolId !== toolId) {
        return;
      }
      
      // 然后检查params是否匹配（避免并发执行时错配）
      // 对于不同工具，检查关键参数字段
      let paramsMatch = false;
      if (toolId === 'rag-retrieval') {
        // RAG工具：检查question字段
        paramsMatch = data.params?.question === processedParams.question;
      } else if (toolId === 'chart-generation') {
        // 图表生成工具：检查prompt字段
        paramsMatch = data.params?.prompt === processedParams.prompt;
      } else if (toolId === 'grep') {
        // Grep工具：检查pattern字段
        paramsMatch = data.params?.pattern === processedParams.pattern;
      } else if (toolId === 'diff') {
        // Diff工具：检查text1和text2字段
        paramsMatch = data.params?.text1 === processedParams.text1 && 
                     data.params?.text2 === processedParams.text2;
      } else if (toolId === 'edit') {
        // Edit工具：检查operations字段（通过JSON字符串比较）
        paramsMatch = JSON.stringify(data.params?.operations || data.params?.operation) === 
                     JSON.stringify(processedParams.operations || processedParams.operation);
      } else if (toolId === 'metadata') {
        // Metadata工具：检查operation和field字段
        paramsMatch = data.params?.operation === processedParams.operation &&
                     data.params?.field === processedParams.field;
      } else if (toolId === 'outline-optimize') {
        // Outline优化工具：检查operation和nodePath字段
        paramsMatch = data.params?.operation === processedParams.operation &&
                     data.params?.nodePath === processedParams.nodePath;
      } else if (toolId === 'proofread') {
        // Proofread工具：检查text字段
        paramsMatch = data.params?.text === processedParams.text;
      } else if (toolId === 'data-analysis') {
        // 数据分析工具：检查dataSource和data字段
        paramsMatch = data.params?.dataSource === processedParams.dataSource &&
                     (data.params?.data === processedParams.data || 
                      JSON.stringify(data.params?.data) === JSON.stringify(processedParams.data));
      } else if (toolId === 'color-processing') {
        // 颜色处理工具：检查operation和color字段
        paramsMatch = data.params?.operation === processedParams.operation &&
                     data.params?.color === processedParams.color;
      } else {
        // 对于其他工具，使用深度比较（但只比较第一层，避免性能问题）
        // 如果params是简单对象，直接比较
        try {
          paramsMatch = JSON.stringify(data.params) === JSON.stringify(processedParams);
        } catch {
          // 如果JSON序列化失败，回退到只检查toolId（但这种情况应该很少）
          paramsMatch = false;
        }
      }
      
      if (paramsMatch) {
        invocationId = data.invocationId;
        testResult.invocationId = invocationId;
      }
    };
    eventBus.on('tool-invocation-started', handleInvocationStarted);
    
    // 如果是终端执行工具，设置自动批准
    let autoApproveHandler: ((data: any) => void) | null = null;
    let approvalTimeout: ReturnType<typeof setTimeout> | null = null;
    if (toolId === 'terminal-execution') {
      const command = processedParams.command as string;
      if (command) {
        // 监听工具调用开始事件，然后自动发送批准事件
        autoApproveHandler = (data: { toolId: string; params: any; invocationId?: string }) => {
          if (data.toolId === 'terminal-execution' && data.params?.command === command) {
            // 延迟一小段时间，确保工具已经进入等待批准状态
            // 工具会先发送 waiting_approval 状态，然后等待批准
            approvalTimeout = setTimeout(() => {
              // 发送自动批准事件
              eventBus.emit('terminal-command-approved', {
                command: command,
                trustMode: false // 测试中不启用信任模式，只批准当前命令
              });
            }, 500); // 增加延迟，确保工具已经进入等待批准状态
          }
        };
        eventBus.on('tool-invocation-started', autoApproveHandler);
      }
    }
    
    try {
      const result = await agentToolManager.invokeTool(
        toolId,
        processedParams
      );
      
      // 确保invocationId被设置
      if (invocationId) {
        testResult.invocationId = invocationId;
      }
      
      const duration = Date.now() - startTime;
      testResult.duration = duration;
      
      // 断言：判断状态是否为成功
      if (result.status === 'succeeded') {
        // 对于终端执行工具，需要额外检查执行结果
        if (toolId === 'terminal-execution' && result.result) {
          const terminalResult = result.result as {
            exitCode?: number;
            stdout?: string;
            stderr?: string;
            command?: string;
          };
          
          const exitCode = terminalResult.exitCode ?? 0;
          const stdout = terminalResult.stdout || '';
          const stderr = terminalResult.stderr || '';
          
          // 如果只有stderr，没有stdout，且返回码不为0，则认为失败
          if (exitCode !== 0 && stderr && !stdout) {
            testResult.passed = false;
            testResult.error = `命令执行失败: 退出码 ${exitCode}, 错误输出: ${stderr.substring(0, 200)}${stderr.length > 200 ? '...' : ''}`;
            testResult.result = result.result;
          } else if (exitCode !== 0) {
            // 返回码不为0，也认为失败
            testResult.passed = false;
            testResult.error = `命令执行失败: 退出码 ${exitCode}${stderr ? `, 错误: ${stderr.substring(0, 200)}${stderr.length > 200 ? '...' : ''}` : ''}`;
            testResult.result = result.result;
          } else {
            // 返回码为0，认为成功
            testResult.passed = true;
            testResult.result = result.result;
          }
        } else {
          // 其他工具，直接使用status判断
          testResult.passed = true;
          // 优先使用result.data（ToolCallbackData格式），如果没有则使用result.result
          testResult.result = result.data || result.result;
        }
      } else {
        testResult.passed = false;
        testResult.error = result.error || `Tool返回状态: ${result.status}`;
        // 优先使用result.data（ToolCallbackData格式），如果没有则使用result.result
        testResult.result = result.data || result.result;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      testResult.duration = duration;
      testResult.passed = false;
      testResult.error = error instanceof Error ? error.message : String(error);
    } finally {
      // 清理监听器
      eventBus.off('tool-invocation-started', handleInvocationStarted);
      if (autoApproveHandler) {
        eventBus.off('tool-invocation-started', autoApproveHandler);
      }
      if (approvalTimeout) {
        clearTimeout(approvalTimeout);
      }
    }
    
    return testResult;
  };
  
  // 并发池执行逻辑
  const executeWithPool = async (): Promise<void> => {
    const executing: Promise<void>[] = [];
    
    // 执行下一个测试用例的辅助函数
    const runNext = async (): Promise<void> => {
      // 获取下一个测试用例
      if (currentIndex >= testCases.length || autoTestAbortController.value?.signal.aborted) {
        return;
      }
      
      const testItem = testCases[currentIndex++];
      const testPromise = executeSingleTest(testItem)
        .then((result) => {
          // 添加到结果数组（使用响应式更新）
          results.push(result);
          autoTestResults.value = [...results]; // 创建新数组以触发响应式更新
          updateProgress();
        })
        .catch((error) => {
          // 即使出错也要更新进度
          updateProgress();
          const logger = createRendererLogger('SettingDebugSection')
          logger.error('测试执行出错:', error);
        })
        .finally(() => {
          // 从executing数组中移除自己
          const index = executing.indexOf(testPromise);
          if (index > -1) {
            executing.splice(index, 1);
          }
          // 继续执行下一个（如果还有的话）
          if (currentIndex < testCases.length && !autoTestAbortController.value?.signal.aborted) {
            runNext();
          }
        });
      
      executing.push(testPromise);
    };
    
    // 启动初始的并发任务
    const initialTasks = Math.min(concurrency, testCases.length);
    for (let i = 0; i < initialTasks; i++) {
      runNext();
    }
    
    // 等待所有任务完成
    while (executing.length > 0) {
      await Promise.race(executing);
    }
  };
  
  await executeWithPool();
  
  return results;
};

// 运行自动测试
const runAutoTests = async () => {
  if (autoTestRunning.value) {
    return;
  }
  
  autoTestResults.value = [];
  autoTestRunning.value = true;
  autoTestProgress.value = 0;
  autoTestAbortController.value = new AbortController();
  
  try {
    // 确定要测试的Tool列表
    let toolsToTest: string[] = [];
    if (autoTestForm.selectedTools.length > 0) {
      toolsToTest = autoTestForm.selectedTools;
    } else {
      // 测试所有有测试用例的Tool
      toolsToTest = Object.keys(testCases);
    }
    
    // 收集所有测试用例
    const allTestCases: Array<{
      toolId: string;
      toolName: string;
      testCase: { id?: string; name: string; params: Record<string, any> };
    }> = [];
    
    for (const toolId of toolsToTest) {
      const tool = agentToolManager.getTool(toolId);
      if (!tool) {
        continue;
      }
      
      const toolTestCases = testCases[toolId];
      if (!toolTestCases || !toolTestCases.testCases) {
        continue;
      }
      
      const toolName = getToolDisplayName(tool.config);
      
      for (const testCase of toolTestCases.testCases) {
        allTestCases.push({
          toolId,
          toolName,
          testCase
        });
      }
    }
    
    if (allTestCases.length === 0) {
      ElMessage.warning('没有找到可执行的测试用例');
      return;
    }
    
    autoTestCurrentTest.value = `准备执行 ${allTestCases.length} 个测试用例...`;
    
    // 使用并发池执行测试（默认并发数为5，可以根据需要调整）
    const concurrency = 5; // 可以改为可配置的
    await runTestWithConcurrency(allTestCases, concurrency);
    
    autoTestProgress.value = 100;
    autoTestCurrentTest.value = '测试完成';
    
    // 显示测试结果摘要
    const summary = autoTestSummary.value;
    if (summary.failed > 0) {
      ElMessage.warning(`测试完成: ${summary.passed} 通过, ${summary.failed} 失败`);
    } else {
      ElMessage.success(`所有测试通过! (${summary.passed}/${summary.total})`);
    }
  } catch (error) {
    ElMessage.error(`自动测试失败: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    autoTestRunning.value = false;
    autoTestAbortController.value = null;
  }
};

// 停止自动测试
const stopAutoTests = () => {
  if (autoTestAbortController.value) {
    autoTestAbortController.value.abort();
    autoTestRunning.value = false;
    autoTestCurrentTest.value = '测试已停止';
    ElMessage.info('测试已停止');
  }
};

// 计算单元测试批量测试摘要
const unitTestBatchSummary = computed(() => {
  const total = unitTestBatchResults.value.length;
  const passed = unitTestBatchResults.value.filter(r => r.passed).length;
  const failed = total - passed;
  const passedRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const failedRate = total > 0 ? Math.round((failed / total) * 100) : 0;
  
  // 计算总执行时间
  const duration = unitTestBatchResults.value.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  return {
    total,
    passed,
    failed,
    passedRate,
    failedRate,
    duration
  };
});

// 生成单元测试批量测试 Markdown 摘要
const unitTestBatchMarkdown = computed(() => {
  const summary = unitTestBatchSummary.value;
  const timestamp = new Date().toISOString();
  
  let markdown = `# 单元测试批量测试报告\n\n`;
  markdown += `**测试时间**: ${timestamp}\n\n`;
  markdown += `## 测试摘要\n\n`;
  markdown += `- **总测试数**: ${summary.total}\n`;
  markdown += `- **通过**: ${summary.passed} (${summary.passedRate}%)\n`;
  markdown += `- **失败**: ${summary.failed} (${summary.failedRate}%)\n`;
  markdown += `- **总执行时间**: ${summary.duration}ms\n\n`;
  
  // 按模块分组
  const groupedByModule = unitTestBatchResults.value.reduce((acc, result) => {
    if (!acc[result.module]) {
      acc[result.module] = [];
    }
    acc[result.module].push(result);
    return acc;
  }, {} as Record<string, UnitTestResult[]>);
  
  markdown += `## 详细结果\n\n`;
  
  for (const [module, results] of Object.entries(groupedByModule)) {
    const modulePassed = results.filter(r => r.passed).length;
    const moduleFailed = results.length - modulePassed;
    
    markdown += `### ${module}\n\n`;
    markdown += `- 测试用例数: ${results.length}\n`;
    markdown += `- 通过: ${modulePassed}\n`;
    markdown += `- 失败: ${moduleFailed}\n\n`;
    
    // 失败的测试用例
    const failedTests = results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      markdown += `#### 失败的测试用例\n\n`;
      for (const test of failedTests) {
        markdown += `**${test.testName}**\n\n`;
        markdown += `- 参数:\n\`\`\`json\n${JSON.stringify(test.params, null, 2)}\n\`\`\`\n\n`;
        if (test.error) {
          markdown += `- 错误信息:\n\`\`\`\n${test.error}\n\`\`\`\n\n`;
        }
      }
    }
    
    // 通过的测试用例
    const passedTests = results.filter(r => r.passed);
    if (passedTests.length > 0) {
      markdown += `#### 通过的测试用例\n\n`;
      for (const test of passedTests) {
        markdown += `- ✅ ${test.testName}\n`;
      }
      markdown += `\n`;
    }
  }
  
  // 错误总结（供AI修复使用）
  const allFailedTests = unitTestBatchResults.value.filter(r => !r.passed);
  if (allFailedTests.length > 0) {
    markdown += `## 错误总结（供AI修复参考）\n\n`;
    for (const test of allFailedTests) {
      markdown += `### ${test.module} - ${test.testName}\n\n`;
      markdown += `**参数**:\n\`\`\`json\n${JSON.stringify(test.params, null, 2)}\n\`\`\`\n\n`;
      markdown += `**错误信息**:\n\`\`\`\n${test.error || '未知错误'}\n\`\`\`\n\n`;
      if (test.result) {
        markdown += `**执行结果**:\n\`\`\`json\n${JSON.stringify(test.result, null, 2)}\n\`\`\`\n\n`;
      }
      markdown += `---\n\n`;
    }
  }
  
  return markdown;
});

// 并发执行单元测试用例（使用并发池）
const runUnitTestWithConcurrency = async function(
  testItems: Array<{ test: TestFunction; module: string }>,
  concurrency: number = 5
): Promise<UnitTestResult[]> {
  const results: UnitTestResult[] = [];
  let completedCount = 0;
  const totalTests = testItems.length;
  let currentIndex = 0;
  
  // 更新进度
  const updateProgress = () => {
    completedCount++;
    unitTestBatchProgress.value = Math.round((completedCount / totalTests) * 100);
    
    // 更新当前测试信息
    const runningTests = totalTests - completedCount;
    if (runningTests > 0) {
      unitTestBatchCurrentTest.value = `已完成 ${completedCount}/${totalTests}，剩余 ${runningTests} 个测试用例...`;
    } else {
      unitTestBatchCurrentTest.value = '测试完成';
    }
  };
  
  // 执行单个测试用例
  const executeSingleTest = async (testItem: { test: TestFunction; module: string }): Promise<UnitTestResult> => {
    if (unitTestBatchAbortController.value?.signal.aborted) {
      throw new Error('测试已取消');
    }
    
    const { test, module } = testItem;
    const startTime = Date.now();
    
    let testResult: UnitTestResult = {
      testId: test.id,
      testName: test.name,
      module: module,
      params: [],
      passed: false,
      duration: 0
    };
    
    try {
      // 使用默认参数执行测试
      const params = test.params 
        ? testFramework.parseParams(test.params, {})
        : [];
      
      testResult.params = params;
      
      const result = await testFramework.execute(test.id, params);
      const duration = Date.now() - startTime;
      testResult.duration = duration;
      
      // 判断测试是否通过（根据返回结果判断）
      // 如果返回结果中有 passed 字段，使用它；否则根据是否有 error 判断
      if (result && typeof result === 'object' && 'passed' in result) {
        testResult.passed = result.passed === true;
        testResult.result = result;
        if (!testResult.passed && result.error) {
          testResult.error = result.error;
        }
      } else {
        // 如果没有明确的 passed 字段，认为测试通过（没有抛出异常）
        testResult.passed = true;
        testResult.result = result;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      testResult.duration = duration;
      testResult.passed = false;
      testResult.error = error instanceof Error ? error.message : String(error);
    }
    
    return testResult;
  };
  
  // 并发池执行逻辑
  const executeWithPool = async (): Promise<void> => {
    const executing: Promise<void>[] = [];
    
    // 执行下一个测试用例的辅助函数
    const runNext = async (): Promise<void> => {
      // 获取下一个测试用例
      if (currentIndex >= testItems.length || unitTestBatchAbortController.value?.signal.aborted) {
        return;
      }
      
      const testItem = testItems[currentIndex++];
      const testPromise = executeSingleTest(testItem)
        .then((result) => {
          // 添加到结果数组（使用响应式更新）
          results.push(result);
          unitTestBatchResults.value = [...results]; // 创建新数组以触发响应式更新
          updateProgress();
        })
        .catch((error) => {
          // 即使出错也要更新进度
          updateProgress();
          const logger = createRendererLogger('SettingDebugSection')
          logger.error('测试执行出错:', error);
        })
        .finally(() => {
          // 从executing数组中移除自己
          const index = executing.indexOf(testPromise);
          if (index > -1) {
            executing.splice(index, 1);
          }
          // 继续执行下一个（如果还有的话）
          if (currentIndex < testItems.length && !unitTestBatchAbortController.value?.signal.aborted) {
            runNext();
          }
        });
      
      executing.push(testPromise);
    };
    
    // 启动初始的并发任务
    const initialTasks = Math.min(concurrency, testItems.length);
    for (let i = 0; i < initialTasks; i++) {
      runNext();
    }
    
    // 等待所有任务完成
    while (executing.length > 0) {
      await Promise.race(executing);
    }
  };
  
  await executeWithPool();
  
  return results;
};

// 运行单元测试批量测试
const runUnitTestBatch = async () => {
  if (unitTestBatchRunning.value) {
    return;
  }
  
  unitTestBatchResults.value = [];
  unitTestBatchRunning.value = true;
  unitTestBatchProgress.value = 0;
  unitTestBatchAbortController.value = new AbortController();
  
  try {
    // 确定要测试的模块列表
    let modulesToTest: string[] = [];
    if (unitTestBatchForm.selectedModules.length > 0) {
      modulesToTest = unitTestBatchForm.selectedModules;
    } else {
      // 测试所有模块
      modulesToTest = modules.value;
    }
    
    // 收集所有测试用例
    const allTestItems: Array<{ test: TestFunction; module: string }> = [];
    
    for (const module of modulesToTest) {
      const moduleTests = testFramework.getTestsByModule(module);
      for (const test of moduleTests) {
        allTestItems.push({
          test,
          module
        });
      }
    }
    
    if (allTestItems.length === 0) {
      ElMessage.warning('没有找到可执行的测试用例');
      return;
    }
    
    unitTestBatchCurrentTest.value = `准备执行 ${allTestItems.length} 个测试用例...`;
    
    // 使用并发池执行测试（默认并发数为5）
    const concurrency = 5;
    await runUnitTestWithConcurrency(allTestItems, concurrency);
    
    unitTestBatchProgress.value = 100;
    unitTestBatchCurrentTest.value = '测试完成';
    
    // 显示测试结果摘要
    const summary = unitTestBatchSummary.value;
    if (summary.failed > 0) {
      ElMessage.warning(`测试完成: ${summary.passed} 通过, ${summary.failed} 失败`);
    } else {
      ElMessage.success(`所有测试通过! (${summary.passed}/${summary.total})`);
    }
  } catch (error) {
    ElMessage.error(`批量测试失败: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    unitTestBatchRunning.value = false;
    unitTestBatchAbortController.value = null;
  }
};

// 停止单元测试批量测试
const stopUnitTestBatch = () => {
  if (unitTestBatchAbortController.value) {
    unitTestBatchAbortController.value.abort();
    unitTestBatchRunning.value = false;
    unitTestBatchCurrentTest.value = '测试已停止';
    ElMessage.info('测试已停止');
  }
};

// 导出工具执行快照
const exportEntrySnapshot = async (entry: any) => {
  try {
    const tool = agentToolManager.getTool(entry.toolId);
    if (!tool) {
      ElMessage.error('找不到工具配置');
      return;
    }

    // 从entry创建快照
    const snapshot = createSnapshotFromHistoryEntry({
      toolId: entry.toolId,
      toolName: entry.toolName,
      timestamp: entry.timestamp,
      status: entry.status || 'pending',
      params: typeof entry.params === 'string' ? JSON.parse(entry.params) : entry.params,
      result: entry.result,
      data: entry.outputs?.[0]?.data ? {
        content: entry.outputs[0].data,
        format: entry.outputs[0].format || 'json',
        componentName: entry.outputs[0].renderer || entry.displayComponent
      } : undefined,
      progress: entry.progress,
      error: entry.error,
      outputs: entry.outputs?.map((output: any) => ({
        id: output.id,
        label: output.label,
        format: output.format,
        data: output.data,
        timestamp: entry.timestamp
      })),
      invocationId: entry.invocationId
    }, tool.config ? {
      id: tool.config.id,
      name: tool.config.name,
      description: tool.config.description,
      origin: tool.config.origin,
      displayComponent: extractComponentName(tool.config.displayComponent)
    } : undefined)

    // 序列化快照
    const serialized = serializeToolExecutionSnapshot(snapshot)
    const logger = createRendererLogger('SettingDebugSection');
    // 获取 IPC 渲染器用于保存文件（动态获取，确保使用正确的 IPC）
    let effectiveIpcRenderer: any = null
    if (window && (window as any).electron) {
      effectiveIpcRenderer = (window as any).electron.ipcRenderer
    } else {
      const localIpcRenderer = (await import('../../utils/web-adapter/local-ipc-renderer')).default
      effectiveIpcRenderer = localIpcRenderer
    }

    if (!effectiveIpcRenderer) {
      throw new Error('无法获取 IPC 渲染器')
    }

    const fileName = `tool-snapshot-${snapshot.toolId}-${snapshot.timestamp}.json`
    logger.debug('[导出快照] 开始调用保存文件对话框，文件名:', fileName, 'ipcRenderer类型:', effectiveIpcRenderer === ipcRenderer ? '模块级' : '动态获取')
    
    // 调用保存文件对话框
    const result = await effectiveIpcRenderer.invoke('save-json-file', serialized, fileName)
    
    logger.debug('[导出快照] 保存文件对话框返回结果:', result)
    
    if (!result) {
      logger.error('[导出快照] 保存文件调用返回空结果')
      throw new Error('保存文件调用返回空结果')
    }

    if (result.success) {
      logger.debug('[导出快照] 文件保存成功，路径:', result.path)
      ElMessage.success(t('agent.tool.exportSnapshotSuccess'))
    } else {
      // 用户取消对话框，不显示错误
      if (result.canceled) {
        logger.debug('[导出快照] 用户取消了保存对话框')
        return
      }
      // 其他错误，显示错误消息
      logger.error('[导出快照] 保存失败:', result.error)
      throw new Error(result.error || '保存失败')
    }
  } catch (error) {
    const logger = createRendererLogger('SettingDebugSection')
    logger.error('导出快照失败:', error)
    ElMessage.error(`${t('agent.tool.exportSnapshotFailed')}: ${error instanceof Error ? error.message : String(error)}`)
  }
};

// 选择快照文件
const selectSnapshotFile = () => {
  fileInputRef.value?.click();
};

// 处理文件选择
const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result as string;
    importSnapshotForm.snapshotContent = content;
  };
  reader.readAsText(file);
};

// 导入快照
const importSnapshot = async () => {
  if (!importSnapshotForm.snapshotContent.trim()) {
    ElMessage.warning(t('setting.debug.snapshotFilePlaceholder'));
    return;
  }

  importSnapshotLoading.value = true;
  try {
    // 反序列化快照
    const snapshot = deserializeToolExecutionSnapshot(importSnapshotForm.snapshotContent.trim());

    // 获取工具配置
    const tool = agentToolManager.getTool(snapshot.toolId);
    if (!tool) {
      ElMessage.warning(`工具 ${snapshot.toolId} 不存在，将使用快照中的配置`);
    }

    // 转换为entry格式用于显示
    // 优先使用快照中的data（ToolCallbackData格式），如果没有则使用outputs中的data
    const displayData = snapshot.data || (snapshot.outputs && snapshot.outputs.length > 0 ? snapshot.outputs[0].data : undefined)
    
    // 提取组件名称：优先从 data.componentName 获取，然后从 toolConfigSnapshot.displayComponent 获取
    const extractComponentNameFromSnapshot = (): string | undefined => {
      // 1. 优先从 snapshot.data.componentName 获取
      if (snapshot.data && typeof snapshot.data === 'object' && 'componentName' in snapshot.data) {
        const componentName = (snapshot.data as any).componentName
        if (componentName && typeof componentName === 'string') {
          return componentName
        }
      }
      
      // 2. 从第一个 output.data.componentName 获取
      if (snapshot.outputs && snapshot.outputs.length > 0) {
        const firstOutput = snapshot.outputs[0]
        if (firstOutput.data && typeof firstOutput.data === 'object' && 'componentName' in firstOutput.data) {
          const componentName = (firstOutput.data as any).componentName
          if (componentName && typeof componentName === 'string') {
            return componentName
          }
        }
      }
      
      // 3. 从 toolConfigSnapshot.displayComponent 获取
      if (snapshot.toolConfigSnapshot?.displayComponent) {
        return typeof snapshot.toolConfigSnapshot.displayComponent === 'string'
          ? snapshot.toolConfigSnapshot.displayComponent
          : undefined
      }
      
      return undefined
    }
    
    const componentName = extractComponentNameFromSnapshot()
    
    importedSnapshot.value = {
      toolId: snapshot.toolId,
      toolName: snapshot.toolName,
      timestamp: snapshot.timestamp,
      status: snapshot.status,
      params: snapshot.params,
      result: snapshot.result,
      data: displayData,
      progress: snapshot.progress,
      error: snapshot.error,
      outputs: snapshot.outputs?.map(output => {
        // 检查 output.data 是否已经是 ToolCallbackData 格式
        const isToolCallbackData = output.data && typeof output.data === 'object' && 'content' in output.data
        const outputComponentName = isToolCallbackData && output.data && typeof output.data === 'object' && 'componentName' in output.data
          ? (output.data as any).componentName
          : componentName
        
        return {
          id: output.id,
          label: output.label,
          format: output.format,
          // 如果output.data是ToolCallbackData格式，直接使用；否则包装成ToolCallbackData格式
          data: isToolCallbackData
            ? output.data
            : {
                content: output.data,
                format: output.format || 'json',
                componentName: outputComponentName
              },
          renderer: outputComponentName
        }
      }),
      displayComponent: componentName,
      toolConfig: tool?.config || (snapshot.toolConfigSnapshot ? {
        ...snapshot.toolConfigSnapshot,
        displayComponent: componentName
          ? getDisplayComponent(componentName) || componentName
          : undefined
      } : undefined),
      invocationId: snapshot.invocationId
    };

    ElMessage.success(t('setting.debug.importSuccess'));
  } catch (error) {
    const logger = createRendererLogger('SettingDebugSection')
    logger.error('导入快照失败:', error);
    ElMessage.error(`${t('setting.debug.importFailed')}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    importSnapshotLoading.value = false;
  }
};

// 清空导入表单
const clearImportForm = () => {
  importSnapshotForm.snapshotContent = '';
  importedSnapshot.value = null;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
};

// 更新测试相关函数
const handleMockCheckUpdate = async () => {
  updateTestChecking.value = true;
  updateTestStatus.value = null;
  updateTestDownloaded.value = false;
  updateTestDownloading.value = false;
  updateTestDownloadProgress.value = 0;
  updateTestDownloadError.value = null;

  // 设置 mock 服务的版本
  updateMockService.setCurrentVersion(updateTestForm.currentVersion);
  updateMockService.setMockUpdateVersion(updateTestForm.mockUpdateVersion);

  try {
    let shouldHaveUpdate = true;
    if (updateTestForm.scenario === 'noUpdate') {
      shouldHaveUpdate = false;
    } else if (updateTestForm.scenario === 'error') {
      // 模拟错误：设置一个不存在的版本，然后手动触发错误
      updateTestStatus.value = {
        checking: false,
        updateAvailable: false,
        updateNotAvailable: false,
        error: '网络连接失败，请检查网络设置',
        updateInfo: null
      };
      updateTestHistory.value.unshift({
        action: '检查更新',
        timestamp: Date.now(),
        error: '网络连接失败，请检查网络设置'
      });
      return;
    }

    const status = await updateMockService.checkForUpdates(updateTestForm.channel, shouldHaveUpdate);
    updateTestStatus.value = status;
    
    updateTestHistory.value.unshift({
      action: '检查更新',
      timestamp: Date.now(),
      result: status
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateTestStatus.value = {
      checking: false,
      updateAvailable: false,
      updateNotAvailable: false,
      error: errorMessage,
      updateInfo: null
    };
    updateTestHistory.value.unshift({
      action: '检查更新',
      timestamp: Date.now(),
      error: errorMessage
    });
  } finally {
    updateTestChecking.value = false;
  }
};

const handleMockDownloadUpdate = async () => {
  updateTestDownloading.value = true;
  updateTestDownloadProgress.value = 0;
  updateTestDownloadError.value = null;

  try {
    const result = await updateMockService.downloadUpdate((progress) => {
      updateTestDownloadProgress.value = progress.percent;
    });

    if (result.success) {
      updateTestDownloaded.value = true;
      updateTestDownloading.value = false;
      updateTestDownloadProgress.value = 100;
      updateTestHistory.value.unshift({
        action: '下载更新',
        timestamp: Date.now(),
        result: { success: true, progress: 100 }
      });
    } else {
      updateTestDownloadError.value = result.error || '下载失败';
      updateTestDownloading.value = false;
      updateTestHistory.value.unshift({
        action: '下载更新',
        timestamp: Date.now(),
        error: result.error || '下载失败'
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateTestDownloadError.value = errorMessage;
    updateTestDownloading.value = false;
    updateTestHistory.value.unshift({
      action: '下载更新',
      timestamp: Date.now(),
      error: errorMessage
    });
  }
};

const handleMockCancelDownload = () => {
  updateMockService.cancelDownload();
  updateTestDownloading.value = false;
  updateTestDownloadProgress.value = 0;
  updateTestHistory.value.unshift({
    action: '取消下载',
    timestamp: Date.now()
  });
};

const handleMockInstallUpdate = async () => {
  try {
    await updateMockService.quitAndInstall();
    updateTestHistory.value.unshift({
      action: '安装并重启',
      timestamp: Date.now(),
      result: { success: true }
    });
    ElMessage.success('模拟安装完成（实际环境中会重启应用）');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateTestHistory.value.unshift({
      action: '安装并重启',
      timestamp: Date.now(),
      error: errorMessage
    });
    ElMessage.error(`安装失败: ${errorMessage}`);
  }
};

const handleMockReset = () => {
  updateMockService.reset();
  updateTestStatus.value = null;
  updateTestDownloaded.value = false;
  updateTestDownloading.value = false;
  updateTestDownloadProgress.value = 0;
  updateTestDownloadError.value = null;
  updateTestHistory.value = [];
  ElMessage.success('状态已重置');
};

onMounted(async () => {
  modules.value = testFramework.getModules();
  refreshTestHistory();
  await fetchWindowTypes();
  
  // 刷新可用Tool列表
  availableTools.value = agentToolManager.getAllTools();
  
  // 加载保存的配置
  loadSavedConfigs();
  
  // 初始化更新测试表单的版本信息
  try {
    const versionInfo = await updateMockService.getVersionInfo();
    updateTestForm.currentVersion = versionInfo.version;
  } catch (error) {
    console.warn('获取版本信息失败:', error);
  }
  
  // 定期刷新窗口类型列表（每5秒）
  const interval = setInterval(fetchWindowTypes, 5000);
  // 组件卸载时清除定时器
  onBeforeUnmount(() => {
    clearInterval(interval);
  });
});
</script>

<style scoped>
.debug-section {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.debug-section :deep(.el-tabs) {
  display: flex;
  flex-direction: column !important;
  height: 100%;
  flex: 1;
}

.debug-section :deep(.el-tabs__header) {
  order: -999 !important;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
  margin: 0 !important;
  position: sticky !important;
  top: 0 !important;
  z-index: 100 !important;
  background-color: v-bind('themeState.currentTheme.background') !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
}

.debug-section :deep(.el-tabs__header.is-top) {
  order: -999 !important;
}

.debug-section :deep(.el-tabs__header.is-bottom) {
  order: 999 !important;
}

.debug-section :deep(.el-tabs__nav-wrap) {
  order: inherit !important;
  flex-shrink: 0 !important;
}

.debug-section :deep(.el-tabs__nav) {
  order: inherit !important;
  flex-shrink: 0 !important;
}

.debug-section :deep(.el-tabs__content) {
  order: 0 !important;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative !important;
}

.debug-section :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.test-panel {
  padding: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor');
  width: 100%;
  box-sizing: border-box;
  min-height: 0;
}

.test-result {
  margin-top: 20px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 8px;
  padding: 16px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.test-result :deep(.el-scrollbar) {
  flex: 1;
  height: 0;
}

.test-result :deep(.el-scrollbar__wrap) {
  height: 100%;
}

.test-history-item {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 6px;
  background-color: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor');
}

.test-history-item.test-error {
  border-color: #f56c6c;
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(245, 108, 108, 0.15)" : "#fef0f0"');
}

.test-history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.test-name {
  color: v-bind('themeState.currentTheme.textColor');
  font-weight: 600;
}

.test-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.test-progress {
  margin: 12px 0;
}

.progress-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-right: 8px;
}

.progress-message {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.test-time {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
  font-weight: normal;
}

.test-params,
.test-result-data,
.test-error-message {
  margin-top: 8px;
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor');
}

.test-params pre,
.test-result-data pre,
.test-error-message pre {
  margin: 4px 0 0 0;
  padding: 8px;
  background-color: v-bind('codeBgColor');
  color: v-bind('themeState.currentTheme.codeColor || themeState.currentTheme.textColor');
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
}

.test-error-message pre {
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(245, 108, 108, 0.15)" : "#fef0f0"');
  color: #f56c6c;
}

.test-empty {
  text-align: center;
  color: v-bind('themeState.currentTheme.textColor2');
  padding: 40px 0;
}

.raw-text {
  background-color: v-bind('codeBgColor');
  color: v-bind('themeState.currentTheme.codeColor || themeState.currentTheme.textColor');
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 4px;
  padding: 8px;
  margin: 4px 0 0 0;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.test-params strong,
.test-result-data strong,
.test-error-message strong {
  color: v-bind('themeState.currentTheme.textColor');
}

.auto-test-results {
  margin-top: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.auto-test-results :deep(.auto-test-result-display) {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.test-progress-info {
  padding: 20px;
  text-align: center;
  color: v-bind('themeState.currentTheme.textColor');
}

/* 确保 el-form 不会超出容器，并且根据内容自适应高度 */
.debug-section :deep(.el-form) {
  flex-shrink: 0;
  flex-grow: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.debug-section :deep(.el-form .el-input),
.debug-section :deep(.el-form .el-select),
.debug-section :deep(.el-form .el-textarea) {
  width: 100%;
  max-width: 100%;
}

/* 确保各个 tab pane 内的内容能够正确布局 */
.debug-section :deep(.el-tab-pane) > * {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 确保 el-divider 不会影响布局 */
.debug-section :deep(.el-divider) {
  margin: 16px 0;
  flex-shrink: 0;
}
</style>

