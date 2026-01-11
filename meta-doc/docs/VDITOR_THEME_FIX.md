# Vditor 主题同步问题修复文档

## 问题描述

### 问题 1: 保存时主题变成亮色
- **现象**: 当前主题是暗色，在 Vditor 中编辑时正常，但保存后 Vditor 主题变成亮色
- **影响**: 表格、文字等渲染样式异常

### 问题 2: 主题切换不同步
- **现象**: 在设置中切换主题后，Vditor 的主题没有同步更新
- **影响**: Vditor 的工具栏、大纲等仍然是旧主题颜色，只有背景色和正文颜色正常（因为是 CSS 控制的）

## 根本原因分析

### 问题 1 的根本原因
1. **`setValue` 会重置主题**: 根据 Vditor 文档，`setValue` 方法会重新渲染编辑器，可能会重置主题状态
2. **保存链路触发 `setValue`**: 
   - 保存时调用 `handleSyncActiveEditor`
   - 如果内容不同，会调用 `workspace.updateDocumentMarkdown`
   - 这会触发 `watch(currentMarkdown)`
   - 如果 `incoming !== lastAppliedContent`，会调用 `scheduleSetValue`
   - `scheduleSetValue` 内部调用 `vditor.value.setValue()`
   - `setValue` 会重置主题，但没有重新应用主题

### 问题 2 的根本原因
1. **缺少主题变化监听**: 虽然有 `eventBus.on('sync-editor-theme')` 监听，但只在主动触发时执行
2. **缺少 `themeState` 变化监听**: 当 `themeState.currentTheme` 变化时，没有自动同步 Vditor 主题
3. **初始化时主题可能未正确应用**: 在 `after` 回调中，初始化后可能主题未正确应用

## 修复方案

### 修复 1: `setValue` 后自动重新应用主题

**位置**: `scheduleSetValue` 函数的 `run` 函数内

**修改**:
```typescript
const run = async () => {
    // ...
    try {
        vditor.value?.setValue(normalized, options.clearHistory ?? true);
        lastAppliedContent.value = normalized;
        
        // 关键修复：setValue 可能会重置 Vditor 的主题，所以需要在 setValue 后重新应用主题
        // 但如果设置了 preserveTheme 选项，则跳过主题重新应用（由调用者控制）
        if (!options.preserveTheme && vditor.value) {
            // 延迟重新应用主题，确保 setValue 完成
            await nextTick();
            setTimeout(async () => {
                if (vditor.value && isActive.value) {
                    await handleSyncEditorTheme();
                }
            }, 50);
        }
    } catch (error) {
        logger.warn('设置 Vditor 值失败，可能未完全初始化:', error);
    }
};
```

**说明**:
- 在 `setValue` 后自动重新应用主题，确保主题不被重置
- 使用 `preserveTheme` 选项允许调用者控制是否重新应用主题
- 延迟 50ms 确保 `setValue` 完成后再应用主题

### 修复 2: 改进 `handleSyncEditorTheme` 函数

**位置**: `handleSyncEditorTheme` 函数

**修改**:
```typescript
const handleSyncEditorTheme = async () => {
    if (!isActive.value || !vditor.value) return;
    
    // 确保 Vditor 完全初始化
    if (!vditor.value.vditor || !vditor.value.vditor.ir) {
        // 如果未完全初始化，延迟执行
        setTimeout(() => {
            handleSyncEditorTheme();
        }, 100);
        return;
    }
    
    // 获取主题设置
    let contentTheme = await getSetting('contentTheme');
    if (contentTheme === 'auto') {
        contentTheme = themeState.currentTheme.vditorTheme === 'dark' ? 'dark' : 'light';
    }
    
    let codeTheme = await getSetting('codeTheme');
    if (codeTheme === 'auto') {
        codeTheme = themeState.currentTheme.codeTheme;
    }

    try {
        // 应用主题（setTheme的第一个参数是工具栏主题，第二个是内容预览主题，第三个是代码高亮主题）
        vditor.value.setTheme(
            themeState.currentTheme.vditorTheme as any, 
            contentTheme as any, 
            codeTheme as any
        );
        
        logger.debug('Vditor 主题已同步', {
            vditorTheme: themeState.currentTheme.vditorTheme,
            contentTheme,
            codeTheme,
            isActive: isActive.value
        });
    } catch (error) {
        logger.warn('同步 Vditor 主题失败:', error);
    }
};
```

**改进点**:
- 添加了 Vditor 初始化检查，确保完全初始化后才应用主题
- 添加了错误处理和日志记录
- 添加了详细的日志输出，方便调试

