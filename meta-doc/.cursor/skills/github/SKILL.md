---
name: github
description: 使用 GitHub CLI (`gh`) 管理 Issues、Pull Requests、Workflows、Repositories 等所有 GitHub 操作。支持自动化 TODO 扫描创建 Issues、PR 管理、CI/CD 监控等功能。
---

# GitHub Skill

使用 GitHub CLI (`gh`) 与 GitHub 交互，支持 Issues、PRs、Workflows、Repositories 等全方位操作。

## Agent 身份披露（强制）

**所有通过 `gh` 命令创建的 Issues、评论、PR 描述等，必须在正文末尾添加以下免责声明：**

```
（本条消息由 Agent 发布，也许是幻觉请仔细甄别）
```

**获取当前登录用户：**

```bash
gh api user -q '.login'
```

**示例（创建 Issue）：**

```bash
gh issue create \
  --repo <owner>/<repo> \
  --title "[类型] 描述" \
  --body $'正文内容\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）' \
  --label "enhancement"
```

**示例（添加评论）：**

```bash
gh issue comment <number> --repo <owner>/<repo> \
  --body $'评论内容\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）'
```

**示例（创建 PR）：**

```bash
gh pr create \
  --repo <owner>/<repo> \
  --title "feat: 新功能" \
  --body $'PR 描述\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）' \
  --base main
```

---

## 目录

