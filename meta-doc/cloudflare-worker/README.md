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

Secrets (production):

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put STEAM_WEB_API_KEY
# optional dev-only:
npx wrangler secret put DEV_AUTH_SECRET
```

Set `[vars] STEAM_APP_ID` to your Steam App ID. Set `STEAM_MICROTX_SANDBOX` to `false` for live MTX.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/steam` | — | Body: `{ steam_id, ticket }` → JWT |
| GET | `/user/credits` | Bearer JWT | Current credits |
| GET | `/steam/mtx/catalog` | Bearer JWT | Listed MTX items from `steam-mtx-items.yaml` (for in-game store) |
| GET | `/cloud/models` | Bearer JWT | Model list + estimated credits / 1k tokens |
| POST | `/v1/chat/completions` | Bearer JWT | OpenAI-compatible chat (non-stream forced server-side for metering) |
| POST | `/steam/mtx/init` | Bearer JWT | Start MTX (server calls `InitTxn`) |
| POST | `/steam/mtx/finalize` | Bearer JWT | After overlay auth, finalize and grant credits |
| GET | `/health` | — | Liveness |

## MetaDoc client

Set build-time env:

- `VITE_STEAM_DISTRIBUTION=true`
- `VITE_METADOC_CLOUD_API_URL=https://<your-worker-host>`

## Notes

- Steam **Publisher Web API Key** and **LLM keys** exist only in Worker secrets, never in the Electron app.
- Refund claw-back from `GetReport` should extend the cron handler for production hardening.
