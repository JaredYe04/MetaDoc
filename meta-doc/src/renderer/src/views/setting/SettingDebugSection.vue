<template>
  <div class="debug-section">
    <div class="debug-layout">
      <!-- 侧边栏导航 -->
      <div class="debug-sidebar">
        <el-menu
          :default-active="activeTab"
          @select="handleMenuSelect"
          class="debug-menu"
          :collapse="false"
        >
          <el-menu-item index="eventbus">
            <el-icon><Connection /></el-icon>
            <template #title>{{ $t('setting.debug.eventBus') }}</template>
          </el-menu-item>
          <el-menu-item index="updatetest">
            <el-icon><Refresh /></el-icon>
            <template #title>更新测试</template>
          </el-menu-item>
          <el-menu-item index="agenttool">
            <el-icon><Tools /></el-icon>
            <template #title>Agent Tool测试</template>
          </el-menu-item>
          <el-menu-item index="importsnapshot">
            <el-icon><Document /></el-icon>
            <template #title>{{ $t('setting.debug.importSnapshot') }}</template>
          </el-menu-item>
          <el-menu-item index="autotest">
            <el-icon><Setting /></el-icon>
            <template #title>Tool自动测试</template>
          </el-menu-item>
          <el-menu-item index="unittest">
            <el-icon><Tools /></el-icon>
            <template #title>{{ $t('setting.debug.unitTest.title') }}</template>
          </el-menu-item>
          <el-menu-item index="agentsessiondebug">
            <el-icon><ChatDotRound /></el-icon>
            <template #title>Agent会话调试</template>
          </el-menu-item>
        </el-menu>
      </div>
      
      <!-- 内容区域 -->
      <div class="debug-content">
        <el-card class="debug-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-title">{{ getCurrentTabTitle() }}</span>
            </div>
          </template>
          
          <transition name="fade" mode="out-in">
            <div :key="activeTab" class="tab-content-wrapper">
              <!-- EventBus 事件 -->
              <div v-if="activeTab === 'eventbus'" class="tab-content">
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
              </div>
              <div v-else-if="activeTab === 'updatetest'" class="tab-content">
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
                        <el-radio value="release">正式版</el-radio>
                        <el-radio value="dev">内测版</el-radio>
                      </el-radio-group>
                    </el-form-item>

                    <el-form-item label="测试场景">
                      <el-radio-group v-model="updateTestForm.scenario">
                        <el-radio value="hasUpdate">有更新可用</el-radio>
                        <el-radio value="noUpdate">已是最新版本</el-radio>
                        <el-radio value="error">模拟网络错误</el-radio>
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
              </div>
              <div v-else-if="activeTab === 'agenttool'" class="tab-content">
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

                    <!-- 上下文Tab选择 -->
                    <el-form-item label="上下文Tab">
                      <el-select
                        v-model="toolTestForm.contextTabId"
                        placeholder="选择上下文Tab（用于模拟文档环境，可选）"
                        style="width: 100%"
                        clearable
                      >
                        <el-option
                          label="（不指定，使用当前活动Tab）"
                          value=""
                        />
                        <el-option
                          v-for="tab in documentTabs"
                          :key="tab.id"
                          :label="`${tab.title || tab.subtitle || '未命名'} (${tab.id})`"
                          :value="tab.id"
                        />
                      </el-select>
                      <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
                        <el-icon><InfoFilled /></el-icon>
                        <span>选择文档Tab作为上下文，所有工具操作都会在该Tab中进行。如果不选择，将使用当前活动的Tab。</span>
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
              </div>
              <div v-else-if="activeTab === 'importsnapshot'" class="tab-content">
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
              </div>
              <div v-else-if="activeTab === 'autotest'" class="tab-content">
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

                    <!-- 上下文Tab选择 -->
                    <el-form-item label="上下文Tab">
                      <el-select
                        v-model="autoTestForm.contextTabId"
                        placeholder="选择上下文Tab（用于模拟文档环境，可选）"
                        style="width: 100%"
                        clearable
                      >
                        <el-option
                          label="（不指定，使用当前活动Tab）"
                          value=""
                        />
                        <el-option
                          v-for="tab in documentTabs"
                          :key="tab.id"
                          :label="`${tab.title || tab.subtitle || '未命名'} (${tab.id})`"
                          :value="tab.id"
                        />
                      </el-select>
                      <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
                        <el-icon><InfoFilled /></el-icon>
                        <span>选择文档Tab作为上下文，所有工具操作都会在该Tab中进行。如果不选择，将使用当前活动的Tab。</span>
                      </div>
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
              </div>
              <div v-else-if="activeTab === 'unittest'" class="tab-content">
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

                        <!-- 上下文Tab选择 -->
                        <el-form-item label="上下文Tab">
                          <el-select
                            v-model="unitTestBatchForm.contextTabId"
                            placeholder="选择上下文Tab（用于模拟文档环境，可选）"
                            style="width: 100%"
                            clearable
                          >
                            <el-option
                              label="（不指定，使用当前活动Tab）"
                              value=""
                            />
                            <el-option
                              v-for="tab in documentTabs"
                              :key="tab.id"
                              :label="`${tab.title || tab.subtitle || '未命名'} (${tab.id})`"
                              :value="tab.id"
                            />
                          </el-select>
                          <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
                            <el-icon><InfoFilled /></el-icon>
                            <span>选择文档Tab作为上下文，所有工具操作都会在该Tab中进行。如果不选择，将使用当前活动的Tab。</span>
                          </div>
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
              </div>
              <div v-else-if="activeTab === 'agentsessiondebug'" class="tab-content">
                <el-tabs v-model="agentSessionDebugActiveTab" type="border-card" tab-position="top">
                  <!-- 会话调试 -->
                  <el-tab-pane label="会话调试" name="debug">
                    <div class="test-panel" :style="testPanelStyle">
                      <el-form :model="agentSessionDebugForm" label-width="140px">
                        <el-form-item label="选择文档">
                          <el-select
                            v-model="agentSessionDebugForm.tabId"
                            placeholder="选择要调试的文档"
                            style="width: 100%"
                            @change="handleSessionDebugTabChange"
                            filterable
                          >
                            <el-option
                              v-for="tab in workspaceTabs"
                              :key="tab.id"
                              :label="tab.title || tab.path || '未命名文档'"
                              :value="tab.id"
                            />
                          </el-select>
                        </el-form-item>

                        <el-form-item label="选择会话" v-if="agentSessionDebugForm.tabId">
                          <div style="display: flex; gap: 8px;">
                            <el-select
                              v-model="agentSessionDebugForm.sessionId"
                              placeholder="选择要调试的会话"
                              style="flex: 1"
                              @change="handleSessionDebugSessionChange"
                              filterable
                            >
                              <el-option
                                v-for="session in availableSessions"
                                :key="session.id"
                                :label="session.title || session.id"
                                :value="session.id"
                              >
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                  <span>{{ session.title || session.id }}</span>
                                  <el-tag size="small" type="info" style="margin-left: 8px;">
                                    {{ session.messages?.length || 0 }} 条消息
                                  </el-tag>
                                </div>
                              </el-option>
                            </el-select>
                            <el-button
                              type="primary"
                              :icon="Upload"
                              @click="handleImportSessionJson"
                              :disabled="!agentSessionDebugForm.tabId"
                            >
                              导入会话
                            </el-button>
                          </div>
                        </el-form-item>
                      </el-form>

                      <!-- 会话详情 -->
                      <div v-if="selectedSession" class="session-debug-details" style="margin-top: 20px;">
                        <el-tabs v-model="sessionDebugActiveTab" type="border-card" tab-position="top">
                          <!-- 执行节点列表 -->
                          <el-tab-pane label="执行节点" name="nodes">
                            <el-scrollbar height="400px">
                              <div v-if="selectedSession.executionNodes && selectedSession.executionNodes.length > 0">
                                <div
                                  v-for="(node, index) in selectedSession.executionNodes"
                                  :key="node.id"
                                  class="execution-node-item"
                                  :class="{ 'current-node': node.id === selectedSession.currentExecutionNodeId }"
                                  :style="executionNodeItemStyle"
                                >
                      <div class="node-header">
                        <div class="node-info">
                          <el-tag size="small" :type="getNodeTypeTagType(node.type)">
                            {{ getNodeTypeLabel(node.type) }}
                          </el-tag>
                          <span class="node-id">{{ node.id.substring(0, 16) }}...</span>
                          <span class="node-time">{{ formatTime(node.timestamp) }}</span>
                        </div>
                        <div class="node-actions">
                          <el-button
                            size="small"
                            type="primary"
                            @click="handleRevertToNode(node.id)"
                          >
                            回溯到此节点
                          </el-button>
                          <el-button
                            v-if="node.type === 'tool-call'"
                            size="small"
                            type="warning"
                            @click="handleReplayToolCall(node.id)"
                          >
                            重新执行工具
                          </el-button>
                        </div>
                      </div>
                      <div class="node-status">
                        <el-tag size="small" :type="getNodeStatusTagType(node.status)">
                          {{ getNodeStatusLabel(node.status) }}
                        </el-tag>
                                </div>
                                <div class="node-data">
                                  <el-collapse>
                                    <el-collapse-item title="节点数据" :name="node.id">
                                      <pre :style="messageContentStyle">{{ formatResult(node.data) }}</pre>
                                    </el-collapse-item>
                                    <el-collapse-item v-if="node.result" title="执行结果" :name="`${node.id}-result`">
                                      <pre :style="messageContentStyle">{{ formatResult(node.result) }}</pre>
                                    </el-collapse-item>
                                    <el-collapse-item v-if="node.error" title="错误信息" :name="`${node.id}-error`">
                                      <pre :style="{ ...messageContentStyle, color: '#f56c6c' }">{{ node.error }}</pre>
                                    </el-collapse-item>
                                  </el-collapse>
                                </div>
                              </div>
                            </div>
                            <div v-else class="test-empty">
                              暂无执行节点
                            </div>
                          </el-scrollbar>
                        </el-tab-pane>

                        <!-- 消息列表 -->
                        <el-tab-pane label="消息列表" name="messages">
                          <el-scrollbar height="400px">
                            <div v-if="selectedSession.messages && selectedSession.messages.length > 0">
                              <div
                                v-for="(message, index) in selectedSession.messages"
                                :key="message.id"
                                class="message-item"
                                :class="{ 'user-message': message.role === 'user', 'assistant-message': message.role === 'assistant', 'tool-message': message.role === 'tool' }"
                                :style="messageItemStyle"
                              >
                                <div class="message-header">
                                  <div class="message-info">
                                    <el-tag size="small" :type="getMessageRoleTagType(message.role)">
                                      {{ getMessageRoleLabel(message.role) }}
                                    </el-tag>
                                    <span class="message-type">{{ message.type }}</span>
                                    <span class="message-id">{{ message.id.substring(0, 16) }}...</span>
                                    <span class="message-time">{{ formatTime(message.timestamp) }}</span>
                                  </div>
                                  <div class="message-actions">
                                    <el-button
                                      v-if="message.role === 'user' && message.type === 'chat'"
                                      size="small"
                                      type="primary"
                                      @click="handleReplayMessage(message.id)"
                                    >
                                      重新执行消息
                                    </el-button>
                                    <el-button
                                      v-if="message.role === 'tool' && message.type === 'tool'"
                                      size="small"
                                      type="warning"
                                      @click="handleReplayToolCallFromMessage(message.id)"
                                    >
                                      重新执行工具
                                    </el-button>
                                  </div>
                                </div>
                                <div class="message-content">
                                  <el-collapse>
                                    <el-collapse-item title="消息内容" :name="message.id">
                                      <div v-if="message.type === 'chat'">
                                        <pre :style="messageContentStyle">{{ (message as any).markdown || (message as any).content || '' }}</pre>
                                      </div>
                                      <div v-else-if="message.type === 'tool' && message.role === 'tool'">
                                        <!-- 使用 AgentToolResultCard 显示工具消息 -->
                                        <AgentToolResultCard
                                          :message="message as ToolAgentMessage"
                                          :messages="selectedSession.messages"
                                          :message-index="index"
                                        />
                                      </div>
                                      <div v-else>
                                        <pre :style="messageContentStyle">{{ formatResult(message) }}</pre>
                                      </div>
                                    </el-collapse-item>
                                    <el-collapse-item v-if="(message as any).tool_calls" title="工具调用" :name="`${message.id}-tool-calls`">
                                      <pre :style="messageContentStyle">{{ formatResult((message as any).tool_calls) }}</pre>
                                    </el-collapse-item>
                                  </el-collapse>
                                </div>
                              </div>
                            </div>
                            <div v-else class="test-empty">
                              暂无消息
                            </div>
                          </el-scrollbar>
                        </el-tab-pane>

                        <!-- 会话元数据 -->
                        <el-tab-pane label="会话信息" name="metadata">
                          <el-descriptions :column="1" border>
                            <el-descriptions-item label="会话ID">{{ selectedSession.id }}</el-descriptions-item>
                            <el-descriptions-item label="标题">{{ selectedSession.title }}</el-descriptions-item>
                            <el-descriptions-item label="描述">{{ selectedSession.description || '无' }}</el-descriptions-item>
                            <el-descriptions-item label="Agent配置ID">{{ selectedSession.agentConfigId || '无' }}</el-descriptions-item>
                            <el-descriptions-item label="状态">
                              <el-tag :type="getSessionStatusTagType(selectedSession.status)">
                                {{ selectedSession.status || 'idle' }}
                              </el-tag>
                            </el-descriptions-item>
                            <el-descriptions-item label="当前执行节点">{{ selectedSession.currentExecutionNodeId || '无' }}</el-descriptions-item>
                            <el-descriptions-item label="消息数量">{{ selectedSession.messages?.length || 0 }}</el-descriptions-item>
                            <el-descriptions-item label="执行节点数量">{{ selectedSession.executionNodes?.length || 0 }}</el-descriptions-item>
                            <el-descriptions-item label="引用数量">{{ selectedSession.referenceStore?.length || 0 }}</el-descriptions-item>
                            <el-descriptions-item label="创建时间">{{ formatTime(selectedSession.createdAt) }}</el-descriptions-item>
                            <el-descriptions-item label="更新时间">{{ formatTime(selectedSession.updatedAt) }}</el-descriptions-item>
                          </el-descriptions>
                        </el-tab-pane>
                      </el-tabs>
                    </div>
                    <div v-else class="test-empty" style="margin-top: 20px;">
                      请先选择文档和会话
                    </div>
                  </div>
                </el-tab-pane>

                <!-- 会话回放 -->
                <el-tab-pane label="会话回放" name="replay">
                  <div class="test-panel" :style="testPanelStyle">
                    <el-form :model="sessionReplayForm" label-width="140px">
                      <el-form-item label="导入会话">
                        <div style="display: flex; gap: 8px;">
                          <el-button
                            type="primary"
                            :icon="Upload"
                            @click="handleImportSessionForReplay"
                          >
                            导入会话JSON
                          </el-button>
                          <el-button
                            v-if="replaySession"
                            @click="handleClearReplaySession"
                          >
                            清除会话
                          </el-button>
                        </div>
                      </el-form-item>

                      <el-form-item v-if="replaySession" label="会话信息">
                        <el-descriptions :column="1" border size="small">
                          <el-descriptions-item label="标题">{{ replaySession.title }}</el-descriptions-item>
                          <el-descriptions-item label="消息数量">{{ replaySession.messages?.length || 0 }}</el-descriptions-item>
                          <el-descriptions-item label="执行节点数量">{{ replaySession.executionNodes?.length || 0 }}</el-descriptions-item>
                        </el-descriptions>
                      </el-form-item>

                      <el-form-item v-if="replaySession" label="回放控制">
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                          <!-- 第一行：主要控制按钮 -->
                          <div style="display: flex; gap: 8px; align-items: center;">
                            <el-button
                              type="primary"
                              @click="handleStartReplay"
                              :disabled="isReplaying"
                              :loading="isReplaying"
                            >
                              {{ isReplaying ? '回放中...' : '开始回放' }}
                            </el-button>
                            <el-button
                              @click="handleStopReplay"
                              :disabled="!isReplaying"
                            >
                              停止回放
                            </el-button>
                            <el-button
                              @click="handleResetReplay"
                              :disabled="isReplaying"
                            >
                              重置到开头
                            </el-button>
                            <el-button
                              @click="handleReplayStepBack"
                              :disabled="isReplaying || replayCurrentIndex < 0"
                              size="small"
                            >
                              后退
                            </el-button>
                            <el-button
                              @click="handleReplayStepForward"
                              :disabled="isReplaying || replayCurrentIndex >= replayDisplayMessages.length - 1"
                              size="small"
                            >
                              前进
                            </el-button>
                            <el-slider
                              v-model="replaySpeed"
                              :min="0.1"
                              :max="5"
                              :step="0.1"
                              style="width: 200px; margin: 0 16px;"
                              :format-tooltip="(val: number) => `${val}x`"
                            />
                            <span style="min-width: 60px;">{{ replaySpeed }}x</span>
                          </div>
                          <!-- 第二行：起始节点选择 -->
                          <div style="display: flex; gap: 8px; align-items: center;">
                            <span style="min-width: 80px;">起始节点:</span>
                            <el-select
                              v-model="replayStartIndex"
                              :disabled="isReplaying"
                              style="flex: 1;"
                              placeholder="选择回放起始节点"
                            >
                              <el-option
                                :label="`从头开始 (0)`"
                                :value="0"
                              />
                              <el-option
                                v-for="(msg, index) in replayDisplayMessages"
                                :key="msg.id"
                                :label="`消息 ${index + 1}: ${getMessageRoleLabel(msg.role)} - ${msg.type}`"
                                :value="index + 1"
                              />
                            </el-select>
                            <span style="min-width: 120px; font-size: 12px; color: var(--el-text-color-secondary);">
                              当前: {{ replayCurrentIndex + 1 }} / {{ replayDisplayMessages.length }}
                            </span>
                          </div>
                        </div>
                      </el-form-item>
                    </el-form>

                    <!-- 回放显示区域 -->
                    <div v-if="replaySession" class="replay-display" style="margin-top: 20px;">
                      <el-scrollbar height="500px">
                        <div
                          v-for="(message, index) in replayDisplayMessages"
                          :key="message.id"
                          :data-replay-message-id="message.id"
                          class="replay-message-item"
                          :class="{
                            'replay-message-user': message.role === 'user',
                            'replay-message-assistant': message.role === 'assistant',
                            'replay-message-tool': message.role === 'tool',
                            'replay-message-replaying': message.isReplaying,
                            'replay-message-replayed': message.isReplayed,
                            'replay-message-pending': index > replayCurrentIndex
                          }"
                          :style="getReplayMessageItemStyle(index)"
                        >
                          <div class="replay-message-header">
                            <el-tag size="small" :type="getMessageRoleTagType(message.role)">
                              {{ getMessageRoleLabel(message.role) }}
                            </el-tag>
                            <span class="replay-message-time">{{ formatTime(message.timestamp) }}</span>
                            <el-tag v-if="message.isReplaying" size="small" type="warning" effect="dark">
                              回放中
                            </el-tag>
                            <el-tag v-if="message.isReplayed" size="small" type="success">
                              已回放
                            </el-tag>
                            <!-- 显示解析出的工具调用 -->
                            <template v-if="getParsedToolCalls(message).length > 0">
                              <el-tag
                                v-for="(toolCall, idx) in getParsedToolCalls(message)"
                                :key="idx"
                                size="small"
                                :type="toolCall.isValid ? 'info' : 'danger'"
                                effect="plain"
                                style="margin-left: 8px;"
                                :title="toolCall.isValid ? `工具ID: ${toolCall.tool_id}` : `错误: ${toolCall.error || '未知错误'}`"
                              >
                                {{ toolCall.isValid ? `工具: ${toolCall.tool_id}` : `解析错误` }}
                              </el-tag>
                              <el-tag
                                v-if="getParsedToolCalls(message).length > 1"
                                size="small"
                                type="info"
                                effect="plain"
                                style="margin-left: 8px;"
                              >
                                共 {{ getParsedToolCalls(message).length }} 个工具调用
                              </el-tag>
                            </template>
                          </div>
                          <div class="replay-message-content">
                            <div v-if="message.type === 'chat' && message.role === 'assistant'">
                              <!-- 回放中显示流式内容，已回放显示完整内容 -->
                              <pre :style="messageContentStyle">{{ message.isReplaying ? (message.displayContent || '') : (message.markdown || '') }}</pre>
                            </div>
                            <div v-else-if="message.type === 'chat' && message.role === 'user'">
                              <pre :style="messageContentStyle">{{ (message as any).markdown || '' }}</pre>
                            </div>
                            <div v-else-if="message.type === 'tool' && message.role === 'tool'">
                              <!-- 使用 AgentToolResultCard 显示工具消息 -->
                              <AgentToolResultCard
                                :message="message as ToolAgentMessage"
                                :messages="replayDisplayMessages as any"
                                :message-index="index"
                              />
                            </div>
                            <div v-else>
                              <pre :style="messageContentStyle">{{ formatResult(message) }}</pre>
                            </div>
                          </div>
                        </div>
                        <div v-if="replayDisplayMessages.length === 0" class="test-empty">
                          暂无消息
                        </div>
                      </el-scrollbar>
                    </div>
                    <div v-else class="test-empty" style="margin-top: 20px;">
                      请先导入会话JSON文件
                    </div>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </div>
          </div>
          </transition>
        </el-card>
      </div>
    </div>

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
import { Plus, Delete, Edit, InfoFilled, Search, Download, Upload, Connection, Refresh, Tools, Document, Setting, VideoPlay, ChatDotRound } from '@element-plus/icons-vue';
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
import { useWorkspace } from '../../stores/workspace';
import { agentSessionManager } from '../../utils/agent-framework/agent-session-manager';
import { agentEngineManager } from '../../utils/agent-framework/agent-engine-manager';
import { agentConfigManager } from '../../utils/agent-framework/agent-config-manager';
import { AgentEngineExecutorFactory } from '../../utils/agent-framework/agent-engine-executor';
import type { AgentSession, ToolAgentMessage } from '../../types/agent';
import type { AgentMessage } from '../../types/agent';
import { cloneDeep } from 'lodash';
import { ToolRunner } from '../../utils/agent-framework/tool-runner';
import { ref as vueRef } from 'vue';
import AgentToolResultCard from '../../components/agent/AgentToolResultCard.vue';
import { parseToolCalls } from '../../utils/agent-framework/tool-call-processor';
import type { ParsedToolCall } from '../../utils/agent-framework/tool-call-processor';

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

