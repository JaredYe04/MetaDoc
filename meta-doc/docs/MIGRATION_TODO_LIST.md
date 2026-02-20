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
- [ ] `views/App.vue` - 应用入口
- [x] `components/MainTabs.vue` - 标签页管理，大量 IPC 调用 ✅
- [ ] `views/GraphWindow.vue` - 图表窗口
- [x] `views/Home.vue` - 主页 ✅

#### P0 - 核心工具函数
- [x] `utils/db/tool-sessions-db.ts` - 数据库操作，大量 `ipcRenderer.invoke('db-query', ...)` ✅
- [x] `utils/ai_tasks.ts` - AI 任务管理 ✅
- [ ] `composables/useWorkspaceOperations.ts` - 工作区操作（接收 ipc 参数，由调用方传入 messageBridge.getIpc()）
- [x] `composables/useTabOperations.ts` - 标签操作 ✅
- [x] `composables/useCloseTab.ts` - 关闭标签 ✅

#### P1 - 重要视图组件
- [ ] `views/GlobalHome.vue`
- [ ] `views/DataAnalysisWindow.vue`
- [ ] `views/OcrWindow.vue`
- [ ] `views/FomulaRecognition.vue`
- [ ] `views/LaTeXEditor.vue`
- [ ] `views/PlainTextEditor.vue`
- [ ] `views/AttachmentWindow.vue`
- [ ] `views/AigcDetectionWindow.vue`
- [ ] `views/Visualize.vue`
- [ ] `views/ProofreadView.vue`
- [ ] `views/UserFeedbackView.vue`

#### P1 - 设置页面
- [ ] `views/setting/SettingBasicSection.vue`
- [ ] `views/setting/SettingDebugSection.vue`
- [ ] `views/setting/SettingThemeSection.vue`
- [ ] `views/setting/SettingLoggerSection.vue`
- [ ] `views/setting/SettingKnowledgeBaseSection.vue`
- [ ] `views/setting/SettingImageSection.vue`
- [ ] `views/setting/SettingAboutSection.vue`

#### P1 - 组件
- [ ] `components/agent/AgentToolResultCard.vue`
- [ ] `components/agent/ReferenceManager.vue`
- [ ] `components/chat/ChatComposer.vue`
- [ ] `components/ConsoleTerminal.vue`
- [ ] `components/ConsoleOutput.vue`
- [ ] `components/LlmStatisticsContent.vue`
- [ ] `components/VersionInfoPanel.vue`
- [ ] `components/workspace/WorkspaceTabs.vue`
- [ ] `components/agent-tools/components/AutoTestResultDisplay.vue`

#### P1 - 工具函数
- [ ] `utils/themes.js`
- [ ] `utils/logger.ts`
- [ ] `utils/service-status.ts`
- [ ] `utils/rag_utils.js`
- [ ] `utils/simpletex-utils.js`
- [ ] `utils/version.ts`
- [ ] `utils/ai_tasks.ts`
- [ ] `utils/db/migrate-ai-chat.ts`
- [ ] `utils/workspace/refresh-service.ts`
- [ ] `utils/workspace/fs-planner.ts`
- [ ] `utils/workspace/fs-executor.ts`

#### P1 - Agent 工具
- [ ] `utils/agent-tools/workspace-tool.ts`
- [ ] `utils/agent-tools/web-crawler-tool.ts`
- [ ] `utils/agent-tools/terminal-tool.ts`
- [ ] `utils/agent-tools/proofread-tool.ts`
- [ ] `utils/agent-tools/diff-tool.ts`
- [ ] `utils/agent-tools/data-analysis-tool.ts`
- [ ] `utils/agent-tools/agent-tool-services.ts`

#### P1 - Agent 框架
- [ ] `utils/agent-framework/reference-processor.ts`
- [ ] `utils/agent-framework/reference-adapters.ts`

#### P1 - 服务
- [ ] `services/font-service.ts`
- [ ] `services/document-save.ts`
- [ ] `services/document-loader.ts`

#### P2 - Composables
- [ ] `composables/useTabSwitcher.ts`
- [ ] `composables/useTabDrag.ts`

#### P2 - 工具函数
- [ ] `utils/env-utils.ts`
- [ ] `utils/dev-env.ts`
- [ ] `utils/particle-effect.ts`
- [ ] `utils/llm-statistics-service.js`
- [ ] `utils/latex-omml-conversion-tests.ts`
- [ ] `utils/database-tests.ts`
- [ ] `utils/obsolete/ai_tasks.js`

#### P3 - 遗留文件
- [ ] `views/Home_legacy.vue`

---

## 三、迁移统计

### 运行时服务器地址
- ✅ 已完成：~20 个文件
- ⏳ 待检查：文档和注释中的示例

### IPC 消息桥
- ✅ 已完成：6 个核心文件
- ⏳ 待迁移：~80+ 个文件（约 1000+ 处 IPC 调用）

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
