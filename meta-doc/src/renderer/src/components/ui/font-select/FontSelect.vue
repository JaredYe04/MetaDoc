<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  getSystemFonts,
  getCachedFonts,
  refreshFontsIncremental,
  type SystemFont
} from '@renderer/services/font-service'
import { Loader2, RotateCcw } from 'lucide-vue-next'
import { cn } from '@renderer/lib/utils'

const LIST_HEIGHT = 300
const ITEM_HEIGHT = 36
const OVERSCAN = 5

interface FontOption {
  name: string
  family: string
  displayName?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    class?: string
    previewText?: string
    /** 默认推荐值，用于「恢复默认」按钮 */
    defaultRecommended?: string
  }>(),
  { defaultRecommended: undefined }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const fonts = ref<FontOption[]>([])
const loading = ref(false)
const error = ref('')
const hasLoaded = ref(false)
const isOpen = ref(false)

const defaultFonts: FontOption[] = [
  { name: 'Fira Code', family: 'Fira Code' },
  { name: 'JetBrains Mono', family: 'JetBrains Mono' },
  { name: 'OPPO Sans 4.0', family: 'OPPO Sans 4.0' },
  { name: 'New York', family: 'New York' },
  { name: 'Microsoft YaHei', family: 'Microsoft YaHei' },
  { name: 'PingFang SC', family: 'PingFang SC' },
  { name: 'Hiragino Sans GB', family: 'Hiragino Sans GB' },
  { name: 'SimSun', family: 'SimSun' },
  { name: 'SimHei', family: 'SimHei' },
  { name: 'KaiTi', family: 'KaiTi' },
  { name: 'FangSong', family: 'FangSong' },
  { name: 'Arial', family: 'Arial' },
  { name: 'Times New Roman', family: 'Times New Roman' },
  { name: 'Helvetica', family: 'Helvetica' },
  { name: 'Georgia', family: 'Georgia' },
  { name: 'Verdana', family: 'Verdana' },
  { name: 'Menlo', family: 'Menlo' },
  { name: 'Monaco', family: 'Monaco' },
  { name: 'Consolas', family: 'Consolas' },
  { name: 'SF Pro Display', family: '-apple-system, BlinkMacSystemFont' },
  { name: 'Segoe UI', family: 'Segoe UI' },
  { name: 'Roboto', family: 'Roboto' }
]

function mergeToOptions(systemFonts: SystemFont[]): FontOption[] {
  const combined = [
    ...systemFonts.map((f) => ({ name: f.displayName || f.name, family: f.family })),
    ...defaultFonts
  ]
  const seen = new Set<string>()
  return combined
    .filter((font) => {
      const key = font.family.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

// 加载系统字体（可后台执行，先展示缓存或默认列表）
const loadFonts = async () => {
  if (hasLoaded.value) return

  const cached = getCachedFonts()
  if (cached && cached.length > 0) {
    fonts.value = mergeToOptions(cached)
    hasLoaded.value = true
    return
  }

  fonts.value = defaultFonts
  hasLoaded.value = true
  loading.value = true
  error.value = ''
  try {
    const systemFonts = await getSystemFonts()
    fonts.value = systemFonts.length > 0 ? mergeToOptions(systemFonts) : defaultFonts
  } catch (err) {
    console.error('加载字体失败:', err)
    error.value = '加载字体列表失败，使用默认字体'
    fonts.value = defaultFonts
  } finally {
    loading.value = false
  }
}

// 增量刷新：后台拉取新字体并合并（用于错误重试）
const refreshFonts = async () => {
  loading.value = true
  error.value = ''
  try {
    const merged = await refreshFontsIncremental()
    fonts.value = mergeToOptions(merged)
  } catch (err) {
    console.error('刷新字体失败:', err)
    error.value = '刷新失败，保留当前列表'
  } finally {
    loading.value = false
  }
}

// 处理 Select 打开事件：有缓存则直接用，否则先展示默认列表再后台加载；打开时自动后台增量刷新
const handleOpenChange = (open: boolean) => {
  isOpen.value = open
  if (open) {
    if (!hasLoaded.value) {
      nextTick(() => loadFonts())
    } else {
      // 已加载过：后台自动增量刷新，不阻塞 UI
      refreshFontsIncremental()
        .then((merged) => {
          fonts.value = mergeToOptions(merged)
        })
        .catch(() => {})
    }
  }
}

const resetToDefault = () => {
  if (props.defaultRecommended != null) {
    emit('update:modelValue', props.defaultRecommended)
  }
}

const canReset = computed(
  () =>
    props.defaultRecommended != null &&
    props.defaultRecommended !== '' &&
    props.modelValue !== props.defaultRecommended
)

// 获取字体的预览样式
const getFontStyle = (family: string): string => {
  return `font-family: "${family}", -apple-system, BlinkMacSystemFont, sans-serif`
}

// 当前选中的字体
const selectedFont = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 预览文本
const previewTextValue = computed(() => props.previewText || 'AaBbCc 你好世界 Hello World')

// 虚拟列表：仅渲染可见项
const scrollContainerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)

const totalHeight = computed(() => fonts.value.length * ITEM_HEIGHT)

interface VirtualItem {
  font: FontOption
  index: number
  offsetY: number
}

const virtualItems = computed((): VirtualItem[] => {
  const list = fonts.value
  if (list.length === 0) return []
  const start = Math.max(0, Math.floor(scrollTop.value / ITEM_HEIGHT) - OVERSCAN)
  const visibleCount = Math.ceil(LIST_HEIGHT / ITEM_HEIGHT) + OVERSCAN * 2
  const end = Math.min(list.length, start + visibleCount)
  const result: VirtualItem[] = []
  for (let i = start; i < end; i++) {
    result.push({ font: list[i], index: i, offsetY: i * ITEM_HEIGHT })
  }
  return result
})

function onListScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el) scrollTop.value = el.scrollTop
}

