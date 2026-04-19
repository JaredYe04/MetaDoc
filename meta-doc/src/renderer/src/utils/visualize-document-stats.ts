import type { DocumentOutlineNode } from '../../../types'
import type { EChartsOption } from 'echarts'

/** Tooltip 挂到 body、不限定在画布内，避免被 panel overflow 裁切 */
export function patchTooltipUnclip(option: EChartsOption): EChartsOption {
  if (!option || typeof option !== 'object') return option
  const tip = option.tooltip
  if (tip === undefined) {
    return {
      ...option,
      tooltip: {
        appendToBody: true,
        confine: false,
        extraCssText: 'z-index:2147483646'
      }
    }
  }
  if (Array.isArray(tip)) return option
  const cur = { ...(tip as Record<string, unknown>) }
  const extra = [cur.extraCssText, 'z-index:2147483646'].filter(Boolean).join(';')
  return {
    ...option,
    tooltip: {
      ...cur,
      appendToBody: true,
      confine: false,
      extraCssText: extra
    }
  }
}

/** 与 themeState.currentTheme 对齐：仅轴、空状态文案（系列色使用 ECharts 默认调色） */
export interface VisualizeChartThemeSlice {
  type: 'light' | 'dark'
  textColor2: string
}

export interface SunburstNodeDatum {
  name: string
  value: number
  /** 完整标题，供 tooltip 使用 */
  fullTitle: string
  children?: SunburstNodeDatum[]
}

export interface SunburstLabels {
  seriesName: string
  unnamedSection: string
  emptyOutline: string
  tooltipChars: string
}

/** 扇区标签最大字符数（超出用省略号） */
const SUNBURST_LABEL_MAX_LEN = 12

function ellipsizeLabel(text: string, maxLen: number): string {
  const t = text.trim()
  if (t.length <= maxLen) return t
  return t.slice(0, Math.max(1, maxLen - 1)) + '…'
}

function buildSunburstData(
  node: DocumentOutlineNode,
  unnamedSection: string,
  maxLabelLen: number
): SunburstNodeDatum | null {
  const fullTitle = (node.title?.trim() || unnamedSection).slice(0, 500)
  const name = ellipsizeLabel(fullTitle, maxLabelLen)
  const self = (node.title?.length ?? 0) + (node.text?.length ?? 0)
  const rawKids = node.children ?? []
  if (rawKids.length === 0) {
    const v = Math.max(1, self)
    return { name, value: v, fullTitle }
  }
  const children: SunburstNodeDatum[] = []
  for (let i = 0; i < rawKids.length; i++) {
    const c = buildSunburstData(rawKids[i], unnamedSection, maxLabelLen)
    if (c) children.push(c)
  }
  const sumKids = children.reduce((s, c) => s + c.value, 0)
  const value = Math.max(1, self + sumKids)
  return { name, value, fullTitle, children }
}

/** 将大纲树转为旭日图 data；无有效子树时返回 null */
export function buildSunburstDataFromOutline(
  root: DocumentOutlineNode | null,
  unnamedSection: string,
  maxLabelLen = SUNBURST_LABEL_MAX_LEN
): SunburstNodeDatum[] | null {
  if (!root?.children?.length) return null
  let tree = root
  if (tree.children.length === 1) {
    tree = tree.children[0]
  }
  const kids = tree.children ?? []
  if (!kids.length) return null
  const built: SunburstNodeDatum[] = []
  for (let i = 0; i < kids.length; i++) {
    const b = buildSunburstData(kids[i], unnamedSection, maxLabelLen)
    if (b) built.push(b)
  }
  if (!built.length) return null
  return built
}

