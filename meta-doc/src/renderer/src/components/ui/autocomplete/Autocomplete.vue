<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { cn } from '@renderer/lib/utils'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'

export interface AutocompleteSuggestion {
  value: string
  label?: string
  [key: string]: any
}

export interface FetchSuggestionsCallback {
  (results: AutocompleteSuggestion[]): void
}

export interface FetchSuggestionsFunction {
  (queryString: string, callback: FetchSuggestionsCallback): void
}

const props = defineProps({
  /** The input value (v-model) */
  modelValue: { type: String, default: '' },
  /** Function to fetch suggestions based on query string */
  fetchSuggestions: { type: Function as () => FetchSuggestionsFunction, required: true },
  /** Placeholder text for the input */
  placeholder: { type: String, default: '' },
  /** Whether to trigger suggestion on focus */
  triggerOnFocus: { type: Boolean, default: true },
  /** The key to use as value from suggestion objects */
  valueKey: { type: String, default: 'value' },
  /** Debounce delay in milliseconds */
  debounce: { type: Number, default: 300 },
  /** Whether the input is disabled */
  disabled: { type: Boolean, default: false },
  /** Whether to show the clear button */
  clearable: { type: Boolean, default: false },
  /** Custom class for the input */
  inputClass: { type: String, default: '' },
  /** Whether the autocomplete is in loading state */
  loading: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'select', item: AutocompleteSuggestion): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
  (e: 'clear'): void
}>()

// State
const inputValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

const suggestions = ref<AutocompleteSuggestion[]>([])
const highlightedIndex = ref(-1)
const isOpen = ref(false)
const isFocused = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const isLoading = ref(false)

// Computed
const hasSuggestions = computed(() => suggestions.value.length > 0)
const showDropdown = computed(() => isOpen.value && (hasSuggestions.value || isLoading.value))

// Methods
const getSuggestionValue = (item: AutocompleteSuggestion): string => {
  return item[props.valueKey] ?? item.value ?? ''
}

const getSuggestionLabel = (item: AutocompleteSuggestion): string => {
  return item.label ?? getSuggestionValue(item)
}

const fetchSuggestionsInternal = async (queryString: string) => {
  if (!props.fetchSuggestions) return

  isLoading.value = true
  
  try {
    await new Promise<void>((resolve) => {
      props.fetchSuggestions(queryString, (results: AutocompleteSuggestion[]) => {
        suggestions.value = results || []
        highlightedIndex.value = -1
        isOpen.value = true
        resolve()
      })
    })
  } catch (error) {
    console.error('Error fetching suggestions:', error)
    suggestions.value = []
  } finally {
    isLoading.value = false
  }
}

const debouncedFetch = (queryString: string) => {
  if (debounceTimer.value) {
    clearTimeout(debounceTimer.value)
  }
  
  debounceTimer.value = setTimeout(() => {
    fetchSuggestionsInternal(queryString)
  }, props.debounce)
}

const handleInput = () => {
  const value = inputValue.value
  
  if (value === '') {
    suggestions.value = []
    isOpen.value = false
    return
  }
  
  debouncedFetch(value)
}

const handleFocus = (event: FocusEvent) => {
  isFocused.value = true
  emit('focus', event)
  
  if (props.triggerOnFocus) {
    const value = inputValue.value
    debouncedFetch(value)
  }
}

const handleBlur = (event: FocusEvent) => {
  // Delay closing to allow click on dropdown items
  setTimeout(() => {
    isFocused.value = false
    isOpen.value = false
  }, 150)
  emit('blur', event)
}

const handleSelect = (item: AutocompleteSuggestion) => {
  const value = getSuggestionValue(item)
  inputValue.value = value
  isOpen.value = false
  emit('select', item)
}

