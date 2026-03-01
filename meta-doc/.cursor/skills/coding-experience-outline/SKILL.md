---
name: coding-experience-outline
version: 1.0.0
description: 从大纲视图闪动抽搐问题中总结的编码经验教训，包括 CSS 自定义属性正确使用、Vue 响应式边界、DOM 操作与 CSS 变量选择等
---

# 编码经验教训 - Outline 闪动抽搐问题

## 核心教训

### 1. CSS 自定义属性的正确使用

#### ❌ 错误：在 CSS 中使用条件表达式

```css
/* CSS 不支持这种语法！ */
cursor: var(--outline-dragging, 0) == 1 ? default : inherit;
stroke: var(--outline-theme-type, light) == dark ? #e0e0e0 : #9ca3af;
filter: var(--outline-theme-type, light) == dark ? brightness(1.15) : brightness(0.92);
```

**原因**：
- CSS 没有 `==` 运算符
- CSS 不支持三元条件表达式
- PostCSS/浏览器会报语法错误

#### ✅ 正确：在 TypeScript 中判断，CSS 只存储值

```typescript
// TypeScript 中进行条件判断
const isDark = theme.type === 'dark'
const outlinePage = document.querySelector('.outline-page') as HTMLElement

// 设置计算后的值
outlinePage.style.setProperty('--outline-link-color', 
  isDark ? '#e0e0e0' : '#9ca3af')
outlinePage.style.setProperty('--outline-filter', 
  isDark ? 'brightness(1.15)' : 'brightness(0.92)')
```

```css
/* CSS 中直接使用变量值 */
.tree-node {
  stroke: var(--outline-link-color, #9ca3af);
  filter: var(--outline-filter, brightness(0.92));
}
```

**原则**：CSS 变量 = 存储值；TypeScript = 逻辑判断

---

### 2. Vue 响应式系统的边界

#### ❌ 错误：在第三方组件上使用响应式 class 绑定

```vue
<template>
  <vue-tree
    :class="{
      'is-dragging': isDraggingNode,
      'outline-theme-dark': themeState.type === 'dark'
    }"
  />
</template>
```

**问题**：
- 第三方组件内部绑定了 `:style="initialTransformStyle"`
- Vue 重新渲染时重新应用初始样式
- 用户 pan/zoom 状态丢失，造成"闪动抽搐"

#### ✅ 正确：使用 CSS 自定义属性绕过 Vue 响应式

```vue
<template>
  <vue-tree class="outline-tree-inner" />
</template>

<script>
watch(() => themeState.type, (type) => {
  const page = document.querySelector('.outline-page')
  page?.style.setProperty('--outline-link-color', 
    type === 'dark' ? '#e0e0e0' : '#9ca3af')
})
</script>
```

**原则**：修改 CSS 变量**不会**触发 Vue 重新渲染

---

### 3. DOM 操作 vs CSS 变量：如何选择？

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 主题切换（颜色、亮度） | CSS 变量 | 数据驱动，不触发重渲染 |
| 拖拽状态（cursor） | CSS 变量 | 纯视觉反馈 |
| 动态添加/移除元素 | Vue 响应式 | 必须触发重新渲染 |
| 复杂的交互逻辑 | Vue 响应式 | 需要组件重新计算 |

**决策流程**：

```
需要修改的值会影响组件重新计算吗？
├── 是 → 使用 Vue 响应式
└── 否 → 是纯视觉/样式变化？
    ├── 是 → 使用 CSS 自定义属性
    └── 否 → 使用 DOM 操作
```

---

### 4. FLIP 动画时序控制

#### 错误：给浏览器绘制机会

```typescript
// ❌ 错误
async animateTabOpen() {
  const first = recordPositions()
  await nextTick()
  await nextFrame()  // 浏览器在这里绘制了！
  applyInvert()      // 标签已闪现到新位置
}
```

#### 正确：立即应用 invert

```typescript
// ✅ 正确
async animateTabOpen() {
  const first = recordPositions()
  await nextTick()
  
  // 立即在同一帧内测量并应用 invert
  const last = measurePositions()
  const delta = calcDelta(first, last)
  applyInvert(delta)  // 同一事件循环！
  
  await nextFrame()   // 下一帧才播放动画
  playAnimation()
}
```

**关键**：`nextTick()` 后立即测量并应用 invert，不给浏览器绘制机会。

---

### 5. GPU 加速 CSS

```css
.animated-element {
  will-change: transform;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  contain: layout style paint;
}
```

---

### 6. Web Animations API

```typescript
// 创建动画
const animation = element.animate(
  [
    { transform: 'translate3d(0, 0, 0)' },
    { transform: 'translate3d(100px, 0, 0)' }
  ],
  { duration: 200, easing: 'ease-out' }
)

// 取消动画
animation.cancel()

// 等待完成
await animation.finished
```

**优势**：完全控制（暂停、回放、取消），60fps GPU 加速。

---

### 7. TypeScript 类型安全

#### 问题：Element 类型没有 dataset 属性

```typescript
// ❌ 错误
const outlinePage = document.querySelector('.outline-page')
outlinePage.dataset.theme = 'dark'  // Property 'dataset' does not exist
```

#### 解决：类型断言

```typescript
// ✅ 正确
const outlinePage = document.querySelector('.outline-page') as HTMLElement
outlinePage.dataset.theme = 'dark'
```

---

### 5. Git 工作流程

#### 强制推送

```bash
# PR 已存在时，修改后需要强制推送
git push origin fix/branch-name -f
```

**注意**：
- 仅在个人分支使用 `-f`
- 确保没有其他人基于该分支工作
- 在 PR 评论中说明"已强制推送更新"

---

## 最佳实践清单

- [ ] CSS 只存储值，不处理逻辑
- [ ] TypeScript 处理条件判断
- [ ] 第三方组件避免响应式 class 绑定
- [ ] 主题/状态变化使用 CSS 变量
- [ ] 类型断言确保 TypeScript 编译通过
- [ ] 测试时检查是否触发重新渲染
- [ ] FLIP 动画立即应用 invert（不给浏览器绘制机会）
- [ ] 使用 `translate3d` 强制 GPU 加速
- [ ] 及时清理 transform 样式
- [ ] 取消冲突的动画
- [ ] 使用克隆元素播放退出动画

## 常见陷阱

1. **CSS 条件表达式** - CSS 不支持 `==` 或 `? :`
2. **过度使用响应式** - 不是所有数据都需要 Vue 响应式
3. **忽视第三方组件** - 它们可能有内部的响应式设计
4. **类型安全问题** - `Element` vs `HTMLElement`
5. **FLIP 时序错误** - `await nextFrame()` 在应用 invert 之前
6. **动画冲突** - 不取消已有动画导致抖动
7. **样式残留** - 动画结束后不清理 transform

---

**相关 Issue**: #25 (大纲), #21 (Tab 动画)  
**相关 PR**: #26, #27  
**文档**: docs/CODING_EXPERIENCE_OUTLINE_RENDER_FLASH.md