/**
 * 查找替换单元测试（Vitest）
 * 对应原 unit-tests-register 中的 registerSearchReplaceTests
 */
import { describe, it, expect } from 'vitest'
import { computeReplacementText, type TextSearchMatch } from '../text/text-search-utils'

function execRegex(pattern: string, text: string, matchCase: boolean): TextSearchMatch | null {
  const flags = matchCase ? 'g' : 'gi'
  const re = new RegExp(pattern, flags)
  re.lastIndex = 0
  const m = re.exec(text)
  if (!m) return null
  // text-search-utils 使用 groups[0]=全文, groups[1]=$1, groups[2]=$2
  return {
    line: 1,
    column: 0,
    match: m[0],
    groups: m.length > 0 ? [...m] : undefined,
    startOffset: 0,
    endOffset: m[0].length
  }
}

describe('查找替换 computeReplacementText', () => {
  describe('正则捕获组', () => {
    it('$1 交换捕获组', () => {
      const match = execRegex('(\\d+)-(\\d+)', '123-456', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('$2-$1', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('456-123')
    })

    it('多个捕获组 $1年$2月$3日', () => {
      const match = execRegex('(\\d{4})-(\\d{2})-(\\d{2})', '2024-12-25', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('$1年$2月$3日', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('2024年12月25日')
    })

    it('字面量美元符号 $$', () => {
      const match = execRegex('(\\d+)', '100', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('Price: $$$1', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('Price: $100')
    })

    it('无效捕获组索引 $99 保持原样', () => {
      const match = execRegex('(\\w+)', 'Hello', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('$1 $99 World', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('Hello $99 World')
    })

    it('空捕获组', () => {
      const match = execRegex('(\\d*)(\\w+)', 'World', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('Prefix: $1, Suffix: $2', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('Prefix: , Suffix: World')
    })

    it('混合使用 $ 符号', () => {
      const match = execRegex('(\\d+)-(\\d+)', '100-10', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('Price: $$100, Tax: $$10', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('Price: $100, Tax: $10')
    })

    it('大捕获组索引超出范围', () => {
      const match = execRegex('(\\w+)', 'Hello', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('$1 and $999999', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('Hello and $999999')
    })
  })

  describe('保留大小写', () => {
    it('全大写', () => {
      const match: TextSearchMatch = {
        line: 1,
        column: 0,
        match: 'WORLD',
        startOffset: 0,
        endOffset: 5
      }
      const result = computeReplacementText('hello', match, {
        useRegex: false,
        preserveCase: true
      })
      expect(result).toBe('HELLO')
    })

    it('首字母大写', () => {
      const match: TextSearchMatch = {
        line: 1,
        column: 0,
        match: 'World',
        startOffset: 0,
        endOffset: 5
      }
      const result = computeReplacementText('hello', match, {
        useRegex: false,
        preserveCase: true
      })
      expect(result).toBe('Hello')
    })

    it('正则替换 + 保留大小写', () => {
      const match = execRegex('(\\w+)', 'WORLD', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('hello', match!, {
        useRegex: true,
        preserveCase: true
      })
      expect(result).toBe('HELLO')
    })
  })

  describe('复杂正则', () => {
    it('邮箱格式转换', () => {
      const match = execRegex('(\\w+)@(\\w+\\.\\w+)', 'user@example.com', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('$1 (at) $2', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('user (at) example.com')
    })

    it('嵌套捕获组', () => {
      const match = execRegex('((\\w+) (\\w+))', 'Hello World', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('First: $2, Second: $3', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('First: Hello, Second: World')
    })

    it('电话号码格式', () => {
      const match = execRegex('(\\d{3})(\\d{4})(\\d{4})', '01012345678', false)
      expect(match).not.toBeNull()
      const result = computeReplacementText('($1) $2-$3', match!, {
        useRegex: true,
        preserveCase: false
      })
      expect(result).toBe('(010) 1234-5678')
    })
  })

  describe('非正则与边界', () => {
    it('非正则模式 $1 作为普通文本', () => {
      const match: TextSearchMatch = {
        line: 1,
        column: 0,
        match: 'Hello',
        startOffset: 0,
        endOffset: 5
      }
      const result = computeReplacementText('$1 World', match, {
        useRegex: false,
        preserveCase: false
      })
      expect(result).toBe('$1 World')
    })

    it('空字符串替换', () => {
      const match: TextSearchMatch = {
        line: 1,
        column: 0,
        match: '',
        startOffset: 0,
        endOffset: 0
      }
      const result = computeReplacementText('Replaced', match, {
        useRegex: false,
        preserveCase: false
      })
      expect(result).toBe('Replaced')
    })
  })
})
