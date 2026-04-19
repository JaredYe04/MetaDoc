# Steam 官方云 + Cloudflare Worker + n1n — 上线与日常运维

本文档汇总 **Cloudflare**、**Steamworks（Microtransactions）**、**n1n** 的配置顺序，以及仓库内 **定价 / 模型快照** 与运行时行为的关系。

---

## 1. 为什么 `pricing-generated.ts` 里模型很少？

`cloudflare-worker/src/pricing-generated.ts` **不是**运行时向 n1n 拉取的「全量模型目录」，而是由脚本 **`pnpm run validate:pricing`**（`scripts/validate-pricing.mjs`）从 **`docs/cloud/pricing/n1n-model-rates.yaml`** 生成的一份 **快照**。

- **目的**：稳定、可审计、可离线部署；冻结/扣费用的 `credits_per_1k_tokens_est` 与 Steam 标价一样走「先写配置再发版」流程。
- **与 n1n 全量列表的关系**：n1n 的 OpenAI 兼容 **`GET /v1/models`** 需要 **Bearer API Key**，未授权会返回 **401**（与是否「正确接口」无关，只是未带令牌）。
- **如何拉全量模型（命令行）**：在已设置密钥的环境中执行（勿把 Key 写进仓库）：

```bash
# Windows PowerShell 示例（需安装 curl.exe）
curl.exe -sS -H "Authorization: Bearer %N1N_API_KEY%" "https://api.n1n.ai/v1/models"
```

或使用仓库脚本（见下节）。

- **如何同步到 YAML**：把需要上架的模型 id 与预估费率写进 `n1n-model-rates.yaml`，再执行 `pnpm run validate:pricing` 并部署 Worker。全量模型里很多对用户不可用或成本高，**建议在 Worker 或配置里做白名单**，而不是无筛选全开放。

---

## 2. 用脚本探测 n1n `/v1/models`（可选）

```bash
cd meta-doc
set N1N_API_KEY=你的密钥
node scripts/fetch-n1n-models.mjs
```

脚本会请求 `https://api.n1n.ai/v1/models` 并打印 **HTTP 状态**与 **模型 id 数量**；若需合并进 YAML，请人工筛选后写入 `n1n-model-rates.yaml`，再跑 `validate:pricing`。

---

## 3. Cloudflare Workers

1. **D1**：创建数据库，将 `wrangler.toml` 中 `database_id` 配为生产 id；对远程库执行迁移（含 `mtx_orders.currency` 等）。
2. **Secrets**（示例）：`JWT_SECRET`、`STEAM_WEB_API_KEY`、`N1N_API_KEY`（或兼容名 `OPENAI_API_KEY`）、可选 `N1N_BASE_URL`。
3. **Vars**：`STEAM_APP_ID`；生产务必将 **`ALLOW_DEV_AUTH`** 设为 **`false`**；真钱前将 **`STEAM_MICROTX_SANDBOX`** 设为 **`false`**。
4. **改价 / 改模型**：先改 `docs/cloud/pricing/*.yaml` → `pnpm run validate:pricing` → `wrangler deploy`。
5. **客户端**：Steam 构建设置 **`VITE_METADOC_CLOUD_API_URL`** = Worker 根 URL（无尾斜杠）。DEV 连 staging 与开发鉴权见 **`.env.steam.example`**。

更细的改价流程见 [operations-pricing.md](./operations-pricing.md)。

### 排障：`Steam ticket validation failed`（`AuthenticateUserTicket`）

客户端已能拿到会话票据，但 Worker 调 Steam **Web API** 校验失败时会出现该提示（与「仅 URL 填错」不同）。

