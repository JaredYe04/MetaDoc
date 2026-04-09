<template>
  <Dialog v-model:open="visible">
    <DialogContent class="max-w-[800px] export-options-dialog-content">
      <DialogHeader class="export-options-dialog-header">
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>
      <ScrollArea class="export-options-scroll-area h-[500px]">
        <Tabs v-model="activeTab" v-if="hasTabs" class="export-options-tabs">
          <TabsList class="export-options-tabs-list w-full inline-flex justify-start gap-1 bg-muted p-1 rounded-lg">
            <TabsTrigger v-for="tab in tabs" :key="tab.name" :value="tab.name">
              {{ tab.label }}
            </TabsTrigger>
          </TabsList>

          <TabsContent v-for="tab in tabs" :key="tab.name" :value="tab.name">
            <form class="export-options-form space-y-4">
              <template v-for="field in getFieldsForTab(tab.name)" :key="field.key">
                <!-- {{ t('export.objectTypeField', '对象类型字段') }} -->
                <template v-if="field.type === 'object' && field.fields">
                  <div class="flex items-center gap-2 my-4">
                    <Separator class="flex-1" />
                    <span class="text-sm font-medium text-foreground">{{
                      getFieldLabel(field)
                    }}</span>
                    <Separator class="flex-1" />
                  </div>
                  <template v-for="subField in field.fields" :key="subField.key">
                    <FormField
                      v-if="
                        shouldShowField(subField) &&
                        (subField.type === 'select' ||
                          subField.type === 'font' ||
                          subField.type === 'fontSize')
                      "
                      :name="subField.key"
                    >
                      <div class="flex items-start gap-4">
                        <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                          getFieldLabel(subField)
                        }}</FormLabel>
                        <div class="flex-1">
                          <FormControl>
                            <Select
                              :model-value="getNestedValue(formData, subField.key)"
                              @update:model-value="
                                (val: any) => setNestedValue(formData, subField.key, val)
                              "
                              :disabled="subField.type === 'font' && fontsLoading"
                            >
                              <SelectTrigger class="w-full">
                                <SelectValue :placeholder="getFieldLabel(subField)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem
                                  v-for="option in getFieldOptions(subField)"
                                  :key="option.value"
                                  :value="option.value"
                                  :title="selectOptionHint(option)"
                                >
                                  {{ option.labelKey ? t(option.labelKey) : option.label }}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormDescription
                            v-if="subField.description || subField.descriptionKey"
                            class="mt-1"
                          >
                            {{ getFieldDescription(subField) }}
                          </FormDescription>
                        </div>
                      </div>
                    </FormField>
                    <FormField
                      v-else-if="shouldShowField(subField) && subField.type === 'boolean'"
                      :name="subField.key"
                    >
                      <div class="flex items-start gap-4">
                        <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                          getFieldLabel(subField)
                        }}</FormLabel>
                        <div class="flex-1">
                          <div class="flex items-center gap-2">
                            <span class="text-sm text-muted-foreground">{{
                              t('setting.disabled', '禁用')
                            }}</span>
                            <span class="inline-flex shrink-0">
                              <Switch
                                :checked="getBooleanValue(formData, subField.key)"
                                @update:checked="(val: boolean) => setBooleanValue(subField.key, val)"
                                class="shrink-0"
                              />
                            </span>
                            <span class="text-sm text-muted-foreground">{{
                              t('setting.enabled', '启用')
                            }}</span>
                          </div>
                          <FormDescription
                            v-if="subField.description || subField.descriptionKey"
                            class="mt-1"
                          >
                            {{ getFieldDescription(subField) }}
                          </FormDescription>
                        </div>
                      </div>
                    </FormField>
                    <FormField v-else-if="shouldShowField(subField)" :name="subField.key">
                      <div class="flex items-start gap-4">
                        <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                          getFieldLabel(subField)
                        }}</FormLabel>
                        <div class="flex-1">
                          <component
                            :is="getFieldComponent(subField)"
                            :model-value="getNestedValue(formData, subField.key)"
                            @update:model-value="
                              (val: any) => setNestedValue(formData, subField.key, val)
                            "
                            v-bind="getFieldProps(subField)"
                            class="w-full"
                          />

                          <FormDescription
                            v-if="subField.description || subField.descriptionKey"
                            class="mt-1"
                          >
                            {{ getFieldDescription(subField) }}
                          </FormDescription>
                        </div>
                      </div>
                    </FormField>
                  </template>
                </template>

                <!-- FontSelect字段 -->
                <FormField
                  v-else-if="shouldShowField(field) && field.type === 'font'"
                  :name="field.key"
                >
                  <div class="flex items-start gap-4">
                    <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                      getFieldLabel(field)
                    }}</FormLabel>
                    <div class="flex-1">
                      <FontSelect
                        :model-value="getNestedValue(formData, field.key)"
                        @update:model-value="(val: any) => setNestedValue(formData, field.key, val)"
                        :placeholder="getFieldLabel(field)"
                        :preview-text="field.previewText || t('fontDebugPanel.helloWorld')"
                        class="w-full"
                      />
                      <FormDescription v-if="hasFieldHelperText(field)" class="mt-1">
                        {{ getFieldHelperText(field) }}
                      </FormDescription>
                    </div>
                  </div>
                </FormField>

                <!-- Select字段和FontSize字段 -->
                <FormField
                  v-else-if="
                    shouldShowField(field) && (field.type === 'select' || field.type === 'fontSize')
                  "
                  :name="field.key"
                >
                  <div class="flex items-start gap-4">
                    <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                      getFieldLabel(field)
                    }}</FormLabel>
                    <div class="flex-1">
                      <Select
                        :model-value="getNestedValue(formData, field.key)"
                        @update:model-value="(val: any) => setNestedValue(formData, field.key, val)"
                      >
                        <SelectTrigger class="w-full">
                          <SelectValue :placeholder="getFieldLabel(field)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            v-for="option in getFieldOptions(field)"
                            :key="option.value"
                            :value="option.value"
                            :title="selectOptionHint(option)"
                          >
                            {{ option.labelKey ? t(option.labelKey) : option.label }}
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <FormDescription v-if="hasFieldHelperText(field)" class="mt-1">
                        {{ getFieldHelperText(field) }}
                      </FormDescription>
                    </div>
                  </div>
                </FormField>

                <!-- Boolean 字段（Switch） -->
                <FormField
                  v-else-if="shouldShowField(field) && field.type === 'boolean'"
                  :name="field.key"
                >
                  <div class="flex items-start gap-4">
                    <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                      getFieldLabel(field)
                    }}</FormLabel>
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm text-muted-foreground">{{
                          t('setting.disabled', '禁用')
                        }}</span>
                        <span class="inline-flex shrink-0">
                          <Switch
                            :checked="getBooleanValue(formData, field.key)"
                            @update:checked="(val: boolean) => setBooleanValue(field.key, val)"
                            class="shrink-0"
                          />
                        </span>
                        <span class="text-sm text-muted-foreground">{{
                          t('setting.enabled', '启用')
                        }}</span>
                      </div>
                      <FormDescription v-if="hasFieldHelperText(field)" class="mt-1">
                        {{ getFieldHelperText(field) }}
                      </FormDescription>
                    </div>
                  </div>
                </FormField>

                <!-- 普通字段 -->
                <FormField v-else-if="shouldShowField(field)" :name="field.key">
                  <div class="flex items-start gap-4">
                    <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                      getFieldLabel(field)
                    }}</FormLabel>
                    <div class="flex-1">
                      <component
                        :is="getFieldComponent(field)"
                        :model-value="getNestedValue(formData, field.key)"
                        @update:model-value="(val: any) => setNestedValue(formData, field.key, val)"
                        v-bind="getFieldProps(field)"
                        class="w-full"
                      />

                      <FormDescription v-if="hasFieldHelperText(field)" class="mt-1">
                        {{ getFieldHelperText(field) }}
                      </FormDescription>
                    </div>
                  </div>
                </FormField>
              </template>
            </form>
          </TabsContent>
        </Tabs>
        <form v-else class="export-options-form space-y-4">
          <template v-for="field in visibleFields" :key="field.key">
            <!-- 对象类型字段（如margins） -->
            <template v-if="field.type === 'object' && field.fields">
              <div class="flex items-center gap-2 my-4">
                <Separator class="flex-1" />
                <span class="text-sm font-medium text-foreground">{{ getFieldLabel(field) }}</span>
                <Separator class="flex-1" />
              </div>
              <template v-for="subField in field.fields" :key="subField.key">
                <FormField
                  v-if="
                    shouldShowField(subField) &&
                    (subField.type === 'select' ||
                      subField.type === 'font' ||
                      subField.type === 'fontSize')
                  "
                  :name="subField.key"
                >
                  <div class="flex items-start gap-4">
                    <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                      getFieldLabel(subField)
                    }}</FormLabel>
                    <div class="flex-1">
                      <Select
                        :model-value="getNestedValue(formData, subField.key)"
                        @update:model-value="
                          (val: any) => setNestedValue(formData, subField.key, val)
                        "
                        :disabled="subField.type === 'font' && fontsLoading"
                      >
                        <SelectTrigger class="w-full">
                          <SelectValue :placeholder="getFieldLabel(subField)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            v-for="option in getFieldOptions(subField)"
                            :key="option.value"
                            :value="option.value"
                            :title="selectOptionHint(option)"
                          >
                            {{ option.labelKey ? t(option.labelKey) : option.label }}
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <FormDescription
                        v-if="subField.description || subField.descriptionKey"
                        class="mt-1"
                      >
                        {{ getFieldDescription(subField) }}
                      </FormDescription>
                    </div>
                  </div>
                </FormField>
                <FormField
                  v-else-if="shouldShowField(subField) && subField.type === 'boolean'"
                  :name="subField.key"
                >
                  <div class="flex items-start gap-4">
                    <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                      getFieldLabel(subField)
                    }}</FormLabel>
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm text-muted-foreground">{{
                          t('setting.disabled', '禁用')
                        }}</span>
                        <span class="inline-flex shrink-0">
                          <Switch
                            :checked="getBooleanValue(formData, subField.key)"
                            @update:checked="(val: boolean) => setBooleanValue(subField.key, val)"
                            class="shrink-0"
                          />
                        </span>
                        <span class="text-sm text-muted-foreground">{{
                          t('setting.enabled', '启用')
                        }}</span>
                      </div>
                      <FormDescription
                        v-if="subField.description || subField.descriptionKey"
                        class="mt-1"
                      >
                        {{ getFieldDescription(subField) }}
                      </FormDescription>
                    </div>
                  </div>
                </FormField>
                <FormField v-else-if="shouldShowField(subField)" :name="subField.key">
                  <div class="flex items-start gap-4">
                    <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                      getFieldLabel(subField)
                    }}</FormLabel>
                    <div class="flex-1">
                      <component
                        :is="getFieldComponent(subField)"
                        :model-value="getNestedValue(formData, subField.key)"
                        @update:model-value="
                          (val: any) => setNestedValue(formData, subField.key, val)
                        "
                        v-bind="getFieldProps(subField)"
                        class="w-full"
                      />

                      <FormDescription
                        v-if="subField.description || subField.descriptionKey"
                        class="mt-1"
                      >
                        {{ getFieldDescription(subField) }}
                      </FormDescription>
                    </div>
                  </div>
                </FormField>
              </template>
            </template>

            <!-- Select字段、Font字段和FontSize字段 -->
            <FormField
              v-else-if="
                shouldShowField(field) &&
                (field.type === 'select' || field.type === 'font' || field.type === 'fontSize')
              "
              :name="field.key"
            >
              <div class="flex items-start gap-4">
                <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                  getFieldLabel(field)
                }}</FormLabel>
                <div class="flex-1">
                  <Select
                    :model-value="getNestedValue(formData, field.key)"
                    @update:model-value="(val: any) => setNestedValue(formData, field.key, val)"
                    :disabled="field.type === 'font' && fontsLoading"
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue :placeholder="getFieldLabel(field)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="option in getFieldOptions(field)"
                        :key="option.value"
                        :value="option.value"
                        :title="selectOptionHint(option)"
                      >
                        {{ option.labelKey ? t(option.labelKey) : option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <FormDescription v-if="hasFieldHelperText(field)" class="mt-1">
                    {{ getFieldHelperText(field) }}
                  </FormDescription>
                </div>
              </div>
            </FormField>

            <!-- Boolean 字段（Switch） -->
            <FormField
              v-else-if="shouldShowField(field) && field.type === 'boolean'"
              :name="field.key"
            >
              <div class="flex items-start gap-4">
                <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                  getFieldLabel(field)
                }}</FormLabel>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-muted-foreground">{{
                      t('setting.disabled', '禁用')
                    }}</span>
                    <span class="inline-flex shrink-0">
                      <Switch
                        :checked="getBooleanValue(formData, field.key)"
                        @update:checked="(val: boolean) => setBooleanValue(field.key, val)"
                        class="shrink-0"
                      />
                    </span>
                    <span class="text-sm text-muted-foreground">{{
                      t('setting.enabled', '启用')
                    }}</span>
                  </div>
                  <FormDescription v-if="hasFieldHelperText(field)" class="mt-1">
                    {{ getFieldHelperText(field) }}
                  </FormDescription>
                </div>
              </div>
            </FormField>

            <!-- 普通字段 -->
            <FormField v-else-if="shouldShowField(field)" :name="field.key">
              <div class="flex items-start gap-4">
                <FormLabel class="w-[140px] text-left shrink-0 pt-2">{{
                  getFieldLabel(field)
                }}</FormLabel>
                <div class="flex-1">
                  <component
                    :is="getFieldComponent(field)"
                    :model-value="getNestedValue(formData, field.key)"
                    @update:model-value="(val: any) => setNestedValue(formData, field.key, val)"
                    v-bind="getFieldProps(field)"
                    class="w-full"
                  />

                  <FormDescription v-if="hasFieldHelperText(field)" class="mt-1">
                    {{ getFieldHelperText(field) }}
                  </FormDescription>
                </div>
              </div>
            </FormField>
          </template>
        </form>

        <div
          v-if="texPdfCliPreview"
          class="export-tex-pdf-cli-preview mx-4 mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs"
        >
          <div class="mb-1 font-medium text-foreground">
            {{ t('latexEditor.compiler.cliPreviewLabel') }}
          </div>
          <pre
            class="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground"
            >{{ texPdfCliPreview }}</pre>
          <p class="mt-1.5 text-muted-foreground">
            {{ t('latexEditor.compiler.cliPreviewCaption') }}
          </p>
        </div>
      </ScrollArea>

      <DialogFooter class="export-options-dialog-footer">
        <Button class="export-options-btn-cancel" variant="outline" @click="handleCancel">
          {{ t('common.cancel') }}
        </Button>
        <Button class="export-options-btn-export" @click="handleConfirm">
          {{ t('common.export') }}
        </Button>
        <Button class="export-options-btn-reset" variant="outline" @click="handleReset">
          {{ t('common.reset') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Form,
  FormField,
  FormLabel,
  FormControl,
  FormDescription
} from '@renderer/components/ui/form'
import { ElInput, ElInputNumber } from 'element-plus'
import { Switch } from '@renderer/components/ui/switch'
import { Separator } from '@renderer/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { themeState } from '../utils/themes'
import type {
  ExportAdapter,
  ExportOptionField,
  ExportOptions
} from '../services/export-adapters/types'
import type { DocumentFormat, ExportFormat } from '../../../types'
import {
  loadExportOptions,
  mergeExportOptions,
  saveExportOptions
} from '../services/export-adapters/storage'
import { getSystemFonts, type SystemFont } from '../services/font-service'
import {
  getLocalizedFontSize,
  getFontSizeOptions,
  type FontSizeOption
} from '../utils/common/font-size-localization'
import { FontSelect } from '@renderer/components/ui/font-select'
import { settings } from '../utils/settings.js'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  adapter: ExportAdapter | null
  sourceFormat: DocumentFormat
  targetFormat: ExportFormat
  /** 若设置则优先作为对话框标题（i18n key），例如工具栏「编译选项」 */
  dialogTitleKey?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [options: ExportOptions]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

/** 与 prepareExportPayload 一致：部分适配器将选项存到 md→* 等键下 */
const optionsStorageFormats = computed(() => {
  return (
    props.adapter?.getOptionsStorageFormats?.() ?? {
      source: props.sourceFormat,
      target: props.targetFormat
    }
  )
})

const dialogTitle = computed(() => {
  if (props.dialogTitleKey) return t(props.dialogTitleKey)
  if (!props.adapter) return t('export.options.title')
  return props.adapter.nameKey ? t(props.adapter.nameKey) : props.adapter.name
})

const formData = ref<Record<string, any>>({})
const defaultOptions = ref<ExportOptions>({})
const systemFonts = ref<SystemFont[]>([])
const fontsLoading = ref(false)
const activeTab = ref<string>('basic')

// 加载系统字体
onMounted(async () => {
  fontsLoading.value = true
  try {
    systemFonts.value = await getSystemFonts()
  } catch (error) {
    console.error('加载系统字体失败:', error)
  } finally {
    fontsLoading.value = false
  }
})

// 初始化表单数据
watch(
  () => [props.adapter, optionsStorageFormats.value.source, optionsStorageFormats.value.target],
  ([adapter, storageSource, storageTarget]) => {
    if (adapter) {
      const defaults = adapter.getDefaultOptions()
      defaultOptions.value = defaults

      // 从localStorage加载保存的选项
      const savedOptions = loadExportOptions(storageSource, storageTarget)
      const merged = mergeExportOptions(defaults, savedOptions)

      formData.value = JSON.parse(JSON.stringify(merged))
    }
  },
  { immediate: true }
)

// 获取可见的字段
const visibleFields = computed(() => {
  if (!props.adapter) return []
  return props.adapter.getOptionFields().filter((field) => shouldShowField(field))
})

// 获取所有 tab
const tabs = computed(() => {
  if (!props.adapter) return []
  const fields = props.adapter.getOptionFields()
  const tabSet = new Set<string>()
  fields.forEach((field) => {
    if (field.tab) {
      tabSet.add(field.tab)
    }
  })
  const tabList = Array.from(tabSet)
  return tabList.map((tabName) => ({
    name: tabName,
    label: t(`export.options.tabs.${tabName}`, tabName === 'basic' ? '基本设置' : '样式设置')
  }))
})

// 是否有 tabs
const hasTabs = computed(() => {
  return tabs.value.length > 0
})

// 获取指定 tab 的字段
function getFieldsForTab(tabName: string): ExportOptionField[] {
  if (!props.adapter) return []
  return props.adapter.getOptionFields().filter((field) => {
    return shouldShowField(field) && (field.tab === tabName || (!field.tab && tabName === 'basic'))
  })
}

// 判断字段是否应该显示
function shouldShowField(field: ExportOptionField): boolean {
  if (!field.showWhen) return true
  return field.showWhen(formData.value)
}

// 获取字段标签
function getFieldLabel(field: ExportOptionField): string {
  if (field.labelKey) {
    return t(field.labelKey)
  }
  return field.label || field.key
}

// 获取字段描述
function getFieldDescription(field: ExportOptionField): string {
  if (field.descriptionKey) {
    return t(field.descriptionKey)
  }
  return field.description || ''
}

// 获取字段的辅助文本（描述或本地化字号）
function getFieldHelperText(field: ExportOptionField): string {
  // 字号字段显示本地化名称
  if (field.type === 'number' && field.key?.includes('fontSize')) {
    const pt = getNestedValue(formData.value, field.key)
    if (pt && typeof pt === 'number') {
      return getLocalizedFontSize(pt)
    }
  }
  // 其他字段显示描述
  return getFieldDescription(field)
}

// 判断字段是否有辅助文本
function hasFieldHelperText(field: ExportOptionField): boolean {
  if (field.type === 'number' && field.key?.includes('fontSize')) {
    const pt = getNestedValue(formData.value, field.key)
    return pt !== undefined && pt !== null
  }
  return !!(field.description || field.descriptionKey)
}

// 获取嵌套值（支持 "margins.top" 这样的路径）
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.')
  let value = obj
  for (const key of keys) {
    if (value === undefined || value === null) {
      // 如果路径不存在，尝试从默认值中获取
      return getNestedValueFromPath(defaultOptions.value, path)
    }
    value = value[key]
  }
  return value
}

