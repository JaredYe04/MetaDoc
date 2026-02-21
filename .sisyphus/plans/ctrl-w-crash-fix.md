# MetaDoc Ctrl+W 闪退问题修复计划

## TL;DR

**问题**: 快速按两次 Ctrl+W 快捷键导致程序闪退

**根因**: 主进程防抖机制延迟过长（1000ms），快速连按时第二个事件在防抖重置前触发，导致两个并行的关闭流程竞态执行

**修复方案**: 
1. 主进程缩短防抖延迟至 300ms
2. 添加 `closingTabs` Set 跟踪正在关闭的 tabs
3. 渲染进程添加执行中标记防止并发
4. `removeTab` 添加原子性检查

**验证方式**: Playwright 自动化测试快速按键场景

**风险**: 极低 - 仅添加防护性检查，不改变正常关闭逻辑

---

## Context

### 原始问题报告
用户报告：快速按两次 Ctrl+W 会导致程序闪退

### 代码流程分析

**完整关闭流程**:

```
用户按 Ctrl+W
    ↓
主进程: attachShortcutHandler (index.ts:856)
    ↓ 发送 IPC 消息
渲染进程: event-bus.js (line 419)
    ↓ 触发事件
渲染进程: Main.vue handleCloseActiveTabRequest (line 788)
    ↓ 发送 IPC 请求
主进程: request-close-tab handler (index.ts:503)
    ↓ 显示系统对话框
主进程: close-tab-response
    ↓
渲染进程: removeTab (workspace.ts:447)
```

### 竞态条件根因

**关键问题代码** (src/main/index.ts:936-940):
```typescript
if (!isCycleShortcut) {
  isShortcutPressed = true
  setTimeout(() => {
    isShortcutPressed = false  // 1000ms 后才重置
  }, 1000)
}
```

**竞态场景**:
1. T=0ms: 用户第一次按 Ctrl+W
2. T=0ms: `isShortcutPressed = true`, 设置 1000ms 后重置
3. T=100ms: 用户第二次按 Ctrl+W (快速连按)
4. T=100ms: `isShortcutPressed` 仍为 `true`，但代码只检查一次
5. 实际上第二个事件仍然触发了关闭流程

**结果**: 两个关闭流程并行执行，导致:
- `removeTab` 尝试删除已删除的 tab
- 系统对话框被重复创建
- 状态不一致导致崩溃

---

## Work Objectives

### Core Objective
修复快速连按 Ctrl+W 导致的程序闪退问题，确保快捷键关闭操作的线程安全和状态一致性

### Concrete Deliverables
- 修改 `src/main/index.ts`: 添加关闭状态跟踪和优化防抖
- 修改 `src/renderer/src/views/Main.vue`: 添加执行中标记
- 修改 `src/renderer/src/stores/workspace.ts`: 添加原子性检查
- 创建 Playwright 测试验证修复效果

### Definition of Done
- [ ] 快速连按 Ctrl+W 5 次不闪退
- [ ] 正常关闭功能不受影响
- [ ] 压力测试通过 (100 次快速按键)
- [ ] 所有现有测试通过

### Must Have
- 修复竞态条件导致的闪退
- 保持正常关闭功能完整
- 代码变更最小化

### Must NOT Have (Guardrails)
- 不要改变关闭确认对话框的行为
- 不要影响其他快捷键功能
- 不要引入新的依赖

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (需创建 Playwright 测试)
- **Automated tests**: YES (Tests-after)
- **Framework**: Playwright

### Agent-Executed QA Scenarios

**Scenario 1: 快速连按 Ctrl+W 不闪退**
- Tool: Playwright
- Preconditions: 应用已启动，至少打开 3 个 tabs
- Steps:
  1. 启动应用: `npm run dev`
  2. 等待窗口加载完成 (timeout: 10s)
  3. 创建新文档 2 次 (Ctrl+N x2)
  4. 快速连按 Ctrl+W 5 次 (间隔 50ms)
  5. Assert: 应用进程仍在运行 (检查 PID)
  6. Assert: 所有 tabs 已关闭，只剩 1 个空白 tab
  7. Screenshot: `.sisyphus/evidence/ctrl-w-rapid-test.png`
- Expected: 无崩溃，正常关闭所有 tabs
- Evidence: 截图 + 进程状态

**Scenario 2: 正常关闭功能验证**
- Tool: Playwright
- Preconditions: 应用已启动，1 个有未保存内容的 tab
- Steps:
  1. 在编辑器输入内容
  2. 按 Ctrl+W
  3. Assert: 系统对话框出现 ("是否保存更改?")
  4. 点击 "取消"
  5. Assert: Tab 未关闭，内容保留
  6. 再次按 Ctrl+W
  7. 点击 "不保存"
  8. Assert: Tab 关闭
