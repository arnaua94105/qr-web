// Editor QR: orquesta estado, paneles, vista previa, comprobación de lectura, guardado y exportación.
import { createStore } from './store.js';
import { newState, sanitizeState, parseProjectFile, exportProjectJson, ProjectError, MAX_FILE_BYTES } from './project.js';
import { renderState } from './render.js';
import { h, icon, Binder, toast, debounce } from './ui.js';
import { contentPanel, shapesPanel, colorsPanel, appearancePanel, logoPanel, frameCtl, advancedPanel, checkRow } from './editor-panels.js';
import { TEMPLATE_BY_ID } from './templates.js';
import { saveProject, getProject, newId, saveDraft, loadDraft, backendName } from './storage.js';
import { CONTENT_TYPE_BY_ID, defaultValues } from '../qr/payloads.js';
import { DEFAULT_DESIGN, mergeDesign, sanitizeDesign } from '../qr/design.js';
import { DEFAULT_3D, sanitize3D } from '../model3d/params.js';
import { simulateScan, verdict } from '../qr/scan.js';
import { sceneToSvg } from '../qr/svg.js';
import { sceneToPngBlob, sceneToPdfBytes } from './raster.js';
import { downloadBlob, downloadBytes, safeName } from '../export/download.js';

const $ = (s, r = document) => r.querySelector(s);
const TABS = [
  ['contenido', 'Contenido', 'i-content'],
  ['apariencia', 'Apariencia', 'i-palette'],
  ['formas', 'Formas', 'i-shapes'],
  ['colores', 'Colores', 'i-palette'],
  ['logotipo', 'Logotipo', 'i-image'],
  ['marco', 'Texto y marco', 'i-text'],
  ['exportar', 'Exportación', 'i-download'],
  ['avanzado', 'Avanzado', 'i-sliders'],
];

