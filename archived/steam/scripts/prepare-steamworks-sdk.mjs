/**
 * 自动准备 greenworks 所需的 Steamworks SDK：链到 node_modules/greenworks/deps/steamworks_sdk
 *
 * 优先级：
 * 1) third-party/steamworks-sdk/SteamworksSDK.zip（或 steamworks_sdk.zip / steamworks.zip）— 推荐私有仓库随包提交
 * 2) STEAMWORKS_SDK_PATH
 * 3) <repo>/steamworks_sdk/
 * 4) STEAMWORKS_SDK_ZIP（本机 zip）
 * 5) STEAMWORKS_SDK_ARCHIVE_URL（可选私有 URL + STEAMWORKS_SDK_ARCHIVE_HEADERS JSON）
 * 6) 缓存 .steamworks/steamworks_sdk（上一档解压结果）
 *
 * 未安装 greenworks 或未配置 SDK 时退出 0，不影响其他开发者。
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  rmSync,
  cpSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

dotenv.config({ path: join(root, '.env') })
dotenv.config({ path: join(root, 'resources', '.env') })

const GW = join(root, 'node_modules', 'greenworks')
const DEPS = join(GW, 'deps')
const LINK_TARGET = join(DEPS, 'steamworks_sdk')
const CACHE_SDK = join(root, '.steamworks', 'steamworks_sdk')
const TMP_EXTRACT = join(root, '.steamworks', '_extract_tmp')
const TMP_ZIP = join(root, '.steamworks', '_sdk_archive.zip')
const REPO_SDK_DIR = join(root, 'third-party', 'steamworks-sdk')
const REPO_ZIP_NAMES = ['SteamworksSDK.zip', 'steamworks_sdk.zip', 'steamworks.zip']

function isDir(p) {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

function isFile(p) {
  try {
    return existsSync(p) && statSync(p).isFile()
  } catch {
    return false
  }
}

function findRepoSdkZip() {
  for (const name of REPO_ZIP_NAMES) {
    const p = join(REPO_SDK_DIR, name)
    if (isFile(p)) {
      return p
    }
  }
  return null
}

function cacheMatchesZip(zipPath) {
  if (!isValidSdkRoot(CACHE_SDK)) {
    return false
  }
  const sig = join(CACHE_SDK, '.sdk_source_sig')
  if (!existsSync(sig)) {
    return false
  }
  try {
    const lines = readFileSync(sig, 'utf8').split('\n')
    const pathLine = lines[0]?.trim() ?? ''
    const msLine = lines[1]?.trim() ?? ''
    const sizeLine = lines[2]?.trim() ?? ''
    if (resolve(pathLine) !== resolve(zipPath)) {
      return false
    }
    const st = statSync(zipPath)
    return String(st.mtimeMs) === msLine && String(st.size) === sizeLine
  } catch {
    return false
  }
}

function writeZipSig(zipPath) {
  const st = statSync(zipPath)
  writeFileSync(
    join(CACHE_SDK, '.sdk_source_sig'),
    `${resolve(zipPath)}\n${st.mtimeMs}\n${st.size}\n`,
    'utf8'
  )
}

function isValidSdkRoot(dir) {
  if (!isDir(dir)) {
    return false
  }
  const pub = join(dir, 'public', 'steam')
  const redist = join(dir, 'redistributable_bin')
  return existsSync(pub) || existsSync(redist)
}

function findSdkRoot(searchDir, maxDepth = 5) {
  if (maxDepth < 0 || !isDir(searchDir)) {
    return null
  }
  if (isValidSdkRoot(searchDir)) {
    return searchDir
  }
  let entries
  try {
    entries = readdirSync(searchDir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) {
      continue
    }
    const sub = join(searchDir, e.name)
    const found = findSdkRoot(sub, maxDepth - 1)
    if (found) {
      return found
    }
  }
  return null
}

function rm(p) {
  try {
    rmSync(p, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

function extractZip(zipPath, destDir) {
  rm(destDir)
  mkdirSync(destDir, { recursive: true })
  const zp = resolve(zipPath)
  const dd = resolve(destDir)
  if (process.platform === 'win32') {
    const z = zp.replace(/'/g, "''")
    const d = dd.replace(/'/g, "''")
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${z}' -DestinationPath '${d}' -Force"`,
      { stdio: 'inherit', cwd: root }
    )
  } else {
    execSync(`unzip -o -q ${JSON.stringify(zp)} -d ${JSON.stringify(dd)}`, {
      stdio: 'inherit',
      cwd: root
    })
  }
}

function materializeFromZip(zipPath) {
  if (!existsSync(zipPath) || !statSync(zipPath).isFile()) {
    throw new Error(`STEAMWORKS_SDK_ZIP 不是有效文件: ${zipPath}`)
  }
  mkdirSync(join(root, '.steamworks'), { recursive: true })
  rm(TMP_EXTRACT)
  extractZip(zipPath, TMP_EXTRACT)
  const inner = findSdkRoot(TMP_EXTRACT)
  if (!inner) {
    rm(TMP_EXTRACT)
    throw new Error('压缩包内未找到 Steamworks SDK 根目录（需含 public/steam 或 redistributable_bin）')
  }
  rm(CACHE_SDK)
  mkdirSync(dirname(CACHE_SDK), { recursive: true })
  cpSync(inner, CACHE_SDK, { recursive: true })
  rm(TMP_EXTRACT)
  return CACHE_SDK
}

async function downloadUrl(url, destFile) {
  const headers = {}
  const raw = process.env.STEAMWORKS_SDK_ARCHIVE_HEADERS
  if (raw) {
    try {
      Object.assign(headers, JSON.parse(raw))
    } catch {
      console.warn('[steamworks] STEAMWORKS_SDK_ARCHIVE_HEADERS 不是合法 JSON，已忽略')
    }
  }
  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(destFile, buf)
}

async function maybeFetchAndMaterialize() {
  const zipPath = process.env.STEAMWORKS_SDK_ZIP
  if (zipPath && zipPath.trim()) {
    const z = zipPath.trim()
    materializeFromZip(z)
    writeZipSig(z)
    return CACHE_SDK
  }
  const url = process.env.STEAMWORKS_SDK_ARCHIVE_URL
  if (!url || !url.trim()) {
    return null
  }
  console.log('[steamworks] 正在从 STEAMWORKS_SDK_ARCHIVE_URL 下载 SDK 压缩包…')
  mkdirSync(join(root, '.steamworks'), { recursive: true })
  rm(TMP_ZIP)
  await downloadUrl(url.trim(), TMP_ZIP)
  const sz = statSync(TMP_ZIP).size
  try {
    materializeFromZip(TMP_ZIP)
    writeFileSync(
      join(CACHE_SDK, '.sdk_source_sig'),
      `STEAMWORKS_SDK_ARCHIVE_URL\n${url.trim()}\n${sz}\n`,
      'utf8'
    )
    return CACHE_SDK
  } finally {
    rm(TMP_ZIP)
  }
}

function linkOrCopySdk(sourceDir) {
  const absSrc = resolve(sourceDir)
  if (!isValidSdkRoot(absSrc)) {
    console.warn(`[steamworks] 目录看起来不是有效 SDK 根路径，已跳过: ${absSrc}`)
    return false
  }
  mkdirSync(DEPS, { recursive: true })
  rm(LINK_TARGET)
  try {
    if (process.platform === 'win32') {
      symlinkSync(absSrc, LINK_TARGET, 'junction')
    } else {
      symlinkSync(absSrc, LINK_TARGET, 'dir')
    }
    console.log(`[steamworks] 已链接 SDK → ${LINK_TARGET}`)
    return true
  } catch {
    try {
      cpSync(absSrc, LINK_TARGET, { recursive: true })
      console.log(`[steamworks] 链接失败，已改为复制 SDK → ${LINK_TARGET}`)
      return true
    } catch (e2) {
      console.warn('[steamworks] 无法链接或复制 SDK:', e2 instanceof Error ? e2.message : e2)
      return false
    }
  }
}

async function warmRepoZipToCache() {
  const repoZip = findRepoSdkZip()
  if (!repoZip) {
    return
  }
  try {
    if (!cacheMatchesZip(repoZip)) {
      console.log('[steamworks] 使用仓库内 SDK 压缩包:', repoZip)
      materializeFromZip(repoZip)
      writeZipSig(repoZip)
    }
  } catch (e) {
    console.warn('[steamworks] 处理仓库内 SDK 压缩包失败:', e instanceof Error ? e.message : e)
  }
}

async function main() {
  await warmRepoZipToCache()

  if (!existsSync(GW)) {
    process.exit(0)
  }

  let source = null

  const repoZip = findRepoSdkZip()
  if (repoZip && isValidSdkRoot(CACHE_SDK)) {
    source = CACHE_SDK
  }

  if (!source) {
    const envPath = process.env.STEAMWORKS_SDK_PATH
    if (envPath && envPath.trim() && isDir(envPath.trim())) {
      source = envPath.trim()
    } else if (isDir(join(root, 'steamworks_sdk'))) {
      source = join(root, 'steamworks_sdk')
    }
  }

  if (!source) {
    try {
      const fromArchive = await maybeFetchAndMaterialize()
      if (fromArchive) {
        source = fromArchive
      }
    } catch (e) {
      console.warn('[steamworks] 从环境变量 zip/URL 准备 SDK 失败:', e instanceof Error ? e.message : e)
    }
  }

  if (!source && isDir(CACHE_SDK) && isValidSdkRoot(CACHE_SDK)) {
    source = CACHE_SDK
  }

  if (!source) {
    process.exit(0)
  }

  linkOrCopySdk(source)
  process.exit(0)
}

main().catch((e) => {
  console.warn('[steamworks] prepare 异常:', e instanceof Error ? e.message : e)
  process.exit(0)
})
