---
name: unified-action-menu
description: MetaDoc 统一操作菜单规范。使用 ItemActionMenu 组件实现列表/卡片右键菜单或「...」按钮菜单，避免 shadcn DropdownMenu 与 el-dropdown 混用导致的 hover 缺失、双击触发、Dialog 内不显示等问题。使用场景：CardGrid、SessionList、配置/引擎/工具集管理界面等需要操作菜单的地方。
---

# unified-action-menu

MetaDoc 项目内统一的操作菜单规范：所有列表项、卡片、配置项的操作菜单（右键或「...」按钮）应使用 **ItemActionMenu** 组件或遵循其样式与交互模式。

## 核心规范

1. **不混用**：禁止使用 shadcn DropdownMenu、el-dropdown 等实现操作菜单，统一使用 ItemActionMenu。
2. **触发方式**：支持右键 `@contextmenu.prevent` 或按钮点击；点击外部自动关闭。
3. **样式**：固定定位、圆角、hover 高亮、danger 项红色；z-index 10002 确保在 Dialog 之上。
4. **单次触发**：每个菜单项仅一次 click，无 select+click 双重触发。

## 组件位置

```
src/renderer/src/components/common/ItemActionMenu.vue
```

## 使用方式

### 1. 按钮触发（如 CardGrid）

```vue
<template>
  <button @click="openMenu($event, item)">...</button>
  <ItemActionMenu
    :visible="!!openItem"
    :position="menuPosition"
    :items="openItem ? getActions(openItem) : []"
    @command="handleCommand"
    @close="closeMenu"
  />
</template>

<script setup>
const openItem = ref(null)
const menuPosition = ref(null)

const openMenu = (e, item) => {
  e.stopPropagation()
  const rect = (e.currentTarget).getBoundingClientRect()
  openItem.value = item
  menuPosition.value = { x: rect.left, y: rect.bottom + 4 }
}

const closeMenu = () => {
  openItem.value = null
  menuPosition.value = null
}

const handleCommand = (command) => {
  if (openItem.value) emit('action', command, openItem.value)
  closeMenu()
}
</script>
```

### 2. 右键触发（如 SessionList）

```vue
<div @contextmenu.prevent="openContextMenu($event, item)">
  ...
</div>
<ItemActionMenu
  :visible="!!contextItem"
  :position="contextPosition"
  :items="contextItem ? getActions(contextItem) : []"
  @command="handleCommand"
  @close="closeMenu"
/>
```

```js
const openContextMenu = (e, item) => {
  contextItem.value = item
  contextPosition.value = { x: e.clientX, y: e.clientY }
}
```

## 菜单项结构

```ts
interface ItemActionMenuItem {
  command: string
  label: string
  disabled?: boolean
  danger?: boolean
}
```

## 参考实现

- **SessionList.vue**：右键菜单（`.item-menu`, `.item-menu__item`，同源样式）
- **CardGrid.vue**：「...」按钮 + ItemActionMenu
