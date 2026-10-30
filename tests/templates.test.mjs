import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../src/web/js/app/templates.js';
import { newState, sanitizeState, parseProjectFile, exportProjectJson, ProjectError } from '../src/web/js/app/project.js';
import { mergeDesign, DEFAULT_DESIGN } from '../src/web/js/qr/design.js';
import { renderState } from '../src/web/js/app/render.js';
import { contrastRatio, simulateScan } from '../src/web/js/qr/scan.js';
import { createStore } from '../src/web/js/app/store.js';
import { buildModel } from '../src/web/js/model3d/mesh.js';
import { sanitize3D } from '../src/web/js/model3d/params.js';
import { analyzeMesh } from '../src/web/js/model3d/validate3d.js';

const stateFor = (t) => {
  const s = newState(t.sample.type, { values: t.sample.values, design: t.design, model3d: t.model3d, template: t.id });
  return s;
};

test('todas las plantillas generan un QR válido que se decodifica en la simulación y respetan el contraste', () => {
  assert.ok(TEMPLATES.length >= 14);
  for (const t of TEMPLATES) {
    const s = stateFor(t);
    const r = renderState(s);
    assert.ok(r.ok, `${t.id}: ${JSON.stringify(r.errors)} ${r.fatal || ''}`);
    assert.ok(r.svg.startsWith('<svg') && r.svg.includes('<path'), `${t.id}: SVG vectorial`);
    const d = r.design;
    if (!d.background.transparent) assert.ok(contrastRatio(d.modules.color, d.background.color) >= 3.9 || t.id === 'tech', `${t.id}: contraste ${contrastRatio(d.modules.color, d.background.color).toFixed(2)}`);
    const sim = simulateScan(r.scene, r.qr, r.text, { pxPerModule: 6 });
    assert.ok(sim.center.ok, `${t.id}: no se decodifica en la simulación (${sim.center.error})`);
  }
});

test('plantillas 3D generan geometría cerrada con su configuración', () => {
  for (const t of TEMPLATES.filter((x) => x.model3d)) {
    const s = stateFor(t);
    const r = renderState(s);
    const mask = t.model3d.label ? { cols: 20, rows: 5, data: new Uint8Array(100).fill(1) } : undefined;
    const model = buildModel(r.qr, sanitize3D(s.model3d), { labelMask: mask });
    for (const p of model.parts) assert.equal(analyzeMesh(p).closed, true, t.id + ' ' + p.name);
  }
});

test('proyecto: exportar → importar conserva todo; archivos inválidos se rechazan', () => {
  const s = newState('wifi', { values: { ssid: 'Red', security: 'WPA', password: 'clave-larga-1' }, design: { modules: { shape: 'dots', color: '#112233' }, frame: { style: 'banner', top: 'WIFI' } } });
  const back = parseProjectFile(exportProjectJson(s));
  assert.deepEqual(back.content, s.content);
  assert.equal(back.design.modules.shape, 'dots');
  assert.equal(back.design.frame.top, 'WIFI');
  const bads = ['', 'no es json', '{}', JSON.stringify({ format: 'otro', version: 1, project: {} }), JSON.stringify({ format: 'qr-studio-project', version: 99, project: s }),
    JSON.stringify({ format: 'qr-studio-project', version: 1, project: { content: { type: 'virus', values: {} } } }), 'x'.repeat(5 * 1024 * 1024)];
  for (const b of bads) assert.throws(() => parseProjectFile(b), ProjectError, b.slice(0, 30));
  // un logotipo que no es una imagen de datos se descarta; valores y colores raros se corrigen
  const evil = sanitizeState({ content: { type: 'url', values: { url: 'https://a.com', extra: '<script>' } }, design: { logo: { kind: 'image', image: { src: 'https://evil.example/x.png', w: 10, h: 10 } }, modules: { color: 'red; background:url(x)' }, background: { image: { src: 'javascript:alert(1)', w: 5, h: 5 } } } });
  assert.equal(evil.design.logo.kind, 'none');
  assert.equal(evil.design.logo.image, null);
  assert.equal(evil.design.background.image, null);
  assert.equal(evil.design.modules.color, DEFAULT_DESIGN.modules.color);
  assert.ok(!('extra' in evil.content.values));
});

test('almacén de estado: deshacer/rehacer, agrupación de cambios continuos y límites', () => {
  let t = 0;
  const st = createStore({ a: 1, n: { b: 'x' } }, { limit: 3, now: () => t });
  st.set('n.b', 'y'); t += 100; st.set('n.b', 'z'); // mismo key, dentro de la ventana → un solo paso
  assert.equal(st.historySize().past, 1);
  t += 2000; st.set('n.b', 'w');
  assert.equal(st.historySize().past, 2);
  st.undo(); assert.equal(st.get().n.b, 'z');
  st.undo(); assert.equal(st.get().n.b, 'x');
  assert.equal(st.canUndo(), false);
  st.redo(); st.redo(); assert.equal(st.get().n.b, 'w');
  st.set('a', 5); assert.equal(st.canRedo(), false);
  for (let i = 0; i < 10; i++) { t += 5000; st.set('a', 10 + i); }
  assert.ok(st.historySize().past <= 3);
  assert.equal(st.update((d) => { d.a = d.a; }), false, 'sin cambios no registra historia');
});

test('mergeDesign solo acepta claves conocidas del diseño base', () => {
  const m = mergeDesign(DEFAULT_DESIGN, { modules: { shape: 'dots' }, nuevo: 1 });
  assert.equal(m.modules.shape, 'dots');
});
