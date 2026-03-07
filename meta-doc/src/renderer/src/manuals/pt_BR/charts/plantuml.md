# Diagramas PlantUML

## Visão Geral

PlantUML é uma ferramenta profissional de modelagem UML que suporta vários tipos de diagramas UML. O MetaDoc suporta diagramas PlantUML, permitindo a criação de diagramas UML profissionais usando a sintaxe PlantUML em documentos Markdown.

<GraphWindow mode="demo" initialTool="plantuml" />

## Sintaxe PlantUML

<OutlineTreeDisplay mode="demo" />

### Sintaxe Básica

O PlantUML usa marcações e sintaxe específicas:

````markdown
```plantuml
@startuml
Alice -> Bob: Mensagem
@enduml
```
````

### Marcadores Obrigatórios

<ChartGenerationDisplay mode="demo" />

Os diagramas PlantUML devem conter:

- **@startuml**: Marcador de início do diagrama
- **@enduml**: Marcador de fim do diagrama

```mermaid
graph TB
    A[Diagrama PlantUML] --> B[Diagrama de Sequência]
    A --> C[Diagrama de Casos de Uso]
    A --> D[Diagrama de Classes]
    A --> E[Diagrama de Atividades]
    A --> F[Diagrama de Componentes]
    A --> G[Outros Diagramas UML]
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

## Tipos de Diagramas Suportados

<DataAnalysisDisplay mode="demo" />

### Diagrama de Sequência

Criar diagrama de sequência:

````markdown
```plantuml
@startuml
Alice -> Bob: Solicitação
Bob --> Alice: Resposta
@enduml
```
````

### Diagrama de Casos de Uso

<OutlineTreeDisplay mode="demo" />

Criar diagrama de casos de uso:

````markdown
```plantuml
@startuml
Usuário --> (Caso de Uso 1)
Usuário --> (Caso de Uso 2)
@enduml
```
````

### Diagrama de Classes

<ChartGenerationDisplay mode="demo" />

Criar diagrama de classes:

````markdown
```plantuml
@startuml
class Animal {
    +nome: String
    +comer()
}
class Cachorro {
    +latir()
}
Animal <|-- Cachorro
@enduml
```
````

### Diagrama de Atividades

<DataAnalysisDisplay mode="demo" />

Criar diagrama de atividades:

````markdown
```plantuml
@startuml
start
:Atividade 1;
:Atividade 2;
stop
@enduml
```
````

### Diagrama de Componentes

<OutlineTreeDisplay mode="demo" />

Criar diagrama de componentes:

````markdown
```plantuml
@startuml
[Componente 1] --> [Componente 2]
@enduml
```
````

### Diagrama de Implantação

<ChartGenerationDisplay mode="demo" />

Criar diagrama de implantação:

````markdown
```plantuml
@startuml
node "Servidor" {
    [Aplicação]
}
@enduml
```
````

### Diagrama de Estados

<DataAnalysisDisplay mode="demo" />

Criar diagrama de estados:

````markdown
```plantuml
@startuml
[*] --> Estado1
Estado1 --> Estado2
Estado2 --> [*]
@enduml
```
````

## Detalhes do Diagrama de Sequência

<OutlineTreeDisplay mode="demo" />

### Participantes

Definir participantes:

````markdown
```plantuml
@startuml
participant "Usuário" as User
participant "Sistema" as System
User -> System: Solicitação
@enduml
```
````

### Tipos de Mensagem

É possível usar diferentes tipos de mensagem:

- **Mensagem síncrona**: `->`
- **Mensagem assíncrona**: `-->`
- **Mensagem de retorno**: `<-` ou `<--`
- **Auto-chamada**: `->` apontando para si mesmo

### Caixa de Ativação

Adicionar caixa de ativação:

````markdown
```plantuml
@startuml
Alice -> Bob: Mensagem
activate Bob
Bob --> Alice: Resposta
deactivate Bob
@enduml
```
````

## Detalhes do Diagrama de Classes

<ChartGenerationDisplay mode="demo" />

### Definição de Classe

Definir classe:

````markdown
```plantuml
@startuml
class MinhaClasse {
    +campoPublico: String
    -campoPrivado: int
    +metodoPublico()
    -metodoPrivado()
}
@enduml
```
````

### Relacionamentos de Classe

Representar relacionamentos de classe:

- **Herança**: `<|--` ou `--|>`
- **Implementação**: `<|..` ou `..|>`
- **Composição**: `*--` ou `--*`
- **Agregação**: `o--` ou `--o`
- **Associação**: `-->` ou `<--`
- **Dependência**: `..>` ou `<..`

### Interfaces e Classes Abstratas

Definir interfaces e classes abstratas:

````markdown
```plantuml
@startuml
interface Interface {
    +metodo()
}
abstract class ClasseAbstrata {
    +metodoAbstrato()
}
@enduml
```
````

## Detalhes do Diagrama de Atividades

### Atividades Básicas

Definir atividades:

````markdown
```plantuml
@startuml
start
:Atividade 1;
:Atividade 2;
stop
@enduml
```
````

### Nó de Decisão

Adicionar decisão:

````markdown
```plantuml
@startuml
start
if (Condição?) then (Sim)
    :Atividade 1;
