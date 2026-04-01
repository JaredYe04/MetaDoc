# LLM API 設定入門 ✨

若要在 MetaDoc 使用 AI 對話、校對或 Agent，需先在設定中**連上可用的 LLM API** 📡。以下依「先懂概念 → 在軟體裡怎麼填 → 常見平台怎麼開通 → 出問題怎麼辦 → 新手常問」的順序說明。

> **⚠️ 重要聲明**：除本機 **Ollama** 🦙 外，OpenRouter、OpenAI、Google、阿里雲、DeepSeek、4sapi 等均為**第三方平台**。計費、合規、帳號安全與隱私責任由您與對應平台承擔；MetaDoc 僅作為用戶端發起相容請求。

## 📋 一表看懂：各設定類型怎麼選


| 設定類型 | 圖示 | 適合誰 👤 | 優點 ✨ | 取捨與注意 ⚖️ |
| :--- | :---: | :--- | :--- | :--- |
| **免費模型（內建）** | ![OpenRouter](https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64) | 想零門檻先體驗 | 🎁 開箱即用、無需自備 Key 即可試用 | 📉 額度極少、可能被限流；想穩定使用請盡快換成自己的 Key |
| **OpenAI 相容** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | 自建閘道、OpenRouter、國內轉送等 | 🔧 最靈活：填 Base URL + Key + 模型即可 | 📚 不同廠商路徑差異大，需核對文件是否真「相容 OpenAI」 |
| **OpenAI 官方** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | 已開通 OpenAI 帳號與付款方式 | 🚀 官方模型更新快、生態成熟 | 💳 價格與地區政策以官網為準；需科學上網時請自行評估 |
| **DeepSeek** | ![DeepSeek](https://www.google.com/s2/favicons?domain=deepseek.com&sz=64) | 追求性價比的中文情境 | 💰 價格友善、介面簡單 | ⏱️ 額度／限速以控制台為準；注意保存 Key |
| **Google Gemini** | ![Gemini](https://www.google.com/s2/favicons?domain=ai.google.dev&sz=64) | 需要多模態或 Google 生態 | 🖼️ 模型選擇多、迭代快 | 🌍 需 Google 帳號與 API 權限；地區與計費以 Google 為準 |
| **通義千問（Qwen）** | ![阿里雲](https://www.google.com/s2/favicons?domain=aliyun.com&sz=64) | 存取穩定、企業使用者 | 🇨🇳 延遲低、中文能力強 | ☁️ 需在阿里雲開通模型服務；注意模型名與地域 |
| **Ollama（本機）** | ![Ollama](https://www.google.com/s2/favicons?domain=ollama.com&sz=64) | 希望資料不出本機、可接受硬體折騰 | 🔒 無按 token 向第三方付費（電費／硬體另算） | 💾 吃磁碟與顯示卡；純 CPU 能跑但慢；小模型可能「笨」一些 |

**一句話怎麼選**：要**省事與最新模型** → 多走雲端官方或相容聚合 ☁️；要**省錢／中文** → 可看 DeepSeek、通義等 💰；要**隱私與可控** → Ollama，但要自己扛硬體與效果 🦙；想**先免費試試** → 內建免費路由，但別指望當主力 🎁。

---

## 🧭 在 MetaDoc 裡：您只需要完成三件事

<SettingLlmSection mode="demo" />

1. **選取或新增一張設定卡片**（新手可從「OpenAI 相容」或「DeepSeek」入手）🃏。
2. 填好 **API Key** 🔑，必要時填寫 **Base URL** 與 **Model**（模型 ID）。
3. 點選卡片上的 **「檢查設定」** ✅：會透過多條路徑探測介面是否可用。

---

## 🌐 路線 A：OpenRouter（一站式相容，新手友善）

OpenRouter 把多家模型聚合成 **OpenAI 相容** 介面，適合「希望只記一個 Base URL」的用法 🎯。

### 1️⃣ 註冊並登入

開啟 [OpenRouter](https://openrouter.ai/)，以電子郵件等方式完成註冊並登入。

### 2️⃣ 建立 API Key

進入 [Keys 設定](https://openrouter.ai/settings/keys)，新建 Key 並**複製保存**（多數平台只顯示一次完整金鑰）📋。

### 3️⃣ 在 MetaDoc 中填寫

選擇 **OpenAI 相容**，將 **Base URL** 設為 `https://openrouter.ai/api/v1`，貼上 Key。**模型**可先填 `openrouter/free`，或填活動頁、模型清單裡看到的模型 ID。需要了解請求格式時可查閱 [OpenRouter 文件](https://openrouter.ai/docs/) 與 [免費路由說明](https://openrouter.ai/openrouter/free)。

即使走免費路由，仍可能有每日上限或排隊 ⏳；需要穩定性請在控制台關注**餘額與限速**。

---

## 🐋 路線 B：DeepSeek（性價比）

### 1️⃣ 註冊並進入控制台

造訪 [deepseek.com](https://www.deepseek.com/)，依指引註冊並進入 API 相關控制台。

### 2️⃣ 建立 API Key

在控制台中找到「API keys」或同類入口，建立 Key 並保存 🔐。

### 3️⃣ 在 MetaDoc 中填寫

選擇 **DeepSeek**，貼上 Key；模型可填 `deepseek-chat` 或 `deepseek-reasoner`（以 [開放平台文件](https://api-docs.deepseek.com/) 最新說明為準）。

---

## 🔗 路線 C：4sapi 等聚合服務（OpenAI 相容）

這類服務通常提供與 OpenAI 相同的 URL 形態（如 `.../v1/chat/completions`），適合已有國內轉送或聚合需求的使用者 🌏。

先閱讀 [4sapi 文件（Apifox）](https://4sapi.apifox.cn/) 中的**計費與介面說明**，在控制台建立 Key，並記下對方給出的 **Base URL** 與**模型名**。在 MetaDoc 中選擇 **OpenAI 相容**，逐項貼上。聚合平台規則變更較快，請以對方控制台為準，並**謹慎保管 Key** ⚠️。

---

## 🦙 路線 D：Ollama（本機執行）

### 1️⃣ 安裝 Ollama

從 [ollama.com](https://ollama.com/) 下載並安裝，確認本機可正常執行。

### 2️⃣ 拉取模型

在終端機執行例如 `ollama pull llama3.1`（具體模型名以官網為準）。模型體積較大，請預留磁碟空間 💾。

### 3️⃣ 在 MetaDoc 中填寫

選擇 **Ollama**，API 位址一般為 `http://localhost:11434/api`，**模型**填您拉取的名稱。獨立顯示卡能明顯提速 🎮；純 CPU 可用但長文會慢；模型過小可能答非所問，屬本機推論的常見限制。更多說明見 [Ollama GitHub](https://github.com/ollama/ollama)。

---

## ☁️ 路線 E：通義千問／阿里雲 DashScope

在阿里雲開通 **DashScope（靈積）** 並建立 API-Key，步驟與入口見 [模型服務文件總覽](https://help.aliyun.com/zh/dashscope/)。在 MetaDoc 中選擇 **通義千問**，**Base URL** 請填控制台提供的 **OpenAI 相容** 位址（以您帳號目前顯示為準），並核對模型名與地域。

---

## 🔷 路線 F：Google Gemini

在 [Google AI for Developers](https://ai.google.dev/) 或 Cloud 控制台建立 API Key。在 MetaDoc 中選擇 **Gemini**，依介面提示填寫 Key 與模型名（以官網模型清單為準）。

---

## 🧯 排查：常見錯誤怎麼理解

- **401 / 403** 🔐：Key 錯誤、未開通對應模型，或專案／權限未授權。
- **402 / 餘額不足** 💳：到對應平台儲值或更換可用 Key。
- **429** ⏱️：觸發限速——稍後再試、降低並發，或升級方案。
- **502 / 閘道錯誤** 🌐：多為上游或網路鏈路問題；可稍後重試或更換網路／節點。
- **空輸出／JSON 解析失敗** 🧩：核對 Base URL 是否多或少了 `/v1`、模型 ID 是否拼寫正確、是否被公司 Proxy 或防火牆攔截。

---

## ❓ 常見問題（FAQ）

### API Key 是做什麼用的？🔑

可理解為**呼叫雲端模型的「門禁密碼」**。MetaDoc 把對話請求送到模型服務商；服務商透過 Key 識別您的帳號與額度。Key **不要**傳給陌生人、不要貼到公開儲存庫；外洩後他人可能盜用您的額度。

### 計費一般怎麼算？Token 是什麼？💰

多數雲廠商依 **token**（文字切分後的最小計費單位，中英文習慣不同）計費：輸入與輸出往往分開計價。具體**單價、免費額、方案**以各平台定價頁與控制台為準；MetaDoc 不代收費用。本機 Ollama 通常不向雲廠商按 token 付費，但仍有電費與硬體成本。

### Base URL 是什麼？為什麼要填？🔗

它是 **API 的網路位址前綴**，告訴用戶端「請求要送到哪台伺服器、哪條路徑」。同一套「OpenAI 相容」填法下，換廠商往往就是換 Base URL + 模型名；填錯會連錯服務或回傳 404／401。

### 為什麼 MetaDoc 不直接內建「無限用」的大模型？☁️

雲端推論有算力與頻寬成本，且涉及合規與地區政策。MetaDoc 作為編輯器用戶端，**把模型選擇權與付費關係交給您與正規服務商**，避免把成本與合規風險轉嫁給所有使用者。未來可能會推出 MetaDoc 官方代理的大模型服務。

### 「免費試用」和自備 Key 有什麼差別？🎁

內建或活動提供的試用額度通常**少、可能排隊或限流**，適合體驗。自備 Key 後，額度與穩定性由您與該平台合約決定，較適合日常重度使用。

### 我的文件內容會傳給誰？🔒

使用**雲端 API** 時，請求會到達您所選服務商（及其實際推論鏈路），請閱讀該平台的**隱私權政策與資料處理說明**。使用 **Ollama 且僅本機存取**時，資料不離開本機的程度取決於您如何設定網路與軟體；仍建議不要在未加密環境傳輸敏感資訊。

### 401、403、429 和「檢查設定」失敗是一回事嗎？🧪

不完全是。「檢查設定」會綜合探測連通性與鑑權；單獨出現的 HTTP 狀態碼可參考上文「排查」一節。若多項失敗，優先核對 Key、Base URL、模型名三件套。

### 本機 Ollama 和雲端 API 怎麼選？⚖️

重視隱私、可接受速度與效果取捨 → 優先 Ollama 🦙。重視最新大模型與穩定產出、能接受付費與合規要求 → 選正規雲 API ☁️。

### 一個 Key 能在多台電腦上用嗎？💻

技術上往往可以，但會**共享同一額度與限速**；若平台禁止多終端或要求固定 IP，請遵守對方條款。團隊共用建議用子帳號或金鑰輪替策略。

### 是否一定要外網環境？🌍

取決於您選的**服務商與目前網路**。部分國際廠商在特定地區存取可能不穩定或被阻斷，請以實際連通性為準；合規與風險由您自行評估。

---

第一次設定會涉及註冊、複製 Key、對照文件，看起來步驟多；熟練之後主要是「換平台就換一組 Base URL + 模型」✨。祝您順利連上適合自己的模型 🎉。