// 处理菜单选择
const handleMenuSelect = (key: string) => {
  activeTab.value = key;
};

// 获取当前Tab标题
const getCurrentTabTitle = () => {
  const titles: Record<string, string> = {
    'eventbus': t('setting.debug.eventBus'),
    'updatetest': '更新测试',
    'agenttool': 'Agent Tool测试',
    'importsnapshot': t('setting.debug.importSnapshot'),
    'autotest': 'Tool自动测试',
    'unittest': t('setting.debug.unitTest.title'),
    'agentsessiondebug': 'Agent会话调试'
  };
  return titles[activeTab.value] || '调试工具';
};
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
  selectedModules: [] as string[],
  contextTabId: '' // 上下文Tab ID（用于模拟文档上下文）
});

const unitTestBatchRunning = ref(false);
const unitTestBatchResults = ref<UnitTestResult[]>([]);
const unitTestBatchProgress = ref(0);
const unitTestBatchCurrentTest = ref('');
const unitTestBatchAbortController = ref<AbortController | null>(null);

// Agent Tool测试相关
const toolTestForm = reactive({
  toolId: '',
  paramsJson: '{}',
  contextTabId: '' // 上下文Tab ID（用于模拟文档上下文）
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
  selectedTools: [] as string[],
  contextTabId: '' // 上下文Tab ID（用于模拟文档上下文）
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

// Agent会话调试相关
const workspace = useWorkspace();
const agentSessionDebugForm = reactive({
  tabId: '',
  sessionId: ''
});
const sessionDebugActiveTab = ref('nodes');
const agentSessionDebugActiveTab = ref('debug');
const workspaceTabs = computed(() => workspace.tabs);

// 获取文档类型的tabs（用于上下文选择）
const documentTabs = computed(() => {
  return workspace.tabs.filter(tab => {
    // 只返回文档类型的tabs（不是tool或system类型）
    return tab.kind !== 'tool' && tab.kind !== 'system';
  });
});

// 会话回放相关
const sessionReplayForm = reactive({});
const replaySession = ref<AgentSession | null>(null);
const replayDisplayMessages = ref<Array<{
  id: string;
  role: string;
  type: string;
  timestamp: string | number;
  markdown?: string;
  displayContent?: string;
  isReplaying?: boolean;
  isReplayed?: boolean;
  [key: string]: any;
}>>([]);
const isReplaying = ref(false);
const replaySpeed = ref(1); // 回放速度倍数
const replayAbortController = ref<AbortController | null>(null);
const replayCurrentIndex = ref(-1); // 当前回放到的消息索引
const replayStartIndex = ref(0); // 回放起始索引
const availableSessions = computed(() => {
  if (!agentSessionDebugForm.tabId) {
    return [];
  }
  // documents 是一个 Record<string, WorkspaceDocument>，需要通过 tabId 直接访问
  const doc = workspace.documents[agentSessionDebugForm.tabId];
  if (!doc || !doc.agentSessions) {
    return [];
  }
  // 转换旧的AgentSession格式到新格式（如果需要）
  return (doc.agentSessions as AgentSession[]).map(session => {
    // 如果session已经有executionNodes，直接返回
    // 否则，确保基本字段存在
    return {
      ...session,
      executionNodes: session.executionNodes || [],
      referenceStore: session.referenceStore || [],
      messageQueue: session.messageQueue || [],
      publicContext: session.publicContext || {},
      status: session.status || 'idle'
    };
  });
});
const selectedSession = computed(() => {
  if (!agentSessionDebugForm.sessionId) {
    return null;
  }
  return availableSessions.value.find(s => s.id === agentSessionDebugForm.sessionId) || null;
});

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

// 格式化时间（支持number时间戳或string ISO格式）
const formatTime = (timestamp: number | string) => {
  let date: Date;
  if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    date = new Date(timestamp);
  }
  
  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    return '无效时间';
  }
  
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
  
  // 保存原始活动Tab ID，用于恢复
  const originalActiveTabId = workspace.activeTabId.value;
  let shouldRestoreTab = false;
  
  // 创建当前执行项的时间戳（在try块外部定义，以便在catch块中使用）
  const entryTimestamp = Date.now();
  let invocationId: string | undefined = undefined;
  
  try {
    // 解析参数
    let params: Record<string, any> = {};
    try {
      params = JSON.parse(toolTestForm.paramsJson || '{}');
    } catch (error) {
      ElMessage.error('参数JSON格式错误');
      throw error; // 抛出错误而不是return，确保finally块执行
    }

    // 如果指定了上下文Tab，临时激活它
    if (toolTestForm.contextTabId) {
      // 检查tab是否存在
      const contextTab = workspace.tabs.find(tab => tab.id === toolTestForm.contextTabId);
      if (!contextTab) {
        ElMessage.error(`指定的上下文Tab不存在: ${toolTestForm.contextTabId}`);
        throw new Error(`指定的上下文Tab不存在: ${toolTestForm.contextTabId}`);
      }
      
      // 如果tab不是文档类型，提示错误
      if (contextTab.kind === 'tool' || contextTab.kind === 'system') {
        ElMessage.error('上下文Tab必须是文档类型的Tab，不能是工具Tab或系统Tab');
        throw new Error('上下文Tab必须是文档类型的Tab，不能是工具Tab或系统Tab');
      }
      
      // 临时激活上下文Tab
      workspace.activateTab(toolTestForm.contextTabId);
      shouldRestoreTab = true;
      
      // 如果params中没有tabId，也添加tabId参数（某些工具可能需要）
      if (!params.tabId) {
        params.tabId = toolTestForm.contextTabId;
      }
    }

    const tool = agentToolManager.getTool(toolTestForm.toolId);
    if (!tool) {
      throw new Error('Tool不存在');
    }

    // 创建当前执行项，实时更新
    
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
    ElMessage.error(`执行失败: ${errorMessage}`);
    
    // 更新当前项为失败状态
    const errorIndex = toolTestHistory.value.findIndex(entry => 
      entry.toolId === toolTestForm.toolId && entry.timestamp === entryTimestamp
    );
    if (errorIndex !== -1) {
      const oldEntry = toolTestHistory.value[errorIndex];
      toolTestHistory.value.splice(errorIndex, 1, {
        ...oldEntry,
        status: 'failed' as any,
        error: errorMessage
      });
    } else {
      // 如果找不到entry，创建一个新的失败记录
      const tool = agentToolManager.getTool(toolTestForm.toolId);
      if (tool) {
        toolTestHistory.value.unshift({
          toolId: toolTestForm.toolId,
          toolName: getToolDisplayName(tool.config),
          timestamp: Date.now(),
          status: 'failed' as any,
          params: JSON.parse(toolTestForm.paramsJson || '{}'),
          error: errorMessage
        });
      }
    }
  } finally {
    // 恢复原始活动Tab（如果之前临时激活了上下文Tab）
    if (shouldRestoreTab && originalActiveTabId) {
      // 检查原始tab是否还存在
      const originalTab = workspace.tabs.find(tab => tab.id === originalActiveTabId);
      if (originalTab) {
        workspace.activateTab(originalActiveTabId);
      }
    }
    
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
    
    // 如果指定了上下文Tab，且params中没有tabId，则添加tabId
    if (autoTestForm.contextTabId && !processed.tabId) {
      processed.tabId = autoTestForm.contextTabId;
    }
    
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
      // 若用例标记为 expectError（应返回错误），则工具返回 failed 时视为通过
      const expectError = !!(testCase as { expectError?: boolean }).expectError;
      if (expectError && result.status === 'failed') {
        testResult.passed = true;
        testResult.result = result.data || result.result;
      } else if (result.status === 'succeeded') {
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
  
  // 保存原始活动Tab ID，用于恢复
  const originalActiveTabId = workspace.activeTabId.value;
  let shouldRestoreTab = false;
  
  // 如果指定了上下文Tab，验证并临时激活
  if (autoTestForm.contextTabId) {
    const contextTab = workspace.tabs.find(tab => tab.id === autoTestForm.contextTabId);
    if (!contextTab) {
      ElMessage.error(`指定的上下文Tab不存在: ${autoTestForm.contextTabId}`);
      return;
    }
    
    if (contextTab.kind === 'tool' || contextTab.kind === 'system') {
      ElMessage.error('上下文Tab必须是文档类型的Tab，不能是工具Tab或系统Tab');
      return;
    }
    
    workspace.activateTab(autoTestForm.contextTabId);
    shouldRestoreTab = true;
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
    // 恢复原始活动Tab（如果之前临时激活了上下文Tab）
    if (shouldRestoreTab && originalActiveTabId) {
      const originalTab = workspace.tabs.find(tab => tab.id === originalActiveTabId);
      if (originalTab) {
        workspace.activateTab(originalActiveTabId);
      }
    }
    
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
  
  // 保存原始活动Tab ID，用于恢复
  const originalActiveTabId = workspace.activeTabId.value;
  let shouldRestoreTab = false;
  
  // 如果指定了上下文Tab，验证并临时激活
  if (unitTestBatchForm.contextTabId) {
    const contextTab = workspace.tabs.find(tab => tab.id === unitTestBatchForm.contextTabId);
    if (!contextTab) {
      ElMessage.error(`指定的上下文Tab不存在: ${unitTestBatchForm.contextTabId}`);
      return;
    }
    
    if (contextTab.kind === 'tool' || contextTab.kind === 'system') {
      ElMessage.error('上下文Tab必须是文档类型的Tab，不能是工具Tab或系统Tab');
      return;
    }
    
    workspace.activateTab(unitTestBatchForm.contextTabId);
    shouldRestoreTab = true;
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
    // 恢复原始活动Tab（如果之前临时激活了上下文Tab）
    if (shouldRestoreTab && originalActiveTabId) {
      const originalTab = workspace.tabs.find(tab => tab.id === originalActiveTabId);
      if (originalTab) {
        workspace.activateTab(originalActiveTabId);
      }
    }
    
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

// Agent会话调试相关函数
const handleSessionDebugTabChange = () => {
  agentSessionDebugForm.sessionId = '';
};

const handleSessionDebugSessionChange = () => {
  // 会话切换时，刷新会话数据
  nextTick(() => {
    if (selectedSession.value) {
      ElMessage.success('会话已加载');
    }
  });
};

// 导入会话JSON
const handleImportSessionJson = () => {
  if (!agentSessionDebugForm.tabId) {
    ElMessage.warning('请先选择文档');
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // 支持两种格式：
      // 1. 直接是会话对象 { session: AgentSession, dependencies?: ... }
      // 2. 直接是会话对象 AgentSession
      let sessionData: any;
      if (data.session) {
        sessionData = data;
      } else if (data.id && data.messages) {
        // 看起来是直接的会话对象
        sessionData = { session: data };
      } else {
        throw new Error('无效的会话文件格式');
      }

      const session = agentSessionManager.deserializeSession(sessionData, {
        importDependencies: true,
        overwriteDependencies: false
      });

      // 转换为旧格式
      const legacySession: AgentSession = {
        id: session.id,
        title: session.title,
        description: session.description,
        createdAt: typeof session.createdAt === 'number' 
          ? new Date(session.createdAt).toISOString() 
          : session.createdAt,
        updatedAt: typeof session.updatedAt === 'number' 
          ? new Date(session.updatedAt).toISOString() 
          : session.updatedAt,
        messages: session.messages,
        activeToolIds: [], // 初始状态：所有工具都不高亮，等待意图识别器判断
        agentConfigId: session.agentConfigId,
        messageQueue: session.messageQueue || [],
        referenceStore: session.referenceStore || [],
        publicContext: session.publicContext || {},
        executionNodes: session.executionNodes || [],
        currentExecutionNodeId: session.currentExecutionNodeId,
        status: session.status || 'idle'
      };

      // 获取文档并添加会话
      const doc = workspace.ensureDocument(agentSessionDebugForm.tabId);
      if (!doc.agentSessions) {
        doc.agentSessions = [];
      }
      
      // 检查是否已存在相同ID的会话
      const existingIndex = doc.agentSessions.findIndex(s => s.id === legacySession.id);
      if (existingIndex !== -1) {
        // 询问是否覆盖
        try {
          await ElMessageBox.confirm(
            `会话 "${legacySession.title}" 已存在，是否覆盖？`,
            '确认覆盖',
            { type: 'warning' }
          );
          doc.agentSessions[existingIndex] = legacySession;
        } catch {
          // 用户取消
          return;
        }
      } else {
        doc.agentSessions.unshift(legacySession);
      }

      // 更新文档
      workspace.updateDocumentAgentSessions(agentSessionDebugForm.tabId, doc.agentSessions, false);
      
      // 自动选择导入的会话
      agentSessionDebugForm.sessionId = legacySession.id;
      
      ElMessage.success('会话导入成功');
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    }
  };
  input.click();
};

// 回溯到指定节点
const handleRevertToNode = async (nodeId: string) => {
  if (!selectedSession.value || !agentSessionDebugForm.tabId) {
    ElMessage.warning('请先选择会话');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确定要回溯到节点 ${nodeId.substring(0, 16)}... 吗？此操作将删除该节点之后的所有内容。`,
      '确认回溯',
      { type: 'warning' }
    );

    // 转换为新格式的会话
    const session = selectedSession.value;
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt: typeof session.createdAt === 'string' ? new Date(session.createdAt).getTime() : session.createdAt,
      updatedAt: typeof session.updatedAt === 'string' ? new Date(session.updatedAt).getTime() : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    };

    // 执行回溯
    agentSessionManager.revertToNode(newFormatSession, nodeId);

    // 更新文档中的会话
    const doc = workspace.documents[agentSessionDebugForm.tabId];
    if (doc && doc.agentSessions) {
      const sessions = doc.agentSessions as AgentSession[];
      const sessionIndex = sessions.findIndex(s => s.id === session.id);
      if (sessionIndex !== -1) {
        // 转换回旧格式
        const legacySession: AgentSession = {
          id: newFormatSession.id,
          title: newFormatSession.title,
          description: newFormatSession.description,
          createdAt: new Date(newFormatSession.createdAt).toISOString(),
          updatedAt: new Date(newFormatSession.updatedAt).toISOString(),
          messages: newFormatSession.messages,
          activeToolIds: session.activeToolIds || [],
          agentConfigId: newFormatSession.agentConfigId,
          messageQueue: newFormatSession.messageQueue,
          referenceStore: newFormatSession.referenceStore,
          publicContext: newFormatSession.publicContext,
          executionNodes: newFormatSession.executionNodes,
          currentExecutionNodeId: newFormatSession.currentExecutionNodeId,
          status: newFormatSession.status
        };
        sessions[sessionIndex] = legacySession;
        workspace.updateDocumentAgentSessions(agentSessionDebugForm.tabId, sessions, false);
      }
    }

    ElMessage.success('已回溯到指定节点');
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    }
  }
};

// 重新执行消息（真正触发Agent执行）
const handleReplayMessage = async (messageId: string) => {
  if (!selectedSession.value || !agentSessionDebugForm.tabId) {
    ElMessage.warning('请先选择会话');
    return;
  }

  try {
    await ElMessageBox.confirm(
      '确定要重新执行此消息吗？此操作将删除该消息之后的所有内容，然后重新触发Agent执行。',
      '确认重新执行',
      { type: 'warning' }
    );

    const session = selectedSession.value;
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt: typeof session.createdAt === 'string' ? new Date(session.createdAt).getTime() : session.createdAt,
      updatedAt: typeof session.updatedAt === 'string' ? new Date(session.updatedAt).getTime() : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    };

    // 执行消息重放（会删除该消息之后的内容）
    await agentSessionManager.replayMessage(newFormatSession, messageId);

    // 找到用户消息内容
    const userMessage = newFormatSession.messages.find((m: any) => m.id === messageId);
    if (!userMessage || userMessage.role !== 'user' || userMessage.type !== 'chat') {
      ElMessage.error('无法找到用户消息');
      return;
    }

    const messageContent = (userMessage as any).markdown || '';

    // 获取引擎和配置
    const defaultEngineId = agentEngineManager.getDefaultEngine()?.id || 'default-autogpt-engine';
    const engine = agentEngineManager.getEngine(defaultEngineId);
    if (!engine) {
      ElMessage.error('未找到Agent引擎');
      return;
    }

    const agentConfig = agentConfigManager.getConfig(newFormatSession.agentConfigId);
    if (!agentConfig) {
      ElMessage.error('未找到Agent配置');
      return;
    }

    // 创建执行器并执行
    const abortController = new AbortController();
    const executor = AgentEngineExecutorFactory.create(
      engine,
      newFormatSession,
      agentConfig,
      {
        signal: abortController.signal,
        onProgress: (progress) => {
          newFormatSession.status = progress.stage as any;
        }
      }
    );

    ElMessage.info('开始重新执行Agent...');
    await executor.execute(messageContent);

    // 更新文档中的会话
    const doc = workspace.documents[agentSessionDebugForm.tabId];
    if (doc && doc.agentSessions) {
      const sessions = doc.agentSessions as AgentSession[];
      const sessionIndex = sessions.findIndex(s => s.id === session.id);
      if (sessionIndex !== -1) {
        const legacySession: AgentSession = {
          id: newFormatSession.id,
          title: newFormatSession.title,
          description: newFormatSession.description,
          createdAt: new Date(newFormatSession.createdAt).toISOString(),
          updatedAt: new Date(newFormatSession.updatedAt).toISOString(),
          messages: newFormatSession.messages,
          activeToolIds: session.activeToolIds || [],
          agentConfigId: newFormatSession.agentConfigId,
          messageQueue: newFormatSession.messageQueue,
          referenceStore: newFormatSession.referenceStore,
          publicContext: newFormatSession.publicContext,
          executionNodes: newFormatSession.executionNodes,
          currentExecutionNodeId: newFormatSession.currentExecutionNodeId,
          status: newFormatSession.status || 'idle'
        };
        sessions[sessionIndex] = legacySession;
        workspace.updateDocumentAgentSessions(agentSessionDebugForm.tabId, sessions, false);
      }
    }

    ElMessage.success('Agent执行完成');
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    }
  }
};

// 重新执行工具调用（从节点）
const handleReplayToolCall = async (nodeId: string) => {
  if (!selectedSession.value || !agentSessionDebugForm.tabId) {
    ElMessage.warning('请先选择会话');
    return;
  }

  const session = selectedSession.value;
  const node = session.executionNodes?.find(n => n.id === nodeId);
  if (!node || node.type !== 'tool-call') {
    ElMessage.warning('节点类型错误，无法重新执行');
    return;
  }

  try {
    await ElMessageBox.confirm(
      '确定要重新执行此工具调用吗？此操作将删除该工具调用之后的所有内容。',
      '确认重新执行',
      { type: 'warning' }
    );

    // 从节点数据中提取toolCallId
    const data = node.data as any;
    const toolCallId = data?.tool_call_id || data?.id;
    if (!toolCallId) {
      ElMessage.error('无法找到工具调用ID');
      return;
    }

    await handleReplayToolCallFromMessage(toolCallId);
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    }
  }
};

// 重新执行工具调用（从消息）
const handleReplayToolCallFromMessage = async (toolCallIdOrMessageId: string) => {
  if (!selectedSession.value || !agentSessionDebugForm.tabId) {
    ElMessage.warning('请先选择会话');
    return;
  }

  try {
    await ElMessageBox.confirm(
      '确定要重新执行此工具调用吗？此操作将删除该工具调用之后的所有内容。',
      '确认重新执行',
      { type: 'warning' }
    );

    const session = selectedSession.value;
    const newFormatSession: any = {
      ...session,
      entityType: 'agent-session',
      createdAt: typeof session.createdAt === 'string' ? new Date(session.createdAt).getTime() : session.createdAt,
      updatedAt: typeof session.updatedAt === 'string' ? new Date(session.updatedAt).getTime() : session.updatedAt,
      messageQueue: session.messageQueue || [],
      referenceStore: session.referenceStore || [],
      publicContext: session.publicContext || {},
      executionNodes: session.executionNodes || [],
      status: session.status || 'idle'
    };

    // 先尝试从消息ID找到toolCallId
    let toolCallId = toolCallIdOrMessageId;
    const toolMessage = session.messages.find(msg => 
      msg.id === toolCallIdOrMessageId && msg.role === 'tool' && msg.type === 'tool'
    );
    if (toolMessage) {
      const toolMsg = toolMessage as any;
      toolCallId = toolMsg.tool_call_id || toolCallId;
    }

    // 执行工具调用重放
    await agentSessionManager.replayToolCall(newFormatSession, toolCallId, async (toolCallData) => {
      // 重新执行工具
      try {
        await ToolRunner.runTool(
          toolCallData.tool_id,
          toolCallData.parameters,
          undefined, // signal
          newFormatSession // session
        );
        ElMessage.success(`工具 ${toolCallData.tool_id} 已重新执行`);
      } catch (error) {
        ElMessage.error(`工具执行失败: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    });

    // 更新文档中的会话
    const doc = workspace.documents[agentSessionDebugForm.tabId];
    if (doc && doc.agentSessions) {
      const sessions = doc.agentSessions as AgentSession[];
      const sessionIndex = sessions.findIndex(s => s.id === session.id);
      if (sessionIndex !== -1) {
        const legacySession: AgentSession = {
          id: newFormatSession.id,
          title: newFormatSession.title,
          description: newFormatSession.description,
          createdAt: new Date(newFormatSession.createdAt).toISOString(),
          updatedAt: new Date(newFormatSession.updatedAt).toISOString(),
          messages: newFormatSession.messages,
          activeToolIds: session.activeToolIds || [],
          agentConfigId: newFormatSession.agentConfigId,
          messageQueue: newFormatSession.messageQueue,
          referenceStore: newFormatSession.referenceStore,
          publicContext: newFormatSession.publicContext,
          executionNodes: newFormatSession.executionNodes,
          currentExecutionNodeId: newFormatSession.currentExecutionNodeId,
          status: newFormatSession.status
        };
        sessions[sessionIndex] = legacySession;
        workspace.updateDocumentAgentSessions(agentSessionDebugForm.tabId, sessions, false);
      }
    }

    ElMessage.success('工具调用已重新执行');
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    }
  }
};

// 辅助函数：获取节点类型标签
const getNodeTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'message': '消息',
    'tool-call': '工具调用',
    'workflow-call': '工作流调用',
    'llm-call': 'LLM调用'
  };
  return labels[type] || type;
};

