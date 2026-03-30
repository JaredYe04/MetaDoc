# Gráficos Mermaid

## Visão Geral

Mermaid é uma ferramenta popular para criação de diagramas, adequada para desenhar rapidamente fluxogramas, diagramas de sequência, diagramas de classes, gráficos de Gantt, entre outros. O MetaDoc suporta gráficos Mermaid, permitindo criar vários tipos de diagramas diretamente em documentos Markdown usando a sintaxe Mermaid.

<GraphWindow mode="demo" initialTool="mermaid" />

## Sintaxe Mermaid

<OutlineTreeDisplay mode="demo" />

### Sintaxe Básica

O Mermaid usa uma sintaxe de texto simples para descrever diagramas:

````markdown
```mermaid
graph TD
    A[Início] --> B[Processar]
    B --> C[Fim]
```
````

### Tipos de Gráficos

<ChartGenerationDisplay mode="demo" />

O Mermaid suporta vários tipos de gráficos:

- **Fluxograma** (graph/flowchart)
- **Diagrama de Sequência** (sequenceDiagram)
- **Diagrama de Classes** (classDiagram)
- **Diagrama de Estados** (stateDiagram)
- **Diagrama de Entidade-Relacionamento** (erDiagram)
- **Gráfico de Gantt** (gantt)
- **Gráfico de Pizza** (pie)
- **Gráfico Git** (gitgraph)
- **Mapa de Jornada do Usuário** (journey)
- **Mapa Mental** (mindmap)
- **Linha do Tempo** (timeline)

```mermaid
graph TB
    A[Gráficos Mermaid] --> B[Fluxograma]
    A --> C[Diagrama de Sequência]
    A --> D[Diagrama de Classes]
    A --> E[Diagrama de Estados]
    A --> F[Outros Gráficos]
    B --> G[graph/flowchart]
    C --> H[sequenceDiagram]
    D --> I[classDiagram]
    E --> J[stateDiagram]
    F --> K[Gráfico de Gantt<br/>Gráfico de Pizza<br/>Gráfico Git, etc.]
    style A fill:#f3f4f6,stroke:#374151,stroke-width:2px
    style B fill:#e5e7eb,stroke:#6b7280
    style C fill:#e5e7eb,stroke:#6b7280
    style D fill:#e5e7eb,stroke:#6b7280
    style E fill:#e5e7eb,stroke:#6b7280
    style F fill:#e5e7eb,stroke:#6b7280
```

## Fluxograma

<OutlineTreeDisplay mode="demo" />

### Fluxograma Básico

Criar um fluxograma básico:

````markdown
```mermaid
graph TD
    A[Início] --> B{Decisão}
    B -->|Sim| C[Ação 1]
    B -->|Não| D[Ação 2]
    C --> E[Fim]
    D --> E
```
````

### Direção do Fluxograma

É possível definir a direção do fluxograma:

- **TD**: De cima para baixo (Top Down)
- **BT**: De baixo para cima (Bottom Top)
- **LR**: Da esquerda para a direita (Left Right)
- **RL**: Da direita para a esquerda (Right Left)

### Formas dos Nós

É possível usar diferentes formas de nós:

- **Retângulo**: `[texto]`
- **Retângulo Arredondado**: `(texto)`
- **Losango**: `{texto}`
- **Círculo**: `((texto))`
- **Hexágono**: `{{texto}}`
- **Trapézio**: `[/texto\]`
- **Trapézio Invertido**: `[\texto/]`

## Diagrama de Sequência

<DataAnalysisDisplay mode="demo" />

### Diagrama de Sequência Básico

Criar um diagrama de sequência:

````markdown
```mermaid
sequenceDiagram
    participant A as Usuário
    participant B as Sistema
    A->>B: Solicitação
    B-->>A: Resposta
```
````

### Tipos de Mensagem

É possível usar diferentes tipos de mensagem:

- **Seta de linha sólida**: `->>` Mensagem síncrona
- **Seta de linha tracejada**: `-->>` Mensagem assíncrona
- **Linha sólida**: `->` Mensagem síncrona (sem retorno)
- **Linha tracejada**: `-->` Mensagem assíncrona (sem retorno)

### Caixa de Ativação

É possível adicionar caixas de ativação para representar a atividade do objeto:

````markdown
```mermaid
sequenceDiagram
    participant A
    participant B
    activate A
    A->>B: Mensagem
    activate B
    B-->>A: Resposta
    deactivate B
    deactivate A
```
````