// 从路径获取嵌套值（辅助函数）
function getNestedValueFromPath(obj: any, path: string): any {
  const keys = path.split('.')
  let value = obj
  for (const key of keys) {
    if (value === undefined || value === null) return undefined
    value = value[key]
  }
  return value
}

// 设置嵌套值（用于双向绑定）
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  const lastKey = keys.pop()!
  let target = obj
  for (const key of keys) {
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {}
    }
    target = target[key]
  }
  target[lastKey] = value
}

// Boolean 字段专用：保证读出的为 boolean，用于 Switch 正确切换
function getBooleanValue(obj: any, path: string): boolean {
  const v = getNestedValue(obj, path)
  return v === true
}

function setBooleanValue(path: string, value: boolean): void {
  setNestedValue(formData.value, path, value)
}

// 获取字段组件
function getFieldComponent(field: ExportOptionField): any {
  switch (field.type) {
    case 'boolean':
      return Switch
    case 'number':
      return ElInputNumber
    case 'select':
    case 'font':
    case 'fontSize':
      return Select
    case 'string':
    default:
      return ElInput
  }
}

// 获取字段属性
function getFieldProps(field: ExportOptionField): Record<string, any> {
  const props: Record<string, any> = {}

  if (field.type === 'number') {
    if (field.min !== undefined) props.min = field.min
    if (field.max !== undefined) props.max = field.max
    if (field.step !== undefined) props.step = field.step
    props.precision = 2
  }

  return props
}

