import type { Env } from './types'

const BREVO_API = 'https://api.brevo.com/v3/smtp/email'

/** 对账报告默认收件人（运维） */
export const RECONCILE_EMAIL_TO = '1010268129@outlook.com'

export async function sendBrevoTransactionalEmail(
  env: Env,
  args: { subject: string; htmlBody: string; textBody?: string }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const key = env.BREVO_API_KEY?.trim()
  const from = env.BREVO_SENDER_EMAIL?.trim()
  if (!key || !from) {
    return { ok: false, reason: 'brevo_not_configured' }
  }
  const name = env.BREVO_SENDER_NAME?.trim() || 'MetaDoc Cloud'

  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': key
    },
    body: JSON.stringify({
      sender: { name, email: from },
      to: [{ email: RECONCILE_EMAIL_TO }],
      subject: args.subject,
      htmlContent: args.htmlBody,
      ...(args.textBody ? { textContent: args.textBody } : {})
    })
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { ok: false, reason: `brevo_http_${res.status}:${t.slice(0, 200)}` }
  }
  return { ok: true }
}
