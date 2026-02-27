# 大纲功能重构冲突说明

**文档类型**: 冲突说明与解决指南  
**创建日期**: 2026-02-25  
**涉及人员**:

- JeredYe: 大纲功能开发者 (Element Plus, main 分支)
- 当前项目: shadcn-vue 全局重构 (shadcn-exp 分支)  
  **冲突提交**: bfb8425 (origin/main → shadcn-exp 合并)

---

## 冲突本质

### 并行开发导致代码库分裂

```
时间线:
─────────────────────────────────────────────────────────

main 分支 (JeredYe 开发)
├── 大纲功能需求
├── 使用 Element Plus 开发
│   ├── 大纲树 UI 重构 p1-p5
│   ├── AI 工具栏 (el-button, el-tooltip)
│   ├── 节点操作按钮 (el-button)
│   ├── 行内编辑面板 (el-icon, el-scrollbar)
│   └── 批量 AI 操作
└── 提交: 0f10a21 等

shadcn-exp 分支 (当前重构)
├── 全局 UI 重构需求
├── Element Plus → shadcn-vue 迁移
│   ├── 基础组件统一
│   ├── 主题系统重构
│   └── Tailwind + shadcn 标准化
└── 持续进行中的迁移

冲突点: bfb8425 (2026-02-23 合并)
└── JeredYe 的新大纲代码 → 进入 shadcn-exp
    └── 问题: 新代码使用 Element Plus
        └── 与 shadcn-exp 的 shadcn-vue 冲突
```

### 核心矛盾

| 维度        | JeredYe 的工作 | 当前重构工作  | 结果               |
| ----------- | -------------- | ------------- | ------------------ |
| **UI 框架** | Element Plus   | shadcn-vue    | 同一文件两种框架   |
| **时间**    | 2024-02-20~24  | 2024-02-18~25 | 并行开发           |
| **范围**    | 大纲功能专用   | 全局 UI       | 大纲文件被双重修改 |
| **分支**    | main           | shadcn-exp    | 合并时冲突         |

---

## 当前状态 (bfb8425 合并后)

### 合并策略

在 `bfb8425` 中采用以下策略：

```
冲突解决方式:
├── AutoResizeTextarea.vue
│   └── 保留: shadcn-vue ScrollArea + preset dropdown 功能
├── DetailedOutlineNode.vue
│   └── 保留: shadcn-vue Button, Tooltip, ScrollArea
└── Outline.vue
    └── 保留: shadcn-vue 组件 + JeredYe 的新 AI 功能
```

### 现状: 混合状态 (Hybrid State)

**JeredYe 新增的功能（已合并但使用 Element Plus）：**

- ✅ OutlineAiToolbar 组件 - **待迁移**
- ✅ OutlineNodeActionButton 组件 - **待迁移**
- ✅ DetailedOutlineNode 行内编辑 - **混合状态**
- ✅ 批量 AI 操作 - **混合状态**
- ✅ 节点右键菜单 - **混合状态**
- ✅ AI 配置对话框 - **混合状态**

**UI 框架分布：**

| 文件                          | Element Plus | shadcn-vue | 状态       |
| ----------------------------- | ------------ | ---------- | ---------- |
| `OutlineAiToolbar.vue`        | ✅ 完全      | ❌ 无      | **待迁移** |
| `OutlineNodeActionButton.vue` | ✅ 完全      | ❌ 无      | **待迁移** |
| `DetailedOutlineNode.vue`     | ⚠️ 部分      | ⚠️ 部分    | **混合**   |
| `Outline.vue`                 | ⚠️ 部分      | ⚠️ 部分    | **混合**   |

---

## 需要完成的工作

### 阶段 1: 迁移 JeredYe 的新组件 (高优先级)

这些组件完全使用 Element Plus，需要完整迁移：

#### 1.1 OutlineAiToolbar.vue

- **现状**: 纯 Element Plus
- **需要**: 完整迁移到 shadcn-vue
- **涉及替换**:
  - `el-button` → `Button`
  - `el-tooltip` → `TooltipProvider + Tooltip`
  - `el-icon` → `lucide-vue-next` 图标

#### 1.2 OutlineNodeActionButton.vue

- **现状**: 纯 Element Plus
- **需要**: 完整迁移到 shadcn-vue
- **涉及替换**:
  - `el-button` → `Button`
  - `el-tooltip` → `TooltipProvider + Tooltip`

### 阶段 2: 清理混合文件 (中优先级)

这些文件同时包含两种框架，需要清理：

