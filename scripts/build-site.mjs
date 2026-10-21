// Baut die Doku-Seite aus allen Prozessen unter processes/:
//   site/index.html                      Prozesslandkarte (Übersicht über alle Prozesse)
//   site/prozesse/<id>/index.html        Detailseite je Prozess
//   site/prozesse/<id>/diagram.svg       kommt aus scripts/render-svg.mjs (CI)
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
const footer = `<footer>Stand: ${esc(built)} · Commit <code>${esc(commit.slice(0, 7))}</code></footer>`;

const CSS = `
:root { --ink:#14263A; --paper:#F6F3EC; --card:#FBFAF6; --line:#DDD8CB; --accent:#1F6F78; --warm:#A8531A; --muted:#5E6B78; }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font-family: Calibri, Carlito, Arial, sans-serif; line-height:1.5; }
header { background:var(--ink); color:var(--paper); padding:32px 24px; }
header .inner, main, footer { max-width:1200px; margin:0 auto; }
header h1 { margin:0 0 4px; font-size:2rem; }
header p { margin:0; color:#C9D3DD; }
header a { color:#C9D3DD; }
.crumb { font-size:.95rem; margin-bottom:8px; }
main { padding:24px; }
section { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px 24px; margin:0 0 24px; }
h2 { margin:0 0 12px; font-size:1.35rem; }
h3 { margin:20px 0 10px; font-size:1.1rem; color:var(--muted); font-weight:600; }
table { width:100%; border-collapse:collapse; font-size:.95rem; }
th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
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
footer { color:var(--muted); font-size:.9rem; padding:0 24px 32px; }
a { color:var(--accent); }
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin:0 0 24px; }
.tile { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 18px; }
.tile .n { font-size:2rem; font-weight:700; line-height:1.1; }
.tile .l { color:var(--muted); font-size:.95rem; }
.cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:16px; }
.pcard { display:block; background:#fff; border:1px solid var(--line); border-radius:10px; overflow:hidden; color:inherit; text-decoration:none; }
.pcard:hover { border-color:var(--accent); box-shadow:0 2px 10px rgba(20,38,58,.12); }
.pcard .thumb { background:#fff; border-bottom:1px solid var(--line); height:170px; display:flex; align-items:center; justify-content:center; padding:8px; }
.pcard .thumb img { max-width:100%; max-height:100%; }
.pcard .body { padding:14px 16px 16px; }
.pcard h3 { margin:0 0 4px; color:var(--ink); font-size:1.15rem; }
.pcard p { margin:0 0 10px; font-size:.95rem; color:var(--muted); }
.chip { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:1px 10px; margin:0 6px 4px 0; font-size:.85rem; background:var(--card); }
.badge { display:inline-block; border-radius:999px; padding:1px 10px; font-size:.85rem; font-weight:600; background:#E8A04C33; color:var(--warm); }
.badge.Produktiv { background:#1F6F7822; color:var(--accent); }
.badge.Archiviert { background:#6B645533; color:#6B6455; }
.small { font-size:.88rem; font-weight:400; }
.filters { display:flex; flex-wrap:wrap; gap:16px; align-items:center; margin:0 0 12px; }
.filters select, .filters input { font:inherit; padding:4px 8px; border:1px solid var(--line); border-radius:6px; background:#fff; }
.btn { display:inline-block; background:var(--paper); color:var(--ink) !important; padding:2px 12px; border-radius:999px; text-decoration:none; font-weight:600; font-size:.9rem; }
.meta { font-size:.9rem; color:var(--muted); margin-top:6px; }
`;

const repo = process.env.GITHUB_REPOSITORY ?? 'EdgusT/process_to_code_to_bpmn';
const changeUrl = (p) => `https://github.com/${repo}/issues/new?template=prozessaenderung.yml&title=${encodeURIComponent(`Änderung: ${p.model.processName}`)}&process=${encodeURIComponent(p.id)}&domain=${encodeURIComponent(p.meta.domain)}`;