export function buildOutlineSunburstOption(
  root: DocumentOutlineNode | null,
  labels: SunburstLabels,
  theme: VisualizeChartThemeSlice
): EChartsOption {
  const data = buildSunburstDataFromOutline(root, labels.unnamedSection)
  if (!data?.length) {
    return {
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: labels.emptyOutline,
          fill: theme.textColor2,
          fontSize: 13
        }
      }
    }
  }

  return patchTooltipUnclip({
    tooltip: {
      trigger: 'item',
      formatter: (p: {
        value?: number
        treePathInfo?: { name: string; data?: SunburstNodeDatum }[]
      }) => {
        const parts = (p.treePathInfo || []).map((x) => x.data?.fullTitle ?? x.name)
        const display = parts.filter(Boolean).join(' / ')
        return `${display}<br/>${labels.tooltipChars}: ${p.value ?? 0}`
      }
    },
    series: [
      {
        type: 'sunburst',
        name: labels.seriesName,
        data: data as unknown as object[],
        radius: [0, '98%'],
        center: ['50%', '50%'],
        sort: undefined,
        emphasis: {
          focus: 'ancestor'
        },
        label: {
          rotate: 'radial',
          minAngle: 6,
          overflow: 'truncate',
          ellipsis: '…'
        }
      }
    ]
  })
}

export interface TopWordItem {
  text: string
  size: number
}

export interface ThemeRiverLabels {
  emptyPlainText: string
  emptyNoWords: string
  /** 各分段统计均为 0 时的提示 */
  themeRiverNoHits: string
  /** 横轴名称（多行说明刻度含义） */
  axisCaption: string
  /** 横轴刻度简写，segmentIndex 为 0..binCount-1 */
  binTickLabel: (segmentIndex: number) => string
  /** tooltip 中次数单位，如「次」 */
  hitUnit: string
}

const THEME_RIVER_BIN_COUNT = 20
const THEME_RIVER_TOP_N = 8

function getCharBinBounds(len: number, binCount: number): { start: number; end: number }[] {
  const bounds: { start: number; end: number }[] = []
  const base = Math.floor(len / binCount)
  let rem = len % binCount
  let start = 0
  for (let i = 0; i < binCount; i++) {
    const w = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem--
    const end = Math.min(len, start + w)
    bounds.push({ start, end })
    start = end
  }
  return bounds
}

function countWordInRange(text: string, start: number, end: number, word: string): number {
  const lo = Math.max(0, start)
  const hi = Math.min(text.length, end)
  if (!word || hi <= lo) return 0
  let cnt = 0
  const last = hi - word.length
  for (let i = lo; i <= last; i++) {
    if (text.substring(i, i + word.length) === word) cnt++
  }
  return cnt
}

