# MetaDoc 标签页管理后续工作计划

## TL;DR

> **目标**: 验证并完善 MetaDoc 多窗口标签页管理功能
>
> **核心交付物**:
> - 详细测试清单（覆盖所有修复点）
> - 文件标签页重复策略决策矩阵
> - 后续优化路线图（优先级排序）
> - 风险评估和缓解方案
>
> **当前状态**: 主要 Bug 已修复，需验证修复有效性并制定长期优化计划

---

## 背景与上下文

### 已完成的工作
1. ✅ **IPC 处理器修复**: `drag:can-accept-tab` 和 `drag:add-tab-to-window` 实现两阶段提交
2. ✅ **新建文档标签页重复**: 允许新建文档标签页重复（跳过 ID 重复检查）
3. ✅ **文件标签页合并**: 修复了未保存内容丢失问题
4. ✅ **全局标签页注册表**: `GlobalTabRegistry` 实现跨窗口标签页状态管理

### 仍需验证的问题
1. 🔍 **标签页丢失问题**: 两个 "new" 标签页合并后只剩一个
2. 🔍 **多余标签页问题**: 拖拽到新窗口时多出一个占位标签页
3. ❓ **文件标签页重复策略**: 需决策是否激活已有窗口而非创建新标签页

---

## 测试清单

### 测试环境准备

**前置条件**:
- [ ] 构建最新版本: `npm run build`
- [ ] 清理用户数据目录（可选，避免配置干扰）
- [ ] 准备测试文件: `test1.md`, `test2.md`, `test3.md`

**测试设备**:
- [ ] Windows 10/11
- [ ] macOS (Intel/Apple Silicon)
- [ ] Linux (Ubuntu/Fedora)

---

### Wave 1: 基础功能测试（必须全部通过）

#### Test 1.1: 新建文档标签页重复
**测试目的**: 验证允许新建文档标签页重复

**测试步骤**:
1. 启动 MetaDoc
2. 按 `Ctrl+N` 创建新文档标签页（记为 "new-1"）
3. 再次按 `Ctrl+N` 创建另一个新文档标签页（记为 "new-2"）
4. 观察标签栏

**预期结果**:
- [ ] 两个标签页同时存在
- [ ] 标签栏显示两个 "未命名文档" 标签
- [ ] 没有标签页被自动合并

**验证命令**:
```javascript
// DevTools Console
workspace.tabs.filter(t => t.kind === 'new').length === 2
```

**优先级**: 🔴 Critical

---

#### Test 1.2: 新建文档标签页合并测试
**测试目的**: 验证两个 "new" 标签页不会被意外合并

**测试步骤**:
1. 创建两个新文档标签页（new-1, new-2）
2. 在 new-1 中输入一些内容（但不保存）
3. 将 new-2 拖拽到新窗口
4. 观察原窗口

**预期结果**:
- [ ] new-1 仍然保留在原窗口
- [ ] new-2 成功移动到新建窗口
- [ ] 两个窗口各有一个标签页

**优先级**: 🔴 Critical

---

#### Test 1.3: 占位标签页自动移除
**测试目的**: 验证空标签页在拖入新 Tab 后自动移除

**测试步骤**:
1. 关闭所有标签页，确保显示一个空的 "未命名文档" 标签页
2. 打开一个已有文件 `test1.md`
3. 观察标签栏

**预期结果**:
- [ ] 空的 "未命名文档" 标签页自动关闭
- [ ] 只剩 `test1.md` 标签页

**优先级**: 🟡 Medium

---

### Wave 2: 跨窗口拖拽测试

#### Test 2.1: 跨窗口拖拽基础功能
**测试目的**: 验证 Tab 可以正常拖拽到另一个窗口

**测试步骤**:
1. 打开 `test1.md`
2. 右键标签页 → "移动到新窗口"
3. 等待新窗口创建
4. 在原窗口打开 `test2.md`
5. 将 `test2.md` 拖拽到新窗口的标签栏

**预期结果**:
- [ ] 拖拽过程中显示拖拽预览
- [ ] `test2.md` 成功添加到新窗口
- [ ] 原窗口只剩 `test1.md`
- [ ] 新窗口有 `test2.md`

**优先级**: 🔴 Critical

---

#### Test 2.2: 拖拽到新窗口（窗口池）
**测试目的**: 验证使用窗口池时没有多余占位标签页

**测试步骤**:
1. 打开 `test1.md` 和 `test2.md`
2. 将 `test2.md` 拖出当前窗口（拖到桌面空白处）
3. 观察新创建的窗口

