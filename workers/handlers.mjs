// Worker-Seite des Beispiels: Je Task-Typ (Topic) im BPMN-Modell gibt es genau einen Handler.
// Die Handler sind hier bewusst nur Platzhalter. In echt würden sie über die Flowable-REST-API
// (External Worker Tasks) offene Aufgaben holen und die CiviCRM-API v4 aufrufen.
// Der Drift-Check in scripts/check.mjs vergleicht diese Liste mit allen Prozessmodellen:
// Jeder Topic im Modell braucht einen Handler, und jeder Handler muss in mindestens einem Modell vorkommen.
// Topics, die mehrere Prozesse nutzen, werden nur einmal implementiert.

export const handlers = {
  'civicrm.membership.create-pending': {
    description: 'Prüft die Angaben und legt die Mitgliedschaft mit Status Pending an',
    produces: ['angabenGueltig'],
    async run(/* variables */) {
      // Platzhalter: CiviCRM API v4 aufrufen, Plausibilität liegt in CiviCRM
      return { angabenGueltig: true };
    },
  },
  'civicrm.membership.activate': {
    description: 'Setzt die Mitgliedschaft auf Current',
    produces: [],
    async run(/* variables */) {
      return {};
    },
  },
  'civicrm.membership.reject': {
    description: 'Vermerkt die Ablehnung und informiert die Person',
    produces: [],
    async run(/* variables */) {
      return {};
    },
  },
  'civicrm.participant.register': {
    description: 'Prüft freie Plätze und legt die Teilnahme mit Status Pending an',
    produces: ['platzFrei'],
    async run(/* variables */) {
      return { platzFrei: true };
    },
  },
  'civicrm.participant.confirm': {
    description: 'Setzt die Teilnahme auf Registered und versendet die Bestätigung',
    produces: [],
    async run(/* variables */) {
      return {};
    },
  },
  'civicrm.participant.cancel': {
    description: 'Setzt die Teilnahme auf Cancelled und gibt den Platz frei',
    produces: [],
    async run(/* variables */) {
      return {};
    },
  },
  'finance.invoice.create': {
    description: 'Erstellt die Rechnung im Finanzsystem und versendet sie',
    produces: [],
    async run(/* variables */) {
      return {};
    },
  },
};

// Variablen, die ein User Task im Orchestrator liefert, wenn es abgeschlossen wird.
// Schlüssel: Prozess-ID aus dem BPMN, dann ID des Schritts.
export const userTaskOutputs = {
  mitglied_werden: { Freigeben: ['freigegeben'] },
  veranstaltung_anmelden: { Zahlung: [] },
};
