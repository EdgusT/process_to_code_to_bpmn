// Worker-Seite des Beispiels: Je Task-Typ (Topic) im BPMN-Modell gibt es genau einen Handler.
// Die Handler sind hier bewusst nur Platzhalter. In echt würden sie über die Flowable-REST-API
// (External Worker Tasks) offene Aufgaben holen und die CiviCRM-API v4 aufrufen.
// Der Drift-Check in scripts/check.mjs vergleicht diese Liste mit dem Modell.

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
};

// Variablen, die das User Task im Orchestrator liefert, wenn es abgeschlossen wird.
export const userTaskOutputs = {
  Freigeben: ['freigegeben'],
};
