# Demo: Das BPMN läuft in Flowable

Diese Demo stellt `processes/mitglied-werden/mitglied-werden.bpmn` in einer echten Flowable-Engine bereit und spielt den Prozess durch. Sie zeigt: Dieselbe Datei, aus der die Doku-Seite entsteht, steuert die Ausführung.

**Wichtig: Diese Demo wurde noch nicht gegen eine echte Flowable-Engine ausgeführt.** Sie wurde gegen einen selbstgebauten Testserver geprüft, der die Schnittstellen nachahmt. Das belegt die Logik des Skripts, aber nicht, dass Flowable unser Modell akzeptiert. Fehler beim ersten Lauf sind möglich, siehe „Mögliche Stolpersteine“.

## Voraussetzungen

- Docker (mit `docker compose`)
- Node.js 22 und `npm ci` im Hauptverzeichnis

## Ablauf

```bash
cd demo
docker compose up -d          # startet Flowable auf http://localhost:8080/flowable-rest
cd ..
npm run demo                  # Szenario "freigabe"
npm run demo -- ablehnung     # Backoffice lehnt ab
npm run demo -- timer         # niemand entscheidet, der Timer nimmt automatisch an
```

Das erste Starten des Containers dauert einige Sekunden. Das Skript wartet darauf.

## Was passiert

1. Das BPMN wird bereitgestellt (Deployment).
2. Aus `parameters.json` wird die Prozessvariable `autoAcceptDuration` (`P30D`) abgeleitet und beim Start mitgegeben.
3. Ein Prozess startet, so wie es das Portal tun würde.
4. Der Worker aus `workers/handlers.mjs` holt die Systemaufgaben ab (`civicrm.membership.create-pending`, danach `activate` oder `reject`) und erledigt sie. CiviCRM wird dabei nicht aufgerufen, die Handler sind Platzhalter.
5. Die Aufgabe „Antrag prüfen und freigeben“ wird abgeschlossen. Im Szenario `timer` bleibt sie liegen, und der Timer löst die automatische Annahme aus. Dafür wird die Frist auf `PT20S` gesetzt (anpassbar mit `TIMER=PT10S`), damit man nicht 30 Tage wartet.
6. Am Ende steht der Weg des Antrags aus dem Verlauf von Flowable, zum Beispiel: Start, Angaben prüfen, Freigabe-Aufgabe, Frist abgelaufen, Mitgliedschaft aktivieren, Ende.

Außerdem zeigt Szenario `timer`, wie der Parameter wirkt: Ändert man `autoAcceptAfterDays`, ändert sich die Frist im Timer.

## Einstellungen

| Variable | Standard |
|---|---|
| `FLOWABLE_URL` | `http://localhost:8080/flowable-rest` |
| `FLOWABLE_USER` | `rest-admin` |
| `FLOWABLE_PASSWORD` | `test` |
| `TIMER` | `PT20S` (nur Szenario `timer`) |

## Mögliche Stolpersteine

- **Image-Version:** `docker-compose.yml` nutzt `flowable/flowable-rest` ohne feste Version. Falls das Image nicht startet oder die Pfade abweichen, eine Version festlegen.
- **Pfade der Schnittstelle:** Das Skript probiert `/service` und `/process-api` für die Prozess-API. Die Schnittstelle für Worker-Aufgaben erwartet es unter `/external-job-api`. Ist sie im Image nicht enthalten, endet das Skript mit einem Fehler bei Schritt 4.
- **Modell:** Das BPMN enthält einen Pool (Kollaboration) und eigene Zusatzfelder (`pc:mapping`). Ich gehe davon aus, dass Flowable beides ohne Fehler übernimmt. Das ist nicht geprüft.
- **Timer:** Sie brauchen den Hintergrund-Executor von Flowable. Im Image ist er normalerweise aktiv.

Bitte die Fehlermeldung zurückmelden, dann lässt sich das Modell oder das Skript anpassen.
