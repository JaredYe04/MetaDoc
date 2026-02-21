<template>
  <div class="llm-settings">
    <!-- 全局设置（不依赖配置） -->
    <div class="global-settings-section">
      <h3 class="section-title">{{ t('setting.llmSettings') }}</h3>
      <el-form label-width="200px" class="settings-form">
        <el-form-item :label="t('setting.enableLlm')">
          <el-switch
            v-model="settings.llmEnabled"
            class="mb-2"
            :active-text="t('setting.enabled')"
            :inactive-text="t('setting.disabled')"
            @change="handleLlmToggle"
          />
        </el-form-item>
        <el-form-item :label="t('setting.llmTemperature')">
          <el-tooltip :content="t('setting.llmTemperatureHint')" placement="top">
            <NumberField
              v-model="settings.llmTemperature"
              :min="0"
              :max="2"
              :step="0.1"
              @update:modelValue="saveSetting('llmTemperature', settings.llmTemperature)"
              class="number-field-wrapper"
            >
              <NumberFieldInput />
            </NumberField>
          </el-tooltip>
        </el-form-item>
        <el-form-item :label="t('setting.removeThinkTag')">
          <el-switch
            v-model="settings.autoRemoveThinkTag"
            class="mb-2"
            :active-text="t('setting.enabled')"
            :inactive-text="t('setting.disabled')"
            @change="saveSetting('autoRemoveThinkTag', settings.autoRemoveThinkTag)"
          />
        </el-form-item>
      </el-form>
    </div>

    <div v-if="settings.llmEnabled" class="llm-settings__content">
      <div class="llm-config-layout">
        <!-- 左侧：配置列表 -->
        <section class="config-list-pane">
          <header class="pane-header">
            <h3>{{ t('setting.llmConfigList') }}</h3>
            <div class="actions">
              <el-tooltip :content="t('setting.newConfig')">
                <el-button
                  size="small"
                  type="primary"
                  :icon="Plus"
                  circle
                  @click="handleCreateConfig"
                  :disabled="settings.selectedLlm === 'manual'"
                />
              </el-tooltip>
              <el-tooltip :content="t('setting.importConfig')">
                <el-button
                  size="small"
                  :icon="DocumentCopy"
                  circle
                  @click="importDialogVisible = true"
                />
              </el-tooltip>
              <el-tooltip :content="t('setting.exportAllConfigs')">
                <el-button size="small" :icon="Download" circle @click="handleExportAllConfigs" />
              </el-tooltip>
            </div>
          </header>
          <el-scrollbar class="config-scroll">
            <el-radio-group
              v-model="currentConfigId"
              class="config-list"
              @change="handleConfigSwitch"
              @dragover.prevent="handleListDragOver"
              @drop.prevent="handleListDrop"
            >
              <el-radio
                v-for="config in llmConfigs"
                :key="config.id"
                :value="config.id"
                class="config-item"
                :class="{
                  dragging: draggingConfigId === config.id,
                  'drop-before':
                    dropPreview.targetId === config.id && dropPreview.mode === 'before',
                  'drop-after': dropPreview.targetId === config.id && dropPreview.mode === 'after'
                }"
                :data-config-id="config.id"
                @dragover.prevent="handleDragOver(config.id, $event)"
                @drop.prevent="handleDrop(config.id, $event)"
              >
                <template #default>
                  <div
                    class="config-item-wrapper"
                    draggable="true"
                    @dragstart.stop="handleDragStart(config.id, $event)"
                    @dragover.prevent="handleDragOver(config.id, $event)"
                    @dragleave="handleDragLeave($event)"
                    @drop.stop.prevent="handleDrop(config.id, $event)"
                    @dragend.stop="handleDragEnd"
                  >
                    <div class="config-item__content">
                      <span class="config-title">{{ getConfigDisplayName(config) }}</span>
                      <el-tag
                        v-if="currentConfigId === config.id && hasUnsavedChanges"
                        size="small"
                        type="warning"
                        effect="plain"
                      >
                        {{ t('setting.unsavedChanges') }}
                      </el-tag>
                    </div>
                    <div class="config-item__actions">
                      <el-button
                        text
                        circle
                        size="small"
                        class="more-btn"
                        @click.stop="toggleConfigMenu(config.id)"
                      >
                        <el-icon><MoreFilled /></el-icon>
                      </el-button>
                      <transition name="fade">
                        <div v-if="openConfigMenuId === config.id" class="config-menu" @click.stop>
                          <button
                            type="button"
                            class="config-menu__item"
                            @click="handleConfigMenuAction('export', config)"
                          >
                            {{ t('setting.exportConfig') }}
                          </button>
                          <button
                            v-if="config.isDefault"
                            type="button"
                            class="config-menu__item"
                            @click="handleConfigMenuAction('reset', config)"
                          >
                            {{ t('setting.resetConfig') }}
                          </button>
                          <button
                            v-if="!config.isDefault"
                            type="button"
                            class="config-menu__item danger"
                            @click="handleConfigMenuAction('delete', config)"
                            :disabled="llmConfigs.length <= 1"
                          >
                            {{ t('setting.deleteConfig') }}
                          </button>
                        </div>
                      </transition>
                    </div>
                  </div>
                </template>
              </el-radio>
            </el-radio-group>
          </el-scrollbar>
        </section>

        <!-- 右侧：配置项表单 -->
        <section class="config-form-pane">
          <!-- 工作区操作栏 -->
          <div v-if="currentConfigId" class="workspace-toolbar">
            <div class="workspace-status">
              <el-tag v-if="hasUnsavedChanges" type="warning" size="small">
                {{ t('setting.hasUnsavedChanges') }}
              </el-tag>
              <span v-else class="workspace-status-text">{{ t('setting.allChangesSaved') }}</span>
            </div>
            <div class="workspace-actions">
              <el-button size="small" @click="handleDiscardChanges" :disabled="!hasUnsavedChanges">
                {{ t('setting.discardChanges') }}
              </el-button>
              <el-button
                size="small"
                type="primary"
                @click="handleSaveChanges"
                :disabled="!hasUnsavedChanges"
              >
                {{ t('setting.saveChanges') }}
              </el-button>
            </div>
          </div>
          <el-scrollbar class="config-form-scroll">
            <el-form label-width="160px" class="settings-form">
              <el-form-item :label="t('setting.llmType')">
                <el-select
                  v-model="settings.selectedLlm"
                  :placeholder="t('setting.chooseLlm')"
                  @change="handleLlmTypeChange"
                >
                  <el-tooltip :content="t('setting.metadocHint')" placement="left">
                    <el-option :label="t('setting.metadoc')" value="metadoc" />
                  </el-tooltip>
                  <el-tooltip :content="t('setting.ollamaHint')" placement="left">
                    <el-option :label="t('setting.ollama')" value="ollama" />
                  </el-tooltip>
                  <el-tooltip :content="t('setting.openaiHint')" placement="left">
                    <el-option :label="t('setting.openai')" value="openai" />
                  </el-tooltip>
                  <el-tooltip :content="t('setting.openaiOfficialHint')" placement="left">
                    <el-option :label="t('setting.openaiOfficial')" value="openai-official" />
                  </el-tooltip>
                  <el-tooltip :content="t('setting.deepseekHint')" placement="left">
                    <el-option :label="t('setting.deepseek')" value="deepseek" />
                  </el-tooltip>
                  <el-tooltip :content="t('setting.geminiHint')" placement="left">
                    <el-option :label="t('setting.gemini')" value="gemini" />
                  </el-tooltip>
                  <el-tooltip v-if="isDev" :content="t('setting.manualHint')" placement="left">
                    <el-option :label="t('setting.manual')" value="manual" />
                  </el-tooltip>
                </el-select>
              </el-form-item>

              <template v-if="settings.selectedLlm === 'ollama'">
                <el-form-item :label="t('setting.apiBaseUrl')">
                  <el-input
                    v-model="settings.ollama.apiUrl"
                    :placeholder="t('setting.ollamaApiUrl')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item :label="t('setting.chooseModel')">
                  <el-select
                    v-model="settings.ollama.selectedModel"
                    :placeholder="t('setting.chooseModel')"
                    @click="fetchOllamaModels"
                    @change="handleFieldChange"
                  >
                    <el-option
                      v-for="model in ollamaModels"
                      :key="model.model"
                      :label="model.name"
                      :value="model.model"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item :label="t('setting.enableMaxTokens')">
                  <el-switch
                    v-model="settings.ollama.enableMaxTokens"
                    class="mb-2"
                    :active-text="t('setting.enabled')"
                    :inactive-text="t('setting.disabled')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item
                  v-if="settings.ollama.enableMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.ollama.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="number-field-wrapper"
                  >
                    <NumberFieldInput />
                  </NumberField>
                </el-form-item>
              </template>

              <template v-else-if="settings.selectedLlm === 'openai'">
                <el-form-item :label="t('setting.apiBaseUrl')">
                  <el-input
                    v-model="settings.openai.apiUrl"
                    :placeholder="t('setting.openaiApiUrl')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item :label="t('setting.apiKey')">
                  <el-input
                    v-model="settings.openai.apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item :label="t('setting.chooseModel')">
                  <el-select
                    v-model="settings.openai.selectedModel"
                    :placeholder="t('setting.chooseModel')"
                    @click="fetchOpenAIModels"
                    @change="handleFieldChange"
                  >
                    <el-option
                      v-for="model in openaiModels"
                      :key="model.id"
                      :label="model.id"
                      :value="model.id"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item>
                  <el-input
                    v-model="settings.openai.completionSuffix"
                    :placeholder="t('setting.completionSuffix')"
                    @change="handleFieldChange"
                  />
                  <div style="height: 40px"></div>
                  <el-input
                    v-model="settings.openai.chatSuffix"
                    :placeholder="t('setting.chatSuffix')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item :label="t('setting.enableMaxTokens')">
                  <el-switch
                    v-model="settings.openai.enableMaxTokens"
                    class="mb-2"
                    :active-text="t('setting.enabled')"
                    :inactive-text="t('setting.disabled')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item
                  v-if="settings.openai.enableMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.openai.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="number-field-wrapper"
                  >
                    <NumberFieldInput />
                  </NumberField>
                </el-form-item>
              </template>

              <template v-else-if="settings.selectedLlm === 'openai-official'">
                <el-form-item :label="t('setting.apiKey')">
                  <el-input
                    v-model="settings['openai-official'].apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item :label="t('setting.chooseModel')">
                  <el-select
                    v-model="settings['openai-official'].selectedModel"
                    :placeholder="t('setting.chooseModel')"
                    @click="fetchOpenAIOfficialModels"
                    @change="handleFieldChange"
                  >
                    <el-option
                      v-for="model in openaiOfficialModels"
                      :key="model.id"
                      :label="model.id"
                      :value="model.id"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item :label="t('setting.enableMaxTokens')">
                  <el-switch
                    v-model="settings['openai-official'].enableMaxTokens"
                    class="mb-2"
                    :active-text="t('setting.enabled')"
                    :inactive-text="t('setting.disabled')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item
                  v-if="settings['openai-official'].enableMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings['openai-official'].maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="number-field-wrapper"
                  >
                    <NumberFieldInput />
                  </NumberField>
                </el-form-item>
              </template>

              <template v-else-if="settings.selectedLlm === 'deepseek'">
                <el-form-item :label="t('setting.apiKey')">
                  <el-input
                    v-model="settings.deepseek.apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item :label="t('setting.chooseModel')">
                  <el-select
                    v-model="settings.deepseek.selectedModel"
                    :placeholder="t('setting.chooseModel')"
                    @change="handleFieldChange"
                  >
                    <el-option label="deepseek-chat" value="deepseek-chat" />
                    <el-option label="deepseek-reasoner" value="deepseek-reasoner" />
                  </el-select>
                </el-form-item>
                <el-form-item :label="t('setting.enableMaxTokens')">
                  <el-switch
                    v-model="settings.deepseek.enableMaxTokens"
                    class="mb-2"
                    :active-text="t('setting.enabled')"
                    :inactive-text="t('setting.disabled')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item
                  v-if="settings.deepseek.enableMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.deepseek.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="number-field-wrapper"
                  >
                    <NumberFieldInput />
                  </NumberField>
                </el-form-item>
              </template>

              <template v-else-if="settings.selectedLlm === 'gemini'">
                <el-form-item :label="t('setting.apiKey')">
                  <el-input
                    v-model="settings.gemini.apiKey"
                    type="password"
                    :placeholder="t('setting.geminiApiKeyPlaceholder')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item :label="t('setting.chooseModel')">
                  <el-select
                    v-model="settings.gemini.selectedModel"
                    :placeholder="t('setting.chooseModel')"
                    @click="fetchGeminiModels"
                    @change="handleFieldChange"
                  >
                    <el-option
                      v-for="model in geminiModels"
                      :key="model.name"
                      :label="model.displayName || model.name"
                      :value="model.name"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item :label="t('setting.enableMaxTokens')">
                  <el-switch
                    v-model="settings.gemini.enableMaxTokens"
                    class="mb-2"
                    :active-text="t('setting.enabled')"
                    :inactive-text="t('setting.disabled')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item
                  v-if="settings.gemini.enableMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.gemini.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="number-field-wrapper"
                  >
                    <NumberFieldInput />
                  </NumberField>
                </el-form-item>
              </template>

              <template v-else-if="settings.selectedLlm === 'metadoc'">
                <el-form-item :label="t('setting.chooseModel')">
                  <el-select
                    v-model="settings.metadoc.selectedModel"
                    :placeholder="t('setting.chooseModel')"
                    @click="fetchMetaDocModels"
                    @change="handleFieldChange"
                  >
                    <el-option
                      v-for="model in metadocModels"
                      :key="model.label"
                      :label="model.label"
                      :value="model.label"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item :label="t('setting.enableMaxTokens')">
                  <el-switch
                    v-model="settings.metadoc.enableMaxTokens"
                    class="mb-2"
                    :active-text="t('setting.enabled')"
                    :inactive-text="t('setting.disabled')"
                    @change="handleFieldChange"
                  />
                </el-form-item>
                <el-form-item
                  v-if="settings.metadoc.enableMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.metadoc.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="number-field-wrapper"
                  >
                    <NumberFieldInput />
                  </NumberField>
                </el-form-item>
              </template>

              <template v-else-if="settings.selectedLlm === 'manual'">
                <el-form-item>
                  <el-alert
                    :title="t('setting.manualConfigHint')"
                    type="info"
                    :closable="false"
                    style="margin-bottom: 16px"
                  />
                </el-form-item>
                <el-form-item :label="t('setting.manualTokenInput')">
                  <el-input
                    v-model="manualTokenInput"
                    type="textarea"
                    :rows="8"
                    :placeholder="t('setting.manualTokenInputPlaceholder')"
                    @input="saveManualTokenToCache"
                  />
                  <div style="margin-top: 8px; display: flex; gap: 8px">
                    <el-button size="small" @click="clearManualToken">
                      {{ t('setting.clearManualToken') }}
                    </el-button>
                    <el-button
                      size="small"
                      type="primary"
                      @click="submitManualResponse"
                      :disabled="!manualTokenInput.trim() || !pendingManualRequestId"
                    >
                      {{ t('setting.submitManualResponse') }}
                    </el-button>
                    <el-button size="small" @click="openManualLLMInterface">
                      {{ t('setting.openManualLLMInterface') }}
                    </el-button>
                  </div>
                  <div
                    v-if="pendingManualRequestId"
                    style="margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary)"
                  >
                    {{ t('setting.pendingRequestId') }}: {{ pendingManualRequestId }}
                  </div>
                </el-form-item>
              </template>

              <el-form-item :label="t('setting.autoCompletion')">
                <el-switch
                  v-model="settings.autoCompletion"
                  class="mb-2"
                  :active-text="t('setting.enabled')"
                  :inactive-text="t('setting.disabled')"
                  @change="saveSetting('autoCompletion', settings.autoCompletion)"
                />
              </el-form-item>

              <el-form-item v-if="settings.autoCompletion" :label="t('setting.autoCompletionMode')">
                <el-select
                  v-model="settings.autoCompletionMode"
                  :placeholder="t('setting.chooseAutoCompletionMode')"
                  @change="saveSetting('autoCompletionMode', settings.autoCompletionMode)"
                >
                  <el-tooltip :content="t('setting.autoCompletionFullModeHint')" placement="left">
                    <el-option :label="t('setting.autoCompletionFullMode')" value="full" />
                  </el-tooltip>
                  <el-tooltip :content="t('setting.autoCompletionStreamModeHint')" placement="left">
                    <el-option :label="t('setting.autoCompletionStreamMode')" value="stream" />
                  </el-tooltip>
                </el-select>
              </el-form-item>

              <el-form-item
                v-if="settings.autoCompletion"
                :label="t('setting.autoCompletionMaxTokens')"
              >
                <el-tooltip :content="t('setting.autoCompletionMaxTokensHint')" placement="bottom">
                  <div class="flex items-center gap-2">
                    <NumberField
                      v-model="settings.autoCompletionMaxTokens"
                      :min="20"
                      :step="10"
                      @update:modelValue="
                        saveSetting('autoCompletionMaxTokens', settings.autoCompletionMaxTokens)
                      "
                      class="number-field-wrapper"
                    >
                      <NumberFieldInput />
                    </NumberField>
                    <span style="color: #909399; font-size: 12px">
                      {{
                        settings.autoCompletionMaxTokens === 0
                          ? t('setting.unlimited')
                          : t('setting.tokens')
                      }}
                    </span>
                  </div>
                </el-tooltip>
              </el-form-item>

              <el-divider>{{ t('setting.testLlm') }}</el-divider>

              <!-- 测试场景选择 -->
              <el-form-item :label="t('setting.testScenario')">
                <el-radio-group v-model="testScenario">
                  <el-radio value="completion-stream">{{
                    t('setting.testCompletionStream')
                  }}</el-radio>
                  <el-radio value="completion-nonstream">{{
                    t('setting.testCompletionNonStream')
                  }}</el-radio>
                  <el-radio value="chat-stream">{{ t('setting.testChatStream') }}</el-radio>
                  <el-radio value="chat-nonstream">{{ t('setting.testChatNonStream') }}</el-radio>
                </el-radio-group>
              </el-form-item>

              <el-form-item>
                <el-button
                  type="primary"
                  @click="testLlmApi"
                  :loading="testLoading"
                  class="aero-btn"
                >
                  {{ t('setting.testLlm') }}
                </el-button>
                <el-button @click="clearTestResult">{{ t('setting.clearResult') }}</el-button>
              </el-form-item>

              <el-form-item :label="t('setting.testResult')">
                <el-input
                  v-model="testResult"
                  type="textarea"
                  readonly
                  :placeholder="t('setting.resultPlaceholder')"
                  :autosize="{ minRows: 5, maxRows: 15 }"
                />
              </el-form-item>
            </el-form>
          </el-scrollbar>
        </section>
      </div>
    </div>

    <!-- 导入配置对话框 -->
    <el-dialog v-model="importDialogVisible" :title="t('setting.importConfig')" width="600px">
      <el-form label-width="120px">
        <el-form-item :label="t('setting.importConfigJson')">
          <el-input
            v-model="importJsonText"
            type="textarea"
            :rows="10"
            :placeholder="t('setting.importConfigJsonPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleImportConfig" :disabled="!importJsonText.trim()">
          {{ t('setting.importConfig') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 手动LLM界面对话框 -->
    <el-dialog
      v-model="manualLLMDialogVisible"
      :title="t('setting.manualLLMInterface')"
      width="800px"
    >
      <div class="manual-llm-interface">
        <el-form label-width="120px">
          <el-form-item :label="t('setting.pendingRequests')">
            <el-select
              v-model="selectedRequestId"
              :placeholder="t('setting.selectPendingRequest')"
              style="width: 100%"
              @change="selectPendingRequest"
            >
              <el-option
                v-for="req in pendingRequests"
                :key="req.requestId"
                :label="`${req.requestId} (${req.type}, ${req.stream ? 'stream' : 'non-stream'})`"
                :value="req.requestId"
              />
            </el-select>
            <el-button size="small" style="margin-top: 8px" @click="fetchPendingRequests">
              {{ t('setting.refreshRequests') }}
            </el-button>
          </el-form-item>
          <el-form-item :label="t('setting.manualTokenInput')">
            <el-input
              v-model="manualTokenInput"
              type="textarea"
              :rows="10"
              :placeholder="t('setting.manualTokenInputPlaceholder')"
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              @click="submitManualResponse"
              :disabled="!manualTokenInput.trim() || !selectedRequestId"
            >
              {{ t('setting.submitManualResponse') }}
            </el-button>
            <el-button @click="clearManualToken">{{ t('setting.clearManualToken') }}</el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import axios from 'axios'
import { useI18n } from 'vue-i18n'
import { settings, setSetting, getSetting } from '../../utils/settings.js'
import eventBus, { sendBroadcast } from '../../utils/event-bus.js'
import { getMetaDocLlmModels } from '../../utils/web-utils.ts'
import { createRendererLogger } from '../../utils/logger.ts'
import { isDevEnvironment } from '../../utils/dev-env'
import { themeState } from '../../utils/themes.js'
import {
  getAllConfigs,
  getCurrentConfig,
  addConfig,
  updateConfig,
  deleteConfig,
  switchConfig,
  createConfigFromCurrentSettings,
  updateWorkspaceModifiedState,
  saveWorkspace,
  discardWorkspace,
  getWorkspaceState,
  exportConfig,
  exportAllConfigs,
  importConfig,
  importConfigs,
  resetDefaultConfig,
  loadLlmConfigs,
  updateConfigOrder,
  type LlmConfigItem
} from '../../utils/llm-config-manager'
import { Plus, Edit, Delete, DocumentCopy, MoreFilled, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ai_types, createAiTask } from '../../utils/ai_tasks.ts'
import {
  NumberField,
  NumberFieldInput
} from '@renderer/components/ui/number-field'

interface OllamaModel {
  name: string
  model: string
}

interface OpenAIModel {
  id: string
}

interface MetaDocModel {
  label: string
}

const { t } = useI18n()
const logger = createRendererLogger('SettingLlm')

const ollamaModels = ref<OllamaModel[]>([])
const openaiModels = ref<OpenAIModel[]>([])
const openaiOfficialModels = ref<OpenAIModel[]>([])
const geminiModels = ref<Array<{ name: string; displayName?: string }>>([])
const metadocModels = ref<MetaDocModel[]>([])
const testResult = ref('')
const testScenario = ref('completion-stream')
const testLoading = ref(false)
const isDev = ref(false)
const llmConfigs = ref<LlmConfigItem[]>([])
const currentConfigId = ref<string>('')
const openConfigMenuId = ref<string>('')
const configMenuStyle = ref({})
const manualTokenInput = ref('')
const pendingManualRequestId = ref<string>('')
const manualLLMDialogVisible = ref(false)
const pendingRequests = ref<Array<{ requestId: string; type: string; stream: boolean }>>([])
const selectedRequestId = ref<string>('')
const hasUnsavedChanges = ref(false)
const importDialogVisible = ref(false)
const importJsonText = ref('')
const draggingConfigId = ref<string | null>(null)
const dropPreview = ref<{ targetId: string | null; mode: 'before' | 'after' | null }>({
  targetId: null,
  mode: null
})

const sliderMarks = computed(() => ({
  0.3: {
    style: {
      color: '#1989FA'
    },
    label: t('setting.lowPrecision')
  },
  0.5: {
    style: {
      color: '#1989FA'
    },
    label: t('setting.recommended')
  },
  0.8: {
    style: {
      color: '#1989FA'
    },
    label: t('setting.highPrecision')
  }
}))

const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value)
}

