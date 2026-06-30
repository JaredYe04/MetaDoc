export type Env = {
  DB: D1Database
  JWT_SECRET: string
  /** 兼容旧名；优先使用 N1N_API_KEY 指向 api.n1n.ai */
  OPENAI_API_KEY: string
  N1N_API_KEY?: string
  /** 默认 https://api.n1n.ai/v1 */
  N1N_BASE_URL?: string
  STEAM_WEB_API_KEY: string
  STEAM_APP_ID: string
  STEAM_MICROTX_SANDBOX?: string
  ALLOW_DEV_AUTH?: string
  DEV_AUTH_SECRET?: string
  /** Brevo transactional email（对账日报） */
  BREVO_API_KEY?: string
  BREVO_SENDER_EMAIL?: string
  BREVO_SENDER_NAME?: string
}

export type JWTPayload = {
  sub: string
  iat?: number
  exp?: number
}

export type ApiErrorBody = {
  request_id: string
  error: string
  message: string
  detail?: Record<string, unknown>
}
