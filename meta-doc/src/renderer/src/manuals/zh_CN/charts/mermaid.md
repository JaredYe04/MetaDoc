# Mermaid图表

## 概述

Mermaid是一个流行的图表绘制工具，适合快速绘制流程图、序列图、类图、甘特图等。MetaDoc支持Mermaid图表，可以在Markdown文档中直接使用Mermaid语法创建各种图表。

<GraphWindow mode="demo" initialTool="mermaid" />

## Mermaid语法

<OutlineTreeDisplay mode="demo" />

### 基本语法

Mermaid使用简单的文本语法描述图表：

````markdown
```mermaid
graph TD
    A[开始] --> B[处理]
    B --> C[结束]
```
````

### 图表类型

<ChartGenerationDisplay mode="demo" />

Mermaid支持多种图表类型：

- **流程图**（graph/flowchart）
- **序列图**（sequenceDiagram）
- **类图**（classDiagram）
- **状态图**（stateDiagram）
- **实体关系图**（erDiagram）
- **甘特图**（gantt）
- **饼图**（pie）
- **Git图**（gitgraph）
- **用户旅程图**（journey）
- **思维导图**（mindmap）
- **时间线**（timeline）

```mermaid
graph TB
    A[Mermaid图表] --> B[流程图]
    A --> C[序列图]
    A --> D[类图]
    A --> E[状态图]
    A --> F[其他图表]
    B --> G[graph/flowchart]
    C --> H[sequenceDiagram]
    D --> I[classDiagram]
    E --> J[stateDiagram]
    F --> K[甘特图<br/>饼图<br/>Git图等]
    style A fill:#f3f4f6,stroke:#374151,stroke-width:2px
    style B fill:#e5e7eb,stroke:#6b7280
    style C fill:#e5e7eb,stroke:#6b7280
    style D fill:#e5e7eb,stroke:#6b7280
    style E fill:#e5e7eb,stroke:#6b7280
    style F fill:#e5e7eb,stroke:#6b7280
```

## 流程图

<OutlineTreeDisplay mode="demo" />

### 基本流程图

创建基本流程图：

````markdown
```mermaid
graph TD
    A[开始] --> B{判断}
    B -->|是| C[操作1]
    B -->|否| D[操作2]
    C --> E[结束]
    D --> E
```
````

### 流程图方向

可以设置流程图的方向：

- **TD**：从上到下（Top Down）
- **BT**：从下到上（Bottom Top）
- **LR**：从左到右（Left Right）
- **RL**：从右到左（Right Left）

### 节点形状

可以使用不同的节点形状：

- **矩形**：`[文本]`
- **圆角矩形**：`(文本)`
- **菱形**：`{文本}`
- **圆形**：`((文本))`
- **六边形**：`{{文本}}`
- **梯形**：`[/文本\]`
- **倒梯形**：`[\文本/]`

## 序列图

<DataAnalysisDisplay mode="demo" />

### 基本序列图

创建序列图：

````markdown
```mermaid
sequenceDiagram
    participant A as 用户
    participant B as 系统
    A->>B: 请求
    B-->>A: 响应
```
````

### 消息类型

可以使用不同类型的消息：

- **实线箭头**：`->>` 同步消息
- **虚线箭头**：`-->>` 异步消息
- **实线**：`->` 同步消息（不返回）
- **虚线**：`-->` 异步消息（不返回）

### 激活框

可以添加激活框表示对象活动：

````markdown
```mermaid
sequenceDiagram
    participant A
    participant B
    activate A
    A->>B: 消息
    activate B
    B-->>A: 响应
    deactivate B
    deactivate A
```
````

## 类图

<ChartGenerationDisplay mode="demo" />

### 基本类图

创建类图：

````markdown
```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +eat()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog
```
````

### 类关系

可以表示不同的类关系：

- **继承**：`<|--` 或 `--|>`
- **实现**：`<|..` 或 `..|>`
- **组合**：`*--` 或 `--*`
- **聚合**：`o--` 或 `--o`
- **关联**：`-->` 或 `<--`
- **依赖**：`..>` 或 `<..`

### 类成员

可以定义类的成员：

- **属性**：`+name: String`（公有）、`-name: String`（私有）
- **方法**：`+method()`（公有）、`-method()`（私有）

## 甘特图

<OutlineTreeDisplay mode="demo" />

### 基本甘特图

创建甘特图：

````markdown
```mermaid
gantt
    title 项目计划
    dateFormat YYYY-MM-DD
    section 阶段1
    任务1 :a1, 2024-01-01, 30d
    任务2 :a2, after a1, 20d
```
````

### 日期格式

可以设置日期格式：

- **YYYY-MM-DD**：年-月-日
- **MM/DD/YYYY**：月/日/年
- **其他格式**：支持多种日期格式

### 任务关系

可以设置任务关系：

- **after**：在某个任务之后
- **里程碑**：使用`milestone`标记里程碑

## 饼图

<DataAnalysisDisplay mode="demo" />

### 基本饼图

创建饼图：

````markdown
```mermaid
pie title 数据分布
    "类别A" : 30
    "类别B" : 20
    "类别C" : 50
```
````

## 状态图

<ChartGenerationDisplay mode="demo" />

### 基本状态图

创建状态图：

````markdown
```mermaid
stateDiagram-v2
    [*] --> 状态1
    状态1 --> 状态2
    状态2 --> [*]
```
````

## 思维导图

<OutlineTreeDisplay mode="demo" />

### 基本思维导图

创建思维导图：

````markdown
```mermaid
mindmap
  root((中心主题))
    分支1
      子分支1
      子分支2
    分支2
      子分支3
```
````

## 注意事项

<DataAnalysisDisplay mode="demo" />

### 语法注意事项

1. **字符串包裹**：建议使用 `["..."]` 包裹字符串避免转义错误
2. **标识符**：在类图中避免使用带空格或特殊字符的标识符
3. **中文支持**：可以使用中文，但建议使用英文标识符
4. **语法版本**：注意Mermaid语法版本，不同版本可能有差异

### 渲染注意事项

1. **语法错误**：语法错误时图表无法渲染
2. **复杂图表**：过于复杂的图表可能影响渲染性能
3. **浏览器兼容**：某些浏览器可能不支持某些Mermaid特性
4. **导出兼容**：导出时确保图表在目标格式中正常显示

## 最佳实践

1. **语法规范**：遵循Mermaid官方语法规范
2. **代码清晰**：保持图表代码清晰易读
3. **测试渲染**：编辑后测试图表渲染效果
4. **使用示例**：参考Mermaid官方文档的示例
5. **版本兼容**：注意Mermaid版本兼容性

## 相关文档

- [[charts.introduction|图表功能介绍]]
- [[charts.plantuml|PlantUML图表]]
- [[charts.echarts|ECharts图表]]
