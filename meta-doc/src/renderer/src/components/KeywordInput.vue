<template>
  <div class="keyword-input">
    <div class="keywords-container">
      <Badge
        v-for="(keyword, index) in internalValue"
        :key="keyword + index"
        variant="secondary"
        class="keyword-badge"
      >
        {{ keyword }}
        <button type="button" class="keyword-remove" @click="removeKeyword(index)">
          <X class="h-3 w-3" />
        </button>
      </Badge>
      <Input
        v-model="inputValue"
        :placeholder="placeholder"
        class="keyword-input-field"
        @keydown.enter.prevent="addKeyword"
        @keydown.backspace="handleBackspace"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    placeholder?: string
  }>(),
  {
    modelValue: () => [],
    placeholder: ''
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
}>()

const internalValue = ref<string[]>([...props.modelValue])
const inputValue = ref('')

watch(
  () => props.modelValue,
  (value) => {
    internalValue.value = [...value]
  },
  { deep: true }
)

const sanitizeKeywords = (value: string[]): string[] => {
  const unique = new Set<string>()
  value.forEach((item) => {
    const trimmed = item.trim()
    if (trimmed) {
      unique.add(trimmed)
    }
  })
  return Array.from(unique)
}

const addKeyword = () => {
  const value = inputValue.value.trim()
  if (!value) return

  const newKeywords = [...internalValue.value, value]
  const nextValue = sanitizeKeywords(newKeywords)
  internalValue.value = nextValue
  inputValue.value = ''
  emit('update:modelValue', nextValue)
}

const removeKeyword = (index: number) => {
  const newKeywords = [...internalValue.value]
  newKeywords.splice(index, 1)
  internalValue.value = newKeywords
  emit('update:modelValue', newKeywords)
}

const handleBackspace = (e: KeyboardEvent) => {
  if (inputValue.value === '' && internalValue.value.length > 0) {
    removeKeyword(internalValue.value.length - 1)
  }
}
</script>

<style scoped>
.keyword-input {
  width: 100%;
}

.keywords-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  min-height: 32px;
  border: 1px solid rgba(145, 145, 145, 0.55) !important;
  border-radius: 6px;
  background-color: var(--background);
}

.keyword-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
}

.keyword-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: currentColor;
  opacity: 0.6;
}

.keyword-remove:hover {
  opacity: 1;
}

.keyword-input-field {
  flex: 1;
  min-width: 80px;
  border: none;
  background: transparent;
  padding: 0;
  outline: none;
  box-shadow: none;
}

.keyword-input-field:focus {
  outline: none;
  box-shadow: none;
  border: none;
}
</style>
