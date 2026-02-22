<template>
  <div class="theme-settings">
    <h3 class="section-title">{{ t('setting.themeSettings') }}</h3>
    <!-- 主题卡片网格 -->
    <div class="theme-cards-container">
      <div
        v-for="theme in themeList"
        :key="theme.id"
        class="theme-card"
        :class="{ 'is-selected': theme.id === selectedThemeId, 'is-default': theme.isDefault }"
        @click="selectTheme(theme)"
      >
        <!-- 主题色预览 -->
        <div
          v-if="theme.type !== 'sync-color' && theme.type !== 'sync'"
          class="theme-card__preview"
          :style="{ backgroundColor: getThemePreviewColor(theme) }"
        ></div>
        <div
          v-else-if="theme.type === 'sync-color'"
          class="theme-card__preview theme-card__preview--sync"
        >
          {{ t('setting.themeSyncColor') }}
        </div>
        <div
          v-else-if="theme.type === 'sync'"
          class="theme-card__preview theme-card__preview--sync"
        >
          {{ t('setting.themeSync') }}
        </div>

        <!-- 主题信息 -->
        <div class="theme-card__info">
          <div class="theme-card__name">{{ theme.name }}</div>
          <div v-if="theme.type === 'custom' && !theme.isDefault" class="theme-card__color-wrapper">
            <div class="theme-card__color" :style="{ color: getEditingColor(theme) }">
              {{ getEditingColor(theme) }}
            </div>
            <!-- 颜色选择器（仅用户自定义主题，不包括预设主题） -->
            <el-color-picker
              v-model="editingColorMap[theme.id]"
              :predefine="predefineColors"
              size="small"
              @change="(val: string | null) => handleColorPickerChange(theme, val)"
              @visible-change="(visible: boolean) => handleColorPickerVisibleChange(theme, visible)"
            />
          </div>
          <div
            v-else-if="theme.type === 'custom' && theme.isDefault"
            class="theme-card__color"
            :style="{ color: theme.themeColor }"
          >
            {{ theme.themeColor }}
          </div>
          <div
            v-else-if="theme.type === 'sync-color'"
            class="theme-card__color theme-card__color--sync"
          >
            {{ t('setting.themeSyncColor') }}
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="theme-card__actions" @click.stop>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button type="text" circle size="small">
                <MoreVertical class="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem @click="handleAction('duplicate', theme)">
                <Copy class="w-4 h-4 mr-2" />
                {{ t('setting.duplicate') }}
              </DropdownMenuItem>
              <DropdownMenuItem v-if="!theme.isDefault" @click="handleAction('edit', theme)">
                <Pencil class="w-4 h-4 mr-2" />
                {{ t('setting.edit') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="!theme.isDefault"
                @click="handleAction('delete', theme)"
                class="text-red-600 focus:text-red-600"
              >
                <Trash2 class="w-4 h-4 mr-2" />
                {{ t('setting.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <!-- 选中标记 -->
        <div v-if="theme.id === selectedThemeId" class="theme-card__check">
          <Check class="w-5 h-5" />
        </div>
      </div>

      <!-- 新建主题卡片 -->
      <div class="theme-card theme-card--new" @click="handleNewTheme">
        <div class="theme-card__preview theme-card__preview--new">
          <Plus class="w-6 h-6" />
        </div>
        <div class="theme-card__info">
          <div class="theme-card__name">{{ t('setting.newTheme') }}</div>
        </div>
      </div>
    </div>

    <!-- 其他设置 -->
    <Form class="settings-form space-y-6">
      <FormField :label="t('setting.contentTheme')" name="contentTheme">
        <Select v-model="settings.contentTheme" @update:model-value="handleContentThemeChange">
          <SelectTrigger class="w-[180px]">
            <SelectValue :placeholder="t('setting.selectContentTheme')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{{ t('setting.auto') }}</SelectItem>
            <SelectItem v-for="item in contentThemes" :key="item.value" :value="item.value">
              {{ item.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField :label="t('setting.codeTheme')" name="codeTheme">
        <Select v-model="settings.codeTheme" @update:model-value="handleCodeThemeChange">
          <SelectTrigger class="w-[180px]">
            <SelectValue :placeholder="t('setting.selectCodeTheme')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{{ t('setting.auto') }}</SelectItem>
            <SelectItem v-for="item in codeThemes" :key="item" :value="item">
              {{ item }}
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField :label="t('setting.lineNumber')" name="lineNumber">
        <div class="flex items-center gap-2">
          <Switch
            :checked="settings.lineNumber"
            @update:checked="(val: boolean) => { settings.lineNumber = val; saveSetting('lineNumber', val) }"
          />
          <span class="text-sm text-muted-foreground">{{ settings.lineNumber ? t('setting.enabled') : t('setting.disabled') }}</span>
        </div>
      </FormField>
    </Form>

    <!-- 新建/编辑主题对话框 -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{{ editingTheme ? t('setting.editTheme') : t('setting.newTheme') }}</DialogTitle>
        </DialogHeader>
        <Form class="space-y-4">
          <FormField :label="t('setting.themeName')" name="themeName">
            <Input
              v-model="themeForm.name"
              :placeholder="t('setting.themeNamePlaceholder')"
              @input="handleNameInput"
            />
          </FormField>
          <FormField :label="t('setting.themeColor')" name="themeColor">
            <el-color-picker
              v-model="themeForm.themeColor"
              :predefine="predefineColors"
              show-alpha
              @change="handleColorChange"
            />
          </FormField>
        </Form>
        <DialogFooter>
          <Button variant="ghost" @click="showCreateDialog = false">{{ t('setting.cancel') }}</Button>
          <Button @click="saveTheme">{{ t('setting.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreVertical, Plus, Check, Copy, Pencil, Trash2 } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Form, FormField } from '@renderer/components/ui/form'
import { Switch } from '@renderer/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { ColorPicker } from '@renderer/components/ui/color-picker'
import { settings, setSetting, getSetting } from '../../utils/settings.js'
import eventBus from '../../utils/event-bus.js'
import {
  predefineColors,
  presetThemes,
  contentThemes,
  codeThemes,
  customTheme,
  lightTheme,
  darkTheme
} from '../../utils/themes.js'
import { themeState } from '../../utils/themes.js'

const { t } = useI18n()

// 主题配置类型
interface ThemeConfig {
  id: string
  name: string
  type: 'light' | 'dark' | 'sync' | 'sync-color' | 'custom'
  themeColor?: string
  isDefault: boolean
}

const selectedThemeId = ref<string | null>(null)
const showCreateDialog = ref(false)
const editingTheme = ref<ThemeConfig | null>(null)
const themeForm = ref({ name: '', themeColor: '#ffffff' })
const osThemeInfo = ref<{ mode: 'dark' | 'light'; accentColor?: string } | null>(null)
const nameManuallyEdited = ref(false) // 标记用户是否手动编辑过名称

// 颜色编辑相关状态
const editingColorMap = ref<Record<string, string>>({}) // 每个主题的临时颜色值
const originalColorMap = ref<Record<string, string>>({}) // 每个主题的原始颜色值（用于取消）
const colorPickerVisibleMap = ref<Record<string, boolean>>({}) // 颜色选择器的显示状态
const colorConfirmedMap = ref<Record<string, boolean>>({}) // 标记颜色是否已通过 change 事件确认

// 获取系统主题信息
const fetchOsThemeInfo = async () => {
  try {
    const messageBridge = (await import('../../bridge/message-bridge')).default
    if (!messageBridge.getIpc()?.invoke) {
      // Web 环境
      const mode =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
      osThemeInfo.value = { mode, accentColor: undefined }
      return
    }

    const result = (await messageBridge.invoke('get-os-theme-info')) as {
        mode: 'dark' | 'light'
        accentColor?: string
      }
    // 创建新对象以确保响应式更新
    osThemeInfo.value = { ...result }
  } catch (e) {
    console.error('获取系统主题信息失败:', e)
    osThemeInfo.value = { mode: 'light', accentColor: undefined }
  }
}

// 缓存默认主题配置（避免重复计算）
const defaultThemesCache = computed(() => {
  const baseThemes: ThemeConfig[] = [
    {
      id: 'sync',
      name: t('setting.themeSync'),
      type: 'sync',
      isDefault: true
    },
    {
      id: 'sync-color',
      name: t('setting.themeSyncColor'),
      type: 'sync-color',
      isDefault: true
    },
    {
      id: 'light',
      name: t('setting.themeLight'),
      type: 'light',
      isDefault: true
    },
    {
      id: 'dark',
      name: t('setting.themeDark'),
      type: 'dark',
      isDefault: true
    }
  ]

  // 添加预设主题
  const presetThemeConfigs: ThemeConfig[] = presetThemes.map((preset, index) => ({
    id: `preset-${index}`,
    name: t(`setting.${preset.nameKey}`),
    type: 'custom' as const,
    themeColor: preset.color,
    isDefault: true
  }))

  return [...baseThemes, ...presetThemeConfigs]
})

// 主题列表
const themeList = computed(() => {
  const defaultThemes = defaultThemesCache.value
  const customThemes = (settings.themeConfigs || []).map((config: any) => ({
    ...config,
    type: 'custom' as const
  }))
  return [...defaultThemes, ...customThemes]
})

// 将颜色转换为 HEX 格式（处理 rgba 等格式）
const colorToHex = (color: string): string => {
  if (!color) return '#ffffff'

  // 如果已经是 hex 格式
  if (color.startsWith('#')) {
    // 处理 rgba hex 格式，如 #ffffff80
    if (color.length === 9) {
      return color.slice(0, 7)
    }
    return color
  }

  // 如果是 rgba 格式
  if (color.startsWith('rgba') || color.startsWith('rgb')) {
    const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      const r = parseInt(match[1], 10)
      const g = parseInt(match[2], 10)
      const b = parseInt(match[3], 10)
      return `#${[r, g, b]
        .map((x) => {
          const hex = x.toString(16)
          return hex.length === 1 ? '0' + hex : hex
        })
        .join('')}`
    }
  }

  return color
}

// 获取正在编辑的颜色（如果有）
const getEditingColor = (theme: ThemeConfig): string => {
  if (theme.type === 'custom') {
    // 如果正在编辑，使用临时颜色值
    if (editingColorMap.value[theme.id]) {
      return colorToHex(editingColorMap.value[theme.id])
    }
    return colorToHex(theme.themeColor || '#ffffff')
  }
  return ''
}

// 获取主题预览颜色
const getThemePreviewColor = (theme: ThemeConfig): string => {
  if (theme.type === 'custom') {
    // 如果正在编辑，使用临时颜色值
    if (editingColorMap.value[theme.id]) {
      return colorToHex(editingColorMap.value[theme.id])
    }
    return colorToHex(theme.themeColor || '#ffffff')
  }
  if (theme.type === 'sync-color' && osThemeInfo.value?.accentColor) {
    return colorToHex(osThemeInfo.value.accentColor)
  }
  if (theme.type === 'light') {
    return '#ffffff'
  }
  if (theme.type === 'dark') {
    return '#2c2c2c'
  }
  if (theme.type === 'sync') {
    return osThemeInfo.value?.mode === 'dark' ? '#2c2c2c' : '#ffffff'
  }
  return '#ffffff'
}

// 处理颜色变化
const handleColorChange = (color: string) => {
  if (!nameManuallyEdited.value && !editingTheme.value) {
    // 如果是新建主题且用户没有手动编辑名称，自动更新为颜色值
    themeForm.value.name = colorToHex(color).toUpperCase()
  }
}

// 处理名称输入
const handleNameInput = () => {
  nameManuallyEdited.value = true
}

// 处理新建主题
const handleNewTheme = () => {
  editingTheme.value = null
  nameManuallyEdited.value = false
  // 初始名称为时间戳
  themeForm.value = {
    name: Date.now().toString(),
    themeColor: '#ffffff'
  }
  showCreateDialog.value = true
}

// 注意：已移除 active-change 处理，只在 change 时应用主题以避免卡顿

// 处理颜色选择器确定（change 事件在用户点击确定按钮时触发）
const handleColorPickerChange = async (theme: ThemeConfig, color: string | null) => {
  if (!color || theme.type !== 'custom' || theme.isDefault) return // 预设主题不能编辑

  // 立即标记已确认，防止 visible-change 的取消逻辑执行
  colorConfirmedMap.value[theme.id] = true

  // 更新临时颜色值
  editingColorMap.value[theme.id] = color

  // 直接保存并应用主题（用户点击了确定按钮）
  await confirmColorEdit(theme, color)
}

// 处理颜色选择器显示/隐藏
const handleColorPickerVisibleChange = (theme: ThemeConfig, visible: boolean) => {
  if (theme.isDefault) return // 预设主题不能编辑

  colorPickerVisibleMap.value[theme.id] = visible

  // 如果颜色选择器打开了，保存原始颜色并重置确认标记
  if (visible && theme.type === 'custom') {
    if (!originalColorMap.value[theme.id]) {
      originalColorMap.value[theme.id] = colorToHex(theme.themeColor || '#ffffff')
    }
    editingColorMap.value[theme.id] = originalColorMap.value[theme.id]
    colorConfirmedMap.value[theme.id] = false
  }

  // 如果颜色选择器关闭了，且没有通过 change 事件确认（用户点击了取消或关闭）
  if (!visible && theme.type === 'custom' && !theme.isDefault) {
    // 延迟检查，因为 change 事件可能在 visible-change 之后触发
    setTimeout(() => {
      // 如果颜色选择器已关闭，且没有确认标记，说明用户取消了
      if (!colorPickerVisibleMap.value[theme.id] && !colorConfirmedMap.value[theme.id]) {
        cancelColorEdit(theme)
      }
      // 重置确认标记（为下次编辑做准备）
      if (!colorPickerVisibleMap.value[theme.id]) {
        colorConfirmedMap.value[theme.id] = false
      }
    }, 300) // 延迟 300ms，确保 change 事件有时间触发
  }
}

// 注意：已移除实时预览功能，只在 change 时应用主题以避免卡顿

// 确认颜色编辑（用户点击了颜色选择器的确定按钮）
const confirmColorEdit = async (theme: ThemeConfig, color: string | null) => {
  if (theme.type !== 'custom' || theme.isDefault) return // 预设主题不能编辑

  const newColor = colorToHex(
    color || editingColorMap.value[theme.id] || theme.themeColor || '#ffffff'
  )

  // 更新主题配置 - 只保存可序列化的数据
  const configs: ThemeConfig[] = (settings.themeConfigs || []) as ThemeConfig[]
  const index = configs.findIndex((config) => config.id === theme.id)

  if (index >= 0) {
    // 创建一个新的配置对象，只包含可序列化的字段
    const updatedConfig: ThemeConfig = {
      id: configs[index].id,
      name: configs[index].name,
      type: 'custom',
      themeColor: newColor,
      isDefault: false
    }

    configs[index] = updatedConfig

    // 深拷贝配置数组，确保可序列化
    const serializableConfigs = configs.map((config) => ({
      id: config.id,
      name: config.name,
      type: config.type,
      themeColor: config.themeColor,
      isDefault: config.isDefault
    }))

    await setSetting('themeConfigs', serializableConfigs)
    ;(settings as any).themeConfigs = serializableConfigs

    // 应用主题（持久化）
    await setSetting('globalTheme', 'custom')
    await setSetting('customThemeColor', newColor)
    await setSetting('selectedThemeId', theme.id)
    selectedThemeId.value = theme.id

    // 同步主题（跨进程）
    eventBus.emit('sync-theme')
    eventBus.emit('theme-changed')
    // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast（上面已经emit了sync-theme）
  }

  // 清除编辑状态
  delete editingColorMap.value[theme.id]
  delete originalColorMap.value[theme.id]
  delete colorPickerVisibleMap.value[theme.id]
  delete colorConfirmedMap.value[theme.id]

  ElMessage.success(t('setting.saveSuccess'))
}

// 取消颜色编辑（用户点击了颜色选择器的取消按钮或关闭了选择器）
const cancelColorEdit = async (theme: ThemeConfig) => {
  if (theme.type !== 'custom' || theme.isDefault) return // 预设主题不能编辑

  // 恢复原始颜色
  const originalColor = originalColorMap.value[theme.id]
  if (originalColor) {
    // 恢复 editingColorMap（v-model 绑定的值）
    const originalColorHex = colorToHex(originalColor)
    editingColorMap.value[theme.id] = originalColorHex

    // 恢复主题（持久化）
    await setSetting('globalTheme', 'custom')
    await setSetting('customThemeColor', originalColorHex)

    // 恢复 settings 对象中的临时值
    settings.customThemeColor = originalColorHex
    settings.globalTheme = 'custom'

    // 同步主题（跨进程）
    eventBus.emit('sync-theme')
    eventBus.emit('theme-changed')
    // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast（上面已经emit了sync-theme）
  }

  // 清除编辑状态
  delete editingColorMap.value[theme.id]
  delete originalColorMap.value[theme.id]
  delete colorPickerVisibleMap.value[theme.id]
  delete colorConfirmedMap.value[theme.id]
}

// 选择主题
const selectTheme = async (theme: ThemeConfig) => {
  // 如果正在编辑颜色，先取消编辑（恢复原始颜色）
  if (
    theme.type === 'custom' &&
    editingColorMap.value[theme.id] &&
    originalColorMap.value[theme.id]
  ) {
    await cancelColorEdit(theme)
  }

  selectedThemeId.value = theme.id
  await setSetting('selectedThemeId', theme.id)

  // 根据主题类型设置主题
  if (theme.type === 'light') {
    await setSetting('globalTheme', 'light')
  } else if (theme.type === 'dark') {
    await setSetting('globalTheme', 'dark')
  } else if (theme.type === 'sync') {
    await setSetting('globalTheme', 'sync')
  } else if (theme.type === 'sync-color') {
    await setSetting('globalTheme', 'sync-color')
  } else if (theme.type === 'custom' && theme.themeColor) {
    await setSetting('globalTheme', 'custom')
    // 确保使用 HEX 格式
    const themeColorHex = colorToHex(theme.themeColor)
    await setSetting('customThemeColor', themeColorHex)
  }

  eventBus.emit('sync-theme')
  eventBus.emit('theme-changed')
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast（上面已经emit了sync-theme）
}

// 处理操作
const handleAction = async (command: string, theme: ThemeConfig) => {
  if (command === 'duplicate') {
    editingTheme.value = null
    nameManuallyEdited.value = false
    themeForm.value = {
      name: `${theme.name} ${t('setting.copy')}`,
      themeColor: theme.themeColor || '#ffffff'
    }
    showCreateDialog.value = true
  } else if (command === 'edit') {
    editingTheme.value = theme
    nameManuallyEdited.value = true // 编辑时标记为已手动编辑
    themeForm.value = {
      name: theme.name,
      themeColor: theme.themeColor || '#ffffff'
    }
    showCreateDialog.value = true
  } else if (command === 'delete') {
    try {
      await ElMessageBox.confirm(
        t('setting.deleteThemeConfirm', { name: theme.name }),
        t('setting.deleteTheme'),
        {
          type: 'warning',
          confirmButtonText: t('setting.delete'),
          cancelButtonText: t('setting.cancel')
        }
      )

      const configs = (settings.themeConfigs || []).filter((config: any) => config.id !== theme.id)

      // 深拷贝配置数组，确保可序列化
      const serializableConfigs = configs.map((config: any) => ({
        id: config.id,
        name: config.name,
        type: config.type,
        themeColor: config.themeColor,
        isDefault: config.isDefault
      }))

      await setSetting('themeConfigs', serializableConfigs)
      ;(settings as any).themeConfigs = serializableConfigs

      // 清除编辑状态
      delete editingColorMap.value[theme.id]
      delete originalColorMap.value[theme.id]
      delete colorPickerVisibleMap.value[theme.id]
      delete colorConfirmedMap.value[theme.id]

      // 如果删除的是当前选中的主题，切换到默认主题
      if (selectedThemeId.value === theme.id) {
        const defaultThemes = defaultThemesCache.value
        if (defaultThemes.length > 0) {
          await selectTheme(defaultThemes[0])
        }
      }

      ElMessage.success(t('setting.deleteSuccess'))
    } catch {
      // 用户取消
    }
  }
}

// 保存主题
const saveTheme = async () => {
  // 确保名称不为空
  if (!themeForm.value.name.trim()) {
    // 如果没有名称，使用颜色值
    themeForm.value.name = colorToHex(themeForm.value.themeColor).toUpperCase()
  }

  const configs: ThemeConfig[] = (settings.themeConfigs || []) as ThemeConfig[]

  // 确保主题色是 HEX 格式
  const themeColorHex = colorToHex(themeForm.value.themeColor)

  if (editingTheme.value) {
    // 编辑
    const index = configs.findIndex((config) => config.id === editingTheme.value!.id)
    if (index >= 0) {
      configs[index] = {
        ...configs[index],
        name: themeForm.value.name.trim(),
        themeColor: themeColorHex
      }
    }
  } else {
    // 新建
    const newThemeId = `custom-${Date.now()}`
    const newTheme: ThemeConfig = {
      id: newThemeId,
      name: themeForm.value.name.trim() || themeColorHex.toUpperCase(),
      type: 'custom',
      themeColor: themeColorHex,
      isDefault: false
    }
    configs.push(newTheme)

    // 为新主题设置颜色选择器绑定值
    editingColorMap.value[newThemeId] = themeColorHex
  }

  // 深拷贝配置数组，确保可序列化
  const serializableConfigs = configs.map((config) => ({
    id: config.id,
    name: config.name,
    type: config.type,
    themeColor: config.themeColor,
    isDefault: config.isDefault
  }))

  await setSetting('themeConfigs', serializableConfigs)
  ;(settings as any).themeConfigs = serializableConfigs

  // 更新颜色选择器绑定值（编辑模式）
  if (editingTheme.value) {
    editingColorMap.value[editingTheme.value.id] = themeColorHex
  }

  showCreateDialog.value = false
  editingTheme.value = null
  nameManuallyEdited.value = false
  themeForm.value = { name: '', themeColor: '#ffffff' }

  ElMessage.success(t('setting.saveSuccess'))
}

// 保存设置
const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value)
}

const handleContentThemeChange = () => {
  saveSetting('contentTheme', settings.contentTheme)
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('sync-editor-theme', {})
}

const handleCodeThemeChange = () => {
  saveSetting('codeTheme', settings.codeTheme)
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('sync-editor-theme', {})
}

// 初始化
onMounted(async () => {
  await fetchOsThemeInfo()

  // 确保 themeConfigs 已初始化
  if (!settings.themeConfigs) {
    settings.themeConfigs = []
  }

  // 初始化自定义主题和预设主题的颜色选择器绑定值
  const userCustomThemes = (settings.themeConfigs || []) as ThemeConfig[]
  userCustomThemes.forEach((theme) => {
    if (theme.type === 'custom' && theme.themeColor) {
      editingColorMap.value[theme.id] = colorToHex(theme.themeColor)
    }
  })

  // 初始化预设主题的颜色选择器绑定值
  presetThemes.forEach((preset, index) => {
    const presetId = `preset-${index}`
    editingColorMap.value[presetId] = colorToHex(preset.color)
  })

  // 加载选中的主题ID
  const savedThemeId = await getSetting('selectedThemeId')
  if (savedThemeId) {
    selectedThemeId.value = savedThemeId
  } else {
    // 如果没有保存的主题ID，根据 globalTheme 设置
    const globalTheme = (await getSetting('globalTheme')) || 'light'
    if (globalTheme === 'sync') {
      selectedThemeId.value = 'sync'
    } else if (globalTheme === 'sync-color') {
      selectedThemeId.value = 'sync-color'
    } else if (globalTheme === 'light') {
      selectedThemeId.value = 'light'
    } else if (globalTheme === 'dark') {
      selectedThemeId.value = 'dark'
    } else if (globalTheme === 'custom') {
      // 查找自定义主题或预设主题
      const allThemes = themeList.value
      const customTheme = allThemes.find(
        (t) => t.type === 'custom' && t.id !== 'sync' && t.id !== 'sync-color'
      )
      if (customTheme) {
        selectedThemeId.value = customTheme.id
      } else if (userCustomThemes.length > 0) {
        selectedThemeId.value = userCustomThemes[0].id
      } else {
        selectedThemeId.value = 'light'
      }
    } else {
      selectedThemeId.value = 'light'
    }
  }

  // 初始化预设主题的颜色选择器绑定值
  presetThemes.forEach((preset, index) => {
    const presetId = `preset-${index}`
    editingColorMap.value[presetId] = colorToHex(preset.color)
  })

  // 监听系统主题变化（亮暗色）
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', fetchOsThemeInfo)
  }

  // 监听系统主题变化事件（来自主进程，包括颜色变化）
  const messageBridge = (await import('../../bridge/message-bridge')).default
  if (messageBridge.getIpc()?.on) {
    messageBridge.on('os-theme-changed', async () => {
      await fetchOsThemeInfo()
    })
  }
})
</script>

<style scoped>
.theme-settings {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.theme-cards-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
  max-height: 500px;
  overflow-y: auto;
  padding-right: 8px;
  padding-bottom: 8px;
}

.theme-cards-container::-webkit-scrollbar {
  width: 8px;
}

.theme-cards-container::-webkit-scrollbar-track {
  background: v-bind('themeState.currentTheme.background2nd');
  border-radius: 4px;
}

.theme-cards-container::-webkit-scrollbar-thumb {
  background: v-bind('themeState.currentTheme.borderColor');
  border-radius: 4px;
}

.theme-cards-container::-webkit-scrollbar-thumb:hover {
  background: v-bind('themeState.currentTheme.primaryColor');
}

.theme-card {
  position: relative;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border: 2px solid;
  border-color: v-bind('themeState.currentTheme.borderColor + "40"');
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  min-height: 180px;
}

.theme-card:hover {
  border-color: v-bind('themeState.currentTheme.primaryColor');
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.theme-card.is-selected {
  border-color: v-bind('themeState.currentTheme.primaryColor');
  box-shadow: 0 0 0 2px v-bind('themeState.currentTheme.primaryColor + "30"');
}

.theme-card.is-default::after {
  content: '';
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  background-color: v-bind('themeState.currentTheme.primaryColor');
  border-radius: 50%;
}

.theme-card--new {
  border-style: dashed;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}

.theme-card__preview {
  width: 100%;
  height: 100px;
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

.theme-card__preview--new {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor2');
  font-size: 32px;
}

.theme-card__preview--sync {
  background-color: v-bind('themeState.currentTheme.background2nd');
  border: 2px dashed v-bind('themeState.currentTheme.borderColor');
  display: flex;
  align-items: center;
  justify-content: center;
  color: v-bind('themeState.currentTheme.textColor2');
  font-size: 12px;
  text-align: center;
  box-sizing: border-box;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.theme-card__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-card__name {
  font-size: 14px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.theme-card__color-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-card__color {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
  flex: 1;
}

.theme-card__color-wrapper :deep(.el-color-picker) {
  width: 24px;
  height: 24px;
}

.theme-card__color-wrapper :deep(.el-color-picker__trigger) {
  width: 24px;
  height: 24px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 4px;
}

.theme-card__color--sync {
  font-style: italic;
}

.theme-card__actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}

.theme-card__check {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background-color: v-bind('themeState.currentTheme.primaryColor');
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
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
.settings-form :deep(.el-radio-group) {
  width: 100%;
  max-width: 100%;
}

/* shadcn DropdownMenu danger item style - handled via Tailwind classes */

@media (max-width: 640px) {
  .theme-cards-container {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
