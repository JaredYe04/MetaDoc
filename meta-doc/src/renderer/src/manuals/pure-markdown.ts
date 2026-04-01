/**
 * 将用户手册 Markdown 导出为“纯 Markdown”：
 * - 移除手册内 Demo 组件（如 <AgentView mode="demo" />）
 * - 移除超链接（保留可读文本）
 */

/** 自闭合组件标签：<ComponentName ... />，组件名需大写开头 */
const SELF_CLOSING_DEMO_TAG = /<([A-Z][a-zA-Z0-9]*)(\s+[^/>]*)?\s*\/>/g

function stripDemoComponents(markdown: string): string {
  if (!markdown) return ''
  // 直接移除标签；再顺带清理可能出现的多余空行
  const removed = markdown.replace(SELF_CLOSING_DEMO_TAG, '')
  return removed
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function stripMarkdownLinks(markdown: string): string {
  if (!markdown) return ''

  let out = markdown

  // 内部链接：[[articleId|显示文本]] -> 显示文本
  out = out.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')

  // 参考链接定义：[id]: url "title" -> 删除整行
  out = out.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')

  // 行内链接：[text](url) -> text （保留图片链接 ![alt](url)）
  out = out.replace(/(^|[^!])\[(.*?)\]\((.*?)\)/g, (_m, prefix: string, text: string) => {
    return `${prefix}${text}`
  })

  // 参考样式链接：[text][id] -> text （保留图片引用 ![alt][id]）
  out = out.replace(/(^|[^!])\[(.*?)\]\[([^\]]*)\]/g, (_m, prefix: string, text: string) => {
    return `${prefix}${text}`
  })

  // 自动链接：<https://...> / <http://...> -> https://...
  out = out.replace(/<((?:https?:\/\/)[^>\s]+)>/g, '$1')

  // HTML 链接：<a ...>text</a> -> text
  out = out.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')

  return out
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function stripMermaidCustomStyles(markdown: string): string {
  if (!markdown) return ''

  // ```mermaid ... ``` 代码块内去除自定义颜色/主题指令，避免纯 Markdown 渲染时撞色
  const fence = /```mermaid\s*\n([\s\S]*?)\n```/gi
  return markdown.replace(fence, (_full, body: string) => {
    const lines = String(body).split('\n')
    const kept: string[] = []
    for (const rawLine of lines) {
      const line = rawLine.trim()

      // init/themeVariables（常用于自定义配色）
      if (/^%%\{\s*init\s*:/.test(line)) {
        // 若确实包含 themeVariables/colors 等，则移除；否则保留
        if (/themeVariables|themeCSS|primaryColor|secondaryColor|tertiaryColor/i.test(line)) {
          continue
        }
      }

      // Mermaid 样式/类定义（常带 fill/stroke/color）
      if (/^(style|classDef|linkStyle)\s+/i.test(line)) {
        continue
      }

      // 某些写法会把 CSS 变量/颜色写进注释或指令行：包含明显颜色字段则移除
      if (/(fill|stroke|color)\s*:\s*#/i.test(line)) {
        continue
      }

      kept.push(rawLine)
    }

    // 清理多余空行
    const cleaned = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    return `\`\`\`mermaid\n${cleaned}\n\`\`\``
  })
}

export function toPureManualMarkdown(markdown: string): string {
  if (!markdown) return ''
  const noDemo = stripDemoComponents(markdown)
  const noLinks = stripMarkdownLinks(noDemo)
  return stripMermaidCustomStyles(noLinks)
}

