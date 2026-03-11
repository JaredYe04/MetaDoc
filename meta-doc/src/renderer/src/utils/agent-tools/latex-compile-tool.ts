/**
 * LaTeX 编译 Tool
 * 将 .tex 文件或裸 LaTeX 文本编译为 PDF，返回 stderr 与是否成功
 */

import type { AgentToolConfig, ToolLocales } from '../../types/agent-tool'
import LaTeXCompileDisplay from './components/LaTeXCompileDisplay.vue'
import {
  latexCompileToolCallback,
  type LaTeXCompileToolResult
} from './latex-compile-tool-impl'

export type { LaTeXCompileToolResult }

const latexCompileToolLocales: ToolLocales = {
  zh_cn: {
    name: 'LaTeX 编译',
    description: '将 .tex 文件或裸 LaTeX 文本编译为 PDF，返回 stderr 与是否成功',
    instruction: `
# LaTeX 编译工具

## 功能描述
使用 node-latex-compiler 将 LaTeX 源码编译为 PDF。支持两种输入方式二选一：1）传入 .tex 文件路径；2）传入裸 LaTeX 文本。必须指定输出 PDF 路径。

## 输入格式
\`\`\`json
{
  "texFilePath": "path/to/source.tex",  // 可选，.tex 文件路径（与 tex 二选一）
  "tex": "\\\\documentclass{article}...",   // 可选，裸 LaTeX 文本（与 texFilePath 二选一）
  "outputPdfPath": "path/to/output.pdf"    // 必需，输出的 PDF 路径
}
\`\`\`

## 输出格式
\`\`\`json
{
  "success": true,
  "stderr": "编译过程的标准错误（可能含警告，与 success 不冲突）",
  "pdfPath": "path/to/output.pdf",
  "exitCode": 0,
  "stdout": "可选的标准输出"
}
\`\`\`

## 注意事项
- texFilePath 与 tex 必须二选一，不能同时传或都不传。
- outputPdfPath 为必需，且应为 path/to/file.pdf 形式。
- 有 stderr 不一定编译失败，最终以 success 为准。
`
  },
  en_us: {
    name: 'LaTeX Compile',
    description: 'Compile .tex file or raw LaTeX text to PDF; returns stderr and success status',
    instruction: `
# LaTeX Compile Tool

## Description
Compiles LaTeX source to PDF using node-latex-compiler. Either provide a .tex file path or raw LaTeX text (mutually exclusive). Must specify output PDF path.

## Input Format
\`\`\`json
{
  "texFilePath": "path/to/source.tex",
  "tex": "\\\\documentclass{article}...",
  "outputPdfPath": "path/to/output.pdf"
}
\`\`\`

## Output Format
\`\`\`json
{
  "success": true,
  "stderr": "stderr from compiler (warnings may appear; not necessarily failure)",
  "pdfPath": "path/to/output.pdf",
  "exitCode": 0,
  "stdout": "optional stdout"
}
\`\`\`

## Notes
- Provide exactly one of texFilePath or tex. outputPdfPath is required.
- Presence of stderr does not imply failure; check success field.
`
  },
  de_DE: {
    name: 'LaTeX-Kompilierung',
    description: 'Kompiliert .tex-Datei oder LaTeX-Text zu PDF; gibt stderr und Erfolg zurück'
  },
  fr_FR: {
    name: 'Compilation LaTeX',
    description: 'Compile un fichier .tex ou du texte LaTeX en PDF ; retourne stderr et succès'
  },
  ja_JP: {
    name: 'LaTeX コンパイル',
    description: '.tex ファイルまたは LaTeX テキストを PDF にコンパイルし、stderr と成功可否を返す'
  },
  ko_KR: {
    name: 'LaTeX 컴파일',
    description: '.tex 파일 또는 LaTeX 텍스트를 PDF로 컴파일하고 stderr 및 성공 여부 반환'
  }
}

export const latexCompileToolConfig: AgentToolConfig = {
  id: 'latex-compile',
  name: latexCompileToolLocales,
  description: latexCompileToolLocales,
  origin: 'internal',
  spec: {
    name: 'latex-compile',
    brief:
      'Compile LaTeX to PDF. Pass either texFilePath (.tex path) or tex (raw LaTeX string), and outputPdfPath (e.g. path/to/file.pdf). Returns stderr and success.',
    fullSpec: `
# LaTeX Compile Tool

Compile LaTeX source to PDF. Input: exactly one of texFilePath or tex; required outputPdfPath. Returns stderr (may contain warnings; not necessarily failure) and success.

## Input
- texFilePath (optional): path to .tex file
- tex (optional): raw LaTeX text
- outputPdfPath (required): path for output PDF, e.g. path/to/file.pdf

## Output
- success: boolean
- stderr: string
- pdfPath, exitCode, stdout: optional
`
  },
  instruction: latexCompileToolLocales,
  tags: ['latex', 'compile', 'pdf', 'document'],
  enabled: true,
  displayComponent: LaTeXCompileDisplay,
  callback: latexCompileToolCallback,
  inputSchema: {
    type: 'object',
    properties: {
      texFilePath: { type: 'string', description: '.tex 文件路径（与 tex 二选一）' },
      tex: { type: 'string', description: '裸 LaTeX 文本（与 texFilePath 二选一）' },
      outputPdfPath: { type: 'string', description: '输出的 PDF 路径，如 path/to/file.pdf' }
    },
    required: ['outputPdfPath']
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      stderr: { type: 'string' },
      pdfPath: { type: 'string' },
      exitCode: { type: 'number' },
      stdout: { type: 'string' }
    }
  },
  locales: latexCompileToolLocales
}
