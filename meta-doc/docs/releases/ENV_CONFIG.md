# 环境变量配置说明

## 概述

MetaDoc 项目需要配置两类环境变量：

1. **应用程序更新检查**（`.env` 文件）- 用于应用程序运行时检查更新
2. **GitHub Actions 发布**（GitHub Secrets）- 用于 GitHub Actions 自动发布

## 1. 应用程序更新检查配置（.env 文件）

### 配置文件位置

- **开发环境**：项目根目录的 `.env` 文件
- **打包后**：`resources/.env` 文件（会被打包到应用程序中）

### 必需的环境变量

```env
# GitHub 仓库信息（必需）
UPDATE_GITHUB_OWNER=your-github-username
UPDATE_GITHUB_REPO=MetaDoc-Releases
```

### 可选的环境变量

```env
# 更新检查间隔（可选，默认 24 小时）
UPDATE_CHECK_INTERVAL=86400000
```

**重要提示**：`UPDATE_GITHUB_TOKEN` **不应**写在 `.env` 文件中，因为 `.env` 文件会被打包到应用程序中，用户可以看到。如果 Releases 仓库是私有的，应该考虑使用公开仓库，或者使用其他安全的更新机制。

### 用途说明

这些环境变量用于配置 `update-service.ts`，让应用程序能够：

- 从指定的 GitHub 仓库（`MetaDoc-Releases`）检查更新
- 根据用户选择的更新渠道（dev/release）获取相应版本的更新信息
- **推荐使用公开仓库**，这样不需要 Token，也不存在安全问题

### 配置步骤

1. 在项目根目录创建或编辑 `.env` 文件
2. 添加上述环境变量
3. 运行 `npm run build` 时，`.env` 文件会被自动复制到 `resources/.env`
4. 打包后的应用程序会从 `resources/.env` 读取这些配置

## 2. GitHub Actions 发布配置（GitHub Secrets）

### 配置位置

GitHub 仓库的 Settings → Secrets and variables → Actions

### 必需的环境变量

- **Name**: `GH_TOKEN`
- **Value**: 一个具有 `repo` 权限的 GitHub Personal Access Token

### 用途说明

这个 Token 用于 GitHub Actions 工作流（`.github/workflows/release.yml`），让工作流能够：

- 将构建产物上传到 GitHub Releases
- 创建 Release 并添加发布说明
- 发布到目标仓库（`MetaDoc-Releases`）

### 配置步骤

1. 在 GitHub 上创建一个 Personal Access Token（Settings → Developer settings → Personal access tokens → Tokens (classic)）
2. 授予 `repo` 权限
3. 在源仓库的 Settings → Secrets and variables → Actions 中添加：
   - Name: `GH_TOKEN`
   - Value: 刚才创建的 Token

## 配置对比表

| 配置项                | 位置            | 用途                         | 是否必需      | 安全说明                    |
| --------------------- | --------------- | ---------------------------- | ------------- | --------------------------- |
| `UPDATE_GITHUB_OWNER` | `.env` 文件     | 应用程序检查更新             | ✅ 必需       | ✅ 公开信息，安全           |
| `UPDATE_GITHUB_REPO`  | `.env` 文件     | 应用程序检查更新             | ✅ 必需       | ✅ 公开信息，安全           |
| `UPDATE_GITHUB_TOKEN` | ❌ **不应配置** | 应用程序检查更新（私有仓库） | ❌ **不推荐** | ⚠️ **会暴露给用户，不安全** |
| `GH_TOKEN`            | GitHub Secrets  | GitHub Actions 发布          | ✅ 必需       | ✅ 仅存储在 GitHub，安全    |

**重要说明**：

- `UPDATE_GITHUB_TOKEN` **不应**写在 `.env` 文件中，因为会被打包到应用程序中
- `GH_TOKEN` 只存在于 GitHub Secrets 中，不会出现在 `.env` 文件中
- **推荐使用公开的 Releases 仓库**，这样不需要 Token 就能检查更新

## 常见问题

### Q: 为什么需要两个不同的配置？

**A:** 因为它们服务于不同的场景：

