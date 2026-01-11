# Ctrl+S (Cmd+S) 保存键完整链路文档

## 概述

本文档详细描述了按下 Ctrl+S (Windows/Linux) 或 Cmd+S (macOS) 保存键后的完整执行链路，包括所有事件、函数调用和数据流。

---

## 完整链路图

```
用户按下 Ctrl+S / Cmd+S
  ↓
[Electron 主进程] 快捷键注册 (index.ts:78)
  accelerator: 'CommandOrControl+S'
  channel: 'save-triggered'
  ↓
[Electron 主进程] 发送 IPC 消息
  mainWindow.webContents.send('save-triggered')
  ↓
[渲染进程] 接收 IPC 消息 (event-bus.js:351)
  ipcRenderer.on('save-triggered')
  ↓
[渲染进程] 触发 eventBus 事件
  eventBus.emit('save')
  ↓
[渲染进程] 监听 save 事件 (event-bus.js:479)
  eventBus.on('save', async (payload) => {...})
  ↓
[渲染进程] 调用 save 函数 (event-bus.js:465)
  save('save', args)
  ↓
  ├─ 步骤 1: 同步活动编辑器内容
  │    eventBus.emit('sync-active-editor', { tabId })
  │    ↓
  │    [MarkdownEditor.vue] handleSyncActiveEditor (line 619)
  │    ├─ vditor.getValue() [从编辑器读取最新内容]
  │    ├─ 规范化内容（\r\n → \n）
  │    ├─ 比较：normalizedLatest !== normalizedCurrent?
  │    │  ├─ 是：workspace.updateDocumentMarkdown(props.tabId, latest)
  │    │  │   ├─ 规范化内容
  │    │  │   ├─ 更新 doc.markdown
  │    │  │   ├─ 自动同步大纲树（如果在编辑器视图）
  │    │  │   └─ updateDocumentDirty(tabId)
  │    │  └─ 否：跳过更新（内容已同步）
  │    └─ 同步大纲（如果内容相同但需要确保大纲最新）
  │
  ├─ 步骤 2: 获取当前文档
  │    const doc = getDocument(resolvedTabId)
  │
  └─ 步骤 3: 构建保存载荷
      const payload = await buildSavePayload(doc)
      ├─ 序列化文档（serializeDocument）
      │   ├─ 提取 markdown/tex/json
      │   ├─ 序列化 outline、meta、aiDialogs、agentSessions
      │   └─ 返回 SaveData
      └─ 返回完整载荷
  ↓
[渲染进程] 发送 IPC 消息到主进程
  ipcRenderer.send('save', payload)
  ↓
[Electron 主进程] 接收 save 事件 (main-calls.ts:213)
  ipcMain.on('save', async (event, data: SaveData) => {...})
  ↓
[Electron 主进程] 调用 save 函数 (main-calls.ts:2489)
  await save(data, false)
  ↓
  ├─ 步骤 1: 调用 saveInternal (main-calls.ts:2443)
  │    ├─ 检查是否需要选择文件路径（path === '' || saveAs）
  │    │   └─ 是：await chooseSaveFile(data) [显示文件选择对话框]
  │    ├─ 确定文件格式（从扩展名或 data.format）
  │    ├─ 确保文件扩展名正确
  │    ├─ 根据格式选择内容（md/json/tex）
  │    ├─ 标记文件正在保存（避免触发文件监听）
  │    │   fileWatcherService.markFileAsSaving(normalizedPath, 2000)
  │    └─ 写入文件系统
  │        fs.writeFileSync(filePath, content)
  │
  └─ 步骤 2: 发送保存成功消息
      mainWindow.webContents.send('save-success', {
        path: result.path,
        saveAs: false,
        format: result.format,
        fileName: path.basename(result.path)
      })
  ↓
[渲染进程] 接收 save-success 消息 (event-bus.js:305)
  ipcRenderer.on('save-success', (_event, data) => {...})
  ↓
  ├─ 步骤 1: 标记文档已保存
  │    markDocumentSaved(doc.tabId, data.path ?? doc.path)
  │    ↓
  │    [workspace.ts] markDocumentSaved (line 987)
  │    ├─ 规范化内容（normalizeContent）
  │    ├─ 更新 doc.savedMarkdown / doc.savedTex
  │    ├─ 克隆并保存 outline、meta、aiDialogs、agentSessions
  │    ├─ 设置 doc.dirty = false
  │    ├─ 更新 tab.dirty = false
  │    ├─ 更新 tab.path（如果路径变化）
  │    ├─ 同步标签页元数据（标题等）
  │    ├─ 发送 'is-need-save' 事件（false）
  │    └─ 重新计算 dirty 状态
  │
  ├─ 步骤 2: 更新最近文档列表
  │    if (data.path) updateRecentDocs(data.path)
  │
  └─ 步骤 3: 触发 save-success 事件
      eventBus.emit('save-success', payload)
      ↓
      [Main.vue] handleSaveSuccess (line 451)
      ├─ 更新文档脏标记（已在上一步完成）
      └─ 发送 'is-need-save' 事件（false）
```