// 辅助函数：获取节点类型标签颜色
const getNodeTypeTagType = (type: string): string => {
  const types: Record<string, string> = {
    'message': 'info',
    'tool-call': 'warning',
    'workflow-call': 'success',
    'llm-call': 'primary'
  };
  return types[type] || 'info';
};

// 辅助函数：获取节点状态标签
const getNodeStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'pending': '待执行',
    'running': '执行中',
    'succeeded': '成功',
    'failed': '失败',
    'cancelled': '已取消'
  };
  return labels[status] || status;
};

// 辅助函数：获取节点状态标签颜色
const getNodeStatusTagType = (status: string): string => {
  const types: Record<string, string> = {
    'pending': 'info',
    'running': 'warning',
    'succeeded': 'success',
    'failed': 'danger',
    'cancelled': 'info'
  };
  return types[status] || 'info';
};

// 辅助函数：获取消息角色标签
const getMessageRoleLabel = (role: string): string => {
  const labels: Record<string, string> = {
    'user': '用户',
    'assistant': '助手',
    'tool': '工具',
    'system': '系统'
  };
  return labels[role] || role;
};

// 辅助函数：获取消息角色标签颜色
const getMessageRoleTagType = (role: string): string => {
  const types: Record<string, string> = {
    'user': 'primary',
    'assistant': 'success',
    'tool': 'warning',
    'system': 'info'
  };
  return types[role] || 'info';
};

