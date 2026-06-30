# Steam 额度卡定价重做说明

本方案将定价统一为「CNY 成本池底线」驱动，并满足：

`TopUpToN1nCNY = PayUserCNY * (1 - steam_fee_pct) * (1 - margin_pct)`

其中：

- `steam_fee_pct`：Steam 扣点（默认 `0.30`，可在基线配置中改）
- `margin_pct`：MetaDoc 溢价利润（固定 `0.10`）
- `TopUpToN1nCNY`：最终可用于 n1n 的成本池（内部按 CNY 结算）

## 配置文件

- 基线输入：`docs/cloud/pricing/steam-card-pricing-baseline.yaml`
- 生成输出：`docs/cloud/pricing/steam-mtx-items.yaml`
- 自动报告：`docs/cloud/pricing/steam-pricing-redesign-report.generated.md`

## 生成命令

```bash
npm run generate:steam-mtx-pricing-cny
npm run validate:pricing
```

## 区域定价约束

- USD 标价由脚本先算出底线，再做向上取整。
- 若触发 `min_steam_usd_cents`（最低价约束），报告会标出 `min_price_floor_hit=yes`。
- 其他地区建议优先使用 Steam 推荐区域价；若某币种换算后低于 CNY 底线，需要手动上调该币种价格或提高对应档位目标值。

## 商品展示策略（价格优先）

- 前台展示以“价格”为主，credits 作为副信息（预计到账）。
- `steam_item_id`（100/200/500...）仅保留为内部映射键，不作为用户主展示文案。
- 价格文案与图标文案保持一致，避免出现“Tier 数字”和“实际到账 credits”不一致导致的误解。

