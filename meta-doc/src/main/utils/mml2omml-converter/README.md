# MathML 到 OMML 转换器

这是一个独立的模块，用于将 MathML（Mathematical Markup Language）转换为 OMML（Office Math Markup Language）。

## 设计目标

- **独立性**：模块设计为可独立使用，不依赖项目其他部分（除了必要的 XML 解析库）
- **可扩展性**：架构支持逐步增强功能
- **可维护性**：清晰的层次结构，便于理解和维护

## 架构

转换过程分为三个层次：

### 第一层：解析 & Normalize（⭐⭐⭐）

- 展平嵌套 `<mrow>`
- 拆分 `<m:t>abc</m:t>` → `<m:t>a</m:t><m:t>b</m:t><m:t>c</m:t>`
- 识别 fence（括号、分隔符等）
- 删除 MathJax 私有节点（MJX-TeXAtom-*）

### 第二层：MathML → 数学 AST（⭐⭐⭐⭐）

将 MathML 元素映射到内部 AST 节点：

| MathML | AST 节点 |
|--------|----------|
| `<mfrac>` | `Fraction` |
| `<msqrt>` | `Sqrt` |
| `<msup>` | `Power` |
| `<msub>` | `Subscript` |
| fence `<mo>` | `Delimiter` |
| `<mtable>` | `Matrix` |
| `<mo>+</mo>` | `Operator` |
| `<mi>`, `<mn>`, `<mtext>` | `Text` |
| `<mrow>` | `Row` |

### 第三层：AST → OMML（⭐⭐⭐⭐⭐）

将数学 AST 转换为 OMML XML 格式。

**OMML 硬规则（已遵守）：**

1. ❌ 一个 `<m:t>` 不能包含多个数学 token
   - ✅ 实现：所有文本和运算符都通过 `splitToSingleCharRuns` 拆分为单个字符

2. ❌ 运算符不能当普通字符
   - ✅ 实现：运算符使用 `<m:r><m:t>` 结构，每个字符单独处理

3. ❌ fence 必须用 `<m:d>`
   - ✅ 实现：所有分隔符（括号等）使用 `<m:d>` 结构

4. ❌ matrix 必须 `<m:m>` + `<m:mr>`
   - ✅ 实现：矩阵使用 `<m:m>` 和 `<m:mr>` 结构

**AST 到 OMML 映射：**

| AST 节点 | OMML 模板 |
|----------|-----------|
| `Fraction` | `<m:f><m:num>...</m:num><m:den>...</m:den></m:f>` |
| `Sqrt` | `<m:rad><m:radPr>...</m:radPr><m:deg>...</m:deg><m:e>...</m:e></m:rad>` |
| `Power` | `<m:sSup><m:e>...</m:e><m:sup>...</m:sup></m:sSup>` |
| `Subscript` | `<m:sSub><m:e>...</m:e><m:sub>...</m:sub></m:sSub>` |
| `Delimiter` | `<m:d><m:dPr><m:begChr m:val="..."/><m:endChr m:val="..."/></m:dPr><m:e>...</m:e></m:d>` |
| `Matrix` | `<m:m><m:mPr>...</m:mPr><m:mr>...</m:mr>...</m:m>` |
| `Operator` | `<m:r><m:t>...</m:t></m:r>` (每个字符单独) |
| `Text` | `<m:r><m:t>...</m:t></m:r>` (每个字符单独) |

## 使用方式

```typescript
import { convertMathMLToOMML } from './mml2omml-converter';

const mathml = '<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>';
const omml = convertMathMLToOMML(mathml);
```

## 文件结构

```
mml2omml-converter/
├── index.ts          # 主入口，导出公共 API
├── normalizer.ts     # 第一层：规范化
├── parser.ts         # 第二层：解析为 AST
├── converter.ts      # 第三层：AST 转 OMML
└── README.md         # 本文档
```

## 扩展性

模块设计支持逐步增强：

1. **添加新的 MathML 元素支持**：在 `parser.ts` 中添加新的解析函数
2. **添加新的 AST 节点类型**：在 `parser.ts` 中定义新的节点接口
3. **增强 OMML 转换**：在 `converter.ts` 中添加更复杂的转换逻辑
4. **优化规范化**：在 `normalizer.ts` 中添加新的规范化规则

## 注意事项

- 当前实现是基础版本，支持常见的数学表达式结构
- 复杂公式可能需要额外的处理逻辑
- 某些 MathML 特性可能尚未完全支持