/** 下拉项悬停提示（原生 title） */
function selectOptionHint(option: { hintKey?: string }): string | undefined {
  if (!option.hintKey) return undefined
  return t(option.hintKey)
}

/** TeX→PDF 且为命令行引擎时，展示与主进程 spawn 参数一致的示意命令行 */
const texPdfCliPreview = computed(() => {
  if (props.adapter?.id !== 'tex-to-pdf') return ''
  const d = formData.value
  const eng = d?.compilerEngine
  if (!eng || eng === 'tectonic') return ''
  const inter = typeof d.interactionMode === 'string' ? d.interactionMode : 'nonstopmode'
  const parts = [String(eng), `-interaction=${inter}`]
  if (d.synctex !== false) parts.push('-synctex=1')
  if (d.shellEscape) parts.push('-shell-escape')
  if (d.draft) parts.push('-draftmode')
  parts.push(`-output-directory=${t('latexEditor.compiler.cliOutputDirToken')}`)
  parts.push(t('latexEditor.compiler.cliSourceTexToken'))
  return parts.join(' ')
})

// 获取字段选项列表（统一处理 font、fontSize 和 select 类型）
function getFieldOptions(
  field: ExportOptionField
): Array<{ label: string; value: any; labelKey?: string; hintKey?: string }> {
  if (field.type === 'font') {
    return systemFonts.value.map((font) => ({
      label: font.displayName || font.name, // 使用本地化显示名称
      value: font.name // 值仍然使用内部名称
    }))
  }

  if (field.type === 'fontSize') {
    // 获取字号选项列表（包含中文字号和数字字号，按实际大小排序）
    const fontSizeOptions = getFontSizeOptions()
    return fontSizeOptions.map((option) => ({
      label: option.label,
      value: option.value // pt 值
    }))
  }

  return field.options || []
}

