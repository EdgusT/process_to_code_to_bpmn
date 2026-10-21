// Baut die Doku-Seite aus allen Prozessen unter processes/:
//   site/index.html                   Prozessübersicht für Domänen (Prozess-Owner) und Fachanwender
//   site/prozesse/<id>/index.html     Prozessseite: Ablauf, einstellbare Werte, Änderung beantragen
//   site/technik/index.html           Technische Details für Entwicklung und Prozessteam
//   site/prozesse/<id>/diagram.svg    kommt aus scripts/render-svg.mjs (CI)
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { runChecks } from './check.mjs';
import { paths, processFiles } from './lib.mjs';
import { handlers } from '../workers/handlers.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TYPE_LABEL = {
  StartEvent: 'Start',
  ServiceTask: 'Systemaufruf (Worker)',
  UserTask: 'Aufgabe für Menschen',
  BoundaryEvent: 'Timer',
};
const KIND_PARAM = 'Parameter (zum Beispiel Frist oder Schwellenwert)';
const KIND_FLOW = 'Ablauf (Schritt ergänzen, entfernen oder umstellen)';

const { processes, global, ok } = await runChecks();
if (!ok) {
  console.error('Prüfungen fehlgeschlagen, die Seite wird nicht gebaut.');
  process.exit(1);
}

