# DOCX 导出公式处理流程梳理

## 概述

本文档梳理了 Markdown 导出为 DOCX 时，LaTeX 公式转换为 OMML 并插入 document.xml 的完整流程。

## 整体架构

导出流程分为三个阶段：

1. **HTML 生成阶段**：将 Markdown 转换为 HTML，公式替换为占位符
2. **DOCX 生成阶段**：使用 `html-to-docx` 将 HTML 转换为 DOCX
3. **DOCX 后处理阶段**：通过处理器链处理 document.xml，插入 OMML 公式

## 详细流程

### 阶段 1：HTML 生成与占位符替换

**文件位置**：`meta-doc/src/main/export/export-manager.ts`

#### 1.1 公式提取与占位符创建

```typescript
// 函数：convertFormulaToMathML (行 833-1024)
// 作用：在 HTML 中查找公式元素，替换为占位符

流程：
1. 从 Markdown 中提取所有公式（块级 $$...$$ 和行内 $...$）
2. 在 HTML 中查找公式元素：
   - 公式图片（_math.svg 或 _math.png）
   - .language-math 类的元素
3. 为每个公式创建占位符：MATH_PLACEHOLDER_0, MATH_PLACEHOLDER_1, ...
4. 将占位符和 LaTeX 代码存储到 formulaPlaceholders Map 中
```

**关键数据结构**：

```typescript
// 全局变量：formulaPlaceholders (行 1027-1028)
const formulaPlaceholders = new Map<number, { latex: string; display: boolean }>()
let formulaPlaceholderIndex = 0
```

**占位符格式**：

- 行内公式：`<span>MATH_PLACEHOLDER_0</span>`
- 块级公式：`<p class="Normal" style="text-align: center; margin: 12pt 0;">MATH_PLACEHOLDER_0</p>`

#### 1.2 HTML 到 DOCX 转换

```typescript
// 函数：convertMarkdownToDocxBuffer (行 1262-1439)
// 使用 html-to-docx 库将 HTML 转换为 DOCX

流程：
1. 处理代码块（转换为表格格式）
2. 调用 convertFormulaToMathML 替换公式为占位符
3. 添加 CSS 样式和 Word 样式映射
4. 使用 HTMLtoDOCX 生成 DOCX Buffer
```

**注意**：此时 document.xml 中已经包含了占位符文本（如 `MATH_PLACEHOLDER_0`）

### 阶段 2：DOCX 后处理

**文件位置**：`meta-doc/src/main/export/docx-processor.ts`

#### 2.1 处理器管理器

```typescript
// 类：DocxProcessingManager (行 62-189)
// 作用：管理多个处理器，按顺序执行

注册的处理器（按执行顺序）：
1. DocumentXmlFixProcessor - 修复对齐、分页等问题
2. WordTocProcessor - 插入 Word 自动目录
3. HeaderFooterProcessor - 添加页眉页脚
4. OMMLInsertionProcessor - 插入公式（最后执行）
```

#### 2.2 公式插入处理器（核心）

**类**：`OMMLInsertionProcessor` (行 720-1503)

**处理流程**：

##### 步骤 1：验证占位符存在性 (行 744-765)

```typescript
// 检查哪些占位符实际存在于 document.xml 中
for (const index of formulaPlaceholders.keys()) {
  const placeholderText = `MATH_PLACEHOLDER_${index}`
  if (updatedXml.includes(placeholderText)) {
    existingPlaceholders.add(index)
  } else {
    missingPlaceholders.add(index)
  }
}
```

##### 步骤 2：公式去重与缓存准备 (行 767-792)

```typescript
// 收集所有需要转换的公式（去重）
// 相同 LaTeX 代码只转换一次
const uniqueFormulas = new Map<string, Array<{ index: number; isBlockLevel: boolean }>>()
const conversionCache = new Map<string, { wrappedContent: string; ommlContent: string }>()
```

##### 步骤 3：LaTeX 预处理 (行 808-838)

```typescript
// 函数：preprocessLatexForXml
// 作用：转义可能在 XML 文本节点中引起问题的特殊字符

处理规则：
- < 转换为 \lt（LaTeX 小于号命令）
- > 转换为 \gt（LaTeX 大于号命令）
- & 转换为 \&（LaTeX 转义）

注意：必须在转换为 MathML 之前进行预处理
```

##### 步骤 4：LaTeX → MathML 转换 (行 841-864)

