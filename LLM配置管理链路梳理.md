# LLM配置管理链路梳理

## 一、数据存储结构

### 1.1 存储位置
- **配置列表**: `localStorage['llm-configs']` - 存储所有配置的数组
- **当前配置ID**: `localStorage['current-llm-config-id']` - 当前激活的配置ID
- **配置字段**: 各个LLM类型的设置存储在独立的 `localStorage` key 中（如 `selectedLlm`, `ollamaApiUrl` 等）

### 1.2 配置数据结构
```typescript
interface LlmConfigItem {
  id: string;                    // 配置唯一ID
  name: string;                  // 配置名称
  type: 'metadoc' | 'ollama' | 'openai' | ...;  // LLM类型
  isTemporary?: boolean;          // 是否为临时配置
  originalConfigId?: string;     // 临时配置的原始配置ID
  // ... 各类型的具体配置字段
  createdAt: number;
  updatedAt: number;
}
```

## 二、核心流程

### 2.1 初始化流程
```
应用启动
  ↓
loadLlmConfigs()
  ↓
从 localStorage 读取配置列表
  ↓
如果没有配置，创建默认配置
  ↓
读取当前配置ID，应用配置到设置
  ↓
监听配置变化（watchConfigChanges）
```

### 2.2 配置切换流程
```
用户选择配置
  ↓
handleConfigSwitch(id)
  ↓
switchConfig(id)
  ↓
更新 currentConfigId
  ↓
applyConfigToSettings(config)
  ↓
将配置内容写入各个 localStorage key
  ↓
广播 'llm-config-updated' 事件
  ↓
其他窗口接收广播，同步配置
```

### 2.3 配置修改流程（当前问题所在）
```
用户修改配置字段（如 apiUrl, apiKey 等）
  ↓
触发 handleFieldChange() 或 watch 监听器
  ↓
updateLlmInfo() - 更新 localStorage 中的设置
  ↓
handleConfigModification() - 检查是否需要创建临时配置
  ↓
isCurrentConfigModified() - 比较当前设置与已保存配置
  ↓
如果已修改且当前是已保存配置：
  ↓
createTemporaryConfigAsync() - 创建临时配置
  ↓
自动切换到临时配置
  ↓
配置列表中出现 "原配置名 (已修改)" 的临时配置
```

### 2.4 保存配置流程
```
用户点击"保存当前为配置"
  ↓
handleSaveCurrentAsConfig()
  ↓
createConfigFromCurrentSettings(name)
  ↓
从当前设置创建新配置
  ↓
如果当前是临时配置，删除临时配置
  ↓
切换到新保存的配置
```

### 2.5 删除配置流程
```
用户点击删除配置
  ↓
handleDeleteConfig(id)
  ↓
deleteConfig(id)
  ↓
从配置列表中移除
  ↓
如果删除的是当前配置，切换到第一个配置
```

## 三、问题分析

### 3.1 临时配置自动创建的问题

**触发时机过多**：
- 每次修改任何配置字段都会触发 `handleConfigModification()`
- 通过 `watchConfigChanges()` 监听了大量字段（20+个字段）
- 500ms 防抖可能不够，频繁修改会创建多个临时配置

**临时配置累积**：
- 临时配置一旦创建就会一直存在
- 没有自动清理机制
- 如果用户修改后切换配置，临时配置不会被清理
- 可能导致配置列表中出现大量 "XXX (已修改)" 的临时配置

**逻辑混乱**：
- 用户修改已保存配置 → 自动创建临时配置 → 自动切换
- 用户可能不知道发生了什么，配置列表突然多了一个临时配置
- 如果用户切换回原始配置，再次修改又会创建新的临时配置

### 3.2 配置同步问题

**双重存储**：
- 配置内容存储在 `llm-configs` 中
- 同时各个字段也存储在独立的 localStorage key 中
- 两个存储可能不同步

**切换配置时的同步**：
- `switchConfig()` 会从配置对象写入 localStorage
- 但用户修改时，是直接修改 localStorage，然后检查是否需要创建临时配置
- 这个流程容易导致不一致

### 3.3 CRUD操作的问题

