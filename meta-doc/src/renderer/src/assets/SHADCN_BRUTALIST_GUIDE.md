# Element Plus shadcn/粗野主义风格设计系统

## 概述

本设计系统为 Element Plus 组件提供 shadcn/ui 风格和粗野主义（Brutalism）设计的替代方案。

### 核心特性

- ✅ **去掉小三角指向** - 参考 shadcn/ui，所有 popover/dropdown 移除箭头
- ✅ **现代化列表动画** - 简洁的 fade + slide，无 2010s 弹性动画
- ✅ **粗野主义原则** - 直角/极小圆角、硬边阴影、无过渡、直接反馈

## 文件结构

```
assets/
├── element-plus-theme-override.css    # 基础主题覆盖（已存在）
├── shadcn-brutalist-theme.css         # 新增：shadcn/粗野主义风格
```

## 使用方法

### 1. 导入 CSS 文件

在 `main.js` 或 `App.vue` 中导入：

```javascript
// main.js
import './assets/element-plus-theme-override.css'
import './assets/shadcn-brutalist-theme.css' // 新增
```

### 2. 组件使用方式（无需修改）

无需修改现有组件使用方式，CSS 会自动覆盖样式：

```vue
<template>
  <!-- Dropdown - 自动应用新样式 -->
  <el-dropdown>
    <el-button>下拉菜单</el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item>选项一</el-dropdown-item>
        <el-dropdown-item>选项二</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>

  <!-- Popover - 自动应用新样式 -->
  <el-popover title="标题" content="内容">
    <template #reference>
      <el-button>弹出框</el-button>
    </template>
  </el-popover>

  <!-- Select - 自动应用新样式 -->
  <el-select v-model="value">
    <el-option label="选项一" value="1" />
    <el-option label="选项二" value="2" />
  </el-select>

  <!-- Menu - 自动应用新样式 -->
  <el-menu>
    <el-sub-menu title="子菜单">
      <el-menu-item>菜单项</el-menu-item>
    </el-sub-menu>
  </el-menu>

  <!-- Tooltip - 自动应用新样式 -->
  <el-tooltip content="提示内容">
    <el-button>悬停提示</el-button>
  </el-tooltip>
</template>
```

## 组件设计详情

### 1. Dropdown 下拉菜单

**设计变化：**

- 移除箭头指向（`display: none`）
- 2px 圆角，硬边阴影
- 动画：fade + 轻微 scale，100ms，无弹性
- 菜单项：8px 12px padding，2px 间距

**CSS 关键规则：**

```css
.el-dropdown__popper.el-popper {
  border-radius: 2px;
  box-shadow:
    0 0 0 1px var(--el-border-color),
    0 4px 12px rgba(0, 0, 0, 0.08);
}

.el-dropdown__popper .el-popper__arrow {
  display: none; /* 去掉箭头 */
}
```

**动画规格：**

- 进入：100ms, `cubic-bezier(0.25, 0.1, 0.25, 1)`
- 离开：80ms, `cubic-bezier(0.4, 0, 1, 1)`

---

### 2. Popover 气泡卡片

**设计变化：**

- 移除箭头指向
- 硬边直角，1px outline 边框感
- 标题带底部边框分隔
- 动画：fade + translateY，120ms

**CSS 关键规则：**

```css
.el-popover.el-popper {
  border-radius: 2px;
  box-shadow:
    0 0 0 1px var(--el-border-color),
    0 4px 16px rgba(0, 0, 0, 0.08);
  padding: 12px;
}

.el-popover__title {
  border-bottom: 1px solid var(--el-border-color);
  font-weight: 600;
}
```

---

### 3. Select 选择器下拉

**设计变化：**

- 移除箭头指向
- 选项紧凑排列（8px 12px padding）
- 选中状态：主色背景 + 粗体字
- 分组标题：小字、大写、字母间距

**CSS 关键规则：**

```css
.el-select__popper.el-popper .el-popper__arrow {
  display: none;
}

.el-select-dropdown__item.selected {
  background-color: var(--el-color-primary-light-9);
  font-weight: 500;
}

.el-select-group__title {
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 12px;
}
```

---

### 4. Menu 菜单展开

**设计变化：**

- 子菜单弹出层移除箭头
- 菜单项高度 36px，紧凑布局
- 箭头旋转 90° 无过渡动画
- 展开/收起：无动画（instant）

**CSS 关键规则：**

```css
.el-sub-menu__popper.el-popper {
  border-radius: 2px;
  padding: 4px;
}

.el-sub-menu__icon-arrow {
  transition: transform 0.08s linear;
}

.el-sub-menu.is-opened > .el-sub-menu__title .el-sub-menu__icon-arrow {
  transform: rotate(90deg);
}
```

---

### 5. Tooltip 文字提示

**设计变化：**

- 默认保留小箭头（与 shadcn 略有不同）
- 如需去掉箭头，取消注释 CSS 中的代码块
- 极简设计：小字、小 padding、淡动画

