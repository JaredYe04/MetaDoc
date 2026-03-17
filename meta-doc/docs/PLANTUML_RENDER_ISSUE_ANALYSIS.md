# PlantUML 渲染问题排查分析

## 问题概述

1. **导出时报错但 DOCX 仍成功**：主进程报 `PlantUML 渲染失败: 未返回有效的 SVG`，且 stderr 显示 `There is insufficient memory for the Java Runtime Environment to continue`，但导出 DOCX 时图表仍能正常渲染。
2. **图表生成 Agent Tool 的 PlantUML 崩溃**：生成的 PlantUML 出现 `PlantUML cannot parse result from dot/GraphViz`、`IllegalStateException` 等错误。

---

## 一、导出报错但 DOCX 仍成功的原因

### 1.1 渲染链路（导出与图表生成共用）

导出 DOCX/PDF/HTML 与图表生成 Tool 使用**同一套渲染链路**：

```
preRenderAllCharts / chart-generation-tool
    → renderPlantUMLViaIpc (chart-pre-renderer.js)
    → messageBridge.invoke('render-plantuml', code, format)
    → main-calls.ts: renderPlantUMLToLocalImage
    → node-plantuml-2 (Java + PlantUML JAR)
```

### 1.2 为何导出仍能成功

- **preRenderAllCharts** 使用 `Promise.allSettled` **并发**渲染所有图表。
- 某个 PlantUML 渲染失败（如 Java OOM）时：
  - 该图表返回 `replacement: null`，代码块**不会被替换**，仍保留在 Markdown 中。
  - 其他图表若渲染成功，会正常替换为图片链接。
- 因此可能出现：
  - 部分图表成功 → 导出 DOCX 中能看到这些图片。
  - 部分图表失败 → 对应位置仍是代码块或空白。
- 若文档中 PlantUML 较少，或失败发生在其他场景（如同时使用图表生成 Tool），则可能出现“导出成功但日志有报错”的情况。

### 1.3 Java 内存不足的原因

- `node-plantuml-2` 内嵌 JRE，默认堆内存较小。
- 多个 PlantUML 并发渲染时，多个 Java 进程同时启动，内存占用叠加，易触发 OOM。
- 复杂类图、活动图会进一步增加内存需求。

### 1.4 结论

- 不是误报，是真实渲染失败。
- 导出“成功”是因为部分图表渲染成功，失败图表被静默跳过（`replacement: null`），整体流程未中断。

---

## 二、图表生成 Tool 的 PlantUML 崩溃原因

### 2.1 错误特征

- `PlantUML (1.2026.1) cannot parse result from dot/GraphViz`
- `java.lang.IllegalStateException`
- 图表规模：69 行 / 1108 字符（类图）

### 2.2 可能原因

1. **LLM 生成过于复杂的类图**：类多、关系多，导致 GraphViz 布局失败。
2. **PlantUML 与 GraphViz 版本兼容**：PlantUML 1.2026.1 与 bundled GraphViz 存在兼容问题。
3. **语法或结构问题**：某些 PlantUML 写法会触发 GraphViz 解析异常。

### 2.3 与导出的差异

- 导出：文档中的 PlantUML 多为手写，结构相对简单。
- 图表生成：LLM 可能生成复杂、易触发 GraphViz 问题的类图。
- 重试逻辑：当前仅对 `syntax`、`语法`、`error` 等关键词重试，未包含 `GraphViz`、`IllegalStateException`。

---

## 三、修复方案

### 3.1 增加 Java 堆内存（缓解 OOM）

在 `main-calls.ts` 中，调用 `plantuml.generate` 前设置 `JAVA_TOOL_OPTIONS`，提高 JVM 堆上限。

### 3.2 串行渲染 PlantUML（降低并发内存压力）

在 `chart-pre-renderer.js` 的 `preRenderAllCharts` 中，对 PlantUML 类型改为串行渲染，避免多进程同时占用内存。

### 3.3 增强 PlantUML 生成规则（减少 GraphViz 崩溃）

在 `locale_prompts/en_US.json` 的 `tools.chartGeneration.rules.plantuml` 中增加约束：

- 优先使用序列图、活动图等不依赖 GraphViz 的图。
- 类图保持简洁，避免过多类与复杂继承。
- 避免易触发 GraphViz 问题的语法。

### 3.4 扩展重试条件（图表生成 Tool）

在 `chart-generation-tool.ts` 中，将 `GraphViz`、`IllegalStateException`、`crashed` 等加入重试触发条件，失败时尝试重新生成更简单的 PlantUML。