// 获取字体选项列表（保留用于兼容）
function getFontOptions(field: ExportOptionField): Array<{ label: string; value: string }> {
  if (field.type === 'font') {
    return systemFonts.value.map((font) => ({
      label: font.displayName || font.name, // 使用本地化显示名称
      value: font.name // 值仍然使用内部名称
    }))
  }
  return field.options || []
}

// 获取本地化的字号显示文本
function getLocalizedFontSizeText(fieldKey: string): string {
  const pt = getNestedValue(formData.value, fieldKey)
  if (pt && typeof pt === 'number') {
    return getLocalizedFontSize(pt)
  }
  return ''
}

// 处理确认
function handleConfirm(): void {
  if (!props.adapter) return

  // 验证选项
  const validation = props.adapter.validateOptions(formData.value)
  if (!validation.valid) {
    // 这里可以显示错误消息
    console.error('Export options validation failed:', validation.error)
    return
  }

  // 保存到localStorage（键与 prepareExportPayload 一致）
  saveExportOptions(
    optionsStorageFormats.value.source,
    optionsStorageFormats.value.target,
    formData.value as ExportOptions
  )

  emit('confirm', formData.value as ExportOptions)
  visible.value = false
}

// 处理取消
function handleCancel(): void {
  // 恢复默认值
  if (props.adapter) {
    const defaults = props.adapter.getDefaultOptions()
    const savedOptions = loadExportOptions(
      optionsStorageFormats.value.source,
      optionsStorageFormats.value.target
    )
    const merged = mergeExportOptions(defaults, savedOptions)
    formData.value = JSON.parse(JSON.stringify(merged))
  }
  visible.value = false
}

