<template>
  <div class="basic-settings">
    <h3 class="section-title">{{ t('setting.basic') }}</h3>
    <Form class="settings-form">
      <FormField :label="t('setting.startupOption')" name="startupOption">
        <Select
          v-model="settings.startupOption"
          @update:model-value="saveSetting('startupOption', settings.startupOption)"
        >
          <SelectTrigger class="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="min-w-[280px]">
            <SelectItem value="newFile">{{ t('setting.openNewFile') }}</SelectItem>
            <SelectItem value="lastFile">{{ t('setting.openLastFile') }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField :label="t('setting.autoOpenHomeOnStartup', '启动时自动打开主页')" name="autoOpenHomeOnStartup">
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">{{ t('setting.disabled', '禁用') }}</span>
          <Switch
            v-model:checked="settings.autoOpenHomeOnStartup"
            @update:checked="saveSetting('autoOpenHomeOnStartup', settings.autoOpenHomeOnStartup)"
          />
          <span class="text-sm text-muted-foreground">{{ t('setting.enabled', '启用') }}</span>
        </div>
      </FormField>

      <FormField :label="t('setting.defaultEditorMode')" name="defaultEditorMode">
        <Select
          v-model="settings.metadataSaveMode"
          @update:model-value="saveSetting('metadataSaveMode', settings.metadataSaveMode)"
        >
          <SelectTrigger class="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="min-w-[280px]">
            <SelectItem value="sidecar">{{ t('setting.metadataSaveModeSidecar') }}</SelectItem>
            <SelectItem value="embed">{{ t('setting.metadataSaveModeEmbed') }}</SelectItem>
            <SelectItem value="none">{{ t('setting.metadataSaveModeNone') }}</SelectItem>
          </SelectContent>
        </Select>
        <div class="editor-mode-current-hint">{{ currentEditorModeHint }}</div>
      </FormField>

      <!-- 粒子效果相关代码已注释，以备后用 -->
      <!-- <FormField name="particleEffect">
        <template #label>
          <span>{{ t('setting.particleEffect') }}</span>
          <Tooltip>
            <TooltipTrigger as-child>
              <HelpCircle class="metadata-info-icon h-4 w-4 inline-block align-middle" />
            </TooltipTrigger>
            <TooltipContent side="top">{{ t('setting.particleEffectHint') }}</TooltipContent>
          </Tooltip>
        </template>
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">{{ t('setting.disabled', '禁用') }}</span>
          <Switch
            v-model:checked="settings.particleEffect"
            @update:checked="handleParticleToggle"
          />
          <span class="text-sm text-muted-foreground">{{ t('setting.enabled', '启用') }}</span>
        </div>
      </FormField> -->

      <FormField :label="t('setting.autoSave')" name="autoSave">
        <Select v-model="settings.autoSave" @update:model-value="saveSetting('autoSave', settings.autoSave)">
          <SelectTrigger class="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="min-w-[280px]">
            <SelectItem value="never">{{ t('setting.off') }}</SelectItem>
            <SelectItem value="1">{{ t('setting.minute1') }}</SelectItem>
            <SelectItem value="5">{{ t('setting.minute5') }}</SelectItem>
            <SelectItem value="10">{{ t('setting.minute10') }}</SelectItem>
            <SelectItem value="30">{{ t('setting.minute30') }}</SelectItem>
            <SelectItem value="60">{{ t('setting.minute60') }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <!-- <FormField :label="t('setting.microphoneTest')" name="">
      <Tooltip>
        <TooltipTrigger as-child>
          <MicrophoneTest />
        </TooltipTrigger>
        <TooltipContent side="bottom">{{ t('setting.microphoneHint') }}</TooltipContent>
      </Tooltip>
    </FormField> -->

      <FormField :label="t('setting.excludeCodeBlocks')" name="excludeCodeBlocks">
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">{{ t('setting.disabled', '禁用') }}</span>
          <Switch
            v-model:checked="settings.bypassCodeBlock"
            @update:checked="saveSetting('bypassCodeBlock', settings.bypassCodeBlock)"
          />
          <span class="text-sm text-muted-foreground">{{ t('setting.enabled', '启用') }}</span>
        </div>
      </FormField>

      <FormField :label="t('setting.parseEmbeddedImages')" name="parseEmbeddedImages">
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">{{ t('setting.disabled', '禁用') }}</span>
          <Switch
            v-model:checked="settings.parseEmbeddedImages"
            @update:checked="saveSetting('parseEmbeddedImages', settings.parseEmbeddedImages)"
          />
          <span class="text-sm text-muted-foreground">{{ t('setting.enabled', '启用') }}</span>
        </div>
      </FormField>

      <FormField :label="t('setting.mathInlineDigit')" name="mathInlineDigit">
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">{{ t('setting.disabled', '禁用') }}</span>
          <Switch
            v-model:checked="settings.mathInlineDigit"
            @update:checked="saveSetting('mathInlineDigit', settings.mathInlineDigit)"
          />
          <span class="text-sm text-muted-foreground">{{ t('setting.enabled', '启用') }}</span>
        </div>
      </FormField>

      <FormField :label="t('setting.metadataSaveMode')" name="metadataSaveMode">
        <Select
          v-model="settings.metadataSaveMode"
          @update:model-value="saveSetting('metadataSaveMode', settings.metadataSaveMode)"
        >
          <SelectTrigger class="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="min-w-[280px]">
            <SelectItem value="sidecar">{{ t('setting.metadataSaveModeSidecar') }}</SelectItem>
            <SelectItem value="embed">{{ t('setting.metadataSaveModeEmbed') }}</SelectItem>
            <SelectItem value="none">{{ t('setting.metadataSaveModeNone') }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField :label="t('setting.externalFileOpenMode', '外部文件打开方式')" name="externalFileOpenMode">
        <Select
          v-model="settings.externalFileOpenMode"
          @update:model-value="saveSetting('externalFileOpenMode', settings.externalFileOpenMode)"
        >
          <SelectTrigger class="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="min-w-[280px]">
            <SelectItem value="newWindow">{{ t('setting.openInNewWindow', '在新窗口中打开') }}</SelectItem>
            <SelectItem value="newTab">{{ t('setting.openInNewTab', '在当前窗口新标签页中打开') }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <!-- 字体设置分组 -->
      <div class="font-settings-group">
        <h4 class="font-group-title">{{ t('setting.fontUi', '界面字体') }}</h4>
        <FormField :label="t('setting.fontUiLabel', 'UI字体')" name="fontUi">
          <FontSelect
            v-model="settings.fontUi"
            :placeholder="t('setting.selectFont', '选择字体')"
            preview-text="AaBbCc 你好世界"
            @update:model-value="saveSetting('fontUi', settings.fontUi); applyFontSettings()"
          />
        </FormField>
      </div>

      <div class="font-settings-group">
        <h4 class="font-group-title">{{ t('setting.fontEditor', '编辑器字体') }}</h4>
        <FormField :label="t('setting.fontEditorChinese', '编辑器中文字体')" name="fontEditorChinese">
          <FontSelect
            v-model="settings.fontEditorChinese"
            :placeholder="t('setting.selectChineseFont', '选择中文字体')"
            preview-text="你好世界"
            @update:model-value="saveSetting('fontEditorChinese', settings.fontEditorChinese)"
          />
        </FormField>
        <FormField :label="t('setting.fontEditorWestern', '编辑器西文字体')" name="fontEditorWestern">
          <FontSelect
            v-model="settings.fontEditorWestern"
            :placeholder="t('setting.selectWesternFont', '选择西文字体')"
            preview-text="AaBbCc"
            @update:model-value="saveSetting('fontEditorWestern', settings.fontEditorWestern)"
          />
        </FormField>
      </div>

      <div class="font-settings-group">
        <h4 class="font-group-title">{{ t('setting.fontPreview', '渲染预览字体') }}</h4>
        <FormField :label="t('setting.fontPreviewChinese', '预览中文字体')" name="fontPreviewChinese">
          <FontSelect
            v-model="settings.fontPreviewChinese"
            :placeholder="t('setting.selectChineseFont', '选择中文字体')"
            preview-text="你好世界"
            @update:model-value="saveSetting('fontPreviewChinese', settings.fontPreviewChinese)"
          />
        </FormField>
        <FormField :label="t('setting.fontPreviewWestern', '预览西文字体')" name="fontPreviewWestern">
          <FontSelect
            v-model="settings.fontPreviewWestern"
            :placeholder="t('setting.selectWesternFont', '选择西文字体')"
            preview-text="AaBbCc"
            @update:model-value="saveSetting('fontPreviewWestern', settings.fontPreviewWestern)"
          />
        </FormField>
      </div>

      <div class="font-settings-group">
        <h4 class="font-group-title">{{ t('setting.fontExport', 'PDF导出字体') }}</h4>
        <FormField :label="t('setting.fontExportChinese', '导出中文字体')" name="fontExportChinese">
          <FontSelect
            v-model="settings.fontExportChinese"
            :placeholder="t('setting.selectChineseFont', '选择中文字体')"
            preview-text="你好世界"
            @update:model-value="saveSetting('fontExportChinese', settings.fontExportChinese)"
          />
        </FormField>
        <FormField :label="t('setting.fontExportWestern', '导出西文字体')" name="fontExportWestern">
          <FontSelect
            v-model="settings.fontExportWestern"
            :placeholder="t('setting.selectWesternFont', '选择西文字体')"
            preview-text="AaBbCc"
            @update:model-value="saveSetting('fontExportWestern', settings.fontExportWestern)"
          />
        </FormField>
      </div>

      <FormField :label="t('setting.referenceDirManagement', '引用文件目录管理')" name="referenceDirManagement">
        <div class="reference-dir-management">
          <div class="reference-dir-info">
            <span class="reference-dir-size-label"
              >{{ t('setting.referenceDirSize', '目录大小') }}:
            </span>
            <span class="reference-dir-size-value">{{ formatFileSize(referenceDirSize) }}</span>
          </div>
          <div class="reference-dir-actions">
            <Button size="small" @click="refreshReferenceDirSize">
              {{ t('setting.refresh', '刷新') }}
            </Button>
            <Button size="small" type="primary" @click="openReferenceDir">
              {{ t('setting.openReferenceDir', '打开目录') }}
            </Button>
            <Button size="small" type="danger" @click="clearReferenceDir">
              {{ t('setting.clearReferenceDir', '清空目录') }}
            </Button>
          </div>
        </div>
      </FormField>
    </Form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { notifySuccess, notifyError, notifyWarning } from '@renderer/utils/notify'
import { HelpCircle } from 'lucide-vue-next'
import MicrophoneTest from '../../components/MicrophoneTest.vue'
import { settings, setSetting } from '../../utils/settings.js'
import eventBus from '../../utils/event-bus'
import Button from '../../components/ui/button/Button.vue'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Form, FormField } from '@renderer/components/ui/form'
import { Switch } from '@renderer/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { FontSelect } from '@renderer/components/ui/font-select'
// 单窗口多Tab架构：不再需要sendBroadcast，直接使用eventBus

const { t } = useI18n()

const referenceDirSize = ref<number>(0)

const currentEditorModeHint = computed(() => {
  const mode = settings.vditorMode
  if (mode === 'wysiwyg') return t('setting.editorModeWysiwygHint')
  if (mode === 'ir') return t('setting.editorModeIrHint')
  if (mode === 'sv') return t('setting.editorModeSvHint')
  return t('setting.editorModeIrHint')
})

const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value)
}

// 应用UI字体设置
const applyFontSettings = () => {
  const fontFamily = settings.fontUi || 'OPPO Sans 4.0'
  document.documentElement.style.setProperty('--font-family-ui', fontFamily)
  eventBus.emit('font-settings-changed', { type: 'ui', font: fontFamily })
}

// 粒子效果相关代码已注释，以备后用
// const handleParticleToggle = () => {
//   saveSetting('particleEffect', settings.particleEffect)
//   // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
//   eventBus.emit('toggle-particle-effect', {})
// }

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

// 获取reference目录大小
const refreshReferenceDirSize = async () => {
  try {
    const messageBridge = (await import('../../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    const size = (await messageBridge.invoke('get-reference-dir-size')) as number
    referenceDirSize.value = size
  } catch (error) {
    notifyError('获取目录大小失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 打开reference目录
const openReferenceDir = async () => {
  try {
    const messageBridge = (await import('../../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    await messageBridge.invoke('open-reference-dir')
  } catch (error) {
    notifyError('打开目录失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 清空reference目录
const clearReferenceDir = async () => {
  try {
    await ElMessageBox.confirm(
      t(
        'setting.clearReferenceDirConfirm',
        '确定要清空引用文件目录吗？此操作将删除目录中的所有文件，且无法恢复。'
      ),
      t('setting.clearReferenceDir', '清空目录'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm', '确认'),
        cancelButtonText: t('common.cancel', '取消')
      }
    )

    const messageBridge = (await import('../../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    await messageBridge.invoke('clear-reference-dir')
    await refreshReferenceDirSize()
    notifySuccess(t('setting.clearReferenceDirSuccess', '目录已清空'))
  } catch (error) {
    if (error !== 'cancel') {
      notifyError('清空目录失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }
}

onMounted(() => {
  // 粒子效果相关代码已注释，强制关闭粒子效果设置
  // 确保粒子效果设置永远关闭
  if (settings.particleEffect !== false) {
    saveSetting('particleEffect', false)
  }
  refreshReferenceDirSize()
})
</script>

<style scoped>
.basic-settings {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 24px;
  box-sizing: border-box;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
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
.settings-form :deep(.el-select) {
  width: 100%;
  max-width: 100%;
}

.reference-dir-management {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reference-dir-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reference-dir-size-label {
  font-weight: 500;
}

.reference-dir-size-value {
  color: var(--el-text-color-regular);
}

.reference-dir-actions {
  display: flex;
  gap: 8px;
}

.metadata-info-icon {
  margin-left: 4px;
  color: var(--el-text-color-secondary);
  cursor: help;
  font-size: 14px;
}

.metadata-info-icon:hover {
  color: var(--el-color-primary);
}

.editor-mode-current-hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

/* 字体设置分组样式 */
.font-settings-group {
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background-color: var(--el-fill-color-light);
}

.font-group-title {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.font-settings-group :deep(.form-field) {
  margin-bottom: 16px;
}

.font-settings-group :deep(.form-field:last-child) {
  margin-bottom: 0;
}
</style>
