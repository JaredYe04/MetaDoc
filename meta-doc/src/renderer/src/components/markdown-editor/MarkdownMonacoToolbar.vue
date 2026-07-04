<template>
  <div
    class="toolbar markdown-monaco-toolbar"
    :style="{ backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor }"
  >
    <Tooltip>
      <TooltipTrigger as-child>
        <div class="toolbar-icon" @click="emit('undo')">
          <Undo2 class="w-4 h-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{{ t('article.toolbar.undo') }}</TooltipContent>
    </Tooltip>

    <Tooltip>
      <TooltipTrigger as-child>
        <div class="toolbar-icon" @click="emit('redo')">
          <Redo2 class="w-4 h-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{{ t('article.toolbar.redo') }}</TooltipContent>
    </Tooltip>

    <PopoverRoot v-model:open="headingsOpen">
      <PopoverTrigger as-child>
        <button type="button" class="toolbar-icon" :aria-label="t('article.toolbar.headings')">
          <Heading class="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        class="heading-popover z-[100070] w-52 p-1"
        align="start"
        side="bottom"
        :side-offset="4"
      >
        <button
          v-for="item in headingMenuItems"
          :key="item.level"
          type="button"
          class="heading-menu-item"
          :class="`heading-menu-item--h${item.level}`"
          @click="onHeadingSample(item.level)"
        >
          {{ item.label }}
        </button>
      </PopoverContent>
    </PopoverRoot>

    <Tooltip v-for="item in formatItems" :key="item.action">
      <TooltipTrigger as-child>
        <div class="toolbar-icon" @click="emit('action', item.action)">
          <component :is="item.icon" class="w-4 h-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{{ t(item.labelKey) }}</TooltipContent>
    </Tooltip>

    <PopoverRoot v-model:open="modeMenuOpen">
      <Tooltip>
        <TooltipTrigger as-child>
          <PopoverTrigger as-child>
            <button type="button" class="toolbar-icon" :aria-label="t('article.toolbar.mode')">
              <Columns2 class="w-4 h-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{{ t('article.toolbar.mode') }}</TooltipContent>
      </Tooltip>
      <PopoverContent
        class="z-[100070] w-auto p-1"
        align="start"
        side="bottom"
        :side-offset="4"
      >
        <MarkdownEditorModeMenu
          :current-choice="currentMode"
          @select="onModeSelect"
        />
      </PopoverContent>
    </PopoverRoot>

    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="toolbar-icon"
          :class="{ 'toolbar-icon--active': outlineVisible }"
          :aria-label="t('article.toolbar.toggle_outline')"
          @click="emit('toggle-outline')"
        >
          <ListTree class="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {{
          outlineVisible
            ? t('article.toolbar.toggle_outline_hide')
            : t('article.toolbar.toggle_outline_show')
        }}
      </TooltipContent>
    </Tooltip>

    <div class="toolbar-spacer" />

    <Tooltip>
      <TooltipTrigger as-child>
        <div class="toolbar-icon" @click="emit('search-replace')">
          <Search class="w-4 h-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{{ t('article.toolbar.search_replace') }}</TooltipContent>
    </Tooltip>

    <Tooltip>
      <TooltipTrigger as-child>
        <div class="toolbar-icon" @click="emit('convert-latex')">
          <Sigma class="w-4 h-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{{ t('article.toolbar.convert_latex_formulas') }}</TooltipContent>
    </Tooltip>

    <Tooltip v-if="llmEnabled">
      <TooltipTrigger as-child>
        <div class="toolbar-icon" @click="emit('ai-assistant')">
          <Sparkles class="w-4 h-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{{ t('article.toolbar.ai_full_document_analysis') }}</TooltipContent>
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PopoverRoot, PopoverTrigger } from 'reka-ui'
import {
  Undo2,
  Redo2,
  Heading,
  Bold,
  Italic,
  Strikethrough,
  Link,
  List,
  Table,
  Code,
  Quote,
  Search,
  Sigma,
  Sparkles,
  Columns2,
  ListTree
} from 'lucide-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { PopoverContent } from '@renderer/components/ui/popover'
import { themeState } from '../../utils/themes'
import type { MarkdownToolbarAction } from '../../utils/markdown-toolbar-actions'
import type { MarkdownDefaultEditorModeChoice } from '../../utils/markdown-editor-mode'
import MarkdownEditorModeMenu from './MarkdownEditorModeMenu.vue'