**预期结果**:
- [ ] 新窗口立即显示 `test2.md` 内容
- [ ] 新窗口**没有**额外的 "未命名文档" 标签页
- [ ] 窗口位置大致在拖拽释放位置

**验证方法**:
- 检查标签栏是否只有一个标签
- DevTools: `workspace.tabs.length === 1`

**优先级**: 🔴 Critical

---

#### Test 2.3: 多 Tab 拖拽限制
**测试目的**: 验证单 Tab 窗口不允许分离

**测试步骤**:
1. 确保只有一个标签页 `test1.md`
2. 尝试将该标签页拖出窗口

**预期结果**:
- [ ] 拖拽操作被拒绝
- [ ] 标签页保持在原窗口
- [ ] 控制台显示警告日志

**优先级**: 🟡 Medium

---

### Wave 3: 文件标签页重复策略测试

#### Test 3.1: 相同文件重复打开（当前行为）
**测试目的**: 记录当前文件重复策略的行为

**测试步骤**:
1. 打开 `test1.md`
2. 在文件资源管理器中双击 `test1.md`
3. 观察标签栏

**当前预期结果**:
- [ ] 创建第二个 `test1.md` 标签页
- [ ] 两个标签页可以独立编辑
- [ ] 标题显示重复标记（如果有）

**优先级**: 🟡 Medium

---

#### Test 3.2: 未保存内容合并
**测试目的**: 验证未保存内容在合并时不会丢失

**测试步骤**:
1. 打开 `test1.md`
2. 修改内容（不保存）
3. 尝试再次打开 `test1.md`
4. 观察提示对话框

**预期结果**:
- [ ] 显示合并提示对话框
- [ ] 可以选择保留未保存内容
- [ ] 选择合并后内容不丢失

**优先级**: 🔴 Critical

---

### Wave 4: 边界条件测试

#### Test 4.1: 快速创建多个新文档
**测试目的**: 验证系统能处理快速连续操作

**测试步骤**:
1. 快速按 5 次 `Ctrl+N`

**预期结果**:
- [ ] 创建 5 个新文档标签页
- [ ] 系统响应正常，无卡顿
- [ ] 所有标签页可正常编辑

**优先级**: 🟢 Low

---

#### Test 4.2: 窗口关闭后状态恢复
**测试目的**: 验证窗口关闭后标签页状态正确

**测试步骤**:
1. 创建两个窗口，每个窗口多个标签
2. 关闭其中一个窗口
3. 检查 `GlobalTabRegistry` 状态

**预期结果**:
- [ ] 关闭窗口的标签页从注册表移除
- [ ] 剩余窗口标签页不受影响
- [ ] 控制台显示清理日志

**验证方法**:
```javascript
// DevTools in remaining window
await ipcRenderer.invoke('debug:get-tab-registry-stats')
```

**优先级**: 🟡 Medium

---

#### Test 4.3: 拖拽过程中源窗口关闭
**测试目的**: 验证异常场景下的稳定性

**测试步骤**:
1. 开始拖拽一个标签页
2. 在拖拽过程中关闭源窗口（Alt+F4）
3. 完成拖拽到目标窗口

**预期结果**:
- [ ] 拖拽会话正确取消
- [ ] 目标窗口不受影响
- [ ] 无崩溃或异常行为

**优先级**: 🟢 Low

---

### Wave 5: 性能测试

#### Test 5.1: 大量标签页性能
**测试目的**: 验证系统能处理大量标签页

**测试步骤**:
1. 创建 20+ 个标签页（混合新文档和文件）
2. 切换标签页
3. 拖拽操作

**预期结果**:
- [ ] 标签切换响应时间 < 500ms
- [ ] 拖拽操作流畅
- [ ] 内存占用合理

**优先级**: 🟢 Low

---

#### Test 5.2: 内存泄漏检查
**测试目的**: 验证标签页关闭后内存正确释放

**测试步骤**:
1. 记录初始内存占用（DevTools Memory 面板）
2. 创建并关闭 10 个新文档标签页
3. 强制 GC: `global.gc()`（如果可用）
4. 再次记录内存占用

**预期结果**:
- [ ] 内存占用回到接近初始值
- [ ] 无持续增长趋势

**优先级**: 🟢 Low

---

## 决策矩阵：文件标签页重复策略

### 可选策略对比