/** 主题河流：沿文稿位置展示 Top 词在各字符窗口内的出现次数（与右侧词频趋势口径一致，按子串匹配） */
export function buildTopWordsThemeRiverOption(
  plainText: string,
  topWords: TopWordItem[],
  labels: ThemeRiverLabels,
  theme: VisualizeChartThemeSlice
): EChartsOption {
  if (!plainText?.trim()) {
    return {
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: labels.emptyPlainText,
          fill: theme.textColor2,
          fontSize: 13
        }
      }
    }
  }

  const words = topWords.filter((w) => w.text && w.text.length > 0).slice(0, THEME_RIVER_TOP_N)
  if (!words.length) {
    return {
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: labels.emptyNoWords,
          fill: theme.textColor2,
          fontSize: 13
        }
      }
    }
  }

  const len = plainText.length
  const bounds = getCharBinBounds(len, THEME_RIVER_BIN_COUNT)

  // 首维必须用数值：themeRiver 内部按 (timeDim[a] - timeDim[b]) 排序，category 字符串会得到 NaN，布局崩溃
  const riverData: [number, number, string][] = []
  for (const w of words) {
    for (let i = 0; i < THEME_RIVER_BIN_COUNT; i++) {
      const { start, end } = bounds[i]
      const c = countWordInRange(plainText, start, end, w.text)
      riverData.push([i, c, w.text])
    }
  }

  let maxCount = 0
  for (let r = 0; r < riverData.length; r++) {
    if (riverData[r][1] > maxCount) maxCount = riverData[r][1]
  }
  if (maxCount === 0) {
    return {
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: labels.themeRiverNoHits,
          fill: theme.textColor2,
          fontSize: 13
        }
      }
    }
  }

  const lastIdx = THEME_RIVER_BIN_COUNT - 1
  const legendData = words.map((w) => w.text)

  return patchTooltipUnclip({
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        // themeRiver 只有一条 series，seriesName 常为默认的 series0；词在 data[2]（encode itemName）
        type Tip = {
          axisValueLabel?: string
          axisValue?: string | number
          seriesName?: string
          name?: string
          value?: number | number[]
          data?: unknown
        }
        const raw = params as Tip | Tip[]
        const items = Array.isArray(raw) ? raw : raw ? [raw] : []
        if (!items.length) return ''
        const head = items[0]!
        const ax = head.axisValueLabel ?? String(head.axisValue ?? '')
        const u = labels.hitUnit ? ` ${labels.hitUnit}` : ''
        const tupleFromTip = (p: Tip): [number, number, string] | null => {
          const tryArr = (a: unknown): [number, number, string] | null => {
            if (!Array.isArray(a) || a.length < 3 || typeof a[2] !== 'string') return null
            return [a[0] as number, a[1] as number, a[2]]
          }
          const fromVal = tryArr(p.value)
          if (fromVal) return fromVal
          const d = p.data
          const fromArr = tryArr(d)
          if (fromArr) return fromArr
          if (d && typeof d === 'object' && !Array.isArray(d) && 'value' in d) {
            const inner = (d as { value?: unknown }).value
            return tryArr(inner)
          }
          return null
        }
        const wordFrom = (p: Tip): string => {
          const t = tupleFromTip(p)
          if (t) return t[2]
          if (typeof p.name === 'string' && p.name.trim()) return p.name
          return ''
        }
        const countFrom = (p: Tip): number => {
          const t = tupleFromTip(p)
          if (t) return t[1]
          const val = p.value
          if (Array.isArray(val) && typeof val[1] === 'number') return val[1]
          if (Array.isArray(val) && typeof val[0] === 'number' && val.length === 1)
            return val[0] as number
          const v = Array.isArray(val) ? val[0] : val
          return typeof v === 'number' ? v : 0
        }
        const lines = items.map((p) => {
          const sn = String(p.seriesName ?? '')
          const label = wordFrom(p) || (/^series\d+$/i.test(sn) ? '' : sn)
          const cnt = countFrom(p)
          return `${label || '—'}: ${cnt}${u}`
        })
        return `${ax}<br/>${lines.join('<br/>')}`
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: theme.type === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'
        }
      }
    },
    legend: {
      type: 'scroll',
      orient: 'horizontal',
      bottom: 36,
      left: 'center',
      width: '92%',
      data: legendData,
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 10,
      pageTextStyle: { color: theme.textColor2 },
      textStyle: { fontSize: 10, color: theme.textColor2 }
    },
    singleAxis: {
      type: 'value',
      min: 0,
      max: lastIdx,
      interval: 1,
      bottom: 10,
      axisTick: { show: true },
      axisLine: { show: true, lineStyle: { color: theme.textColor2 } },
      splitLine: { show: false },
      axisLabel: {
        color: theme.textColor2,
        fontSize: 9,
        rotate: 0,
        interval: 0,
        formatter: (val: number) => {
          const i = Math.round(val)
          if (!Number.isFinite(i) || Math.abs(val - i) > 1e-6) return ''
          if (i >= 0 && i < THEME_RIVER_BIN_COUNT) return labels.binTickLabel(i)
          return ''
        }
      },
      name: labels.axisCaption,
      nameLocation: 'middle',
      nameGap: 46,
      nameTextStyle: { color: theme.textColor2, fontSize: 10, lineHeight: 14 }
    },
    series: [
      {
        type: 'themeRiver',
        data: riverData,
        label: { show: false }
      }
    ]
  })
}