// 处理重置
function handleReset(): void {
  if (props.adapter) {
    formData.value = JSON.parse(JSON.stringify(defaultOptions.value))
  }
}

// 暴露方法供父组件调用，获取当前选项
defineExpose({
  getOptions: () => formData.value,
  setOptions: (options: ExportOptions) => {
    formData.value = JSON.parse(JSON.stringify(options))
  }
})
</script>

<style scoped>
:deep(.dialog-content) {
  padding: 20px;
}

/* 标题与下方配置区域间距 */
.export-options-dialog-header {
  margin-bottom: 1.25rem;
}

.export-options-form {
  padding-right: 10px;
}

/* Tab 列表置顶：滚动时始终可见；使用 muted 与选中项形成对比 */
:deep(.export-options-tabs-list) {
  position: sticky;
  top: 0;
  z-index: 10;
  background: hsl(var(--muted));
  padding-bottom: 0.5rem;
  margin-bottom: 0.25rem;
}

/* 选中 Tab：浅色下为白/亮块，深色下为深块，均有边框与阴影 */
:deep(.export-options-tabs-list [data-state='active']) {
  background-color: hsl(var(--card));
  color: hsl(var(--card-foreground));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 1px 2px hsl(var(--foreground) / 0.06);
}

/* 仅作用于 Tab 标签按钮，不影响表单内的 Switch（也是 button） */
:deep(.export-options-tabs-list button) {
  flex-shrink: 0;
  padding-left: 1rem;
  padding-right: 1rem;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}

