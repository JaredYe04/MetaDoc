# MetaDoc Electron E2E（Playwright）

使用 Playwright 的 **Electron 自动化能力**（`playwright._electron`）对 MetaDoc 桌面端进行端到端测试。

## 前置条件

- 已安装依赖：`npm install`
- **主进程与渲染进程已构建**：`out/main/index.js` 存在（见下方「运行方式」）
- 运行 E2E 时**请关闭其他已打开的 MetaDoc 窗口**，否则会走单例委托，本实例不创建窗口，导致 `firstWindow()` 超时

## 运行方式

```bash
# 默认：新建 Markdown 文档流程（需已构建）
npm run test:e2e

# 使用 dev 环境：若 out/main 不存在，会自动执行 electron-vite build（不跑 prebuild）
npm run test:e2e:dev

# LaTeX 流程：用预创建 e2e/out/e2e-latex.tex 启动 → 另存为 → 编译 → 检查 PDF
npm run test:e2e:latex

# LaTeX + dev（自动构建后跑 LaTeX 流程）
npm run test:e2e:latex:dev

# 先完整构建再跑默认 E2E
npm run test:e2e:build
```

或直接执行脚本：

```bash
node e2e/run-electron.mjs           # 默认 Markdown 流程
node e2e/run-electron.mjs --dev    # 缺构建时自动 electron-vite build
node e2e/run-electron.mjs --latex  # LaTeX 流程
```

## 当前用例

### 默认（Markdown）

- 启动 MetaDoc
- 点击标签栏「新建文档」（+ 按钮）
- 若出现模板选择，则点击「使用模板」进入编辑器
- 断言出现编辑器/预览区域，截图保存到 `e2e/screenshots/`

### LaTeX（`--latex`）

- 使用预创建的 `e2e/out/e2e-latex.tex` 作为启动参数打开
- 主进程 mock「另存为」对话框到同一路径
- 触发另存为后点击 LaTeX 工具栏「编译」
- 等待编译结束，检查 PDF 预览区域，截图保存

## 参考

- [Playwright - Electron](https://playwright.dev/docs/api/class-electron)
- [ElectronApplication](https://playwright.dev/docs/api/class-electronapplication)
