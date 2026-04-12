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
outlinePage.style.setProperty('--outline-link-color', isDark ? '#e0e0e0' : '#9ca3af')
outlinePage.style.setProperty('--outline-filter', isDark ? 'brightness(1.15)' : 'brightness(0.92)')
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
isDraggingNode.value = true // 触发重新渲染
themeState.type = 'dark' // 触发重新渲染
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
watch(
  () => themeState.type,
  (type) => {
    const page = document.querySelector('.outline-page')
    page?.style.setProperty('--outline-link-color', type === 'dark' ? '#e0e0e0' : '#9ca3af')
  }
)
</script>
```

**原则**：

- 修改 CSS 变量**不会**触发 Vue 重新渲染
- 适合传递主题、状态等会影响 UI 但不需要组件重新计算的数据
- 第三方可视化组件尤其需要注意

---

### 3. DOM 操作 vs CSS 变量：如何选择？

| 场景                   | 推荐方案   | 原因                            |
| ---------------------- | ---------- | ------------------------------- |
| 主题切换（颜色、亮度） | CSS 变量   | 数据驱动，不触发重渲染          |
| 拖拽状态（cursor）     | CSS 变量   | 纯视觉反馈，不需要 Vue 响应式   |
| 动画状态               | CSS 变量   | 性能好，可以使用 CSS transition |
| 复杂的交互逻辑         | Vue 响应式 | 需要组件重新计算                |
| 动态添加/移除元素      | Vue 响应式 | 必须触发重新渲染                |

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
outlinePage.dataset.theme = 'dark' // ❌ 编译错误
```

#### 解决：类型断言

```typescript
// 正确：明确指定为 HTMLElement
const outlinePage = document.querySelector('.outline-page') as HTMLElement
outlinePage.dataset.theme = 'dark' // ✅ 编译通过
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

## 从 Tab 动画问题中学到的 (Issue #21)

### 6. FLIP 动画的时序控制

#### ❌ 错误：给浏览器绘制机会

```typescript
// 错误：nextTick 后 await nextFrame 给了浏览器绘制机会
async animateTabOpen(newTabId: string) {
  const firstPositions = recordPositions()  // 记录旧位置

  await nextTick()        // DOM 更新
  await nextFrame()       // ❌ 浏览器在这里绘制了！

  // 标签已经闪现到新位置，然后再跳回旧位置播放动画
  applyInvertTransforms()  // 已经晚了
  playAnimations()
}
```

**问题**：

- `await nextFrame()` 让浏览器有机会绘制一帧
- 标签先闪现到新位置（视觉闪光）
- 然后跳回旧位置，再播放动画（抖动）

#### ✅ 正确：立即在同一帧内应用 invert

```typescript
// 正确：在同一事件循环内完成测量和应用 invert
async animateTabOpen(newTabId: string) {
  const firstPositions = recordPositions()  // 1. First: 记录旧位置

  await nextTick()  // 2. DOM 更新

  // 3. 立即在同一帧内：测量 + 计算 + 应用 invert
  const invertTransforms = new Map()

  firstPositions.forEach((first, id) => {
    const tab = getTabElement(id)
    const rect = tab.getBoundingClientRect()  // 测量新位置
    const delta = calcDelta(first, rect)       // 计算差值
    const transform = buildTransform(delta)    // 构建 transform
    invertTransforms.set(id, transform)
  })

  // 立即应用所有 invert transforms（同一帧！）
  invertTransforms.forEach((transform, id) => {
    const tab = getTabElement(id)
    tab.style.transform = transform  // Invert: 让标签看起来还在旧位置
  })

  // 4. 下一帧才播放动画
  await nextFrame()
  playAnimations()  // Play: 动画到新位置
}
```

**关键原则**：

- `nextTick()` 后立即测量并应用 invert（同一事件循环）
- 不要给浏览器绘制中间状态的机会
- `await nextFrame()` 只用于延迟动画播放

---

### 7. GPU 加速的 CSS 属性

#### 强制 GPU 层创建

```css
.tab-item {
  /* 核心 GPU 加速属性 */
  will-change: transform;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;

  /* 额外优化 */
  contain: layout style paint;
}
```

**作用**：

- `translate3d`: 强制创建 GPU 合成层
- `will-change`: 提示浏览器提前优化
- `backface-visibility`: 减少绘制开销
- `contain`: 限制布局/样式/绘制范围

---

### 8. Web Animations API vs CSS Transitions

| 特性     | WAAPI (`element.animate()`)     | CSS Transitions         |
| -------- | ------------------------------- | ----------------------- |
| 控制     | ✅ 完全控制（暂停、回放、取消） | ⚠️ 有限控制             |
| 性能     | ✅ 60fps GPU 加速               | ✅ 60fps GPU 加速       |
| 动态     | ✅ 可编程，运行时创建           | ⚠️ 需要预定义 CSS       |
| 取消     | ✅ `animation.cancel()`         | ⚠️ 需要移除 class       |
| 完成回调 | ✅ `animation.finished` Promise | ⚠️ `transitionend` 事件 |

**推荐**：复杂动画使用 WAAPI，简单悬停效果使用 CSS。

---

### 9. 动画取消与清理

```typescript
class TabAnimationController {
  private activeAnimations = new Map<string, Animation>()