- Expected: 正常关闭流程完整可用
- Evidence: `.sisyphus/evidence/normal-close-test.png`

**Scenario 3: 边界条件 - 只剩 1 个 tab**
- Tool: Playwright
- Preconditions: 只剩 1 个空白 tab
- Steps:
  1. 快速连按 Ctrl+W 3 次
  2. Assert: 应用未崩溃
  3. Assert: 仍有 1 个空白 tab (不能关闭最后一个)
- Expected: 正确处理边界条件
- Evidence: `.sisyphus/evidence/boundary-test.png`

---

## Execution Strategy

### 修复任务分解

```
Wave 1 (可并行执行):
├── Task 1: 主进程防抖优化
└── Task 2: 主进程添加 closingTabs 跟踪

Wave 2 (依赖 Wave 1):
├── Task 3: 渲染进程添加执行中标记

Wave 3 (依赖 Wave 2):
├── Task 4: removeTab 原子性检查

Wave 4 (依赖 Wave 3):
└── Task 5: 创建 Playwright 测试

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → Task 5
```

---

## TODOs

- [ ] 1. 主进程防抖延迟优化

  **What to do**:
  - 修改 `src/main/index.ts` 第 939 行
  - 将防抖延迟从 1000ms 改为 300ms
  - 保留其他快捷键的防抖逻辑不变

  **Must NOT do**:
  - 不要修改循环切换快捷键 (Ctrl+Tab) 的逻辑
  - 不要影响其他快捷键功能

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Skills**: ["git-master"]
  - **Justification**: 简单参数修改，需要 git 追踪变更

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/main/index.ts:936-940` - 防抖逻辑

  **Acceptance Criteria**:
  - [ ] 防抖延迟改为 300ms
  - [ ] 代码注释说明为什么选择 300ms

  **Commit**: YES
  - Message: `fix(shortcut): reduce debounce delay from 1000ms to 300ms`
  - Files: `src/main/index.ts`

- [ ] 2. 主进程添加 closingTabs 状态跟踪

  **What to do**:
  - 在 `src/main/index.ts` 中添加 `closingTabs` Set
  - 在 `request-close-tab` handler 开始时检查 tab 是否已在关闭中
  - 关闭完成后从 Set 中移除
  - 添加超时清理机制 (10s)

  **Must NOT do**:
  - 不要阻塞正常的关闭流程
  - 不要影响其他 IPC 消息处理

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Skills**: ["git-master"]
  - **Justification**: 需要修改 IPC handler，使用 git 追踪

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/main/index.ts:503-569` - request-close-tab handler

  **Acceptance Criteria**:
  - [ ] `closingTabs` Set 正确定义 (line ~200)
  - [ ] Handler 开始时检查 tabId 是否在 Set 中
  - [ ] 关闭开始时添加到 Set
  - [ ] 关闭完成后从 Set 移除
  - [ ] 10s 超时自动清理

  **Agent-Executed QA**:
  Scenario: 防止重复关闭同一个 tab
    Tool: Bash (curl 替代 - 检查代码逻辑)
    Steps:
      1. 读取修改后的代码
      2. Assert: closingTabs Set 存在
      3. Assert: 有检查和添加逻辑
      4. Assert: 有清理逻辑

  **Commit**: YES
  - Message: `fix(main): add closingTabs tracking to prevent duplicate close`
  - Files: `src/main/index.ts`

- [ ] 3. 渲染进程添加执行中标记

  **What to do**:
  - 修改 `src/renderer/src/views/Main.vue`
  - 在 `handleCloseActiveTabRequest` 函数开始时检查执行标记
  - 如果已在执行中，直接返回
  - 使用 try-finally 确保标记正确清除

  **Must NOT do**:
  - 不要在 Vue 组件外部暴露这个标记
  - 不要影响其他关闭方式 (如点击 X 按钮)

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Skills**: ["git-master"]
  - **Justification**: Vue 组件修改，需要谨慎测试

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1, Task 2
  - **Blocks**: Task 4

  **References**:
  - `src/renderer/src/views/Main.vue:788-856` - handleCloseActiveTabRequest

  **Acceptance Criteria**:
  - [ ] 添加 `isClosingTab` ref 或变量
  - [ ] 函数开始时检查标记
  - [ ] try-finally 确保标记清除
  - [ ] 不影响其他关闭方式

  **Agent-Executed QA**:
  Scenario: 渲染进程层防护验证
    Tool: Playwright
    Preconditions: 应用已启动
    Steps:
      1. 快速发送 3 次 close-active-tab 事件
      2. Assert: 只有 1 次实际执行关闭逻辑
      3. Screenshot: 验证关闭状态

  **Commit**: YES
  - Message: `fix(renderer): prevent concurrent tab close in handleCloseActiveTabRequest`
  - Files: `src/renderer/src/views/Main.vue`

