/**
 * LaTeX 编译服务 - TypeScript 重构版本
 * 将 LaTeX 代码编译为 PDF 文档
 * 使用 node-latex-compiler 库进行跨平台编译
 */

import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { app } from 'electron'
import type {
  FilePath,
  LaTeXCompileResult,
  LaTeXCompileConfig,
  LaTeXService,
  LatexCompilerEngine,
  LaTeXCompileExtras
} from '../../types/utils'
import type { BrowserWindow } from 'electron'
import { createMainLogger } from '../logger'

const logger = createMainLogger('latex-service')

/**
 * 在打包环境中从解包位置加载 node-latex-compiler 模块
 * 避免在 asar 内部创建文件导致 ENOTDIR 错误
 */
function loadLatexCompilerModule() {
  if (app.isPackaged) {
    // 打包环境：从解包位置加载模块
    const latexCompilerModulePath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'node-latex-compiler'
    )
    if (fs.existsSync(latexCompilerModulePath)) {
      // 使用绝对路径加载解包后的模块
      const latexCompiler = require(latexCompilerModulePath)
      logger.debug('打包环境：从解包位置加载 node-latex-compiler:', latexCompilerModulePath)
      return latexCompiler
    } else {
      logger.warn('打包环境：未找到解包后的 node-latex-compiler 模块:', latexCompilerModulePath)
      // 回退到默认 require
      return require('node-latex-compiler')
    }
  } else {
    // 开发环境：正常加载模块
    return require('node-latex-compiler')
  }
}

// 动态加载模块
const latexCompiler = loadLatexCompilerModule()
const { compile, isAvailable, getVersion } = latexCompiler

/**
 * LaTeX 编译服务实现类
 */
class LaTeXServiceImpl implements LaTeXService {
  constructor() {
    // 不再需要 tectonicPath，由 node-latex-compiler 自动管理
  }