  animateTab(id: string) {
    // 取消该标签已有的动画
    this.activeAnimations.get(id)?.cancel()

    const animation = tab.animate(...)
    this.activeAnimations.set(id, animation)

    // 清理
    animation.finished.then(() => {
      tab.style.transform = ''
      this.activeAnimations.delete(id)
    })
  }

  cancelAll() {
    this.activeAnimations.forEach((anim, id) => {
      anim.cancel()
      this.getTabElement(id)?.style.transform = ''
    })
    this.activeAnimations.clear()
  }
}
```

**原因**：

- 防止动画冲突（快速连续点击）
- 清理残留的 transform 样式
- 避免内存泄漏

---

### 10. 克隆元素用于退出动画

```typescript
async animateTabClose(tabId: string) {
  const tab = getTabElement(tabId)

  // 1. 创建克隆用于播放退出动画
  const clone = tab.cloneNode(true) as HTMLElement
  const rect = tab.getBoundingClientRect()

  clone.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    z-index: 9999;
    pointer-events: none;
  `

  document.body.appendChild(clone)

  // 2. 立即隐藏原元素（从 store 移除）
  tab.style.opacity = '0'
  removeTabFromStore(tabId)

  // 3. 对克隆播放退出动画
  await clone.animate([
    { transform: 'translate3d(0, 0, 0)', opacity: 1 },
    { transform: 'translate3d(-40px, 0, 0)', opacity: 0 }
  ], { duration: 200 }).finished

  clone.remove()
}
```

**优势**：

- 原元素可以立即从 DOM/Store 移除
- 视觉元素（克隆）继续播放动画
- 避免 Vue 重新渲染干扰动画

---

## 综合最佳实践

### 动画实现 Checklist

- [ ] 使用 `translate3d` 强制 GPU 加速
- [ ] FLIP 动画在同一帧内应用 invert
- [ ] 及时清理 transform 样式
- [ ] 取消冲突的动画
- [ ] 使用克隆元素播放退出动画
- [ ] 添加 `will-change` 提示浏览器优化
- [ ] 支持 `prefers-reduced-motion` 无障碍

### 性能优化

- [ ] 只动画 `transform` 和 `opacity`
- [ ] 避免动画过程中触发 layout
- [ ] 使用 `contain` 限制影响范围
- [ ] 批量 DOM 读写操作
- [ ] 使用 `requestAnimationFrame` 调度动画

---

**记录时间**: 2026-03-01  
**相关 Issue**: #25 (大纲), #21 (Tab 动画)  
**相关 PR**: #26, #27
