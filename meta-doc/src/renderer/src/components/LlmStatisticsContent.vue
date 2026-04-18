<template>
  <div class="llm-statistics-content">
    <!-- 日期范围选择 -->
    <div class="date-range-section">
      <Select
        v-model="quickSelect"
        @update:model-value="handleQuickSelect"
        :style="{ width: '170px' }"
      >
        <SelectTrigger>
          <SelectValue :placeholder="$t('llmStatistics.quickSelect')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{{ $t('llmStatistics.all') }}</SelectItem>
          <SelectItem value="today">{{ $t('llmStatistics.today') }}</SelectItem>
          <SelectItem value="thisWeek">{{ $t('llmStatistics.thisWeek') }}</SelectItem>
          <SelectItem value="thisMonth">{{ $t('llmStatistics.thisMonth') }}</SelectItem>
          <SelectItem value="thisYear">{{ $t('llmStatistics.thisYear') }}</SelectItem>
          <SelectItem value="custom">{{ $t('llmStatistics.custom') }}</SelectItem>
        </SelectContent>
      </Select>
      <DatePicker
        v-if="quickSelect !== 'all'"
        v-model="dateRange"
        type="datetimerange"
        class="flex-1 min-w-[280px] max-w-xl"
        :range-separator="$t('llmStatistics.to')"
        :start-placeholder="$t('llmStatistics.startDate')"
        :end-placeholder="$t('llmStatistics.endDate')"
        format="YYYY-MM-DD HH:mm:ss"
        value-format="YYYY-MM-DD HH:mm:ss"
        @change="handleDateRangeChange"
      />
      <div
        v-else
        class="flex min-h-9 min-w-[280px] max-w-xl flex-1 items-center rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
      >
        {{ $t('llmStatistics.allTimeRange') }}
      </div>
      <Button variant="outline" @click="loadAllStatistics">
        {{ $t('llmStatistics.loadAll') }}
      </Button>
    </div>

    <!-- Steam 开发人员模式：账单 / 本地统计 切换 -->
    <div v-if="showSteamDevTabs" class="steam-stat-tabs mb-4 flex flex-wrap gap-2">
      <Button
        size="sm"
        :variant="steamViewTab === 'bill' ? 'default' : 'outline'"
        @click="setSteamTab('bill')"
      >
        {{ $t('llmStatistics.steamLedger.tabBill') }}
      </Button>
      <Button
        size="sm"
        :variant="steamViewTab === 'local' ? 'default' : 'outline'"
        @click="setSteamTab('local')"
      >
        {{ $t('llmStatistics.steamLedger.tabLocal') }}
      </Button>
    </div>

    <!-- Steam 云端账单 -->
    <template v-if="displayMode === 'ledger'">
      <div class="summary-section steam-ledger-summary">
        <div class="summary-item">
          <span class="summary-label">{{ $t('llmStatistics.steamLedger.balance') }}</span>
          <span class="summary-value font-mono">{{ formatNumber(cloudCreditsBalance ?? 0) }}</span>
        </div>
        <div v-if="ledgerSummary" class="summary-item">
          <span class="summary-label">{{ $t('llmStatistics.steamLedger.spentInRange') }}</span>
          <span class="summary-value font-mono">{{ formatNumber(ledgerSummary.credits_spent) }}</span>
        </div>
        <div v-if="ledgerSummary" class="summary-item">
          <span class="summary-label">{{ $t('llmStatistics.steamLedger.addedInRange') }}</span>
          <span class="summary-value font-mono">{{ formatNumber(ledgerSummary.credits_added) }}</span>
        </div>
      </div>

      <div class="ledger-table-wrap rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="whitespace-nowrap">{{ $t('llmStatistics.steamLedger.time') }}</TableHead>
              <TableHead>{{ $t('llmStatistics.steamLedger.kind') }}</TableHead>
              <TableHead>{{ $t('llmStatistics.steamLedger.scenario') }}</TableHead>
              <TableHead>{{ $t('llmStatistics.steamLedger.model') }}</TableHead>
              <TableHead class="text-right">{{ $t('llmStatistics.promptTokens') }}</TableHead>
              <TableHead class="text-right">{{ $t('llmStatistics.completionTokens') }}</TableHead>
              <TableHead class="text-right">{{ $t('llmStatistics.steamLedger.creditsDelta') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="ledgerRows.length === 0 && !ledgerLoading">
              <TableCell colspan="7" class="text-center text-muted-foreground py-8">
                {{ $t('llmStatistics.steamLedger.empty') }}
              </TableCell>
            </TableRow>
            <TableRow v-for="row in ledgerRows" :key="row.id">
              <TableCell class="whitespace-nowrap text-xs font-mono">{{ row.timeLabel }}</TableCell>
              <TableCell>{{ row.kindLabel }}</TableCell>
              <TableCell class="max-w-[140px] truncate" :title="row.scenario">{{ row.scenario }}</TableCell>
              <TableCell class="max-w-[180px] truncate" :title="row.model">{{ row.model }}</TableCell>
              <TableCell class="text-right font-mono">{{ row.promptTok }}</TableCell>
              <TableCell class="text-right font-mono">{{ row.completionTok }}</TableCell>
              <TableCell class="text-right font-mono" :class="row.deltaClass">{{ row.deltaText }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <div v-if="ledgerNextCursor" class="mt-4 flex justify-center">
        <Button variant="outline" size="sm" :disabled="ledgerLoading" @click="loadMoreLedger">
          {{ $t('llmStatistics.steamLedger.loadMore') }}
        </Button>
      </div>
    </template>

    <!-- 本地图表统计（非 Steam，或 Steam 开发人员模式下的「本地统计」） -->
    <template v-else>
      <div class="summary-section">
        <div class="summary-item">
          <span class="summary-label">{{ $t('llmStatistics.totalRequests') }}</span>
          <span class="summary-value">{{ statistics.totalRequests }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">{{ $t('llmStatistics.totalPromptTokens') }}</span>
          <span class="summary-value">{{ formatNumber(statistics.totalPromptTokens) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">{{ $t('llmStatistics.totalCompletionTokens') }}</span>
          <span class="summary-value">{{ formatNumber(statistics.totalCompletionTokens) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">{{ $t('llmStatistics.totalTokens') }}</span>
          <span class="summary-value">{{ formatNumber(statistics.totalTokens) }}</span>
        </div>
      </div>

      <div class="charts-section">
        <div class="chart-container">
          <div class="chart-title">{{ $t('llmStatistics.requestCountChart') }}</div>
          <div ref="requestCountChartRef" class="chart" style="width: 100%; height: 300px"></div>
        </div>
        <div class="chart-container">
          <div class="chart-title">{{ $t('llmStatistics.tokenUsageChart') }}</div>
          <div ref="tokenUsageChartRef" class="chart" style="width: 100%; height: 300px"></div>
        </div>
      </div>
    </template>

    <!-- 清空确认：使用 AlertDialog(z-11000) 而非 GlobalMessageBox，避免叠在统计 Dialog(10000) 下无法点击 -->
    <AlertDialog v-model:open="clearFirstDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ $t('llmStatistics.clearConfirmTitle') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('llmStatistics.clearConfirm') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ $t('llmStatistics.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="onClearFirstConfirm">
            {{ $t('llmStatistics.confirm') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog v-model:open="clearSecondDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ $t('llmStatistics.clearConfirmTitle') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('llmStatistics.clearConfirmAgain') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ $t('llmStatistics.cancel') }}</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="onClearSecondConfirm"
          >
            {{ $t('llmStatistics.confirm') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- 导出格式：AlertDialog(z-11000)，避免叠在统计 Dialog / GlobalMessageBox 下 -->
    <AlertDialog v-model:open="exportDialogOpen">
      <AlertDialogContent class="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ $t('llmStatistics.exportFormatTitle') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('llmStatistics.exportFormatMessage') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup v-model="selectedExportFormat" class="grid gap-3 py-2">
          <div class="flex items-center gap-2">
            <RadioGroupItem id="llm-export-json" value="json" />
            <Label for="llm-export-json" class="cursor-pointer font-normal">{{
              $t('llmStatistics.formatJson')
            }}</Label>
          </div>
          <div class="flex items-center gap-2">
            <RadioGroupItem id="llm-export-csv" value="csv" />
            <Label for="llm-export-csv" class="cursor-pointer font-normal">{{
              $t('llmStatistics.formatCsv')
            }}</Label>
          </div>
          <div class="flex items-center gap-2">
            <RadioGroupItem id="llm-export-xlsx" value="xlsx" />
            <Label for="llm-export-xlsx" class="cursor-pointer font-normal">{{
              $t('llmStatistics.formatXlsx')
            }}</Label>
          </div>
        </RadioGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ $t('llmStatistics.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="onExportDialogConfirm">
            {{ $t('llmStatistics.confirm') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import {
  getStatistics,
  clearStatistics,
  getByokStatistics
} from '../utils/llm-statistics-service.js'
import { isSteamDistribution } from '@common/build-env'
import { getSetting } from '../utils/settings.js'
import eventBus from '../utils/event-bus.js'
import {
  fetchCreditLedger,
  fetchUserCreditsCloud,
  type CreditLedgerItem
} from '../utils/metadoc-credit-ledger.ts'
import * as echarts from 'echarts'
import { toast } from '@renderer/utils/toast'
import { createRendererLogger } from '../utils/logger'
import * as XLSX from 'xlsx'
import messageBridge from '../bridge/message-bridge'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { DatePicker } from '@renderer/components/ui/date-picker'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog-shadcn'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { Label } from '@renderer/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'

// Demo mode support
const props = defineProps<{ isDemo?: boolean }>()

const { t } = useI18n()
const logger = createRendererLogger('LlmStatisticsContent')

const dateRange = ref<[string, string] | null>(null)
const quickSelect = ref<string>('all')

function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/** 自定义日期时的默认区间：本年年初 — 当前时刻 */
function buildRangeYearToNow(): [string, string] {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
  return [formatLocalDateTime(start), formatLocalDateTime(now)]
}
const statistics = ref({
  requests: [] as any[],
  totalRequests: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0
})

const steamBuild = isSteamDistribution()
const devBypass = ref(false)
const steamViewTab = ref<'bill' | 'local'>('bill')

const ledgerItems = ref<CreditLedgerItem[]>([])
const ledgerNextCursor = ref<string | undefined>(undefined)
const ledgerSummary = ref<{ credits_spent: number; credits_added: number } | null>(null)
const ledgerLoading = ref(false)
const cloudCreditsBalance = ref<number | null>(null)

const showSteamDevTabs = computed(() => steamBuild && devBypass.value)

/** ledger：Steam 默认账单，或开发人员模式下的「云端账单」Tab */
const displayMode = computed<'ledger' | 'charts'>(() => {
  if (!steamBuild) return 'charts'
  if (devBypass.value) return steamViewTab.value === 'bill' ? 'ledger' : 'charts'
  return 'ledger'
})

const canClearStatistics = computed(() => {
  if (!steamBuild) return true
  if (devBypass.value && steamViewTab.value === 'local') return true
  return false
})

type LedgerRowVm = {
  id: string
  timeLabel: string
  kindLabel: string
  scenario: string
  model: string
  promptTok: string
  completionTok: string
  deltaText: string
  deltaClass: string
}

const ledgerRows = computed<LedgerRowVm[]>(() => {
  return ledgerItems.value.map((it) => {
    const meta = it.meta || {}
    const scenario =
      typeof meta.scenario === 'string'
        ? meta.scenario
        : typeof meta.scenario === 'number'
          ? String(meta.scenario)
          : '—'
    const model = typeof meta.model === 'string' ? meta.model : '—'
    const pt =
      typeof meta.prompt_tokens === 'number'
        ? meta.prompt_tokens
        : meta.prompt_tokens != null
          ? Number(meta.prompt_tokens)
          : null
    const ct =
      typeof meta.completion_tokens === 'number'
        ? meta.completion_tokens
        : meta.completion_tokens != null
          ? Number(meta.completion_tokens)
          : null
    const d = it.delta_credits
    const deltaText = d > 0 ? `+${d}` : String(d)
    const deltaClass = d < 0 ? 'text-destructive' : d > 0 ? 'text-emerald-600' : ''
    return {
      id: it.id,
      timeLabel: formatLedgerTime(it.created_at),
      kindLabel: ledgerKindLabel(it.kind),
      scenario,
      model,
      promptTok: pt != null && Number.isFinite(pt) ? formatNumber(pt) : '—',
      completionTok: ct != null && Number.isFinite(ct) ? formatNumber(ct) : '—',
      deltaText,
      deltaClass
    }
  })
})

function formatLedgerTime(createdAt: number): string {
  try {
    return new Date(createdAt * 1000).toLocaleString()
  } catch {
    return String(createdAt)
  }
}

function ledgerKindLabel(kind: string): string {
  const map: Record<string, string> = {
    usage: 'llmStatistics.steamLedger.kindUsage',
    purchase: 'llmStatistics.steamLedger.kindPurchase',
    first_purchase: 'llmStatistics.steamLedger.kindFirstPurchase',
    promotion: 'llmStatistics.steamLedger.kindPromotion',
    refund: 'llmStatistics.steamLedger.kindRefund',
    adjustment: 'llmStatistics.steamLedger.kindAdjustment'
  }
  const k = map[kind]
  return k ? t(k) : kind
}

function parseDateRangeToUnix(): { fromSec: number | null; toSec: number | null } {
  if (quickSelect.value === 'all') {
    return { fromSec: null, toSec: null }
  }
  if (!dateRange.value || !dateRange.value[0] || !dateRange.value[1]) {
    return { fromSec: null, toSec: null }
  }
  const a = new Date(dateRange.value[0].replace(' ', 'T'))
  const b = new Date(dateRange.value[1].replace(' ', 'T'))
  const fromMs = a.getTime()
  const toMs = b.getTime()
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { fromSec: null, toSec: null }
  }
  return { fromSec: Math.floor(fromMs / 1000), toSec: Math.floor(toMs / 1000) }
}

const clearFirstDialogOpen = ref(false)
const clearSecondDialogOpen = ref(false)
const exportDialogOpen = ref(false)
const selectedExportFormat = ref<'json' | 'csv' | 'xlsx'>('json')

const requestCountChartRef = ref<HTMLElement | null>(null)
const tokenUsageChartRef = ref<HTMLElement | null>(null)
let requestCountChart: echarts.ECharts | null = null
let tokenUsageChart: echarts.ECharts | null = null

// 获取当前主题类型
const isDarkTheme = computed(() => themeState.currentTheme.type === 'dark')
const textColor = computed(() => themeState.currentTheme.textColor)
const backgroundColor = computed(
  () => themeState.currentTheme.background2nd || themeState.currentTheme.background
)

// 格式化数字
function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num)
}

// 获取 ECharts 主题配置
function getEChartsThemeConfig() {
  const isDark = isDarkTheme.value
  return {
    textStyle: {
      color: textColor.value
    },
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
      textStyle: {
        color: textColor.value
      }
    },
    legend: {
      textStyle: {
        color: textColor.value
      }
    },
    grid: {
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    },
    xAxis: {
      axisLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
        }
      },
      axisLabel: {
        color: textColor.value
      },
      splitLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
        }
      }
    },
    yAxis: {
      axisLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
        }
      },
      axisLabel: {
        color: textColor.value
      },
      splitLine: {
        lineStyle: {
          color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
        }
      },
      nameTextStyle: {
        color: textColor.value
      }
    }
  }
}

async function refreshDevBypass() {
  try {
    devBypass.value = (await getSetting('steamDeveloperBypassByok')) === true
  } catch {
    devBypass.value = false
  }
}

function loadDemoLedger() {
  const now = Math.floor(Date.now() / 1000)
  ledgerItems.value = [
    {
      id: 'demo-1',
      created_at: now - 7200,
      kind: 'first_purchase',
      delta_credits: 500,
      balance_after: 500,
      meta: {}
    },
    {
      id: 'demo-2',
      created_at: now - 3600,
      kind: 'usage',
      delta_credits: -42,
      balance_after: 458,
      meta: {
        model: 'gpt-4.1',
        prompt_tokens: 1200,
        completion_tokens: 800,
        scenario: 'chat_stream'
      }
    },
    {
      id: 'demo-3',
      created_at: now - 1800,
      kind: 'purchase',
      delta_credits: 200,
      balance_after: 658,
      meta: { order_id: 'ord_demo', item_id: '100' }
    }
  ]
  ledgerSummary.value = { credits_spent: 42, credits_added: 700 }
  cloudCreditsBalance.value = 658
  ledgerNextCursor.value = undefined
}

async function loadSteamLedger(reset: boolean) {
  ledgerLoading.value = true
  try {
    const { fromSec, toSec } = parseDateRangeToUnix()
    const bal = await fetchUserCreditsCloud()
    cloudCreditsBalance.value = bal
    const cursor = reset ? undefined : ledgerNextCursor.value
    if (reset) {
      ledgerItems.value = []
    }
    const res = await fetchCreditLedger({
      fromSec: fromSec ?? undefined,
      toSec: toSec ?? undefined,
      limit: 50,
      cursor: cursor ?? null,
      includeSummary: true
    })
    ledgerItems.value = reset ? res.items : [...ledgerItems.value, ...res.items]
    ledgerNextCursor.value = res.next_cursor
    ledgerSummary.value = res.summary ?? null
  } catch (error) {
    logger.error('加载云端账单失败:', error)
    toast.error(t('llmStatistics.steamLedger.ledgerLoadFailed'))
  } finally {
    ledgerLoading.value = false
  }
}

async function loadMoreLedger() {
  if (!ledgerNextCursor.value || ledgerLoading.value) return
  await loadSteamLedger(false)
}

// Demo data generator
const loadDemoData = () => {
  const today = new Date()
  const demoRequests = []
  const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'gemini-pro']
  const types = ['chat', 'completion', 'embedding']

  // Generate 30 days of demo data
  for (let i = 0; i < 30; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    const dayRequests = Math.floor(Math.random() * 50) + 10

    for (let j = 0; j < dayRequests; j++) {
      const promptTokens = Math.floor(Math.random() * 2000) + 100
      const completionTokens = Math.floor(Math.random() * 1000) + 50
      demoRequests.push({
        timestamp: `${dateStr}T${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}Z`,
        date: dateStr,
        model: models[Math.floor(Math.random() * models.length)],
        type: types[Math.floor(Math.random() * types.length)],
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      })
    }
  }

  statistics.value = {
    requests: demoRequests,
    totalRequests: demoRequests.length,
    totalPromptTokens: demoRequests.reduce((sum, r) => sum + r.prompt_tokens, 0),
    totalCompletionTokens: demoRequests.reduce((sum, r) => sum + r.completion_tokens, 0),
    totalTokens: demoRequests.reduce((sum, r) => sum + r.total_tokens, 0)
  }
}

// 加载统计数据
async function loadStatistics() {
  if (props.isDemo) {
    if (displayMode.value === 'ledger') {
      loadDemoLedger()
    } else {
      loadDemoData()
      await nextTick()
      updateCharts()
    }
    return
  }

  if (displayMode.value === 'ledger') {
    await loadSteamLedger(true)
    return
  }

  try {
    let startDate: Date | undefined = undefined
    let endDate: Date | undefined = undefined

    if (
      quickSelect.value !== 'all' &&
      dateRange.value &&
      dateRange.value[0] &&
      dateRange.value[1]
    ) {
      startDate = new Date(dateRange.value[0].replace(' ', 'T'))
      endDate = new Date(dateRange.value[1].replace(' ', 'T'))
    }

    const data =
      steamBuild && devBypass.value && steamViewTab.value === 'local'
        ? await (getByokStatistics as (s?: Date, e?: Date) => Promise<typeof statistics.value>)(
            startDate,
            endDate
          )
        : await (getStatistics as (s?: Date, e?: Date) => Promise<typeof statistics.value>)(
            startDate,
            endDate
          )
    statistics.value = data as any
    await nextTick()
    updateCharts()
  } catch (error) {
    logger.error('加载统计数据失败:', error)
    toast.error(t('llmStatistics.loadFailed'))
  }
}

// 与下拉「全部」一致：不按时间筛选
function loadAllStatistics() {
  quickSelect.value = 'all'
  dateRange.value = null
  loadStatistics()
}

// 处理日期范围变化
function handleDateRangeChange() {
  quickSelect.value = 'custom'
  loadStatistics()
}

// 处理快速选择
function handleQuickSelect(value: string) {
  if (value === 'all') {
    dateRange.value = null
    loadStatistics()
    return
  }

  if (value === 'custom') {
    if (!dateRange.value || !dateRange.value[0] || !dateRange.value[1]) {
      dateRange.value = buildRangeYearToNow()
    }
    loadStatistics()
    return
  }

  const now = new Date()
  let startDate: Date
  let endDate: Date = new Date(now)

  switch (value) {
    case 'today': {
      // 今天：从今天 00:00:00 到现在
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      break
    }
    case 'thisWeek': {
      // 本周：从本周一 00:00:00 到现在
      const dayOfWeek = now.getDay()
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // 周一是 0
      startDate = new Date(now)
      startDate.setDate(now.getDate() - diff)
      startDate.setHours(0, 0, 0, 0)
      break
    }
    case 'thisMonth': {
      // 本月：从本月 1 号 00:00:00 到现在
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      break
    }
    case 'thisYear': {
      // 本年：从今年 1 月 1 号 00:00:00 到现在
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
      break
    }
    default:
      return
  }

  dateRange.value = [formatLocalDateTime(startDate), formatLocalDateTime(endDate)]
  loadStatistics()
}

// 更新图表
function updateCharts() {
  updateRequestCountChart()
  updateTokenUsageChart()
}

// 更新请求次数折线图
function updateRequestCountChart() {
  if (!requestCountChartRef.value) return

  if (!requestCountChart) {
    requestCountChart = echarts.init(requestCountChartRef.value)
  }

  // 按日期聚合请求数
  const dateMap = new Map<string, number>()
  statistics.value.requests.forEach((req: any) => {
    const date = req.date || req.timestamp.split('T')[0]
    dateMap.set(date, (dateMap.get(date) || 0) + 1)
  })

  const dates = Array.from(dateMap.keys()).sort()
  const counts = dates.map((date) => dateMap.get(date) || 0)

  const themeConfig = getEChartsThemeConfig()
  const isDark = isDarkTheme.value

  const option = {
    ...themeConfig,
    tooltip: {
      ...themeConfig.tooltip,
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
      borderColor: themeConfig.grid.borderColor
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLabel: {
        rotate: 45,
        color: themeConfig.xAxis.axisLabel.color
      },
      axisLine: themeConfig.xAxis.axisLine,
      splitLine: themeConfig.xAxis.splitLine
    },
    yAxis: {
      type: 'value',
      name: t('llmStatistics.requestCount'),
      axisLabel: themeConfig.yAxis.axisLabel,
      axisLine: themeConfig.yAxis.axisLine,
      splitLine: themeConfig.yAxis.splitLine,
      nameTextStyle: themeConfig.yAxis.nameTextStyle
    },
    series: [
      {
        name: t('llmStatistics.requestCount'),
        type: 'line',
        smooth: true,
        data: counts,
        itemStyle: {
          color: '#409EFF'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: isDark ? 'rgba(64, 158, 255, 0.4)' : 'rgba(64, 158, 255, 0.3)' },
              { offset: 1, color: isDark ? 'rgba(64, 158, 255, 0.1)' : 'rgba(64, 158, 255, 0.1)' }
            ]
          }
        }
      }
    ]
  }

  requestCountChart.setOption(option)
}

// 更新 Token 用量柱状图
function updateTokenUsageChart() {
  if (!tokenUsageChartRef.value) return

  if (!tokenUsageChart) {
    tokenUsageChart = echarts.init(tokenUsageChartRef.value)
  }

  // 按日期聚合 token 用量
  const dateMap = new Map<string, { prompt: number; completion: number; total: number }>()
  statistics.value.requests.forEach((req: any) => {
    const date = req.date || req.timestamp.split('T')[0]
    const existing = dateMap.get(date) || { prompt: 0, completion: 0, total: 0 }
    existing.prompt += req.prompt_tokens || 0
    existing.completion += req.completion_tokens || 0
    existing.total += req.total_tokens || 0
    dateMap.set(date, existing)
  })

  const dates = Array.from(dateMap.keys()).sort()
  const promptTokens = dates.map((date) => dateMap.get(date)?.prompt || 0)
  const completionTokens = dates.map((date) => dateMap.get(date)?.completion || 0)
  const totalTokens = dates.map((date) => dateMap.get(date)?.total || 0)

  const themeConfig = getEChartsThemeConfig()

  const option = {
    ...themeConfig,
    tooltip: {
      ...themeConfig.tooltip,
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    legend: {
      ...themeConfig.legend,
      data: [
        t('llmStatistics.promptTokens'),
        t('llmStatistics.completionTokens'),
        t('llmStatistics.totalTokens')
      ]
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
      borderColor: themeConfig.grid.borderColor
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        rotate: 45,
        color: themeConfig.xAxis.axisLabel.color
      },
      axisLine: themeConfig.xAxis.axisLine,
      splitLine: themeConfig.xAxis.splitLine
    },
    yAxis: {
      type: 'value',
      name: t('llmStatistics.tokenCount'),
      axisLabel: themeConfig.yAxis.axisLabel,
      axisLine: themeConfig.yAxis.axisLine,
      splitLine: themeConfig.yAxis.splitLine,
      nameTextStyle: themeConfig.yAxis.nameTextStyle
    },
    series: [
      {
        name: t('llmStatistics.promptTokens'),
        type: 'bar',
        data: promptTokens,
        itemStyle: { color: '#67C23A' }
      },
      {
        name: t('llmStatistics.completionTokens'),
        type: 'bar',
        data: completionTokens,
        itemStyle: { color: '#E6A23C' }
      },
      {
        name: t('llmStatistics.totalTokens'),
        type: 'bar',
        data: totalTokens,
        itemStyle: { color: '#409EFF' }
      }
    ]
  }

  tokenUsageChart.setOption(option)
}

// 将数据转换为 CSV 格式
function convertToCSV(data: any): string {
  const { requests } = data

  // CSV 表头
  const headers = [
    t('llmStatistics.csvHeaders.timestamp'),
    t('llmStatistics.csvHeaders.date'),
    t('llmStatistics.csvHeaders.model'),
    t('llmStatistics.csvHeaders.type'),
    t('llmStatistics.csvHeaders.promptTokens'),
    t('llmStatistics.csvHeaders.completionTokens'),
    t('llmStatistics.csvHeaders.totalTokens')
  ]

  // 转义 CSV 字段（处理包含逗号、引号或换行符的值）
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) {
      return ''
    }
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  // 构建 CSV 内容
  const rows = [headers.map(escapeCSV).join(',')]

  // 添加汇总行
  rows.push(
    [
      t('llmStatistics.csvHeaders.summary'),
      '',
      '',
      '',
      data.totalPromptTokens || 0,
      data.totalCompletionTokens || 0,
      data.totalTokens || 0
    ]
      .map(escapeCSV)
      .join(',')
  )

  rows.push('') // 空行分隔

  // 添加详细数据
  requests.forEach((req: any) => {
    rows.push(
      [
        req.timestamp || '',
        req.date || '',
        req.model || '',
        req.type || '',
        req.prompt_tokens || 0,
        req.completion_tokens || 0,
        req.total_tokens || 0
      ]
        .map(escapeCSV)
        .join(',')
    )
  })

  return rows.join('\n')
}

