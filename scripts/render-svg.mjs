// Rendert alle BPMN-Dateien als SVG. Läuft in der CI (GitHub Actions) mit Playwright/Chromium,
// weil der bpmn.io-Viewer einen Browser braucht. Ergebnis: site/prozesse/<id>/diagram.svg
// Lokal kann mit CHROMIUM_PATH ein vorhandener Browser genutzt werden.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, paths, listProcessIds, processFiles } from './lib.mjs';

const viewerJs = path.join(root, 'node_modules/bpmn-js/dist/bpmn-viewer.production.min.js');
const harness = path.join(paths.site, '.render-harness.html');

await mkdir(paths.site, { recursive: true });
await writeFile(
  harness,
  `<!doctype html><meta charset="utf-8"><div id="c" style="width:1600px;height:800px"></div>` +
    `<script src="${pathToFileURL(viewerJs).href}"></script>`,
);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[browser]', m.text()));
  page.on('pageerror', (e) => console.error('[browser error]', e.message));
  await page.goto(pathToFileURL(harness).href);
  for (const id of await listProcessIds()) {
    const xml = await readFile(processFiles(id).bpmn, 'utf8');
    const svg = await page.evaluate(async (bpmnXml) => {
      const viewer = new window.BpmnJS({ container: '#c' });
      try {
        await viewer.importXML(bpmnXml);
        return (await viewer.saveSVG()).svg;
      } finally {
        viewer.destroy();
      }
    }, xml);
    if (!svg || !svg.includes('<svg')) throw new Error(`Der Viewer hat für ${id} kein SVG geliefert`);
    const outDir = path.join(paths.site, 'prozesse', id);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'diagram.svg'), svg);
    console.log(`SVG geschrieben: site/prozesse/${id}/diagram.svg (${svg.length} Zeichen)`);
  }
} finally {
  await browser.close();
  await rm(harness, { force: true });
}