// 打开下拉时滚动到当前选中项
const selectedIndex = computed(() => fonts.value.findIndex((f) => f.family === props.modelValue))
watch(
  () => [isOpen.value, selectedIndex.value, fonts.value.length] as const,
  ([open, idx]) => {
    if (!open || idx < 0) return
    const tryScroll = () => {
      const el = scrollContainerRef.value
      if (el) {
        const targetScroll = Math.max(0, idx * ITEM_HEIGHT - LIST_HEIGHT / 2 + ITEM_HEIGHT / 2)
        el.scrollTop = targetScroll
        scrollTop.value = targetScroll
      }
    }
    nextTick(() => {
      tryScroll()
      if (!scrollContainerRef.value) requestAnimationFrame(tryScroll)
    })
  }
)
</script>

<template>
  <div :class="cn('relative', props.class)">
    <Select v-model="selectedFont" @update:open="handleOpenChange">
      <SelectTrigger class="w-[280px] pr-2">
        <span class="min-w-0 flex-1 truncate text-start">
          <SelectValue :placeholder="placeholder || '选择字体'">
            <span :style="getFontStyle(selectedFont)">{{ selectedFont }}</span>
          </SelectValue>
        </span>
        <button
          v-if="canReset"
          type="button"
          class="shrink-0 p-1 rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          :title="'恢复默认：' + (defaultRecommended || '')"
          @click.stop="resetToDefault"
        >
          <RotateCcw class="h-3 w-3" />
        </button>
      </SelectTrigger>
      <SelectContent class="min-w-[280px] max-h-[300px] p-0" :viewport-height="LIST_HEIGHT">
        <div
          v-if="loading"
          class="flex items-center justify-center py-4 text-sm text-muted-foreground"
        >
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          加载字体中...
        </div>
        <div v-else-if="error" class="px-2 py-2 text-sm text-destructive">
          {{ error }}
          <button class="ml-2 text-xs underline hover:no-underline" @click="refreshFonts">
            重试
          </button>
        </div>
        <div
          v-else
          ref="scrollContainerRef"
          class="overflow-auto p-1"
          :style="{ height: LIST_HEIGHT + 'px' }"
          @scroll="onListScroll"
        >
          <div :style="{ height: totalHeight + 'px', position: 'relative' }">
            <div
              v-for="item in virtualItems"
              :key="item.font.family"
              class="absolute left-0 right-0 flex w-full items-center"
              :style="{
                height: ITEM_HEIGHT + 'px',
                transform: `translateY(${item.offsetY}px)`
              }"
            >
              <SelectItem :value="item.font.family" class="h-full w-full">
                <span :style="getFontStyle(item.font.family)">{{ item.font.name }}</span>
                <span
                  class="ml-2 text-xs text-muted-foreground"
                  :style="getFontStyle(item.font.family)"
                >
                  {{ previewTextValue }}
                </span>
              </SelectItem>
            </div>
          </div>
        </div>
      </SelectContent>
    </Select>
  </div>
</template>
