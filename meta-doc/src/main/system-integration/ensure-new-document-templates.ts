/**
 * 将「新建文档」模板安装到用户目录，供各桌面环境使用：
 * - Linux：XDG 模板目录（Nautilus 等「在文件夹中新建文档」）
 * - macOS：无与 Windows ShellNew 等价的系统 API，写入 ~/Templates（若不存在则创建）或 Application Support 下的可写副本
 */
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { createMainLogger } from '../logger'

const logger = createMainLogger('NewDocTemplates')

const MARKDOWN_NAME = 'MetaDoc-New-Markdown.md'
const LATEX_NAME = 'MetaDoc-New-LaTeX.tex'

async function existsDir(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p)
    return st.isDirectory()
  } catch {
    return false
  }
}

async function resolveLinuxTemplatesDir(home: string): Promise<string> {
  try {
    const userDirs = path.join(home, '.config', 'user-dirs.dirs')
    const text = await fs.readFile(userDirs, 'utf8')
    const m = text.match(/XDG_TEMPLATES_DIR\s*=\s*"(.*?)"/)
    if (m?.[1]) {
      const expanded = m[1].replace(/\$HOME/g, home)
      if (await existsDir(expanded)) return expanded
    }
  } catch {
    // ignore
  }
  return path.join(home, 'Templates')
}

async function copyIfChanged(src: string, dest: string): Promise<void> {
  try {
    const [s, d] = await Promise.all([
      fs.readFile(src, 'utf8').catch(() => null),
      fs.readFile(dest, 'utf8').catch(() => null)
    ])
    if (s === null) return
    if (d === s) return
    await fs.writeFile(dest, s, 'utf8')
  } catch (e) {
    logger.warn('copyIfChanged failed', dest, e)
  }
}

async function resolveBundledTemplatesDir(): Promise<string | null> {
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'shell-new-templates'),
    path.join(process.resourcesPath, 'shell-new-templates'),
    path.join(__dirname, '../../resources/shell-new-templates')
  ]
  for (const c of candidates) {
    try {
      await fs.access(path.join(c, MARKDOWN_NAME))
      await fs.access(path.join(c, LATEX_NAME))
      return c
    } catch {
      continue
    }
  }
  return null
}

export async function ensureUserNewDocumentTemplatesInstalled(): Promise<void> {
  if (!app.isPackaged) return
  const srcDir = await resolveBundledTemplatesDir()
  if (!srcDir) {
    logger.warn('shell-new-templates not found in bundle')
    return
  }

  const home = app.getPath('home')

  if (process.platform === 'linux') {
    const destDir = await resolveLinuxTemplatesDir(home)
    try {
      await fs.mkdir(destDir, { recursive: true })
      await copyIfChanged(path.join(srcDir, MARKDOWN_NAME), path.join(destDir, MARKDOWN_NAME))
      await copyIfChanged(path.join(srcDir, LATEX_NAME), path.join(destDir, LATEX_NAME))
    } catch (e) {
      logger.warn('linux templates install failed', e)
    }
    return
  }

  if (process.platform === 'darwin') {
    const destDir = path.join(home, 'Templates')
    try {
      await fs.mkdir(destDir, { recursive: true })
      await copyIfChanged(path.join(srcDir, MARKDOWN_NAME), path.join(destDir, MARKDOWN_NAME))
      await copyIfChanged(path.join(srcDir, LATEX_NAME), path.join(destDir, LATEX_NAME))
    } catch (e) {
      logger.warn('macOS templates install failed', e)
    }
  }
}
