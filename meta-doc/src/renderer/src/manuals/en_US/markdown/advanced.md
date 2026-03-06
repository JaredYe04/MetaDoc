# Advanced Markdown Features

## Overview

After mastering [[markdown.basics|Markdown Syntax]] and [[markdown.features|Markdown Editor Features]], you can further utilize extended syntax and advanced features such as charts, mathematical formulas, HTML, and attributes to enrich your document's expressiveness.

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "insert"}]' />

<SearchReplaceMenu mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["outline", "preview"]' />

## Charts and Formulas

### Chart Code Blocks

You can insert charts such as Mermaid, PlantUML, and ECharts into your document using code blocks, which the editor will render in real-time:

- **Mermaid**: Flowcharts, sequence diagrams, class diagrams, Gantt charts, etc. Refer to [[charts.mermaid|Mermaid Charts]]
- **PlantUML**: UML diagrams, etc. Refer to [[charts.plantuml|PlantUML Charts]]
- **ECharts**: Data visualization charts. Refer to [[charts.echarts|ECharts Charts]]

### Mathematical Formulas

Supports inline formulas and block-level formulas:

- **Inline Formula**: `$...$` or `\(...\)`
- **Block Formula**: `$$...$$` or `\[...\]`
- **Multi-line Formulas**: Use environments like `aligned`, `equation`, etc.

### LaTeX Formula Conversion

The editor can convert some LaTeX formula syntax into compatible Markdown/HTML forms, facilitating correct display in non-LaTeX environments.

## Extended Syntax

### Advanced Tables

- Alignment: Use `:---`, `:---:`, `---:` in the header separator row to set left, center, and right alignment.
- Merging: Complex tables can be implemented via HTML `<table>`.
- Create from Selection: After selecting text in the editor, you can quickly insert a table via right-click or the menu.

### Links and Images

- **Reference-style Links**: `[text][reference]`, define `[reference]: URL` at the end of the document.
- **Titles and Attributes**: Some renderers support `(url "title")` or custom attributes.
- **Image Dimensions**: Set width and height via HTML `<img>` or extended syntax (depending on renderer support).

### Footnotes

If the renderer supports the footnote extension:

```markdown
Main text content[^1].

[^1]: Footnote content.
```

## Integration with Editor Features

### Right-click and AI

- **Paragraph Optimization**: Select a paragraph and use the right-click "Paragraph Optimization" or AI polishing. Refer to [[features.paragraph-optimization|Paragraph Optimization Feature]]
- **Insert Charts**: Insert Mermaid/ECharts code blocks via right-click or AI assistant. Refer to [[charts.introduction|Chart Features Introduction]]

### Knowledge Base and Completion

- After enabling the [[knowledge-base.usage|Knowledge Base]], AI completion and conversations can incorporate content from the current document and the knowledge base.
- Configure the trigger key and maximum tokens in [[ai.completion|AI Auto-completion]] to improve efficiency in long-form writing.

## Best Practices

1. **Master Basics First**: Become proficient with [[markdown.basics|Basic Syntax]] before using charts and formulas.
2. **Maintain Consistent Style**: Strive for consistency in chart types and formula notation within the same document.
3. **Consider Compatibility**: Pay attention to chart and formula compatibility when exporting to PDF/HTML.
4. **Mind Performance**: Too many or overly large charts on a single page may affect preview performance.

## Related Documents

- [[markdown.basics|Markdown Syntax]]
- [[markdown.features|Markdown Editor Features]]
- [[charts.introduction|Chart Features Introduction]]
- [[ai.completion|AI Auto-completion]]