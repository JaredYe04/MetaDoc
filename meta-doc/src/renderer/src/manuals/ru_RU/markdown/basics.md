# Синтаксис Markdown

## Обзор

Markdown — это облегченный язык разметки, позволяющий писать документы в удобочитаемом и простом для записи формате обычного текста. MetaDoc предоставляет полную поддержку редактирования и предварительного просмотра Markdown.

<ViewMenuItemsDemo mode="demo" :items='["outline", "preview"]' />

## Основной синтаксис

### Заголовки

Используйте символ `#` для создания заголовков. Количество символов `#` указывает на уровень заголовка:

```markdown
# Заголовок первого уровня

## Заголовок второго уровня

### Заголовок третьего уровня
```

```mermaid
graph LR
    A[Markdown语法] --> B[标题]
    A --> C[段落]
    A --> D[列表]
    A --> E[引用]
    A --> F[代码]
    A --> G[链接和图片]
    A --> H[表格]
    A --> I[数学公式]
    style A fill:#f3f4f6,stroke:#374151,stroke-width:2px
    style B fill:#e5e7eb,stroke:#6b7280
    style C fill:#e5e7eb,stroke:#6b7280
    style D fill:#e5e7eb,stroke:#6b7280
    style E fill:#e5e7eb,stroke:#6b7280
    style F fill:#e5e7eb,stroke:#6b7280
    style G fill:#e5e7eb,stroke:#6b7280
    style H fill:#e5e7eb,stroke:#6b7280
    style I fill:#e5e7eb,stroke:#6b7280
```

### Абзацы

Разделяйте абзацы пустыми строками.

### Списки

**Маркированный список** использует `-`, `*` или `+`:

```markdown
- Пункт 1
- Пункт 2
- Пункт 3
```

**Нумерованный список** использует цифры:

```markdown
1. Первый пункт
2. Второй пункт
3. Третий пункт
```

### Цитаты

Используйте `>` для создания цитаты:

```markdown
> Это текст цитаты
```

### Код

**Встроенный код** использует обратные кавычки:

```markdown
Используйте `console.log()` для вывода содержимого
```

**Блок кода** использует три обратные кавычки:

````markdown
```javascript
function hello() {
  console.log('Hello, World!')
}
```
````

### Ссылки и изображения

**Ссылка**:

```markdown
[Текст ссылки](https://example.com)
```

**Изображение**:

```markdown
![Описание изображения](https://via.placeholder.com/400x200)
```

### Таблицы

```markdown
| Столбец1 | Столбец2 | Столбец3 |
| -------- | -------- | -------- |
| Данные1  | Данные2  | Данные3  |
```

## Математические формулы

### Встроенные формулы

Используйте `$` для обрамления:

```markdown
Это встроенная формула: $E = mc^2$
```

### Блочные формулы

Используйте `$$` для обрамления:

```markdown
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

## Расширенные возможности

### Преобразование формул LaTeX

MetaDoc поддерживает преобразование математических формул из Markdown в формат LaTeX. Подробнее см. [[latex.basics|Синтаксис LaTeX]].

### Поддержка диаграмм

MetaDoc поддерживает различные форматы диаграмм:

- [[charts.mermaid|Диаграммы Mermaid]]
- [[charts.plantuml|Диаграммы PlantUML]]
- [[charts.echarts|Диаграммы ECharts]]

## Связанная документация

- [[markdown.editor|Руководство по использованию редактора Markdown]]
- [[markdown.advanced|Расширенные возможности Markdown]]
- [[markdown.features|Функции редактора Markdown]]
- [[core.editor-basics|Основные операции редактора]]

<LaTeXEditorDemo mode="demo" />

<Outline mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["outline"]' />

<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new", "open", "save"]}]' />

<TitleMenu mode="demo" title="Markdown文档示例" path="1" :tree='{}' />

<ViewMenuItemsDemo mode="demo" :items='["editor", "preview"]' />
