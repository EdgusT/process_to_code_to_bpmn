# process_to_code_to_bpmn

Beispiel für **Docs as Code**: Ein Prozess („Mitglied werden“) liegt als BPMN-Datei im Repository, seine Parameter als JSON. Eine Pipeline prüft beides, rendert das Diagramm und veröffentlicht eine Doku-Seite auf GitHub Pages.

Das Repository ist ein Entwurf für die Diskussion, wie Prozesse in einem Composable Stack (Experience, Orchestration, Domain Services mit CiviCRM) dokumentiert werden können. Es enthält ausschließlich ein fiktives Beispiel.

## Was liegt wo

| Pfad | Inhalt |
|---|---|
| `processes/mitglied-werden/mitglied-werden.bpmn` | Der Ablauf: Bahnen (Portal, Orchestrierung, CiviCRM, Backoffice), Schritte, Timer, Task-Typen und die Zuordnung je Schritt (`pc:mapping`) |
| `processes/mitglied-werden/parameters.json` | Parameter, zum Beispiel `autoAcceptAfterDays` |
| `schemas/parameters.schema.json` | JSON-Schema: Typ, Grenzen, Bedeutung und Verantwortliche der Parameter |
| `workers/handlers.mjs` | Platzhalter für die Worker: ein Handler je Task-Typ im Modell |
| `scripts/check.mjs` | Prüfungen (siehe unten) |
| `scripts/render-svg.mjs` | Rendert das BPMN als SVG (Playwright mit dem bpmn.io-Viewer) |
| `scripts/build-site.mjs` | Baut die Doku-Seite `site/index.html` |
| `.github/workflows/docs.yml` | Pipeline: prüfen, rendern, bauen, veröffentlichen |

## Lokal ausführen

```bash
npm ci
npm run check    # Prüfungen
npm run render   # SVG erzeugen (braucht Chromium: npx playwright install chromium)
npm run build    # Seite nach site/ bauen
```

## Was `npm run check` prüft

1. Die Parameter passen zum JSON-Schema.
2. Die BPMN-Datei lässt sich fehlerfrei lesen.
3. Jeder Schritt hat Ebene, Verantwortliche und Umsetzung.
4. **Drift-Check:** Die Task-Typen im Modell und die Handler im Code stimmen überein, in beide Richtungen.
5. Variablen in Bedingungen und Timern sind bekannt (Parameter oder Ergebnis eines Schritts).
6. Jeder Knoten liegt in einer Bahn, und die Zeichnung passt dazu.
7. Die Zeichnung ist vollständig: Formen und Pfeile vorhanden, keine Überlappungen, Pfeile enden an den Formen.

## Beispiel: Frist ändern

Die automatische Annahme nach Fristablauf ist ein Timer im Modell. Der Wert steht in `parameters.json`:

```diff
-  "autoAcceptAfterDays": 60
+  "autoAcceptAfterDays": 30
```

Nach Merge prüft die Pipeline den Wert gegen das Schema und die Doku-Seite zeigt automatisch 30 Tage. Aus dem Parameter wird die Prozessvariable `autoAcceptDuration` (`P30D`) abgeleitet, die der Timer erwartet.

## Veröffentlichung einrichten

Einmalig im Repository: **Settings → Pages → Source: GitHub Actions**. Danach veröffentlicht jeder Push auf `main` die Seite. Hinweis: Eine Pages-Seite aus einem öffentlichen Repository ist öffentlich.

## Annahmen und Grenzen

- Die Schreibweise für die Engine folgt **Flowable** (External Worker Tasks mit `flowable:type="external-worker"` und `flowable:topic`, Timer-Dauer als Prozessvariable im ISO-8601-Format). Das Modell wurde in diesem Repository **nicht in Flowable ausgeführt**.
- Die Handler in `workers/handlers.mjs` sind Platzhalter und rufen kein CiviCRM auf.
- Der Deploy-Schritt, der Parameter als Prozessvariablen an Flowable übergibt, ist nicht Teil des Beispiels.
- Die Zuordnung (`pc:mapping`) ist eine eigene Erweiterung im Namespace `https://github.com/EdgusT/process_to_code_to_bpmn/mapping`. Sie ist gültiges BPMN, wird aber von Modelern nur als unbekannte Erweiterung angezeigt.
