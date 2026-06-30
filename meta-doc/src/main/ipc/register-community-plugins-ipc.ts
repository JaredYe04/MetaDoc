import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { ipcBridge } from '../bridge/ipc-bridge'

const PLUGIN_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]*$/
const ALLOWED_ENTRY_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])

interface CommunityPluginManifest {
  id: string
  name: string
  version: string
  entry: string
  permissions?: string[]
}

export interface CommunityPluginEntryResolution {
  entryUrl: string
  manifest: CommunityPluginManifest
}

function getPluginsRoot(): string {
  return path.join(app.getPath('userData'), 'plugins')
}

function isPathInsideDir(dir: string, target: string): boolean {
  const base = path.resolve(dir)
  const resolved = path.resolve(target)
  return resolved === base || resolved.startsWith(base + path.sep)
}

function readManifest(dir: string): CommunityPluginManifest | null {
  const manifestPath = path.join(dir, 'metadoc-plugin.json')
  if (!fs.existsSync(manifestPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CommunityPluginManifest
    if (!raw?.id || !raw?.entry || !raw?.name || !raw?.version) return null
    if (!PLUGIN_ID_PATTERN.test(raw.id)) return null
    return raw
  } catch {
    return null
  }
}

function resolveEntryPath(pluginDir: string, manifest: CommunityPluginManifest): string | null {
  const entryPath = path.resolve(pluginDir, manifest.entry)
  if (!isPathInsideDir(pluginDir, entryPath)) return null
  if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) return null
  const ext = path.extname(entryPath).toLowerCase()
  if (!ALLOWED_ENTRY_EXTENSIONS.has(ext)) return null
  return entryPath
}

export function registerCommunityPluginsIpc(): void {
  ipcBridge.registerHandle(
    'community-plugins:list',
    async (): Promise<CommunityPluginManifest[]> => {
      const root = getPluginsRoot()
      if (!fs.existsSync(root)) return []
      const entries = fs.readdirSync(root, { withFileTypes: true })
      const manifests: CommunityPluginManifest[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dir = path.join(root, entry.name)
        const manifest = readManifest(dir)
        if (!manifest) continue
        if (manifest.id !== entry.name) {
          console.warn(
            `[community-plugins] skipped ${entry.name}: directory name must match manifest id`
          )
          continue
        }
        manifests.push(manifest)
      }
      return manifests
    }
  )

  ipcBridge.registerHandle(
    'community-plugins:resolve-entry',
    async (_event, pluginId: string): Promise<CommunityPluginEntryResolution | null> => {
      const id = String(pluginId ?? '')
      if (!PLUGIN_ID_PATTERN.test(id)) return null

      const root = getPluginsRoot()
      const dir = path.join(root, id)
      if (!fs.existsSync(dir)) return null

      const manifest = readManifest(dir)
      if (!manifest || manifest.id !== id) return null

      const entryPath = resolveEntryPath(dir, manifest)
      if (!entryPath) return null

      return {
        entryUrl: pathToFileURL(entryPath).href,
        manifest
      }
    }
  )
}
