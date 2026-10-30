// Pruebas de extremo a extremo con Chromium (Playwright). Requiere el servidor en marcha: node scripts/serve.mjs 4173
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/opt/npm-tools/');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const base = process.argv[2] || 'http://localhost:4173';
const shots = process.env.SHOTS || '';
const results = [];
const ok = (name, cond, extra = '') => { results.push([name, !!cond, extra]); console.log(`${cond ? 'OK  ' : 'FALLA'} ${name}${extra ? ' — ' + extra : ''}`); };
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ignore = (t) => /GPU stall|ReadPixels/.test(t);

// 1. todas las páginas: estado 200, un h1, sin errores de consola, sin desbordamiento horizontal
const sm = fs.readFileSync('dist/sitemap.xml', 'utf8');
const paths = [...sm.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]).concat(['/proyectos/']);
for (const [w, h, tag] of [[1366, 850, 'escritorio'], [390, 844, 'móvil']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  for (const p of paths) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !ignore(m.text())) errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(e.message));
    const r = await page.goto(base + p);
    await page.waitForTimeout(p === '/' || p.includes('laboratorio') ? 1500 : 250);
    const info = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, over: document.documentElement.scrollWidth - innerWidth, title: document.title, desc: !!document.querySelector('meta[name=description]')?.content, canon: !!document.querySelector('link[rel=canonical]') }));
    ok(`${tag} ${p}`, r.status() === 200 && info.h1 === 1 && info.over <= 1 && !errs.length && info.desc && info.canon, `h1=${info.h1} over=${info.over} err=${errs.join('|').slice(0, 120)}`);
    if (shots && (p === '/' || p === '/plantillas/' || p === '/guias/qr-llavero-3d/')) await page.screenshot({ path: `${shots}/${tag}-${p.replace(/\W+/g, '_')}.png`, fullPage: true });
    await page.close();
  }
  await ctx.close();
}

// 2. editor: exportaciones reales
{
  const ctx = await b.newContext({ viewport: { width: 1366, height: 850 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(base + '/crear/');
  await page.fill('input[type=url]', 'https://example.com/prueba');
  await page.waitForTimeout(600);
  for (const kind of ['svg', 'png', 'pdf']) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`.quick [data-export="${kind}"]`)]);
    const path = await dl.path();
    const buf = fs.readFileSync(path);
    const sig = kind === 'svg' ? buf.toString('utf8', 0, 200).includes('<svg') : kind === 'png' ? buf.slice(1, 4).toString() === 'PNG' : buf.slice(0, 4).toString() === '%PDF';
    ok(`editor exporta ${kind}`, sig, `${buf.length} bytes`);
  }
  // 3. editor → laboratorio comparten borrador; descarga STL válido
  await page.waitForTimeout(1200);
  await page.goto(base + '/laboratorio-3d/');
  await page.waitForFunction(() => window.__lab?.model, null, { timeout: 20000 });
  const src = await page.textContent('#lab-source');
  ok('laboratorio usa el QR del editor', /Origen/.test(src), src.slice(0, 80));
  for (const k of ['stl', '3mf', 'obj', 'glb', 'zip']) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-dl="${k}"]`)]);
    const buf = fs.readFileSync(await dl.path());
    ok(`laboratorio descarga ${k}`, buf.length > 200, `${dl.suggestedFilename()} ${buf.length} bytes`);
  }
  await ctx.close();
}

// 4. publicidad y consentimiento: sin aceptar no se carga el script de anuncios; con marcador tampoco
{
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto(base + '/guias/qr-wifi/');
  await page.waitForTimeout(600);
  ok('no se carga adsbygoogle sin consentimiento', !reqs.some((u) => /googlesyndication|doubleclick/.test(u)));
  ok('no hay huecos de anuncio visibles con identificador de marcador', await page.evaluate(() => [...document.querySelectorAll('.ad-slot')].every((e) => getComputedStyle(e).display === 'none' || e.offsetHeight === 0)));
  await ctx.close();
}
await b.close();
const bad = results.filter((r) => !r[1]);
console.log(`\n${results.length - bad.length}/${results.length} comprobaciones correctas`);
process.exit(bad.length ? 1 : 0);
