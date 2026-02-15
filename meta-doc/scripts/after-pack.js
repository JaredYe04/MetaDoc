/** afterPack hook for electron-builder - Adds Wayland support to AppImage */

const fs = require('fs')
const path = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'linux') return

  const appRunPath = path.join(context.appOutDir, 'AppRun')
  if (!fs.existsSync(appRunPath)) {
    console.warn('[afterPack] AppRun 不存在，跳过')
    return
  }

  let content = fs.readFileSync(appRunPath, 'utf8')
  if (content.includes('WAYLAND_DISPLAY')) {
    console.log('[afterPack] 已有 Wayland 支持，跳过')
    return
  }

  // 保留原 shebang，在其后插入 Wayland 检测
  const shebangMatch = content.match(/^#![^\n]*\n/)
  const shebang = shebangMatch ? shebangMatch[0] : '#!/bin/bash\n'

  const waylandBlock = `
# Wayland 自动检测
if [ "$XDG_SESSION_TYPE" = "wayland" ] || [ -n "$WAYLAND_DISPLAY" ]; then
  export ELECTRON_OZONE_PLATFORM_HINT=wayland
  export OZONE_PLATFORM=wayland
  set -- --ozone-platform=wayland "$@"
fi

`
  // 移除原 shebang，重新组合
  content = content.replace(/^#![^\n]*\n/, '')
  const finalContent = shebang + waylandBlock + content

  fs.writeFileSync(appRunPath, finalContent, 'utf8')
  fs.chmodSync(appRunPath, 0o755)
  console.log('[afterPack] AppRun 已添加 Wayland 支持')
}
