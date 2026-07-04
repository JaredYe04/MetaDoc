# 内置 API Key 说明

MetaDoc 开源版在 [`meta-doc/.env.example`](../../.env.example) 中提供了部分第三方服务的 **共享免费额度** API Key，便于克隆仓库后直接开发，无需自行注册。

## SimpleTex（公式 OCR）

- **变量**：`SIMPLETEX_APP_ID`、`SIMPLETEX_APP_SECRET`
- **用途**：[`FomulaRecognition.vue`](../../src/renderer/src/views/FomulaRecognition.vue) 等页面的 LaTeX OCR
- **说明**：使用的是 SimpleTex 免费接口；该账号无付费余额，公开 Key 主要为降低贡献者配置成本
- **替换**：可在本地 `meta-doc/.env`（gitignore）中替换为你自己的 Key

## SiliconFlow（RAG 向量 Embedding）

- **变量**：`SILICONFLOW_API_KEY`
- **用途**：[`rag-service.ts`](../../src/main/utils/rag-service.ts) 在 API 模式下调用 `netease-youdao/bce-embedding-base_v1`
- **说明**：同样为免费额度；无余额风险，但共享 Key 若被滥用可能导致配额耗尽
- **替代**：在设置中将知识库 Embedding 切为 **本地模式**，或在 `.env` 中使用自己的 SiliconFlow Key

## 不应出现在 .env 中的密钥

| 变量 | 说明 |
|------|------|
| `GITHUB_FEEDBACK_*` | 已废弃；开源版反馈请使用 [GitHub Issues](https://github.com/JaredYe04/MetaDoc/issues/new) |
| `VITE_SERVER_URL` / `SERVER_URL` | 已废弃；见 [`archived/docs/LEGACY_SPRING_SERVER.md`](../../../archived/docs/LEGACY_SPRING_SERVER.md) |
| `VITE_METADOC_*` / `VITE_STEAM_*` | Steam / 官方云构建；见 [`meta-doc/.env.steam.example`](../../.env.steam.example) |

LLM 对话用的 OpenAI / DeepSeek 等 Key 由用户在应用 **设置 → LLM** 中自行配置，**不要**写入 `.env`。

## 本地配置流程

```bash
cp meta-doc/.env.example meta-doc/.env
# 按需编辑 meta-doc/.env（该文件不会被 Git 跟踪）
```

构建时 [`scripts/copy-env.js`](../../scripts/copy-env.js) 会将 `.env` 写入 `resources/.env` 并随安装包分发（仅含上述公开 Key 与更新检查等非敏感项）。