---

## 详细步骤说明

### 阶段 1: 快捷键触发（Electron 主进程）

**文件**: `meta-doc/src/main/index.ts`

**位置**: Line 77-82

```typescript
const SHORTCUT_CONFIG = [
  { accelerator: 'CommandOrControl+S', channel: 'save-triggered' as const },
  // ...
]
```

**处理**: 通过 `bindShortcuts()` 函数注册全局快捷键，当按下 Ctrl+S 或 Cmd+S 时，发送 IPC 消息 `'save-triggered'` 到渲染进程。

---

### 阶段 2: 渲染进程接收快捷键事件

**文件**: `meta-doc/src/renderer/src/utils/event-bus.js`

**位置**: Line 351-353

```typescript
ipcRenderer.on('save-triggered', () => {
  eventBus.emit('save')
})
```

**作用**: 将主进程的 IPC 消息转换为渲染进程内部的事件。

---

### 阶段 3: 监听 save 事件并处理

**文件**: `meta-doc/src/renderer/src/utils/event-bus.js`

**位置**: Line 479-489

```typescript
eventBus.on('save', async (payload) => {
  const { mode, args } = normalizeSavePayload(payload)
  
  if (mode === 'auto-save') {
    const doc = getDocument()
    if (!doc || !doc.path) {
      return // 自动保存需要文件路径
    }
  }
  await save('save', args);
})
```

---

### 阶段 4: 同步编辑器内容（关键步骤）

**文件**: `meta-doc/src/renderer/src/utils/event-bus.js`

**位置**: Line 465-477

```typescript
const save = async (mode = 'save', args, targetTabId) => {
  const resolvedTabId = resolveTargetTabId(targetTabId);
  if (resolvedTabId) {
    // 🔑 关键：先同步编辑器内容到文档模型
    eventBus.emit('sync-active-editor', { tabId: resolvedTabId });
  }
  // ...
}
```

**文件**: `meta-doc/src/renderer/src/views/MarkdownEditor.vue`

**位置**: Line 619-645

```typescript
const handleSyncActiveEditor = async (payload?: { tabId?: string }) => {
  const resolvedTabId = payload?.tabId ?? activeTabIdRef?.value;
  if (resolvedTabId !== props.tabId) return;
  if (!vditor.value) return;
  
  // 1. 从编辑器读取最新内容
  const latest = vditor.value.getValue();
  const currentContent = currentMarkdown.value;
  
  // 2. 规范化内容（\r\n → \n）
  const normalizeContent = (content: string) => content.replace(/\r\n/g, '\n');
  const normalizedLatest = normalizeContent(latest);
  const normalizedCurrent = normalizeContent(currentContent ?? '');
  
  // 3. 比较并更新（如果不同）
  if (normalizedLatest !== normalizedCurrent) {
    workspace.updateDocumentMarkdown(props.tabId, latest);
    // 注意：updateDocumentMarkdown 内部已经自动同步大纲树
  } else {
    // 即使内容相同，也确保大纲是最新的
    // ...
  }
};
```

**关键点**:
- 这是**唯一**从编辑器读取内容并写入文档模型的地方
- 保存时强制同步，确保编辑器中的最新内容被保存
- 通过规范化内容（\r\n → \n）避免不必要的更新

---

### 阶段 5: 构建保存载荷

**文件**: `meta-doc/src/renderer/src/utils/event-bus.js`

**位置**: Line 97-196 (buildSavePayload)

```typescript
const buildSavePayload = async (doc) => {
  // 使用 workspace.saveDocument 或直接序列化
  // ...
}
```

**实际使用**: 在新架构中，使用 `workspace.saveDocument` 或 `saveWorkspaceDocument`

**文件**: `meta-doc/src/renderer/src/services/document-save.ts`

**位置**: Line 27-70

```typescript
export const saveWorkspaceDocument = async (
  doc: WorkspaceDocument,
  options?: { saveAs?: boolean },
): Promise<SaveResult> => {
  // 1. 提取标题（如果为空）
  // 2. 序列化文档
  const payload = await serializeDocument(doc);
  // 3. 调用主进程保存
  const result = await ipcRenderer.invoke('workspace-save-document', {
    data: payload,
    saveAs: options?.saveAs ?? doc.path === '',
  });
  // ...
}
```

---

### 阶段 6: 主进程保存文件

**文件**: `meta-doc/src/main/main-calls.ts`

