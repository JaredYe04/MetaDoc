import { ref } from 'vue'

/** 开源构建：不使用 Steam 官方云 */
export const steamOfficialCloudEligible = ref(false)

export async function refreshSteamOfficialCloudEligible(): Promise<void> {
  steamOfficialCloudEligible.value = false
}
