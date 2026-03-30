# Edit Engine V2

工业级文本编辑执行层：接收 **anchor + 可选 context** 的定位意图，在渲染进程内对字符串做**可校验**的替换 / 插入 / 删除。

## 设计原则

1. **LLM 只产出意图**（`EditOperation[]`），不直接改文件。
2. **禁止行号**、禁止以 **unified diff patch** 作为输入格式。
3. **定位失败或多候选必须抛错**，不猜测。
4. 多编辑按 **数组顺序** 依次应用；每一步在**上一步结果**上重新定位。

## 定位与操作

| 能力 | 说明 |
|------|------|
| **空 anchor** | 非空文件须至少提供 `context_before` 或 `context_after`，且 `before+anchor+after` 全文**精确**匹配唯一。 |
| **insert_at** | `before` / `after`（默认）：相对锚段的插入点。 |
| **insert_newline_policy** | `auto`（默认）：`insert_at:after` 时避免新内容与锚后同行粘连（见 `apply.ts`）；`none` 为纯拼接。 |
| **match_scope** | `anchor`（默认）：只替换/删除 **anchor** 子串，context 仅用于**定位**。`full`：替换/删除 **整段** `context_before+anchor+context_after` 的**一次字面匹配**（范围可能很长，勿与「只删标题」混淆）。 |
| **空 anchor + replace/delete** | 须 `match_scope: "full"`，并配合 context。 |

## 模块

| 文件 | 职责 |
|------|------|
| `types.ts` | `EditOperation`、`EditPlan`、错误类型 |
| `normalize.ts` | `\r\n` → `\n` |
| `locate.ts` | 精确匹配 → 整段模糊 → 仅 anchor 模糊；空 anchor 仅精确 |
| `apply.ts` | replace / insert / delete（insert 默认智能换行） |
| `postprocess.ts` | 行尾 trim |
| `index.ts` | `applyEdits`、`applyEditSequenceRaw` |

## 调用示例

```ts
import { applyEdits } from './edit-engine'

// 只删除 ### 新增章节，长 context 仅用于唯一性（不要用 match_scope full）
applyEdits(doc, [
  {
    id: '1',
    type: 'delete',
    target: {
      anchor: '### 新增章节',
      context_before: '...',
      context_after: '...'
    }
  }
])

// 删除从「章节1」到「说明文字」整段连续字面量时才用 full
applyEdits(doc, [
  {
    id: '2',
    type: 'delete',
    match_scope: 'full',
    target: { anchor: '...', context_before: '...', context_after: '...' }
  }
])
```

## 与 `edit-tool.ts` 的关系

- Agent 工具解析 `edits` / `editPlan` / `editsJson`，调用 `applyEdits`。
- 展示用 hunks 由 `ApplyEditLogEntry` 合成。

## 测试

```bash
npx vitest run src/renderer/src/utils/agent-tools/edit-engine/edit-engine.test.ts
```
