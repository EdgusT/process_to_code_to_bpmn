import Ajv from 'ajv';
import { pathToFileURL } from 'node:url';
import { loadAll, extractModel, extractDiagram, deriveVariables } from './lib.mjs';
import { handlers, userTaskOutputs } from '../workers/handlers.mjs';

const EL_KEYWORDS = new Set(['true', 'false', 'null', 'empty', 'not', 'and', 'or', 'eq', 'ne', 'lt', 'gt', 'le', 'ge', 'div', 'mod']);

function variablesIn(expression) {
  const found = new Set();
  for (const m of expression.matchAll(/\$\{([^}]*)\}/g)) {
    for (const id of m[1].match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      if (!EL_KEYWORDS.has(id)) found.add(id);
    }
  }
  return found;
}

function onBorder(p, b, tol = 1) {
  const inside = p.x >= b.x - tol && p.x <= b.x + b.width + tol && p.y >= b.y - tol && p.y <= b.y + b.height + tol;
  const edge =
    Math.abs(p.x - b.x) <= tol || Math.abs(p.x - (b.x + b.width)) <= tol ||
    Math.abs(p.y - b.y) <= tol || Math.abs(p.y - (b.y + b.height)) <= tol;
  return inside && edge;
}

function overlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export async function runChecks() {
  const { params, schema, definitions, warnings } = await loadAll();
  const model = extractModel(definitions);
  const diagram = extractDiagram(definitions);
  const results = [];
  const add = (name, problems, info = '') => results.push({ name, ok: problems.length === 0, problems, info });

  // 1. Parameter gegen das JSON-Schema
  {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(params);
    add(
      'Parameter passen zum JSON-Schema',
      ok ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`),
    );
  }

  // 2. BPMN lässt sich fehlerfrei lesen
  add('BPMN-Datei ist gültig lesbar', warnings.map((w) => w.message ?? String(w)));

  // 3. Zuordnung (Ebene, Verantwortliche, Umsetzung) vorhanden
  {
    const need = model.nodes.filter((n) => /Task$/.test(n.type) || n.type === 'StartEvent' || n.type === 'BoundaryEvent');
    const problems = [];
    for (const n of need) {
      if (!n.mapping) problems.push(`${n.id}: Zuordnung (pc:mapping) fehlt`);
      else for (const k of ['layer', 'owner', 'implementation']) if (!n.mapping[k]) problems.push(`${n.id}: Attribut ${k} fehlt`);
    }
    add('Jeder Schritt hat Ebene, Verantwortliche und Umsetzung', problems, `${need.length} Schritte geprüft`);
  }

  // 4. Drift-Check: Task-Typen im Modell gegen Handler im Code
  {
    const modelTopics = new Set(model.nodes.filter((n) => n.workerType === 'external-worker').map((n) => n.topic));
    const codeTopics = new Set(Object.keys(handlers));
    const problems = [];
    for (const t of modelTopics) if (!codeTopics.has(t)) problems.push(`Im Modell, aber ohne Handler: ${t}`);
    for (const t of codeTopics) if (!modelTopics.has(t)) problems.push(`Handler ohne Schritt im Modell: ${t}`);
    add('Drift-Check: Task-Typen im Modell und Handler im Code stimmen überein', problems, `${modelTopics.size} Task-Typen`);
  }

  // 5. Variablen in Ausdrücken sind bekannt (Parameter oder Ergebnis eines Schritts)
  {
    const known = new Set(Object.keys(deriveVariables(params)));
    for (const h of Object.values(handlers)) for (const v of h.produces) known.add(v);
    for (const outs of Object.values(userTaskOutputs)) for (const v of outs) known.add(v);
    const problems = [];
    const expressions = [
      ...model.flows.filter((f) => f.condition).map((f) => ({ where: f.id, text: f.condition })),
      ...model.nodes.filter((n) => n.timerDuration).map((n) => ({ where: n.id, text: n.timerDuration })),
    ];
    for (const e of expressions) {
      for (const v of variablesIn(e.text)) if (!known.has(v)) problems.push(`${e.where}: unbekannte Variable ${v}`);
    }
    add('Variablen in Bedingungen und Timern sind bekannt', problems, `${expressions.length} Ausdrücke geprüft`);
  }

  // 6. Jeder Knoten liegt in einer Bahn, und die Zeichnung passt dazu
  {
    const problems = [];
    const laneShapes = new Map();
    const proc = definitions.rootElements.find((e) => e.$type === 'bpmn:Process');
    for (const ls of proc.laneSets ?? []) for (const lane of ls.lanes ?? []) laneShapes.set(lane.name, diagram.shapes.get(lane.id));
    for (const n of model.nodes) {
      if (!n.lane) { problems.push(`${n.id}: keiner Bahn zugeordnet`); continue; }
      const s = diagram.shapes.get(n.id);
      const l = laneShapes.get(n.lane);
      if (s && l) {
        const cx = s.x + s.width / 2;
        const cy = s.y + s.height / 2;
        if (cx < l.x || cx > l.x + l.width || cy < l.y || cy > l.y + l.height) problems.push(`${n.id}: liegt in der Zeichnung nicht in der Bahn ${n.lane}`);
      }
    }
    add('Bahnen im Modell und in der Zeichnung stimmen überein', problems);
  }

  // 7. Zeichnung (Diagram Interchange): Formen vorhanden, keine Überlappung, Pfeile enden an den Formen
  {
    const problems = [];
    for (const n of model.nodes) if (!diagram.shapes.has(n.id)) problems.push(`${n.id}: keine Form in der Zeichnung`);
    for (const f of model.flows) {
      const wp = diagram.edges.get(f.id);
      if (!wp || wp.length < 2) { problems.push(`${f.id}: kein Pfeil in der Zeichnung`); continue; }
      const s = diagram.shapes.get(f.source);
      const t = diagram.shapes.get(f.target);
      if (s && !onBorder(wp[0], s)) problems.push(`${f.id}: Pfeil beginnt nicht am Rand von ${f.source}`);
      if (t && !onBorder(wp[wp.length - 1], t)) problems.push(`${f.id}: Pfeil endet nicht am Rand von ${f.target}`);
    }
    const nodes = model.nodes.filter((n) => diagram.shapes.has(n.id));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.attachedTo === b.id || b.attachedTo === a.id) continue;
        if (overlap(diagram.shapes.get(a.id), diagram.shapes.get(b.id))) problems.push(`${a.id} und ${b.id} überlappen sich`);
      }
    }
    add('Zeichnung ist vollständig und sauber (Formen, Pfeile, Überlappung)', problems);
  }

  return { results, model, params, derived: deriveVariables(params), ok: results.every((r) => r.ok) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { results, ok } = await runChecks();
  for (const r of results) {
    console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.info ? ` (${r.info})` : ''}`);
    for (const p of r.problems) console.log(`    - ${p}`);
  }
  if (!ok) {
    console.error('\nPrüfung fehlgeschlagen.');
    process.exit(1);
  }
  console.log('\nAlle Prüfungen bestanden.');
}
