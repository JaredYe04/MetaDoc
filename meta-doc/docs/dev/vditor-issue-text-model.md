# 维护一个内部的文本模型，并暴露文本定位的API，而不是完全基于DOM来操作

## 你在什么场景下需要该功能？

我们在实现**查找替换功能**和**AI辅助工具**时遇到了严重的性能问题和技术障碍。

### 具体场景

1. **查找替换功能**：需要在大文档（超过10万字）中快速定位文本、高亮匹配项，并支持实时搜索状态更新。当前实现需要遍历整个DOM树来定位文本，导致明显的卡顿。

2. **AI辅助工具**：需要根据行号、列号精确定位文本位置，进行智能补全、文本替换等操作。由于Vditor完全基于DOM操作，无法建立从行、列坐标到DOM元素的直接映射关系。

3. **文本定位和编辑**：需要实现类似Monaco Editor的文本定位API（如`getModel().getPositionAt(offset)`、`getModel().getOffsetAt(position)`），以便进行精确的文本操作。

### 当前实现的问题

在我们的实现中（参考 `vditor-adapter.ts`），为了定位一个文本匹配项，需要：

1. 使用 `TreeWalker` 遍历整个DOM树查找文本节点
2. 通过 `getPlainText()` 从DOM提取纯文本（`root.innerText`）
3. 手动计算文本偏移量到行、列的转换（`positionToOffset`、`offsetToPosition`）
4. 使用复杂的标题索引优化来减少遍历范围，但仍然需要DOM遍历

```typescript
// 当前实现示例：需要遍历DOM来定位文本
private highlightMatchWithDOMTraversal(
  root: HTMLElement,
  findResult: FindResult,
  index: number,
  focus: boolean,
): void {
  // 使用TreeWalker遍历所有文本节点
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    { /* 复杂的过滤逻辑 */ }
  );
  // 需要遍历到找到第index个匹配...
}
```

**性能问题**：
- 在10万字以上的文档中，DOM遍历操作会导致明显的卡顿（500ms+）
- 每次搜索都需要重新遍历DOM，无法利用文本模型的缓存优势
- 查找替换菜单需要实时更新搜索状态，频繁的DOM操作导致UI不流畅

### 现有 `getMarkdown` / `getValue` 方法的性能问题

查看Vditor的源代码，我们发现现有的 `getMarkdown` 方法（对应 `getValue` API）完全基于DOM操作，性能较低：

```typescript
import {code160to32} from "../util/code160to32";

export const getMarkdown = (vditor: IVditor) => {
    if (vditor.currentMode === "sv") {
        return code160to32(`${vditor.sv.element.textContent}\n`.replace(/\n\n$/, "\n"));
    } else if (vditor.currentMode === "wysiwyg") {
        return vditor.lute.VditorDOM2Md(vditor.wysiwyg.element.innerHTML);
    } else if (vditor.currentMode === "ir") {
        return vditor.lute.VditorIRDOM2Md(vditor.ir.element.innerHTML);
    }
    return "";
};
```

**问题分析**：
- **SV模式**：需要读取整个DOM的 `textContent`，然后进行字符串处理
- **WYSIWYG/IR模式**：需要读取整个DOM的 `innerHTML`，然后通过 `Lute` 进行DOM到Markdown的转换
- 这些操作都是**同步的、阻塞性的**，在大文档中会导致明显的性能问题
- 每次获取文本都需要重新解析DOM，无法利用缓存

**核心问题**：Vditor目前将**文本模型**和**编辑器DOM渲染**紧密耦合在一起，导致：
- 文本操作（获取、搜索、定位）必须依赖DOM，性能低下
- 无法实现高性能的文本操作（如快速搜索、批量替换）
- 外部工具（查找替换、AI辅助）难以高效实现

## 描述最优的解决方案

### 核心需求：解耦文本模型与编辑器模型

**关键设计原则**：
- **文本模型**：应该是高性能的、同步的、作为数据源
- **编辑器DOM渲染**：可以是异步的、稍低性能的，作为视图层
- **数据绑定**：编辑器数据应该与文本模型绑定，而不是与DOM绑定