let commit = process.env.GITHUB_SHA ?? '';
if (!commit) {
  try { commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { commit = 'lokal'; }
}
const built = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const footer = (rel) => `<footer>Stand: ${esc(built)} · <a href="${rel}technik/">Technische Details</a> · Commit <code>${esc(commit.slice(0, 7))}</code></footer>`;

const CSS = `
:root { --ink:#14263A; --paper:#F6F3EC; --card:#FBFAF6; --line:#DDD8CB; --accent:#1F6F78; --warm:#A8531A; --muted:#5E6B78; }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font-family: Calibri, Carlito, Arial, sans-serif; line-height:1.5; font-size:1.05rem; }
header { background:var(--ink); color:var(--paper); padding:32px 24px; }
header .inner, main, footer { max-width:1100px; margin:0 auto; }
header h1 { margin:0 0 6px; font-size:2rem; }
header p { margin:0 0 6px; color:#C9D3DD; }
header a { color:#C9D3DD; }
.crumb { font-size:.95rem; margin-bottom:8px; }
main { padding:24px; }
section { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px 24px; margin:0 0 24px; }
h2 { margin:0 0 6px; font-size:1.35rem; }
h3 { margin:20px 0 10px; font-size:1.1rem; color:var(--muted); font-weight:600; }
.lead { margin:0 0 14px; color:var(--muted); }
table { width:100%; border-collapse:collapse; font-size:.97rem; }
th, td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
th { color:var(--muted); font-weight:600; }
td.num, th.num { text-align:center; }
code { font-family: Consolas, "Courier New", monospace; font-size:.9em; }
.diagram { overflow-x:auto; }
.diagram svg { max-width:100%; height:auto; }
ul.checks { list-style:none; padding:0; margin:0; }
ul.checks li { padding:4px 0; }
.mark { display:inline-block; min-width:7.5em; font-weight:600; }
.ok .mark { color:var(--accent); }
.fail .mark { color:var(--warm); }
.muted, .note { color:var(--muted); }
.small { font-size:.88rem; font-weight:400; }
footer { color:var(--muted); font-size:.9rem; padding:0 24px 32px; }
a { color:var(--accent); }
.chip { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:1px 10px; margin:0 6px 4px 0; font-size:.85rem; background:var(--card); }
.badge { display:inline-block; border-radius:999px; padding:1px 10px; font-size:.85rem; font-weight:600; background:#E8A04C33; color:var(--warm); }
.badge.Produktiv { background:#1F6F7822; color:var(--accent); }
.badge.Archiviert { background:#6B645533; color:#6B6455; }
.filters { display:flex; flex-wrap:wrap; gap:16px; align-items:center; margin:0 0 12px; }
.filters select, .filters input { font:inherit; padding:4px 8px; border:1px solid var(--line); border-radius:6px; background:#fff; }
.btn { display:inline-block; background:var(--accent); color:#fff !important; padding:4px 14px; border-radius:999px; text-decoration:none; font-weight:600; font-size:.92rem; white-space:nowrap; }
.btn.light { background:var(--paper); color:var(--ink) !important; }
.btn.ghost { background:transparent; color:var(--accent) !important; border:1px solid var(--accent); }
ol.steps { list-style:none; counter-reset:s; padding:0; margin:0; }
ol.steps li { counter-increment:s; display:grid; grid-template-columns:2.2rem 1fr auto; gap:12px; padding:10px 0; border-bottom:1px solid var(--line); align-items:start; }
ol.steps li:last-child { border-bottom:0; }
ol.steps li::before { content:counter(s); background:var(--accent); color:#fff; width:1.8rem; height:1.8rem; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.95rem; }
ol.steps.res li::before { background:var(--muted); content:"●"; font-size:.6rem; }
ol.steps .who { color:var(--muted); font-size:.9rem; white-space:nowrap; }
.how { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; margin-top:10px; }
.how div { background:#fff; border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
.how b { display:block; color:var(--accent); margin-bottom:2px; }
.cta { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-top:14px; }
`;

const repo = process.env.GITHUB_REPOSITORY ?? 'EdgusT/process_to_code_to_bpmn';
const changeUrl = (p, o = {}) => {
  const q = new URLSearchParams({
    template: 'prozessaenderung.yml',
    title: `Änderung: ${p.model.processName}${o.paramTitle ? ` – ${o.paramTitle}` : ''}`,
    process: p.id,
    domain: p.meta.domain,
  });
  if (o.kind) q.set('kind', o.kind);
  if (o.parameter) q.set('parameter', o.parameter);
  if (o.change) q.set('change', o.change);
  return `https://github.com/${repo}/issues/new?${q.toString().replace(/\+/g, '%20')}`;
};

const systemsOf = (p) => [...new Set(p.model.nodes.map((n) => n.mapping?.system).filter(Boolean))];
const stepsOf = (p) => p.model.nodes.filter((n) => n.mapping);
const link = (p, prefix = '') => `${prefix}prozesse/${p.id}/`;
const params = (p) => Object.entries(p.schema.properties).filter(([k]) => k !== '$schema').map(([key, def]) => ({
  key, def, title: def.title ?? key, value: p.params[key], unit: def['x-unit'] ?? '',
  range: def.minimum != null && def.maximum != null ? `${def.minimum} bis ${def.maximum} ${def['x-unit'] ?? ''}`.trim() : '',
}));
const svgOf = async (p) => {
  const f = path.join(paths.site, 'prozesse', p.id, 'diagram.svg');
  return existsSync(f) ? (await readFile(f, 'utf8')).replace(/^<\?xml[^>]*\?>\s*/, '') : null;
};
const checkItems = (rs) => rs
  .map((r) => `<li class="${r.ok ? 'ok' : 'fail'}"><span class="mark">${r.ok ? 'bestanden' : 'fehlgeschlagen'}</span> ${esc(r.name)}${r.info ? ` <span class="muted">(${esc(r.info)})</span>` : ''}</li>`)
  .join('\n');

// Reihenfolge der Schritte entlang des Ablaufs (Verzweigungen: zuerst der erste Zweig). Gateways und Enden werden getrennt behandelt.
function orderedNodes(model) {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const seen = new Set();
  const out = [];
  const queue = model.nodes.filter((n) => n.type === 'StartEvent').map((n) => n.id);
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    out.push(byId.get(id));
    const next = model.flows.filter((f) => f.source === id).map((f) => f.target);
    for (const b of model.nodes.filter((n) => n.attachedTo === id)) next.push(b.id);
    queue.push(...next);
  }
  return out;
}

