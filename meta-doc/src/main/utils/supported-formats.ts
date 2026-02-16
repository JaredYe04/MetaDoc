/**
 * 主进程支持的文档格式列表
 * 注意：这个文件应该与渲染进程的格式注册系统保持同步
 * 但由于主进程不能直接使用渲染进程的模块，所以单独维护一份
 */

/**
 * 支持的文档格式扩展名映射
 */
export const SUPPORTED_FILE_EXTENSIONS = new Set<string>([
  // Markdown
  '.md',
  '.markdown',
  // LaTeX
  '.tex',
  // 纯文本和代码文件
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
  '.cxx',
  '.cc',
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
])

/**
 * 根据文件扩展名判断是否支持该格式
 */
export function isSupportedFormat(extension: string): boolean {
  const normalizedExt = extension.startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`
  return SUPPORTED_FILE_EXTENSIONS.has(normalizedExt)
}

/**
 * 判断是否为纯文本格式（不需要处理元信息）
 */
export function isPlainTextFormat(extension: string): boolean {
  const normalizedExt = extension.startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`
  // 除了 .md 和 .tex 之外的所有格式都是纯文本格式
  return normalizedExt !== '.md' && normalizedExt !== '.markdown' && normalizedExt !== '.tex'
}

/**
 * 根据文件路径判断文件格式ID
 * 注意：这个方法应该与渲染进程的 formatRegistry.detectFormat 保持一致
 */
export function detectFileFormatFromPath(filePath: string): string {
  const path = require('path')
  const ext = path.extname(filePath).toLowerCase()

  // LaTeX 格式
  if (ext === '.tex') {
    return 'tex'
  }

  // Markdown 格式
  if (ext === '.md' || ext === '.markdown') {
    return 'md'
  }

  // 其他支持的格式都当作纯文本处理（包括 .txt, .json 等）
  if (isSupportedFormat(ext)) {
    return 'txt'
  }

  // 默认当作 markdown（向后兼容，但应该尽量避免这种情况）
  return 'md'
}
