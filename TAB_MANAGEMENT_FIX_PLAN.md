# 标签页管理问题修复计划

## 问题摘要

### 问题1：拖拽分割合并后只剩1个标签页
**复现步骤：**
1. 打开2个新标签页
2. 拖拽其中一个到新窗口（分割）
3. 拖拽回源窗口（合并）
4. 结果只剩1个标签页

### 问题2：拖拽文件标签页到新窗口多出一个额外标签页
**复现步骤：**
1. 打开一个文件标签页
2. 拖拽到新窗口
3. 结果出现2个标签页（文件标签页 + 额外标签页）

---

## 根因分析

### 关键代码路径

1. **拖拽开始** (`useTabDrag.ts:377-446`)
   - 序列化标签页数据（包含 `sourceTabCount`）
   - 创建主进程拖拽会话

2. **拖拽结束处理** (`drag-manager.ts:135-328`)
   - 判断是否跨窗口转移
   - 判断是否分离到新窗口
   - 发送 `add-tab-from-drag` 和 `remove-tab-from-drag` 事件

3. **添加标签页** (`MainTabs.vue:928-1052`)
   - 检查重复（ID、文件路径）
   - 移除占位标签页 (`_isInitialPlaceholder`)
   - 添加新标签页

4. **移除标签页** (`MainTabs.vue:1055-1091`)
   - 从工作区移除标签页
   - 检查窗口是否可以关闭

### 问题1根因

在 `addTabFromDrag` 函数中，检查重复标签页的逻辑（第937-958行）**在移除占位标签页之前执行**：

```javascript
// 检查Tab是否已存在（避免重复添加）
const existingTab = workspace.tabs.find((t) => t.id === tab.id)
if (existingTab) {
  workspace.activateTab(tab.id)
  return  // 提前返回，占位标签页未被移除！
}
```

当拖拽回源窗口时，如果标签页ID相同（理论上不应发生，但在快速操作时可能出现），或者文件路径检查触发，会提前返回，导致：
- 源窗口的标签页未被正确移除
- 目标窗口添加了重复标签页
- 后续清理逻辑混乱

### 问题2根因

1. **时序问题**：`ensureInitialTab()` 在模块加载时（第175行）就创建了占位标签页
2. **窗口池中的窗口**已经预加载并创建了占位标签页
3. 当拖拽文件到新窗口时，`addTabFromDrag` 中的重复检查（第946-958行）可能因文件路径已存在而提前返回
4. 这导致：
   - 新标签页未被添加
   - 占位标签页未被移除
   - 或者两者都保留

---

## 修复计划

### 阶段1：修复占位标签页处理逻辑（高优先级）

#### 步骤1.1：修改 `addTabFromDrag` 函数执行顺序
**文件**: `src/renderer/src/components/MainTabs.vue` (第928-1052行)

**修改内容**:
```javascript
const addTabFromDrag = async (tabTransferData: any, insertIndex?: number) => {
  try {
    const { tab, document } = tabTransferData

    if (!tab) {
      logger.error('Tab数据无效:', tabTransferData)
      return
    }

    // 步骤1：首先处理占位标签页（移到最后面统一处理）
    const placeholders = workspace.tabs.filter((t) => t._isInitialPlaceholder)
    
    // 步骤2：检查Tab是否已存在
    const existingTab = workspace.tabs.find((t) => t.id === tab.id)
    if (existingTab && !existingTab._isInitialPlaceholder) {
      logger.warn('Tab已存在，直接激活:', tab.id)
      // 移除占位标签页
      placeholders.forEach((t) => workspace.removeTab(t.id))
      workspace.activateTab(tab.id)
      return
    }

    // 步骤3：检查文件是否已在当前窗口打开（排除占位标签页）
    if (tab.path && (tab.kind === 'file' || tab.kind === 'new')) {
      const existingFileTab = workspace.tabs.find(
        (t) => t.path === tab.path && !t._isInitialPlaceholder
      )
      if (existingFileTab) {
        placeholders.forEach((t) => workspace.removeTab(t.id))
        workspace.activateTab(existingFileTab.id)
        // 转移文件所有权...
        return
      }
    }

    // 步骤4：工具/系统 Tab 重复检查
    if (tab.kind === 'tool' && tab.toolType) {
      const sameTool = workspace.tabs.find(
        (t) => t.kind === 'tool' && t.toolType === tab.toolType && !t._isInitialPlaceholder
      )
      if (sameTool) {
        placeholders.forEach((t) => workspace.removeTab(t.id))
        workspace.activateTab(sameTool.id)
        return
      }
    }

    // 步骤5：正式添加前移除所有占位标签页
    placeholders.forEach((t) => workspace.removeTab(t.id))

    // 步骤6：添加Tab
    // ... 原有逻辑
  }
}
```

