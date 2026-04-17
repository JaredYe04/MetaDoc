# Steam 微交易（MTX）与仓库配置对齐

## 为什么在 partner.steamgames.com 找不到「逐条注册商品」入口？

官方 [Microtransactions Implementation](https://partner.steamgames.com/doc/features/microtransactions/implementation) 规定：`InitTxn` 中每条商品包含 **Item ID**（**你们自定的 32 位标识**）、数量、**金额（美分等）**、描述。Steam 客户端用覆盖层完成授权，**没有**要求先在网页后台为每个档位创建「SKU 库」再调用 API。

因此：

- **真源**：[`docs/cloud/pricing/steam-mtx-items.yaml`](./pricing/steam-mtx-items.yaml) 与部署后的 **Cloudflare Worker**（`InitTxn` 参数须一致）。
- **必备**：可调用 Web API 的 [Publisher Web API Key](https://partner.steamgames.com/doc/webapi_overview/auth)、正确的 **App ID**；沙盒使用 [`ISteamMicroTxnSandbox`](https://partner.steamgames.com/doc/features/microtransactions/implementation#testing)。
- **对账 / 报表**：见官方文档中的 **steamstats**、**GetReport** 等说明。

集成讨论可参考：[In-Game Purchasing Integration discussion](http://steamcommunity.com/groups/steamworks/discussions/4)。

---

## Steam 商店页 vs 游戏内购买（两回事）

| 场景 | 说明 |
|------|------|
| **Steam 商店页** | 常见为应用级信息：例如商店描述中说明「含应用内购买 / 云额度充值」、合规文案等。**无**公开 API 将本仓库 YAML 自动同步为商店 UI；需在 Steamworks 中**人工**编辑商店页（具体菜单以当前 Steam 后台为准）。可用 `pnpm run generate:steam-store-mtx-snippet` 从 YAML **生成草稿文案**，复制粘贴到商店。 |
| **游戏内「上架」档位** | 由客户端调用 Worker **`GET /steam/mtx/catalog`**（需 JWT）拉取 `listed: true` 的档位，与 **`POST /steam/mtx/init`** 使用同一套 `pricing-generated` 数据，实现 **改 YAML → validate → 部署** 后游戏内按钮自动更新，无需改 Vue 硬编码。 |

---

## 与 MetaDoc 仓库的对应关系

- 文件：[`steam-mtx-items.yaml`](./pricing/steam-mtx-items.yaml)
- 字段：`steam_item_id`、`usd_price`、`amount_cents_usd`、`listed`、可选 `volume_bonus_credits`
- 生成物：`pnpm run validate:pricing` → `cloudflare-worker/src/pricing-generated.ts`
- 运维流程：见 [operations-pricing.md](./operations-pricing.md)