// 辅助函数：获取会话状态标签颜色
const getSessionStatusTagType = (status?: string): string => {
  const types: Record<string, string> = {
    'idle': 'info',
    'thinking': 'warning',
    'generating': 'primary',
    'tool-calling': 'warning',
    'workflow-executing': 'success',
    'waiting-input': 'info',
    'error': 'danger'
  };
  return types[status || 'idle'] || 'info';
};

// 样式计算属性
const executionNodeItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
}));

const messageItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
}));

const replayMessageItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
}));

// 消息内容样式（支持换行）
const messageContentStyle = computed(() => ({
  ...codeBlockStyle.value,
  whiteSpace: 'pre-wrap' as const,
  wordWrap: 'break-word' as const,
  wordBreak: 'break-word' as const,
  overflowWrap: 'break-word' as const,
  maxWidth: '100%',
  overflow: 'hidden' as const
}));

// 导入会话用于回放（不依赖于Tab）
const handleImportSessionForReplay = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // 支持两种格式
      let sessionData: any;
      if (data.session) {
        sessionData = data;
      } else if (data.id && data.messages) {
        sessionData = { session: data };
      } else {
        throw new Error('无效的会话文件格式');
      }

      const session = agentSessionManager.deserializeSession(sessionData, {
        importDependencies: true,
        overwriteDependencies: false
      });

      // 转换为旧格式
      const legacySession: AgentSession = {
        id: session.id,
        title: session.title,
        description: session.description,
        createdAt: typeof session.createdAt === 'number' 
          ? new Date(session.createdAt).toISOString() 
          : session.createdAt,
        updatedAt: typeof session.updatedAt === 'number' 
          ? new Date(session.updatedAt).toISOString() 
          : session.updatedAt,
        messages: session.messages,
        activeToolIds: [],
        agentConfigId: session.agentConfigId,
        messageQueue: session.messageQueue || [],
        referenceStore: session.referenceStore || [],
        publicContext: session.publicContext || {},
        executionNodes: session.executionNodes || [],
        currentExecutionNodeId: session.currentExecutionNodeId,
        status: session.status || 'idle'
      };

      replaySession.value = legacySession;
      
      // 初始化回放消息列表（按时间排序）
      const messages = [...(legacySession.messages || [])].sort((a, b) => {
        const timeA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
        const timeB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
        return timeA - timeB;
      });

      replayDisplayMessages.value = messages.map(msg => ({
        ...msg,
        displayContent: '',
        isReplaying: false,
        isReplayed: false
      }));

      // 重置回放状态
      replayCurrentIndex.value = -1;
      replayStartIndex.value = 0;

      ElMessage.success('会话导入成功，可以开始回放');
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    }
  };
  input.click();
};

