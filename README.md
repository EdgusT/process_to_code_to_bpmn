# process_to_code_to_bpmn

Beispiel für **Docs as Code**: Ein Prozess („Mitglied werden“) liegt als BPMN-Datei im Repository, seine Parameter als JSON. Eine Pipeline prüft beides, rendert das Diagramm und veröffentlicht eine Doku-Seite auf GitHub Pages.

Das Repository ist ein Entwurf für die Diskussion, wie Prozesse in einem Composable Stack (Experience, Orchestration, Domain Services mit CiviCRM) dokumentiert werden können. Es enthält ausschließlich ein fiktives Beispiel.

## Was liegt wo

| Pfad | Inhalt |
|---|---|
| `processes/<id>/<id>.bpmn` | Der Ablauf eines Prozesses: Bahnen, Schritte, Timer, Task-Typen und die Zuordnung je Schritt (`pc:mapping`) |
| `processes/<id>/parameters.json` | Parameter dieses Prozesses, zum Beispiel `autoAcceptAfterDays` |
| `processes/<id>/parameters.schema.json` | JSON-Schema: Typ, Grenzen, Bedeutung, Verantwortliche und Umrechnung in Prozessvariablen (`x-variable`) |
| `processes/<id>/meta.json` | Domäne (= Prozess-Owner) und Status des Prozesses |
| `catalog/participants.json` | Katalog der Beteiligten: Domänen, Teams, Systeme und Plattformen. Jede Bahn und jedes System in einem Prozess muss hier stehen |
| `workers/handlers.mjs` | Platzhalter für die Worker: ein Handler je Task-Typ, geteilt über alle Prozesse |
| `scripts/check.mjs` | Prüfungen je Prozess und prozessübergreifend (siehe unten) |
| `scripts/render-svg.mjs` | Rendert jedes BPMN als SVG (Playwright mit dem bpmn.io-Viewer) |
| `scripts/build-site.mjs` | Baut die Prozesslandkarte `site/index.html` und eine Seite je Prozess |
| `.github/workflows/docs.yml` | Pipeline: prüfen, rendern, bauen, veröffentlichen |

Die **Domäne** ist der Prozess-Owner. Sie steht in `meta.json` und als Name des Pools im Diagramm, die Prüfung vergleicht beides. Der Button „Änderung beantragen“ öffnet ein vorbelegtes Issue-Formular (`.github/ISSUE_TEMPLATE/prozessaenderung.yml`).

Aktuell enthalten: **Mitglied werden** (Domäne Beziehungsmanagement) und **Veranstaltung anmelden** (Domäne Veranstaltungsmanagement, mit Finanzsystem).

## Owner und Beteiligte

Der **Pool** im Diagramm ist die Domäne des Prozess-Owners. Die **Bahnen** darin sind weitere Beteiligte: andere Domänen (zum Beispiel Finanzen), Teams, Systeme und Plattformen (Portal, Orchestrierung). Damit sie überall gleich heißen und sich filtern lassen, stehen alle in `catalog/participants.json`:

- **Domäne:** zählt als Beteiligte, wenn sie nicht selbst Owner ist.
- **Team** (zum Beispiel Backoffice): zählt zur angegebenen Domäne.
- **System** (zum Beispiel CiviCRM): zählt als Beteiligte, auch wenn es nur in der Zuordnung eines Schritts vorkommt.
- **Plattform** (Portal, Orchestrierung): wird nicht als Beteiligte angezeigt.

Die Übersicht filtert nach Prozess-Owner und nach Beteiligten. Ein Klick auf eine Beteiligte in der Liste setzt den Filter.

## Aufbau der Seite

Die Seite ist für Domänen (Prozess-Owner) und Fachanwender gedacht, nicht für Entwickler.

- **Prozessübersicht** (`/`): Liste aller Prozesse mit Domäne und einstellbaren Werten, Filter nach Domäne, Direktlink mit `#Domäne`, Erklärung der Änderung.
- **Prozessseite** (`/prozesse/<id>/`): Diagramm, Schritte in einfacher Sprache, einstellbare Werte mit Erlaubnisbereich, Buttons „Ändern beantragen“ und „Anderen Ablauf beantragen“ (öffnen ein vorbelegtes Issue).
- **Technische Details** (`/technik/`): Zuordnung der Schritte, Task-Typen und Worker, Systemmatrix, Prozessvariablen, Prüfergebnisse, Quelldateien. Verlinkt im Seitenfuß.

