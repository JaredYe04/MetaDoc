# LLM-Konfiguration

## Übersicht

Die LLM-Konfiguration (Large Language Model) ist die Kerneinstellung der MetaDoc AI-Funktionen. Durch die Konfiguration des LLM können Sie intelligente Funktionen wie KI-Chat, KI-Korrekturlesen, KI-Vervollständigung und mehr aktivieren. MetaDoc unterstützt mehrere LLM-Dienstanbieter, Sie können je nach Bedarf das passende Modell auswählen.

## LLM aktivieren

<SettingLlmSection mode="demo" />

### KI-Funktionen einschalten

Auf der LLM-Einstellungsseite müssen Sie zunächst die LLM-Funktion aktivieren:

1.  Finden Sie den Schalter "LLM aktivieren"
2.  Schalten Sie den Schalter in den Zustand "Aktiviert"
3.  Das System lädt automatisch die Standard-LLM-Konfiguration

Sie können über die obere Menüleiste auf die Einstellungen zugreifen:

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### LLM-Einstellungsoberfläche

Die folgende Abbildung zeigt die Hauptfunktionsbereiche der LLM-Konfigurationsseite:

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

Die obige Abbildung zeigt die Hauptkomponenten der LLM-Einstellungsoberfläche:

-   **Globale Einstellungen**: LLM-Aktivierungsschalter, Temperatur-Reglerschieber, Option zum Entfernen von Think-Tags
-   **Konfigurationsliste**: Links werden alle konfigurierten LLM-Anbieter angezeigt (z.B. OpenAI, Ollama, Gemini usw.)
-   **Konfigurationsdetails**: Rechts werden die detaillierten Parameter der ausgewählten Konfiguration angezeigt (API-Adresse, Modellauswahl, Token-Limit usw.)
-   **Testbereich**: Hier können Sie testen, ob die aktuelle Konfiguration ordnungsgemäß funktioniert
-   **Aktionsschaltflächen**: Funktionen wie neue Konfiguration erstellen, Konfiguration importieren/exportieren, Konfiguration löschen

Im Demo-Modus können Sie das Layout der Oberfläche interaktiv betrachten, Änderungen werden jedoch nicht tatsächlich gespeichert.

Erst nach Aktivierung des LLM können Sie die folgenden KI-Funktionen nutzen:

-   KI-Chat
-   KI-Korrekturlesen
-   KI-Autovervollständigung
-   KI-Assistentenfunktionen
-   Agent-Framework

**Wichtige Hinweise**:

-   Nach Aktivierung des LLM können bestimmte Funktionen API-Aufrufe tätigen und Kosten verursachen.
-   Es wird empfohlen, den LLM-Dienst zu konfigurieren, bevor Sie ihn aktivieren.
-   Wenn Sie keine KI-Funktionen benötigen, können Sie sie deaktiviert lassen, um Ressourcen zu sparen.

## LLM-Temperatureinstellung

<SettingLlmSection mode="demo" />

### Den Temperaturparameter verstehen

Die Temperatur (Temperature) ist ein Parameter, der die Zufälligkeit des von der KI generierten Textes steuert:

-   **Niedrige Temperatur (0-0,5)**: Ergebnisse sind deterministischer und konsistenter, geeignet für Szenarien, die genaue Antworten erfordern.
-   **Mittlere Temperatur (0,5-1,0)**: Ausgewogen zwischen Kreativität und Genauigkeit, geeignet für die meisten Szenarien.
-   **Hohe Temperatur (1,0-2,0)**: Ergebnisse sind vielfältiger und kreativer, geeignet für kreatives Schreiben.

### Einstellungsempfehlungen

-   **Technische Dokumentation**: Empfohlen 0,3-0,5, um inhaltliche Genauigkeit sicherzustellen.
-   **Kreatives Schreiben**: Empfohlen 0,7-1,0, um die Inhaltsvielfalt zu erhöhen.
-   **Code-Generierung**: Empfohlen 0,2-0,4, um die Code-Genauigkeit zu gewährleisten.
-   **Dialog/Kommunikation**: Empfohlen 0,7-0,9, um einen natürlichen und flüssigen Gesprächsverlauf zu erhalten.

Die Temperatureinstellung beeinflusst alle Funktionen, die das LLM nutzen, einschließlich KI-Chat, KI-Vervollständigung, KI-Korrekturlesen usw.

## Automatisches Entfernen von Denk-Tags

### Funktionsbeschreibung

Einige LLMs können beim Generieren von Inhalten Denkprozesse (thinking process) enthalten, die normalerweise mit speziellen Tags markiert sind. Wenn "Denk-Tags automatisch entfernen" aktiviert ist, filtert MetaDoc diese Tags automatisch heraus und behält nur den endgültig generierten Inhalt bei.

