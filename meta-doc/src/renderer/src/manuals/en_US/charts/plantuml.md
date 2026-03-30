# PlantUML Diagrams

## Overview

PlantUML is a professional UML modeling tool that supports various UML diagram types. MetaDoc supports PlantUML diagrams, allowing you to create professional UML diagrams using PlantUML syntax within Markdown documents.

<GraphWindow mode="demo" initialTool="plantuml" />

## PlantUML Syntax

<OutlineTreeDisplay mode="demo" />

### Basic Syntax

PlantUML uses specific markup and syntax:

````markdown
```plantuml
@startuml
Alice -> Bob: Message
@enduml
```
````

### Required Markup

<ChartGenerationDisplay mode="demo" />

PlantUML diagrams must include:

- **@startuml**: Diagram start marker
- **@enduml**: Diagram end marker

```mermaid
graph TB
    A[PlantUML Diagrams] --> B[Sequence Diagrams]
    A --> C[Use Case Diagrams]
    A --> D[Class Diagrams]
    A --> E[Activity Diagrams]
    A --> F[Component Diagrams]
    A --> G[Other UML Diagrams]
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

## Supported Diagram Types

<DataAnalysisDisplay mode="demo" />

### Sequence Diagrams

Create sequence diagrams:

````markdown
```plantuml
@startuml
Alice -> Bob: Request
Bob --> Alice: Response
@enduml
```
````

### Use Case Diagrams

<OutlineTreeDisplay mode="demo" />

Create use case diagrams:

````markdown
```plantuml
@startuml
User --> (Use Case 1)
User --> (Use Case 2)
@enduml
```
````

### Class Diagrams

<ChartGenerationDisplay mode="demo" />

Create class diagrams:

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

### Activity Diagrams

<DataAnalysisDisplay mode="demo" />

Create activity diagrams:

````markdown
```plantuml
@startuml
start
:Activity 1;
:Activity 2;
stop
@enduml
```
````

### Component Diagrams

<OutlineTreeDisplay mode="demo" />

Create component diagrams:

````markdown
```plantuml
@startuml
[Component 1] --> [Component 2]
@enduml
```
````

### Deployment Diagrams

<ChartGenerationDisplay mode="demo" />

Create deployment diagrams:

````markdown
```plantuml
@startuml
node "Server" {
    [Application]
}
@enduml
```
````

### State Diagrams

<DataAnalysisDisplay mode="demo" />

Create state diagrams:

````markdown
```plantuml
@startuml
[*] --> State1
State1 --> State2
State2 --> [*]
@enduml
```
````

## Sequence Diagrams in Detail

<OutlineTreeDisplay mode="demo" />

### Participants

Define participants:

````markdown
```plantuml
@startuml
participant "User" as User
participant "System" as System
User -> System: Request
@enduml
```
````

### Message Types

Different types of messages can be used:

- **Synchronous message**: `->`
- **Asynchronous message**: `-->`
- **Return message**: `<-` or `<--`
- **Self-call**: `->` pointing to self

### Activation Boxes

Add activation boxes:

````markdown
```plantuml
@startuml
Alice -> Bob: Message
activate Bob
Bob --> Alice: Response
deactivate Bob
@enduml
```
````

## Class Diagrams in Detail

<ChartGenerationDisplay mode="demo" />

### Class Definition

Define classes:

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

### Class Relationships

Represent class relationships:

- **Inheritance**: `<|--` or `--|>`
- **Implementation**: `<|..` or `..|>`
- **Composition**: `*--` or `--*`
- **Aggregation**: `o--` or `--o`
- **Association**: `-->` or `<--`
- **Dependency**: `..>` or `<..`

### Interfaces and Abstract Classes

Define interfaces and abstract classes:

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

## Activity Diagrams in Detail

### Basic Activities

Define activities:

````markdown
```plantuml
@startuml
start
:Activity 1;
:Activity 2;
stop
@enduml
```
````

### Decision Nodes

Add decisions:

````markdown
```plantuml
@startuml
start
if (Condition?) then (Yes)
    :Activity 1;
else (No)
    :Activity 2;
endif
stop
@enduml
```
````

### Loops

Add loops:

````markdown
```plantuml
@startuml
start
repeat
    :Activity;
repeat while (Condition?)
stop
@enduml
```
````

## Styling and Themes

### Theme Settings

You can set themes:

````markdown
```plantuml
@startuml
!theme plain
class MyClass
@enduml
```
````

### Color Settings

You can set colors:

````markdown
```plantuml
@startuml
class MyClass #LightBlue
@enduml
```
````

## Rendering Methods

### Main Process Rendering

PlantUML uses main process rendering:

- **Server-side rendering**: Diagrams are rendered in the main process
- **SVG format**: Rendered as SVG format by default
- **PNG format**: Can be converted to PNG format

### Rendering Performance

PlantUML rendering characteristics:

- **Rendering speed**: Main process rendering is relatively fast
- **Resource usage**: Occupies main process resources during rendering
- **Error handling**: Rendering errors are displayed in the console

## Notes

### Syntax Notes

1. **Required markup**: Must include `@startuml` and `@enduml`
2. **Syntax specification**: Follow the official PlantUML syntax specification
3. **Chinese support**: Chinese can be used, but English identifiers are recommended
4. **Version compatibility**: Pay attention to PlantUML version compatibility

### Rendering Notes

1. **Code extraction**: Ensure correct code extraction to avoid including XML tags
2. **Syntax errors**: Diagrams cannot be rendered if there are syntax errors
3. **Complex diagrams**: Excessively complex diagrams may affect rendering performance
4. **Export compatibility**: Ensure diagrams display correctly in the target format when exporting

## Best Practices

1. **Syntax specification**: Follow the official PlantUML syntax specification
2. **Clear code**: Keep diagram code clear and readable
3. **Use markup**: Always use `@startuml` and `@enduml` markers
4. **Test rendering**: Test diagram rendering after editing
5. **Reference documentation**: Refer to the official PlantUML documentation

## Related Documentation

- [[charts.introduction|Chart Features Introduction]]
- [[charts.mermaid|Mermaid Charts]]
- [[charts.echarts|ECharts Charts]]
