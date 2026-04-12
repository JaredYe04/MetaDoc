# 大纲组件迁移清单

**用途**: 跟踪 JeredYe 的大纲组件从 Element Plus 到 shadcn-vue 的迁移进度  
**创建日期**: 2026-02-25  
**涉及文件**: 4 个核心文件

---

## 文件状态总览

| 文件                          | 当前状态        | 优先级    | 预计工作量 |
| ----------------------------- | --------------- | --------- | ---------- |
| `OutlineAiToolbar.vue`        | 纯 Element Plus | ⭐⭐⭐ 高 | 2-3 小时   |
| `OutlineNodeActionButton.vue` | 纯 Element Plus | ⭐⭐⭐ 高 | 1-2 小时   |
| `DetailedOutlineNode.vue`     | 混合状态        | ⭐⭐ 中   | 3-4 小时   |
| `Outline.vue`                 | 混合状态        | ⭐⭐ 中   | 4-6 小时   |

---

## 详细迁移清单

### 1. OutlineAiToolbar.vue

**文件路径**: `src/renderer/src/components/outline/OutlineAiToolbar.vue`

**当前状态**: 纯 Element Plus

**需要替换的组件**:

- [ ] `el-button` × 5 → `Button`
- [ ] `el-tooltip` × 4 → `TooltipProvider + Tooltip`
- [ ] `el-icon` 或自定义图标 → `img` + 主题图标

**迁移步骤**:

1. [ ] 修改 imports:
   - 移除: `import { ElButton, ElTooltip } from 'element-plus'`
   - 添加: `import { Button } from '@renderer/components/ui/button'`
   - 添加: `import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'`

2. [ ] 替换按钮:
   - `el-button type="primary"` → `Button variant="default"`
   - `el-button type="default"` → `Button variant="outline"`
   - `size="small"` → `size="sm"`

3. [ ] 替换工具提示:
   - `el-tooltip` → `TooltipProvider + Tooltip + TooltipTrigger + TooltipContent`

4. [ ] 替换图标:
   - 检查当前使用的图标类型
   - 改为使用主题图标系统 (`themeState.currentTheme.BranchIcon` 等)

5. [ ] 测试验证:
   - [ ] 4 个 AI 工具按钮正常显示
   - [ ] 按钮悬停显示工具提示
   - [ ] 点击按钮触发对应功能
   - [ ] 主题切换时图标正确变化

---

### 2. OutlineNodeActionButton.vue

**文件路径**: `src/renderer/src/components/outline/OutlineNodeActionButton.vue`

**当前状态**: 纯 Element Plus

**需要替换的组件**:

- [ ] `el-button` × 1 → `Button`
- [ ] `el-tooltip` × 1 → `TooltipProvider + Tooltip`

**迁移步骤**:

1. [ ] 修改 imports:
   - 移除: `import { ElButton, ElTooltip } from 'element-plus'`
   - 添加: `import { Button } from '@renderer/components/ui/button'`
   - 添加: `import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'`

2. [ ] 替换按钮:
   - `el-button` → `Button variant="ghost"`
   - `size="small"` → `size="sm"`

3. [ ] 替换工具提示:
   - `el-tooltip` → `TooltipProvider + Tooltip + TooltipTrigger + TooltipContent`

4. [ ] 测试验证:
   - [ ] 按钮在节点上正确显示
   - [ ] 悬停显示操作提示
   - [ ] 点击触发 AI 配置对话框

---

### 3. DetailedOutlineNode.vue

**文件路径**: `src/renderer/src/components/outline/DetailedOutlineNode.vue`

**当前状态**: 混合状态 (shadcn-vue Button/ScrollArea + Element Plus tooltip/icon)

**需要清理的 Element Plus 残留**:

- [ ] `el-tooltip` × 3 → `TooltipProvider + Tooltip`
- [ ] `el-icon` × 7 → `lucide-vue-next` 图标
- [ ] `el-scrollbar` × 2 → `ScrollArea` (已存在，检查重复)

**迁移步骤**:

1. [ ] 修改 imports:
   - 移除: `import { ElIcon } from 'element-plus'`
   - 移除: `import { CloseBold, Check, Close, EditPen, Minus, Star, ArrowUp } from '@element-plus/icons-vue'`
   - 添加: `import { X, Check, Pencil, Minus, Star, ArrowUp } from 'lucide-vue-next'`

2. [ ] 替换图标:
   - `el-icon` + `@element-plus/icons-vue` → `lucide-vue-next` 直接导入

3. [ ] 替换工具提示:
   - 找到所有 `el-tooltip` (约 3 处)
   - 替换为 `TooltipProvider + Tooltip + TooltipTrigger + TooltipContent`