/**
 * 获取配置的显示名称（支持 i18n）
 */
const getConfigDisplayName = (config: LlmConfigItem): string => {
  // 如果是默认配置，使用 i18n 翻译
  if (config.isDefault) {
    const typeKeyMap: Record<string, string> = {
      ollama: 'setting.defaultConfigOllama',
      openai: 'setting.defaultConfigOpenai',
      'openai-official': 'setting.defaultConfigOpenaiOfficial',
      deepseek: 'setting.defaultConfigDeepseek',
      gemini: 'setting.defaultConfigGemini',
      metadoc: 'setting.defaultConfigMetadoc',
      manual: 'setting.defaultConfigManual'
    }
    const i18nKey = typeKeyMap[config.type]
    if (i18nKey) {
      return t(i18nKey)
    }
  }
  // 否则返回原始名称
  return config.name
}

const fetchLlmSettings = async () => {
  // 先更新selectedLlm，这样UI会正确显示对应的配置字段
  settings.selectedLlm = (await getSetting('selectedLlm')) || ''

  // 确保所有配置对象都是对象类型（防止旧数据导致类型错误）
  if (typeof settings.metadoc !== 'object' || settings.metadoc === null) {
    settings.metadoc = { selectedModel: '', enableMaxTokens: false, maxTokens: 4096 }
  }
  if (typeof settings.ollama !== 'object' || settings.ollama === null) {
    settings.ollama = {
      apiUrl: 'http://localhost:11434/api',
      selectedModel: '',
      enableMaxTokens: false,
      maxTokens: 4096
    }
  }
  if (typeof settings.openai !== 'object' || settings.openai === null) {
    settings.openai = {
      apiUrl: 'https://api.openai.com/v1',
      apiKey: '',
      selectedModel: '',
      completionSuffix: '',
      chatSuffix: '',
      enableMaxTokens: false,
      maxTokens: 4096
    }
  }
  if (typeof settings['openai-official'] !== 'object' || settings['openai-official'] === null) {
    settings['openai-official'] = {
      apiKey: '',
      selectedModel: '',
      enableMaxTokens: false,
      maxTokens: 4096
    }
  }
  if (typeof settings.deepseek !== 'object' || settings.deepseek === null) {
    settings.deepseek = { apiKey: '', selectedModel: '', enableMaxTokens: false, maxTokens: 4096 }
  }
  if (typeof settings.gemini !== 'object' || settings.gemini === null) {
    settings.gemini = { apiKey: '', selectedModel: '', enableMaxTokens: false, maxTokens: 4096 }
  }

  settings.metadoc.selectedModel = (await getSetting('metadocSelectedModel')) || ''
  settings.metadoc.enableMaxTokens = (await getSetting('metadocEnableMaxTokens')) ?? false
  settings.metadoc.maxTokens = (await getSetting('metadocMaxTokens')) || 4096
  settings.ollama.apiUrl = (await getSetting('ollamaApiUrl')) || 'http://localhost:11434/api'
  settings.ollama.selectedModel = (await getSetting('ollamaSelectedModel')) || ''
  settings.ollama.enableMaxTokens = (await getSetting('ollamaEnableMaxTokens')) ?? false
  settings.ollama.maxTokens = (await getSetting('ollamaMaxTokens')) || 4096
  settings.openai.apiUrl = (await getSetting('openaiApiUrl')) || 'https://api.openai.com/v1'
  settings.openai.apiKey = (await getSetting('openaiApiKey')) || ''
  settings.openai.selectedModel = (await getSetting('openaiSelectedModel')) || ''
  settings.openai.completionSuffix = (await getSetting('openaiCompletionSuffix')) || ''
  settings.openai.chatSuffix = (await getSetting('openaiChatSuffix')) || ''
  settings.openai.enableMaxTokens = (await getSetting('openaiEnableMaxTokens')) ?? false
  settings.openai.maxTokens = (await getSetting('openaiMaxTokens')) || 4096
  settings['openai-official'].apiKey = (await getSetting('openaiOfficialApiKey')) || ''
  settings['openai-official'].selectedModel =
    (await getSetting('openaiOfficialSelectedModel')) || ''
  settings['openai-official'].enableMaxTokens =
    (await getSetting('openaiOfficialEnableMaxTokens')) ?? false
  settings['openai-official'].maxTokens = (await getSetting('openaiOfficialMaxTokens')) || 4096
  settings.deepseek.apiKey = (await getSetting('deepseekApiKey')) || ''
  settings.deepseek.selectedModel = (await getSetting('deepseekSelectedModel')) || ''
  settings.deepseek.enableMaxTokens = (await getSetting('deepseekEnableMaxTokens')) ?? false
  settings.deepseek.maxTokens = (await getSetting('deepseekMaxTokens')) || 4096
  settings.gemini.apiKey = (await getSetting('geminiApiKey')) || ''
  settings.gemini.selectedModel = (await getSetting('geminiSelectedModel')) || ''
  settings.gemini.enableMaxTokens = (await getSetting('geminiEnableMaxTokens')) ?? false
  settings.gemini.maxTokens = (await getSetting('geminiMaxTokens')) || 4096

  // 加载全局设置
  settings.llmTemperature = (await getSetting('llmTemperature')) || 1.3
  settings.autoRemoveThinkTag = (await getSetting('autoRemoveThinkTag')) ?? true
}

