# 终端重构计划：从 Monaco 模拟终端迁移到 node-pty + xterm.js

> 本文档描述将 MetaDoc 的集成终端从当前自研实现迁移到 VS Code 风格的 node-pty + xterm.js 方案的完整计划。**仅供实施参考，不直接修改代码。**

---

## 一、当前实现情况

### 1.1 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 渲染进程 (Renderer)                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  PlainTextEditor.vue          LaTeXEditor.vue                                │
│  ┌─────────────────────┐     ┌─────────────────────┐                       │
│  │ ConsoleTerminal.vue  │     │ ConsoleOutput.vue    │                       │
│  │ (可交互，Monaco UI)   │     │ (只读，Monaco UI)    │                       │
│  │ consoleKey: plaintext│     │ consoleKey: latex   │                       │
│  └──────────┬──────────┘     └──────────┬──────────┘                       │
│             │                           │                                    │
│             │ eventBus.emit             │ eventBus.on / messageBridge.on     │
│             │ 'console-input'           │ 'console-out', 'console-err'      │
│             ▼                           ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ messageBridge (IPC)                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ IPC invoke / send
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 主进程 (Main)                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  main-calls.ts: bindTerminalHandlers()                                       │
│  - terminal-get-cwd, terminal-set-cwd, terminal-set-encoding                │
│  - execute-terminal-command: spawn(shell, ['/c', command])  ← 每次新进程    │
│  - terminal-send-input, terminal-send-interrupt                             │
│  - get-terminal-environment                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

#### 1.2.1 ConsoleTerminal.vue（PlainTextEditor 使用）

