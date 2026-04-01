# LLM API Setup Guide ✨

To use chat, proofreading, or the agent in MetaDoc, you need a **working LLM API** in settings 📡. This page goes from concepts → what to fill in MetaDoc → how to enable common providers → troubleshooting → beginner FAQs.

> **⚠️ Disclaimer**: Except for local **Ollama** 🦙, providers such as OpenRouter, OpenAI, Google, Alibaba Cloud, DeepSeek, and aggregators like **4sapi** are **third-party services**. Billing, compliance, account security, and privacy are between you and that provider; MetaDoc only sends compatible requests as a client.

## 📋 At a glance: compare provider types


| Type | Icon | Best for 👤 | Pros ✨ | Trade-offs ⚖️ |
| :--- | :---: | :--- | :--- | :--- |
| **Built-in free (OpenRouter)** | ![OpenRouter](https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64) | First-time tryout | 🎁 Zero setup—try without your own key | 📉 Tiny quota; may be rate-limited—add your own key for real work |
| **OpenAI compatible** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Gateways, OpenRouter, regional mirrors | 🔧 Most flexible: Base URL + key + model | 📚 “Compatible” quality varies—verify docs |
| **OpenAI official** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Official OpenAI billing | 🚀 Cutting-edge models, mature ecosystem | 💳 Pricing and regional policy per OpenAI |
| **DeepSeek** | ![DeepSeek](https://www.google.com/s2/favicons?domain=deepseek.com&sz=64) | Cost-sensitive, Chinese-heavy workflows | 💰 Great value, simple API | ⏱️ Quota/rate limits per console—guard your key |
| **Google Gemini** | ![Gemini](https://www.google.com/s2/favicons?domain=ai.google.dev&sz=64) | Multimodal / Google stack | 🖼️ Broad model family, fast iteration | 🌍 Google account and API policy; regions per Google |
| **Qwen (DashScope)** | ![Alibaba](https://www.google.com/s2/favicons?domain=aliyun.com&sz=64) | Stable China-region, enterprise | 🇨🇳 Low latency, strong Chinese | ☁️ Enable the right DashScope product; match endpoint + region |
| **Ollama (local)** | ![Ollama](https://www.google.com/s2/favicons?domain=ollama.com&sz=64) | Privacy / offline-style use | 🔒 No per-token cloud bill (power/HW still count) | 💾 Disk & GPU hungry; CPU-only is slow; tiny models can feel weak |

**How to choose in one line**: want **convenience and frontier models** → cloud official or compatible aggregators ☁️; want **cost / Chinese** → DeepSeek, Qwen, etc. 💰; want **privacy and control** → Ollama—at the cost of hardware and raw capability 🦙; want **a free spin first** → built-in free route—just don’t expect it to carry heavy daily load 🎁.

---

## 🧭 Three things to do in MetaDoc

<SettingLlmSection mode="demo" />

1. **Pick or create a profile** (OpenAI compatible or DeepSeek is a fine starting point) 🃏.
2. Paste the **API key** 🔑, and when required the **Base URL** and **model** id.
3. Click **Check config** ✅ to run connectivity and auth probes.

---

## 🌐 Track A — OpenRouter (one-stop, OpenAI compatible)

OpenRouter aggregates many models behind one **OpenAI compatible** base URL—handy when you want a single endpoint to remember 🎯.

### 1️⃣ Sign up

Open [OpenRouter](https://openrouter.ai/) and create an account.

### 2️⃣ Create an API key

Go to [Keys](https://openrouter.ai/settings/keys), create a key, and **copy it somewhere safe** (many providers show the full secret only once) 📋.

### 3️⃣ Fill MetaDoc

Choose **OpenAI compatible**. Set **Base URL** to `https://openrouter.ai/api/v1`, paste the key, and set **model** to something like `openrouter/free` or any model id from their catalog. Optional reading: [OpenRouter docs](https://openrouter.ai/docs/) and the [free router](https://openrouter.ai/openrouter/free) page.

Free routes can still have daily caps or queues ⏳; for production use, watch **balance and rate limits** in the console.

---

## 🐋 Track B — DeepSeek (value)

### 1️⃣ Console access

Sign in at [deepseek.com](https://www.deepseek.com/) and open the API section of the console.

### 2️⃣ API key

Create a key from the **API keys** (or equivalent) page and store it securely 🔐.

### 3️⃣ MetaDoc fields

Choose **DeepSeek**, paste the key, and set model to `deepseek-chat` or `deepseek-reasoner` per the latest [API docs](https://api-docs.deepseek.com/).

---

## 🔗 Track C — Aggregators such as 4sapi (OpenAI compatible)

These services usually expose the same URL shape as OpenAI (`.../v1/chat/completions`) 🌏. Read pricing and endpoints in the [4sapi docs (Apifox)](https://4sapi.apifox.cn/), create a key, and copy the **Base URL** and **model id** exactly as documented. In MetaDoc, pick **OpenAI compatible** and paste each field. Rules change often—treat the vendor console as source of truth and **protect your key** ⚠️.

---

## 🦙 Track D — Ollama (local)

### 1️⃣ Install

Download from [ollama.com](https://ollama.com/) and confirm the app runs on your machine.

### 2️⃣ Pull a model

Example: `ollama pull llama3.1` (check the site for current model names). Models are large—leave enough disk space 💾.

### 3️⃣ MetaDoc settings

Choose **Ollama**, set base to `http://localhost:11434/api`, and **model** to the name you pulled. A discrete GPU helps a lot 🎮; CPU-only is slower on long replies. See [Ollama on GitHub](https://github.com/ollama/ollama) for details.

---

## ☁️ Track E — Alibaba Qwen / DashScope

Enable **DashScope** and create an API key following [DashScope help](https://help.aliyun.com/zh/dashscope/). In MetaDoc, choose **Qwen** and paste the **OpenAI-compatible** base URL shown in your console, plus the correct model name and region if applicable.

---

## 🔷 Track F — Google Gemini

Create an API key via [Google AI for Developers](https://ai.google.dev/) (or Cloud console flows). In MetaDoc, open **Gemini** and fill key and model id from the current model list.

---

## 🧯 Troubleshooting

- **401 / 403** 🔐: Wrong key, missing model entitlement, or project not authorized.
- **402 / billing** 💳: Add credits or switch to a funded key.
- **429** ⏱️: Rate limited—retry later, reduce concurrency, or upgrade the plan.
- **502 / gateway** 🌐: Upstream or network issue—retry or change network path.
- **Empty output / JSON errors** 🧩: Re-check Base URL (including `/v1`), model id spelling, and corporate proxies/firewalls.

---

## ❓ FAQ

### What is an API key for? 🔑

It is the **credential** your provider uses to bill and authorize requests. MetaDoc sends it only to the endpoints you configure. Never share keys publicly or commit them to repos; leaked keys can drain quota or spend.

### How does billing work? What is a token? 💰

Most cloud APIs charge by **tokens**—roughly pieces of text after the model’s tokenizer runs. Input and output are often priced separately. Exact **rates, free tiers, and bundles** live on each vendor’s pricing page. MetaDoc does not resell model access. Local Ollama usually avoids per-token cloud charges but still uses electricity and hardware.

### What is Base URL and why do I need it? 🔗

It is the **HTTP prefix** for the API: host + path that your client calls. When you switch vendors under “OpenAI compatible,” you often only change Base URL + model id; a typo here hits the wrong service or returns 404/401.

### Why doesn’t MetaDoc ship “unlimited” cloud models? ☁️

Inference costs money and must respect regional policies. MetaDoc stays a **client**: you choose a licensed provider and pay them directly instead of hiding those costs in the app for everyone. However, in the future, MetaDoc may launch large model services through its official agents.

### Built-in free trial vs my own key 🎁

Trials are usually **small quotas** and may queue or throttle. Bringing your own key ties usage to your contract with that vendor—better for daily work.

### Where does my document text go? 🔒

With **cloud APIs**, requests go to the provider you picked (and their subprocessors as described in **their** privacy policy). With **local Ollama** bound to localhost, content normally stays on the machine, subject to your OS and network configuration—still avoid sending secrets over untrusted networks.

### Are HTTP errors the same as “Check config” failing? 🧪

Not always. **Check config** runs several probes; a bare **401/429** still maps to the bullets above. If multiple checks fail, re-verify key, Base URL, and model id together.

### Ollama vs cloud—how do I choose? ⚖️

Pick **Ollama** 🦙 for stronger privacy and offline-style use if you accept speed/quality trade-offs. Pick **cloud** ☁️ when you want the newest large models and stable throughput and accept billing plus vendor terms.

### Can I reuse one key on many PCs? 💻

Often yes technically, but **quota and rate limits are shared**. Some vendors restrict sharing or IP—follow their terms. For teams, prefer separate keys or IAM-style policies.

### Do I need a VPN? 🌍

Depends on **which provider** you use and your **network**. Some international endpoints are unstable or blocked in certain regions—test connectivity yourself and comply with local regulations.

---

First-time setup involves accounts and copying long strings; after that it is mostly “new vendor → new Base URL + model” ✨. Good luck connecting a stack that fits your needs 🎉.
