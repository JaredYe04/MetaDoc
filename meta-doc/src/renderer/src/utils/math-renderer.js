// 数学公式渲染工具：使用 Vditor.mathRender 将 TeX 渲染为可导出的 SVG/PNG
// 仅在 DOCX 导出链路替换为位图，其它格式不改变原文

import { isElectronEnv } from './event-bus'
import { localVditorCDN, vditorCDN } from './vditor-cdn'
import Vditor from 'vditor'
import domtoimage from 'dom-to-image-more'
import { convertSvgToPng as convertSvgToPngInternal } from './chart-pre-renderer.js'
import { createRendererLogger } from './logger.ts'
import { getSetting } from './settings'

function getCdn() {
  if (isElectronEnv && typeof isElectronEnv === 'function' && isElectronEnv()) {
    return localVditorCDN
  }
  return vditorCDN
}

function buildMathMarkdown(texSource, displayMode = false) {
  // 用 Markdown 包裹，交给 Vditor 处理
  if (displayMode) {
    return `\n\n$$\n${texSource}\n$$\n\n`
  }
  return `$${texSource}$`
}

async function renderTexToElement(texSource, displayMode = false) {
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '-9999px'
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)

  const md = buildMathMarkdown(texSource, displayMode)
  const cdn = getCdn()

  // 获取数学公式配置
  const mathInlineDigit = (await getSetting('mathInlineDigit')) ?? true

  // 先将 Markdown 渲染为 HTML，再调用 mathRender 处理公式
  await Vditor.preview(container, md, {
    cdn,
    mode: 'light',
    math: {
      inlineDigit: mathInlineDigit
    }
  })
  if (typeof Vditor.mathRender === 'function') {
    Vditor.mathRender(container, cdn)
  }

  // 按照 chart-pre-renderer 的策略，轮询等待渲染完成
  const maxWait = 5000
  const checkInterval = 200
  let waited = 0

  return await new Promise((resolve, reject) => {
    const check = () => {
      try {
        // 优先 display，再 inline
        let el = container.querySelector('.katex-display') || container.querySelector('.katex')
        if (!el) {
          el = container.querySelector('.vditor-reset .katex-display, .vditor-reset .katex')
        }
        // 一些主题结构只暴露 katex-html
        if (!el) {
          el =
            container.querySelector('.katex-html') ||
            container.querySelector('.vditor-reset .katex-html')
        }
        // 尽量取到 .katex 根节点，避免只拿到内部 html 层
        if (el && !el.classList.contains('katex')) {
          const root = el.closest('.katex')
          if (root) el = root
        }
        // 有些主题会把公式包一层，兜底找 svg 或者 <span class="katex">
        if (!el) {
          const svgEl = container.querySelector('.vditor-reset svg')
          if (svgEl) el = svgEl.parentElement || svgEl
        }

        if (el) {
          resolve({ el, container })
          return
        }

        waited += checkInterval
        if (waited >= maxWait) {
          document.body.removeChild(container)
          reject(new Error('未找到渲染后的公式元素'))
          return
        }
        setTimeout(check, checkInterval)
      } catch (err) {
        document.body.removeChild(container)
        reject(err)
      }
    }
    // 稍作延迟给 mathRender 初始化时间
    setTimeout(check, 200)
  })
}

// ===== MathJax SVG 渲染（用于生成“纯 SVG”以便 SVG/PDF/PNG 一致输出） =====
let __mjFrame = null
let __mjReady = false
let __mjInitPromise = null

