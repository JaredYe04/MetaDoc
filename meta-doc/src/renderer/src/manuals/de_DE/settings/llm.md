# LLM-Konfiguration

## Überblick

Die LLM-Einstellungen (Large Language Model) sind zentral für die KI-Funktionen von MetaDoc. **Über Steam verteilte Versionen** unterscheiden sich in der empfohlenen Vorgehensweise von älteren Testkanälen:

- **Steam (empfohlen)**: Nutzen Sie den von MetaDoc betriebenen **LLM-API-Proxy auf Basis von Cloudflare** (in der App als **„MetaDoc Cloud (Steam)“** o. Ä. beschriftet). Kaufen Sie **Credits** per **Steam-Aufladung** und nutzen Sie die KI – in der Regel **ohne** eigene Drittanbieter-API-Schlüssel.
- **Eigenes API (BYOK)**: **Entwickler-/Experimentell**. Erst wenn Sie unter **LLM** die **Experimentellen Optionen** öffnen und **„Experimentelle Konnektivität aktivieren“** einschalten, erscheint der klassische Workflow mit **mehreren Profilen und benutzerdefinierten APIs**. Siehe unten und die verlinkten Artikel.

Zuerst: **Steam / MetaDoc Cloud** (Guthaben, Aufladung, Modellwechsel), dann **Experimentelle Optionen**, danach das **gesamte UI** (LLM aktivieren, Temperatur, Kartenraster usw.).

---

## Steam: MetaDoc Cloud und Credits (empfohlen)

Für MetaDoc, installiert und gestartet über **Steam**.

### Kurzablauf

1. **LLM-Einstellungen öffnen**: **Einstellungen** → **LLM** (oder **Einstellungen** über die Menüleiste).
2. **„MetaDoc Cloud (Steam)“** finden: **Guthaben (Credits)**, **Modell**, **Guthaben hinzufügen** / Aufladen, **Aktualisieren**.
3. **Aufladen**: Über **Guthaben hinzufügen** den **Steam-In-App-Kauf** abschließen. Start aus der Steam-Bibliothek, Steam-Client erforderlich (Hinweise zu Steam/Greenworks erscheinen in der UI).
4. **Guthaben prüfen**: Credits werden auf der Seite angezeigt; auch über das **Steam**-Tray: **Kontostand (Credits)** und Aufladung.
5. **Preise**: Unterschiedliche **Modelle** können Credits unterschiedlich abbuchen – Details in der App.
6. **Modelle wechseln**: Nach Wahl unter MetaDoc Cloud nutzen **KI-Chat, Vervollständigung, Korrektur, Agent** dieses Modell; jederzeit änderbar.

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Hinweise

- Endpunkt und Proxy werden von MetaDoc betrieben; **keine** manuelle Eingabe von OpenAI-/DeepSeek-URLs und -Keys für diesen Pfad (anders als BYOK).
- Bei zu geringem Guthaben oder Netzproblemen können KI-Funktionen ausfallen – **aufladen** oder **Guthaben aktualisieren**.

---

## Entwickleroptionen: Experimentelle Konnektivität und BYOK (eigenes API)

In **Steam**-Builds ist der frühere **„eigenes LLM-API konfigurieren“**-Pfad **experimentell**: **Experimentelle Optionen** auf der **LLM**-Seite öffnen, **„Experimentelle Konnektivität aktivieren“** einschalten (mit Bestätigung). Erst dann erscheinen **Konfigurationskarten, API-Basis-URL, API-Key, Anbietertypen** wie früher.

**Wichtig**:

- **Experimentell** – kann vom Standard-Erlebnis abweichen; **direkte Kosten bei Drittanbietern** und zusätzliche Risiken.
- **Sie sind allein verantwortlich** für Schlüssel, Abrechnung, Verfügbarkeit und Nutzungsbedingungen Dritter. MetaDoc stellt nur Client-Konfiguration bereit.

Ausführliche Schritte wie in der bisherigen Dokumentation:

- [[settings.llm-management|LLM-Konfigurationsverwaltung]]
- [[settings.llm-types|LLM-Anbietertypen]]
- [[ai.llm-config|LLM-Konfigurationsleitfaden]]

---

## LLM aktivieren

<SettingLlmSection mode="demo" />

### KI-Funktionen einschalten

1. Schalter „LLM aktivieren“ finden
2. Auf „Aktiviert“ stellen
3. Standardkonfiguration wird geladen

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Oberfläche

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

- **Globale Einstellungen**: LLM-Schalter, Temperatur, Reasoning-Tags entfernen, Terminal-Standard usw.
- **Konfigurationsraster**: Karten mit Name/Typ; Klick wechselt die aktive Konfiguration (grüner Rahmen)
- **Kartenaktionen**: Prüfen, Rechtsklick: Kopieren, Bearbeiten, Exportieren, Löschen
- **Oben**: Neue Konfiguration, Import aus Datei

Im Demo-Modus werden keine Änderungen gespeichert.

Nach Aktivierung: KI-Chat, Korrektur, Vervollständigung, Assistent, Agent.

**Hinweis**: API-Aufrufe können Kosten verursachen.

## Temperatur

<SettingLlmSection mode="demo" />

Niedrige Werte (0–0,5): deterministischer. Mittel (0,5–1): ausgewogen. Hoch (1–2): kreativer. Empfehlungen: Technik 0,3–0,5; Kreativ 0,7–1; Code 0,2–0,4; Dialog 0,7–0,9.

## Reasoning-Tags automatisch entfernen

Entfernt modellspezifische Denk-Prozess-Tags aus der Ausgabe, wenn unterstützt.

## Konfigurationsverwaltung

<SettingLlmSection mode="demo" />

Mehrere Konfigurationen für Arbeit, Tests oder verschiedene Anbieter. Wechsel per Klick; Bearbeiten über Kontextmenü.

## Wichtige Hinweise

1. **API-Schlüssel**: Nur bei BYOK – nicht weitergeben
2. **Kosten**: MetaDoc Cloud = **Credits**; BYOK = Anbieterabrechnung
3. **Netzwerk**: Stabile Verbindung zu externen APIs
4. **Backup**: Konfiguration exportieren
5. **Modelle**: Unterschiedliche Fähigkeiten und Grenzen

## Weitere Dokumentation

- [[settings.llm-management|LLM-Konfigurationsverwaltung]]
- [[settings.llm-types|LLM-Anbietertypen]]
- [[ai.chat|KI-Chat]]
- [[ai.completion|KI-Vervollständigung]]
- [[ai.proofread|KI-Korrektur]]
