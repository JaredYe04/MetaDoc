# 图片协议转换重构测试清单

## 重构内容总结

本次重构主要优化了图片协议转换函数的调用方式，避免重复转换，明确使用场景。主要改动：

1. **prepareMarkdownForExport**: 移除了不必要的 `local2fileProtocol` 调用，只根据目标格式进行必要的转换
2. **image-processor.ts**: 添加了格式检查，避免对已经是 HTTP URL 的内容重复转换
3. **export-manager.ts (TEX转其他格式)**: 移除了不必要的 `local2fileProtocol` 调用
4. **添加了详细注释**: 说明每个转换步骤的目的和原因

## 需要测试的调用链路

### 1. Markdown 导出流程

#### 1.1 MD -> DOCX 导出

**测试场景**:

- [ ] 包含相对路径图片的 Markdown 导出为 DOCX
- [ ] 包含绝对路径图片的 Markdown 导出为 DOCX
- [ ] 包含 HTTP URL 图片的 Markdown 导出为 DOCX（预渲染图表）
- [ ] 包含混合路径类型图片的 Markdown 导出为 DOCX
- [ ] 包含 SVG 图片的 Markdown 导出为 DOCX（应转换为 PNG base64）

**验证点**:

- DOCX 文件中的图片是否正确显示
- 图片是否为 base64 格式内嵌
- SVG 图片是否正确转换为 PNG

**调用链路**:

```
prepareExportPayload()
  └─> prepareMarkdownForExport() [只转 HTTP URL]
  └─> processMarkdownImages() [如果配置了 base64]
  └─> embedImagesInline() [DOCX 必须内嵌]
  └─> ConvertMarkdownToHtmlVditor()
```

#### 1.2 MD -> HTML 导出

**测试场景**:

- [ ] 包含相对路径图片的 Markdown 导出为 HTML（原始模式）
- [ ] 包含相对路径图片的 Markdown 导出为 HTML（base64 模式）
- [ ] 包含相对路径图片的 Markdown 导出为 HTML（folder 模式）
- [ ] 包含预渲染图表的 Markdown 导出为 HTML

**验证点**:

- HTML 文件中的图片链接是否正确
- base64 模式下图片是否为 data URL
- folder 模式下图片链接是否为相对路径

**调用链路**:

```
prepareExportPayload()
  └─> prepareMarkdownForExport() [只转 HTTP URL]
  └─> processMarkdownImages() [根据配置]
  └─> ConvertMarkdownToHtmlManually()
  └─> processHtmlImages() [如果 base64 模式]
```

#### 1.3 MD -> PDF 导出

**测试场景**:

- [ ] 包含相对路径图片的 Markdown 导出为 PDF
- [ ] 包含预渲染图表的 Markdown 导出为 PDF
- [ ] 包含混合路径类型图片的 Markdown 导出为 PDF

**验证点**:

- PDF 文件中的图片是否正确显示
- 图片链接是否为 HTTP URL 格式

**调用链路**:

```
prepareExportPayload()
  └─> prepareMarkdownForExport() [只转 HTTP URL]
  └─> ConvertHtmlForPdf()
```

#### 1.4 MD -> TEX 导出

**测试场景**:

- [ ] 包含相对路径图片的 Markdown 导出为 LaTeX
- [ ] 包含绝对路径图片的 Markdown 导出为 LaTeX
- [ ] 包含 HTTP URL 图片的 Markdown 导出为 LaTeX（预渲染图表）

**验证点**:

- LaTeX 文件中的图片路径是否为本地绝对路径
- 图片路径格式是否正确（LaTeX 兼容）

**调用链路**:

```
prepareExportPayload()
  └─> prepareMarkdownForExport() [不转换图片路径]
  └─> processMarkdownImages() [如果配置了 folder 模式，转 HTTP URL]
  └─> convertMarkdownToLatexWithOptions()
```

### 2. LaTeX 转其他格式

#### 2.1 TEX -> DOCX 导出

**测试场景**:

- [ ] 包含图片引用的 LaTeX 导出为 DOCX
- [ ] LaTeX 中的图片路径是否正确转换

**验证点**:

- DOCX 文件中的图片是否正确显示
- 图片是否为 base64 格式内嵌

**调用链路**:

```
prepareExportPayload()
  └─> convertLatexToMarkdown()
  └─> local2httpProtocol() [转 HTTP URL]
  └─> embedImagesInline() [转 base64]
  └─> ConvertMarkdownToHtmlVditor()
```

#### 2.2 TEX -> HTML 导出

**测试场景**:

- [ ] 包含图片引用的 LaTeX 导出为 HTML

**验证点**:

- HTML 文件中的图片是否正确显示
- 图片是否为 base64 格式内嵌

**调用链路**:

```
prepareExportPayload()
  └─> convertLatexToMarkdown()
  └─> local2httpProtocol() [转 HTTP URL]
  └─> embedImagesInline() [转 base64]
  └─> ConvertMarkdownToHtmlManually()
```

#### 2.3 TEX -> PDF 导出

**测试场景**:

- [ ] 包含图片引用的 LaTeX 导出为 PDF（应保持 LaTeX 格式）

**验证点**:

- 是否直接返回，不进行转换

**调用链路**:

```
prepareExportPayload()
  └─> [直接返回，不转换]
```

### 3. Markdown 预览渲染

#### 3.1 Home.vue 预览

**测试场景**:

- [ ] 包含相对路径图片的 Markdown 预览
- [ ] 包含绝对路径图片的 Markdown 预览
- [ ] 包含 HTTP URL 图片的 Markdown 预览（预渲染图表）
- [ ] 包含混合路径类型图片的 Markdown 预览

**验证点**:

- 预览中的图片是否正确显示
- 图片路径是否为 file:// 协议

**调用链路**:

```
renderPreview()
  └─> local2httpProtocol() [统一格式]
  └─> local2fileProtocol() [转 file://]
  └─> renderMarkdownPreview()
```

#### 3.2 VditorPreview.vue 组件

**测试场景**:

- [ ] 包含相对路径图片的 Markdown 在组件中预览
- [ ] 包含绝对路径图片的 Markdown 在组件中预览
- [ ] 包含 HTTP URL 图片的 Markdown 在组件中预览

**验证点**:

- 组件预览中的图片是否正确显示
- 图片路径是否为 file:// 协议

**调用链路**:

```
renderMarkdown()
  └─> local2fileProtocol() [转 file://]
  └─> renderMarkdownPreview()
```

### 4. 图片处理服务

#### 4.1 Base64 模式处理

**测试场景**:

- [ ] 输入为相对路径，base64 模式处理
- [ ] 输入为绝对路径，base64 模式处理
- [ ] 输入为 HTTP URL，base64 模式处理（应避免重复转换）
- [ ] 输入为 file:// URL，base64 模式处理

**验证点**:

- 输出是否为 base64 data URL
- 是否避免了重复转换（检查日志）

**调用链路**:

```
processMarkdownImages(mode='base64')
  └─> [检查格式，避免重复转换]
  └─> local2httpProtocol() [如果需要]
  └─> embedImagesInline() [转 base64]
```

#### 4.2 Folder 模式处理

**测试场景**:

- [ ] 输入为相对路径，folder 模式处理
- [ ] 输入为绝对路径，folder 模式处理
- [ ] 输入为 HTTP URL，folder 模式处理（应保持原样）

**验证点**:

- 输出是否为 HTTP URL 格式
- 是否避免了重复转换

**调用链路**:

```
processMarkdownImages(mode='folder')
  └─> local2httpProtocol() [转 HTTP URL]
```

### 5. SVG 转 PDF 相关

#### 5.1 FomulaRecognition.vue - SVG 转 PDF

**测试场景**:

- [ ] 公式识别后导出为 PDF
- [ ] SVG 图片是否正确转换为 PDF

**验证点**:

- PDF 文件是否正确生成
- SVG 是否正确转换

**调用链路**:

```
handleExportPdf()
  └─> image2local() [HTTP URL -> 本地路径]
  └─> ipcRenderer.invoke('convert-svg-to-pdf')
```

#### 5.2 GraphWindow.vue - 图表导出为 PDF

**测试场景**:

- [ ] 图表导出为 PDF
- [ ] SVG 图表是否正确转换为 PDF

**验证点**:

- PDF 文件是否正确生成
- 图表是否正确转换

**调用链路**:

```
exportGraphAsPdf()
  └─> image2local() [HTTP URL -> 本地路径]
  └─> ipcRenderer.invoke('convert-svg-to-pdf')
```

#### 5.3 svg-to-pdf-utils.js - SVG 转 PDF 工具

**测试场景**:

- [ ] 通过工具函数转换 SVG 为 PDF
- [ ] HTTP URL 是否正确转换为本地路径

**验证点**:

- 转换是否成功
- 路径转换是否正确

**调用链路**:

```
convertSvgToPdf()
  └─> convertUrlToLocalPath()
      └─> image2local() [HTTP URL -> 本地路径]
  └─> ipcRenderer.invoke('convert-svg-string-to-png')
```

## 回归测试重点

### 关键功能验证

1. **所有导出格式的图片显示**: 确保所有导出格式中的图片都能正确显示
2. **预览功能**: 确保预览中的图片都能正确显示
3. **预渲染图表**: 确保预渲染的图表在导出和预览中都能正确显示
4. **相对路径解析**: 确保相对路径图片在不同场景下都能正确解析
5. **SVG 处理**: 确保 SVG 图片在 DOCX 导出时正确转换为 PNG

### 性能验证

1. **避免重复转换**: 检查日志，确认没有不必要的重复转换
2. **转换速度**: 确保重构后转换速度没有明显下降

### 边界情况

1. **空图片路径**: 确保空路径不会导致错误
2. **无效路径**: 确保无效路径有适当的错误处理
3. **网络图片**: 确保网络图片（非 localhost）的处理正确
4. **Base64 图片**: 确保已经是 base64 的图片不会被重复转换

## 测试建议

1. **自动化测试**: 为关键转换函数添加单元测试
2. **集成测试**: 测试完整的导出流程
3. **手动测试**: 使用真实文档进行手动测试，验证视觉效果
4. **性能测试**: 使用大型文档测试性能影响

## 注意事项

- 重构后应保持与原有行为完全一致
- 如果发现任何行为差异，应立即回滚并修复
- 重点关注图片路径转换的正确性和性能优化效果
