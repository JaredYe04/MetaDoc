# 多窗口与标签页管理机制文档

## 概述

MetaDoc 实现了类似 Chrome 浏览器的多窗口标签页管理机制，支持：

- **标签页拆分**：将标签页拖拽到窗口外创建新窗口
- **标签页合并**：将标签页拖拽到其他窗口进行合并
- **窗口池优化**：预创建空闲窗口，实现瞬间显示效果
- **单Tab窗口自动合并**：单Tab窗口拖拽到其他窗口时自动合并

---

## 架构设计

### 1. 窗口类型

#### 1.1 主窗口（Main Windows）

- **用途**：承载文档编辑、主页等主要功能
- **特点**：
  - 支持多Tab管理
  - 可以拖拽Tab拆分/合并
  - 每个窗口有独立的Tab列表和文档状态
- **创建方式**：
  - 应用启动时创建第一个主窗口
  - 通过Tab拖拽创建新主窗口
  - 从窗口池获取预加载窗口

#### 1.2 辅助窗口（Auxiliary Windows）

- **用途**：设置、AI聊天、OCR等工具窗口
- **特点**：
  - 单实例窗口（每个类型只有一个）
  - 隐藏而非关闭（关闭时隐藏，下次打开时显示）
  - 不支持Tab管理
- **类型**：`setting`、`aiChat`、`formulaRecognition`、`aiGraph`、`dataAnalysis`、`ocr`、`attachment`、`graph`

#### 1.3 窗口池（Window Pool）

- **用途**：预创建空闲主窗口，用于Tab拖出时快速显示
- **特点**：
  - 保持 2 个空闲窗口就绪
  - 窗口隐藏但已加载完成（Vue已初始化）
  - 用掉后异步补充
  - 独立于辅助窗口系统

---

## 核心机制

### 2. 窗口池机制

#### 2.1 初始化流程

```typescript
// 主进程：应用启动后延迟3秒初始化窗口池
initWindowPool() {
  setTimeout(() => {
    // 创建2个预加载窗口
    for (let i = 0; i < POOL_SIZE; i++) {
      createAndAddToPool()
    }
  }, 3000)
}
```

**时机**：主窗口加载完成3秒后，避免资源竞争

#### 2.2 窗口预加载

```typescript
async function createAndAddToPool() {
  // 1. 创建窗口（隐藏状态）
  const win = createPoolWindow()

  // 2. 加载URL（skipAutoHome=1，不自动打开主页）
  win.loadURL('/#/home?windowType=home&skipAutoHome=1')

  // 3. 等待Vue初始化完成（检查DOM元素）
  await waitForVueReady(win)

  // 4. 加入池中
  if (pool.length < POOL_SIZE) {
    pool.push(win)
  }
}
```

**关键点**：

- 窗口创建后立即加载URL
- 等待 `.main-tabs-wrapper` DOM元素出现（表示Vue已初始化）
- 最多保持2个窗口在池中

#### 2.3 窗口获取与补充

```typescript
function acquirePoolWindow(params) {
  // 1. 从池中取出窗口
  const win = pool.shift()

  // 2. 设置位置和大小
  win.setBounds({ x, y, width, height })

  // 3. 显示窗口并发送Tab数据
  win.show()
  win.webContents.send('add-tab-from-drag', { tabData })

  // 4. 异步补充新窗口到池中
  createAndAddToPool()
}
```

**优势**：

- 窗口已预加载，显示速度极快（<100ms）
- 用掉后立即补充，保持池中始终有可用窗口

---

### 3. 标签页拖拽机制

#### 3.1 拖拽流程

```
用户拖拽Tab
    ↓
检测拖拽位置
    ↓
┌─────────────────┬──────────────────┐
│ 窗口内拖拽      │ 窗口外拖拽       │
│ (改变Tab顺序)   │ (创建新窗口)     │
└─────────────────┴──────────────────┘
```

#### 3.2 窗口内拖拽

**场景**：在同一窗口的Tab栏内拖拽

**处理**：

1. 监听 `dragover` 事件，计算插入位置
2. 监听 `drop` 事件，重新排列Tab顺序
3. 使用 `workspace.tabs.splice()` 直接操作数组