// 清除回放会话
const handleClearReplaySession = () => {
  replaySession.value = null;
  replayDisplayMessages.value = [];
  if (replayAbortController.value) {
    replayAbortController.value.abort();
    replayAbortController.value = null;
  }
  isReplaying.value = false;
  replayCurrentIndex.value = -1;
  replayStartIndex.value = 0;
  ElMessage.info('已清除回放会话');
};

// 开始回放
const handleStartReplay = async () => {
  if (!replaySession.value || replayDisplayMessages.value.length === 0) {
    ElMessage.warning('请先导入会话');
    return;
  }

  if (isReplaying.value) {
    return;
  }

  isReplaying.value = true;
  replayAbortController.value = new AbortController();

  try {
    // 确定起始索引
    const startIndex = Math.max(0, Math.min(replayStartIndex.value - 1, replayDisplayMessages.value.length - 1));
    
    // 重置从起始索引开始的消息状态
    for (let i = startIndex; i < replayDisplayMessages.value.length; i++) {
      replayDisplayMessages.value[i].isReplaying = false;
      replayDisplayMessages.value[i].isReplayed = false;
      replayDisplayMessages.value[i].displayContent = '';
    }
    
    // 更新当前索引
    replayCurrentIndex.value = startIndex - 1;

    // 按顺序回放每条消息（从起始索引开始）
    for (let i = startIndex; i < replayDisplayMessages.value.length; i++) {
      if (replayAbortController.value?.signal.aborted) {
        break;
      }

      // 确保前一条消息已完成
      if (i > 0) {
        const prevMessage = replayDisplayMessages.value[i - 1];
        prevMessage.isReplaying = false;
        prevMessage.isReplayed = true;
      }

      const message = replayDisplayMessages.value[i];
      
      // 更新当前索引
      replayCurrentIndex.value = i;
      
      // 使用 nextTick 确保 DOM 更新完成
      await nextTick();
      
      // 标记当前消息为回放中
      message.isReplaying = true;
      message.isReplayed = false;

      // 再次等待 DOM 更新
      await nextTick();

      // 如果是assistant的chat消息，模拟流式输出
      if (message.role === 'assistant' && message.type === 'chat' && message.markdown) {
        const content = message.markdown;
        // 使用字符数组而不是直接操作字符串，避免响应式问题
        const chars = Array.from(content);
        let currentContent = '';

        for (let j = 0; j < chars.length; j++) {
          if (replayAbortController.value?.signal.aborted) {
            break;
          }

          // 累积内容
          currentContent += chars[j];
          
          // 使用 Vue 的响应式更新，但确保只更新当前消息
          // 通过直接赋值而不是引用，避免多个消息同时更新
          const messageIndex = replayDisplayMessages.value.findIndex(m => m.id === message.id);
          if (messageIndex !== -1 && replayDisplayMessages.value[messageIndex].id === message.id) {
            replayDisplayMessages.value[messageIndex].displayContent = currentContent;
          }
          
          // 根据回放速度控制延迟
          const delay = Math.max(10, 100 / (replaySpeed.value * 10)); // 最小延迟10ms，根据速度调整
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // 确保最终内容完整
        const messageIndex = replayDisplayMessages.value.findIndex(m => m.id === message.id);
        if (messageIndex !== -1 && replayDisplayMessages.value[messageIndex].id === message.id) {
          replayDisplayMessages.value[messageIndex].displayContent = content;
        }
      } else {
        // 其他类型的消息直接显示
        const content = message.markdown || JSON.stringify(message, null, 2);
        const messageIndex = replayDisplayMessages.value.findIndex(m => m.id === message.id);
        if (messageIndex !== -1 && replayDisplayMessages.value[messageIndex].id === message.id) {
          replayDisplayMessages.value[messageIndex].displayContent = content;
        }
        // 短暂延迟以显示效果
        await new Promise(resolve => setTimeout(resolve, Math.max(100, 300 / replaySpeed.value)));
      }

      // 标记当前消息为已完成
      message.isReplaying = false;
      message.isReplayed = true;

      // 等待 DOM 更新
      await nextTick();

      // 滚动到当前消息位置（而不是直接跳到底部）
      const messageElement = document.querySelector(`[data-replay-message-id="${message.id}"]`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      
      // 在消息之间添加短暂延迟，确保视觉上清晰
      if (i < replayDisplayMessages.value.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200 / replaySpeed.value));
      }
    }

    // 确保最后一条消息也标记为完成
    if (replayDisplayMessages.value.length > 0) {
      const lastMessage = replayDisplayMessages.value[replayDisplayMessages.value.length - 1];
      lastMessage.isReplaying = false;
      lastMessage.isReplayed = true;
      replayCurrentIndex.value = replayDisplayMessages.value.length - 1;
    }

    ElMessage.success('回放完成');
  } catch (error) {
    if (error !== 'cancel' && !(error instanceof Error && error.name === 'AbortError')) {
      ElMessage.error(error instanceof Error ? error.message : String(error));
    }
  } finally {
    isReplaying.value = false;
    replayAbortController.value = null;
  }
};