Vditor应该维护一个**内部的文本模型**（类似Monaco Editor的`TextModel`），作为**单一数据源（Single Source of Truth）**，并提供以下API：

1. **文本定位API**：
   ```typescript
   // 从行、列获取文本偏移量
   getOffsetAt(position: { line: number; column: number }): number
   
   // 从文本偏移量获取行、列
   getPositionAt(offset: number): { line: number; column: number }
   
   // 从DOM节点/位置获取文本位置
   getPositionFromDOM(node: Node, offset: number): { line: number; column: number }
   
   // 从文本位置获取DOM范围
   getDOMRangeAt(position: { line: number; column: number }): Range | null
   ```

2. **文本模型API**：
   ```typescript
   // 获取完整文本（不依赖DOM）
   getText(): string
   
   // 获取指定行的文本
   getLineContent(lineNumber: number): string
   
   // 获取指定范围的文本
   getTextInRange(range: { start: { line, column }, end: { line, column } }): string
   ```

3. **双向同步机制**：
   - DOM变化时自动更新文本模型（作为数据源）
   - 文本模型变化时异步更新DOM（保持现有的渲染机制，但允许异步）
   - 提供事件通知机制，让外部代码知道文本模型已更新
   - **重要**：文本操作（`getValue`、`getText`、文本搜索等）应该直接从文本模型读取，而不是从DOM转换

### 架构设计建议

```
┌─────────────────────────────────────────┐
│         文本模型（TextModel）            │
│  - 高性能、同步、作为数据源              │
│  - 提供 getText(), getLineContent() 等  │
│  - 提供 getOffsetAt(), getPositionAt()  │
└──────────────┬──────────────────────────┘
               │ 绑定
               │
┌──────────────▼──────────────────────────┐
│      编辑器DOM渲染（异步、视图层）        │
│  - 从文本模型渲染DOM                     │
│  - 可以异步更新，允许稍低性能            │
│  - DOM变化时同步回文本模型                │
└─────────────────────────────────────────┘
```

**关键点**：
- `getValue()` / `getMarkdown()` 应该直接从文本模型读取，而不是从DOM转换
- 文本搜索、定位等操作应该基于文本模型，性能应该是 O(1) 或 O(log n)
- DOM渲染可以异步进行，允许使用 `requestAnimationFrame` 或 `requestIdleCallback` 优化
- 编辑器状态（光标位置、选中范围等）应该绑定到文本模型的位置，而不是DOM节点

### 参考实现

**Monaco Editor** 是一个很好的参考：
- 维护内部的 `TextModel`，包含完整的文本内容和行信息
- 提供 `getOffsetAt()` 和 `getPositionAt()` 等高效的定位API
- DOM只是视图层，所有文本操作都基于文本模型
- 支持虚拟滚动，只渲染可见区域的DOM

**CodeMirror 6** 也采用了类似的设计：
- 使用 `EditorState` 维护文档状态
- 提供 `doc.lineAt()`、`doc.line()` 等API直接访问文本行
- DOM更新通过视图插件处理，核心逻辑不依赖DOM

### 实现建议

1. **文本模型层**：
   - 维护一个字符串数组或类似结构，存储所有文本行
   - 维护行号到DOM元素的映射（可选，用于快速定位）
   - 提供行、列到字符偏移量的快速转换

2. **API层**：
   - 暴露上述文本定位API
   - 保持向后兼容，现有的DOM操作API仍然可用
   - 提供事件系统，通知文本模型变化

3. **同步机制**：
   - 监听DOM的`input`、`beforeinput`等事件，更新文本模型
   - 文本模型变化时，通过现有的渲染机制更新DOM
   - 确保文本模型和DOM的一致性

## 描述候选解决方案

如果完全重构文本模型成本太高，可以考虑以下候选方案：

### 方案1：提供轻量级的文本定位辅助API