#### 2.1 DetailedOutlineNode.vue

- **现状**: 混合状态
- **需要**: 移除剩余的 Element Plus
- **涉及替换**:
  - `el-tooltip` → `Tooltip`
  - `el-icon` → `lucide-vue-next`
  - `el-scrollbar` → `ScrollArea`

#### 2.2 Outline.vue

- **现状**: 混合状态
- **需要**: 移除剩余的 Element Plus
- **涉及替换**:
  - `el-dialog` → `Dialog`
  - `el-form` → 表单组件组合
  - `el-switch` → `Switch`
  - `el-input-number` → `NumberField`

### 阶段 3: 验证功能 (高优先级)

迁移后需要验证 JeredYe 的功能仍然正常：

- [ ] AI 工具栏按钮点击正常
- [ ] 节点操作按钮点击正常
- [ ] 行内编辑面板正常弹出
- [ ] AI 生成内容的接受/拒绝流程正常
- [ ] 批量 AI 操作正常
- [ ] 节点拖拽重组正常

---

## 迁移指南

### Element Plus → shadcn-vue 映射表

| Element Plus               | shadcn-vue                                                    |
| -------------------------- | ------------------------------------------------------------- |
| `el-button type="primary"` | `Button variant="default"`                                    |
| `el-button type="default"` | `Button variant="outline"`                                    |
| `el-button type="danger"`  | `Button variant="destructive"`                                |
| `el-button type="success"` | `Button variant="default" class="bg-green-600"`               |
| `el-button type="warning"` | `Button variant="outline" class="text-yellow-600"`            |
| `el-tooltip`               | `TooltipProvider + Tooltip + TooltipTrigger + TooltipContent` |
| `el-dialog`                | `Dialog + DialogContent + DialogHeader + DialogTitle`         |
| `el-switch v-model="x"`    | `Switch v-model:checked="x"`                                  |
| `el-input`                 | `Input`                                                       |
| `el-input-number`          | `NumberField`                                                 |
| `el-form` / `el-form-item` | 表单组件组合                                                  |
| `el-icon`                  | `lucide-vue-next` 图标                                        |
| `el-scrollbar`             | `ScrollArea`                                                  |

### 迁移示例

以 OutlineAiToolbar.vue 的按钮为例：

```vue
<!-- 迁移前 (Element Plus) -->
<el-tooltip content="生成子章节" placement="top">
  <el-button type="primary" size="small" @click="handleGenerate">
    <el-icon><Branch /></el-icon>
    生成子章节
  </el-button>
</el-tooltip>

<!-- 迁移后 (shadcn-vue) -->
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="default" size="sm" @click="handleGenerate">
        <img :src="BranchIcon" class="w-4 h-4 mr-1" />
        生成子章节
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top">
      <p>生成子章节</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## 相关文件清单

### JeredYe 新增的文件 (需要迁移):

```
src/renderer/src/components/outline/
├── OutlineAiToolbar.vue              # 待完整迁移
├── OutlineNodeActionButton.vue       # 待完整迁移
├── DetailedOutlineNode.vue           # 混合状态，需清理
└── StreamingJsonTree.vue             # 新增，检查是否需要调整

src/renderer/src/views/
└── Outline.vue                       # 混合状态，需清理

src/renderer/src/utils/
├── outline-ai-utils.ts               # 功能逻辑，通常无需改动
├── outline-helpers.ts                # 辅助函数，通常无需改动
└── outline-normalize.ts              # 标题规范化，通常无需改动
```

### 参考文档:

- `MIGRATION_GUIDE.md` - 架构迁移指南
- `src/renderer/src/components/outline/AGENTS.md` - 大纲组件迁移笔记
- `ELEMENT_UI_MIGRATION_REPORT.md` - Element Plus 迁移报告

---

## 总结

**问题**: JeredYe 在 main 分支用 Element Plus 开发大纲功能，与 shadcn-exp 分支的 shadcn-vue 全局重构产生冲突。

**现状**: bfb8425 合并后，大纲功能代码已合并到 shadcn-exp，但仍是 Element Plus 实现，与项目的 shadcn-vue 标准冲突。

**解决方案**:

1. 迁移 OutlineAiToolbar.vue 到 shadcn-vue
2. 迁移 OutlineNodeActionButton.vue 到 shadcn-vue
3. 清理 DetailedOutlineNode.vue 的 Element Plus 残留
4. 清理 Outline.vue 的 Element Plus 残留
5. 验证所有功能正常

---

**文档结束**
