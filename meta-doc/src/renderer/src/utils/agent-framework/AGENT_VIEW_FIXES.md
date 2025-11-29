# AgentView 修复进度总结

## 已完成

### 1. ✅ 修复消息重复添加问题
- **问题**：用户发送消息时，消息被添加了两遍
- **原因**：`handleComposerSubmit` 中已添加用户消息，但引擎执行器（AutoGPT、ReAct等）中又调用 `AIContextManager.addUserMessage` 重复添加
- **修复**：移除了所有引擎执行器（AutoGPT、ReAct、PlanExecute、SimpleChat、WorkflowEngine）中的重复 `addUserMessage` 调用
- **文件**：`meta-doc/src/renderer/src/utils/agent-framework/agent-engine-executor.ts`

## 待完成

### 2. ⏳ 实现流式AI生成和UI锁
- **需求**：
  1. AI生成应该是流式的，使用 `createAiTask` 的逻辑
  2. AI生成时需要启动UI锁（`workspace.lockUI()`）
  3. 生成完成后关闭UI锁（`workspace.unlockUI()`）
  4. 输入框需要有终止按钮，可以取消当前的AI生成
  5. 终止按钮通过组件事件传递实现

- **实现方案**：
  1. 在 `AgentView.vue` 中添加：
     - `currentAiTaskHandle` ref 来跟踪当前任务
     - `isGenerating` ref 来跟踪生成状态
     - 在 `executeAgentEngine` 中创建流式AI任务
  2. 修改 `ChatComposer.vue`：
     - 添加 `showCancel` prop 和 `cancel` 事件
     - 在生成时显示终止按钮
  3. 修改引擎执行器支持流式输出（或创建一个流式适配器）
  4. 使用 `workspace.lockUI()` 和 `workspace.unlockUI()` 控制UI锁

- **参考**：`QuickStartPanel.vue` 的流式实现（382-401行）

### 3. ⏳ 添加消息编辑和操作功能
- **需求**：
  1. 用户消息hover时显示编辑按钮
  2. 点击编辑可以修改消息内容
  3. 点击确定后重新在该节点触发AI消息
  4. 添加菜单按钮，包含：
     - 在当前节点Duplicate会话
     - 删除这条消息
     - 在这个节点重新触发AI生成

- **实现方案**：
  1. 修改 `AgentMessageRenderer.vue`：
     - 添加hover状态管理
     - 添加编辑按钮和菜单按钮
     - 实现编辑对话框
     - 实现消息操作菜单
  2. 在 `AgentView.vue` 中添加：
     - `handleMessageEdit` 方法
     - `handleMessageDelete` 方法
     - `handleMessageRegenerate` 方法
     - `handleDuplicateFromMessage` 方法

### 4. ⏳ 修复工具列表显示问题
- **问题**：右上角的工具管理界面显示为空
- **检查点**：
  1. `agentConfigManager.getAvailableToolIds()` 是否正确返回工具ID
  2. `toolCollectionManager.getToolIdsFromCollections()` 是否正确实现
  3. `agentToolManager.getAllTools()` 是否正确返回工具
  4. AgentConfig 的 `toolCollectionIds` 是否正确设置

- **当前代码逻辑**（在 `AgentView.vue` 623-646行）：
```typescript
const tools = computed(() => {
  const session = activeSession.value;
  if (!session || !session.agentConfigId) {
    return [];
  }
  
  const availableToolIds = agentConfigManager.getAvailableToolIds(session.agentConfigId);
  const allTools = agentToolManager.getAllTools();
  return allTools
    .filter(tool => availableToolIds.includes(tool.config.id))
    .map(tool => ({...}));
});
```

- **可能的问题**：
  1. AgentConfig 没有设置 `toolCollectionIds`
  2. ToolCollection 中没有工具
  3. 工具没有被正确注册到 `agentToolManager`

## 后续步骤

1. **优先级1**：修复工具列表显示问题（先诊断为什么为空）
2. **优先级2**：实现流式AI生成和UI锁
3. **优先级3**：添加消息编辑和操作功能

