# Archived proprietary modules

This directory holds **closed-source / commercial** integrations removed from the open-source `meta-doc/` tree.

> **Status (2026-06):** The Steam / official-cloud distribution path is **deprecated and not maintained**. Contents here are kept for **historical reference** only — not for default builds and not slated for CI restoration.

## Contents

| Path | Description |
|------|-------------|
| `cloudflare-worker/` | MetaDoc Cloud Worker (JWT, billing, AI proxy, Steam MTX) |
| `steam/main/` | Greenworks main-process integration (real implementations) |
| `steam/renderer/` | Steam UI, cloud auth, MTX bridge, Workshop, dev AI pipeline |
| `steam/common/` | Steam achievement/stats constants, `steam-game-language.ts` |
| `steam/third-party/` | Steamworks SDK assets, achievement VDF, inventory |
| `docs/cloud/` | Cloud/Steam operations documentation |
| `docs/RELEASE_AND_STEAM.md` | Release + Steam CI notes (historical) |
| `ci/` | `release-steam.yml`, `steam-connectivity-test.yml` (historical) |
| `electron-builder.steam.yml` | Steam depot packaging overlay (historical) |

## Open-source build

The OSS tree does **not** ship Steam UI or Greenworks:

- `meta-doc/src/main/steam/*.stub.ts` — no-op stubs wired via `electron.vite.config.mjs`
- Renderer: `services/steam-client.ts` and related utils are no-op stubs
- `VITE_METADOC_STEAM` remains an escape hatch for a private fork only; the public OSS release never sets it

## Re-extract from git (maintainers)

To refresh archived snapshots from history:

```bash
cd meta-doc && node scripts/extract-steam-archive.mjs [commit]
```

Default commit is `cade1b23`; missing files fall back to `68b5a7ec` / `HEAD`.

## Private fork only (not supported in OSS)

If you maintain a **private** Steam build, you may copy paths back under `meta-doc/`, set `VITE_METADOC_STEAM=true`, restore vite aliases, reinstall Greenworks, and consult `docs/RELEASE_AND_STEAM.md` — this is **out of scope** for the open-source project.