1. [Issues 管理](#issues-管理)
2. [Pull Requests 管理](#pull-requests-管理)
3. [Workflows / Actions](#workflows--actions)
4. [Repositories 管理](#repositories-管理)
5. [Releases 管理](#releases-管理)
6. [API 高级查询](#api-高级查询)
7. [TODO 到 Issue 自动化](#todo-到-issue-自动化)

---

## Issues 管理

### 列出 Issues

```bash
# 列出开放的 issues
gh issue list --repo <owner>/<repo> --state open --limit 20

# 按标签过滤
gh issue list --repo <owner>/<repo> --label bug --state open

# 按作者过滤
gh issue list --repo <owner>/<repo> --author <username>

# JSON 输出（用于脚本处理）
gh issue list --repo <owner>/<repo> --json number,title,state,labels \
  --jq '.[] | "#\(.number): \(.title)"'
```

### 查看 Issue

```bash
# 查看详情
gh issue view <number> --repo <owner>/<repo>

# 在浏览器中打开
gh issue view <number> --repo <owner>/<repo> --web
```

### 创建 Issue

```bash
gh issue create \
  --repo <owner>/<repo> \
  --title "[类型] 标题描述" \
  --body $'## 描述\n\n详细内容\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）' \
  --label "enhancement" \
  --label "bug" \
  --assignee <username>
```

### 评论 Issue

```bash
gh issue comment <number> --repo <owner>/<repo> \
  --body $'评论内容\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）'
```

### 关闭 Issue

```bash
# 普通关闭
gh issue close <number> --repo <owner>/<repo>

# 带评论关闭（推荐）
gh issue close <number> --repo <owner>/<repo> --comment $'已完成修复\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）'

# 作为重复关闭
gh issue close <number> --repo <owner>/<repo> --duplicate <original-issue-number>
```

### 编辑 Issue

```bash
# 修改标题
gh issue edit <number> --repo <owner>/<repo> --title "新标题"

# 添加标签
gh issue edit <number> --repo <owner>/<repo> --add-label "priority:high"

# 分配负责人
gh issue edit <number> --repo <owner>/<repo> --add-assignee <username>
```

---

## Pull Requests 管理

### 列出 PRs

```bash
# 列出开放的 PRs
gh pr list --repo <owner>/<repo> --state open

# 按状态过滤
gh pr list --repo <owner>/<repo> --state merged --limit 10

# 查看我的 PRs
gh pr list --repo <owner>/<repo> --author "@me"

# JSON 输出
gh pr list --repo <owner>/<repo> --json number,title,headRefName,state
```

### 查看 PR

```bash
# 查看详情
gh pr view <number> --repo <owner>/<repo>

# 查看文件变更
gh pr view <number> --repo <owner>/<repo> --files

# 在浏览器中打开
gh pr view <number> --repo <owner>/<repo> --web
```

### 创建 PR

```bash
gh pr create \
  --repo <owner>/<repo> \
  --title "feat: 新功能描述" \
  --body $'## 变更内容\n\n- 功能 A\n- 功能 B\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）' \
  --base main \
  --head feature-branch \
  --draft
```

### 检查 PR 状态

```bash
# 查看 CI 检查状态
gh pr checks <number> --repo <owner>/<repo>

# 查看详细检查输出
gh pr checks <number> --repo <owner>/<repo> --watch
```

### 合并 PR

```bash
# 标准合并
gh pr merge <number> --repo <owner>/<repo> --merge

# Squash 合并
gh pr merge <number> --repo <owner>/<repo> --squash

# Rebase 合并
gh pr merge <number> --repo <owner>/<repo> --rebase

# 合并并删除分支
gh pr merge <number> --repo <owner>/<repo> --squash --delete-branch
```

### PR 评论

```bash
# 添加评论
gh pr comment <number> --repo <owner>/<repo> \
  --body $'PR 评论\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）'

# 代码审查
gh pr review <number> --repo <owner>/<repo> --approve \
  --body $'LGTM\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）'

# 请求修改
gh pr review <number> --repo <owner>/<repo> --request-changes \
  --body $'需要修改\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）'
```

---

## Workflows / Actions

### 列出工作流

```bash
# 列出所有工作流
gh workflow list --repo <owner>/<repo>

# JSON 输出
gh workflow list --repo <owner>/<repo> --json id,name,state
```

### 运行工作流

```bash
# 手动触发工作流
gh workflow run <workflow-name-or-id> --repo <owner>/<repo>

# 带参数运行
gh workflow run deploy.yml --repo <owner>/<repo> \
  --field environment=production \
  --field version=1.2.0
```

### 查看运行记录

```bash
# 列出最近的运行
gh run list --repo <owner>/<repo> --limit 10

# 按工作流过滤
gh run list --repo <owner>/<repo> --workflow <workflow-name>

# 按状态过滤
gh run list --repo <owner>/<repo> --status failed
```

### 查看运行详情

```bash
# 查看运行概况
gh run view <run-id> --repo <owner>/<repo>

# 查看失败日志
gh run view <run-id> --repo <owner>/<repo> --log-failed

# 查看完整日志
gh run view <run-id> --repo <owner>/<repo> --log

# 在浏览器中打开
gh run view <run-id> --repo <owner>/<repo> --web
```

### 管理运行

```bash
# 重新运行失败的工作流
gh run rerun <run-id> --repo <owner>/<repo>

# 重新运行整个工作流（包括成功的）
gh run rerun <run-id> --repo <owner>/<repo> --failed

# 取消运行
gh run cancel <run-id> --repo <owner>/<repo>

# 删除运行记录
gh run delete <run-id> --repo <owner>/<repo>
```

---

## Repositories 管理

### 查看仓库信息

```bash
# 查看仓库详情
gh repo view <owner>/<repo>

# JSON 输出
gh repo view <owner>/<repo> --json name,description,stargazersCount,forksCount

# 在浏览器中打开
gh repo view <owner>/<repo> --web
```

### 克隆仓库

```bash
# HTTPS 克隆
gh repo clone <owner>/<repo>

# 克隆到指定目录
gh repo clone <owner>/<repo> <directory>
```

### 创建仓库

```bash
# 创建公开仓库
gh repo create <repo-name> --public --description "仓库描述"

# 创建私有仓库
gh repo create <repo-name> --private

# 从模板创建
gh repo create <repo-name> --template <owner>/<template-repo>
```

### Fork 仓库

```bash
# Fork 到个人账户
gh repo fork <owner>/<repo>

# Fork 后克隆到本地
gh repo fork <owner>/<repo> --clone
```

### 管理仓库设置

```bash
# 同步 fork（更新上游更改）
gh repo sync <owner>/<repo>

# 删除仓库（谨慎使用）
gh repo delete <owner>/<repo>

# 归档仓库
gh repo archive <owner>/<repo>
```

---

## Releases 管理

### 列出 Releases

```bash
gh release list --repo <owner>/<repo> --limit 10
```

### 查看 Release

```bash
gh release view <tag> --repo <owner>/<repo>
```

### 创建 Release

```bash
gh release create <tag> \
  --repo <owner>/<repo> \
  --title "v1.0.0" \
  --notes $'## 变更\n\n- 新功能 A\n- Bug 修复 B\n\n（本条消息由 Agent 发布，也许是幻觉请仔细甄别）' \
  --target main
```

### 上传 Assets

```bash
gh release upload <tag> <file> --repo <owner>/<repo>
```

---

## API 高级查询

### 通用 API 调用

```bash
# GET 请求
gh api repos/<owner>/<repo>/issues --jq '.[] | {number, title}'

# POST 请求
gh api repos/<owner>/<repo>/issues \
  --method POST \
  --field title="新 Issue" \
  --field body="描述"

# 带查询参数
gh api repos/<owner>/<repo>/pulls \
  --field state=open \
  --field per_page=10
```

### 常用 API 端点

```bash
# 获取仓库分支
gh api repos/<owner>/<repo>/branches --jq '.[].name'

# 获取仓库标签
gh api repos/<owner>/<repo>/labels --jq '.[] | {name, color}'

# 获取贡献者统计
gh api repos/<owner>/<repo>/contributors --jq '.[] | {login, contributions}'

# 获取代码频率统计
gh api repos/<owner>/<repo>/stats/code_frequency
```

### GraphQL 查询

```bash
# 使用 GraphQL
gh api graphql -f query='
  query {
    viewer {
      login
      name
      repositories(first: 10) {
        nodes {
          name
          stargazerCount
        }
      }
    }
  }
'
```

---

## TODO 到 Issue 自动化

将代码中的 TODO/FIXME 注释自动转换为 GitHub Issues。

### 搜索模式

| 类型     | 模式                   | 优先级 | 说明           |
| -------- | ---------------------- | ------ | -------------- |
| TODO     | `TODO`, `todo`, `Todo` | 高     | 待办事项       |
| FIXME    | `FIXME`, `fixme`       | 高     | 需要修复的问题 |
| XXX      | `XXX`, `xxx`           | 中     | 需要注意的代码 |
| HACK     | `HACK`, `hack`         | 中     | 临时解决方案   |
| BUG      | `BUG`, `bug`           | 高     | 已知缺陷       |
| OPTIMIZE | `OPTIMIZE`, `optimize` | 低     | 性能优化建议   |

### 重复检测流程

**在创建任何 Issue 之前，必须先检查是否已存在相似的 Issue。**

1. **文件路径 + 行号完全匹配** → 100% 重复
2. **文件路径匹配 + 描述相似度 > 80%** → 高度疑似重复
3. **描述相似度 > 90%** → 疑似重复

```bash
# 获取现有 issues 进行重复检测
gh issue list --repo <owner>/<repo> --state open --limit 100 --json number,title,body
```

### Issue 标题格式

```
[类型] 简短描述 - 文件路径:行号

示例：
- [代码规范] 制定 ESLint 规则修复计划 - .eslintrc.cjs:76
- [关键功能] 实现 MCP 客户端调用 - src/utils/plugin.ts:138
```

### Issue 正文模板

````markdown
## 代码位置

- 文件: `{{filePath}}`
- 行号: 第 {{lineNumber}} 行

## TODO 描述

`{{originalText}}`

## 背景说明

{{contextDescription}}

## 建议实现思路

{{implementationIdeas}}

## 代码上下文

```{{language}}
{{contextCode}}
```

（本条消息由 Agent 发布，也许是幻觉请仔细甄别）
````

---

## 完整执行清单

### 执行前检查

- [ ] GitHub CLI (`gh`) 已安装
- [ ] 已登录：`gh auth status` 显示已登录
- [ ] 有仓库访问权限：`gh repo view <owner>/<repo>`
- [ ] 了解现有标签：`gh label list`

### Issues 操作流程

- [ ] 列出现有 Issues 检查重复
- [ ] 准备 Issue 标题（遵循仓库规范）
- [ ] 准备 Issue 正文
- [ ] **在正文末尾添加 Agent 免责声明**
- [ ] 执行 `gh issue create` 命令
- [ ] 验证创建成功

### PR 操作流程

- [ ] 检查 CI 状态：`gh pr checks <number>`
- [ ] 查看文件变更：`gh pr view <number> --files`
- [ ] 准备 PR 描述（包含变更摘要）
- [ ] **在描述末尾添加 Agent 免责声明**
- [ ] 创建或合并 PR

### Workflow 操作流程

- [ ] 列出工作流：`gh workflow list`
- [ ] 查看最近运行：`gh run list --limit 5`
- [ ] 检查失败日志：`gh run view <run-id> --log-failed`
- [ ] 重新运行（如需要）：`gh run rerun <run-id>`

---

## 注意事项

### ⚠️ 重要提醒

1. **Agent 身份披露** - 所有创建的 Issues、PRs、评论必须包含免责声明：`（本条消息由 Agent 发布，也许是幻觉请仔细甄别）`
2. **重复检测** - 创建 Issue 前检查是否已存在相似 Issue
3. **遵循规范** - Issue/PR 标题和标签要符合仓库风格
4. **保护敏感信息** - 不包含密码、密钥等敏感内容
5. **明确上下文** - 提供足够信息供开发者理解

### 常用技巧

**获取当前仓库：**

```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

**批量操作：**

```bash
# 批量关闭旧 Issues
for i in {1..10}; do
  gh issue close $i --repo <owner>/<repo> --comment "自动关闭旧 Issue"
done
```

**格式化输出：**

```bash
# 漂亮的表格输出
gh issue list --json number,title,labels --jq '.[] | "\(.number)\t\(.title)\t\(.labels | map(.name) | join(","))"'
```

---

## GitHub 写作经验

### Issue / PR / 评论撰写技巧

#### 1. 清晰的问题描述结构

```markdown
## 问题描述

[简洁描述问题现象]

## 复现步骤

1. [步骤1]
2. [步骤2]
3. [步骤3]

## 预期行为

[描述应该发生什么]

## 实际行为

[描述实际发生了什么]

## 环境信息

- 操作系统: [OS]
- 相关文件: [文件路径]
- 相关 Commit: [commit hash]
```

#### 2. 技术问题分析结构

```markdown
## 根本原因分析

### 表面现象

[描述看到的现象]

### 深层原因

[解释为什么会发生]

### 触发条件

- [条件1]
- [条件2]

## 解决方案对比

| 方案  | 优点 | 缺点 |
| ----- | ---- | ---- |
| 方案A | ...  | ...  |
| 方案B | ...  | ...  |

## 推荐方案

[详细说明最终方案]
```

#### 3. PR 描述更新技巧

当 PR 内容发生变更时（如重构、修复问题），**不要编辑原描述**，而是**添加新评论**：

````markdown
## [日期] 更新：重构为 CSS 自定义属性方案

### 变更内容

[描述本次更新的主要内容]

### 方案对比

| 方案   | 代码示例                                          | 评价   |
| ------ | ------------------------------------------------- | ------ |
| 原方案 | `document.querySelector('.x').classList.add('y')` | 能工作 |
| 新方案 | `element.style.setProperty('--var', value)`       | 更干净 |

### 测试方法

```bash
# 提供具体的测试命令
npm run dev
```
````

````

#### 4. 错误修复记录

当修复实施过程中的问题时，记录教训：

```markdown
## [日期] 修复：CSS 语法错误

### 问题
[描述遇到的问题]

### 错误代码
```css
/* 错误示例 */
cursor: var(--dragging, 0) == 1 ? default : inherit;
````

### 原因

[解释为什么错了]

### 修复

[说明如何修复]

### 教训

[总结避免类似问题的经验]

````

#### 5. CC 相关人员

重要更新必须在末尾 CC 相关人员：

```markdown
cc @username1 @username2
````

**CC 时机**：

- 创建 Issue/PR 时
- 重大更新时
- 需要确认/测试时
- 关闭/合并时

#### 6. Shell 特殊字符处理

在 shell 中写入包含特殊字符的内容时：

```bash
# ❌ 错误：特殊字符会被 shell 解析
gh issue comment 1 --body "CSS: var(--x) == y ? a : b"

# ✅ 正确：使用文件或转义
gh issue comment 1 --body-file /tmp/comment.txt
echo "内容" | gh issue comment 1 --body -
```

**常见需要转义的字符**：

- `$` - 变量引用
- `` ` `` - 命令替换
- `!` - 历史扩展
- `#` - 注释

---

## 参考命令速查表

| 操作        | 命令                                                           |
| ----------- | -------------------------------------------------------------- |
| 列出 Issues | `gh issue list --repo owner/repo`                              |
| 创建 Issue  | `gh issue create --repo owner/repo --title "..." --body "..."` |
| 关闭 Issue  | `gh issue close <number> --repo owner/repo`                    |
| 列出 PRs    | `gh pr list --repo owner/repo`                                 |
| 创建 PR     | `gh pr create --repo owner/repo --title "..." --base main`     |
| 合并 PR     | `gh pr merge <number> --repo owner/repo --squash`              |
| 查看 CI     | `gh pr checks <number> --repo owner/repo`                      |
| 列出运行    | `gh run list --repo owner/repo`                                |
| 查看日志    | `gh run view <run-id> --repo owner/repo --log-failed`          |
| 查看仓库    | `gh repo view owner/repo`                                      |
| API 调用    | `gh api repos/owner/repo/issues`                               |
