<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { PopoverRoot, PopoverTrigger, PopoverContent, PopoverPortal } from 'reka-ui'
import { Calendar as CalendarIcon, X, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

const { t } = useI18n()

export interface DatePickerProps {
  modelValue?: Date | [Date | null, Date | null] | string | [string, string] | null
  type?: 'date' | 'daterange' | 'datetime' | 'datetimerange'
  placeholder?: string
  startPlaceholder?: string
  endPlaceholder?: string
  format?: string
  valueFormat?: string
  clearable?: boolean
  disabledDate?: (date: Date) => boolean
  rangeSeparator?: string
  disabled?: boolean
  class?: string
  style?: Record<string, string>
}

const props = withDefaults(defineProps<DatePickerProps>(), {
  type: 'date',
  placeholder: undefined,
  startPlaceholder: undefined,
  endPlaceholder: undefined,
  format: 'YYYY-MM-DD',
  valueFormat: '',
  clearable: true,
  rangeSeparator: undefined,
  disabled: false
})

// Computed properties for i18n with fallback
const placeholderText = computed(
  () => props.placeholder ?? t('datePicker.placeholder', '请选择日期')
)
const startPlaceholderText = computed(
  () => props.startPlaceholder ?? t('datePicker.startPlaceholder', '开始日期')
)
const endPlaceholderText = computed(
  () => props.endPlaceholder ?? t('datePicker.endPlaceholder', '结束日期')
)
const rangeSeparatorText = computed(
  () => props.rangeSeparator ?? t('datePicker.rangeSeparator', '至')
)

const emit = defineEmits<{
  'update:modelValue': [value: Date | [Date | null, Date | null] | string | [string, string] | null]
  change: [value: Date | [Date | null, Date | null] | string | [string, string] | null]
}>()

// Internal state
const open = ref(false)
const currentMonth = ref(new Date())
const isTimePickerVisible = ref(false)

// Parse initial value
function parseValue(val: typeof props.modelValue): { start: Date | null; end: Date | null } {
  if (!val) return { start: null, end: null }

  const isRange = props.type === 'daterange' || props.type === 'datetimerange'

  function parseOne(v: unknown): Date | null {
    if (v == null || v === '') return null
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v
    const s = String(v).trim()
    // 与 value-format 一致：空格日期在部分环境解析失败，改为 ISO 风格
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') : s
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? null : d
  }

  if (isRange) {
    if (Array.isArray(val)) {
      return {
        start: parseOne(val[0]),
        end: parseOne(val[1])
      }
    }
    return { start: null, end: null }
  } else {
    const date = val instanceof Date ? val : new Date(val as string)
    return { start: isNaN(date.getTime()) ? null : date, end: null }
  }
}

const parsed = parseValue(props.modelValue)
const selectedStartDate = ref<Date | null>(parsed.start)
const selectedEndDate = ref<Date | null>(parsed.end)
const hoverDate = ref<Date | null>(null)

// Time values
const startTime = ref({ hours: 0, minutes: 0, seconds: 0 })
const endTime = ref({ hours: 23, minutes: 59, seconds: 59 })

// Initialize time from selected dates
function initTimeFromDates() {
  if (selectedStartDate.value) {
    startTime.value = {
      hours: selectedStartDate.value.getHours(),
      minutes: selectedStartDate.value.getMinutes(),
      seconds: selectedStartDate.value.getSeconds()
    }
  }
  if (selectedEndDate.value) {
    endTime.value = {
      hours: selectedEndDate.value.getHours(),
      minutes: selectedEndDate.value.getMinutes(),
      seconds: selectedEndDate.value.getSeconds()
    }
  }
}

initTimeFromDates()

// Watch for external value changes
watch(
  () => props.modelValue,
  (newVal) => {
    const parsed = parseValue(newVal)
    selectedStartDate.value = parsed.start
    selectedEndDate.value = parsed.end
    initTimeFromDates()
    if (parsed.start) {
      currentMonth.value = new Date(parsed.start)
    }
  },
  { deep: true }
)

// Calendar computations
const daysInMonth = computed(() => {
  const year = currentMonth.value.getFullYear()
  const month = currentMonth.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay() // 0 = Sunday

  const days: Array<{ date: Date | null; isCurrentMonth: boolean; isToday: boolean }> = []

  // Previous month padding
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonthLastDay - i),
      isCurrentMonth: false,
      isToday: false
    })
  }

  // Current month days
  const today = new Date()
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i)
    days.push({
      date,
      isCurrentMonth: true,
      isToday: date.toDateString() === today.toDateString()
    })
  }

  // Next month padding to fill 6 rows (42 cells)
  const remainingCells = 42 - days.length
  for (let i = 1; i <= remainingCells; i++) {
    days.push({
      date: new Date(year, month + 1, i),
      isCurrentMonth: false,
      isToday: false
    })
  }

  return days
})

