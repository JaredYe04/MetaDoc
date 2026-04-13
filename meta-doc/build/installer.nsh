; NSIS 自定义安装脚本
; 用于确保文件关联和图标正确注册，并清理旧的文件关联

; 在安装前清理旧的文件关联和应用程序注册
!macro customInit
  ; 清理可能存在的旧文件关联（包括旧的 appId 和 productName）
  ; 清理旧的 .md 文件关联
  DeleteRegKey HKCR ".md"
  DeleteRegKey HKCR "MetaDoc.Markdown"
  DeleteRegKey HKCR "meta-doc.Markdown"
  DeleteRegKey HKCR "com.electron.app.Markdown"
  DeleteRegKey HKCR "com.jaredye.meta-doc.Markdown"
  DeleteRegKey HKCR "com.jaredye.metadoc.Markdown"
  DeleteRegKey HKCR "com.byte-light.metadoc.Markdown"
  
  ; 清理旧的 .tex 文件关联
  DeleteRegKey HKCR ".tex"
  DeleteRegKey HKCR "MetaDoc.LaTeX"
  DeleteRegKey HKCR "meta-doc.LaTeX"
  DeleteRegKey HKCR "com.electron.app.LaTeX"
  DeleteRegKey HKCR "com.jaredye.meta-doc.LaTeX"
  DeleteRegKey HKCR "com.jaredye.metadoc.LaTeX"
  DeleteRegKey HKCR "com.byte-light.metadoc.LaTeX"
  
  ; 清理旧的应用程序注册（包括各种可能的可执行文件名）
  DeleteRegKey HKLM "Software\Classes\Applications\meta-doc.exe"
  DeleteRegKey HKLM "Software\Classes\Applications\MetaDoc.exe"
  DeleteRegKey HKLM "Software\Classes\Applications\metadoc.exe"
  DeleteRegKey HKLM "Software\Classes\Applications\Meta-Doc.exe"
  ; 曾写入 SupportedTypes 会导致「打开方式」里多一条仅 exe 图标的 MetaDoc，与 ProgID 重复；升级时先删子树
  DeleteRegKey HKLM "Software\Classes\Applications\meta-doc.exe\SupportedTypes"
  DeleteRegKey HKCU "Software\Classes\Applications\meta-doc.exe\SupportedTypes"

  ; 清理「默认应用」Capabilities / App Paths（与 customInstall 成对）
  DeleteRegKey HKLM "Software\ByteLight\MetaDoc"
  DeleteRegValue HKLM "Software\RegisteredApplications" "MetaDoc"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\meta-doc.exe"
  
  ; 清理用户级别的文件关联（如果存在）
  DeleteRegKey HKCU "Software\Classes\.md"
  DeleteRegKey HKCU "Software\Classes\.tex"
  DeleteRegKey HKCU "Software\Classes\MetaDoc.Markdown"
  DeleteRegKey HKCU "Software\Classes\MetaDoc.LaTeX"
!macroend