:deep(.export-options-tabs-list button:hover) {
  background-color: hsl(var(--muted-foreground) / 0.1);
}

:deep(.export-options-tabs-list button:active) {
  opacity: 0.85;
}

:deep(.export-options-tabs-list [data-state='active']:hover) {
  background-color: hsl(var(--card));
  filter: brightness(0.97);
}

/* 深色模式：选中 Tab 阴影略强，与背景区分更明显 */
html.dark :deep(.export-options-tabs-list [data-state='active']) {
  box-shadow: 0 1px 3px hsl(0 0% 0% / 0.3);
}

:deep(.export-options-tabs-list [data-state='active']:active) {
  opacity: 0.95;
}

/* 打开对话框时不聚焦到 scroll viewport / tablist，避免整块 panel 出现难看的 focus 框 */
:deep([data-reka-scroll-area-viewport]),
:deep([data-reka-scroll-area-viewport]:focus),
:deep([data-reka-scroll-area-viewport]:focus-visible) {
  outline: none;
  box-shadow: none;
}
:deep(.export-options-tabs-list),
:deep(.export-options-tabs-list:focus),
:deep(.export-options-tabs-list:focus-visible) {
  outline: none;
  box-shadow: none;
}
:deep(.export-options-tabs [role='tabpanel']),
:deep(.export-options-tabs [role='tabpanel']:focus),
:deep(.export-options-tabs [role='tabpanel']:focus-visible) {
  outline: none;
  box-shadow: none;
}