const systemsOf = (p) => [...new Set(p.model.nodes.map((n) => n.mapping?.system).filter(Boolean))];
const stepsOf = (p) => p.model.nodes.filter((n) => n.mapping);
const link = (p, prefix = '') => `${prefix}prozesse/${p.id}/`;
const svgOf = async (p) => {
  const f = path.join(paths.site, 'prozesse', p.id, 'diagram.svg');
  return existsSync(f) ? (await readFile(f, 'utf8')).replace(/^<\?xml[^>]*\?>\s*/, '') : null;
};

const checkItems = (rs) => rs
  .map((r) => `<li class="${r.ok ? 'ok' : 'fail'}"><span class="mark">${r.ok ? 'bestanden' : 'fehlgeschlagen'}</span> ${esc(r.name)}${r.info ? ` <span class="muted">(${esc(r.info)})</span>` : ''}</li>`)
  .join('\n');

// ---------- Detailseite je Prozess ----------
async function processPage(p) {
  const diagramSvg = await svgOf(p);
  const diagram = diagramSvg ?? '<p class="note">Das Diagramm wird in der CI aus der BPMN-Datei gerendert (npm run render). Lokal ist es nicht vorhanden.</p>';

  const stepRows = stepsOf(p).map((n) => `<tr>
    <td>${esc(n.name)}</td>
    <td>${esc(TYPE_LABEL[n.type] ?? n.type)}</td>
    <td>${esc(n.mapping.layer)}</td>
    <td>${esc(n.mapping.system ?? n.mapping.ui ?? '')}</td>
    <td>${esc(n.mapping.owner)}</td>
    <td>${esc(n.mapping.implementation)}</td>
    <td><code>${esc(n.topic ?? '')}</code></td>
  </tr>`).join('\n');

  const paramRows = Object.entries(p.schema.properties)
    .filter(([key]) => key !== '$schema')
    .map(([key, def]) => `<tr>
    <td><code>${esc(key)}</code></td>
    <td><strong>${esc(p.params[key])}</strong> ${esc(def['x-unit'] ?? '')}</td>
    <td>${esc(def['x-owner'] ?? '')}</td>
    <td>${esc(def.description ?? '')}</td>
  </tr>`).join('\n');

  const derivedRows = Object.entries(p.derived)
    .map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td><code>${esc(v)}</code></td></tr>`)
    .join('\n');

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prozess: ${esc(p.model.processName)}</title>
<link rel="stylesheet" href="../../style.css">
</head>
<body>
<header><div class="inner">
  <div class="crumb"><a href="../../">Prozessübersicht</a> › ${esc(p.meta.domain)}</div>
  <h1>Prozess: ${esc(p.model.processName)}</h1>
  <p>${esc(p.model.documentation)}</p>
  <p class="meta" style="color:#C9D3DD"><span class="badge ${esc(p.meta.status)}">${esc(p.meta.status)}</span> · Prozess-Owner: <strong>${esc(p.meta.domain)}</strong> · <a class="btn" href="${esc(changeUrl(p))}">Änderung beantragen</a></p>
</div></header>
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
  <section id="pruefung">
    <h2>Prüfergebnis der Pipeline</h2>
    <ul class="checks">
${checkItems(p.results)}
    </ul>
    <p class="muted">Prozessübergreifende Prüfungen stehen auf der <a href="../../#pruefung">Übersichtsseite</a>.</p>
  </section>
  <section>
    <h2>Quellen</h2>
    <ul>
      <li><a href="downloads/${esc(p.id)}.bpmn">${esc(p.id)}.bpmn</a></li>
      <li><a href="downloads/parameters.json">parameters.json</a></li>
      <li><a href="downloads/parameters.schema.json">parameters.schema.json</a></li>
      <li><a href="downloads/meta.json">meta.json</a></li>
    </ul>
  </section>
</main>
${footer}
</body>
</html>
`;
  const outDir = path.join(paths.site, 'prozesse', p.id);
  await mkdir(path.join(outDir, 'downloads'), { recursive: true });
  await writeFile(path.join(outDir, 'index.html'), html);
  const f = processFiles(p.id);
  await copyFile(f.bpmn, path.join(outDir, 'downloads', `${p.id}.bpmn`));
  await copyFile(f.params, path.join(outDir, 'downloads/parameters.json'));
  await copyFile(f.schema, path.join(outDir, 'downloads/parameters.schema.json'));
  await copyFile(f.meta, path.join(outDir, 'downloads/meta.json'));
}