- [ ] 4. removeTab 原子性检查

  **What to do**:
  - 修改 `src/renderer/src/stores/workspace.ts`
  - 在 `removeTab` 函数开始时再次检查 tab 是否存在
  - 添加 early return 防止重复删除
  - 保留现有逻辑不变

  **Must NOT do**:
  - 不要修改 removeTab 的其他逻辑
  - 不要影响其他调用 removeTab 的代码

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Skills**: ["git-master"]
  - **Justification**: Store 修改，影响面广

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 3
  - **Blocks**: Task 5

  **References**:
  - `src/renderer/src/stores/workspace.ts:447-519` - removeTab function

  **Acceptance Criteria**:
  - [ ] 函数开始时检查 index !== -1
  - [ ] 如果 tab 已不存在，静默返回
  - [ ] 保留所有现有逻辑

  **Agent-Executed QA**:
  Scenario: 原子性删除验证
    Tool: Bash
    Steps:
      1. 调用 removeTab 两次 (相同 tabId)
      2. Assert: 第二次调用静默返回，无错误

  **Commit**: YES
  - Message: `fix(workspace): add atomic check in removeTab to prevent duplicate removal`
  - Files: `src/renderer/src/stores/workspace.ts`

- [ ] 5. 创建 Playwright 回归测试

  **What to do**:
  - 创建 `e2e/ctrl-w-crash.spec.ts`
  - 实现快速按键测试场景
  - 实现正常关闭功能验证
  - 实现边界条件测试
  - 添加测试到 CI (如果存在)

  **Must NOT do**:
  - 不要修改生产代码
  - 不要引入新的测试依赖

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
  - **Skills**: ["playwright", "git-master"]
  - **Justification**: 需要 Playwright 技能和测试设计经验

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 4
  - **Blocks**: None

  **References**:
  - 测试目录结构参考项目现有测试
  - Playwright 最佳实践

  **Acceptance Criteria**:
  - [ ] 快速按键测试通过
  - [ ] 正常关闭功能测试通过
  - [ ] 边界条件测试通过
  - [ ] 测试报告生成

  **Agent-Executed QA**:
  Scenario: 测试运行验证
    Tool: Bash
    Steps:
      1. 运行 `npx playwright test e2e/ctrl-w-crash.spec.ts`
      2. Assert: 所有测试通过
      3. 生成测试报告

  **Commit**: YES
  - Message: `test(e2e): add Playwright regression tests for Ctrl+W crash fix`
  - Files: `e2e/ctrl-w-crash.spec.ts`

---

## Risk Assessment & Mitigation

### Risk 1: 修复引入新的关闭问题
- **概率**: 低
- **影响**: 高
- **缓解措施**: 
  - 所有修改都是添加防护性检查
  - 不改变原有关闭逻辑
  - 完整的回归测试覆盖

### Risk 2: 防抖延迟影响用户体验
- **概率**: 低
- **影响**: 中
- **缓解措施**:
  - 300ms 是行业标准的防抖延迟
  - 用户感知不到 300ms 延迟
  - 保留循环切换快捷键的无防抖特性

### Risk 3: 状态标记未正确清理导致内存泄漏
- **概率**: 低
- **影响**: 中
- **缓解措施**:
  - 使用 try-finally 确保标记清除
  - 添加 10s 超时自动清理
  - 代码审查确保清理路径完整

### Risk 4: 测试覆盖不足
- **概率**: 中
- **影响**: 中
- **缓解措施**:
  - 多个测试场景覆盖
  - 包括边界条件和压力测试
  - 代码审查确保测试质量

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(shortcut): reduce debounce delay from 1000ms to 300ms` | `src/main/index.ts` | 代码审查 |
| 2 | `fix(main): add closingTabs tracking to prevent duplicate close` | `src/main/index.ts` | 代码审查 |
| 3 | `fix(renderer): prevent concurrent tab close in handleCloseActiveTabRequest` | `src/renderer/src/views/Main.vue` | 测试通过 |
| 4 | `fix(workspace): add atomic check in removeTab to prevent duplicate removal` | `src/renderer/src/stores/workspace.ts` | 测试通过 |
| 5 | `test(e2e): add Playwright regression tests for Ctrl+W crash fix` | `e2e/ctrl-w-crash.spec.ts` | 测试通过 |

---

## Success Criteria

### Verification Commands
```bash
# 运行 E2E 测试
npx playwright test e2e/ctrl-w-crash.spec.ts