// 将数据转换为 XLSX 格式
function convertToXLSX(data: any): ArrayBuffer {
  const { requests } = data

  // 创建工作簿
  const wb = XLSX.utils.book_new()

  // 创建汇总表
  const summaryData = [
    [t('llmStatistics.xlsxHeaders.metric'), t('llmStatistics.xlsxHeaders.value')],
    [t('llmStatistics.totalRequests'), data.totalRequests || 0],
    [t('llmStatistics.totalPromptTokens'), data.totalPromptTokens || 0],
    [t('llmStatistics.totalCompletionTokens'), data.totalCompletionTokens || 0],
    [t('llmStatistics.totalTokens'), data.totalTokens || 0]
  ]
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, summaryWs, t('llmStatistics.xlsxSheetNames.summary'))

  // 创建详细数据表
  const detailData = [
    [
      t('llmStatistics.xlsxHeaders.timestamp'),
      t('llmStatistics.xlsxHeaders.date'),
      t('llmStatistics.xlsxHeaders.model'),
      t('llmStatistics.xlsxHeaders.type'),
      t('llmStatistics.xlsxHeaders.promptTokens'),
      t('llmStatistics.xlsxHeaders.completionTokens'),
      t('llmStatistics.xlsxHeaders.totalTokens')
    ]
  ]

  requests.forEach((req: any) => {
    detailData.push([
      req.timestamp || '',
      req.date || '',
      req.model || '',
      req.type || '',
      req.prompt_tokens || 0,
      req.completion_tokens || 0,
      req.total_tokens || 0
    ])
  })

  const detailWs = XLSX.utils.aoa_to_sheet(detailData)
  // 设置列宽
  detailWs['!cols'] = [
    { wch: 20 }, // timestamp
    { wch: 12 }, // date
    { wch: 20 }, // model
    { wch: 12 }, // type
    { wch: 15 }, // prompt_tokens
    { wch: 15 }, // completion_tokens
    { wch: 15 } // total_tokens
  ]
  XLSX.utils.book_append_sheet(wb, detailWs, t('llmStatistics.xlsxSheetNames.details'))

  // 转换为 ArrayBuffer
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function convertLedgerToCSV(items: CreditLedgerItem[]): string {
  const headers = [
    t('llmStatistics.steamLedger.time'),
    t('llmStatistics.steamLedger.kind'),
    t('llmStatistics.steamLedger.creditsDelta'),
    'balance',
    t('llmStatistics.steamLedger.metaJson')
  ]
  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  const rows = [headers.map(escapeCSV).join(',')]
  for (const it of items) {
    rows.push(
      [
        formatLedgerTime(it.created_at),
        it.kind,
        it.delta_credits,
        it.balance_after ?? '',
        JSON.stringify(it.meta || {})
      ]
        .map(escapeCSV)
        .join(',')
    )
  }
  return rows.join('\n')
}

