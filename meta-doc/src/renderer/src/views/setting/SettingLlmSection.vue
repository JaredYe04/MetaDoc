<template>
  <div class="llm-settings">
    <!-- 全局设置 -->
    <Card class="mb-6">
      <CardHeader>
        <CardTitle>{{ t('setting.llmSettings') }}</CardTitle>
        <CardDescription>{{ t('setting.llmSettingsDescription') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <!-- LLM 启用开关 -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label class="text-base">{{ t('setting.enableLlm') }}</Label>
            <p class="text-sm text-muted-foreground">
              {{ settings.llmEnabled ? t('setting.enabled') : t('setting.disabled') }}
            </p>
          </div>
          <Switch :checked="settings.llmEnabled" @update:checked="handleLlmToggle" />
        </div>

        <Separator />

        <!-- Temperature 滑块 -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <Label class="text-base">{{ t('setting.llmTemperature') }}</Label>
            <div class="flex items-center gap-2">
              <Button variant="outline" size="icon" class="h-8 w-8" @click="decrementTemperature">
                <Minus class="h-3 w-3" />
              </Button>
              <div class="w-16 text-center font-mono text-sm">
                {{ settings.llmTemperature.toFixed(1) }}
              </div>
              <Button variant="outline" size="icon" class="h-8 w-8" @click="incrementTemperature">
                <PlusIcon class="h-3 w-3" />
              </Button>
            </div>
          </div>
          <Slider
            :model-value="settings.llmTemperature"
            :min="0"
            :max="2"
            :step="0.1"
            @update:model-value="handleTemperatureChange"
            class="w-full"
          />
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>{{ t('setting.llmTemperatureRigorous') }}</span>
            <span class="text-primary">{{ t('setting.recommended') }}</span>
            <span>{{ t('setting.llmTemperatureCreative') }}</span>
          </div>
          <!-- Temperature Hint -->
          <Tooltip>
            <TooltipTrigger as-child>
              <div class="flex items-center gap-1 text-xs text-muted-foreground mt-1 cursor-help">
                <HelpCircle class="h-3 w-3" />
                <span>{{ t('setting.llmTemperatureHint') }}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">{{ t('setting.llmTemperatureHint') }}</TooltipContent>
          </Tooltip>
        </div>

        <Separator />

        <!-- 移除 think 标签开关 -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label class="text-base">{{ t('setting.removeThinkTag') }}</Label>
            <p class="text-sm text-muted-foreground">
              {{ settings.autoRemoveThinkTag ? t('setting.enabled') : t('setting.disabled') }}
            </p>
          </div>
          <Switch
            :checked="settings.autoRemoveThinkTag"
            @update:checked="handleRemoveThinkTagChange"
          />
        </div>

        <Separator />

        <!-- LLM API 报错弹窗开关 -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label class="text-base">{{ t('setting.llmApiErrorDialog') }}</Label>
            <p class="text-sm text-muted-foreground">
              {{
                settings.llmApiErrorDialogEnabled
                  ? t('setting.enabled')
                  : t('setting.disabled')
              }}
            </p>
          </div>
          <Switch
            :checked="settings.llmApiErrorDialogEnabled"
            @update:checked="handleLlmApiErrorDialogToggle"
          />
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          {{ t('setting.llmApiErrorDialogHint') }}
        </p>

        <Separator />

        <!-- 终端执行默认允许 -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label class="text-base">{{ t('setting.agentTerminalExecutionAllowed') }}</Label>
            <p class="text-sm text-muted-foreground">
              {{
                settings.agentTerminalExecutionAllowed
                  ? t('setting.enabled')
                  : t('setting.disabled')
              }}
            </p>
          </div>
          <Switch
            :checked="settings.agentTerminalExecutionAllowed"
            @update:checked="handleAgentTerminalExecutionAllowedChange"
          />
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          {{ t('setting.agentTerminalExecutionAllowedHint') }}
        </p>
      </CardContent>
    </Card>

    <!-- 配置管理区域：网格+卡片 -->
    <div v-if="settings.llmEnabled" class="llm-config-grid-wrap">
      <Card class="config-grid-card">
        <CardHeader class="pb-3 flex flex-row items-center justify-between">
          <CardTitle class="text-sm font-medium">{{ t('setting.llmConfigList') }}</CardTitle>
          <div class="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              :disabled="checkAllLoading || llmConfigs.length === 0 || Object.values(checkLoadingMap).some(Boolean)"
              @click="handleCheckAllConfigs"
            >
              <Loader2 v-if="checkAllLoading" class="h-4 w-4 mr-1 animate-spin" />
              <CheckCircle2 v-else class="h-4 w-4 mr-1" />
              {{ t('setting.checkAllConfigs') }}
            </Button>
            <Button
              size="sm"
              variant="default"
              :disabled="isCurrentConfigManual"
              @click="handleCreateConfig"
            >
              <Plus class="h-4 w-4 mr-1" />
              {{ t('setting.newConfig') }}
            </Button>
            <Button size="sm" variant="outline" @click="handleImportFromFiles">
              <ClipboardCopy class="h-4 w-4 mr-1" />
              {{ t('setting.importConfig') }}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div class="config-grid">
            <div
              v-for="config in llmConfigs"
              :key="config.id"
              class="config-card-container"
              @click="handleCardClick(config)"
              @contextmenu.prevent="openContextMenu($event, config)"
            >
              <div
                class="config-card-bar"
                :class="{ 'config-card-bar-selected': currentConfigId === config.id }"
              />
              <div
                class="config-card"
                :class="{ 'config-card-selected': currentConfigId === config.id }"
              >
                <div class="config-card-body">
                <div class="config-card-name">{{ getConfigDisplayName(config) }}</div>
                <div class="config-card-type">{{ getConfigTypeLabel(config.type) }}</div>
                <div
                  v-if="config.description"
                  class="config-card-desc text-xs text-muted-foreground truncate max-w-full"
                >
                  {{ config.description }}
                </div>
              </div>
              <div class="config-card-check" @click.stop>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="config-check-btn"
                      :disabled="checkLoadingMap[config.id]"
                      @click="handleCheckConfig(config)"
                    >
                      <Loader2
                        v-if="checkLoadingMap[config.id]"
                        class="h-4 w-4 animate-spin text-muted-foreground"
                      />
                      <CheckCircle2
                        v-else-if="checkStatusMap[config.id]?.status === 'success'"
                        class="h-4 w-4 text-green-600 dark:text-green-500"
                      />
                      <AlertCircle
                        v-else-if="checkStatusMap[config.id]?.status === 'partial'"
                        class="h-4 w-4 text-yellow-600 dark:text-yellow-500"
                      />
                      <XCircle
                        v-else-if="checkStatusMap[config.id]?.status === 'error'"
                        class="h-4 w-4 text-destructive"
                      />
                      <span v-else class="config-check-label">{{ t('setting.checkConfig') }}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" class="max-w-xs">
                    <template v-if="checkStatusMap[config.id]?.details">
                      <div class="space-y-1 text-xs">
                        <div>
                          {{ t('setting.testCompletionStream') }}:
                          {{ checkStatusMap[config.id].details.streamCompletion ? t('setting.checkPass') : t('setting.checkFail') }}
                        </div>
                        <div>
                          {{ t('setting.testCompletionNonStream') }}:
                          {{ checkStatusMap[config.id].details.nonStreamCompletion ? t('setting.checkPass') : t('setting.checkFail') }}
                        </div>
                        <div>
                          {{ t('setting.testChatStream') }}:
                          {{ checkStatusMap[config.id].details.streamChat ? t('setting.checkPass') : t('setting.checkFail') }}
                        </div>
                        <div>
                          {{ t('setting.testChatNonStream') }}:
                          {{ checkStatusMap[config.id].details.nonStreamChat ? t('setting.checkPass') : t('setting.checkFail') }}
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      {{ t('setting.checkConfigTooltip') }}
                    </template>
                  </TooltipContent>
                </Tooltip>
                <p
                  v-if="checkStatusMap[config.id]?.status === 'error' && checkStatusMap[config.id]?.message"
                  class="config-check-error text-xs text-destructive mt-0.5 truncate max-w-full"
                >
                  {{ checkStatusMap[config.id].message }}
                </p>
              </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 右键菜单 -->
      <div
        v-if="contextMenu.visible"
        class="config-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <button
          v-if="!contextMenu.config || !isBuiltinFreeLlmConfig(contextMenu.config)"
          class="context-menu-item"
          @click="handleContextCopy"
        >
          {{ t('setting.copyConfig') }}
        </button>
        <button class="context-menu-item" @click="handleContextEdit">
          {{ t('setting.editConfig') }}
        </button>
        <button
          v-if="!contextMenu.config || !isBuiltinFreeLlmConfig(contextMenu.config)"
          class="context-menu-item"
          @click="handleContextExport"
        >
          {{ t('setting.exportConfig') }}
        </button>
        <button
          v-if="contextMenu.config && !isPresetConfig(contextMenu.config)"
          class="context-menu-item text-destructive"
          @click="handleContextDelete"
        >
          {{ t('setting.deleteConfig') }}
        </button>
      </div>
      <div
        v-if="contextMenu.visible"
        class="context-menu-backdrop"
        @click="contextMenu.visible = false"
      />

      <!-- 编辑配置对话框（内嵌原配置表单，仅改绑定到 editDraft） -->
      <Dialog v-model:open="editDialogVisible">
        <DialogContent class="edit-config-dialog-content sm:max-w-[600px]">
          <DialogHeader class="shrink-0">
            <DialogTitle>{{ isNewConfigMode ? t('setting.newConfig') : t('setting.editConfig') }}</DialogTitle>
          </DialogHeader>
          <el-scrollbar class="edit-config-scrollbar">
            <div v-if="editDraft" class="space-y-6 py-4 pr-4">
              <FormField name="configName" :label="t('setting.configName')">
                <Input
                  v-model="editDraft.name"
                  :disabled="editDraftLockNameAndDescription"
                  class="max-w-md"
                  @blur="onNewConfigNameBlur"
                />
              </FormField>
              <template v-if="!isNewConfigMode || newConfigNameBlurred">
              <FormField name="configDescription" :label="t('setting.configDescription')">
                <Input
                  v-model="editDraft.description"
                  type="text"
                  :placeholder="t('setting.configDescriptionPlaceholder')"
                  :disabled="editDraftLockNameAndDescription"
                  class="max-w-md"
                />
              </FormField>
              <FormField name="llmType" :label="t('setting.llmType')">
                <Select
                  v-model="editDraft.selectedLlm"
                  :disabled="editDraftLockType"
                  @update:model-value="onEditDraftTypeChange"
                >
                  <SelectTrigger class="w-[200px]">
                    <SelectValue :placeholder="t('setting.chooseLlm')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-if="SHOW_METADOC_LLM_PROVIDER || editDraft.selectedLlm === 'metadoc'"
                      value="metadoc"
                    >
                      {{ t('setting.metadoc') }}
                    </SelectItem>
                    <SelectItem value="ollama">{{ t('setting.ollama') }}</SelectItem>
                    <SelectItem value="openai">{{ t('setting.openai') }}</SelectItem>
                    <SelectItem value="openai-official">{{ t('setting.openaiOfficial') }}</SelectItem>
                    <SelectItem value="deepseek">{{ t('setting.deepseek') }}</SelectItem>
                    <SelectItem value="gemini">{{ t('setting.gemini') }}</SelectItem>
                    <SelectItem value="qwen">{{ t('setting.qwen') }}</SelectItem>
                    <SelectItem v-if="isDev" value="manual">{{ t('setting.manual') }}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <!-- Ollama 配置（编辑用） -->
              <template v-if="editDraft.selectedLlm === 'ollama' && editDraft.ollama">
                <FormField name="apiBaseUrl" :label="t('setting.apiBaseUrl')">
                  <Input
                    v-model="editDraft.ollama.apiUrl"
                    :placeholder="t('setting.ollamaApiUrl')"
                    class="max-w-md"
                    @blur="onEditDialogApiBlur"
                  />
                </FormField>
                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    :model-value="editDraft?.ollama?.selectedModel || undefined"
                    :disabled="editDialogModelsLoading"
                    @update:model-value="
                      (v) => {
                        if (editDraft?.ollama)
                          editDraft.ollama.selectedModel = typeof v === 'string' ? v : ''
                      }
                    "
                  >
                    <SelectTrigger class="w-[280px] max-w-full">
                      <SelectValue
                        :placeholder="
                          editDialogModelsLoading ? t('common.loading') : t('setting.chooseModelPlaceholder')
                        "
                      />
                    </SelectTrigger>
                    <SelectContent class="max-h-[280px]">
                      <SelectItem
                        v-for="opt in ollamaModelSelectOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="editDraft.ollama.enableMaxTokens"
                      @update:checked="(val) => { if (editDraft?.ollama) editDraft.ollama.enableMaxTokens = val }"
                    />
                    <span class="text-sm text-muted-foreground">
                      {{ editDraft.ollama.enableMaxTokens ? t('setting.enabled') : t('setting.disabled') }}
                    </span>
                  </div>
                </FormField>
                <FormField
                  v-if="editDraft.ollama.enableMaxTokens"
                  name="ollamaMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField v-model="editDraft.ollama.maxTokens" :min="1" :max="32768" :step="100" class="w-[200px]">
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- OpenAI 配置（编辑用） -->
              <template v-else-if="editDraft.selectedLlm === 'openai' && editDraft.openai">
                <FormField name="apiBaseUrl" :label="t('setting.apiBaseUrl')">
                  <Input
                    v-model="editDraft.openai.apiUrl"
                    :placeholder="t('setting.openaiApiUrl')"
                    :disabled="editDialogIsBuiltinFree"
                    class="max-w-md"
                    @blur="onEditDialogApiBlur"
                  />
                </FormField>
                <FormField name="apiKey" :label="t('setting.apiKey')">
                  <Input
                    v-model="editDraft.openai.apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    class="max-w-md"
                    @blur="onEditDialogApiBlur"
                    @copy.prevent="editDialogIsBuiltinFree && editDraft.openai?.apiKey === BUILTIN_FREE_OPENROUTER_API_KEY"
                  />
                  <p v-if="editDialogIsBuiltinFree" class="text-xs text-muted-foreground mt-1">
                    {{ t('setting.builtinFreeApiKeyHint') }}
                  </p>
                </FormField>
                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    :model-value="editDraft?.openai?.selectedModel || undefined"
                    :disabled="editDialogIsBuiltinFree || editDialogModelsLoading"
                    @update:model-value="
                      (v) => {
                        if (editDraft?.openai)
                          editDraft.openai.selectedModel = typeof v === 'string' ? v : ''
                      }
                    "
                  >
                    <SelectTrigger class="w-[280px] max-w-full">
                      <SelectValue
                        :placeholder="
                          editDialogModelsLoading ? t('common.loading') : t('setting.chooseModelPlaceholder')
                        "
                      />
                    </SelectTrigger>
                    <SelectContent class="max-h-[280px]">
                      <SelectItem
                        v-for="opt in openaiModelSelectOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="editDraft.openai.enableMaxTokens"
                      @update:checked="(val) => { if (editDraft?.openai) editDraft.openai.enableMaxTokens = val }"
                    />
                    <span class="text-sm text-muted-foreground">
                      {{ editDraft.openai.enableMaxTokens ? t('setting.enabled') : t('setting.disabled') }}
                    </span>
                  </div>
                </FormField>
                <FormField
                  v-if="editDraft.openai.enableMaxTokens"
                  name="openaiMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField v-model="editDraft.openai.maxTokens" :min="1" :max="32768" :step="100" class="w-[200px]">
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- OpenAI Official 配置（编辑用） -->
              <template v-else-if="editDraft.selectedLlm === 'openai-official' && editDraft['openai-official']">
                <FormField name="apiKey" :label="t('setting.apiKey')">
                  <Input
                    v-model="editDraft['openai-official'].apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    class="max-w-md"
                    @blur="onEditDialogApiBlur"
                  />
                </FormField>
                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    :model-value="editDraft?.['openai-official']?.selectedModel || undefined"
                    :disabled="editDialogModelsLoading"
                    @update:model-value="
                      (v) => {
                        const d = editDraft?.['openai-official']
                        if (d) d.selectedModel = typeof v === 'string' ? v : ''
                      }
                    "
                  >
                    <SelectTrigger class="w-[280px] max-w-full">
                      <SelectValue
                        :placeholder="
                          editDialogModelsLoading ? t('common.loading') : t('setting.chooseModelPlaceholder')
                        "
                      />
                    </SelectTrigger>
                    <SelectContent class="max-h-[280px]">
                      <SelectItem
                        v-for="opt in openaiOfficialModelSelectOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="editDraft['openai-official'].enableMaxTokens"
                      @update:checked="
                        (val) => {
                          const d = editDraft?.['openai-official']
                          if (d) d.enableMaxTokens = val
                        }
                      "
                    />
                    <span class="text-sm text-muted-foreground">
                      {{ editDraft['openai-official'].enableMaxTokens ? t('setting.enabled') : t('setting.disabled') }}
                    </span>
                  </div>
                </FormField>
                <FormField
                  v-if="editDraft['openai-official'].enableMaxTokens"
                  name="openaiOfficialMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="editDraft['openai-official'].maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    class="w-[200px]"
                  >
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- DeepSeek 配置（编辑用） -->
              <template v-else-if="editDraft.selectedLlm === 'deepseek' && editDraft.deepseek">
                <FormField name="apiKey" :label="t('setting.apiKey')">
                  <Input
                    v-model="editDraft.deepseek.apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    class="max-w-md"
                  />
                </FormField>
                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    :model-value="editDraft?.deepseek?.selectedModel || undefined"
                    @update:model-value="
                      (v) => {
                        if (editDraft?.deepseek)
                          editDraft.deepseek.selectedModel = typeof v === 'string' ? v : ''
                      }
                    "
                  >
                    <SelectTrigger class="w-[280px] max-w-full">
                      <SelectValue :placeholder="t('setting.chooseModelPlaceholder')" />
                    </SelectTrigger>
                    <SelectContent class="max-h-[280px]">
                      <SelectItem
                        v-for="opt in deepseekModelSelectOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="editDraft.deepseek.enableMaxTokens"
                      @update:checked="(val) => { if (editDraft?.deepseek) editDraft.deepseek.enableMaxTokens = val }"
                    />
                    <span class="text-sm text-muted-foreground">
                      {{ editDraft.deepseek.enableMaxTokens ? t('setting.enabled') : t('setting.disabled') }}
                    </span>
                  </div>
                </FormField>
                <FormField
                  v-if="editDraft.deepseek.enableMaxTokens"
                  name="deepseekMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField v-model="editDraft.deepseek.maxTokens" :min="1" :max="32768" :step="100" class="w-[200px]">
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- Gemini 配置（编辑用） -->
              <template v-else-if="editDraft.selectedLlm === 'gemini' && editDraft.gemini">
                <FormField name="apiKey" :label="t('setting.apiKey')">
                  <Input
                    v-model="editDraft.gemini.apiKey"
                    type="password"
                    :placeholder="t('setting.geminiApiKeyPlaceholder')"
                    class="max-w-md"
                    @blur="onEditDialogApiBlur"
                  />
                </FormField>
                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    :model-value="editDraft?.gemini?.selectedModel || undefined"
                    :disabled="editDialogModelsLoading"
                    @update:model-value="
                      (v) => {
                        if (editDraft?.gemini)
                          editDraft.gemini.selectedModel = typeof v === 'string' ? v : ''
                      }
                    "
                  >
                    <SelectTrigger class="w-[280px] max-w-full">
                      <SelectValue
                        :placeholder="
                          editDialogModelsLoading ? t('common.loading') : t('setting.chooseModelPlaceholder')
                        "
                      />
                    </SelectTrigger>
                    <SelectContent class="max-h-[280px]">
                      <SelectItem
                        v-for="opt in geminiModelSelectOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="editDraft.gemini.enableMaxTokens"
                      @update:checked="(val) => { if (editDraft?.gemini) editDraft.gemini.enableMaxTokens = val }"
                    />
                    <span class="text-sm text-muted-foreground">
                      {{ editDraft.gemini.enableMaxTokens ? t('setting.enabled') : t('setting.disabled') }}
                    </span>
                  </div>
                </FormField>
                <FormField
                  v-if="editDraft.gemini.enableMaxTokens"
                  name="geminiMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField v-model="editDraft.gemini.maxTokens" :min="1" :max="32768" :step="100" class="w-[200px]">
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- 千问/百炼 配置（编辑用） -->
              <template v-else-if="editDraft.selectedLlm === 'qwen' && editDraft.qwen">
                <FormField name="apiBaseUrl" :label="t('setting.apiBaseUrl')">
                  <Input
                    v-model="editDraft.qwen.apiUrl"
                    :placeholder="t('setting.qwenApiUrlPlaceholder')"
                    class="max-w-md"
                  />
                  <p class="text-xs text-muted-foreground mt-1">{{ t('setting.qwenHint') }}</p>
                </FormField>
                <FormField name="apiKey" :label="t('setting.apiKey')">
                  <Input
                    v-model="editDraft.qwen.apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    class="max-w-md"
                  />
                </FormField>
                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    :model-value="editDraft?.qwen?.selectedModel || undefined"
                    @update:model-value="
                      (v) => {
                        if (editDraft?.qwen)
                          editDraft.qwen.selectedModel = typeof v === 'string' ? v : ''
                      }
                    "
                  >
                    <SelectTrigger class="w-[280px] max-w-full">
                      <SelectValue :placeholder="t('setting.chooseModelPlaceholder')" />
                    </SelectTrigger>
                    <SelectContent class="max-h-[280px]">
                      <SelectItem
                        v-for="opt in qwenModelSelectOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="editDraft.qwen.enableMaxTokens"
                      @update:checked="(val) => { if (editDraft?.qwen) editDraft.qwen.enableMaxTokens = val }"
                    />
                    <span class="text-sm text-muted-foreground">
                      {{ editDraft.qwen.enableMaxTokens ? t('setting.enabled') : t('setting.disabled') }}
                    </span>
                  </div>
                </FormField>
                <FormField
                  v-if="editDraft.qwen.enableMaxTokens"
                  name="qwenMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField v-model="editDraft.qwen.maxTokens" :min="1" :max="32768" :step="100" class="w-[200px]">
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- MetaDoc 配置（编辑用） -->
              <template v-else-if="editDraft.selectedLlm === 'metadoc' && editDraft.metadoc">
                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    :model-value="editDraft?.metadoc?.selectedModel || undefined"
                    :disabled="editDialogModelsLoading"
                    @update:model-value="
                      (v) => {
                        if (editDraft?.metadoc)
                          editDraft.metadoc.selectedModel = typeof v === 'string' ? v : ''
                      }
                    "
                  >
                    <SelectTrigger class="w-[280px] max-w-full">
                      <SelectValue
                        :placeholder="
                          editDialogModelsLoading ? t('common.loading') : t('setting.chooseModelPlaceholder')
                        "
                      />
                    </SelectTrigger>
                    <SelectContent class="max-h-[280px]">
                      <SelectItem
                        v-for="opt in metadocModelSelectOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="editDraft.metadoc.enableMaxTokens"
                      @update:checked="(val) => { if (editDraft?.metadoc) editDraft.metadoc.enableMaxTokens = val }"
                    />
                    <span class="text-sm text-muted-foreground">
                      {{ editDraft.metadoc.enableMaxTokens ? t('setting.enabled') : t('setting.disabled') }}
                    </span>
                  </div>
                </FormField>
                <FormField
                  v-if="editDraft.metadoc.enableMaxTokens"
                  name="metadocMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField v-model="editDraft.metadoc.maxTokens" :min="1" :max="32768" :step="100" class="w-[200px]">
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- Manual 配置仅提示，不在此编辑 -->
              <template v-else-if="editDraft.selectedLlm === 'manual'">
                <Alert>
                  <Info class="h-4 w-4" />
                  <AlertTitle>{{ t('setting.manualConfigHint') }}</AlertTitle>
                </Alert>
              </template>
              </template>
            </div>
          </el-scrollbar>
          <DialogFooter class="flex-wrap gap-2 shrink-0">
            <Button
              v-if="editDraft && editDialogIsPreset && !isNewConfigMode"
              variant="outline"
              class="mr-auto text-muted-foreground"
              @click="handleResetConfigToPreset"
            >
              {{ t('setting.resetConfigToPreset') }}
            </Button>
            <div class="flex gap-2 ml-auto">
              <Button variant="outline" @click="closeEditDialog">
                {{ t('common.cancel') }}
              </Button>
              <Button @click="saveEditDialog">
                {{ t('common.confirm') }}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    <!-- 手动LLM界面对话框 -->
    <Dialog v-model:open="manualLLMDialogVisible">
      <DialogContent class="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>{{ t('setting.manualLLMInterface') }}</DialogTitle>
        </DialogHeader>
        <div class="py-4 space-y-4">
          <FormField name="pendingRequests" :label="t('setting.pendingRequests')">
            <div class="flex items-center gap-2">
              <Select v-model="selectedRequestId" @update:model-value="selectPendingRequest">
                <SelectTrigger class="w-[320px]">
                  <SelectValue :placeholder="t('setting.selectPendingRequest')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="req in pendingRequests"
                    :key="req.requestId"
                    :value="req.requestId"
                  >
                    {{ req.requestId }} ({{ req.type }}, {{ req.stream ? 'stream' : 'non-stream' }})
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" @click="fetchPendingRequests">
                {{ t('setting.refreshRequests') }}
              </Button>
            </div>
          </FormField>

          <FormField name="manualTokenInput" :label="t('setting.manualTokenInput')">
            <Textarea
              v-model="manualTokenInput"
              :placeholder="t('setting.manualTokenInputPlaceholder')"
              rows="10"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="clearManualToken">
            {{ t('setting.clearManualToken') }}
          </Button>
          <Button
            @click="submitManualResponse"
            :disabled="!manualTokenInput.trim() || !selectedRequestId"
          >
            {{ t('setting.submitManualResponse') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import axios from 'axios'
import { useI18n } from 'vue-i18n'
import { settings, setSetting, getSetting } from '../../utils/settings.js'
import eventBus from '../../utils/event-bus.js'
import { getMetaDocLlmModels } from '../../utils/web-utils.ts'
import { createRendererLogger } from '../../utils/logger.ts'
import { isDevEnvironment } from '../../utils/dev-env'
import { ai_types, createAiTask, cancelAiTask } from '../../utils/ai_tasks.ts'
import messageBridge from '../../bridge/message-bridge'
import {
  getAllConfigs,
  getCurrentConfig,
  switchConfig,
  deleteConfig,
  createConfigFromCurrentSettings,
  getConfigDataFromCurrentSettings,
  addConfig,
  exportConfig,
  exportAllConfigs,
  importConfigs,
  loadLlmConfigs,
  copyConfig,
  isPresetConfig,
  isBuiltinFreeLlmConfig,
  updateConfig,
  resetConfigToPreset,
  type LlmConfigItem
} from '../../utils/llm-config-manager'
import { getLlmConfigDisplayName } from '../../utils/llm-config-display'

// Icons
import {
  Plus,
  ClipboardCopy,
  Download,
  Minus,
  Plus as PlusIcon,
  Info,
  HelpCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-vue-next'

// shadcn-vue 组件
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Slider } from '@renderer/components/ui/slider'
import { Badge } from '@renderer/components/ui/badge'
import { Alert, AlertTitle } from '@renderer/components/ui/alert'
import { FormField } from '@renderer/components/ui/form'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@renderer/components/ui/dropdown-menu'
import {
  NumberField,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement
} from '@renderer/components/ui/number-field'
import { Separator } from '@renderer/components/ui/separator'

// Element Plus 消息组件
import { messageBox } from '@renderer/utils/messageBox'
import { notifySuccess, notifyError, notifyWarning } from '@renderer/utils/notify'

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

// Demo mode support
const props = defineProps<{
  mode?: string
}>()
const isDemo = computed(() => props.mode === 'demo')

const { t } = useI18n()
const logger = createRendererLogger('SettingLlm')

const BUILTIN_FREE_OPENROUTER_API_KEY =
  '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'

/** MetaDoc 云端 LLM 后端暂不可用（serverless），隐藏新建入口；旧配置仍可在编辑对话框中显示 */
const SHOW_METADOC_LLM_PROVIDER = false

const ollamaModels = ref<OllamaModel[]>([])
const openaiModels = ref<OpenAIModel[]>([])
const openaiOfficialModels = ref<OpenAIModel[]>([])
const geminiModels = ref<Array<{ name: string; displayName?: string }>>([])
const metadocModels = ref<MetaDocModel[]>([])

const DEEPSEEK_MODELS = [
  { value: 'deepseek-chat', label: 'deepseek-chat' },
  { value: 'deepseek-reasoner', label: 'deepseek-reasoner' }
]
const QWEN_MODELS = [
  { value: 'qwen-turbo', label: 'qwen-turbo' },
  { value: 'qwen-plus', label: 'qwen-plus' },
  { value: 'qwen-max', label: 'qwen-max' },
  { value: 'qwen-max-latest', label: 'qwen-max-latest' },
  { value: 'qwen3-max', label: 'qwen3-max' },
  { value: 'qwen3.5-plus', label: 'qwen3.5-plus' },
  { value: 'qwen3.5-flash', label: 'qwen3.5-flash' },
  { value: 'qwen3-coder-plus', label: 'qwen3-coder-plus' },
  { value: 'qwq-plus', label: 'qwq-plus' }
]

const isDev = ref(false)
const llmConfigs = ref<LlmConfigItem[]>([])
const currentConfigId = ref<string>('')
const manualTokenInput = ref('')
const pendingManualRequestId = ref<string>('')
const manualLLMDialogVisible = ref(false)
const pendingRequests = ref<Array<{ requestId: string; type: string; stream: boolean }>>([])
const selectedRequestId = ref<string>('')

// 卡片检查状态：'success' 全过 | 'partial' 部分过 | 'error' 全不过；details 为四项测试结果
const checkStatusMap = ref<
  Record<
    string,
    {
      status: 'success' | 'partial' | 'error'
      message?: string
      details?: {
        streamCompletion: boolean
        nonStreamCompletion: boolean
        streamChat: boolean
        nonStreamChat: boolean
      }
    }
  >
>({})
const checkLoadingMap = ref<Record<string, boolean>>({})
const checkAllLoading = ref(false)

// 右键菜单
const contextMenu = reactive<{ visible: boolean; x: number; y: number; config: LlmConfigItem | null }>({
  visible: false,
  x: 0,
  y: 0,
  config: null
})

// 编辑对话框
const editDialogVisible = ref(false)
const editDraft = ref<{
  id: string
  name: string
  description?: string
  selectedLlm: string
  ollama?: LlmConfigItem['ollama']
  openai?: LlmConfigItem['openai']
  'openai-official'?: LlmConfigItem['openai-official']
  deepseek?: LlmConfigItem['deepseek']
  gemini?: LlmConfigItem['gemini']
  qwen?: LlmConfigItem['qwen']
  metadoc?: LlmConfigItem['metadoc']
} | null>(null)
const editDialogIsPreset = computed(() => {
  if (!editDraft.value) return false
  const c = llmConfigs.value.find((x) => x.id === editDraft.value!.id)
  return c ? isPresetConfig(c) : false
})
const editDialogIsBuiltinFree = computed(() => {
  if (!editDraft.value) return false
  const c = llmConfigs.value.find((x) => x.id === editDraft.value!.id)
  return c ? isBuiltinFreeLlmConfig(c) : false
})
const newConfigNameBlurred = ref(false)
const isNewConfigMode = computed(() => editDraft.value?.id === 'new')
const editDraftLockType = computed(() => {
  if (!editDraft.value) return false
  const c = llmConfigs.value.find((x) => x.id === editDraft.value!.id)
  return c ? isPresetConfig(c) : false
})

const editDraftLockNameAndDescription = computed(() => editDialogIsBuiltinFree.value)

const editDialogModelsLoading = ref(false)

function modelOptionsWithCurrent(
  list: { value: string; label: string }[],
  current: string | undefined
): { value: string; label: string }[] {
  const c = (current ?? '').trim()
  if (!c || list.some((i) => i.value === c)) return list
  return [{ value: c, label: c }, ...list]
}

const ollamaModelSelectOptions = computed(() => {
  const d = editDraft.value?.ollama
  if (!d) return []
  const list = ollamaModels.value.map((m) => ({
    value: m.model,
    label: m.name || m.model
  }))
  return modelOptionsWithCurrent(list, d.selectedModel)
})

const openaiModelSelectOptions = computed(() => {
  const d = editDraft.value?.openai
  if (!d) return []
  const list = openaiModels.value.map((m) => ({ value: m.id, label: m.id }))
  return modelOptionsWithCurrent(list, d.selectedModel)
})

const openaiOfficialModelSelectOptions = computed(() => {
  const d = editDraft.value?.['openai-official']
  if (!d) return []
  const list = openaiOfficialModels.value.map((m) => ({ value: m.id, label: m.id }))
  return modelOptionsWithCurrent(list, d.selectedModel)
})

const deepseekModelSelectOptions = computed(() => {
  const d = editDraft.value?.deepseek
  if (!d) return []
  return modelOptionsWithCurrent([...DEEPSEEK_MODELS], d.selectedModel)
})

const geminiModelSelectOptions = computed(() => {
  const d = editDraft.value?.gemini
  if (!d) return []
  const list = geminiModels.value.map((m) => ({
    value: m.name,
    label: m.displayName || m.name
  }))
  return modelOptionsWithCurrent(list, d.selectedModel)
})

const qwenModelSelectOptions = computed(() => {
  const d = editDraft.value?.qwen
  if (!d) return []
  return modelOptionsWithCurrent([...QWEN_MODELS], d.selectedModel)
})

const metadocModelSelectOptions = computed(() => {
  const d = editDraft.value?.metadoc
  if (!d) return []
  const list = metadocModels.value.map((m) => ({ value: m.label, label: m.label }))
  return modelOptionsWithCurrent(list, d.selectedModel)
})

const isCurrentConfigManual = computed(() => {
  const c = getCurrentConfig()
  return c?.type === 'manual'
})

const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value)
}

const getConfigDisplayName = (config: LlmConfigItem): string =>
  getLlmConfigDisplayName(config, t)

const getConfigTypeLabel = (type: string): string => {
  const keyMap: Record<string, string> = {
    metadoc: 'setting.metadoc',
    ollama: 'setting.ollama',
    openai: 'setting.openai',
    'openai-official': 'setting.openaiOfficial',
    deepseek: 'setting.deepseek',
    gemini: 'setting.gemini',
    qwen: 'setting.qwen',
    manual: 'setting.manual'
  }
  return keyMap[type] ? t(keyMap[type]) : type
}

const handleCardClick = async (config: LlmConfigItem) => {
  if (currentConfigId.value === config.id) return
  await switchConfig(config.id)
  currentConfigId.value = config.id
  await fetchLlmSettings()
  eventBus.emit('llm-api-updated')
  notifySuccess(t('setting.configSwitched'))
  if (config.type === 'metadoc') {
    fetchMetaDocModels()
  } else if (config.type === 'ollama' && config.ollama?.apiUrl) {
    fetchOllamaModels()
  } else if (config.type === 'openai' && config.openai?.apiUrl && config.openai?.apiKey) {
    fetchOpenAIModels()
  } else if (config.type === 'openai-official' && config['openai-official']?.apiKey) {
    fetchOpenAIOfficialModels()
  } else if (config.type === 'gemini' && config.gemini?.apiKey) {
    fetchGeminiModels()
  } else if (config.type === 'manual') {
    loadManualTokenFromCache()
    fetchPendingRequests()
  }
}

const openContextMenu = (e: MouseEvent, config: LlmConfigItem) => {
  contextMenu.visible = true
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.config = config
}

const handleContextCopy = () => {
  if (!contextMenu.config) return
  if (isBuiltinFreeLlmConfig(contextMenu.config)) {
    notifyWarning(t('setting.builtinFreeConfigCannotCopy'))
    contextMenu.visible = false
    return
  }
  const copied = copyConfig(contextMenu.config.id)
  if (copied) {
    loadConfigs()
    notifySuccess(t('setting.copyConfigSuccess'))
  }
  contextMenu.visible = false
}

const handleContextEdit = () => {
  if (!contextMenu.config) return
  openEditDialog(contextMenu.config)
  contextMenu.visible = false
}

const handleContextExport = () => {
  if (!contextMenu.config) return
  if (isBuiltinFreeLlmConfig(contextMenu.config)) {
    notifyWarning(t('setting.builtinFreeConfigCannotExport'))
    contextMenu.visible = false
    return
  }
  handleExportConfig(contextMenu.config.id)
  contextMenu.visible = false
}

const handleContextDelete = () => {
  if (!contextMenu.config || isPresetConfig(contextMenu.config)) return
  handleDeleteConfig(contextMenu.config.id)
  contextMenu.visible = false
}

/** 将 LlmConfigItem 转为 createAdapterFromSettings 使用的 customConfig 形状，用于并发检查时不切换全局配置 */
function buildCustomLlmConfigFromItem(item: LlmConfigItem): { baseUrl: string; apiKey?: string; model: string; type: string } | null {
  const t = item.type
  if (t === 'manual' || t === 'metadoc') return null
  if (t === 'ollama' && item.ollama) {
    return { baseUrl: item.ollama.apiUrl || '', model: item.ollama.selectedModel || '', type: 'ollama' }
  }
  if (t === 'openai' && item.openai) {
    return {
      baseUrl: item.openai.apiUrl || '',
      apiKey: item.openai.apiKey,
      model: item.openai.selectedModel || '',
      type: 'openai'
    }
  }
  if (t === 'openai-official' && item['openai-official']) {
    return {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: item['openai-official'].apiKey,
      model: item['openai-official'].selectedModel || '',
      type: 'openai-official'
    }
  }
  if (t === 'deepseek' && item.deepseek) {
    return {
      baseUrl: 'https://api.deepseek.com',
      apiKey: item.deepseek.apiKey,
      model: item.deepseek.selectedModel || '',
      type: 'deepseek'
    }
  }
  if (t === 'gemini' && item.gemini) {
    return {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: item.gemini.apiKey,
      model: item.gemini.selectedModel || '',
      type: 'gemini'
    }
  }
  if (t === 'qwen' && item.qwen) {
    return {
      baseUrl: item.qwen.apiUrl || 'https://dashscope.aliyuncs.com',
      apiKey: item.qwen.apiKey,
      model: item.qwen.selectedModel || '',
      type: 'qwen'
    }
  }
  return null
}

const runOneCheck = async (
  type: 'answer' | 'chat',
  stream: boolean,
  configId: string,
  prompt: string,
  temperature: number,
  customLlmConfig?: { baseUrl: string; apiKey?: string; model: string; type: string } | null
): Promise<boolean> => {
  const testRef = ref('')
  const originKey = `llm-check-${configId}-${Date.now()}-${type}-${stream}`
  const taskName =
    type === 'answer'
      ? stream
        ? t('setting.testCompletionStream')
        : t('setting.testCompletionNonStream')
      : stream
        ? t('setting.testChatStream')
        : t('setting.testChatNonStream')
  const meta = { stream, temperature, customLlmConfig: customLlmConfig || undefined }
  try {
    const payload =
      type === 'answer' ? prompt : ([{ role: 'user', content: prompt }] as Array<{ role: string; content: string }>)
    const { handle, done } = createAiTask(
      taskName,
      payload,
      testRef,
      type === 'answer' ? ai_types.answer : ai_types.chat,
      originKey,
      meta
    )
    if (stream) {
      let resolved = false
      const stop = watch(
        () => testRef.value,
        (val) => {
          if (val && val.length > 0 && !resolved) {
            resolved = true
            stop()
            cancelAiTask(handle, false, false)
          }
        }
      )
      await done
      if (!resolved) resolved = true
      return true
    }
    await done
    return (testRef.value?.length ?? 0) > 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('取消') || msg.includes('aborted') || msg.includes('cancelled')) return true
    return false
  }
}

const handleCheckConfig = async (config: LlmConfigItem, options?: { useCustomConfig?: boolean }) => {
  if (checkLoadingMap.value[config.id]) return
  const useCustomConfig = options?.useCustomConfig === true
  const prevId = currentConfigId.value
  checkLoadingMap.value = { ...checkLoadingMap.value, [config.id]: true }
  checkStatusMap.value = { ...checkStatusMap.value, [config.id]: undefined as any }

  try {
    if (!useCustomConfig) {
      await switchConfig(config.id)
      currentConfigId.value = config.id
      await fetchLlmSettings()
    }

    const temperature = (await getSetting('llmTemperature')) || 1.3
    const prompt = `${new Date().toLocaleString()}\n${t('setting.testPrompt')}`
    const customLlmConfig = useCustomConfig ? buildCustomLlmConfigFromItem(config) : undefined

    // 串行执行四项测试：并行会对同一 LLM 端点并发请求，易触发限流/连接中断，
    // 且流式测试会在首 token 后主动 abort，并行时容易互相干扰并出现 “Invalid JSON” 等误报。
    const streamCompletion = await runOneCheck(
      'answer',
      true,
      config.id,
      prompt,
      temperature,
      customLlmConfig ?? undefined
    )
    const nonStreamCompletion = await runOneCheck(
      'answer',
      false,
      config.id,
      prompt,
      temperature,
      customLlmConfig ?? undefined
    )
    const streamChat = await runOneCheck(
      'chat',
      true,
      config.id,
      prompt,
      temperature,
      customLlmConfig ?? undefined
    )
    const nonStreamChat = await runOneCheck(
      'chat',
      false,
      config.id,
      prompt,
      temperature,
      customLlmConfig ?? undefined
    )

    const details = {
      streamCompletion,
      nonStreamCompletion,
      streamChat,
      nonStreamChat
    }
    const passCount =
      (streamCompletion ? 1 : 0) +
      (nonStreamCompletion ? 1 : 0) +
      (streamChat ? 1 : 0) +
      (nonStreamChat ? 1 : 0)
    const status: 'success' | 'partial' | 'error' =
      passCount === 4 ? 'success' : passCount === 0 ? 'error' : 'partial'

    checkStatusMap.value = {
      ...checkStatusMap.value,
      [config.id]: { status, details }
    }
  } catch (err) {
    checkStatusMap.value = {
      ...checkStatusMap.value,
      [config.id]: {
        status: 'error',
        message: (err instanceof Error ? err.message : String(err)).slice(0, 80)
      }
    }
  } finally {
    checkLoadingMap.value = { ...checkLoadingMap.value, [config.id]: false }
    if (!useCustomConfig && prevId && prevId !== config.id) {
      await switchConfig(prevId)
      currentConfigId.value = prevId
      await fetchLlmSettings()
    }
  }
}

const handleCheckAllConfigs = async () => {
  if (checkAllLoading.value) return
  const list = llmConfigs.value.filter((c) => c.type !== 'manual' && c.type !== 'metadoc' && buildCustomLlmConfigFromItem(c) != null)
  if (list.length === 0) return
  checkAllLoading.value = true
  try {
    await Promise.all(list.map((config) => handleCheckConfig(config, { useCustomConfig: true })))
    notifySuccess(t('setting.checkAllConfigsDone'))
  } finally {
    checkAllLoading.value = false
  }
}

const handleImportFromFiles = async () => {
  try {
    const result = await messageBridge.invoke('show-open-dialog', {
      title: t('setting.importConfig'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result?.canceled || !result?.filePaths?.length) return
    let totalImported = 0
    const errors: string[] = []
    for (const filePath of result.filePaths) {
      try {
        const content = await messageBridge.invoke('read-file-content', filePath)
        if (content == null) {
          errors.push(t('setting.readFileFailed') || '无法读取文件')
          continue
        }
        const res = importConfigs(content)
        if (res.success) totalImported += res.imported
        if (res.errors?.length) errors.push(...res.errors)
      } catch (e) {
        errors.push((e instanceof Error ? e.message : String(e)).slice(0, 60))
      }
    }
    loadConfigs()
    if (totalImported > 0) {
      notifySuccess(t('setting.importSuccess', { count: totalImported }))
    }
    if (errors.length > 0) {
      notifyWarning(errors.slice(0, 3).join('; '))
    }
  } catch (err) {
    logger.error('批量导入配置失败', err)
    notifyError(t('setting.importFailed'))
  }
}

function buildEditDraftFromConfig(config: LlmConfigItem) {
  const draft: NonNullable<typeof editDraft.value> = {
    id: config.id,
    name: config.name,
    description: config.description ?? '',
    selectedLlm: config.type
  }
  if (config.ollama) draft.ollama = { ...config.ollama }
  if (config.openai) draft.openai = { ...config.openai }
  if (config['openai-official']) draft['openai-official'] = { ...config['openai-official'] }
  if (config.deepseek) draft.deepseek = { ...config.deepseek }
  if (config.gemini) draft.gemini = { ...config.gemini }
  if (config.qwen) draft.qwen = { ...config.qwen }
  if (config.metadoc) draft.metadoc = { ...config.metadoc }
  return draft
}

const openEditDialog = (config: LlmConfigItem) => {
  editDraft.value = buildEditDraftFromConfig(config)
  newConfigNameBlurred.value = false
  editDialogVisible.value = true
  void nextTick(() => void refreshEditDialogModels())
}

const closeEditDialog = () => {
  editDialogVisible.value = false
  editDraft.value = null
  newConfigNameBlurred.value = false
}

const onNewConfigNameBlur = () => {
  if (isNewConfigMode.value) newConfigNameBlurred.value = true
}

const handleResetConfigToPreset = async () => {
  if (!editDraft.value) return
  const updated = await resetConfigToPreset(editDraft.value.id)
  if (updated) {
    loadConfigs()
    editDraft.value = buildEditDraftFromConfig(updated)
    notifySuccess(t('setting.resetConfigSuccess'))
    void nextTick(() => void refreshEditDialogModels())
  }
}

const onEditDraftTypeChange = () => {
  const type = editDraft.value?.selectedLlm
  if (!type || type === 'manual') return
  const defaults: Record<string, any> = {
    ollama: {
      apiUrl: 'http://localhost:11434/api',
      selectedModel: '',
      enableMaxTokens: false,
      maxTokens: 4096
    },
    openai: {
      apiUrl: 'https://api.openai.com/v1',
      apiKey: '',
      selectedModel: '',
      enableMaxTokens: false,
      maxTokens: 4096
    },
    'openai-official': { apiKey: '', selectedModel: '', enableMaxTokens: false, maxTokens: 4096 },
    deepseek: { apiKey: '', selectedModel: 'deepseek-chat', enableMaxTokens: false, maxTokens: 4096 },
    gemini: { apiKey: '', selectedModel: 'gemini-2.0-flash', enableMaxTokens: false, maxTokens: 4096 },
    qwen: {
      apiKey: '',
      apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      selectedModel: 'qwen-plus',
      enableMaxTokens: false,
      maxTokens: 4096
    },
    metadoc: { selectedModel: '', enableMaxTokens: false, maxTokens: 4096 }
  }
  if (editDraft.value && defaults[type]) {
    ;(editDraft.value as any)[type] = defaults[type]
  }
  void nextTick(() => void refreshEditDialogModels())
}

const saveEditDialog = async () => {
  if (!editDraft.value) return
  const id = editDraft.value.id
  const type = editDraft.value.selectedLlm
  const name = (editDraft.value.name || '').trim()
  if (!name) {
    notifyError(t('setting.configNameRequired'))
    return
  }
  if (id === 'new') {
    const payload: Omit<LlmConfigItem, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      description: editDraft.value.description ?? undefined,
      type: type as LlmConfigItem['type']
    }
    if (editDraft.value.ollama) payload.ollama = editDraft.value.ollama
    if (editDraft.value.openai) payload.openai = editDraft.value.openai
    if (editDraft.value['openai-official']) payload['openai-official'] = editDraft.value['openai-official']
    if (editDraft.value.deepseek) payload.deepseek = editDraft.value.deepseek
    if (editDraft.value.gemini) payload.gemini = editDraft.value.gemini
    if (editDraft.value.qwen) payload.qwen = editDraft.value.qwen
    if (editDraft.value.metadoc) payload.metadoc = editDraft.value.metadoc
    const newConfig = addConfig(payload)
    loadConfigs()
    closeEditDialog()
    currentConfigId.value = newConfig.id
    await switchConfig(newConfig.id)
    await fetchLlmSettings()
    eventBus.emit('llm-api-updated')
    notifySuccess(t('setting.configCreated'))
    return
  }
  const updates: Partial<LlmConfigItem> = {
    name,
    description: editDraft.value.description ?? undefined,
    type: type as LlmConfigItem['type']
  }
  if (editDraft.value.ollama) updates.ollama = editDraft.value.ollama
  if (editDraft.value.openai) updates.openai = editDraft.value.openai
  if (editDraft.value['openai-official']) updates['openai-official'] = editDraft.value['openai-official']
  if (editDraft.value.deepseek) updates.deepseek = editDraft.value.deepseek
  if (editDraft.value.gemini) updates.gemini = editDraft.value.gemini
  if (editDraft.value.qwen) updates.qwen = editDraft.value.qwen
  if (editDraft.value.metadoc) updates.metadoc = editDraft.value.metadoc

  // 内置免费模型：只允许修改 API Key（其余字段保持固定）
  if (editDialogIsBuiltinFree.value) {
    const apiKey = editDraft.value.openai?.apiKey ?? ''
    const success = await updateConfig(id, {
      openai: {
        apiUrl: 'https://openrouter.ai/api/v1',
        apiKey,
        selectedModel: 'openrouter/free',
        enableMaxTokens: false,
        maxTokens: 4096
      }
    })
    if (success) {
      loadConfigs()
      closeEditDialog()
      if (currentConfigId.value === id) {
        await fetchLlmSettings()
        eventBus.emit('llm-api-updated')
      }
      notifySuccess(t('setting.configSaved'))
    } else {
      notifyError(t('setting.saveFailed'))
    }
    return
  }

  const success = await updateConfig(id, updates)
  if (success) {
    loadConfigs()
    closeEditDialog()
    if (currentConfigId.value === id) {
      await fetchLlmSettings()
      eventBus.emit('llm-api-updated')
    }
    notifySuccess(t('setting.configSaved'))
  } else {
    notifyError(t('setting.saveFailed'))
  }
}

const handleTemperatureChange = (val: number) => {
  settings.llmTemperature = val
  saveSetting('llmTemperature', val)
}

const incrementTemperature = () => {
  const newVal = Math.min(2, settings.llmTemperature + 0.1)
  handleTemperatureChange(newVal)
}

const decrementTemperature = () => {
  const newVal = Math.max(0, settings.llmTemperature - 0.1)
  handleTemperatureChange(newVal)
}

const handleRemoveThinkTagChange = (val: boolean) => {
  settings.autoRemoveThinkTag = val
  saveSetting('autoRemoveThinkTag', val)
}

const handleLlmApiErrorDialogToggle = (val: boolean) => {
  settings.llmApiErrorDialogEnabled = val
  saveSetting('llmApiErrorDialogEnabled', val)
}

const handleAgentTerminalExecutionAllowedChange = (val: boolean) => {
  settings.agentTerminalExecutionAllowed = val
  saveSetting('agentTerminalExecutionAllowed', val)
}

const fetchLlmSettings = async () => {
  settings.selectedLlm = (await getSetting('selectedLlm')) || ''

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
  if (typeof settings.qwen !== 'object' || settings.qwen === null) {
    settings.qwen = {
      apiKey: '',
      apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      selectedModel: 'qwen-plus',
      enableMaxTokens: false,
      maxTokens: 4096
    }
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
  settings.qwen.apiKey = (await getSetting('qwenApiKey')) || ''
  settings.qwen.apiUrl =
    (await getSetting('qwenApiUrl')) || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  settings.qwen.selectedModel = (await getSetting('qwenSelectedModel')) || 'qwen-plus'
  settings.qwen.enableMaxTokens = (await getSetting('qwenEnableMaxTokens')) ?? false
  settings.qwen.maxTokens = (await getSetting('qwenMaxTokens')) || 4096

  settings.llmTemperature = (await getSetting('llmTemperature')) || 1.3
  settings.autoRemoveThinkTag = (await getSetting('autoRemoveThinkTag')) ?? true
  settings.llmApiErrorDialogEnabled = (await getSetting('llmApiErrorDialogEnabled')) !== false
  settings.agentTerminalExecutionAllowed =
    (await getSetting('agentTerminalExecutionAllowed')) !== false
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
  setSetting('qwenApiKey', settings.qwen.apiKey)
  setSetting('qwenApiUrl', settings.qwen.apiUrl)
  setSetting('qwenSelectedModel', settings.qwen.selectedModel)
  setSetting('qwenEnableMaxTokens', settings.qwen.enableMaxTokens)
  setSetting('qwenMaxTokens', settings.qwen.maxTokens)
  setSetting('llmApiErrorDialogEnabled', settings.llmApiErrorDialogEnabled)
  setSetting('agentTerminalExecutionAllowed', settings.agentTerminalExecutionAllowed)
  eventBus.emit('llm-api-updated')
}


const fetchMetaDocModels = async () => {
  try {
    const models = await getMetaDocLlmModels()
    metadocModels.value = models ?? []
  } catch (error) {
    logger.error('获取 MetaDoc 模型失败', error)
  }
}

const fetchOllamaModels = async (apiUrl?: string) => {
  const url = (apiUrl ?? settings.ollama.apiUrl)?.trim()
  if (!url) return

  try {
    const response = await axios.get(`${url}/tags`)
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

const fetchOpenAIModels = async (apiUrl?: string, apiKey?: string) => {
  const u = (apiUrl ?? settings.openai.apiUrl)?.trim()
  const k = (apiKey ?? settings.openai.apiKey) || ''
  if (!u || !k) return

  try {
    const response = await axios.get(`${u}/models`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${k}`
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

const fetchOpenAIOfficialModels = async (apiKey?: string) => {
  const k = (apiKey ?? settings['openai-official'].apiKey) || ''
  if (!k) return

  try {
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${k}`
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

const fetchGeminiModels = async (apiKey?: string) => {
  const k = (apiKey ?? settings.gemini.apiKey) || ''
  if (!k) return

  try {
    const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
      params: { key: k },
      headers: { Accept: 'application/json' }
    })

    if (response.data?.models) {
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

const refreshEditDialogModels = async () => {
  if (!editDialogVisible.value || !editDraft.value) return
  const type = editDraft.value.selectedLlm
  const needsRemote =
    type === 'ollama' ||
    type === 'openai' ||
    type === 'openai-official' ||
    type === 'gemini' ||
    type === 'metadoc'
  if (needsRemote) editDialogModelsLoading.value = true
  try {
    switch (type) {
      case 'ollama':
        await fetchOllamaModels(editDraft.value.ollama?.apiUrl)
        break
      case 'openai':
        if (!editDialogIsBuiltinFree.value) {
          await fetchOpenAIModels(editDraft.value.openai?.apiUrl, editDraft.value.openai?.apiKey)
        }
        break
      case 'openai-official':
        await fetchOpenAIOfficialModels(editDraft.value['openai-official']?.apiKey)
        break
      case 'gemini':
        await fetchGeminiModels(editDraft.value.gemini?.apiKey)
        break
      case 'metadoc':
        await fetchMetaDocModels()
        break
      default:
        break
    }
  } finally {
    editDialogModelsLoading.value = false
  }
}

const onEditDialogApiBlur = () => {
  void refreshEditDialogModels()
}

const handleLlmToggle = (enabled: boolean) => {
  settings.llmEnabled = enabled
  if (!enabled) {
    settings.selectedLlm = ''
  }
  setSetting('llmEnabled', enabled)
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

const handleCreateConfig = async () => {
  try {
    if (settings.selectedLlm === 'manual') {
      notifyWarning(t('setting.cannotCreateManualConfig'))
      return
    }
    const data = await getConfigDataFromCurrentSettings()
    if (data.type === 'manual') {
      notifyWarning(t('setting.cannotCreateManualConfig'))
      return
    }
    const draft: NonNullable<typeof editDraft.value> = {
      id: 'new',
      name: '',
      description: '',
      selectedLlm: data.type
    }
    if (data.ollama) draft.ollama = { ...data.ollama }
    if (data.openai) draft.openai = { ...data.openai }
    if (data['openai-official']) draft['openai-official'] = { ...data['openai-official'] }
    if (data.deepseek) draft.deepseek = { ...data.deepseek }
    if (data.gemini) draft.gemini = { ...data.gemini }
    if (data.qwen) draft.qwen = { ...data.qwen }
    if (data.metadoc) draft.metadoc = { ...data.metadoc }
    editDraft.value = draft
    newConfigNameBlurred.value = false
    editDialogVisible.value = true
    void nextTick(() => void refreshEditDialogModels())
  } catch (error) {
    logger.error('打开新建配置失败', error)
    notifyError(t('setting.configCreateFailed') || 'Failed to create configuration')
  }
}

const clearManualToken = () => {
  manualTokenInput.value = ''
  pendingManualRequestId.value = ''
  localStorage.removeItem('manualLLMTokenCache')
}

const saveManualTokenToCache = () => {
  if (manualTokenInput.value.trim()) {
    localStorage.setItem('manualLLMTokenCache', manualTokenInput.value)
  }
}

const loadManualTokenFromCache = () => {
  const cached = localStorage.getItem('manualLLMTokenCache')
  if (cached) {
    manualTokenInput.value = cached
  }
}

const submitManualResponse = async () => {
  if (!manualTokenInput.value.trim() || !pendingManualRequestId.value) {
    notifyWarning(t('setting.noPendingRequest'))
    return
  }

  try {
    const request = pendingRequests.value.find((r) => r.requestId === pendingManualRequestId.value)
    if (!request) {
      notifyWarning(t('setting.requestNotFound'))
      await fetchPendingRequests()
      return
    }

    let responseData: any
    if (request.stream) {
      responseData = manualTokenInput.value.trim()
    } else {
      if (request.type === 'completion') {
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
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        }
      } else {
        responseData = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'manual-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: manualTokenInput.value.trim() },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        }
      }
    }

    const baseUrl = await import('../../config/runtime-server').then((m) =>
      m.getRuntimeServerBaseUrl()
    )
    const response = await fetch(`${baseUrl}/api/llm/submit-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: pendingManualRequestId.value, response: responseData })
    })

    const result = await response.json()
    if (result.success) {
      notifySuccess(t('setting.manualResponseSubmitted'))
      manualTokenInput.value = ''
      pendingManualRequestId.value = ''
      selectedRequestId.value = ''
      await fetchPendingRequests()
    } else {
      notifyError(result.message || t('setting.submitFailed'))
    }
  } catch (error) {
    logger.error('提交手动响应失败', error)
    notifyError(t('setting.submitFailed'))
  }
}

const fetchPendingRequests = async () => {
  try {
    const baseUrl = await import('../../config/runtime-server').then((m) =>
      m.getRuntimeServerBaseUrl()
    )
    const response = await fetch(`${baseUrl}/api/llm/pending-requests`)
    const data = await response.json()
    pendingRequests.value = data.requests || []

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
  if (config && isPresetConfig(config)) {
    notifyWarning(t('setting.cannotDeleteDefaultConfig'))
    return
  }

  try {
    await messageBox.confirm(t('setting.confirmDeleteConfig'), t('setting.deleteConfig'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })

    await deleteConfig(targetId)
    loadConfigs()
    notifySuccess(t('setting.configDeleted'))
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('不能删除') && msg.includes('配置')) {
      notifyWarning(t('setting.cannotDeleteDefaultConfig'))
    }
  }
}

const handleExportConfig = async (configId: string) => {
  try {
    const jsonString = exportConfig(configId)
    if (!jsonString) {
      const cfg = llmConfigs.value.find((c) => c.id === configId)
      if (cfg && isBuiltinFreeLlmConfig(cfg)) {
        notifyWarning(t('setting.builtinFreeConfigCannotExport'))
        return
      }
      notifyError(t('setting.exportFailed') || 'Export failed')
      return
    }

    const config = llmConfigs.value.find((c) => c.id === configId)
    const defaultName = `${config?.name || 'config'}-${Date.now()}.json`

    const result = await messageBridge.invoke('save-file-dialog', {
      defaultName,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (result?.canceled || !result?.filePath) {
      return
    }

    await messageBridge.invoke('write-file-content', {
      filePath: result.filePath,
      content: jsonString
    })

    notifySuccess(t('setting.exportSuccess') || '导出成功')
  } catch (error) {
    logger.error('导出配置失败', error)
    notifyError(t('setting.exportFailed') || 'Export failed')
  }
}

// Demo mock data
const loadDemoData = () => {
  // Mock LLM configs
  llmConfigs.value = [
    { id: 'demo-1', name: 'OpenAI GPT-4', type: 'openai', isDefault: false },
    { id: 'demo-2', name: 'Ollama Llama2', type: 'ollama', isDefault: false },
    { id: 'demo-3', name: 'Gemini Pro', type: 'gemini', isDefault: false },
    { id: 'default-openai', name: '默认 OpenAI', type: 'openai', isDefault: true }
  ]

  // Mock settings
  settings.llmEnabled = true
  settings.llmTemperature = 0.7
  settings.autoRemoveThinkTag = true
  settings.selectedLlm = 'openai'
  settings.openai = {
    apiUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-demo-***',
    selectedModel: 'gpt-4',
    enableMaxTokens: true,
    maxTokens: 2048
  }
  settings.ollama = {
    apiUrl: 'http://localhost:11434/api',
    selectedModel: 'llama2:latest',
    enableMaxTokens: false,
    maxTokens: 4096
  }

  // Mock models
  openaiModels.value = [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }]
  ollamaModels.value = [
    { name: 'llama2', model: 'llama2:latest' },
    { name: 'mistral', model: 'mistral:latest' }
  ]
  geminiModels.value = [{ name: 'gemini-pro', displayName: 'Gemini Pro' }]

  currentConfigId.value = 'demo-1'
}

onMounted(async () => {
  // Demo mode: skip all API calls and load mock data
  if (isDemo.value) {
    loadDemoData()
    return
  }

  isDev.value = await isDevEnvironment()
  await loadLlmConfigs()
  loadConfigs()
  await fetchLlmSettings()

  if (settings.selectedLlm === 'metadoc') {
    fetchMetaDocModels()
  }

  if (settings.selectedLlm === 'manual') {
    loadManualTokenFromCache()
    fetchPendingRequests()
    const interval = setInterval(() => {
      if (settings.selectedLlm === 'manual') {
        fetchPendingRequests()
      } else {
        clearInterval(interval)
      }
    }, 2000)
  }

  eventBus.on('llm-config-updated', loadConfigs)
})

onBeforeUnmount(() => {
  eventBus.off('llm-config-updated', loadConfigs)
})
</script>

<style scoped>
.llm-settings {
  height: 100%;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  padding: 1rem;
}

.llm-config-grid-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.config-grid-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-grid-card :deep(.card-content) {
  flex: 1;
  overflow: auto;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.config-card-container {
  display: flex;
  align-items: stretch;
  gap: 6px;
  cursor: pointer;
  border-radius: var(--radius);
}

.config-card-bar {
  width: 4px;
  flex-shrink: 0;
  border-radius: 4px;
  background: hsl(var(--muted-foreground) / 0.35);
  transition: background 0.2s;
}

.config-card-bar-selected {
  background: hsl(142 76% 36%);
}

.dark .config-card-bar-selected {
  background: hsl(142 70% 45%);
}

.config-card {
  flex: 1;
  min-width: 0;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 0.5rem 0.75rem;
  transition: border-color 0.2s, background 0.2s;
  background: hsl(var(--card));
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 64px;
}

.config-card:hover {
  border-color: hsl(var(--primary) / 0.4);
}

.config-card-selected {
  border-color: hsl(var(--border));
  background: hsl(var(--accent) / 0.08);
}

.config-card-body {
  flex: 1;
  min-width: 0;
}

.config-card-name {
  font-weight: 600;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-card-type {
  font-size: 0.8rem;
  color: hsl(var(--muted-foreground));
}

.config-card-check {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.config-check-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border-radius: var(--radius);
  background: transparent;
  border: 1px solid hsl(var(--border));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.config-check-btn:hover:not(:disabled) {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

.config-check-btn:disabled {
  cursor: not-allowed;
  opacity: 0.8;
}

.config-check-label {
  white-space: nowrap;
}

.config-check-error {
  max-width: 180px;
  text-align: right;
}

.config-context-menu {
  position: fixed;
  z-index: 100;
  min-width: 140px;
  padding: 0.25rem;
  border-radius: var(--radius);
  background: hsl(var(--popover));
  border: 1px solid hsl(var(--border));
  box-shadow: var(--shadow-lg);
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 0.35rem 0.75rem;
  text-align: left;
  font-size: 0.875rem;
  border: none;
  background: transparent;
  border-radius: var(--radius);
  cursor: pointer;
  color: hsl(var(--foreground));
}

.context-menu-item:hover {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.edit-config-dialog-content {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  height: 85vh;
}

.edit-config-scrollbar {
  flex: 1;
  min-height: 200px;
  margin: 0.25rem 0;
}

.edit-config-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}
</style>
