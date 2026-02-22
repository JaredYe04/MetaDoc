<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { getSystemFonts, clearFontCache } from '@renderer/services/font-service'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import { cn } from '@renderer/lib/utils'

interface FontOption {
  name: string
  family: string
  displayName?: string
}

const props = defineProps<{
  modelValue: string
  placeholder?: string
  class?: string
  previewText?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const fonts = ref<FontOption[]>([])
const loading = ref(false)
const error = ref('')
const hasLoaded = ref(false)
const isOpen = ref(false)

// 默认字体列表（作为后备）
const defaultFonts: FontOption[] = [
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
  { name: 'Roboto', family: 'Roboto' },
]

// 加载系统字体
const loadFonts = async () => {
  if (hasLoaded.value) return
  
  loading.value = true
  error.value = ''
  try {
    const systemFonts = await getSystemFonts()
    if (systemFonts.length > 0) {
      // 合并系统字体和默认字体，去重
      const combined = [...systemFonts.map(f => ({
        name: f.displayName || f.name,
        family: f.family
      })), ...defaultFonts]
      
      // 去重
      const seen = new Set<string>()
      fonts.value = combined.filter(font => {
        const key = font.family.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    } else {
      fonts.value = defaultFonts
    }
    hasLoaded.value = true
  } catch (err) {
    console.error('加载字体失败:', err)
    error.value = '加载字体列表失败，使用默认字体'
    fonts.value = defaultFonts
    hasLoaded.value = true
  } finally {
    loading.value = false
  }
}

// 刷新字体列表
const refreshFonts = async () => {
  clearFontCache()
  hasLoaded.value = false
  await loadFonts()
}

// 处理 Select 打开事件
const handleOpenChange = (open: boolean) => {
  isOpen.value = open
  if (open && !hasLoaded.value) {
    // 使用 nextTick 确保下拉框已渲染再加载字体
    nextTick(() => {
      loadFonts()
    })
  }
}

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
const previewTextValue = computed(() => props.previewText || 'AaBbCc 你好世界')
</script>

<template>
  <div :class="cn('relative', props.class)">
    <Select v-model="selectedFont" @update:open="handleOpenChange">
      <SelectTrigger class="w-[280px]">
        <SelectValue :placeholder="placeholder || '选择字体'">
          <span :style="getFontStyle(selectedFont)">{{ selectedFont }}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent class="min-w-[280px] max-h-[300px]">
        <div v-if="loading" class="flex items-center justify-center py-4 text-sm text-muted-foreground">
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          加载字体中...
        </div>
        <div v-else-if="error" class="px-2 py-2 text-sm text-destructive">
          {{ error }}
          <button 
            class="ml-2 text-xs underline hover:no-underline" 
            @click="refreshFonts"
          >
            重试
          </button>
        </div>
        <template v-else>
          <SelectItem
            v-for="font in fonts"
            :key="font.family"
            :value="font.family"
          >
            <span :style="getFontStyle(font.family)">{{ font.name }}</span>
            <span class="ml-2 text-xs text-muted-foreground">{{ previewTextValue }}</span>
          </SelectItem>
        </template>
      </SelectContent>
    </Select>
    <button
      v-if="!loading"
      class="absolute right-8 top-1/2 -translate-y-1/2 p-1 rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      @click="refreshFonts"
      title="刷新字体列表"
    >
      <RefreshCw class="h-3 w-3" />
    </button>
  </div>
</template>