- **`.env` 文件**：应用程序在用户电脑上运行时使用，告诉应用程序从哪个仓库检查更新
- **GitHub Secrets**：GitHub Actions 在云端执行时使用，用于发布新版本到 GitHub Releases

### Q: UPDATE_GITHUB_TOKEN 和 GH_TOKEN 的区别是什么？

**A:**

- **`UPDATE_GITHUB_TOKEN`**：
  - 用于应用程序运行时检查更新
  - **不应**写在 `.env` 文件中（会被打包，用户可以看到）
  - 如果 Releases 仓库是公开的，不需要 Token
  - **推荐使用公开仓库**，这样不需要配置 Token

- **`GH_TOKEN`**：
  - 用于 GitHub Actions 自动发布新版本
  - 只存在于 GitHub Secrets 中（不会暴露给用户）
  - 需要 `repo` 权限来发布到 GitHub Releases
  - 即使发布到公开仓库，也需要这个 Token（用于发布操作）

### Q: 如果仓库是公开的，还需要 Token 吗？

**A:**

- **应用程序检查更新**：不需要 Token（公开仓库，任何人都可以读取 Releases）
- **GitHub Actions 发布**：需要 `GH_TOKEN`（用于发布操作，即使是公开仓库也需要）

### Q: 为什么 UPDATE_GITHUB_TOKEN 不应该写在 .env 文件中？

**A:** 因为 `.env` 文件会被打包到应用程序中，用户安装应用程序后可以访问这些文件。如果 Token 写在 `.env` 中，用户就能看到并使用这个 Token，存在安全风险。

**解决方案**：

- **推荐**：使用公开的 Releases 仓库，不需要 Token
- **如果必须使用私有仓库**：考虑使用其他更新机制，或接受安全风险（不推荐）

### Q: 如何验证配置是否正确？

**A:**

1. **验证 `.env` 配置**：
   - 运行应用程序
   - 打开设置 → 关于
   - 点击"检查更新"
   - 如果配置正确，应该能正常检查更新

2. **验证 GitHub Secrets 配置**：
   - 运行 `npm run release:prod` 或 `npm run release:dev`
   - 查看 GitHub Actions 日志
   - 如果配置正确，应该能成功发布到 Releases

### Q: 打包后应用程序如何读取 .env 文件？

**A:**

1. `scripts/copy-env.js` 会在构建时自动将 `.env` 文件复制到 `resources/.env`
2. `electron-builder.yml` 配置了 `asarUnpack`，确保 `resources` 目录不被打包到 asar 中
3. 应用程序运行时，`update-service.ts` 会从 `resources/.env` 读取配置

## 配置示例

### .env 文件示例（推荐配置）

```env
# 应用程序更新检查配置（公开仓库，推荐）
UPDATE_GITHUB_OWNER=your-github-username
UPDATE_GITHUB_REPO=MetaDoc-Releases
# 注意：使用公开仓库时，不需要 UPDATE_GITHUB_TOKEN
# UPDATE_GITHUB_TOKEN 不应写在 .env 文件中（会被打包，用户可以看到）
```

**重要提示**：

- **推荐使用公开的 Releases 仓库**，这样不需要 Token，也不存在安全问题
- 如果 Releases 仓库是私有的，`UPDATE_GITHUB_TOKEN` 会被打包到应用程序中，用户可以看到，存在安全风险
- 如果必须使用私有仓库，应该考虑其他更新机制

### GitHub Secrets 配置

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加：

- **Name**: `GH_TOKEN`
- **Value**: `ghp_your_token_here`（需要有 `repo` 权限）

## 安全建议

1. **不要将 `.env` 文件提交到 Git 仓库**（应在 `.gitignore` 中）
2. **使用最小权限原则**：
   - `UPDATE_GITHUB_TOKEN`：如果仓库是公开的，不需要 Token
   - `GH_TOKEN`：只授予必要的 `repo` 权限
3. **定期轮换 Token**：定期更新 Token 以提高安全性
4. **使用不同的 Token**：为不同用途使用不同的 Token，便于管理和撤销
