# PlantUML 导出问题分析

## 问题描述

- **DOCX/TEX 导出**：符合预期，PlantUML 被正确渲染
- **PDF/HTML 导出**：不符合预期，走的是另一条链路

## 问题根源

### 1. PDF 导出流程

**文件位置**：`meta-doc/src/renderer/src/services/export-manager.ts`

```typescript
// 行 159-160
} else if (targetFormat === 'pdf') {
  html = await ConvertHtmlForPdf(markdown);
}
```

**问题**：`ConvertHtmlForPdf` 函数（`meta-doc/src/renderer/src/utils/md-utils.js:2235`）使用 `Vditor.preview` 来渲染 Markdown：

```javascript
// 行 2282
Vditor.preview(previewElement, ${safeMarkdown}, {
    cdn: "${cdn}",
    // ...
});
```

**关键问题**：

1. 虽然 `prepareMarkdownForExport` 中已经调用了 `preRenderAllCharts` 将 PlantUML 代码块替换为图片链接
2. 但是 `Vditor.preview` 可能会：
   - 检测到 Markdown 中仍然存在 PlantUML 代码块（如果预渲染失败）
   - 或者 Vditor 内置的图表渲染功能会重新处理 PlantUML 代码块
   - 导致 PlantUML 被 Vditor 的渲染逻辑处理，而不是使用预渲染的图片

### 2. HTML 导出流程

**文件位置**：`meta-doc/src/renderer/src/services/export-manager.ts`

```typescript
// 行 161-167
} else if (targetFormat === 'html') {
  const convertToBase64 = imageProcessing === 'base64';
  html = await ConvertMarkdownToHtmlManually(markdown, convertToBase64);
  // ...
}
```

**问题**：`ConvertMarkdownToHtmlManually` 函数（`meta-doc/src/renderer/src/utils/md-utils.js:1774`）也使用 `Vditor.preview`：

```javascript
// 行 2059
Vditor.preview(tempContainer, md, previewOptions)
```

**同样的问题**：Vditor 可能会重新处理 PlantUML 代码块。

### 3. DOCX 导出流程（正常）

**文件位置**：`meta-doc/src/renderer/src/services/export-manager.ts`

```typescript
// 行 151-158
if (targetFormat === 'docx') {
  let markdownWithBase64Images = await embedImagesInline(markdown)
  markdownWithBase64Images = await resizeImagesForDocx(markdownWithBase64Images)
  html = await ConvertMarkdownToHtmlVditor(markdownWithBase64Images)
}
```

**为什么正常**：

- `ConvertMarkdownToHtmlVditor` 使用 `Vditor.md2html`，这是一个同步方法，不会触发图表渲染
- 预渲染的图片链接会被直接转换为 `<img>` 标签

## 解决方案

### 已实施的修复

在 `ConvertHtmlForPdf` 和 `ConvertMarkdownToHtmlManually` 中，添加了以下修复：

1. **检查残留的 PlantUML 代码块**：

   - 在调用 `Vditor.preview` 之前，检查是否还有残留的 PlantUML 代码块
   - 如果检测到，记录警告并尝试处理（将 PlantUML 代码块转换为普通代码块）

2. **添加调试日志**：
   - 在 `ConvertHtmlForPdf` 中，添加了日志来统计 PlantUML 代码块和图片的数量
   - 帮助诊断预渲染是否成功

### 修改的文件

1. **`meta-doc/src/renderer/src/utils/md-utils.js`**：
   - `ConvertHtmlForPdf` 函数（行 2235-2261）：添加 PlantUML 代码块检查和日志
   - `ConvertMarkdownToHtmlManually` 函数（行 2045-2059）：添加 PlantUML 代码块检查

### 后续优化建议

如果问题仍然存在，可以考虑：

1. **方案 1：禁用 Vditor 的图表渲染功能**

   - 在调用 `Vditor.preview` 时，禁用图表渲染功能（如果 Vditor 支持）

2. **方案 2：使用 Vditor.md2html 代替 Vditor.preview**

   - 对于 PDF/HTML 导出，使用 `Vditor.md2html` 代替 `Vditor.preview`
   - **注意**：`Vditor.md2html` 是同步方法，不会触发图表渲染，但可能缺少一些预览功能（如代码高亮、数学公式渲染）

3. **方案 3：在 Vditor.preview 之后清理**
   - 在 `Vditor.preview` 完成后，检查生成的 HTML
   - 如果发现 PlantUML 相关的元素，移除或替换它们

## 验证步骤

1. **检查预渲染结果**：

   - 在 `preRenderAllCharts` 后，打印 Markdown，确认 PlantUML 代码块已被替换为图片链接
   - 检查图片 URL 格式（应该是 `http://localhost:52521/images/xxx_plantuml.svg`）

2. **检查 Vditor.preview 的输入**：

   - 在 `ConvertHtmlForPdf` 和 `ConvertMarkdownToHtmlManually` 中，打印传入 `Vditor.preview` 的 Markdown
   - 确认是否还有 PlantUML 代码块

3. **检查最终 HTML**：
   - 在 PDF/HTML 导出后，检查生成的 HTML
   - 确认 PlantUML 是图片还是代码块

## 关键代码位置

1. **导出管理器**：`meta-doc/src/renderer/src/services/export-manager.ts`

   - 行 159-160：PDF 导出调用 `ConvertHtmlForPdf`
   - 行 161-167：HTML 导出调用 `ConvertMarkdownToHtmlManually`
   - 行 254：图表格式选择逻辑

2. **PDF HTML 转换**：`meta-doc/src/renderer/src/utils/md-utils.js`

   - 行 2235-2483：`ConvertHtmlForPdf` 函数
   - 行 2282：调用 `Vditor.preview`

3. **HTML 手动转换**：`meta-doc/src/renderer/src/utils/md-utils.js`

   - 行 1774-2150：`ConvertMarkdownToHtmlManually` 函数
   - 行 2059：调用 `Vditor.preview`

4. **图表预渲染**：`meta-doc/src/renderer/src/utils/chart-pre-renderer.js`
   - 行 1010-1197：`preRenderAllCharts` 函数
   - 行 1127-1138：PlantUML 渲染逻辑
