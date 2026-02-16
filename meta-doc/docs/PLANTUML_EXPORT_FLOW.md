# PlantUML 导出链路梳理

## 问题描述

在导出 Markdown 到 HTML/PDF 和 DOCX 时，PlantUML 的渲染模式不同：

- **HTML/PDF 导出**：PlantUML 被渲染为 SVG 图片
- **DOCX 导出**：PlantUML 被渲染为 PNG 图片（位图）

这种差异导致了导出结果的不一致性。

## 整体流程

### 1. HTML/PDF 导出流程

#### 1.1 预渲染阶段（渲染进程）

**文件位置**：`meta-doc/src/renderer/src/services/export-manager.ts`

```typescript
// 行 244：根据目标格式决定图表格式
const chartFormat = targetFormat === 'docx' ? 'bitmap' : 'svg'
```

对于 HTML/PDF：

- `chartFormat = 'svg'`（矢量图）

**文件位置**：`meta-doc/src/renderer/src/utils/chart-pre-renderer.js`

```javascript
// 行 1010-1197：preRenderAllCharts 函数
// 行 1105：根据 format 参数决定目标格式
const targetFormat = format === 'bitmap' ? 'png' : 'svg'
```

对于 HTML/PDF：

- `targetFormat = 'svg'`

**PlantUML 渲染逻辑**（行 1127-1138）：

```javascript
} else if (chartType === 'plantuml') {
    // 确保 PlantUML 代码是 UTF-8 编码的字符串
    const cleanCode = code.replace(/^\uFEFF/, '').trim();

    // 验证代码不包含 XML
    if (cleanCode.includes('<svg') || cleanCode.includes('<text') || cleanCode.includes('<?xml')) {
        logger.error(`PlantUML 代码包含 XML 标签，跳过渲染`);
        throw new Error('PlantUML 代码包含 XML 标签，代码提取可能有问题');
    }

    // 调用 IPC 渲染为 SVG
    imageUrl = await renderPlantUMLViaIpc(cleanCode, targetFormat); // targetFormat = 'svg'
}
```

**结果**：

- PlantUML 代码块被替换为：`![plantuml Diagram](http://localhost:52521/images/xxx_plantuml.svg)`

#### 1.2 Markdown 转 HTML 阶段

**文件位置**：`meta-doc/src/renderer/src/utils/md-utils.js`

```javascript
// 行 1753-1754：使用 Vditor 将 Markdown 转换为 HTML
return await Vditor.md2html(md, { cdn: cdn })
```

**结果**：

- 图片链接被转换为 `<img>` 标签
- SVG 图片直接嵌入 HTML

#### 1.3 HTML 处理阶段（主进程）

**文件位置**：`meta-doc/src/main/export/export-manager.ts`

**PDF 导出**（行 2576-2661）：

```typescript
// 直接使用 HTML 转换为 PDF
const htmlDocument = payload.html; // 包含 SVG 图片的 HTML
const pdfBuffer = await convertHtmlToPdfBuffer(htmlDocument, {...});
```

**HTML 导出**（行 2312-2384）：

```typescript
// 直接保存 HTML 文件
await writeTextFile(targetPath, payload.html)
```

**结果**：

- HTML/PDF 中 PlantUML 显示为 SVG 矢量图
- 清晰度高，可缩放

---

### 2. DOCX 导出流程

#### 2.1 预渲染阶段（渲染进程）

**文件位置**：`meta-doc/src/renderer/src/services/export-manager.ts`

```typescript
// 行 244：根据目标格式决定图表格式
const chartFormat = targetFormat === 'docx' ? 'bitmap' : 'svg'
```

对于 DOCX：

- `chartFormat = 'bitmap'`（位图）

**文件位置**：`meta-doc/src/renderer/src/utils/chart-pre-renderer.js`

```javascript
// 行 1105：根据 format 参数决定目标格式
const targetFormat = format === 'bitmap' ? 'png' : 'svg'
```

对于 DOCX：

- `targetFormat = 'png'`

**PlantUML 渲染逻辑**（行 1127-1138）：

```javascript
} else if (chartType === 'plantuml') {
    const cleanCode = code.replace(/^\uFEFF/, '').trim();

    if (cleanCode.includes('<svg') || cleanCode.includes('<text') || cleanCode.includes('<?xml')) {
        logger.error(`PlantUML 代码包含 XML 标签，跳过渲染`);
        throw new Error('PlantUML 代码包含 XML 标签，代码提取可能有问题');
    }

    // 调用 IPC 渲染为 PNG
    imageUrl = await renderPlantUMLViaIpc(cleanCode, targetFormat); // targetFormat = 'png'
}
```

**结果**：

- PlantUML 代码块被替换为：`![plantuml Diagram](http://localhost:52521/images/xxx_plantuml.png)`

#### 2.2 Markdown 转 HTML 阶段

**文件位置**：`meta-doc/src/renderer/src/utils/md-utils.js`

```javascript
// 行 1753-1754：使用 Vditor 将 Markdown 转换为 HTML
return await Vditor.md2html(md, { cdn: cdn })
```

**结果**：

- 图片链接被转换为 `<img>` 标签
- PNG 图片链接嵌入 HTML

#### 2.3 HTML 处理阶段（主进程）

**文件位置**：`meta-doc/src/main/export/export-manager.ts`

**DOCX 导出**（行 2468-2543）：

```typescript
// 行 2500：调用 convertMarkdownToDocxBuffer
const buffer = await convertMarkdownToDocxBuffer(payload.html, payload.data.md, docxOptions, meta)
```

**convertMarkdownToDocxBuffer 函数**（行 1599-2009）：

1. **代码块处理**（行 1837）：

