/**
 * 与设置页「Steam 官方云」一致：Steam 渠道构建 **或** 运行时 Steam 托盘已就绪（Greenworks + 资料）。
 * 供 useMetadocCloudOpenAiRoute、向导跳过 LLM 等共用。
 */
import { ref } from 'vue'
import { isSteamDistribution } from '@common/build-env'
import { getSteamUiTrayReady } from './steam-ui-ready'

export const steamOfficialCloudEligible = ref(isSteamDistribution())

export async function refreshSteamOfficialCloudEligible(): Promise<void> {
  steamOfficialCloudEligible.value = isSteamDistribution() || (await getSteamUiTrayReady())
}