// ---------- Übersichtsseite ----------
function overview() {
  const allTopics = new Map(); // topic -> { system, procs: [] }
  for (const p of processes) {
    for (const n of p.model.nodes) {
      if (n.workerType !== 'external-worker') continue;
      if (!allTopics.has(n.topic)) allTopics.set(n.topic, { system: n.mapping?.system ?? '', procs: [] });
      allTopics.get(n.topic).procs.push(p);
    }
  }
  const systems = [...new Set(processes.flatMap(systemsOf))].sort();
  const domains = [...new Set(processes.map((p) => p.meta.domain))].sort();
  const domainOptions = domains.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
  const checksTotal = processes.reduce((a, p) => a + p.results.length, 0) + global.length;

  const listRows = [...processes].sort((x, y) => x.meta.domain.localeCompare(y.meta.domain) || x.model.processName.localeCompare(y.model.processName)).map((p) => `<tr data-domain="${esc(p.meta.domain)}" data-text="${esc((p.model.processName + ' ' + p.meta.domain + ' ' + systemsOf(p).join(' ')).toLowerCase())}">
    <td><a href="${link(p)}"><strong>${esc(p.model.processName)}</strong></a><div class="muted small">${esc(p.model.documentation)}</div></td>
    <td>${esc(p.meta.domain)}</td>
    <td><span class="badge ${esc(p.meta.status)}">${esc(p.meta.status)}</span></td>
    <td>${systemsOf(p).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</td>
    <td class="num">${stepsOf(p).length}</td>
    <td><a href="${link(p)}">Diagramm</a> · <a href="${esc(changeUrl(p))}">Änderung beantragen</a></td>
  </tr>`).join('\n');

  const matrixRows = systems.map((s) => `<tr><td>${esc(s)}</td>${processes.map((p) => {
    const n = p.model.nodes.filter((x) => x.mapping?.system === s).length;
    return `<td class="num">${n || '–'}</td>`;
  }).join('')}</tr>`).join('\n');

  const topicRows = [...allTopics.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, info]) => `<tr>
    <td><code>${esc(t)}</code></td>
    <td>${esc(info.system)}</td>
    <td>${esc(handlers[t]?.description ?? '')}</td>
    <td>${info.procs.map((p) => `<a href="${link(p)}">${esc(p.model.processName)}</a>`).join(', ')}</td>
  </tr>`).join('\n');

  const paramRows = processes.flatMap((p) => Object.entries(p.schema.properties)
    .filter(([k]) => k !== '$schema')
    .map(([k, def]) => `<tr>
    <td><a href="${link(p)}">${esc(p.model.processName)}</a></td>
    <td><code>${esc(k)}</code></td>
    <td><strong>${esc(p.params[k])}</strong> ${esc(def['x-unit'] ?? '')}</td>
    <td>${esc(def['x-owner'] ?? '')}</td>
    <td>${esc(def.description ?? '')}</td>
  </tr>`)).join('\n');

  const checkSummary = processes.map((p) => `<li class="${p.ok ? 'ok' : 'fail'}"><span class="mark">${p.ok ? 'bestanden' : 'fehlgeschlagen'}</span> <a href="${link(p)}#pruefung">${esc(p.model.processName)}</a> <span class="muted">(${p.results.length} Prüfungen)</span></li>`).join('\n');

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
  <p>Beispiel für Docs as Code: Jeder Prozess liegt als BPMN-Datei mit Parametern im Repository, diese Seite entsteht daraus bei jedem Push.</p>
