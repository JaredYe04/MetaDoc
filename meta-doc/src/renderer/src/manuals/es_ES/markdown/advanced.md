# Funciones avanzadas de Markdown

## Descripción general

Después de dominar la [[markdown.basics|sintaxis de Markdown]] y las [[markdown.features|funciones del editor de Markdown]], puede utilizar aún más la sintaxis extendida y características avanzadas, como diagramas, fórmulas matemáticas, HTML y atributos, para enriquecer la expresividad de sus documentos.

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "insert"}]' />

<SearchReplaceMenu mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["outline", "preview"]' />

## Diagramas y fórmulas

### Bloques de código para diagramas

Puede insertar diagramas como Mermaid, PlantUML, ECharts, etc., en el documento utilizando bloques de código, y el editor los renderizará en tiempo real:

- **Mermaid**: Diagramas de flujo, diagramas de secuencia, diagramas de clases, diagramas de Gantt, etc. Consulte [[charts.mermaid|Diagramas Mermaid]]
- **PlantUML**: Diagramas UML, etc. Consulte [[charts.plantuml|Diagramas PlantUML]]
- **ECharts**: Diagramas de visualización de datos. Consulte [[charts.echarts|Diagramas ECharts]]

### Fórmulas matemáticas

Soporta fórmulas en línea y fórmulas a nivel de bloque:

- **Fórmulas en línea**: `$...$` o `\(...\)`
- **Fórmulas de bloque**: `$$...$$` o `\[...\]`
- **Fórmulas multilínea**: Utilice entornos como `aligned`, `equation`, etc.

### Conversión de fórmulas LaTeX

El editor puede convertir parte de la sintaxis de fórmulas LaTeX a un formato Markdown/HTML compatible, facilitando su visualización correcta en entornos que no son LaTeX.

## Sintaxis extendida

### Tablas avanzadas

- **Alineación**: Utilice `:---`, `:---:`, `---:` en la fila separadora del encabezado para establecer alineación izquierda, centrada o derecha.
- **Combinación**: Las tablas complejas se pueden implementar mediante HTML `<table>`.
- **Crear desde selección**: Después de seleccionar texto en el editor, puede insertar rápidamente una tabla mediante el clic derecho o el menú.

### Enlaces e imágenes

- **Enlaces de referencia**: `[texto][nombre-de-referencia]`, definiendo `[nombre-de-referencia]: URL` al final del texto.
- **Títulos y atributos**: Algunos renderizadores soportan `(url "título")` o atributos personalizados.
- **Dimensiones de imagen**: Establezca el ancho y alto mediante HTML `<img>` o sintaxis extendida (según lo admita el renderizador).

### Notas al pie

Si el renderizador soporta la extensión de notas al pie:

```markdown
Contenido principal[^1].

[^1]: Contenido de la nota al pie.
```

## Integración con las funciones del editor

### Clic derecho e IA

- **Optimización de párrafos**: Seleccione un párrafo y use la opción "Optimizar párrafo" del clic derecho o el pulido con IA. Consulte [[features.paragraph-optimization|Función de optimización de párrafos]]
- **Insertar diagramas**: Inserte bloques de código como Mermaid/ECharts a través del clic derecho o el asistente de IA. Consulte [[charts.introduction|Introducción a los diagramas]]

### Base de conocimiento y autocompletado

- Al habilitar la [[knowledge-base.usage|base de conocimiento]], el autocompletado y el diálogo con IA pueden combinar el contenido del documento actual con el de la base de conocimiento.
- Configure la tecla de activación y el máximo de Tokens en el [[ai.completion|Autocompletado con IA]] para mejorar la eficiencia en la escritura de textos largos.

## Mejores prácticas

1. **Primero lo básico, luego las extensiones**: Domine primero la [[markdown.basics|sintaxis básica]] antes de usar diagramas y fórmulas.
2. **Estilo uniforme**: Intente mantener un estilo uniforme para los tipos de diagramas y la escritura de fórmulas dentro de un mismo documento.
3. **Compatibilidad**: Preste atención a la compatibilidad de diagramas y fórmulas al exportar a PDF/HTML.
4. **Rendimiento**: Demasiados diagramas o diagramas demasiado grandes en una sola página pueden afectar el rendimiento de la vista previa.

## Documentación relacionada

- [[markdown.basics|Sintaxis de Markdown]]
- [[markdown.features|Funciones del editor de Markdown]]
- [[charts.introduction|Introducción a los diagramas]]
- [[ai.completion|Autocompletado con IA]]
