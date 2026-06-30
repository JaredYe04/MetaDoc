<template>
  <ScrollArea class="new-document-scroll">
    <div class="new-document">
      <div class="new-document__header">
        <h1>{{ t('newDocument.title') }}</h1>
        <p>{{ t('newDocument.subtitle') }}</p>
      </div>

      <div class="new-document__formats">
        <RadioGroup v-model="selectedFormatId" class="flex format-group">
          <div
            class="format-group-inner inline-flex h-9 items-center justify-center rounded-lg p-1 text-muted-foreground"
            :style="{ backgroundColor: formatGroupBackground }"
          >
            <div v-for="format in formats" :key="format.id" class="flex items-center">
              <RadioGroupItem :value="format.id" :id="'format-' + format.id" class="sr-only peer" />
              <label
                :for="'format-' + format.id"
                class="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all cursor-pointer peer-data-[state=checked]:bg-background peer-data-[state=checked]:text-foreground peer-data-[state=checked]:shadow"
              >
                {{ formatLabel(format) }}
              </label>
            </div>
          </div>
        </RadioGroup>
        <p class="format-description">
          {{ formatDescription(currentFormat) }}
        </p>
      </div>

      <div class="new-document__templates">
        <h2>{{ t('newDocument.templateTitle') }}</h2>
        <ScrollArea class="template-grid-scroll">
          <div class="template-grid-wrapper" ref="templateGridWrapperRef">
            <div class="template-grid" :style="{ gridTemplateColumns: gridTemplateColumns }">
              <div
                v-for="template in currentTemplatesWithThumbs"
                :key="template.id"
                class="template-card"
                :class="{ active: template.id === selectedTemplateId }"
                @click="selectTemplate(template.id)"
                @dblclick="confirmTemplate(template.id)"
              >
                <DropdownMenu v-if="template.isUserTemplate && template.userTemplateId">
                  <DropdownMenuTrigger as-child>
                    <Button
                      class="template-card-thumb-menu-btn"
                      variant="ghost"
                      size="icon"
                      :aria-label="t('newDocument.templateThumbMenu')"
                      @click.stop
                    >
                      <MoreHorizontal :size="16" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" @click.stop>
                    <DropdownMenuItem @click="pickUserTemplateThumb(template.userTemplateId!)">
                      {{ t('newDocument.setTemplateThumb') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="template.userTemplateThumbnailSource === 'custom'"
                      @click="resetUserTemplateThumb(template.userTemplateId!)"
                    >
                      {{ t('newDocument.clearTemplateThumb') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="isSteamEnabled()"
                      @click="openWorkshopPublishForTemplate(template.userTemplateId!)"
                    >
                      {{ t('newDocument.publishWorkshop') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  v-if="template.isUserTemplate && template.userTemplateId"
                  class="template-card-delete-btn"
                  variant="ghost"
                  size="icon"
                  :aria-label="t('common.delete') || '删除'"
                  @click.stop="
                    deleteUserTemplate(template.userTemplateId!, templateLabel(template))
                  "
                >
                  <X :size="14" />
                </Button>
                <div class="template-card__image" :class="{ 'is-placeholder': !template.image }">
                  <img v-if="template.image" :src="template.image" :alt="templateLabel(template)" />
                  <div v-else class="template-card__preview">
                    <div class="preview-content">
                      <div
                        v-for="(line, idx) in getPreviewLines(template)"
                        :key="idx"
                        class="preview-line"
                        :class="{ 'is-heading': line.isHeading }"
                      >
                        {{ line.text }}
                      </div>
                    </div>
                    <div class="preview-divider" />
                  </div>
                </div>
                <div class="template-card__body">
                  <h3>{{ templateLabel(template) }}</h3>
                  <Tooltip v-if="templateDescription(template).trim().length > 0">
                    <TooltipTrigger as-child>
                      <p class="template-card__body-desc">
                        {{ templateDescription(template) }}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" class="max-w-sm whitespace-pre-wrap break-words">
                      {{ templateDescription(template) }}
                    </TooltipContent>
                  </Tooltip>
                  <p v-else class="template-card__body-desc" />
                </div>
                <div class="template-card__actions">
                  <Button
                    variant="default"
                    size="sm"
                    class="rounded-full"
                    @click.stop="confirmTemplate(template.id)"
                  >
                    {{ t('newDocument.useTemplate') }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useWorkspace } from '../stores/workspace'
import type { WorkspaceTabFormat } from '../stores/workspace'
import type { SupportedFormat, DocumentTemplate } from '../types/formats'
import { useI18n } from 'vue-i18n'
import { X, MoreHorizontal } from 'lucide-vue-next'
import { messageBox } from '@renderer/utils/messageBox'
import { Button } from '@renderer/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import messageBridge from '../bridge/message-bridge'
import { themeState, mixColors } from '../utils/themes'
import {
  clearUserTemplateThumbnailRemote,
  removeUserTemplate,
  setUserTemplateThumbnailFromFilePath
} from '../stores/user-templates'
import { openWorkshopPublishDocumentDialog } from '../utils/workshop-publish-document-dialog'
import { isSteamEnabled } from '@common/build-env'

/** 根据主色亮度返回在按钮上可读的文字色（深色主色用白字，浅色主色用深字） */
function getContrastTextColor(hex: string | undefined) {
  if (!hex || typeof hex !== 'string') return '#ffffff'
  const h = hex.replace(/^#/, '')
  if (h.length !== 6 && h.length !== 8) return '#ffffff'
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 0.5 ? '#111111' : '#ffffff'
}

const props = defineProps<{
  tabId: string
  active: boolean
}>()

const workspace = useWorkspace()
const { t } = useI18n()

const primaryButtonBg = computed(() => themeState.currentTheme?.primaryColor || '#000000')
const primaryButtonText = computed(() =>
  getContrastTextColor(themeState.currentTheme?.primaryColor)
)

/** 格式选择器容器背景：与自定义主题色混色，深色模式=黑灰+主题色，浅色模式=浅白+主题色 */
const formatGroupBackground = computed(() => {
  const primary = themeState.currentTheme?.themeColor
  const isDark = themeState.currentTheme?.type === 'dark'
  const base = isDark ? '#1a1a1a' : '#f0f0f0'
  return mixColors(primary, base, 0.6)
})

const formats = computed<SupportedFormat[]>(
  () => (workspace.supportedFormats as { value: SupportedFormat[] }).value ?? []
)
const selectedFormatId = ref<string>('')
const selectedTemplateId = ref<string>('')

const currentFormat = computed(() =>
  formats.value.find((format) => format.id === selectedFormatId.value)
)

const currentTemplates = computed<DocumentTemplate[]>(() => currentFormat.value?.templates ?? [])

/** 用户模板缩略图 data URL（主进程文件） */
const userTemplateThumbUrls = ref<Record<string, string>>({})

const currentTemplatesWithThumbs = computed<DocumentTemplate[]>(() => {
  const list = currentTemplates.value
  return list.map((tm) => {
    if (!tm.isUserTemplate || !tm.userTemplateId) return tm
    const url = userTemplateThumbUrls.value[tm.userTemplateId]
    if (url) {
      return { ...tm, image: url }
    }
    return tm
  })
})

async function loadUserTemplateThumbsForCurrent(): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).electron?.ipcRenderer) return
  const ids = new Set<string>()
  for (const tm of currentTemplates.value) {
    if (tm.isUserTemplate && tm.userTemplateId) ids.add(tm.userTemplateId)
  }
  const next: Record<string, string> = { ...userTemplateThumbUrls.value }
  for (const id of ids) {
    if (next[id]) continue
    try {
      const r = await messageBridge.invoke('user-templates:get-thumb-data-url', { id })
      if (r?.ok && typeof r.data === 'string' && r.data.length) {
        next[id] = r.data
      }
    } catch {
      /* ignore */
    }
  }
  userTemplateThumbUrls.value = next
}

watch(
  () =>
    currentTemplates.value
      .filter((t) => t.isUserTemplate && t.userTemplateId)
      .map((t) => t.userTemplateId as string)
      .join(','),
  () => {
    void loadUserTemplateThumbsForCurrent()
  },
  { immediate: true }
)

async function pickUserTemplateThumb(userTemplateId: string) {
  try {
    const pick = (await messageBridge.invoke('show-open-dialog', {
      title: t('newDocument.setTemplateThumbDialogTitle'),
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })) as { canceled?: boolean; filePaths?: string[] }
    if (pick?.canceled || !pick?.filePaths?.length) return
    await setUserTemplateThumbnailFromFilePath(userTemplateId, pick.filePaths[0])
    delete userTemplateThumbUrls.value[userTemplateId]
    userTemplateThumbUrls.value = { ...userTemplateThumbUrls.value }
    await loadUserTemplateThumbsForCurrent()
  } catch (e) {
    console.error(e)
  }
}

async function resetUserTemplateThumb(userTemplateId: string) {
  try {
    await clearUserTemplateThumbnailRemote(userTemplateId)
    delete userTemplateThumbUrls.value[userTemplateId]
    userTemplateThumbUrls.value = { ...userTemplateThumbUrls.value }
  } catch (e) {
    console.error(e)
  }
}

function openWorkshopPublishForTemplate(userTemplateId: string) {
  openWorkshopPublishDocumentDialog({ userTemplateId })
}

// 监听模板网格容器宽度，动态计算列数，尽量占满一行并减少换行
const templateGridWrapperRef = ref<HTMLElement | null>(null)
const gridContainerWidth = ref<number>(0)
let templateGridResizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (templateGridWrapperRef.value) {
    gridContainerWidth.value = templateGridWrapperRef.value.clientWidth
    templateGridResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        gridContainerWidth.value = entry.contentRect.width
      }
    })
    templateGridResizeObserver.observe(templateGridWrapperRef.value)
  }
})

