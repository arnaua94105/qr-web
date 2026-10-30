// Laboratorio 3D: convierte la matriz real del QR del editor en un modelo imprimible (mm).
import { createStore } from './store.js';
import { newState, sanitizeState } from './project.js';
import { renderState } from './render.js';
import { h, icon, Binder, toast, debounce } from './ui.js';
import { checkRow } from './editor-panels.js';
import { loadDraft, saveDraft, saveProject, newId } from './storage.js';
import { sanitize3D, STYLES, PART_MODES, PLATE_SHAPES, PRESETS_3D } from '../model3d/params.js';
import { buildModel, flatten } from '../model3d/mesh.js';
import { validateModel } from '../model3d/validate3d.js';
import { makeLabelMask } from './textmask.js';
import { createViewer, webglSupported } from '../viewer/gl.js';
import { partsToStl } from '../export/stl.js';
import { partsToObj } from '../export/obj.js';
import { modelToGlb } from '../export/glb.js';
import { modelTo3mf } from '../export/threemf.js';
import { makeZip } from '../export/zip.js';
import { downloadBytes, downloadBlob, safeName } from '../export/download.js';

const $ = (s, r = document) => r.querySelector(s);
const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString('es-ES');

export async function startLab() {
  const draft = await loadDraft();
  let base;
  try { base = draft ? sanitizeState(draft) : newState('url'); } catch { base = newState('url'); }
  const fromEditor = !!draft;
  const store = createStore(base);
  const root = $('#lab');
  const status = $('#lab-status'), checksEl = $('#lab-checks'), panelsEl = $('#lab-panels'), stage = $('#lab-stage'), canvas = $('#lab-canvas'), dimsEl = $('#lab-dims');
  const b = new Binder(store);
  let model = null, report = null, gen = 0, viewer = null, worker = null, busy = false;

  // ---------------------------------------------------------------- QR de origen
  const qrOut = () => renderState(store.get());
  let src = qrOut();
  let usingSample = false;
  if (!src.ok) {
    // Borrador ausente o incompleto: se usa un ejemplo, avisando claramente.
    store.replace(newState('url', { values: { url: 'https://example.com' }, model3d: store.get().model3d }), { history: false });
    src = qrOut();
    usingSample = true;
  }
  $('#lab-source').textContent = usingSample
    ? (fromEditor ? 'El código del editor está incompleto, así que se muestra un ejemplo (https://example.com).' : 'Aún no has creado un código en este navegador: se muestra un ejemplo (https://example.com).') + ' Crea el tuyo en el editor y vuelve.'
    : `Origen: «${store.get().name}» · QR de versión ${src.qr.version} (${src.qr.size}×${src.qr.size} módulos).`;
  if (usingSample) { /* no se sobrescribe el borrador del editor con el ejemplo */ }

  // ---------------------------------------------------------------- panel de parámetros
  const mm = (v) => f1(v) + ' mm';
  const rng = (path, label, min, max, step, extra = {}) => b.range({ path: 'model3d.' + path, label, min, max, step, format: mm, ...extra });
  const presets = h('div', { class: 'preset-grid' }, PRESETS_3D.map((p) => h('button', { type: 'button', class: 'preset', title: p.note, onclick: () => { store.update((d) => { d.model3d = sanitize3D({ ...d.model3d, ...p.patch }); }, { key: 'preset' }); } }, h('strong', {}, p.name), h('span', {}, p.note))));
  panelsEl.append(
    h('h3', { class: 'panel-sub first' }, 'Punto de partida'), presets,
    h('h3', { class: 'panel-sub' }, 'Forma'),
    b.segmented({ path: 'model3d.shape', label: 'Placa', options: PLATE_SHAPES, cols: 2 }),
    b.toggle({ path: 'model3d.keychain', label: 'Anilla para llavero' }),
    b.segmented({ path: 'model3d.style', label: 'Módulos', options: [['raised', 'Relieve'], ['engraved', 'Grabado']], cols: 2 }),
    b.segmented({ path: 'model3d.parts', label: 'Piezas', options: [['single', 'Una pieza'], ['separate', 'Dos colores']], cols: 2, hint: 'Con dos piezas se exporta cada color por separado para impresión multicolor.' }),
    b.toggle({ path: 'model3d.invert', label: 'Invertir módulos', hint: 'Intercambia oscuro y claro. Comprueba que tu lector admite códigos invertidos.' }),
    h('h3', { class: 'panel-sub' }, 'Medidas'),
    rng('qrMm', 'Lado del código', 10, 250, 1),
    rng('margin', 'Margen de la placa', 0, 40, 0.5),
    rng('corner', 'Radio de esquinas', 0, 30, 0.5, { when: (st) => st.model3d.shape === 'rect' }),
    rng('base', 'Grosor de la base', 0.4, 12, 0.1),
    rng('relief', 'Altura del relieve', 0.2, 6, 0.1, { when: (st) => st.model3d.style === 'raised' }),
    rng('depth', 'Profundidad del grabado', 0.2, 6, 0.1, { when: (st) => st.model3d.style === 'engraved' }),
    rng('clearance', 'Holgura entre piezas', 0, 0.6, 0.05, { when: (st) => st.model3d.style === 'engraved' && st.model3d.parts === 'separate' }),
    h('h3', { class: 'panel-sub' }, 'Borde, anilla y texto'),
    rng('rimWidth', 'Ancho del borde elevado', 0, 8, 0.2),
    rng('rimHeight', 'Altura del borde', 0.2, 6, 0.1, { when: (st) => st.model3d.rimWidth > 0 }),
    rng('holeD', 'Diámetro del orificio', 2, 12, 0.5, { when: (st) => st.model3d.keychain }),
    rng('holeWall', 'Pared alrededor del orificio', 0.8, 8, 0.2, { when: (st) => st.model3d.keychain }),
    b.text({ path: 'model3d.label', label: 'Texto bajo el código', maxlength: 40, placeholder: 'Escanéame', when: (st) => st.model3d.shape === 'rect' }),
    rng('labelBand', 'Alto de la banda de texto', 4, 30, 0.5, { when: (st) => st.model3d.shape === 'rect' && st.model3d.label.trim() }),
    h('h3', { class: 'panel-sub' }, 'Calidad y reglas de impresión'),
    rng('detail', 'Resolución en curvas', 0.1, 1, 0.05, { hint: 'Menor = más suave y más pesado. Se relaja solo si el modelo es enorme.' }),
    rng('minFeature', 'Detalle mínimo de tu impresora', 0.2, 2, 0.1, { hint: 'Aprox. dos veces el diámetro de la boquilla (0,4 mm → 0,8 mm).' }),
    rng('minThickness', 'Grosor mínimo de pared', 0.4, 4, 0.1),
    h('h3', { class: 'panel-sub' }, 'Colores de vista previa'),
    b.color({ path: 'model3d.baseColor', label: 'Base' }),
    b.color({ path: 'model3d.inkColor', label: 'Módulos' }),
  );

  // ---------------------------------------------------------------- construcción (worker + alternativa en el hilo principal)
  function ensureWorker() {
    if (worker !== null) return worker;
    try {
      worker = new Worker('/js/app/mesh-worker.js', { type: 'module' });
      worker.onerror = () => { worker = false; };
    } catch { worker = false; }
    return worker;
  }
  const sub = (o) => ({ ...o });
  function runBuild() {
    const my = ++gen;
    const st = store.get();
    const params = sanitize3D(st.model3d);
    const out = qrOut();
    if (!out.ok) return;
    const mask = params.shape === 'rect' && params.label.trim() ? makeLabelMask(params.label) : null;
    busy = true;
    status.textContent = 'Generando el modelo…';
    root.setAttribute('aria-busy', 'true');
    const done = (res) => {
      if (my !== gen) return;
      busy = false;
      root.removeAttribute('aria-busy');
      if (!res.ok) { model = null; report = null; status.textContent = 'No se pudo generar con estos ajustes: ' + res.error; paintChecks({ checks: [{ id: 'err', level: 'bad', title: 'Ajustes no válidos', detail: res.error }], worst: 'bad', parts: [] }); setExports(false); return; }
      model = res.model; report = res.report;
      for (const p of model.parts) if (!p.flat) p.flat = flatten(p);
      status.textContent = `${model.parts.length} ${model.parts.length === 1 ? 'pieza' : 'piezas'} · ${model.parts.reduce((s, p) => s + p.triangles, 0).toLocaleString('es-ES')} triángulos`;
      paintChecks(report);
      paintParts();
      setExports(report.worst !== 'bad');
      if (viewer) viewer.setModel({ ...model, keepCamera: !!viewer.state && viewer._loaded });
      if (viewer) viewer._loaded = true;
      paintDims();
    };
    const w = ensureWorker();
    if (w) {
      const handler = (e) => { if (e.data.id !== my) return; w.removeEventListener('message', handler); done(e.data); };
      w.addEventListener('message', handler);
      w.postMessage({ id: my, qr: { size: out.qr.size, version: out.qr.version, modules: out.qr.modules }, params, labelMask: mask });
    } else {
      setTimeout(() => {
        try {
          const m = buildModel(out.qr, params, { labelMask: mask });
          done({ ok: true, model: m, report: validateModel(m, params) });
        } catch (err) { done({ ok: false, error: String(err.message || err) }); }
      }, 0);
    }
  }
  const schedule = debounce(runBuild, 160);

  // ---------------------------------------------------------------- resultados
  function paintChecks(r) {
    const order = { bad: 0, warn: 1, info: 2, ok: 3 };
    const sorted = [...r.checks].sort((a, c) => order[a.level] - order[c.level]);
    $('#lab-verdict').className = 'verdict is-' + (r.worst === 'bad' ? 'bad' : r.worst === 'warn' ? 'warn' : 'ok');
    $('#lab-verdict').replaceChildren(
      h('div', { class: 'verdict-head' }, icon(r.worst === 'ok' ? 'i-check' : 'i-warn'), h('strong', {}, r.worst === 'bad' ? 'Hay problemas que corregir antes de imprimir' : r.worst === 'warn' ? 'Imprimible con advertencias' : 'Sin problemas detectados en la geometría')),
      h('p', {}, 'Son comprobaciones de la geometría generada y reglas prácticas. No garantizan el resultado en tu impresora, material o laminador: revisa siempre el modelo en tu laminador y haz una prueba pequeña.'));
    checksEl.replaceChildren(...sorted.map(checkRow));
  }
  function paintParts() {
    const host = $('#lab-parts');
    host.replaceChildren(...model.parts.map((p) => {
      const id = 'part-' + p.id;
      const cb = h('input', { type: 'checkbox', id, checked: true });
      cb.addEventListener('change', () => viewer?.setPartVisible(p.id, cb.checked));
      return h('label', { class: 'check', for: id }, cb, h('span', { class: 'swatch', style: `background:${p.color}` }), h('span', {}, `${p.name} · ${p.triangles.toLocaleString('es-ES')} tri.`));
    }));
  }
  function paintDims() {
    const d = model.dims;
    dimsEl.replaceChildren(
      h('span', {}, `Ancho ${f1(d.x)} mm`), h('span', {}, `Alto ${f1(d.y)} mm`), h('span', {}, `Grosor ${f1(d.z)} mm`),
      h('span', {}, `Módulo ${(Math.round(model.info.moduleMm * 100) / 100).toLocaleString('es-ES')} mm`));
    paintMeasures();
  }
  // cotas sobre el visor (proyectadas desde el modelo)
  const overlay = $('#lab-measures');
  function paintMeasures() {
    if (!viewer || !model || !$('#opt-measures').checked) { overlay.replaceChildren(); return; }
    const bb = model.bbox, d = model.dims;
    const pts = [
      [[(bb.min[0] + bb.max[0]) / 2, bb.min[1], bb.max[2]], `${f1(d.x)} mm`],
      [[bb.max[0], (bb.min[1] + bb.max[1]) / 2, bb.max[2]], `${f1(d.y)} mm`],
      [[bb.max[0], bb.min[1], (bb.min[2] + bb.max[2]) / 2], `${f1(d.z)} mm`],
    ];
    overlay.replaceChildren(...pts.map(([p, t]) => {
      const q = viewer.project(p);
      return q.behind ? null : h('span', { class: 'measure', style: `left:${q.x}px;top:${q.y}px` }, t);
    }).filter(Boolean));
  }

  // ---------------------------------------------------------------- visor
  const exportBtns = [...document.querySelectorAll('[data-dl]')];
  function setExports(on) { exportBtns.forEach((x) => { x.disabled = !on; }); }
  setExports(false);
  if (webglSupported()) {
    try {
      viewer = createViewer(canvas, { autoRotate: false });
      viewer.onFrame(paintMeasures);
      $('#lab-fallback').hidden = true;
    } catch (e) { viewer = null; }
  }
  if (!viewer) {
    canvas.hidden = true;
    const fb = $('#lab-fallback');
    fb.hidden = false;
    fb.querySelector('div').innerHTML = src.svg;
    stage.classList.add('no-gl');
    $('#lab-viewctl').hidden = true;
  } else {
    const view = (name) => viewer.setView(name);
    document.querySelectorAll('[data-view]').forEach((x) => x.addEventListener('click', () => view(x.dataset.view)));
    $('#opt-ortho').addEventListener('change', (e) => viewer.setOrtho(e.target.checked));
    $('#opt-grid').addEventListener('change', (e) => viewer.setGrid(e.target.checked));
    $('#opt-spin').addEventListener('change', (e) => viewer.setAutoRotate(e.target.checked));
    $('#opt-measures').addEventListener('change', paintMeasures);
    $('#opt-material').addEventListener('change', (e) => viewer.setMaterial(e.target.value));
    $('#opt-light-az').addEventListener('input', (e) => viewer.setLight({ az: Number(e.target.value) }));
    $('#opt-light-int').addEventListener('input', (e) => viewer.setLight({ intensity: Number(e.target.value) }));
    $('#opt-view-shot').addEventListener('click', async () => { const bl = await viewer.toBlob(); if (bl) downloadBlob(bl, safeName(store.get().name) + '-vista.png'); });
  }

  // ---------------------------------------------------------------- descargas
  const base0 = () => safeName(store.get().name, 'qr-3d');
  async function download(kind) {
    if (!model) return;
    try {
      const name = base0();
      if (kind === 'stl') {
        if (model.parts.length === 1) downloadBytes(partsToStl(model.parts, 'QR Studio (mm)'), `${name}.stl`, 'model/stl');
        else downloadBytes(await makeZip(model.parts.map((p) => ({ name: `${name}-${safeName(p.id)}.stl`, data: partsToStl([p], `QR Studio ${p.name} (mm)`) }))), `${name}-stl-piezas.zip`, 'application/zip');
      } else if (kind === 'obj') downloadBytes(new TextEncoder().encode(partsToObj(model.parts, store.get().name)), `${name}.obj`, 'text/plain');
      else if (kind === 'glb') downloadBytes(modelToGlb(model, store.get().name), `${name}.glb`, 'model/gltf-binary');
      else if (kind === '3mf') downloadBytes(await modelTo3mf(model, store.get().name), `${name}.3mf`, 'model/3mf');
      else if (kind === 'zip') {
        const files = model.parts.map((p) => ({ name: `${name}-${safeName(p.id)}.stl`, data: partsToStl([p], `QR Studio ${p.name} (mm)`) }));
        files.push({ name: `${name}.3mf`, data: await modelTo3mf(model, store.get().name) });
        files.push({ name: `${name}.glb`, data: modelToGlb(model, store.get().name) });
        files.push({ name: 'LEEME.txt', data: `QR Studio · modelo 3D\nUnidades: milímetros.\nPiezas: ${model.parts.map((p) => p.name).join(', ')}.\nSTL: una pieza por archivo, sin color. 3MF: piezas con color base. GLB: para visores y web.\nComprueba el modelo en tu laminador y haz una prueba antes de imprimir en serie.\nTamaño final: ${f1(model.dims.x)} × ${f1(model.dims.y)} × ${f1(model.dims.z)} mm.\n` });
        downloadBytes(await makeZip(files), `${name}-modelo-3d.zip`, 'application/zip');
      }
      toast('Descarga preparada.', { kind: 'ok' });
    } catch (e) { console.error(e); toast('No se pudo crear el archivo: ' + e.message, { kind: 'bad' }); }
  }
  exportBtns.forEach((x) => x.addEventListener('click', () => download(x.dataset.dl)));

  $('#lab-save').addEventListener('click', async () => {
    try {
      const st = store.get();
      await saveProject({ id: newId(), name: st.name + ' (3D)', state: st });
      toast('Proyecto guardado en este navegador.', { kind: 'ok' });
    } catch (e) { toast(e.message, { kind: 'bad' }); }
  });

  // ---------------------------------------------------------------- vida
  const persist = debounce(() => { const cur = store.get(); loadDraft().then((d) => saveDraft({ ...(d ? sanitizeState(d) : cur), model3d: cur.model3d })); }, 600);
  store.subscribe(() => { schedule(); if (fromEditor && !usingSample) persist(); });
  addEventListener('pagehide', () => { viewer?.dispose(); worker && worker.terminate && worker.terminate(); });
  runBuild();
  window.__lab = { store, get model() { return model; }, get report() { return report; }, get viewer() { return viewer; } };
}
