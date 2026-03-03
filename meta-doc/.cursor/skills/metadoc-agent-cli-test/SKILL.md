---
name: metadoc-agent-cli-test
description: Run and test MetaDoc agent from the terminal via agent-cli (real tools, no mock). Use when testing agent tool CRUD (create/read/update/delete files and folders), debugging agent without GUI, or verifying the agent-cli TCP flow. Trigger: agent-cli, agent test, workspace CRUD, 工作区文件测试, agent 工具测试.
---

# MetaDoc Agent CLI 测试流程

通过终端启动 MetaDoc、连接 agent-cli，使用**真实 agent 与真实工具**做多轮对话与文件/文件夹 CRUD 验证。无 mock，与 GUI 内执行同链路。**CLI 模式为单步执行**：每发一条消息只执行一步（一次 LLM 或一次工具调用后即停），便于逐步查看；进度会实时输出到终端 stdout。

## 何时使用

- 测试 agent **工具**是否正常（尤其是工作区文件的增删改查）
- 不依赖 GUI 调试 agent、tool_call 格式或多轮对话
- 需要可重复的自动化/脚本化 agent 测试

## 前置条件

- **工作区**：在 MetaDoc 中已打开待测工作区。默认测试工作区：`C:\Users\tange\Documents\metadoc-agent-test`。
- **单实例**：启动带 agent-cli 的 MetaDoc 前，先关闭其他 MetaDoc 窗口，避免“已有实例”退出。

## 一、启动 MetaDoc（agent-cli 模式）

**直接用 dev 环境即可，无需先 build**。默认端口 49384。

```bash
cd d:\MetaDoc\MetaDoc\meta-doc
npm run agent-cli:dev
```

（内部为 `electron-vite dev -- --agent-cli-port=49384`。若需用已打包应用：`npx electron . --agent-cli-port=49384`。）

成功时主进程日志出现：`agent-cli TCP server listening on 127.0.0.1:49384`。

## 二、运行 CLI 客户端

### 交互式多轮对话

```bash
npm run agent-cli
# 或指定端口：AGENT_CLI_PORT=49384 node scripts/agent-cli/agent-cli.mjs
```

输入消息回车即发往 agent；**执行过程中的进度**（如 thinking、tool-calling）会实时打印到 stdout，最后打印助手回复；`/exit` 退出。每轮只执行一步，若 agent 调用了工具，会显示工具结果后停止，可再发「继续」进行下一轮。

### 非交互式（发若干条消息并收回复）

```bash
node scripts/agent-cli/send-and-receive.mjs "消息1" "消息2"
```

- 环境变量：`AGENT_CLI_PORT`（默认 49384）、`AGENT_CLI_WAIT_MS`（等端口最长时间，默认 60000）。
- 每条回复一行输出到 stdout，便于脚本校验。

## 三、Agent 工具 CRUD 测试（根本能力）

文件和文件夹的 CRUD 是 agent 的根本能力，必须先验证。建议在**默认测试工作区** `C:\Users\tange\Documents\metadoc-agent-test` 下执行。

### 测试顺序与示例提示

1. **读（List/Read）**
   - 提示示例：`列出当前工作区根目录下的所有文件和文件夹。`
   - 预期：agent 调用 workspace 相关工具，返回目录列表。

2. **建文件夹（Create directory）**
   - 提示示例：`在当前工作区根目录下创建一个文件夹，名为 agent-test-dir。`
   - 预期：工作区内出现 `agent-test-dir`。

3. **建文件并写内容（Create file + Write，含中文）**
   - 提示示例：`在工作区根目录下创建一个文件 agent-test.txt，内容为：你好世界，这是 agent 写入的中文。`
   - 预期：文件存在且内容含中文。

4. **读文件（Read file）**
   - 提示示例：`读取工作区根目录下的 agent-test.txt 并告诉我文件内容。`
   - 预期：返回内容与写入一致（含中文）。

5. **（可选）改/删**
   - 改：`把 agent-test.txt 的内容改成：已修改。`
   - 删：`删除工作区根目录下的 agent-test.txt 和 agent-test-dir 文件夹。`

### 一键跑 CRUD 测试（非交互）

```bash
node scripts/agent-cli/send-and-receive.mjs \
  "列出当前工作区根目录下的所有文件和文件夹。" \
  "在工作区根目录下创建一个文件夹 agent-test-dir。" \
  "在工作区根目录下创建文件 agent-test.txt，内容写：你好世界，这是agent写入的中文。" \
  "读取工作区根目录下的 agent-test.txt 并告诉我内容。"
```

根据 stdout 逐条核对：是否有目录列表、是否创建成功、内容是否含中文、读取是否一致。

## 四、故障排查

- **连接被拒**：确认 MetaDoc 已用 `--agent-cli-port=49384` 启动且无其他实例抢先退出；确认端口未被占用。
- **无回复或超时**：渲染进程未就绪或 LLM 未配置；多等几秒或检查主进程/渲染进程日志。
- **工具未生效**：确认 MetaDoc 中已打开目标工作区（如 `C:\Users\tange\Documents\metadoc-agent-test`），agent 才能访问该路径。

## 五、相关路径

| 说明           | 路径                                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| CLI 入口       | `scripts/agent-cli/agent-cli.mjs`                                               |
| 非交互发送     | `scripts/agent-cli/send-and-receive.mjs`                                        |
| 主进程 TCP     | `src/main/main-calls.ts`（`bindAgentCliHandlers`）                              |
| 渲染进程执行   | `src/renderer/src/utils/agent-cli-runner.ts`、`event-bus.js`（`agent-cli-run`） |
| 默认测试工作区 | `C:\Users\tange\Documents\metadoc-agent-test`                                   |

更多细节见 [reference.md](reference.md)。
