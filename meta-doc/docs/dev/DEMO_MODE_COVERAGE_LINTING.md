# Demo Mode Coverage Linting 规则

## 规则说明

**规则名称**: `demo-mode-coverage`  
**规则级别**: **ERROR** (构建阻塞)  
**检查范围**: `src/renderer/src/manuals/**/*.md`

### 规则要求

**每篇文档至少需要 2 个 Demo 组件**

无论文档长度或复杂度如何，所有用户手册文档都必须包含至少 2 个 `mode="demo"` 的 Vue 组件演示。

**简单明了**: ≥ 2 个 Demo / 篇

## 为什么需要这个规则？

### 🎯 文档即交互

MetaDoc 的用户手册不是静态文本，而是**可交互的实机演示**。每个文档都应该让用户能够：

- **边读边操作**：看到界面描述就能立即在文档中操作真实组件
- **零认知负担**：不需要切换到应用窗口就能理解功能
- **沉浸式学习**：文档即应用，应用即文档

### 📊 标题数与复杂度成正比

标题数量反映文档的章节复杂度：

- **标题越多** → 内容越复杂 → 需要的演示越多
- **标题越少** → 内容越简单 → 至少 2 个基础演示

### 🔒 不可绕过的硬性要求

此规则是**构建阻塞级别**的错误，**禁止**通过以下方式绕过：

- ❌ 使用 `<!-- eslint-disable -->` 注释
- ❌ 修改 lint-manuals.js 降低要求
- ❌ 删除或注释掉检查逻辑
- ❌ 使用 `--no-verify` 跳过检查

## 如何修复错误？

### 1. 查看错误信息

运行 lint 时会显示：

```
❌ 文档检查错误
╠═══════════════════════════════════════════════════════════════
║ 文件: src/renderer/src/manuals/zh_CN/features/xxx.md
║ 类型: Demo模式覆盖不足
║ 错误: Demo模式覆盖不足: 需要 3 个 (H1-H3共8个标题), 实际只有 1 个。
╚═══════════════════════════════════════════════════════════════
```

### 2. 添加 Demo 组件

在文档中嵌入 Vue 组件，使用 `mode="demo"` 属性：

```markdown
## 文件操作

文档中提到的每个界面控件都应该有对应的 Demo：

<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new", "open"]}]' />

### 新建文档

新建文档功能说明...

<MainTabs mode="demo" />

### 保存文档

保存功能说明...
```

### 3. 可用 Demo 组件

**菜单类**:

```markdown
<!-- 顶部菜单项 -->
<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new", "open"]}]' />

<!-- 侧边栏视图菜单 -->
<ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' />
```

**编辑器类**:

```markdown
<MainTabs mode="demo" />
<SearchReplaceMenu mode="demo" :position='{"top": 100, "left": 200}' :adapter='null' />
<Outline mode="demo" />
```

**AI/Agent 类**:

```markdown
<AIChat mode="demo" />
<AgentViewDemo />
<ProofreadViewDemo />
```

**设置类**:

```markdown
<Demo component="SettingBasicSection" mode="demo" />
<Demo component="SettingThemeSection" mode="demo" />
<Demo component="SettingLlmSection" mode="demo" />
```

**其他**:

```markdown
<QuickStartPanel mode="demo" />
<QuickStartMarkdown mode="demo" />
<QuickStartLatex mode="demo" />
<PdfPreviewPanel mode="demo" pdfUrl="" />
<ConsoleTerminal mode="demo" consoleKey="demo" :history='[]' />
<MetaInfoPanel mode="demo" :meta='{}' />
```

### 4. 完整示例

参考标杆文档：`src/renderer/src/manuals/zh_CN/quick-start/guide.md`

该文档包含多个章节，每个提到的控件都有对应的 Demo 组件。

## 规则实现细节

### 代码位置

`scripts/lint-manuals.js` - `checkDemoModeCoverage()` 函数

### 实现逻辑

```javascript
// 1. 统计标题
const h1Matches = content.match(/^#\s+/gm) || []
const h2Matches = content.match(/^##\s+/gm) || []
const h3Matches = content.match(/^###\s+/gm) || []
const headingCount = h1Matches.length + h2Matches.length + h3Matches.length

// 2. 计算要求数量
const requiredDemos = Math.max(Math.ceil(headingCount / 3), 2)

// 3. 统计实际 Demo 数
const demoMatches = content.match(/mode\s*=\s*["']demo["']/g) || []
const actualDemos = demoMatches.length

// 4. 检查是否满足
if (actualDemos < requiredDemos) {
  // 报告错误
}
```

### 检查范围

- ✅ **检查**: 所有 `*.md` 文件
- ✅ **标题层级**: H1 (#)、H2 (##)、H3 (###)
- ✅ **Demo 计数**: 匹配 `mode="demo"` 模式
- ❌ **不检查**: H4 及以下（太细粒度）、代码块内的模式

## 例外情况

**原则上不允许例外**。如果确实无法满足（如纯文本概念文档），需要：

1. 在 AGENTS.md 中记录例外原因
2. 经过代码审查批准
3. 添加 `<!-- lint-manuals-ignore demo-mode-coverage -->` 注释（需在 lint 脚本中实现支持）

**当前状态**: 67 篇文档均需遵守此规则，暂无例外。

## 相关文档

- **组件使用规范**: `src/renderer/src/manuals/WRITING_GUIDE.md`
- **组件注册**: `src/renderer/src/manuals/demo-registry-components.ts`
- **Demo 模式实现**: `src/renderer/src/manuals/demo-mode.ts`
- **San Value 理念**: `AGENTS.md` 第 26-64 行

## 故障排查

### Q: 为什么我有 2 个 Demo 还是报错？

A: 检查标题数量。如果有 7 个标题，需要 ceil(7/3) = 3 个 Demo。

### Q: 可以重复使用同一个组件吗？

A: 可以，只要 `mode="demo"` 出现次数达到要求即可。

### Q: 第三方组件可以用吗？

A: 需要先注册到 `demo-registry-components.ts` 并支持 `mode` prop。

### Q: 如何验证修复成功？

```bash
npm run lint:manuals
# 或完整构建
npm run build
```

---

**最后更新**: 2026-02-24  
**规则版本**: v1.0  
**维护者**: MetaDoc Team
