# GitHub Actions 自动发布配置指南

## 概述

本文档说明如何配置 GitHub Actions 以实现自动发布到 MetaDoc-Releases 仓库。

## 前置条件

1. **配置应用程序更新检查（.env 文件）**

   在项目根目录的 `.env` 文件中配置：

   ```env
   UPDATE_GITHUB_OWNER=your-github-username
   UPDATE_GITHUB_REPO=MetaDoc-Releases
   # 注意：推荐使用公开仓库，不需要 UPDATE_GITHUB_TOKEN
   # UPDATE_GITHUB_TOKEN 不应写在 .env 文件中（会被打包，用户可以看到）
   ```

   这些配置用于应用程序运行时检查更新。

   **重要提示**：

   - `.env` 文件会被打包到应用程序中，用户可以看到
   - **推荐使用公开的 Releases 仓库**，这样不需要 Token，也不存在安全问题
   - `UPDATE_GITHUB_TOKEN` 不应写在 `.env` 文件中（会暴露给用户）

   **详细说明请参考**：[环境变量配置指南](./ENV_CONFIG.md)

2. **创建 GitHub Personal Access Token**

   - 访问 GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - 点击 "Generate new token (classic)"
   - 设置名称（例如：MetaDoc Release Token）
   - 选择权限：
     - `repo`（完整仓库访问权限，包括私有仓库）
   - 生成 Token 并复制保存（只会显示一次）

3. **配置 GitHub Secrets**

   - 在源仓库（MetaDoc）中，访问 Settings → Secrets and variables → Actions
   - 点击 "New repository secret"
   - 添加以下 Secret：
     - Name: `GH_TOKEN`
     - Value: 刚才创建的 Personal Access Token
   - 点击 "Add secret" 保存

4. **确认 Releases 仓库存在**

   - 确保 `MetaDoc-Releases` 仓库已创建
   - Token 需要有访问该仓库的权限（如果是私有仓库，需要 Token 有访问权限）

**注意**：`.env` 文件中的配置和 GitHub Secrets 中的配置服务于不同目的，都需要配置。详细说明请参考 [环境变量配置指南](./ENV_CONFIG.md)。

## 工作流说明

GitHub Actions 工作流文件位于 `.github/workflows/release.yml`，通过推送标签自动触发。

### 推荐使用方式：npm 命令

**发布正式版：**

```bash
npm run release:prod
```

**发布开发版：**

```bash
npm run release:dev
```

这些命令会自动：

1. 构建项目
2. 打包 Windows 版本
3. 创建并推送标签（`vX.Y.Z` 或 `dev-X.Y.Z`）
4. 触发 GitHub Actions 自动发布

### 工作流触发方式

工作流会在以下情况自动触发：

1. **推送标签触发**（主要方式）

   - 当推送符合以下格式的标签时，会自动触发发布：
   - `v*` - 正式版（例如：`v0.13.1`）
   - `dev-*` - 开发版（例如：`dev-0.13.1`）

2. **手动触发**（workflow_dispatch，备选方案）

   可以手动在 GitHub 上触发工作流：

   1. 访问仓库的 Actions 页面
   2. 选择 "发布到 Releases 仓库" 工作流
   3. 点击 "Run workflow"
   4. 选择参数：
      - **发布类型**：`prod` 或 `dev`
      - **版本号**（可选）：留空则使用当前版本
      - **发布说明**（可选）：留空则自动生成
   5. 点击 "Run workflow"

## 工作流执行流程

1. **检出代码**：获取最新代码和所有 git 历史（用于生成发布日志）

2. **设置环境**：配置 Node.js 和 npm

3. **安装依赖**：运行 `npm ci` 安装依赖

4. **读取版本信息**：

   - 如果手动输入了版本号，使用输入的版本
   - 否则从 `version.json` 读取当前版本

5. **确定发布类型**：

   - 手动触发：使用输入的发布类型
   - 标签触发：根据标签格式自动判断（`v*` = prod，`dev-*` = dev）

6. **构建项目**：运行 `npm run build`

7. **打包 Windows 版本**：运行 `npm run build:win`

8. **生成发布日志**：

   - 从 git commits 自动生成发布说明
   - 按类型分类（新功能、Bug修复、性能优化等）