const weekDays = ['日', '一', '二', '三', '四', '五', '六']
const monthYearLabel = computed(() => {
  const year = currentMonth.value.getFullYear()
  const month = currentMonth.value.getMonth() + 1
  return `${year}年${month}月`
})

// Date formatting utilities
function formatDate(date: Date | null, fmt: string): string {
  if (!date || isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return fmt
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

function parseDate(str: string, fmt: string): Date | null {
  if (!str) return null

  // Simple parser for standard formats
  const patterns: Record<string, RegExp> = {
    'YYYY-MM-DD': /(\d{4})-(\d{2})-(\d{2})/,
    'YYYY/MM/DD': /(\d{4})\/(\d{2})\/(\d{2})/,
    'YYYY-MM-DD HH:mm:ss': /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
    'YYYY/MM/DD HH:mm:ss': /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/
  }

  const pattern = patterns[fmt] || patterns['YYYY-MM-DD']
  const match = str.match(pattern)

  if (match) {
    if (fmt.includes('HH')) {
      return new Date(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4] || '0'),
        parseInt(match[5] || '0'),
        parseInt(match[6] || '0')
      )
    }
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
  }

  const parsed = new Date(str)
  return isNaN(parsed.getTime()) ? null : parsed
}

// Apply time to date
function applyTime(
  date: Date | null,
  time: { hours: number; minutes: number; seconds: number }
): Date | null {
  if (!date) return null
  const result = new Date(date)
  result.setHours(time.hours, time.minutes, time.seconds)
  return result
}

// Format for display
const displayValue = computed(() => {
  const isRange = props.type === 'daterange' || props.type === 'datetimerange'
  const fmt = props.format

  if (isRange) {
    if (!selectedStartDate.value && !selectedEndDate.value) return ''
    const start = formatDate(selectedStartDate.value, fmt)
    const end = formatDate(selectedEndDate.value, fmt)
    return `${start} ${rangeSeparatorText.value} ${end}`
  } else {
    return formatDate(selectedStartDate.value, fmt)
  }
})

// Format for binding (valueFormat)
function getBindingValue(): Date | [Date | null, Date | null] | string | [string, string] | null {
  const isRange = props.type === 'daterange' || props.type === 'datetimerange'
  const useFormat = props.valueFormat || props.format

  if (isRange) {
    // Apply time for datetime types
    let start = selectedStartDate.value
    let end = selectedEndDate.value

    if (props.type === 'datetimerange') {
      start = applyTime(start, startTime.value)
      end = applyTime(end, endTime.value)
    }

    if (props.valueFormat) {
      return [formatDate(start, useFormat), formatDate(end, useFormat)]
    }
    return [start, end]
  } else {
    // Apply time for datetime type
    let date = selectedStartDate.value
    if (props.type === 'datetime') {
      date = applyTime(date, startTime.value)
    }

    if (props.valueFormat) {
      return formatDate(date, useFormat)
    }
    return date
  }
}

// Navigation
function prevMonth() {
  currentMonth.value = new Date(
    currentMonth.value.getFullYear(),
    currentMonth.value.getMonth() - 1,
    1
  )
}

function nextMonth() {
  currentMonth.value = new Date(
    currentMonth.value.getFullYear(),
    currentMonth.value.getMonth() + 1,
    1
  )
}

function prevYear() {
  currentMonth.value = new Date(
    currentMonth.value.getFullYear() - 1,
    currentMonth.value.getMonth(),
    1
  )
}

function nextYear() {
  currentMonth.value = new Date(
    currentMonth.value.getFullYear() + 1,
    currentMonth.value.getMonth(),
    1
  )
}