onBeforeUnmount(() => {
  if (templateGridResizeObserver && templateGridWrapperRef.value) {
    templateGridResizeObserver.unobserve(templateGridWrapperRef.value)
    templateGridResizeObserver.disconnect()
    templateGridResizeObserver = null
  }
})

const gridTemplateColumns = computed<string>(() => {
  const width = gridContainerWidth.value
  const itemCount = currentTemplates.value.length || 1
  const cardMin = 220 // 卡片最小理想宽度
  const cardMax = 360 // 卡片最大理想宽度
  if (!width) {
    return `repeat(auto-fit, minmax(${cardMin}px, 1fr))`
  }
  // 在 [ceil(width/cardMax), floor(width/cardMin)] 范围内取值，
  // 同时不超过 itemCount，优先更多列（减少换行），并让每个单元宽度处在 [cardMin, cardMax]。
  const minColsByMax = Math.max(1, Math.ceil(width / cardMax))
  const maxColsByMin = Math.max(1, Math.floor(width / cardMin))
  const cols = Math.max(minColsByMax, Math.min(itemCount, maxColsByMin))
  return `repeat(${cols}, 1fr)`
})

const translate = (key?: string, fallback = '') => {
  if (!key) return fallback
  const result = t(key)
  return result !== key ? result : fallback || key
}

