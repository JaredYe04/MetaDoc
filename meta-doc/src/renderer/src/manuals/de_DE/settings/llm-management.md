# LLM-Konfigurationsverwaltung

## Übersicht

Die LLM-Konfigurationsverwaltung ermöglicht es Ihnen, mehrere LLM-Konfigurationen zu erstellen, zu bearbeiten, zu löschen und zu verwalten. Konfigurationen werden als **Rasterkarten** angezeigt, ähnlich wie bei Agent-Clients: Jede Karte zeigt den Konfigurationsnamen und -typ an. Ein Klick schaltet auf die entsprechende Konfiguration um. Sie können die Konnektivität direkt auf der Karte prüfen und über das Kontextmenü Funktionen wie Kopieren, Bearbeiten, Exportieren und Löschen nutzen.

## Benutzeroberflächen-Layout

### Raster und Karten

1.  Nachdem Sie die LLM-Einstellungen auf der LLM-Seite aktiviert haben, wird unten das **Konfigurationsraster** angezeigt.
2.  Jede **Konfigurationskarte** enthält:
    -   **Erste Zeile**: Konfigurationsname
    -   **Zweite Zeile**: Großes Sprachmodell-Typ (z.B. OpenAI, Tongyi Qianwen, DeepSeek, Ollama usw.)
3.  **Klicken Sie auf eine Karte**, um zu dieser Konfiguration zu wechseln. Die aktuell verwendete Konfigurationskarte wird mit einem **grünen Rahmen** hervorgehoben.
4.  In der oberen rechten Ecke des Rasters befinden sich die Schaltflächen **Neue Konfiguration** und **Konfiguration importieren**.

Sie können über die obere Menüleiste auf die LLM-Einstellungen zugreifen:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Demo der Konfigurationsoberfläche

Die folgende Abbildung zeigt die Hauptfunktionen der LLM-Konfigurationsverwaltungsoberfläche:

<SettingLlmSection mode="demo" />

## Konfiguration wechseln

-   **Klicken Sie auf eine beliebige Karte** im Konfigurationsraster, um zu dieser Konfiguration zu wechseln.
-   Die aktuelle Konfiguration wird durch einen grünen Rahmen und eine leichte Hervorhebung angezeigt. Alle KI-Funktionen verwenden sofort den LLM-Dienst dieser Konfiguration.

## Konnektivität prüfen

-   Auf der rechten Seite jeder Karte befindet sich eine **"Prüfen"**-Schaltfläche. Ein Klick testet die **Frage-Antwort-Streaming**- und **Dialog-Streaming**-Fähigkeiten dieser Konfiguration.
-   Während des Tests wird ein Ladesymbol angezeigt. Bei normaler Ausgabe stoppt der Test automatisch und zeigt ein **grünes Häkchen** an. Bei einem Anfragefehler wird ein **rotes Kreuz** mit einer kurzen Fehlermeldung angezeigt.
-   Unabhängig vom Ergebnis kann durch erneutes Klicken der Test neu gestartet werden.

## Kontextmenü

Ein **Rechtsklick** auf eine Konfigurationskarte öffnet ein Menü mit folgenden Optionen:

-   **Konfiguration kopieren**: Erstellt eine Kopie dieser Konfiguration (der neue Name enthält "(Kopie)").
-   **Konfiguration bearbeiten**: Öffnet den Bearbeitungsdialog zum Ändern von Name, Typ und verschiedenen Parametern. **Bestätigen** speichert, **Abbrechen** verwirft die Änderungen.
-   **Konfiguration exportieren**: Exportiert die aktuelle Konfiguration als JSON-Datei.
-   **Konfiguration löschen**: Löscht diese Konfiguration (**Voreingestellte Konfigurationen können nicht gelöscht werden**, siehe unten).

## Voreingestellte Konfigurationen

**Voreingestellte Konfigurationen** für die folgenden Typen (z.B. "Ollama (Standard)", "Tongyi Qianwen (Standard)" usw.) **können nicht gelöscht**, aber **bearbeitet werden** (der **Sprachmodelltyp kann beim Bearbeiten nicht geändert werden**):

