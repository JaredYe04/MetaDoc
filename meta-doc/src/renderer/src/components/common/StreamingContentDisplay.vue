<template>
  <div 
    v-if="shouldDisplay" 
    class="streaming-content-display"
    :style="containerStyle"
  >
    <el-scrollbar class="streaming-content-scrollbar">
      <div class="streaming-content-container">
        <pre class="streaming-content-text">{{ content }}</pre>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { themeState } from '../../utils/themes'

interface Props {
  /** 流式输出的ref，实时更新 */
  contentRef: Ref<string> | { value: string }
  /** 任务是否完成（Promise或boolean或null） */
  done?: Promise<any> | boolean | null | undefined
  /** 自定义样式 */
  style?: Record<string, string>
}

const props = withDefaults(defineProps<Props>(), {
  style: () => ({})
})

const isDone = ref(false)

// 计算内容值（支持Ref对象和普通对象）
const content = computed(() => {
  if (props.contentRef && typeof props.contentRef === 'object' && 'value' in props.contentRef) {
    return props.contentRef.value
  }
  return ''
})

// 计算是否应该显示组件
const shouldDisplay = computed(() => {
  return !isDone.value && !!content.value && content.value.trim().length > 0
})

// 监听done状态
watch(
  () => props.done,
  async (newDone) => {
    if (newDone === true) {
      isDone.value = true
    } else if (newDone === false) {
      isDone.value = false
    } else if (newDone instanceof Promise) {
      // 等待Promise完成
      try {
        await newDone
        isDone.value = true
      } catch {
        // 即使Promise reject（比如取消），也视为done，保留当前内容
        isDone.value = true
      }
    } else if (newDone === null || newDone === undefined) {
      // done为null或undefined时，视为未完成
      isDone.value = false
    }
  },
  { immediate: true }
)

// 如果传入的是Promise，需要处理
if (props.done instanceof Promise) {
  props.done
    .then(() => {
      isDone.value = true
    })
    .catch(() => {
      // 取消或失败时也视为done，保留当前内容
      isDone.value = true
    })
}

// 容器样式
const containerStyle = computed(() => ({
  width: '100%',
  minHeight: '100px',
  color: themeState.currentTheme.textColor,
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderRadius: '8px',
  padding: '16px',
  boxSizing: 'border-box' as const,
  ...props.style
}))
</script>

<style scoped>
.streaming-content-display {
  width: 100%;
  min-height: 100px;
  display: flex;
  flex-direction: column;
}

.streaming-content-scrollbar {
  flex: 1;
  min-height: 100px;
  max-height: 100%;
}

.streaming-content-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.streaming-content-container {
  width: 100%;
  min-height: 100px;
  padding: 0;
}

.streaming-content-text {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.6;
  color: inherit;
  background: transparent;
  border: none;
}
</style>

