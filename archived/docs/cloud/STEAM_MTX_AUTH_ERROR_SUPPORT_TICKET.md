# [已废弃] Steam MicroTxn 网页授权（usersession=web）“交易授权错误”工单模板

> 状态：**已废弃（仅保留排障与送审参考）**。MetaDoc 现已切换到 `Steam Item Store + Inventory 额度卡 + ConsumeItem` 链路，不再使用该 web 授权充值流程。

用于提交给 Valve/Steamworks Support，定位 **`InitTxn` 成功但 `approvetxn` 授权页直接报错**，且 `QueryTxn` 长时间停在 `Init` 的问题。

## 摘要

- 应用：MetaDoc（AppID `4359310`）
- 接口：`ISteamMicroTxn`（Production，非 Sandbox）
- 现象：`InitTxn(v3)` 返回 `result=OK` 且含 `steamurl`；打开该 URL 的授权页显示：
  - 「处理您的请求时遇到错误：抱歉出现交易授权错误，请重试。」
- 后果：`QueryTxn(v3)` 长时间保持 `status=Init` / `itemstatus=Init`，不会进入 `Approved`，因此无法调用 `FinalizeTxn` 完成入账。

## 已排除项（我们已做的对照）

- **IP 校验**：客户端在打开支付页的同一 Chromium 会话中探测出口 IPv4，并在 `loadURL(steamurl)` 前再次探测校验，两次一致（`match=true`）。
- **登录态**：授权页顶部可看到账号名称/钱包币种信息（确认 cookie 会话生效）。
- **币种/金额**：已测试强制 `currency=USD` 且 `amount=99`（$0.99），仍复现。
- **外部浏览器**：复制同一 `steamurl` 在系统浏览器打开，仍复现同样错误。

## 复现订单（示例，替换为你们最新失败的一单）

- `appid`: `4359310`
- `steamid`: `76561198323274543`
- `orderid`: `<ORDER_ID>`
- `transid`: `<TRANS_ID>`
- `steamurl`: `https://checkout.steampowered.com/checkout/approvetxn/<TRANS_ID>/`
- `InitTxn` 参数（关键字段）：
  - `usersession=web`
  - `ipaddress=<CLIENT_PUBLIC_IPV4>`
  - `currency=USD`
  - `amount[0]=99`
  - `itemid[0]=100`
  - `qty[0]=1`
  - `description[0]=MetaDoc Cloud · Tier 100 (starter)`
- `QueryTxn`（打开授权页后 1-5 分钟内多次查询均为 Init）：
  - `status=Init`
  - `items[0].itemstatus=Init`
  - `currency=USD`
  - `country=CN`

## 我们需要 Valve 帮忙确认的问题

1. 对于上述 `transid`，在授权页阶段被拒绝的**具体原因**是什么？（风控/支付能力/应用配置/地区限制/财务开通状态等）
2. 是否存在某些应用状态/后台配置导致 `InitTxn` 虽成功但授权页必失败？
3. 若需要 `returnurl`/`canceledurl` 或特定参数才能在 web 授权页完成批准，请给出明确要求（我们目前通过 `QueryTxn` 轮询来判断 `Approved` 并调用 `FinalizeTxn`）。

## 附件/证据（可选）

- 授权页截图（含错误文案）
- `InitTxn` JSON（脱敏 key）
- `QueryTxn` JSON（脱敏 key）
- 客户端“支付窗诊断 toast”文本（含 ip match 与页面 snippet）

