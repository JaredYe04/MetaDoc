# MetaDoc

<div align="center">

<img src="./logos/logo.png" width="128" alt="MetaDoc Logo"/>

# MetaDoc

### Lightweight Markdown & LaTeX Editor with Optional AI

*A fast, extensible, cross-platform writing environment for developers, researchers, students and technical writers.*

<p>

![Version](https://img.shields.io/github/v/tag/JaredYe04/MetaDoc?label=version)
![License](https://img.shields.io/badge/License-GPL--2.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Electron](https://img.shields.io/badge/Electron-31+-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42b883)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)

</p>

**[English](#english)** | **[简体中文](#简体中文)**

<p>

<a href="#-features">Features</a> •
<a href="#-philosophy">Philosophy</a> •
<a href="#-screenshots">Screenshots</a> •
<a href="#-architecture">Architecture</a> •
<a href="#-roadmap">Roadmap</a> •
<a href="#-quick-start">Quick Start</a> •
<a href="#-contributing">Contributing</a>

</p>

</div>

---

<a id="english"></a>

# ✨ Introduction

MetaDoc is a modern, open-source Markdown editor built for people who write technical content.

It combines the speed and simplicity of traditional Markdown editors with the flexibility of an extensible AI runtime. Unlike many AI-first editors, MetaDoc keeps the editor lightweight by making every AI capability completely optional.

Whether you're writing documentation, research papers, software specifications, lecture notes, blogs, or books, MetaDoc provides a clean editing experience first—and intelligent assistance only when you need it.

---

# 🚀 Why MetaDoc?

Most editors today fall into two categories.

### Traditional Markdown Editors

- Fast
- Lightweight
- Local-first

But they often lack intelligent workflows, modern export capabilities and extensibility.

### AI Editors

- Powerful AI features
- Cloud-native
- Rich automation

But they are usually heavy, expensive, internet-dependent and difficult to customize.

---

MetaDoc combines the best of both worlds.

- ⚡ Lightweight editing experience
- 🤖 AI that can be enabled or disabled at any time
- 📝 Markdown-first workflow
- 📄 Native LaTeX support
- 🔌 Plugin-oriented architecture
- 💻 Cross-platform desktop application
- 🌐 Local models and cloud models supported
- 🔒 Local-first design

---

# 💡 Philosophy

MetaDoc follows three simple principles.

## 1. Writing Comes First

Editing should always be fast.

The editor itself should never become slow because of AI features.

Every core editing capability works independently from any language model.

---

## 2. AI Is Optional

MetaDoc is **not** an AI editor.

It is a professional editor with an optional AI runtime.

You can

- disable AI completely
- use local LLMs
- use cloud APIs
- switch providers anytime
- build your own AI plugins

No account is required.

No vendor lock-in.

---

## 3. Local First

Your files belong to you.

Documents are stored locally by default.

Cloud services are optional rather than mandatory.

Whenever possible, data processing happens on your own device.

---

# ✨ Features

## 📝 Professional Editing

- Markdown editing
- Live Preview
- GitHub Flavored Markdown
- Multi-tab editing
- Syntax highlighting
- Code folding
- Auto Save
- Split View
- Outline navigation
- Table editor
- Mathematical formulas
- Mermaid diagrams
- PlantUML
- Flowcharts
- Mind Maps
- Task Lists
- Footnotes
- Front Matter
- YAML support

---

## 📚 LaTeX

Designed for researchers and academic writing.

- Native LaTeX editor
- Monaco-based editing experience
- PDF compilation
- Equation preview
- TikZ support (planned)
- Bibliography support (planned)

---

## 📄 Multiple Document Formats

MetaDoc is gradually becoming a universal document editor.

Current and planned formats include:

| Format | Read | Edit | Export |
| -------- | :--: | :--: | :----: |
| Markdown | ✅ | ✅ | ✅ |
| LaTeX | ✅ | ✅ | ✅ |
| HTML | ✅ | ❌ | ✅ |
| PDF | ❌ | ❌ | ✅ |
| DOCX | 🚧 | 🚧 | ✅ |
| ODT | 🚧 | 🚧 | 🚧 |

---

## 📤 Export

Export documents into multiple formats.

- PDF
- HTML
- DOCX
- LaTeX
- Markdown

Future support includes

- EPUB
- Typst
- Reveal.js
- PowerPoint
- Images

---

## 🌍 Internationalization

Built-in multilingual interface.

Current languages include

- English
- 简体中文
- 日本語
- 한국어
- Français
- Deutsch

Additional translations are welcome.

# 🤖 Optional AI Runtime

MetaDoc includes a modular AI runtime that can be enabled only when needed.

Unlike AI-first editors, AI is treated as an independent capability rather than a mandatory component.

Disable it completely for an ultra-lightweight writing experience, or enable it to unlock powerful intelligent workflows.

---

## AI Writing Assistant

Improve your writing without leaving the editor.

- Rewrite paragraphs
- Expand or shorten content
- Grammar correction
- Style optimization
- Academic polishing
- Technical writing assistance
- Translation
- Summarization
- Continue writing
- Explain selected content

Everything works directly inside the editor.

---

## AI Chat

A built-in document-aware assistant.

- Context-aware conversations
- Document Q&A
- Explain code
- Explain formulas
- Writing suggestions
- Brainstorm ideas
- Interactive editing

The assistant understands the currently opened document and selected text.

---

## Multiple LLM Providers

MetaDoc doesn't lock you into any specific AI platform.

Supported providers include

- OpenAI
- Anthropic Claude
- Google Gemini
- DeepSeek
- Qwen
- Ollama
- OpenAI Compatible APIs

Switch providers at any time.

Use cloud models or completely local models.

---

## Local AI

Run AI entirely on your own computer.

Compatible with

- Ollama
- OpenAI-compatible local servers
- Future local runtimes

No cloud required.

---

## RAG Knowledge Base

Turn your documents into searchable knowledge.

Features include

- Local vector database
- Semantic search
- Hybrid retrieval
- Document indexing
- Multi-file knowledge base
- AI-assisted retrieval

Perfect for technical documentation, notes and research projects.

---

## Plugin-based AI

AI features are implemented as plugins.

Developers can

- add new tools
- create workflows
- integrate custom models
- build new agents
- extend prompts
- implement automation

MetaDoc aims to become an extensible AI productivity platform rather than a fixed application.

---

# 🖼 Screenshots

> Screenshots will be added after the first stable release.

| Editor | AI Assistant |
| ------- | ------------ |
| Coming Soon | Coming Soon |

| LaTeX | Export |
| ------ | ------ |
| Coming Soon | Coming Soon |

---

# 🏗 Architecture

MetaDoc follows a modular architecture.

```
                        Plugins
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
 ┌─────────────────┐                  ┌─────────────────┐
 │   AI Runtime    │                  │ Extension APIs  │
 └─────────────────┘                  └─────────────────┘
                │
                ▼
        ┌─────────────────┐
        │   Core Editor   │
        ├─────────────────┤
        │ Markdown        │
        │ LaTeX           │
        │ DOCX (Future)   │
        └─────────────────┘
                │
                ▼
        ┌─────────────────┐
        │ Document Engine │
        └─────────────────┘
                │
                ▼
        ┌─────────────────┐
        │ Electron + Vue3 │
        └─────────────────┘
```

---

## Technology Stack

| Layer | Technology |
| ------ | ---------- |
| Desktop | Electron |
| Frontend | Vue 3 |
| Language | TypeScript |
| Editor | Vditor + Monaco Editor |
| State Management | Pinia |
| Database | SQLite |
| Vector Database | sqlite-vec |
| Build Tool | Electron Vite |
| UI | TDesign + Element Plus |

---

# 📂 Project Structure

```text
MetaDoc
│
├── src/
│   ├── main/                 # Electron Main Process
│   ├── renderer/             # Vue Application
│   ├── preload/
│   └── resources/
│
├── docs/                     # Documentation
├── scripts/                  # Development Scripts
├── build/                    # Build Resources
├── website/                  # Project Website
├── logos/
└── README.md
```

The architecture is intentionally modular so that each subsystem can evolve independently.

---

# 🛣 Roadmap

## Core Editor

- [x] Markdown Editor
- [x] Live Preview
- [x] LaTeX Support
- [x] Multi-tab Editing
- [x] Export Framework
- [x] Cross-platform Desktop

---

## AI

- [x] AI Chat
- [x] AI Writing Assistant
- [x] RAG Knowledge Base
- [x] Local LLM Support
- [x] Multiple AI Providers
- [ ] Workflow Builder
- [ ] AI Plugin Marketplace

---

## Documents

- [ ] DOCX Editing
- [ ] ODT Support
- [ ] Typst Support
- [ ] EPUB Support
- [ ] Presentation Documents
- [ ] Spreadsheet Support

---

## Platform

- [ ] Plugin SDK
- [ ] Extension Marketplace
- [ ] Theme Marketplace
- [ ] Collaborative Editing
- [ ] Mobile Version
- [ ] Web Version

---

# ⚡ Performance

MetaDoc is designed to remain lightweight.

- Fast startup
- Native desktop experience
- Low memory consumption
- Local-first workflow
- AI loaded on demand
- No unnecessary background services

The editor remains responsive regardless of whether AI is enabled.

---

# 🎯 Who Is MetaDoc For?

MetaDoc is built for people who write technical content every day.

Including

- Software Engineers
- Researchers
- Students
- Technical Writers
- Open Source Maintainers
- Documentation Teams
- AI Developers
- DevOps Engineers
- Bloggers
- Content Creators

Whether you're writing documentation, papers, books or specifications, MetaDoc aims to provide a distraction-free environment that scales with your workflow.

# 🚀 Quick Start

## Requirements

Before getting started, make sure your environment meets the following requirements.

| Software | Version |
| -------- | ------- |
| Node.js | >= 18 |
| npm / pnpm | Latest |
| Git | Latest |

---

## Clone Repository

```bash
git clone https://github.com/ByteLightLab/MetaDoc.git

cd MetaDoc
```

---

## Install Dependencies

Using npm

```bash
npm install
```

or pnpm

```bash
pnpm install
```

---

## Start Development

```bash
npm run dev
```

---

## Build

Windows

```bash
npm run build:win
```

macOS

```bash
npm run build:mac
```

Linux

```bash
npm run build:linux
```

---

# ⚙️ Configuration

MetaDoc works out of the box.

If you don't need AI, no additional configuration is required.

Simply install and start writing.

---

## Enable AI

If you want to use AI features, configure your preferred provider inside

```
Settings → AI
```

Supported providers include

- OpenAI
- Claude
- Gemini
- DeepSeek
- Ollama
- OpenAI Compatible APIs

MetaDoc never requires a specific vendor.

---

## Local Models

To use local models, simply install Ollama (or another compatible runtime) and configure the endpoint inside Settings.

Everything will continue to work offline.

---

# 🔌 Plugin System

MetaDoc is designed to be extensible.

Rather than embedding every feature into the core editor, functionality can be added through plugins.

Future plugin categories include

- AI Tools
- Exporters
- Themes
- Commands
- Diagram Renderers
- Syntax Extensions
- Document Templates
- Productivity Utilities

Our long-term goal is to build an open ecosystem around MetaDoc.

---

# 📚 Documentation

Documentation is continuously improving.

Current resources include

- Project Architecture
- Development Guide
- Plugin SDK
- AI Runtime
- Export Framework
- Contribution Guide

Additional documents will be published alongside future releases.

---

# 🤝 Contributing

Contributions of every size are welcome.

Whether you're fixing a typo, improving documentation, reporting bugs, or implementing new features, your help is greatly appreciated.

## How to Contribute

1. Fork this repository

2. Create a new branch

```bash
git checkout -b feature/amazing-feature
```

3. Commit your changes

```bash
git commit -m "Add amazing feature"
```

4. Push to your branch

```bash
git push origin feature/amazing-feature
```

5. Open a Pull Request

---

## Development Principles

When contributing, please try to follow these principles.

- Keep the editor lightweight.
- Avoid unnecessary dependencies.
- Design APIs to be extensible.
- Respect local-first workflows.
- Keep AI optional.
- Write readable code.
- Document public APIs.

---

# ❤️ Community

If you like MetaDoc, consider supporting the project.

You can help by

- ⭐ Starring the repository
- 🐛 Reporting issues
- 💡 Suggesting new ideas
- 🔧 Contributing code
- 📖 Improving documentation
- 🌍 Translating MetaDoc into your language

Every contribution helps make MetaDoc better.

---

# 📈 Vision

MetaDoc is more than just another Markdown editor.

Our long-term vision is to build an open, extensible document platform.

One editor.

Multiple document formats.

Optional AI.

Powerful plugins.

Complete ownership of your data.

We believe professional writing software should be

- Fast
- Open
- Extensible
- Cross-platform
- Local-first
- Future-proof

MetaDoc is our answer.

---

# 📄 License

MetaDoc is released under the **GNU General Public License v2.0 (GPL-2.0)**.

You are free to

- Use
- Modify
- Study
- Redistribute

under the terms of the GPL license.

Please refer to the [LICENSE](LICENSE) file for the complete text.

---

# 🙏 Acknowledgements

MetaDoc is built upon many excellent open-source projects.

Special thanks to the communities behind

- Electron
- Vue.js
- TypeScript
- Vditor
- Monaco Editor
- SQLite
- sqlite-vec
- markdown-it
- KaTeX
- Mermaid

Their incredible work makes MetaDoc possible.

---

<div align="center">

# ⭐ Star History

If MetaDoc helps you in your daily work, consider giving it a Star.

It helps more people discover the project and motivates future development.

---

### Built for people who love writing.

**Markdown First.**

**AI Optional.**

**Open Source Forever.**

<br>

Made with ❤️ by **ByteLight**

</div>

---

<div align="center">

**[English](#english)** | **[简体中文](#简体中文)**

</div>

---

<a id="简体中文"></a>

<div align="center">

### 轻量 Markdown / LaTeX 编辑器，AI 随心可选

*面向开发者、科研工作者、学生与技术写作者的快速、可扩展、跨平台写作环境。*

<p>

<a href="#功能特性">功能特性</a> •
<a href="#设计理念">设计理念</a> •
<a href="#截图">截图</a> •
<a href="#架构">架构</a> •
<a href="#路线图">路线图</a> •
<a href="#快速开始">快速开始</a> •
<a href="#参与贡献">参与贡献</a>

</p>

</div>

---

# ✨ 简介

MetaDoc 是一款现代化、开源、跨平台的 Markdown 与 LaTeX 编辑器。

它保留了传统 Markdown 编辑器轻量、专注、快速的使用体验，同时提供可**按需启用**的 AI 能力，让智能写作成为一种选择，而不是负担。

无论是编写技术文档、科研论文、课程笔记、博客，还是软件规格说明，MetaDoc 都希望成为一个始终流畅、值得信赖的写作环境。

---

# 🚀 为什么选择 MetaDoc？

过去几年，文档编辑工具的发展逐渐走向两个方向。

一类追求轻量，另一类追求 AI。

前者足够简单，却缺乏现代生产力工具；后者功能丰富，却越来越庞大，也越来越依赖云端。

MetaDoc 希望在两者之间找到一个更平衡的答案。
---

我们希望，一个优秀的编辑器既能保持轻盈，也能在需要的时候足够智能。

- ⚡ 轻量流畅的编辑体验
- 🤖 AI 随时可开可关
- 📝 Markdown 优先的工作流
- 📄 原生 LaTeX 支持
- 🔌 插件化架构，能力可持续扩展
- 💻 跨平台桌面应用（Windows / macOS / Linux）
- 🌐 本地模型与云端模型均可使用
- 🔒 本地优先，文件归属你自己

---

<a id="设计理念"></a>

# 💡 设计理念

MetaDoc 遵循三条简单原则。

## 1. 写作优先

编辑器首先应该是一款优秀的编辑器。

无论是否启用 AI，输入、滚动、搜索、预览等基础体验都应该保持流畅。

我们希望，把性能留给写作，而不是等待。

---

## 2. AI 可选

我们相信，AI 不应该定义一款编辑器。

它应该像拼写检查、代码补全一样，是一种可以自由启用的能力。

因此，在 MetaDoc 中，你可以完全关闭所有 AI 功能，把它当作一款纯粹的 Markdown 编辑器；也可以根据需要接入本地模型或云端模型，为写作提供帮助。

是否使用 AI，由你决定。

---

## 3. 本地优先

文档始终属于你，而不是某个平台。

MetaDoc 默认采用本地优先（Local-first）的设计理念。

文件保存在本地，配置保存在本地，只要条件允许，数据处理也尽可能在本地完成。

云服务是一种能力，而不是前提。

---

<a id="功能特性"></a>

# ✨ 功能特性

## 📝 专业编辑

- Markdown 编辑与实时预览
- GitHub Flavored Markdown
- 多标签页编辑
- 语法高亮与代码折叠
- 自动保存与分屏视图
- 大纲导航与表格编辑器
- 数学公式（KaTeX）
- Mermaid 图表、PlantUML、流程图、思维导图
- 任务列表、脚注、Front Matter、YAML

---

## 📚 LaTeX

为科研写作与学术论文而生。

- 原生 LaTeX 编辑器
- 基于 Monaco 的专业编辑体验
- PDF 编译与公式预览
- TikZ 支持（规划中）
- 参考文献管理（规划中）

---

## 📄 多格式文档

MetaDoc 正在逐步演进为通用文档编辑器。

当前及规划中的格式支持如下：

| 格式 | 阅读 | 编辑 | 导出 |
| -------- | :--: | :--: | :----: |
| Markdown | ✅ | ✅ | ✅ |
| LaTeX | ✅ | ✅ | ✅ |
| HTML | ✅ | ❌ | ✅ |
| PDF | ❌ | ❌ | ✅ |
| DOCX | 🚧 | 🚧 | ✅ |
| ODT | 🚧 | 🚧 | 🚧 |

---

## 📤 导出

一键导出为多种格式：

- PDF、HTML、DOCX、LaTeX、Markdown

后续计划支持 EPUB、Typst、Reveal.js、PowerPoint、图片等。

---

## 🌍 国际化

内置多语言界面，当前支持：

- English
- 简体中文
- 日本語
- 한국어
- Français
- Deutsch

欢迎贡献更多语言翻译。

---

# 🤖 可选 AI 运行时

MetaDoc 内置模块化 AI 运行时，仅在需要时启用。

与「AI 优先」产品不同，AI 在这里是独立能力，而非强制组件——你可以完全关闭它以获得极致轻量的写作体验，也可以在需要时解锁强大的智能工作流。

---

## AI 写作助手

无需离开编辑器，即可润色与改写文稿。

- 段落重写、扩写与缩写
- 语法纠错与文风优化
- 学术润色与技术写作辅助
- 翻译、摘要、续写
- 解释选中内容

所有操作均在编辑器内完成。

---

## AI 对话

内置理解当前文档的助手。

- 上下文感知的对话
- 针对文档的问答
- 解释代码与公式
- 写作建议与头脑风暴
- 交互式编辑

助手能理解当前打开的文档与选中的文本。

---

## 多模型服务商

MetaDoc 不绑定任何单一 AI 平台。

已支持的服务商包括：

- OpenAI
- Anthropic Claude
- Google Gemini
- DeepSeek
- 通义千问（Qwen）
- Ollama
- OpenAI 兼容 API

可随时切换；云端与本地模型均可使用。

---

## 本地 AI

在自有设备上完整运行 AI，兼容 Ollama、OpenAI 兼容本地服务等，无需联网即可使用。

---

## RAG 知识库

将文档转化为可检索的知识库。

- 本地向量数据库
- 语义搜索与混合检索
- 文档索引与多文件知识库
- AI 辅助检索

适合技术文档、笔记与科研项目。

---

## 插件化 AI

AI 能力以插件形式实现。开发者可以新增工具、编排工作流、接入自定义模型、构建 Agent、扩展提示词与自动化流程。

MetaDoc 的目标是成为可扩展的 AI 生产力平台，而非功能固定的封闭应用。

---

<a id="截图"></a>

# 🖼 截图

> 首个稳定版发布后将补充截图。

| 编辑器 | AI 助手 |
| ------- | ------------ |
| 即将推出 | 即将推出 |

| LaTeX | 导出 |
| ------ | ------ |
| 即将推出 | 即将推出 |

---

<a id="架构"></a>

# 🏗 架构

MetaDoc 采用模块化架构，各子系统可独立演进：

```
                        Plugins
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
 ┌─────────────────┐                  ┌─────────────────┐
 │   AI Runtime    │                  │ Extension APIs  │
 └─────────────────┘                  └─────────────────┘
                │
                ▼
        ┌─────────────────┐
        │   Core Editor   │
        ├─────────────────┤
        │ Markdown        │
        │ LaTeX           │
        │ DOCX (Future)   │
        └─────────────────┘
                │
                ▼
        ┌─────────────────┐
        │ Document Engine │
        └─────────────────┘
                │
                ▼
        ┌─────────────────┐
        │ Electron + Vue3 │
        └─────────────────┘
```

---

## 技术栈

| 层级 | 技术 |
| ------ | ---------- |
| 桌面端 | Electron |
| 前端 | Vue 3 |
| 语言 | TypeScript |
| 编辑器 | Vditor + Monaco Editor |
| 状态管理 | Pinia |
| 数据库 | SQLite |
| 向量数据库 | sqlite-vec |
| 构建工具 | Electron Vite |
| UI | TDesign + Element Plus |

---

# 📂 项目结构

```text
MetaDoc
│
├── src/
│   ├── main/                 # Electron 主进程
│   ├── renderer/             # Vue 应用
│   ├── preload/
│   └── resources/
│
├── docs/                     # 文档
├── scripts/                  # 开发脚本
├── build/                    # 构建资源
├── website/                  # 项目官网
├── logos/
└── README.md
```

架构刻意保持模块化，以便各子系统独立迭代。

---

<a id="路线图"></a>

# 🛣 路线图

## 核心编辑器

- [x] Markdown 编辑器
- [x] 实时预览
- [x] LaTeX 支持
- [x] 多标签页编辑
- [x] 导出框架
- [x] 跨平台桌面端

---

## AI

- [x] AI 对话
- [x] AI 写作助手
- [x] RAG 知识库
- [x] 本地 LLM 支持
- [x] 多 AI 服务商
- [ ] 工作流构建器
- [ ] AI 插件市场

---

## 文档格式

- [ ] DOCX 编辑
- [ ] ODT 支持
- [ ] Typst 支持
- [ ] EPUB 支持
- [ ] 演示文稿
- [ ] 电子表格

---

## 平台

- [ ] 插件 SDK
- [ ] 扩展市场
- [ ] 主题市场
- [ ] 协同编辑
- [ ] 移动端
- [ ] Web 版

---

# ⚡ 性能

MetaDoc 从设计之初就追求轻量：

- 快速启动
- 原生桌面体验
- 低内存占用
- 本地优先工作流
- AI 按需加载
- 无多余后台服务

无论是否启用 AI，编辑器都保持流畅响应。

---

# 🎯 适合谁使用？

MetaDoc 为每天与文字打交道的人而打造，包括：

- 软件工程师与 DevOps
- 科研工作者与学生
- 技术写作者与文档团队
- 开源维护者与 AI 开发者
- 博主与内容创作者

无论你写的是文档、论文、书籍还是规格说明，MetaDoc 都致力于提供无干扰、可随工作流扩展的写作环境。

<a id="快速开始"></a>

# 🚀 快速开始

## 环境要求

| 软件 | 版本 |
| -------- | ------- |
| Node.js | >= 18 |
| npm / pnpm | 最新版 |
| Git | 最新版 |

---

## 克隆仓库

```bash
git clone https://github.com/ByteLightLab/MetaDoc.git

cd MetaDoc
```

---

## 安装依赖

使用 npm：

```bash
npm install
```

或使用 pnpm：

```bash
pnpm install
```

---

## 启动开发

```bash
npm run dev
```

---

## 构建

Windows

```bash
npm run build:win
```

macOS

```bash
npm run build:mac
```

Linux

```bash
npm run build:linux
```

---

# ⚙️ 配置

MetaDoc 开箱即用。若不需要 AI，无需任何额外配置，安装后即可开始写作。

---

## 启用 AI

在 **设置 → AI** 中配置你偏好的服务商即可，支持 OpenAI、Claude、Gemini、DeepSeek、Ollama 及 OpenAI 兼容 API。MetaDoc 从不强制绑定特定厂商。

---

## 本地模型

安装 Ollama（或其他兼容运行时），在设置中配置端点即可；其余功能可完全离线使用。

---

# 🔌 插件系统

MetaDoc 以可扩展为设计目标：功能通过插件接入，而非全部堆进核心编辑器。

未来插件类型包括 AI 工具、导出器、主题、命令、图表渲染、语法扩展、文档模板与效率工具等。我们的长期目标是围绕 MetaDoc 构建开放生态。

---

# 📚 文档

文档持续完善中，当前资源包括项目架构、开发指南、插件 SDK、AI 运行时、导出框架与贡献指南等，将随版本发布逐步补充。

---

<a id="参与贡献"></a>

# 🤝 参与贡献

欢迎各种规模的贡献——修复笔误、改进文档、报告问题或实现新功能，我们都非常感谢。

## 贡献步骤

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m "Add amazing feature"`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 发起 Pull Request

---

## 开发原则

- 保持编辑器轻量
- 避免不必要的依赖
- API 设计应便于扩展
- 尊重本地优先的工作流
- AI 保持可选
- 代码清晰可读
- 为公共 API 编写文档

---

# ❤️ 社区

如果你喜欢 MetaDoc，欢迎通过 ⭐ Star、🐛 提 Issue、💡 提出建议、🔧 贡献代码、📖 完善文档或 🌍 翻译界面等方式支持项目。每一份贡献都让 MetaDoc 变得更好。

---

# 📈 愿景

我们并不想再做一款新的 Markdown 编辑器。

我们希望打造的是一个开放、可扩展的文档平台。

它既可以是一款轻量的 Markdown 编辑器，也可以通过插件扩展为支持 LaTeX、DOCX、Typst 等更多格式的创作环境；既可以是一款纯本地软件，也可以按需接入 AI、知识库和自动化工作流。

我们希望，MetaDoc 能够陪伴开发者、研究者和技术写作者完成未来十年的创作工作。

轻量，是我们的起点；开放，才是我们的方向。
---

# 📄 许可证

MetaDoc 基于 **GNU General Public License v2.0 (GPL-2.0)** 发布。你可以在许可条款下自由使用、修改、研究与再分发。完整文本见 [LICENSE](LICENSE)。

---

# 🙏 致谢

MetaDoc 建立在众多优秀开源项目之上，特别感谢 Electron、Vue.js、TypeScript、Vditor、Monaco Editor、SQLite、sqlite-vec、markdown-it、KaTeX、Mermaid 等社区的无私贡献。

---

<div align="center">

# ⭐ Star 历史

如果 MetaDoc 对你的日常写作有所帮助，欢迎点个 Star，帮助更多人发现这个项目，也激励我们持续改进。

---

### 为专注写作而设计。

**轻量，而不简单。**

**AI 随心可选。**

**开放，且始终开源。**

<br>

Made with ❤️ by **ByteLight**

<br>

**[English](#english)** | **[简体中文](#简体中文)**

</div>
