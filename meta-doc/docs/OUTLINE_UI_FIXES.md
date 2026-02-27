# 大纲功能 UI 修复清单

**文档类型**: UI 修复任务清单  
**创建日期**: 2026-02-25  
**记录人**: JeredYe  
**状态**: 需要修复

---

## 需要在此分支修复的问题

### 🔴 2. AI 工具栏纵向排列与溢出效果

**状态**: 需要在 shadcn-exp 分支重新实现  
**说明**:

- JeredYe 在其 main 分支已修复
- 但不打算同步到 shadcn-exp（会冲突）
- 需要我们在做 shadcn-vue 重构时一并实现

**期望效果**:

- [ ] 工具栏纵向排列（垂直方向）
- [ ] 一行只有一个按钮
- [ ] 正常情况下不溢出
- [ ] 只显示 icon，hover 或点击时显示完整 icon + 文字
- [ ] 按钮向右溢出展开

**注意**:

- 左边按钮**不需要 tooltip**
- 直接 hover 或点击时显示文字即可
- "格式化标题"按钮也要显示文字，和其他按钮保持一致（现在没有文字）
- 所有按钮圆角半径稍大一些

---

## 待修复问题

### 1. 底部按钮组样式

**位置**: `Outline.vue` 底部操作按钮区域  
**现状**: 按钮位置、大小、间距不符合设计  
**期望**:

- [ ] 按钮组浮动显示
- [ ] 居中对齐
- [ ] 按钮大小适中
- [ ] 按钮间距适中

**相关代码位置**:

```
Outline.vue 底部区域
└── 操作按钮组 (接受/拒绝/取消等)
```

**设计参考**:

```
┌─────────────────────────────┐
│                             │
│       大纲树区域             │
│                             │
│                             │
├─────────────────────────────┤
│     [按钮组浮动居中]         │
│   [接受] [拒绝] [取消]       │
└─────────────────────────────┘
```

---

### 3. 纵向模式下大纲树节点间距

**位置**: `vue-tree` 组件显示的树节点  
**现状**: 节点间距太短，同层节点挨在一起，画面紧凑  
**期望**:

- [ ] 增加同层节点之间的间距
- [ ] 调整纵向模式下的节点布局
- [ ] 确保视觉效果不拥挤

**相关代码位置**:

```
Outline.vue
└── vue-tree 组件
    └── .tree-node 样式
```

**需要调整**:

```css
/* 节点间距 - 现在节点都挨着了 */
.tree-node {
  margin-bottom: 16px; /* 增加间距，从当前值调大 */
}

/* 或 */
.vue-tree .node-wrapper {
  padding: 10px 0; /* 增加垂直间距 */
}

/* 圆角半径 - 可以稍大一些 */
.tree-node {
  border-radius: 8px; /* 从当前值调大 */
}
```

**设计要求**:

- [ ] 增加节点之间的垂直间距（现在太紧凑）
- [ ] 圆角半径稍大一些（更柔和的视觉效果）
- [ ] 确保同层节点不挨着

---

### 4. 缩放机制修复

**位置**: `Outline.vue` tree-container  
**现状**: 缩放时直接缩放整个 tree-container，而不是内部内容  
**期望**:

- [ ] tree-container 大小固定，贴近父容器
- [ ] 缩放时只缩放内部的大纲树
- [ ] 点击放大/缩小按钮时缩放内部树
- [ ] Ctrl+滚轮时缩放内部树

**相关代码位置**:

```
Outline.vue
├── tree-container (样式)
├── handleWheelZoom() 方法
└── 放大/缩小按钮事件
```

**当前问题代码** (推测):

```typescript
// 可能当前是这样：
const scale = ref(1)
// 直接缩放容器
treeContainer.style.transform = `scale(${scale.value})`

// 应该改为：
// 只缩放内部树元素
innerTreeElement.style.transform = `scale(${scale.value})`
```

**修复方向**:

1. 区分 container 和 inner tree
2. container 保持固定大小和位置
3. 缩放只应用于 inner tree 元素

---

### 5. 展开按钮点击时的位置保持