// 停止回放
const handleStopReplay = () => {
  if (replayAbortController.value) {
    replayAbortController.value.abort();
    replayAbortController.value = null;
  }
  isReplaying.value = false;
  
  // 标记当前正在回放的消息为已回放
  replayDisplayMessages.value.forEach((msg, index) => {
    if (msg.isReplaying) {
      msg.isReplaying = false;
      msg.isReplayed = true;
    }
    // 更新当前索引到最后一个已回放的消息
    if (msg.isReplayed && index > replayCurrentIndex.value) {
      replayCurrentIndex.value = index;
    }
  });

  ElMessage.info('回放已停止');
};

// 重置回放到开头
const handleResetReplay = () => {
  if (isReplaying.value) {
    ElMessage.warning('请先停止回放');
    return;
  }
  
  // 重置所有消息状态
  replayDisplayMessages.value.forEach(msg => {
    msg.isReplaying = false;
    msg.isReplayed = false;
    msg.displayContent = '';
  });
  
  replayCurrentIndex.value = -1;
  replayStartIndex.value = 0;
  
  ElMessage.info('已重置到开头');
};

// 后退一步
const handleReplayStepBack = () => {
  if (isReplaying.value) {
    ElMessage.warning('请先停止回放');
    return;
  }
  
  if (replayCurrentIndex.value < 0) {
    return;
  }
  
  // 将当前索引的消息标记为未回放
  const currentMsg = replayDisplayMessages.value[replayCurrentIndex.value];
  if (currentMsg) {
    currentMsg.isReplaying = false;
    currentMsg.isReplayed = false;
    currentMsg.displayContent = '';
  }
  
  replayCurrentIndex.value--;
  
  // 将所有后续消息也标记为未回放
  for (let i = replayCurrentIndex.value + 1; i < replayDisplayMessages.value.length; i++) {
    replayDisplayMessages.value[i].isReplaying = false;
    replayDisplayMessages.value[i].isReplayed = false;
    replayDisplayMessages.value[i].displayContent = '';
  }
};

