# Funcionalidades Avançadas do Markdown

## Visão Geral

Após dominar a [[markdown.basics|Sintaxe Markdown]] e os [[markdown.features|Recursos do Editor Markdown]], você pode utilizar ainda mais a sintaxe estendida e características avançadas, como diagramas, fórmulas matemáticas, HTML e atributos, para enriquecer a expressividade dos seus documentos.

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "insert"}]' />

<SearchReplaceMenu mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["outline", "preview"]' />

## Diagramas e Fórmulas

### Blocos de Código para Diagramas

Você pode inserir diagramas como Mermaid, PlantUML, ECharts, etc., no documento usando blocos de código. O editor renderiza em tempo real:

- **Mermaid**: Fluxogramas, diagramas de sequência, diagramas de classes, gráficos de Gantt, etc. Consulte [[charts.mermaid|Diagramas Mermaid]]
- **PlantUML**: Diagramas UML, etc. Consulte [[charts.plantuml|Diagramas PlantUML]]
- **ECharts**: Gráficos de visualização de dados. Consulte [[charts.echarts|Gráficos ECharts]]

### Fórmulas Matemáticas

Suporte para fórmulas inline e em bloco:

- **Fórmulas inline**: `$...$` ou `\(...\)`
- **Fórmulas em bloco**: `$$...$$` ou `\[...\]`
- **Fórmulas multilinha**: Use ambientes como `aligned`, `equation`, etc.

### Conversão de Fórmulas LaTeX

O editor pode converter parte da sintaxe de fórmulas LaTeX para um formato Markdown/HTML compatível, facilitando a exibição correta em ambientes que não são LaTeX.

## Sintaxe Estendida

### Tabelas Avançadas

- Alinhamento: Use `:---`, `:---:`, `---:` na linha separadora do cabeçalho para definir alinhamento à esquerda, centralizado ou à direita.
- Mesclagem: Tabelas complexas podem ser implementadas via HTML `<table>`.
- Criar a partir da seleção: Após selecionar texto no editor, você pode inserir uma tabela rapidamente via clique direito ou menu.

### Links e Imagens

- **Links de referência**: `[texto][nome-da-referência]`, definindo `[nome-da-referência]: URL` no final do texto.
- **Títulos e atributos**: Alguns renderizadores suportam `(url "título")` ou atributos personalizados.
- **Dimensões da imagem**: Defina largura e altura via HTML `<img>` ou sintaxe estendida (dependendo do suporte do renderizador).

### Notas de Rodapé

Se o renderizador suportar a extensão de notas de rodapé:

```markdown
Conteúdo principal[^1].

[^1]: Conteúdo da nota de rodapé.
```

## Integração com Recursos do Editor

### Clique Direito e IA

- **Otimização de parágrafo**: Selecione um parágrafo e use "Otimizar parágrafo" no clique direito ou o polimento por IA. Consulte [[features.paragraph-optimization|Recurso de Otimização de Parágrafo]]
- **Inserir diagrama**: Insira blocos de código Mermaid/ECharts, etc., via clique direito ou assistente de IA. Consulte [[charts.introduction|Introdução aos Diagramas]]

### Base de Conhecimento e Auto-completar

- Com a [[knowledge-base.usage|Base de Conhecimento]] ativada, o auto-completar e o diálogo de IA podem incorporar o conteúdo do documento atual e da base de conhecimento.
- Configure a tecla de ativação e o Token máximo no [[ai.completion|Auto-completar por IA]] para aumentar a eficiência na escrita de textos longos.

## Melhores Práticas

1. **Primeiro o básico, depois a extensão**: Domine primeiro a [[markdown.basics|sintaxe básica]] antes de usar diagramas e fórmulas.
2. **Estilo consistente**: Procure manter os tipos de diagrama e o estilo de escrita de fórmulas consistentes dentro do mesmo documento.
3. **Compatibilidade**: Ao exportar para PDF/HTML, preste atenção à compatibilidade dos diagramas e fórmulas.
4. **Desempenho**: Muitos diagramas ou diagramas muito grandes em uma única página podem afetar o desempenho da visualização.

## Documentação Relacionada

- [[markdown.basics|Sintaxe Markdown]]
- [[markdown.features|Recursos do Editor Markdown]]
- [[charts.introduction|Introdução aos Diagramas]]
- [[ai.completion|Auto-completar por IA]]
