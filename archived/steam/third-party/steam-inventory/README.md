# Steam Inventory（物品图标 + ItemDef JSON）

本目录用于放置 **Steam Inventory Schema 的 `ItemDef` JSON** 以及其关联的**图标 PNG**（按商品/档位自动生成）。

该流程参考你们现有的“成就系统”目录组织方式：生成脚本在仓库里跑，最终产物放到这里，便于在 Steamworks Partner 控制台上传。

## 生成内容

会自动生成：

- `inventory-icons-generated/200/<itemdefid>.png`
  - 用作 Steam `icon_url`（小图）
- `inventory-icons-generated/2048/<itemdefid>.png`
  - 用作 Steam `icon_url_large`（大图）
- `steam-inventory-itemdefs.generated.json`
  - 符合 Steam Inventory Schema：物品列表 + 价格 + 图标 URL 等字段

图标样式由脚本中的 SVG 模板生成，包含：

- 你们的 Logo（`logos/logov3/logo.png`）
- 档位数字（例如 `100/200/500/...`）
- 可选“折扣 badge”（当 `steam-mtx-items.yaml` 的 `label` 命中形如 `~10pct off` 的文案时）

## 目录结构

- `steam-mtx-items.yaml`：定价与档位的输入源（仓库现有）
- `inventory-icons-generated/`：生成的 PNG 图标输出目录
- `steam-inventory-itemdefs.generated.json`：生成的 ItemDef JSON 输出
- `upload-config.local.json`：上传密钥配置（本地使用，不会提交）

## 一键生成（不上传）

仅生成 PNG 与 JSON（`icon_url` 会写入 `file://` 路径，Steamworks 无法访问时请不要直接上传）。

```bash
node "meta-doc/scripts/generate-steam-inventory-icons-and-itemdefs.mjs" --appid 4359310 --upload false
```

## 生成并上传（回填公网 URL）

脚本当前集成了 `imgbb` 作为“临时图床”（通过 API 上传得到公网 URL）。

1) 在此目录创建（或复制）本地配置文件：

- `meta-doc/third-party/steam-inventory/upload-config.local.json`

并填写（示例）：

```json
{
  "provider": "imgbb",
  "imgbbApiKey": "YOUR_IMGBB_API_KEY"
}
```

2) 运行上传并回填：

```bash
node "meta-doc/scripts/generate-steam-inventory-icons-and-itemdefs.mjs" --appid 4359310 --upload true
```

完成后，`steam-inventory-itemdefs.generated.json` 里的 `icon_url` / `icon_url_large` 将被替换为 imgbb 返回的公网链接。

## 说明

- Steam 的 `icon_url*` 需要 **公网可访问**。
- “折扣 badge”解析依赖 `steam-mtx-items.yaml` 里 `label` 的文案格式；目前脚本支持正则匹配 `~10pct off` / `10pct off` / `10% off` 等形式。

