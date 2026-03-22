import { describe, expect, it } from 'vitest'
/**
 * @vitest-environment node
 */
import { parseUnifiedDiff } from './edit-diff-parse'

describe('parseUnifiedDiff', () => {
  it('parses new-file hunk when body lines omit + prefix (common LLM mistake)', () => {
    const diff = `@@ -0,0 +1,3 @@
a
b
c`
    const hunks = parseUnifiedDiff(diff)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].newLines).toEqual(['a', 'b', 'c'])
    expect(hunks[0].contextLines).toEqual([])
  })

  it('strips leading space from standard unified context lines', () => {
    const diff = `@@ -1,3 +1,3 @@
 unchanged
-old
+new
 tail`
    const hunks = parseUnifiedDiff(diff)
    expect(hunks[0].contextLines).toEqual(['unchanged', 'tail'])
    expect(hunks[0].oldLines).toEqual(['old'])
    expect(hunks[0].newLines).toEqual(['new'])
  })
})