## Diagrama de Classes

<ChartGenerationDisplay mode="demo" />

### Diagrama de Classes Básico

Criar um diagrama de classes:

````markdown
```mermaid
classDiagram
    class Animal {
        +String nome
        +int idade
        +comer()
    }
    class Cachorro {
        +latir()
    }
    Animal <|-- Cachorro
```
````

### Relações de Classe

É possível representar diferentes relações de classe:

- **Herança**: `<|--` ou `--|>`
- **Implementação**: `<|..` ou `..|>`
- **Composição**: `*--` ou `--*`
- **Agregação**: `o--` ou `--o`
- **Associação**: `-->` ou `<--`
- **Dependência**: `..>` ou `<..`

### Membros da Classe

É possível definir os membros da classe:

- **Atributos**: `+nome: String` (público), `-nome: String` (privado)
- **Métodos**: `+metodo()` (público), `-metodo()` (privado)

## Gráfico de Gantt

<OutlineTreeDisplay mode="demo" />

### Gráfico de Gantt Básico

Criar um gráfico de Gantt:

````markdown
```mermaid
gantt
    title Plano do Projeto
    dateFormat YYYY-MM-DD
    section Fase 1
    Tarefa 1 :a1, 2024-01-01, 30d
    Tarefa 2 :a2, after a1, 20d
```
````

### Formato de Data

É possível definir o formato da data:

- **YYYY-MM-DD**: Ano-Mês-Dia
- **MM/DD/YYYY**: Mês/Dia/Ano
- **Outros formatos**: Suporta vários formatos de data

### Relações de Tarefas

É possível definir relações entre tarefas:

- **after**: Após uma determinada tarefa
- **Marco**: Use `milestone` para marcar um marco

## Gráfico de Pizza

<DataAnalysisDisplay mode="demo" />

### Gráfico de Pizza Básico

Criar um gráfico de pizza:

````markdown
```mermaid
pie title Distribuição de Dados
    "Categoria A" : 30
    "Categoria B" : 20
    "Categoria C" : 50
```
````

## Diagrama de Estados

<ChartGenerationDisplay mode="demo" />

### Diagrama de Estados Básico

Criar um diagrama de estados:

````markdown
```mermaid
stateDiagram-v2
    [*] --> Estado1
    Estado1 --> Estado2
    Estado2 --> [*]
```
````

## Mapa Mental

<OutlineTreeDisplay mode="demo" />

### Mapa Mental Básico

Criar um mapa mental:

````markdown
```mermaid
mindmap
  root((Tema Central))
    Ramo1
      Sub-ramo1
      Sub-ramo2
    Ramo2
      Sub-ramo3
```
````

## Considerações

<DataAnalysisDisplay mode="demo" />

### Considerações de Sintaxe

1.  **Delimitação de Strings**: Recomenda-se usar `["..."]` para delimitar strings e evitar erros de escape
2.  **Identificadores**: Em diagramas de classes, evite identificadores com espaços ou caracteres especiais
3.  **Suporte a Chinês**: É possível usar chinês, mas recomenda-se usar identificadores em inglês
4.  **Versão da Sintaxe**: Atenção à versão da sintaxe Mermaid, diferentes versões podem ter diferenças

### Considerações de Renderização

1.  **Erros de Sintaxe**: Se houver erro de sintaxe, o gráfico não será renderizado
2.  **Gráficos Complexos**: Gráficos muito complexos podem afetar o desempenho da renderização
3.  **Compatibilidade do Navegador**: Alguns navegadores podem não suportar certos recursos do Mermaid
4.  **Compatibilidade de Exportação**: Ao exportar, certifique-se de que o gráfico seja exibido corretamente no formato de destino

## Melhores Práticas

1.  **Padrão de Sintaxe**: Siga as especificações oficiais de sintaxe do Mermaid
2.  **Código Claro**: Mantenha o código do diagrama claro e legível
3.  **Testar Renderização**: Após editar, teste o efeito de renderização do gráfico
4.  **Usar Exemplos**: Consulte os exemplos da documentação oficial do Mermaid
5.  **Compatibilidade de Versão**: Atenção à compatibilidade da versão do Mermaid

## Documentação Relacionada

- [[charts.introduction|Introdução aos Gráficos]]
- [[charts.plantuml|Gráficos PlantUML]]
- [[charts.echarts|Gráficos ECharts]]