withDefaults(
  defineProps<{
    llmEnabled?: boolean
    currentMode?: MarkdownDefaultEditorModeChoice
    outlineVisible?: boolean
  }>(),
  {
    llmEnabled: false,
    currentMode: 'code',
    outlineVisible: true
  }
)

const emit = defineEmits<{
  undo: []
  redo: []
  action: [action: MarkdownToolbarAction, sampleText?: string]
  'search-replace': []
  'convert-latex': []
  'ai-assistant': []
  'mode-change': [choice: MarkdownDefaultEditorModeChoice]
  'toggle-outline': []
}>()

const { t } = useI18n()
const headingsOpen = ref(false)
const modeMenuOpen = ref(false)

const headingMenuItems = computed(() =>
  [1, 2, 3, 4, 5, 6].map((level) => ({
    level,
    label: t(`article.toolbar.heading${level}`)
  }))
)

/** 与 Vditor toolbar 顺序一致：bold → quote → mode，右侧为 search / latex / AI */
const formatItems = [
  { action: 'bold' as const, icon: Bold, labelKey: 'article.toolbar.bold' },
  { action: 'italic' as const, icon: Italic, labelKey: 'article.toolbar.italic' },
  { action: 'strike' as const, icon: Strikethrough, labelKey: 'article.toolbar.strike' },
  { action: 'link' as const, icon: Link, labelKey: 'article.toolbar.link' },
  { action: 'unorderedList' as const, icon: List, labelKey: 'article.toolbar.list' },
  { action: 'table' as const, icon: Table, labelKey: 'article.toolbar.table' },
  { action: 'codeBlock' as const, icon: Code, labelKey: 'article.toolbar.code' },
  { action: 'quote' as const, icon: Quote, labelKey: 'article.toolbar.quote' }
]

const onHeadingSample = (level: number) => {
  headingsOpen.value = false
  const sampleText = t(`article.toolbar.heading${level}`)
  emit('action', `headingSample${level}` as MarkdownToolbarAction, sampleText)
}

const onModeSelect = (choice: MarkdownDefaultEditorModeChoice) => {
  modeMenuOpen.value = false
  emit('mode-change', choice)
}
</script>

<style scoped>
.markdown-monaco-toolbar {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-bottom: 1px solid hsl(var(--border));
  gap: 8px;
  flex-shrink: 0;
}

.toolbar-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: v-bind('themeState.currentTheme.textColor');
}

.toolbar-icon:hover {
  background: rgba(0, 0, 0, 0.05);
}

.toolbar-icon--active {
  background: color-mix(in srgb, var(--el-color-primary, #409eff) 18%, transparent);
}

.toolbar-spacer {
  flex: 1;
}

.heading-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border-radius: 4px;
  line-height: 1.3;
  border: none;
  background: transparent;
  color: v-bind('themeState.currentTheme.textColor');
  cursor: pointer;
}

.heading-menu-item:hover {
  background: hsl(var(--accent));
}

.heading-menu-item--h1 {
  font-size: 1.35rem;
  font-weight: 700;
}

.heading-menu-item--h2 {
  font-size: 1.2rem;
  font-weight: 600;
}

.heading-menu-item--h3 {
  font-size: 1.08rem;
  font-weight: 600;
}

.heading-menu-item--h4 {
  font-size: 1rem;
  font-weight: 600;
}

.heading-menu-item--h5 {
  font-size: 0.92rem;
  font-weight: 600;
}

.heading-menu-item--h6 {
  font-size: 0.85rem;
  font-weight: 600;
  opacity: 0.9;
}
</style>