**去掉箭头的 CSS：**

```css
.el-tooltip__popper.el-popper .el-popper__arrow {
  display: none !important;
}
```

---

## 动画规格总览

| 动画类型     | 时长      | 缓动函数                           | 说明     |
| ------------ | --------- | ---------------------------------- | -------- |
| 按钮按压     | 50-80ms   | linear                             | 即时反馈 |
| 下拉菜单出现 | 100-120ms | `cubic-bezier(0.25, 0.1, 0.25, 1)` | 自然减速 |
| 下拉菜单消失 | 80ms      | `cubic-bezier(0.4, 0, 1, 1)`       | 加速消失 |
| Popover 出现 | 120ms     | `cubic-bezier(0.25, 0.1, 0.25, 1)` | 自然减速 |
| Tooltip 出现 | 80ms      | ease-out                           | 极淡     |
| 菜单项滑入   | 100ms     | linear                             | 简洁直接 |

### 避免的动画

❌ **不要使用：**

- `ease-in-out-back` - 回弹效果，过于花哨
- `spring` 动画 - 弹性感，不够直接
- 超过 200ms 的过渡 - 感觉迟缓
- `transform: scale(0.8)` 过度缩放 - 突兀

---

## 视觉样式规范

### 圆角

| 元素   | 圆角值 | 说明     |
| ------ | ------ | -------- |
| 按钮   | 2px    | 极小圆角 |
| 输入框 | 2px    | 统一风格 |
| 卡片   | 2px    | 硬边感   |
| 对话框 | 2px    | 简洁     |
| 弹出层 | 2px    | 一致     |
| 菜单项 | 2px    | 轻微圆角 |

### 阴影层级

| 层级   | 阴影值                                                | 用途       |
| ------ | ----------------------------------------------------- | ---------- |
| 层级 1 | `1px 1px 0 0 rgba(0,0,0,0.05)`                        | hover 状态 |
| 层级 2 | `0 0 0 1px border-color, 0 4px 12px rgba(0,0,0,0.08)` | 下拉菜单   |
| 层级 3 | `0 0 0 1px border-color, 0 8px 24px rgba(0,0,0,0.08)` | 对话框     |

**特点：** 使用 `0 0 0 1px` outline 创造粗野主义边框感

### 间距

| 元素           | 值       | 说明           |
| -------------- | -------- | -------------- |
| 菜单项内边距   | 8px 12px | 紧凑舒适       |
| 菜单项间距     | 2px 0    | 微小分隔       |
| 菜单容器内边距 | 4px      | 整体边距       |
| 弹出层边距     | 4px      | 与触发元素距离 |

### 颜色

| 状态         | 值                                  | 说明     |
| ------------ | ----------------------------------- | -------- |
| 默认文字     | `var(--el-text-color-regular)`      | 中性灰   |
| 悬停背景     | `var(--el-fill-color-light)`        | 浅灰     |
| 激活 outline | `2px solid var(--el-color-primary)` | 主色硬边 |
| 选中背景     | `var(--el-color-primary-light-9)`   | 主色浅色 |

---

## 暗色模式

所有组件已适配暗色模式：

```css
html.dark .el-dropdown__popper.el-popper {
  box-shadow:
    0 0 0 1px var(--el-border-color-darker),
    0 4px 12px rgba(0, 0, 0, 0.3);
}
```

---

## 与现有主题的关系

```
┌─────────────────────────────────────────────────────────┐
│  Element Plus 默认样式                                   │
├─────────────────────────────────────────────────────────┤
│  element-plus-theme-override.css (基础变量覆盖)          │
│  - 主色调改为炭灰                                        │
│  - 按钮/输入框按压效果                                    │
│  - 基础 transition 时长调整                              │
├─────────────────────────────────────────────────────────┤
│  shadcn-brutalist-theme.css (新增)                      │
│  - Dropdown/Popover 去掉箭头                             │
│  - 现代化列表动画                                        │
│  - 粗野主义阴影和圆角                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 自定义修改

### 修改圆角

```css
/* 在 shadcn-brutalist-theme.css 中搜索替换 */
:root {
  --brutalist-radius: 0px; /* 改为 0 完全直角 */
}
```

### 修改动画速度

```css
/* 加快动画 */
:root {
  --el-transition-duration: 0.05s;
}

/* 完全禁用动画 */
.el-popper {
  animation: none !important;
}
```

### 恢复箭头

```css
/* 恢复 Dropdown 箭头 */
.el-dropdown__popper.el-popper .el-popper__arrow {
  display: block !important;
}
```

---

## 兼容性

- ✅ Element Plus 2.x+
- ✅ Vue 3
- ✅ 暗色模式
- ✅ 响应式

---

## 参考资源

- [shadcn/ui](https://ui.shadcn.com/) - 设计灵感来源
- [Radix UI](https://www.radix-ui.com/) - 无头组件设计
- [Brutalist Web Design](https://brutalistwebsites.com/) - 粗野主义风格参考