- **路径**: `src/renderer/src/components/ConsoleTerminal.vue`
- **功能**: 可交互式终端，用户输入命令并执行
- **UI**: Monaco Editor 模拟终端（readOnly: false，手动维护 `lines`、`currentInput`、提示符等）
- **特性**:
  - 命令历史（上下箭头）
  - Tab 路径补全
  - 多行命令（`\` 结尾）
  - cd 命令本地处理（`terminal-set-cwd`）
  - 字符编码切换（terminal-set-encoding）
  - Ctrl+C 中断（terminal-send-interrupt）
- **数据流**:
  - 用户输入 → Enter → `eventBus.emit('console-input', { key, content })`
  - PlainTextEditor 监听 → `messageBridge.invoke('execute-terminal-command', ...)`
  - 主进程 spawn 子进程 → stdout/stderr → IPC `terminal-stdout-stream` / `terminal-stderr-stream`
  - PlainTextEditor 监听 IPC → `eventBus.emit('console-out'/'console-err')`
  - ConsoleTerminal 监听 eventBus → `handleOutPayload` → 追加到 `lines`，`renderConsole()`

#### 1.2.2 ConsoleOutput.vue（LaTeXEditor 使用）

- **路径**: `src/renderer/src/components/ConsoleOutput.vue`
- **功能**: 只读输出，用于 LaTeX 编译日志
- **UI**: Monaco Editor 只读，结构与 ConsoleTerminal 类似
- **数据流**:
  - LaTeX 编译在主进程 `latex-service.ts` 中执行
  - 编译输出通过 `mainWindow.webContents.send('console-out', ...)` / `mainWindow.webContents.send('console-err', ...)` 发送
  - 渲染进程通过 `messageBridge.on('console-out', ...)` 接收（或 eventBus 的 emit）
  - ConsoleOutput 监听并追加到 `lines`

#### 1.2.3 主进程终端逻辑（main-calls.ts）

- **Shell 配置**: `getTerminalShellConfig()` → Windows: `cmd.exe` + `/c`，macOS/Linux: `/bin/sh` + `-c`
- **执行模式**: `spawn(shell, [...shellArgs, runCommand], { stdio: ['pipe','pipe','pipe'] })`
  - 每次命令创建一个新进程，执行完即退出
  - 无持久 PTY，无法支持 vim、python 等交互式程序
- **状态维护**:
  - `terminalProcesses`: invocationId → process
  - `terminalCwds`: consoleKey → cwd
  - `terminalEncodings`: consoleKey → encoding
  - `terminalInvocationEncodings`: invocationId → encoding（用于 Agent 调用的 UTF-8）

#### 1.2.4 Agent 终端工具（terminal-tool.ts）

- **路径**: `src/renderer/src/utils/agent-tools/terminal-tool.ts`
- **功能**: AI 执行命令，需用户批准（可设置信任模式）
- **调用**: `messageBridge.invoke('execute-terminal-command', { command, invocationId, consoleKey, ... })`
- **监听**: `terminal-stdout-stream`, `terminal-stderr-stream`, `terminal-close`, `terminal-error`
- **特点**: 需要**单次执行**并**等待**完整输出，与交互式终端不同

#### 1.2.5 LaTeX 编译输出

- **路径**: `src/main/utils/latex-service.ts`
- 编译输出通过 `mainWindow.webContents.send('console-out'/'console-err')` 直接发送
- 与 PTY 无关，是独立进程的 stdout/stderr

### 1.3 当前 IPC 通道一览

| 通道 | 方向 | 用途 |
|------|------|------|
| `terminal-get-cwd` | invoke | 获取/初始化终端 cwd |
| `terminal-set-cwd` | invoke | cd 命令切换目录 |
| `terminal-set-encoding` | invoke | 设置字符编码 |
| `execute-terminal-command` | invoke | 执行命令（spawn 新进程） |
| `terminal-send-input` | invoke | 向进程 stdin 写入（交互式输入） |
| `terminal-send-interrupt` | invoke | Ctrl+C 中断 |
| `terminal-stdout-stream` | send | 主进程 → 渲染进程 stdout |
| `terminal-stderr-stream` | send | 主进程 → 渲染进程 stderr |
| `terminal-close` | send | 进程结束 |
| `terminal-error` | send | 进程错误 |
| `get-terminal-environment` | invoke | 获取 OS + Shell 信息（供 Agent 使用） |
| `console-out` | send | 主进程 → 渲染进程（LaTeX 编译等） |
| `console-err` | send | 主进程 → 渲染进程（LaTeX 编译等） |

### 1.4 当前限制与问题

1. **非真实终端**: 每次命令新进程，无持久 shell，无法运行 vim、python 交互式等
2. **UI 自研**: Monaco 模拟终端，需手动维护提示符、历史、光标、ANSI 等
3. **Shell 固定**: 仅支持 cmd.exe（Windows）或 /bin/sh（Unix），无 PowerShell 等选择
4. **编码复杂**: 需手动解码、strip ANSI、处理 GBK/UTF-8 切换

---

## 二、目标架构

### 2.1 技术选型

| 层级 | 当前 | 目标 |
|------|------|------|
| 后端 | `child_process.spawn` 每次新进程 | `node-pty` 持久 PTY |
| 前端 UI | Monaco Editor 模拟 | xterm.js 真实终端模拟 |
| Shell | 固定 cmd/sh | 可选 cmd / PowerShell / bash |

### 2.2 目标架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 渲染进程                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  PlainTextEditor.vue                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ XtermConsole.vue (新)                                                 │   │
│  │ - xterm.js Terminal 实例                                              │   │
│  │ - term.onData → IPC terminal-write                                    │   │
│  │ - IPC terminal-data → term.write                                      │   │
│  │ - Shell 选择: cmd / PowerShell / bash                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ IPC
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 主进程                                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  terminal-create: node-pty.spawn(shell, [], { cwd, cols, rows })            │
│  terminal-write: ptyProcess.write(data)                                     │
│  terminal-resize: ptyProcess.resize(cols, rows)                             │
│  terminal-kill: ptyProcess.kill()                                            │
│  ptyProcess.onData → webContents.send('terminal-data', { consoleKey, data })│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 保留的组件与逻辑

- **ConsoleOutput.vue**（LaTeXEditor）: 保持现状，用于 LaTeX 编译日志（只读）
- **Agent terminal-tool**: 仍需要 `execute-terminal-command` 单次执行并等待输出，可保留现有 spawn 逻辑，或改为向 PTY 写入命令并监听输出
- **LaTeX 编译**: 继续通过 `console-out` / `console-err` 发送，不经过 PTY

---

## 三、迁移步骤

### 阶段一：依赖与基础设施

#### 步骤 1.1 添加依赖

```bash
npm install node-pty xterm xterm-addon-fit
```

- `node-pty`: 原生模块，需在 `postinstall` 中执行 `electron-rebuild`（或扩展现有 `rebuild-native` 脚本）
- `xterm`: 终端 UI
- `xterm-addon-fit`: 自动适应容器大小

#### 步骤 1.2 扩展 postinstall

在 `package.json` 的 `postinstall` 中确保 `node-pty` 被正确编译：

```json
"postinstall": "... && npm run rebuild-native",
"rebuild-native": "electron-rebuild -f -w better-sqlite3,node-pty --only better-sqlite3,node-pty"
```

（具体需根据现有 `rebuild-native` 脚本调整）

### 阶段二：主进程 PTY 服务

#### 步骤 2.1 创建 PTY 管理模块

建议新建 `src/main/utils/terminal-pty-service.ts`（或类似路径），负责：

- 维护 `consoleKey → pty.IPty` 映射
- 按 `terminal-create` 创建 PTY
- 按 `terminal-write` 写入
- 按 `terminal-resize` 调整尺寸
- 按 `terminal-kill` 销毁
- 将 `ptyProcess.onData` 转发到对应 `webContents.send('terminal-data', { consoleKey, data })`
- 将 `ptyProcess.onExit` 清理映射并通知渲染进程

#### 步骤 2.2 新增 IPC 通道

| 通道 | 类型 | 参数 | 说明 |
|------|------|------|------|
| `terminal-create` | invoke | `{ consoleKey, cwd?, shell? }` | 创建 PTY，shell 默认 cmd / powershell / bash |
| `terminal-write` | invoke | `{ consoleKey, data: string }` | 向 PTY 写入 |
| `terminal-resize` | invoke | `{ consoleKey, cols, rows }` | 调整 PTY 尺寸 |
| `terminal-kill` | invoke | `{ consoleKey }` | 终止 PTY |
| `terminal-data` | send | `{ consoleKey, data: string }` | PTY 输出 → 渲染进程 |

#### 步骤 2.3 保留现有通道（兼容 Agent 与 LaTeX）

- `execute-terminal-command`、`terminal-send-input`、`terminal-send-interrupt` 等保留，供 Agent 工具使用
- `get-terminal-environment` 需扩展，返回 PTY 可用的 shell 列表及当前默认 shell

### 阶段三：渲染进程 XtermConsole 组件

#### 步骤 3.1 创建 XtermConsole.vue

- **路径**: `src/renderer/src/components/XtermConsole.vue`
- **功能**:
  - 挂载时调用 `terminal-create` 创建 PTY
  - 使用 xterm.js 的 `Terminal` + `FitAddon` 渲染
  - `term.onData` → `messageBridge.invoke('terminal-write', { consoleKey, data })`
  - `messageBridge.on('terminal-data', (event, { consoleKey, data })` → 若 `consoleKey` 匹配则 `term.write(data)`
  - 容器 resize 时调用 `terminal-resize`
  - 卸载时调用 `terminal-kill`

#### 步骤 3.2 工具栏与 Shell 选择

- 在 header 中增加 Shell 选择（cmd / PowerShell / bash）
- 保留清空、复制、保存日志等按钮（xterm 有相应 API）
- 字符编码：若 node-pty 在 Windows 上默认使用系统编码，可在 shell 启动时设置环境变量或执行 `chcp 65001`（需根据实际测试调整）

#### 步骤 3.3 主题与样式

- 从 `themeState` 读取背景色、前景色等，配置到 `Terminal` 的 `theme` 选项
- 监听 `sync-editor-theme` 等事件，同步主题

### 阶段四：替换 ConsoleTerminal

#### 步骤 4.1 在 PlainTextEditor 中替换

- 将 `<ConsoleTerminal ... />` 替换为 `<XtermConsole ... />`
- 传入 `consoleKey="plaintext"`、`initialDirectory` 等 props
- 移除 `console-input` 事件监听（XtermConsole 直接与 PTY 通信，无需通过 PlainTextEditor）

#### 步骤 4.2 移除 PlainTextEditor 中的终端相关逻辑

- 移除 `handleConsoleInput`
- 移除 `handleTerminalStdoutStream`、`handleTerminalStderrStream`、`handleTerminalClose`、`handleTerminalError`
- 移除 `eventBus.on('console-input', ...)` 及 `messageBridge.on('terminal-*', ...)`
- 移除 `currentInvocationId` 等

### 阶段五：Agent 兼容

#### 方案 A：保留 execute-terminal-command（推荐）

- Agent 继续使用 `execute-terminal-command` 单次执行
- 主进程继续用 `spawn` 实现，与 PTY 并存
- `get-terminal-environment` 需区分：交互式终端用 PTY 的 shell，Agent 用当前 spawn 的 shell

#### 方案 B：Agent 向 PTY 写入命令

- 若 Agent 使用与用户相同的 consoleKey（如 plaintext），可向 PTY 写入命令
- 需监听 PTY 输出并解析「命令结束」时机（如提示符再次出现），实现复杂
- 不推荐作为首选

### 阶段六：Demo 模式与手册

- 手册中使用的 `<ConsoleTerminal mode="demo" ... />` 展示静态内容
- 可选：保留 `ConsoleTerminal` 的 demo 模式，或新建 `XtermConsole` 的 demo 模式（仅展示静态文本，不创建 PTY）
- 需更新所有引用 `ConsoleTerminal` 的手册文件（如 `manuals/**/*.md`）

### 阶段七：ConsoleTerminal 的废弃与清理

- 确认 PlainTextEditor 仅使用 XtermConsole 后，可将 `ConsoleTerminal.vue` 标记为废弃或删除
- 若 LaTeXEditor 的 ConsoleOutput 仍在使用 Monaco，可保留；若需统一风格，可后续再迁移

---

## 四、文件变更清单

### 新增文件

| 路径 | 说明 |
|------|------|
| `src/main/utils/terminal-pty-service.ts` | PTY 管理逻辑（可选，也可直接写在 main-calls 中） |
| `src/renderer/src/components/XtermConsole.vue` | 基于 xterm.js 的终端组件 |

### 修改文件

| 路径 | 修改内容 |
|------|----------|
| `package.json` | 添加 node-pty、xterm、xterm-addon-fit；扩展 rebuild-native |
| `src/main/main-calls.ts` | 添加 terminal-create/write/resize/kill 及 terminal-data 转发 |
| `src/renderer/src/views/PlainTextEditor.vue` | 用 XtermConsole 替换 ConsoleTerminal，移除终端相关逻辑 |
| `src/renderer/src/locales/*.json` | 如有新 UI 文案（如 Shell 选择）需补充 |

### 可能保留或废弃

| 路径 | 说明 |
|------|------|
| `src/renderer/src/components/ConsoleTerminal.vue` | 迁移完成后可废弃或删除 |
| `src/renderer/src/components/ConsoleOutput.vue` | 保留，LaTeX 编译日志 |

---

## 五、Shell 选择策略

### Windows

- `cmd.exe`: 默认，兼容旧脚本
- `powershell.exe`: 可选，需检测是否安装
- `pwsh.exe`: PowerShell Core（若已安装）

### macOS / Linux

- `process.env.SHELL` 或 `/bin/bash`、`/bin/zsh` 等

### 实现建议

- 在设置或终端配置中增加「默认 Shell」选项
- 在 XtermConsole 的 header 中提供下拉选择，切换时重建 PTY（先 kill 再 create）

---

## 六、风险与注意事项

1. **node-pty 原生模块**: 需在目标平台正确编译，CI 与打包需验证
2. **编码**: Windows 下 node-pty 默认编码可能非 UTF-8，需在 shell 启动时设置环境变量或执行 `chcp 65001`
3. **多窗口**: 若存在多窗口，需确保 `terminal-data` 发送到正确的 `webContents`
4. **Agent 工具**: 必须保持 `execute-terminal-command` 或等价能力，确保 AI 能执行命令并获取输出

---

## 七、验收标准

1. PlainTextEditor 的终端面板使用 xterm.js 显示，可输入命令并执行
2. 支持 vim、python 等交互式程序
3. 支持 Ctrl+C 中断
4. 支持 Shell 切换（cmd / PowerShell / bash）
5. 主题与主题切换正常
6. Agent 终端工具仍可正常执行命令并返回结果
7. LaTeX 编译输出仍正常显示在 ConsoleOutput 中
8. Demo 模式下手册中的终端展示正常

---

## 八、参考资源

- [node-pty](https://github.com/microsoft/node-pty)
- [xterm.js](https://github.com/xtermjs/xterm.js)
- [VS Code Terminal](https://github.com/microsoft/vscode/wiki/Working-with-xterm.js)
- [Electron + node-pty + xterm 示例](https://github.com/microsoft/node-pty/blob/main/examples/electron/renderer.js)