4. [ ] 检查 scrollarea:
   - 确保使用 shadcn-vue 的 `ScrollArea`
   - 移除可能残留的 `el-scrollbar`

5. [ ] 测试验证:
   - [ ] 面板展开/折叠正常
   - [ ] 所有操作按钮显示正确
   - [ ] 按钮悬停显示工具提示
   - [ ] 内容编辑正常
   - [ ] AI 操作（扩展/缩减/润色）正常

---

### 4. Outline.vue

**文件路径**: `src/renderer/src/views/Outline.vue`

**当前状态**: 混合状态 (shadcn-vue + Element Plus 对话框/表单)

**需要清理的 Element Plus 残留**:

- [ ] `el-dialog` × 2 → `Dialog`
- [ ] `el-form` / `el-form-item` → 表单组件组合
- [ ] `el-switch` × 4 → `Switch v-model:checked`
- [ ] `el-input-number` × 1 → `NumberField`
- [ ] `el-input` × 2 → `Input`
- [ ] `el-scrollbar` × 1 → `ScrollArea`

**迁移步骤**:

1. [ ] 修改 imports:
   - 移除所有 `element-plus` 导入
   - 添加 shadcn-vue 组件导入:
     ```typescript
     import {
       Dialog,
       DialogContent,
       DialogHeader,
       DialogTitle,
       DialogFooter
     } from '@renderer/components/ui/dialog'
     import { Switch } from '@renderer/components/ui/switch'
     import { Input } from '@renderer/components/ui/input'
     import {
       NumberField,
       NumberFieldContent,
       NumberFieldDecrement,
       NumberFieldIncrement,
       NumberFieldInput
     } from '@renderer/components/ui/number-field'
     import { ScrollArea } from '@renderer/components/ui/scroll-area'
     ```

2. [ ] 替换对话框:
   - `el-dialog` → `Dialog + DialogContent + DialogHeader + DialogTitle`
   - 找到所有对话框 (格式化标题、编辑章节)

3. [ ] 替换表单:
   - `el-form` → 使用 `div class="grid gap-4"` 布局
   - `el-form-item` → 使用 `div class="grid gap-2"` + label

4. [ ] 替换 switch:
   - `el-switch v-model="x"` → `Switch v-model:checked="x"`
   - 共 4 处: adjustMarkdown, adjustTitle, cover, level1TitleChinese

5. [ ] 替换 number input:
   - `el-input-number` → `NumberField` 组件组

6. [ ] 替换 text input:
   - `el-input` → `Input`

7. [ ] 测试验证:
   - [ ] 格式化标题对话框正常打开/关闭
   - [ ] 编辑章节对话框正常打开/关闭
   - [ ] 所有 switch 控件正常工作
   - [ ] 数字输入框正常工作
   - [ ] 文本输入正常工作
   - [ ] AI 生成预览面板正常
   - [ ] 节点拖拽正常

---

## 依赖安装检查

确保以下 shadcn-vue 组件已安装：

```bash
# 检查是否已安装
npx shadcn-vue@latest add button
npx shadcn-vue@latest add tooltip
npx shadcn-vue@latest add dialog
npx shadcn-vue@latest add switch
npx shadcn-vue@latest add input
npx shadcn-vue@latest add number-field
npx shadcn-vue@latest add scroll-area
```

---

## 迁移完成验证

### 功能测试

- [ ] AI 工具栏: 4 个按钮 + 格式化按钮全部工作
- [ ] 节点按钮: 每个节点显示操作按钮
- [ ] 行内编辑: 展开节点可编辑内容
- [ ] AI 操作: 扩展/缩减/润色功能正常
- [ ] 批量操作: 多节点批量生成正常
- [ ] 节点拖拽: 树结构可拖拽重组

### UI 一致性测试

- [ ] 所有按钮使用 shadcn-vue 样式
- [ ] 所有工具提示使用 shadcn-vue 样式
- [ ] 所有对话框使用 shadcn-vue 样式
- [ ] 主题色正确应用
- [ ] 无 Element Plus 样式残留

### 控制台检查

- [ ] 无 Element Plus 相关警告
- [ ] 无 shadcn-vue 相关错误
- [ ] 大纲功能无运行时错误

---

## 常见问题

### Q: 迁移时功能丢失了怎么办？

A: JeredYe 的功能逻辑主要在 `outline-ai-utils.ts`，UI 迁移不应影响功能。如有问题，检查事件绑定和 provide/inject。

### Q: 主题图标如何迁移？

A: JeredYe 使用 `themeState.currentTheme.XXXIcon` 路径引用图标，继续沿用此模式，只需替换图标展示方式。

### Q: provide/inject 需要修改吗？

A: JeredYe 已使用 provide/inject 在组件间通信，这部分通常无需改动，只需确保 shadcn-vue 组件正确接收事件。

---

**文档结束**
