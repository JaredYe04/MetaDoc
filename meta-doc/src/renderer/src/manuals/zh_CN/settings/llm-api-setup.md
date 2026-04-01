# LLM API 配置入门 ✨

想在 MetaDoc 里使用 AI 对话、校对或 Agent，需要先在设置里**连上可用的 LLM API** 📡。下面按「先懂概念 → 在软件里怎么填 → 常见平台怎么开通 → 出问题怎么办 → 新手常问」的顺序说明。

> **⚠️ 重要声明**：除本机 **Ollama** 🦙 外，OpenRouter、OpenAI、Google、阿里云、DeepSeek、4sapi 等均为**第三方平台**。计费、合规、账号安全与隐私责任由你与对应平台承担；MetaDoc 仅作为客户端发起兼容请求。

## 📋 一表看懂：各配置类型怎么选


| 配置类型 | 图标 | 适合谁 👤 | 优点 ✨ | 取舍与注意 ⚖️ |
| :--- | :---: | :--- | :--- | :--- |
| **免费模型（内置）** | ![OpenRouter](https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64) | 想零门槛先体验一下 | 🎁 开箱即用、无需自备 Key 即可试用 | 📉 额度极少、可能被限流；想稳定使用请尽快换成自己的 Key |
| **OpenAI 兼容** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | 自建网关、OpenRouter、国内转发等 | 🔧 最灵活：填 Base URL + Key + 模型即可 | 📚 不同厂商路径差异大，需核对文档是否真「兼容 OpenAI」 |
| **OpenAI 官方** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | 已开通 OpenAI 账号与付款方式 | 🚀 官方模型更新快、生态成熟 | 💳 价格与地区政策以官网为准；需科学上网时请自行评估 |
| **DeepSeek** | ![DeepSeek](https://www.google.com/s2/favicons?domain=deepseek.com&sz=64) | 追求性价比的中文场景 | 💰 价格友好、接口简单 | ⏱️ 额度/限速以控制台为准；注意保存 Key |
| **Google Gemini** | ![Gemini](https://www.google.com/s2/favicons?domain=ai.google.dev&sz=64) | 需要多模态或谷歌生态 | 🖼️ 模型选择多、迭代快 | 🌍 需 Google 账号与 API 权限；地区与计费以 Google 为准 |
| **通义千问（Qwen）** | ![阿里云](https://www.google.com/s2/favicons?domain=aliyun.com&sz=64) | 国内访问稳定、企业用户 | 🇨🇳 延迟低、中文能力强 | ☁️ 需在阿里云开通模型服务；注意模型名与地域 |
| **Ollama（本地）** | ![Ollama](https://www.google.com/s2/favicons?domain=ollama.com&sz=64) | 希望数据不出本机、可接受折腾硬件 | 🔒 无按 token 向第三方付费（电费/硬件另算） | 💾 吃磁盘与显卡；纯 CPU 能跑但慢；小模型可能「笨」一些 |

**利害关系一句话**：要**省事与最新模型** → 多走云端官方或兼容聚合 ☁️；要**省钱/中文** → 可看 DeepSeek、通义等 💰；要**隐私与可控** → Ollama，但要自己扛硬件与效果 🦙；想**先白嫖试试** → 内置免费路由，但别指望当主力 🎁。

---

## 🧭 在 MetaDoc 里：你只需要完成三件事

<SettingLlmSection mode="demo" />

1. **选中或新建一个配置卡片**（新手可从「OpenAI 兼容」或「DeepSeek」入手）🃏。
2. 填好 **API Key** 🔑，必要时填写 **Base URL** 与 **Model**（模型 ID）。
3. 点击卡片上的 **「检查配置」** ✅：会通过多条路径探测接口是否可用。

---

## 🌐 路线 A：OpenRouter（一站式兼容，新手友好）

OpenRouter 把多家模型聚合成 **OpenAI 兼容** 接口，适合「希望只记一个 Base URL」的用法 🎯。

### 1️⃣ 注册并登录

打开 [OpenRouter](https://openrouter.ai/)，用邮箱等方式完成注册并登录。

### 2️⃣ 创建 API Key

进入 [Keys 设置](https://openrouter.ai/settings/keys)，新建 Key 并**复制保存**（多数平台只显示一次完整密钥）📋。

### 3️⃣ 在 MetaDoc 中填写

选择 **OpenAI 兼容**，将 **Base URL** 设为 `https://openrouter.ai/api/v1`，粘贴 Key。**模型**可先填 `openrouter/free`，或填写活动页、模型列表里看到的模型 ID。需要了解请求格式时可查阅 [OpenRouter 文档](https://openrouter.ai/docs/) 与 [免费路由说明](https://openrouter.ai/openrouter/free)。

即使走免费路由，仍可能有每日上限或排队 ⏳；需要稳定性请在控制台关注**余额与限速**。

---

## 🐋 路线 B：DeepSeek（性价比）

### 1️⃣ 注册并进入控制台

访问 [deepseek.com](https://www.deepseek.com/)，按指引注册并进入 API 相关控制台。

### 2️⃣ 创建 API Key

在控制台中找到「API keys」或同类入口，创建 Key 并保存 🔐。

### 3️⃣ 在 MetaDoc 中填写

选择 **DeepSeek**，粘贴 Key；模型可填 `deepseek-chat` 或 `deepseek-reasoner`（以 [开放平台文档](https://api-docs.deepseek.com/) 最新说明为准）。

---

## 🔗 路线 C：4sapi 等聚合服务（OpenAI 兼容）

这类服务通常提供与 OpenAI 相同的 URL 形态（如 `.../v1/chat/completions`），适合已有国内转发或聚合需求的用户 🌏。

先阅读 [4sapi 文档（Apifox）](https://4sapi.apifox.cn/) 中的**计费与接口说明**，在控制台创建 Key，并记下对方给出的 **Base URL** 与 **模型名**。在 MetaDoc 中选择 **OpenAI 兼容**，逐项粘贴。聚合平台规则变更较快，请以对方控制台为准，并**谨慎保管 Key** ⚠️。

---

## 🦙 路线 D：Ollama（本机运行）

### 1️⃣ 安装 Ollama

从 [ollama.com](https://ollama.com/) 下载并安装，确保本机可正常运行。

### 2️⃣ 拉取模型

在终端执行例如 `ollama pull llama3.1`（具体模型名以官网为准）。模型体积较大，请预留磁盘空间 💾。

### 3️⃣ 在 MetaDoc 中填写

选择 **Ollama**，API 地址一般为 `http://localhost:11434/api`，**模型**填你拉取的名字。独显能明显提速 🎮；纯 CPU 可用但长文会慢；模型过小可能出现答非所问，属本地推理的常见限制。更多说明见 [Ollama GitHub](https://github.com/ollama/ollama)。

---

## ☁️ 路线 E：通义千问 / 阿里云 DashScope

在阿里云开通 **DashScope（灵积）** 并创建 API-Key，步骤与入口见 [模型服务文档总览](https://help.aliyun.com/zh/dashscope/)。在 MetaDoc 中选择 **通义千问**，**Base URL** 请填控制台提供的 **OpenAI 兼容** 地址（以你账号当前展示为准），并核对模型名与地域。

---

## 🔷 路线 F：Google Gemini

在 [Google AI for Developers](https://ai.google.dev/) 或 Cloud 控制台创建 API Key。在 MetaDoc 中选择 **Gemini**，按界面提示填写 Key 与模型名（以官网模型列表为准）。

---

## 🧯 排查：常见错误怎么理解

- **401 / 403** 🔐：Key 错误、未开通对应模型，或项目/权限未授权。
- **402 / 余额不足** 💳：到对应平台充值或更换可用 Key。
- **429** ⏱️：触发限速——稍后再试、降低并发，或升级套餐。
- **502 / 网关错误** 🌐：多为上游或网络链路问题；可稍后重试或更换网络/节点。
- **空输出 / JSON 解析失败** 🧩：核对 Base URL 是否多或少了 `/v1`、模型 ID 是否拼写正确、是否被公司代理或防火墙拦截。

---

## ❓ 常见问题（FAQ）

### API Key 是干什么用的？🔑

可以理解为**调用云端模型的「门禁密码」**。MetaDoc 把对话请求发到模型服务商；服务商通过 Key 识别你的账号与额度。Key **不要**发给陌生人、不要贴到公开仓库；泄露后别人可能盗用你的额度。

### 计费一般怎么算？Token 是什么？💰

多数云厂商按 **token**（文本切分后的最小计费单位，中英文习惯不同）计费：输入与输出往往分开计价。具体**单价、免费额、套餐**以各平台定价页与控制台为准；MetaDoc 不代收费用。本地 Ollama 通常不向云厂商按 token 付费，但仍有电费与硬件成本。

### Base URL 是什么？为什么要填？🔗

它是 **API 的网络地址前缀**，告诉客户端「请求要发到哪台服务器、哪条路径」。同一套「OpenAI 兼容」填法下，换厂商往往就是换 Base URL + 模型名；填错会连错服务或返回 404/401。

### 为什么 MetaDoc 不直接内置「无限用」的大模型？☁️

云端推理有算力与带宽成本，且涉及合规与地区政策。MetaDoc 作为编辑器客户端，**把模型选择权与付费关系交给你与正规服务商**，避免把成本与合规风险转嫁给所有用户。但是未来可能会推出MetaDoc官方代理的大模型服务。

### 「免费试用」和自备 Key 有什么区别？🎁

内置或活动提供的试用额度通常**少、可能排队或限流**，适合体验。自备 Key 后，额度与稳定性由你与该平台合约决定，更适合日常重度使用。

### 我的文档内容会发给谁？🔒

使用**云端 API** 时，请求会到达你所选服务商（及其实际推理链路），请阅读该平台的**隐私政策与数据处理说明**。使用 **Ollama 且仅本机访问**时，数据不离开本机的程度取决于你如何配置网络与软件；仍建议不要在未加密环境传输敏感信息。

### 401、403、429 和「检查配置」失败是一回事吗？🧪

不完全是。「检查配置」会综合探测连通性与鉴权；单独出现的 HTTP 状态码可参考上文「排查」一节。若多项失败，优先核对 Key、Base URL、模型名三件套。

### 本地 Ollama 和云端 API 怎么选？⚖️

重视隐私、可接受速度与效果取舍 → 优先 Ollama 🦙。重视最新大模型与稳定产出、能接受付费与合规要求 → 选正规云 API ☁️。

### 一个 Key 能在多台电脑上用吗？💻

技术上往往可以，但会**共享同一额度与限速**；若平台禁止多终端或要求固定 IP，请遵守对方条款。团队共用建议用子账号或密钥轮换策略。

### 是否一定要外网环境？🌍

取决于你选的**服务商与当前网络**。部分国际厂商在国内访问可能不稳定或被阻断，请以实际连通性为准；合规与风险由你自行评估。

---

第一次配置会涉及注册、复制 Key、对照文档，看起来步骤多；熟练之后主要是「换平台就换一组 Base URL + 模型」✨。祝你顺利连上适合自己的模型 🎉。