| 策略 | 用户体验 | 实现复杂度 | 数据一致性 | 适用场景 |
|------|----------|------------|------------|----------|
| **A: 激活已有窗口** | ⭐⭐⭐ 优秀 | ⭐⭐ 中等 | ⭐⭐⭐ 高 | VSCode 用户 |
| **B: 允许重复** | ⭐⭐ 良好 | ⭐ 简单 | ⭐⭐ 中等 | 多视图编辑 |
| **C: 提示选择** | ⭐⭐ 良好 | ⭐⭐⭐ 复杂 | ⭐⭐⭐ 高 | 通用方案 |
| **D: 用户可配置** | ⭐⭐⭐ 优秀 | ⭐⭐⭐ 复杂 | ⭐⭐ 中等 | 高级用户 |

### 策略详细分析

#### 策略 A: 激活已有窗口（VSCode 风格）

**行为描述**:
- 打开已存在的文件时，激活已有标签页
- 不创建新标签页
- 可配合 "Duplicate" 命令创建副本

**优点**:
- ✅ 避免数据不一致（多个标签页编辑同一文件）
- ✅ 用户预期明确（主流编辑器惯例）
- ✅ 节省内存

**缺点**:
- ❌ 无法同时查看同一文件的不同部分
- ❌ 需要额外命令才能创建副本

**实现要点**:
```typescript
// 在 openFile 时检查
const existing = globalTabRegistry.isFileOpen(filePath)
if (existing) {
  // 激活已有窗口和标签
  activateWindow(existing.windowId)
  setActiveTab(existing.tabId)
  return
}
```

**适用性**: ⭐⭐⭐⭐⭐ **强烈推荐**

---

#### 策略 B: 允许重复（当前行为）

**行为描述**:
- 每次打开都创建新标签页
- 保存时合并内容或提示冲突

**优点**:
- ✅ 实现简单
- ✅ 可同时编辑同一文件的不同部分

**缺点**:
- ❌ 容易导致数据冲突
- ❌ 用户可能困惑（哪个是最新？）
- ❌ 内存占用增加

**适用性**: ⭐⭐ **不推荐作为默认策略**

---

#### 策略 C: 提示选择

**行为描述**:
- 打开已存在文件时显示对话框
- 选项: "激活已有" / "创建副本" / "取消"

**优点**:
- ✅ 用户控制力强
- ✅ 避免意外行为

**缺点**:
- ❌ 增加操作步骤
- ❌ 对话框疲劳

**适用性**: ⭐⭐⭐ **可作为备选**

---

#### 策略 D: 用户可配置

**行为描述**:
- 设置中添加选项: "打开已存在文件时的行为"
- 选项: "激活已有" / "创建副本" / "提示选择"

**优点**:
- ✅ 满足不同用户需求
- ✅ 灵活性强

**缺点**:
- ❌ 实现复杂
- ❌ 增加配置负担

**实现建议**:
```typescript
// settings.ts
interface TabManagementSettings {
  duplicateFileBehavior: 'activate' | 'duplicate' | 'prompt'
  maxNewDocTabs: number
  autoCleanupPlaceholder: boolean
}
```

**适用性**: ⭐⭐⭐⭐ **长期推荐**

---

### 推荐决策

**短期（当前迭代）**: 采用 **策略 A（激活已有窗口）**
- 改动范围小
- 符合用户预期
- 解决数据一致性问题

**长期（下个迭代）**: 实现 **策略 D（用户可配置）**
- 添加设置面板选项
- 默认仍为 "激活已有"
- 高级用户可选择其他行为

---

## 后续优化路线图

### Phase 1: 验证与修复（当前 - 1 周）

**目标**: 确保所有修复有效，无回归问题

| 任务 | 优先级 | 预估工时 | 负责人 |
|------|--------|----------|--------|
| 执行完整测试清单 | 🔴 Critical | 2d | QA |
| 修复测试中发现的问题 | 🔴 Critical | 3d | Dev |
| 代码审查 | 🟡 Medium | 1d | Tech Lead |
| 回归测试 | 🔴 Critical | 1d | QA |

**验收标准**:
- [ ] 所有 Critical 测试通过
- [ ] 无 P0/P1 Bug

---

### Phase 2: 策略优化（第 2-3 周）

**目标**: 实现文件标签页重复策略优化

| 任务 | 优先级 | 预估工时 | 依赖 |
|------|--------|----------|------|
| 实现 "激活已有窗口" 策略 | 🟡 Medium | 2d | Phase 1 |
| 添加相关测试 | 🟡 Medium | 1d | - |
| 用户文档更新 | 🟢 Low | 0.5d | - |

