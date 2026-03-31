/**
 * LaTeX 编译 Tool
 * 将 .tex 文件或裸 LaTeX 文本编译为 PDF，返回 stderr 与是否成功
 */

import type { AgentToolConfig } from '../../types/agent-tool'
import LaTeXCompileDisplay from './components/LaTeXCompileDisplay.vue'
import { latexCompileToolCallback, type LaTeXCompileToolResult } from './latex-compile-tool-impl'

export type { LaTeXCompileToolResult }

const LATEX_COMPILE_INSTRUCTION_EN = `
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

const LATEX_COMPILE_TOOL_NAME = 'LaTeX Compile'
const LATEX_COMPILE_TOOL_DESCRIPTION =
  'Compile .tex file or raw LaTeX text to PDF; returns stderr and success status'

export const latexCompileToolConfig: AgentToolConfig = {
  id: 'latex-compile',
  name: LATEX_COMPILE_TOOL_NAME,
  description: LATEX_COMPILE_TOOL_DESCRIPTION,
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
  instruction: LATEX_COMPILE_INSTRUCTION_EN,
  tags: ['latex', 'compile', 'pdf', 'document'],
  enabled: true,
  displayComponent: LaTeXCompileDisplay,
  callback: latexCompileToolCallback,
  inputSchema: {
    type: 'object',
    properties: {
      texFilePath: {
        type: 'string',
        description: '.tex file path (use one of texFilePath or tex)'
      },
      tex: { type: 'string', description: 'Raw LaTeX text (use one of texFilePath or tex)' },
      outputPdfPath: { type: 'string', description: 'Output PDF path, e.g. path/to/file.pdf' }
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
  }
}
