/**
 * 运行时服务器配置（本地 Express 服务）
 * 单一配置源，便于未来迁移到远程/SaaS 时只改此处
 */

const RUNTIME_SERVER_HOST = process.env.RUNTIME_SERVER_HOST ?? '127.0.0.1'
const RUNTIME_SERVER_PORT = parseInt(
  process.env.RUNTIME_SERVER_PORT ?? '52521',
  10
)

/** 运行时服务端口（用于 listen 等） */
export const getRuntimeServerPort = (): number => RUNTIME_SERVER_PORT

/** 运行时服务 host（用于 HTTP 请求等） */
export const getRuntimeServerHost = (): string => RUNTIME_SERVER_HOST

/** 运行时服务 base URL，如 http://127.0.0.1:52521（无尾部斜杠） */
export const getRuntimeServerBaseUrl = (): string =>
  `http://${RUNTIME_SERVER_HOST}:${RUNTIME_SERVER_PORT}`
