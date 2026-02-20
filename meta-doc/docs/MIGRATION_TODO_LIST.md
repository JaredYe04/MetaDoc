# MetaDoc 迁移待办清单

本文档列出所有需要迁移的文件，按优先级和类别组织。

---

## 优先级说明

- **P0**：核心功能，高频使用，影响面大
- **P1**：重要功能，中频使用
- **P2**：一般功能，低频使用
- **P3**：辅助功能，很少使用

---

## 一、运行时服务器地址迁移（52521）

### 已完成 ✅
- `views/GraphWindow.vue`
- `views/MarkdownEditor.vue`
- `views/FomulaRecognition.vue`
- `views/KnowledgeBase.vue`
- `views/setting/SettingLlmSection.vue`
- `utils/vditor-cdn.js`
- `utils/md-utils.js`
- `utils/math-renderer.js`
- `utils/monaco-worker-config.ts`
- `utils/image-upload-service.ts`
- `utils/chart-pre-renderer.js`
- `utils/svg-to-pdf-utils.js`
- `utils/agent-tools/chart-generation-tool.ts`
- `utils/llm-adapters/adapter-factory.ts`
- `utils/agent-framework/llm-adapter.ts`
- `services/image-processor.ts`
- `services/export-manager.ts`
- `services/export-manager.obsolete.ts`

### 待检查（可能还有硬编码）
- [ ] 搜索整个 `src/renderer` 目录中的 `52521` 或 `localhost:52521`
- [ ] 检查文档中的示例 URL（`manuals/`、`docs/`）

---

## 二、渲染进程 IPC 迁移（ipcRenderer）

### 已完成 ✅
- `utils/event-bus.js` - P0 ✅
- `utils/settings.js` - P0 ✅
- `config/runtime-server.ts` - P0 ✅
- `components/WorkspaceExplorer.vue` - P0 ✅
- `stores/workspace.ts` - P0 ✅
- `utils/svg-to-pdf-utils.js` - P1 ✅

### 待迁移（按优先级）

#### P0 - 核心视图组件
- [x] `views/Main.vue` - 主窗口，大量 IPC 调用 ✅
- [x] `views/App.vue` - 应用入口 ✅
- [x] `components/MainTabs.vue` - 标签页管理，大量 IPC 调用 ✅
- [x] `views/GraphWindow.vue` - 图表窗口 ✅
- [x] `views/Home.vue` - 主页 ✅

#### P0 - 核心工具函数
- [x] `utils/db/tool-sessions-db.ts` - 数据库操作，大量 `ipcRenderer.invoke('db-query', ...)` ✅
- [x] `utils/ai_tasks.ts` - AI 任务管理 ✅
- [x] `composables/useWorkspaceOperations.ts` - 工作区操作（由调用方传入 messageBridge.getIpc()）✅
- [x] `composables/useTabOperations.ts` - 标签操作 ✅
- [x] `composables/useCloseTab.ts` - 关闭标签 ✅

#### P1 - 重要视图组件
- [x] `views/GlobalHome.vue` ✅
- [x] `views/DataAnalysisWindow.vue` ✅
- [x] `views/OcrWindow.vue` ✅
- [x] `views/FomulaRecognition.vue` ✅
- [x] `views/LaTeXEditor.vue` ✅
- [x] `views/PlainTextEditor.vue` ✅
- [x] `views/AttachmentWindow.vue` ✅
- [x] `views/AigcDetectionWindow.vue` ✅
- [x] `views/Visualize.vue` ✅
- [x] `views/ProofreadView.vue` ✅
- [x] `views/UserFeedbackView.vue` ✅

#### P1 - 设置页面
- [x] `views/setting/SettingBasicSection.vue` ✅
- [x] `views/setting/SettingDebugSection.vue` ✅
- [x] `views/setting/SettingThemeSection.vue` ✅
- [x] `views/setting/SettingLoggerSection.vue` ✅
- [x] `views/setting/SettingKnowledgeBaseSection.vue` ✅
- [x] `views/setting/SettingImageSection.vue` ✅
- [x] `views/setting/SettingAboutSection.vue` ✅

