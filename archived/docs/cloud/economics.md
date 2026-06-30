# MetaDoc Steam 云端经济参数（人类可读）

本文档与 [`pricing/economics.yaml`](pricing/economics.yaml) 同步；**改价时先改 YAML，再跑** `pnpm run validate:pricing`。

## 符号

| 符号 | 含义 |
|------|------|
| \(G\) | 用户 Steam MTX **毛支付**（以结算货币计量，入账时换算为 USD 等价） |
| \(s_{\mathrm{eff}}\) | **有效 Steam 分成/平台扣率**（占位，**须以 Valve 结算或财务为准**） |
| \(f_m\) | MetaDoc 自留服务费，默认 **3%** |
| \(P\) | 划入 **n1n 成本池** 的等价金额（USD） |

## 公式

\[
P = G_{\mathrm{USD}} \times (1 - s_{\mathrm{eff}}) \times (1 - f_m)
\]

**内部 credits**（用户可见）：

\[
\mathrm{credits}_{\mathrm{granted}} = P \times \mathrm{credits\_per\_usd\_pool}
\]

`credits_per_usd_pool` 表示每 1 USD 成本池对应多少 credits（整数）。

## 首购额度（估算）

首购一次性 credits 使用 `first_purchase.app_list_price_usd` 与 `grant_fraction_of_list_price_usd`，见 `docs/economics-first-purchase.md`。商店标价变更时请同步 YAML 并运行 `pnpm run validate:pricing`。

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-04-16 | 初版：与 `economics.yaml` 对齐 |
| 2026-04-16 | 增加 `first_purchase.app_list_price_usd` 与 Worker `first-purchase-claim` |
