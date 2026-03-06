# Debug 目录：导出验收与测试

本目录用于导出功能的验收测试与调试。

## 文件说明

| 文件/目录 | 说明 |
|-----------|------|
| `export-test.md` | 测试用 Markdown，含网络/本地图片、公式、多种语法、Mermaid/ECharts/PlantUML/Mindmap/Graphviz 图表 |
| `images/` | 占位图（由脚本生成，合法 PNG） |
| `out/` | 可手动指定为导出产物根目录（供界面内回归测试使用） |
| `scripts/generate-placeholder-images.mjs` | 使用 **sharp** 生成占位 PNG |
| `scripts/export-graph-test.mjs` | 导出图与路径的单元测试（不启动 Electron） |
| `run-export-node.mjs` | **备用**：纯 Node、不启动 Electron，用 marked/md-to-pdf 等简化链路；图表与公式不与程序内导出等价，仅适合无法跑 Electron 时 |

## 1. 生成占位图片

在 **debug** 目录下（需先安装依赖）：

```bash
cd debug
npm install
npm run generate-images
```

图片会写入 `debug/images/`（red.png, green.png, blue.png, yellow.png, purple.png）。

## 2. 导出图单元测试（不启动 Electron）

从仓库根目录：

```bash
node debug/scripts/export-graph-test.mjs
```

## 3. 导出回归测试（推荐：在软件内完成）

在 MetaDoc 中打开任意一篇文档（MD 或 TEX），进入 **设置 → 调试**，在左侧菜单选择 **「导出回归测试」**：

1. **选择输出目录**：点击「选择目录」指定导出根目录。
2. **一键导出所有格式**：点击按钮后，将按当前文档的源格式（MD 或 TEX）依次执行多组导出用例（与程序内导出同一套流程：预渲染图表、公式、图片处理等），不弹保存对话框，直接写入 `{输出目录}/{caseName}/export-test.{ext}`。
3. 界面会显示每个用例的 **成功/失败** 状态、进度与错误信息，便于回归验证。

**MD 文档** 的用例包括：PDF 默认、DOCX 封面+目录+公式、TEX 图片存文件夹/保留原链接、HTML 图片存文件夹/保留原链接、Markdown。

**TEX 文档** 的用例包括：LaTeX、LaTeX 编译 PDF、LaTeX→Markdown、LaTeX→HTML、LaTeX→DOCX。

## 4. 备用：纯 Node 导出（不与程序内等价）

**run-export-node.mjs**：不启动 Electron，图表/公式不与程序内等价，DOCX 图片为占位符。仅在无法跑 Electron 时使用。
