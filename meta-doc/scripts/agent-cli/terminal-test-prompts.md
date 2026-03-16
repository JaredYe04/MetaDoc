# MetaDoc Agent 终端工具测试提示词

在 MetaDoc Agent 对话中粘贴以下提示词，可系统测试终端工具的各项能力。

---

## 综合测试（推荐）

```
我是一个 MetaDoc Agent 开发者，正在测试终端工具（Terminal Execution）的功能。请你按顺序完成以下测试，每次只执行一项，并简要说明结果：

1. **单命令**：执行一条简单命令（如 dir 或 ls），确认能正确返回 stdout
2. **工作目录**：在指定目录下执行命令（如列出当前项目根目录内容）
3. **批量命令**：使用 commands 数组依次执行 cd 和 dir/ls，验证 sessionId 上下文
4. **异步模式**：使用 async: true 执行一条耗时较短的命令，确认立即返回 taskId 而不等待
5. **分析输出**：使用 analyze: true 执行一条有输出的命令，确认能返回 LLM 分析摘要

请从第 1 项开始，每完成一项告诉我结果，再继续下一项。
```

---

## 单命令测试

```
我是 agent 开发者，需要测试终端工具。请执行命令 `dir`（Windows）或 `ls -la`（Linux/macOS），并把执行结果（exitCode、stdout、stderr）简要告诉我。
```

---

## 批量 + 会话上下文测试

```
我是 agent 开发者，正在测试终端工具的批量执行和 sessionId。请使用 commands 数组和 sessionId 依次执行：
1. cd 到当前工作目录的上一级
2. 列出该目录内容

确认两条命令在同一会话中执行，且 cd 的效果被第二条命令继承。
```

---

## 异步模式测试

```
我是 agent 开发者，需要测试终端工具的 async 模式。请用 async: true 执行一条命令（如 echo "async test"），确认工具立即返回 taskId 和“命令已在后台执行”的提示，而不是等待命令完成。
```

---

## Shell 语法适配测试

```
我是 agent 开发者，需要验证终端工具能根据当前 Shell 使用正确语法。请先查看工具返回的“当前执行环境”中的 Shell 类型（cmd / PowerShell / /bin/sh），然后执行一条适合该 Shell 的链式命令（如 cmd 用 &&，PowerShell 用 ;），并报告是否成功。
```

---

## 英文版（综合测试）

```
I'm a MetaDoc Agent developer testing the Terminal Execution tool. Please run these tests in order, one at a time, and briefly report each result:

1. **Single command**: Run a simple command (e.g. dir or ls) and confirm stdout is returned
2. **Working directory**: Run a command in a specified directory (e.g. list project root)
3. **Batch + session**: Use the commands array with sessionId to run cd then dir/ls, verify context is shared
4. **Async mode**: Use async: true for a short command, confirm immediate return with taskId
5. **Analyze output**: Use analyze: true for a command with output, confirm LLM summary is returned

Start with step 1 and proceed step by step.
```
