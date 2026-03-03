# MetaDoc Agent CLI

通过 TCP 连接已启动的 MetaDoc，使用**真实 agent + 真实工具**（与 GUI 内执行完全一致），便于在终端多轮对话、调试工作区文件/文件夹 CRUD 等。

## 使用步骤

1. **先以 agent-cli 模式启动 MetaDoc**（用 dev 即可，无需 build）：

   ```bash
   npm run agent-cli:dev
   ```

   或手动传参：`npm run dev -- --agent-cli-port=49384`

   启动后主进程会监听 `127.0.0.1:49384`（或 `--agent-cli-port` 指定端口），日志中可见：`agent-cli TCP server listening on 127.0.0.1:49384`。

2. **在另一终端运行 CLI 客户端**：

   ```bash
   npm run agent-cli
   ```

   或指定端口：

   ```bash
   node scripts/agent-cli/agent-cli.mjs --port=49384
   AGENT_CLI_PORT=49384 node scripts/agent-cli/agent-cli.mjs
   ```

3. **在 MetaDoc 中打开工作区**（文件夹），以便 edit、workspace、grep 等工具能访问文件。

4. **对话**：在 CLI 里输入内容回车，等待助手回复（与界面内 agent 同链路，含真实 tool calling）。

5. **命令**：
   - `/exit` 或 `/quit` – 退出 CLI
   - `/clear` – 仅提示（当前会话在服务端，未实现清空）

## 说明

- **无 mock**：执行的是与 MetaDoc 界面内完全相同的 agent 引擎与工具（edit、outline-tree、grep、workspace、terminal 等），包括对工作区文件的真实读写。
- **调试用途**：方便在不依赖 GUI 的情况下验证 tool_call 格式、多轮对话、工作区文件/文件夹 CRUD 链路。
- 若连接被拒绝，请确认已用 `--agent-cli-port=49384`（或 `npm run agent-cli:dev`）启动 MetaDoc，且端口未被占用。

## 文件说明

- `agent-cli.mjs` – CLI 入口，TCP 客户端 + readline 循环
- `lib/` – 旧版独立 LLM+mock 实现已不再被入口使用；当前真实执行在 Electron 渲染进程内完成