// ---------- Prozessseite ----------
async function processPage(p) {
  const diagramSvg = await svgOf(p);
  const diagram = diagramSvg ?? '<p class="note">Das Diagramm wird in der CI aus der BPMN-Datei gerendert (npm run render). Lokal ist es nicht vorhanden.</p>';
  const nodes = orderedNodes(p.model);
  const steps = nodes.filter((n) => /Task$/.test(n.type) || n.type === 'StartEvent' || n.type === 'BoundaryEvent');
  const results = nodes.filter((n) => n.type === 'EndEvent');

  const li = (n, withWho = true) => `<li><div><strong>${n.type === 'BoundaryEvent' ? 'Zeitablauf: ' : ''}${esc(n.name)}</strong><br>${esc(n.documentation)}</div><div class="who">${withWho ? esc(n.lane ?? '') : ''}</div></li>`;
  const ps = params(p);
  const paramRows = ps.map((x) => `<tr>
    <td><strong>${esc(x.title)}</strong><div class="muted small">${esc(x.def.description ?? '')}</div></td>
    <td><strong>${esc(x.value)}</strong> ${esc(x.unit)}</td>
    <td>${esc(x.range)}</td>
    <td>${esc(x.def['x-owner'] ?? '')}</td>
    <td><a class="btn ghost" href="${esc(changeUrl(p, { kind: KIND_PARAM, parameter: x.key, paramTitle: x.title, change: `Einstellung „${x.title}“: heute ${x.value} ${x.unit}, gewünscht: ___ ${x.unit}` }))}">Ändern beantragen</a></td>
  </tr>`).join('\n');

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.model.processName)}</title>
<link rel="stylesheet" href="../../style.css">
</head>
<body>
<header><div class="inner">
  <div class="crumb"><a href="../../">Prozessübersicht</a> › ${esc(p.meta.domain)}</div>
  <h1>${esc(p.model.processName)}</h1>
  <p>${esc(p.model.documentation)}</p>
  <p>Prozess-Owner: <strong>${esc(p.meta.domain)}</strong> · <span class="badge ${esc(p.meta.status)}">${esc(p.meta.status)}</span></p>
</div></header>
<main>
  <section>
    <h2>So läuft der Prozess</h2>
    <p class="lead">Die Bahnen zeigen, wer oder welches System den Schritt erledigt.</p>
    <div class="diagram">${diagram}</div>
  </section>
  <section>
    <h2>Die Schritte</h2>
    <ol class="steps">
${steps.map(li).join('\n')}
    </ol>
    <h3>Mögliche Ergebnisse</h3>
    <ol class="steps res">
${results.map((n) => li(n, false)).join('\n')}
    </ol>
  </section>
  <section>
    <h2>Das können Sie ändern</h2>
    <p class="lead">Diese Einstellungen gehören Ihrer Domäne. Eine Änderung ist ein Antrag, den das Prozessteam umsetzt.</p>
    <table>
      <thead><tr><th>Einstellung</th><th>Heute</th><th>Erlaubt</th><th>Entscheidet</th><th></th></tr></thead>
      <tbody>
${paramRows}
      </tbody>
    </table>
    <div class="cta">
      <a class="btn" href="${esc(changeUrl(p, { kind: KIND_FLOW }))}">Anderen Ablauf beantragen</a>
      <span class="muted">Zum Beispiel einen Schritt ergänzen, entfernen oder umstellen.</span>
    </div>
  </section>
  <section>
    <h2>So läuft eine Änderung</h2>
    <div class="how">
      <div><b>1. Antrag stellen</b>Sie öffnen das Formular. Prozess und Einstellung sind schon eingetragen. Sie beschreiben, was sich ändern soll und warum.</div>
      <div><b>2. Klären</b>Das Prozessteam fragt nach, falls etwas offen ist, und sagt Ihnen, was die Änderung bedeutet.</div>
      <div><b>3. Freigeben</b>Das Prozessteam setzt die Änderung um. Als Prozess-Owner geben Sie sie frei.</div>
      <div><b>4. Fertig</b>Die Änderung wird veröffentlicht. Diese Seite zeigt danach den neuen Stand.</div>
    </div>
    <p class="muted small">Den Antrag stellen Sie als Issue (Vorgang) in GitHub. Dafür brauchen Sie ein GitHub-Konto mit Zugriff auf das Repository. Rückfragen und Fortschritt sehen Sie im selben Issue.</p>
  </section>
</main>
${footer('../../')}
</body>
</html>
`;
  const outDir = path.join(paths.site, 'prozesse', p.id);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'index.html'), html);
}

// ---------- Übersicht ----------
function overview() {
  const domains = [...new Set(processes.map((p) => p.meta.domain))].sort();
  const domainOptions = domains.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
  const rows = [...processes].sort((x, y) => x.meta.domain.localeCompare(y.meta.domain) || x.model.processName.localeCompare(y.model.processName)).map((p) => {
    const ps = params(p);
    return `<tr data-domain="${esc(p.meta.domain)}" data-text="${esc((p.model.processName + ' ' + p.meta.domain + ' ' + p.model.documentation).toLowerCase())}">
    <td><a href="${link(p)}"><strong>${esc(p.model.processName)}</strong></a><div class="muted small">${esc(p.model.documentation)}</div></td>
    <td>${esc(p.meta.domain)}</td>
    <td>${ps.map((x) => `${esc(x.title)}: <strong>${esc(x.value)} ${esc(x.unit)}</strong>`).join('<br>')}</td>
    <td><a class="btn light" href="${link(p)}">Ansehen</a> <a class="btn ghost" href="${esc(changeUrl(p))}">Änderung beantragen</a></td>
  </tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prozessübersicht</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header><div class="inner">
  <h1>Prozessübersicht</h1>
  <p>Hier sehen Sie, wie unsere Prozesse ablaufen, welche Einstellungen Sie ändern können und wie Sie eine Änderung beantragen.</p>
