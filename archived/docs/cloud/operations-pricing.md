# Operations: pricing and Steam MTX alignment

## Change flow (改价 / 改档位)

1. Edit **`docs/cloud/pricing/steam-mtx-items.yaml`** as the **source of truth** for Item IDs, USD list prices (`usd_price`), cents (`amount_cents_usd`), `listed`, and optional `volume_bonus_credits`. **Steam does not require** a separate partner catalog registration per item; `InitTxn` carries these values (see [Microtransactions Implementation](https://partner.steamgames.com/doc/features/microtransactions/implementation)).
2. If economics constants change (e.g. `steam_mtx_effective_fee_pct`), edit **`docs/cloud/pricing/economics.yaml`** and sync **`docs/cloud/economics.md`**.
3. Run **`pnpm run validate:pricing`** in `meta-doc/` to regenerate **`cloudflare-worker/src/pricing-generated.ts`** (validation ensures `amount_cents_usd` matches `Math.round(usd_price * 100)`).
4. Deploy the Cloudflare Worker (`wrangler deploy` or CI).
5. Smoke-test: sandbox **InitTxn** → overlay → **FinalizeTxn**; verify **`GET /user/credits`** and optional **`GET /steam/mtx/catalog`** in the client.
6. **Steam store page** (optional): if you need updated marketing copy, run **`pnpm run generate:steam-store-mtx-snippet`** and paste the output into Steamworks manually (no API).

## First-purchase list price

`first_purchase.app_list_price_usd` in `economics.yaml` should track the **store list price** used for the “20% to credits” estimate. Update it when the App’s base price changes, then re-run `validate:pricing`.
