; 由 scripts/generate-shell-bindings-artifacts.mjs 生成，勿手改；编辑 src/common/shell-file-bindings.json 后重新运行 npm run prebuild

!define SHELL_BINDINGS_SCHEMA "1"
!define SHELL_DISPLAY_NAME "MetaDoc"
!define SHELL_WIN_REG_APP_NAME "MetaDoc"
!define SHELL_WIN_REGISTERED_APP_POINTER "SOFTWARE\ByteLight\MetaDoc\Capabilities"
!define SHELL_WIN_CAPABILITIES_KEY "Software\ByteLight\MetaDoc\Capabilities"
!define SHELL_WIN_CAPABILITIES_FILE_ASSOC "Software\ByteLight\MetaDoc\Capabilities\FileAssociations"
!define SHELL_WIN_VENDOR_KEY "Software\ByteLight\MetaDoc"
!define SHELL_MD_EXT "md"
!define SHELL_MD_PROGID "MetaDoc.Markdown"
!define SHELL_MD_TYPE_NAME "Markdown Document"
!define SHELL_MD_SHELLNEW_NAME "Markdown"
!define SHELL_MD_WIN_ICON "md-icon.ico"
!define SHELL_TEX_EXT "tex"
!define SHELL_TEX_PROGID "MetaDoc.LaTeX"
!define SHELL_TEX_TYPE_NAME "LaTeX Document"
!define SHELL_TEX_SHELLNEW_NAME "LaTeX"
!define SHELL_TEX_WIN_ICON "tex-icon.ico"

!macro shellBindingsCustomInitDeletes
  DeleteRegKey HKCR ".md"
  DeleteRegKey HKCR "MetaDoc.Markdown"
  DeleteRegKey HKCR ".tex"
  DeleteRegKey HKCR "MetaDoc.LaTeX"
  DeleteRegKey HKCR "meta-doc.Markdown"
  DeleteRegKey HKCR "meta-doc.LaTeX"
  DeleteRegKey HKCR "com.electron.app.Markdown"
  DeleteRegKey HKCR "com.electron.app.LaTeX"
  DeleteRegKey HKCR "com.jaredye.meta-doc.Markdown"
  DeleteRegKey HKCR "com.jaredye.meta-doc.LaTeX"
  DeleteRegKey HKCR "com.jaredye.metadoc.Markdown"
  DeleteRegKey HKCR "com.jaredye.metadoc.LaTeX"
  DeleteRegKey HKCR "com.byte-light.metadoc.Markdown"
  DeleteRegKey HKCR "com.byte-light.metadoc.LaTeX"
  DeleteRegKey HKLM "Software\Classes\Applications\meta-doc.exe"
  DeleteRegKey HKLM "Software\Classes\Applications\MetaDoc.exe"
  DeleteRegKey HKLM "Software\Classes\Applications\metadoc.exe"
  DeleteRegKey HKLM "Software\Classes\Applications\Meta-Doc.exe"
  DeleteRegKey HKLM "Software\Classes\Applications\meta-doc.exe\SupportedTypes"
  DeleteRegKey HKCU "Software\Classes\Applications\meta-doc.exe\SupportedTypes"
  DeleteRegKey HKLM "Software\ByteLight\MetaDoc"
  DeleteRegValue HKLM "Software\RegisteredApplications" "MetaDoc"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\meta-doc.exe"
  DeleteRegKey HKCU "Software\Classes\.md"
  DeleteRegKey HKCU "Software\Classes\MetaDoc.Markdown"
  DeleteRegKey HKCU "Software\Classes\.tex"
  DeleteRegKey HKCU "Software\Classes\MetaDoc.LaTeX"
!macroend

; $1=exe 全路径；Capabilities 下 FileAssociations 与各 ProgID 的 DefaultIcon/OpenCommand（图标 $2/$… 由 installer.nsh 在调用前写入对应变量）
!macro shellBindingsWriteCapabilityFileAssociations
  WriteRegStr HKLM "${SHELL_WIN_CAPABILITIES_FILE_ASSOC}" ".md" "${SHELL_MD_PROGID}"
  WriteRegStr HKLM "${SHELL_WIN_CAPABILITIES_FILE_ASSOC}" ".tex" "${SHELL_TEX_PROGID}"
!macroend

!macro shellBindingsWriteProgIdsAndOpenWith
  WriteRegStr HKCR ".md" "" "${SHELL_MD_PROGID}"
  WriteRegStr HKCR "${SHELL_MD_PROGID}" "" "${SHELL_MD_TYPE_NAME}"
  WriteRegStr HKCR "${SHELL_MD_PROGID}\DefaultIcon" "" "$2"
  WriteRegStr HKCR "${SHELL_MD_PROGID}\shell\open\command" "" '"$1" "%1"'
  WriteRegStr HKCR ".md\OpenWithProgids\${SHELL_MD_PROGID}" "" ""
  WriteRegStr HKCR ".md\ShellNew" "NullFile" ""
  WriteRegStr HKCR ".md\ShellNew" "ItemName" "${SHELL_MD_SHELLNEW_NAME}"
  WriteRegStr HKCR ".tex" "" "${SHELL_TEX_PROGID}"
  WriteRegStr HKCR "${SHELL_TEX_PROGID}" "" "${SHELL_TEX_TYPE_NAME}"
  WriteRegStr HKCR "${SHELL_TEX_PROGID}\DefaultIcon" "" "$3"
  WriteRegStr HKCR "${SHELL_TEX_PROGID}\shell\open\command" "" '"$1" "%1"'
  WriteRegStr HKCR ".tex\OpenWithProgids\${SHELL_TEX_PROGID}" "" ""
  WriteRegStr HKCR ".tex\ShellNew" "NullFile" ""
  WriteRegStr HKCR ".tex\ShellNew" "ItemName" "${SHELL_TEX_SHELLNEW_NAME}"
!macroend
