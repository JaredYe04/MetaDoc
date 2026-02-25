# Demo 覆盖率强制政策 (Demo Coverage Enforcement Policy)

## ⚠️ 不可绕过警告 (NON-BYPASSABLE)

本文档定义的规则通过 linting 脚本强制执行。任何提交必须满足以下要求，否则 CI/CD 将拒绝合并。

**此政策没有例外，不能通过配置关闭。**

---

## 强制要求 (Mandatory Requirements)

### 1. 覆盖率计算公式

每个用户手册文档必须满足：

```
最低 Demo 数量 = max(ceil((H1数量 + H2数量 + H3数量) / 3), 2)
```

**示例**：

- 文档有 6 个 H2 + 3 个 H3 = 9 个标题 → ceil(9/3) = **3 demos**
- 文档有 2 个 H2 = 2 个标题 → ceil(2/3)=1 → 但最小为 **2 demos**

**注意**：H1 通常只有文档标题一个，计算时需包含在内。

### 2. Linting 验证

运行命令：

```bash
npm run lint:demos
```

**通过标准**：

- 所有文档 PASS
- 0 个文档 FAIL
- Exit code 必须为 0

**失败示例**：

```
📊 Demo Coverage Report
========================
PASS: settings/basic.md (4/4)
FAIL: ai/completion.md (0/3 required)
  Missing: 3 demos
  Suggested components: CompletionSettingsPanel, AICompletionDemo
```

### 3. 豁免条件 (严格限制)

以下情况可申请豁免：

1. **纯概念文档**（无任何 UI 元素描述）
2. 在文档**顶部**（第一行）添加 HTML 注释：

   ```markdown
   <!-- demo-exempt: 纯概念文档，无UI元素 -->
   ```

   注释格式必须严格遵循：`<!-- demo-exempt: 原因说明 -->`

**不允许的豁免理由**（将直接拒绝）：

- ❌ "暂时没时间加"
- ❌ "这个组件太难"
- ❌ "以后再加"
- ❌ "这篇文档不需要"
- ❌ 任何模糊的理由

### 4. 自动化 CI/CD 检查

`.github/workflows/ci.yml` 必须包含：

```yaml
- name: Demo Coverage Check
  run: npm run lint:demos
```

**如果 CI/CD 未配置此检查，视为流程缺陷，必须修复。**

---

## 实施流程 (Implementation Workflow)

### Step 1: Linting 检查

```bash
npm run lint:demos
```

### Step 2: 修复 FAIL 文档

对于每个 FAIL 文档：

1. 查看文档描述的 UI 功能
2. 选择对应组件（或创建新组件支持 `mode="demo"`）
3. 在文档中添加：`<ComponentName mode="demo" />`
4. 确保组件已在 `demo-registry-components.ts` 注册

**组件选择指南**：

| 文档描述      | 推荐组件                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| 顶部菜单功能  | `<MenuItemsDemo mode="demo" :items='[...]' />`                           |
| 侧边栏视图    | `<ViewMenuItemsDemo mode="demo" :items='[...]' />`                       |
| 标签页操作    | `<MainTabs mode="demo" />`                                               |
| 快速开始面板  | `<QuickStartPanel mode="demo" />`                                        |
| 查找替换      | `<SearchReplaceMenu mode="demo" ... />`                                  |
| 标题/段落菜单 | `<TitleMenu mode="demo" ... />` / `<SectionOptimizer mode="demo" ... />` |
| PDF预览       | `<PdfPreviewPanel mode="demo" pdfUrl="" />`                              |
| 控制台输出    | `<ConsoleTerminal mode="demo" ... />`                                    |
| 元信息面板    | `<MetaInfoPanel mode="demo" ... />`                                      |
| AI对话        | `<AIChat mode="demo" />`                                                 |
| 大纲视图      | `<Outline mode="demo" />`                                                |
| 知识库        | `<KnowledgeBase mode="demo" />`                                          |

### Step 3: 重新验证

```bash
npm run lint:demos
# 必须全部 PASS
```

### Step 4: 提交代码

```bash
git add .
git commit -m "docs: add demos for X, Y, Z"
```

