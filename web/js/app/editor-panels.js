// Paneles del editor QR: una función por sección. Todos los controles se enlazan al estado con Binder.
import { h, icon, Binder, toast } from './ui.js';
import { CONTENT_TYPES, CONTENT_TYPE_BY_ID, buildPayload, defaultValues, SOCIAL_NETWORKS } from '../qr/payloads.js';
import { MODULE_SHAPES, FINDER_OUTER_SHAPES, FINDER_INNER_SHAPES, ALIGNMENT_SHAPES, FRAME_STYLES, LOGO_PLATES, LOGO_CROPS, ICONS, ECL_OPTIONS } from '../qr/design.js';
import { iconPath } from '../qr/icons.js';
import { pathToD } from '../qr/path.js';
import { TEMPLATES } from './templates.js';
import { renderState } from './render.js';
import { fileToDataImage, ImageError } from './images.js';
import { newState } from './project.js';

const opt = (list) => list.map(([v, t]) => [v, t]);

/** Panel «Contenido»: tipo de dato y campos que cambian según el tipo. */
export function contentPanel(ctx) {
  const { store } = ctx;
  const memory = {};
  const panel = h('div', { class: 'panel-body' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Tipo de contenido' });
  const fieldsHost = h('div', { class: 'fields' });
  const info = h('p', { class: 'data-info', 'aria-live': 'polite' });
  let binder = null;
  let builtFor = null;

  CONTENT_TYPES.forEach((t) => {
    const b = h('button', { type: 'button', class: 'chip', 'data-type': t.id, 'aria-pressed': 'false', title: t.long }, t.label);
    b.addEventListener('click', () => {
      const cur = store.get().content;
      memory[cur.type] = cur.values;
      store.update((d) => {
        d.content.type = t.id;
        d.content.values = memory[t.id] || defaultValues(t.id);
      });
    });
    chips.append(b);
  });

  function buildFields(typeId) {
    binder?.dispose();
    binder = new Binder(store);
    const t = CONTENT_TYPE_BY_ID[typeId];
    fieldsHost.replaceChildren(
      ...t.fields.map((f) => {
        const path = `content.values.${f.id}`;
        const when = f.showIf ? (st) => !!f.showIf(st.content.values) : undefined;
        const error = (st) => buildPayload(st.content).errors?.[f.id] || '';
        if (f.type === 'select') {
          const options = f.id === 'network' ? SOCIAL_NETWORKS.map((n) => [n.id, n.label]) : f.options;
          return binder.select({ path, label: f.label, options, when, hint: f.hint });
        }
        if (f.type === 'checkbox') return binder.toggle({ path, label: f.label, when, hint: f.hint });
        const type = f.type === 'datetime' ? 'datetime-local' : f.type === 'number' ? 'text' : f.type;
        return binder.text({ path, label: f.label, type, placeholder: f.placeholder, autocomplete: f.autocomplete, rows: f.type === 'textarea' ? f.rows || 4 : undefined, when, hint: f.hint, error, requiredMark: f.required, inputmode: f.type === 'number' ? 'decimal' : undefined });
      }),
    );
    builtFor = typeId;
  }

  function sync(st, out) {
    const typeId = st.content.type;
    if (builtFor !== typeId) buildFields(typeId);
    chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === typeId));
    const notes = (out && out.notes) || [];
    info.replaceChildren();
    if (out && out.ok) info.append(h('span', {}, `Versión ${out.qr.version} · ${out.qr.size}×${out.qr.size} módulos · ${new TextEncoder().encode(out.text).length} bytes`));
    if (out && out.fatal) info.append(h('span', { class: 'is-bad' }, out.fatal));
    notes.forEach((n) => info.append(h('span', { class: 'note-line' }, icon('i-info'), n)));
  }
  panel.append(h('p', { class: 'panel-lead' }, '¿Qué quieres que haga el código al escanearlo?'), chips, fieldsHost, info);
  return { el: panel, sync, fill: () => buildFields(store.get().content.type), memory };
}

