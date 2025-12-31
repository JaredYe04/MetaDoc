<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="600px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    :style="{
      '--el-dialog-bg-color': themeState.currentTheme.background,
      '--el-text-color-primary': themeState.currentTheme.textColor,
      '--el-border-color': themeState.currentTheme.textColor + '33',
    }"
    class="export-options-dialog"
  >
    <el-scrollbar height="500px">
      <el-tabs v-model="activeTab" type="border-card" v-if="hasTabs">
        <el-tab-pane
          v-for="tab in tabs"
          :key="tab.name"
          :label="tab.label"
          :name="tab.name"
        >
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
                v-if="shouldShowField(subField) && (subField.type === 'select' || subField.type === 'font')"
                :label="getFieldLabel(subField)"
                :prop="subField.key"
              >
                <el-select
                  :model-value="getNestedValue(formData, subField.key)"
                  @update:model-value="(val) => setNestedValue(formData, subField.key, val)"
                  :placeholder="getFieldLabel(subField)"
                  :loading="subField.type === 'font' && fontsLoading"
                  v-bind="getFieldProps(subField)"
                  style="width: 100%"
                >
                  <el-option
                    v-for="option in (subField.type === 'font' ? getFontOptions(subField) : (subField.options || []))"
                    :key="option.value"
                    :label="option.labelKey ? t(option.labelKey) : option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-text
                  v-if="subField.description || subField.descriptionKey"
                  size="small"
                  type="info"
                  style="display: block; margin-top: 4px;"
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
                  @update:model-value="(val) => setNestedValue(formData, subField.key, val)"
                  v-bind="getFieldProps(subField)"
                  style="width: 100%"
                />
                <el-text
                  v-if="subField.description || subField.descriptionKey"
                  size="small"
                  type="info"
                  style="display: block; margin-top: 4px;"
                >
                  {{ getFieldDescription(subField) }}
                </el-text>
              </el-form-item>
            </template>
          </template>
          
          <!-- Select字段和Font字段 -->
          <el-form-item
            v-else-if="shouldShowField(field) && (field.type === 'select' || field.type === 'font')"
            :label="getFieldLabel(field)"
            :prop="field.key"
          >
            <el-select
              :model-value="getNestedValue(formData, field.key)"
              @update:model-value="(val) => setNestedValue(formData, field.key, val)"
              :placeholder="getFieldLabel(field)"
              :loading="field.type === 'font' && fontsLoading"
              v-bind="getFieldProps(field)"
              style="width: 100%"
            >
              <el-option
                v-for="option in (field.type === 'font' ? getFontOptions(field) : (field.options || []))"
                :key="option.value"
                :label="option.labelKey ? t(option.labelKey) : option.label"
                :value="option.value"
              />
            </el-select>
            <el-text
              v-if="field.description || field.descriptionKey"
              size="small"
              type="info"
              style="display: block; margin-top: 4px;"
            >
              {{ getFieldDescription(field) }}
            </el-text>
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
              @update:model-value="(val) => setNestedValue(formData, field.key, val)"
              v-bind="getFieldProps(field)"
              style="width: 100%"
            />
            <el-text
              v-if="field.description || field.descriptionKey"
              size="small"
              type="info"
              style="display: block; margin-top: 4px;"
            >
              {{ getFieldDescription(field) }}
            </el-text>
          </el-form-item>
            </template>
          </el-form>
        </el-tab-pane>
      </el-tabs>
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
                v-if="shouldShowField(subField) && (subField.type === 'select' || subField.type === 'font')"
                :label="getFieldLabel(subField)"
                :prop="subField.key"
              >
                <el-select
                  :model-value="getNestedValue(formData, subField.key)"
                  @update:model-value="(val) => setNestedValue(formData, subField.key, val)"
                  :placeholder="getFieldLabel(subField)"
                  :loading="subField.type === 'font' && fontsLoading"
                  v-bind="getFieldProps(subField)"
                  style="width: 100%"
                >
                  <el-option
                    v-for="option in (subField.type === 'font' ? getFontOptions(subField) : (subField.options || []))"
                    :key="option.value"
                    :label="option.labelKey ? t(option.labelKey) : option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-text
                  v-if="subField.description || subField.descriptionKey"
                  size="small"
                  type="info"
                  style="display: block; margin-top: 4px;"
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
                  @update:model-value="(val) => setNestedValue(formData, subField.key, val)"
                  v-bind="getFieldProps(subField)"
                  style="width: 100%"
                />
                <el-text
                  v-if="subField.description || subField.descriptionKey"
                  size="small"
                  type="info"
                  style="display: block; margin-top: 4px;"
                >
                  {{ getFieldDescription(subField) }}
                </el-text>
              </el-form-item>
            </template>
          </template>
          
          <!-- Select字段和Font字段 -->
          <el-form-item
            v-else-if="shouldShowField(field) && (field.type === 'select' || field.type === 'font')"
            :label="getFieldLabel(field)"
            :prop="field.key"
          >
            <el-select
              :model-value="getNestedValue(formData, field.key)"
              @update:model-value="(val) => setNestedValue(formData, field.key, val)"
              :placeholder="getFieldLabel(field)"
              :loading="field.type === 'font' && fontsLoading"
              v-bind="getFieldProps(field)"
              style="width: 100%"
            >
              <el-option
                v-for="option in (field.type === 'font' ? getFontOptions(field) : (field.options || []))"
                :key="option.value"
                :label="option.labelKey ? t(option.labelKey) : option.label"
                :value="option.value"
              />
            </el-select>
            <el-text
              v-if="field.description || field.descriptionKey"
              size="small"
              type="info"
              style="display: block; margin-top: 4px;"
            >
              {{ getFieldDescription(field) }}
            </el-text>
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
              @update:model-value="(val) => setNestedValue(formData, field.key, val)"
              v-bind="getFieldProps(field)"
              style="width: 100%"
            />
            <el-text
              v-if="field.description || field.descriptionKey"
              size="small"
              type="info"
              style="display: block; margin-top: 4px;"
            >
              {{ getFieldDescription(field) }}
            </el-text>
          </el-form-item>
        </template>
      </el-form>
    </el-scrollbar>
    
    <template #footer>
      <el-button @click="handleCancel">
        {{ t('common.cancel') }}
      </el-button>
      <el-button type="primary" @click="handleConfirm">
        {{ t('common.confirm') }}
      </el-button>
      <el-button @click="handleReset">
        {{ t('common.reset') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElSelect, ElOption, ElSwitch, ElButton, ElScrollbar, ElDivider, ElText, ElTabs, ElTabPane } from 'element-plus';
import { themeState } from '../utils/themes';
import type { ExportAdapter, ExportOptionField, ExportOptions } from '../services/export-adapters/types';
import type { DocumentFormat, ExportFormat } from '../../types';
import { loadExportOptions, mergeExportOptions, saveExportOptions } from '../services/export-adapters/storage';
import { getSystemFonts, type SystemFont } from '../services/font-service';

const { t } = useI18n();

const props = defineProps<{
  modelValue: boolean;
  adapter: ExportAdapter | null;
  sourceFormat: DocumentFormat;
  targetFormat: ExportFormat;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'confirm': [options: ExportOptions];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const dialogTitle = computed(() => {
  if (!props.adapter) return t('export.options.title');
  return props.adapter.nameKey ? t(props.adapter.nameKey) : props.adapter.name;
});

const formData = ref<Record<string, any>>({});
const defaultOptions = ref<ExportOptions>({});
const systemFonts = ref<SystemFont[]>([]);
const fontsLoading = ref(false);
const activeTab = ref<string>('basic');

// 加载系统字体
onMounted(async () => {
  fontsLoading.value = true;
  try {
    systemFonts.value = await getSystemFonts();
  } catch (error) {
    console.error('加载系统字体失败:', error);
  } finally {
    fontsLoading.value = false;
  }
});

// 初始化表单数据
watch(
  () => [props.adapter, props.sourceFormat, props.targetFormat],
  ([adapter, sourceFormat, targetFormat]) => {
    if (adapter) {
      const defaults = adapter.getDefaultOptions();
      defaultOptions.value = defaults;
      
      // 从localStorage加载保存的选项
      const savedOptions = loadExportOptions(sourceFormat, targetFormat);
      const merged = mergeExportOptions(defaults, savedOptions);
      
      formData.value = JSON.parse(JSON.stringify(merged));
    }
  },
  { immediate: true }
);

// 获取可见的字段
const visibleFields = computed(() => {
  if (!props.adapter) return [];
  return props.adapter.getOptionFields().filter(field => shouldShowField(field));
});

// 获取所有 tab
const tabs = computed(() => {
  if (!props.adapter) return [];
  const fields = props.adapter.getOptionFields();
  const tabSet = new Set<string>();
  fields.forEach(field => {
    if (field.tab) {
      tabSet.add(field.tab);
    }
  });
  const tabList = Array.from(tabSet);
  return tabList.map(tabName => ({
    name: tabName,
    label: t(`export.options.tabs.${tabName}`, tabName === 'basic' ? '基本设置' : '样式设置'),
  }));
});

// 是否有 tabs
const hasTabs = computed(() => {
  return tabs.value.length > 0;
});

// 获取指定 tab 的字段
function getFieldsForTab(tabName: string): ExportOptionField[] {
  if (!props.adapter) return [];
  return props.adapter.getOptionFields().filter(field => {
    return shouldShowField(field) && (field.tab === tabName || (!field.tab && tabName === 'basic'));
  });
}

// 判断字段是否应该显示
function shouldShowField(field: ExportOptionField): boolean {
  if (!field.showWhen) return true;
  return field.showWhen(formData.value);
}

// 获取字段标签
function getFieldLabel(field: ExportOptionField): string {
  if (field.labelKey) {
    return t(field.labelKey);
  }
  return field.label || field.key;
}

// 获取字段描述
function getFieldDescription(field: ExportOptionField): string {
  if (field.descriptionKey) {
    return t(field.descriptionKey);
  }
  return field.description || '';
}

// 获取嵌套值（支持 "margins.top" 这样的路径）
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value === undefined || value === null) {
      // 如果路径不存在，尝试从默认值中获取
      return getNestedValueFromPath(defaultOptions.value, path);
    }
    value = value[key];
  }
  return value;
}