else (Não)
    :Atividade 2;
endif
stop
@enduml
```
````

### Loop

Adicionar loop:

````markdown
```plantuml
@startuml
start
repeat
    :Atividade;
repeat while (Condição?)
stop
@enduml
```
````

## Estilos e Temas

### Configuração de Tema

É possível configurar o tema:

````markdown
```plantuml
@startuml
!theme plain
class MinhaClasse
@enduml
```
````

### Configuração de Cores

É possível configurar cores:

````markdown
```plantuml
@startuml
class MinhaClasse #LightBlue
@enduml
```
````

## Métodos de Renderização

### Renderização no Processo Principal

O PlantUML usa renderização no processo principal:

- **Renderização no servidor**: Renderiza o diagrama no processo principal
- **Formato SVG**: Renderizado como SVG por padrão
- **Formato PNG**: Pode ser convertido para formato PNG

### Desempenho de Renderização

Características da renderização PlantUML:

- **Velocidade de renderização**: Renderização no processo principal é mais rápida
- **Uso de recursos**: Consome recursos do processo principal durante a renderização
- **Tratamento de erros**: Erros de renderização são exibidos no console

## Observações

### Observações sobre a Sintaxe

1. **Marcadores obrigatórios**: Deve conter `@startuml` e `@enduml`
2. **Padrão de sintaxe**: Seguir a especificação de sintaxe oficial do PlantUML
3. **Suporte a chinês**: É possível usar chinês, mas recomenda-se usar identificadores em inglês
4. **Compatibilidade de versão**: Atenção à compatibilidade da versão do PlantUML

### Observações sobre a Renderização

1. **Extração de código**: Garantir que a extração do código esteja correta, evitando incluir tags XML
2. **Erros de sintaxe**: Diagramas com erros de sintaxe não serão renderizados
3. **Diagramas complexos**: Diagramas muito complexos podem afetar o desempenho da renderização
4. **Compatibilidade na exportação**: Garantir que o diagrama seja exibido corretamente no formato de destino ao exportar

## Melhores Práticas

1. **Padrão de sintaxe**: Seguir a especificação de sintaxe oficial do PlantUML
2. **Código claro**: Manter o código do diagrama claro e legível
3. **Usar marcadores**: Sempre usar os marcadores `@startuml` e `@enduml`
4. **Testar renderização**: Testar o efeito de renderização do diagrama após editar
5. **Documentação de referência**: Consultar a documentação oficial do PlantUML

## Documentação Relacionada

- [[charts.introduction|Introdução aos Recursos de Gráficos]]
- [[charts.mermaid|Diagramas Mermaid]]
- [[charts.echarts|Diagramas ECharts]]