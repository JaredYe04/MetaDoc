# Erweiterte Markdown-Funktionen

## Übersicht

Nachdem Sie die [[markdown.basics|Markdown-Syntax]] und die [[markdown.features|Markdown-Editor-Funktionen]] beherrschen, können Sie erweiterte Syntax und fortgeschrittene Funktionen wie Diagramme, mathematische Formeln, HTML und Attribute verwenden, um die Ausdruckskraft Ihrer Dokumente zu bereichern.

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "insert"}]' />

<SearchReplaceMenu mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["outline", "preview"]' />

## Diagramme und Formeln

### Diagramm-Codeblöcke

Sie können Codeblöcke verwenden, um Diagramme wie Mermaid, PlantUML, ECharts usw. in Ihr Dokument einzufügen. Der Editor rendert diese in Echtzeit:

- **Mermaid**: Flussdiagramme, Sequenzdiagramme, Klassendiagramme, Gantt-Diagramme usw. Siehe [[charts.mermaid|Mermaid-Diagramme]]
- **PlantUML**: UML-Diagramme usw. Siehe [[charts.plantuml|PlantUML-Diagramme]]
- **ECharts**: Datenvisualisierungsdiagramme. Siehe [[charts.echarts|ECharts-Diagramme]]

### Mathematische Formeln

Unterstützung für Inline-Formeln und Blockformeln:

- **Inline-Formeln**: `$...$` oder `\(...\)`
- **Blockformeln**: `$$...$$` oder `\[...\]`
- **Mehrzeilige Formeln**: Verwenden Sie Umgebungen wie `aligned`, `equation` usw.

### LaTeX-Formelkonvertierung

Der Editor kann Teile der LaTeX-Formelsyntax in eine kompatible Markdown/HTML-Form umwandeln, um eine korrekte Darstellung in Nicht-LaTeX-Umgebungen zu ermöglichen.

## Erweiterte Syntax

### Fortgeschrittene Tabellen

- Ausrichtung: Verwenden Sie `:---`, `:---:`, `---:` in der Kopfzeilentrennlinie, um die Links-, Zentriert- oder Rechtsausrichtung festzulegen.
- Zusammenführen: Komplexe Tabellen können über HTML `<table>` realisiert werden.
- Erstellen aus Auswahl: Nachdem Sie Text im Editor ausgewählt haben, können Sie schnell eine Tabelle über das Kontextmenü oder das Menü einfügen.

### Links und Bilder

- **Referenzlinks**: `[Text][Referenzname]`, definieren Sie `[Referenzname]: URL` am Ende des Dokuments.
- **Titel und Attribute**: Einige Renderer unterstützen `(URL "Titel")` oder benutzerdefinierte Attribute.
- **Bildgröße**: Breite und Höhe über HTML `<img>` oder erweiterte Syntax festlegen (abhängig von der Renderer-Unterstützung).

### Fußnoten

Falls die Fußnotenerweiterung vom Renderer unterstützt wird:

```markdown
Haupttext[^1].

[^1]: Fußnotentext.
```

## Zusammenarbeit mit Editor-Funktionen

### Kontextmenü und KI

- **Absatzoptimierung**: Wählen Sie einen Absatz aus und verwenden Sie "Absatz optimieren" im Kontextmenü oder die KI-Verbesserung. Siehe [[features.paragraph-optimization|Absatzoptimierungsfunktion]]
- **Diagramm einfügen**: Fügen Sie über das Kontextmenü oder den KI-Assistenten Codeblöcke für Mermaid/ECharts usw. ein. Siehe [[charts.introduction|Diagrammfunktionen]]

### Wissensdatenbank und Vervollständigung

- Nach Aktivierung der [[knowledge-base.usage|Wissensdatenbank]] können KI-Vervollständigung und Dialoge Inhalte aus dem aktuellen Dokument und der Wissensdatenbank kombinieren.
- Legen Sie in [[ai.completion|KI-Autovervollständigung]] Auslösetaste und maximale Token-Anzahl fest, um die Effizienz beim Verfassen langer Texte zu steigern.

## Best Practices

1. **Grundlagen vor Erweiterungen**: Beherrschen Sie zuerst die [[markdown.basics|Grundlegende Syntax]], bevor Sie Diagramme und Formeln verwenden.
2. **Einheitlicher Stil**: Versuchen Sie, Diagrammtypen und Formelschreibweisen innerhalb eines Dokuments einheitlich zu halten.
3. **Kompatibilität**: Achten Sie bei der Ausgabe als PDF/HTML auf die Kompatibilität von Diagrammen und Formeln.
4. **Leistung**: Zu viele oder zu große Diagramme auf einer einzelnen Seite können die Vorschauleistung beeinträchtigen.

## Verwandte Dokumente

- [[markdown.basics|Markdown-Syntax]]
- [[markdown.features|Markdown-Editor-Funktionen]]
- [[charts.introduction|Diagrammfunktionen]]
- [[ai.completion|KI-Autovervollständigung]]