Die einfache Sprache kommt aus dem BPMN selbst: Jeder Schritt hat eine Beschreibung (`bpmn:documentation`, im Modeler im Feld „Documentation“), jeder Parameter einen `title` im Schema. Die Pipeline prüft, dass beides vorhanden ist.

## Neuen Prozess anlegen

1. Ordner `processes/<id>/` anlegen (die ID ist der Ordnername, Kleinbuchstaben mit Bindestrich).
2. Dort `<id>.bpmn`, `parameters.json`, `parameters.schema.json` und `meta.json` ablegen. Am schnellsten kopierst du einen vorhandenen Prozess und passt ihn an.
3. Für jeden neuen Task-Typ (Topic) einen Handler in `workers/handlers.mjs` ergänzen, und für jedes User Task die gelieferten Variablen unter `userTaskOutputs` eintragen.
4. `npm run check` ausführen. Pushen. Der Prozess erscheint automatisch auf der Seite.

## Lokal ausführen

```bash
npm ci
npm run check    # Prüfungen
npm run render   # SVGs erzeugen (braucht Chromium: npx playwright install chromium, oder CHROMIUM_PATH setzen)
npm run build    # Seite nach site/ bauen
```

## Was `npm run check` prüft

Je Prozess:

1. Die Parameter passen zum JSON-Schema.
2. Domäne, Status und Beschreibung sind angegeben, und der Pool im Diagramm heißt wie die Domäne.
3. Die BPMN-Datei lässt sich fehlerfrei lesen.
4. Jeder Schritt hat Ebene, Verantwortliche und Umsetzung.
5. Variablen in Bedingungen und Timern sind bekannt (Parameter oder Ergebnis eines Schritts dieses Prozesses).
6. Jeder Knoten liegt in einer Bahn, und die Zeichnung passt dazu.
7. Die Zeichnung ist vollständig: Formen und Pfeile vorhanden, keine Überlappungen, Pfeile enden an den Formen.

Prozessübergreifend:

8. Die Prozess-IDs sind eindeutig.
9. **Drift-Check:** Die Task-Typen in allen Modellen und die Handler im Code stimmen überein, in beide Richtungen.

## Beispiel: Frist ändern

Die automatische Annahme nach Fristablauf ist ein Timer im Modell. Der Wert steht in `parameters.json`:

```diff
-  "autoAcceptAfterDays": 60
+  "autoAcceptAfterDays": 30
```

Nach Merge prüft die Pipeline den Wert gegen das Schema und die Doku-Seite zeigt automatisch 30 Tage. Aus dem Parameter wird die Prozessvariable `autoAcceptDuration` (`P30D`) abgeleitet, die der Timer erwartet. Welche Variable und welches Format, steht je Parameter im Schema unter `x-variable`.

## Veröffentlichung einrichten

Einmalig im Repository: **Settings → Pages → Source: GitHub Actions**. Danach veröffentlicht jeder Push auf `main` die Seite. Hinweis: Eine Pages-Seite aus einem öffentlichen Repository ist öffentlich.

## Annahmen und Grenzen

- Die Schreibweise für die Engine folgt **Flowable** (External Worker Tasks mit `flowable:type="external-worker"` und `flowable:topic`, Timer-Dauer als Prozessvariable im ISO-8601-Format). Das Modell wurde in diesem Repository **nicht in Flowable ausgeführt**.
- Das Finanzsystem im zweiten Prozess ist fiktiv. Die Handler in `workers/handlers.mjs` sind Platzhalter und rufen kein CiviCRM auf.
- Der Deploy-Schritt, der Parameter als Prozessvariablen an Flowable übergibt, ist nicht Teil des Beispiels.
- Die Zuordnung (`pc:mapping`) ist eine eigene Erweiterung im Namespace `https://github.com/EdgusT/process_to_code_to_bpmn/mapping`. Sie ist gültiges BPMN, wird aber von Modelern nur als unbekannte Erweiterung angezeigt.
