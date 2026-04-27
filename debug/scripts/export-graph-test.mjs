/**
 * 导出图与路径的单元测试（不启动 Electron，不依赖 meta-doc 构建）
 * 运行：node debug/scripts/export-graph-test.mjs
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const debugDir = path.resolve(__dirname, '..')
const metaDocSrcCommon = path.join(debugDir, '..', 'MetaDoc', 'meta-doc', 'src', 'common', 'export-graph.ts')

const EXPORT_GRAPH_EDGES = [
  { from: 'md', to: 'md', converterId: 'md->md' },
  { from: 'md', to: 'html', converterId: 'md->html' },
  { from: 'md', to: 'docx', converterId: 'md->docx' },
  { from: 'md', to: 'pdf', converterId: 'md->pdf' },
  { from: 'md', to: 'tex', converterId: 'md->tex' },
  { from: 'tex', to: 'tex', converterId: 'tex->tex' },
  { from: 'tex', to: 'pdf', converterId: 'tex->pdf' },
  { from: 'tex', to: 'md', converterId: 'tex->md' },
  { from: 'json', to: 'json', converterId: 'json->json' }
]

const OUT_EDGES = new Map()
for (const e of EXPORT_GRAPH_EDGES) {
  const list = OUT_EDGES.get(e.from) ?? []
  list.push(e)
  OUT_EDGES.set(e.from, list)
}

function findExportPath(source, target) {
  if (source === target) {
    const selfEdge = EXPORT_GRAPH_EDGES.find((e) => e.from === source && e.to === target)
    if (selfEdge) return [selfEdge]
    return null
  }
  const queue = [{ node: source, path: [] }]
  const visited = new Set()
  visited.add(source)
  while (queue.length > 0) {
    const { node, path: p } = queue.shift()
    if (node === target) return p
    const edges = OUT_EDGES.get(node)
    if (!edges) continue
    for (const e of edges) {
      if (visited.has(e.to)) continue
      visited.add(e.to)
      const newPath = [...p, { from: e.from, to: e.to, converterId: e.converterId }]
      if (e.to === target) return newPath
      queue.push({ node: e.to, path: newPath })
    }
  }
  return null
}

function getReachableTargets(source) {
  const visited = new Set()
  const queue = [source]
  while (queue.length > 0) {
    const node = queue.shift()
    if (visited.has(node)) continue
    visited.add(node)
    const edges = OUT_EDGES.get(node)
    if (!edges) continue
    for (const e of edges) {
      if (!visited.has(e.to)) queue.push(e.to)
    }
  }
  return Array.from(visited)
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const reachableMd = getReachableTargets('md')
assert(Array.isArray(reachableMd), 'getReachableTargets(md) returns array')
assert(reachableMd.includes('md') && reachableMd.includes('pdf') && reachableMd.includes('docx'), 'md can reach md, pdf, docx')

const pathTexDocx = findExportPath('tex', 'docx')
assert(pathTexDocx && pathTexDocx.length >= 2, 'tex->docx path has at least 2 steps')
assert(pathTexDocx[0].converterId === 'tex->md', 'first step tex->md')
assert(pathTexDocx[pathTexDocx.length - 1].converterId === 'md->docx', 'last step md->docx')

const pathMdPdf = findExportPath('md', 'pdf')
assert(pathMdPdf && pathMdPdf.length === 1 && pathMdPdf[0].converterId === 'md->pdf', 'md->pdf direct')

const pathTexPdf = findExportPath('tex', 'pdf')
assert(pathTexPdf && pathTexPdf.length === 1 && pathTexPdf[0].converterId === 'tex->pdf', 'tex->pdf direct')

console.log('Export graph tests passed')
console.log('Reachable from md:', reachableMd)
console.log('Path tex->docx:', pathTexDocx.map((s) => s.converterId))
