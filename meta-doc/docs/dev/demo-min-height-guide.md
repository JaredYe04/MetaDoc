# Demo 组件最小高度配置指南

## 概述

当组件在用户手册中作为 Demo 展示时，可能需要设置最小高度以确保内容能够完整显示（例如控制台面板需要显示工具栏和日志内容）。

## 推荐做法：在组件内部处理

**原则**：最小高度配置应该放在各个组件内部处理，而不是在 ManualContent.vue 中全局设置。这样可以：

- 避免全局样式污染
- 组件自我负责自己的展示逻辑
- 更容易维护和扩展

## 实现方式

### 1. 添加 mode prop

组件需要支持 `mode` prop，接受 `'normal' | 'demo'` 值：

```typescript
const props = defineProps({
  // ... 其他 props
  mode: {
    type: String,
    default: 'normal',
    validator: (value: string) => ['normal', 'demo'].includes(value)
  }
})
```

### 2. 添加 demo-mode 类名

在模板中根据 mode 动态添加类名：

```vue
<template>
  <div class="component-container" :class="{ 'demo-mode': props.mode === 'demo' }">
    <!-- 组件内容 -->
  </div>
</template>
```

### 3. 添加 demo 模式样式

在组件的 `<style>` 部分添加 demo 模式的特定样式：

```css
/* 正常模式样式 */
.component-container {
  height: 100%;
  min-height: 0;
}

/* Demo 模式：设置固定高度 */
.component-container.demo-mode {
  min-height: 300px;
  height: 300px;
}
```

## 已配置的组件

以下组件已支持 demo 模式最小高度：

| 组件               | 文件路径                                             | Demo 最小高度 | 说明                         |
| ------------------ | ---------------------------------------------------- | ------------- | ---------------------------- |
| ConsoleTerminal    | `src/renderer/src/components/ConsoleTerminal.vue`    | 300px         | 控制台终端，显示工具栏和日志 |
| ConsoleOutput      | `src/renderer/src/components/ConsoleOutput.vue`      | 250px         | 控制台输出面板               |
| LoggerConsolePanel | `src/renderer/src/components/LoggerConsolePanel.vue` | 300px         | 日志控制台面板               |

## 使用方式

在 Markdown 中使用 Demo 组件时，设置 `mode="demo"`：

```markdown
<ConsoleTerminal mode="demo" />
<ConsoleOutput mode="demo" />
<LoggerConsolePanel mode="demo" />
```

如果不设置 mode，默认为 `'normal'`，组件会保持原有的自适应行为。

## 添加新组件的步骤

如需为新的组件添加 demo 模式最小高度支持：

1. **在组件文件中添加 mode prop**

   ```typescript
   mode: {
     type: String,
     default: 'normal',
     validator: (value: string) => ['normal', 'demo'].includes(value)
   }
   ```

2. **在根元素上添加动态类名**

   ```vue
   <div :class="{ 'demo-mode': props.mode === 'demo' }"></div>
   ```

3. **添加 demo 模式样式**

   ```css
   .component-container.demo-mode {
     min-height: XXXpx;
     height: XXXpx;
   }
   ```

4. **更新本文档**，将新组件添加到"已配置的组件"表格中

## 注意事项

- **不要**在 `ManualContent.vue` 中使用全局样式设置特定组件的最小高度
- **不要**在 `demo-mode.ts` 中处理最小高度逻辑
- 保持组件的 demo 模式逻辑内聚在组件内部
- 根据组件实际内容需求设置合适的最小高度