**位置**: Line 222-228 (workspace-save-document handler)

```typescript
ipcMain.handle('workspace-save-document', async (event, payload: { data: SaveData; saveAs?: boolean }) => {
  if (!payload || !payload.data) {
    return null;
  }
  const result = await saveInternal(payload.data, Boolean(payload.saveAs));
  return result;
});
```

**位置**: Line 2443-2487 (saveInternal)

```typescript
const saveInternal = async (
  data: SaveData,
  saveAs: boolean,
): Promise<{ path: string; format: string } | null> => {
  let filePath = data.path;
  
  // 1. 选择文件路径（如果需要）
  if (filePath === '' || saveAs) {
    filePath = await chooseSaveFile(data);
    if (!filePath) return null;
  }
  
  // 2. 确定格式
  const format = data.format || (path.extname(filePath).slice(1).toLowerCase() as DocumentFormat);
  
  // 3. 选择内容
  let content = '';
  switch (format) {
    case 'md': content = data.md; break;
    case 'json': content = data.json; break;
    case 'tex': content = data.tex; break;
  }
  
  // 4. 标记文件正在保存（避免触发文件监听）
  const normalizedPath = path.normalize(filePath);
  fileWatcherService.markFileAsSaving(normalizedPath, 2000);
  
  // 5. 写入文件
  fs.writeFileSync(filePath, content);
  
  return { path: filePath, format };
};
```

**位置**: Line 2489-2500 (save)

```typescript
const save = async (data: SaveData, saveAs: boolean): Promise<void> => {
  const result = await saveInternal(data, saveAs);
  if (result) {
    mainWindow?.webContents.send('save-success', {
      path: result.path,
      saveAs,
      format: result.format,
      fileName: path.basename(result.path),
    });
  }
};
```

**关键点**:
- 文件保存前会标记为"正在保存"状态，2 秒内忽略文件变化事件（避免触发文件监听器的重新加载）
- 使用 `fs.writeFileSync` 同步写入文件

---

### 阶段 7: 保存成功回调

**文件**: `meta-doc/src/renderer/src/utils/event-bus.js`

**位置**: Line 305-328

```typescript
ipcRenderer.on('save-success', (_event, data = {}) => {
  const doc = getDocument()
  if (doc) {
    // 1. 标记文档已保存
    markDocumentSaved(doc.tabId, data.path ?? doc.path)
  }
  
  // 2. 更新最近文档列表
  if (data.path) {
    updateRecentDocs(data.path)
  }
  
  // 3. 触发 save-success 事件
  eventBus.emit('save-success', payload)
  
  // 4. 如果是另存为，重新打开文件
  if (data.saveAs && data.path) {
    eventBus.emit('open-doc', data.path)
  }
})
```

**文件**: `meta-doc/src/renderer/src/stores/workspace.ts`

**位置**: Line 987-1102 (markDocumentSaved)

```typescript
function markDocumentSaved(tabId: string, newPath?: string): void {
  const doc = ensureDocument(tabId);
  
  // 1. 规范化内容
  const normalizedMarkdown = normalizeContent(doc.markdown);
  const normalizedTex = normalizeContent(doc.tex);
  
  // 2. 更新路径（如果变化）
  if (typeof newPath === 'string') {
    doc.path = newPath;
  }
  
  // 3. 保存当前状态到 saved* 字段
  doc.savedMarkdown = normalizedMarkdown;
  doc.savedTex = normalizedTex;
  doc.savedOutline = structuredCloneFallback(doc.outline);
  doc.savedMeta = structuredCloneFallback(doc.meta);
  doc.savedAiDialogs = structuredCloneFallback(doc.aiDialogs);
  doc.savedAgentSessions = structuredCloneFallback(doc.agentSessions);
  
  // 4. 清除脏标记
  doc.dirty = false;
  const tab = tabs.find((item) => item.id === tabId);
  if (tab) {
    tab.dirty = false;
  }
  
  // 5. 同步标签页元数据（标题等）
  syncTabMetadataFromDocument(tabId);
  
  // 6. 发送 'is-need-save' 事件
  if (activeTabId.value === tabId) {
    eventBus.emit('is-need-save', false);
  }
  
  // 7. 重新计算 dirty 状态
  updateDocumentDirty(tabId);
  
  // 8. 更新文件监听（如果路径变化）
  // ...
}
```

---

## 关键事件和消息

### 事件列表