</div></header>
<main>
  <section>
    <h2>Prozesse</h2>
    <div class="filters">
      <label>Domäne (Prozess-Owner) <select id="f-domain"><option value="">alle</option>${domainOptions}</select></label>
      <label>Suche <input id="f-text" type="search" placeholder="Prozess oder Stichwort"></label>
      <span id="f-count" class="muted"></span>
    </div>
    <table id="plist">
      <thead><tr><th>Prozess</th><th>Domäne (Prozess-Owner)</th><th>Einstellbar</th><th></th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
    <p class="muted small">Direkter Link zu Ihrer Domäne: <code>#Domänenname</code> an die Adresse hängen, zum Beispiel <code>#${esc(domains[0] ?? '')}</code>.</p>
  </section>
  <section>
    <h2>So ändern Sie einen Prozess</h2>
    <div class="how">
      <div><b>1. Prozess ansehen</b>Öffnen Sie Ihren Prozess und sehen Sie, wie er heute läuft und was einstellbar ist.</div>
      <div><b>2. Antrag stellen</b>Wählen Sie „Änderung beantragen“. Das Formular ist vorausgefüllt, Sie beschreiben nur, was sich ändern soll.</div>
      <div><b>3. Umsetzung</b>Das Prozessteam setzt die Änderung um, Sie geben sie als Prozess-Owner frei.</div>
      <div><b>4. Fertig</b>Diese Seite zeigt danach automatisch den neuen Stand.</div>
    </div>
  </section>