1. **`STEAM_APP_ID` 必须与 `steam_appid.txt` 一致**（示例见 `steam_appid.txt.example`）。本地 `pnpm dev` 时若使用 **Spacewar 480** 等测试 AppID，而线上 Worker 配置为正式 AppID（如 `wrangler.toml` 中的值），**校验必然失败**。
2. **`STEAM_WEB_API_KEY`** 须为 Steamworks 上本应用所属 **Publisher Web API Key**，且已通过 `wrangler secret put STEAM_WEB_API_KEY` 写入**当前部署环境**。
3. 部署 Worker 后若仍失败，看接口返回中的 **Steam 错误码/描述**（常见 `Invalid parameter` 与票据不完整、AppID 不匹配有关）。Worker 已把简要原因带回 JSON `message`，便于对照。
4. **若响应里仍是旧文案** `Steam ticket validation failed`（无 Steam 错误码），说明 **线上 Worker 未部署到当前仓库版本**；请执行 `wrangler deploy` 后再测。`AuthenticateUserTicket` 以 **GET** 为主（与 Steam 文档一致）；**POST** 可能被 Steam 返回 **403**。仅当 **GET URL 过长** 或 **414** 时再 **POST**。
5. 从 **Steam 客户端** 启动应用并保持已登录；票据由 Greenworks 生成，须与上述 AppID 对应。
6. **若接口 `message` 里出现 Steam 的 HTML** `Please verify your key= parameter`，且 **partner.steam-api.com 与 api.steampowered.com 均为 HTTP 403**：这是 Steam **明确拒绝当前 `key=` 字符串**，与票据、GET/POST 无关。常见原因：Secret 里填错/多了空格换行、用了非 Steamworks 的 Key、密钥已吊销、或 `wrangler secret` 未写到**当前**部署环境。请在 **Steamworks → Users & Permissions → 你的组 → Web API Key** 重新复制 **Publisher** 密钥，执行 `wrangler secret put STEAM_WEB_API_KEY`（粘贴时勿带引号），再 `wrangler deploy`。  
   **不经过 Worker、单独验证 Key 是否被 Steam 接受**（将 `YOUR_KEY` 换成真实密钥）：
   ```bash
   # PowerShell 下请用 curl.exe（否则 curl 是 Invoke-WebRequest，不支持 -sS）
   curl.exe -sS "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=440&count=1&key=YOUR_KEY"
   ```
   若仍返回 **403** 与上述 HTML，说明密钥本身无效；若返回 **200** 与 JSON，说明 Key 可用，再核对 Cloudflare 里 `STEAM_WEB_API_KEY` 是否与之一致（**粘贴 Secret 时勿带换行**；Worker 已对 key 做 `trim()`，部署最新 Worker 后生效）。

   **为何示例用 `appid=440`，和你自己的 `4359310` 是什么关系？**
   - `GetNewsForApp` 里的 `appid` 只表示「查哪个 App 的**新闻**」，**不**代表你的客户端或 Worker 必须用 440。用 440 只是方便（新闻多、易看出 JSON）。把 URL 里的 `appid` 换成 **`4359310`** 再请求：若仍是 **200**，说明 **Key 对该 App 也可调公开接口**；若 `newsitems` 为空，多半是当前游戏在 Steam 上**暂无新闻**，不是 Key 坏了。
   - **`AuthenticateUserTicket`（会话票校验）** 则完全不同：请求里的 **`appid` 必须与「签发这张会话票的游戏」一致。客户端 **`steam_appid.txt`**、Greenworks 使用的 AppID、以及 Worker 的 **`STEAM_APP_ID`（`wrangler.toml` / 环境变量）** 必须**同为** `4359310`。若客户端实际用 **480/440** 等跑开发包，而 Worker 写 **4359310**，Steam 会判票据与 `appid` 不匹配（常见 `Invalid parameter` 等），**这不是**「440 能通、4359310 不能通」的对比问题，而是 **票据归属的 AppID** 必须对齐。

---

## 4. Steamworks（Microtransactions）