**位置**: `Outline.vue` 节点展开逻辑  
**现状**: 点击展开按钮时，大纲树图位置会变化  
**期望**:

- [ ] 点击展开按钮时，大纲树图位置**不变化**
- [ ] 展开组件显示在原节点位置
- [ ] 用户体验流畅，不跳动

**相关代码位置**:

```
Outline.vue
├── toggleNodeExpand() 方法
├── expandedNodes 状态
└── DetailedOutlineNode 组件显示逻辑
```

**可能的问题**:

- 展开 DetailedOutlineNode 时触发了 tree 的重新布局
- 节点尺寸变化导致树位置计算错误

**修复方向**:

1. 展开时不重新计算树布局
2. 使用固定定位或绝对定位显示展开组件
3. 保持原节点位置不变

---

### 6. AI 工具按钮替换展开按钮

**位置**: `Outline.vue` 节点操作区域  
**现状**: AI 工具选择时，展开按钮和 AI 工具按钮的交互不明确  
**期望**:

- [ ] 用户在 AI 工具栏选择工具时，节点的展开按钮被替换成 AI 工具按钮
- [ ] AI 工具按钮显示当前工具的 icon
- [ ] **除了 icon 以外，其他样式与原来的展开按钮保持一致**
- [ ] 原来的展开按钮暂时隐藏

**相关代码位置**:

```
Outline.vue
├── selectedAiTool 状态
├── 节点渲染模板
│   ├── 展开按钮 (条件显示)
│   └── OutlineNodeActionButton (条件显示)
└── themeState.currentTheme (图标)
```

**逻辑流程**:

```
用户选择 AI 工具 (generateChildren/generateContent/etc.)
    ↓
selectedAiTool.value = 'generateChildren'
    ↓
节点显示:
├── 隐藏: 原展开按钮
└── 显示: AI 工具按钮 (使用 generateChildren 的 icon)
    ├── 样式: 与原展开按钮一致
    └── 图标: BranchIcon (或其他对应图标)
```

**需要确认**:

- [ ] AI 工具与图标的映射关系
- [ ] 原展开按钮的样式定义
- [ ] 按钮切换的动画/过渡效果

**图标映射** (参考):
| AI 工具 | 图标 |
|---------|------|
| generateChildren | BranchIcon |
| generateContent | WriteIcon |
| generateChildrenChildren | MultiBranchIcon |
| generateChildrenContent | MultiWriteIcon |

---

## 文件位置汇总

| 问题         | 主要文件      | 相关组件/方法                         |
| ------------ | ------------- | ------------------------------------- |
| 底部按钮组   | `Outline.vue` | 底部操作按钮区域                      |
| 节点间距     | `Outline.vue` | vue-tree 样式                         |
| 缩放机制     | `Outline.vue` | tree-container, handleWheelZoom       |
| 展开位置保持 | `Outline.vue` | toggleNodeExpand, DetailedOutlineNode |
| AI 工具按钮  | `Outline.vue` | selectedAiTool, 节点模板              |

---

## 修复优先级

### 🔴 高优先级

1. **缩放机制 (#4)** - 影响核心交互体验
2. **展开位置保持 (#5)** - 影响用户体验

### 🟡 中优先级

3. **AI 工具按钮 (#6)** - 功能完善
4. **节点间距 (#3)** - 视觉优化

### 🟢 低优先级

5. **底部按钮组 (#1)** - 样式微调

---

## 测试验证

修复后需要验证：

- [ ] 底部按钮组浮动居中显示
- [ ] 树节点间距适中，不拥挤
- [ ] 缩放时只缩放树内容，不缩放容器
- [ ] 点击展开按钮时树位置不跳动
- [ ] 展开组件显示在原节点位置
- [ ] 选择 AI 工具后展开按钮正确替换
- [ ] AI 工具按钮样式与原展开按钮一致
- [ ] 所有功能在 shadcn-vue 下正常工作

---

**文档结束**

_此文档记录 JeredYe 提出的 UI 修复需求，需要在 shadcn-vue 重构时一并处理。_