</main>
${footer('')}
<script>
(function () {
  var sel = document.getElementById('f-domain'), txt = document.getElementById('f-text'), cnt = document.getElementById('f-count');
  var rows = Array.prototype.slice.call(document.querySelectorAll('#plist tbody tr'));
  function apply() {
    var d = sel.value, t = txt.value.trim().toLowerCase(), n = 0;
    rows.forEach(function (r) {
      var show = (!d || r.getAttribute('data-domain') === d) && (!t || r.getAttribute('data-text').indexOf(t) >= 0);
      r.style.display = show ? '' : 'none';
      if (show) n++;
    });
    cnt.textContent = n + ' von ' + rows.length + ' Prozessen';
    try { history.replaceState(null, '', d ? '#' + encodeURIComponent(d) : location.pathname + location.search); } catch (e) {}
  }
  var h = decodeURIComponent(location.hash.slice(1));
  if (h) for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === h) sel.value = h;
  sel.addEventListener('change', apply); txt.addEventListener('input', apply); apply();
})();
</script>
</body>
</html>
`;
}

// ---------- Technische Details ----------
async function technik() {
  const allTopics = new Map();
  for (const p of processes) {
    for (const n of p.model.nodes) {
      if (n.workerType !== 'external-worker') continue;
      if (!allTopics.has(n.topic)) allTopics.set(n.topic, { system: n.mapping?.system ?? '', procs: [] });
      allTopics.get(n.topic).procs.push(p);
    }
  }
  const systems = [...new Set(processes.flatMap(systemsOf))].sort();
  const matrixRows = systems.map((s) => `<tr><td>${esc(s)}</td>${processes.map((p) => `<td class="num">${p.model.nodes.filter((x) => x.mapping?.system === s).length || '–'}</td>`).join('')}</tr>`).join('\n');
  const topicRows = [...allTopics.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, info]) => `<tr>
    <td><code>${esc(t)}</code></td><td>${esc(info.system)}</td><td>${esc(handlers[t]?.description ?? '')}</td>
    <td>${info.procs.map((p) => `<a href="#${esc(p.id)}">${esc(p.model.processName)}</a>`).join(', ')}</td></tr>`).join('\n');

  const perProcess = processes.map((p) => {
    const stepRows = stepsOf(p).map((n) => `<tr>
      <td>${esc(n.name)}</td><td>${esc(TYPE_LABEL[n.type] ?? n.type)}</td><td>${esc(n.mapping.layer)}</td>
      <td>${esc(n.mapping.system ?? n.mapping.ui ?? '')}</td><td>${esc(n.mapping.owner)}</td><td>${esc(n.mapping.implementation)}</td><td><code>${esc(n.topic ?? '')}</code></td></tr>`).join('\n');
    const derivedRows = Object.entries(p.derived).map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td><code>${esc(v)}</code></td></tr>`).join('\n');
    return `<section id="${esc(p.id)}">
    <h2>${esc(p.model.processName)}</h2>
    <p class="lead"><a href="../${link(p)}">Zur Prozessseite</a> · Domäne ${esc(p.meta.domain)}</p>
    <table>
      <thead><tr><th>Schritt</th><th>Art</th><th>Ebene</th><th>System / Oberfläche</th><th>Verantwortlich</th><th>Umsetzung</th><th>Task-Typ</th></tr></thead>
      <tbody>
${stepRows}
      </tbody>
    </table>
    <h3>Prozessvariablen für die Engine (abgeleitet aus den Parametern)</h3>
    <table><thead><tr><th>Variable</th><th>Wert</th></tr></thead><tbody>
${derivedRows}
    </tbody></table>
    <h3>Prüfergebnis</h3>
    <ul class="checks">
${checkItems(p.results)}
    </ul>
    <h3>Quelldateien</h3>
    <ul>
      <li><a href="downloads/${esc(p.id)}/${esc(p.id)}.bpmn">${esc(p.id)}.bpmn</a></li>
      <li><a href="downloads/${esc(p.id)}/parameters.json">parameters.json</a></li>
      <li><a href="downloads/${esc(p.id)}/parameters.schema.json">parameters.schema.json</a></li>
      <li><a href="downloads/${esc(p.id)}/meta.json">meta.json</a></li>
    </ul>
  </section>`;
  }).join('\n');

  for (const p of processes) {
    const f = processFiles(p.id);
    const out = path.join(paths.site, 'technik', 'downloads', p.id);
    await mkdir(out, { recursive: true });
    await copyFile(f.bpmn, path.join(out, `${p.id}.bpmn`));
    await copyFile(f.params, path.join(out, 'parameters.json'));
    await copyFile(f.schema, path.join(out, 'parameters.schema.json'));
    await copyFile(f.meta, path.join(out, 'meta.json'));
  }

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Technische Details</title>
<link rel="stylesheet" href="../style.css">
</head>
<body>
<header><div class="inner">
  <div class="crumb"><a href="../">Prozessübersicht</a> › Technik</div>
  <h1>Technische Details</h1>
  <p>Für Entwicklung und Prozessteam: Zuordnung der Schritte, Task-Typen, Variablen, Prüfergebnisse und Quelldateien.</p>
</div></header>
<main>
  <section>
    <h2>Welche Prozesse nutzen welches System</h2>
    <p class="lead">Anzahl der Schritte je System und Prozess.</p>
    <table>
      <thead><tr><th>System</th>${processes.map((p) => `<th class="num">${esc(p.model.processName)}</th>`).join('')}</tr></thead>
      <tbody>
${matrixRows}
      </tbody>
    </table>
  </section>
  <section>
    <h2>Task-Typen und Worker</h2>
    <p class="lead">Jeder Task-Typ hat genau einen Handler im Code, auch wenn mehrere Prozesse ihn nutzen.</p>
    <table>
      <thead><tr><th>Task-Typ</th><th>System</th><th>Handler</th><th>Genutzt in</th></tr></thead>
      <tbody>
${topicRows}
      </tbody>
    </table>
  </section>
${perProcess}
  <section>
    <h2>Prozessübergreifende Prüfungen</h2>
    <ul class="checks">
${checkItems(global)}
    </ul>
  </section>
</main>
${footer('../')}
</body>
</html>
`;
}

await mkdir(paths.site, { recursive: true });
await writeFile(path.join(paths.site, 'style.css'), CSS.trim() + '\n');
for (const p of processes) await processPage(p);
await mkdir(path.join(paths.site, 'technik'), { recursive: true });
await writeFile(path.join(paths.site, 'technik', 'index.html'), await technik());
await writeFile(path.join(paths.site, 'index.html'), overview());
console.log(`Seiten geschrieben: Übersicht, ${processes.length} Prozessseiten, Technik`);