export async function startEditor() {
  const params = new URLSearchParams(location.search);
  const store = createStore(newState(CONTENT_TYPE_BY_ID[params.get('tipo')] ? params.get('tipo') : 'url'));
  let projectId = null;
  let dirty = false;
  const ctx = { store, logoMeta: null };

  // ------------------------------------------------------------ carga inicial: proyecto > plantilla > borrador
  const pid = params.get('proyecto');
  if (pid) {
    const p = await getProject(pid);
    if (p) {
      try {
        store.replace(sanitizeState(p.state), { history: false });
        projectId = p.id;
      } catch { toast('No se pudo abrir el proyecto.', { kind: 'bad' }); }
    } else toast('No se encontró ese proyecto en este navegador.', { kind: 'bad' });
  } else if (!params.get('tipo') && !params.get('plantilla')) {
    const draft = await loadDraft();
    if (draft) { try { store.replace(sanitizeState(draft), { history: false }); } catch { /* borrador inválido: se ignora */ } }
  }
  if (params.get('plantilla') && TEMPLATE_BY_ID[params.get('plantilla')]) applyTemplate(params.get('plantilla'), { keepContent: params.get('tipo') ? true : false, history: false });

  // ------------------------------------------------------------ acciones
  function applyTemplate(id, { keepContent = true, history = true } = {}) {
    const t = TEMPLATE_BY_ID[id];
    if (!t) return;
    const apply = (d) => {
      const keepLogo = !t.design.logo && d.design.logo;
      const keepBg = d.design.background.image;
      const frameKeep = t.design.frame ? null : d.design.frame;
      d.design = sanitizeDesign(mergeDesign(DEFAULT_DESIGN, t.design));
      if (keepLogo) d.design.logo = keepLogo;
      if (keepBg && !t.design.background?.image) d.design.background.image = keepBg;
      if (frameKeep && frameKeep.style === 'none') d.design.frame = frameKeep;
      if (t.model3d) d.model3d = sanitize3D({ ...DEFAULT_3D, ...t.model3d });
      d.template = id;
      if (!keepContent) {
        d.content = { type: t.sample.type, values: { ...defaultValues(t.sample.type), ...t.sample.values } };
      }
    };
    if (history) store.update(apply); else store.update(apply, { history: false });
  }
  ctx.applyTemplate = applyTemplate;
  ctx.resetDesign = () => { store.update((d) => { d.design = sanitizeDesign(DEFAULT_DESIGN); d.template = null; }); toast('Diseño restablecido. Puedes deshacerlo.'); };
  ctx.duplicate = async () => {
    const st = store.get();
    projectId = newId();
    store.update((d) => { d.name = (d.name + ' (copia)').slice(0, 80); }, { history: false });
    await persist(true);
    history.replaceState(null, '', `?proyecto=${projectId}`);
    toast('Proyecto duplicado y guardado en este navegador.');
    void st;
  };

  async function persist(silent) {
    const st = store.get();
    const out = renderState(st);
    if (!projectId) projectId = newId();
    try {
      await saveProject({ id: projectId, name: st.name, state: st, thumb: out.ok ? out.svg : null, favorite: false });
      dirty = false;
      history.replaceState(null, '', `?proyecto=${projectId}`);
      if (!silent) toast(`Guardado en este navegador (${await backendName() === 'indexeddb' ? 'IndexedDB' : 'localStorage'}). No se sincroniza con ningún servidor.`);
      updateSaveBtn();
    } catch (e) {
      toast(e.message || 'No se pudo guardar.', { kind: 'bad' });
    }
  }

  // ------------------------------------------------------------ barra superior
  const tools = $('#app-head-tools');
  const nameBinder = new Binder(store);
  const nameInput = h('input', { class: 'name-input', type: 'text', maxlength: 80, 'aria-label': 'Nombre del proyecto', autocomplete: 'off' });
  nameInput.addEventListener('input', () => store.set('name', nameInput.value || 'Mi código QR', { key: 'name' }));
  nameBinder.add(nameInput, (st) => { if (document.activeElement !== nameInput) nameInput.value = st.name; });
  const undoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Deshacer', title: 'Deshacer (Ctrl/⌘ Z)', onclick: () => store.undo() }, icon('i-undo'));
  const redoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Rehacer', title: 'Rehacer (Ctrl/⌘ ⇧ Z)', onclick: () => store.redo() }, icon('i-redo'));
  const saveBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: () => persist(false) }, icon('i-save'), h('span', { class: 'lbl' }, 'Guardar'));
  const labBtn = h('a', { class: 'btn btn-small btn-accent', href: '/laboratorio-3d/', title: 'Convertir este QR en un modelo 3D' }, icon('i-cube'), h('span', { class: 'lbl' }, 'Pasar a 3D'));
  const helpBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ayuda y atajos de teclado', title: 'Ayuda (?)', onclick: () => openHelp() }, icon('i-help'));
  tools.append(nameInput, undoBtn, redoBtn, helpBtn, saveBtn, labBtn);
  function updateSaveBtn() { saveBtn.dataset.dirty = dirty ? 'true' : 'false'; }

  // ------------------------------------------------------------ pestañas y paneles
  const tabsEl = $('#tabs'), panelsEl = $('#panels');
  const panels = {
    contenido: contentPanel(ctx), apariencia: appearancePanel(ctx), formas: shapesPanel(ctx), colores: colorsPanel(ctx),
    logotipo: logoPanel(ctx), marco: frameCtl(ctx), exportar: exportPanel(), avanzado: advancedPanel(ctx),
  };
  panels.contenido.fill();
  TABS.forEach(([id, label, ic], i) => {
    const tab = h('button', { type: 'button', role: 'tab', id: 'tab-' + id, 'aria-controls': 'panel-' + id, 'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? '0' : '-1' }, icon(ic), h('span', {}, label));
    tab.addEventListener('click', () => selectTab(id));
    tab.addEventListener('keydown', (e) => {
      const idx = TABS.findIndex((x) => x[0] === id);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = TABS[(idx + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length][0];
        selectTab(n, true);
      } else if (e.key === 'Home') { e.preventDefault(); selectTab(TABS[0][0], true); } else if (e.key === 'End') { e.preventDefault(); selectTab(TABS[TABS.length - 1][0], true); }
    });
    tabsEl.append(tab);
    panelsEl.append(h('section', { role: 'tabpanel', id: 'panel-' + id, 'aria-labelledby': 'tab-' + id, hidden: i !== 0, tabindex: '0', class: 'panel' }, panels[id].el));
  });
  function selectTab(id, focus) {
    TABS.forEach(([t]) => {
      const on = t === id;
      const tab = $('#tab-' + t);
      tab.setAttribute('aria-selected', on);
      tab.tabIndex = on ? 0 : -1;
      $('#panel-' + t).hidden = !on;
      if (on) { tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (focus) tab.focus(); }
    });
    try { sessionStorage.setItem('qrs.tab', id); } catch { /* sin sessionStorage */ }
  }
  try { const t = sessionStorage.getItem('qrs.tab'); if (t && TABS.some((x) => x[0] === t)) selectTab(t); } catch { /* ok */ }

  // ------------------------------------------------------------ exportación
  function baseName() { return safeName(store.get().name, 'codigo-qr'); }
  const busy = new Set();
  async function doExport(kind) {
    const out = renderState(store.get());
    if (!out.ok) { toast('Completa el contenido antes de descargar.', { kind: 'bad' }); return; }
    if (busy.has(kind)) return;
    busy.add(kind);
    document.querySelectorAll(`[data-export="${kind}"]`).forEach((b) => b.setAttribute('aria-busy', 'true'));
    try {
      const d = out.design;
      if (kind === 'svg') downloadBytes(new TextEncoder().encode(sceneToSvg(out.scene, { widthMm: d.output.mm, title: store.get().name, desc: 'Código QR generado con QR Studio' })), baseName() + '.svg', 'image/svg+xml');
      else if (kind === 'png') downloadBlob(await sceneToPngBlob(out.scene, d.output.px), baseName() + '.png');
      else if (kind === 'pdf') downloadBytes(await sceneToPdfBytes(out.scene, d.output.mm, store.get().name), baseName() + '.pdf', 'application/pdf');
      else if (kind === 'json') downloadBytes(new TextEncoder().encode(exportProjectJson(store.get())), baseName() + '.qrstudio.json', 'application/json');
      toast(`Descargado ${kind.toUpperCase()}.`);
    } catch (e) {
      toast('No se pudo generar el archivo: ' + (e.message || 'error desconocido'), { kind: 'bad' });
    } finally {
      busy.delete(kind);
      document.querySelectorAll(`[data-export="${kind}"]`).forEach((b) => b.removeAttribute('aria-busy'));
    }
  }
  function exportPanel() {
    const b = new Binder(store);
    const el = h('div', { class: 'panel-body' });
    const btn = (kind, label, sub) => h('button', { type: 'button', class: 'export-btn', 'data-export': kind, onclick: () => doExport(kind) }, icon('i-download'), h('span', {}, h('strong', {}, label), h('small', {}, sub)));
    const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try {
        if (f.size > MAX_FILE_BYTES) throw new ProjectError('El archivo es demasiado grande (máximo 4 MB).');
        const st = parseProjectFile(await f.text());
        store.replace(st);
        projectId = null;
        toast('Proyecto importado. Guárdalo para conservarlo en este navegador.');
      } catch (e) { toast(e instanceof ProjectError ? e.message : 'No se pudo leer el archivo.', { kind: 'bad' }); }
    });
    el.append(
      h('p', { class: 'panel-lead' }, 'Descarga el código para la web, la imprenta o el laminador 3D.'),
      h('div', { class: 'export-list' }, btn('svg', 'SVG vectorial', 'Escala sin pérdida; el mejor para imprenta'), btn('png', 'PNG', 'Imagen para la web y redes'), btn('pdf', 'PDF vectorial', 'Listo para imprimir a tamaño real')),
      b.range({ path: 'design.output.px', label: 'Ancho del PNG', min: 256, max: 4096, step: 64, format: (v) => v + ' px' }),
      b.range({ path: 'design.output.mm', label: 'Ancho en SVG y PDF', min: 10, max: 300, step: 1, format: (v) => v + ' mm', hint: 'Es el tamaño físico al imprimir.' }),
      b.toggle({ path: 'design.background.transparent', label: 'Fondo transparente (PNG y SVG)' }),
      h('h3', { class: 'panel-sub' }, 'Proyecto'),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn btn-small', 'data-export': 'json', onclick: () => doExport('json') }, icon('i-download'), 'Exportar proyecto'),
        h('label', { class: 'btn btn-small', for: 'import-file' }, icon('i-upload'), 'Importar proyecto'), file,
        h('a', { class: 'btn btn-small', href: '/herramientas/lotes/' }, icon('i-copy'), 'Crear lote')),
      h('p', { class: 'field-hint' }, 'El proyecto se guarda en este navegador (no en la nube). Exporta el archivo para hacer copia de seguridad o cambiar de dispositivo.'),
    );
    return { el };
  }

  // ------------------------------------------------------------ vista previa, comprobación e inspector
  const preview = $('#preview'), stageCanvas = $('#stage-canvas'), msg = $('#preview-msg'), stageInfo = $('#stage-info');
  const verdictEl = $('#verdict'), inspectorList = $('#checks'), scanBtn = $('#scan-btn');
  let scanState = null, scanKey = '', lastOut = null;

  function showVerdict() {
    const out = lastOut;
    verdictEl.className = 'verdict';
    if (!out || !out.ok) { verdictEl.hidden = true; return; }
    verdictEl.hidden = false;
    const v = verdict(scanState, out.analysis);
    const map = { generated: 'is-neutral', 'verified-sim': 'is-ok', fragile: 'is-warn', failed: 'is-bad' };
    verdictEl.classList.add(map[v.id] || 'is-neutral');
    const hasImg = out.scene.logo || out.scene.hasBgImage;
    verdictEl.replaceChildren(
      h('div', { class: 'verdict-head' }, icon(v.id === 'verified-sim' ? 'i-check' : v.id === 'generated' ? 'i-info' : 'i-warn'), h('strong', {}, v.label)),
      h('p', {}, v.detail + (hasImg && v.id === 'verified-sim' ? ' Las imágenes (logotipo, fondo) no se dibujan en la prueba: se tratan como zona tapada.' : '')),
      h('p', { class: 'verdict-phone' }, 'Requiere prueba con móvil: ninguna comprobación automática sustituye escanear el resultado impreso con tu cámara.'),
    );
  }
  function runScan() {
    const out = lastOut;
    if (!out || !out.ok) return;
    const key = JSON.stringify([store.get().content, out.design]);
    scanBtn.setAttribute('aria-busy', 'true');
    // dejamos pintar el estado «comprobando» antes de la parte costosa
    setTimeout(() => {
      try { scanState = simulateScan(out.scene, out.qr, out.text, { pxPerModule: out.qr.version > 20 ? 4 : 6 }); scanKey = key; } catch { scanState = null; }
      scanBtn.removeAttribute('aria-busy');
      showVerdict();
    }, 20);
  }
  scanBtn.addEventListener('click', runScan);
  const autoScan = debounce(() => { if (lastOut && lastOut.ok && lastOut.qr.version <= 16) runScan(); }, 900);

  function paintInspector(out) {
    inspectorList.replaceChildren();
    if (!out || !out.ok) {
      inspectorList.append(h('p', { class: 'empty' }, 'Escribe el contenido para ver las comprobaciones de lectura y de impresión.'));
      return;
    }
    const rank = { bad: 0, warn: 1, info: 2, ok: 3 };
    const checks = [...out.analysis.checks].sort((a, b) => rank[a.level] - rank[b.level]);
    const attention = checks.filter((c) => c.level !== 'ok');
    const good = checks.filter((c) => c.level === 'ok');
    attention.forEach((c) => inspectorList.append(checkRow(c)));
    if (good.length) {
      inspectorList.append(h('details', { class: 'ok-group' }, h('summary', {}, `${good.length} comprobaciones correctas`), good.map((c) => checkRow(c))));
    }
    const m = out.analysis.moduleMm;
    inspectorList.append(checkRow({ level: 'info', title: 'Requiere prueba con móvil', detail: 'Ninguna comprobación automática sustituye escanear el resultado impreso con tu cámara, con la luz y la distancia reales.' }));
    inspectorList.append(h('p', { class: 'field-hint' }, `A ${out.design.output.mm} mm de ancho cada módulo mide ${m.toFixed(2)} mm.`));
  }

  function paint() {
    const st = store.get();
    let out = renderState(st, { printMm: st.design.output.mm });
    lastOut = out;
    let shown = out;
    let placeholder = false;
    if (!out.ok) {
      const sample = CONTENT_TYPE_BY_ID[st.content.type].sample;
      shown = renderState({ ...st, content: { type: st.content.type, values: { ...defaultValues(st.content.type), ...sample } } });
      placeholder = true;
    }
    preview.innerHTML = shown.svg || '';
    preview.setAttribute('role', 'img');
    preview.setAttribute('aria-label', placeholder ? 'Ejemplo de código QR hasta que escribas tu contenido' : `Vista previa del código QR: ${st.content.type}`);
    stageCanvas.classList.toggle('is-placeholder', placeholder);
    stageCanvas.classList.toggle('is-transparent', !!out.design.background.transparent);
    msg.hidden = !placeholder && !(out.fatal);
    msg.textContent = out.fatal ? out.fatal : 'Ejemplo. Escribe tu contenido a la izquierda.';
    msg.classList.toggle('is-bad', !!out.fatal);
    stageInfo.textContent = out.ok ? `Versión ${out.qr.version} · ${out.qr.size}×${out.qr.size} · corrección ${'LMQH'[out.qr.ecl]}` : '';
    document.querySelectorAll('[data-export]').forEach((b) => { if (b.dataset.export !== 'json') b.toggleAttribute('disabled', !out.ok); });
    const key = JSON.stringify([st.content, out.design]);
    if (key !== scanKey) { scanState = null; showVerdict(); autoScan(); }
    scanBtn.toggleAttribute('disabled', !out.ok);
    paintInspector(out);
    panels.contenido.sync(st, out);
    panels.logotipo.sync(st, out);
    panels.apariencia.markTemplate(st.template);
    const cr = $('#contrast-readout');
    if (cr && out.ok) {
      const c = out.analysis.checks.find((x) => x.id === 'contrast');
      cr.replaceChildren(c ? checkRow(c) : '');
    }
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    document.title = `${st.name} · Editor de códigos QR · QR Studio`;
  }
  let raf = 0;
  const schedulePaint = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
  const draftSave = debounce(() => saveDraft(store.get()), 700);
  store.subscribe((_, meta) => { dirty = true; updateSaveBtn(); schedulePaint(); draftSave(); void meta; });
  paint();
  dirty = false;

  // ------------------------------------------------------------ descargas rápidas
  document.querySelectorAll('.quick [data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));

  // ------------------------------------------------------------ atajos
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const t = e.target;
    const editable = t && (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'color'].includes(t.type) || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (mod && e.key.toLowerCase() === 'z' && !editable) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
    else if (mod && e.key.toLowerCase() === 'y' && !editable) { e.preventDefault(); store.redo(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); persist(false); }
    else if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); selectTab('exportar', true); }
    else if (e.key === '?' && !editable) { e.preventDefault(); openHelp(); }
  });

  // ------------------------------------------------------------ ayuda y recorrido inicial
  function openHelp() {
    let dlg = $('#help-dialog');
    if (!dlg) {
      dlg = h('dialog', { id: 'help-dialog', class: 'consent-dialog', 'aria-labelledby': 'help-title' },
        h('h2', { id: 'help-title' }, 'Cómo funciona'),
        h('ol', { class: 'help-steps' },
          h('li', {}, h('strong', {}, 'Contenido. '), 'Elige qué debe hacer el código y rellena los datos. La vista previa se actualiza al instante.'),
          h('li', {}, h('strong', {}, 'Diseño. '), 'Aplica una plantilla y ajusta formas, colores, logotipo y marco. Los avisos te dicen si la lectura corre riesgo; nunca te bloquean.'),
          h('li', {}, h('strong', {}, 'Comprobación. '), 'La prueba automática decodifica el diseño, pero escanéalo siempre con un móvil antes de imprimir.'),
          h('li', {}, h('strong', {}, 'Descarga. '), 'SVG y PDF son vectoriales. Con «Pasar a 3D» conviertes la matriz real del QR en un modelo imprimible.')),
        h('h3', { class: 'panel-sub' }, 'Atajos de teclado'),
        h('dl', { class: 'keys' }, ...[['Ctrl/⌘ Z', 'Deshacer'], ['Ctrl/⌘ ⇧ Z  ·  Ctrl/⌘ Y', 'Rehacer'], ['Ctrl/⌘ S', 'Guardar proyecto'], ['Ctrl/⌘ E', 'Ir a Exportación'], ['?', 'Esta ayuda'], ['← →', 'Cambiar de sección']].flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
        h('div', { style: 'display:flex;justify-content:flex-end;margin-top:18px' }, h('button', { class: 'btn btn-ink', type: 'button', onclick: () => dlg.close() }, 'Entendido')));
      document.body.append(dlg);
    }
    dlg.showModal();
    try { localStorage.setItem('qrs.tour.v1', '1'); } catch { /* ok */ }
  }
  try { if (!localStorage.getItem('qrs.tour.v1') && !pid && !params.get('plantilla')) setTimeout(() => { if (!document.querySelector('dialog[open]')) openHelp(); }, 900); } catch { /* ok */ }

  window.addEventListener('beforeunload', (e) => { if (dirty && projectId) { e.preventDefault(); } });
  window.QRS = Object.assign(window.QRS || {}, { store, renderState, ctx });
  document.documentElement.dataset.ready = 'true';
}
