<template>
  <div class="aero-div" :style="menuStyles" @mousedown.prevent="onMouseDown">
    <div style="width: 100%; height: fit-content; align-items: end; padding-bottom: 10px">
      <Button
        circle
        plain
        size="small"
        type="danger"
        class="aero-btn"
        style="float: inline-start"
        @click="props.mode === 'demo' ? undefined : $emit('close')"
        @mousedown.prevent
      >
      </Button>
    </div>

    <p style="font-weight: bold" @mousedown.stop>
      {{ props.title ? props.title : t('titleMenu.defaultTitle') }}
    </p>

    <MarkdownItEditor
      v-if="!generated && !generating"
      class="md-container"
      :source="articleContent"
      @mousedown.stop
    />

    <MarkdownItEditor
      v-if="generated || generating"
      class="md-container"
      :source="generatedText"
      @mousedown.stop
    />

    <Autocomplete
      v-model="userPrompt"
      :fetch-suggestions="querySearch"
      clearable
      input-class="inline-input"
      :placeholder="t('titleMenu.inputPlaceholder')"
      @mousedown.stop
    />

    <div style="align-items: center; margin-top: 20px" @mousedown.stop>
      <div
        class="flex flex-col items-center"
        style="width: 60%; margin-left: 20%; margin-right: 20%"
      >
        <Slider v-model="context_mode" :step="1" :min="0" :max="2" class="w-full" />
        <div class="flex justify-between w-full text-xs text-muted-foreground mt-2">
          <span>{{ t('titleMenu.contextMarks.none') }}</span>
          <span>{{ t('titleMenu.contextMarks.chapter') }}</span>
          <span>{{ t('titleMenu.contextMarks.full') }}</span>
        </div>
      </div>
    </div>

    <div @mousedown.stop>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              circle
              type="primary"
              :disabled="generating || generated || userPrompt.length === 0"
              @click="generate"
            >
              <Send class="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ t('titleMenu.tooltips.generate') }}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip v-if="generated">
          <TooltipTrigger as-child>
            <Button circle type="info" @click="reset">
              <Undo2 class="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ t('titleMenu.tooltips.reset') }}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip v-if="generated">
          <TooltipTrigger as-child>
            <Button circle type="info" @click="chat">
              <MessageCircle class="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ t('titleMenu.tooltips.chat') }}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip v-if="generated">
          <TooltipTrigger as-child>
            <Button circle type="success" @click="accept(false)">
              <Check class="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ t('titleMenu.tooltips.acceptReplace') }}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip v-if="generated">
          <TooltipTrigger as-child>
            <Button circle type="success" @click="accept(true)">
              <Plus class="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{{ t('titleMenu.tooltips.acceptAppend') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </div>
</template>

<script setup>
import { Button } from '@renderer/components/ui/button'
import { Slider } from '@renderer/components/ui/slider'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'

import MarkdownItEditor from 'vue3-markdown-it'
import { computed, onMounted, ref, watch } from 'vue'
import { sectionChangePrompt } from '../utils/common/prompts'

import eventBus from '../utils/event-bus'
import { generateMarkdownFromOutlineTree } from '../utils/md-utils'
import { themeState } from '../utils/themes'
import { Plus, Send, Undo2, MessageCircle, Check } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask } from '../utils/ai/ai_tasks'
import { Autocomplete } from '@renderer/components/ui/autocomplete'
import { getSetting } from '../utils/settings'
import { useWorkspace } from '../stores/workspace'
import { useActiveDocument } from '../composables/useActiveDocument'
import { searchNode } from '../utils/outline/outline-helpers'
import { getDefaultAiChatMessages } from '../constants/document'

const { t } = useI18n()

const workspace = useWorkspace()
const { activeTabId, updateDocumentAiDialogs } = workspace
const { activeDocument } = useActiveDocument()

const currentOutline = computed(() => props.tree ?? activeDocument.value?.outline ?? null)
const currentMarkdown = computed(() => activeDocument.value?.markdown ?? '')

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  position: {
    type: Object,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  tree: {
    type: Object,
    required: true
  },
  mode: {
    type: String,
    default: 'normal',
    validator: (value) => ['normal', 'demo'].includes(value)
  }
})
const context_mode = ref(1)
const presetPrompts = computed(() => [
  {
    value: t('titleMenu.presetPrompts.expand.value'),
    label: t('titleMenu.presetPrompts.expand.label')
  },
  {
    value: t('titleMenu.presetPrompts.condense.value'),
    label: t('titleMenu.presetPrompts.condense.label')
  },
  {
    value: t('titleMenu.presetPrompts.polish.value'),
    label: t('titleMenu.presetPrompts.polish.label')
  },
  {
    value: t('titleMenu.presetPrompts.generateSection.value'),
    label: t('titleMenu.presetPrompts.generateSection.label')
  },
  {
    value: t('titleMenu.presetPrompts.proofread.value'),
    label: t('titleMenu.presetPrompts.proofread.label')
  },
  {
    value: t('titleMenu.presetPrompts.flowchart.value')
  },
  {
    value: t('titleMenu.presetPrompts.mindmap.value')
  }
])

