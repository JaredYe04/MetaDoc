# Windows 文件关联问题修复指南

## 问题描述

在 Windows 上，打包安装后：

1. 文件关联不会自动绑定
2. 手动绑定后，图标显示为默认图标，而不是对应的 md-icon.ico 或 tex-icon.ico
3. 安装时在 users 文件夹下多出一个叫 MetaDoc 的用户文件夹

## 原因分析

1. **文件关联注册问题**：Windows 上的文件关联需要管理员权限才能注册
2. **图标路径问题**：electron-builder 需要正确识别图标文件路径，图标文件需要被正确包含在安装包中
3. **图标缓存问题**：Windows 会缓存文件类型图标，需要清除缓存才能看到新图标
4. **appId 问题**：如果 appId 配置不当，可能导致安装程序创建错误的用户文件夹

## 解决方案

### 1. 配置修复

已在 `electron-builder.yml` 中配置了 Windows 文件关联：

```yaml
appId: com.byte-light.metadoc # 使用正确的 appId，避免创建错误的用户文件夹
win:
  executableName: meta-doc # 可执行文件名
  fileAssociations:
    - ext: md
      name: Markdown Document
      description: Markdown 文件
      role: Editor
      mimeType: text/markdown
      icon: md-icon.ico # 相对于 buildResources (build) 目录
    - ext: tex
      name: LaTeX Document
      description: LaTeX 文件
      role: Editor
      mimeType: text/latex
      icon: tex-icon.ico # 相对于 buildResources (build) 目录
nsis:
  perMachine: true # 使用管理员权限安装，确保文件关联可以注册
  include: build/installer.nsh # 包含自定义脚本清理旧关联并刷新图标缓存
```

### 2. NSIS 自定义脚本

已创建 `build/installer.nsh` 自定义脚本，实现以下功能：

1. **安装前清理**：清理所有旧的文件关联和应用程序注册
2. **安装后注册**：
   - 注册应用程序到注册表，使"打开方式"能找到应用
   - 强制注册文件关联（确保自动关联生效）
   - 刷新 Shell 图标缓存
3. **卸载时清理**：删除所有文件关联和应用程序注册

### 3. 安装和卸载行为

**安装时**：

1. 自动清理所有旧的文件关联（包括不同 appId 的旧版本）
2. 自动注册新的文件关联
3. 注册应用程序到注册表，使"打开方式"能找到应用
4. 刷新 Shell 图标缓存

**卸载时**：

1. 自动删除所有文件关联
2. 删除应用程序注册
3. 刷新 Shell 图标缓存

**重要提示**：

- 安装时需要管理员权限（`perMachine: true`）
- 如果之前安装过旧版本，新安装会自动清理旧的文件关联
- 如果"打开方式"中找不到应用，请检查注册表中的 `HKEY_LOCAL_MACHINE\Software\Classes\Applications\meta-doc.exe`

### 3. 清除 Windows 图标缓存

如果图标仍然显示不正确，需要清除 Windows 图标缓存：

1. **方法一：使用命令提示符（管理员权限）**

   ```cmd
   ie4uinit.exe -show
   ```

2. **方法二：删除图标缓存文件**

   - 按 `Win + R`，输入 `%localappdata%\IconCache.db`
   - 删除该文件
   - 重启资源管理器或重启电脑

3. **方法三：使用 PowerShell**
   ```powershell
   Remove-Item "$env:LOCALAPPDATA\IconCache.db" -Force
   taskkill /f /im explorer.exe
   start explorer.exe
   ```

### 4. 验证文件关联

安装后，检查注册表：

1. 按 `Win + R`，输入 `regedit`
2. 导航到：`HKEY_CURRENT_USER\Software\Classes\.md` 或 `.tex`
3. 检查 `DefaultIcon` 键值是否指向正确的图标文件

## 注意事项

1. **图标文件路径**：确保 `build/md-icon.ico` 和 `build/tex-icon.ico` 文件存在
2. **构建前生成图标**：运行 `npm run generate-icons` 确保图标文件是最新的
3. **重新打包**：修改配置后需要重新打包安装程序
4. **测试**：在干净的 Windows 系统上测试安装，确保文件关联正常工作

## 相关文件

- `meta-doc/electron-builder.yml` - electron-builder 配置
- `meta-doc/package.json` - package.json 中的 fileAssociations（保留用于跨平台兼容）
- `meta-doc/scripts/generate-icons.js` - 图标生成脚本
