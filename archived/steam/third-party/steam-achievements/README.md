# Steam 成就资源目录

与 Steamworks Partner 相关的成就 **文案映射、本地化 VDF、图标** 与本目录内说明文档统一放在此处（与 `steamworks-sdk` 压缩包/SDK 解压目录分离）。

| 文件 / 目录 | 说明 |
|-------------|------|
| [STEAM_ACHIEVEMENTS_AND_STATS.md](./STEAM_ACHIEVEMENTS_AND_STATS.md) | API 名、槽位、上传顺序、生成流程 |
| `steam-achievement-vdf-map.json` | 按成就排列的 VDF Token 映射（`ACH_*_NAME` / `ACH_*_DESC`） |
| `4359310_loc_all.vdf` | 由 `pnpm generate-steam-loc-vdf` 生成，上传 Partner |
| `steam-achievement-icons.json` | 解锁 pastel + 黑图标黑字；锁定深黑底 + 白图标白字；图标相对配置 ×1.3 |
| `achievement-icons/` | `pnpm generate-steam-achievement-icons` 生成的 256×256 JPG |

游戏内逻辑与常量仍见 `src/common/steam-achievement-registry.ts`、`src/main/steam/`。
