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

    <Divider direction="vertical" />

    <Popover v-model:open="headingsOpen">
      <PopoverTrigger as-child>
        <div class="toolbar-icon">
          <Heading class="w-4 h-4" />
        </div>
      </PopoverTrigger>
      <PopoverContent class="w-40 p-1" align="start">
        <button
          v-for="level in 6"
          :key="level"
          type="button"
          class="heading-menu-item"
          @click="onHeading(level)"
        >
          H{{ level }}
        </button>
      </PopoverContent>
    </Popover>

    <Tooltip v-for="item in formatItems" :key="item.action">
      <TooltipTrigger as-child>
        <div class="toolbar-icon" @click="emit('action', item.action)">
          <component :is="item.icon" class="w-4 h-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{{ t(item.labelKey) }}</TooltipContent>
    </Tooltip>

    <Divider direction="vertical" />

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

    <div class="toolbar-spacer" />

    <Tooltip>
      <TooltipTrigger as-child>
        <div class="toolbar-icon" @click="emit('switch-to-visual')">
          <PenLine class="w-4 h-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{{ t('article.toolbar.switchToVisualEditor') }}</TooltipContent>
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Undo2,
  Redo2,
  Heading,
  Bold,
  Italic,
  Strikethrough,
  Link,
  List,
  ListOrdered,
  Table,
  Code,
  Quote,
  Search,
  Sigma,
  Sparkles,
  PenLine
} from 'lucide-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Divider } from '@renderer/components/ui/separator'
import { themeState } from '../../utils/themes'
import type { MarkdownToolbarAction } from '../../utils/markdown-toolbar-actions'

withDefaults(
  defineProps<{
    llmEnabled?: boolean
  }>(),
  {
    llmEnabled: false
  }
)

const emit = defineEmits<{
  undo: []
  redo: []
  action: [action: MarkdownToolbarAction]
  'search-replace': []
  'convert-latex': []
  'ai-assistant': []
  'switch-to-visual': []
}>()

const { t } = useI18n()
const headingsOpen = ref(false)

const formatItems = [
  { action: 'bold' as const, icon: Bold, labelKey: 'article.toolbar.bold' },
  { action: 'italic' as const, icon: Italic, labelKey: 'article.toolbar.italic' },
  { action: 'strike' as const, icon: Strikethrough, labelKey: 'article.toolbar.strike' },
  { action: 'link' as const, icon: Link, labelKey: 'article.toolbar.link' },
  { action: 'unorderedList' as const, icon: List, labelKey: 'article.toolbar.list' },
  { action: 'orderedList' as const, icon: ListOrdered, labelKey: 'article.toolbar.list' },
  { action: 'table' as const, icon: Table, labelKey: 'article.toolbar.table' },
  { action: 'codeBlock' as const, icon: Code, labelKey: 'article.toolbar.code' },
  { action: 'quote' as const, icon: Quote, labelKey: 'article.toolbar.quote' }
]

const onHeading = (level: number) => {
  headingsOpen.value = false
  emit('action', `heading${level}` as MarkdownToolbarAction)
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
  color: v-bind('themeState.currentTheme.textColor');
}

.toolbar-icon:hover {
  background: rgba(0, 0, 0, 0.05);
}

.toolbar-spacer {
  flex: 1;
}

.heading-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
}

.heading-menu-item:hover {
  background: hsl(var(--accent));
}
</style>
