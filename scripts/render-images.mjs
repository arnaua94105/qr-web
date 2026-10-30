// Genera las imágenes de la portada a partir del visor 3D real (capturas del modelo, no ilustraciones externas).
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const base = process.argv[2] || 'http://localhost:4173';
const jobs = [['placa-qr-3d', 0], ['llavero-qr-3d', 1], ['grabado-qr-3d', 2], ['dos-colores-qr-3d', 3]];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
await p.goto(base + '/laboratorio-3d/');
await p.waitForFunction(() => window.__lab?.model, null, { timeout: 20000 });
for (const [name, i] of jobs) {
  await p.click(`.preset >> nth=${i}`);
  await p.waitForTimeout(1500);
  await p.click('[data-view="iso"]');
  await p.evaluate(() => { document.getElementById('opt-measures').checked = false; document.getElementById('opt-grid').checked = false; document.getElementById('opt-grid').dispatchEvent(new Event('change')); document.getElementById('opt-measures').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(700);
  await p.locator('.viewer-wrap').screenshot({ path: `src/web/img/${name}.png` });
  console.log(name);
}
await b.close();