**成功标准**:
- [ ] 拖拽文件到新窗口只显示1个标签页
- [ ] 拖拽分割合并后标签页数量正确
- [ ] 占位标签页总是被正确清理

**验证方法**:
```bash
# 手动测试
1. 启动应用，创建新标签页
2. 拖拽到新窗口 → 应只有1个标签页
3. 拖拽回原窗口 → 应恢复2个标签页
```

---

### 阶段2：修复拖拽会话状态管理（高优先级）

#### 步骤2.1：增强拖拽会话可靠性
**文件**: `src/main/drag-manager.ts` (第85-132行)

**修改内容**:
```typescript
// 在 drag:drop 处理中添加确认机制
ipcBridge.registerHandle(
  'drag:drop',
  async (
    _event: IpcMainInvokeEvent,
    payload: { sessionId: string; targetWindowId: number; insertIndex?: number }
  ): Promise<{ success: boolean; error?: string }> => {
    if (!activeSession || activeSession.sessionId !== payload.sessionId) {
      logger.warn('drop 收到无效会话:', payload.sessionId)
      return { success: false, error: '无效会话' }
    }

    if (activeSession.consumed) {
      logger.warn('拖拽会话已被消费:', payload.sessionId)
      return { success: false, error: '会话已被消费' }
    }

    activeSession.consumed = true
    const { tabData, sourceWindowId } = activeSession

    // 跨窗口转移
    if (payload.targetWindowId !== sourceWindowId) {
      const targetWindow = getWindowById(payload.targetWindowId)
      const sourceWindow = getWindowById(sourceWindowId)
      
      if (!targetWindow || targetWindow.isDestroyed()) {
        activeSession.consumed = false // 允许重试
        return { success: false, error: '目标窗口不存在' }
      }

      // 发送添加请求并等待确认
      targetWindow.webContents.send('add-tab-from-drag', {
        tabData,
        insertIndex: payload.insertIndex ?? -1
      })

      // 添加超时机制
      const timeout = setTimeout(() => {
        logger.warn('Tab添加确认超时:', activeSession?.tabId)
        activeSession = null
      }, 5000)

      // 监听确认响应（需要添加新的 IPC 通道）
      const confirmHandler = (_event: IpcMainEvent, result: { success: boolean }) => {
        clearTimeout(timeout)
        if (result.success && sourceWindow && !sourceWindow.isDestroyed()) {
          sourceWindow.webContents.send('remove-tab-from-drag', activeSession?.tabId)
        }
        activeSession = null
      }
      
      ipcBridge.registerOnce('add-tab-confirmed', confirmHandler)
    }

    return { success: true }
  }
)
```

**成功标准**:
- [ ] 跨窗口拖拽有确认机制
- [ ] 失败时可以重试
- [ ] 超时不阻塞系统

---

### 阶段3：修复窗口池初始化逻辑（中优先级）

#### 步骤3.1：修改窗口池URL参数
**文件**: `src/main/window-pool.ts` (第18-25行)

