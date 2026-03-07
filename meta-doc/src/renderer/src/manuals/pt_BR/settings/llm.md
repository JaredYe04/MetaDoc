# Configuração de LLM

## Visão Geral

A configuração de LLM (Modelo de Linguagem Grande) é a configuração central dos recursos de IA do MetaDoc. Ao configurar o LLM, você pode habilitar funcionalidades inteligentes como diálogo com IA, revisão por IA, preenchimento automático por IA, entre outras. O MetaDoc suporta vários provedores de serviços de LLM, permitindo que você escolha o modelo mais adequado às suas necessidades.

## Habilitar LLM

<SettingLlmSection mode="demo" />

### Ativar Funcionalidades de IA

Na página de configurações de LLM, primeiro é necessário habilitar a funcionalidade de LLM:

1.  Encontre o interruptor "Habilitar LLM"
2.  Mude o interruptor para o estado "Habilitado"
3.  O sistema carregará automaticamente a configuração padrão de LLM

Você pode acessar as configurações através da barra de menu superior:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Interface de Configuração de LLM

A figura abaixo mostra as principais áreas funcionais da página de configuração de LLM:

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

A figura acima mostra os principais componentes da interface de configuração de LLM:

-   **Configurações Globais**: Interruptor de habilitação do LLM, controle deslizante de ajuste de Temperatura (Temperature), opção de remoção de tags de pensamento (think)
-   **Lista de Configurações**: Exibe à esquerda todos os provedores de LLM configurados (como OpenAI, Ollama, Gemini, etc.)
-   **Detalhes da Configuração**: Exibe à direita os parâmetros detalhados da configuração selecionada (endereço da API, seleção do modelo, limite de Tokens, etc.)
-   **Área de Teste**: Permite testar se a configuração atual está funcionando corretamente
-   **Botões de Ação**: Funcionalidades como criar nova configuração, importar/exportar configuração, excluir configuração

No modo de demonstração, você pode visualizar o layout da interface de forma interativa, mas as alterações não serão salvas de fato.

Após habilitar o LLM, você poderá usar as seguintes funcionalidades de IA:

-   Diálogo com IA
-   Revisão por IA
-   Preenchimento Automático por IA
-   Funcionalidades do Assistente de IA
-   Framework de Agentes

**Atenção**:

-   Após habilitar o LLM, algumas funcionalidades podem chamar a API, gerando custos
-   Recomenda-se configurar o serviço de LLM antes de habilitá-lo
-   Se as funcionalidades de IA não forem necessárias, você pode mantê-las desativadas para economizar recursos

## Configuração de Temperatura do LLM

<SettingLlmSection mode="demo" />

### Entendendo o Parâmetro Temperatura

A Temperatura (Temperature) é um parâmetro que controla a aleatoriedade do texto gerado pela IA:

-   **Temperatura Baixa (0-0.5)**: Resultados mais determinísticos e consistentes, adequados para cenários que exigem respostas precisas
-   **Temperatura Média (0.5-1.0)**: Equilíbrio entre criatividade e precisão, adequada para a maioria dos cenários
-   **Temperatura Alta (1.0-2.0)**: Resultados mais diversos e criativos, adequados para escrita criativa

### Recomendações de Configuração

-   **Documentação Técnica**: Recomenda-se 0.3-0.5, para garantir a precisão do conteúdo
-   **Escrita Criativa**: Recomenda-se 0.7-1.0, para aumentar a diversidade do conteúdo
-   **Geração de Código**: Recomenda-se 0.2-0.4, para garantir a precisão do código
-   **Diálogo/Conversação**: Recomenda-se 0.7-0.9, para manter a conversa natural e fluida

A configuração de temperatura afeta todas as funcionalidades que utilizam o LLM, incluindo diálogo com IA, preenchimento automático por IA, revisão por IA, etc.

## Remoção Automática de Tags de Raciocínio

### Descrição da Funcionalidade

Alguns LLMs podem incluir o processo de raciocínio (thinking process) ao gerar conteúdo, geralmente marcado com tags especiais. Ao habilitar a opção "Remover automaticamente tags de raciocínio", o MetaDoc filtrará automaticamente essas tags, mantendo apenas o conteúdo final gerado.

**Cenários de Aplicação**:

-   Uso de LLMs que suportam processo de raciocínio (como alguns modelos de código aberto)
-   Desejo de uma saída mais concisa
-   Não há necessidade de visualizar o processo de pensamento da IA

**Atenção**:

-   Se o seu LLM não suportar tags de raciocínio, esta opção não terá efeito
-   Em alguns casos, manter o processo de raciocínio pode ajudar a entender a lógica de decisão da IA

## Gerenciamento de Configurações

<SettingLlmSection mode="demo" />

### Suporte a Múltiplas Configurações

O MetaDoc suporta a criação de múltiplas configurações de LLM, permitindo que você use modelos diferentes em diversos cenários:

-   **Configuração de Trabalho**: Para uso diário, utilizando modelos estáveis e confiáveis
-   **Configuração Experimental**: Para testar novos modelos ou funcionalidades
-   **Provedores Diferentes**: Criar configurações independentes para diferentes serviços de LLM

### Alternar entre Configurações

Na lista de configurações à esquerda da página de configurações de LLM, você pode:

1.  **Selecionar Configuração**: Clique em um item da lista para alternar para essa configuração
2.  **Visualizar Informações da Configuração**: O nome da configuração é exibido na lista
3.  **Identificar a Configuração Atual**: A configuração em uso é destacada

Após alternar a configuração, todas as funcionalidades de IA usarão imediatamente o serviço de LLM da nova configuração.

## Indicador de Status da Configuração

<SettingLlmSection mode="demo" />

### Alterações Não Salvas

Quando você modifica uma configuração mas ainda não a salvou, o sistema exibirá um aviso "Alterações não salvas":

-   Um rótulo de aviso será exibido ao lado do nome da configuração
-   A barra de status da área de trabalho exibirá "Há alterações não salvas"
-   É necessário clicar no botão "Salvar Alterações" para salvar as modificações

### Salvar Alterações

Após modificar uma configuração, lembre-se de clicar no botão "Salvar Alterações":

1.  Clique no botão "Salvar Alterações" no canto superior direito da área de trabalho
2.  O sistema salvará todas as modificações da configuração atual
3.  Após o salvamento bem-sucedido, o status será atualizado para "Todas as alterações foram salvas"

### Descartar Alterações

Se você não quiser salvar as modificações atuais:

1.  Clique no botão "Descartar Alterações"
2.  O sistema reverterá para o estado do último salvamento
3.  Todas as modificações não salvas serão descartadas

## Atenção

1.  **Segurança da Chave de API**: Guarde sua chave de API com segurança e não a compartilhe com outras pessoas
2.  **Controle de Custos**: O uso de serviços de LLM pode gerar custos; fique atento ao consumo
3.  **Conexão de Rede**: O uso de APIs externas requer uma conexão de rede estável
4.  **Backup de Configurações**: Recomenda-se exportar e fazer backup de configurações importantes para evitar perdas
5.  **Seleção do Modelo**: Diferentes modelos têm capacidades e limitações distintas; escolha de acordo com sua necessidade

## Documentação Relacionada

-   [[settings.llm-management|Gerenciamento de Configuração de LLM]]
-   [[settings.llm-types|Configuração de Tipos de LLM]]
-   [[ai.chat|Funcionalidade de Diálogo com IA]]
-   [[ai.completion|Preenchimento Automático por IA]]
-   [[ai.proofread|Funcionalidade de Revisão por IA]]