**技术方案**:
```typescript
// main-calls.ts
ipcMain.handle('file:open', async (event, filePath) => {
  const existing = globalTabRegistry.isFileOpen(filePath)
  if (existing) {
    // 激活已有窗口
    const win = getWindowById(existing.windowId)
    win?.focus()
    win?.webContents.send('tab:activate', existing.tabId)
    return { activated: true, windowId: existing.windowId }
  }
  // 创建新标签页...
})
```

---

### Phase 3: 性能优化（第 4-5 周）

**目标**: 提升标签页管理性能和内存效率

| 任务 | 优先级 | 预估工时 | 影响 |
|------|--------|----------|------|
| Tab 懒加载 | 🟡 Medium | 3d | 启动速度 +20% |
| 状态同步优化 | 🟢 Low | 2d | 减少 IPC 开销 |
| 内存泄漏修复 | 🟡 Medium | 2d | 长期稳定性 |

**Tab 懒加载方案**:
```typescript
// workspace.ts
interface LazyTab {
  id: string
  loaded: boolean
  documentSnapshot?: WorkspaceDocument
}

// 切换标签时才加载文档内容
function activateTab(tabId: string) {
  const tab = getTab(tabId)
  if (!tab.loaded) {
    loadDocument(tabId)
    tab.loaded = true
  }
}
```

---

### Phase 4: 用户偏好设置（第 6-7 周）

**目标**: 添加标签页管理相关的用户设置

| 任务 | 优先级 | 预估工时 |
|------|--------|----------|
| 设置面板设计 | 🟢 Low | 1d |
| 后端配置存储 | 🟢 Low | 1d |
| 前端设置 UI | 🟢 Low | 2d |
| 策略实现 | 🟡 Medium | 2d |

**设置项设计**:
```typescript
interface TabManagementPreferences {
  // 文件打开行为
  duplicateFileBehavior: 'activate' | 'duplicate' | 'prompt'
  
  // 新建文档
  maxNewDocTabs: number  // 默认: 5
  autoCleanupPlaceholder: boolean  // 默认: true
  
  // 拖拽行为
  dragToNewWindow: boolean  // 默认: true
  confirmBeforeClosingDirty: boolean  // 默认: true
  
  // 性能
  lazyLoadTabs: boolean  // 默认: true
  maxTabHistory: number  // 默认: 10
}
```

---

### Phase 5: 长期技术债（第 8+ 周）

**目标**: 重构和架构优化

| 任务 | 优先级 | 预估工时 | 技术收益 |
|------|--------|----------|----------|
| 拆分 `main-calls.ts` | 🟢 Low | 5d | 可维护性 |
| 提取 Tab 管理为独立模块 | 🟢 Low | 5d | 可测试性 |
| 端到端测试覆盖 | 🟢 Low | 5d | 质量保证 |
| 性能监控埋点 | 🟢 Low | 3d | 数据驱动优化 |

---

## 风险评估和缓解方案

### 风险矩阵

| 风险 | 概率 | 影响 | 风险等级 | 缓解措施 |
|------|------|------|----------|----------|
| 修复引入回归 Bug | 中 | 高 | 🔴 High | 完整测试 + 功能开关 |
| 文件打开策略改变用户困惑 | 中 | 中 | 🟡 Medium | 用户提示 + 可配置 |
| 性能问题（大量标签） | 低 | 中 | 🟢 Low | 懒加载 + 性能监控 |
| 跨平台拖拽行为差异 | 中 | 低 | 🟢 Low | 平台特定测试 |
| 状态同步竞态条件 | 低 | 高 | 🟡 Medium | 事务化更新 |

### 详细风险分析

#### 风险 1: 修复引入回归 Bug

**描述**: 新代码可能破坏现有功能

**触发条件**:
- 拖拽操作异常
- 标签页状态不同步
- 窗口关闭时崩溃

**缓解措施**:
1. **功能开关**: 所有新功能添加配置开关
   ```typescript
   const ENABLE_NEW_TAB_BEHAVIOR = process.env.ENABLE_NEW_TAB_BEHAVIOR === 'true'
   ```
2. **灰度发布**: 先内部测试，再小范围用户测试
3. **快速回滚**: 准备回滚脚本
   ```bash
   npm run release:rollback -- --version=0.12.0
   ```

**应急方案**:
```typescript
// 紧急禁用新功能
if (emergencyRollback) {
  useLegacyTabBehavior()
}
```

---

#### 风险 2: 文件打开策略改变用户困惑

**描述**: 从 "允许重复" 改为 "激活已有" 可能让习惯旧行为的用户困惑

