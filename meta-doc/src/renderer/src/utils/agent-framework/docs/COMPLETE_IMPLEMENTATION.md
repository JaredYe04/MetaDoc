# AgentView 完整实现方案

## ✅ 已完成

### 1. 扩展 createAiTask 支持自定义LLM API

- **文件修改**：

  - `meta-doc/src/renderer/src/utils/ai_tasks.ts`：添加 `CustomLlmConfigForTask` 接口和扩展 `LLMApiMeta`
  - `meta-doc/src/renderer/src/utils/llm-api.js`：添加 `getCustomLlmConfigObject` 函数，修改所有LLM调用函数支持自定义配置

- **功能**：
  - 支持通过 `meta.customLlmConfig` 传递自定义LLM配置
  - 支持 OpenAI 兼容的API（openai-compatible类型）
  - 支持全局LLM配置和自定义配置两种模式

### 2. 修复消息重复添加问题

- 移除了所有引擎执行器中的重复 `addUserMessage` 调用

## 🚧 待实现

### 3. 实现流式AI生成和UI锁

**需要修改的文件**：

- `AgentView.vue`：添加流式输出支持、UI锁、终止按钮
- `ChatComposer.vue`：添加 `showCancel` prop 和 `cancel` 事件
- `agent-engine-executor.ts`：修改为使用流式输出（或创建流式适配器）

**实现方案**：

1. 在 AgentView 中创建助手消息的 ref
2. 使用 `createAiTask` 创建流式任务
3. 在任务开始前调用 `workspace.lockUI()`
4. 在任务完成后调用 `workspace.unlockUI()`
5. 在 ChatComposer 中添加终止按钮，调用 `cancelAiTask`

### 4. 添加消息编辑和操作功能

**需要修改的文件**：

- `AgentMessageRenderer.vue`：添加编辑按钮、菜单按钮、编辑对话框
- `AgentView.vue`：添加消息操作方法

**功能**：

- 用户消息hover时显示编辑按钮
- 点击编辑可以修改消息内容并重新触发AI
- 添加菜单：Duplicate会话、删除消息、重新生成

### 5. 修复工具列表显示问题

**需要检查**：

- AgentConfig 的 `toolCollectionIds` 是否正确设置
- `toolCollectionManager.getToolIdsFromCollections()` 是否正确实现
- 工具是否正确注册到 `agentToolManager`

## 使用自定义LLM配置示例

```typescript
// 在 AgentEngine 中使用自定义LLM配置
const customConfig: CustomLlmConfigForTask = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'your-api-key',
  model: 'gpt-4',
  type: 'openai-compatible'
}

const { done } = createAiTask('任务名称', '提示词', targetRef, ai_types.chat, 'origin-key', {
  stream: true,
  customLlmConfig: customConfig
})
```
