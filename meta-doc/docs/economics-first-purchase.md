# 首次购买 MetaDoc：实付 20% 转额度

## 业务目标

用户**第一次**拥有本应用（指定 Steam App/Package）时，将**实付金额**的 **20%** 转为内部 **credits**。

## 技术难点

「实付」精确值依赖 Valve **合作伙伴结算**，客户端不可信。

## 选定方案（初版）

**方案 A（推荐迭代路径）**：Worker 在用户首次成功 **Steam 票据登录** 时：

1. 调用 Steam Web API 校验用户是否拥有本 `app_id`（`ISteamUser/CheckAppOwnership` 或文档推荐接口）。
2. 若拥有且数据库中无 `first_purchase_grant` 记录，则按 **`first_purchase.app_list_price_usd` × (1 - s_eff) × `grant_fraction_of_list_price_usd` × credits_per_usd_pool** 发放一次性 credits（与 `economics.yaml` / `pricing-generated.ts` 一致）。
3. **幂等键**：`steam_id` + `app_id` + `grant_type:first_purchase`。

若后续需与真实结算单对齐，可改为运营脚本补差，幂等键防止重复发放。

## 误差与法务

若无法精确取数，应在 EULA/商店说明中披露**估算规则**或改为**固定档位赠送**。
