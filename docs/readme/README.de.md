**Languages:** [Русский](../../README.md) · [English](./README.en.md) · [简体中文](./README.zh-CN.md) · [Українська](./README.uk.md) · [Tiếng Việt](./README.vi.md) · [हिन्दी](./README.hi.md) · [日本語](./README.ja.md) · **Deutsch** · [Français](./README.fr.md) · [עברית](./README.he.md) · [العربية](./README.ar.md) · [Español](./README.es.md) · [Português (BR)](./README.pt-BR.md) · [한국어](./README.ko.md) · [Türkçe](./README.tr.md) · [Bahasa Indonesia](./README.id.md)

> 📖 **Interaktive Guide-App (16 Sprachen, PDF-Layout & Versionsverlauf):** `AllY-Guide.exe` · [../index.html?lang=de](../index.html?lang=de)

# AllY · Dschinni (v0.1)

Lokale Desktop-Oberfläche für Windows, die mehrere KI-Systeme in einem Fenster vereint – mit gemeinsamem Gesprächsverlauf, lokalem Speicher auf der Festplatte, Aufgabenwarteschlange und Limitüberwachung.

*Geburtstag von AllY · Dschinni: 23. November 2026. Lizenz: MIT.*

---

## Was ist diese Anwendung und welches Problem löst sie?

Bei regelmäßiger Arbeit mit KI verteilen sich Aufgaben schnell auf verschiedene Browser-Tabs, Konsolenfenster und separate Schlüssel. Wenn das Fünf-Stunden-Limit eines Modells erreicht ist, muss man ein anderes öffnen und den Projektkontext erneut erklären.

**AllY · Dschinni** löst vier praktische Aufgaben:

- **Gemeinsamer Kontext über Modellgrenzen hinweg.** Gesprächsverlauf und persönliche Regeln werden lokal in Markdown-Dateien (`pamyat/`) gespeichert. KI-System, Modell oder Denktiefe lassen sich direkt in der Eingabezeile wechseln, damit das nächste Modell an derselben Stelle weiterarbeitet.
- **Transparente Arbeit mit CLI-Agenten.** In einem gewöhnlichen Terminal ist es schwer, den aktuellen Schritt eines Agenten rechtzeitig zu erkennen und während der Ausführung einzugreifen. AllY zeigt links eine Statuskugel und einen Verlauf der aktuellen Aktionen hinter einer fließenden vertikalen Trennlinie mit verstellbarer Breite. Rechts befinden sich Chat und Aufgabenwarteschlange – mit Unterstützung für Präzisierungen während der Ausführung (`live-steer`), das Bearbeiten der Warteschlange und das Vorziehen wichtiger Nachrichten.
- **Überwachung von Limits und Kontextfenster.** Das Widget **„Ressourcen“** zeigt das führende KI-System, die Kontextauslastung (mit einem Schwellenwert von `350k`) sowie die 5-Stunden- und Wochenkontingente der Abonnements. Der Tab **„Assistenten“** bündelt die Guthaben der übrigen Anbindungen. Die Werte werden lokal und ohne kostenpflichtige Hintergrundaufrufe ausgelesen.
- **Datenkontrolle und direkte Anbindungen.** Chatverläufe, Notizen in `pamyat/`, Skills in `.claude/skills/` und lokale Einstellungen in `.ally-data/` bleiben auf Ihrem Computer. Sie nutzen Ihre eigenen Abonnements und Schlüssel direkt bei den gewählten Anbietern.

---

## Für wen die Anwendung gedacht ist

- **Entwickler und Vibe-Coder**, die Projekte mit Claude Code, Codex, Antigravity oder DeepSeek bearbeiten und Agentenschritte, Warteschlange und Kontextverbrauch in einem steuerbaren Fenster sehen möchten.
- **Autoren, Unternehmer und Fachleute**, die einen gemeinsamen lokalen Speicher für ihre Projekte auf dem eigenen PC benötigen.
- **Nutzer von Windows 10/11**, die ein lokales Werkzeug mit anpassbarem Layout suchen und über integriertes Feedback Einfluss auf kommende Releases nehmen möchten.

