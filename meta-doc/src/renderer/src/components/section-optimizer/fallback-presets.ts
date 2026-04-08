/** i18n 未就绪或解析失败时的内置预制提示词，保证段落优化器始终可选用 */
export const SECTION_OPTIMIZER_FALLBACK_MARKDOWN: { value: string; label: string }[] = [
  { value: '扩写这段文字', label: '扩写这段文字' },
  { value: '精简这段文字', label: '精简这段文字' },
  { value: '优化文笔，使得这段文字更加优美', label: '优化一下文笔' },
  {
    value: '根据整篇文章的大意内容，生成本章节的文字内容，要求丰富翔实',
    label: '生成本节内容'
  },
  {
    value: '修改文本中所有的语病、错别字、不妥当之处，保留原意',
    label: '校对修改'
  }
]

export const SECTION_OPTIMIZER_FALLBACK_LATEX: { value: string; label: string }[] = [
  { value: '扩写这段文字，使用规范的LaTeX语法', label: '扩写这段文字' },
  { value: '精简这段文字，使用规范的LaTeX语法', label: '精简这段文字' },
  {
    value: '优化文笔，使得这段文字更加优美，使用规范的LaTeX语法',
    label: '优化一下文笔'
  },
  {
    value:
      '根据整篇文章的大意内容，生成本章节的文字内容，要求丰富翔实，使用规范的LaTeX语法，注意不要输出\\documentclass等命令',
    label: '生成本节内容'
  },
  {
    value: '修改文本中所有的语病、错别字、不妥当之处，保留原意，使用规范的LaTeX语法',
    label: '校对修改'
  }
]