**代码位置**：`MainTabs.vue` - `handleDrop()`

#### 3.3 窗口外拖拽（创建新窗口）

**触发条件**：

- 鼠标拖拽Tab超出 `MainTabs` 区域
- 当前窗口Tab数量 > 1（单Tab窗口不允许创建新窗口）

**流程**：

```typescript
// 1. 检测鼠标位置超出Tab区域
if (isOutsideTabs && !isDraggingToNewWindow) {
  // 2. 延迟50ms触发（防抖）
  setTimeout(() => {
    // 3. 序列化Tab数据（包括文档内容）
    const tabData = serializeTabData(tabId)

    // 4. 优先从窗口池获取窗口
    const poolWindow = acquirePoolWindow({ tabData, position })

    if (poolWindow) {
      // 使用预加载窗口（瞬间显示）
      return poolWindow.id
    } else {
      // 池为空，创建新窗口
      const newWindow = new BrowserWindow({ ... })
      newWindow.loadURL(url)
      return newWindow.id
    }

    // 5. 从源窗口移除Tab
    removeTabAfterDrag(tabId, sourceWindowId)
  }, 50)
}
```

**关键点**：

- 50ms延迟避免频繁触发
- `windowCreationInProgress` 标志防止重复创建
- Tab数据完整序列化（包括文档内容、状态等）

#### 3.4 窗口间拖拽（合并Tab）

**场景**：将Tab拖拽到另一个已存在的窗口

**流程**：

```typescript
// 1. 目标窗口检测到拖拽进入
handleGlobalDragOver(event) {
  if (event.dataTransfer?.types?.includes('application/x-metadoc-tab')) {
    // 2. 解析Tab数据
    const tabTransferData = JSON.parse(
      event.dataTransfer.getData('application/x-metadoc-tab')
    )

    // 3. 计算插入位置
    const insertIndex = calculateInsertIndex(event.clientX)

    // 4. 发送到主进程转发
    ipcRenderer.send('transfer-tab-to-window', {
      targetWindowId: currentWindowId,
      tabData: tabTransferData,
      insertIndex
    })
  }
}

// 5. 主进程转发Tab数据
ipcMain.on('transfer-tab-to-window', (event, { targetWindowId, tabData }) => {
  // 发送到目标窗口
  targetWindow.webContents.send('add-tab-from-drag', { tabData })

  // 通知源窗口移除Tab
  sourceWindow.webContents.send('remove-tab-from-drag', tabId)
})
```

**关键点**：

- 使用 `application/x-metadoc-tab` 自定义数据类型
- 主进程作为中转，确保窗口间通信可靠
- 源窗口和目标窗口分别处理添加/移除

---

### 4. 单Tab窗口自动合并

#### 4.1 触发条件

- 源窗口只有1个Tab
- 拖拽到其他窗口的Tab区域
- Tab允许拖拽到其他窗口（非系统Tab）

#### 4.2 处理流程

```typescript
// 目标窗口检测到单Tab窗口拖拽
if (sourceTabCount === 1 && isOverTabs) {
  // 延迟50ms触发合并（避免误触发）
  setTimeout(() => {
    // 直接合并，不创建新窗口
    ipcRenderer.send('transfer-tab-to-window', {
      targetWindowId: currentWindowId,
      tabData: tabTransferData,
      insertIndex: allTabs.value.length
    })
  }, 50)
}
```

**优势**：

- 避免创建只有1个Tab的窗口
- 自动合并到目标窗口，用户体验更好

---

### 5. Tab数据序列化

#### 5.1 序列化内容

```typescript
function serializeTabData(tabId: string) {
  const tab = workspace.tabs.find(t => t.id === tabId)

  return {
    tab: {
      id: tab.id,
      kind: tab.kind,           // 'file' | 'new' | 'tool' | 'system'
      title: tab.title,
      subtitle: tab.subtitle,
      path: tab.path,
      format: tab.format,
      dirty: tab.dirty,
      readonly: tab.readonly,
      toolType: tab.toolType,
      route: tab.route
    },
    // 文档内容（如果是文档Tab）
    document: {
      id: doc.id,
      markdown: doc.markdown,
      tex: doc.tex,
      outline: doc.outline,
      meta: doc.meta,
      aiDialogs: doc.aiDialogs,
      agentSessions: doc.agentSessions,
      lastView: doc.lastView,
      dirty: doc.dirty,
      // ... 保存状态
    },
    // 工具Tab状态
    toolState: { ... }
  }
}
```