#### P1 - 组件
- [x] `components/agent/AgentToolResultCard.vue` ✅
- [x] `components/agent/ReferenceManager.vue` ✅
- [x] `components/chat/ChatComposer.vue` ✅
- [x] `components/ConsoleTerminal.vue` ✅
- [x] `components/ConsoleOutput.vue` ✅
- [x] `components/LlmStatisticsContent.vue` ✅
- [x] `components/VersionInfoPanel.vue` ✅
- [x] `components/workspace/WorkspaceTabs.vue` ✅
- [x] `components/agent-tools/components/AutoTestResultDisplay.vue` ✅

#### P1 - 工具函数
- [x] `utils/themes.js` ✅
- [x] `utils/logger.ts` ✅
- [x] `utils/service-status.ts` ✅
- [x] `utils/rag_utils.js` ✅
- [x] `utils/simpletex-utils.js` ✅
- [x] `utils/version.ts` ✅
- [x] `utils/ai_tasks.ts` ✅（无直接 IPC 调用）
- [x] `utils/db/migrate-ai-chat.ts` ✅
- [x] `utils/workspace/refresh-service.ts` ✅（由 useWorkspaceOperations 注入 ipc）
- [x] `utils/workspace/fs-planner.ts` ✅（同上）
- [x] `utils/workspace/fs-executor.ts` ✅（同上）

#### P1 - Agent 工具
- [x] `utils/agent-tools/workspace-tool.ts` ✅
- [x] `utils/agent-tools/web-crawler-tool.ts` ✅
- [x] `utils/agent-tools/terminal-tool.ts` ✅
- [x] `utils/agent-tools/proofread-tool.ts` ✅
- [x] `utils/agent-tools/diff-tool.ts` ✅
- [x] `utils/agent-tools/data-analysis-tool.ts` ✅
- [x] `utils/agent-tools/agent-tool-services.ts` ✅

#### P1 - Agent 框架
- [x] `utils/agent-framework/reference-processor.ts` ✅
- [x] `utils/agent-framework/reference-adapters.ts` ✅

#### P1 - 服务
- [x] `services/font-service.ts` ✅
- [x] `services/document-save.ts` ✅
- [x] `services/document-loader.ts` ✅

#### P2 - Composables
- [x] `composables/useTabSwitcher.ts` ✅
- [x] `composables/useTabDrag.ts` ✅

#### P2 - 工具函数
- [x] `utils/env-utils.ts` ✅
- [x] `utils/dev-env.ts` ✅
- [x] `utils/particle-effect.ts` ✅
- [x] `utils/llm-statistics-service.js` ✅
- [x] `utils/latex-omml-conversion-tests.ts` ✅
- [x] `utils/database-tests.ts` ✅
- ~~`utils/obsolete/ai_tasks.js`~~ 已删除（与 `utils/ai_tasks.ts` 重复）

#### P3 - 遗留文件
- ~~`views/Home_legacy.vue`~~ 已删除（未被引用）

### 剩余需迁移（全量 grep 排查）

以下为本次全量搜索 `ipcRenderer` / `window.electron` / `localIpcRenderer` 后仍**直接使用 IPC**、需改为 messageBridge 的文件：

| 文件 | 说明 |
|------|------|
| [x] `views/KnowledgeBase.vue` | ✅ 已改为 messageBridge |
| [x] `views/setting/SettingLlmSection.vue` | ✅ 已删除未使用的 ipcRenderer 初始化 |
| [x] `utils/md-utils.js` | ✅ 已改为 messageBridge |
| [x] `utils/chart-pre-renderer.js` | ✅ 已改为 messageBridge |
| [x] `services/export-manager.ts` | ✅ 已改为 messageBridge |
| [x] `components/WorkspaceExplorer.vue` | ✅ 已改为 messageBridge.* |

**仅环境检查、类型或注释（无需改逻辑）：**  
`message-bridge.ts`、`local-ipc-renderer.ts`、`particle-effect.ts`（options 字段）、`logger.ts`、`themes.js`、`database-tests.ts`（已用 messageBridge）、workspace 的 `fs-planner/fs-executor/refresh-service`（由调用方注入 ipc）、各文件中的 `if (!window.electron?.ipcRenderer) webMainCalls()`。