```typescript
// 处理代码块：将换行符转换为<br>标签，并使用表格包装创建背景框
styledHtml = processCodeBlocksForWord(styledHtml)
```

2. **processCodeBlocksForWord 函数**（行 715-842）：
   - 处理 `<div class="md-editor-code">` 包装的代码块
   - 处理 `<pre>` 标签
   - 处理 `<code class="hljs">` 代码块
   - **注意**：这个函数会将代码块转换为表格格式，但**不应该处理已经被预渲染为图片的 PlantUML**

**问题分析**：

如果 PlantUML 已经被预渲染为图片，HTML 中应该只有：

```html
<img src="http://localhost:52521/images/xxx_plantuml.png" alt="plantuml Diagram" />
```

不应该有代码块标签。但是 `processCodeBlocksForWord` 可能会：

1. 处理到某些残留的代码块标签（如果预渲染失败）
2. 或者处理逻辑有问题，误处理了图片标签

**结果**：

- DOCX 中 PlantUML 显示为 PNG 位图
- 清晰度较低，缩放会失真

---

## 问题根源

### 1. 格式选择不一致

**位置**：`meta-doc/src/renderer/src/services/export-manager.ts:244`

```typescript
const chartFormat = targetFormat === 'docx' ? 'bitmap' : 'svg'
```

**原因**：

- DOCX 格式选择位图（PNG），可能是为了兼容 Word 对 SVG 的支持问题
- HTML/PDF 格式选择矢量图（SVG），因为浏览器和 PDF 渲染器对 SVG 支持良好

### 2. 代码块处理逻辑可能误处理

**位置**：`meta-doc/src/main/export/export-manager.ts:715-842`

`processCodeBlocksForWord` 函数会处理所有代码块，但：

- 如果 PlantUML 预渲染失败，代码块可能仍然存在
- 函数可能会误处理某些包含代码的 HTML 结构

---

## 建议的解决方案

### 方案 1：统一使用 SVG（推荐）

**优点**：

- 统一导出格式，保持一致性
- SVG 清晰度高，可缩放
- 现代 Word 版本支持 SVG

**修改点**：

1. `meta-doc/src/renderer/src/services/export-manager.ts:244`

   ```typescript
   // 修改前
   const chartFormat = targetFormat === 'docx' ? 'bitmap' : 'svg'

   // 修改后
   const chartFormat = 'svg' // 统一使用 SVG
   ```

2. 验证 Word 对 SVG 的支持情况
   - 如果 Word 不支持 SVG，需要转换为 PNG
   - 可以在 DOCX 生成阶段将 SVG 转换为 PNG

### 方案 2：在 DOCX 生成阶段转换 SVG 为 PNG

**优点**：

- 保持预渲染阶段统一使用 SVG
- 在 DOCX 生成时再转换为 PNG，确保兼容性

**修改点**：

1. 保持预渲染阶段统一使用 SVG
2. 在 `convertMarkdownToDocxBuffer` 中，检测 SVG 图片并转换为 PNG
3. 使用 `image-export-service.ts` 中的转换功能

### 方案 3：改进代码块处理逻辑

**优点**：

- 确保预渲染的图片不会被误处理
- 只处理真正的代码块

**修改点**：

1. 在 `processCodeBlocksForWord` 中，跳过已经转换为图片的代码块
2. 检测图片标签，避免处理包含图片的代码块结构

---

## 关键代码位置总结

### 渲染进程

1. **导出管理器**：`meta-doc/src/renderer/src/services/export-manager.ts`
   - 行 244：决定图表格式（`chartFormat`）
   - 行 248：调用 `preRenderAllCharts`

2. **图表预渲染器**：`meta-doc/src/renderer/src/utils/chart-pre-renderer.js`
   - 行 1010-1197：`preRenderAllCharts` 函数
   - 行 1105：决定目标格式（`targetFormat`）
   - 行 1127-1138：PlantUML 渲染逻辑

3. **PlantUML 渲染器**：`meta-doc/src/renderer/src/utils/chart-pre-renderer.js`
   - 行 112-191：`renderPlantUMLViaIpc` 函数

### 主进程

1. **导出管理器**：`meta-doc/src/main/export/export-manager.ts`
   - 行 1599-2009：`convertMarkdownToDocxBuffer` 函数
   - 行 715-842：`processCodeBlocksForWord` 函数
   - 行 2576-2661：PDF 导出处理
   - 行 2468-2543：DOCX 导出处理

2. **PlantUML 渲染器**：`meta-doc/src/main/main-calls.ts`
   - 行 2039-2041：IPC 处理器 `render-plantuml`
   - 行 3359-3588：`renderPlantUMLToLocalImage` 函数

---

## 验证步骤

1. **检查预渲染结果**：
   - 在 `preRenderAllCharts` 中添加日志，确认 PlantUML 被正确替换为图片链接
   - 检查图片 URL 格式（SVG vs PNG）

2. **检查 HTML 内容**：
   - 在 `convertMarkdownToDocxBuffer` 中打印 HTML，确认图片标签正确
   - 检查是否有残留的代码块标签

3. **检查 DOCX 内容**：
   - 解压 DOCX 文件，检查 `word/media/` 目录中的图片格式
   - 确认图片是 SVG 还是 PNG

---

## 总结

当前的问题是：

- **HTML/PDF 导出**：PlantUML → SVG（矢量图）
- **DOCX 导出**：PlantUML → PNG（位图）

这种不一致性源于：

1. 导出格式选择逻辑（行 244）为 DOCX 选择了位图格式
2. 可能是为了兼容 Word 对 SVG 的支持问题

建议统一使用 SVG，并在必要时在 DOCX 生成阶段转换为 PNG，以保持一致性。