// 前进一步
const handleReplayStepForward = async () => {
  if (isReplaying.value) {
    ElMessage.warning('请先停止回放');
    return;
  }
  
  if (replayCurrentIndex.value >= replayDisplayMessages.value.length - 1) {
    return;
  }
  
  replayCurrentIndex.value++;
  const message = replayDisplayMessages.value[replayCurrentIndex.value];
  
  if (!message) {
    return;
  }
  
  // 标记为正在回放
  message.isReplaying = true;
  await nextTick();
  
  // 如果是assistant的chat消息，显示完整内容
  if (message.role === 'assistant' && message.type === 'chat' && message.markdown) {
    message.displayContent = message.markdown;
  } else {
    message.displayContent = message.markdown || JSON.stringify(message, null, 2);
  }
  
  await nextTick();
  
  // 标记为已回放
  message.isReplaying = false;
  message.isReplayed = true;
  
  // 滚动到当前消息位置
  const messageElement = document.querySelector(`[data-replay-message-id="${message.id}"]`);
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

// 获取回放消息的样式
const getReplayMessageItemStyle = (index: number) => {
  const baseStyle = replayMessageItemStyle.value;
  
  // 如果是未回放的消息（在当前索引之后），添加半透明效果
  if (index > replayCurrentIndex.value) {
    return {
      ...baseStyle,
      opacity: 0.4,
      filter: 'grayscale(0.5)'
    };
  }
  
  return baseStyle;
};

// 解析消息中的工具调用
const getParsedToolCalls = (message: any): ParsedToolCall[] => {
  // 只解析 assistant 的 chat 消息
  if (message.role !== 'assistant' || message.type !== 'chat') {
    return [];
  }
  
  // 获取消息内容（回放中显示流式内容，已回放显示完整内容）
  const content = message.isReplaying 
    ? (message.displayContent || '') 
    : (message.markdown || '');
  
  if (!content) {
    return [];
  }
  
  try {
    // 使用宽松模式解析工具调用（因为回放时可能显示不完整的内容）
    // parseToolCalls 会返回一个数组，包含所有解析出的工具调用（可能多个）
    const parsed = parseToolCalls(content, {
      loose: true, // 宽松模式，允许不完整的标记
      validateToolId: false // 不验证工具ID是否存在
    });
    
    // 确保返回数组（即使解析失败也返回空数组）
    // parsed 可能是 null 或 ParsedToolCall[]，需要统一处理
    if (!parsed || !Array.isArray(parsed)) {
      return [];
    }
    
    // 返回所有解析出的工具调用（可能包含多个）
    return parsed;
  } catch (error) {
    console.error('解析工具调用失败:', error);
    return [];
  }
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
  background-color: v-bind('themeState.currentTheme.background');
}

.debug-layout {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.debug-sidebar {
  width: 220px;
  flex-shrink: 0;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border-right: 1px solid v-bind('themeState.currentTheme.borderColor');
  overflow-y: auto;
  overflow-x: hidden;
}

.debug-menu {
  border-right: none;
  background-color: transparent;
}

.debug-menu :deep(.el-menu-item) {
  height: 48px;
  line-height: 48px;
  margin: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.debug-menu :deep(.el-menu-item:hover) {
  background-color: v-bind('themeState.currentTheme.background');
}

.debug-menu :deep(.el-menu-item.is-active) {
  background-color: v-bind('themeState.currentTheme.primaryColor');
  color: #fff;
}

.debug-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 20px;
  min-width: 0;
}

.debug-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.3s ease;
}

.debug-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.debug-card :deep(.el-card__body) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 20px;
}

