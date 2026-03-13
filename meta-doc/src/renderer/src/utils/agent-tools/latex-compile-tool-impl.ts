/**
 * LaTeX 编译 Tool 回调实现（无 Vue 依赖，便于单测）
 * 将 .tex 文件或裸 LaTeX 文本编译为 PDF，返回 stderr 与是否成功
 */

import type { ToolCallback, ToolCallbackData, ToolProgress } from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import { createDetailedError } from './tool-utils'
import messageBridge from '../../bridge/message-bridge'

const logger = createRendererLogger('LatexCompileTool')

function getWorkspaceRoots(): string[] {
  try {
    const saved = localStorage.getItem('workspaceFolders')
    if (!saved) return []
    const arr = JSON.parse(saved)
    return Array.isArray(arr)
      ? arr.filter((p: unknown) => typeof p === 'string' && p.length > 0)
      : []
  } catch {
    return []
  }
}

function resolveFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').trim()
  if (normalized.startsWith('/') || /^[A-Za-z]:[/\\]/.test(normalized)) {
    return normalized
  }
  const roots = getWorkspaceRoots()
  const root = roots[0]
  if (!root) return normalized
  const base = root.replace(/\\/g, '/').replace(/\/$/, '')
  return `${base}/${normalized}`
}

function dirname(p: string): string {
  const n = p.replace(/\\/g, '/')
  const i = n.lastIndexOf('/')
  return i >= 0 ? n.slice(0, i) : ''
}

function basename(p: string): string {
  const n = p.replace(/\\/g, '/')
  const i = n.lastIndexOf('/')
  return i >= 0 ? n.slice(i + 1) : n
}

export interface LaTeXCompileToolResult {
  success: boolean
  stderr: string
  pdfPath?: string
  exitCode?: number
  stdout?: string
}

