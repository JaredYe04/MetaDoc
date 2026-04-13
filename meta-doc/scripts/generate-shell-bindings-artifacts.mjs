/**
 * 从 src/common/shell-file-bindings.json 生成：
 * - build/installer-bindings.inc.nsh（NSIS 常量 + customInit 清理宏 + 关联写入宏）
 * - build/electron-builder.file-associations.yml（mac/linux fileAssociations，供 extends）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const manifestPath = path.join(root, 'src', 'common', 'shell-file-bindings.json')
const nshOut = path.join(root, 'build', 'installer-bindings.inc.nsh')
const ymlOut = path.join(root, 'build', 'electron-builder.file-associations.yml')

function nshEscape(s) {
  return String(s).replace(/\$/g, '$$').replace(/"/g, '$\\"')
}

function yamlStr(s) {
  return JSON.stringify(s)
}

function main() {
  const raw = fs.readFileSync(manifestPath, 'utf8')
  const m = JSON.parse(raw)

  if (!m.associations?.length) throw new Error('associations required')
  if (!m.windows?.registeredApplicationsCapabilitiesPointer) {
    throw new Error('windows.registeredApplicationsCapabilitiesPointer required')
  }

  const lines = []
  lines.push(
    '; 由 scripts/generate-shell-bindings-artifacts.mjs 生成，勿手改；编辑 src/common/shell-file-bindings.json 后重新运行 npm run prebuild'
  )
  lines.push('')
  lines.push(`!define SHELL_BINDINGS_SCHEMA "${m.schemaVersion}"`)
  lines.push(`!define SHELL_DISPLAY_NAME "${nshEscape(m.displayName)}"`)
  lines.push(`!define SHELL_WIN_REG_APP_NAME "${nshEscape(m.windows.registeredApplicationsValueName)}"`)
  lines.push(
    `!define SHELL_WIN_REGISTERED_APP_POINTER "${nshEscape(m.windows.registeredApplicationsCapabilitiesPointer)}"`
  )
  lines.push(`!define SHELL_WIN_CAPABILITIES_KEY "${nshEscape(m.windows.capabilitiesRegKey)}"`)
  lines.push(
    `!define SHELL_WIN_CAPABILITIES_FILE_ASSOC "${nshEscape(m.windows.capabilitiesRegKey)}\\FileAssociations"`
  )
  lines.push(`!define SHELL_WIN_VENDOR_KEY "${nshEscape(m.windows.vendorRegKey)}"`)

  for (const a of m.associations) {
    const u = a.extension.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    lines.push(`!define SHELL_${u}_EXT "${nshEscape(a.extension)}"`)
    lines.push(`!define SHELL_${u}_PROGID "${nshEscape(a.progId)}"`)
    lines.push(`!define SHELL_${u}_TYPE_NAME "${nshEscape(a.typeName)}"`)
    lines.push(`!define SHELL_${u}_SHELLNEW_NAME "${nshEscape(a.shellNewItemName)}"`)
    lines.push(`!define SHELL_${u}_WIN_ICON "${nshEscape(a.icons.windows)}"`)
  }

  lines.push('')
  lines.push('!macro shellBindingsCustomInitDeletes')
  for (const a of m.associations) {
    lines.push(`  DeleteRegKey HKCR ".${a.extension}"`)
    lines.push(`  DeleteRegKey HKCR "${nshEscape(a.progId)}"`)
  }
  for (const pid of m.legacyWindowsProgIds || []) {
    lines.push(`  DeleteRegKey HKCR "${nshEscape(pid)}"`)
  }
  lines.push('  DeleteRegKey HKLM "Software\\Classes\\Applications\\meta-doc.exe"')
  lines.push('  DeleteRegKey HKLM "Software\\Classes\\Applications\\MetaDoc.exe"')
  lines.push('  DeleteRegKey HKLM "Software\\Classes\\Applications\\metadoc.exe"')
  lines.push('  DeleteRegKey HKLM "Software\\Classes\\Applications\\Meta-Doc.exe"')
  lines.push('  DeleteRegKey HKLM "Software\\Classes\\Applications\\meta-doc.exe\\SupportedTypes"')
  lines.push('  DeleteRegKey HKCU "Software\\Classes\\Applications\\meta-doc.exe\\SupportedTypes"')
  lines.push(`  DeleteRegKey HKLM "${nshEscape(m.windows.vendorRegKey)}"`)
  lines.push(
    `  DeleteRegValue HKLM "Software\\RegisteredApplications" "${nshEscape(m.windows.registeredApplicationsValueName)}"`
  )
  lines.push('  DeleteRegKey HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\meta-doc.exe"')
  for (const a of m.associations) {
    lines.push(`  DeleteRegKey HKCU "Software\\Classes\\.${a.extension}"`)
    lines.push(`  DeleteRegKey HKCU "Software\\Classes\\${nshEscape(a.progId)}"`)
  }
  lines.push('!macroend')

  lines.push('')
  lines.push(
    '; $1=exe 全路径；Capabilities 下 FileAssociations 与各 ProgID 的 DefaultIcon/OpenCommand（图标 $2/$… 由 installer.nsh 在调用前写入对应变量）'
  )
  lines.push('!macro shellBindingsWriteCapabilityFileAssociations')
  for (const a of m.associations) {
    const u = a.extension.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    lines.push(
      `  WriteRegStr HKLM "\${SHELL_WIN_CAPABILITIES_FILE_ASSOC}" ".${a.extension}" "\${SHELL_${u}_PROGID}"`
    )
  }
  lines.push('!macroend')

  lines.push('')
  lines.push('!macro shellBindingsWriteProgIdsAndOpenWith')
  let idx = 2
  for (const a of m.associations) {
    const u = a.extension.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    lines.push(`  WriteRegStr HKCR ".${a.extension}" "" "\${SHELL_${u}_PROGID}"`)
    lines.push(`  WriteRegStr HKCR "\${SHELL_${u}_PROGID}" "" "\${SHELL_${u}_TYPE_NAME}"`)
    lines.push(`  WriteRegStr HKCR "\${SHELL_${u}_PROGID}\\DefaultIcon" "" "$${idx}"`)
    lines.push(`  WriteRegStr HKCR "\${SHELL_${u}_PROGID}\\shell\\open\\command" "" '"$1" "%1"'`)
    lines.push(
      `  WriteRegStr HKCR ".${a.extension}\\OpenWithProgids\\\${SHELL_${u}_PROGID}" "" ""`
    )
    lines.push(`  WriteRegStr HKCR ".${a.extension}\\ShellNew" "NullFile" ""`)
    lines.push(`  WriteRegStr HKCR ".${a.extension}\\ShellNew" "ItemName" "\${SHELL_${u}_SHELLNEW_NAME}"`)
    idx += 1
  }
  lines.push('!macroend')

  fs.mkdirSync(path.dirname(nshOut), { recursive: true })
  fs.writeFileSync(nshOut, `${lines.join('\n')}\n`, 'utf8')

  const yml = []
  yml.push(
    '# 由 scripts/generate-shell-bindings-artifacts.mjs 生成；编辑 src/common/shell-file-bindings.json 后重新运行 npm run prebuild'
  )
  yml.push('mac:')
  yml.push('  fileAssociations:')
  for (const a of m.associations) {
    yml.push(`    - ext: ${a.extension}`)
    yml.push(`      name: ${yamlStr(a.typeName)}`)
    yml.push(`      description: ${yamlStr(a.description)}`)
    yml.push(`      role: ${a.role}`)
    yml.push(`      mimeType: ${yamlStr(a.mimeType)}`)
    yml.push(`      icon: ${a.icons.mac}`)
  }
  yml.push('linux:')
  yml.push('  fileAssociations:')
  for (const a of m.associations) {
    yml.push(`    - ext: ${a.extension}`)
    yml.push(`      name: ${yamlStr(a.typeName)}`)
    yml.push(`      description: ${yamlStr(a.description)}`)
    yml.push(`      role: ${a.role}`)
    yml.push(`      mimeType: ${yamlStr(a.mimeType)}`)
    yml.push(`      icon: ${a.icons.linux}`)
  }

  fs.writeFileSync(ymlOut, `${yml.join('\n')}\n`, 'utf8')
  console.log('generate-shell-bindings-artifacts:', path.relative(root, nshOut), path.relative(root, ymlOut))
}

main()
