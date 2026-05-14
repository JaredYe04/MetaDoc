# MetaDoc Cloud Worker (Cloudflare)

Serverless API for **Steam-compliant** MetaDoc cloud LLM: JWT auth (Steam ticket), D1 billing (freeze / commit / release), OpenAI proxy, Steam Microtransactions (`InitTxn` / `FinalizeTxn`), hourly `GetReport` cron.

## Setup

```bash
cd cloudflare-worker
npm install
```

Create D1 and apply migrations (see Cloudflare dashboard or):

```bash
npx wrangler d1 create metadoc-billing
# Put database_id into wrangler.toml
npx wrangler d1 migrations apply metadoc-billing --local
```

### Deploy checklist (local + remote D1)

```bash
cd cloudflare-worker
npm install
npx wrangler login

# 1) Apply local migrations (for wrangler dev)
npx wrangler d1 migrations apply metadoc-billing --local

# 2) Apply remote migrations (production D1)
npx wrangler d1 migrations apply metadoc-billing --remote

# 3) Deploy worker
npx wrangler deploy
```

Quick verification:

```bash
# health
curl -sS "https://<your-worker-host>/health"

# DEV only: ingest STEAMSTORESALES report and run idempotent purchase-record sync
curl -sS -X POST "https://<your-worker-host>/dev/steam/store/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Dev-Secret: <DEV_AUTH_SECRET>" \
  -d "{}"
```

Secrets (production):

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put STEAM_WEB_API_KEY
# optional dev-only:
npx wrangler secret put DEV_AUTH_SECRET
# optional: daily reconcile email via Brevo REST (`api.brevo.com`)
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put BREVO_SENDER_EMAIL
# optional display name:
npx wrangler secret put BREVO_SENDER_NAME
```

Set `[vars] STEAM_APP_ID` to your Steam App ID.

- `STEAM_MICROTX_SANDBOX`: only affects `ISteamMicroTxn` (`InitTxn/FinalizeTxn`) chain.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/steam` | — | Body: `{ steam_id, ticket }` → JWT |
| GET | `/user/credits` | Bearer JWT | Current credits |
| GET | `/user/credit-ledger` | Bearer JWT | Credit ledger (`from`/`to` unix, `limit`, `cursor`, `include_summary=1`) |
| GET | `/steam/mtx/catalog` | Bearer JWT | Listed MTX items from `steam-mtx-items.yaml` (for in-game store) |
| GET | `/cloud/models` | Bearer JWT | Model list + estimated credits / 1k tokens |
| POST | `/v1/chat/completions` | Bearer JWT | OpenAI-compatible chat；`stream:true` 时透传上游 SSE，流结束后按 `usage` 或预估结算 credits |
| POST | `/steam/mtx/init` | Bearer JWT | Start MTX (server calls `InitTxn`) |
| POST | `/steam/mtx/finalize` | Bearer JWT | After overlay auth, finalize and grant credits |
| POST | `/steam/store/sync` | Bearer JWT | Sync STEAMSTORESALES into D1 purchase records (idempotent, no direct credits grant) |
| GET | `/steam/store/inventory` | Bearer JWT | Get redeemable inventory cards |
| POST | `/steam/store/redeem` | Bearer JWT | Consume inventory card and grant credits atomically/idempotently |
| POST | `/dev/steam/mtx/simulate-complete` | Bearer JWT + `X-Dev-Secret` | DEV only (`ALLOW_DEV_AUTH`): grant credits for `init` order without Steam |
| POST | `/dev/reconciliation/run` | `X-Dev-Secret` | DEV only: run reconcile job; default sends Brevo email, can pass `{"send_email": false}` to skip email |
| GET | `/health` | — | Liveness |

### Postman: manually trigger reconciliation

1. Method: `POST`
2. URL: `https://<your-worker-host>/dev/reconciliation/run`
3. Headers:
   - `X-Dev-Secret: <DEV_AUTH_SECRET>`
   - `Content-Type: application/json`
4. Body: `{}` (raw JSON, default send email) or `{"send_email": false}` (no email)

Expected response:

```json
{
  "ok": true,
  "status": "ok",
  "d1_mtx": { "order_count": 0, "total_amount_cents": 0 },
  "d1_ledger": { "row_count": 0, "total_delta_credits": 0 },
  "email_requested": false,
  "email_sent": false,
  "email_note": "skipped_by_request"
}
```

Important:

- `steam_report_ok=true` means Steam report fetch succeeded, not that D1 already has synced rows.
- `d1_store_sales` stays `0` until you run `/steam/store/sync` (JWT) or `/dev/steam/store/ingest` (dev secret) to ingest `STEAMSTORESALES` into `store_sales_grants`.

If `403`, verify:

- Worker var `ALLOW_DEV_AUTH=true`
- Secret `DEV_AUTH_SECRET` is set
- Request header `X-Dev-Secret` exactly matches

## MetaDoc client

Set build-time env:

- `VITE_METADOC_STEAM=true` (compile Steam / Greenworks client + pack native; default off for non-Steam builds)
- `VITE_STEAM_DISTRIBUTION=true` (Steam store distribution behavior in renderer; requires the flag above)
- `VITE_METADOC_CLOUD_API_URL=https://<your-worker-host>`

## Notes

- Steam **Publisher Web API Key** and **LLM keys** exist only in Worker secrets, never in the Electron app.
- Refund claw-back from `GetReport` should extend the cron handler for production hardening.