---

## 违规后果 (Violation Consequences)

| 违规情况              | 后果          |
| --------------------- | ------------- |
| Demo 数量不足         | PR 被拒绝合并 |
| 绕过 linting 提交     | 代码回滚      |
| 虚假 demo 组件        | 重构要求      |
| 未运行 linting 就提交 | 要求重新提交  |
| 使用不允许的豁免理由  | PR 直接关闭   |

---

## 技术细节

### Linting 实现

`npm run lint:demos` 执行以下检查：

1. **标题计数**：统计文档中的 H1、H2、H3 数量
2. **Demo 计数**：统计文档中的 Vue 组件标签（`mode="demo"`）
3. **豁免检测**：检查顶部 HTML 注释 `<!-- demo-exempt: ... -->`
4. **阈值计算**：应用公式 `max(ceil((H1+H2+H3)/3), 2)`
5. **结果输出**：生成 PASS/FAIL 报告

### 为组件添加 Demo 模式支持

如需为新组件添加 demo 支持：

1. **修改组件代码**：

   ```typescript
   const props = defineProps<{
     mode?: 'normal' | 'demo'
   }>()
   const isDemo = computed(() => props.mode === 'demo')
   ```

2. **隔离副作用**：

   ```typescript
   onMounted(() => {
     if (isDemo.value) {
       loadDemoData()
       return // 跳过真实 API 调用
     }
     // 正常初始化...
   })
   ```

3. **注册组件**：在 `demo-registry-components.ts` 中添加：

   ```typescript
   import NewComponent from '../components/path/NewComponent.vue'

   export const demoRegistryComponents = {
     // ... existing components
     NewComponent
   }
   ```

---

## 常见问题

### Q: 为什么需要强制执行？

**A**: Demo 覆盖率直接影响文档质量。没有真实组件展示的文档用户难以理解，维护成本高。强制执行确保每篇文档都有对应的 UI 展示。

### Q: 如果 linting 报告缺少 demos，但我不知道用什么组件？

**A**:

1. 参考 [WRITING_GUIDE.md](./WRITING_GUIDE.md) 中的"已支持的 Demo 组件列表"
2. 查看文档描述的 UI 功能，选择最匹配的组件
3. 如果需要新组件，按照"为组件添加 Demo 模式支持"章节实现

### Q: 我的文档是纯概念介绍，真的不需要 demo 怎么办？

**A**: 在文档**第一行**添加：

```markdown
<!-- demo-exempt: 纯概念文档，无UI元素 -->
```

然后重新运行 linting 验证。

### Q: 豁免理由会被审核吗？

**A**: 是的。所有豁免注释都会被人工审核。以下情况会拒绝：

- 理由模糊或不具体
- 文档实际包含 UI 元素描述
- 使用不允许的豁免理由模板

### Q: 可以修改 linting 脚本降低要求吗？

**A**: **不可以**。此政策的目的是维护文档质量，任何降低要求的修改都会损害用户体验。如有问题，请修复文档而不是修改规则。

---

## 责任分配

| 角色             | 责任                                   |
| ---------------- | -------------------------------------- |
| **文档作者**     | 确保每篇新文档满足 demo 覆盖率要求     |
| **代码审查者**   | 检查 linting 是否通过，拒绝未通过的 PR |
| **CI/CD 维护者** | 确保 `lint:demos` 在 CI 流程中运行     |
| **维护者**       | 审核豁免请求，维护 demo 组件库         |

---

## 历史记录 (Change Log)

- **2024-02-22**: 初始政策建立，强制要求生效
- **2024-02-24**: 完善政策文档，明确豁免条件和违规后果

---

## 相关文档

- [WRITING_GUIDE.md](./WRITING_GUIDE.md) - 完整的文档编写规范
- [AGENT_WRITING_GUIDE.md](./AGENT_WRITING_GUIDE.md) - AI Agent 编写指南
- `demo-registry-components.ts` - Demo 组件注册表
- `scripts/lint-demos.js` - Linting 脚本实现

---

**重要提醒**：本文档是**强制性政策**，不是建议或指南。所有提交必须遵守，没有例外。