; 在安装后注册文件关联和刷新图标缓存
!macro customInstall
  ; 获取安装目录
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
  StrCmp $0 "" 0 +2
    StrCpy $0 "$INSTDIR"
  
  ; 获取可执行文件完整路径
  StrCpy $1 "$0\${PRODUCT_FILENAME}"
  
  ; 查找应用程序主图标文件（icon.ico）
  ; electron-builder 会将图标嵌入到可执行文件中，这是最可靠的方法
  ; Windows 的"打开方式"对话框会从注册表中读取图标路径
  ; 优先使用可执行文件中嵌入的图标（资源索引 0）
  StrCpy $4 "$1,0"  ; 使用可执行文件中嵌入的图标（最可靠）
  
  ; 备用方案：查找独立的图标文件（如果嵌入失败）
  ; electron-builder 会复制 resources 目录到安装目录
  IfFileExists "$0\resources\icon.ico" 0 +3
    StrCpy $4 "$0\resources\icon.ico"
    Goto +8
  
  ; 如果 resources 目录中没有，尝试其他可能的路径
  IfFileExists "$0\icon.ico" 0 +3
    StrCpy $4 "$0\icon.ico"
    Goto +4
  IfFileExists "$0\resources\build\icon.ico" 0 +2
    StrCpy $4 "$0\resources\build\icon.ico"
  
  ; 注册应用程序到注册表，使「打开方式」与 ASSOCSTR_FRIENDLYAPPNAME 能显示产品名（非裸 exe 名）
  ; FriendlyAppName 必须是 Applications\*.exe 上的「值」，不能是 FriendlyAppName 子键（否则系统仍显示 meta-doc.exe）
  WriteRegStr HKLM "Software\Classes\Applications\${PRODUCT_FILENAME}" "" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Classes\Applications\${PRODUCT_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Classes\Applications\${PRODUCT_FILENAME}\DefaultIcon" "" "$4"
  WriteRegStr HKLM "Software\Classes\Applications\${PRODUCT_FILENAME}\shell\open\command" "" '"$1" "%1"'
  ; 勿写 Applications\...\SupportedTypes：会与 MetaDoc.Markdown / .LaTeX ProgID 各多出一条同名「MetaDoc」且图标为 exe 默认图标

  ; App Paths：ShellExecute / 打开方式 解析 exe 全路径
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\${PRODUCT_FILENAME}" "" "$1"

  ; RegisteredApplications + Capabilities：出现在「设置 → 默认应用」中，并与 ProgID 绑定
  WriteRegStr HKLM "Software\RegisteredApplications" "MetaDoc" "SOFTWARE\ByteLight\MetaDoc\Capabilities"
  WriteRegStr HKLM "Software\ByteLight\MetaDoc\Capabilities" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\ByteLight\MetaDoc\Capabilities" "ApplicationDescription" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\ByteLight\MetaDoc\Capabilities" "ApplicationIcon" "$4"
  WriteRegStr HKLM "Software\ByteLight\MetaDoc\Capabilities\FileAssociations" ".md" "MetaDoc.Markdown"
  WriteRegStr HKLM "Software\ByteLight\MetaDoc\Capabilities\FileAssociations" ".tex" "MetaDoc.LaTeX"
  
  ; 查找文件关联图标文件
  ; electron-builder 会将图标文件复制到安装目录
  ; 优先查找 resources 目录（electron-builder 的标准位置）
  StrCpy $2 ""  ; md-icon.ico 路径
  StrCpy $3 ""  ; tex-icon.ico 路径
  
  ; 尝试多个可能的图标路径（按优先级排序）
  ; 1. resources 目录（electron-builder 的标准位置）
  IfFileExists "$0\resources\md-icon.ico" 0 +2
    StrCpy $2 "$0\resources\md-icon.ico"
  StrCmp $2 "" 0 +3
    ; 2. 安装目录根目录
    IfFileExists "$0\md-icon.ico" 0 +2
      StrCpy $2 "$0\md-icon.ico"
  StrCmp $2 "" 0 +3
    ; 3. resources\build 目录
    IfFileExists "$0\resources\build\md-icon.ico" 0 +2
      StrCpy $2 "$0\resources\build\md-icon.ico"
  
  ; 如果找不到图标文件，使用可执行文件中嵌入的图标（备用方案）
  StrCmp $2 "" 0 +2
    StrCpy $2 "$1,0"
  
  ; 同样的逻辑查找 tex-icon.ico
  IfFileExists "$0\resources\tex-icon.ico" 0 +2
    StrCpy $3 "$0\resources\tex-icon.ico"
  StrCmp $3 "" 0 +3
    IfFileExists "$0\tex-icon.ico" 0 +2
      StrCpy $3 "$0\tex-icon.ico"
  StrCmp $3 "" 0 +3
    IfFileExists "$0\resources\build\tex-icon.ico" 0 +2
      StrCpy $3 "$0\resources\build\tex-icon.ico"
  
  ; 如果找不到图标文件，使用可执行文件中嵌入的图标（备用方案）
  StrCmp $3 "" 0 +2
    StrCpy $3 "$1,0"
  
  ; 注册 .md 文件关联（electron-builder 会自动处理，这里确保注册正确）
  WriteRegStr HKCR ".md" "" "MetaDoc.Markdown"
  WriteRegStr HKCR "MetaDoc.Markdown" "" "Markdown Document"
  WriteRegStr HKCR "MetaDoc.Markdown\DefaultIcon" "" "$2"
  WriteRegStr HKCR "MetaDoc.Markdown\shell\open\command" "" '"$1" "%1"'
  ; 便于「打开方式」将 MetaDoc 列为可设为默认的程序（与 UserChoice/OpenWith 协同）
  WriteRegStr HKCR ".md\OpenWithProgids\MetaDoc.Markdown" "" ""
  
  ; 注册 .tex 文件关联
  WriteRegStr HKCR ".tex" "" "MetaDoc.LaTeX"
  WriteRegStr HKCR "MetaDoc.LaTeX" "" "LaTeX Document"
  WriteRegStr HKCR "MetaDoc.LaTeX\DefaultIcon" "" "$3"
  WriteRegStr HKCR "MetaDoc.LaTeX\shell\open\command" "" '"$1" "%1"'
  WriteRegStr HKCR ".tex\OpenWithProgids\MetaDoc.LaTeX" "" ""

  ; 资源管理器「右键 → 新建」：空 Markdown / LaTeX 文件（ShellNew）
  WriteRegStr HKCR ".md\ShellNew" "NullFile" ""
  WriteRegStr HKCR ".md\ShellNew" "ItemName" "Markdown"
  WriteRegStr HKCR ".tex\ShellNew" "NullFile" ""
  WriteRegStr HKCR ".tex\ShellNew" "ItemName" "LaTeX"
  
  ; 若 electron-builder 或其它步骤曾写入 SupportedTypes，再次移除以免双「MetaDoc」
  ClearErrors
  DeleteRegKey HKLM "Software\Classes\Applications\${PRODUCT_FILENAME}\SupportedTypes"

  ; 刷新 Shell 图标缓存，使文件关联图标立即生效
  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

; 在卸载时清理文件关联
!macro customUnInstall
  ; 删除文件关联
  DeleteRegKey HKCR ".md"
  DeleteRegKey HKCR "MetaDoc.Markdown"
  DeleteRegKey HKCR ".tex"
  DeleteRegKey HKCR "MetaDoc.LaTeX"
  
  ; 删除应用程序注册
  DeleteRegKey HKLM "Software\Classes\Applications\${PRODUCT_FILENAME}"
  DeleteRegKey HKLM "Software\ByteLight\MetaDoc"
  DeleteRegValue HKLM "Software\RegisteredApplications" "MetaDoc"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\${PRODUCT_FILENAME}"
  
  ; 清理用户级别的文件关联（如果存在）
  DeleteRegKey HKCU "Software\Classes\.md"
  DeleteRegKey HKCU "Software\Classes\.tex"
  DeleteRegKey HKCU "Software\Classes\MetaDoc.Markdown"
  DeleteRegKey HKCU "Software\Classes\MetaDoc.LaTeX"
  
  ; 刷新 Shell 图标缓存
  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