const updateLlmInfo = () => {
  setSetting('metadocSelectedModel', settings.metadoc.selectedModel)
  setSetting('metadocEnableMaxTokens', settings.metadoc.enableMaxTokens)
  setSetting('metadocMaxTokens', settings.metadoc.maxTokens)
  setSetting('ollamaApiUrl', settings.ollama.apiUrl)
  setSetting('ollamaSelectedModel', settings.ollama.selectedModel)
  setSetting('ollamaEnableMaxTokens', settings.ollama.enableMaxTokens)
  setSetting('ollamaMaxTokens', settings.ollama.maxTokens)
  setSetting('openaiApiUrl', settings.openai.apiUrl)
  setSetting('openaiApiKey', settings.openai.apiKey)
  setSetting('openaiSelectedModel', settings.openai.selectedModel)
  setSetting('openaiCompletionSuffix', settings.openai.completionSuffix)
  setSetting('openaiChatSuffix', settings.openai.chatSuffix)
  setSetting('openaiEnableMaxTokens', settings.openai.enableMaxTokens)
  setSetting('openaiMaxTokens', settings.openai.maxTokens)
  setSetting('openaiOfficialApiKey', settings['openai-official'].apiKey)
  setSetting('openaiOfficialSelectedModel', settings['openai-official'].selectedModel)
  setSetting('openaiOfficialEnableMaxTokens', settings['openai-official'].enableMaxTokens)
  setSetting('openaiOfficialMaxTokens', settings['openai-official'].maxTokens)
  setSetting('deepseekApiKey', settings.deepseek.apiKey)
  setSetting('deepseekSelectedModel', settings.deepseek.selectedModel)
  setSetting('deepseekEnableMaxTokens', settings.deepseek.enableMaxTokens)
  setSetting('deepseekMaxTokens', settings.deepseek.maxTokens)
  setSetting('geminiApiKey', settings.gemini.apiKey)
  setSetting('geminiSelectedModel', settings.gemini.selectedModel)
  setSetting('geminiEnableMaxTokens', settings.gemini.enableMaxTokens)
  setSetting('geminiMaxTokens', settings.gemini.maxTokens)
  eventBus.emit('llm-api-updated')
}

