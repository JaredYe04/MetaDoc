/**
 * 与设置页「Steam 官方云」一致：须 **编入 Steam**（VITE_METADOC_STEAM），且为商店包 **或** 运行时托盘已就绪。
 * 非 Steam 构建下恒为 false，避免误走 Worker 票据链并隐藏 BYOK。
 */
import { ref } from 'vue'
import { isSteamDistribution, isSteamEnabled } from '@common/build-env'
import { getSteamUiTrayReady } from './steam-ui-ready'

export const steamOfficialCloudEligible = ref(
  isSteamEnabled() && isSteamDistribution()
)

export async function refreshSteamOfficialCloudEligible(): Promise<void> {
  if (!isSteamEnabled()) {
    steamOfficialCloudEligible.value = false
    return
  }
  steamOfficialCloudEligible.value =
    isSteamDistribution() || (await getSteamUiTrayReady())
}