const handleClear = () => {
  inputValue.value = ''
  suggestions.value = []
  isOpen.value = false
  emit('clear')
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const highlightItem = (index: number) => {
  if (index < 0) {
    highlightedIndex.value = -1
  } else if (index >= suggestions.value.length) {
    highlightedIndex.value = suggestions.value.length - 1
  } else {
    highlightedIndex.value = index
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!isOpen.value) return
  
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      highlightItem(highlightedIndex.value + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      highlightItem(highlightedIndex.value - 1)
      break
    case 'Enter':
      event.preventDefault()
      if (highlightedIndex.value >= 0 && highlightedIndex.value < suggestions.value.length) {
        handleSelect(suggestions.value[highlightedIndex.value])
      }
      break
    case 'Escape':
      isOpen.value = false
      break
  }
}

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const dropdown = dropdownRef.value
  const input = inputRef.value
  
  if (dropdown && !dropdown.contains(target) && input && !input.contains(target)) {
    isOpen.value = false
  }
}

// Lifecycle
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  if (debounceTimer.value) {
    clearTimeout(debounceTimer.value)
  }
})

// Watch for external value changes
watch(() => props.modelValue, (newValue) => {
  if (!isFocused.value && newValue === '') {
    suggestions.value = []
    isOpen.value = false
  }
})
</script>

<template>
  <div class="relative w-full">
    <!-- Input wrapper -->
    <div class="relative flex items-center">
      <!-- Prefix slot -->
      <div v-if="$slots.prefix" class="absolute left-3 flex items-center pointer-events-none z-10">
        <slot name="prefix" />
      </div>

      <!-- Default slot or Input -->
      <slot
        :value="inputValue"
        :input-props="{
          ref: inputRef,
          modelValue: inputValue,
          placeholder,
          disabled,
          class: cn(
            'w-full',
            $slots.prefix && 'pl-10',
            ($slots.suffix || clearable) && 'pr-10',
            inputClass
          ),
        }"
        :handlers="{
          'update:modelValue': (val: string) => { inputValue = val; handleInput() },
          focus: handleFocus,
          blur: handleBlur,
          keydown: handleKeydown,
        }"
      >
        <Input
          ref="inputRef"
          v-model="inputValue"
          :placeholder="placeholder"
          :disabled="disabled"
          :class="cn(
            'w-full transition-all duration-200',
            $slots.prefix && 'pl-10',
            ($slots.suffix || clearable) && 'pr-10',
            inputClass
          )"
          @input="handleInput"
          @focus="handleFocus"
          @blur="handleBlur"
          @keydown="handleKeydown"
        />
      </slot>

      <!-- Suffix slot -->
      <div 
        v-if="$slots.suffix || clearable" 
        class="absolute right-3 flex items-center gap-1"
        :class="{ 'pointer-events-none': !$slots.suffix && !clearable }"
      >
        <!-- Clear button -->
        <button
          v-if="clearable && inputValue && !disabled"
          type="button"
          class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 text-muted-foreground transition-colors"
          @click="handleClear"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <slot name="suffix" />
      </div>
    </div>

    <!-- Dropdown suggestions -->
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="showDropdown"
        ref="dropdownRef"
        class="absolute z-50 w-full mt-1 py-1 bg-popover border border-border rounded-md shadow-lg"
      >
        <ScrollArea class="max-h-[300px]">
          <!-- Loading state -->
          <div v-if="isLoading || loading" class="px-4 py-3 text-sm text-muted-foreground text-center">
            <svg
              class="animate-spin inline-block w-4 h-4 mr-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            加载中...
          </div>

          <!-- Empty state -->
          <div v-else-if="!hasSuggestions" class="px-4 py-3 text-sm text-muted-foreground text-center">
            无匹配数据
          </div>

          <!-- Suggestions list -->
          <ul v-else class="py-1">
            <li
              v-for="(item, index) in suggestions"
              :key="index"
              :class="cn(
                'px-4 py-2 text-sm cursor-pointer transition-colors',
                highlightedIndex === index
                  ? 'bg-accent text-accent-foreground'
                  : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'
              )"
              @mousedown.prevent
              @click="handleSelect(item)"
              @mouseenter="highlightedIndex = index"
            >
              {{ getSuggestionLabel(item) }}
            </li>
          </ul>
        </ScrollArea>
      </div>
    </Transition>
  </div>
</template>
