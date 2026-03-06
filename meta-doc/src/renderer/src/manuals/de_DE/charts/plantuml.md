# PlantUML-Diagramme

## Übersicht

PlantUML ist ein professionelles UML-Modellierungswerkzeug, das verschiedene UML-Diagrammtypen unterstützt. MetaDoc unterstützt PlantUML-Diagramme, sodass Sie mit PlantUML-Syntax professionelle UML-Diagramme in Markdown-Dokumenten erstellen können.

<GraphWindow mode="demo" initialTool="plantuml" />

## PlantUML-Syntax

<OutlineTreeDisplay mode="demo" />

### Grundlegende Syntax

PlantUML verwendet spezifische Markierungen und Syntax:

````markdown
```plantuml
@startuml
Alice -> Bob: Nachricht
@enduml
```
````

### Erforderliche Markierungen

<ChartGenerationDisplay mode="demo" />

PlantUML-Diagramme müssen enthalten:

- **@startuml**: Markierung für Diagrammstart
- **@enduml**: Markierung für Diagrammende

```mermaid
graph TB
    A[PlantUML-Diagramm] --> B[Sequenzdiagramm]
    A --> C[Anwendungsfalldiagramm]
    A --> D[Klassendiagramm]
    A --> E[Aktivitätsdiagramm]
    A --> F[Komponentendiagramm]
    A --> G[Andere UML-Diagramme]
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

## Unterstützte Diagrammtypen

<DataAnalysisDisplay mode="demo" />

### Sequenzdiagramm

Erstellen eines Sequenzdiagramms:

````markdown
```plantuml
@startuml
Alice -> Bob: Anfrage
Bob --> Alice: Antwort
@enduml
```
````

### Anwendungsfalldiagramm

<OutlineTreeDisplay mode="demo" />

Erstellen eines Anwendungsfalldiagramms:

````markdown
```plantuml
@startuml
Benutzer --> (Anwendungsfall 1)
Benutzer --> (Anwendungsfall 2)
@enduml
```
````

### Klassendiagramm

<ChartGenerationDisplay mode="demo" />

Erstellen eines Klassendiagramms:

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

### Aktivitätsdiagramm

<DataAnalysisDisplay mode="demo" />

Erstellen eines Aktivitätsdiagramms:

````markdown
```plantuml
@startuml
start
:Aktivität 1;
:Aktivität 2;
stop
@enduml
```
````

### Komponentendiagramm

<OutlineTreeDisplay mode="demo" />

Erstellen eines Komponentendiagramms:

````markdown
```plantuml
@startuml
[Komponente 1] --> [Komponente 2]
@enduml
```
````

### Verteilungsdiagramm

<ChartGenerationDisplay mode="demo" />

Erstellen eines Verteilungsdiagramms:

````markdown
```plantuml
@startuml
node "Server" {
    [Anwendung]
}
@enduml
```
````

### Zustandsdiagramm

<DataAnalysisDisplay mode="demo" />

Erstellen eines Zustandsdiagramms:

````markdown
```plantuml
@startuml
[*] --> Zustand1
Zustand1 --> Zustand2
Zustand2 --> [*]
@enduml
```
````

## Sequenzdiagramm im Detail

<OutlineTreeDisplay mode="demo" />

### Teilnehmer

Teilnehmer definieren:

````markdown
```plantuml
@startuml
participant "Benutzer" as User
participant "System" as System
User -> System: Anfrage
@enduml
```
````

### Nachrichtentypen

Verschiedene Nachrichtentypen können verwendet werden:

- **Synchrone Nachricht**: `->`
- **Asynchrone Nachricht**: `-->`
- **Rückantwort**: `<-` oder `<--`
- **Selbstaufruf**: `->` auf sich selbst zeigen

### Aktivierungsbalken

Aktivierungsbalken hinzufügen:

````markdown
```plantuml
@startuml
Alice -> Bob: Nachricht
activate Bob
Bob --> Alice: Antwort
deactivate Bob
@enduml
```
````

## Klassendiagramm im Detail

<ChartGenerationDisplay mode="demo" />

### Klassendefinition

Klasse definieren:

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

### Klassenbeziehungen

Klassenbeziehungen darstellen:

- **Vererbung**: `<|--` oder `--|>`
- **Implementierung**: `<|..` oder `..|>`
- **Komposition**: `*--` oder `--*`
- **Aggregation**: `o--` oder `--o`
- **Assoziation**: `-->` oder `<--`
- **Abhängigkeit**: `..>` oder `<..`

### Schnittstellen und abstrakte Klassen

Schnittstellen und abstrakte Klassen definieren:

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

## Aktivitätsdiagramm im Detail

### Grundlegende Aktivitäten

Aktivitäten definieren:

````markdown
```plantuml
@startuml
start
:Aktivität 1;
:Aktivität 2;
stop
@enduml
```
````

### Entscheidungsknoten

Entscheidung hinzufügen:

````markdown
```plantuml
@startuml
start
if (Bedingung?) then (ja)
    :Aktivität 1;
