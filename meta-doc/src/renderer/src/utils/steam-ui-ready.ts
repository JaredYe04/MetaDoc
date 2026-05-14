import { isSteamEnabled } from '@common/build-env'
import { getSteamProfileSummary, getSteamStatus } from '../services/steam-client'

/** 与左下角 Steam 托盘头像显示条件一致：Greenworks 已初始化且能拉取用户资料 */
export async function getSteamUiTrayReady(): Promise<boolean> {
  if (!isSteamEnabled()) {
    return false
  }
  const st = await getSteamStatus()
  if (!st.success || !st.data?.initialized) {
    return false
  }
  const r = await getSteamProfileSummary()
  return !!(r.success && r.data)
}
