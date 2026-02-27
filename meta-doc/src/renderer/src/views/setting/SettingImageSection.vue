<template>
  <div class="image-settings">
    <h3 class="section-title">
      {{ t('setting.image.title') }}
      <Tooltip>
        <TooltipTrigger as-child>
          <HelpCircle class="metadata-info-icon h-4 w-4 inline-block align-middle" />
        </TooltipTrigger>
        <TooltipContent side="top">{{
          t('setting.image.titleHint', '图片上传设置，重新打开文件后生效')
        }}</TooltipContent>
      </Tooltip>
    </h3>
    <Form class="settings-form">
      <!-- 插入图片时的操作 -->
      <FormField name="imageUploadAction">
        <template #label>
          <span>{{ t('setting.image.insertAction') }}</span>
          <Tooltip>
            <TooltipTrigger as-child>
              <HelpCircle class="metadata-info-icon h-4 w-4 inline-block align-middle" />
            </TooltipTrigger>
            <TooltipContent side="top">{{ t('setting.image.insertActionHint') }}</TooltipContent>
          </Tooltip>
        </template>
        <Select
          v-model="settings.imageUpload.action"
          @update:model-value="saveImageSetting('action', settings.imageUpload.action)"
        >
          <SelectTrigger class="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upload">{{ t('setting.image.insertActionUpload') }}</SelectItem>
            <SelectItem value="saveToDocumentDir">
              {{ t('setting.image.insertActionSaveToDocumentDir') }}
            </SelectItem>
            <SelectItem value="saveToAssetsDir">
              {{ t('setting.image.insertActionSaveToAssetsDir') }}
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <!-- 网络图片自动下载 -->
      <FormField name="keepNetworkImageUrl">
        <label class="flex items-center gap-2 cursor-pointer">
          <Checkbox
            v-model="settings.imageUpload.keepNetworkImageUrl"
            @update:model-value="
              saveImageSetting('keepNetworkImageUrl', settings.imageUpload.keepNetworkImageUrl)
            "
          />
          <span>{{ t('setting.image.keepNetworkImageUrl') }}</span>
          <Tooltip>
            <TooltipTrigger as-child>
              <HelpCircle class="metadata-info-icon h-4 w-4 inline-block align-middle" />
            </TooltipTrigger>
            <TooltipContent side="top">{{
              t('setting.image.keepNetworkImageUrlHint')
            }}</TooltipContent>
          </Tooltip>
        </label>
      </FormField>

      <!-- 自动转义图片URL（仅在保留网络图片URL时显示） -->
      <FormField v-if="settings.imageUpload.keepNetworkImageUrl" name="autoEscapeImageUrl">
        <label class="flex items-center gap-2 cursor-pointer">
          <Checkbox
            v-model="settings.imageUpload.autoEscapeImageUrl"
            @update:model-value="
              saveImageSetting('autoEscapeImageUrl', settings.imageUpload.autoEscapeImageUrl)
            "
          />
          <span>{{ t('setting.image.autoEscapeImageUrl') }}</span>
          <Tooltip>
            <TooltipTrigger as-child>
              <HelpCircle class="metadata-info-icon h-4 w-4 inline-block align-middle" />
            </TooltipTrigger>
            <TooltipContent side="top">{{
              t('setting.image.autoEscapeImageUrlHint')
            }}</TooltipContent>
          </Tooltip>
        </label>
      </FormField>

      <!-- 上传服务设定（仅在"上传图片"时显示） -->
      <template v-if="settings.imageUpload.action === 'upload'">
        <FormField name="uploadServiceSettings">
          <template #label>
            <span>{{ t('setting.image.uploadServiceSettings') }}</span>
          </template>
        </FormField>

        <FormField
          :label="t('setting.image.uploadService')"
          name="uploadService"
          layout="horizontal"
        >
          <Select
            v-model="settings.imageUpload.uploadService"
            @update:model-value="handleUploadServiceChange"
          >
            <SelectTrigger class="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">{{ t('setting.image.uploadServiceLocal') }}</SelectItem>
              <SelectItem value="custom">{{ t('setting.image.uploadServiceCustom') }}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <!-- 本地服务配置 -->
        <template v-if="settings.imageUpload.uploadService === 'local'">
          <FormField
            :label="t('setting.image.localImageDir')"
            name="localImageDir"
            layout="horizontal"
          >
            <div class="image-dir-selector flex gap-2">
              <Button @click="selectImageDirectory" size="default">{{
                t('setting.image.browse')
              }}</Button>
              <Input
                v-model="settings.imageUpload.localImageDir"
                :placeholder="t('setting.image.localImageDirPlaceholder')"
                class="flex-1"
                @change="saveImageSetting('localImageDir', settings.imageUpload.localImageDir)"
              />
              <Button @click="openImageDirectory" size="sm" variant="default">{{
                t('setting.image.open')
              }}</Button>
            </div>
          </FormField>
        </template>
      </template>

      <!-- 自定义API配置 -->
      <template v-if="settings.imageUpload.uploadService === 'custom'">
        <FormField
          :label="t('setting.image.customUploadApiUrl')"
          name="customUploadApiUrl"
          layout="horizontal"
        >
          <Input
            v-model="settings.imageUpload.customUploadApiUrl"
            :placeholder="t('setting.image.customUploadApiUrlPlaceholder')"
            @change="
              saveImageSetting('customUploadApiUrl', settings.imageUpload.customUploadApiUrl)
            "
          />
        </FormField>

        <FormField
          :label="t('setting.image.customUploadApiMethod')"
          name="customUploadApiMethod"
          layout="horizontal"
        >
          <Select
            v-model="settings.imageUpload.customUploadApiMethod"
            @update:model-value="
              saveImageSetting('customUploadApiMethod', settings.imageUpload.customUploadApiMethod)
            "
          >
            <SelectTrigger class="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          :label="t('setting.image.customUploadApiFieldName')"
          name="customUploadApiFieldName"
          layout="horizontal"
        >
          <Input
            v-model="settings.imageUpload.customUploadApiFieldName"
            :placeholder="t('setting.image.customUploadApiFieldNamePlaceholder')"
            @change="
              saveImageSetting(
                'customUploadApiFieldName',
                settings.imageUpload.customUploadApiFieldName
              )
            "
          />
          <div class="setting-hint">{{ t('setting.image.customUploadApiFieldNameHint') }}</div>
        </FormField>
      </template>
    </Form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Form, FormField } from '@renderer/components/ui/form'