// 处理字段变化：保存设置并更新工作区状态
const handleFieldChange = async () => {
  updateLlmInfo()
  await updateWorkspaceModifiedState()
  hasUnsavedChanges.value = getWorkspaceState().hasUnsavedChanges
}

const fetchMetaDocModels = async () => {
  try {
    const models = await getMetaDocLlmModels()
    logger.debug('MetaDoc 模型列表', models?.length ?? 0)
    metadocModels.value = models ?? []
  } catch (error) {
    logger.error('获取 MetaDoc 模型失败', error)
  }
}

const fetchOllamaModels = async () => {
  const apiUrl = settings.ollama.apiUrl
  if (!apiUrl) {
    return
  }

  try {
    const response = await axios.get(`${apiUrl}/tags`)
    if (response.data && response.data.models) {
      ollamaModels.value = response.data.models
    } else {
      ollamaModels.value = []
      logger.warn('未能获取 Ollama 模型列表，响应数据为空')
    }
  } catch (error) {
    logger.error('无法获取 Ollama 模型列表', error)
  }
}

const fetchOpenAIModels = async () => {
  const apiUrl = settings.openai.apiUrl
  if (!apiUrl) {
    return
  }

  try {
    const response = await axios.get(`${apiUrl}/models`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${settings.openai.apiKey}`
      }
    })

    if (response.data?.data) {
      openaiModels.value = response.data.data
    } else {
      openaiModels.value = []
      logger.warn('未能获取 OpenAI 模型列表，响应数据为空')
    }
  } catch (error) {
    logger.error('无法获取 OpenAI 模型列表', error)
  }
}

const fetchOpenAIOfficialModels = async () => {
  const apiKey = settings['openai-official'].apiKey
  if (!apiKey) {
    return
  }

  try {
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`
      }
    })

    if (response.data?.data) {
      openaiOfficialModels.value = response.data.data
    } else {
      openaiOfficialModels.value = []
      logger.warn('未能获取 OpenAI 官方模型列表，响应数据为空')
    }
  } catch (error) {
    logger.error('无法获取 OpenAI 官方模型列表', error)
  }
}

