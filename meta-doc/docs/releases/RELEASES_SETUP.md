# Releases 仓库设置指南

## 概述

MetaDoc 的发布流程使用了两个仓库：

1. **MetaDoc**（代码仓库）：源代码和构建脚本
2. **MetaDoc-Releases**（发布仓库）：存放构建好的安装包和更新文件

应用程序从 `MetaDoc-Releases` 仓库检查更新。

## 流程说明

### 当前工作流程

1. **在 MetaDoc 仓库中**：

   - 运行 `npm run release:prod` 或 `npm run release:dev`
   - 构建并打包应用
   - 创建标签（`vX.Y.Z` 或 `dev-X.Y.Z`）并推送到 MetaDoc 仓库
   - 标签推送触发 GitHub Actions 工作流

2. **GitHub Actions 自动执行**（在 MetaDoc 仓库中）：

   - 检出 MetaDoc 仓库的代码
   - 构建并打包应用
   - **发布到 MetaDoc-Releases 仓库**（使用 `softprops/action-gh-release@v1`）
   - 在 MetaDoc-Releases 仓库创建 Release 和标签

3. **应用程序更新检查**：
   - 应用程序从 `MetaDoc-Releases` 仓库检查更新
   - 根据用户选择的渠道（dev/release）获取相应版本的更新

## 你需要做的操作

### 1. 确保 MetaDoc-Releases 仓库存在

如果还没有创建 `MetaDoc-Releases` 仓库，需要：

1. 在 GitHub 上创建新仓库：

   - 仓库名：`MetaDoc-Releases`
   - 所有者：与 MetaDoc 仓库相同（例如：`JaredYe04`）
   - **推荐设置为公开仓库**（这样应用程序不需要 Token 就能检查更新）
   - 不需要初始化 README、.gitignore 或 LICENSE（这是一个空仓库，只存放 Releases）

2. 仓库用途说明：
   - 这个仓库**只用于存放 Releases**
   - 不需要推送代码
   - GitHub Actions 会自动在这个仓库创建 Release 和上传文件

### 2. 配置 GitHub Token 权限

确保 GitHub Secrets 中的 `GH_TOKEN` 有权限发布到 `MetaDoc-Releases` 仓库：

1. 创建 Personal Access Token (PAT)：

   - 访问：GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - 点击 "Generate new token (classic)"
   - 权限设置：
     - ✅ `repo`（完整仓库访问权限）
     - 如果 MetaDoc-Releases 是私有仓库，还需要：
       - ✅ `public_repo`（如果仓库是公开的）

2. 在 MetaDoc 仓库配置 Secret：

   - 访问：MetaDoc 仓库 → Settings → Secrets and variables → Actions
   - 添加或更新 Secret：
     - Name: `GH_TOKEN`
     - Value: 刚才创建的 PAT

3. 验证 Token 权限：
   - Token 需要能够：
     - 读取 MetaDoc 仓库（用于构建）
     - 写入 MetaDoc-Releases 仓库（用于发布 Release）

### 3. 验证配置

#### 检查工作流配置

确认 `.github/workflows/release.yml` 中的配置：

```yaml
env:
  RELEASE_REPO_OWNER: ${{ github.repository_owner }}
  RELEASE_REPO: MetaDoc-Releases
```

这表示：

- `RELEASE_REPO_OWNER`：自动使用当前仓库的所有者（例如：`JaredYe04`）
- `RELEASE_REPO`：发布到 `MetaDoc-Releases` 仓库

#### 检查应用程序配置

确认 `.env` 文件中的配置：

```env
UPDATE_GITHUB_OWNER=JaredYe04  # 或你的 GitHub 用户名
UPDATE_GITHUB_REPO=MetaDoc-Releases
```

### 4. 首次发布测试

1. 运行发布命令：

   ```bash
   npm run release:dev
   ```

2. 查看 GitHub Actions：

   - 访问：MetaDoc 仓库 → Actions 标签
   - 查看工作流执行状态
   - 如果失败，检查错误信息

3. 验证发布结果：
   - 访问：`https://github.com/JaredYe04/MetaDoc-Releases/releases`
   - 应该能看到新创建的 Release
   - Release 中应该包含：
     - `.exe` 安装包文件
     - `.yml` 更新信息文件

### 5. 常见问题

#### Q: 发布到 MetaDoc-Releases 失败了，提示权限不足

**A:**

- 检查 `GH_TOKEN` 是否配置正确
- 确认 Token 有 `repo` 权限
- 确认 Token 的所有者能够访问 MetaDoc-Releases 仓库
- 如果 MetaDoc-Releases 是私有仓库，确保 Token 有权限访问

#### Q: 应用程序无法检查更新

**A:**

- 确认 `.env` 文件中的 `UPDATE_GITHUB_OWNER` 和 `UPDATE_GITHUB_REPO` 配置正确
- 如果 MetaDoc-Releases 是私有仓库，需要配置 `UPDATE_GITHUB_TOKEN`（但不推荐，会暴露给用户）
- **推荐使用公开的 MetaDoc-Releases 仓库**

#### Q: 标签出现在 MetaDoc 仓库，但 Release 在 MetaDoc-Releases 仓库，这是正常的吗？

**A:** 是的，这是正常的：

- 标签在 MetaDoc 仓库用于触发 GitHub Actions
- Release 在 MetaDoc-Releases 仓库供应用程序检查更新
- 两个仓库中的标签名称相同（例如：`v0.13.4` 或 `dev-0.13.4`）

#### Q: 可以在 MetaDoc-Releases 仓库手动创建 Release 吗？

**A:** 可以，但不推荐：

- GitHub Actions 会自动创建 Release 和上传文件
- 手动创建可能缺少必要的更新文件（`.yml` 文件）
- 如果需要手动发布，确保包含所有必要的文件

## 总结

**你需要做的操作：**

1. ✅ 创建 `MetaDoc-Releases` 仓库（如果还没有）

   - 设置为公开仓库（推荐）
   - 不需要初始化文件

2. ✅ 配置 GitHub Secrets

   - 在 MetaDoc 仓库中配置 `GH_TOKEN`
   - Token 需要有 `repo` 权限

3. ✅ 验证配置

   - 检查 `.env` 文件配置
   - 检查工作流配置

4. ✅ 测试发布
   - 运行 `npm run release:dev` 测试
   - 检查 MetaDoc-Releases 仓库的 Releases 页面

完成这些操作后，发布流程就会自动工作：标签推送到 MetaDoc 仓库触发工作流，Release 发布到 MetaDoc-Releases 仓库供应用程序检查更新。
