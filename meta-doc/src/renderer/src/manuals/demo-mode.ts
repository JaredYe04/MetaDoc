/**
 * 用户手册 Demo 模式：在 Markdown 中嵌入真实 Vue 组件的解析
 * 文档中可使用 <ComponentName mode="demo" /> 等形式，渲染为沙箱中的真实组件
 */

export type DemoSegment = {
  type: 'demo'
  component: string
  props: Record<string, unknown>
}

export type MarkdownSegment = {
  type: 'md'
  content: string
}

export type ManualSegment = MarkdownSegment | DemoSegment

/** 自闭合组件标签：<ComponentName ... />，组件名需大写开头 */
const SELF_CLOSING_TAG = /<([A-Z][a-zA-Z0-9]*)(\s+[^/>]*)?\s*\/>/g

/**
 * 解析属性字符串为对象，支持 key="value"、key='value'、key=value
 */
function parseAttrs(attrStr: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  if (!attrStr || !attrStr.trim()) return attrs
  const regex = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(attrStr)) !== null) {
    const value = m[2] ?? m[3] ?? m[4] ?? ''
    attrs[m[1]] = value
  }
  return attrs
}

/**
 * 将 Markdown 按 Demo 组件占位符拆分为段落（供分段渲染使用，当前方案未用）
 */
export function splitMarkdownByDemo(markdown: string): ManualSegment[] {
  if (!markdown || !markdown.trim()) {
    return [{ type: 'md', content: '' }]
  }

  const segments: ManualSegment[] = []
  let lastEnd = 0
  const re = new RegExp(SELF_CLOSING_TAG.source, 'g')
  let m: RegExpExecArray | null

  while ((m = re.exec(markdown)) !== null) {
    const before = markdown.slice(lastEnd, m.index)
    if (before) segments.push({ type: 'md', content: before })
    const componentName = m[1] as string
    const attrStr = (m[2] ?? '').trim()
    const props = parseAttrs(attrStr)
    if (!('mode' in props)) props.mode = 'demo'
    segments.push({ type: 'demo', component: componentName, props })
    lastEnd = re.lastIndex
  }

  const tail = markdown.slice(lastEnd)
  if (tail || segments.length === 0) segments.push({ type: 'md', content: tail || '' })
  return segments
}

/** 已知为数字类型的 prop 名（按组件，可扩展） */
const NUMERIC_PROPS: Record<string, string[]> = {
  ResizableDivider: ['size', 'minValue', 'maxValue']
}

function normalizePropsForPlaceholder(componentName: string, attrs: Record<string, unknown>): Record<string, unknown> {
  const numericKeys = NUMERIC_PROPS[componentName] ?? []
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(attrs)) {
    const str = String(v)
    if (numericKeys.includes(k) && /^-?\d+(\.\d+)?$/.test(str)) {
      out[k] = Number(str)
    } else {
      out[k] = v
    }
  }
  return out
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 将 Markdown 中的 Demo 组件标签替换为占位 div，供 Vditor 原样输出；
 * 渲染完成后再由 ManualContent 将占位 div 替换为真实 Vue 组件，不破坏 Vditor 的 Mermaid 等逻辑。
 */
export function preprocessMarkdownWithDemoPlaceholders(markdown: string): string {
  if (!markdown || !markdown.trim()) return markdown

  let index = 0
  return markdown.replace(SELF_CLOSING_TAG, (_, componentName: string, attrPart: string) => {
    const component = componentName.trim()
    const attrStr = (attrPart ?? '').trim()
    const attrs = parseAttrs(attrStr)
    if (!('mode' in attrs)) attrs.mode = 'demo'
    const normalized = normalizePropsForPlaceholder(component, attrs)
    const id = `demo-${index++}`
    const json = JSON.stringify(normalized)
    const escaped = escapeHtmlAttr(json)
    return `<div data-demo-id="${id}" data-demo-component="${escapeHtmlAttr(component)}" data-demo-props="${escaped}" class="manual-demo-placeholder"></div>`
  })
}
