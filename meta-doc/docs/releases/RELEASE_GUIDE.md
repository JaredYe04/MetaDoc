# 发布和更新指南

## 概述

本文档说明如何构建、发布和测试 MetaDoc 的自动更新功能。

**推荐使用 GitHub Actions 自动发布**，详见 [GitHub Actions 配置指南](./GITHUB_ACTIONS_SETUP.md)。

## 前置条件

1. **配置环境变量**

   需要配置两类环境变量：

   **a) 应用程序更新检查（`.env` 文件）**

   在项目根目录的 `.env` 文件中配置：

   ```env
   UPDATE_GITHUB_OWNER=your-github-username
   UPDATE_GITHUB_REPO=MetaDoc-Releases
   # 注意：推荐使用公开仓库，不需要 UPDATE_GITHUB_TOKEN
   # UPDATE_GITHUB_TOKEN 不应写在 .env 文件中（会被打包，用户可以看到）
   ```

   **重要提示**：

   - `.env` 文件会被复制到 `resources/` 目录，并包含在打包后的应用中
   - 这些配置用于应用程序运行时检查更新
   - **推荐使用公开的 Releases 仓库**，这样不需要 Token，也不存在安全问题
   - 如果 Releases 仓库是私有的，`UPDATE_GITHUB_TOKEN` 会被用户看到，存在安全风险

   **b) GitHub Actions 发布（GitHub Secrets）**

   在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加：

   - **Name**: `GH_TOKEN`
   - **Value**: 一个具有 `repo` 权限的 GitHub Personal Access Token

   这些配置用于 GitHub Actions 自动发布新版本。

   **详细说明请参考**：[环境变量配置指南](./ENV_CONFIG.md)

2. **创建 GitHub Releases 仓库**

   确保已创建用于发布的 GitHub 仓库（例如 `MetaDoc-Releases`）。

## 版本管理

版本号由 `scripts/version-manager.js` 自动管理，格式为 `BetaX.Y.Z`（如 `Beta0.13.1`）。

- 版本号会根据 Conventional Commits 规范自动更新
- 构建时会自动读取 `version.json` 中的版本号
- `package.json` 中的版本号会自动同步（移除 Beta 前缀）

## 发布流程

### 使用 npm 命令自动发布（推荐）

#### 前置配置

1. **设置 GitHub Token**

   在源仓库的 Settings → Secrets and variables → Actions 中添加：

   - Name: `GH_TOKEN`
   - Value: 一个具有 `repo` 权限的 GitHub Personal Access Token
   - 该 Token 需要有访问目标 Releases 仓库（MetaDoc-Releases）的权限

2. **配置 Releases 仓库**

   确保目标仓库 `MetaDoc-Releases` 已创建，并且 Token 有访问权限。

#### 发布开发版本（内测版）

```bash
npm run release:dev
```

该命令会自动：

1. 检查 git 状态
2. 构建项目
3. 打包 Windows 版本
4. 创建并推送标签（格式：`dev-X.Y.Z`）
5. 触发 GitHub Actions 自动发布到 MetaDoc-Releases 仓库

**发布流程：**

- 脚本会自动读取 `version.json` 中的版本号
- 创建标签 `dev-0.13.1`（例如，版本为 `Beta0.13.1`）
- 推送标签到 GitHub，触发 GitHub Actions 工作流
- GitHub Actions 会自动构建、生成发布日志并发布到 MetaDoc-Releases 仓库

#### 发布生产版本（正式版）

```bash
npm run release:prod
```

该命令会自动：

1. 检查 git 状态
2. 构建项目
3. 打包 Windows 版本
4. 创建并推送标签（格式：`vX.Y.Z`）
5. 触发 GitHub Actions 自动发布到 MetaDoc-Releases 仓库

**发布流程：**

- 脚本会自动读取 `version.json` 中的版本号
- 创建标签 `v0.13.1`（例如，版本为 `Beta0.13.1`）
- 推送标签到 GitHub，触发 GitHub Actions 工作流
- GitHub Actions 会自动构建、生成发布日志并发布到 MetaDoc-Releases 仓库

### 手动触发工作流（备选方案）

如果需要手动触发 GitHub Actions 工作流：

1. 访问 GitHub 仓库的 Actions 页面
2. 选择 "发布到 Releases 仓库" 工作流
3. 点击 "Run workflow"
4. 选择发布类型：`dev` 或 `prod`
5. （可选）填写版本号和发布说明
6. 点击 "Run workflow"

### 方式 2: 本地构建后手动发布

#### 发布开发版本（内测版）

```bash
npm run release:dev
```

**手动操作：**

1. 查看 `version.json` 获取当前版本号（例如 `Beta0.13.1`）
2. 生成发布日志：
   ```bash
   node scripts/generate-changelog.js Beta0.13.1 dev
   ```
3. 在 GitHub 上创建新的 Release：
   - 标签格式：`dev-0.13.1`（移除 Beta 前缀，添加 dev- 前缀）
   - 标记为预发布版本（Pre-release）
   - 上传 `release/` 目录中的安装包文件
   - 使用生成的发布日志作为发布说明