### 修复 3: 初始化后应用主题

**位置**: `after` 回调中

**修改**:
```typescript
after: async () => {
    try {
        // 确保初始化后应用正确的主题
        await handleSyncEditorTheme();
        
        // ... 其他初始化逻辑
        
        // 如果内容已经正确，确保主题也正确（可能初始化时主题未正确应用）
        if (currentValue === desired) {
            await nextTick();
            await handleSyncEditorTheme();
        }
    } catch (e) {
        logger.error(e);
    }
}
```

**说明**:
- 在初始化后立即应用主题，确保主题正确
- 在内容设置完成后，再次确保主题正确

### 修复 4: Tab 激活时应用主题

**位置**: `watch(isActive)` 中

**修改**:
```typescript
watch(
    isActive,
    async (active) => {
        if (!active) return;
        // ... 等待 Vditor 初始化 ...
        
        // 确保主题正确（Tab 激活时可能主题未同步）
        await nextTick();
        await handleSyncEditorTheme();
        
        // ... 其他逻辑 ...
    },
    { immediate: true },
);
```

**说明**:
- Tab 激活时确保主题正确，避免切换 Tab 后主题异常

### 修复 5: 监听 `themeState` 变化

**位置**: 添加新的 `watch`

**修改**:
```typescript
// 监听 themeState 变化，确保 Vditor 主题同步
watch(
    () => [themeState.currentTheme.vditorTheme, themeState.currentTheme.codeTheme, themeState.currentTheme.type],
    () => {
        if (!isActive.value || !vditor.value) return;
        // 当主题变化时，触发主题同步
        handleSyncEditorTheme();
    },
    { deep: false }
);
```

**说明**:
- 监听 `themeState.currentTheme` 的变化，自动同步 Vditor 主题
- 这确保了在设置中切换主题时，Vditor 主题能够自动更新

## 修复后的完整链路

### 保存时的主题同步链路

```
用户按下 Ctrl+S
  ↓
handleSyncActiveEditor
  ↓
workspace.updateDocumentMarkdown (如果内容不同)
  ↓
watch(currentMarkdown) 触发
  ↓
scheduleSetValue
  ↓
vditor.value.setValue()
  ↓
自动重新应用主题 (handleSyncEditorTheme) ← 新增
  ↓
主题正确
```

### 主题切换时的同步链路

```
用户在设置中切换主题
  ↓
applyTheme() 更新 themeState.currentTheme
  ↓
eventBus.emit('sync-theme')
  ↓
App.vue: eventBus.emit('sync-editor-theme')
  ↓
MarkdownEditor.vue: handleSyncEditorTheme() ← 修复后更可靠
  ↓
watch(themeState) 触发 ← 新增，双重保障
  ↓
handleSyncEditorTheme() ← 自动触发
  ↓
主题正确
```

## 测试建议

### 测试 1: 保存时主题不变
1. 切换到暗色主题
2. 在 Vditor 中编辑内容
3. 按下 Ctrl+S 保存
4. **预期**: Vditor 主题仍然是暗色，不会变成亮色

### 测试 2: 主题切换同步
1. 切换到亮色主题
2. 在设置中切换到暗色主题
3. 回到编辑器
4. **预期**: Vditor 的主题（工具栏、大纲、内容预览）都是暗色

### 测试 3: Tab 切换时主题正确
1. 打开多个 Tab
2. 在不同 Tab 中编辑
3. 切换 Tab
4. **预期**: 每个 Tab 的 Vditor 主题都正确

## 注意事项

1. **延迟时间**: `setValue` 后延迟 50ms 再应用主题，确保 `setValue` 完成
2. **初始化检查**: 在应用主题前，确保 Vditor 完全初始化
3. **双重保障**: 既有 `eventBus.on('sync-editor-theme')` 监听，也有 `watch(themeState)` 监听，确保主题切换时能够同步
4. **性能考虑**: `watch(themeState)` 使用 `{ deep: false }`，只监听顶层数组，避免深度监听带来的性能问题

## 相关文件

- `meta-doc/src/renderer/src/views/MarkdownEditor.vue` - 主要修复位置
- `meta-doc/src/renderer/src/utils/themes.js` - 主题状态管理
- `meta-doc/src/renderer/src/App.vue` - 全局主题同步事件处理
- `meta-doc/src/renderer/src/views/setting/SettingThemeSection.vue` - 主题设置界面

## 参考文档

- Vditor API 文档: https://ld246.com/article/1549638745630#API
- Vditor setTheme 方法: `setTheme(theme: 'classic' | 'dark', contentTheme?: 'light' | 'dark', codeTheme?: string)`

