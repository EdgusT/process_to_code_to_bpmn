import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BpmnModdle } from 'bpmn-moddle';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const paths = {
  bpmn: path.join(root, 'processes/mitglied-werden/mitglied-werden.bpmn'),
  params: path.join(root, 'processes/mitglied-werden/parameters.json'),
  schema: path.join(root, 'schemas/parameters.schema.json'),
  site: path.join(root, 'site'),
};

export async function loadAll() {
  const [xml, paramsText, schemaText] = await Promise.all([
    readFile(paths.bpmn, 'utf8'),
    readFile(paths.params, 'utf8'),
    readFile(paths.schema, 'utf8'),
  ]);
  const moddle = new BpmnModdle();
  const { rootElement: definitions, warnings } = await moddle.fromXML(xml);
  return {
    xml,
    params: JSON.parse(paramsText),
    schema: JSON.parse(schemaText),
    definitions,
    warnings,
  };
}

// Parameter (fachlich lesbar) -> Prozessvariablen (technisch, so erwartet sie das BPMN-Modell).
// Der Timer in Flowable braucht eine Dauer im ISO-8601-Format, z. B. P30D.
// Der Deploy-Schritt muss diese Variablen beim Prozessstart mitgeben (nicht Teil dieses Beispiels).
export function deriveVariables(params) {
  return {
    autoAcceptDuration: `P${params.autoAcceptAfterDays}D`,
  };
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
        mapping: mappingOf(el),
      });
    }
  }
  return { processId: proc.id, processName: proc.name, nodes, flows };
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
