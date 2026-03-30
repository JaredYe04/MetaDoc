# Funcionalidades da Página Inicial

## Visão Geral

A página inicial é a interface de entrada do MetaDoc, fornecendo funcionalidades como início rápido, criação de novos documentos e abertura de arquivos. O design da página inicial é simples e elegante, ajudando você a começar a usar o MetaDoc rapidamente.

## Entrada do Agent e sugestões

No topo: o mesmo **campo** da aba **Agent** (referências @ a arquivos/abas/pastas). O texto fica só na home até **enviar**; a app abre **Agent**, **cria uma sessão nova** e envia a mensagem.

Abaixo: **sugestões** (ideias curtas, muitas com emoji):

- **Embaralhar** para outro sorteio
- Cada chip **troca sozinho a cada 10–20 s** com animação
- Clique preenche o campo; **Ctrl+Z** / **⌘Z** desfaz

> O assistente de **início rápido** antigo foi removido. Crie documentos em **Novo documento** ou no menu esquerdo.
## Novo Documento

### Criar Documento em Branco

Clique no botão "Novo Documento" para criar rapidamente um documento em branco:

1.  Clique no botão "Novo Documento"
2.  Selecione o formato do documento (Markdown/LaTeX/Texto Simples)
3.  O documento será aberto em uma nova aba

**Atalho**: Você também pode usar `Ctrl+N` (Windows/Linux) ou `Cmd+N` (macOS) para criar rapidamente.

## Abrir Arquivo

### Abrir Arquivo Existente

Clique no botão "Abrir Arquivo" para abrir um arquivo existente:

1.  Clique no botão "Abrir Arquivo"
2.  Selecione o arquivo na caixa de diálogo de seleção de arquivos
3.  O arquivo será aberto em uma nova aba

**Atalho**: Você também pode usar `Ctrl+O` (Windows/Linux) ou `Cmd+O` (macOS) para abrir rapidamente.

### Formatos de Arquivo Suportados

-   **Markdown** (.md)
-   **LaTeX** (.tex)
-   **Texto Simples** (.txt)
-   **JSON** (.json)

## Manual do Usuário

### Abrir o Manual do Usuário

Clique no botão "Manual do Usuário" para abrir o manual:

1.  Clique no botão "Manual do Usuário"
2.  O manual do usuário será aberto em uma nova aba
3.  Você pode navegar e aprender sobre várias funcionalidades

**Atalho**: Você também pode pressionar a tecla `F1` para abrir rapidamente o manual do usuário.

## Lista de Documentos Recentes

### Visualizar Documentos Recentes

A página inicial exibe uma lista dos documentos abertos recentemente:

-   **Quantidade Exibida**: Exibe no máximo 12 documentos recentes
-   **Cartão do Documento**: Cada documento é exibido como um cartão
-   **Abertura Rápida**: Clique no cartão para abrir o documento rapidamente

### Operações em Documentos Recentes

-   **Abrir Documento**: Clique no cartão do documento para abri-lo
-   **Excluir Registro**: Clique no botão de exclusão no cartão para remover o registro
-   **Menu de Contexto**: Clicar com o botão direito no cartão pode oferecer mais opções

### Gerenciamento de Documentos Recentes

-   **Atualização Automática**: A lista é atualizada automaticamente após abrir um documento
-   **Salvamento de Registros**: Os registros de documentos recentes são salvos
-   **Ordenação da Lista**: Ordenados em ordem decrescente pelo horário de abertura

## Diálogo de Perfil do Usuário

### Abrir o Perfil do Usuário

A página inicial pode exibir o diálogo de perfil do usuário:

-   **Primeiro Uso**: Pode solicitar a configuração do perfil do usuário no primeiro uso
-   **Configuração do Perfil**: Permite definir o perfil do usuário e preferências de uso
-   **Otimização de IA**: O perfil do usuário pode ajudar a IA a entender melhor suas necessidades

### Conteúdo do Perfil do Usuário

O perfil do usuário pode incluir:

-   **Informações Básicas**: Nome, profissão, etc.
-   **Preferências de Uso**: Hábitos de edição, funcionalidades mais usadas, etc.
-   **Perfil do Usuário**: Ajuda a IA a entender seu cenário de uso

## Interface da Página Inicial

### Layout da Interface

A página inicial utiliza um layout centralizado:

-   **Topo**: Título e subtítulo do MetaDoc
-   **Meio**: Área dos botões de ação
-   **Rodapé**: Lista de documentos recentes

### Design Visual

A página inicial possui um design moderno e simples:

-   **Plano de Fundo Dinâmico**: Efeito de animação de plano de fundo dinâmico
-   **Decoração de Grade**: Decoração minimalista com grade
-   **Design de Cartões**: Os botões de ação utilizam um design de cartão

## Melhores Práticas

1.  **Início Rápido**: Para o primeiro uso, recomenda-se usar o assistente de início rápido
2.  **Atalhos de Teclado**: Domine o uso de atalhos para aumentar a eficiência
3.  **Documentos Recentes**: Utilize a lista de documentos recentes para acessar rapidamente documentos comuns
4.  **Perfil do Usuário**: Configure seu perfil para obter uma melhor experiência com a IA
5.  **Manual do Usuário**: Consulte o manual do usuário em caso de dúvidas

## Observações

1.  **Exibição da Página Inicial**: A página inicial só é exibida quando nenhum documento está aberto
2.  **Início Rápido**: O assistente de início rápido pode ser fechado a qualquer momento
3.  **Documentos Recentes**: A lista de documentos recentes exibe no máximo 12 itens
4.  **Perfil do Usuário**: A configuração do perfil do usuário é opcional
5.  **Idioma da Interface**: O idioma da interface da página inicial segue a configuração de idioma do sistema

## Documentos Relacionados

-   [[quick-start.guide|Guia de Início Rápido]]
-   [[core.file-operations|Operações com Arquivos]]
-   [[user.profile|Perfil do Usuário]]
-   [[views.types|Tipos de Visualização]]

<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<ViewMenuItemsDemo mode="demo" :items='["home", "outline", "chat", "agent"]' />

<MainTabs mode="demo" />

<UserProfileView mode="demo" />