---

## Was in Version 0.1 tatsächlich funktioniert

### 1. Anbindungen und Modus „Auto“
Zum Einstieg genügt mindestens eine Anbindung. Im Modus **„Auto“** wählt das System selbst einen verfügbaren Agenten:

| Anbindung | Betriebsweise | Funktionen in v0.1 |
|---|---|---|
| **Claude Code** | Offizielles CLI mit Anthropic-Pro-/Max-Abonnement | Komplexe Aufgaben, Code, Texte, Planung und automatische Kontextkomprimierung |
| **Codex** | Offizielles CLI mit ChatGPT-Plus-/Pro-Abonnement | Arbeit an Repositorys und Präzisierungen während der Antwort (`live-steer`) |
| **Antigravity** | Offizielles CLI von Google AI | Analysen mit großem Kontext (Fensterschwelle `350k`) und Kontingentüberwachung |
| **DeepSeek Harness** | Lokales Headless-Profil `dsh` auf Basis des DeepSeek-Guthabens | Kostengünstiger Reserveagent, Guthabenprüfung im Tab „Assistenten“ |
| **API-Aggregator (OpenRouter)** | Beliebiges Anthropic-kompatibles Gateway mit Base URL und Schlüssel | Anbindung externer Modelle über einen lokalen Claude Code CLI-Prozess (ohne Anthropic-Abonnement) |
| **Qoder CLI** | Lokales CLI (Erkennung und Anmeldung) | Wird vom Verbindungsassistenten erkannt (einschließlich Anmeldung im Fenster); die Rolle als führender Agent im Chat folgt im nächsten Update |

### 2. Arbeitsbereich und Oberfläche
- **Startansicht:** Links öffnet sich **„Chat“** mit reiner Statuskugel, Schritt-Timeline und fließendem Trenner; rechts sitzen **„Ressourcen“ / „Assistenten“** (oben) und **„Laptop“** (unten) mit frei verstellbarer Höhe.
- **Obere Leiste (von rechts nach links):** Uhr rechts, breites **Feedback-Panel (Käfer)**, **Pinsel** (Widgets verschieben und skalieren, Layout zurücksetzen), **Designs** (Standard: **Graphit**, dazu Türkis, Mitternacht, Dunkel, Hell), **Buch-Symbol** (integrierter Guide & Versionsverlauf im Fenster) und **Blitz** (3-stufiger Assistent mit vollbreitem **„Lesemodus“**).
- **Lokale Speicherung:** `pamyat/` (lokaler Markdown-Speicher), `.claude/skills/` (lokale Skills), `.ally-data/` (Schlüssel und Fensterlayout, von Git ausgeschlossen).

## Installation und Start (Windows 10/11)

**Stellen Sie vor der Installation sicher, dass Folgendes bereits installiert und über `PATH` verfügbar ist:**
1. **Node.js 24+** (mit Unterstützung für das integrierte Modul `node:sqlite`)
2. **Python 3**
3. **Git**
4. Internetzugang für den ersten Build (`npm ci` und Download von Electron) sowie mindestens eine angebundene KI-Engine oder ein Schlüssel.

Wählen Sie eine der drei Installationsmethoden:

### Methode 1 — per Archiv und vertrauter `.exe`
1. Laden Sie das ZIP-Archiv des Repositorys herunter und entpacken Sie es in einen kurzen Pfad ohne kyrillische Zeichen, zum Beispiel `C:\AllY`.
2. Doppelklicken Sie auf **`AllY.exe`**. Beim ersten Start prüft das Programm `node` 24+, `python` und `git`, installiert Abhängigkeiten, lädt Electron herunter, erstellt **`programma\Dzhinni.exe`**, legt die Verknüpfung **`AllY`** auf dem Desktop an und öffnet direkt das Fenster.
  *Falls Windows SmartScreen bei einer neuen unsignierten `.exe` warnt, klicke auf **Weitere Informationen → Trotzdem ausführen** (der Quellcode liegt offen in `docs/launchers/`, alternativ direkt `.\ustanovka.ps1` starten).*
