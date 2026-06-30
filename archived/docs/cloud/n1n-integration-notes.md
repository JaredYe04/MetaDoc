# n1n (api.n1n.ai) integration notes

## References

- OpenAI-compatible API: [docs.n1n.ai](https://docs.n1n.ai/) (English: [docs.n1n.ai/en](https://docs.n1n.ai/en))
- Model pricing snapshot: [LLM API price](https://docs.n1n.ai/llm-api-price)

## Worker behavior

- **Upstream URL**: `N1N_BASE_URL` (optional) default `https://api.n1n.ai/v1`; requests go to `{base}/chat/completions`.
- **Secret**: `N1N_API_KEY` preferred; `OPENAI_API_KEY` is accepted as a compatibility alias.
- **Billing**: Non-stream responses expose `usage` for `actualCostFromUsageForModel` in `pricing-helpers.ts`, using `docs/cloud/pricing/n1n-model-rates.yaml` for per-model `credits_per_1k_tokens_est`.
- **Models API**: `GET /cloud/models` (JWT) returns the same snapshot as YAML for the renderer.

## Maintenance

When n1n changes prices or model IDs, update `n1n-model-rates.yaml`, run `pnpm run validate:pricing`, and redeploy the Worker.
