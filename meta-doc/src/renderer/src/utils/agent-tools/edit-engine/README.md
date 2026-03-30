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

### `match_scope: "full"` 如何工作

1. **定位**与默认 `anchor` 相同：仍用 `context_before + anchor + context_after` 拼成 **fullNeedle**，在全文（已 `normalizeNewlines`：`\r\n`/`\r`→`\n`，并去掉 UTF-8 BOM）里找 **唯一**一段。
2. **应用**时：`full` 会把 **整段匹配区间** `[fullStart, fullEnd)` 替换/删除；默认 `anchor` 只动 `[anchorStart, anchorEnd)`。
3. **精确优先**：先整段字面量 `indexOf`；若 0 命中且 **needle 末尾多写了 `\n`** 而文件在对应位置 **没有 EOF 换行**，会自动再试去掉 needle 尾部换行后匹配（缓解常见模型多写换行）。
4. 仍失败则做 **整段空白宽松**（`collapseWhitespace` 后按 token + `\s+` 正则），再在块内找 anchor；再失败才 `TARGET_NOT_FOUND`。
5. **仍失败时的常见原因**：`before`/`anchor`/`after` 与磁盘不一致（少/多一个换行、行尾空格、全角标点、模型改写了一个字）；错误信息中会带 **fullNeedle 长度与 JSON 预览**，便于对照 `workspace` 读出的原文。

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