-   Tongyi Qianwen, DeepSeek, OpenAI offiziell, OpenAI kompatibel, Google Gemini, Ollama

Benutzerdefinierte Konfigurationen und durch Kopieren erstellte Konfigurationen können normal gelöscht werden.

## Konfiguration erstellen

### Neue Konfiguration

1.  Klicken Sie in der oberen rechten Ecke des Rasters auf **"Neue Konfiguration"**.
2.  Geben Sie im Popup-Fenster einen Konfigurationsnamen ein und bestätigen Sie.
3.  Das System erstellt eine neue Konfiguration basierend auf der **aktuell ausgewählten Konfiguration** und wechselt automatisch zu dieser neuen Konfiguration.

**Hinweis**: Wenn die aktuell ausgewählte Konfiguration vom Typ "Manuell" ist, ist die Schaltfläche "Neu" nicht verfügbar.

### Konfiguration importieren

1.  Klicken Sie in der oberen rechten Ecke des Rasters auf **"Konfiguration importieren"**.
2.  Wählen Sie im geöffneten Dateidialog eine oder mehrere JSON-Konfigurationsdateien aus (**Stapelauswahl wird unterstützt**).
3.  Das System liest und importiert die Dateien nacheinander. Importierte Konfigurationen werden an die Liste angehängt.

Es werden JSON-Formate mit einzelnen Konfigurationsobjekten oder Konfigurationsarrays unterstützt. Beim Import wird eine neue ID generiert, um Konflikte mit vorhandenen Konfigurationen zu vermeiden.

## Konfiguration bearbeiten

1.  **Rechtsklicken** Sie auf eine Konfigurationskarte und wählen Sie **"Konfiguration bearbeiten"**.
2.  Ändern Sie im Bearbeitungsdialog den **Konfigurationsnamen**, den **Sprachmodelltyp** (bei nicht voreingestellten Konfigurationen änderbar) sowie die verschiedenen Parameter für diesen Typ (API-Adresse, Schlüssel, Modell usw.).
3.  Klicken Sie auf **Bestätigen** zum Speichern oder auf **Abbrechen**, um die Änderungen zu verwerfen. **Es gibt keinen "Ungespeichert"-Zustand**: Änderungen werden erst nach Bestätigung übernommen.

Erläuterungen zu den Konfigurationsparametern für verschiedene LLM-Typen finden Sie unter [[settings.llm-types|LLM-Typkonfiguration]].

## Konfiguration löschen

1.  **Rechtsklicken** Sie auf eine Konfigurationskarte und wählen Sie **"Konfiguration löschen"** (bei voreingestellten Konfigurationen ist diese Option nicht sichtbar).
2.  Bestätigen Sie den Löschvorgang im Bestätigungsdialog.
3.  Wenn die aktuell verwendete Konfiguration gelöscht wird, wechselt das System automatisch zu einer anderen Konfiguration.

## Konfiguration exportieren

-   **Einzelexport**: Rechtsklick auf Karte → **Konfiguration exportieren**, um die aktuelle Konfiguration als JSON-Datei zu speichern.
-   Die exportierte Datei kann zur Sicherung oder zum Wiederherstellen auf anderen Geräten/Konten über "Konfiguration importieren" verwendet werden.

## Best Practices

1.  **Namenskonventionen**: Verwenden Sie klare Konfigurationsnamen wie "Arbeit-Ollama", "Experiment-OpenAI".
2.  **Regelmäßige Sicherungen**: Wichtige Konfigurationen regelmäßig exportieren und sichern.
3.  **Vor Nutzung prüfen**: Neue oder geänderte Konfigurationen mit der "Prüfen"-Funktion auf der Karte auf Konnektivität testen.
4.  **Unbenutzte Konfigurationen bereinigen**: Regelmäßig nicht mehr verwendete Konfigurationen löschen, um die Liste übersichtlich zu halten.

## Verwandte Dokumentation

-   [[settings.llm|LLM-Konfiguration]]
-   [[settings.llm-types|LLM-Typkonfiguration]]
-   [[ai.chat|KI-Chat-Funktion]]
-   [[agent.introduction|Agent-Konfigurationsverwaltung]]

<QuickStartPanel mode="demo" />

<MainTabs mode="demo" />