watch(
  () => props.active,
  (active) => {
    if (active && !selectedFormatId.value) {
      selectedFormatId.value = formats.value[0]?.id ?? ''
    }
  },
  { immediate: true }
)

watch(
  selectedFormatId,
  (formatId) => {
    const format = formats.value.find((item) => item.id === formatId)
    if (!format) return
    const template =
      format.templates.find((tpl) => tpl.id === format.defaultTemplateId) ?? format.templates[0]
    selectedTemplateId.value = template?.id ?? ''
  },
  { immediate: true }
)

const formatLabel = (format?: SupportedFormat) =>
  format ? translate(format.labelKey, format.label ?? '') : ''

const formatDescription = (format?: SupportedFormat) =>
  format ? translate(format.descriptionKey, format.description ?? '') : ''

const templateLabel = (template: DocumentTemplate) => translate(template.labelKey, template.label)

const templateDescription = (template: DocumentTemplate) =>
  translate(template.descriptionKey, template.description ?? '')

function getPreviewLines(template: DocumentTemplate): Array<{ text: string; isHeading: boolean }> {
  const content = template.content || ''
  if (!content.trim()) {
    return [{ text: t('newDocument.emptyTemplate', '空白文档'), isHeading: false }]
  }
  const lines = content.split('\n').filter((l) => l.trim())

  // LaTeX 标题命令
  const latexHeadingCmds =
    /^(\\(title|section|chapter|subsection|subsubsection|paragraph))\{([^}]*)\}/
  // LaTeX 环境开始/结束
  const latexEnv = /^\\(begin|end)\{([^}]*)\}/
  // LaTeX 注释
  const latexComment = /^%/

  const result: Array<{ text: string; isHeading: boolean }> = []
  let inDocumentEnv = false

  for (const line of lines) {
    if (result.length >= 6) break

    const trimmed = line.trim()

    // 跳过空行
    if (!trimmed) continue

    // Markdown 标题
    if (trimmed.startsWith('#')) {
      const text = trimmed
        .replace(/^#+\s*/, '')
        .replace(/\*\*|\*|`|\[|\]|\(|\)/g, '')
        .slice(0, 28)
      result.push({ text: text || '...', isHeading: true })
      continue
    }

    // LaTeX 处理
    if (trimmed.startsWith('\\')) {
      // 检测 \begin{document}
      const beginMatch = trimmed.match(/^\\begin\{document\}/)
      if (beginMatch) {
        inDocumentEnv = true
        continue
      }
      // 检测 \end{document}
      const endMatch = trimmed.match(/^\\end\{document\}/)
      if (endMatch) break

      // 跳过其他环境命令
      if (latexEnv.test(trimmed)) continue

      // 检测标题命令
      const headingMatch = trimmed.match(latexHeadingCmds)
      if (headingMatch) {
        const text = headingMatch[3].slice(0, 28)
        result.push({ text: text || '...', isHeading: true })
        continue
      }

      // 跳过其他命令
      continue
    }

    // 跳过 LaTeX 注释
    if (latexComment.test(trimmed)) continue

    // 跳过导言区内容（在 document 环境之前）
    if (!inDocumentEnv && trimmed.startsWith('\\')) continue

    // 普通内容行
    const text = trimmed.replace(/\*\*|\*|`|\[|\]|\(|\)/g, '').slice(0, 28)
    result.push({ text: text || '...', isHeading: false })
  }

  return result.length > 0
    ? result
    : [{ text: t('newDocument.emptyTemplate', '空白文档'), isHeading: false }]
}

function selectTemplate(templateId: string) {
  selectedTemplateId.value = templateId
}

async function deleteUserTemplate(userTemplateId: string, templateName?: string) {
  try {
    await messageBox.confirm(
      t('newDocument.removeTemplateConfirm', { name: templateName ?? '' }),
      t('newDocument.removeTemplateTitle'),
      {
        confirmButtonText: t('messageBox.confirm'),
        cancelButtonText: t('messageBox.cancel'),
        type: 'warning'
      }
    )
  } catch {
    return
  }
  await removeUserTemplate(userTemplateId)
  if (selectedTemplateId.value === userTemplateId) {
    const format = currentFormat.value
    const rest = format?.templates.filter((t) => t.userTemplateId !== userTemplateId) ?? []
    selectedTemplateId.value = rest[0]?.id ?? format?.defaultTemplateId ?? ''
  }
}

function confirmTemplate(templateId?: string) {
  const formatId = selectedFormatId.value
  const template = templateId ?? selectedTemplateId.value
  if (!props.tabId || !formatId || !template) return
  workspace.initializeDocumentFromTemplate(
    props.tabId,
    formatId as WorkspaceTabFormat,
    template,
    'editor' // 指定跳转到 Editor 视图
  )
}
</script>

<style scoped>
.new-document {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  height: 100%;
  overflow: hidden;
  /* 设置主题背景色 */
  background-color: v-bind('themeState.currentTheme.background');
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.new-document-scroll {
  height: 100%;
}

.new-document__header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.new-document__header p {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
}

.new-document__formats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.format-group {
  align-self: flex-start;
}

.format-description {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.new-document__templates h2 {
  margin: 0 0 12px;
  font-size: 18px;
}

.new-document__templates {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.template-grid-scroll {
  flex: 1;
  min-height: 0;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.template-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s ease;
  background-color: v-bind('themeState.currentTheme.background');
  min-height: 0;
}

/* 叠在整块内容（含 __actions 的毛玻璃层）之上，避免底角描边被盖住 */
.template-card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  box-sizing: border-box;
  border-radius: inherit;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  transition: border-color 0.2s ease;
}

.template-card-thumb-menu-btn {
  position: absolute;
  top: 8px;
  right: 40px;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.05s ease;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.3)"') !important;
}
.template-card:hover .template-card-thumb-menu-btn {
  opacity: 0.5;
}
.template-card-thumb-menu-btn:hover {
  opacity: 1 !important;
}

.template-card-delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.05s ease;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.3)"') !important;
}
.template-card:hover .template-card-delete-btn {
  opacity: 0.5;
}
.template-card-delete-btn:hover {
  opacity: 1 !important;
}

