# 已废弃的 Spring Boot 后端

MetaDoc 早期版本依赖独立的 Spring Boot 服务（用户登录、图片上传、LLM 模型列表等）。该后端 **已不再维护**，开源版不应再配置生产服务器地址。

## 相关代码（Legacy）

- [`meta-doc/src/renderer/src/utils/web-utils.ts`](../../meta-doc/src/renderer/src/utils/web-utils.ts) — axios 调用 `/user/login`、`/image/upload` 等
- [`meta-doc/src/renderer/src/utils/consts.js`](../../meta-doc/src/renderer/src/utils/consts.js) — `SERVER_URL` 固定为 `http://localhost:8080`
- [`meta-doc/src/renderer/src/components/UserProfileCard.vue`](../../meta-doc/src/renderer/src/components/UserProfileCard.vue) — 云端账号 UI

## 环境变量（已归档）

历史配置见 [`archived/env/legacy-spring-server.env.example`](../env/legacy-spring-server.env.example)。

**请勿**在 `meta-doc/.env` 中设置 `VITE_SERVER_URL` 或 `SERVER_URL` 指向公网 IP；相关变量已从 Git 历史清除。

## 开源版替代方案

- **LLM**：应用内设置页配置各厂商 API Key
- **图片**：本地文件 / 导出管线，不依赖云端上传接口
- **账号**：无云端账号体系；UserProfileCard 登录在 localhost 下不可用属预期行为
