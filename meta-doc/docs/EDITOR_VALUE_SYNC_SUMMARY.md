# MarkdownEditor 编辑器同步逻辑简化总结

## 三大核心流程

### 1️⃣ 用户输入流程（最频繁）

```
用户输入 → Vditor input 回调
  ↓
1. markEditorInteraction() [设置 isEditorInteracting = true，300ms 后自动重置]
2. lastAppliedContent = value [记录已应用内容]
3. workspace.updateDocumentMarkdown() [更新文档模型，自动同步大纲]
  ↓
触发 watch(currentMarkdown)
  ↓
检查: incoming !== lastAppliedContent? 
  → 否：跳过（避免循环）✓
  → 是：调用 scheduleSetValue（外部更新场景）
```

**关键点**：通过先更新 `lastAppliedContent` 再更新文档模型，避免循环更新。

---

### 2️⃣ 保存流程

```
用户保存 (Ctrl+S) → handleSyncActiveEditor
  ↓
1. vditor.getValue() [从编辑器读取最新内容]
2. 规范化内容（\r\n → \n）
3. 比较：规范化后的内容 == currentMarkdown?
  → 是：跳过更新（已经同步）
  → 否：workspace.updateDocumentMarkdown() [强制同步]
  ↓
4. 同步大纲（flush）
5. 延迟 150ms 重新应用主题（可能不必要）
```

**关键点**：保存是单向的（编辑器 → 模型），不会触发 watch 的 setValue。

---

### 3️⃣ 外部更新编辑器（Tab 切换/文件变化）

```
外部更新 currentMarkdown → watch(currentMarkdown)
  ↓
检查: isActive && incoming !== lastAppliedContent?
  → 否：跳过
  → 是：scheduleSetValue()
    ↓
    scheduleSetValue 内部:
    1. 检查 Vditor 初始化状态
    2. 检查: normalized === lastAppliedContent? → 是则跳过
    3. 检查: isEditorInteracting? 
       → 是：缓存到 pendingExternalUpdate（300ms 后自动应用）
       → 否：使用 requestIdleCallback 延迟执行 setValue
    4. vditor.setValue() → 更新 lastAppliedContent
```

**关键点**：通过 `isEditorInteracting` 避免打断用户输入，延迟的更新会在用户停止输入后自动应用。

---

## 问题清单

### ❌ 问题 1: scheduleSetValue 中重复检查 isEditorInteracting

**位置**: Line 379 和 Line 395

**代码**:
```typescript
const run = async () => {
    if (isEditorInteracting.value) {  // ← 第一次检查
        pendingExternalUpdate = { value: normalized, clearHistory: options.clearHistory };
        return;
    }
    // ...
};

if (isEditorInteracting.value) {  // ← 第二次检查（重复）
    pendingExternalUpdate = { value: normalized, clearHistory: options.clearHistory };
    return;
}
```

**影响**: 代码冗余，但逻辑正确。

**修复建议**: 移除 `run` 函数内的检查，只保留外部的检查（因为 `requestIdleCallback` 的 `run` 是异步执行的，可能在检查后用户开始输入）。

---

### ❌ 问题 2: 双重大纲同步

**位置**: 
- `workspace.updateDocumentMarkdown` 内部 (workspace.ts:596-614)
- `syncOutlineFromMarkdown` (MarkdownEditor.vue:258)

**影响**: 
- 用户输入时：`workspace.updateDocumentMarkdown` 已同步大纲，`syncOutlineFromMarkdown` 的防抖可能被取消，不重复计算 ✓
- 保存时：会立即 flush `syncOutlineFromMarkdown`，导致重复同步

**修复建议**: 
- 移除 `syncOutlineFromMarkdown` 的自动调用（只在保存时手动调用）
- 或者让 `workspace.updateDocumentMarkdown` 提供一个选项禁用自动大纲同步

---

### ⚠️ 问题 3: 保存后的主题重新应用可能不必要

**位置**: `handleSyncActiveEditor` Line 649-666