.tab-content-wrapper {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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

/* Agent会话调试相关样式 */
.execution-node-item {
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.execution-node-item.current-node {
  border-color: #409eff;
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.3);
}

.execution-node-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.node-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.node-id {
  font-family: monospace;
  font-size: 12px;
  opacity: 0.7;
}

.node-time {
  font-size: 12px;
  opacity: 0.7;
  margin-left: auto;
}

.node-actions {
  display: flex;
  gap: 8px;
}

.node-status {
  margin-bottom: 8px;
}

.node-data {
  margin-top: 8px;
}

.message-item {
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.message-item.user-message {
  border-left: 3px solid #409eff;
}

.message-item.assistant-message {
  border-left: 3px solid #67c23a;
}

.message-item.tool-message {
  border-left: 3px solid #e6a23c;
}

.message-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.message-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.message-type {
  font-size: 12px;
  opacity: 0.7;
}

.message-id {
  font-family: monospace;
  font-size: 12px;
  opacity: 0.7;
}

.message-time {
  font-size: 12px;
  opacity: 0.7;
  margin-left: auto;
}

.message-actions {
  display: flex;
  gap: 8px;
}

.message-content {
  margin-top: 8px;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  word-wrap: break-word;
  word-break: break-word;
}

.message-content pre {
  white-space: pre-wrap !important;
  word-wrap: break-word !important;
  word-break: break-word !important;
  overflow-wrap: break-word !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
}

.session-debug-details {
  margin-top: 20px;
}

/* 回放相关样式 */
.replay-display {
  margin-top: 20px;
}

.replay-message-item {
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.replay-message-item.replay-message-user {
  border-left: 3px solid #409eff;
}

.replay-message-item.replay-message-assistant {
  border-left: 3px solid #67c23a;
}

.replay-message-item.replay-message-tool {
  border-left: 3px solid #e6a23c;
}

.replay-message-item.replay-message-replaying {
  background-color: rgba(64, 158, 255, 0.1);
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.3);
  animation: replay-pulse 1s ease-in-out infinite;
}

.replay-message-item.replay-message-replayed {
  opacity: 1;
}

.replay-message-item.replay-message-pending {
  opacity: 0.4;
  filter: grayscale(0.5);
  transition: opacity 0.3s ease, filter 0.3s ease;
}

@keyframes replay-pulse {
  0%, 100% {
    box-shadow: 0 0 8px rgba(64, 158, 255, 0.3);
  }
  50% {
    box-shadow: 0 0 16px rgba(64, 158, 255, 0.5);
  }
}

.replay-message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.replay-message-time {
  font-size: 12px;
  opacity: 0.7;
  margin-left: auto;
}

.replay-message-content {
  margin-top: 8px;
}
</style>