**Geeignete Szenarien**:

-   Verwendung von LLMs, die Denkprozesse unterstützen (wie einige Open-Source-Modelle)
-   Wunsch nach prägnanteren Ausgabeergebnissen
-   Keine Notwendigkeit, den Denkprozess der KI einzusehen

**Wichtige Hinweise**:

-   Wenn Ihr LLM keine Denk-Tags unterstützt, hat diese Option keine Auswirkung.
-   In manchen Fällen kann das Beibehalten des Denkprozesses hilfreich sein, um die Entscheidungslogik der KI zu verstehen.

## Konfigurationsverwaltung

<SettingLlmSection mode="demo" />

### Unterstützung mehrerer Konfigurationen

MetaDoc unterstützt die Erstellung mehrerer LLM-Konfigurationen, sodass Sie in verschiedenen Szenarien unterschiedliche Modelle verwenden können:

-   **Arbeitskonfiguration**: Für die tägliche Arbeit, mit einem stabilen und zuverlässigen Modell.
-   **Experimentelle Konfiguration**: Zum Testen neuer Modelle oder Funktionen.
-   **Verschiedene Anbieter**: Erstellen Sie separate Konfigurationen für verschiedene LLM-Dienste.

### Konfiguration wechseln

In der linken Konfigurationsliste auf der LLM-Einstellungsseite können Sie:

1.  **Konfiguration auswählen**: Klicken Sie auf einen Konfigurationseintrag, um zu dieser Konfiguration zu wechseln.
2.  **Konfigurationsinformationen anzeigen**: Der Konfigurationsname wird in der Liste angezeigt.
3.  **Aktuelle Konfiguration erkennen**: Die aktuell verwendete Konfiguration wird hervorgehoben.

Nach dem Wechsel der Konfiguration verwenden alle KI-Funktionen sofort den LLM-Dienst der neuen Konfiguration.

## Konfigurationsstatusanzeige

<SettingLlmSection mode="demo" />

### Nicht gespeicherte Änderungen

Wenn Sie eine Konfiguration geändert, aber noch nicht gespeichert haben, zeigt das System den Hinweis "Nicht gespeicherte Änderungen" an:

-   Neben dem Konfigurationsnamen wird ein Warnsymbol angezeigt.
-   In der Statusleiste des Arbeitsbereichs wird "Es gibt nicht gespeicherte Änderungen" angezeigt.
-   Sie müssen auf die Schaltfläche "Änderungen speichern" klicken, um die Änderungen zu speichern.

### Änderungen speichern

Vergessen Sie nach dem Ändern einer Konfiguration nicht, auf die Schaltfläche "Änderungen speichern" zu klicken:

1.  Klicken Sie auf die Schaltfläche "Änderungen speichern" oben rechts im Arbeitsbereich.
2.  Das System speichert alle Änderungen der aktuellen Konfiguration.
3.  Nach erfolgreichem Speichern wird der Status auf "Alle Änderungen gespeichert" aktualisiert.

### Änderungen verwerfen

Wenn Sie die aktuellen Änderungen nicht speichern möchten:

1.  Klicken Sie auf die Schaltfläche "Änderungen verwerfen".
2.  Das System stellt den Zustand des letzten Speichervorgangs wieder her.
3.  Alle nicht gespeicherten Änderungen werden verworfen.

## Wichtige Hinweise

1.  **API-Schlüsselsicherheit**: Bewahren Sie Ihre API-Schlüssel sicher auf und teilen Sie sie nicht mit anderen.
2.  **Kostenkontrolle**: Die Nutzung von LLM-Diensten kann Kosten verursachen, achten Sie auf Ihr Nutzungsvolumen.
3.  **Netzwerkverbindung**: Für die Nutzung externer APIs ist eine stabile Netzwerkverbindung erforderlich.
4.  **Konfigurationssicherung**: Wichtige Konfigurationen sollten exportiert und gesichert werden, um Datenverlust zu vermeiden.
5.  **Modellauswahl**: Unterschiedliche Modelle haben unterschiedliche Fähigkeiten und Einschränkungen, wählen Sie entsprechend Ihren Anforderungen.

## Verwandte Dokumentation

-   [[settings.llm-management|LLM-Konfigurationsverwaltung]]
-   [[settings.llm-types|LLM-Typkonfiguration]]
-   [[ai.chat|KI-Chat-Funktion]]
-   [[ai.completion|KI-Autovervollständigung]]
-   [[ai.proofread|KI-Korrekturlesefunktion]]