3. Starten Sie die Anwendung künftig per Doppelklick auf **`AllY.exe`**, die Desktop-Verknüpfung **`AllY`** oder direkt über **`programma\Dzhinni.exe`**. Dokumentation und Versionsverlauf in einem eigenen Anwendungsfenster öffnet **`AllY-Guide.exe`**.
4. Beim ersten Start öffnet sich ein 3-stufiger Einrichtungsassistent. Verbinden Sie das gewünschte KI-System und senden Sie die erste Nachricht.

### Methode 2 — mit Terminalbefehlen (PowerShell / cmd)
Öffnen Sie PowerShell und führen Sie diese Befehle nacheinander aus:

```powershell
git clone https://github.com/AyarZero/ally-dzhinni.git C:\AllY
cd C:\AllY
.\AllY.exe
```

Den Build können Sie später mit folgendem Befehl prüfen:

```powershell
.\AllY.exe -Proverka
```

Start über das Terminal:

```powershell
.\AllY.exe
```

### Methode 3 — fertiger Prompt für Ihren lokalen KI-Assistenten
Wenn Claude Code, Codex, Antigravity oder ein anderer KI-Assistent bereits auf Ihrem Computer läuft, kopieren Sie diesen Text vollständig und senden Sie ihn an den Assistenten:

```text
Installiere die lokale Desktop-Anwendung AllY · Dschinni (v0.1) aus dem Repository https://github.com/AyarZero/ally-dzhinni auf diesem Windows-PC und bereite sie für den Start vor:
1. Prüfe im Terminal, ob `git`, `python` (Python 3) und `node` vorhanden sind (benötigt wird Node.js 24+ mit erfolgreicher Prüfung durch `node -e "require('node:sqlite')"`). Falls etwas fehlt oder die Node-Version unter 24 liegt, informiere mich und hilf mir, die fehlende Software vor dem Build zu installieren.
2. Klone das Repository in einen kurzen Pfad ohne kyrillische Zeichen und Leerzeichen, zum Beispiel `C:\AllY`, und wechsle in diesen Ordner.
3. Starte die Installation mit `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1` und warte, bis `programma\Dzhinni.exe` erstellt wurde.
4. Prüfe den Build mit dem Befehl `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1 -Proverka`.
5. Prüfe, welche CLI-Engines (Claude Code, Codex, Antigravity, DeepSeek Harness, Qoder) oder OpenRouter-Schlüssel bereits im System verfügbar sind, und teile mir kurz mit, was schon einsatzbereit ist.
6. Starte `programma\Dzhinni.exe` (oder `.\AllY.exe`) und teile mir mit, dass ich das AllY-Fenster öffnen und mit der Arbeit beginnen kann.
```

*Hinweis: Angebundene CLI-Agenten greifen direkt auf die Dateien des geöffneten Arbeitsordners zu, ohne jedes Lesen oder Bearbeiten einzeln bestätigen zu lassen. Verwalten Sie wichtige Projekte mit Git.*

---

## Feedback und Mitwirkung am Projekt

Rechts in der Kopfzeile (links neben der Uhr) befindet sich die Schaltfläche mit dem **Käfersymbol — „Feedback“**. Damit können Sie direkt aus der Oberfläche:

- Fehler, defekte Oberflächenelemente oder Startprobleme melden;
- bis zu **3 Dateien** als Belege anhängen: Textprotokolle `.txt` / `.md` (bis `2 MB`), Screenshots `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` (bis `10 MB`) oder kurze Videos `.mp4` / `.webm` / `.mov` (bis `25 MB`, insgesamt bis `30 MB`);
- ein neues Modul, einen Skill oder einen Anwendungsfall vorschlagen.

Übertragen werden **nur der Formulartext und die von Ihnen ausgewählten Dateien**. Chatverläufe, persönliche Notizen und Schlüssel bleiben lokal. Antworten der Entwickler erscheinen im Chat der Anwendung. Das Projekt steht unter der MIT-Lizenz: Sie können eigene Skills in `.claude/skills/` erstellen und an der Weiterentwicklung des Kerns mitwirken.

---

## Bekannte Probleme und Einschränkungen in v0.1, an denen wir derzeit arbeiten

