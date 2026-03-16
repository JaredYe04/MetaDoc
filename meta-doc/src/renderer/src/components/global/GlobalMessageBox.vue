<template>
  <transition name="messagebox-fade">
    <div
      v-if="store.state.visible"
      class="global-messagebox-overlay"
      :style="overlayStyle"
      @click.self="onOverlayClick"
    >
      <div class="global-messagebox" :style="boxStyle" @click.stop>
        <div class="global-messagebox__header">
          <span class="global-messagebox__title">{{ store.state.title }}</span>
        </div>
        <div class="global-messagebox__body">
          <p class="global-messagebox__message">{{ store.state.message }}</p>
          <Input
            v-if="store.state.mode === 'prompt'"
            ref="promptInputRef"
            v-model="promptValue"
            class="global-messagebox__input"
            @keydown.enter="handleConfirm"
          />
        </div>
        <div class="global-messagebox__footer">
          <Button variant="ghost" @click="handleCancel">
            {{ store.state.cancelButtonText }}
          </Button>
          <Button
            :variant="'default'"
            :class="{ 'btn-warning': store.state.type === 'warning' }"
            @click="handleConfirm"
          >
            {{ store.state.confirmButtonText }}
          </Button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useMessageBoxStore } from '../../stores/messageBox'
import { themeState } from '../../utils/themes'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

const store = useMessageBoxStore()
const promptValue = ref('')
const promptInputRef = ref<InstanceType<typeof Input> | null>(null)

watch(
  () => store.state.visible,
  (visible) => {
    if (visible) {
      promptValue.value = store.state.inputValue
      if (store.state.mode === 'prompt') {
        nextTick(() => {
          const el = promptInputRef.value?.$el
          if (el?.focus) el.focus()
        })
      }
    }
  }
)

const overlayStyle = computed(() => ({
  backgroundColor: 'rgba(0, 0, 0, 0.5)'
}))

const boxStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: themeState.currentTheme.textColor2 + '30'
}))

/** 点击遮罩不关闭（按要求） */
function onOverlayClick() {
  //  intentionally do nothing
}

function handleCancel() {
  store.reject('cancel')
}

function handleConfirm() {
  const s = store.state
  if (s.mode === 'prompt') {
    const validator = s.inputValidator
    if (validator) {
      const result = validator(promptValue.value)
      if (result !== true) {
        // 校验失败，不关闭
        return
      }
    }
    store.resolve(promptValue.value)
  } else {
    store.resolve()
  }
}
</script>

<style scoped>
/* 遮罩必须在 MainTabs 下方，不遮挡任务栏；z-index 高于 Dialog(10000) 确保在配置管理等 Dialog 之上 */
.global-messagebox-overlay {
  position: fixed;
  top: 40px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100002;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.global-messagebox {
  min-width: 320px;
  max-width: 480px;
  border-radius: 12px;
  border: 1px solid;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.global-messagebox__header {
  padding: 16px 20px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.textColor2 + "20"');
}

.global-messagebox__title {
  font-size: 16px;
  font-weight: 600;
}

.global-messagebox__body {
  padding: 20px;
}

.global-messagebox__message {
  margin: 0 0 16px 0;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.global-messagebox__input {
  width: 100%;
}

.global-messagebox__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid v-bind('themeState.currentTheme.textColor2 + "20"');
}

.btn-warning {
  --el-button-bg-color: var(--el-color-warning);
  --el-button-border-color: var(--el-color-warning);
  --el-button-text-color: #fff;
}

.messagebox-fade-enter-active,
.messagebox-fade-leave-active {
  transition: opacity 0.2s ease;
}

.messagebox-fade-enter-from,
.messagebox-fade-leave-to {
  opacity: 0;
}
</style>
