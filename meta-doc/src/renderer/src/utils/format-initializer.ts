/**
 * 格式初始化 - 注册所有支持的文档格式
 */

import { formatRegistry, type FormatConfig } from './format-registry'
import { getOutlineAdapter } from './outline-adapters'
import { convertLatexToMarkdown } from './latex-utils'
import { extname } from './path-utils'
import MarkdownEditor from '../views/MarkdownEditor.vue'
import LaTeXEditor from '../views/LaTeXEditor.vue'
import PlainTextEditor from '../views/PlainTextEditor.vue'

/**
 * LaTeX格式检测器
 */
function detectLatex(content: string): string | null {
  if (!content || content.trim().length === 0) {
    return null
  }

  const latexPatterns = [
    /\\documentclass/i,
    /\\begin\{document\}/i,
    /\\section\{/i,
    /\\subsection\{/i,
    /\\subsubsection\{/i,
    /\\chapter\{/i,
    /\\part\{/i,
    /\\usepackage\{/i,
    /\\newcommand/i,
    /\\def\s+\\/i,
    /\\title\{/i,
    /\\author\{/i,
    /\\maketitle/i,
    /\\begin\{equation\}/i,
    /\\begin\{align\}/i,
    /\\begin\{figure\}/i,
    /\\begin\{table\}/i,
    /\\includegraphics/i,
    /\\ref\{/i,
    /\\cite\{/i,
    /\\label\{/i
  ]

  for (const pattern of latexPatterns) {
    if (pattern.test(content)) {
      return 'tex'
    }
  }

  return null
}

/**
 * 纯文本格式检测器（基于文件扩展名，内容检测总是返回null，因为没有特征）
 */
function detectPlainText(content: string, filePath?: string): string | null {
  // 纯文本格式主要通过文件扩展名检测，内容检测总是返回null
  // 这样可以让其他格式优先检测（如LaTeX、Markdown）
  return null
}

/**
 * 根据文件扩展名检测Monaco语言
 */
function detectMonacoLanguageFromExtension(filePath?: string): string {
  if (!filePath) return 'plaintext'

  const ext = extname(filePath).toLowerCase()

  // 常见代码文件扩展名映射
  const extensionToLanguage: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cxx': 'cpp',
    '.cc': 'cpp',
    '.c': 'c',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.ps1': 'powershell',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.json': 'json',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.ini': 'ini',
    '.conf': 'ini',
    '.sql': 'sql',
    '.md': 'markdown',
    '.tex': 'latex',
    '.r': 'r',
    '.m': 'objective-c',
    '.mm': 'objective-c',
    '.vue': 'html',
    '.svelte': 'html',
    '.dart': 'dart',
    '.lua': 'lua',
    '.pl': 'perl',
    '.pm': 'perl',
    '.vim': 'vim',
    '.diff': 'diff',
    '.patch': 'diff',
    '.log': 'log',
    '.txt': 'plaintext',
    '.text': 'plaintext'
  }

  return extensionToLanguage[ext] || 'plaintext'
}

/**
 * 初始化并注册所有格式
 */
export function initializeFormats(): void {
  // 注册 Markdown 格式
  formatRegistry.register({
    id: 'md',
    label: 'Markdown',
    labelKey: 'newDocument.formats.markdown.label',
    description: 'Markdown 文档',
    descriptionKey: 'newDocument.formats.markdown.description',
    extensions: ['.md', '.markdown'],
    defaultExtension: '.md',
    monacoLanguage: 'markdown',
    supportsMetadata: true,
    supportsOutline: true,
    supportsAiCompletion: true,
    defaultTemplateId: 'blank',
    editorComponent: MarkdownEditor,
    contentAdapter: {
      toMarkdown: (content: string) => content, // Markdown本身就是Markdown
      fromMarkdown: (markdown: string) => markdown
    },
    outlineAdapter: getOutlineAdapter('md'),
    detector: (content: string, filePath?: string) => {
      // Markdown格式检测：如果不是LaTeX，且扩展名是.md，则认为是Markdown
      if (filePath) {
        const ext = extname(filePath).toLowerCase()
        if (ext === '.md' || ext === '.markdown') {
          // 先检查是否是LaTeX
          if (detectLatex(content) === 'tex') {
            return null // LaTeX优先
          }
          return 'md'
        }
      }
      // 如果没有文件路径，且不是LaTeX，默认认为是Markdown
      if (detectLatex(content) !== 'tex') {
        return 'md'
      }
      return null
    }
  })

  // 注册 LaTeX 格式
  formatRegistry.register({
    id: 'tex',
    label: 'LaTeX',
    labelKey: 'newDocument.formats.latex.label',
    description: 'LaTeX 文档',
    descriptionKey: 'newDocument.formats.latex.description',
    extensions: ['.tex'],
    defaultExtension: '.tex',
    monacoLanguage: 'latex',
    supportsMetadata: true,
    supportsOutline: true,
    supportsAiCompletion: true,
    defaultTemplateId: 'article',
    editorComponent: LaTeXEditor,
    contentAdapter: {
      toMarkdown: convertLatexToMarkdown,
      fromMarkdown: (markdown: string) => markdown // 从Markdown转LaTeX需要特殊处理，这里简化
    },
    outlineAdapter: getOutlineAdapter('tex'),
    detector: detectLatex
  })

  // 注册纯文本格式
  formatRegistry.register({
    id: 'txt',
    label: 'Plain Text',
    labelKey: 'newDocument.formats.plaintext.label',
    description: '纯文本文件',
    descriptionKey: 'newDocument.formats.plaintext.description',
    extensions: [
      '.txt',
      '.text',
      // 代码文件
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.py',
      '.java',
      '.cpp',
      '.c',
      '.h',
      '.hpp',
      '.cs',
      '.php',
      '.rb',
      '.go',
      '.rs',
      '.swift',
      '.kt',
      '.scala',
      '.sh',
      '.bash',
      '.zsh',
      '.ps1',
      '.html',
      '.htm',
      '.css',
      '.scss',
      '.sass',
      '.less',
      '.json',
      '.xml',
      '.yaml',
      '.yml',
      '.toml',
      '.ini',
      '.conf',
      '.sql',
      '.r',
      '.m',
      '.mm',
      '.vue',
      '.svelte',
      '.dart',
      '.lua',
      '.pl',
      '.pm',
      '.vim',
      '.diff',
      '.patch',
      '.log'
    ],
    defaultExtension: '.txt',
    monacoLanguage: 'plaintext', // 默认语言，会根据文件扩展名动态调整
    supportsMetadata: false, // 纯文本不支持元信息
    supportsOutline: false, // 纯文本不支持大纲
    supportsAiCompletion: true, // 支持AI补全
    defaultTemplateId: 'blank',
    editorComponent: PlainTextEditor,
    contentAdapter: {
      // 纯文本转Markdown：直接返回，作为Markdown处理
      toMarkdown: (content: string) => content,
      fromMarkdown: (markdown: string) => markdown
    },
    detector: detectPlainText
  })

  // 注册 PDF 格式（仅用于文件浏览器显示，实际打开时会转换为 Markdown）
  formatRegistry.register({
    id: 'pdf',
    label: 'PDF',
    labelKey: 'newDocument.formats.pdf.label',
    description: 'PDF 文档（将转换为 Markdown）',
    descriptionKey: 'newDocument.formats.pdf.description',
    extensions: ['.pdf'],
    defaultExtension: '.pdf',
    monacoLanguage: 'plaintext',
    supportsMetadata: false,
    supportsOutline: false,
    supportsAiCompletion: false,
    defaultTemplateId: 'blank',
    editorComponent: PlainTextEditor, // PDF不会直接编辑，但需要占位组件
    contentAdapter: {
      toMarkdown: (content: string) => content,
      fromMarkdown: (markdown: string) => markdown
    },
    detector: (content: string, filePath?: string) => {
      // PDF格式只通过扩展名检测
      if (filePath) {
        const ext = extname(filePath).toLowerCase()
        if (ext === '.pdf') {
          return 'pdf'
        }
      }
      return null
    }
  })
}

/**
 * 根据文件路径获取Monaco语言ID
 */
export function getMonacoLanguageFromPath(filePath: string): string {
  return detectMonacoLanguageFromExtension(filePath)
}

/**
 * 根据格式ID和文件路径获取Monaco语言ID
 */
export function getMonacoLanguage(formatId: string, filePath?: string): string {
  const format = formatRegistry.getFormat(formatId)
  if (!format) {
    return filePath ? detectMonacoLanguageFromExtension(filePath) : 'plaintext'
  }

  // 如果是纯文本格式，根据文件扩展名动态确定语言
  if (formatId === 'txt' && filePath) {
    return detectMonacoLanguageFromExtension(filePath)
  }

  // 否则使用格式配置的语言
  return format.monacoLanguage || 'plaintext'
}
