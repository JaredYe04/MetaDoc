import raw from './shell-file-bindings.json'

export type ShellFileAssociationRole = 'Editor'

export type ShellFileAssociationIcons = {
  windows: string
  mac: string
  linux: string
}

export type ShellFileAssociation = {
  extension: string
  progId: string
  typeName: string
  description: string
  role: ShellFileAssociationRole
  mimeType: string
  shellNewItemName: string
  icons: ShellFileAssociationIcons
}

export type ShellFileBindingsManifest = {
  schemaVersion: number
  displayName: string
  appId: string
  windows: {
    executableBaseName: string
    registeredApplicationsValueName: string
    registeredApplicationsCapabilitiesPointer: string
    capabilitiesRegKey: string
    vendorRegKey: string
  }
  linux: {
    desktopFileBasename: string
    startupWmClass: string
    genericName: string
  }
  associations: ShellFileAssociation[]
  legacyWindowsProgIds: string[]
}

function validateManifest(m: ShellFileBindingsManifest): void {
  if (!m.associations?.length) throw new Error('shell-file-bindings: associations empty')
  for (const a of m.associations) {
    if (!/^[a-z0-9]+$/i.test(a.extension)) {
      throw new Error(`shell-file-bindings: bad extension "${a.extension}"`)
    }
    if (!a.progId || !a.typeName || !a.mimeType) {
      throw new Error('shell-file-bindings: association missing progId/typeName/mimeType')
    }
  }
}

const manifest = raw as ShellFileBindingsManifest
validateManifest(manifest)

/** 单一数据源：NSIS / electron-builder（生成物）/ 主进程 Steam·HKCU 登记共用 */
export const shellFileBindingsManifest: Readonly<ShellFileBindingsManifest> = manifest

export function shellAssociationByExtension(
  extWithoutDot: string
): ShellFileAssociation | undefined {
  const e = extWithoutDot.replace(/^\./, '').toLowerCase()
  return manifest.associations.find((a) => a.extension.toLowerCase() === e)
}

/** Linux .desktop 的 MimeType 行（分号分隔） */
export function shellBindingsLinuxMimeTypeList(): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of manifest.associations) {
    if (!seen.has(a.mimeType)) {
      seen.add(a.mimeType)
      out.push(a.mimeType)
    }
  }
  return `${out.join(';')};`
}