function convertLedgerToXLSX(items: CreditLedgerItem[]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const rows: (string | number)[][] = [
    [
      t('llmStatistics.steamLedger.time'),
      t('llmStatistics.steamLedger.kind'),
      t('llmStatistics.steamLedger.creditsDelta'),
      'balance',
      t('llmStatistics.steamLedger.metaJson')
    ]
  ]
  for (const it of items) {
    rows.push([
      formatLedgerTime(it.created_at),
      it.kind,
      it.delta_credits,
      it.balance_after ?? '',
      JSON.stringify(it.meta || {})
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'ledger')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

async function executeLedgerExport(format: 'json' | 'csv' | 'xlsx') {
  let items: CreditLedgerItem[] = []
  if (props.isDemo) {
    loadDemoLedger()
    items = [...ledgerItems.value]
  } else {
    const { fromSec, toSec } = parseDateRangeToUnix()
    let cursor: string | undefined
    let nextCur: string | undefined
    do {
      const batch = await fetchCreditLedger({
        fromSec: fromSec ?? undefined,
        toSec: toSec ?? undefined,
        limit: 200,
        cursor: nextCur ?? null,
        includeSummary: false
      })
      items.push(...batch.items)
      nextCur = batch.next_cursor
    } while (nextCur)
  }

  const dateStr =
    quickSelect.value === 'all' ||
    !dateRange.value ||
    !dateRange.value[0] ||
    !dateRange.value[1]
      ? 'all'
      : `${dateRange.value[0].split(' ')[0]}_${dateRange.value[1].split(' ')[0]}`

  let filters: Array<{ name: string; extensions: string[] }> = []
  let defaultFileName = ''
  let fileContent: string | ArrayBuffer = ''

  switch (format) {
    case 'json':
      filters = [{ name: 'JSON Files', extensions: ['json'] }]
      defaultFileName = `llm-credit-ledger-${dateStr}.json`
      fileContent = JSON.stringify(items, null, 2)
      break
    case 'csv':
      filters = [{ name: 'CSV Files', extensions: ['csv'] }]
      defaultFileName = `llm-credit-ledger-${dateStr}.csv`
      fileContent = convertLedgerToCSV(items)
      break
    case 'xlsx':
      filters = [{ name: 'Excel Files', extensions: ['xlsx'] }]
      defaultFileName = `llm-credit-ledger-${dateStr}.xlsx`
      fileContent = convertLedgerToXLSX(items)
      break
    default:
      throw new Error('不支持的导出格式')
  }

  const dialogResult = await messageBridge.invoke('save-file-dialog', {
    defaultName: defaultFileName,
    filters: filters
  })

  if (dialogResult.canceled || !dialogResult.filePath) {
    return
  }

  if (format === 'xlsx') {
    const buffer = fileContent as ArrayBuffer
    const uint8Array = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize)
      binary += String.fromCharCode.apply(null, Array.from(chunk) as any)
    }
    const base64 = btoa(binary)
    await messageBridge.invoke('write-file-content', {
      filePath: dialogResult.filePath,
      content: base64,
      encoding: 'base64'
    })
  } else {
    await messageBridge.invoke('write-file-content', {
      filePath: dialogResult.filePath,
      content: fileContent as string,
      encoding: 'utf8'
    })
  }

  toast.success(t('llmStatistics.exportSuccess'))
}

async function executeExportWithFormat(format: 'json' | 'csv' | 'xlsx') {
  if (steamBuild && displayMode.value === 'ledger') {
    await executeLedgerExport(format)
    return
  }

  let startDate: Date | undefined = undefined
  let endDate: Date | undefined = undefined

  if (
    quickSelect.value !== 'all' &&
    dateRange.value &&
    dateRange.value[0] &&
    dateRange.value[1]
  ) {
    startDate = new Date(dateRange.value[0].replace(' ', 'T'))
    endDate = new Date(dateRange.value[1].replace(' ', 'T'))
  }

  const stats =
    steamBuild && devBypass.value && steamViewTab.value === 'local'
      ? await (getByokStatistics as (s?: Date, e?: Date) => Promise<typeof statistics.value>)(
          startDate,
          endDate
        )
      : await (getStatistics as (s?: Date, e?: Date) => Promise<typeof statistics.value>)(
          startDate,
          endDate
        )
  const dateStr =
    quickSelect.value === 'all' ||
    !dateRange.value ||
    !dateRange.value[0] ||
    !dateRange.value[1]
      ? 'all'
      : `${dateRange.value[0].split(' ')[0]}_${dateRange.value[1].split(' ')[0]}`

  let filters: Array<{ name: string; extensions: string[] }> = []
  let defaultFileName = ''
  let fileContent: string | ArrayBuffer = ''

  switch (format) {
    case 'json':
      filters = [{ name: 'JSON Files', extensions: ['json'] }]
      defaultFileName = `llm-statistics-${dateStr}.json`
      fileContent = JSON.stringify(stats, null, 2)
      break
    case 'csv':
      filters = [{ name: 'CSV Files', extensions: ['csv'] }]
      defaultFileName = `llm-statistics-${dateStr}.csv`
      fileContent = convertToCSV(stats)
      break
    case 'xlsx':
      filters = [{ name: 'Excel Files', extensions: ['xlsx'] }]
      defaultFileName = `llm-statistics-${dateStr}.xlsx`
      fileContent = convertToXLSX(stats)
      break
    default:
      throw new Error('不支持的导出格式')
  }

  const dialogResult = await messageBridge.invoke('save-file-dialog', {
    defaultName: defaultFileName,
    filters: filters
  })

  if (dialogResult.canceled || !dialogResult.filePath) {
    return
  }

  if (format === 'xlsx') {
    const buffer = fileContent as ArrayBuffer
    const uint8Array = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize)
      binary += String.fromCharCode.apply(null, Array.from(chunk) as any)
    }
    const base64 = btoa(binary)
    await messageBridge.invoke('write-file-content', {
      filePath: dialogResult.filePath,
      content: base64,
      encoding: 'base64'
    })
  } else {
    await messageBridge.invoke('write-file-content', {
      filePath: dialogResult.filePath,
      content: fileContent as string,
      encoding: 'utf8'
    })
  }

  toast.success(t('llmStatistics.exportSuccess'))
}