#### 5.2 反序列化（接收Tab）

```typescript
async function addTabFromDrag(tabTransferData, insertIndex) {
  const { tab, document } = tabTransferData

  // 1. 检查是否已存在（避免重复）
  if (workspace.tabs.find((t) => t.id === tab.id)) {
    workspace.activateTab(tab.id)
    return
  }

  // 2. 移除空白新文档Tab（如果是拖出创建的新窗口）
  const emptyNewTabs = workspace.tabs.filter((t) => t.kind === 'new' && !t.path && !t.dirty)
  emptyNewTabs.forEach((t) => workspace.removeTab(t.id))

  // 3. 添加Tab
  workspace.tabs.splice(insertIndex, 0, tab)

  // 4. 恢复文档内容
  if (document) {
    const doc = workspace.ensureDocument(tab.id)
    doc.markdown = document.markdown
    doc.tex = document.tex
    doc.dirty = document.dirty
    // ... 恢复所有状态
  }

  // 5. 激活Tab
  workspace.activateTab(tab.id)
}
```

**关键点**：

- 完整保存文档状态（包括未保存内容）
- 保持dirty状态，确保用户知道文档未保存
- 恢复所有元数据（outline、meta、aiDialogs等）

---

## IPC通信协议

### 6. 主进程 ↔ 渲染进程通信

#### 6.1 窗口创建

**渲染进程 → 主进程**：

```typescript
ipcRenderer.invoke('create-window-with-tab', {
  tabData: {...},
  position: { x: number, y: number }
})
```

**主进程响应**：

- 返回新窗口ID（number）
- 优先使用窗口池，池为空时创建新窗口

#### 6.2 Tab传递

**渲染进程 → 主进程**：

```typescript
ipcRenderer.send('transfer-tab-to-window', {
  targetWindowId: number,
  tabData: {...},
  insertIndex?: number
})
```

**主进程处理**：

1. 发送 `add-tab-from-drag` 到目标窗口
2. 发送 `remove-tab-from-drag` 到源窗口

#### 6.3 Tab添加/移除

**主进程 → 渲染进程**：

```typescript
// 添加Tab
webContents.send('add-tab-from-drag', {
  tabData: {...},
  insertIndex?: number
})

// 移除Tab
webContents.send('remove-tab-from-drag', tabId: string)
```

#### 6.4 窗口查询

**渲染进程 → 主进程**：

```typescript
// 获取所有窗口列表
ipcRenderer.invoke('get-all-windows')
// 返回: Array<{ id: number, title: string }>

// 检查文件是否在其他窗口打开
ipcRenderer.invoke('find-window-with-file', filePath: string)
// 返回: { windowId: number | null, tabId: string | null }

// 检查文件是否在当前窗口打开
webContents.send('check-file-exists-in-window', filePath: string)
// 响应: webContents.send('file-exists-in-window-response', { tabId: string | null })
```

---

## 特殊场景处理

### 7. 文件打开逻辑

#### 7.1 打开已打开的文件

**流程**：

```typescript
// 1. 检查当前窗口是否已打开
const existing = workspace.tabs.find((t) => t.path === filePath)
if (existing) {
  activateTab(existing.id)
  return
}

// 2. 检查其他窗口是否已打开
const result = await ipcRenderer.invoke('find-window-with-file', filePath)
if (result.windowId && result.tabId) {
  // 切换到该窗口并激活Tab
  // 主进程会处理窗口切换
  return
}

// 3. 在当前窗口打开
openDocument(filePath)
```

**防重复机制**：

- 使用 `openingFiles` Set 跟踪正在打开的文件
- 创建Tab前再次检查是否已打开（防止异步竞态）

#### 7.2 窗口关闭检查

**逻辑**：

```typescript
// 窗口关闭前检查Tab数量
ipcRenderer.invoke('check-window-can-close')
// 返回: { canClose: boolean, tabCount: number }

// 如果Tab数量 <= 1，允许关闭
// 如果Tab数量 > 1，需要用户确认
```