### 52521 / 运行时服务器地址（剩余）

| 文件 | 说明 |
|------|------|
| [x] `manuals/zh_CN/settings/image-upload.md` | ✅ 已改为“运行时服务器”说明 |
| [x] `utils/agent-tools/chart-generation-tool.ts` | ✅ 提示词中示例 URL 改为占位 `<runtime-server>/images/` |
| [ ] `src/renderer/config/runtime-server.ts` | 已有 fallback `127.0.0.1:52521`，属配置默认值 ✅ |
| [ ] `services/image-processor.ts` | 仅注释提及 localhost:52521，逻辑已用 `getRuntimeServerBaseUrlSync()` ✅ |

---

## 三、迁移统计

### 运行时服务器地址
- ✅ 已完成：~20 个文件，逻辑已统一走 config
- ⏳ 待更新：文档/提示词中的示例 URL（见上表）

### IPC 消息桥
- ✅ 绝大部分已迁移至 messageBridge
- ⏳ 待完成：上表 6 个文件（本次排查剩余）

---

## 四、快速查找命令

### 查找所有使用 ipcRenderer 的文件
```bash
cd src/renderer
grep -r "ipcRenderer" --include="*.ts" --include="*.js" --include="*.vue" | grep -v "node_modules" | grep -v ".git" | cut -d: -f1 | sort -u
```

### 查找所有直接访问 window.electron 的文件
```bash
cd src/renderer
grep -r "window\.electron" --include="*.ts" --include="*.js" --include="*.vue" | grep -v "node_modules" | grep -v ".git" | cut -d: -f1 | sort -u
```

### 查找所有使用 localIpcRenderer 的文件
```bash
cd src/renderer
grep -r "localIpcRenderer" --include="*.ts" --include="*.js" --include="*.vue" | grep -v "node_modules" | grep -v ".git" | cut -d: -f1 | sort -u
```

### 统计每个文件的 IPC 调用次数
```bash
cd src/renderer
for file in $(grep -r "ipcRenderer" --include="*.ts" --include="*.js" --include="*.vue" | grep -v "node_modules" | cut -d: -f1 | sort -u); do
  count=$(grep -c "ipcRenderer" "$file" 2>/dev/null || echo 0)
  echo "$count $file"
done | sort -rn | head -20
```

---

## 五、迁移模板

### 模板 1：简单 IPC 调用替换

**查找：**
```javascript
ipcRenderer.invoke('channel', arg)
ipcRenderer.send('channel', arg)
ipcRenderer.on('channel', handler)
```

**替换为：**
```javascript
import messageBridge from '../bridge/message-bridge'
messageBridge.invoke('channel', arg)
messageBridge.send('channel', arg)
messageBridge.on('channel', handler)
```

### 模板 2：IPC 实例获取替换

**查找：**
```javascript
let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer
} else {
  ipcRenderer = localIpcRenderer
}
```

**替换为：**
```javascript
import messageBridge from '../bridge/message-bridge'
const ipcRenderer = messageBridge.getIpc()
```

### 模板 3：异步 IPC 获取替换

**查找：**
```javascript
async function getIpc() {
  if (window && window.electron) {
    return window.electron.ipcRenderer
  }
  const { localIpcRenderer } = await import('./web-adapter/local-ipc-renderer')
  return localIpcRenderer
}
```

**替换为：**
```javascript
import messageBridge from '../bridge/message-bridge'
const getIpc = () => messageBridge.getIpc()
```

---

## 六、注意事项

1. **导入路径**：根据文件位置调整 `messageBridge` 的导入路径
   - 同目录：`'./bridge/message-bridge'`
   - 上一级：`'../bridge/message-bridge'`
   - 上两级：`'../../bridge/message-bridge'`

2. **类型检查**：TypeScript 文件可能需要添加类型声明
   ```typescript
   import messageBridge from '../bridge/message-bridge'
   ```

3. **错误处理**：确保 `messageBridge.invoke` 的错误处理正确
   ```typescript
   try {
     const result = await messageBridge.invoke('channel', arg)
   } catch (error) {
     // 处理错误
   }
   ```

4. **测试**：每个文件迁移后，运行相关功能测试

---

**最后更新：** 2026-02-20