  /**
   * 清理文件路径，移除 file:// 前缀并规范化路径
   */
  private normalizeFilePath(filePath: FilePath): string {
    if (!filePath) return ''

    // 移除 file:/// 前缀（如果存在）
    let normalized = filePath.replace(/^file:\/\/\//, '')

    // 规范化路径（处理 .. 和 . 等）
    normalized = path.normalize(normalized)

    return normalized
  }

  /**
   * 使用系统安装的 xelatex / pdflatex / lualatex 编译（需在 PATH 中可用）
   */
  private compileWithCliEngine(
    config: LaTeXCompileConfig,
    engine: Exclude<LatexCompilerEngine, 'tectonic'>,
    normalizedTexPath: string,
    actualOutputDir: string,
    outputFile: string,
    mainWindow: BrowserWindow | undefined
  ): Promise<LaTeXCompileResult> {
    const interaction = config.interactionMode ?? 'nonstopmode'
    const synctex = config.synctex !== false
    const shellEscape = Boolean(config.shellEscape)
    const draft = Boolean(config.draft)

    const args: string[] = [`-interaction=${interaction}`, '-file-line-error']
    if (synctex) args.push('-synctex=1')
    if (shellEscape) args.push('-shell-escape')
    if (draft) args.push('-draftmode')
    args.push(`-output-directory=${actualOutputDir}`)
    args.push(normalizedTexPath)

    const texDir = path.dirname(normalizedTexPath)
    const jobPdf = path.join(
      actualOutputDir,
      path.basename(normalizedTexPath, path.extname(normalizedTexPath)) + '.pdf'
    )

    return new Promise((resolve) => {
      const child = spawn(engine, args, {
        cwd: texDir,
        env: process.env,
        windowsHide: true,
        shell: process.platform === 'win32'
      })

      const stdoutBuffer: string[] = []
      const stderrBuffer: string[] = []

      const forward = (data: Buffer, channel: 'stdout' | 'stderr') => {
        const s = data.toString()
        if (channel === 'stdout') stdoutBuffer.push(s)
        else stderrBuffer.push(s)
        if (mainWindow) {
          mainWindow.webContents.send(channel === 'stdout' ? 'console-out' : 'console-err', {
            key: 'latex',
            content: s,
            type: channel === 'stdout' ? 'out' : 'err'
          })
        }
      }

      child.stdout?.on('data', (d) => forward(d, 'stdout'))
      child.stderr?.on('data', (d) => forward(d, 'stderr'))

      child.on('error', (err) => {
        const errText = (err?.message ?? String(err)) + '\n'
        if (mainWindow) {
          mainWindow.webContents.send('console-err', {
            key: 'latex',
            content: errText,
            type: 'err'
          })
        }
        resolve({
          status: 'failed',
          exitCode: -1,
          stderr: stderrBuffer.join('') + errText.trimEnd(),
          stdout: stdoutBuffer.join('')
        })
      })

      child.on('close', (code) => {
        const stdout = stdoutBuffer.join('')
        const stderr = stderrBuffer.join('')
        try {
          if (code === 0 && fs.existsSync(jobPdf)) {
            if (jobPdf !== outputFile) {
              if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile)
              try {
                fs.renameSync(jobPdf, outputFile)
              } catch (err: unknown) {
                const errno =
                  err && typeof err === 'object' && 'code' in err
                    ? (err as NodeJS.ErrnoException).code
                    : undefined
                if (errno === 'EXDEV') {
                  fs.copyFileSync(jobPdf, outputFile)
                  fs.unlinkSync(jobPdf)
                } else {
                  throw err
                }
              }
            }
            resolve({
              status: 'success',
              pdfPath: outputFile,
              stderr: stderr || undefined,
              stdout: stdout || undefined
            })
            return
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          resolve({
            status: 'failed',
            exitCode: code ?? -1,
            stderr: (stderr || '') + msg,
            stdout
          })
          return
        }

        resolve({
          status: 'failed',
          exitCode: code ?? -1,
          stderr: stderr || undefined,
          stdout: stdout || undefined
        })
      })
    })
  }

  /**
   * 编译 LaTeX 文件生成 PDF
   * @param config 编译配置
   * @returns 编译结果
   */
  async compileLatexToPDF(config: LaTeXCompileConfig): Promise<LaTeXCompileResult> {
    const { texFilePath, tex, outputDir, mainWindow, customPdfFileName } = config

    try {
      // 验证输入
      if (!tex || tex.trim() === '') {
        return { status: 'failed', exitCode: -1 }
      }

      // 规范化 texFilePath（移除 file:// 前缀）
      const normalizedTexPath = texFilePath ? this.normalizeFilePath(texFilePath) : null

      // 设置输出目录
      // 如果 outputDir 是空字符串或未定义，使用 texFilePath 的目录
      let actualOutputDir: string
      if (outputDir && outputDir.trim() !== '') {
        actualOutputDir = this.normalizeFilePath(outputDir)
      } else if (normalizedTexPath) {
        actualOutputDir = path.dirname(normalizedTexPath)
      } else {
        actualOutputDir = process.cwd()
      }

      // 确保输出目录存在且是目录
      this.ensureDirectoryExists(actualOutputDir)

      // 确定输出 PDF 路径
      const pdfFileName =
        customPdfFileName ||
        (normalizedTexPath
          ? path.basename(normalizedTexPath, path.extname(normalizedTexPath)) + '.pdf'
          : 'output.pdf')
      const outputFile = path.join(actualOutputDir, pdfFileName)

      // 若有 .tex 文件路径：先以 UTF-8 写入该路径再按文件编译，使相对路径（如 ./xxx.tex.images/）基于该目录解析，避免中文/日文路径乱码与“找不到文件”
      if (normalizedTexPath) {
        this.ensureDirectoryExists(path.dirname(normalizedTexPath))
        fs.writeFileSync(normalizedTexPath, tex, 'utf-8')
      }

      const engine: LatexCompilerEngine = config.compilerEngine ?? 'tectonic'
      if (engine !== 'tectonic') {
        if (!normalizedTexPath) {
          return {
            status: 'failed',
            exitCode: -1,
            stderr:
              '使用 XeLaTeX / pdfLaTeX / LuaLaTeX 时需要已保存的 .tex 文件路径（请先保存文档）。'
          }
        }
        return this.compileWithCliEngine(
          config,
          engine,
          normalizedTexPath,
          actualOutputDir,
          outputFile,
          mainWindow
        )
      }

      // 准备输出流处理器
      const stdoutBuffer: string[] = []
      const stderrBuffer: string[] = []

      // 调用 node-latex-compiler：有文件路径时用 texFile 编译（相对路径正确），否则用 tex 在临时目录编译
      const result = await compile({
        ...(normalizedTexPath ? { texFile: normalizedTexPath } : { tex }),
        outputDir: actualOutputDir,
        outputFile: outputFile,
        onStdout: (data: string) => {
          stdoutBuffer.push(data)
          if (mainWindow) {
            mainWindow.webContents.send('console-out', {
              key: 'latex',
              content: data,
              type: 'out'
            })
          }
        },
        onStderr: (data: string) => {
          stderrBuffer.push(data)
          if (mainWindow) {
            mainWindow.webContents.send('console-err', {
              key: 'latex',
              content: data,
              type: 'err'
            })
          }
        }
      })

      // 转换结果格式以匹配我们的接口
      if (result.status === 'success' && result.pdfPath) {
        // node-latex-compiler 可能生成的文件名与预期不同，需要移动/重命名
        if (result.pdfPath !== outputFile && fs.existsSync(result.pdfPath)) {
          if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile) // 删除旧文件
          }
          try {
            fs.renameSync(result.pdfPath, outputFile)
          } catch (err: unknown) {
            const code =
              err && typeof err === 'object' && 'code' in err
                ? (err as NodeJS.ErrnoException).code
                : undefined
            if (code === 'EXDEV') {
              // Windows 等系统上跨盘符（如 D: -> C:）时 rename 会报 EXDEV，改为复制后删除
              fs.copyFileSync(result.pdfPath, outputFile)
              fs.unlinkSync(result.pdfPath)
            } else {
              throw err
            }
          }
        }
        return {
          status: 'success',
          pdfPath: outputFile,
          stderr: stderrBuffer.length ? stderrBuffer.join('') : undefined,
          stdout: stdoutBuffer.length ? stdoutBuffer.join('') : undefined
        }
      } else {
        return {
          status: 'failed',
          exitCode: result.exitCode || -1,
          stderr: stderrBuffer.length ? stderrBuffer.join('') : undefined,
          stdout: stdoutBuffer.length ? stdoutBuffer.join('') : undefined
        }
      }
    } catch (error) {
      logger.error('LaTeX compilation error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (mainWindow) {
        mainWindow.webContents.send('console-err', {
          key: 'latex',
          content: errorMessage,
          type: 'err'
        })
      }
      return { status: 'failed', exitCode: -1, stderr: errorMessage }
    }
  }

  /**
   * 确保目录存在
   * 如果路径已存在但不是目录，会抛出错误
   */
  private ensureDirectoryExists(dirPath: FilePath): void {
    if (!dirPath || dirPath.trim() === '') {
      throw new Error('Directory path is empty')
    }

    // 规范化路径
    const normalizedPath = path.normalize(dirPath)

    // 检查路径是否存在
    if (fs.existsSync(normalizedPath)) {
      // 如果存在，检查是否是目录
      const stats = fs.statSync(normalizedPath)
      if (!stats.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${normalizedPath}`)
      }
    } else {
      // 如果不存在，创建目录
      try {
        fs.mkdirSync(normalizedPath, { recursive: true })
        logger.debug(`Created directory: ${normalizedPath}`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error(`Failed to create directory: ${normalizedPath}`, error)
        throw new Error(`Failed to create directory: ${normalizedPath}. ${errorMessage}`)
      }
    }
  }

  /**
   * 检查 Tectonic 是否可用
   * 使用 node-latex-compiler 的 isAvailable 方法
   */
  isTectonicAvailable(): boolean {
    return isAvailable()
  }

  /**
   * 获取 Tectonic 版本信息
   * 使用 node-latex-compiler 的 getVersion 方法
   */
  async getTectonicVersion(): Promise<string | null> {
    try {
      return await getVersion()
    } catch (error) {
      logger.warn('Failed to get Tectonic version:', error)
      return null
    }
  }

  /**
   * 验证 LaTeX 代码语法（基础检查）
   */
  validateLatexSyntax(tex: string): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    // 基础语法检查
    if (!tex.includes('\\documentclass')) {
      issues.push('Missing \\documentclass declaration')
    }

    if (!tex.includes('\\begin{document}')) {
      issues.push('Missing \\begin{document}')
    }

    if (!tex.includes('\\end{document}')) {
      issues.push('Missing \\end{document}')
    }

    // 检查括号匹配
    const openBraces = (tex.match(/\{/g) || []).length
    const closeBraces = (tex.match(/\}/g) || []).length
    if (openBraces !== closeBraces) {
      issues.push('Mismatched braces')
    }

    return {
      valid: issues.length === 0,
      issues
    }
  }
}

// 创建单例实例
const latexService = new LaTeXServiceImpl()

// 导出单例实例和类型
export default latexService
export { LaTeXServiceImpl }

// 向后兼容的导出（保持原有API）
export const compileLatexToPDF = (
  texFilePath: FilePath,
  tex: string,
  outputDir?: FilePath,
  mainWindow?: BrowserWindow,
  customPdfFileName?: string,
  extras?: LaTeXCompileExtras
): Promise<LaTeXCompileResult> => {
  return latexService.compileLatexToPDF({
    texFilePath,
    tex,
    outputDir,
    mainWindow,
    customPdfFileName,
    ...extras
  })
}
