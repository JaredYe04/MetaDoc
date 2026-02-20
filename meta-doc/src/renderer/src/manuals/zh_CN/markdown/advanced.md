# Markdown高级功能

## 概述

在掌握[[markdown.basics|Markdown语法]]和[[markdown.features|Markdown编辑器功能]]后，您可以进一步使用扩展语法与高级特性，如图表、数学公式、HTML 与属性等，以丰富文档表现力。

## 图表与公式

### 图表代码块

在文档中可使用代码块插入 Mermaid、PlantUML、ECharts 等图表，编辑器会实时渲染：

- **Mermaid**：流程图、序列图、类图、甘特图等，参见 [[charts.mermaid|Mermaid图表]]
- **PlantUML**：UML 图等，参见 [[charts.plantuml|PlantUML图表]]
- **ECharts**：数据可视化图表，参见 [[charts.echarts|ECharts图表]]

### 数学公式

支持行内公式与块级公式：

- **行内公式**：`$...$` 或 `\(...\)`
- **块级公式**：`$$...$$` 或 `\[...\]`
- **多行公式**：使用 `aligned`、`equation` 等环境

### LaTeX 公式转换

编辑器可将部分 LaTeX 公式语法转换为兼容的 Markdown/HTML 形式，便于在非 LaTeX 环境中正确显示。

## 扩展语法

### 表格进阶

- 对齐：在表头分隔行使用 `:---`、`:---:`、`---:` 设置左、中、右对齐
- 合并：复杂表格可通过 HTML `<table>` 实现
- 从选区创建：在编辑器中选中文本后，可通过右键或菜单快速插入表格

### 链接与图片

- **参考式链接**：`[文本][引用名]`，在文末定义 `[引用名]: URL`
- **标题与属性**：部分渲染器支持 `(url "title")` 或自定义属性
- **图片尺寸**：通过 HTML `<img>` 或扩展语法设置宽高（视渲染器支持而定）

### 脚注

若渲染器支持脚注扩展：

```markdown
正文内容[^1]。

[^1]: 脚注内容。
```

## 与编辑器功能配合

### 右键与 AI

- **段落优化**：选中段落使用右键「段落优化」或 AI 润色，参见 [[features.paragraph-optimization|段落优化功能]]
- **插入图表**：通过右键或 AI 助手插入 Mermaid/ECharts 等代码块，参见 [[charts.introduction|图表功能介绍]]

### 知识库与补全

- 启用[[knowledge-base.usage|知识库]]后，AI 补全与对话可结合当前文档与知识库内容
- 在[[ai.completion|AI自动补全]]中设置触发键与最大 Token，提高长文写作效率

## 最佳实践

1. **先基础后扩展**：先熟练[[markdown.basics|基本语法]]，再使用图表与公式
2. **统一风格**：同一文档内图表类型、公式写法尽量统一
3. **兼容性**：导出为 PDF/HTML 时注意图表与公式的兼容性
4. **性能**：单页内过多或过大的图表可能影响预览性能

## 相关文档

- [[markdown.basics|Markdown语法]]
- [[markdown.features|Markdown编辑器功能]]
- [[charts.introduction|图表功能介绍]]
- [[ai.completion|AI自动补全]]