import { notifyError, notifyWarning } from '@renderer/utils/notify'
import { HelpCircle } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { settings, setSetting, getImagePath } from '../../utils/settings.js'
import messageBridge from '../../bridge/message-bridge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

// Demo mode support
const props = defineProps<{
  mode?: string
}>()
const isDemo = computed(() => props.mode === 'demo')

const { t } = useI18n()

// Load demo data for image settings
const loadDemoData = () => {
  // Mock image settings data
  settings.imageUpload = {
    action: 'upload',
    uploadService: 'local',
    localImageDir: '/Users/demo/Documents/MetaDoc Images',
    customUploadApiUrl: '',
    customUploadApiMethod: 'POST',
    customUploadApiFieldName: 'file',
    keepNetworkImageUrl: false,
    autoEscapeImageUrl: true
  }
}

onMounted(() => {
  if (isDemo.value) {
    loadDemoData()
  }
})

const saveImageSetting = async (key: string, value: unknown) => {
  const imageUpload = { ...settings.imageUpload, [key]: value }
  await setSetting('imageUpload', imageUpload)
  settings.imageUpload = imageUpload
}

const handleUploadServiceChange = async (value: string) => {
  await saveImageSetting('uploadService', value)
}

const selectImageDirectory = async () => {
  try {
    const result = (await messageBridge.invoke('show-open-dialog', {
      title: t('setting.image.selectImageDirectory', '选择图片目录'),
      properties: ['openDirectory']
    })) as { canceled: boolean; filePaths?: string[] }

    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      await saveImageSetting('localImageDir', result.filePaths[0])
    }
  } catch (error) {
    notifyError('选择目录失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

const openImageDirectory = async () => {
  try {
    // 获取要打开的目录路径
    let dirPath = settings.imageUpload.localImageDir
    if (!dirPath) {
      // 如果未设置，使用默认路径
      dirPath = await getImagePath()
    }

    if (dirPath) {
      // 使用 shell-open 打开目录
      messageBridge.send('shell-open', dirPath)
    } else {
      notifyWarning(t('setting.image.noImageDirSet', '未设置图片目录'))
    }
  } catch (error) {
    notifyError('打开目录失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}
</script>

<style scoped>
.image-settings {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
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

.image-dir-selector {
  width: 100%;
}

.image-dir-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.setting-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
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
</style>
