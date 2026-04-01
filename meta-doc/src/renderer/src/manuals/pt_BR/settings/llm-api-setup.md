# Guia rápido: API LLM ✨

Para usar o chat, a revisão ou o agente no MetaDoc, você precisa de uma **API LLM funcional** nas configurações 📡. Esta página vai de conceitos → o que preencher no MetaDoc → como ativar provedores comuns → solução de problemas → FAQ para iniciantes.

> **⚠️ Aviso**: Exceto **Ollama** local 🦙, provedores como OpenRouter, OpenAI, Google, Alibaba Cloud, DeepSeek e agregadores como **4sapi** são **serviços de terceiros**. Cobrança, conformidade, segurança da conta e privacidade ficam entre você e esse provedor; o MetaDoc apenas envia solicitações compatíveis como cliente.

## 📋 Em resumo: comparar tipos de provedor


| Tipo | Ícone | Ideal para 👤 | Vantagens ✨ | Compromissos ⚖️ |
| :--- | :---: | :--- | :--- | :--- |
| **Grátis integrado (OpenRouter)** | ![OpenRouter](https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64) | Primeiro teste | 🎁 Zero configuração—experimente sem sua própria chave | 📉 Cota mínima; pode haver limitação de taxa—adicione sua chave para trabalho real |
| **Compatível com OpenAI** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Gateways, OpenRouter, espelhos regionais | 🔧 Muito flexível: URL base + chave + modelo | 📚 A “compatibilidade” varia—confira a documentação |
| **OpenAI oficial** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Cobrança oficial OpenAI | 🚀 Modelos de ponta, ecossistema maduro | 💳 Preços e política regional conforme OpenAI |
| **DeepSeek** | ![DeepSeek](https://www.google.com/s2/favicons?domain=deepseek.com&sz=64) | Orçamento apertado, muito chinês | 💰 Ótimo custo-benefício, API simples | ⏱️ Cotas/limites no console—proteja sua chave |
| **Google Gemini** | ![Gemini](https://www.google.com/s2/favicons?domain=ai.google.dev&sz=64) | Multimodal / stack Google | 🖼️ Família ampla de modelos, iteração rápida | 🌍 Conta Google e política de API; regiões conforme Google |
| **Qwen (DashScope)** | ![Alibaba](https://www.google.com/s2/favicons?domain=aliyun.com&sz=64) | Região China estável, empresas | 🇨🇳 Baixa latência, forte em chinês | ☁️ Ative o produto DashScope correto; endpoint e região alinhados |
| **Ollama (local)** | ![Ollama](https://www.google.com/s2/favicons?domain=ollama.com&sz=64) | Privacidade / uso próximo ao offline | 🔒 Sem cobrança cloud por token (energia/HW à parte) | 💾 Disco e GPU; só CPU é lento; modelos pequenos podem parecer fracos |

**Em uma frase**: **conveniência e modelos de ponta** → cloud oficial ou agregadores compatíveis ☁️; **custo / chinês** → DeepSeek, Qwen, etc. 💰; **privacidade e controle** → Ollama—com custo de hardware e capacidade bruta 🦙; **testar grátis primeiro** → rota gratuita integrada—não espere carga diária pesada 🎁.

---

## 🧭 Três coisas a fazer no MetaDoc

<SettingLlmSection mode="demo" />

1. **Escolher ou criar um perfil** (compatível OpenAI ou DeepSeek é um bom começo) 🃏.
2. Colar a **chave de API** 🔑 e, se necessário, a **URL base** e o id do **modelo**.
3. Clicar em **Verificar configuração** ✅ para testar conectividade e autenticação.

---

## 🌐 Trilha A — OpenRouter (tudo-em-um, compatível OpenAI)

O OpenRouter agrega muitos modelos atrás de uma **URL base compatível com OpenAI**—útil quando você quer lembrar só um endpoint 🎯.

### 1️⃣ Cadastro

Abra [OpenRouter](https://openrouter.ai/) e crie uma conta.

### 2️⃣ Chave de API

Vá em [Keys](https://openrouter.ai/settings/keys), crie uma chave e **copie para um lugar seguro** (muitos provedores mostram o segredo completo só uma vez) 📋.

### 3️⃣ No MetaDoc

Escolha **Compatível com OpenAI**. **URL base**: `https://openrouter.ai/api/v1`, cole a chave, **modelo**: ex. `openrouter/free` ou um id do catálogo. Leitura opcional: [documentação OpenRouter](https://openrouter.ai/docs/) e página [free router](https://openrouter.ai/openrouter/free).

Rotas gratuitas ainda podem ter limites diários ou filas ⏳; em produção, acompanhe **saldo e limites** no console.

---

## 🐋 Trilha B — DeepSeek (custo-benefício)

### 1️⃣ Console

Entre em [deepseek.com](https://www.deepseek.com/) e abra a seção de API do console.

### 2️⃣ Chave de API

Crie uma chave na página **API keys** (ou equivalente) e guarde com segurança 🔐.

### 3️⃣ Campos no MetaDoc

Escolha **DeepSeek**, cole a chave, modelo `deepseek-chat` ou `deepseek-reasoner` conforme a [documentação da API](https://api-docs.deepseek.com/) atual.

---

## 🔗 Trilha C — Agregadores como 4sapi (compatível OpenAI)

Esses serviços costumam expor a mesma forma de URL que a OpenAI (`.../v1/chat/completions`) 🌏. Leia preços e endpoints na [documentação 4sapi (Apifox)](https://4sapi.apifox.cn/), crie uma chave e copie **URL base** e **id do modelo** exatamente como documentado. No MetaDoc, **Compatível com OpenAI** e cole cada campo. As regras mudam com frequência—o **console do fornecedor** é a fonte da verdade; **proteja sua chave** ⚠️.

---

## 🦙 Trilha D — Ollama (local)

### 1️⃣ Instalação

Baixe em [ollama.com](https://ollama.com/) e confirme que o app está rodando.

### 2️⃣ Baixar um modelo

Ex.: `ollama pull llama3.1` (nomes atuais no site). Modelos são grandes—reserve espaço em disco 💾.

### 3️⃣ Configurações no MetaDoc

Escolha **Ollama**, base `http://localhost:11434/api`, **modelo** o nome que você baixou. GPU dedicada ajuda muito 🎮; só CPU é mais lento em respostas longas. Veja [Ollama no GitHub](https://github.com/ollama/ollama).

---

## ☁️ Trilha E — Alibaba Qwen / DashScope

Ative o **DashScope** e crie uma chave seguindo a [ajuda DashScope](https://help.aliyun.com/zh/dashscope/). No MetaDoc, **Qwen**: cole a **URL compatível com OpenAI** mostrada no seu console, mais o nome do modelo e região se aplicável.

---

## 🔷 Trilha F — Google Gemini

Crie uma chave em [Google AI for Developers](https://ai.google.dev/) (ou fluxos do Cloud Console). No MetaDoc, **Gemini**: chave e id do modelo conforme a lista atual.

---

## 🧯 Solução de problemas

- **401 / 403** 🔐: Chave errada, sem direito ao modelo ou projeto não autorizado.
- **402 / cobrança** 💳: Adicione créditos ou troque para uma chave com saldo.
- **429** ⏱️: Limite de taxa—tente depois, reduza concorrência ou faça upgrade.
- **502 / gateway** 🌐: Rede ou upstream—tente de novo ou mude o caminho de rede.
- **Saída vazia / erros JSON** 🧩: Revise URL base (incl. `/v1`), ortografia do modelo, proxy/firewall corporativo.

---

## ❓ FAQ

### Para que serve a chave de API? 🔑

É a **credencial** que o provedor usa para cobrar e autorizar. O MetaDoc só a envia aos endpoints que você configurar. Não compartilhe publicamente nem faça commit em repositórios; vazamentos podem esgotar cota ou saldo.

### Como funciona a cobrança? O que é token? 💰

Muitas APIs cloud cobram por **tokens**—pedaços de texto após o tokenizador do modelo. Entrada e saída costumam ter preços separados. **Tarifas, níveis gratuitos e pacotes** estão na página de preços de cada fornecedor. O MetaDoc não revende acesso a modelos. Ollama local geralmente evita cobrança cloud por token, mas usa eletricidade e hardware.

### O que é URL base e por que preciso? 🔗

É o **prefixo HTTP** da API: host + caminho que o cliente chama. Em “compatível OpenAI”, trocar de fornecedor costuma ser só URL base + id do modelo; erro de digitação acerta o serviço errado ou retorna 404/401.

### Por que o MetaDoc não inclui modelos cloud “ilimitados”? ☁️

Inferência custa dinheiro e deve respeitar políticas regionais. O MetaDoc permanece **cliente**: você escolhe um provedor licenciado e paga diretamente, em vez de esconder esses custos para todos. No futuro, o MetaDoc pode lançar serviços de grandes modelos via agentes oficiais.

### Teste gratuito integrado vs minha própria chave 🎁

Testes costumam ter **cotas pequenas** e podem fila ou limitar. Sua própria chave amarra o uso ao seu contrato com o fornecedor—melhor para o dia a dia.

### Para onde vai o texto do meu documento? 🔒

Com **APIs cloud**, para o provedor que você escolheu (e subprocessadores conforme a **política de privacidade deles**). Com **Ollama local** ligado a localhost, o conteúdo normalmente fica na máquina, conforme SO e rede—evite segredos em redes não confiáveis.

### Erros HTTP são a mesma coisa que falhar em “Verificar configuração”? 🧪

Nem sempre. **Verificar configuração** executa várias sondagens; **401/429** isolados ainda mapeiam aos itens acima. Se várias falharem, revalide chave, URL base e id do modelo juntos.

### Ollama vs cloud—como escolher? ⚖️

**Ollama** 🦙 para mais privacidade e uso próximo ao offline, aceitando trade-offs de velocidade/qualidade. **Cloud** ☁️ quando você quer os últimos grandes modelos e vazão estável, aceitando cobrança e termos do fornecedor.

### Reutilizar uma chave em vários PCs? 💻

Muitas vezes sim tecnicamente, mas **cota e limites são compartilhados**. Alguns fornecedores restringem compartilhamento ou IP—siga os termos. Para equipes, prefira chaves separadas ou políticas tipo IAM.

### Preciso de VPN? 🌍

Depende do **provedor** e da sua **rede**. Alguns endpoints internacionais são instáveis ou bloqueados em certas regiões—teste conectividade e cumpra a regulamentação local.

---

A primeira configuração envolve contas e copiar strings longas; depois é sobretudo “novo fornecedor → nova URL base + modelo” ✨. Boa sorte conectando uma pilha que sirva ao que você precisa 🎉.
