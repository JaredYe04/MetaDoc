# Configuração de LLM

## Visão Geral

A configuração de LLM (Modelo de Linguagem Grande) é a configuração central para os recursos de IA do MetaDoc. Ao configurar o LLM, você pode habilitar funções inteligentes como diálogo com IA, revisão por IA, preenchimento automático por IA, entre outros. O MetaDoc suporta vários provedores de serviços de LLM, permitindo que você escolha o modelo mais adequado às suas necessidades.

## Habilitar LLM

<SettingLlmSection mode="demo" />

### Ativar Funções de IA

Na página de configurações de LLM, primeiro é necessário habilitar a função LLM:

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

-   **Configurações Globais**: Interruptor de habilitação do LLM, controle deslizante de ajuste de Temperatura (Temperature), opção de remoção de tags de pensamento (think), permissão padrão para execução de terminal, etc.
-   **Grade de Configurações**: Exibe todas as configurações na forma de cartões, cada um mostrando o nome e o tipo da configuração (como OpenAI, Tongyi Qianwen, DeepSeek, Ollama, etc.); clique em um cartão para alternar para seu uso, a configuração atual é destacada com uma borda verde.
-   **Operações no Cartão**: No lado direito do cartão, é possível "Verificar" a capacidade de fluxo de perguntas/respostas e diálogo dessa configuração; o menu de contexto (botão direito) suporta copiar, editar, exportar e excluir.
-   **Operações Superiores**: No canto superior direito da grade, é possível criar uma nova configuração ou importar configurações em lote a partir de um arquivo.

No modo de demonstração, você pode visualizar o layout da interface de forma interativa, mas as modificações não serão salvas de fato.

Após habilitar o LLM, você poderá usar as seguintes funções de IA:

-   Diálogo com IA
-   Revisão por IA
-   Preenchimento Automático por IA
-   Funções do Assistente de IA
-   Framework de Agentes

**Atenção**:

-   Após habilitar o LLM, algumas funções podem chamar APIs, gerando custos.
-   Recomenda-se configurar o serviço de LLM antes de habilitá-lo.
-   Se as funções de IA não forem necessárias, você pode mantê-las desativadas para economizar recursos.

## Configuração de Temperatura do LLM

<SettingLlmSection mode="demo" />

### Entendendo o Parâmetro Temperatura

A Temperatura (Temperature) é um parâmetro que controla a aleatoriedade do texto gerado pela IA:

-   **Temperatura Baixa (0-0.5)**: Resultados mais determinísticos e consistentes, adequados para cenários que exigem respostas precisas.
-   **Temperatura Média (0.5-1.0)**: Equilíbrio entre criatividade e precisão, adequado para a maioria dos cenários.
-   **Temperatura Alta (1.0-2.0)**: Resultados mais diversos e criativos, adequados para escrita criativa.

### Sugestões de Configuração

-   **Documentação Técnica**: Recomenda-se 0.3-0.5 para garantir precisão do conteúdo.
-   **Escrita Criativa**: Recomenda-se 0.7-1.0 para aumentar a diversidade do conteúdo.
-   **Geração de Código**: Recomenda-se 0.2-0.4 para garantir precisão do código.
-   **Conversação**: Recomenda-se 0.7-0.9 para manter o diálogo natural e fluido.

A configuração de temperatura afeta todas as funções que utilizam o LLM, incluindo diálogo com IA, preenchimento por IA, revisão por IA, etc.

## Remoção Automática de Tags de Raciocínio

### Descrição da Função

Alguns LLMs podem incluir o processo de raciocínio (thinking process) ao gerar conteúdo, geralmente marcado com tags especiais. Ao habilitar a "Remoção Automática de Tags de Raciocínio", o MetaDoc filtrará automaticamente essas tags, mantendo apenas o conteúdo final gerado.

**Cenários de Aplicação**:

-   Uso de LLMs que suportam processo de raciocínio (como alguns modelos de código aberto).
-   Desejo de resultados de saída mais concisos.
-   Não há necessidade de visualizar o processo de pensamento da IA.

**Atenção**:

-   Se o seu LLM não suportar tags de raciocínio, esta opção não terá efeito.
-   Em alguns casos, manter o processo de raciocínio pode ajudar a entender a lógica de decisão da IA.

## Gerenciamento de Configurações

<SettingLlmSection mode="demo" />

### Suporte a Múltiplas Configurações

O MetaDoc suporta a criação de múltiplas configurações de LLM, facilitando o uso de diferentes modelos em diversos cenários:

-   **Configuração de Trabalho**: Para uso diário, utilizando modelos estáveis e confiáveis.
-   **Configuração Experimental**: Para testar novos modelos ou funcionalidades.
-   **Provedores Diferentes**: Crie configurações independentes para diferentes serviços de LLM.

### Alternar Configuração

Na grade de configurações da página de configurações de LLM, você pode:

1.  **Selecionar Configuração**: Clique em qualquer cartão de configuração para alternar para ela.
2.  **Visualizar Informações da Configuração**: Cada cartão exibe o nome e o tipo da configuração.
3.  **Identificar a Configuração Atual**: O cartão da configuração em uso será destacado com uma borda verde.

Após alternar a configuração, todas as funções de IA usarão imediatamente o serviço de LLM da nova configuração. Para editar uma configuração, abra a caixa de diálogo através da opção "Editar Configuração" no menu de contexto (botão direito) do cartão; na caixa de diálogo, faça as modificações e clique em "OK" para salvar, ou em "Cancelar" para não salvar; a interface não distingue mais o estado "Não Salvo".

## Atenção

1.  **Segurança da Chave de API**: Guarde suas chaves de API com segurança e não as compartilhe com outras pessoas.
2.  **Controle de Custos**: O uso de serviços de LLM pode gerar custos; fique atento ao consumo.
3.  **Conexão de Rede**: O uso de APIs externas requer uma conexão de rede estável.
4.  **Backup de Configurações**: Recomenda-se exportar e fazer backup de configurações importantes para evitar perdas.
5.  **Escolha do Modelo**: Diferentes modelos têm capacidades e limitações distintas; escolha de acordo com suas necessidades.

## Documentação Relacionada

-   [[settings.llm-management|Gerenciamento de Configurações de LLM]]
-   [[settings.llm-types|Configuração de Tipos de LLM]]
-   [[ai.chat|Função de Diálogo com IA]]
-   [[ai.completion|Preenchimento Automático por IA]]
-   [[ai.proofread|Função de Revisão por IA]]