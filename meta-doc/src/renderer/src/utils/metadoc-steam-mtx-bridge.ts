/**
 * 主进程通过 webContents.send('steam:micro-txn-response') 转发 Steam 内购授权结果，
 * 此处调用 Cloudflare Worker `/steam/mtx/finalize` 完成入账。
 */
import messageBridge from '../bridge/message-bridge'
import { getMetadocCloudApiBase, isSteamEnabled } from '@common/build-env'
import { ensureMetadocSteamCloudJwt } from './metadoc-cloud-auth'

export function registerSteamMicroTxnFinalizeBridge(): void {
  if (!isSteamEnabled()) {
    return
  }
  messageBridge.on(
    'steam:micro-txn-response',
    async (_event: unknown, payload: { orderId?: string; authorized?: boolean }) => {
      const orderId = payload?.orderId
      if (!orderId || payload?.authorized !== true) {
        return
      }
      const base = getMetadocCloudApiBase()
      if (!base) {
        return
      }
      try {
        const jwt = await ensureMetadocSteamCloudJwt()
        await fetch(`${base}/steam/mtx/finalize`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${jwt}`
          },
          body: JSON.stringify({ order_id: orderId, authorized: true })
        })
      } catch (e) {
        console.error('[MetaDoc] steam mtx finalize failed', e)
      }
    }
  )
}
