/**
 * Steam 官方云：在走 Worker JWT 链路时，实际请求应统一按 metadoc 配置（metadocSelectedModel），
 * 与设置里遗留的 selectedLlm=openai 等解耦。
 */

export function resolveEffectiveLlmInternal(
  useCloudRoute: boolean,
  storedSelected: string | null | undefined
): string {
  if (!useCloudRoute) {
    return (storedSelected ?? '').trim()
  }
  const s = (storedSelected ?? '').trim()
  if (s === 'manual') {
    return 'manual'
  }
  return 'metadoc'
}
