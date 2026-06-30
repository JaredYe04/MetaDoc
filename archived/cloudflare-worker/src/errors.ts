import type { ApiErrorBody } from './types'

export function jsonError(
  status: number,
  body: ApiErrorBody,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers
    }
  })
}

export function newRequestId(): string {
  return crypto.randomUUID()
}