**修改内容**:
```typescript
function getPoolUrl(): string {
  // 添加 pooled=1 参数，让渲染进程知道这是池窗口
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return process.env['ELECTRON_RENDERER_URL'] + '/#/home?windowType=home&skipAutoHome=1&pooled=1'
  }
  const indexPath = join(__dirname, '../renderer/index.html')
  const fileURL = pathToFileURL(indexPath).toString()
  return `${fileURL}#/home?windowType=home&skipAutoHome=1&pooled=1`
}
```

#### 步骤3.2：修改 `ensureInitialTab` 逻辑
**文件**: `src/renderer/src/stores/workspace.ts` (第330-338行)

**修改内容**:
```typescript
function ensureInitialTab(isPooledWindow = false): void {
  // 池窗口不自动创建占位标签页
  if (isPooledWindow) {
    return
  }
  
  if (tabs.length === 0) {
    const tab = createNewDocumentTabInternal()
    tab._isInitialPlaceholder = true
    activeTabId.value = tab.id
  } else if (!activeTabId.value) {
    activeTabId.value = tabs[0].id
  }
}
```

**成功标准**:
- [ ] 池窗口不创建占位标签页
- [ ] 首次启动无标签页时自动创建默认标签页
- [ ] 拖拽到池窗口时只显示拖入的标签页

---

### 阶段4：修复标签页计数逻辑（中优先级）

#### 步骤4.1：修改 `sourceTabCount` 计算
**文件**: `src/renderer/src/composables/useTabDrag.ts` (第279-345行)

**修改内容**:
```typescript
export const serializeTabData = (tabId: string): SerializedTabData | null => {
  const workspace = useWorkspace()
  const tab = workspace.tabs.find((t) => t.id === tabId)
  if (!tab) return null

  // 计算实际标签页数（排除占位标签页）
  const realTabCount = workspace.tabs.filter((t) => !t._isInitialPlaceholder).length

  const baseData: SerializedTabData = {
    // ... 其他字段
    sourceTabCount: realTabCount,  // 使用实际计数
    // ...
  }
  // ...
}
```

#### 步骤4.2：修改拖拽结束时的检查
**文件**: `src/main/drag-manager.ts` (第214-222行, 282-283行)

**修改内容**:
```typescript
// 场景2：鼠标在源窗口外 → 分离到新窗口
if (isOutside) {
  // 使用实际标签页数判断
  const sourceTabCount = session.tabData?.sourceTabCount ?? 1
  
  // 只有当实际标签页数 > 1 时才允许分离
  if (sourceTabCount <= 1) {
    broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
    logger.debug('单Tab窗口不允许分离')
    return { action: 'none' }
  }
  // ...
}
```

**成功标准**:
- [ ] 标签页计数准确（排除占位标签页）
- [ ] 单标签页窗口不允许分离
- [ ] 分离操作不影响其他标签页

---

### 阶段5：代码重构建议（低优先级）

#### 建议5.1：提取 Tab 管理常量
**新文件**: `src/renderer/src/constants/tab.ts`

```typescript
export const TAB_CONSTANTS = {
  // 占位标签页标记
  PLACEHOLDER_MARKER: '_isInitialPlaceholder',
  
  // 拖拽 MIME 类型
  DRAG_MIME_TYPE: 'application/x-metadoc-tab',
  
  // 超时配置
  TIMEOUTS: {
    DRAG_SESSION: 30000,      // 拖拽会话超时
    TAB_ADD_CONFIRM: 5000,    // 标签页添加确认超时
    WINDOW_READY: 5000,       // 窗口就绪超时
  },
  
  // 窗口池配置
  WINDOW_POOL: {
    SIZE: 2,
    DEFAULT_WIDTH: 1366,
    DEFAULT_HEIGHT: 768,
  }
}
```

#### 建议5.2：创建 TabStateValidator 类
**新文件**: `src/renderer/src/utils/tab-state-validator.ts`

```typescript
export class TabStateValidator {
  static isPlaceholder(tab: WorkspaceTab): boolean {
    return tab._isInitialPlaceholder === true
  }
  
  static isRealTab(tab: WorkspaceTab): boolean {
    return !this.isPlaceholder(tab)
  }
  
  static countRealTabs(tabs: WorkspaceTab[]): number {
    return tabs.filter(this.isRealTab).length
  }
  
  static hasTabWithId(tabs: WorkspaceTab[], tabId: string): boolean {
    return tabs.some((t) => t.id === tabId && this.isRealTab(t))
  }
  
