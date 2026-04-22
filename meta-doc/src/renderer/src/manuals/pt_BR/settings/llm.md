# Configuração de LLM

## Visão geral

A configuração de LLM (grande modelo de linguagem) é central para os recursos de IA do MetaDoc. As **versões distribuídas pelo Steam** seguem um caminho recomendado diferente dos antigos canais de teste:

- **Steam (recomendado)**: use o **proxy de API LLM baseado em Cloudflare** operado pela MetaDoc (rotulado como **«MetaDoc Cloud (Steam)»** no app). Compre **créditos** com **recarga pelo Steam** e use a IA — em geral **sem** fornecer chaves de API de terceiros.
- **API própria (BYOK)**: fluxo **de desenvolvedor / experimental**. Somente depois de abrir **Opções experimentais** em **LLM** e ativar **«Habilitar conectividade experimental»** o fluxo clássico de **vários perfis + API personalizada** aparece. Veja abaixo e os artigos vinculados.

Primeiro: **Steam / MetaDoc Cloud** (saldo, recarga, troca de modelo); depois **opções experimentais**; em seguida o **resto da interface** (ativar LLM, temperatura, grade de cartões, etc.).

---

## Steam: MetaDoc Cloud e créditos (recomendado)

Para o MetaDoc instalado e executado pelo **Steam**.

### Passos rápidos

1. **Abrir configurações de LLM**: **Configurações** → **LLM** (ou **Configurações** pela barra de menus).
2. Localizar **«MetaDoc Cloud (Steam)»**: **saldo (credits)**, **modelo**, **Adicionar créditos** / recarga, **Atualizar** o saldo.
3. **Recarregar**: use **Adicionar créditos** e conclua a **compra no app do Steam**. Inicie o app pela biblioteca Steam; o cliente Steam deve estar disponível (a interface explica requisitos Steam/Greenworks se falhar).
4. **Ver saldo**: os créditos aparecem na página; a entrada **Steam** na bandeja também mostra o **saldo de créditos** e permite iniciar recarga.
5. **Preços**: **modelos** diferentes podem debitar créditos de forma distinta — veja o app.
6. **Trocar modelo**: ao escolher no MetaDoc Cloud, **chat IA, conclusão, revisão, Agent**, etc. usam esse modelo; pode mudar a qualquer momento.

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Observações

- O endpoint e o proxy são operados pela MetaDoc: **não** é preciso colar URL/chaves OpenAI ou DeepSeek neste modo (diferente do BYOK).
- Saldo insuficiente ou rede instável: os recursos de IA podem falhar — **recarregue** ou **atualize o saldo**.

---

## Opções de desenvolvedor: conectividade experimental e BYOK (API própria)

Nos builds **Steam**, o fluxo antigo de **«configurar sua própria API LLM»** é **experimental**: abra **Opções experimentais** na página **LLM**, ative **«Habilitar conectividade experimental»** (com confirmação). Só então aparecem **cartões de configuração, URL base, chave de API, tipos de provedor**, como nos builds de teste.

**Importante**:

- É **experimental** e pode **diferir** da experiência padrão; pode haver **cobrança direta** junto a terceiros e outros riscos.
- **Você é o único responsável** por chaves, cobrança, disponibilidade e termos de terceiros. O MetaDoc oferece apenas configuração no cliente.

Passos detalhados (como a documentação histórica):

- [[settings.llm-management|Gerenciamento de configurações LLM]]
- [[settings.llm-types|Tipos de provedor LLM]]
- [[ai.llm-config|Guia de configuração LLM]]

---

## Ativar LLM

<SettingLlmSection mode="demo" />

### Ativar recursos de IA

1. Localize o interruptor «Ativar LLM»
2. Ative-o
3. A configuração padrão é carregada

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Interface

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

- **Configurações globais**: interruptor LLM, temperatura, remover tags de raciocínio, execução no terminal padrão, etc.
- **Grade**: cartões com nome e tipo; clique para mudar a configuração ativa (borda verde)
- **Ações**: verificar fluxo; menu de contexto: copiar, editar, exportar, excluir
- **Canto superior direito**: nova configuração, importar de arquivo

No modo demo, alterações não são salvas.

Após ativar: chat IA, revisão, conclusão, assistente, Agent.

**Nota**: chamadas de API podem gerar custos.

## Temperatura

<SettingLlmSection mode="demo" />

Baixa (0–0,5): mais determinística. Média (0,5–1): equilibrada. Alta (1–2): mais criativa. Recomendações: documentação 0,3–0,5; criativo 0,7–1; código 0,2–0,4; diálogo 0,7–0,9.

## Remover tags de raciocínio

Filtra tags de processo de raciocínio quando o modelo as inclui.

## Gerenciamento de configurações

<SettingLlmSection mode="demo" />

Várias configurações para diferentes cenários. Clique no cartão para alternar; edição pelo menu de contexto.

## Avisos importantes

1. **Chaves API**: apenas com BYOK — não compartilhe
2. **Custos**: MetaDoc Cloud = **créditos**; BYOK = cobrança do provedor
3. **Rede**: conexão estável com APIs externas
4. **Backup**: exporte configurações importantes
5. **Modelos**: capacidades e limites diferentes

## Documentação relacionada

- [[settings.llm-management|Gerenciamento de configurações LLM]]
- [[settings.llm-types|Tipos de provedor LLM]]
- [[ai.chat|Chat IA]]
- [[ai.completion|Conclusão IA]]
- [[ai.proofread|Revisão IA]]
