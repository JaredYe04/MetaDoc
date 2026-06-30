/**
 * One-off: restore Steam / proprietary modules from git into archived/.
 * Usage: node scripts/extract-steam-archive.mjs [commit=cade1b23]
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const commit = process.argv[2] || 'cade1b23'
const fallbackCommits = ['68b5a7ec', 'HEAD']

function gitShow(filePath, fromCommit = commit) {
  try {
    return execSync(`git show ${fromCommit}:${filePath}`, {
      cwd: repoRoot,
      encoding: 'buffer',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore']
    })
  } catch {
    return null
  }
}

function writeFromGit(gitPath, outPath, { optional = false, fallbacks = fallbackCommits } = {}) {
  const attempts = [commit, ...fallbacks.filter((c) => c !== commit)]
  for (const fromCommit of attempts) {
    const buf = gitShow(gitPath, fromCommit)
    if (!buf) continue
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, buf)
    console.log('wrote', path.relative(repoRoot, outPath), `(from ${fromCommit.slice(0, 8)})`)
    return true
  }
  if (optional) {
    console.warn('skip (missing):', gitPath)
    return false
  }
  throw new Error(`Could not extract ${gitPath} from ${attempts.join(', ')}`)
}

function listTree(prefix, fromCommit = commit) {
  const out = execSync(`git ls-tree -r --name-only ${fromCommit} -- ${prefix}`, {
    cwd: repoRoot,
    encoding: 'utf8'
  })
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

const paths = [
  { prefix: 'meta-doc/src/main/steam', dest: 'archived/steam/main' },
  {
    prefix: 'meta-doc/src/common',
    dest: 'archived/steam/common',
    filter: (p) => /steam/i.test(p)
  },
  {
    prefix: 'meta-doc/cloudflare-worker',
    dest: 'archived/cloudflare-worker'
  },
  {
    prefix: 'meta-doc/docs/cloud',
    dest: 'archived/docs/cloud'
  },
  {
    prefix: 'meta-doc/third-party',
    dest: 'archived/steam/third-party',
    filter: (p) => /steam/i.test(p)
  }
]

for (const { prefix, dest, filter } of paths) {
  for (const gitPath of listTree(prefix)) {
    if (filter && !filter(gitPath)) continue
    const rel = gitPath.slice(prefix.length).replace(/^\//, '')
    writeFromGit(gitPath, path.join(repoRoot, dest, rel), { optional: true })
  }
}

const rendererFiles = listTree('meta-doc/src/renderer/src').filter((p) =>
  /steam|Steam|Workshop|CloudDocuments|LlmSteam|mtx-bridge|metadoc-cloud-auth|workshop-publish/i.test(p)
)
for (const gitPath of rendererFiles) {
  const rel = gitPath.replace(/^meta-doc\/src\/renderer\/src\//, '')
  writeFromGit(gitPath, path.join(repoRoot, 'archived/steam/renderer', rel), { optional: true })
}

for (const wf of ['.github/workflows/release-steam.yml', '.github/workflows/steam-connectivity-test.yml']) {
  writeFromGit(wf, path.join(repoRoot, 'archived/ci', path.basename(wf)), { optional: true })
}

writeFromGit(
  'meta-doc/electron-builder.steam.yml',
  path.join(repoRoot, 'archived/electron-builder.steam.yml')
)

const releaseDocCandidates = ['docs/RELEASE_AND_STEAM.md', 'meta-doc/docs/RELEASE_AND_STEAM.md']
for (const docPath of releaseDocCandidates) {
  if (writeFromGit(docPath, path.join(repoRoot, 'archived/docs/RELEASE_AND_STEAM.md'), { optional: true })) {
    break
  }
}

console.log('Done.')
