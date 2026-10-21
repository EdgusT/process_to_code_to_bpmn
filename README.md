# process_to_code_to_bpmn

Beispiel für **Docs as Code**: Ein Prozess („Mitglied werden“) liegt als BPMN-Datei im Repository, seine Parameter als JSON. Eine Pipeline prüft beides, rendert das Diagramm und veröffentlicht eine Doku-Seite auf GitHub Pages.

Das Repository ist ein Entwurf für die Diskussion, wie Prozesse in einem Composable Stack (Experience, Orchestration, Domain Services mit CiviCRM) dokumentiert werden können. Es enthält ausschließlich ein fiktives Beispiel.

## Was liegt wo

| Pfad | Inhalt |
|---|---|
| `processes/<id>/<id>.bpmn` | Der Ablauf eines Prozesses: Bahnen, Schritte, Timer, Task-Typen und die Zuordnung je Schritt (`pc:mapping`) |
| `processes/<id>/parameters.json` | Parameter dieses Prozesses, zum Beispiel `autoAcceptAfterDays` |
| `processes/<id>/parameters.schema.json` | JSON-Schema: Typ, Grenzen, Bedeutung, Verantwortliche und Umrechnung in Prozessvariablen (`x-variable`) |
| `processes/<id>/meta.json` | Bereich, Verantwortliche und Status des Prozesses |
| `workers/handlers.mjs` | Platzhalter für die Worker: ein Handler je Task-Typ, geteilt über alle Prozesse |
| `scripts/check.mjs` | Prüfungen je Prozess und prozessübergreifend (siehe unten) |
| `scripts/render-svg.mjs` | Rendert jedes BPMN als SVG (Playwright mit dem bpmn.io-Viewer) |
| `scripts/build-site.mjs` | Baut die Prozesslandkarte `site/index.html` und eine Seite je Prozess |
| `.github/workflows/docs.yml` | Pipeline: prüfen, rendern, bauen, veröffentlichen |

Aktuell enthalten: **Mitglied werden** (Mitgliedschaft) und **Veranstaltung anmelden** (Veranstaltungen, mit Finanzsystem).

## Aufbau der Seite

- **Übersicht** (`/`): Kacheln mit Kennzahlen, Prozesskarten mit Vorschaubild nach Bereich gruppiert, Matrix „Welche Prozesse nutzen welches System“, Liste der Task-Typen mit Handler und Nutzung, alle Parameter aller Prozesse, Prüfergebnis.
- **Prozessseite** (`/prozesse/<id>/`): Diagramm, Schritte mit Zuordnung, Parameter mit abgeleiteten Variablen, Prüfergebnis und Downloads der Quelldateien.

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
2. Bereich, Verantwortliche, Status und Beschreibung sind angegeben.
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
