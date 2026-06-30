# MetaDoc

<div align="center">

![Version](https://img.shields.io/badge/version-0.12.1-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-lightgrey.svg)

**基于LLM Agent的智能文字处理软件**

面向学生与IT从业者的多功能智能文档处理平台

[功能特性](#功能特性) • [技术架构](#技术架构) • [快速开始](#快速开始) • [项目结构](#项目结构)

</div>

---

## 📖 项目简介

MetaDoc 是一款面向学生与IT从业者的多功能智能文字处理软件。作为一款高效的生产力工具，通过多智能体技术，弥补了传统工具在图表绘制、代码渲染、数据分析和AI辅助写作上的不足。

### 核心价值

- **🤖 智能化**：基于LLM Agent的多智能体架构，实现精准上下文分析与深度校对
- **⚡ 高效性**：支持AI并发任务处理，可在短时间内生成大量内容
- **📊 专业性**：原生支持UML、脑图、思维导图、程序流程图等专业图表绘制
- **🔄 兼容性**：支持Markdown、LaTeX等多种文档格式，兼容多种操作系统平台

## ✨ 功能特性

### 📝 文档编辑

- **Markdown编辑器**：支持实时预览、语法高亮、数学公式渲染
- **LaTeX编辑器**：完整的LaTeX编译支持，Monaco编辑器集成
- **多标签页管理**：支持同时编辑多个文档
- **文件关联**：自动关联 `.md` 和 `.tex` 文件

### 🤖 AI智能功能

- **LLM Agent框架**：完整的多智能体系统
  - 工具集管理（ToolCollection）
  - 工作流引擎（Workflow）
  - Agent配置管理（AgentConfig）
  - 会话管理系统（AgentSession）
- **RAG知识库**：基于SQLite + sqlite-vec的向量检索系统
  - 文档向量化存储
  - 相似度搜索
  - 混合检索（向量+关键词）
- **AI对话**：智能对话助手，支持上下文理解
- **AI校对**：智能文本校对和优化建议
- **公式识别**：OCR公式识别与转换

### 📤 导出功能

支持多种格式导出：

| 源格式 | 支持导出格式 |
|--------|------------|
| Markdown | MD, HTML, DOCX, PDF, TEX |
| LaTeX | TEX, PDF, MD, HTML, DOCX |
| JSON | JSON, MD (计划中) |

### 📊 数据可视化

- **图表绘制**：UML、流程图、思维导图、脑图
- **数据分析**：数据表格处理与可视化
- **词云生成**：文本词频分析与可视化

### 🔧 其他功能

- **OCR识别**：图片文字识别
- **文件转换**：支持多种文档格式转换
- **附件管理**：文档附件管理窗口
- **国际化支持**：多语言界面（中文、英文、日文、韩文、德文、法文）

## 🏗️ 技术架构

### 技术栈

- **前端框架**：Vue 3 + TypeScript
- **桌面框架**：Electron 31
- **移动端**：Capacitor 7
- **UI组件库**：TDesign Vue Next + Element Plus
- **编辑器**：
  - Monaco Editor（LaTeX编辑）
  - Vditor（Markdown编辑）
- **数据库**：
  - SQLite（better-sqlite3）
  - sqlite-vec（向量数据库）
- **构建工具**：Electron Vite + Vite
- **状态管理**：Pinia
- **路由**：Vue Router

### 架构设计

```
┌─────────────────────────────────────────┐
│         用户界面层 (Vue 3)              │
│  - 编辑器、AI对话、图表、设置等          │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│        渲染进程 (Renderer)              │
│  - Vue应用、组件、服务、工具类           │
└─────────────────┬───────────────────────┘
                  │ IPC通信
┌─────────────────▼───────────────────────┐
│         主进程 (Main Process)            │
│  - 窗口管理、文件系统、系统服务          │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│        系统服务层                        │
│  - AI服务、RAG服务、导出服务、数据库      │
└─────────────────────────────────────────┘
```

### 核心模块

#### 1. Agent框架 (`src/renderer/src/utils/agent-framework/`)

- **工作流引擎**：有向图执行引擎，支持条件、循环、并行、合并等控制流节点
- **工具集管理**：工具的组织与管理
- **Agent配置**：LLM配置、行为配置、场景分类
- **会话管理**：消息队列、引用素材、公共上下文、重试机制

#### 2. RAG知识库 (`src/main/utils/rag-service.ts`)

- 基于SQLite + sqlite-vec的向量存储
- 文档分块与向量化
- 相似度搜索与混合检索
- 支持本地模型和API模式

#### 3. 导出系统 (`src/main/export/`)

- 模块化导出适配器
- 支持多种格式转换
- 公式转换与渲染
- 字体与样式管理

#### 4. 数据库 (`src/main/database/`)

- SQLite数据库管理
- 知识库数据存储
- 数据库迁移系统

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm 或 pnpm
- Python 3.x（用于部分工具脚本）

### 安装依赖

```bash
# 进入项目目录
cd meta-doc

# 安装依赖
npm install
# 或
pnpm install
```

### 开发模式

```bash
# 启动开发服务器
npm run dev
```

### 构建应用

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

> **Note:** Android/Capacitor build scripts have been removed in the open-source layout.

### 其他命令

```bash
# 代码格式化
npm run format

# 代码检查
npm run lint

# 代码审计
npm run audit

# 清理Vite缓存
npm run clean:vite
```

## 📁 项目结构（开源版）

```
MetaDoc/
├── archived/                    # 闭源模块归档（Steam、Cloudflare Worker）
├── meta-doc/                    # 主应用
│   ├── docs/open-source-refactor/  # 开源重构计划与 Host API 文档
│   └── src/renderer/src/
│       ├── core/                # bootstrap、plugin-loader
│       ├── host-api/            # 插件宿主接口
│       ├── ai-runtime/          # 异步 AI 加载（llmEnabled）
│       └── plugins/             # 内置 AI 插件
├── website/
└── logos/
```

详见 [`meta-doc/docs/open-source-refactor/README.md`](meta-doc/docs/open-source-refactor/README.md)。

## 📁 项目结构（详细）

```
MetaDoc/
├── meta-doc/                    # 主应用目录
│   ├── src/
│   │   ├── main/               # Electron主进程
│   │   │   ├── database/       # 数据库管理
│   │   │   ├── export/         # 导出功能
│   │   │   ├── utils/          # 工具服务
│   │   │   │   ├── rag-service.ts      # RAG知识库服务
│   │   │   │   ├── latex-service.ts    # LaTeX编译服务
│   │   │   │   ├── ocr-service.ts      # OCR服务
│   │   │   │   └── ...
│   │   │   ├── index.ts        # 主进程入口
│   │   │   └── ...
│   │   ├── renderer/           # 渲染进程（Vue应用）
│   │   │   ├── src/
│   │   │   │   ├── components/ # Vue组件
│   │   │   │   │   ├── agent/  # Agent相关组件
│   │   │   │   │   ├── editor/ # 编辑器组件
│   │   │   │   │   └── ...
│   │   │   │   ├── views/      # 页面视图
│   │   │   │   │   ├── Editor.vue
│   │   │   │   │   ├── AgentView.vue
│   │   │   │   │   ├── KnowledgeBase.vue
│   │   │   │   │   └── ...
│   │   │   │   ├── services/   # 业务服务
│   │   │   │   │   ├── AIService.ts
│   │   │   │   │   ├── DocumentService.ts
│   │   │   │   │   └── ...
│   │   │   │   ├── utils/      # 工具函数
│   │   │   │   │   ├── agent-framework/  # Agent框架
│   │   │   │   │   └── ...
│   │   │   │   ├── stores/     # Pinia状态管理
│   │   │   │   ├── router/     # 路由配置
│   │   │   │   └── locales/    # 国际化文件
│   │   │   └── ...
│   │   └── preload/            # 预加载脚本
│   ├── resources/              # 资源文件
│   │   ├── migrations/         # 数据库迁移
│   │   ├── models.json        # 模型配置
│   │   └── ...
│   ├── build/                 # 构建资源
│   ├── docs/                  # 项目文档
│   ├── package.json
│   └── electron-builder.yml   # 打包配置
├── db/                         # 数据库建表脚本
├── docs/                       # 项目文档
└── README.md                   # 本文件
```

## 🔧 配置说明

### 环境变量

创建 `.env` 文件（开发环境）或 `resources/.env`（生产环境）：

```env
# LLM API配置
OPENAI_API_KEY=your_api_key
GOOGLE_API_KEY=your_api_key

# 其他配置...
```

### 数据库配置

数据库文件位于用户数据目录，首次运行会自动创建。支持数据库迁移，迁移脚本位于 `resources/migrations/`。

## 📚 文档

- [项目设计报告](docs/智能体产品设计报告.md)
- [Agent框架文档](meta-doc/src/renderer/src/utils/agent-framework/README.md)
- [内部文档索引](meta-doc/docs/README.md)
- [RAG知识库文档](meta-doc/docs/ai/RAG_KNOWLEDGE_BASE.md)
- [导出系统文档](meta-doc/docs/export/EXPORT_ADAPTER_REFACTOR.md)
- [重构总结](meta-doc/docs/refactoring/REFACTOR_SUMMARY.md)

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 开发规范

- 使用 TypeScript 进行开发
- 遵循 ESLint 和 Prettier 配置
- 提交前运行 `npm run lint` 和 `npm run format`
- 编写清晰的注释和文档

## 🐛 问题反馈

如遇到问题，请通过以下方式反馈：

1. 在 GitHub Issues 中提交问题
2. 提供详细的错误信息和复现步骤
3. 包含操作系统和版本信息

## 📄 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

## 👥 作者

**ByteLight**

## 🙏 致谢

感谢所有为本项目做出贡献的开发者和用户！

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star！**

Made with ❤️ by ByteLight

</div>