**问题**: 
- 保存操作不会触发 `setValue`（因为内容相同或 watch 检查）
- 所以延迟 150ms 重新应用主题可能不必要

**修复建议**: 
- 检查是否真的需要：如果 `setValue` 没有执行，就不需要重新应用主题
- 或者移除这段逻辑，改为在主题变化时统一处理

---

### ⚠️ 问题 4: pendingExternalUpdate 可能被覆盖

**场景**: 
- 用户输入 → 外部更新1 到达 → 缓存到 `pendingExternalUpdate`
- 300ms 内用户继续输入 → 外部更新2 到达 → 覆盖 `pendingExternalUpdate`
- 结果：更新1 丢失

**修复建议**: 
- 使用队列存储待处理的更新
- 或者只保留最新的更新（当前行为）并添加日志说明

---

### ⚠️ 问题 5: lastAppliedContent 在 setValue 失败时未更新

**位置**: `scheduleSetValue` Line 384-385

**当前代码**:
```typescript
try {
    vditor.value?.setValue(normalized, options.clearHistory ?? true);
    lastAppliedContent.value = normalized;  // ← 在 try 块内，失败时不会更新
} catch (error) {
    logger.warn('设置 Vditor 值失败，可能未完全初始化:', error);
}
```

**影响**: 
- ✅ 这是正确的行为：只有成功设置后才更新 `lastAppliedContent`
- ⚠️ 但如果失败，后续的更新可能会重复尝试（但这是期望的行为）

**建议**: 当前逻辑是正确的，无需修改。

---

## 优化建议优先级

### 🔴 高优先级（建议立即修复）

1. **移除 scheduleSetValue 中的重复检查**（问题1）
   - 影响：代码可读性
   - 风险：低
   - 工作量：小

### 🟡 中优先级（建议在重构时修复）

2. **统一大纲同步逻辑**（问题2）
   - 影响：性能（轻微）
   - 风险：中（需要测试确保不会破坏功能）
   - 工作量：中

3. **优化保存后的主题应用逻辑**（问题3）
   - 影响：性能（轻微）
   - 风险：低
   - 工作量：小

### 🟢 低优先级（可选优化）

4. **改进 pendingExternalUpdate 处理**（问题4）
   - 影响：边缘情况
   - 风险：低
   - 工作量：中

---

## 关键变量说明

| 变量 | 作用 | 更新时机 |
|------|------|----------|
| `currentMarkdown` | 文档模型中的内容（computed） | 通过 `workspace.updateDocumentMarkdown` 更新 |
| `lastAppliedContent` | 最后成功应用到编辑器的内容 | 输入时（input 回调）或外部更新时（setValue 成功后） |
| `isEditorInteracting` | 标记用户是否正在交互 | 输入时设为 true，300ms 后自动重置 |
| `pendingExternalUpdate` | 缓存的待处理外部更新 | 用户交互时缓存，交互结束后应用 |

---

## 调试技巧

1. **检查循环更新**：
   - 在 `watch(currentMarkdown)` 中添加日志
   - 在 `scheduleSetValue` 中添加日志
   - 观察是否有重复触发

2. **检查冲突检测**：
   - 在用户快速输入时，观察外部更新是否被正确延迟
   - 检查 `pendingExternalUpdate` 是否正确应用

3. **检查大纲同步**：
   - 在 `workspace.updateDocumentMarkdown` 和 `syncOutlineFromMarkdown` 中添加日志
   - 观察是否有重复计算

---

## 总结

当前实现的整体思路是正确的，通过以下机制避免了常见问题：

1. ✅ **避免循环更新**：通过 `lastAppliedContent` 比较
2. ✅ **避免冲突**：通过 `isEditorInteracting` 标记和延迟更新
3. ✅ **规范化内容**：统一处理 `\r\n` 转换

主要问题是：
- 代码中有一些冗余逻辑（重复检查）
- 大纲同步可能重复（但不影响功能）
- 某些边界情况需要优化

建议先修复高优先级问题，再逐步优化中低优先级问题。