---

## 性能优化

### 8. 优化策略

#### 8.1 窗口池预加载

- **效果**：Tab拖出创建新窗口时瞬间显示（<100ms）
- **成本**：保持2个隐藏窗口的内存占用
- **权衡**：内存换速度，适合现代设备

#### 8.2 异步补充窗口

- **策略**：窗口从池中取出后异步补充，不阻塞主流程
- **时机**：窗口使用后立即触发，保持池中始终有可用窗口

#### 8.3 Tab数据序列化优化

- **策略**：只序列化必要数据，避免传输过大对象
- **注意**：确保包含所有状态信息（dirty、未保存内容等）

#### 8.4 防抖机制

- **窗口创建**：50ms延迟，避免频繁触发
- **单Tab合并**：50ms延迟，避免误触发

---

## 代码结构

### 9. 关键文件

#### 9.1 主进程

- **`window-pool.ts`**：窗口池管理
  - `initWindowPool()`：初始化窗口池
  - `acquirePoolWindow()`：从池中获取窗口
  - `createAndAddToPool()`：创建并添加到池中

- **`main-calls.ts`**：IPC处理器
  - `create-window-with-tab`：创建新窗口
  - `transfer-tab-to-window`：窗口间Tab传递
  - `check-window-can-close`：检查窗口关闭

- **`window-manager.ts`**：辅助窗口管理
  - `openAuxiliaryWindow()`：打开辅助窗口
  - `preloadAuxiliaryWindows()`：预加载辅助窗口

#### 9.2 渲染进程

- **`MainTabs.vue`**：Tab组件
  - `handleDragStart()`：开始拖拽
  - `handleGlobalDragOver()`：全局拖拽处理
  - `handleGlobalDrop()`：拖拽放下
  - `addTabFromDrag()`：接收Tab
  - `removeTabAfterDrag()`：移除Tab

- **`Main.vue`**：主视图
  - `handleWorkspaceOpenDocument()`：打开文档
  - 防重复打开机制

- **`workspace.ts`**：工作区状态管理
  - `addDocumentTab()`：添加文档Tab
  - `removeTab()`：移除Tab
  - `activateTab()`：激活Tab

---

## 测试场景

### 10. 测试用例

参考 **`docs/window-tabs/MULTI_WINDOW_TEST_CASES.md`**（与本文同目录下的 `MULTI_WINDOW_TEST_CASES.md`），包含：

- 文件打开场景（当前窗口/其他窗口）
- Tab拖拽场景（窗口内/窗口外/窗口间）
- 单Tab窗口合并场景
- 窗口关闭场景

---

## 注意事项

### 11. 开发注意点

1. **窗口池窗口状态**：
   - 窗口池中的窗口已加载但隐藏
   - 使用前需要设置位置和大小
   - 发送Tab数据后立即显示

2. **Tab数据完整性**：
   - 必须包含所有状态信息
   - 特别注意dirty状态和未保存内容
   - 工具Tab需要包含toolState

3. **窗口生命周期**：
   - 窗口关闭时清理Tab
   - 窗口销毁时停止文件监听
   - 最后一个窗口关闭时退出应用

4. **异步操作**：
   - Tab传递是异步的，需要等待完成
   - 窗口创建是异步的，需要处理错误
   - 文件检查是异步的，需要防竞态

5. **错误处理**：
   - 窗口不存在或已销毁
   - Tab数据无效
   - IPC通信失败

---

## 未来改进

### 12. 可能的优化方向

1. **窗口池大小可配置**：根据设备性能动态调整
2. **Tab拖拽预览**：显示拖拽预览效果
3. **窗口分组**：支持窗口分组管理
4. **Tab历史记录**：记录Tab在不同窗口间的移动历史
5. **性能监控**：监控窗口池使用率和创建速度

---

## 总结

MetaDoc 的多窗口标签页管理机制实现了类似 Chrome 的用户体验，通过窗口池优化实现了快速响应，通过完善的IPC通信确保了数据一致性。整个系统设计考虑了性能、用户体验和代码可维护性，是一个成熟的多窗口管理方案。