</div></header>
<main>
  <div class="tiles">
    <div class="tile"><div class="n">${processes.length}</div><div class="l">Prozesse</div></div>
    <div class="tile"><div class="n">${systems.length}</div><div class="l">Systeme</div></div>
    <div class="tile"><div class="n">${allTopics.size}</div><div class="l">Task-Typen (Worker)</div></div>
    <div class="tile"><div class="n">${checksTotal}</div><div class="l">Prüfungen, alle bestanden</div></div>
  </div>
  <section>
    <h2>Prozesse</h2>
    <div class="filters">
      <label>Domäne (Prozess-Owner) <select id="f-domain"><option value="">alle</option>${domainOptions}</select></label>
      <label>Suche <input id="f-text" type="search" placeholder="Prozess oder System"></label>
      <span id="f-count" class="muted"></span>
    </div>
    <table id="plist">
      <thead><tr><th>Prozess</th><th>Domäne (Prozess-Owner)</th><th>Status</th><th>Systeme</th><th class="num">Schritte</th><th>Aktion</th></tr></thead>
      <tbody>
${listRows}
      </tbody>
    </table>
    <p class="muted small">Link zu einer Domäne: <code>#Domänenname</code> an die Adresse hängen, zum Beispiel <code>#${esc(domains[0] ?? '')}</code>.</p>
  </section>
  <section>
    <h2>So ändere ich einen Prozess</h2>
    <ol>
      <li>Prozess öffnen und prüfen, was heute gilt (Diagramm, Schritte, Parameter).</li>
      <li><strong>Änderung beantragen</strong> wählen. Das Formular ist mit dem Prozess vorbelegt. Beschreiben, was sich ändern soll und warum.</li>
      <li>Die Domäne (Prozess-Owner) entscheidet fachlich. Je nach Art der Änderung setzt das Prozessteam oder die Entwicklung sie um.</li>
      <li>Jede Änderung läuft als Merge Request: automatische Prüfung, Freigabe durch die Domäne, Veröffentlichung. Diese Seite zeigt danach den neuen Stand.</li>
    </ol>
  </section>
  <section>
    <h2>Welche Prozesse nutzen welches System</h2>
    <p class="muted">Anzahl der Schritte je System und Prozess.</p>
    <table>
      <thead><tr><th>System</th>${processes.map((p) => `<th class="num"><a href="${link(p)}">${esc(p.model.processName)}</a></th>`).join('')}</tr></thead>
      <tbody>
${matrixRows}
      </tbody>
    </table>
  </section>
  <section>
    <h2>Task-Typen und Worker</h2>
    <p class="muted">Jeder Task-Typ hat genau einen Handler im Code, auch wenn mehrere Prozesse ihn nutzen.</p>
    <table>
      <thead><tr><th>Task-Typ</th><th>System</th><th>Handler</th><th>Genutzt in</th></tr></thead>
      <tbody>
${topicRows}
      </tbody>
    </table>
  </section>
  <section>
    <h2>Parameter aller Prozesse</h2>
    <table>
      <thead><tr><th>Prozess</th><th>Parameter</th><th>Wert</th><th>Entscheidet</th><th>Bedeutung</th></tr></thead>
      <tbody>
${paramRows}
      </tbody>
    </table>
  </section>
  <section id="pruefung">
    <h2>Prüfergebnis der Pipeline</h2>
    <h3>Je Prozess</h3>
    <ul class="checks">
${checkSummary}
    </ul>
    <h3>Prozessübergreifend</h3>
    <ul class="checks">
${checkItems(global)}
    </ul>
  </section>
</main>
${footer}
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

await mkdir(paths.site, { recursive: true });
await writeFile(path.join(paths.site, 'style.css'), CSS.trim() + '\n');
for (const p of processes) await processPage(p);
await writeFile(path.join(paths.site, 'index.html'), overview());
console.log(`Seiten geschrieben: site/index.html und ${processes.length} Prozessseiten`);