```typescript
// 调用：convertLatexToMathML (来自 mathml-converter.ts)
// 使用 mathjax-node 进行转换

const mathml = await convertLatexToMathML(preprocessedLatex, isBlockLevel)
```

**MathML 转换器**：`meta-doc/src/main/utils/mathml-converter.ts`

- 使用 `mathjax-node` 库
- 配置：`jax: ['input/TeX', 'output/NativeMML']`
- 返回标准 MathML 格式

##### 步骤 5：MathML 清理 (行 870-879)

```typescript
// 清理 MathML（移除 MathJax 特定的属性）
let cleanedMathml = mathml
  .replace(/<!--[\s\S]*?-->/g, '') // 移除 HTML 注释
  .replace(/\s+class="[^"]*"/g, '') // 移除 class 属性
  .replace(/\s+scriptlevel="[^"]*"/g, '') // 移除 scriptlevel
  .replace(/\s+maxsize="[^"]*"/g, '') // 移除 maxsize
  .replace(/\s+minsize="[^"]*"/g, '') // 移除 minsize
  .replace(/>\s+</g, '><') // 移除标签间空白
  .replace(/\s{2,}/g, ' ') // 规范化空白
  .trim()
```

##### 步骤 6：MathML → OMML 转换 (行 881-888)

```typescript
// 使用 mathml2omml 库转换
const { mml2omml } = await import('mathml2omml')
omml = mml2omml(cleanedMathml)
```

**OMML**：Office Math Markup Language，Word 的原生数学公式格式

##### 步骤 7：OMML 验证 (行 893-911)

```typescript
// 验证 OMML 是否符合 XML 规范
const testParser = new DOMParser({...});
const testXml = `<root xmlns:m="...">${ommlContent}</root>`;
const testDoc = testParser.parseFromString(testXml, 'text/xml');
// 检查解析错误
```

##### 步骤 8：OMML 增强（字体设置）(行 916-1057)

```typescript
// 函数：enhanceOMMLWithFonts
// 作用：为 OMML 添加字体设置，特别处理数字（正体 vs 斜体）

处理逻辑：
1. 识别包含纯数字的 <m:r>，设置为正体（<m:sty m:val="p"/>）
2. 为所有 <m:r> 的 <m:rPr> 添加 <w:rPr> 字体设置
3. 数字使用正体，普通文本可能使用斜体
```

**字体设置模板**：

```xml
<w:rPr xmlns:w="...">
  <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" .../>
  <w:sz w:val="24"/>
  <w:szCs w:val="24"/>
</w:rPr>
```

##### 步骤 9：包装为 WordprocessingML 结构 (行 1059-1092)

```typescript
// 根据公式类型包装：

// 块级公式：
<w:p>
  <m:oMathPara>
    <m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>
    <m:oMath>
      <m:oMathPr><m:mathFont m:val="Times New Roman"/></m:oMathPr>
      ...OMML内容...
    </m:oMath>
  </m:oMathPara>
</w:p>

// 行内公式：
<w:r>
  <w:rPr>...</w:rPr>
  <m:oMath>
    <m:oMathPr><m:mathFont m:val="Times New Roman"/></m:oMathPr>
    ...OMML内容...
  </m:oMath>
</w:r>
```

##### 步骤 10：并发转换 (行 1099-1150)

```typescript
// 使用并发池控制：最大10个并发
const MAX_CONCURRENT = 10
// 将任务分批处理，每批最多 MAX_CONCURRENT 个并发
```

##### 步骤 11：查找占位符位置 (行 1174-1381)

```typescript
// 函数：findPlaceholderLocation
// 作用：在 document.xml 中查找占位符的位置

查找策略（多层回退）：
1. 精确匹配：查找包含完整占位符文本的文本节点
2. 包含匹配：查找包含占位符的文本节点
3. 元素匹配：查找包含占位符的父元素
4. 完整文本匹配：通过元素的完整文本内容查找

目标父元素查找：
- 块级公式：查找 <w:p> 元素
- 行内公式：查找 <w:r> 元素（如果找不到，使用 <w:p> 作为备用）
```

##### 步骤 12：替换占位符 (行 1426-1454)

```typescript
// 按索引从大到小排序，避免索引偏移问题
locations.sort((a, b) => b.index - a.index)

// 解析新内容为 DOM 节点
const newNode = parseNewContent(location.wrappedContent)

// 替换节点
parentOfTarget.replaceChild(newNode, location.targetParent)
```

