// Rendert die BPMN-Datei als SVG. Läuft in der CI (GitHub Actions) mit Playwright/Chromium,
// weil der bpmn.io-Viewer einen Browser braucht. Ergebnis: site/diagram.svg
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, paths } from './lib.mjs';

const viewerJs = path.join(root, 'node_modules/bpmn-js/dist/bpmn-viewer.production.min.js');
const xml = await readFile(paths.bpmn, 'utf8');
const harness = path.join(paths.site, '.render-harness.html');

await mkdir(paths.site, { recursive: true });
await writeFile(
  harness,
  `<!doctype html><meta charset="utf-8"><div id="c" style="width:1600px;height:800px"></div>` +
    `<script src="${pathToFileURL(viewerJs).href}"></script>`,
);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[browser]', m.text()));
  page.on('pageerror', (e) => console.error('[browser error]', e.message));
  await page.goto(pathToFileURL(harness).href);
  const svg = await page.evaluate(async (bpmnXml) => {
    const viewer = new window.BpmnJS({ container: '#c' });
    await viewer.importXML(bpmnXml);
    const { svg } = await viewer.saveSVG();
    return svg;
  }, xml);
  if (!svg || !svg.includes('<svg')) throw new Error('Der Viewer hat kein SVG geliefert');
  await writeFile(path.join(paths.site, 'diagram.svg'), svg);
  console.log(`SVG geschrieben: site/diagram.svg (${svg.length} Zeichen)`);
} finally {
  await browser.close();
  await rm(harness, { force: true });
}