else (nein)
    :Aktivität 2;
endif
stop
@enduml
```
````

### Schleifen

Schleife hinzufügen:

````markdown
```plantuml
@startuml
start
repeat
    :Aktivität;
repeat while (Bedingung?)
stop
@enduml
```
````

## Stile und Themen

### Theme-Einstellung

Theme kann eingestellt werden:

````markdown
```plantuml
@startuml
!theme plain
class MyClass
@enduml
```
````

### Farbeinstellung

Farben können eingestellt werden:

````markdown
```plantuml
@startuml
class MyClass #LightBlue
@enduml
```
````

## Render-Modi

### Rendering im Hauptprozess

PlantUML verwendet Rendering im Hauptprozess:

- **Serverseitiges Rendering**: Diagramme werden im Hauptprozess gerendert
- **SVG-Format**: Standardmäßig als SVG gerendert
- **PNG-Format**: Kann in PNG konvertiert werden

### Render-Performance

PlantUML-Rendering-Eigenschaften:

- **Render-Geschwindigkeit**: Rendering im Hauptprozess ist relativ schnell
- **Ressourcenverbrauch**: Belegt Hauptprozessressourcen während des Renderings
- **Fehlerbehandlung**: Renderfehler werden in der Konsole angezeigt

## Hinweise

### Syntax-Hinweise

1.  **Erforderliche Markierungen**: Muss `@startuml` und `@enduml` enthalten
2.  **Syntax-Standard**: Offiziellen PlantUML-Syntaxstandard einhalten
3.  **Unterstützung für Chinesisch**: Chinesisch kann verwendet werden, aber englische Bezeichner werden empfohlen
4.  **Versionskompatibilität**: Auf PlantUML-Versionskompatibilität achten

### Render-Hinweise

1.  **Code-Extraktion**: Sicherstellen, dass Code korrekt extrahiert wird, XML-Tags vermeiden
2.  **Syntaxfehler**: Bei Syntaxfehlern kann das Diagramm nicht gerendert werden
3.  **Komplexe Diagramme**: Übermäßig komplexe Diagramme können die Render-Performance beeinträchtigen
4.  **Export-Kompatibilität**: Beim Export sicherstellen, dass Diagramme im Zielformat korrekt angezeigt werden

## Best Practices

1.  **Syntax-Standard**: Offiziellen PlantUML-Syntaxstandard einhalten
2.  **Klare Code-Struktur**: Diagrammcode klar und lesbar halten
3.  **Markierungen verwenden**: Immer `@startuml` und `@enduml` Markierungen verwenden
4.  **Rendering testen**: Nach der Bearbeitung das Diagramm-Rendering testen
5.  **Dokumentation konsultieren**: Auf die offizielle PlantUML-Dokumentation verweisen

## Verwandte Dokumente

- [[charts.introduction|Diagrammfunktionen]]
- [[charts.mermaid|Mermaid-Diagramme]]
- [[charts.echarts|ECharts-Diagramme]]