**缓解措施**:
1. **首次提示**: 首次触发时显示提示
   ```typescript
   if (!userPreferences.hasSeenNewTabBehaviorHint) {
     showToast('已激活已有标签页，可在设置中修改此行为')
   }
   ```
2. **可配置**: 提供设置项让用户选择
3. **文档更新**: 在更新日志和文档中说明

---

#### 风险 3: 性能问题

**描述**: 大量标签页时性能下降

**监控指标**:
- 标签切换延迟 > 500ms
- 内存占用 > 500MB
- IPC 消息队列积压

**缓解措施**:
1. **懒加载**: 非激活标签页不加载文档内容
2. **虚拟滚动**: 标签栏虚拟化（大量标签时）
3. **定期清理**: 自动关闭长时间未激活的占位标签

---

#### 风险 4: 跨平台行为差异

**描述**: Windows/macOS/Linux 上拖拽行为可能不同

**缓解措施**:
1. **平台测试**: 每个版本在三个平台测试
2. **降级方案**: 拖拽失败时提供右键菜单备选

---

### 回滚计划

#### 触发条件
- 发布后 24 小时内发现 P0 Bug
- 用户反馈重大问题
- 性能指标严重下降

#### 回滚步骤

1. **代码回滚**:
   ```bash
   git revert --no-commit HEAD~3..HEAD
   git commit -m "Rollback: Tab management fixes (emergency)"
   git push origin main
   ```

2. **发布回滚版本**:
   ```bash
   npm version patch
   npm run release:prod
   ```

3. **用户通知**:
   - 在 GitHub Releases 中标注回滚原因
   - 在应用内显示通知（如果可能）

4. **事后复盘**:
   - 分析根本原因
   - 改进测试流程
   - 更新发布检查清单

---

## 执行策略

### Wave 1: 立即开始（本周）

```
Day 1-2: 执行测试清单
  ├── Test 1.1 - Test 1.3
  ├── Test 2.1 - Test 2.3
  └── 记录所有问题

Day 3-4: 修复验证
  ├── 修复测试中发现的问题
  └── 重新验证

Day 5: 代码审查和回归测试
```

### Wave 2: 策略优化（下周）

```
Day 1-2: 实现 "激活已有窗口" 策略
Day 3: 添加测试
Day 4: 用户测试
Day 5: 文档更新
```

### Wave 3: 性能优化（第 3 周）

```
Day 1-3: Tab 懒加载实现
Day 4-5: 性能测试和调优
```

---

## 成功标准

### 技术指标
- [ ] 所有 Critical 测试用例通过率 100%
- [ ] 标签切换延迟 < 200ms
- [ ] 内存占用增长 < 10%（对比基线）
- [ ] 崩溃率 < 0.1%

### 用户指标
- [ ] 用户反馈标签页管理 "稳定"
- [ ] 支持请求减少 50%
- [ ] 功能使用率 > 80%

---

## 附录

### 关键代码位置速查

| 功能 | 文件路径 | 行号范围 |
|------|----------|----------|
| GlobalTabRegistry | `src/main/main-calls.ts` | 196-357 |
| Drag Manager (Main) | `src/main/drag-manager.ts` | 1-548 |
| Window Pool | `src/main/window-pool.ts` | 1-146 |
| Workspace Store | `src/renderer/src/stores/workspace.ts` | 1-1963 |
| ensureInitialTab | `src/renderer/src/stores/workspace.ts` | 333-349 |
| Tab Drag (Renderer) | `src/renderer/src/composables/useTabDrag.ts` | 1-700+ |

### 测试环境配置

```bash
# 清理用户数据（测试前）
rm -rf ~/.config/meta-doc/

# 开发模式启动
npm run dev

# 查看日志
# Windows: %APPDATA%/MetaDoc/logs/
# macOS: ~/Library/Logs/MetaDoc/
# Linux: ~/.config/meta-doc/logs/
```

### 调试命令

```typescript
// 在 DevTools 中执行

// 查看所有标签
workspace.tabs

// 查看活动标签
workspace.activeTab

// 查看注册表状态（需要 IPC）
await window.electron.ipcRenderer.invoke('debug:get-tab-registry-stats')

// 强制清理
workspace.cleanup()
```

---

**计划生成时间**: 2026-02-21  
**计划版本**: v1.0  
**负责人**: Prometheus (Planner) / Sisyphus (Executor)

---

> **下一步操作**: 执行 `/start-work` 开始按照本计划进行工作
