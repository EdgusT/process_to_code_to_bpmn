import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BpmnModdle } from 'bpmn-moddle';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const paths = {
  processes: path.join(root, 'processes'),
  site: path.join(root, 'site'),
};

// Konvention: processes/<id>/ enthält <id>.bpmn, parameters.json, parameters.schema.json und meta.json.
// Jeder Ordner mit einer <id>.bpmn gehört automatisch zur Prozesslandkarte.
export async function listProcessIds() {
  const entries = await readdir(paths.processes, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && existsSync(path.join(paths.processes, e.name, `${e.name}.bpmn`)))
    .map((e) => e.name)
    .sort();
}

export function processFiles(id) {
  const dir = path.join(paths.processes, id);
  return {
    dir,
    bpmn: path.join(dir, `${id}.bpmn`),
    params: path.join(dir, 'parameters.json'),
    schema: path.join(dir, 'parameters.schema.json'),
    meta: path.join(dir, 'meta.json'),
  };
}

export async function loadProcess(id) {
  const files = processFiles(id);
  const read = (f) => readFile(f, 'utf8');
  const [xml, paramsText, schemaText, metaText] = await Promise.all([
    read(files.bpmn),
    read(files.params),
    read(files.schema),
    read(files.meta),
  ]);
  const moddle = new BpmnModdle();
  const { rootElement: definitions, warnings } = await moddle.fromXML(xml);
  return {
    id,
    files,
    xml,
    params: JSON.parse(paramsText),
    schema: JSON.parse(schemaText),
    meta: JSON.parse(metaText),
    definitions,
    warnings,
  };
}

// Parameter (fachlich lesbar) -> Prozessvariablen (technisch, so erwartet sie das BPMN-Modell).
// Das Schema sagt je Parameter, wie er umgerechnet wird (x-variable). Der Timer in Flowable
// braucht eine Dauer im ISO-8601-Format, z. B. P30D. Der Deploy-Schritt muss diese Variablen
// beim Prozessstart mitgeben (nicht Teil dieses Beispiels).
const FORMATS = {
  isoDays: (v) => `P${v}D`,
  asIs: (v) => v,
};

export function deriveVariables(params, schema) {
  const out = {};
  for (const [key, def] of Object.entries(schema.properties ?? {})) {
    const spec = def['x-variable'];
    if (!spec || !(key in params)) continue;
    const fn = FORMATS[spec.format];
    if (!fn) throw new Error(`Unbekanntes Format "${spec.format}" bei Parameter ${key}`);
    out[spec.name] = fn(params[key]);
  }
  return out;
}

function mappingOf(element) {
  const values = element.extensionElements?.values ?? [];
  const m = values.find((v) => v.$type === 'pc:mapping');
  if (!m) return null;
  // Unbekannte Namespaces liefert bpmn-moddle als generisches Element, die Attribute liegen direkt daran.
  const { $type, $attrs, $parent, ...attrs } = m;
  return { ...attrs, ...($attrs ?? {}) };
}

export function extractModel(definitions) {
  const proc = definitions.rootElements.find((e) => e.$type === 'bpmn:Process');
  const laneOf = new Map();
  for (const ls of proc.laneSets ?? []) {
    for (const lane of ls.lanes ?? []) {
      for (const ref of lane.flowNodeRef ?? []) laneOf.set(ref.id, lane.name);
    }
  }
  const nodes = [];
  const flows = [];
  for (const el of proc.flowElements ?? []) {
    if (el.$type === 'bpmn:SequenceFlow') {
      flows.push({
        id: el.id,
        name: el.name ?? '',
        source: el.sourceRef?.id,
        target: el.targetRef?.id,
        condition: el.conditionExpression?.body ?? null,
      });
    } else {
      const timer = (el.eventDefinitions ?? []).find((d) => d.$type === 'bpmn:TimerEventDefinition');
      nodes.push({
        id: el.id,
        name: el.name ?? '',
        type: el.$type.replace('bpmn:', ''),
        lane: laneOf.get(el.id) ?? null,
        topic: el.$attrs?.['flowable:topic'] ?? null,
        workerType: el.$attrs?.['flowable:type'] ?? null,
        attachedTo: el.attachedToRef?.id ?? null,
        timerDuration: timer?.timeDuration?.body ?? null,
        documentation: (el.documentation ?? []).map((d) => d.text).join(' ').trim(),
        mapping: mappingOf(el),
      });
    }
  }
  const collab = definitions.rootElements.find((e) => e.$type === 'bpmn:Collaboration');
  const participantName = (collab?.participants ?? []).find((x) => x.processRef?.id === proc.id)?.name ?? null;
  const documentation = (proc.documentation ?? []).map((d) => d.text).join(' ').trim();
  return { processId: proc.id, processName: proc.name, participantName, documentation, nodes, flows };
}

export function extractDiagram(definitions) {
  const plane = definitions.diagrams?.[0]?.plane;
  const shapes = new Map();
  const edges = new Map();
  for (const pe of plane?.planeElement ?? []) {
    const id = pe.bpmnElement?.id;
    if (!id) continue;
    if (pe.$type === 'bpmndi:BPMNShape') {
      const b = pe.bounds;
      shapes.set(id, { x: b.x, y: b.y, width: b.width, height: b.height });
    } else if (pe.$type === 'bpmndi:BPMNEdge') {
      edges.set(id, (pe.waypoint ?? []).map((w) => ({ x: w.x, y: w.y })));
    }
  }
  return { shapes, edges };
}