const fetchGeminiModels = async () => {
  const apiKey = settings.gemini.apiKey
  if (!apiKey) {
    return
  }

  try {
    const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
      params: {
        key: apiKey
      },
      headers: {
        Accept: 'application/json'
      }
    })

    if (response.data?.models) {
      // 过滤出可用的生成模型（排除embedding等）
      geminiModels.value = response.data.models
        .filter((model: any) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model: any) => ({
          name: model.name.replace('models/', ''),
          displayName: model.displayName || model.name.replace('models/', '')
        }))
    } else {
      geminiModels.value = []
      logger.warn('未能获取 Gemini 模型列表，响应数据为空')
    }
  } catch (error) {
    logger.error('无法获取 Gemini 模型列表', error)
  }
}

const handleLlmToggle = (enabled: boolean) => {
  if (!enabled) {
    settings.selectedLlm = ''
  }
  setSetting('llmEnabled', enabled)
}

const handleLlmTypeChange = async () => {
  saveSetting('selectedLlm', settings.selectedLlm)
  updateLlmInfo()
  // 如果切换到manual类型，加载缓存的内容
  if (settings.selectedLlm === 'manual') {
    loadManualTokenFromCache()
    fetchPendingRequests()
  }
  // 更新工作区状态
  await updateWorkspaceModifiedState()
  hasUnsavedChanges.value = getWorkspaceState().hasUnsavedChanges
}

// 监听所有配置字段的变化
const watchConfigChanges = () => {
  // 使用watch监听settings的变化，延迟执行避免初始化时触发
  let modificationTimer: NodeJS.Timeout | null = null
  const debouncedUpdateState = async () => {
    if (modificationTimer) clearTimeout(modificationTimer)
    modificationTimer = setTimeout(async () => {
      await updateWorkspaceModifiedState()
      hasUnsavedChanges.value = getWorkspaceState().hasUnsavedChanges
    }, 300) // 300ms防抖
  }

  watch(() => settings.selectedLlm, debouncedUpdateState)
  watch(() => settings.ollama?.apiUrl, debouncedUpdateState)
  watch(() => settings.ollama?.selectedModel, debouncedUpdateState)
  watch(() => settings.ollama?.enableMaxTokens, debouncedUpdateState)
  watch(() => settings.ollama?.maxTokens, debouncedUpdateState)
  watch(() => settings.openai?.apiUrl, debouncedUpdateState)
  watch(() => settings.openai?.apiKey, debouncedUpdateState)
  watch(() => settings.openai?.selectedModel, debouncedUpdateState)
  watch(() => settings.openai?.completionSuffix, debouncedUpdateState)
  watch(() => settings.openai?.chatSuffix, debouncedUpdateState)
  watch(() => settings.openai?.enableMaxTokens, debouncedUpdateState)
  watch(() => settings.openai?.maxTokens, debouncedUpdateState)
  watch(() => settings['openai-official']?.apiKey, debouncedUpdateState)
  watch(() => settings['openai-official']?.selectedModel, debouncedUpdateState)
  watch(() => settings['openai-official']?.enableMaxTokens, debouncedUpdateState)
  watch(() => settings['openai-official']?.maxTokens, debouncedUpdateState)
  watch(() => settings.deepseek?.apiKey, debouncedUpdateState)
  watch(() => settings.deepseek?.selectedModel, debouncedUpdateState)
  watch(() => settings.deepseek?.enableMaxTokens, debouncedUpdateState)
  watch(() => settings.deepseek?.maxTokens, debouncedUpdateState)
  watch(() => settings.gemini?.apiKey, debouncedUpdateState)
  watch(() => settings.gemini?.selectedModel, debouncedUpdateState)
  watch(() => settings.gemini?.enableMaxTokens, debouncedUpdateState)
  watch(() => settings.gemini?.maxTokens, debouncedUpdateState)
  watch(() => settings.metadoc?.selectedModel, debouncedUpdateState)
  watch(() => settings.metadoc?.enableMaxTokens, debouncedUpdateState)
  watch(() => settings.metadoc?.maxTokens, debouncedUpdateState)
}

const loadConfigs = () => {
  llmConfigs.value = getAllConfigs()
  const current = getCurrentConfig()
  if (current) {
    currentConfigId.value = current.id
  } else if (llmConfigs.value.length > 0) {
    currentConfigId.value = llmConfigs.value[0].id
  }
}

const handleConfigSwitch = async (id: string) => {
  // 如果有未保存的修改，提示用户
  if (hasUnsavedChanges.value) {
    try {
      await ElMessageBox.confirm(t('setting.unsavedChangesConfirm'), t('setting.unsavedChanges'), {
        confirmButtonText: t('setting.saveChanges'),
        cancelButtonText: t('setting.discardChanges'),
        distinguishCancelAndClose: true,
        type: 'warning'
      })
      // 用户选择保存
      await handleSaveChanges()
    } catch {
      // 用户选择放弃或取消
      await handleDiscardChanges()
    }
  }

  await switchConfig(id)
  currentConfigId.value = id
  // 重新加载设置以更新UI显示
  await fetchLlmSettings()
  // 更新工作区状态
  await updateWorkspaceModifiedState()
  hasUnsavedChanges.value = getWorkspaceState().hasUnsavedChanges
  // 根据配置类型加载对应的模型列表
  if (settings.selectedLlm === 'metadoc') {
    fetchMetaDocModels()
  } else if (settings.selectedLlm === 'ollama' && settings.ollama.apiUrl) {
    fetchOllamaModels()
  } else if (
    settings.selectedLlm === 'openai' &&
    settings.openai.apiUrl &&
    settings.openai.apiKey
  ) {
    fetchOpenAIModels()
  } else if (settings.selectedLlm === 'openai-official' && settings['openai-official'].apiKey) {
    fetchOpenAIOfficialModels()
  } else if (settings.selectedLlm === 'gemini' && settings.gemini.apiKey) {
    fetchGeminiModels()
  } else if (settings.selectedLlm === 'manual') {
    // 切换到manual类型时，加载缓存的内容
    loadManualTokenFromCache()
    fetchPendingRequests()
  }
  ElMessage.success(t('setting.configSwitched'))
}