即使不完全重构，也可以提供一些辅助API来减少DOM遍历：

```typescript
// 在Vditor实例上添加
interface Vditor {
  // 获取当前编辑器的纯文本（缓存版本）
  getPlainText(): string
  
  // 从行、列获取对应的DOM节点和偏移量（优化实现）
  getDOMNodeAt(line: number, column: number): { node: Node, offset: number } | null
  
  // 从DOM节点和偏移量获取行、列
  getPositionFromDOM(node: Node, offset: number): { line: number, column: number } | null
  
  // 获取指定行的DOM元素
  getLineElement(lineNumber: number): HTMLElement | null
}
```

这些API可以在内部使用优化的算法（如行号索引、文本节点缓存等），减少外部代码的DOM遍历需求。

### 方案2：暴露内部的状态管理

如果Vditor内部已经有某种文本状态管理，可以暴露出来：

```typescript
interface VditorTextState {
  // 文本内容
  text: string
  // 行信息
  lines: Array<{ text: string, startOffset: number, endOffset: number }>
  // 更新事件
  onDidChangeText(callback: (changes: TextChange[]) => void): void
}
```

### 方案3：提供虚拟DOM或虚拟滚动支持

对于大文档，可以考虑：
- 只渲染可见区域的DOM
- 提供虚拟滚动支持
- 非可见区域的文本操作基于文本模型，不依赖DOM

## 其他信息

### 性能数据

在我们的测试中（约12万字的Markdown文档）：
- **DOM遍历定位**：平均 500-800ms
- **文本搜索**（基于字符串）：平均 50-100ms
- **DOM高亮操作**：平均 200-300ms

如果能够基于文本模型进行定位，预计可以将定位时间减少到 **10-50ms**。

### 当前实现的复杂度

为了绕过DOM操作的局限性，我们实现了：
- 标题索引系统（`TitleIndex`）来优化DOM遍历
- 分批搜索机制（`searchInTextBatched`）来避免阻塞UI
- 复杂的DOM遍历算法（`highlightMatchWithDOMTraversal`）来定位文本
- 轮询机制来实时更新搜索状态

这些工作本可以通过文本模型API大大简化。

### 相关代码

我们的实现可以参考：
- `vditor-adapter.ts`：Vditor适配器，实现了查找替换功能
- `SearchReplaceMenu.vue`：查找替换UI组件
- `MarkdownEditor.vue`：主编辑器组件

### 兼容性考虑

我们希望新的API能够：
- 保持向后兼容，现有的DOM操作API仍然可用
- 可以逐步迁移，不需要一次性重构所有代码
- 提供TypeScript类型定义

### 总结

Vditor目前既是**渲染器**又是**编辑器**，这种设计在大文档场景下会导致性能问题。**核心问题是文本模型与编辑器DOM渲染的紧密耦合**：

- 当前的 `getMarkdown` / `getValue` 方法需要从DOM转换，性能低下
- 文本操作（搜索、定位）必须依赖DOM遍历，无法实现高性能
- 外部工具难以高效实现，因为无法直接访问文本模型

通过引入文本模型层并**解耦文本模型与编辑器模型**，可以：
1. **显著提升大文档的性能**：`getValue()` 直接从文本模型读取（O(1)），而不是从DOM转换（O(n)）
2. **简化外部工具的实现**：查找替换、AI辅助等可以直接基于文本模型操作
3. **提供更精确的文本定位能力**：行、列到文本位置的映射是即时的
4. **允许异步渲染优化**：DOM渲染可以异步进行，不影响文本操作的性能
5. **为未来的虚拟滚动等功能打下基础**：文本模型作为数据源，DOM只是视图层

**设计原则**：
- 文本模型 = 高性能、同步、数据源
- DOM渲染 = 异步、视图层、可以稍低性能
- 编辑器数据绑定到文本模型，而不是DOM

我们相信这个改进将大大提升Vditor在处理大文档和复杂编辑场景下的能力，使其能够与Monaco Editor、CodeMirror等现代编辑器竞争。

