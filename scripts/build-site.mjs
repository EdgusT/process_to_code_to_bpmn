// Baut die Doku-Seite (site/index.html) aus Modell, Parametern und Prüfergebnissen.
// Das Diagramm kommt aus site/diagram.svg, das scripts/render-svg.mjs in der CI erzeugt.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { runChecks } from './check.mjs';
import { paths, loadAll } from './lib.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TYPE_LABEL = {
  StartEvent: 'Start',
  ServiceTask: 'Systemaufruf (Worker)',
  UserTask: 'Aufgabe für Menschen',
  BoundaryEvent: 'Timer',
};

const { results, model, params, derived, ok } = await runChecks();
if (!ok) {
  console.error('Prüfungen fehlgeschlagen, die Seite wird nicht gebaut.');
  process.exit(1);
}
const { schema } = await loadAll();

let commit = process.env.GITHUB_SHA ?? '';
if (!commit) {
  try { commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { commit = 'lokal'; }
}
const built = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

const svgPath = path.join(paths.site, 'diagram.svg');
const diagram = existsSync(svgPath)
  ? (await readFile(svgPath, 'utf8')).replace(/^<\?xml[^>]*\?>\s*/, '')
  : '<p class="note">Das Diagramm wird in der CI aus der BPMN-Datei gerendert (npm run render). Lokal ist es nicht vorhanden.</p>';

const steps = model.nodes.filter((n) => n.mapping);
const stepRows = steps
  .map((n) => `<tr>
    <td>${esc(n.name)}</td>
    <td>${esc(TYPE_LABEL[n.type] ?? n.type)}</td>
    <td>${esc(n.mapping.layer)}</td>
    <td>${esc(n.mapping.system ?? n.mapping.ui ?? '')}</td>
    <td>${esc(n.mapping.owner)}</td>
    <td>${esc(n.mapping.implementation)}</td>
    <td><code>${esc(n.topic ?? '')}</code></td>
  </tr>`)
  .join('\n');

const paramRows = Object.entries(schema.properties)
  .filter(([key]) => key !== '$schema')
  .map(([key, def]) => `<tr>
    <td><code>${esc(key)}</code></td>
    <td><strong>${esc(params[key])}</strong> ${esc(def['x-unit'] ?? '')}</td>
    <td>${esc(def['x-owner'] ?? '')}</td>
    <td>${esc(def.description ?? '')}</td>
  </tr>`)
  .join('\n');

const derivedRows = Object.entries(derived)
  .map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td><code>${esc(v)}</code></td></tr>`)
  .join('\n');

const checkItems = results
  .map((r) => `<li class="${r.ok ? 'ok' : 'fail'}"><span class="mark">${r.ok ? 'bestanden' : 'fehlgeschlagen'}</span> ${esc(r.name)}${r.info ? ` <span class="muted">(${esc(r.info)})</span>` : ''}</li>`)
  .join('\n');

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prozess: ${esc(model.processName)}</title>
<style>
  :root { --ink:#14263A; --paper:#F6F3EC; --card:#FBFAF6; --line:#DDD8CB; --accent:#1F6F78; --warm:#A8531A; --muted:#5E6B78; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family: Calibri, Carlito, Arial, sans-serif; line-height:1.5; }
  header { background:var(--ink); color:var(--paper); padding:32px 24px; }
  header h1 { margin:0 0 4px; font-size:2rem; }
  header p { margin:0; color:#C9D3DD; }
  main { max-width:1200px; margin:0 auto; padding:24px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px 24px; margin:0 0 24px; }
  h2 { margin:0 0 12px; font-size:1.35rem; }
  table { width:100%; border-collapse:collapse; font-size:.95rem; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:600; }
  code { font-family: Consolas, "Courier New", monospace; font-size:.9em; }
  .diagram { overflow-x:auto; }
  .diagram svg { max-width:100%; height:auto; }
  ul.checks { list-style:none; padding:0; margin:0; }
  ul.checks li { padding:4px 0; }
  .mark { display:inline-block; min-width:7.5em; font-weight:600; }
  .ok .mark { color:var(--accent); }
  .fail .mark { color:var(--warm); }
  .muted, .note { color:var(--muted); }
  footer { color:var(--muted); font-size:.9rem; padding:0 24px 32px; max-width:1200px; margin:0 auto; }
  a { color:var(--accent); }
</style>
</head>
<body>
<header>
  <h1>Prozess: ${esc(model.processName)}</h1>
  <p>Beispiel für Docs as Code: Diagramm, Parameter und Zuordnung entstehen aus den Dateien im Repository.</p>
</header>
<main>
  <section>
    <h2>Diagramm</h2>
    <div class="diagram">${diagram}</div>
  </section>
  <section>
    <h2>Schritte und Zuordnung</h2>
    <table>
      <thead><tr><th>Schritt</th><th>Art</th><th>Ebene</th><th>System / Oberfläche</th><th>Verantwortlich</th><th>Umsetzung</th><th>Task-Typ</th></tr></thead>
      <tbody>
${stepRows}
      </tbody>
    </table>
  </section>
  <section>
    <h2>Parameter</h2>
    <table>
      <thead><tr><th>Parameter</th><th>Wert</th><th>Entscheidet</th><th>Bedeutung</th></tr></thead>
      <tbody>
${paramRows}
      </tbody>
    </table>
    <p class="muted">Daraus abgeleitete Prozessvariablen für die Engine:</p>
    <table>
      <thead><tr><th>Variable</th><th>Wert</th></tr></thead>
      <tbody>
${derivedRows}
      </tbody>
    </table>
  </section>
  <section>
    <h2>Prüfergebnis der Pipeline</h2>
    <ul class="checks">
${checkItems}
    </ul>
  </section>
  <section>
    <h2>Quellen</h2>
    <ul>
      <li><a href="downloads/mitglied-werden.bpmn">mitglied-werden.bpmn</a></li>
      <li><a href="downloads/parameters.json">parameters.json</a></li>
      <li><a href="downloads/parameters.schema.json">parameters.schema.json</a></li>
    </ul>
  </section>
</main>
<footer>Stand: ${esc(built)} · Commit <code>${esc(commit.slice(0, 7))}</code></footer>
</body>
</html>
`;

await mkdir(path.join(paths.site, 'downloads'), { recursive: true });
await writeFile(path.join(paths.site, 'index.html'), html);
await copyFile(paths.bpmn, path.join(paths.site, 'downloads/mitglied-werden.bpmn'));
await copyFile(paths.params, path.join(paths.site, 'downloads/parameters.json'));
await copyFile(paths.schema, path.join(paths.site, 'downloads/parameters.schema.json'));
console.log('Seite geschrieben: site/index.html');
