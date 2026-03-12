# LLM-Konfiguration

## Übersicht

Die LLM-Konfiguration (Large Language Model) ist die Kerneinstellung der MetaDoc AI-Funktionen. Durch die Konfiguration des LLM können Sie intelligente Funktionen wie KI-Chat, KI-Korrekturlesen, KI-Vervollständigung und mehr aktivieren. MetaDoc unterstützt mehrere LLM-Dienstanbieter, Sie können je nach Bedarf das passende Modell auswählen.

## LLM aktivieren

<SettingLlmSection mode="demo" />

### KI-Funktionen einschalten

Auf der LLM-Einstellungsseite müssen Sie zunächst die LLM-Funktion aktivieren:

1.  Finden Sie den Schalter "LLM aktivieren".
2.  Schalten Sie den Schalter in den Zustand "Aktiviert".
3.  Das System lädt automatisch die Standard-LLM-Konfiguration.

Sie können über die obere Menüleiste auf die Einstellungen zugreifen:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### LLM-Einstellungsoberfläche

Die folgende Abbildung zeigt die Hauptfunktionsbereiche der LLM-Konfigurationsseite:

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

Die obige Abbildung zeigt die Hauptkomponenten der LLM-Einstellungsoberfläche:

-   **Globale Einstellungen**: LLM-Aktivierungsschalter, Temperatur-Reglerschieber, Option zum Entfernen von Think-Tags, Standarderlaubnis für Terminalausführung usw.
-   **Konfigurationsraster**: Zeigt alle Konfigurationen in Kartenform an, jede Karte zeigt den Konfigurationsnamen und den Typ (z.B. OpenAI, Tongyi Qianwen, DeepSeek, Ollama usw.); Klicken Sie auf eine Karte, um sie zu verwenden, die aktuelle Konfiguration wird mit einem grünen Rahmen hervorgehoben.
-   **Kartenaktionen**: Rechts auf der Karte können Sie die Frage-Antwort- und Chat-Streaming-Fähigkeit dieser Konfiguration "prüfen"; Das Kontextmenü unterstützt Kopieren, Bearbeiten, Exportieren und Löschen.
-   **Aktionen oben**: Rechts oben im Raster können Sie eine neue Konfiguration erstellen oder Konfigurationen stapelweise aus einer Datei importieren.

Im Demo-Modus können Sie das Layout der Oberfläche interaktiv betrachten, Änderungen werden jedoch nicht tatsächlich gespeichert.

Nachdem Sie das LLM aktiviert haben, können Sie die folgenden KI-Funktionen nutzen:

-   KI-Chat
-   KI-Korrekturlesen
-   KI-Autovervollständigung
-   KI-Assistenten-Funktionen
-   Agent-Framework

**Wichtige Hinweise**:

-   Nach Aktivierung des LLM können bestimmte Funktionen API-Aufrufe tätigen und Kosten verursachen.
-   Es wird empfohlen, den LLM-Dienst zu konfigurieren, bevor Sie ihn aktivieren.
-   Wenn Sie keine KI-Funktionen benötigen, können Sie ihn deaktiviert lassen, um Ressourcen zu sparen.

## LLM-Temperatureinstellung

<SettingLlmSection mode="demo" />

### Den Temperaturparameter verstehen

Die Temperatur (Temperature) ist ein Parameter, der die Zufälligkeit des von der KI generierten Textes steuert:

-   **Niedrige Temperatur (0-0,5)**: Die Ergebnisse sind deterministischer und konsistenter, geeignet für Szenarien, die genaue Antworten erfordern.
-   **Mittlere Temperatur (0,5-1,0)**: Ein Gleichgewicht zwischen Kreativität und Genauigkeit, geeignet für die meisten Szenarien.
-   **Hohe Temperatur (1,0-2,0)**: Die Ergebnisse sind vielfältiger und kreativer, geeignet für kreatives Schreiben.

### Einstellungsempfehlungen

-   **Technische Dokumentation**: Empfohlen 0,3-0,5, um inhaltliche Genauigkeit sicherzustellen.
-   **Kreatives Schreiben**: Empfohlen 0,7-1,0, um die Inhaltsvielfalt zu erhöhen.
-   **Code-Generierung**: Empfohlen 0,2-0,4, um die Code-Genauigkeit zu gewährleisten.
-   **Dialog/Kommunikation**: Empfohlen 0,7-0,9, um einen natürlichen und flüssigen Dialog zu erhalten.