async function ensureMathJax() {
  if (__mjReady) return
  if (__mjInitPromise) {
    await __mjInitPromise
    return
  }
  __mjInitPromise = new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe')
      iframe.style.position = 'absolute'
      iframe.style.left = '-10000px'
      iframe.style.top = '-10000px'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.setAttribute('aria-hidden', 'true')
      document.body.appendChild(iframe)

      const doc = iframe.contentDocument || iframe.contentWindow.document
      const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <script>
      window.MathJax = {
        startup: { typeset: false },
        svg: { fontCache: 'local' },
        tex: {
          inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
          displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
          // 尽可能开启常用扩展（若个别扩展在 CDN 不存在，MathJax 会忽略）
          packages: {'[+]': [
            'ams',
            'color',
            'boldsymbol',
            'cancel',
            'upgreek',
            'unicode',
            'braket',
            'mhchem'
          ]}
        },
        loader: { load: [
          '[tex]/ams',
          '[tex]/color',
          '[tex]/boldsymbol',
          '[tex]/cancel',
          '[tex]/upgreek',
          '[tex]/unicode',
          '[tex]/braket',
          '[tex]/mhchem'
        ] }
      };
    </script>
    <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
  </head>
  <body></body>
</html>`
      doc.open()
      doc.write(html)
      doc.close()

      const check = () => {
        try {
          const win = iframe.contentWindow
          if (win && win.MathJax && win.MathJax.startup && win.MathJax.startup.promise) {
            win.MathJax.startup.promise
              .then(() => {
                __mjFrame = iframe
                __mjReady = true
                resolve()
              })
              .catch(reject)
            return
          }
        } catch {}
        setTimeout(check, 50)
      }
      check()
    } catch (e) {
      reject(e)
    }
  })
  await __mjInitPromise
}

async function renderMathJaxToSvgString(texSource, displayMode = false) {
  await ensureMathJax()
  const win = __mjFrame.contentWindow
  const MathJax = win.MathJax
  const adaptor = MathJax.startup.adaptor
  const node = MathJax.tex2svg(texSource, { display: displayMode })
  let html = adaptor.outerHTML(node)
  // 提取内部真正的 <svg>
  if (html && !html.trim().startsWith('<svg')) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const svgEl = doc.querySelector('svg')
    if (svgEl) {
      return new XMLSerializer().serializeToString(svgEl)
    }
  }
  return html
}

async function svgStringToDataUrl(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg || '')
}

async function svgStringToPngDataUrl(svg) {
  const blob = await convertSvgToPngInternal(svg)
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function renderTexToSvg(texSource, displayMode = false) {
  // 使用 MathJax 输出“纯 SVG”字符串
  try {
    return await renderMathJaxToSvgString(texSource, displayMode)
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`
  }
}

export async function renderTexToPngDataUrl(texSource, displayMode = false) {
  // 从纯 SVG 转位图，保证位图来自矢量
  try {
    const svg = await renderMathJaxToSvgString(texSource, displayMode)
    return await svgStringToPngDataUrl(svg)
  } catch {
    return 'data:image/png;base64,'
  }
}

// 与 latex-utils 一致：匹配未转义的 $...$ 与 $$...$$（正则字面量使用单反斜杠）
// 块级：优先匹配 $$...$$；行内：匹配单 $...$ 且排除 $$
// 注意：行内公式不应该跨行，所以使用 [^\n$]+? 而不是 [\s\S]+?
const mathBlockRegex = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g
const mathInlineRegex = /(?<!\\)\$(?!\$)([^\n$]+?)(?<!\\)\$/g