9. **发布到 Releases 仓库**：

   - 上传构建产物（`.exe`、`.yml` 等文件）
   - 使用生成的发布日志作为 Release 说明
   - 根据发布类型设置是否为预发布版本

10. **保存发布日志**：将发布信息保存为 JSON 文件，便于后续查询和回滚

## 发布日志生成

发布日志会自动从 git commits 生成，基于 Conventional Commits 规范：

- **新功能（feat）**：显示在 "✨ 新功能" 部分
- **Bug 修复（fix）**：显示在 "🐛 Bug 修复" 部分
- **性能优化（perf）**：显示在 "⚡ 性能优化" 部分
- **重构（refactor）**：显示在 "🔧 重构" 部分
- **文档（docs）**：显示在 "📝 文档" 部分

### 手动生成发布日志

如果需要手动生成发布日志：

```bash
# 生成正式版发布日志
node scripts/generate-changelog.js Beta0.13.1 prod

# 生成开发版发布日志
node scripts/generate-changelog.js Beta0.13.1 dev
```

## 发布回滚

如果发布了有问题的版本，可以使用回滚脚本删除 Release。

### 查看所有 Releases

```bash
node scripts/release-rollback.js
```

### 回滚指定版本

```bash
# 1. 查看要回滚的版本信息
node scripts/release-rollback.js v0.13.1

# 2. 确认删除（需要 --confirm 参数）
node scripts/release-rollback.js v0.13.1 --confirm
```

**注意：**

- 回滚操作只删除 GitHub Release，不会删除 Git 标签
- 如需删除 Git 标签，请手动执行：
  ```bash
  git tag -d v0.13.1
  git push origin :refs/tags/v0.13.1
  ```
- 回滚后，用户仍可以从之前的版本更新到被回滚的版本（如果已下载）
- 建议回滚后立即发布修复版本

## 常见问题

### 1. 工作流执行失败："GH_TOKEN not found"

**原因**：GitHub Secrets 未配置。

**解决方法**：

- 检查是否在仓库的 Settings → Secrets and variables → Actions 中添加了 `GH_TOKEN`
- 确认 Token 值正确

### 2. 发布失败："Repository not found"

**原因**：Token 没有访问目标仓库的权限。

**解决方法**：

- 确认 Token 有 `repo` 权限
- 如果是私有仓库，确认 Token 有访问权限
- 确认目标仓库名称正确（`MetaDoc-Releases`）

### 3. 构建失败

**原因**：可能是依赖问题或构建脚本错误。

**解决方法**：

- 查看 GitHub Actions 日志，定位具体错误
- 在本地运行 `npm run build` 和 `npm run build:win` 测试
- 检查 Node.js 版本是否匹配

### 4. 发布日志为空

**原因**：可能没有新的 commits，或 git 历史不完整。

**解决方法**：

- 确认工作流使用了 `fetch-depth: 0` 获取完整 git 历史
- 检查是否有符合 Conventional Commits 规范的 commits
- 可以在手动触发时输入自定义发布说明

### 5. 文件未上传到 Release

**原因**：文件路径或 glob 模式不正确。

**解决方法**：

- 检查 `release/` 目录中是否有构建产物
- 确认文件扩展名正确（`.exe`、`.yml` 等）
- 查看工作流日志中的文件列表

## 最佳实践

1. **版本管理**：

   - 使用 Conventional Commits 规范提交代码
   - 版本号会自动根据 commits 更新
   - 发布前确认版本号正确

2. **标签管理**：

   - 使用清晰的标签格式（`vX.Y.Z` 或 `dev-X.Y.Z`）
   - 标签一旦推送就会触发发布，请谨慎操作
   - 如需修改标签，先删除本地和远程标签，再重新创建

3. **发布前检查**：

   - 在本地测试构建和打包
   - 确认代码已提交
   - 检查版本号是否正确

4. **发布后验证**：

   - 检查 GitHub Releases 页面，确认文件已上传
   - 验证发布说明是否正确
   - 在应用中测试更新功能

5. **回滚策略**：
   - 发现严重问题立即回滚
   - 回滚后尽快发布修复版本
   - 记录回滚原因，避免重复问题