export const latexCompileToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const texFilePathParam = params.texFilePath as string | undefined
  const texParam = params.tex as string | undefined
  const outputPdfPathParam = params.outputPdfPath as string | undefined

  const hasFile = texFilePathParam !== undefined && String(texFilePathParam).trim() !== ''
  const hasText = texParam !== undefined && String(texParam).trim() !== ''

  if (!outputPdfPathParam || typeof outputPdfPathParam !== 'string' || !outputPdfPathParam.trim()) {
    return {
      status: 'failed',
      error: createDetailedError(
        'Missing required parameter: outputPdfPath (output PDF path, e.g. path/to/file.pdf)',
        [
          '{"tex": "\\\\documentclass{article}\\\\begin{document}Hello\\\\end{document}", "outputPdfPath": "out.pdf"}',
          '{"texFilePath": "doc.tex", "outputPdfPath": "doc.pdf"}'
        ],
        ['outputPdfPath 为必填；texFilePath 与 tex 二选一']
      )
    }
  }

  if (hasFile && hasText) {
    return {
      status: 'failed',
      error: createDetailedError(
        'texFilePath 与 tex 只能二选一，不能同时传入',
        ['仅传 texFilePath 或仅传 tex'],
        []
      )
    }
  }

  if (!hasFile && !hasText) {
    return {
      status: 'failed',
      error: createDetailedError(
        '必须提供 texFilePath（.tex 文件路径）或 tex（裸 LaTeX 文本）之一',
        [
          '{"tex": "\\\\documentclass{article}\\\\begin{document}Hello\\\\end{document}", "outputPdfPath": "out.pdf"}',
          '{"texFilePath": "path/to/doc.tex", "outputPdfPath": "path/to/doc.pdf"}'
        ],
        []
      )
    }
  }

  const ipc = messageBridge.getIpc()
  if (!ipc?.invoke) {
    return {
      status: 'failed',
      error: createDetailedError('LaTeX compile is only available in Electron environment', [], [])
    }
  }

  const stderrChunks: string[] = []
  const stdoutChunks: string[] = []

  const onConsoleErr = (_e: unknown, payload: { key?: string; content?: string }) => {
    if (payload?.key === 'latex' && typeof payload.content === 'string') {
      stderrChunks.push(payload.content)
      onUpdate(
        {
          content: {
            stage: 'compiling',
            outputPdfPath: outputPdfPathParam,
            stderr: stderrChunks.join(''),
            stdout: stdoutChunks.join('')
          },
          format: 'json',
          componentName: 'LaTeXCompileDisplay'
        },
        { percentage: 50, message: i18n.global.t('agent.tool.latexCompile.progress.compiling', '正在编译 LaTeX...') }
      )
    }
  }

  const onConsoleOut = (_e: unknown, payload: { key?: string; content?: string }) => {
    if (payload?.key === 'latex' && typeof payload.content === 'string') {
      stdoutChunks.push(payload.content)
      onUpdate(
        {
          content: {
            stage: 'compiling',
            outputPdfPath: outputPdfPathParam,
            stderr: stderrChunks.join(''),
            stdout: stdoutChunks.join('')
          },
          format: 'json',
          componentName: 'LaTeXCompileDisplay'
        },
        { percentage: 50, message: i18n.global.t('agent.tool.latexCompile.progress.compiling', '正在编译 LaTeX...') }
      )
    }
  }

  messageBridge.on('console-err', onConsoleErr)
  messageBridge.on('console-out', onConsoleOut)

  onUpdate(
    {
      content: { stage: 'compiling', outputPdfPath: outputPdfPathParam },
      format: 'json',
      componentName: 'LaTeXCompileDisplay'
    },
    { percentage: 10, message: i18n.global.t('agent.tool.latexCompile.progress.compiling', '正在编译 LaTeX...') }
  )

  try {
    let texPath = ''
    let tex = ''

    if (hasFile) {
      const absTexPath = resolveFilePath(texFilePathParam!.trim())
      let content: string | null = null
      try {
        content = (await messageBridge.invoke('read-file-content', absTexPath)) as string | null
      } catch (e) {
        logger.warn('read-file-content failed', e)
      }
      if (content === null || content === undefined) {
        return {
          status: 'failed',
          error: createDetailedError(`Cannot read .tex file: ${absTexPath}`, [], [])
        }
      }
      texPath = absTexPath
      tex = String(content)
    } else {
      tex = String(texParam!).trim()
    }

    const resolvedOutput = resolveFilePath(outputPdfPathParam.trim())
    const outputDir = dirname(resolvedOutput)
    const customPdfFileName = basename(resolvedOutput)

    const compileResult = (await messageBridge.invoke('compile-tex', {
      texPath,
      tex,
      outputDir,
      customPdfFileName
    })) as {
      status: 'success' | 'failed'
      pdfPath?: string
      exitCode?: number
      stderr?: string
      stdout?: string
    }

    const success = compileResult?.status === 'success'
    const stderr = compileResult?.stderr ?? ''
    const result: LaTeXCompileToolResult = {
      success,
      stderr,
      pdfPath: compileResult?.pdfPath,
      exitCode: compileResult?.exitCode,
      stdout: compileResult?.stdout
    }

    onUpdate(
      {
        content: { stage: 'completed', ...result },
        format: 'json',
        componentName: 'LaTeXCompileDisplay'
      },
      { percentage: 100, message: i18n.global.t('agent.tool.latexCompile.progress.completed', '编译完成') }
    )

    return {
      status: success ? 'succeeded' : 'failed',
      data: {
        content: { stage: 'completed', ...result },
        format: 'json',
        componentName: 'LaTeXCompileDisplay'
      },
      result
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('LaTeX 编译失败:', error)
    return {
      status: 'failed',
      error: i18n.global.t(
        'agent.tool.latexCompile.error.failed',
        { error: errorMessage },
        `LaTeX 编译失败: ${errorMessage}`
      )
    }
  } finally {
    messageBridge.removeListener('console-err', onConsoleErr)
    messageBridge.removeListener('console-out', onConsoleOut)
  }
}