// Date selection logic
function selectDate(date: Date) {
  if (props.disabledDate?.(date)) return

  const isRange = props.type === 'daterange' || props.type === 'datetimerange'

  if (isRange) {
    if (!selectedStartDate.value || (selectedStartDate.value && selectedEndDate.value)) {
      // Start new selection
      selectedStartDate.value = date
      selectedEndDate.value = null
      startTime.value = { hours: 0, minutes: 0, seconds: 0 }
    } else {
      // Complete selection
      if (date < selectedStartDate.value) {
        selectedEndDate.value = selectedStartDate.value
        selectedStartDate.value = date
      } else {
        selectedEndDate.value = date
      }
      endTime.value = { hours: 23, minutes: 59, seconds: 59 }

      if (props.type === 'daterange') {
        // Close on complete for daterange, stay open for datetimerange
        open.value = false
        emitValue()
      }
    }
  } else {
    selectedStartDate.value = date
    if (props.type === 'date') {
      open.value = false
      emitValue()
    }
  }
}

function confirmDateTime() {
  open.value = false
  emitValue()
}

function emitValue() {
  const value = getBindingValue()
  emit('update:modelValue', value)
  nextTick(() => {
    emit('change', value)
  })
}

function clear() {
  selectedStartDate.value = null
  selectedEndDate.value = null
  startTime.value = { hours: 0, minutes: 0, seconds: 0 }
  endTime.value = { hours: 23, minutes: 59, seconds: 59 }
  const value = getBindingValue()
  emit('update:modelValue', value)
  emit('change', value)
}

// Date cell state helpers
function isSelected(date: Date): boolean {
  if (!date) return false

  const isRange = props.type === 'daterange' || props.type === 'datetimerange'

  if (isRange) {
    if (selectedStartDate.value && date.toDateString() === selectedStartDate.value.toDateString()) {
      return true
    }
    if (selectedEndDate.value && date.toDateString() === selectedEndDate.value.toDateString()) {
      return true
    }
    return false
  }

  return selectedStartDate.value?.toDateString() === date.toDateString()
}

function isInRange(date: Date): boolean {
  const isRange = props.type === 'daterange' || props.type === 'datetimerange'
  if (!isRange) return false

  const start = selectedStartDate.value
  const end = selectedEndDate.value || hoverDate.value

  if (!start || !end) return false
  if (start > end) return date >= end && date <= start
  return date > start && date < end
}

function isRangeStart(date: Date): boolean {
  return selectedStartDate.value?.toDateString() === date.toDateString() || false
}

function isRangeEnd(date: Date): boolean {
  return selectedEndDate.value?.toDateString() === date.toDateString() || false
}

// Time picker helpers
const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const seconds = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

function adjustTime(type: 'hours' | 'minutes' | 'seconds', delta: number, isStart: boolean) {
  const target = isStart ? startTime.value : endTime.value
  let newValue = target[type] + delta

  if (type === 'hours') {
    newValue = (newValue + 24) % 24
  } else {
    newValue = (newValue + 60) % 60
  }

  target[type] = newValue
}

// Handle manual input
const inputValue = ref('')
watch(
  displayValue,
  (val) => {
    inputValue.value = val
  },
  { immediate: true }
)