async function onExportDialogConfirm() {
  try {
    await executeExportWithFormat(selectedExportFormat.value)
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      logger.error('导出统计数据失败:', error)
      toast.error(t('llmStatistics.exportFailed'))
    }
  }
}

// 导出统计（暴露给父组件使用）
async function handleExport() {
  if (props.isDemo) {
    toast.success(
      displayMode.value === 'ledger'
        ? 'Demo mode: Credit ledger export (simulated)'
        : 'Demo mode: Statistics exported (simulated)'
    )
    return
  }

  selectedExportFormat.value = 'json'
  exportDialogOpen.value = true
}

function onClearFirstConfirm() {
  nextTick(() => {
    clearSecondDialogOpen.value = true
  })
}

async function onClearSecondConfirm() {
  try {
    await clearStatistics()
    await loadStatistics()
    toast.success(t('llmStatistics.clearSuccess'))
  } catch (error) {
    logger.error('清空统计数据失败:', error)
    toast.error(t('llmStatistics.clearFailed'))
  }
}

// 清空统计（暴露给父组件使用）
async function handleClear() {
  if (!canClearStatistics.value) {
    toast.info(t('llmStatistics.steamLedger.clearDisabled'))
    return
  }

  // Demo mode: simulate clear
  if (props.isDemo) {
    toast.success('Demo mode: Statistics cleared (simulated)')
    statistics.value = {
      requests: [],
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0
    }
    ledgerItems.value = []
    ledgerSummary.value = null
    await nextTick()
    updateCharts()
    return
  }

  clearFirstDialogOpen.value = true
}