const handleCreateConfig = async () => {
  try {
    // 检查当前类型是否为 manual（开发模式专用）
    if (settings.selectedLlm === 'manual') {
      ElMessage.warning(t('setting.cannotCreateManualConfig'))
      return
    }

    // 从当前设置创建新配置
    const { value: name } = await ElMessageBox.prompt(
      t('setting.enterConfigName'),
      t('setting.newConfig'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        inputPattern: /.+/,
        inputErrorMessage: t('setting.configNameRequired')
      }
    )

    const newConfig = await createConfigFromCurrentSettings(name)
    await switchConfig(newConfig.id)
    currentConfigId.value = newConfig.id
    await fetchLlmSettings()
    loadConfigs()
    ElMessage.success(t('setting.configCreated'))
  } catch (error) {
    if (error !== 'cancel') {
      logger.error('创建配置失败', error)
      ElMessage.error(t('setting.configCreateFailed') || '创建配置失败')
    }
  }
}

const toggleConfigMenu = (configId: string) => {
  if (openConfigMenuId.value === configId) {
    openConfigMenuId.value = ''
  } else {
    openConfigMenuId.value = configId
  }
}

const getConfigMenuStyle = () => {
  // 菜单使用绝对定位，相对于 .config-item__actions，不需要计算位置
  return {}
}

const handleConfigMenuAction = async (action: string, config: LlmConfigItem) => {
  openConfigMenuId.value = ''
  if (action === 'export') {
    await handleExportConfig(config.id)
  } else if (action === 'delete') {
    await handleDeleteConfig(config.id)
  } else if (action === 'reset') {
    await handleResetConfig(config.id)
  }
}

const clearManualToken = () => {
  manualTokenInput.value = ''
  pendingManualRequestId.value = ''
  localStorage.removeItem('manualLLMTokenCache')
}

const saveManualTokenToCache = () => {
  // 实时保存到缓存
  if (manualTokenInput.value.trim()) {
    localStorage.setItem('manualLLMTokenCache', manualTokenInput.value)
  }
}

const loadManualTokenFromCache = () => {
  // 从缓存加载上次输入的内容
  const cached = localStorage.getItem('manualLLMTokenCache')
  if (cached) {
    manualTokenInput.value = cached
  }
}

