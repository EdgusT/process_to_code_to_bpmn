// Demo: Unser Mitglied-werden-BPMN läuft in einer echten Flowable-Engine.
//
// Ablauf:
//   1. Das BPMN aus processes/mitglied-werden/ wird bei Flowable bereitgestellt (deployt).
//   2. Parameter aus parameters.json werden zu Prozessvariablen (autoAcceptDuration = P30D).
//   3. Ein Prozess wird gestartet (so würde es das Portal tun).
//   4. Der Worker aus workers/handlers.mjs holt Systemaufgaben ab und erledigt sie (statt CiviCRM: Platzhalter).
//   5. Die Aufgabe für Menschen wird abgeschlossen oder der Timer löst die automatische Annahme aus.
//   6. Am Ende steht der Weg des Antrags aus dem Verlauf von Flowable.
//
// Aufruf:  node demo/run-demo.mjs [freigabe | ablehnung | timer]
// Einstellungen über Umgebungsvariablen: FLOWABLE_URL, FLOWABLE_USER, FLOWABLE_PASSWORD, TIMER (nur Szenario timer)
import { readFile } from 'node:fs/promises';
import { loadProcess, deriveVariables, processFiles } from '../scripts/lib.mjs';
import { handlers } from '../workers/handlers.mjs';

const BASE = process.env.FLOWABLE_URL ?? 'http://localhost:8080/flowable-rest';
const AUTH = 'Basic ' + Buffer.from(`${process.env.FLOWABLE_USER ?? 'rest-admin'}:${process.env.FLOWABLE_PASSWORD ?? 'test'}`).toString('base64');
const SCENARIO = process.argv[2] ?? 'freigabe';
const WORKER_ID = 'demo-worker';
const PROCESS_ID = 'mitglied-werden';
const PROCESS_KEY = 'mitglied_werden'; // Prozess-ID im BPMN
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

if (!['freigabe', 'ablehnung', 'timer'].includes(SCENARIO)) {
  console.error('Szenario unbekannt. Erlaubt: freigabe, ablehnung, timer');
  process.exit(2);
}

async function call(method, url, body, extra = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok && !extra.allow?.includes(res.status)) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const toVariables = (obj) => Object.entries(obj).map(([name, value]) => ({
  name, value, type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'integer' : 'string',
}));

// Die Prozess-API liegt je nach Version unter /service oder /process-api.
async function findApi() {
  for (let i = 0; i < 60; i++) {
    for (const p of ['/service', '/process-api']) {
      try {
        const res = await fetch(`${BASE}${p}/repository/deployments`, { headers: { Authorization: AUTH } });
        if (res.ok) return `${BASE}${p}`;
        if (res.status === 401) throw new Error('Anmeldung abgelehnt (401). FLOWABLE_USER und FLOWABLE_PASSWORD prüfen.');
      } catch (e) {
        if (String(e.message).startsWith('Anmeldung')) throw e;
      }
    }
    if (i === 0) log('Warte auf Flowable (das erste Starten dauert einige Sekunden) ...');
    await sleep(2000);
  }
  throw new Error(`Flowable unter ${BASE} nicht erreichbar. Läuft "docker compose up" in demo/?`);
}

const api = await findApi();
const ext = `${BASE}/external-job-api`;
log(`Flowable erreichbar: ${BASE}`);

// 1. Bereitstellen
const p = await loadProcess(PROCESS_ID);
const derived = deriveVariables(p.params, p.schema);
if (SCENARIO === 'timer') derived.autoAcceptDuration = process.env.TIMER ?? 'PT20S';
const xml = await readFile(processFiles(PROCESS_ID).bpmn, 'utf8');
const form = new FormData();
form.append('file', new Blob([xml], { type: 'application/xml' }), `${PROCESS_ID}.bpmn`);
const dep = await call('POST', `${api}/repository/deployments`, form);
log(`1. Modell bereitgestellt (Deployment ${dep.id})`);

// 2./3. Starten
log(`2. Parameter: autoAcceptAfterDays=${p.params.autoAcceptAfterDays} -> Variable autoAcceptDuration=${derived.autoAcceptDuration}`);
const inst = await call('POST', `${api}/runtime/process-instances`, { processDefinitionKey: PROCESS_KEY, variables: toVariables(derived) });
log(`3. Prozess gestartet (Instanz ${inst.id}), Szenario "${SCENARIO}"`);

// 4./5. Worker und Aufgaben
let humanDone = false;
const deadline = Date.now() + 5 * 60 * 1000;
let ended = false;
while (!ended && Date.now() < deadline) {
  for (const [topic, handler] of Object.entries(handlers)) {
    const jobs = await call('POST', `${ext}/acquire/jobs`, { topic, lockDuration: 'PT1M', numberOfTasks: 5, workerId: WORKER_ID });
    for (const job of jobs ?? []) {
      if (job.processInstanceId && job.processInstanceId !== inst.id) continue;
      const result = await handler.run({});
      await call('POST', `${ext}/acquire/jobs/${job.id}/complete`, { workerId: WORKER_ID, variables: toVariables(result) });
      log(`4. Worker hat Aufgabe "${topic}" erledigt (${handler.description})`);
    }
  }
  if (!humanDone && SCENARIO !== 'timer') {
    const tasks = await call('GET', `${api}/runtime/tasks?processInstanceId=${inst.id}`);
    for (const t of tasks?.data ?? []) {
      const ok = SCENARIO === 'freigabe';
      log(`5. Aufgabe für Menschen "${t.name}" wird ${ok ? 'freigegeben' : 'abgelehnt'} (im Alltag über Portal oder CiviCRM)`);
      await call('POST', `${api}/runtime/tasks/${t.id}`, { action: 'complete', variables: toVariables({ freigegeben: ok }) });
      humanDone = true;
    }
  } else if (SCENARIO === 'timer' && !humanDone) {
    const tasks = await call('GET', `${api}/runtime/tasks?processInstanceId=${inst.id}`);
    if ((tasks?.data ?? []).length) { log(`5. Aufgabe "${tasks.data[0].name}" bleibt liegen, der Timer (${derived.autoAcceptDuration}) läuft ...`); humanDone = true; }
  }
  const h = await call('GET', `${api}/history/historic-process-instances/${inst.id}`, null, { allow: [404] });
  ended = Boolean(h?.endTime);
  if (!ended) await sleep(1000);
}
if (!ended) throw new Error('Der Prozess ist nach 5 Minuten nicht beendet. In Flowable nachsehen (Timer, Worker).');

// 6. Verlauf
const hist = await call('GET', `${api}/history/historic-activity-instances?processInstanceId=${inst.id}&sort=startTime&order=asc&size=100`);
log('6. Weg des Antrags laut Verlauf von Flowable:');
for (const a of hist.data ?? []) {
  if (['sequenceFlow'].includes(a.activityType)) continue;
  console.log(`     ${String(a.activityType).padEnd(18)} ${a.activityName ?? a.activityId}`);
}
log('Fertig.');