  static hasTabWithPath(tabs: WorkspaceTab[], path: string): WorkspaceTab | undefined {
    return tabs.find((t) => t.path === path && this.isRealTab(t))
  }
}
```

#### 建议5.3：添加 Tab 操作日志
**文件**: `src/renderer/src/stores/workspace.ts`

在关键操作处添加结构化日志：
```typescript
function logTabOperation(
  operation: 'add' | 'remove' | 'move' | 'activate',
  tabId: string,
  details: Record<string, any>
) {
  logger.debug(`[Tab操作] ${operation}`, { tabId, ...details })
}
```

---

## 执行顺序和依赖关系

```
阶段1 (高优先级)
├── 步骤1.1: 修改 addTabFromDrag 执行顺序
│   └── 依赖: 无
│   └── 影响: 修复问题1和问题2

阶段2 (高优先级)
├── 步骤2.1: 增强拖拽会话可靠性
│   └── 依赖: 步骤1.1
│   └── 影响: 提高跨窗口拖拽稳定性

阶段3 (中优先级)
├── 步骤3.1: 修改窗口池URL参数
│   └── 依赖: 无
├── 步骤3.2: 修改 ensureInitialTab 逻辑
│   └── 依赖: 步骤3.1
│   └── 影响: 修复池窗口占位标签页问题

阶段4 (中优先级)
├── 步骤4.1: 修改 sourceTabCount 计算
│   └── 依赖: 步骤3.2
├── 步骤4.2: 修改拖拽结束检查
│   └── 依赖: 步骤4.1
│   └── 影响: 修复标签页计数问题

阶段5 (低优先级)
├── 建议5.1: 提取常量
├── 建议5.2: 创建验证器类
├── 建议5.3: 添加操作日志
│   └── 依赖: 无
│   └── 影响: 代码质量改进
```

---

## 测试策略

### 单元测试
```typescript
// tests/unit/tab-management.test.ts
describe('Tab Management', () => {
  test('should remove placeholder when adding real tab', () => {
    // ...
  })
  
  test('should not allow drag when only one real tab', () => {
    // ...
  })
  
  test('should activate existing tab instead of duplicate', () => {
    // ...
  })
})
```

### 集成测试
```typescript
// tests/integration/drag-drop.test.ts
describe('Cross-Window Drag and Drop', () => {
  test('drag tab to new window should create exactly one tab', async () => {
    // ...
  })
  
  test('drag tab back should restore original state', async () => {
    // ...
  })
})
```

### 手动测试清单
- [ ] 打开2个标签页，拖拽分割再合并，验证标签页数量
- [ ] 打开文件标签页，拖拽到新窗口，验证只有1个标签页
- [ ] 打开多个不同类型标签页（文件、工具、系统），验证拖拽行为
- [ ] 快速连续拖拽操作，验证系统稳定性
- [ ] 关闭所有标签页，验证自动创建默认标签页
- [ ] 从窗口池创建窗口，验证无占位标签页

---

## 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 修复引入新的竞态条件 | 中 | 高 | 添加充分测试，分阶段发布 |
| 向后兼容性问题 | 低 | 中 | 保持现有API不变，内部实现修改 |
| 性能下降 | 低 | 低 | 新逻辑主要是过滤操作，影响小 |
| 用户习惯改变 | 低 | 低 | 修复的是bug行为，符合用户期望 |

---

## 回滚计划

1. **代码回滚**: 所有修改都有独立的 Git 提交，可单独回滚
2. **功能开关**: 关键修复可通过功能标志控制
3. **热修复**: 如发现问题，可在24小时内发布修复版本

---

## 成功指标

1. **问题1修复验证**:
   - 拖拽分割合并后标签页数量 = 原始数量
   - 连续操作10次无异常

2. **问题2修复验证**:
   - 拖拽文件到新窗口后标签页数量 = 1
   - 占位标签页不出现

3. **系统稳定性**:
   - 跨窗口拖拽成功率 > 99%
   - 无标签页丢失或重复
   - 内存无泄漏

---

**计划制定**: 2026-02-21  
**预计实施时间**: 2-3天  
**预计测试时间**: 1-2天  
**总工期**: 3-5天
