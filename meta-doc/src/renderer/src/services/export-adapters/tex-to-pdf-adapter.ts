import { BaseExportAdapter } from './base-adapter'
import type { TexPdfCompileExportOptions, ExportOptionField } from './types'

/**
 * LaTeX -> PDF：与工具栏「编译」、LaTeXCompilerPanel、左侧菜单「导出 PDF」共用编译选项。
 * 输出位置由编辑器/保存对话框决定，不在此表单中配置。
 */
export class TexToPdfAdapter extends BaseExportAdapter<'tex', 'pdf', TexPdfCompileExportOptions> {
  sourceFormat: 'tex' = 'tex'
  targetFormat: 'pdf' = 'pdf'
  id = 'tex-to-pdf'
  name = 'LaTeX to PDF'
  nameKey = 'export.adapters.texToPdf.name'
  description = 'Export LaTeX document to PDF format (via compilation)'
  descriptionKey = 'export.adapters.texToPdf.description'

  getDefaultOptions(): TexPdfCompileExportOptions {
    return {
      compilerEngine: 'tectonic',
      interactionMode: 'nonstopmode',
      synctex: true,
      shellEscape: false,
      draft: false
    }
  }

  getOptionFields(): ExportOptionField[] {
    return [
      {
        key: 'compilerEngine',
        label: '编译引擎',
        labelKey: 'latexEditor.compiler.engine',
        type: 'select',
        default: 'tectonic',
        descriptionKey: 'latexEditor.compiler.engineFieldHint',
        options: [
          {
            label: 'Tectonic',
            value: 'tectonic',
            labelKey: 'latexEditor.compiler.engineOptTectonic',
            hintKey: 'latexEditor.compiler.engineHintTectonic'
          },
          {
            label: 'XeLaTeX',
            value: 'xelatex',
            labelKey: 'latexEditor.compiler.engineOptXelatex',
            hintKey: 'latexEditor.compiler.engineHintXelatex'
          },
          {
            label: 'pdfLaTeX',
            value: 'pdflatex',
            labelKey: 'latexEditor.compiler.engineOptPdflatex',
            hintKey: 'latexEditor.compiler.engineHintPdflatex'
          },
          {
            label: 'LuaLaTeX',
            value: 'lualatex',
            labelKey: 'latexEditor.compiler.engineOptLualatex',
            hintKey: 'latexEditor.compiler.engineHintLualatex'
          }
        ]
      },
      {
        key: 'interactionMode',
        label: '交互模式',
        labelKey: 'latexEditor.compiler.interaction',
        type: 'select',
        default: 'nonstopmode',
        descriptionKey: 'latexEditor.compiler.interactionModeFieldHint',
        options: [
          {
            label: 'nonstop',
            value: 'nonstopmode',
            labelKey: 'latexEditor.compiler.nonstop',
            hintKey: 'latexEditor.compiler.interactionHintNonstop'
          },
          {
            label: 'batch',
            value: 'batchmode',
            labelKey: 'latexEditor.compiler.batch',
            hintKey: 'latexEditor.compiler.interactionHintBatch'
          },
          {
            label: 'scroll',
            value: 'scrollmode',
            labelKey: 'latexEditor.compiler.scroll',
            hintKey: 'latexEditor.compiler.interactionHintScroll'
          },
          {
            label: 'errorstop',
            value: 'errorstopmode',
            labelKey: 'latexEditor.compiler.errorstop',
            hintKey: 'latexEditor.compiler.interactionHintErrorstop'
          }
        ]
      },
      {
        key: 'synctex',
        label: '-synctex=1',
        labelKey: 'latexEditor.compiler.flagSynctex',
        type: 'boolean',
        default: true,
        descriptionKey: 'latexEditor.compiler.flagSynctexHint'
      },
      {
        key: 'shellEscape',
        label: '-shell-escape',
        labelKey: 'latexEditor.compiler.flagShellEscape',
        type: 'boolean',
        default: false,
        descriptionKey: 'latexEditor.compiler.flagShellEscapeHint'
      },
      {
        key: 'draft',
        label: '-draftmode',
        labelKey: 'latexEditor.compiler.flagDraft',
        type: 'boolean',
        default: false,
        descriptionKey: 'latexEditor.compiler.flagDraftHint'
      }
    ]
  }

  validateOptions(_options: Partial<TexPdfCompileExportOptions>): {
    valid: boolean
    error?: string
  } {
    return { valid: true }
  }

  async prepareExportData(
    data: { md: string; json: string; tex: string },
    _options: TexPdfCompileExportOptions,
    _context?: any
  ): Promise<{
    md: string
    json: string
    tex: string
    html?: string
    imageUrls?: string[]
  }> {
    return {
      ...data
    }
  }

  async executeExport(
    _preparedData: {
      md: string
      json: string
      tex: string
      html?: string
      imageUrls?: string[]
    },
    _targetPath: string,
    _options: TexPdfCompileExportOptions,
    _context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process')
  }
}