function handleInputBlur() {
  const isRange = props.type === 'daterange' || props.type === 'datetimerange'
  const fmt = props.format

  if (isRange) {
    const parts = inputValue.value.split(rangeSeparatorText.value)
    if (parts.length === 2) {
      const start = parseDate(parts[0].trim(), fmt)
      const end = parseDate(parts[1].trim(), fmt)
      if (start && end) {
        selectedStartDate.value = start
        selectedEndDate.value = end
        emitValue()
      }
    }
  } else {
    const date = parseDate(inputValue.value, fmt)
    if (date) {
      selectedStartDate.value = date
      emitValue()
    }
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <div
        :class="
          cn(
            'relative flex items-center gap-2 w-full min-w-[200px] h-9 px-3 py-2 text-sm border border-input bg-background rounded-md shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring cursor-pointer',
            props.disabled && 'opacity-50 cursor-not-allowed',
            props.class
          )
        "
        :style="props.style"
      >
        <CalendarIcon class="w-4 h-4 text-muted-foreground shrink-0" />

        <!-- Range input display -->
        <template v-if="type === 'daterange' || type === 'datetimerange'">
          <span v-if="!selectedStartDate && !selectedEndDate" class="text-muted-foreground">
            {{ placeholderText }}
          </span>
          <span v-else class="flex items-center gap-1">
            <span class="text-foreground">{{
              formatDate(selectedStartDate, format) || startPlaceholderText
            }}</span>
            <span class="text-muted-foreground">{{ rangeSeparatorText }}</span>
            <span class="text-foreground">{{
              formatDate(selectedEndDate, format) || endPlaceholderText
            }}</span>
          </span>
        </template>

        <!-- Single date input display -->
        <template v-else>
          <span v-if="!selectedStartDate" class="text-muted-foreground">
            {{ placeholderText }}
          </span>
          <span v-else class="text-foreground">{{ displayValue }}</span>
        </template>

        <!-- Clear button -->
        <button
          v-if="clearable && (selectedStartDate || selectedEndDate)"
          type="button"
          class="absolute right-2 p-0.5 rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          @click.stop="clear"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        class="z-[10001] w-auto p-0 bg-popover border border-border rounded-md shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
      >
        <div class="p-3">
          <!-- Calendar Header -->
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" class="h-7 w-7" @click="prevYear">
                <ChevronLeft class="w-4 h-4" />
                <ChevronLeft class="w-4 h-4 -ml-2" />
              </Button>
              <Button variant="ghost" size="icon-sm" class="h-7 w-7" @click="prevMonth">
                <ChevronLeft class="w-4 h-4" />
              </Button>
            </div>
            <span class="text-sm font-medium">{{ monthYearLabel }}</span>
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" class="h-7 w-7" @click="nextMonth">
                <ChevronRight class="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" class="h-7 w-7" @click="nextYear">
                <ChevronRight class="w-4 h-4" />
                <ChevronRight class="w-4 h-4 -ml-2" />
              </Button>
            </div>
          </div>

          <!-- Weekday Headers -->
          <div class="grid grid-cols-7 mb-2">
            <div
              v-for="day in weekDays"
              :key="day"
              class="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground font-medium"
            >
              {{ day }}
            </div>
          </div>

          <!-- Calendar Grid -->
          <div class="grid grid-cols-7 gap-0">
            <button
              v-for="(day, index) in daysInMonth"
              :key="index"
              type="button"
              :disabled="day.date ? disabledDate?.(day.date) : false"
              :class="
                cn(
                  'h-8 w-8 flex items-center justify-center text-sm rounded-md transition-colors relative',
                  !day.isCurrentMonth && 'text-muted-foreground/50',
                  day.isCurrentMonth && 'text-foreground',
                  day.isToday && !isSelected(day.date!) && 'bg-accent/50 font-medium',
                  day.date && disabledDate?.(day.date) && 'opacity-30 cursor-not-allowed',
                  isSelected(day.date!) && 'bg-primary text-primary-foreground hover:bg-primary/90',
                  isInRange(day.date!) && !isSelected(day.date!) && 'bg-primary/10',
                  isRangeStart(day.date!) && 'rounded-r-none',
                  isRangeEnd(day.date!) && 'rounded-l-none',
                  !isSelected(day.date!) &&
                    !isInRange(day.date!) &&
                    !disabledDate?.(day.date!) &&
                    'hover:bg-accent hover:text-accent-foreground'
                )
              "
              @click="day.date && selectDate(day.date)"
              @mouseenter="day.date && (hoverDate = day.date)"
              @mouseleave="hoverDate = null"
            >
              {{ day.date?.getDate() }}
            </button>
          </div>

          <!-- Time Picker for datetime types -->
          <div
            v-if="type === 'datetime' || type === 'datetimerange'"
            class="mt-4 pt-4 border-t border-border"
          >
            <!-- Single datetime -->
            <div v-if="type === 'datetime'" class="flex items-center gap-4">
              <span class="text-sm text-muted-foreground">时间:</span>
              <div class="flex items-center gap-1">
                <div class="flex flex-col items-center">
                  <button
                    type="button"
                    class="p-0.5 hover:bg-accent rounded"
                    @click="adjustTime('hours', 1, true)"
                  >
                    ▲
                  </button>
                  <span class="text-sm font-mono w-6 text-center">{{
                    String(startTime.hours).padStart(2, '0')
                  }}</span>
                  <button
                    type="button"
                    class="p-0.5 hover:bg-accent rounded"
                    @click="adjustTime('hours', -1, true)"
                  >
                    ▼
                  </button>
                </div>
                <span class="text-lg font-medium -mt-1">:</span>
                <div class="flex flex-col items-center">
                  <button
                    type="button"
                    class="p-0.5 hover:bg-accent rounded"
                    @click="adjustTime('minutes', 1, true)"
                  >
                    ▲
                  </button>
                  <span class="text-sm font-mono w-6 text-center">{{
                    String(startTime.minutes).padStart(2, '0')
                  }}</span>
                  <button
                    type="button"
                    class="p-0.5 hover:bg-accent rounded"
                    @click="adjustTime('minutes', -1, true)"
                  >
                    ▼
                  </button>
                </div>
                <span class="text-lg font-medium -mt-1">:</span>
                <div class="flex flex-col items-center">
                  <button
                    type="button"
                    class="p-0.5 hover:bg-accent rounded"
                    @click="adjustTime('seconds', 1, true)"
                  >
                    ▲
                  </button>
                  <span class="text-sm font-mono w-6 text-center">{{
                    String(startTime.seconds).padStart(2, '0')
                  }}</span>
                  <button
                    type="button"
                    class="p-0.5 hover:bg-accent rounded"
                    @click="adjustTime('seconds', -1, true)"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            <!-- Datetime range -->
            <div v-else class="space-y-3">
              <!-- Start time -->
              <div class="flex items-center gap-4">
                <span class="text-sm text-muted-foreground w-12">开始:</span>
                <div class="flex items-center gap-1">
                  <div class="flex flex-col items-center">
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('hours', 1, true)"
                    >
                      ▲
                    </button>
                    <span class="text-sm font-mono w-6 text-center">{{
                      String(startTime.hours).padStart(2, '0')
                    }}</span>
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('hours', -1, true)"
                    >
                      ▼
                    </button>
                  </div>
                  <span class="text-lg font-medium -mt-1">:</span>
                  <div class="flex flex-col items-center">
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('minutes', 1, true)"
                    >
                      ▲
                    </button>
                    <span class="text-sm font-mono w-6 text-center">{{
                      String(startTime.minutes).padStart(2, '0')
                    }}</span>
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('minutes', -1, true)"
                    >
                      ▼
                    </button>
                  </div>
                  <span class="text-lg font-medium -mt-1">:</span>
                  <div class="flex flex-col items-center">
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('seconds', 1, true)"
                    >
                      ▲
                    </button>
                    <span class="text-sm font-mono w-6 text-center">{{
                      String(startTime.seconds).padStart(2, '0')
                    }}</span>
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('seconds', -1, true)"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>
              <!-- End time -->
              <div class="flex items-center gap-4">
                <span class="text-sm text-muted-foreground w-12">结束:</span>
                <div class="flex items-center gap-1">
                  <div class="flex flex-col items-center">
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('hours', 1, false)"
                    >
                      ▲
                    </button>
                    <span class="text-sm font-mono w-6 text-center">{{
                      String(endTime.hours).padStart(2, '0')
                    }}</span>
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('hours', -1, false)"
                    >
                      ▼
                    </button>
                  </div>
                  <span class="text-lg font-medium -mt-1">:</span>
                  <div class="flex flex-col items-center">
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('minutes', 1, false)"
                    >
                      ▲
                    </button>
                    <span class="text-sm font-mono w-6 text-center">{{
                      String(endTime.minutes).padStart(2, '0')
                    }}</span>
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('minutes', -1, false)"
                    >
                      ▼
                    </button>
                  </div>
                  <span class="text-lg font-medium -mt-1">:</span>
                  <div class="flex flex-col items-center">
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('seconds', 1, false)"
                    >
                      ▲
                    </button>
                    <span class="text-sm font-mono w-6 text-center">{{
                      String(endTime.seconds).padStart(2, '0')
                    }}</span>
                    <button
                      type="button"
                      class="p-0.5 hover:bg-accent rounded"
                      @click="adjustTime('seconds', -1, false)"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" @click="open = false">取消</Button>
              <Button size="sm" @click="confirmDateTime">确定</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
/* Custom scrollbar for time pickers if needed */
::-webkit-scrollbar {
  width: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 2px;
}
</style>
