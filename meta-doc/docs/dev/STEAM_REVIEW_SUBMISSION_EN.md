# Steam Review — MetaDoc Cloud AI (English notes for resubmission)

Use this as a base for Valve review notes or ticket text.

## What changed (Steam build)

- The **Steam-distributed build** does **not** expose any third-party LLM API key fields. Users cannot enter OpenAI, DeepSeek, Gemini, or similar keys in Settings.
- Cloud AI is provided **only** through the developer-hosted **HTTPS API** (Cloudflare Workers). Authentication uses **Steam session tickets** exchanged for short-lived **JWTs**. No upstream provider keys are embedded in the client.
- **Local Ollama** remains available and does not use the developer’s cloud credits.
- In-app purchases for cloud credits use **Steam Microtransactions** (`ISteamMicroTxn`), initiated from the client and finalized on the backend with the official `FinalizeTxn` flow.

## How to test (for reviewers)

1. Launch the Steam build with a Steam client logged in.
2. Open **Settings → LLM**: only **MetaDoc (cloud)** and **Ollama** should appear as provider options; no BYOK fields.
3. Select MetaDoc cloud and a model; trigger an AI action. The app obtains a session ticket and exchanges it for a JWT; requests go to the configured Worker URL.
4. **Purchases (sandbox)**: use Steam’s microtransaction sandbox per [Microtransactions Implementation](https://partner.steamgames.com/doc/features/microtransactions/implementation); after authorization, credits should increase and AI calls should succeed until credits are exhausted.

## Support

If reviewers need a test account or sandbox steps, provide your Steam test user and the app branch/build ID separately.