Wir dokumentieren offen, was derzeit eingeschränkt ist oder noch überarbeitet wird:

1. **Umgebungsabhängigkeiten müssen vorab installiert werden:** Für die Installation von `v0.1` müssen `Node.js 24+`, `Python 3` und `Git` bereits installiert sein. Ein eigenständiger `.exe`-Installer ohne manuelle Softwarevorbereitung ist noch in Arbeit.
2. **Spracheingabe und Sprachausgabe sind im Client-Build v0.1 ausgeblendet:** Die Mikrofon- und Sprachschaltflächen wurden vorübergehend entfernt, während die lokale Spracherkennung (`GigaAM`) und deren Installer überarbeitet werden.
3. **Das Tagebuch („Ehrliches Gespräch“) ist in Client-Build v0.1 ausgeblendet:** Die Unterstützung aller Engines wird noch fertiggestellt und erscheint in einem der nächsten Updates.
4. **Verzögertes Herunterfahren der Hintergrund-Bridge nach dem Schließen des Fensters:** Beim Schließen des Fensters kann sich der lokale Bridge-Server erst nach einem Inaktivitäts-Timeout (bis zu ~9 Minuten) beenden, wenn unmittelbar eine weitere Instanz geöffnet wird.
5. **Qoder wird derzeit integriert:** Der Verbindungsassistent erkennt das lokale Qoder-CLI und den Anmeldestatus. Die Verwendung von Qoder als führendem Agenten im Chat bleibt jedoch bis zum nächsten Release deaktiviert.
6. **Serverseitiger Rollout für den Empfang großer Feedback-Anhänge:** Falls der Feedback-Server beim Senden eines Screenshots oder Videos vor Abschluss des Backend-Updates einen Größenfehler meldet oder die Datei ablehnt, lässt sich das Formular sofort als reiner Text senden, ohne den Entwurf zu verlieren.
7. **Plattform:** Nur für **Windows 10/11** getestet und gebaut.

---

## Roadmap und ungefähre Zeitplanung

Die Termine sind Richtwerte. Die nächsten Releases sind nach Wochen geplant, spätere in größeren Zeiträumen. Je nach tatsächlichem Nutzerfeedback können sie sich verschieben:

| Ungefährer Zeitraum | Geplante Veröffentlichung |
|---|---|
| **Ende November — Anfang Dezember 2026** *(1–2 Wochen)* | Korrekturen anhand erster Rückmeldungen aus der Oberfläche, vollständige serverseitige Annahme von Foto-/Videoanhängen im Feedback, sofortiges Beenden der Hintergrund-Bridge beim Schließen des Fensters |
| **Zweite Dezemberhälfte 2026** | Integrierter Tracker **„Aufgaben und Projekte“** (Tagesfokus, Board, Kalender, Karten) und Betrieb des Tabs **„Tagebuch“** mit einer beliebigen gewählten Engine |
| **Januar 2027** | Rückkehr des **lokalen Sprachmodus** (Offline-Diktat ohne Cloud + Vorlesen der Antworten) und vereinfachter Installer ohne manuelle Installation von `Node.js` und `Git` |
| **Februar — März 2027** | Bereich **„Lernen“** (Lektionsbibliothek im Fenster und kostenloser Einführungskurs zu AllY und zur Release-Vorbereitung), Baukasten für eigene Widgets und Module für Prüfung/Inhalte |
| **April — Mai 2027** | Interaktiver **Wissensgraph** des Arbeitsbereichs, Übersicht **„Projektzustand“** (Abdeckung der Verknüpfungen und veraltete Knoten) und vollständige Unterstützung von Qoder als Assistent zum Lesen von Code |
| **Juni — Juli 2027** | Beta-Release des **Android-Clients** mit Verbindung zum heimischen PC über einen geschützten Kanal ohne zweite Datenbank + Anpassung der Desktop-Anwendung für macOS und Linux |
| **August 2027 und später** | Stabiles Release `v1.0`, Katalog gemeinsamer Community-Skills und Synchronisierung des Arbeitsbereichs zwischen mehreren Geräten eines Nutzers |