##### 步骤 13：序列化 XML (行 1456-1460)

```typescript
// 最后序列化一次 XML
const serializer = new XMLSerializer()
updatedXml = serializer.serializeToString(xmlDoc)
context.documentXml = updatedXml
```

### 阶段 3：应用元数据

**文件位置**：`meta-doc/src/main/export/export-manager.ts`

```typescript
// 函数：applyDocxMetadata (行 1554-1594)
// 作用：应用文档元数据和处理器链

流程：
1. 应用核心属性（标题、作者等）
2. 调用 DocxProcessingManager.process() 执行处理器链
3. 传递 formulaPlaceholders 给 OMMLInsertionProcessor
4. 清除公式占位符数据
```

## 关键数据结构

### 公式占位符 Map

```typescript
Map<number, { latex: string; display: boolean }>
// key: 占位符索引（0, 1, 2, ...）
// value: LaTeX 代码和是否为块级公式
```

### 转换缓存

```typescript
Map<string, { wrappedContent: string; ommlContent: string }>
// key: `${latexCode}|${isBlockLevel}`
// value: 包装后的 WordprocessingML 和原始 OMML
```

## 关键函数说明

### convertFormulaToMathML

- **位置**：`export-manager.ts:833`
- **作用**：在 HTML 阶段将公式替换为占位符
- **输入**：HTML 内容、Markdown 内容
- **输出**：包含占位符的 HTML

### convertLatexToMathML

- **位置**：`mathml-converter.ts:44`
- **作用**：LaTeX → MathML 转换
- **工具**：mathjax-node

### OMMLInsertionProcessor.process

- **位置**：`docx-processor.ts:723`
- **作用**：在 document.xml 中查找占位符并替换为 OMML
- **流程**：验证 → 去重 → 转换 → 查找 → 替换

## 潜在问题与改进建议

### 1. 占位符查找的复杂性

**问题**：占位符可能被分割到多个文本节点，查找逻辑复杂（多层回退）

**建议**：

- 考虑使用更稳定的占位符格式（如 Base64 编码）
- 或者使用 XML 注释作为占位符标记

### 2. 并发控制

**当前**：最大 10 个并发转换

**建议**：

- 根据公式数量动态调整并发数
- 添加重试机制

### 3. 错误处理

**当前**：转换失败会跳过该公式

**建议**：

- 记录失败的公式，提供用户反馈
- 考虑使用后备方案（如显示 LaTeX 代码）

### 4. 代码组织

**问题**：OMMLInsertionProcessor 类过长（约 800 行）

**建议**：

- 将转换逻辑提取为独立函数
- 将查找逻辑提取为独立函数
- 将增强逻辑提取为独立函数

## 流程图

```
Markdown
  ↓
HTML 生成（convertFormulaToMathML）
  ↓
公式替换为占位符（MATH_PLACEHOLDER_0, ...）
  ↓
存储到 formulaPlaceholders Map
  ↓
html-to-docx 转换
  ↓
DOCX Buffer（包含占位符文本）
  ↓
DocxProcessingManager.process()
  ↓
OMMLInsertionProcessor.process()
  ├─ 验证占位符存在性
  ├─ 公式去重
  ├─ LaTeX 预处理（转义特殊字符）
  ├─ LaTeX → MathML（mathjax-node）
  ├─ MathML 清理
  ├─ MathML → OMML（mathml2omml）
  ├─ OMML 验证
  ├─ OMML 增强（字体设置）
  ├─ 包装为 WordprocessingML
  ├─ 并发转换（最大10个）
  ├─ 查找占位符位置（多层回退）
  ├─ 替换占位符
  └─ 序列化 XML
  ↓
最终 DOCX Buffer
```

## 总结

整个流程的核心思路是：

1. **两阶段处理**：HTML 阶段创建占位符，DOCX 后处理阶段替换为 OMML
2. **转换链**：LaTeX → MathML → OMML → WordprocessingML
3. **性能优化**：公式去重、转换缓存、并发处理
4. **容错处理**：多层占位符查找、XML 验证、错误日志

这种设计的好处是：

- 解耦了 HTML 生成和公式处理
- 可以复用转换结果（去重和缓存）
- 便于调试和维护（每个阶段独立）

缺点是：

- 占位符查找逻辑复杂
- 代码较长，需要重构
- 错误处理不够完善
