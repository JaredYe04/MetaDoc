/**
 * 一键导出验收（纯 Node，不启动 MetaDoc/Electron）
 * 直接使用已有工具：marked、html-to-docx、md-to-pdf、markdown-it 做 TEX。
 * 在 meta-doc 目录下执行：node ../../debug/run-export-node.mjs [--dev]
 * 输出目录：debug/out/{caseName}/
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const debugDir = path.resolve(__dirname)
const metaDocRoot = process.cwd()
const require = createRequire(path.join(metaDocRoot, 'package.json'))
const testMdPath = path.join(debugDir, 'export-test.md')
const outBaseDir = path.join(debugDir, 'out')

// case 定义与 设置→调试→导出回归测试 中的 MD 用例对应（此处为纯 Node 备用）
const EXPORT_CASES = [
  {
    name: 'pdf-default',
    format: 'pdf',
    description: 'PDF 默认边距与字体',
    options: {
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      pageSize: 'A4',
      printBackground: true,
      chineseFont: 'OPPO Sans 4.0',
      westernFont: 'New York'
    }
  },
  {
    name: 'pdf-custom-margins-fonts',
    format: 'pdf',
    description: 'PDF 大边距 + 宋体/Times New Roman',
    options: {
      margins: { top: 1, bottom: 1, left: 1, right: 1 },
      pageSize: 'A4',
      printBackground: true,
      chineseFont: 'SimSun',
      westernFont: 'Times New Roman'
    }
  },
  {
    name: 'docx-with-cover-toc-formula',
    format: 'docx',
    description: 'DOCX 封面+目录+处理公式',
    options: {
      generateCover: true,
      generateToc: true,
      processFormula: true,
      enableStyleMapping: true
    }
  },
  {
    name: 'docx-no-cover-toc-formula',
    format: 'docx',
    description: 'DOCX 无封面无目录不处理公式',
    options: {
      generateCover: false,
      generateToc: false,
      processFormula: false,
      enableStyleMapping: true
    }
  },
  {
    name: 'tex-images-folder',
    format: 'tex',
    description: 'TEX 图片存相对路径文件夹',
    options: {
      documentClass: 'article',
      includePackages: true,
      imageProcessing: 'folder'
    }
  },
  {
    name: 'tex-images-original',
    format: 'tex',
    description: 'TEX 图片保留原始链接',
    options: {
      documentClass: 'article',
      includePackages: true,
      imageProcessing: 'original'
    }
  },
  {
    name: 'html-images-folder',
    format: 'html',
    description: 'HTML 图片存文件夹',
    options: {
      inlineStyles: true,
      imageProcessing: 'folder'
    }
  },
  {
    name: 'html-images-original',
    format: 'html',
    description: 'HTML 图片保留原始链接',
    options: {
      inlineStyles: true,
      imageProcessing: 'original'
    }
  }
]

// 与 md-utils 一致：只移除 meta-info 注释
function filterMetaDataFromMd(md) {
  return md.replace(/<!--meta-info:\s*[^-]+?\s*-->/g, '')
}

// 使用 meta-doc 的 node_modules
let marked
let HTMLtoDOCX
let mdToPdf
let MarkdownIt

function loadDeps() {
  if (!marked) marked = require('marked')
  if (!HTMLtoDOCX) HTMLtoDOCX = require('html-to-docx')
  if (!mdToPdf) {
    const pkg = require('md-to-pdf')
    mdToPdf = pkg.mdToPdf || pkg.default || pkg
  }
  if (!MarkdownIt) MarkdownIt = require('markdown-it')
}

// ---------- 最小 TEX 转换（复用与 latex-utils 一致的逻辑，Node 可运行） ----------
function escapeLatex(str) {
  if (!str) return ''
  let result = String(str)
  result = result.replace(/\\/g, '\\textbackslash{}')
  result = result
    .replace(/([{}])/g, '\\$1')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\^{}')
  return result
}

function extractMathPlaceholders(source) {
  const placeholders = []
  let text = source
  text = text.replace(/(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g, (match, content) => {
    const index = placeholders.length
    placeholders.push('$$' + content + '$$')
    return `@@MATHBLOCK:${index}@@`
  })
  text = text.replace(/(?<!\\)\$(?!\$)([^\n$]+?)(?<!\\)\$/g, (match, content) => {
    const index = placeholders.length
    placeholders.push('$' + content + '$')
    return `@@MATHINLINE:${index}@@`
  })
  return { text, placeholders }
}

function restoreMathPlaceholders(text, placeholders) {
  if (!placeholders || placeholders.length === 0) return text
  let result = text
  result = result.replace(/@@MATHBLOCK:(\d+)@@/g, (_, idx) => placeholders[parseInt(idx, 10)] ?? '')
  result = result.replace(/@@MATHINLINE:(\d+)@@/g, (_, idx) => placeholders[parseInt(idx, 10)] ?? '')
  return result
}

async function convertTokensToLatex(tokens) {
  let latex = ''
  const stack = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    switch (token.type) {
      case 'heading_open': {
        const level = token.tag?.replace('h', '') || '1'
        const cmd = ['textbf', 'textbf', 'subsection', 'subsubsection'][level - 1] || 'textbf'
        latex += `\\${cmd}{`
        stack.push('heading')
        break
      }
      case 'heading_close':
        if (stack.pop() === 'heading') latex += '}\n\n'
        break
      case 'paragraph_open':
        latex += '\n\n'
        break
      case 'paragraph_close':
        latex += '\n\n'
        break
      case 'text':
        latex += escapeLatex(token.content || '')
        break
      case 'em_open':
        latex += '\\emph{'
        stack.push('em')
        break
      case 'em_close':
        if (stack.pop() === 'em') latex += '}'
        break
      case 'strong_open':
        latex += '\\textbf{'
        stack.push('strong')
        break
      case 'strong_close':
        if (stack.pop() === 'strong') latex += '}'
        break
      case 'bullet_list_open':
        latex += '\\begin{itemize}\n'
        stack.push('list')
        break
      case 'bullet_list_close':
        if (stack.pop() === 'list') latex += '\\end{itemize}\n'
        break
      case 'ordered_list_open':
        latex += '\\begin{enumerate}\n'
        stack.push('olist')
        break
      case 'ordered_list_close':
        if (stack.pop() === 'olist') latex += '\\end{enumerate}\n'
        break
      case 'list_item_open':
        latex += '\\item '
        break
      case 'list_item_close':
        latex += '\n'
        break
      case 'code_inline':
        latex += `\\texttt{${escapeLatex(token.content)}}`
        break
      case 'fence':
      case 'code_block':
        latex += `\\begin{verbatim}\n${token.content}\\end{verbatim}\n\n`
        break
      case 'blockquote_open':
        latex += '\\begin{quote}\n'
        stack.push('quote')
        break
      case 'blockquote_close':
        if (stack.pop() === 'quote') latex += '\\end{quote}\n'
        break
      case 'hr':
        latex += '\n\\hrulefill\n'
        break
      case 'link_open': {
        const href = token.attrs?.find(([k]) => k === 'href')?.[1] || ''
        latex += `\\href{${href}}{`
        stack.push('link')
        break
      }
      case 'link_close':
        if (stack.pop() === 'link') latex += '}'
        break
      case 'image': {
        let src = token.attrs?.find(([k]) => k === 'src')?.[1] || ''
        const alt = escapeLatex(token.content || '')
        try {
          src = decodeURIComponent(src)
        } catch (_) {}
        let normalizedPath = src.replace(/\\/g, '/')
        normalizedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1')
        latex += `
\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{${normalizedPath}}
  \\caption{${alt}}
\\end{figure}
`
        break
      }
      case 'inline': {
        if (token.children) {
          const inner = await convertTokensToLatex(token.children)
          latex += inner
        }
        break
      }
      default:
        if (token.children) {
          const inner = await convertTokensToLatex(token.children)
          latex += inner
        }
        break
    }
  }
  return latex
}

async function mdToTex(markdown, options = {}) {
  loadDeps()
  const { text: mdWithoutMath, placeholders } = extractMathPlaceholders(markdown)
  const md = new MarkdownIt({ html: false, linkify: true })
  const tokens = md.parse(mdWithoutMath, {})
  let body = await convertTokensToLatex(tokens)
  body = restoreMathPlaceholders(body, placeholders)
  const documentClass = options.documentClass || 'article'
  const packages = options.includePackages !== false
    ? `
\\usepackage{fontspec}
\\usepackage{graphicx}
\\usepackage{float}
\\usepackage{hyperref}
\\usepackage{xeCJK}
`
    : ''
  return `\\documentclass{${documentClass}}${packages}
\\begin{document}
${body}
\\end{document}
`
}

// ---------- 导出执行 ----------
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

async function exportPdf(caseDir, options) {
  loadDeps()
  const dest = path.join(caseDir, 'export-test.pdf')
  await mdToPdf(
    { path: testMdPath },
    {
      dest,
      basedir: debugDir,
      pdf_options: {
        format: (options.pageSize || 'A4').toLowerCase(),
        printBackground: options.printBackground !== false,
        margin: options.margins
          ? {
              top: `${options.margins.top}in`,
              right: `${options.margins.right}in`,
              bottom: `${options.margins.bottom}in`,
              left: `${options.margins.left}in`
            }
          : undefined
      }
    }
  )
  return dest
}

async function exportDocx(caseDir, md, options) {
  loadDeps()
  let html = marked.parse(md, { gfm: true })
  // html-to-docx 在 Node 中通过 URL 加载图片时会只传 buffer 给 image-size，导致 type/filepath 为 undefined。
  // 暂用占位符替换图片，保证 DOCX 能生成；完整图片支持需在 Electron 内导出。
  html = html.replace(
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    (match, src) => `<span>[图片: ${path.basename(src)}]</span>`
  )
  const docxBuffer = await HTMLtoDOCX(html, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
    font: 'Microsoft YaHei',
    fontSize: 21,
    lang: 'zh-CN'
  }, null)
  const dest = path.join(caseDir, 'export-test.docx')
  ensureDir(caseDir)
  fs.writeFileSync(dest, Buffer.from(docxBuffer))
  return dest
}

async function exportTex(caseDir, md, options) {
  const imageDir = path.join(caseDir, 'images')
  if (options.imageProcessing === 'folder') {
    ensureDir(imageDir)
    const srcImages = path.join(debugDir, 'images')
    if (fs.existsSync(srcImages)) {
      for (const name of fs.readdirSync(srcImages)) {
        fs.copyFileSync(path.join(srcImages, name), path.join(imageDir, name))
      }
    }
  }
  let content = md
  const imagesDir = path.join(debugDir, 'images')
  if (options.imageProcessing === 'folder' && content.includes('images/')) {
    content = content
  }
  const tex = await mdToTex(content, {
    documentClass: options.documentClass,
    includePackages: options.includePackages
  })
  const dest = path.join(caseDir, 'export-test.tex')
  ensureDir(caseDir)
  fs.writeFileSync(dest, tex, 'utf-8')
  return dest
}

async function exportHtml(caseDir, md, options) {
  loadDeps()
  let html = marked.parse(md, { gfm: true })
  if (options.imageProcessing === 'folder') {
    const imageDir = path.join(caseDir, 'images')
    ensureDir(imageDir)
    const srcImages = path.join(debugDir, 'images')
    if (fs.existsSync(srcImages)) {
      for (const name of fs.readdirSync(srcImages)) {
        fs.copyFileSync(path.join(srcImages, name), path.join(imageDir, name))
      }
    }
  }
  const dest = path.join(caseDir, 'export-test.html')
  ensureDir(caseDir)
  fs.writeFileSync(dest, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, 'utf-8')
  return dest
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const CONTENT_MARKERS = [
  '导出验收测试文档',
  'Mermaid',
  'ECharts',
  'PlantUML',
  'Mindmap',
  'Graphviz',
  'E = mc',
  '块级公式'
]

function checkContentComplete(filePath, format) {
  const stat = fs.statSync(filePath)
  assert(stat.size > 0, `文件为空: ${filePath}`)
  if (format === 'pdf' || format === 'docx') return
  const content = fs.readFileSync(filePath, 'utf-8')
  const missing = CONTENT_MARKERS.filter((m) => !content.includes(m))
  assert(missing.length === 0, `导出内容不完整，缺少: ${missing.join(', ')}`)
}

;(async () => {
  if (!fs.existsSync(testMdPath)) {
    console.error('测试文档不存在:', testMdPath)
    process.exit(1)
  }
  const rawMd = fs.readFileSync(testMdPath, 'utf-8')
  const md = filterMetaDataFromMd(rawMd)
  ensureDir(outBaseDir)

  for (let i = 0; i < EXPORT_CASES.length; i++) {
    const c = EXPORT_CASES[i]
    const caseDir = path.join(outBaseDir, c.name)
    ensureDir(caseDir)
    const ext = c.format === 'tex' ? 'tex' : c.format
    const targetPath = path.join(caseDir, `export-test.${ext}`)
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath)
      } catch (_) {}
    }

    try {
      if (c.format === 'pdf') {
        await exportPdf(caseDir, c.options)
      } else if (c.format === 'docx') {
        await exportDocx(caseDir, md, c.options)
      } else if (c.format === 'tex') {
        await exportTex(caseDir, md, c.options)
      } else if (c.format === 'html') {
        await exportHtml(caseDir, md, c.options)
      }
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
        checkContentComplete(targetPath, c.format)
        console.log(`  [${i + 1}/${EXPORT_CASES.length}] ${c.name}: ${targetPath}`)
      } else {
        console.error(`  [${i + 1}/${EXPORT_CASES.length}] ${c.name}: 未生成文件或为空`)
      }
    } catch (err) {
      console.error(`  [${i + 1}/${EXPORT_CASES.length}] ${c.name}:`, err.message)
    }
  }

  console.log('一键导出完成（Node，未启动 MetaDoc），输出目录:', outBaseDir)
})()
