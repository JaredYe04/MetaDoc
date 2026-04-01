# Configurer l’API LLM ✨

Pour utiliser le chat, la relecture ou l’agent dans MetaDoc, vous avez besoin d’une **API LLM fonctionnelle** dans les réglages 📡. Cette page va des concepts → ce que vous saisissez dans MetaDoc → activation des fournisseurs courants → dépannage → FAQ débutants.

> **⚠️ Avertissement** : Sauf **Ollama** local 🦙, des fournisseurs comme OpenRouter, OpenAI, Google, Alibaba Cloud, DeepSeek et des agrégateurs comme **4sapi** sont des **services tiers**. Facturation, conformité, sécurité du compte et confidentialité relèvent de votre relation avec ce fournisseur ; MetaDoc n’envoie que des requêtes compatibles en tant que client.

## 📋 En bref : comparer les types de fournisseurs


| Type | Icône | Idéal pour 👤 | Avantages ✨ | Compromis ⚖️ |
| :--- | :---: | :--- | :--- | :--- |
| **Gratuit intégré (OpenRouter)** | ![OpenRouter](https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64) | Premier essai | 🎁 Zéro configuration—essayer sans clé perso | 📉 Quota minuscule ; risque de limitation—ajoutez votre clé pour un usage réel |
| **Compatible OpenAI** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Passerelles, OpenRouter, miroirs régionaux | 🔧 Très flexible : URL de base + clé + modèle | 📚 La « compatibilité » varie—vérifiez la doc |
| **OpenAI officiel** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Facturation OpenAI officielle | 🚀 Modèles de pointe, écosystème mature | 💳 Tarification et politique régionale selon OpenAI |
| **DeepSeek** | ![DeepSeek](https://www.google.com/s2/favicons?domain=deepseek.com&sz=64) | Budget serré, beaucoup de chinois | 💰 Excellent rapport qualité-prix, API simple | ⏱️ Quotas/limites selon la console—protégez votre clé |
| **Google Gemini** | ![Gemini](https://www.google.com/s2/favicons?domain=ai.google.dev&sz=64) | Multimodal / stack Google | 🖼️ Large famille de modèles, itérations rapides | 🌍 Compte Google et politique API ; régions selon Google |
| **Qwen (DashScope)** | ![Alibaba](https://www.google.com/s2/favicons?domain=aliyun.com&sz=64) | Chine stable, entreprise | 🇨🇳 Faible latence, fort en chinois | ☁️ Activer le bon produit DashScope ; URL + région cohérentes |
| **Ollama (local)** | ![Ollama](https://www.google.com/s2/favicons?domain=ollama.com&sz=64) | Confidentialité / usage proche hors-ligne | 🔒 Pas de facturation cloud au token (électricité/matériel en sus) | 💾 Disque et GPU ; CPU seul lent ; petits modèles peu performants |

**En une phrase** : **confort et modèles de pointe** → cloud officiel ou agrégateurs compatibles ☁️ ; **coût / chinois** → DeepSeek, Qwen, etc. 💰 ; **confidentialité et contrôle** → Ollama—au prix du matériel et des capacités 🦙 ; **essai gratuit d’abord** → route gratuite intégrée—ne comptez pas sur une charge quotidienne lourde 🎁.

---

## 🧭 Trois actions dans MetaDoc

<SettingLlmSection mode="demo" />

1. **Choisir ou créer un profil** (compatible OpenAI ou DeepSeek est un bon début) 🃏.
2. Coller la **clé API** 🔑, et si besoin l’**URL de base** et l’identifiant du **modèle**.
3. Cliquer sur **Vérifier la configuration** ✅ pour tester la connectivité et l’authentification.

---

## 🌐 Piste A — OpenRouter (tout-en-un, compatible OpenAI)

OpenRouter regroupe de nombreux modèles derrière une **URL de base compatible OpenAI**—pratique pour ne retenir qu’un point de terminaison 🎯.

### 1️⃣ Inscription

Ouvrez [OpenRouter](https://openrouter.ai/) et créez un compte.

### 2️⃣ Clé API

Allez dans [Keys](https://openrouter.ai/settings/keys), créez une clé et **copiez-la en lieu sûr** (beaucoup de fournisseurs n’affichent le secret complet qu’une fois) 📋.

### 3️⃣ Dans MetaDoc

Choisissez **Compatible OpenAI**. **URL de base** : `https://openrouter.ai/api/v1`, collez la clé, **modèle** : par ex. `openrouter/free` ou un id du catalogue. Lecture utile : [docs OpenRouter](https://openrouter.ai/docs/) et page [free router](https://openrouter.ai/openrouter/free).

Les routes gratuites peuvent avoir des plafonds ou files d’attente ⏳ ; en production, surveillez **solde et limites** dans la console.

---

## 🐋 Piste B — DeepSeek (rapport qualité-prix)

### 1️⃣ Console

Connectez-vous sur [deepseek.com](https://www.deepseek.com/) et ouvrez la section API de la console.

### 2️⃣ Clé API

Créez une clé sur la page **API keys** (ou équivalent) et conservez-la 🔐.

### 3️⃣ Champs MetaDoc

Choisissez **DeepSeek**, collez la clé, modèle `deepseek-chat` ou `deepseek-reasoner` selon la [doc API](https://api-docs.deepseek.com/) à jour.

---

## 🔗 Piste C — Agrégateurs comme 4sapi (compatible OpenAI)

Ces services exposent souvent la même forme d’URL qu’OpenAI (`.../v1/chat/completions`) 🌏. Lisez tarifs et endpoints dans la [doc 4sapi (Apifox)](https://4sapi.apifox.cn/), créez une clé, copiez **URL de base** et **id de modèle** exactement comme documenté. Dans MetaDoc, **Compatible OpenAI** et collez chaque champ. Les règles changent souvent—la **console du fournisseur** fait foi ; **protégez votre clé** ⚠️.

---

## 🦙 Piste D — Ollama (local)

### 1️⃣ Installation

Téléchargez sur [ollama.com](https://ollama.com/) et vérifiez que l’application tourne.

### 2️⃣ Télécharger un modèle

Ex. : `ollama pull llama3.1` (noms actuels sur le site). Les modèles sont volumineux—espace disque suffisant 💾.

### 3️⃣ Réglages MetaDoc

Choisissez **Ollama**, base `http://localhost:11434/api`, **modèle** = nom tiré. Un GPU dédié aide beaucoup 🎮 ; CPU seul est plus lent sur les longues réponses. Voir [Ollama sur GitHub](https://github.com/ollama/ollama).

---

## ☁️ Piste E — Alibaba Qwen / DashScope

Activez **DashScope** et créez une clé selon l’[aide DashScope](https://help.aliyun.com/zh/dashscope/). Dans MetaDoc, **Qwen** : collez l’**URL compatible OpenAI** affichée dans votre console, plus le nom de modèle et la région si besoin.

---

## 🔷 Piste F — Google Gemini

Créez une clé via [Google AI for Developers](https://ai.google.dev/) (ou flux Cloud Console). Dans MetaDoc, **Gemini** : clé et id de modèle selon la liste actuelle.

---

## 🧯 Dépannage

- **401 / 403** 🔐 : mauvaise clé, droit modèle manquant, projet non autorisé.
- **402 / facturation** 💳 : ajoutez des crédits ou changez de clé financée.
- **429** ⏱️ : limite de débit—réessayez plus tard, réduisez la concurrence ou changez d’offre.
- **502 / passerelle** 🌐 : amont ou réseau—réessayez ou changez de chemin réseau.
- **Sortie vide / erreurs JSON** 🧩 : revérifiez l’URL de base (y compris `/v1`), l’orthographe du modèle, proxy / pare-feu d’entreprise.

---

## ❓ FAQ

### À quoi sert la clé API ? 🔑

C’est l’**identifiant** que le fournisseur utilise pour facturer et autoriser. MetaDoc ne l’envoie qu’aux endpoints que vous configurez. Ne partagez pas publiquement ni ne commitez dans des dépôts ; une fuite peut vider quota ou budget.

### Comment fonctionne la facturation ? Qu’est-ce qu’un token ? 💰

Beaucoup d’APIs cloud facturent en **tokens**—morceaux de texte après tokenisation. Entrée et sortie sont souvent tarifées séparément. **Tarifs, niveaux gratuits et offres** : pages prix de chaque fournisseur. MetaDoc ne revend pas l’accès aux modèles. Ollama local évite en général la facturation cloud au token mais consomme électricité et matériel.

### Qu’est-ce que l’URL de base et pourquoi ? 🔗

C’est le **préfixe HTTP** de l’API : hôte + chemin appelé par le client. Sous « compatible OpenAI », changer de fournisseur revient souvent à changer URL de base + id de modèle ; une faute frappe peut viser le mauvais service ou renvoyer 404/401.

### Pourquoi pas de modèles cloud « illimités » intégrés ? ☁️

L’inférence coûte de l’argent et doit respecter les politiques régionales. MetaDoc reste **client** : vous choisissez un fournisseur licencié et payez directement, plutôt que de masquer ces coûts pour tous. À l’avenir, MetaDoc pourrait proposer des services de grands modèles via ses agents officiels.

### Essai gratuit intégré vs ma propre clé 🎁

Les essais ont souvent de **petits quotas** et peuvent faire la queue ou être limités. Votre propre clé lie l’usage à votre contrat avec le fournisseur—mieux pour un usage quotidien.

### Où va le texte de mon document ? 🔒

Avec les **APIs cloud**, vers le fournisseur choisi (et ses sous-traitants selon **leur** politique de confidentialité). Avec **Ollama local** lié à localhost, le contenu reste en principe sur la machine, selon OS et réseau—évitez les secrets sur des réseaux non fiables.

### Les erreurs HTTP sont-elles la même chose qu’un échec de « Vérifier la configuration » ? 🧪

Pas toujours. **Vérifier la configuration** lance plusieurs sondes ; un **401/429** seul correspond aux points ci-dessus. Si plusieurs échouent, revérifiez clé, URL de base et id de modèle ensemble.

### Ollama vs cloud—comment choisir ? ⚖️

**Ollama** 🦙 pour plus de confidentialité et un usage proche hors-ligne, en acceptant vitesse/qualité moindres. **Cloud** ☁️ pour les derniers grands modèles et un débit stable, en acceptant facturation et conditions du fournisseur.

### Réutiliser une clé sur plusieurs PC ? 💻

Souvent possible techniquement, mais **quota et limites sont partagés**. Certains fournisseurs restreignent le partage ou l’IP—respectez leurs conditions. En équipe, préférez des clés séparées ou des politiques type IAM.

### Faut-il un VPN ? 🌍

Cela dépend du **fournisseur** et de votre **réseau**. Certains endpoints internationaux sont instables ou bloqués dans certaines régions—testez vous-même et respectez la réglementation locale.

---

La première configuration implique comptes et longues chaînes à copier ; ensuite c’est surtout « nouveau fournisseur → nouvelle URL de base + modèle » ✨. Bonne connexion d’une pile adaptée à vos besoins 🎉.