// 暴露方法给父组件
defineExpose({
  handleExport,
  handleClear,
  loadStatistics,
  canClearStatistics
})

// 监听主题变化，重新渲染图表
watch(
  () => themeState.currentTheme.type,
  () => {
    nextTick(() => {
      if (displayMode.value === 'charts') {
        updateCharts()
      }
    })
  }
)

function setSteamTab(tab: 'bill' | 'local') {
  steamViewTab.value = tab
  void loadStatistics()
}

// 窗口大小变化时调整图表
function handleResize() {
  if (requestCountChart) {
    requestCountChart.resize()
  }
  if (tokenUsageChart) {
    tokenUsageChart.resize()
  }
}

async function onDevPipelineChanged() {
  await refreshDevBypass()
  await loadStatistics()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  eventBus.on('metadoc-dev-ai-pipeline-changed', onDevPipelineChanged)
  void (async () => {
    await refreshDevBypass()
    await loadStatistics()
  })()
})

onBeforeUnmount(() => {
  eventBus.off('metadoc-dev-ai-pipeline-changed', onDevPipelineChanged)
  window.removeEventListener('resize', handleResize)
  if (requestCountChart) {
    requestCountChart.dispose()
    requestCountChart = null
  }
  if (tokenUsageChart) {
    tokenUsageChart.dispose()
    tokenUsageChart = null
  }
})
</script>

<style scoped>
.llm-statistics-content {
  padding: 8px 0;
}

.date-range-section {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.summary-section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background-color: v-bind(
    'themeState.currentTheme.background2nd || themeState.currentTheme.background'
  );
  border-radius: 8px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.summary-label {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.7;
}

.summary-value {
  font-size: 20px;
  font-weight: bold;
  color: v-bind('themeState.currentTheme.textColor');
}

.charts-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.chart-container {
  background-color: v-bind(
    'themeState.currentTheme.background2nd || themeState.currentTheme.background'
  );
  border-radius: 8px;
  padding: 16px;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: v-bind('themeState.currentTheme.textColor');
}

.chart {
  min-height: 300px;
}
</style>