// 从路径获取嵌套值（辅助函数）
function getNestedValueFromPath(obj: any, path: string): any {
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value === undefined || value === null) return undefined;
    value = value[key];
  }
  return value;
}

// 设置嵌套值（用于双向绑定）
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  let target = obj;
  for (const key of keys) {
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key];
  }
  target[lastKey] = value;
}

// 获取字段组件
function getFieldComponent(field: ExportOptionField): any {
  switch (field.type) {
    case 'boolean':
      return ElSwitch;
    case 'number':
      return ElInputNumber;
    case 'select':
    case 'font':
      return ElSelect;
    case 'string':
    default:
      return ElInput;
  }
}

// 获取字段属性
function getFieldProps(field: ExportOptionField): Record<string, any> {
  const props: Record<string, any> = {};
  
  if (field.type === 'number') {
    if (field.min !== undefined) props.min = field.min;
    if (field.max !== undefined) props.max = field.max;
    if (field.step !== undefined) props.step = field.step;
    props.precision = 2;
  }
  
  if (field.type === 'font') {
    // 字体选择框使用系统字体列表
    props.filterable = true;
    props.placeholder = getFieldLabel(field);
  }
  
  return props;
}

// 获取字体选项列表
function getFontOptions(field: ExportOptionField): Array<{ label: string; value: string }> {
  if (field.type === 'font') {
    return systemFonts.value.map(font => ({
      label: font.name,
      value: font.name,
    }));
  }
  return field.options || [];
}