function mini(shape, kind) {
  // glifo pequeño de la forma (decorativo; el nombre va en el texto)
  const k = 9;
  const s = (d) => `<svg viewBox="0 0 ${k} ${k}" width="22" height="22" aria-hidden="true"><path d="${d}" fill="currentColor" fill-rule="evenodd"/></svg>`;
  const sq = (x, y, w = 3) => `M${x} ${y}h${w}v${w}h-${w}z`;
  const ci = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0z`;
  if (kind === 'module') {
    switch (shape) {
      case 'square': return s(sq(1, 1) + sq(5, 1) + sq(1, 5) + sq(5, 5));
      case 'rounded': return s([[1, 1], [5, 1], [1, 5], [5, 5]].map(([x, y]) => `M${x + 1} ${y}h1a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1z`).join(''));
      case 'dots': return s([[2.5, 2.5], [6.5, 2.5], [2.5, 6.5], [6.5, 6.5]].map(([x, y]) => ci(x, y, 1.5)).join(''));
      case 'diamond': return s([[2.5, 2.5], [6.5, 2.5], [2.5, 6.5], [6.5, 6.5]].map(([x, y]) => `M${x} ${y - 1.6}l1.6 1.6l-1.6 1.6l-1.6 -1.6z`).join(''));
      case 'bars-v': return s('M1 1h1.6v7h-1.6zM3.7 1h1.6v7h-1.6zM6.4 1h1.6v7h-1.6z');
      case 'bars-h': return s('M1 1h7v1.6h-7zM1 3.7h7v1.6h-7zM1 6.4h7v1.6h-7z');
      case 'leaf': return s([[1, 1], [5, 1], [1, 5], [5, 5]].map(([x, y]) => `M${x} ${y + 3}v-1.5a1.5 1.5 0 0 1 1.5 -1.5h1.5v1.5a1.5 1.5 0 0 1 -1.5 1.5z`).join(''));
      default: return s(sq(1, 1, 3) + sq(5, 5, 3) + ci(6.5, 2.5, 1.5) + ci(2.5, 6.5, 1.5));
    }
  }
  return null;
}

export function shapesPanel(ctx) {
  const b = new Binder(ctx.store);
  const el = h('div', { class: 'panel-body' });
  el.append(
    b.segmented({ path: 'design.modules.shape', label: 'Forma de los módulos', cols: 4, options: MODULE_SHAPES.map(([v, t]) => [v, t, mini(v, 'module')]) }),
    b.range({ path: 'design.modules.scale', label: 'Tamaño de cada módulo', min: 40, max: 100, step: 1, scale: 0.01, format: (v) => Math.round(v * 100) + ' %', hint: 'Por debajo del 70 % los módulos sueltos se leen peor.', when: (st) => st.design.modules.shape !== 'square' }),
    b.range({ path: 'design.modules.round', label: 'Redondeo de las esquinas', min: 0, max: 50, step: 1, scale: 0.01, format: (v) => Math.round(v * 200) + ' %', when: (st) => st.design.modules.shape === 'rounded' || st.design.modules.shape === 'liquid' }),
    h('h3', { class: 'panel-sub' }, 'Localizadores (las tres esquinas)'),
    b.select({ path: 'design.finder.outer', label: 'Marco exterior', options: opt(FINDER_OUTER_SHAPES) }),
    b.select({ path: 'design.finder.inner', label: 'Centro', options: opt(FINDER_INNER_SHAPES) }),
    b.select({ path: 'design.alignment.shape', label: 'Patrón de alineación (versiones 2 en adelante)', options: opt(ALIGNMENT_SHAPES) }),
    h('p', { class: 'field-hint' }, 'Las formas se aplican sin alterar la matriz del código: los patrones de posición y sincronización mantienen su geometría.'),
  );
  return { el };
}

export function colorsPanel(ctx) {
  const b = new Binder(ctx.store);
  const presets = [
    ['Tinta', '#16181b', '#ffffff'], ['Marino', '#14304f', '#ffffff'], ['Bosque', '#0f3d2a', '#f4fbf6'], ['Burdeos', '#5a1224', '#fff6f4'],
    ['Violeta', '#3b1d7a', '#f6f2ff'], ['Cálido', '#3a2a1c', '#f7f1e6'], ['Neón', '#7dffb2', '#0e1512'],
  ];
  const sw = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Combinaciones de color' }, presets.map(([n, fg, bg]) => {
    const btn = h('button', { type: 'button', class: 'swatch', title: n, 'aria-label': `Combinación ${n}`, style: `--fg:${fg};--bg:${bg}` }, h('span'));
    btn.addEventListener('click', () => ctx.store.update((d) => { d.design.modules.color = fg; d.design.background.color = bg; d.design.background.transparent = false; }));
    return btn;
  }));
  const el = h('div', { class: 'panel-body' });
  el.append(
    h('span', { class: 'field-label' }, 'Combinaciones'),
    sw,
    b.color({ path: 'design.modules.color', label: 'Módulos' }),
    b.color({ path: 'design.finder.outerColor', label: 'Marco de los localizadores', nullable: true, fallbackPath: 'design.modules.color' }),
    b.color({ path: 'design.finder.innerColor', label: 'Centro de los localizadores', nullable: true, fallbackPath: 'design.modules.color' }),
    b.color({ path: 'design.alignment.color', label: 'Patrón de alineación', nullable: true, fallbackPath: 'design.modules.color' }),
    b.toggle({ path: 'design.background.transparent', label: 'Fondo transparente', hint: 'El contraste dependerá del color sobre el que lo pongas.' }),
    b.color({ path: 'design.background.color', label: 'Fondo', when: (st) => !st.design.background.transparent }),
    h('div', { class: 'contrast', id: 'contrast-readout', 'aria-live': 'polite' }),
  );
  return { el };
}

function dropzone({ label, hint, onFile, accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml' }) {
  const input = h('input', { type: 'file', accept, class: 'sr-only' });
  const zone = h('label', { class: 'drop' }, input, icon('i-upload'), h('span', { class: 'drop-t' }, label), h('span', { class: 'drop-h' }, hint));
  const run = async (file) => {
    try {
      await onFile(file);
    } catch (e) {
      toast(e instanceof ImageError ? e.message : 'No se pudo usar esa imagen.', { kind: 'bad' });
    }
  };
  input.addEventListener('change', () => { if (input.files[0]) run(input.files[0]); input.value = ''; });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('is-over'); const f = e.dataTransfer.files[0]; if (f) run(f); });
  return zone;
}

export function appearancePanel(ctx) {
  const { store } = ctx;
  const b = new Binder(store);
  const gal = h('div', { class: 'tpl-strip', role: 'list', 'aria-label': 'Plantillas' });
  for (const t of TEMPLATES.filter((x) => x.category !== '3d')) {
    const st = newState(t.sample.type, { values: t.sample.values, design: t.design });
    const out = renderState(st);
    const btn = h('button', { type: 'button', class: 'tpl', role: 'listitem', 'data-id': t.id, title: t.blurb }, h('span', { class: 'tpl-img', html: out.svg || '' }), h('span', { class: 'tpl-n' }, t.name));
    btn.addEventListener('click', () => ctx.applyTemplate(t.id, { keepContent: true }));
    gal.append(btn);
  }
  const bgDrop = dropzone({
    label: 'Añadir imagen de fondo',
    hint: 'PNG, JPG, WebP, GIF o SVG · hasta 6 MB. Se procesa en tu navegador.',
    onFile: async (f) => {
      const img = await fileToDataImage(f, { max: 1024 });
      store.update((d) => { d.design.background.image = { src: img.src, w: img.w, h: img.h }; });
    },
  });
  const el = h('div', { class: 'panel-body' });
  el.append(
    h('span', { class: 'field-label' }, 'Plantillas'),
    gal,
    h('p', { class: 'field-hint' }, [h('a', { href: '/plantillas/' }, 'Ver todas las plantillas'), ' · se aplican a tu contenido y siguen siendo editables.']),
    h('h3', { class: 'panel-sub' }, 'Fondo y márgenes'),
    b.range({ path: 'design.qr.quiet', label: 'Zona de silencio', min: 0, max: 10, step: 1, format: (v) => v + ' módulos', hint: 'La norma pide 4 módulos de margen como mínimo.' }),
    b.range({ path: 'design.background.radius', label: 'Esquinas del lienzo', min: 0, max: 50, step: 1, scale: 0.01, format: (v) => Math.round(v * 200) + ' %' }),
    h('span', { class: 'field-label' }, 'Imagen de fondo'),
    bgDrop,
    b.range({ path: 'design.background.plate', label: 'Opacidad de la placa tras el código', min: 0, max: 100, step: 1, scale: 0.01, format: (v) => Math.round(v * 100) + ' %', when: (st) => !!st.design.background.image, hint: 'Una placa opaca protege la lectura sobre imágenes con detalle.' }),
    b.add(h('div', { class: 'field' }, h('button', { type: 'button', class: 'btn btn-small', onclick: () => store.update((d) => { d.design.background.image = null; }) }, icon('i-trash'), 'Quitar imagen de fondo')), () => {}, (st) => !!st.design.background.image),
  );
  return { el, markTemplate: (id) => gal.querySelectorAll('.tpl').forEach((x) => x.setAttribute('aria-current', x.dataset.id === id ? 'true' : 'false')) };
}

function iconThumb(id) {
  const d = pathToD(iconPath(id));
  return `<svg viewBox="0 0 1 1" width="26" height="26" aria-hidden="true"><path d="${d}" fill="currentColor" fill-rule="evenodd"/></svg>`;
}

export function logoPanel(ctx) {
  const { store } = ctx;
  const b = new Binder(store);
  const warn = h('div', { class: 'inline-checks', 'aria-live': 'polite' });
  const iconGrid = h('div', { class: 'icon-grid', role: 'radiogroup', 'aria-label': 'Icono' }, ICONS.map(([id, name]) => {
    const btn = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-icon': id, title: name, 'aria-label': name, html: iconThumb(id) });
    btn.addEventListener('click', () => store.update((d) => { d.design.logo.icon = id; d.design.logo.kind = 'icon'; }));
    return btn;
  }));
  const drop = dropzone({
    label: 'Subir logotipo',
    hint: 'PNG con fondo transparente funciona mejor. Se reduce a 512 px en tu navegador y no se envía a ningún servidor.',
    onFile: async (f) => {
      const img = await fileToDataImage(f, { max: 512 });
      ctx.logoMeta = { avgLum: img.avgLum };
      store.update((d) => {
        d.design.logo.image = { src: img.src, w: img.w, h: img.h };
        d.design.logo.kind = 'image';
        if (d.design.qr.ecl === 'L' || d.design.qr.ecl === 'M') d.design.qr.ecl = 'Q';
      });
      toast('Logotipo añadido. Se ha subido la corrección de errores a Q para dejar margen.');
    },
  });
  const el = h('div', { class: 'panel-body' });
  el.append(
    b.segmented({ path: 'design.logo.kind', label: 'Elemento central', options: [['none', 'Ninguno'], ['image', 'Imagen'], ['icon', 'Icono']], cols: 3 }),
    b.add(h('div', { class: 'stack' }, drop, h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => store.update((d) => { d.design.logo.image = null; d.design.logo.kind = 'none'; }) }, icon('i-trash'), 'Quitar imagen'))), () => {}, (st) => st.design.logo.kind === 'image'),
    b.add(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Icono'), iconGrid), (st) => iconGrid.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', x.dataset.icon === st.design.logo.icon)), (st) => st.design.logo.kind === 'icon'),
    b.color({ path: 'design.logo.iconColor', label: 'Color del icono', when: (st) => st.design.logo.kind === 'icon' }),
    b.add(h('div', { class: 'panel-group' },
      b.range({ path: 'design.logo.size', label: 'Tamaño', min: 8, max: 40, step: 1, scale: 0.01, format: (v) => Math.round(v * 100) + ' % del lado' }),
      b.range({ path: 'design.logo.offsetX', label: 'Posición horizontal', min: -40, max: 40, step: 1, scale: 0.01, format: (v) => Math.round(v * 100) }),
      b.range({ path: 'design.logo.offsetY', label: 'Posición vertical', min: -40, max: 40, step: 1, scale: 0.01, format: (v) => Math.round(v * 100) }),
      b.range({ path: 'design.logo.margin', label: 'Aire alrededor', min: 0, max: 4, step: 0.5, format: (v) => v + ' módulos' }),
      b.segmented({ path: 'design.logo.plate', label: 'Fondo del logotipo', options: LOGO_PLATES.map(([v, t]) => [v, t]), cols: 2 }),
      b.color({ path: 'design.logo.plateColor', label: 'Color del fondo del logotipo', when: (st) => st.design.logo.plate !== 'none' }),
      b.toggle({ path: 'design.logo.clear', label: 'Vaciar los módulos bajo el logotipo', hint: 'Recomendado: el logotipo no se mezcla con los módulos.' }),
    ), () => {}, (st) => st.design.logo.kind !== 'none'),
    b.add(h('div', { class: 'panel-group' },
      h('h3', { class: 'panel-sub' }, 'Recorte de la imagen'),
      b.segmented({ path: 'design.logo.crop', label: 'Forma del recorte', options: LOGO_CROPS.map(([v, t]) => [v, t]), cols: 3 }),
      b.range({ path: 'design.logo.zoom', label: 'Ampliación', min: 1, max: 4, step: 0.05, format: (v) => v.toFixed(2) + '×' }),
      b.range({ path: 'design.logo.panX', label: 'Desplazar en horizontal', min: -100, max: 100, step: 1, scale: 0.01, format: (v) => Math.round(v * 100) }),
      b.range({ path: 'design.logo.panY', label: 'Desplazar en vertical', min: -100, max: 100, step: 1, scale: 0.01, format: (v) => Math.round(v * 100) }),
    ), () => {}, (st) => st.design.logo.kind === 'image'),
    warn,
  );
  return {
    el,
    sync(st, out) {
      warn.replaceChildren();
      if (!out || !out.ok || st.design.logo.kind === 'none') return;
      for (const c of out.analysis.checks.filter((x) => x.id.startsWith('logo') || x.id === 'ecl-logo')) warn.append(checkRow(c));
      if (st.design.logo.kind === 'image' && ctx.logoMeta) {
        const plate = st.design.logo.plate !== 'none' ? st.design.logo.plateColor : st.design.background.color;
        const n = parseInt(plate.slice(1), 16);
        const pl = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
        if (Math.abs(pl - ctx.logoMeta.avgLum) < 0.22) warn.append(checkRow({ level: 'warn', title: 'El logotipo y su fondo se parecen', detail: 'Cambia el color del fondo del logotipo para que destaque.' }));
      }
    },
  };
}

export function frameCtl(ctx) {
  const b = new Binder(ctx.store);
  const el = h('div', { class: 'panel-body' });
  const has = (st) => st.design.frame.style !== 'none';
  el.append(
    b.segmented({ path: 'design.frame.style', label: 'Marco', options: FRAME_STYLES.map(([v, t]) => [v, t]), cols: 2 }),
    b.text({ path: 'design.frame.top', label: 'Texto superior', maxlength: 40, placeholder: 'ESCANÉAME', when: (st) => ['banner', 'card'].includes(st.design.frame.style) }),
    b.text({ path: 'design.frame.bottom', label: 'Texto inferior o llamada a la acción', maxlength: 40, placeholder: 'Abre la carta', when: (st) => ['banner', 'card'].includes(st.design.frame.style) }),
    b.segmented({ path: 'design.frame.font', label: 'Tipo de letra', options: [['sans', 'Sans (Helvetica)'], ['mono', 'Monoespaciada']], cols: 2, when: (st) => ['banner', 'card'].includes(st.design.frame.style) }),
    b.color({ path: 'design.frame.color', label: 'Color del marco', when: has }),
    b.color({ path: 'design.frame.textColor', label: 'Color del texto', when: (st) => ['banner', 'card'].includes(st.design.frame.style) }),
    b.range({ path: 'design.frame.thickness', label: 'Grosor del borde', min: 4, max: 30, step: 1, scale: 0.1, format: (v) => v.toFixed(1) + ' módulos', when: (st) => st.design.frame.style === 'border' }),
    h('p', { class: 'field-hint' }, 'El texto se dibuja con letras estándar del PDF, así queda igual en SVG, PNG y PDF.'),
  );
  return { el };
}

export function advancedPanel(ctx) {
  const { store } = ctx;
  const b = new Binder(store);
  const el = h('div', { class: 'panel-body' });
  el.append(
    b.select({ path: 'design.qr.ecl', label: 'Corrección de errores', options: ECL_OPTIONS, hint: 'Más corrección tolera más daño pero necesita más módulos.' }),
    b.range({ path: 'design.qr.minVersion', label: 'Versión mínima (densidad)', min: 1, max: 40, step: 1, format: (v) => (v === 1 ? 'Automática' : 'Versión ' + v), hint: 'Subirla fuerza un código más grande y con módulos más finos.' }),
    b.range({ path: 'design.qr.mask', label: 'Patrón de máscara', min: -1, max: 7, step: 1, format: (v) => (v < 0 ? 'Automático' : 'Máscara ' + v), hint: 'Automático elige la que mejor puntúa según la norma.' }),
    b.range({ path: 'design.output.mm', label: 'Tamaño de impresión previsto', min: 10, max: 300, step: 1, format: (v) => v + ' mm', hint: 'Solo para avisarte si los módulos quedan demasiado pequeños al imprimir.' }),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => ctx.resetDesign() }, icon('i-reset'), 'Restablecer diseño'),
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => ctx.duplicate() }, icon('i-copy'), 'Duplicar proyecto'),
    ),
    h('p', { class: 'field-hint' }, 'Restablecer se puede deshacer con Ctrl/⌘ + Z.'),
  );
  return { el };
}

export function checkRow(c) {
  const ico = c.level === 'ok' ? 'i-check' : c.level === 'bad' ? 'i-warn' : c.level === 'warn' ? 'i-warn' : 'i-info';
  return h('div', { class: 'check check-' + c.level }, icon(ico), h('div', {}, h('strong', {}, c.title), c.detail ? h('p', {}, c.detail) : null));
}