const emit = defineEmits(['accept'])

const pushDialogToDocument = (dialog) => {
  const doc = activeDocument.value
  const tabId = activeTabId.value
  if (!doc || !tabId) return
  const existing = Array.isArray(doc.aiDialogs) ? doc.aiDialogs : []
  const nextDialogs = [dialog, ...existing]
  updateDocumentAiDialogs(tabId, nextDialogs)
}

const accept = (append = false) => {
  if (props.mode === 'demo') return
  //searchNode(props.path, current_outline_tree.value).text=generatedText.value;
  // latest_view.value='outline';
  // sync();
  //如果最后一位不是换行符，加上换行符
  if (generatedText.value[generatedText.value.length - 1] !== '\n') {
    generatedText.value += '\n'
  }

  //如果第一行是标题，去掉标题
  if (generatedText.value.startsWith('#')) {
    generatedText.value = generatedText.value.split('\n').slice(1).join('\n')
  }
  articleContent.value = generatedText.value
  emit('accept', {
    append: append,
    content: generatedText.value
  })
  reset()
}

const generate = async () => {
  if (props.mode === 'demo') return
  const outlineNode = currentOutline.value
  if (!outlineNode) return
  generating.value = true
  const outlineMarkdown = generateMarkdownFromOutlineTree(outlineNode)

  const prompt = sectionChangePrompt(
    outlineMarkdown,
    articleContent.value,
    props.title,
    userPrompt.value,
    context_mode.value,
    currentMarkdown.value
  )
  const messages = [
    {
      role: 'user',
      content: prompt
    }
  ]
  const { done } = createAiTask(props.title, messages, generatedText, ai_types.chat, 'title-menu')
  generating.value = true
  generated.value = false

  try {
    await done
  } catch (err) {
    //console.warn('任务失败或取消：', err);
  } finally {
    generated.value = true
    generating.value = false
  }
}
const chat = async () => {
  if (props.mode === 'demo') return
  const outlineNode = currentOutline.value
  if (!outlineNode) return
  const outlineMarkdown = generateMarkdownFromOutlineTree(outlineNode)
  const prompt = sectionChangePrompt(
    outlineMarkdown,
    articleContent.value,
    props.title,
    userPrompt.value,
    context_mode.value,
    currentMarkdown.value
  )
  const messages = JSON.parse(JSON.stringify(getDefaultAiChatMessages()))
  messages.push({
    role: 'user',
    content: prompt
  })
  messages.push({
    role: 'assistant',
    content: generatedText.value
  })
  const newDialog = {
    title: props.title,
    messages
  }
  pushDialogToDocument(newDialog)
  eventBus.emit('ai-chat') //触发开始长对话事件
}

const querySearch = (queryString, cb) => {
  const createFilter = (queryString) => {
    return (preset) => {
      //模糊匹配，只要包含就行
      return preset.value.toLowerCase().includes(queryString.toLowerCase())
    }
  }
  //console.log(queryString)
  const results = queryString
    ? presetPrompts.value.filter(createFilter(queryString))
    : presetPrompts.value
  // call callback function to return suggestions
  cb(results)
}
const reset = () => {
  generated.value = false
  generatedText.value = ''
}
const generating = ref(false)
const userPrompt = ref('')
const generatedText = ref('')
const generated = ref(false)
// 定义计算属性 menuStyles
const articleContent = ref('') // 定义 articleContent 变量
const menuStyles = computed(() => ({
  position: 'absolute',
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  border: '1px solid #ccc',
  padding: '10px',
  boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
  minWidth: '500px',
  maxWidth: '800px',
  zIndex: 1000, // 保证层级
  color: themeState.currentTheme.textColor2,
  backdropFilter: 'blur(5px)',
  background: themeState.currentTheme.titleMenuBackground
}))
const refreshContent = () => {
  const outlineNode = currentOutline.value
  if (!outlineNode) {
    articleContent.value = ''
    return
  }
  const node = searchNode(props.path, outlineNode)
  articleContent.value = node?.text ?? ''
}

const menuPosition = ref({ top: props.position.top, left: props.position.left })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const onMouseDown = (event) => {
  isDragging.value = true
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (event) => {
  if (!isDragging.value) return
  menuPosition.value = {
    top: event.clientY - dragStart.value.y,
    left: event.clientX - dragStart.value.x
  }
}

const onMouseUp = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}
onMounted(() => {
  refreshContent()
})
watch(
  () => props.path,
  (newVal, oldVal) => {
    refreshContent()
  }
)

watch(
  currentOutline,
  () => {
    refreshContent()
  },
  { deep: true }
)
</script>

<style>
.md-container {
  max-height: 400px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #cccccc36;
  backdrop-filter: blur(20px) brightness(1.05);
  /*圆角边框 */
  border-radius: 10px;
}

.aero-div:hover {
  transform: scale(1);
  /* 微缩放 */
}
</style>
