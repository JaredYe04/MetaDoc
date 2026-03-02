/**
 * 验证 @ tag 解析与持久化逻辑：存储为 @[path]，重启后应仍显示文件名而非 Untitled。
 * 运行: node scripts/verify-at-tag.js
 */

const AT_PATTERN = /@\[([^\]]+)\]/g

function parseSegments(value) {
  if (!value) return [{ type: 'text', value: '' }]
  const parts = []
  let lastIndex = 0
  let m
  AT_PATTERN.lastIndex = 0
  while ((m = AT_PATTERN.exec(value)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: 'text', value: value.slice(lastIndex, m.index) })
    }
    parts.push({ type: 'at', atValue: m[1] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < value.length) {
    parts.push({ type: 'text', value: value.slice(lastIndex) })
  }
  if (parts.length === 0) parts.push({ type: 'text', value: '' })
  return parts
}

function serializeSegments(segs) {
  return segs
    .map((s) => (s.type === 'text' ? s.value : `@[${s.atValue}]`))
    .join('')
}

function getAtLabel(rawValue) {
  if (rawValue.startsWith('tab:')) return 'Untitled'
  return rawValue.replace(/^.*[/\\]/, '') || rawValue
}

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('OK:', msg)
  }
}

// 1. 存储格式为 @[path]，path 含中文文件名
const input = '@[path/to/测试文件.txt] 里面讲了什么'
const segments = parseSegments(input)
ok(segments.length >= 2, 'parse yields at least 2 segments')
const atSeg = segments.find((s) => s.type === 'at')
ok(!!atSeg && atSeg.atValue === 'path/to/测试文件.txt', 'atValue is full path (path/to/测试文件.txt)')

// 2. 序列化往返一致
const roundTrip = serializeSegments(segments)
ok(roundTrip === input, 'round-trip: serialize(parse(x)) === x')

// 3. 显示用 label = 文件名，不是 Untitled
const label = getAtLabel(atSeg.atValue)
ok(label === '测试文件.txt', 'getAtLabel(path) returns filename (测试文件.txt), not Untitled')

// 4. 模拟持久化后加载：字符串不变，解析后 atValue 仍为 path，label 仍为文件名
const persisted = roundTrip
const loadedSegments = parseSegments(persisted)
const loadedAt = loadedSegments.find((s) => s.type === 'at')
ok(!!loadedAt && loadedAt.atValue === 'path/to/测试文件.txt', 'after load: atValue unchanged')
const loadedLabel = getAtLabel(loadedAt.atValue)
ok(loadedLabel === '测试文件.txt', 'after load: label still 测试文件.txt, not Untitled')

// 5. tab:id 无对应 tab 时显示 Untitled（仅当 atValue 为 tab:xxx）
const tabAtValue = 'tab:some-id'
const tabLabel = getAtLabel(tabAtValue)
ok(tabLabel === 'Untitled', 'getAtLabel(tab:id) without tab returns Untitled')

// 6. 绝对路径
const winPath = 'C:\\folder\\测试文件.txt'
const winLabel = getAtLabel(winPath)
ok(winLabel === '测试文件.txt', 'getAtLabel(Windows path) returns filename')

console.log('\n' + (failed ? failed + ' assertion(s) failed.' : 'All assertions passed.'))
process.exit(failed ? 1 : 0)