/* 导出对话框底部按钮：深色模式下强制可读（避免白底白字） */
.export-options-dialog-footer :deep(button) {
  color: hsl(var(--foreground));
}
.export-options-dialog-footer :deep(.export-options-btn-cancel),
.export-options-dialog-footer :deep(.export-options-btn-reset) {
  border-color: hsl(var(--border));
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
.export-options-dialog-footer :deep(.export-options-btn-cancel:hover),
.export-options-dialog-footer :deep(.export-options-btn-reset:hover) {
  background-color: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
.export-options-dialog-footer :deep(.export-options-btn-export) {
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.export-options-dialog-footer :deep(.export-options-btn-export:hover) {
  filter: brightness(0.9);
}
/* 深色模式：确保主按钮为深底白字、次要按钮有边框与前景色 */
html.dark .export-options-dialog-content .export-options-dialog-footer :deep(.export-options-btn-export) {
  background-color: hsl(222.2 47.4% 11.2%);
  color: hsl(210 40% 98%);
}
html.dark .export-options-dialog-content .export-options-dialog-footer :deep(.export-options-btn-cancel),
html.dark .export-options-dialog-content .export-options-dialog-footer :deep(.export-options-btn-reset) {
  background-color: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  border-color: hsl(var(--border));
}
html.dark .export-options-dialog-content .export-options-dialog-footer :deep(.export-options-btn-cancel:hover),
html.dark .export-options-dialog-content .export-options-dialog-footer :deep(.export-options-btn-reset:hover) {
  background-color: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
</style>
