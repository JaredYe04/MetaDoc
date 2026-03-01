# 编码经验教训总结

## 从大纲视图闪动抽搐问题中学到的

### 1. CSS 自定义属性的正确使用

#### ❌ 错误：在 CSS 中使用条件表达式

```css
/* CSS 不支持这种语法！ */
cursor: var(--outline-dragging, 0) == 1 ? default : inherit;
stroke: var(--outline-theme-type, light) == dark ? #e0e0e0 : #9ca3af;
filter: var(--outline-theme-type, light) == dark ? brightness(1.15) : brightness(0.92);
```

**问题**：
- CSS 没有 `==` 运算符
- CSS 不支持三元条件表达式 `condition ? value1 : value2`
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

**原则**：
- CSS 变量 = 存储值
- TypeScript = 逻辑判断
- 不要在 CSS 中写逻辑

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

<script>
// 当这些响应式数据变化时
isDraggingNode.value = true  // 触发重新渲染
themeState.type = 'dark'      // 触发重新渲染
</script>
```

**问题**：
- 第三方组件（vue-tree-chart）内部绑定了 `:style="initialTransformStyle"`
- Vue 重新渲染时会重新应用初始样式
- 导致用户当前的 pan/zoom 状态丢失
- 造成"闪动抽搐"现象

#### ✅ 正确：使用 CSS 自定义属性绕过 Vue 响应式

```vue
<template>
  <!-- 无任何响应式绑定 -->
  <vue-tree class="outline-tree-inner" />
</template>

<script>
// 使用 CSS 自定义属性传递数据
watch(() => themeState.type, (type) => {
  const page = document.querySelector('.outline-page')
  page?.style.setProperty('--outline-link-color', 
    type === 'dark' ? '#e0e0e0' : '#9ca3af')
})
</script>
```

**原则**：
- 修改 CSS 变量**不会**触发 Vue 重新渲染
- 适合传递主题、状态等会影响 UI 但不需要组件重新计算的数据
- 第三方可视化组件尤其需要注意

---

### 3. DOM 操作 vs CSS 变量：如何选择？

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 主题切换（颜色、亮度） | CSS 变量 | 数据驱动，不触发重渲染 |
| 拖拽状态（cursor） | CSS 变量 | 纯视觉反馈，不需要 Vue 响应式 |
| 动画状态 | CSS 变量 | 性能好，可以使用 CSS transition |
| 复杂的交互逻辑 | Vue 响应式 | 需要组件重新计算 |
| 动态添加/移除元素 | Vue 响应式 | 必须触发重新渲染 |

**决策流程**：

```
需要修改的值会影响组件重新计算吗？
├── 是 → 使用 Vue 响应式（ref/reactive）
└── 否 → 是纯视觉/样式变化？
    ├── 是 → 使用 CSS 自定义属性
    └── 否 → 使用 DOM 操作（classList/addEventListener）
```

---

### 4. TypeScript 类型安全

#### 问题：Element 类型没有 dataset 属性

```typescript
// 错误：Property 'dataset' does not exist on type 'Element'
const outlinePage = document.querySelector('.outline-page')
outlinePage.dataset.theme = 'dark'  // ❌ 编译错误
```

#### 解决：类型断言

```typescript
// 正确：明确指定为 HTMLElement
const outlinePage = document.querySelector('.outline-page') as HTMLElement
outlinePage.dataset.theme = 'dark'  // ✅ 编译通过
```

**常见类型**：
- `Element` → 基础 DOM 元素类型
- `HTMLElement` → HTML 元素，有 dataset、style 等属性
- `SVGElement` → SVG 元素

---

### 5. Git 工作流程

#### 强制推送的风险

```bash
# 当 PR 已存在时，修改后需要强制推送
git push origin fix/outline-render-flash -f
```

**注意事项**：
- 仅在个人分支使用 `-f`
- 确保没有其他人基于该分支工作
- 在 PR 评论中说明"已强制推送更新"

#### 提交信息规范

```
类型: 描述

详细说明（可选）

Fixes #Issue编号
```

**类型**：
- `fix`: 修复 bug
- `feat`: 新功能
- `refactor`: 重构
- `docs`: 文档
- `style`: 格式调整

---

### 6. 调试技巧

#### CSS 变量调试

```javascript
// 查看元素上的 CSS 变量
const element = document.querySelector('.outline-page')
const styles = getComputedStyle(element)
console.log(styles.getPropertyValue('--outline-link-color'))
// 输出: #e0e0e0
```

#### Vue DevTools

- Components 面板：查看组件是否重新渲染
- Timeline 面板：追踪响应式数据变化

---

### 7. 经验总结

#### 最佳实践清单

- [ ] CSS 只存储值，不处理逻辑
- [ ] TypeScript 处理条件判断
- [ ] 第三方组件避免响应式 class 绑定
- [ ] 主题/状态变化使用 CSS 变量
- [ ] 类型断言确保 TypeScript 编译通过
- [ ] 测试时检查是否触发重新渲染

#### 常见陷阱

1. **CSS 条件表达式** - CSS 不支持 `==` 或 `? :`
2. **过度使用响应式** - 不是所有数据都需要 Vue 响应式
3. **忽视第三方组件** - 它们可能有内部的响应式设计
4. **类型安全问题** - `Element` vs `HTMLElement`

---

**记录时间**: 2026-03-01  
**相关 Issue**: #25  
**相关 PR**: #26
