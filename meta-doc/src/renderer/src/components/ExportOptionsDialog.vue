<template>
  <Dialog v-model:open="visible">
    <DialogContent class="max-w-[600px]">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>
    <ScrollArea class="h-[500px]">
      <Tabs v-model="activeTab" v-if="hasTabs" class="export-options-tabs">
        <TabsList class="w-full grid" :style="{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }">
          <TabsTrigger v-for="tab in tabs" :key="tab.name" :value="tab.name">
            {{ tab.label }}
          </TabsTrigger>
        </TabsList>

        <TabsContent v-for="tab in tabs" :key="tab.name" :value="tab.name">
          <el-form
            :model="formData"
            label-width="140px"
            label-position="left"
            class="export-options-form"
          >
            <template v-for="field in getFieldsForTab(tab.name)" :key="field.key">
              <!-- 对象类型字段（如margins） -->
              <template v-if="field.type === 'object' && field.fields">
                <el-divider>
                  <span>{{ getFieldLabel(field) }}</span>
                </el-divider>
                <template v-for="subField in field.fields" :key="subField.key">
                  <el-form-item
                    v-if="
                      shouldShowField(subField) &&
                      (subField.type === 'select' ||
                        subField.type === 'font' ||
                        subField.type === 'fontSize')
                    "
                    :label="getFieldLabel(subField)"
                    :prop="subField.key"
                  >
                    <Select
                      :model-value="getNestedValue(formData, subField.key)"
                      @update:model-value="
                        (val: any) => setNestedValue(formData, subField.key, val)
                      "
                      :disabled="subField.type === 'font' && fontsLoading"
                    >
                      <SelectTrigger style="width: 100%">
                        <SelectValue :placeholder="getFieldLabel(subField)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="option in getFieldOptions(subField)"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.labelKey ? t(option.labelKey) : option.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <el-text
                      v-if="subField.description || subField.descriptionKey"
                      size="small"
                      type="info"
                      style="display: block; margin-top: 4px"
                    >
                      {{ getFieldDescription(subField) }}
                    </el-text>
                  </el-form-item>
                  <el-form-item
                    v-else-if="shouldShowField(subField)"
                    :label="getFieldLabel(subField)"
                    :prop="subField.key"
                  >
                    <component
                      :is="getFieldComponent(subField)"
                      :model-value="getNestedValue(formData, subField.key)"
                      @update:model-value="
                        (val: any) => setNestedValue(formData, subField.key, val)
                      "
                      v-bind="getFieldProps(subField)"
                      style="width: 100%"
                    />
                    <span
                      v-if="subField.description || subField.descriptionKey"
                      class="text-xs text-muted-foreground mt-1 block"
                    >
                      {{ getFieldDescription(subField) }}
                    </span>
                  </el-form-item>
                </template>
              </template>

              <!-- Select字段、Font字段和FontSize字段 -->
              <el-form-item
                v-else-if="
                  shouldShowField(field) &&
                  (field.type === 'select' || field.type === 'font' || field.type === 'fontSize')
                "
                :label="getFieldLabel(field)"
                :prop="field.key"
              >
            <Select
              :model-value="getNestedValue(formData, field.key)"
              @update:model-value="(val: any) => setNestedValue(formData, field.key, val)"
              :disabled="field.type === 'font' && fontsLoading"
            >
              <SelectTrigger style="width: 100%">
                <SelectValue :placeholder="getFieldLabel(field)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in getFieldOptions(field)"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.labelKey ? t(option.labelKey) : option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <span
              v-if="hasFieldHelperText(field)"
              class="text-xs text-muted-foreground mt-1 block"
            >
              {{ getFieldHelperText(field) }}
            </span>
          </el-form-item>

          <!-- 普通字段 -->
          <el-form-item
            v-else-if="shouldShowField(field)"
            :label="getFieldLabel(field)"
            :prop="field.key"
          >
            <component
              :is="getFieldComponent(field)"
              :model-value="getNestedValue(formData, field.key)"
              @update:model-value="(val: any) => setNestedValue(formData, field.key, val)"
              v-bind="getFieldProps(field)"
              style="width: 100%"
            />
            <el-text
              v-if="hasFieldHelperText(field)"
              size="small"
              type="info"
              style="display: block; margin-top: 4px"
            >
              {{ getFieldHelperText(field) }}
            </el-text>
          </el-form-item>
        </template>
      </el-form>
    </TabsContent>
    </Tabs>
    <el-form
      v-else
      :model="formData"
      label-width="140px"
      label-position="left"
      class="export-options-form"
    >
      <template v-for="field in visibleFields" :key="field.key">
        <!-- 对象类型字段（如margins） -->
        <template v-if="field.type === 'object' && field.fields">
          <el-divider>
            <span>{{ getFieldLabel(field) }}</span>
          </el-divider>
          <template v-for="subField in field.fields" :key="subField.key">
            <el-form-item
              v-if="
                shouldShowField(subField) &&
                (subField.type === 'select' ||
                  subField.type === 'font' ||
                  subField.type === 'fontSize')
              "
              :label="getFieldLabel(subField)"
              :prop="subField.key"
            >
              <Select
                :model-value="getNestedValue(formData, subField.key)"
                @update:model-value="(val: any) => setNestedValue(formData, subField.key, val)"
                :disabled="subField.type === 'font' && fontsLoading"
              >
                <SelectTrigger style="width: 100%">
                  <SelectValue :placeholder="getFieldLabel(subField)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in getFieldOptions(subField)"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.labelKey ? t(option.labelKey) : option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <span
                v-if="subField.description || subField.descriptionKey"
                class="text-xs text-muted-foreground mt-1 block"
              >
                {{ getFieldDescription(subField) }}
              </span>
            </el-form-item>
            <el-form-item
              v-else-if="shouldShowField(subField)"
              :label="getFieldLabel(subField)"
              :prop="subField.key"
            >
              <component
                :is="getFieldComponent(subField)"
                :model-value="getNestedValue(formData, subField.key)"
                @update:model-value="(val: any) => setNestedValue(formData, subField.key, val)"
                v-bind="getFieldProps(subField)"
                style="width: 100%"
              />
              <span
                v-if="subField.description || subField.descriptionKey"
                class="text-xs text-muted-foreground mt-1 block"
              >
                {{ getFieldDescription(subField) }}
              </span>
            </el-form-item>
          </template>
        </template>

        <!-- Select字段、Font字段和FontSize字段 -->
        <el-form-item
          v-else-if="
            shouldShowField(field) &&
            (field.type === 'select' || field.type === 'font' || field.type === 'fontSize')
          "
          :label="getFieldLabel(field)"
          :prop="field.key"
        >
          <Select
            :model-value="getNestedValue(formData, field.key)"
            @update:model-value="(val: any) => setNestedValue(formData, field.key, val)"
            :disabled="field.type === 'font' && fontsLoading"
          >
            <SelectTrigger style="width: 100%">
              <SelectValue :placeholder="getFieldLabel(field)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in getFieldOptions(field)"
                :key="option.value"
                :value="option.value"
              >
                {{ option.labelKey ? t(option.labelKey) : option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <span
            v-if="hasFieldHelperText(field)"
            class="text-xs text-muted-foreground mt-1 block"
          >
            {{ getFieldHelperText(field) }}
          </span>
        </el-form-item>

        <!-- 普通字段 -->
        <el-form-item
          v-else-if="shouldShowField(field)"
          :label="getFieldLabel(field)"
          :prop="field.key"
        >
          <component
            :is="getFieldComponent(field)"
            :model-value="getNestedValue(formData, field.key)"
            @update:model-value="(val: any) => setNestedValue(formData, field.key, val)"
            v-bind="getFieldProps(field)"
            style="width: 100%"
          />
          <el-text
            v-if="hasFieldHelperText(field)"
            size="small"
            type="info"
            style="display: block; margin-top: 4px"
          >
            {{ getFieldHelperText(field) }}
          </el-text>
        </el-form-item>
      </template>
    </el-form>
    </ScrollArea>

    <DialogFooter>
      <Button @click="handleCancel">
        {{ t('common.cancel') }}
      </Button>
      <Button @click="handleConfirm">
        {{ t('common.confirm') }}
      </Button>
      <Button @click="handleReset" variant="outline">
        {{ t('common.reset') }}
      </Button>
    </DialogFooter>
  </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Form, FormField } from '@renderer/components/ui/form'
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElSwitch,
  ElDivider
} from 'element-plus'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
} from '../utils/font-size-localization'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  adapter: ExportAdapter | null
  sourceFormat: DocumentFormat
  targetFormat: ExportFormat
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [options: ExportOptions]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const dialogTitle = computed(() => {
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
  () => [props.adapter, props.sourceFormat, props.targetFormat],
  ([adapter, sourceFormat, targetFormat]) => {
    if (adapter) {
      const defaults = adapter.getDefaultOptions()
      defaultOptions.value = defaults

      // 从localStorage加载保存的选项
      const savedOptions = loadExportOptions(sourceFormat, targetFormat)
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

// 获取字段组件
function getFieldComponent(field: ExportOptionField): any {
  switch (field.type) {
    case 'boolean':
      return ElSwitch
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

// 获取字段选项列表（统一处理 font、fontSize 和 select 类型）
function getFieldOptions(
  field: ExportOptionField
): Array<{ label: string; value: any; labelKey?: string }> {
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

  // 保存到localStorage
  saveExportOptions(props.sourceFormat, props.targetFormat, formData.value as ExportOptions)

  emit('confirm', formData.value as ExportOptions)
  visible.value = false
}

// 处理取消
function handleCancel(): void {
  // 恢复默认值
  if (props.adapter) {
    const defaults = props.adapter.getDefaultOptions()
    const savedOptions = loadExportOptions(props.sourceFormat, props.targetFormat)
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

.export-options-form {
  padding-right: 10px;
}

.export-options-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.export-options-form :deep(.el-divider__text) {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
</style>