# 手动测试快速按键
# 1. 启动应用: npm run dev
# 2. 打开 3 个 tabs
# 3. 快速连按 Ctrl+W 5 次
# 4. 验证应用未崩溃
```

### Final Checklist
- [ ] 快速连按 Ctrl+W 5 次不闪退
- [ ] 正常关闭功能不受影响
- [ ] 压力测试通过 (100 次快速按键)
- [ ] 所有现有测试通过
- [ ] 代码审查完成
- [ ] 文档更新 (CHANGELOG)

---

## 代码修改建议

### 修改 1: 主进程防抖延迟 (src/main/index.ts)

```typescript
// 第 939 行附近
if (!isCycleShortcut) {
  isShortcutPressed = true
  setTimeout(() => {
    isShortcutPressed = false
  }, 300) // 从 1000ms 改为 300ms
}
```

### 修改 2: 主进程 closingTabs 跟踪 (src/main/index.ts)

```typescript
// 在文件顶部添加 (line ~200)
const closingTabs = new Set<string>()

// 修改 request-close-tab handler (line 503)
ipcBridge.registerOn('request-close-tab', async (event, tabId: string) => {
  // 防止重复关闭
  if (closingTabs.has(tabId)) {
    return
  }
  
  if (!mainWindow || mainWindow.isDestroyed()) return
  
  closingTabs.add(tabId)
  
  // 10s 后自动清理
  const cleanupTimeout = setTimeout(() => {
    closingTabs.delete(tabId)
  }, 10000)
  
  try {
    // 原有逻辑...
  } finally {
    clearTimeout(cleanupTimeout)
    closingTabs.delete(tabId)
  }
})
```

### 修改 3: 渲染进程执行中标记 (src/renderer/src/views/Main.vue)

```typescript
// 在 setup 中添加
const isClosingTab = ref(false)

// 修改 handleCloseActiveTabRequest
const handleCloseActiveTabRequest = async () => {
  if (isClosingTab.value) return
  if (workspace.uiLocked?.value === true) return
  
  const tabId = activeTabId.value
  if (!tabId) return
  
  isClosingTab.value = true
  
  try {
    // 原有逻辑...
  } finally {
    isClosingTab.value = false
  }
}
```

### 修改 4: removeTab 原子性检查 (src/renderer/src/stores/workspace.ts)

```typescript
function removeTab(id: string): void {
  const index = tabs.findIndex((tab) => tab.id === id)
  if (index === -1) return // Tab 已不存在，静默返回
  
  const tab = tabs[index]
  
  // 检查是否可以删除
  if (!canRemoveTab(id)) {
    return
  }
  
  // 原有逻辑...
}
```

---

## 测试验证清单

### 功能测试
- [ ] 快速连按 Ctrl+W 5 次 - 应用不闪退
- [ ] 正常关闭单个 tab - 功能正常
- [ ] 关闭有未保存内容的 tab - 对话框正确显示
- [ ] 取消关闭 - Tab 保持打开
- [ ] 只剩 1 个 tab 时按 Ctrl+W - 应用不崩溃

### 压力测试
- [ ] 100 次快速按键 - 无崩溃
- [ ] 10 个 tabs 同时关闭 - 无崩溃

### 回归测试
- [ ] 其他快捷键功能正常 (Ctrl+S, Ctrl+O, Ctrl+Tab 等)
- [ ] 鼠标点击关闭 tab 正常
- [ ] 右键菜单关闭 tab 正常

---

## 附录: 相关代码引用

### 快捷键处理
- File: `src/main/index.ts`
- Lines: 847-940
- Function: `attachShortcutHandler`

### Tab 关闭请求处理
- File: `src/main/index.ts`
- Lines: 503-569
- Handler: `request-close-tab`

### 渲染进程关闭处理
- File: `src/renderer/src/views/Main.vue`
- Lines: 788-856
- Function: `handleCloseActiveTabRequest`

### Tab 移除
- File: `src/renderer/src/stores/workspace.ts`
- Lines: 447-519
- Function: `removeTab`

### 事件总线
- File: `src/renderer/src/utils/event-bus.js`
- Lines: 419-420
- Event: `close-tab-triggered`
