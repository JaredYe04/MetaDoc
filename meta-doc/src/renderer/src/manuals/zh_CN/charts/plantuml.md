# PlantUML图表

## 概述

PlantUML是一个专业的UML建模工具，支持多种UML图表类型。MetaDoc支持PlantUML图表，可以在Markdown文档中使用PlantUML语法创建专业的UML图表。

## PlantUML语法

### 基本语法

PlantUML使用特定的标记和语法：

````markdown
```plantuml
@startuml
Alice -> Bob: 消息
@enduml
```
````

### 必需标记

PlantUML图表必须包含：

- **@startuml**：图表开始标记
- **@enduml**：图表结束标记

```mermaid
graph TB
    A[PlantUML图表] --> B[序列图]
    A --> C[用例图]
    A --> D[类图]
    A --> E[活动图]
    A --> F[组件图]
    A --> G[其他UML图]
    B --> H["@startuml /@enduml"]
    C --> H
    D --> H
    E --> H
    F --> H
    G --> H
    style A fill:#f3f4f6,stroke:#374151,stroke-width:2px
    style B fill:#e5e7eb,stroke:#6b7280
    style C fill:#e5e7eb,stroke:#6b7280
    style D fill:#e5e7eb,stroke:#6b7280
    style E fill:#e5e7eb,stroke:#6b7280
    style F fill:#e5e7eb,stroke:#6b7280
    style G fill:#e5e7eb,stroke:#6b7280
```

## 支持的图表类型

### 序列图

创建序列图：

````markdown
```plantuml
@startuml
Alice -> Bob: 请求
Bob --> Alice: 响应
@enduml
```
````

### 用例图

创建用例图：

````markdown
```plantuml
@startuml
用户 --> (用例1)
用户 --> (用例2)
@enduml
```
````

### 类图

创建类图：

````markdown
```plantuml
@startuml
class Animal {
    +name: String
    +eat()
}
class Dog {
    +bark()
}
Animal <|-- Dog
@enduml
```
````

### 活动图

创建活动图：

````markdown
```plantuml
@startuml
start
:活动1;
:活动2;
stop
@enduml
```
````

### 组件图

创建组件图：

````markdown
```plantuml
@startuml
[组件1] --> [组件2]
@enduml
```
````

### 部署图

创建部署图：

````markdown
```plantuml
@startuml
node "服务器" {
    [应用]
}
@enduml
```
````

### 状态图

创建状态图：

````markdown
```plantuml
@startuml
[*] --> 状态1
状态1 --> 状态2
状态2 --> [*]
@enduml
```
````

## 序列图详解

### 参与者

定义参与者：

````markdown
```plantuml
@startuml
participant "用户" as User
participant "系统" as System
User -> System: 请求
@enduml
```
````

### 消息类型

可以使用不同类型的消息：

- **同步消息**：`->`
- **异步消息**：`-->`
- **返回消息**：`<-` 或 `<--`
- **自调用**：`->` 指向自己

### 激活框

添加激活框：

````markdown
```plantuml
@startuml
Alice -> Bob: 消息
activate Bob
Bob --> Alice: 响应
deactivate Bob
@enduml
```
````

## 类图详解

### 类定义

定义类：

````markdown
```plantuml
@startuml
class MyClass {
    +publicField: String
    -privateField: int
    +publicMethod()
    -privateMethod()
}
@enduml
```
````

### 类关系

表示类关系：

- **继承**：`<|--` 或 `--|>`
- **实现**：`<|..` 或 `..|>`
- **组合**：`*--` 或 `--*`
- **聚合**：`o--` 或 `--o`
- **关联**：`-->` 或 `<--`
- **依赖**：`..>` 或 `<..`

### 接口和抽象类

定义接口和抽象类：

````markdown
```plantuml
@startuml
interface Interface {
    +method()
}
abstract class AbstractClass {
    +abstractMethod()
}
@enduml
```
````

## 活动图详解

### 基本活动

定义活动：

````markdown
```plantuml
@startuml
start
:活动1;
:活动2;
stop
@enduml
```
````

### 判断节点

添加判断：

````markdown
```plantuml
@startuml
start
if (条件?) then (是)
    :活动1;
else (否)
    :活动2;
endif
stop
@enduml
```
````

### 循环

添加循环：

````markdown
```plantuml
@startuml
start
repeat
    :活动;
repeat while (条件?)
stop
@enduml
```
````

## 样式和主题

### 主题设置

可以设置主题：

````markdown
```plantuml
@startuml
!theme plain
class MyClass
@enduml
```
````

### 颜色设置

可以设置颜色：

````markdown
```plantuml
@startuml
class MyClass #LightBlue
@enduml
```
````

## 渲染方式

### 主进程渲染

PlantUML使用主进程渲染：

- **服务器端渲染**：在主进程中渲染图表
- **SVG格式**：默认渲染为SVG格式
- **PNG格式**：可以转换为PNG格式

### 渲染性能

PlantUML渲染特点：

- **渲染速度**：主进程渲染速度较快
- **资源占用**：渲染时占用主进程资源
- **错误处理**：渲染错误会在控制台显示

## 注意事项

### 语法注意事项

1. **必需标记**：必须包含 `@startuml` 和 `@enduml`
2. **语法规范**：遵循PlantUML官方语法规范
3. **中文支持**：可以使用中文，但建议使用英文标识符
4. **版本兼容**：注意PlantUML版本兼容性

### 渲染注意事项

1. **代码提取**：确保代码提取正确，避免包含XML标签
2. **语法错误**：语法错误时图表无法渲染
3. **复杂图表**：过于复杂的图表可能影响渲染性能
4. **导出兼容**：导出时确保图表在目标格式中正常显示

## 最佳实践

1. **语法规范**：遵循PlantUML官方语法规范
2. **代码清晰**：保持图表代码清晰易读
3. **使用标记**：始终使用 `@startuml` 和 `@enduml` 标记
4. **测试渲染**：编辑后测试图表渲染效果
5. **参考文档**：参考PlantUML官方文档

## 相关文档

- [[charts.introduction|图表功能介绍]]
- [[charts.mermaid|Mermaid图表]]
- [[charts.echarts|ECharts图表]]