// 处理确认
function handleConfirm(): void {
  if (!props.adapter) return;
  
  // 验证选项
  const validation = props.adapter.validateOptions(formData.value);
  if (!validation.valid) {
    // 这里可以显示错误消息
    console.error('Export options validation failed:', validation.error);
    return;
  }
  
  // 保存到localStorage
  saveExportOptions(props.sourceFormat, props.targetFormat, formData.value as ExportOptions);
  
  emit('confirm', formData.value as ExportOptions);
  visible.value = false;
}

// 处理取消
function handleCancel(): void {
  // 恢复默认值
  if (props.adapter) {
    const defaults = props.adapter.getDefaultOptions();
    const savedOptions = loadExportOptions(props.sourceFormat, props.targetFormat);
    const merged = mergeExportOptions(defaults, savedOptions);
    formData.value = JSON.parse(JSON.stringify(merged));
  }
  visible.value = false;
}

// 处理重置
function handleReset(): void {
  if (props.adapter) {
    formData.value = JSON.parse(JSON.stringify(defaultOptions.value));
  }
}

// 暴露方法供父组件调用，获取当前选项
defineExpose({
  getOptions: () => formData.value,
  setOptions: (options: ExportOptions) => {
    formData.value = JSON.parse(JSON.stringify(options));
  },
});
</script>

<style scoped>
.export-options-dialog :deep(.el-dialog__body) {
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
