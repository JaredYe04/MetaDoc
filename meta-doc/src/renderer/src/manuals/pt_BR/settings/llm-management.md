# Gerenciamento de Configurações de LLM

## Visão Geral

O gerenciamento de configurações de LLM permite que você crie, edite, exclua e gerencie múltiplas configurações de LLM. As configurações são exibidas na forma de **cartões em grade**, semelhante a um cliente de agentes: cada cartão mostra o nome e o tipo da configuração, clicar nele alterna para seu uso, suporta verificação de conectividade diretamente no cartão e oferece um menu de contexto para copiar, editar, exportar e excluir.

## Layout da Interface

### Grade e Cartões

1. Após habilitar o LLM na página de configurações de LLM, uma **grade de configurações** será exibida abaixo.
2. Cada **cartão de configuração** contém:
   - **Primeira linha**: Nome da configuração
   - **Segunda linha**: Tipo do modelo de linguagem grande (ex: OpenAI, Tongyi Qianwen, DeepSeek, Ollama, etc.)
3. **Clique em um cartão** para alternar para essa configuração. O cartão da configuração em uso atual será destacado com uma **borda verde**.
4. No canto superior direito da grade, há botões para **Nova Configuração** e **Importar Configuração**.

Você pode acessar as configurações de LLM através da barra de menus superior:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Demonstração da Interface de Configuração

A imagem abaixo mostra as principais funcionalidades da interface de gerenciamento de configurações de LLM:

<SettingLlmSection mode="demo" />

## Alternar Configuração

- **Clique em qualquer cartão** na grade de configurações para alternar para essa configuração.
- A configuração atual será exibida com borda verde e um leve realce. Todas as funcionalidades de IA usarão imediatamente o serviço LLM dessa configuração.

## Verificar Conectividade

- Cada cartão possui um botão **「Verificar」** no lado direito. Clicar nele testará a capacidade de **fluxo de perguntas e respostas** e **fluxo de conversa** dessa configuração.
- Um ícone de carregamento será exibido durante o teste; se houver saída normal, ele para automaticamente e mostra uma **marca de verificação verde**; se houver erro na requisição, mostra um **X vermelho** e uma breve mensagem de erro.
- Independentemente do resultado, clicar novamente permite refazer o teste.

## Menu de Contexto

**Clique com o botão direito** em um cartão de configuração para abrir um menu, que suporta:

- **Copiar Configuração**: Cria uma cópia dessa configuração (o novo nome terá 「(cópia)」).
- **Editar Configuração**: Abre uma caixa de diálogo de edição para modificar nome, tipo e vários parâmetros. **Confirmar** salva, **Cancelar** descarta as alterações.
- **Exportar Configuração**: Exporta a configuração atual para um arquivo JSON.
- **Excluir Configuração**: Exclui esta configuração (**configurações predefinidas não podem ser excluídas**, veja abaixo).

## Configurações Predefinidas

As **configurações predefinidas** para os tipos listados abaixo (como 「Ollama (padrão)」「Tongyi Qianwen (padrão)」, etc.) **não podem ser excluídas**, mas **podem ser editadas** (durante a edição, **o tipo do modelo de linguagem grande não pode ser alterado**):

- Tongyi Qianwen, DeepSeek, OpenAI Oficial, OpenAI Compatível, Google Gemini, Ollama

Configurações personalizadas e configurações obtidas por cópia podem ser excluídas normalmente.

## Criar Configurações

### Nova Configuração

1. Clique em **「Nova Configuração」** no canto superior direito da grade.
2. Na janela pop-up, insira o nome da configuração e confirme.
3. O sistema criará uma nova configuração baseada na **configuração atualmente selecionada** e alternará automaticamente para a nova configuração.

**Atenção**: O botão de nova configuração não estará disponível quando a configuração selecionada for do tipo "manual".

### Importar Configuração

1. Clique em **「Importar Configuração」** no canto superior direito da grade.
2. Na caixa de diálogo de arquivos que se abre, selecione um ou mais arquivos de configuração JSON (suporta **seleção em lote**).
3. O sistema lerá e importará cada um, e as configurações importadas serão adicionadas à lista.

Suporta formato JSON de objeto de configuração único ou array de configurações; durante a importação, um novo ID é gerado para evitar conflitos com configurações existentes.

## Editar Configuração

1. **Clique com o botão direito** em um cartão de configuração e selecione **「Editar Configuração」**.
2. Na caixa de diálogo de edição, modifique o **Nome da Configuração**, o **Tipo do Modelo de Linguagem Grande** (pode ser alterado em configurações não predefinidas) e os vários parâmetros para esse tipo (endereço da API, chave, modelo, etc.).
3. Clique em **Confirmar** para salvar ou **Cancelar** para descartar as alterações. **Não há estado "não salvo"**: as alterações só são gravadas após a confirmação.

Para explicações dos parâmetros de configuração de diferentes tipos de LLM, consulte [[settings.llm-types|Configuração de Tipos de LLM]].

## Excluir Configuração

1. **Clique com o botão direito** em um cartão de configuração e selecione **「Excluir Configuração」** (esta opção não é exibida para configurações predefinidas).
2. Confirme a exclusão na caixa de diálogo de confirmação.
3. Se a configuração excluída for a que está em uso, o sistema alternará automaticamente para outra configuração.

## Exportar Configuração

- **Exportação Individual**: Clique com o botão direito no cartão → **Exportar Configuração**, para salvar a configuração atual como um arquivo JSON.
- O arquivo exportado pode ser usado para backup ou para restaurar em outro dispositivo/conta através da função 「Importar Configuração」.

## Melhores Práticas

1. **Padronização de Nomes**: Use nomes de configuração claros, como 「Trabalho-Ollama」「Experimento-OpenAI」.
2. **Backup Regular**: Exporte backups regularmente para configurações importantes.
3. **Verificar Antes de Usar**: Para novas configurações ou após modificações, use o botão 「Verificar」 no cartão para confirmar a conectividade.
4. **Limpar Configurações Inúteis**: Exclua regularmente configurações que não são mais usadas para manter a lista organizada.

## Documentação Relacionada

- [[settings.llm|Configuração de LLM]]
- [[settings.llm-types|Configuração de Tipos de LLM]]
- [[ai.chat|Funcionalidade de Conversa com IA]]
- [[agent.introduction|Gerenciamento de Configuração de Agent]]

<QuickStartPanel mode="demo" />

<MainTabs mode="demo" />