**Create（创建）**：
- ✅ 基本正常，但创建临时配置的逻辑混在修改流程中

**Read（读取）**：
- ✅ 基本正常

**Update（更新）**：
- ❌ 更新已保存配置会触发临时配置创建，而不是直接更新
- ❌ 更新临时配置的逻辑不清晰
- ❌ 没有明确的"保存修改"操作

**Delete（删除）**：
- ⚠️ 删除临时配置时，如果存在对应的原始配置，逻辑不清晰
- ⚠️ 删除已保存配置时，如果有对应的临时配置，不会一起清理

## 四、当前代码关键点

### 4.1 配置修改检测
```typescript
// SettingLlmSection.vue:765
const handleConfigModification = async () => {
  // 如果是临时配置，不需要创建新配置
  if (currentConfig.isTemporary) return;
  
  // 检查是否被修改
  const isModified = await isCurrentConfigModified(currentConfigId.value);
  if (isModified) {
    // 创建临时配置并切换过去
    const tempConfig = await createTemporaryConfigAsync(currentConfig, modifiedSuffix);
    currentConfigId.value = tempConfig.id;
    await switchConfig(tempConfig.id);
  }
};
```

### 4.2 临时配置创建
```typescript
// llm-config-manager.ts:383
export async function createTemporaryConfigAsync(
  originalConfig: LlmConfigItem,
  modifiedSuffix: string = '(已修改)'
): Promise<LlmConfigItem> {
  // 检查是否已经存在该配置的临时版本
  const existingTemp = configs.value.find(
    c => c.isTemporary && c.originalConfigId === originalConfig.id
  );
  
  if (existingTemp) {
    // 如果已存在，更新它
    await updateTemporaryConfigFromSettings(existingTemp);
    return existingTemp;
  }
  
  // 创建新的临时配置
  // ...
}
```

### 4.3 配置修改检测
```typescript
// llm-config-manager.ts:422
export async function isCurrentConfigModified(configId: string): Promise<boolean> {
  const config = configs.value.find(c => c.id === configId);
  if (!config || config.isTemporary) return false;
  
  // 从当前设置创建配置对象
  const currentSettings = await createDefaultConfigFromSettings();
  
  // 逐个字段比较
  // ...
}
```

## 五、问题总结

### 5.1 核心问题
1. **自动创建临时配置导致混乱**：用户修改已保存配置时，系统自动创建临时配置并切换，用户可能不理解发生了什么
2. **临时配置累积**：没有清理机制，临时配置会一直存在
3. **更新逻辑不清晰**：更新已保存配置不是直接更新，而是创建临时配置
4. **双重存储不同步**：配置对象和 localStorage 字段可能不一致

### 5.2 用户体验问题
1. 配置列表中出现大量 "XXX (已修改)" 的临时配置
2. 用户不知道哪些是临时配置，哪些是已保存配置
3. 修改配置后，配置列表突然变化，用户可能困惑
4. 没有明确的"保存"和"取消"操作

### 5.3 代码维护问题
1. 修改检测逻辑复杂，涉及大量字段比较
2. 临时配置和已保存配置的处理逻辑分散
3. 配置同步逻辑复杂，容易出错

## 六、建议的重构方向

### 6.1 明确的状态管理
- **已保存配置**：直接存储在配置列表中，修改时需要明确"保存"操作
- **未保存修改**：在内存中维护，不创建临时配置对象
- **临时配置**：仅在用户明确创建新配置时使用

### 6.2 清晰的用户操作流程
- 用户修改已保存配置 → 标记为"已修改"状态（UI显示）→ 用户点击"保存"才真正更新
- 用户创建新配置 → 创建临时配置 → 用户点击"保存"转为已保存配置
- 用户切换配置时，如果有未保存修改，提示用户

### 6.3 统一的数据存储
- 配置内容统一存储在配置对象中
- localStorage 字段仅作为运行时缓存
- 切换配置时，从配置对象同步到 localStorage

### 6.4 简化的CRUD操作
- **Create**: 创建新配置（临时或直接保存）
- **Read**: 读取配置列表和当前配置
- **Update**: 直接更新配置对象，不创建临时配置
- **Delete**: 删除配置，同时清理相关临时配置