#### 发布生产版本（正式版）

```bash
npm run release:prod
```

**手动操作：**

1. 查看 `version.json` 获取当前版本号（例如 `Beta0.13.1`）
2. 生成发布日志：
   ```bash
   node scripts/generate-changelog.js Beta0.13.1 prod
   ```
3. 在 GitHub 上创建新的 Release：
   - 标签格式：`v0.13.1`（移除 Beta 前缀，添加 v 前缀）
   - **不要**标记为预发布版本
   - 上传 `release/` 目录中的安装包文件
   - 使用生成的发布日志作为发布说明

## 更新渠道

用户可以在设置面板的"关于"页面选择更新渠道：

- **正式版（release）**：从正式发布的 Release 中获取更新（标签格式：`vX.Y.Z`）
- **内测版（dev）**：从预发布的 Release 中获取更新（标签格式：`dev-X.Y.Z`）

## 测试更新功能

### 方法 1：在开发环境中测试

1. 确保 `.env` 文件已配置
2. 运行应用（开发模式）
3. 打开设置 -> 关于
4. 点击"检查更新"按钮

**注意**：electron-updater 在开发环境中可能不会自动检查更新，但手动点击"检查更新"按钮应该可以工作。

### 方法 2：在打包后的应用中测试

1. 发布第一个版本到 GitHub Releases（例如 `v0.13.1`）
2. 安装该版本
3. 发布一个更新的版本（例如 `v0.13.2`）
4. 运行已安装的应用
5. 打开设置 -> 关于
6. 点击"检查更新"按钮
7. 应该会检测到新版本

## 版本号规则

版本号遵循 Conventional Commits 规范自动更新：

- `feat:` → MINOR +1（如 `Beta0.13.1` → `Beta0.14.0`）
- `fix:` → PATCH +1（如 `Beta0.13.1` → `Beta0.13.2`）
- `refactor:` → PATCH +1
- `perf:` → PATCH +1
- `docs:` → 不升级（可配置）
- `chore:` → 不升级（可配置）
- `BREAKING CHANGE:` → MAJOR +1（在 0.x 时可视作 MINOR）
- `key feat` → MINOR +1（算作两个 feat）

构建时会自动执行 `node scripts/version-manager.js update` 来更新版本。

## 发布检查清单

发布前请确认：

- [ ] `.env` 文件已正确配置 GitHub 仓库信息
- [ ] 版本号已自动更新（查看 `version.json`）
- [ ] 代码已提交到 Git
- [ ] 运行 `npm run release:dev` 或 `npm run release:prod`
- [ ] 检查 `release/` 目录中的构建产物
- [ ] 在 GitHub 上创建 Release，使用正确的标签格式
- [ ] 上传所有必要的安装包文件
- [ ] 填写发布说明
- [ ] 对于开发版本，标记为预发布版本
- [ ] 测试更新功能（可选）

## 发布日志

发布日志会从 git commits 自动生成，包含以下分类：

- ✨ 新功能（feat）
- 🐛 Bug 修复（fix）
- ⚡ 性能优化（perf）
- 🔧 重构（refactor）
- 📝 文档（docs）
- 🔨 其他

### 生成发布日志

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
# 查看要回滚的版本信息
node scripts/release-rollback.js v0.13.1

# 确认删除（需要 --confirm 参数）
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

### 1. 更新检查失败："无法设置 更新渠道：缺少配置"

**原因**：环境变量未正确读取。

**解决方法**：

- 检查 `.env` 文件是否存在且格式正确
- 确认 `UPDATE_GITHUB_OWNER` 和 `UPDATE_GITHUB_REPO` 已设置
- 重启应用

### 2. 在开发环境中检查更新被跳过

**原因**：electron-updater 在开发环境默认不检查更新。

**解决方法**：

- 使用手动"检查更新"按钮
- 或在打包后的应用中进行测试

### 3. 检查更新时提示"已是最新版本"，但 GitHub 上有新版本

**可能原因**：

- Release 标签格式不正确（应为 `vX.Y.Z` 或 `dev-X.Y.Z`）
- Release 中缺少必要的更新文件（如 `.exe` 安装包和 `latest.yml`）
- 更新渠道选择错误（dev 渠道需要 `dev-X.Y.Z` 标签）

**解决方法**：

- 确认 Release 标签格式正确
- 确认 electron-builder 已正确生成所有文件
- 检查更新渠道设置

### 4. 版本号没有自动更新

**解决方法**：

- 运行 `node scripts/version-manager.js update --force` 强制更新
- 或手动设置：`node scripts/version-manager.js set Beta0.13.2`

## 未来改进

- [ ] 集成 GitHub Actions 实现自动发布
- [ ] 支持 macOS 和 Linux 平台打包
- [ ] 实现自动下载和安装更新
- [ ] 添加更新进度显示
- [ ] 支持增量更新
