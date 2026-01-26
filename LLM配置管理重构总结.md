# LLM配置管理重构总结

## 重构目标
将LLM配置管理从"临时配置模式"重构为"工作区模式"，提供更清晰的配置管理体验。

## 主要变更

### 1. 移除临时配置概念
- ✅ 移除了 `isTemporary` 和 `originalConfigId` 字段
- ✅ 移除了 `createTemporaryConfigAsync`、`createDefaultTemporaryConfig`、`isCurrentConfigModified` 等函数
- ✅ 移除了自动创建临时配置的逻辑
- ✅ 在加载配置时自动清理旧的临时配置

### 2. 实现工作区模式
- ✅ 添加了 `WorkspaceState` 接口，管理工作区状态
- ✅ 工作区包含：
  - `snapshot`: 当前配置的快照（已保存的配置）
  - `hasUnsavedChanges`: 是否有未保存的修改
- ✅ 实现了 `checkWorkspaceModified()`: 检查工作区是否有未保存修改
- ✅ 实现了 `saveWorkspace()`: 保存工作区修改到配置
- ✅ 实现了 `discardWorkspace()`: 放弃工作区修改，恢复到快照
- ✅ 实现了 `updateWorkspaceModifiedState()`: 更新工作区修改状态

### 3. 配置数据结构优化
- ✅ 在配置项中添加了 `enableMaxTokens` 和 `maxTokens` 字段（之前只存储在 localStorage）
- ✅ 统一了配置的序列化格式，所有配置字段都存储在配置对象中

### 4. UI改进
- ✅ 移除了临时配置的标签显示
- ✅ 添加了工作区工具栏，显示未保存修改状态
- ✅ 添加了"保存"和"放弃"按钮
- ✅ 配置列表项显示"未保存修改"标签（当有未保存修改时）
- ✅ 切换配置时，如果有未保存修改，会提示用户保存或放弃

### 5. 导入导出功能
- ✅ 实现了 `exportConfig(configId)`: 导出单个配置为JSON
- ✅ 实现了 `exportAllConfigs()`: 导出所有配置为JSON
- ✅ 实现了 `importConfig(jsonString)`: 导入单个配置
- ✅ 实现了 `importConfigs(jsonString)`: 导入多个配置（支持数组）
- ✅ 添加了导入导出UI：
  - 配置菜单中添加"导出配置"选项
  - 配置列表头部添加"导入"和"导出所有"按钮
  - 导入对话框支持粘贴JSON

## 工作流程

### 用户修改配置
1. 用户修改配置字段（如 apiUrl、apiKey 等）
2. 触发 `handleFieldChange()` → `updateLlmInfo()` → `updateWorkspaceModifiedState()`
3. 工作区状态更新为 `hasUnsavedChanges = true`
4. UI显示"未保存修改"标签和状态

### 用户保存修改
1. 用户点击"保存"按钮
2. 调用 `saveWorkspace()`
3. 将当前设置保存到配置对象
4. 更新快照，`hasUnsavedChanges = false`
5. 显示成功提示

### 用户放弃修改
1. 用户点击"放弃"按钮
2. 确认对话框
3. 调用 `discardWorkspace()`
4. 恢复到快照配置
5. `hasUnsavedChanges = false`
6. 显示成功提示

### 用户切换配置
1. 用户选择其他配置
2. 如果有未保存修改，显示确认对话框
3. 用户选择保存或放弃
4. 切换到新配置
5. 更新工作区快照

## 配置导入导出格式

### 单个配置JSON格式
```json
{
  "id": "config-1234567890",
  "name": "配置名称",
  "type": "ollama",
  "ollama": {
    "apiUrl": "http://localhost:11434/api",
    "selectedModel": "llama2",
    "enableMaxTokens": false,
    "maxTokens": 4096
  },
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

### 多个配置JSON格式
```json
[
  {
    "id": "config-1",
    "name": "配置1",
    ...
  },
  {
    "id": "config-2",
    "name": "配置2",
    ...
  }
]
```

## 向后兼容

- ✅ 加载配置时自动清理旧的临时配置
- ✅ 导入配置时自动移除临时配置相关字段
- ✅ 保持配置ID格式不变，确保现有配置可以正常使用

## 待测试功能

1. ✅ 配置修改检测是否准确
2. ✅ 保存/放弃功能是否正常工作
3. ✅ 切换配置时的提示是否正常
4. ✅ 导入导出功能是否正常
5. ✅ 多窗口同步是否正常
6. ✅ 配置列表显示是否正确

## 注意事项

1. **工作区状态初始化**：在 `onMounted` 时需要初始化工作区状态
2. **配置切换确认**：切换配置时如果有未保存修改，需要提示用户
3. **防抖处理**：配置字段变化检测使用300ms防抖，避免频繁更新
4. **导入配置ID**：导入配置时会生成新的ID，避免ID冲突

## 后续优化建议

1. 可以考虑添加配置版本管理
2. 可以考虑添加配置历史记录（撤销/重做）
3. 可以考虑添加配置模板功能
4. 可以考虑添加配置搜索和过滤功能

