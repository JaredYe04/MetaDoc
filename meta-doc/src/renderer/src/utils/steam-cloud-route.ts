export function resolveEffectiveLlmInternal(
  useCloudRoute: boolean,
  storedSelected: string | null | undefined
): string {
  if (!useCloudRoute) {
    return (storedSelected ?? '').trim()
  }
  const s = (storedSelected ?? '').trim()
  if (s === 'manual') return 'manual'
  return 'metadoc'
}