1. **商品与标价**：按 [Microtransactions Implementation](https://partner.steamgames.com/doc/features/microtransactions/implementation)，**Item ID 由你们自定义**，通过 **`InitTxn`** 提交（金额单位为美分等，见 [Supported Currencies](https://partner.steamgames.com/doc/store/pricing/currencies)）。仓库 **`steam-mtx-items.yaml`** 与 Worker 调用必须与 **实际 InitTxn 参数** 一致；**partner 上通常没有**「逐条注册 IAP 商品」的独立页面，详见 [steamworks-mtx-catalog.md](./steamworks-mtx-catalog.md)。
2. **游戏内「上架」档位**：客户端使用 **`GET /steam/mtx/catalog`**（`Authorization: Bearer <JWT>`）拉取当前 `listed: true` 的档位，与 **`POST /steam/mtx/init`** 使用同一套生成数据；改 YAML 并部署 Worker 后无需再改前端硬编码。
3. **密钥与 App**：在 Steamworks 创建 **Web API Publisher Key**（[说明](https://partner.steamgames.com/doc/webapi_overview/auth)），写入 Worker Secret；`STEAM_APP_ID` 与当前应用一致。
4. 沙盒：使用 **`ISteamMicroTxnSandbox`** 跑通 InitTxn → 覆盖层授权 → FinalizeTxn；再切生产。
5. **入账 credits**：由 Worker 按 **`economics.yaml` 公式** 从 **实付 USD 等价** 计算，并可叠加 YAML 中的 **`volume_bonus_credits`（可选）** 作为「多买多送」的营销额度（需在财务可接受范围内调参）。
6. **Steam 商店页**：应用级说明与文案多在 Steamworks **人工**编辑；可用 `pnpm run generate:steam-store-mtx-snippet` 从 YAML 生成草稿后粘贴，见 [steamworks-mtx-catalog.md](./steamworks-mtx-catalog.md) 中「商店页 vs 游戏内」一节。

条目与 AppID 对齐说明见 [steamworks-mtx-catalog.md](./steamworks-mtx-catalog.md)。

### Steam 网页提示「交易授权错误」等（Web 结账 / `usersession=web`）

官方 [ISteamMicroTxn / InitTxn](https://partner.steamgames.com/doc/webapi/ISteamMicroTxn) 要求：`usersession=web` 时必须提供 **`ipaddress`**（IPv4 点分），且须与用户完成授权时使用的浏览器会话一致。客户端在 Electron 内用**同一**内嵌 Chromium 窗口（`persist:steam-mtx-checkout`）探测出口 IP、再打开 `steam_url`，见 `register-steam-ipc.ts` 与 `metadoc-cloud-auth.ts`。

**Cloudflare Worker 的出口 IP** 与上述 `ipaddress` **无需一致**；Steam 校验的是 **InitTxn 里填写的 `ipaddress`** 与 **用户完成授权时浏览器会话的出口**（对你们即该内嵌窗口的公网出口）。

#### 应用内已做的加固（IP 与时序）

- **同一窗口两次探测**：渲染进程在调用 `POST /steam/mtx/init` 前通过 `steam:mtx:get-public-ip` 取 IP；主进程在 **`loadURL(steam_url)` 之前**再次在同一窗口探测。若两次规范化后的 IP 不一致，主进程返回 **`mtx_ip_mismatch`**，渲染进程会 **重新 InitTxn**（新 `order_id`），最多重试若干轮。
- **双栈 / CN**：探测逻辑优先 **IPv4**（`ipv4.icanhazip.com` 等）；若先得到 IPv6，会短暂等待后再试一次 IPv4，减轻中国区双栈下与 Steam Web 行为不一致的情况。
- **多次仍无法内嵌打开**：最后一轮仍失败时，会 **回退为系统浏览器打开** 最后一次返回的 `steam_url`，并继续 **`sync-web` 轮询**（用户可在外部浏览器完成支付）。

#### 人工复现时的对照（排障）

| 步骤 | 说明 |
|------|------|
| **核对 InitTxn 用 IP 与支付窗出口** | 在 DEV 下可看主进程日志 `MTX checkout IP check`（`expected` / `now` / `match`）。若需与系统侧对照，可在**即将打开支付页的时刻**用系统浏览器访问同一类出口 IP 查询页，与日志中的 IP 比对。 |
| **JWT `steamid`、沙盒、启动方式** | 见下表；务必从 **Steam 客户端** 启动应用；DEV 下 **`VITE_METADOC_CLOUD_DEV_STEAM_ID`** 须与当前登录 Steam 账号一致。 |
| **内嵌 vs 系统浏览器** | 复制同一笔的 `steam_url`（或从网络面板取得），在 **系统 Chrome/Edge** 中打开：若仅内嵌报「站点错误」而系统浏览器正常，优先排查 **Electron 分区代理、证书、WebView 与系统浏览器差异**；若两者均失败，更偏向 **Steam 网页/CDN 或地区网络**。 |

**排查清单：**

| 项目 | 说明 |
|------|------|
| **JWT 内 `steam_id` 与内嵌页登录账号** | `InitTxn` 的 `steamid` 来自 JWT。若使用 **DEV 鉴权**（`VITE_METADOC_CLOUD_DEV_STEAM_ID`），该 SteamID64 必须与 **内嵌窗口里当前登录的 Steam 账号**一致；否则订单属于用户 A、浏览器是用户 B，易出现授权类错误。 |
| **`STEAM_MICROTX_SANDBOX`** | Worker `wrangler.toml` / 部署环境与 Steamworks 中物品、InitTxn 环境（沙盒 vs 正式）必须一致；与客户端构建无关，但与 Steam 后台订单状态是否「沙盒」一致。 |
| **`STEAM_WEB_API_KEY`** | 须为 Steamworks **Publisher Web API Key**（见上文第 3 节排障）。 |
| **网络** | VPN/代理/双栈可能导致探测 IP 与打开支付页时出口不一致；应用已做打开前重探测与 IPv4 优先，若仍频繁 `mtx_ip_mismatch`，需从系统层检查代理是否在秒级切换出口。 |

开发构建下，`startSteamMtxInit` 在 InitTxn 失败时会向控制台输出 `[MTX init] failed` 的脱敏 `debug` 日志（含 Worker 返回的 `message` / Steam `errordesc` 摘要）。**生产 Worker** 在 InitTxn 成功/失败时还会向 **Cloudflare 日志** 输出单行 JSON（`mtx_init_ok` / `mtx_init_failed`，含 `order_id`、`errordesc` 截断，不含密钥），便于对照 Steam 侧问题。

---

## 5. n1n（api.n1n.ai）

1. **仅 Worker Secret** 保存 n1n Key；客户端、Vite 环境变量中不得出现上游 Key。
2. **Base URL**：默认 `https://api.n1n.ai/v1`；若文档变更，用 `N1N_BASE_URL` 覆盖。
3. **价格与模型**：以 [docs.n1n.ai/llm-api-price](https://docs.n1n.ai/llm-api-price) 为准，定期更新 `n1n-model-rates.yaml`。

集成说明摘要见 [n1n-integration-notes.md](./n1n-integration-notes.md)。

---

## 6. 验收与送审英文骨架

见 [acceptance-steam-ai-en.md](./acceptance-steam-ai-en.md)。

---

## 相关文件（仓库内）

| 路径 | 说明 |
|------|------|
| `docs/cloud/pricing/*.yaml` | 经济与 Steam MTX、n1n 模型费率快照 |
| `scripts/validate-pricing.mjs` | 校验 YAML 并生成 `pricing-generated.ts` |
| `scripts/fetch-n1n-models.mjs` | 可选：带 Key 拉取 n1n 模型列表 |
| `cloudflare-worker/src/index.ts` | MTX Finalize 入账；`GET /steam/mtx/catalog` 档位列表 |
| `docs/cloud/economics.md` | 人类可读公式说明 |