Die Temperatureinstellung beeinflusst alle Funktionen, die das LLM nutzen, einschließlich KI-Chat, KI-Vervollständigung, KI-Korrekturlesen usw.

## Automatisches Entfernen von Denk-Tags

### Funktionsbeschreibung

Einige LLMs können beim Generieren von Inhalten Denkprozesse (thinking process) enthalten, die normalerweise mit speziellen Tags gekennzeichnet sind. Wenn Sie "Denk-Tags automatisch entfernen" aktivieren, filtert MetaDoc diese Tags automatisch heraus und behält nur den endgültig generierten Inhalt bei.

**Anwendungsfälle**:

-   Verwendung von LLMs, die Denkprozesse unterstützen (wie einige Open-Source-Modelle).
-   Wenn die Ausgabeergebnisse prägnanter sein sollen.
-   Wenn der Denkprozess der KI nicht eingesehen werden muss.

**Wichtige Hinweise**:

-   Wenn Ihr LLM keine Denk-Tags unterstützt, hat diese Option keine Auswirkung.
-   In manchen Fällen kann das Beibehalten des Denkprozesses helfen, die Entscheidungslogik der KI zu verstehen.

## Konfigurationsverwaltung

<SettingLlmSection mode="demo" />

### Unterstützung mehrerer Konfigurationen

MetaDoc unterstützt die Erstellung mehrerer LLM-Konfigurationen, um Ihnen die Verwendung verschiedener Modelle in verschiedenen Szenarien zu erleichtern:

-   **Arbeitskonfiguration**: Für die tägliche Arbeit, mit einem stabilen und zuverlässigen Modell.
-   **Experimentelle Konfiguration**: Zum Testen neuer Modelle oder Funktionen.
-   **Verschiedene Anbieter**: Erstellen Sie unabhängige Konfigurationen für verschiedene LLM-Dienste.

### Konfiguration wechseln

Im Konfigurationsraster auf der LLM-Einstellungsseite können Sie:

1.  **Konfiguration auswählen**: Klicken Sie auf eine beliebige Konfigurationskarte, um zu dieser Konfiguration zu wechseln.
2.  **Konfigurationsinformationen anzeigen**: Jede Karte zeigt den Konfigurationsnamen und den Typ an.
3.  **Aktuelle Konfiguration erkennen**: Die aktuell verwendete Konfigurationskarte wird mit einem grünen Rahmen hervorgehoben.

Nach dem Wechseln der Konfiguration verwenden alle KI-Funktionen sofort den LLM-Dienst der neuen Konfiguration. Um eine Konfiguration zu bearbeiten, öffnen Sie den Dialog über "Konfiguration bearbeiten" im Kontextmenü der Karte. Nehmen Sie im Dialogfeld Ihre Änderungen vor und klicken Sie auf "OK" zum Speichern oder auf "Abbrechen", um nicht zu speichern; Die Oberfläche unterscheidet nicht mehr zwischen "ungespeichertem" Zustand.

## Wichtige Hinweise

1.  **API-Schlüsselsicherheit**: Bewahren Sie Ihre API-Schlüssel sicher auf und teilen Sie sie nicht mit anderen.
2.  **Kostenkontrolle**: Die Nutzung von LLM-Diensten kann Kosten verursachen, achten Sie auf Ihr Nutzungsvolumen.
3.  **Netzwerkverbindung**: Die Nutzung externer APIs erfordert eine stabile Netzwerkverbindung.
4.  **Konfigurationssicherung**: Wichtige Konfigurationen sollten exportiert und gesichert werden, um Verlust zu vermeiden.
5.  **Modellauswahl**: Unterschiedliche Modelle haben unterschiedliche Fähigkeiten und Einschränkungen, wählen Sie entsprechend Ihren Anforderungen.

## Verwandte Dokumentation

-   [[settings.llm-management|LLM-Konfigurationsverwaltung]]
-   [[settings.llm-types|LLM-Typkonfiguration]]
-   [[ai.chat|KI-Chat-Funktion]]
-   [[ai.completion|KI-Autovervollständigung]]
-   [[ai.proofread|KI-Korrekturlesen-Funktion]]