export async function renderMarkdownMathToImages(markdown, output = 'png') {
  // 仅做：提取公式 → 渲染（MathJax）→ 生成图片 URL（上传）→ 回填到 Markdown
  let result = markdown
  const blockMatches = []
  const inlineMatches = []
  const logger = createRendererLogger('MathRenderer')
  //logger.debug(`renderMarkdownMathToImages markdown: ${markdown}`);
  result.replace(mathBlockRegex, (match, content, idx) => {
    blockMatches.push({ match, content: content.trim(), index: idx })
    return match
  })
  result.replace(mathInlineRegex, (match, content, idx) => {
    inlineMatches.push({ match, content: content.trim(), index: idx })
    return match
  })
  // logger.debug(`renderMarkdownMathToImages blockMatches: ${JSON.stringify(blockMatches)}`);
  // logger.debug(`renderMarkdownMathToImages inlineMatches: ${JSON.stringify(inlineMatches)}`);

  // 从后往前替换，避免索引位移
  blockMatches.sort((a, b) => b.index - a.index)
  inlineMatches.sort((a, b) => b.index - a.index)

  // 过滤：剔除落在任一块级公式区间内的行内匹配，避免重叠替换
  if (blockMatches.length && inlineMatches.length) {
    const blockRanges = blockMatches.map((m) => [m.index, m.index + m.match.length])
    const notOverlap = (start, end) => !blockRanges.some(([bs, be]) => !(end <= bs || start >= be))
    for (let i = inlineMatches.length - 1; i >= 0; i--) {
      const m = inlineMatches[i]
      const s = m.index
      const e = m.index + m.match.length
      if (!notOverlap(s, e)) {
        inlineMatches.splice(i, 1)
      }
    }
  }

  // 简单稳定哈希（用于生成可复用文件名）
  async function computeHash(text) {
    try {
      const enc = new TextEncoder()
      const digest = await crypto.subtle.digest('SHA-256', enc.encode(text))
      const bytes = new Uint8Array(digest)
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16)
    } catch (_) {
      let h = 0
      for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
      return ('00000000' + h.toString(16)).slice(-8)
    }
  }

  async function uploadBlob(fileName, blob) {
    const form = new FormData()
    const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
    form.append('file[]', file, fileName)
    const resp = await fetch('http://localhost:52521/api/image/upload?keepName=1', {
      method: 'POST',
      body: form
    })
    if (!resp.ok) throw new Error('上传失败')
    return `http://localhost:52521/images/${fileName}`
  }

  // 统一处理函数：生成 SVG，再按 output 处理
  async function renderAndUpload(tex, display) {
    const svg = await renderMathJaxToSvgString(tex, display)
    const base = await computeHash(`${tex}:${display ? 'block' : 'inline'}`)
    if (output === 'png') {
      let pngBlob = await convertSvgToPngInternal(svg)
      // 压缩：限制最大宽度（块级更大，行内更小），同比缩放，显著降低体积
      const maxWidth = display ? 500 : 300
      try {
        pngBlob = await downscalePngBlobIfNeeded(pngBlob, maxWidth)
      } catch {}
      const url = await uploadBlob(`${base}_math.png`, pngBlob)
      return url
    } else {
      // 默认 SVG
      const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
      const url = await uploadBlob(`${base}_math.svg`, svgBlob)
      return url
    }
  }

  async function downscalePngBlobIfNeeded(pngBlob, maxWidth) {
    if (!pngBlob || !(pngBlob instanceof Blob)) return pngBlob
    const objectUrl = URL.createObjectURL(pngBlob)
    try {
      const img = new Image()
      const loaded = new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })
      img.src = objectUrl
      await loaded
      const naturalW = img.naturalWidth || img.width || 0
      const naturalH = img.naturalHeight || img.height || 0
      if (!naturalW || !naturalH) return pngBlob
      if (naturalW <= maxWidth) return pngBlob
      const scale = maxWidth / naturalW
      const targetW = Math.max(1, Math.round(naturalW * scale))
      const targetH = Math.max(1, Math.round(naturalH * scale))
      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, targetW, targetH)
      // 重新编码为 PNG（PNG 无质量参数，但像素减少可显著减小体积）
      const resized = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob 失败'))), 'image/png')
      })
      return resized
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  // 合并为一次性替换序列：避免多轮替换导致的下标失效
  const allReplacements = [
    ...blockMatches.map((m) => ({ ...m, display: true })),
    ...inlineMatches.map((m) => ({ ...m, display: false }))
  ].sort((a, b) => b.index - a.index)

  // 并行渲染所有公式，完成后统一替换
  const renderTasks = allReplacements.map(async (m) => {
    try {
      const url = await renderAndUpload(m.content, m.display)
      const imgMarkdown = m.display ? `\n\n![math](${url})\n\n` : `![math](${url})`
      return {
        index: m.index,
        matchLength: m.match.length,
        replacement: imgMarkdown,
        success: true
      }
    } catch (e) {
      logger.warn(`${m.display ? '块级' : '行内'}公式转图片失败，保留原文：`, e)
      // 失败则保留原文，不替换
      return {
        index: m.index,
        matchLength: m.match.length,
        replacement: null,
        success: false
      }
    }
  })

  const results = await Promise.allSettled(renderTasks)

  // 从后往前替换，避免索引位移问题
  for (const resultItem of results) {
    if (resultItem.status === 'fulfilled' && resultItem.value && resultItem.value.success) {
      const { index, matchLength, replacement } = resultItem.value
      result = result.slice(0, index) + replacement + result.slice(index + matchLength)
    }
  }
  //logger.debug(`renderMarkdownMathToImages result: ${result}`);
  return result
}

// 单公式导出（给 FomulaRecognition.vue 使用）
export async function exportSingleFormula(texSource, format = 'svg') {
  if (format === 'svg') {
    const svg = await renderMathJaxToSvgString(texSource, false)
    return await svgStringToDataUrl(svg)
  }
  if (format === 'png') {
    const svg = await renderMathJaxToSvgString(texSource, false)
    return await svgStringToPngDataUrl(svg)
  }
  if (format === 'pdf') {
    // 返回 SVG data URL，由调用方上传并走 convert-svg-to-pdf
    const svg = await renderMathJaxToSvgString(texSource, false)
    return await svgStringToDataUrl(svg)
  }
  const svg = await renderMathJaxToSvgString(texSource, false)
  return await svgStringToDataUrl(svg)
}
