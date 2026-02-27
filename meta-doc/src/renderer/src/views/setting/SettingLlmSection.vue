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
            <span>{{ t('setting.lowPrecision') }}</span>
            <span class="text-primary">{{ t('setting.recommended') }}</span>
            <span>{{ t('setting.highPrecision') }}</span>
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
      </CardContent>
    </Card>

    <!-- 配置管理区域 -->
    <div v-if="settings.llmEnabled" class="llm-config-layout">
      <!-- 左侧：配置列表 -->
      <Card class="config-list-card">
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between">
            <CardTitle class="text-sm font-medium">{{ t('setting.llmConfigList') }}</CardTitle>
            <div class="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    size="icon"
                    variant="default"
                    class="h-8 w-8"
                    @click="handleCreateConfig"
                    :disabled="settings.selectedLlm === 'manual'"
                  >
                    <Plus class="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{{ t('setting.newConfig') }}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    size="icon"
                    variant="outline"
                    class="h-8 w-8"
                    @click="importDialogVisible = true"
                  >
                    <ClipboardCopy class="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{{ t('setting.importConfig') }}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    size="icon"
                    variant="outline"
                    class="h-8 w-8"
                    @click="handleExportAllConfigs"
                  >
                    <Download class="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{{ t('setting.exportAllConfigs') }}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <ScrollArea class="h-[400px]">
            <RadioGroup
              v-model="currentConfigId"
              class="space-y-1 p-3"
              @update:modelValue="handleConfigSwitch"
            >
              <div
                v-for="config in llmConfigs"
                :key="config.id"
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
                <div
                  class="flex items-center gap-2 p-2 rounded-md hover:bg-accent transition-colors"
                >
                  <RadioGroupItem :value="config.id" :id="'config-' + config.id" class="sr-only" />
                  <label
                    :for="'config-' + config.id"
                    class="flex-1 flex items-center gap-2 cursor-pointer select-none min-w-0"
                    draggable="true"
                    @dragstart.stop="handleDragStart(config.id, $event)"
                    @dragover.prevent="handleDragOver(config.id, $event)"
                    @dragleave="handleDragLeave($event)"
                    @drop.stop.prevent="handleDrop(config.id, $event)"
                    @dragend.stop="handleDragEnd"
                  >
                    <GripVertical class="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab" />
                    <span class="flex-1 truncate text-sm">{{ getConfigDisplayName(config) }}</span>
                    <Badge
                      v-if="currentConfigId === config.id && hasUnsavedChanges"
                      variant="warning"
                      class="text-xs"
                    >
                      {{ t('setting.unsavedChanges') }}
                    </Badge>
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="icon" class="h-7 w-7 flex-shrink-0" @click.stop>
                        <MoreVertical class="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="handleConfigMenuAction('export', config)">
                        {{ t('setting.exportConfig') }}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        v-if="config.isDefault"
                        @click="handleConfigMenuAction('reset', config)"
                      >
                        {{ t('setting.resetConfig') }}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        v-if="!config.isDefault"
                        class="text-destructive focus:text-destructive"
                        @click="handleConfigMenuAction('delete', config)"
                        :disabled="llmConfigs.length <= 1"
                      >
                        {{ t('setting.deleteConfig') }}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </RadioGroup>
          </ScrollArea>
        </CardContent>
      </Card>

      <!-- 右侧：配置表单 -->
      <Card class="config-form-card flex-1">
        <CardHeader class="pb-3 border-b">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Badge v-if="hasUnsavedChanges" variant="warning">
                {{ t('setting.hasUnsavedChanges') }}
              </Badge>
              <span v-else class="text-sm text-muted-foreground">
                {{ t('setting.allChangesSaved') }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                @click="handleDiscardChanges"
                :disabled="!hasUnsavedChanges"
              >
                {{ t('setting.discardChanges') }}
              </Button>
              <Button size="sm" @click="handleSaveChanges" :disabled="!hasUnsavedChanges">
                {{ t('setting.saveChanges') }}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent class="p-6">
          <ScrollArea class="h-[400px]">
            <div class="space-y-6">
              <!-- LLM 类型选择 -->
              <FormField name="llmType" :label="t('setting.llmType')">
                <Select v-model="settings.selectedLlm" @update:model-value="handleLlmTypeChange">
                  <SelectTrigger class="w-[200px]">
                    <SelectValue :placeholder="t('setting.chooseLlm')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metadoc">{{ t('setting.metadoc') }}</SelectItem>
                    <SelectItem value="ollama">{{ t('setting.ollama') }}</SelectItem>
                    <SelectItem value="openai">{{ t('setting.openai') }}</SelectItem>
                    <SelectItem value="openai-official">
                      {{ t('setting.openaiOfficial') }}
                    </SelectItem>
                    <SelectItem value="deepseek">{{ t('setting.deepseek') }}</SelectItem>
                    <SelectItem value="gemini">{{ t('setting.gemini') }}</SelectItem>
                    <SelectItem v-if="isDev" value="manual">{{ t('setting.manual') }}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <!-- Ollama 配置 -->
              <template v-if="settings.selectedLlm === 'ollama'">
                <FormField name="apiBaseUrl" :label="t('setting.apiBaseUrl')">
                  <Input
                    v-model="settings.ollama.apiUrl"
                    :placeholder="t('setting.ollamaApiUrl')"
                    @change="handleFieldChange"
                    class="max-w-md"
                  />
                </FormField>

                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    v-model="settings.ollama.selectedModel"
                    @update:model-value="handleFieldChange"
                  >
                    <SelectTrigger class="w-[240px]">
                      <SelectValue :placeholder="t('setting.chooseModel')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="model in ollamaModels"
                        :key="model.model"
                        :value="model.model"
                        @select="fetchOllamaModels"
                      >
                        {{ model.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="settings.ollama.enableMaxTokens"
                      @update:checked="
                        (val) => {
                          settings.ollama.enableMaxTokens = val
                          handleFieldChange()
                        }
                      "
                    />
                    <span class="text-sm text-muted-foreground">
                      {{
                        settings.ollama.enableMaxTokens
                          ? t('setting.enabled')
                          : t('setting.disabled')
                      }}
                    </span>
                  </div>
                </FormField>

                <FormField
                  v-if="settings.ollama.enableMaxTokens"
                  name="ollamaMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.ollama.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="w-[200px]"
                  >
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- OpenAI 配置 -->
              <template v-else-if="settings.selectedLlm === 'openai'">
                <FormField name="apiBaseUrl" :label="t('setting.apiBaseUrl')">
                  <Input
                    v-model="settings.openai.apiUrl"
                    :placeholder="t('setting.openaiApiUrl')"
                    @change="handleFieldChange"
                    class="max-w-md"
                  />
                </FormField>

                <FormField name="apiKey" :label="t('setting.apiKey')">
                  <Input
                    v-model="settings.openai.apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    @change="handleFieldChange"
                    class="max-w-md"
                  />
                </FormField>

                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    v-model="settings.openai.selectedModel"
                    @update:model-value="handleFieldChange"
                  >
                    <SelectTrigger class="w-[240px]">
                      <SelectValue :placeholder="t('setting.chooseModel')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="model in openaiModels"
                        :key="model.id"
                        :value="model.id"
                        @select="fetchOpenAIModels"
                      >
                        {{ model.id }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField name="suffixes" :label="t('setting.suffixes')">
                  <div class="space-y-2 max-w-md">
                    <Input
                      v-model="settings.openai.completionSuffix"
                      :placeholder="t('setting.completionSuffix')"
                      @change="handleFieldChange"
                    />
                    <Input
                      v-model="settings.openai.chatSuffix"
                      :placeholder="t('setting.chatSuffix')"
                      @change="handleFieldChange"
                    />
                  </div>
                </FormField>

                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="settings.openai.enableMaxTokens"
                      @update:checked="
                        (val) => {
                          settings.openai.enableMaxTokens = val
                          handleFieldChange()
                        }
                      "
                    />
                    <span class="text-sm text-muted-foreground">
                      {{
                        settings.openai.enableMaxTokens
                          ? t('setting.enabled')
                          : t('setting.disabled')
                      }}
                    </span>
                  </div>
                </FormField>

                <FormField
                  v-if="settings.openai.enableMaxTokens"
                  name="openaiMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.openai.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="w-[200px]"
                  >
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- OpenAI Official 配置 -->
              <template v-else-if="settings.selectedLlm === 'openai-official'">
                <FormField name="apiKey" :label="t('setting.apiKey')">
                  <Input
                    v-model="settings['openai-official'].apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    @change="handleFieldChange"
                    class="max-w-md"
                  />
                </FormField>

                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    v-model="settings['openai-official'].selectedModel"
                    @update:model-value="handleFieldChange"
                  >
                    <SelectTrigger class="w-[240px]">
                      <SelectValue :placeholder="t('setting.chooseModel')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="model in openaiOfficialModels"
                        :key="model.id"
                        :value="model.id"
                        @select="fetchOpenAIOfficialModels"
                      >
                        {{ model.id }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="settings['openai-official'].enableMaxTokens"
                      @update:checked="
                        (val) => {
                          settings['openai-official'].enableMaxTokens = val
                          handleFieldChange()
                        }
                      "
                    />
                    <span class="text-sm text-muted-foreground">
                      {{
                        settings['openai-official'].enableMaxTokens
                          ? t('setting.enabled')
                          : t('setting.disabled')
                      }}
                    </span>
                  </div>
                </FormField>

                <FormField
                  v-if="settings['openai-official'].enableMaxTokens"
                  name="openaiOfficialMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings['openai-official'].maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="w-[200px]"
                  >
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- DeepSeek 配置 -->
              <template v-else-if="settings.selectedLlm === 'deepseek'">
                <FormField name="apiKey" :label="t('setting.apiKey')">
                  <Input
                    v-model="settings.deepseek.apiKey"
                    type="password"
                    :placeholder="t('setting.apiKeyPlaceholder')"
                    @change="handleFieldChange"
                    class="max-w-md"
                  />
                </FormField>

                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    v-model="settings.deepseek.selectedModel"
                    @update:model-value="handleFieldChange"
                  >
                    <SelectTrigger class="w-[200px]">
                      <SelectValue :placeholder="t('setting.chooseModel')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deepseek-chat">deepseek-chat</SelectItem>
                      <SelectItem value="deepseek-reasoner">deepseek-reasoner</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="settings.deepseek.enableMaxTokens"
                      @update:checked="
                        (val) => {
                          settings.deepseek.enableMaxTokens = val
                          handleFieldChange()
                        }
                      "
                    />
                    <span class="text-sm text-muted-foreground">
                      {{
                        settings.deepseek.enableMaxTokens
                          ? t('setting.enabled')
                          : t('setting.disabled')
                      }}
                    </span>
                  </div>
                </FormField>

                <FormField
                  v-if="settings.deepseek.enableMaxTokens"
                  name="deepseekMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.deepseek.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="w-[200px]"
                  >
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- Gemini 配置 -->
              <template v-else-if="settings.selectedLlm === 'gemini'">
                <FormField name="apiKey" :label="t('setting.apiKey')">
                  <Input
                    v-model="settings.gemini.apiKey"
                    type="password"
                    :placeholder="t('setting.geminiApiKeyPlaceholder')"
                    @change="handleFieldChange"
                    class="max-w-md"
                  />
                </FormField>

                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    v-model="settings.gemini.selectedModel"
                    @update:model-value="handleFieldChange"
                  >
                    <SelectTrigger class="w-[240px]">
                      <SelectValue :placeholder="t('setting.chooseModel')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="model in geminiModels"
                        :key="model.name"
                        :value="model.name"
                        @select="fetchGeminiModels"
                      >
                        {{ model.displayName || model.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="settings.gemini.enableMaxTokens"
                      @update:checked="
                        (val) => {
                          settings.gemini.enableMaxTokens = val
                          handleFieldChange()
                        }
                      "
                    />
                    <span class="text-sm text-muted-foreground">
                      {{
                        settings.gemini.enableMaxTokens
                          ? t('setting.enabled')
                          : t('setting.disabled')
                      }}
                    </span>
                  </div>
                </FormField>

                <FormField
                  v-if="settings.gemini.enableMaxTokens"
                  name="geminiMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.gemini.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="w-[200px]"
                  >
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- MetaDoc 配置 -->
              <template v-else-if="settings.selectedLlm === 'metadoc'">
                <FormField name="chooseModel" :label="t('setting.chooseModel')">
                  <Select
                    v-model="settings.metadoc.selectedModel"
                    @update:model-value="handleFieldChange"
                  >
                    <SelectTrigger class="w-[240px]">
                      <SelectValue :placeholder="t('setting.chooseModel')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="model in metadocModels"
                        :key="model.label"
                        :value="model.label"
                        @select="fetchMetaDocModels"
                      >
                        {{ model.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField name="enableMaxTokens" :label="t('setting.enableMaxTokens')">
                  <div class="flex items-center gap-2">
                    <Switch
                      :checked="settings.metadoc.enableMaxTokens"
                      @update:checked="
                        (val) => {
                          settings.metadoc.enableMaxTokens = val
                          handleFieldChange()
                        }
                      "
                    />
                    <span class="text-sm text-muted-foreground">
                      {{
                        settings.metadoc.enableMaxTokens
                          ? t('setting.enabled')
                          : t('setting.disabled')
                      }}
                    </span>
                  </div>
                </FormField>

                <FormField
                  v-if="settings.metadoc.enableMaxTokens"
                  name="metadocMaxTokens"
                  :label="t('setting.maxTokens')"
                >
                  <NumberField
                    v-model="settings.metadoc.maxTokens"
                    :min="1"
                    :max="32768"
                    :step="100"
                    @update:modelValue="handleFieldChange"
                    class="w-[200px]"
                  >
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberField>
                </FormField>
              </template>

              <!-- Manual 配置 -->
              <template v-else-if="settings.selectedLlm === 'manual'">
                <Alert>
                  <Info class="h-4 w-4" />
                  <AlertTitle>{{ t('setting.manualConfigHint') }}</AlertTitle>
                </Alert>

                <FormField name="manualTokenInput" :label="t('setting.manualTokenInput')">
                  <Textarea
                    v-model="manualTokenInput"
                    :placeholder="t('setting.manualTokenInputPlaceholder')"
                    rows="6"
                    class="max-w-md"
                    @input="saveManualTokenToCache"
                  />
                  <div class="flex items-center gap-2 mt-2">
                    <Button size="sm" variant="outline" @click="clearManualToken">
                      {{ t('setting.clearManualToken') }}
                    </Button>
                    <Button
                      size="sm"
                      @click="submitManualResponse"
                      :disabled="!manualTokenInput.trim() || !pendingManualRequestId"
                    >
                      {{ t('setting.submitManualResponse') }}
                    </Button>
                    <Button size="sm" variant="outline" @click="openManualLLMInterface">
                      {{ t('setting.openManualLLMInterface') }}
                    </Button>
                  </div>
                  <p v-if="pendingManualRequestId" class="mt-2 text-xs text-muted-foreground">
                    {{ t('setting.pendingRequestId') }}: {{ pendingManualRequestId }}
                  </p>
                </FormField>
              </template>

              <Separator />

              <!-- 自动补全设置 -->
              <FormField name="autoCompletion" :label="t('setting.autoCompletion')">
                <div class="flex items-center gap-2">
                  <Switch
                    :checked="settings.autoCompletion"
                    @update:checked="
                      (val) => {
                        settings.autoCompletion = val
                        saveSetting('autoCompletion', val)
                      }
                    "
                  />
                  <span class="text-sm text-muted-foreground">
                    {{ settings.autoCompletion ? t('setting.enabled') : t('setting.disabled') }}
                  </span>
                </div>
              </FormField>

              <template v-if="settings.autoCompletion">
                <FormField name="autoCompletionMode" :label="t('setting.autoCompletionMode')">
                  <Select
                    v-model="settings.autoCompletionMode"
                    @update:model-value="
                      saveSetting('autoCompletionMode', settings.autoCompletionMode)
                    "
                  >
                    <SelectTrigger class="w-[200px]">
                      <SelectValue :placeholder="t('setting.chooseAutoCompletionMode')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">{{
                        t('setting.autoCompletionFullMode')
                      }}</SelectItem>
                      <SelectItem value="stream">{{
                        t('setting.autoCompletionStreamMode')
                      }}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField
                  name="autoCompletionMaxTokens"
                  :label="t('setting.autoCompletionMaxTokens')"
                >
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="flex items-center gap-2">
                        <NumberField
                          v-model="settings.autoCompletionMaxTokens"
                          :min="20"
                          :step="10"
                          @update:modelValue="
                            saveSetting('autoCompletionMaxTokens', settings.autoCompletionMaxTokens)
                          "
                          class="w-[160px]"
                        >
                          <NumberFieldDecrement />
                          <NumberFieldInput />
                          <NumberFieldIncrement />
                        </NumberField>
                        <span class="text-sm text-muted-foreground">
                          {{
                            settings.autoCompletionMaxTokens === 0
                              ? t('setting.unlimited')
                              : t('setting.tokens')
                          }}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {{ t('setting.autoCompletionMaxTokensHint') }}
                    </TooltipContent>
                  </Tooltip>
                </FormField>
              </template>

              <Separator />

              <!-- 测试区域 -->
              <div class="space-y-4">
                <h4 class="text-sm font-medium">{{ t('setting.testLlm') }}</h4>

                <FormField name="testScenario" :label="t('setting.testScenario')">
                  <RadioGroup v-model="testScenario" class="flex flex-row gap-4 flex-wrap">
                    <div class="flex items-center gap-2">
                      <RadioGroupItem value="completion-stream" id="test-completion-stream" />
                      <Label for="test-completion-stream" class="text-sm cursor-pointer">
                        {{ t('setting.testCompletionStream') }}
                      </Label>
                    </div>
                    <div class="flex items-center gap-2">
                      <RadioGroupItem value="completion-nonstream" id="test-completion-nonstream" />
                      <Label for="test-completion-nonstream" class="text-sm cursor-pointer">
                        {{ t('setting.testCompletionNonStream') }}
                      </Label>
                    </div>
                    <div class="flex items-center gap-2">
                      <RadioGroupItem value="chat-stream" id="test-chat-stream" />
                      <Label for="test-chat-stream" class="text-sm cursor-pointer">
                        {{ t('setting.testChatStream') }}
                      </Label>
                    </div>
                    <div class="flex items-center gap-2">
                      <RadioGroupItem value="chat-nonstream" id="test-chat-nonstream" />
                      <Label for="test-chat-nonstream" class="text-sm cursor-pointer">
                        {{ t('setting.testChatNonStream') }}
                      </Label>
                    </div>
                  </RadioGroup>
                </FormField>

                <div class="flex items-center gap-2">
                  <Button @click="testLlmApi" :disabled="testLoading">
                    {{ t('setting.testLlm') }}
                  </Button>
                  <Button variant="outline" @click="clearTestResult">
                    {{ t('setting.clearResult') }}
                  </Button>
                </div>

                <FormField name="testResult" :label="t('setting.testResult')">
                  <Textarea
                    v-model="testResult"
                    readonly
                    :placeholder="t('setting.resultPlaceholder')"
                    rows="6"
                    class="font-mono text-sm"
                  />
                </FormField>
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>

    <!-- 导入配置对话框 -->
    <Dialog v-model:open="importDialogVisible">
      <DialogContent class="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{{ t('setting.importConfig') }}</DialogTitle>
        </DialogHeader>
        <div class="py-4">
          <FormField name="importConfigJson" :label="t('setting.importConfigJson')">
            <Textarea
              v-model="importJsonText"
              :placeholder="t('setting.importConfigJsonPlaceholder')"
              rows="10"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="importDialogVisible = false">
            {{ t('common.cancel') }}
          </Button>
          <Button @click="handleImportConfig" :disabled="!importJsonText.trim()">
            {{ t('setting.importConfig') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { useI18n } from 'vue-i18n'
import { settings, setSetting, getSetting } from '../../utils/settings.js'
import eventBus from '../../utils/event-bus.js'
import { getMetaDocLlmModels } from '../../utils/web-utils.ts'
import { createRendererLogger } from '../../utils/logger.ts'
import { isDevEnvironment } from '../../utils/dev-env'
import { ai_types, createAiTask } from '../../utils/ai_tasks.ts'
import {
  getAllConfigs,
  getCurrentConfig,
  switchConfig,
  deleteConfig,
  createConfigFromCurrentSettings,
  updateWorkspaceModifiedState,
  saveWorkspace,
  discardWorkspace,
  getWorkspaceState,
  exportConfig,
  exportAllConfigs,
  importConfigs,
  resetDefaultConfig,
  loadLlmConfigs,
  updateConfigOrder,
  type LlmConfigItem
} from '../../utils/llm-config-manager'

// Icons
import {
  Plus,
  ClipboardCopy,
  Copy,
  Download,
  Minus,
  Plus as PlusIcon,
  Info,
  GripVertical,
  MoreVertical,
  HelpCircle
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
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Alert, AlertTitle } from '@renderer/components/ui/alert'
import { FormField } from '@renderer/components/ui/form'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
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
import { ElMessageBox } from 'element-plus'
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

const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value)
}

const getConfigDisplayName = (config: LlmConfigItem): string => {
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
  return config.name
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

const handleFieldChange = async () => {
  updateLlmInfo()
  await updateWorkspaceModifiedState()
  hasUnsavedChanges.value = getWorkspaceState().hasUnsavedChanges
}

const fetchMetaDocModels = async () => {
  try {
    const models = await getMetaDocLlmModels()
    metadocModels.value = models ?? []
  } catch (error) {
    logger.error('获取 MetaDoc 模型失败', error)
  }
}

const fetchOllamaModels = async () => {
  const apiUrl = settings.ollama.apiUrl
  if (!apiUrl) return

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
  if (!apiUrl) return

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
  if (!apiKey) return

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
  if (!apiKey) return

  try {
    const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
      params: { key: apiKey },
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

const handleLlmToggle = (enabled: boolean) => {
  settings.llmEnabled = enabled
  if (!enabled) {
    settings.selectedLlm = ''
  }
  setSetting('llmEnabled', enabled)
}

const handleLlmTypeChange = async () => {
  saveSetting('selectedLlm', settings.selectedLlm)
  updateLlmInfo()
  if (settings.selectedLlm === 'manual') {
    loadManualTokenFromCache()
    fetchPendingRequests()
  }
  await updateWorkspaceModifiedState()
  hasUnsavedChanges.value = getWorkspaceState().hasUnsavedChanges
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
  if (hasUnsavedChanges.value) {
    try {
      await ElMessageBox.confirm(t('setting.unsavedChangesConfirm'), t('setting.unsavedChanges'), {
        confirmButtonText: t('setting.saveChanges'),
        cancelButtonText: t('setting.discardChanges'),
        distinguishCancelAndClose: true,
        type: 'warning'
      })
      await handleSaveChanges()
    } catch {
      await handleDiscardChanges()
    }
  }

  await switchConfig(id)
  currentConfigId.value = id
  await fetchLlmSettings()
  await updateWorkspaceModifiedState()
  hasUnsavedChanges.value = getWorkspaceState().hasUnsavedChanges

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
    loadManualTokenFromCache()
    fetchPendingRequests()
  }
  notifySuccess(t('setting.configSwitched'))
}

const handleCreateConfig = async () => {
  try {
    if (settings.selectedLlm === 'manual') {
      notifyWarning(t('setting.cannotCreateManualConfig'))
      return
    }

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
    notifySuccess(t('setting.configCreated'))
  } catch (error) {
    if (error !== 'cancel') {
      logger.error('创建配置失败', error)
      notifyError(t('setting.configCreateFailed') || '创建配置失败')
    }
  }
}

const handleConfigMenuAction = async (action: string, config: LlmConfigItem) => {
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
  if (config?.isDefault) {
    notifyWarning(t('setting.cannotDeleteDefaultConfig'))
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
    notifySuccess(t('setting.configDeleted'))
  } catch (error) {
    if (error instanceof Error && error.message === '不能删除默认配置') {
      notifyWarning(t('setting.cannotDeleteDefaultConfig'))
    }
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
      notifySuccess(t('setting.configReset'))
    } else {
      notifyError(t('setting.resetFailed') || '重置失败')
    }
  } catch {
    // 用户取消
  }
}

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

  const targetElement = event.currentTarget as HTMLElement
  if (!targetElement) return

  let configItemElement: HTMLElement | null = targetElement.closest('.config-item')
  if (!configItemElement) {
    let parent = targetElement.parentElement
    while (parent && !parent.classList.contains('config-item')) {
      parent = parent.parentElement
    }
    configItemElement = parent as HTMLElement | null
  }

  if (!configItemElement) return

  const rect = configItemElement.getBoundingClientRect()
  const midPoint = rect.top + rect.height / 2
  const mode = event.clientY < midPoint ? 'before' : 'after'

  dropPreview.value.targetId = targetId
  dropPreview.value.mode = mode
}

const handleDragLeave = (event: DragEvent) => {
  const relatedTarget = event.relatedTarget as HTMLElement | null
  if (relatedTarget) {
    const configItem = (event.currentTarget as HTMLElement)?.closest('.config-item')
    if (configItem && configItem.contains(relatedTarget)) {
      return
    }
  }
  dropPreview.value.targetId = null
  dropPreview.value.mode = null
}

const handleDrop = (targetId: string, event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()

  const fromId = draggingConfigId.value
  const mode = dropPreview.value.mode

  if (!fromId || fromId === targetId || !mode) {
    draggingConfigId.value = null
    dropPreview.value.targetId = null
    dropPreview.value.mode = null
    return
  }

  const fromIndex = llmConfigs.value.findIndex((c) => c.id === fromId)
  const targetIndex = llmConfigs.value.findIndex((c) => c.id === targetId)

  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
    draggingConfigId.value = null
    dropPreview.value.targetId = null
    dropPreview.value.mode = null
    return
  }

  let insertIndex = targetIndex
  if (mode === 'after') {
    insertIndex = targetIndex + 1
  }

  if (fromIndex < insertIndex) {
    insertIndex -= 1
  }

  insertIndex = Math.max(0, Math.min(insertIndex, llmConfigs.value.length))

  if (fromIndex !== insertIndex) {
    const [config] = llmConfigs.value.splice(fromIndex, 1)
    llmConfigs.value.splice(insertIndex, 0, config)

    const newOrder = llmConfigs.value.map((c) => c.id)
    updateConfigOrder(newOrder)
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

const handleSaveChanges = async () => {
  try {
    const success = await saveWorkspace()
    if (success) {
      hasUnsavedChanges.value = false
      await fetchLlmSettings()
      loadConfigs()
      notifySuccess(t('setting.changesSaved'))
    } else {
      notifyError(t('setting.saveFailed') || '保存失败')
    }
  } catch (error) {
    logger.error('保存配置失败', error)
    notifyError(t('setting.saveFailed') || '保存失败')
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
      await fetchLlmSettings()
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
      notifySuccess(t('setting.changesDiscarded'))
    } else {
      notifyError(t('setting.discardFailed') || '放弃失败')
    }
  } catch {
    // 用户取消
  }
}

const handleExportConfig = async (configId: string) => {
  try {
    const jsonString = exportConfig(configId)
    if (!jsonString) {
      notifyError(t('setting.exportFailed') || '导出失败')
      return
    }

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

    notifySuccess(t('setting.exportSuccess') || '导出成功')
  } catch (error) {
    logger.error('导出配置失败', error)
    notifyError(t('setting.exportFailed') || '导出失败')
  }
}

const handleImportConfig = async () => {
  try {
    if (!importJsonText.value.trim()) {
      notifyWarning(t('setting.importConfigJsonRequired') || '请输入配置JSON')
      return
    }

    const result = importConfigs(importJsonText.value)
    if (result.success) {
      loadConfigs()
      importDialogVisible.value = false
      importJsonText.value = ''
      notifySuccess(
        t('setting.importSuccess', { count: result.imported }) ||
          `成功导入 ${result.imported} 个配置`
      )
      if (result.errors.length > 0) {
        notifyWarning(result.errors.join('; '))
      }
    } else {
      notifyError(result.errors.join('; ') || t('setting.importFailed') || '导入失败')
    }
  } catch (error) {
    logger.error('导入配置失败', error)
    notifyError(t('setting.importFailed') || '导入失败')
  }
}

const handleExportAllConfigs = async () => {
  try {
    const jsonString = exportAllConfigs()

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

    notifySuccess(t('setting.exportSuccess') || '导出成功')
  } catch (error) {
    logger.error('导出所有配置失败', error)
    notifyError(t('setting.exportFailed') || '导出失败')
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

    const parts = testScenario.value.split('-')
    const useChat = parts[0] === 'chat'
    const stream = parts[1] === 'stream'

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
      { stream: stream, temperature }
    )

    try {
      await done
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (
        errorMessage.includes('取消') ||
        errorMessage.includes('aborted') ||
        errorMessage.includes('cancelled')
      ) {
        logger.debug('测试任务已取消')
        return
      }
      throw error
    }
  } catch (error) {
    logger.error(t('setting.testFailed'), error)
    testResult.value = `测试失败: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    testLoading.value = false
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
    completionSuffix: '/v1/completions',
    chatSuffix: '/v1/chat/completions',
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

  // Demo state
  currentConfigId.value = 'demo-1'
  hasUnsavedChanges.value = true
  testResult.value =
    '这是一个演示模式的 LLM 测试结果。在实际使用中，这里会显示真实的 LLM 响应内容。'
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

  if (currentConfigId.value) {
    await updateWorkspaceModifiedState()
    hasUnsavedChanges.value = getWorkspaceState().hasUnsavedChanges
  }

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

.llm-config-layout {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.config-list-card {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.config-list-card :deep(.card-content) {
  flex: 1;
  overflow: hidden;
}

.config-form-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.config-form-card :deep(.card-content) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

.config-item {
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
  height: 2px;
  background-color: hsl(var(--primary));
  border-radius: 1px;
  z-index: 10;
}

.config-item.drop-after::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background-color: hsl(var(--primary));
  border-radius: 1px;
  z-index: 10;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .llm-config-layout {
    flex-direction: column;
  }

  .config-list-card {
    width: 100%;
    max-height: 200px;
  }
}
</style>
