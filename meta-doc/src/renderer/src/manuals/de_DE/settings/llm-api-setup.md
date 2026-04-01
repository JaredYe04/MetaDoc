# LLM-API einrichten ✨

Um Chat, Korrekturlesen oder den Agenten in MetaDoc zu nutzen, brauchen Sie in den Einstellungen eine **funktionierende LLM-API** 📡. Diese Seite führt von den Grundlagen → was Sie in MetaDoc eintragen → gängige Anbieter → Fehlerbehebung → FAQs für Einsteiger.

> **⚠️ Hinweis**: Außer lokalem **Ollama** 🦙 sind Anbieter wie OpenRouter, OpenAI, Google, Alibaba Cloud, DeepSeek und Aggregatoren wie **4sapi** **Drittanbieter**. Abrechnung, Compliance, Kontosicherheit und Datenschutz liegen zwischen Ihnen und dem jeweiligen Anbieter; MetaDoc sendet nur kompatible Anfragen als Client.

## 📋 Überblick: Anbietertypen vergleichen


| Typ | Symbol | Ideal für 👤 | Vorteile ✨ | Kompromisse ⚖️ |
| :--- | :---: | :--- | :--- | :--- |
| **Eingebaut kostenlos (OpenRouter)** | ![OpenRouter](https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64) | Erster Einstieg | 🎁 Kein Setup—ohne eigenen Key testen | 📉 Sehr kleines Kontingent; ggf. Rate-Limits—eigenen Key für echte Arbeit |
| **OpenAI-kompatibel** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Gateways, OpenRouter, regionale Spiegel | 🔧 Sehr flexibel: Base URL + Key + Modell | 📚 „Kompatibilität“ variiert—Dokumentation prüfen |
| **OpenAI offiziell** | ![OpenAI](https://www.google.com/s2/favicons?domain=openai.com&sz=64) | Offizielle OpenAI-Abrechnung | 🚀 Spitzenmodelle, ausgereiftes Ökosystem | 💳 Preise und Regionalrichtlinien bei OpenAI |
| **DeepSeek** | ![DeepSeek](https://www.google.com/s2/favicons?domain=deepseek.com&sz=64) | Kostensensibel, viel Chinesisch | 💰 Gutes Preis-Leistungs-Verhältnis, einfache API | ⏱️ Kontingente/Limits laut Konsole—Key schützen |
| **Google Gemini** | ![Gemini](https://www.google.com/s2/favicons?domain=ai.google.dev&sz=64) | Multimodal / Google-Stack | 🖼️ Breite Modellfamilie, schnelle Iteration | 🌍 Google-Konto und API-Richtlinien; Regionen nach Google |
| **Qwen (DashScope)** | ![Alibaba](https://www.google.com/s2/favicons?domain=aliyun.com&sz=64) | Stabile China-Region, Enterprise | 🇨🇳 Geringe Latenz, stark in Chinesisch | ☁️ Richtiges DashScope-Produkt aktivieren; Endpoint + Region passend |
| **Ollama (lokal)** | ![Ollama](https://www.google.com/s2/favicons?domain=ollama.com&sz=64) | Datenschutz / „offline-nah“ | 🔒 Keine Token-Cloud-Abrechnung (Strom/HW extra) | 💾 Speicher & GPU; nur CPU langsam; kleine Modelle wirken schwach |

**Kurzentscheidung**: **Komfort und Spitzenmodelle** → offizielle Cloud oder kompatible Aggregatoren ☁️; **Kosten / Chinesisch** → DeepSeek, Qwen usw. 💰; **Privatsphäre und Kontrolle** → Ollama—mit Hardware- und Leistungseinbußen 🦙; **erst mal gratis** → eingebauter Gratis-Weg—keine hohe Dauerlast erwarten 🎁.

---

## 🧭 Drei Schritte in MetaDoc

<SettingLlmSection mode="demo" />

1. **Profil wählen oder anlegen** (OpenAI-kompatibel oder DeepSeek ist ein guter Start) 🃏.
2. **API-Key** 🔑 einfügen, ggf. **Base URL** und **Modell**-ID.
3. **Konfiguration prüfen** ✅ für Verbindungs- und Auth-Tests.

---

## 🌐 Pfad A — OpenRouter (Alles-in-einem, OpenAI-kompatibel)

OpenRouter bündelt viele Modelle hinter einer **OpenAI-kompatiblen** Base URL—praktisch, wenn Sie sich nur eine Adresse merken wollen 🎯.

### 1️⃣ Registrieren

[OpenRouter](https://openrouter.ai/) öffnen und Konto anlegen.

### 2️⃣ API-Key erstellen

Unter [Keys](https://openrouter.ai/settings/keys) einen Key erstellen und **sicher kopieren** (viele Anbieter zeigen das volle Secret nur einmal) 📋.

### 3️⃣ In MetaDoc eintragen

**OpenAI-kompatibel** wählen, **Base URL** auf `https://openrouter.ai/api/v1` setzen, Key einfügen, **Modell** z. B. `openrouter/free` oder eine ID aus dem Katalog. Optional: [OpenRouter-Docs](https://openrouter.ai/docs/) und [Free Router](https://openrouter.ai/openrouter/free).

Gratis-Routen können Tageslimits oder Warteschlangen haben ⏳; für Produktion **Guthaben und Rate Limits** in der Konsole beachten.

---

## 🐋 Pfad B — DeepSeek (Preis-Leistung)

### 1️⃣ Konsole

Bei [deepseek.com](https://www.deepseek.com/) anmelden und den API-Bereich der Konsole öffnen.

### 2️⃣ API-Key

Auf der Seite **API keys** (oder gleichwertig) einen Key erstellen und sicher aufbewahren 🔐.

### 3️⃣ MetaDoc-Felder

**DeepSeek** wählen, Key einfügen, Modell laut aktueller [API-Dokumentation](https://api-docs.deepseek.com/) z. B. `deepseek-chat` oder `deepseek-reasoner`.

---

## 🔗 Pfad C — Aggregatoren wie 4sapi (OpenAI-kompatibel)

Diese Dienste nutzen oft dieselbe URL-Struktur wie OpenAI (`.../v1/chat/completions`) 🌏. Preise und Endpoints in den [4sapi-Docs (Apifox)](https://4sapi.apifox.cn/) lesen, Key erstellen, **Base URL** und **Modell-ID** exakt wie dokumentiert übernehmen. In MetaDoc **OpenAI-kompatibel** wählen und einfügen. Regeln ändern sich oft—**Anbieter-Konsole als Quelle** und **Key schützen** ⚠️.

---

## 🦙 Pfad D — Ollama (lokal)

### 1️⃣ Installation

Von [ollama.com](https://ollama.com/) laden und prüfen, dass die App läuft.

### 2️⃣ Modell pullen

Z. B. `ollama pull llama3.1` (aktuelle Modellnamen auf der Website). Modelle sind groß—genug Speicherplatz 💾.

### 3️⃣ MetaDoc-Einstellungen

**Ollama** wählen, Basis `http://localhost:11434/api`, **Modell** wie gepullt. Dedizierte GPU hilft stark 🎮; nur CPU ist bei langen Antworten langsamer. Details: [Ollama auf GitHub](https://github.com/ollama/ollama).

---

## ☁️ Pfad E — Alibaba Qwen / DashScope

**DashScope** aktivieren und API-Key gemäß [DashScope-Hilfe](https://help.aliyun.com/zh/dashscope/) anlegen. In MetaDoc **Qwen** wählen und die **OpenAI-kompatible** Base URL aus der Konsole sowie korrekten Modellnamen und ggf. Region eintragen.

---

## 🔷 Pfad F — Google Gemini

API-Key über [Google AI for Developers](https://ai.google.dev/) (oder Cloud-Konsole) erstellen. In MetaDoc **Gemini** öffnen und Key sowie Modell-ID aus der aktuellen Modellliste eintragen.

---

## 🧯 Fehlerbehebung

- **401 / 403** 🔐: Falscher Key, fehlende Modellberechtigung oder Projekt nicht autorisiert.
- **402 / Abrechnung** 💳: Guthaben aufladen oder einen finanzierten Key nutzen.
- **429** ⏱️: Rate-Limit—später erneut versuchen, Parallelität reduzieren oder Plan upgraden.
- **502 / Gateway** 🌐: Upstream oder Netzwerk—erneut versuchen oder Netzwerkpfad wechseln.
- **Leere Ausgabe / JSON-Fehler** 🧩: Base URL (inkl. `/v1`), Modell-ID-Schreibweise, Firmen-Proxys/Firewalls prüfen.

---

## ❓ FAQ

### Wofür ist der API-Key? 🔑

Er ist die **Berechtigung**, mit der der Anbieter abrechnet und Anfragen autorisiert. MetaDoc sendet ihn nur an Ihre konfigurierten Endpoints. Keys nicht öffentlich teilen oder in Repos committen; Lecks können Kontingente oder Guthaben verbrauchen.

### Wie funktioniert die Abrechnung? Was ist ein Token? 💰

Viele Cloud-APIs berechnen **Tokens**—grob Textstücke nach dem Tokenizer des Modells. Eingabe und Ausgabe sind oft getrennt bepreist. **Tarife, Freikontingente und Pakete** stehen auf den Preisseiten der Anbieter. MetaDoc verkauft keinen Modellzugang. Lokales Ollama vermeidet meist Token-Cloud-Kosten, verbraucht aber Strom und Hardware.

### Was ist die Base URL und warum brauche ich sie? 🔗

Sie ist das **HTTP-Präfix** der API: Host + Pfad, den der Client aufruft. Bei „OpenAI-kompatibel“ wechseln Sie oft nur Base URL + Modell-ID; Tippfehler treffen den falschen Dienst oder liefern 404/401.

### Warum gibt es keine „unbegrenzten“ Cloud-Modelle in der App? ☁️

Inferenz kostet Geld und unterliegt regionalen Vorschriften. MetaDoc bleibt **Client**: Sie wählen einen lizenzierten Anbieter und zahlen direkt dort, statt Kosten für alle Nutzer zu verstecken. Später könnte MetaDoc eigene Agenten-Dienste für große Modelle anbieten.

### Eingebautes Gratis-Test vs. eigener Key 🎁

Tests haben meist **kleine Kontingente** und können warten oder drosseln. Ein eigener Key bindet Nutzung an Ihren Vertrag mit dem Anbieter—besser für den Alltag.

### Wohin geht mein Dokumenttext? 🔒

Bei **Cloud-APIs** an den gewählten Anbieter (und Unterauftragnehmer laut **deren** Datenschutzerklärung). Bei **lokalem Ollama** an localhost bleibt Inhalt normalerweise auf dem Rechner—abhängig von OS und Netzwerk; sensible Daten nicht über unsichere Netze senden.

### Sind HTTP-Fehler dasselbe wie ein fehlgeschlagener „Konfiguration prüfen“-Lauf? 🧪

Nicht immer. **Konfiguration prüfen** führt mehrere Tests aus; reine **401/429** passen zu den Punkten oben. Wenn mehrere Checks fehlschlagen, Key, Base URL und Modell-ID gemeinsam prüfen.

### Ollama vs. Cloud—wie wählen? ⚖️

**Ollama** 🦙 für stärkere Privatsphäre und offline-nah, mit Geschwindigkeits-/Qualitäts-Kompromissen. **Cloud** ☁️ für neueste große Modelle und stabilen Durchsatz, mit Abrechnung und AGB des Anbieters.

### Ein Key auf vielen PCs? 💻

Oft technisch möglich, aber **Kontingent und Limits sind geteilt**. Manche Anbieter verbieten Teilen oder binden an IP—AGB beachten. Für Teams: separate Keys oder IAM-ähnliche Richtlinien.

### Brauche ich ein VPN? 🌍

Hängt vom **Anbieter** und Ihrem **Netz** ab. Manche internationale Endpoints sind instabil oder blockiert—Verbindung selbst testen und lokale Vorschriften einhalten.

---

Die Ersteinrichtung kostet Konten und lange Zeichenketten; danach ist es meist „neuer Anbieter → neue Base URL + Modell“ ✨. Viel Erfolg beim Verbinden eines Stacks, der zu Ihnen passt 🎉.
