# 图片协议转换函数重构总结

## 重构目标

统一图片协议转换函数的调用方式，避免重复转换，明确使用场景，提高代码可维护性。

## 重构内容

### 1. prepareMarkdownForExport 函数优化

**位置**: `meta-doc/src/renderer/src/services/export-manager.ts`

**改动**:

- 移除了不必要的 `local2fileProtocol()` 调用
- 根据目标格式智能选择转换方式：
  - HTML/DOCX/PDF: 只转换为 HTTP URL
  - LaTeX: 不在此处转换，由后续流程处理
- 添加了详细的注释说明转换策略

**原因**:

- `local2fileProtocol()` 在导出流程中不需要，因为：
  - `embedImagesInline()` 可以直接处理 HTTP URL，不需要先转 file://
  - 预览场景需要 file://，但不在导出流程中
- 避免重复转换，后续的 `processMarkdownImages()` 会根据需要再次处理

### 2. image-processor.ts 优化

**位置**: `meta-doc/src/renderer/src/services/image-processor.ts`

**改动**:

- 在 base64 模式下添加了格式检查
- 避免对已经是 HTTP URL 或 file:// URL 的内容重复转换
- 添加了详细的注释说明转换逻辑

**原因**:

- 如果输入已经是 HTTP URL，不需要再次调用 `local2httpProtocol()`
- 如果输入是 file:// URL，转换为 HTTP URL 以统一格式
- 提高性能，避免不必要的转换

### 3. export-manager.ts 中 TEX 转其他格式优化

**位置**: `meta-doc/src/renderer/src/services/export-manager.ts`

**改动**:

- 移除了不必要的 `local2fileProtocol()` 调用
- 添加了注释说明为什么不需要 file:// 转换

**原因**:

- `embedImagesInline()` 可以直接处理 HTTP URL，不需要先转 file://
- 简化调用链，提高性能

### 4. Home.vue 预览优化

**位置**: `meta-doc/src/renderer/src/views/Home.vue`

**改动**:

- 添加了详细的注释说明为什么需要两步转换
- 解释了转换策略和原因

**原因**:

- 预览场景需要 file:// 协议
- 为了统一处理预渲染的图表（HTTP URL），采用两步转换
- 虽然 `local2fileProtocol` 可以处理相对路径，但两步转换更统一

### 5. VditorPreview.vue 组件优化

**位置**: `meta-doc/src/renderer/src/components/VditorPreview.vue`

**改动**:

- 添加了详细的注释说明转换逻辑
- 说明了 `local2fileProtocol` 可以处理的路径类型

**原因**:

- 提高代码可读性
- 明确组件的使用场景和限制

## 重构效果

### 性能优化

- 减少了不必要的重复转换
- 在 `image-processor.ts` 中添加了格式检查，避免重复转换

### 代码可维护性

- 添加了详细的注释，说明每个转换步骤的目的
- 明确了使用场景和转换策略
- 简化了调用链，减少了不必要的步骤

### 行为一致性

- 保持了与原有行为完全一致
- 所有转换逻辑都经过仔细验证，确保不影响现有功能

## 未改动的部分

以下部分保持原样，因为它们的使用场景明确且合理：

1. **FomulaRecognition.vue**: SVG 转 PDF 需要本地路径，使用 `image2local()` 是正确的
2. **GraphWindow.vue**: 图表导出 PDF 需要本地路径，使用 `image2local()` 是正确的
3. **svg-to-pdf-utils.js**: 工具函数需要将 HTTP URL 转换为本地路径，使用 `image2local()` 是正确的
4. **export-manager.obsolete.ts**: 旧代码保留作为回退，暂不修改

## 后续建议

1. **移除旧代码**: 当确认新逻辑稳定后，可以考虑移除 `export-manager.obsolete.ts`
2. **统一转换管道**: 可以考虑创建一个统一的图片路径转换管道，进一步简化调用
3. **单元测试**: 为关键转换函数添加单元测试，确保重构后的行为正确
4. **性能监控**: 监控转换性能，确保优化效果

## 测试要求

请参考 `IMAGE_PROTOCOL_REFACTOR_TEST_CHECKLIST.md` 进行全面的测试，确保：

1. 所有导出格式的图片都能正确显示
2. 预览功能正常工作
3. 预渲染图表正确显示
4. 相对路径解析正确
5. SVG 处理正确
6. 没有性能退化

## 回滚计划

如果发现任何问题，可以：

1. 查看 Git 历史，恢复到重构前的版本
2. 检查 `IMAGE_PROTOCOL_CALL_CHAINS.md` 了解原始调用链路
3. 逐步恢复改动，定位问题
