# Mermaid Charts

## Overview

Mermaid is a popular charting tool suitable for quickly creating flowcharts, sequence diagrams, class diagrams, Gantt charts, and more. MetaDoc supports Mermaid charts, allowing you to directly use Mermaid syntax within Markdown documents to create various diagrams.

<GraphWindow mode="demo" initialTool="mermaid" />

## Mermaid Syntax

<OutlineTreeDisplay mode="demo" />

### Basic Syntax

Mermaid uses simple text syntax to describe charts:

````markdown
```mermaid
graph TD
    A[Start] --> B[Process]
    B --> C[End]
```
````

### Chart Types

<ChartGenerationDisplay mode="demo" />

Mermaid supports various chart types:

- **Flowchart** (graph/flowchart)
- **Sequence Diagram** (sequenceDiagram)
- **Class Diagram** (classDiagram)
- **State Diagram** (stateDiagram)
- **Entity Relationship Diagram** (erDiagram)
- **Gantt Chart** (gantt)
- **Pie Chart** (pie)
- **Git Graph** (gitgraph)
- **User Journey Diagram** (journey)
- **Mind Map** (mindmap)
- **Timeline** (timeline)

```mermaid
graph TB
    A[Mermaid Charts] --> B[Flowchart]
    A --> C[Sequence Diagram]
    A --> D[Class Diagram]
    A --> E[State Diagram]
    A --> F[Other Charts]
    B --> G[graph/flowchart]
    C --> H[sequenceDiagram]
    D --> I[classDiagram]
    E --> J[stateDiagram]
    F --> K[Gantt Chart<br/>Pie Chart<br/>Git Graph etc.]
    style A fill:#f3f4f6,stroke:#374151,stroke-width:2px
    style B fill:#e5e7eb,stroke:#6b7280
    style C fill:#e5e7eb,stroke:#6b7280
    style D fill:#e5e7eb,stroke:#6b7280
    style E fill:#e5e7eb,stroke:#6b7280
    style F fill:#e5e7eb,stroke:#6b7280
```

## Flowchart

<OutlineTreeDisplay mode="demo" />

### Basic Flowchart

Create a basic flowchart:

````markdown
```mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
```
````

### Flowchart Direction

You can set the direction of the flowchart:

- **TD**: Top to Bottom (Top Down)
- **BT**: Bottom to Top (Bottom Top)
- **LR**: Left to Right (Left Right)
- **RL**: Right to Left (Right Left)

### Node Shapes

You can use different node shapes:

- **Rectangle**: `[Text]`
- **Rounded Rectangle**: `(Text)`
- **Diamond**: `{Text}`
- **Circle**: `((Text))`
- **Hexagon**: `{{Text}}`
- **Trapezoid**: `[/Text\]`
- **Inverted Trapezoid**: `[\Text/]`

## Sequence Diagram

<DataAnalysisDisplay mode="demo" />

### Basic Sequence Diagram

Create a sequence diagram:

````markdown
```mermaid
sequenceDiagram
    participant A as User
    participant B as System
    A->>B: Request
    B-->>A: Response
```
````

### Message Types

You can use different types of messages:

- **Solid Arrow**: `->>` Synchronous message
- **Dashed Arrow**: `-->>` Asynchronous message
- **Solid Line**: `->` Synchronous message (no return)
- **Dashed Line**: `-->` Asynchronous message (no return)

### Activation Boxes

You can add activation boxes to represent object activity:

````markdown
```mermaid
sequenceDiagram
    participant A
    participant B
    activate A
    A->>B: Message
    activate B
    B-->>A: Response
    deactivate B
    deactivate A
```
````

## Class Diagram

<ChartGenerationDisplay mode="demo" />

### Basic Class Diagram

Create a class diagram:

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

### Class Relationships

You can represent different class relationships:

- **Inheritance**: `<|--` or `--|>`
- **Implementation**: `<|..` or `..|>`
- **Composition**: `*--` or `--*`
- **Aggregation**: `o--` or `--o`
- **Association**: `-->` or `<--`
- **Dependency**: `..>` or `<..`

### Class Members

You can define class members:

- **Attributes**: `+name: String` (public), `-name: String` (private)
- **Methods**: `+method()` (public), `-method()` (private)

## Gantt Chart

<OutlineTreeDisplay mode="demo" />

### Basic Gantt Chart

Create a Gantt chart:

````markdown
```mermaid
gantt
    title Project Plan
    dateFormat YYYY-MM-DD
    section Phase 1
    Task 1 :a1, 2024-01-01, 30d
    Task 2 :a2, after a1, 20d
```
````

### Date Format

You can set the date format:

- **YYYY-MM-DD**: Year-Month-Day
- **MM/DD/YYYY**: Month/Day/Year
- **Other Formats**: Supports various date formats

### Task Relationships

You can set task relationships:

- **after**: After a specific task
- **Milestone**: Use `milestone` to mark milestones

## Pie Chart

<DataAnalysisDisplay mode="demo" />

### Basic Pie Chart

Create a pie chart:

````markdown
```mermaid
pie title Data Distribution
    "Category A" : 30
    "Category B" : 20
    "Category C" : 50
```
````

## State Diagram

<ChartGenerationDisplay mode="demo" />

### Basic State Diagram

Create a state diagram:

````markdown
```mermaid
stateDiagram-v2
    [*] --> State1
    State1 --> State2
    State2 --> [*]
```
````

## Mind Map

<OutlineTreeDisplay mode="demo" />

### Basic Mind Map

Create a mind map:

````markdown
```mermaid
mindmap
  root((Central Topic))
    Branch1
      Sub-branch1
      Sub-branch2
    Branch2
      Sub-branch3
```
````

## Notes

<DataAnalysisDisplay mode="demo" />

### Syntax Notes

1.  **String Wrapping**: It is recommended to wrap strings with `["..."]` to avoid escape errors.
2.  **Identifiers**: Avoid using identifiers with spaces or special characters in class diagrams.
3.  **Chinese Support**: Chinese can be used, but English identifiers are recommended.
4.  **Syntax Version**: Pay attention to the Mermaid syntax version, as there may be differences between versions.

### Rendering Notes

1.  **Syntax Errors**: Charts will not render if there are syntax errors.
2.  **Complex Charts**: Excessively complex charts may impact rendering performance.
3.  **Browser Compatibility**: Some browsers may not support certain Mermaid features.
4.  **Export Compatibility**: Ensure charts display correctly in the target format when exporting.

## Best Practices

1.  **Syntax Standards**: Follow the official Mermaid syntax specifications.
2.  **Clear Code**: Keep chart code clear and readable.
3.  **Test Rendering**: Test the chart rendering after editing.
4.  **Use Examples**: Refer to examples in the official Mermaid documentation.
5.  **Version Compatibility**: Pay attention to Mermaid version compatibility.

## Related Documentation

-   [[charts.introduction|Chart Feature Introduction]]
-   [[charts.plantuml|PlantUML Charts]]
-   [[charts.echarts|ECharts Charts]]