<template>
  <div class="image-settings">
    <h3 class="section-title">
      {{ t('setting.image.title') }}
      <el-tooltip
        :content="t('setting.image.titleHint', '图片上传设置，重新打开文件后生效')"
        placement="top"
      >
        <el-icon class="metadata-info-icon"><QuestionFilled /></el-icon>
      </el-tooltip>
    </h3>
    <el-form label-width="200px" class="settings-form">
      <!-- 插入图片时的操作 -->
      <el-form-item>
        <template #label>
          <span>{{ t('setting.image.insertAction') }}</span>
          <el-tooltip :content="t('setting.image.insertActionHint')" placement="top">
            <el-icon class="metadata-info-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </template>
        <el-select
          v-model="settings.imageUpload.action"
          @change="saveImageSetting('action', settings.imageUpload.action)"
          style="width: 100%"
        >
          <el-option :label="t('setting.image.insertActionUpload')" value="upload" />
          <el-option
            :label="t('setting.image.insertActionSaveToDocumentDir')"
            value="saveToDocumentDir"
          />
          <el-option
            :label="t('setting.image.insertActionSaveToAssetsDir')"
            value="saveToAssetsDir"
          />
        </el-select>
      </el-form-item>

      <!-- 网络图片自动下载 -->
      <el-form-item>
        <el-checkbox
          v-model="settings.imageUpload.keepNetworkImageUrl"
          @change="
            saveImageSetting('keepNetworkImageUrl', settings.imageUpload.keepNetworkImageUrl)
          "
        >
          {{ t('setting.image.keepNetworkImageUrl') }}
          <el-tooltip :content="t('setting.image.keepNetworkImageUrlHint')" placement="top">
            <el-icon class="metadata-info-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </el-checkbox>
      </el-form-item>

      <!-- 自动转义图片URL（仅在保留网络图片URL时显示） -->
      <el-form-item v-if="settings.imageUpload.keepNetworkImageUrl">
        <el-checkbox
          v-model="settings.imageUpload.autoEscapeImageUrl"
          @change="saveImageSetting('autoEscapeImageUrl', settings.imageUpload.autoEscapeImageUrl)"
        >
          {{ t('setting.image.autoEscapeImageUrl') }}
          <el-tooltip :content="t('setting.image.autoEscapeImageUrlHint')" placement="top">
            <el-icon class="metadata-info-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </el-checkbox>
      </el-form-item>

      <!-- 上传服务设定（仅在"上传图片"时显示） -->
      <template v-if="settings.imageUpload.action === 'upload'">
        <el-form-item>
          <template #label>
            <span>{{ t('setting.image.uploadServiceSettings') }}</span>
          </template>
        </el-form-item>

        <el-form-item :label="t('setting.image.uploadService')">
          <el-select
            v-model="settings.imageUpload.uploadService"
            @change="handleUploadServiceChange"
            style="width: 100%"
          >
            <el-option :label="t('setting.image.uploadServiceLocal')" value="local" />
            <el-option :label="t('setting.image.uploadServiceCustom')" value="custom" />
          </el-select>
        </el-form-item>

        <!-- 本地服务配置 -->
        <template v-if="settings.imageUpload.uploadService === 'local'">
          <el-form-item :label="t('setting.image.localImageDir')">
            <div class="image-dir-selector">
              <el-input
                v-model="settings.imageUpload.localImageDir"
                :placeholder="t('setting.image.localImageDirPlaceholder')"
                @change="saveImageSetting('localImageDir', settings.imageUpload.localImageDir)"
              >
                <template #append>
                  <Button @click="openImageDirectory" size="sm" type="primary">{{
                    t('setting.image.open')
                  }}</Button>
                </template>
                <template #prepend>
                  <Button @click="selectImageDirectory" size="default">{{
                    t('setting.image.browse')
                  }}</Button>
                </template>
              </el-input>
            </div>
          </el-form-item>
        </template>
      </template>

      <!-- 自定义API配置 -->
      <template v-if="settings.imageUpload.uploadService === 'custom'">
        <el-form-item :label="t('setting.image.customUploadApiUrl')">
          <el-input
            v-model="settings.imageUpload.customUploadApiUrl"
            :placeholder="t('setting.image.customUploadApiUrlPlaceholder')"
            @change="
              saveImageSetting('customUploadApiUrl', settings.imageUpload.customUploadApiUrl)
            "
          />
        </el-form-item>

        <el-form-item :label="t('setting.image.customUploadApiMethod')">
          <el-select
            v-model="settings.imageUpload.customUploadApiMethod"
            @change="
              saveImageSetting('customUploadApiMethod', settings.imageUpload.customUploadApiMethod)
            "
            style="width: 100%"
          >
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('setting.image.customUploadApiFieldName')">
          <el-input
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
        </el-form-item>
      </template>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
 import { ElMessage } from 'element-plus'
 import { QuestionFilled } from '@element-plus/icons-vue'
 import { Button } from '@renderer/components/ui/button'
import { settings, setSetting, getImagePath } from '../../utils/settings.js'
import messageBridge from '../../bridge/message-bridge'

const { t } = useI18n()

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
    ElMessage.error('选择目录失败: ' + (error instanceof Error ? error.message : String(error)))
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
      ElMessage.warning(t('setting.image.noImageDirSet', '未设置图片目录'))
    }
  } catch (error) {
    ElMessage.error('打开目录失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}
</script>

<style scoped>
.image-settings {
  width: 100%;
  max-width: 100%;
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