const submitManualResponse = async () => {
  if (!manualTokenInput.value.trim() || !pendingManualRequestId.value) {
    ElMessage.warning(t('setting.noPendingRequest'))
    return
  }

  try {
    // 查找对应的请求信息
    const request = pendingRequests.value.find((r) => r.requestId === pendingManualRequestId.value)
    if (!request) {
      ElMessage.warning(t('setting.requestNotFound'))
      await fetchPendingRequests()
      return
    }

    // 对于流式请求，直接发送文本内容（服务器会处理格式转换）
    // 对于非流式请求，发送完整的响应对象
    let responseData: any
    if (request.stream) {
      // 流式请求：直接发送文本，服务器会处理
      responseData = manualTokenInput.value.trim()
    } else {
      // 非流式请求：构造完整的响应对象
      if (request.type === 'completion') {
        // Completions API 响应格式
        responseData = {
          id: `cmpl-${Date.now()}`,
          object: 'text_completion',
          created: Math.floor(Date.now() / 1000),
          model: 'manual-model',
          choices: [
            {
              text: manualTokenInput.value.trim(),
              index: 0,
              logprobs: null,
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        }
      } else {
        // Chat Completions API 响应格式
        responseData = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'manual-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: manualTokenInput.value.trim()
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        }
      }
    }

    const baseUrl = await import('../../config/runtime-server').then((m) => m.getRuntimeServerBaseUrl())
    const response = await fetch(`${baseUrl}/api/llm/submit-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestId: pendingManualRequestId.value,
        response: responseData
      })
    })

    const result = await response.json()
    if (result.success) {
      ElMessage.success(t('setting.manualResponseSubmitted'))
      manualTokenInput.value = ''
      pendingManualRequestId.value = ''
      selectedRequestId.value = ''
      await fetchPendingRequests()
    } else {
      ElMessage.error(result.message || t('setting.submitFailed'))
    }
  } catch (error) {
    logger.error('提交手动响应失败', error)
    ElMessage.error(t('setting.submitFailed'))
  }
}

const fetchPendingRequests = async () => {
  try {
    const baseUrl = await import('../../config/runtime-server').then((m) => m.getRuntimeServerBaseUrl())
    const response = await fetch(`${baseUrl}/api/llm/pending-requests`)
    const data = await response.json()
    pendingRequests.value = data.requests || []

    // 如果有待处理的请求，自动选择第一个
    if (pendingRequests.value.length > 0 && !pendingManualRequestId.value) {
      selectedRequestId.value = pendingRequests.value[0].requestId
      pendingManualRequestId.value = selectedRequestId.value
    }
  } catch (error) {
    logger.error('获取待处理请求失败', error)
    pendingRequests.value = []
  }
}

const openManualLLMInterface = () => {
  manualLLMDialogVisible.value = true
  // 打开对话框时加载缓存的内容
  loadManualTokenFromCache()
  fetchPendingRequests()
}

const selectPendingRequest = (requestId: string) => {
  selectedRequestId.value = requestId
  pendingManualRequestId.value = requestId
}

const handleDeleteConfig = async (configId?: string) => {
  const targetId = configId || currentConfigId.value
  if (!targetId) return

  const config = llmConfigs.value.find((c) => c.id === targetId)
  if (config?.isDefault) {
    ElMessage.warning(t('setting.cannotDeleteDefaultConfig'))
    return
  }

  try {
    await ElMessageBox.confirm(t('setting.confirmDeleteConfig'), t('setting.deleteConfig'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })

    await deleteConfig(targetId)
    loadConfigs()
    ElMessage.success(t('setting.configDeleted'))
  } catch (error) {
    if (error instanceof Error && error.message === '不能删除默认配置') {
      ElMessage.warning(t('setting.cannotDeleteDefaultConfig'))
    }
    // 用户取消或其他错误
  }
}

const handleResetConfig = async (configId: string) => {
  try {
    await ElMessageBox.confirm(t('setting.confirmResetConfig'), t('setting.resetConfig'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })

    const success = await resetDefaultConfig(configId)
    if (success) {
      await fetchLlmSettings()
      loadConfigs()
      ElMessage.success(t('setting.configReset'))
    } else {
      ElMessage.error(t('setting.resetFailed') || '重置失败')
    }
  } catch {
    // 用户取消
  }
}

// 拖拽排序相关函数
const handleDragStart = (configId: string, event: DragEvent) => {
  draggingConfigId.value = configId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', configId)
  }
}

const handleDragOver = (targetId: string, event: DragEvent) => {
  if (!draggingConfigId.value || draggingConfigId.value === targetId) {
    dropPreview.value.targetId = null
    dropPreview.value.mode = null
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }

  // 获取目标元素（config-item-wrapper）
  const targetElement = event.currentTarget as HTMLElement
  if (!targetElement) {
    logger.warn('handleDragOver: targetElement 为空')
    return
  }

  // 找到对应的 .config-item 元素（父级）
  let configItemElement: HTMLElement | null = targetElement.closest('.config-item')
  if (!configItemElement) {
    // 如果找不到，尝试向上查找
    let parent = targetElement.parentElement
    while (parent && !parent.classList.contains('config-item')) {
      parent = parent.parentElement
    }
    configItemElement = parent as HTMLElement | null
  }

  if (!configItemElement) {
    logger.warn('handleDragOver: configItemElement 为空')
    return
  }

  const rect = configItemElement.getBoundingClientRect()
  const midPoint = rect.top + rect.height / 2
  const mode = event.clientY < midPoint ? 'before' : 'after'

  // 直接更新响应式数据，Vue 会自动更新 DOM
  dropPreview.value.targetId = targetId
  dropPreview.value.mode = mode

  //logger.debug('拖拽经过', { targetId, mode, clientY: event.clientY, midPoint });
}

const handleDragLeave = (event: DragEvent) => {
  // 检查是否真的离开了整个配置项区域
  const relatedTarget = event.relatedTarget as HTMLElement | null
  if (relatedTarget) {
    const configItem = (event.currentTarget as HTMLElement)?.closest('.config-item')
    if (configItem && configItem.contains(relatedTarget)) {
      // 还在配置项内部，不清除预览
      return
    }
  }
  // 离开了配置项，清除预览
  dropPreview.value.targetId = null
  dropPreview.value.mode = null
}

const handleDrop = (targetId: string, event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()

  //logger.debug('拖拽放置', { targetId, draggingConfigId: draggingConfigId.value, dropPreview: dropPreview.value });

  const fromId = draggingConfigId.value
  const mode = dropPreview.value.mode

  if (!fromId || fromId === targetId || !mode) {
    //logger.debug('拖拽放置：无效条件', { fromId, targetId, mode });
    draggingConfigId.value = null
    dropPreview.value.targetId = null
    dropPreview.value.mode = null
    return
  }

  const fromIndex = llmConfigs.value.findIndex((c) => c.id === fromId)
  const targetIndex = llmConfigs.value.findIndex((c) => c.id === targetId)

  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
    //logger.debug('拖拽放置：索引无效', { fromIndex, targetIndex });
    draggingConfigId.value = null
    dropPreview.value.targetId = null
    dropPreview.value.mode = null
    return
  }

  // 计算插入位置
  let insertIndex = targetIndex
  if (mode === 'after') {
    insertIndex = targetIndex + 1
  }

  // 如果从源位置拖到目标位置，需要调整插入索引
  if (fromIndex < insertIndex) {
    insertIndex -= 1
  }

  insertIndex = Math.max(0, Math.min(insertIndex, llmConfigs.value.length))

  //logger.debug('拖拽放置：执行移动', { fromIndex, targetIndex, insertIndex, mode });

  // 执行移动
  if (fromIndex !== insertIndex) {
    const [config] = llmConfigs.value.splice(fromIndex, 1)
    llmConfigs.value.splice(insertIndex, 0, config)

    // 保存新顺序
    const newOrder = llmConfigs.value.map((c) => c.id)
    updateConfigOrder(newOrder)

    //logger.debug('拖拽放置：移动完成', { newOrder });
  }

  draggingConfigId.value = null
  dropPreview.value.targetId = null
  dropPreview.value.mode = null
}

const handleDragEnd = () => {
  draggingConfigId.value = null
  dropPreview.value.targetId = null
  dropPreview.value.mode = null
}

// 处理列表容器的 dragover 事件（作为后备）
const handleListDragOver = (event: DragEvent) => {
  if (!draggingConfigId.value) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

// 处理列表容器的 drop 事件（作为后备）
const handleListDrop = (event: DragEvent) => {
  // 如果已经在具体项上处理了 drop，这里不需要处理
  // 这个主要是为了允许 drop 事件能够触发
  event.preventDefault()
}

const handleSaveChanges = async () => {
  try {
    const success = await saveWorkspace()
    if (success) {
      hasUnsavedChanges.value = false
      await fetchLlmSettings()
      loadConfigs()
      ElMessage.success(t('setting.changesSaved'))
    } else {
      ElMessage.error(t('setting.saveFailed') || '保存失败')
    }
  } catch (error) {
    logger.error('保存配置失败', error)
    ElMessage.error(t('setting.saveFailed') || '保存失败')
  }
}

const handleDiscardChanges = async () => {
  try {
    await ElMessageBox.confirm(t('setting.confirmDiscardChanges'), t('setting.discardChanges'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })

    const success = await discardWorkspace()
    if (success) {
      hasUnsavedChanges.value = false
      // 重新加载设置以确保UI正确更新
      await fetchLlmSettings()
      // 根据配置类型加载对应的模型列表
      if (settings.selectedLlm === 'metadoc') {
        fetchMetaDocModels()
      } else if (settings.selectedLlm === 'ollama' && settings.ollama.apiUrl) {
        fetchOllamaModels()
      } else if (
        settings.selectedLlm === 'openai' &&
        settings.openai.apiUrl &&
        settings.openai.apiKey
      ) {
        fetchOpenAIModels()
      } else if (settings.selectedLlm === 'openai-official' && settings['openai-official'].apiKey) {
        fetchOpenAIOfficialModels()
      } else if (settings.selectedLlm === 'gemini' && settings.gemini.apiKey) {
        fetchGeminiModels()
      }
      ElMessage.success(t('setting.changesDiscarded'))
    } else {
      ElMessage.error(t('setting.discardFailed') || '放弃失败')
    }
  } catch {
    // 用户取消
  }
}

const handleExportConfig = async (configId: string) => {
  try {
    const jsonString = exportConfig(configId)
    if (!jsonString) {
      ElMessage.error(t('setting.exportFailed') || '导出失败')
      return
    }

    // 创建下载链接
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const config = llmConfigs.value.find((c) => c.id === configId)
    const filename = `${config?.name || 'config'}-${Date.now()}.json`
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    ElMessage.success(t('setting.exportSuccess') || '导出成功')
  } catch (error) {
    logger.error('导出配置失败', error)
    ElMessage.error(t('setting.exportFailed') || '导出失败')
  }
}

const handleImportConfig = async () => {
  try {
    if (!importJsonText.value.trim()) {
      ElMessage.warning(t('setting.importConfigJsonRequired') || '请输入配置JSON')
      return
    }

    const result = importConfigs(importJsonText.value)
    if (result.success) {
      loadConfigs()
      importDialogVisible.value = false
      importJsonText.value = ''
      ElMessage.success(
        t('setting.importSuccess', { count: result.imported }) ||
          `成功导入 ${result.imported} 个配置`
      )
      if (result.errors.length > 0) {
        ElMessage.warning(result.errors.join('; '))
      }
    } else {
      ElMessage.error(result.errors.join('; ') || t('setting.importFailed') || '导入失败')
    }
  } catch (error) {
    logger.error('导入配置失败', error)
    ElMessage.error(t('setting.importFailed') || '导入失败')
  }
}

const handleExportAllConfigs = async () => {
  try {
    const jsonString = exportAllConfigs()

    // 创建下载链接
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `llm-configs-${Date.now()}.json`
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    ElMessage.success(t('setting.exportSuccess') || '导出成功')
  } catch (error) {
    logger.error('导出所有配置失败', error)
    ElMessage.error(t('setting.exportFailed') || '导出失败')
  }
}

const clearTestResult = () => {
  testResult.value = ''
}

const testLlmApi = async () => {
  if (testLoading.value) return

  testLoading.value = true
  testResult.value = ''

  try {
    const prompt = `Current time: ${new Date().toLocaleString()}\n${t('setting.testPrompt')}`
    const temperature = (await getSetting('llmTemperature')) || 1.3

    // 解析测试场景：格式为 "completion-stream", "completion-nonstream", "chat-stream", "chat-nonstream"
    const parts = testScenario.value.split('-')
    const useChat = parts[0] === 'chat'
    const stream = parts[1] === 'stream'

    logger.debug('测试场景解析:', {
      testScenario: testScenario.value,
      parts,
      useChat,
      stream
    })

    // 使用 createAiTask 统一管理所有AI调用
    const taskName = useChat
      ? stream
        ? t('setting.testChatStream')
        : t('setting.testChatNonStream')
      : stream
        ? t('setting.testCompletionStream')
        : t('setting.testCompletionNonStream')

    const originKey = `llm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const { handle, done } = createAiTask(
      taskName,
      useChat ? [{ role: 'user', content: prompt }] : prompt,
      testResult,
      useChat ? ai_types.chat : ai_types.answer,
      originKey,
      {
        stream: stream, // 明确传递stream参数，确保类型正确
        temperature
      }
    )

    logger.debug('创建测试任务:', {
      handle,
      taskName,
      useChat,
      stream,
      originKey,
      meta: {
        stream: stream,
        temperature
      }
    })

    // 等待任务完成（包括取消的情况）
    try {
      await done
    } catch (error) {
      // 如果是取消错误，不抛出，让finally处理
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (
        errorMessage.includes('取消') ||
        errorMessage.includes('aborted') ||
        errorMessage.includes('cancelled')
      ) {
        logger.debug('测试任务已取消')
        // 取消时不需要显示错误
        return
      }
      // 其他错误继续抛出
      throw error
    }
  } catch (error) {
    logger.error(t('setting.testFailed'), error)
    testResult.value = `测试失败: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    testLoading.value = false
  }
}

onMounted(async () => {
  isDev.value = await isDevEnvironment()
  // 确保配置已加载
  await loadLlmConfigs()
  loadConfigs()
  await fetchLlmSettings()

  // 初始化工作区状态
  if (currentConfigId.value) {
    await updateWorkspaceModifiedState()
    hasUnsavedChanges.value = getWorkspaceState().hasUnsavedChanges
  }

  if (settings.selectedLlm === 'metadoc') {
    fetchMetaDocModels()
  }

  // 如果当前是manual类型，加载缓存并定期获取待处理请求
  if (settings.selectedLlm === 'manual') {
    loadManualTokenFromCache()
    fetchPendingRequests()
    const interval = setInterval(() => {
      if (settings.selectedLlm === 'manual') {
        fetchPendingRequests()
      } else {
        clearInterval(interval)
      }
    }, 2000) // 每2秒检查一次
  }

  // 监听配置变化
  watchConfigChanges()

  // 监听点击外部关闭菜单
  document.addEventListener('click', () => {
    openConfigMenuId.value = ''
  })
})
</script>

<style scoped>
.llm-settings {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.global-settings-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.llm-settings__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.llm-config-layout {
  display: flex;
  height: 100%;
  width: 100%;
  min-height: 0;
  gap: 16px;
  overflow: hidden;
  box-sizing: border-box;
}

.config-list-pane {
  min-width: 200px;
  max-width: 320px;
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"'
    );
  background-color: v-bind('themeState.currentTheme.background2nd');
  overflow: hidden;
  box-sizing: border-box;
}

/* 在小屏幕上，配置列表面板可以稍微缩小 */
@media (max-width: 1200px) {
  .config-list-pane {
    min-width: 180px;
    max-width: 280px;
    width: 240px;
  }
}

@media (max-width: 800px) {
  .llm-config-layout {
    flex-direction: column;
  }

  .config-list-pane {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid
      v-bind(
        'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"'
      );
  }
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"'
    );
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.pane-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 8px;
}

.config-scroll {
  flex: 1;
  overflow: hidden;
}

.config-list {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
}

.config-list :deep(.el-radio) {
  display: flex;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 8px 12px;
  border-radius: 6px;
  transition: background-color 0.2s;
  box-sizing: border-box;
}

.config-list :deep(.el-radio):hover {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)"'
  );
}

.config-list :deep(.el-radio.is-checked) {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(64, 158, 255, 0.2)" : "rgba(64, 158, 255, 0.1)"'
  );
}

.config-list :deep(.el-radio__input) {
  margin-right: 8px;
  flex-shrink: 0;
}

.config-list :deep(.el-radio__label) {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0;
  min-width: 0;
}

.config-item {
  width: 100%;
  position: relative;
  transition: opacity 0.2s;
}

.config-item.dragging {
  opacity: 0.5;
}

.config-item.drop-before::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background-color: var(--el-color-primary);
  border-radius: 2px;
  z-index: 10;
  box-shadow: 0 0 4px rgba(64, 158, 255, 0.5);
}

.config-item.drop-after::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background-color: var(--el-color-primary);
  border-radius: 2px;
  z-index: 10;
  box-shadow: 0 0 4px rgba(64, 158, 255, 0.5);
}

.config-item-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
  cursor: grab;
  user-select: none;
}

.config-item-wrapper:active {
  cursor: grabbing;
}

.config-item-wrapper .config-item__actions {
  cursor: default;
}

.config-item-wrapper .config-item__actions * {
  cursor: pointer;
}

.config-item__content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.config-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-item__actions {
  display: flex;
  align-items: center;
  position: relative;
  flex-shrink: 0;
}

.more-btn {
  margin-left: 6px;
}

.config-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: v-bind('themeState.currentTheme.background');
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"'
    );
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  min-width: 140px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  z-index: 1000;
}

.config-menu__item {
  background: transparent;
  border: none;
  padding: 8px 10px;
  text-align: left;
  color: v-bind('themeState.currentTheme.textColor');
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s ease;
}

.config-menu__item:hover:not(:disabled) {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(64, 158, 255, 0.2)" : "rgba(64, 158, 255, 0.1)"'
  );
}

.config-menu__item.danger {
  color: #f56c6c;
}

.config-menu__item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.manual-llm-interface {
  padding: 16px 0;
}

.config-form-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  width: 0; /* 配合 flex: 1 使用，确保能够正确收缩 */
}

.workspace-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"'
    );
  background-color: v-bind('themeState.currentTheme.background2nd');
  flex-shrink: 0;
}

.workspace-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.workspace-status-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.workspace-actions {
  display: flex;
  gap: 8px;
}

.config-form-scroll {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  width: 100%;
}

.config-form-scroll :deep(.el-scrollbar) {
  height: 100%;
  width: 100%;
}

.config-form-scroll :deep(.el-scrollbar__wrap) {
  padding: 16px;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
}

.settings-form {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.settings-form :deep(.el-form-item) {
  margin-bottom: 24px;
}

.settings-form :deep(.el-input),
.settings-form :deep(.el-select),
.settings-form :deep(.el-input-number),
.settings-form :deep(.el-textarea) {
  width: 100%;
  max-width: 100%;
}

.settings-form :deep(.el-input-number) {
  width: 100%;
}

.settings-form :deep(.el-input-number .el-input__inner) {
  width: 100%;
}

/* shadcn NumberField wrapper styling - matches el-input-number behavior */
.number-field-wrapper {
  width: 200px;
}

/* Ensure NumberFieldInput takes full width of its container */
.number-field-wrapper :deep([data-radix-number-field-input]) {
  width: 100%;
  text-align: center;
}

/* Ensure all sub-components in number-field are sized correctly */
.settings-form :deep(.number-field-wrapper) {
  width: 200px;
}

/* Ensure NumberField fits in el-form-item layout */
.settings-form :deep(.number-field-wrapper [data-radix-number-field-input]) {
  width: 100%;
}

/* 确保所有子组件都能自适应 */
.llm-settings :deep(*) {
  box-sizing: border-box;
}

/* 确保对话框内容也能自适应 */
:deep(.el-dialog__body) {
  width: 100%;
  box-sizing: border-box;
}

:deep(.el-dialog__body .el-form) {
  width: 100%;
  max-width: 100%;
}

:deep(.el-dialog__body .el-input),
:deep(.el-dialog__body .el-select),
:deep(.el-dialog__body .el-textarea) {
  width: 100%;
  max-width: 100%;
}
</style>
