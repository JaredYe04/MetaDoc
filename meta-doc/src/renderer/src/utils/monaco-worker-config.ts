/**
 * Monaco Editor Worker 配置工具
 * 统一管理所有 Monaco 编辑器的 Worker 配置，避免重复代码
 */

import * as monaco from 'monaco-editor'

/**
 * 配置 Monaco Environment 的 Worker
 * 应该在创建任何 Monaco 编辑器之前调用
 */
export function setupMonacoWorker(): void {
  // 如果已经配置过，直接返回
  if ((window as any).MonacoEnvironment?.getWorker) {
    return
  }

  ;(window as any).MonacoEnvironment = {
    getWorker: function (moduleId: string, label: string) {
      let workerPath = ''

      switch (label) {
        case 'json':
          workerPath = 'http://localhost:52521/monaco/language/json/json.worker.js'
          break
        case 'css':
        case 'scss':
        case 'less':
          workerPath = 'http://localhost:52521/monaco/language/css/css.worker.js'
          break
        case 'html':
        case 'handlebars':
        case 'razor':
          workerPath = 'http://localhost:52521/monaco/language/html/html.worker.js'
          break
        case 'typescript':
        case 'javascript':
          workerPath = 'http://localhost:52521/monaco/language/typescript/ts.worker.js'
          break
        default:
          workerPath = 'http://localhost:52521/monaco/editor/editor.worker.js'
      }

      // ESM worker: 用 import() 动态导入
      const blob = new Blob(
        [`import("${workerPath}");`],
        { type: 'application/javascript' }
      )

      return new Worker(URL.createObjectURL(blob), { type: 'module' })
    }
  }
}

/**
 * 注册 LaTeX 语言支持
 * 如果已经注册过，则跳过
 */
export function registerLatexLanguage(): void {
  if (monaco.languages.getLanguages().find(l => l.id === 'latex')) {
    return
  }

  monaco.languages.register({ id: 'latex' })
  monaco.languages.setMonarchTokensProvider('latex', {
    defaultToken: '',
    tokenPostfix: '.tex',
    tokenizer: {
      root: [
        [/\\[a-zA-Z]+/, 'keyword'],      // LaTeX 命令
        [/%.*$/, 'comment'],             // 注释
        [/\$[^$]*\$/, 'string'],         // 行内公式
        [/{|}/, 'delimiter'],            // 花括号
        [/\[|\]/, 'delimiter'],          // 中括号
        [/[^\s]+/, '']                   // 其他文本
      ]
    }
  })
}

/**
 * 初始化 Monaco 环境（Worker + LaTeX 语言）
 * 应该在应用启动时调用一次
 */
export function initMonacoEnvironment(): void {
  setupMonacoWorker()
  registerLatexLanguage()
}

