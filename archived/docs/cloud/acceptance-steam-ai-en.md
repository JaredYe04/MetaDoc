# Acceptance checklist — Steam cloud AI (MetaDoc)

## Build / environment

- [ ] Steam retail build: **no** third-party LLM API key fields exposed in Settings → LLM (official cloud panel only).
- [ ] Non-Steam / dev: legacy BYOK path still available when Debug “AI pipeline” is set to **Legacy BYOK**, or when not using dev cloud mode.
- [ ] `VITE_METADOC_CLOUD_API_URL` points to the production Worker; **no** n1n or OpenAI keys in client bundles.

## Backend (Cloudflare Worker)

- [ ] `POST /auth/steam` issues JWT; dev auth works only with `ALLOW_DEV_AUTH` + `X-Dev-Secret` in non-production testing.
- [ ] `GET /user/credits` returns balance after purchases.
- [ ] `GET /cloud/models` returns model list and pricing hints from generated pricing.
- [ ] `POST /ai/chat` or OpenAI-compatible path: freeze → upstream (n1n) → commit/release; errors return `request_id`.
- [ ] `POST /steam/mtx/init` and `POST /steam/mtx/finalize` grant credits using `economics.yaml` (3% service fee + Steam effective fee placeholders).
- [ ] `POST /user/first-purchase-claim` is idempotent and grants credits once per Steam ID when `CheckAppOwnership` succeeds.

## Steam review (English summary)

MetaDoc on Steam routes all cloud LLM traffic through an operator-controlled API (Cloudflare Workers) using a single upstream (n1n OpenAI-compatible API). Users **cannot** supply their own API keys in the Steam build. Optional purchases use **Steam Microtransactions** (`ISteamMicroTxn`) with server-side `InitTxn` / `FinalizeTxn` and documented pricing YAML.
