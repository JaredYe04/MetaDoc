# 版本管理说明

## 概述

项目实现了基于 **Conventional Commits** 规范的自动版本管理系统，版本号格式为 `BetaX.Y.Z`（如 `Beta0.0.1`）。

## 版本升级规则

版本升级基于 commit message 自动判断，遵循 Conventional Commits 规范：

| Commit 类型 | 示例 | 升级策略 | 说明 |
|-----------|------|---------|------|
| `feat:` | `feat: 添加新功能` | **MINOR +1** | 新功能，如 `Beta0.4.7` → `Beta0.5.0` |
| `fix:` | `fix: 修复bug` | **PATCH +1** | Bug 修复，如 `Beta0.4.7` → `Beta0.4.8` |
| `refactor:` | `refactor: 重构代码` | **PATCH +1** | 重构但不改变功能 |
| `perf:` | `perf: 性能优化` | **PATCH +1** | 性能优化 |
| `docs:` | `docs: 更新文档` | **不升级** | 文档变化（可配置为 PATCH +1） |
| `chore:` | `chore: 更新依赖` | **不升级** | 构建脚本等（可配置为 PATCH +1） |
| `BREAKING CHANGE:` | `feat!: 不兼容更新` | **MAJOR +1** | 不兼容更新（0.x 时可视作 MINOR） |
| `key feat` | `feat: 关键功能` | **MINOR +1** | 关键功能，算作两个 feat |
| 无前缀 | `修复问题` | **PATCH +1** | 当作 fix 处理（fallback） |

### 特殊规则

1. **BREAKING CHANGE**: 
   - 在 commit message 中包含 `BREAKING CHANGE:` 或使用 `feat!:` 格式
   - 在 0.x 版本时，默认当作 MINOR 升级（可配置）

2. **Key Feat**: 
   - commit message 中包含 "key" 或 "关键" 关键词的 feat
   - 算作两个 feat，会额外升级一次 MINOR

3. **优先级**: 
   - 如果有多个 commits，取最高升级级别
   - 优先级：MAJOR > MINOR > PATCH

4. **升级逻辑**:
   - MINOR 升级时，patch 归零（如 `Beta0.4.7` → `Beta0.5.0`）
   - MAJOR 升级时，minor 和 patch 都归零（如 `Beta0.4.7` → `Beta1.0.0`）

## 使用方法

### 自动更新版本（推荐）

在构建时，版本会自动根据 git 提交次数更新：

```bash
pnpm build
```

构建脚本会在构建前自动：
1. 检测自上次版本更新以来的所有 git commits
2. 解析每个 commit message，识别 Conventional Commits 类型
3. 根据 commit 类型自动判断版本升级级别（MAJOR/MINOR/PATCH）
4. 更新版本号并记录最后处理的 commit hash
5. 更新 `package.json` 中的版本号

### 手动设置版本

如果需要手动设置版本号：

```bash
node scripts/version-manager.js set Beta0.1.0
```

### 手动递增版本

如果需要手动递增版本号（不依赖 git 提交）：

```bash
node scripts/version-manager.js increment
```

### 查看当前版本

```bash
node scripts/version-manager.js get
```

### 强制更新版本

即使 git 提交次数未变化，也可以强制更新版本：

```bash
node scripts/version-manager.js update --force
```

## 版本文件

版本信息存储在 `version.json` 文件中：

```json
{
  "version": "Beta0.0.1",
  "lastCommitHash": "abc123...",
  "commitCount": 0,
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

- `version`: 当前版本号
- `lastCommitHash`: 最后处理的 commit hash，用于追踪已处理的 commits
- `commitCount`: 提交次数（保留用于兼容）
- `updatedAt`: 最后更新时间

## Commit Message 规范

为了正确自动升级版本，请遵循 Conventional Commits 规范：

### 基本格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型说明

- **feat**: 新功能
- **fix**: Bug 修复
- **docs**: 文档变更
- **refactor**: 重构代码（不改变功能）
- **perf**: 性能优化
- **chore**: 构建过程或辅助工具的变动

### 示例

```bash
# MINOR 升级
git commit -m "feat: 添加用户登录功能"

# PATCH 升级
git commit -m "fix: 修复登录页面样式问题"
git commit -m "refactor: 重构用户服务代码"
git commit -m "perf: 优化数据库查询性能"

# 不升级版本
git commit -m "docs: 更新 README 文档"
git commit -m "chore: 更新依赖包版本"

# MAJOR 升级（BREAKING CHANGE）
git commit -m "feat!: 重构 API 接口，不兼容旧版本"
git commit -m "feat: 新功能

BREAKING CHANGE: 移除了旧的 API 接口"

# Key Feat（算作两个 feat）
git commit -m "feat: 关键功能 - 添加支付系统"
```

### 无前缀的 Commit

如果 commit message 没有遵循规范（无类型前缀），系统会将其当作 `fix:` 处理，升级 PATCH 版本。

```bash
# 会被当作 fix 处理
git commit -m "修复了一个bug"
git commit -m "更新了代码"
```

## 界面显示

在应用界面中，鼠标悬停在顶部菜单的 "MetaDoc" 标题上，会显示当前版本号的 tooltip。

- **开发环境**: 版本号后会自动添加 `-dev` 后缀，如 `Beta0.0.1-dev`
- **生产环境**: 显示完整版本号，如 `Beta0.0.1`

## 注意事项

1. 版本文件 `version.json` 会被自动复制到 `resources` 目录，以便在打包后正确读取
2. 每次构建时，版本号会自动更新，无需手动操作
3. 如果需要手动修改版本，请使用版本管理工具，不要直接编辑 `version.json` 文件