.template-card:hover {
  box-shadow: 0 6px 18px v-bind('themeState.currentTheme.primaryColor + "15"');
}

.template-card:hover::before {
  border-color: v-bind('themeState.currentTheme.primaryColor + "80"');
}

.template-card.active {
  box-shadow: 0 4px 16px v-bind('themeState.currentTheme.primaryColor + "18"');
}

.template-card.active::before {
  border-color: v-bind('themeState.currentTheme.primaryColor');
}

.template-card__image {
  position: relative;
  padding-top: 60%;
  background: linear-gradient(
    135deg,
    v-bind('themeState.currentTheme.primaryColor + "1A"'),
    v-bind('themeState.currentTheme.primaryColor + "0D"')
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

.template-card__image img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.template-card__image.is-placeholder {
  background: linear-gradient(
    135deg,
    v-bind('themeState.currentTheme.secondaryColor + "26"'),
    v-bind('themeState.currentTheme.secondaryColor + "0D"')
  );
}

.template-card__preview {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  padding: 12px;
  background: v-bind('themeState.currentTheme.background');
  overflow: hidden;
}

.preview-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: calc(100% - 12px);
  overflow: hidden;
}

.preview-divider {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    v-bind('themeState.currentTheme.primaryColor + "40"'),
    transparent
  );
}

.preview-line {
  font-size: 10px;
  line-height: 1.4;
  font-family: var(--font-family-preview);
  color: v-bind('themeState.currentTheme.textColor2');
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-line.is-heading {
  font-size: 11px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.primaryColor');
}

.template-card__body {
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: linear-gradient(
    180deg,
    v-bind('themeState.currentTheme.background + "F0"'),
    v-bind('themeState.currentTheme.background + "E6"')
  );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.template-card__body h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.template-card__body-desc {
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor2');
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-card__actions {
  padding: 0 16px 16px;
  background: linear-gradient(
    180deg,
    v-bind('themeState.currentTheme.background + "E6"'),
    v-bind('themeState.currentTheme.background + "F5"')
  );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* 深色模式下避免按钮白底白字：强制使用主题主色与对比文字色 */
.template-card__actions .rounded-full {
  background-color: v-bind('primaryButtonBg') !important;
  color: v-bind('primaryButtonText') !important;
  border-color: v-bind('primaryButtonBg');
}
.template-card__actions .rounded-full:hover {
  filter: brightness(1.1);
}
.template-card__actions .rounded-full:active {
  filter: brightness(0.95);
}

.template-grid-wrapper {
  width: 100%;
}
</style>
