/**
 * Steam 头像 URL（HTTPS，可直接用于 <img src>）。
 *
 * 注意：不使用 greenworks.getImageRGBA —— Electron 21+ 启用 V8 Memory Cage 后，
 * 该 API 用堆外内存构造 Buffer 会在 node_bindings 触发致命错误并闪退。
 * @see https://www.electronjs.org/blog/v8-memory-cage
 *
 * 改为请求 Steam 社区公开 XML（无 Web API Key；若资料为私密则可能无头像字段）。
 */
const PROFILE_XML = (steamId64: string) =>
  `https://steamcommunity.com/profiles/${encodeURIComponent(steamId64)}/?xml=1`

function parseAvatarFullFromProfileXml(xml: string): string | null {
  const start = xml.indexOf('<avatarFull>')
  if (start < 0) {
    return null
  }
  const end = xml.indexOf('</avatarFull>', start)
  if (end < 0) {
    return null
  }
  const block = xml.slice(start, end)
  const cd = block.match(/<!\[CDATA\[\s*([^\]]+?)\s*\]\]>/)
  if (!cd) {
    return null
  }
  const url = cd[1].trim()
  if (!url.startsWith('http')) {
    return null
  }
  return url
}

export async function resolveSteamProfileAvatarUrl(steamId64: string): Promise<string | null> {
  if (!steamId64 || !/^\d+$/.test(steamId64)) {
    return null
  }
  try {
    const res = await fetch(PROFILE_XML(steamId64), {
      headers: {
        Accept: 'text/xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'MetaDoc/SteamAvatar (Electron; +https://github.com/JaredYe04/MetaDoc)'
      },
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) {
      return null
    }
    const xml = await res.text()
    return parseAvatarFullFromProfileXml(xml)
  } catch {
    return null
  }
}
