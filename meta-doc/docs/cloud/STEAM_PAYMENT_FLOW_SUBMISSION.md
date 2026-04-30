# MetaDoc Steam 充值链路说明（送审版）

本文用于说明 MetaDoc 已从旧的 `ISteamMicroTxn(web)` 方案切换到新的「Steam Item Store 额度卡」方案，并解释切换原因、风控与退款闭环。

## 1) 结论（当前生产设计）

- 购买入口：`https://store.steampowered.com/buyitem/<appid>/<itemdefid>/1`
- 购买结果：用户先获得 Steam Inventory 中的「额度卡物品」
- 启用方式：用户在 MetaDoc 中点击“启用”，服务端调用 `IInventoryService/ConsumeItem`
- 入账时机：**仅在 Consume 成功后**，Worker 才为用户增加 credits
- 退款语义：未 Consume 的库存卡可走 Steam 官方退款；已 Consume 的额度已入账，不再可退

## 2) 旧链路与新链路对比

| 项目 | 旧链路（已废弃） | 新链路（当前） |
|---|---|---|
| 核心 API | `ISteamMicroTxn InitTxn/QueryTxn/FinalizeTxn` | `buyitem` + `IInventoryService/GetInventory/ConsumeItem` |
| 授权路径 | `checkout/approvetxn/<transid>` | Steam 商店物品购买页 |
| 入账触发 | `FinalizeTxn` 后入账 | `ConsumeItem` 成功后入账 |
| 退款闭环 | 需应用自管复杂状态 | 利用 Steam 库存物品 48h 退款规则 |
| 风险点 | web 授权页泛化报错、`QueryTxn=Init` 长时间卡住 | 主要是库存同步与兑换幂等，问题可在应用侧可控处理 |

## 3) 旧链路踩坑复盘（保留参考）

- `InitTxn` 成功并不代表用户可授权，授权页可能直接出现“交易授权错误”
- 即使 `ipaddress` 匹配、登录态正常、URL 正确，仍可能被 Steam 授权侧拒绝
- `QueryTxn` 在失败场景下可长期停留 `Init`，导致难以判定状态
- 详细工单模板与样例见：`docs/cloud/STEAM_MTX_AUTH_ERROR_SUPPORT_TICKET.md`

## 4) 新链路实现要点（本次已落地）

1. **购买记录 ingest 只记录、不入账**
   - `STEAMSTORESALES` 解析后写入 `store_sales_grants`（幂等）
   - 不在 ingest 阶段发放 credits

2. **库存查询**
   - 新增 Worker 接口：`GET /steam/store/inventory`
   - 服务端调用 `IInventoryService/GetInventory`，返回可兑换额度卡

3. **兑换入账（原子+幂等）**
   - 新增 Worker 接口：`POST /steam/store/redeem`
   - 状态机表：`inventory_redeems`（`pending/consumed/granting/granted/failed`）
   - 流程：写入兑换请求 -> `ConsumeItem(requestid)` -> 成功后写 `users + credit_ledger`
   - 重复请求返回幂等结果，不重复加 credits

4. **客户端体验**
   - 购买后 UI 不长时间 disabled
   - 提供“刷新状态/库存”按钮（手动触发同步）
   - 提供“我的额度卡”列表与“启用”动作

## 5) 退款与风控说明

- MetaDoc 不提供单独退款按钮（以 Steam 官方退款路径为准）
- 未启用（未 Consume）卡：库存可见，可退款
- 已启用（已 Consume）卡：库存消失，credits 已入账，不可退款
- 若出现极端异常（例如外部拒付/争议），在对账文档中记录并后续扩展 claw-back 机制

## 6) 定价策略（CNY 底线）

- 定价基于公式：`TopUpToN1nCNY = PayUserCNY * (1 - steam_fee_pct) * (1 - margin_pct)`
- 固定 `margin_pct=10%`
- 通过 `docs/cloud/pricing/steam-card-pricing-baseline.yaml` 生成 `steam-mtx-items.yaml`
- 自动报告：`docs/cloud/pricing/steam-pricing-redesign-report.generated.md`（含最低价约束命中）
- 用户侧展示采用“价格优先、credits 副信息”策略，避免把内部 `steam_item_id`（100/200/500）误读为到账额度。

## 7) 相关文档索引

- 新链路定价：`docs/cloud/pricing/steam-card-pricing-redesign.md`
- 旧链路工单模板（已废弃）：`docs/cloud/STEAM_MTX_AUTH_ERROR_SUPPORT_TICKET.md`
- 旧 MTX 目录文档（已废弃）：`docs/cloud/steamworks-mtx-catalog.md`

