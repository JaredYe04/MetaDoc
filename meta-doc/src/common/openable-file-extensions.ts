/**
 * 可从系统/命令行打开并作为 MetaDoc 文档加载的扩展名（含点、小写）。
 * 与 renderer 中 format-initializer 注册的格式对齐；主进程 argv 与单实例转发共用。
 */
export const OPENABLE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md',
  '.markdown',
  '.tex',
  '.txt',
  '.text',
  '.json',
  '.pdf',
  '.svg',
  '.html',
  '.htm',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
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
  '.css',
  '.scss',
  '.sass',
  '.less',
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
  '.log',
  '.dockerfile',
  '.mk'
])

export function isOpenableFileExtension(extWithDot: string): boolean {
  const e = extWithDot.startsWith('.') ? extWithDot.toLowerCase() : `.${extWithDot.toLowerCase()}`
  if (OPENABLE_FILE_EXTENSIONS.has(e)) return true
  const base = extWithDot.replace(/^\./, '').toLowerCase()
  if (base === 'dockerfile' || base.endsWith('dockerfile')) return true
  if (base === 'makefile' || base === 'gnumakefile') return true
  return false
}

/** 根据路径判断是否可作为文档打开（扩展名 + Makefile / Dockerfile 等）；无 Node path 依赖，可供渲染进程打包使用 */
export function isOpenableFilePath(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/')
  const lastSlash = norm.lastIndexOf('/')
  const base = (lastSlash >= 0 ? norm.slice(lastSlash + 1) : norm).toLowerCase()
  const lastDot = norm.lastIndexOf('.')
  const ext = lastDot > lastSlash ? norm.slice(lastDot).toLowerCase() : ''
  if (ext && isOpenableFileExtension(ext)) return true
  if (base === 'makefile' || base === 'gnumakefile') return true
  if (base === 'dockerfile' || base.endsWith('.dockerfile')) return true
  return false
}