| 事件名称 | 触发位置 | 监听位置 | 作用 |
|---------|---------|---------|------|
| `'save-triggered'` | Electron 主进程（快捷键） | event-bus.js:351 | 快捷键触发保存 |
| `'save'` | event-bus.js:352 | event-bus.js:479 | 渲染进程内部保存事件 |
| `'sync-active-editor'` | event-bus.js:468 | MarkdownEditor.vue:646 | 同步编辑器内容到文档模型 |
| `'save'` (IPC) | event-bus.js:473 | main-calls.ts:213 | 发送保存请求到主进程 |
| `'workspace-save-document'` (IPC) | document-save.ts:52 | main-calls.ts:222 | 新架构的保存请求 |
| `'save-success'` (IPC) | main-calls.ts:2493 | event-bus.js:305 | 主进程通知保存成功 |
| `'save-success'` | event-bus.js:324 | Main.vue:461 | 渲染进程内部保存成功事件 |
| `'is-need-save'` | workspace.ts:1033 | Main.vue, 主进程 | 更新保存状态标志 |

---

## 数据流

### 保存数据流

```
编辑器内容 (vditor.getValue())
  ↓
规范化（\r\n → \n）
  ↓
文档模型 (doc.markdown)
  ↓
序列化 (serializeDocument)
  ↓
SaveData 载荷
  ↓
IPC 消息
  ↓
主进程处理
  ↓
文件系统 (fs.writeFileSync)
```

### 状态更新流

```
保存前：
  doc.dirty = true
  tab.dirty = true
  is_need_save = true

保存后：
  doc.dirty = false
  tab.dirty = false
  doc.savedMarkdown = doc.markdown (规范化后)
  is_need_save = false
```

---

## 注意事项

### 1. 编辑器内容同步

- **关键时机**: 保存时通过 `sync-active-editor` 事件强制同步编辑器内容
- **同步方式**: 从编辑器读取内容，规范化后更新文档模型
- **避免循环**: 通过 `lastAppliedContent` 比较，避免触发 `watch(currentMarkdown)` 的 `setValue`

### 2. 文件监听冲突

- **问题**: 保存文件可能触发文件监听器，导致文件被重新加载
- **解决**: 保存前标记文件为"正在保存"状态，2 秒内忽略文件变化事件

### 3. 大纲同步

- **位置**: `workspace.updateDocumentMarkdown` 内部自动同步大纲树
- **条件**: 只在编辑器视图时同步，避免在 outline 视图时触发
- **时机**: 内容更新时自动同步，保存时如果内容相同也会确保大纲最新

### 4. 路径处理

- **新建文档**: `doc.path === ''`，保存时会弹出文件选择对话框
- **已保存文档**: 直接使用 `doc.path`，除非用户选择"另存为"
- **路径更新**: 保存成功后更新 `doc.path` 和 `tab.path`

### 5. 错误处理

- **IPC 错误**: 主进程保存失败时，不会发送 `save-success` 消息
- **文件系统错误**: `fs.writeFileSync` 可能抛出异常，会被主进程捕获
- **渲染进程错误**: 保存过程中的错误会被 `try-catch` 捕获并记录日志

---

## 相关函数调用链

### 完整调用链（从快捷键到文件保存）

```
用户按下 Ctrl+S
  ↓
Electron 快捷键处理 (index.ts:78)
  ↓ mainWindow.webContents.send('save-triggered')
ipcRenderer.on('save-triggered') (event-bus.js:351)
  ↓ eventBus.emit('save')
eventBus.on('save') (event-bus.js:479)
  ↓ await save('save', args)
save() (event-bus.js:465)
  ├─ eventBus.emit('sync-active-editor') → handleSyncActiveEditor (MarkdownEditor.vue:619)
  ├─ getDocument()
  └─ buildSavePayload()
  ↓ ipcRenderer.send('save', payload)
ipcMain.on('save') (main-calls.ts:213)
  ↓ await save(data, false)
save() (main-calls.ts:2489)
  ↓ await saveInternal(data, false)
saveInternal() (main-calls.ts:2443)
  ↓ fs.writeFileSync(filePath, content)
文件系统写入
  ↓ mainWindow.webContents.send('save-success', {...})
ipcRenderer.on('save-success') (event-bus.js:305)
  ↓ markDocumentSaved()
markDocumentSaved() (workspace.ts:987)
  ↓ eventBus.emit('save-success', payload)
eventBus.on('save-success') (Main.vue:451)
  ↓ 完成保存
```

---

## 总结

Ctrl+S 保存流程是一个**双向通信**的过程：

1. **渲染进程 → 主进程**: 发送保存请求和文档数据
2. **主进程 → 渲染进程**: 发送保存结果和文件路径

关键步骤：
- ✅ 同步编辑器内容（确保最新内容被保存）
- ✅ 序列化文档数据（包含 markdown、outline、meta 等）
- ✅ 主进程写入文件系统
- ✅ 更新文档状态（清除脏标记，更新路径）

整个过程是**异步**的，使用了 IPC 通信和事件总线机制。

