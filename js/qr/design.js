// Modelo de diseño del QR: valores por defecto, listas de opciones y fusión de ajustes.
// Módulo puro (sin DOM).

export const MODULE_SHAPES = [
  ['square', 'Cuadrado'],
  ['rounded', 'Redondeado'],
  ['liquid', 'Líquido'],
  ['dots', 'Puntos'],
  ['diamond', 'Rombos'],
  ['leaf', 'Hojas'],
  ['bars-v', 'Barras verticales'],
  ['bars-h', 'Barras horizontales'],
];
export const FINDER_OUTER_SHAPES = [['square', 'Cuadrado'], ['rounded', 'Redondeado'], ['circle', 'Círculo'], ['leaf', 'Hoja']];
export const FINDER_INNER_SHAPES = [['square', 'Cuadrado'], ['rounded', 'Redondeado'], ['circle', 'Círculo'], ['diamond', 'Rombo'], ['leaf', 'Hoja']];
export const ALIGNMENT_SHAPES = [['same', 'Como los módulos'], ['square', 'Cuadrado'], ['rounded', 'Redondeado'], ['circle', 'Círculo']];
export const FRAME_STYLES = [
  ['none', 'Sin marco'],
  ['border', 'Borde'],
  ['banner', 'Etiqueta'],
  ['card', 'Tarjeta'],
];
export const LOGO_PLATES = [['none', 'Sin fondo'], ['square', 'Cuadrado'], ['rounded', 'Redondeado'], ['circle', 'Círculo']];
export const LOGO_CROPS = [['square', 'Cuadrado'], ['rounded', 'Redondeado'], ['circle', 'Círculo']];
export const ICONS = [['star', 'Estrella'], ['heart', 'Corazón'], ['bolt', 'Rayo'], ['pin', 'Ubicación'], ['check', 'Visto'], ['play', 'Reproducir'], ['plus', 'Cruz'], ['drop', 'Gota']];

export const ECL_OPTIONS = [
  ['L', 'L · 7 % — máxima capacidad'],
  ['M', 'M · 15 % — equilibrada'],
  ['Q', 'Q · 25 % — recomendada con logotipo'],
  ['H', 'H · 30 % — máxima robustez'],
];

export const DEFAULT_DESIGN = Object.freeze({
  qr: { ecl: 'M', minVersion: 1, mask: -1, quiet: 4 },
  modules: { shape: 'square', scale: 1, round: 0.5, color: '#15171a' },
  finder: { outer: 'square', inner: 'square', outerColor: null, innerColor: null },
  alignment: { shape: 'same', color: null },
  background: { color: '#ffffff', transparent: false, radius: 0, image: null, plate: 0.88 },
  logo: {
    kind: 'none', // 'none' | 'image' | 'icon'
    image: null, // { src, w, h } (data URI)
    icon: 'star',
    iconColor: '#15171a',
    size: 0.2, // lado del logotipo / lado del QR
    offsetX: 0,
    offsetY: 0,
    margin: 1, // módulos de aire alrededor
    plate: 'rounded',
    plateColor: '#ffffff',
    crop: 'rounded',
    zoom: 1,
    panX: 0,
    panY: 0,
    clear: true, // vaciar los módulos bajo el logotipo
  },
  frame: { style: 'none', color: '#15171a', textColor: '#ffffff', top: '', bottom: '', thickness: 1.2, font: 'sans' },
  output: { px: 1024, mm: 40 },
});

export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** Fusión profunda: solo claves que existen en `base`; los arrays y null se sustituyen. */
export function mergeDesign(base, patch) {
  const out = clone(base);
  const walk = (dst, src) => {
    if (!src || typeof src !== 'object') return;
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) walk(dst[k], v);
      else dst[k] = v === undefined ? dst[k] : clone(v);
    }
  };
  walk(out, patch);
  return out;
}

export function newDesign(patch) {
  return mergeDesign(DEFAULT_DESIGN, patch || {});
}

/** Fuerza los valores a rangos válidos (los proyectos importados pueden traer cualquier cosa). */
export function sanitizeDesign(input) {
  const d = mergeDesign(DEFAULT_DESIGN, input || {});
  const clamp = (v, a, b, def) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : def);
  const oneOf = (v, list, def) => (list.some((x) => (Array.isArray(x) ? x[0] : x) === v) ? v : def);
  const color = (v, def) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : def);
  const colorOrNull = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  d.qr.ecl = oneOf(d.qr.ecl, ECL_OPTIONS, 'M');
  d.qr.minVersion = Math.round(clamp(d.qr.minVersion, 1, 40, 1));
  d.qr.mask = Math.round(clamp(d.qr.mask, -1, 7, -1));
  d.qr.quiet = Math.round(clamp(d.qr.quiet, 0, 10, 4));
  d.modules.shape = oneOf(d.modules.shape, MODULE_SHAPES, 'square');
  d.modules.scale = clamp(d.modules.scale, 0.4, 1, 1);
  d.modules.round = clamp(d.modules.round, 0, 0.5, 0.5);
  d.modules.color = color(d.modules.color, '#15171a');
  d.finder.outer = oneOf(d.finder.outer, FINDER_OUTER_SHAPES, 'square');
  d.finder.inner = oneOf(d.finder.inner, FINDER_INNER_SHAPES, 'square');
  d.finder.outerColor = colorOrNull(d.finder.outerColor);
  d.finder.innerColor = colorOrNull(d.finder.innerColor);
  d.alignment.shape = oneOf(d.alignment.shape, ALIGNMENT_SHAPES, 'same');
  d.alignment.color = colorOrNull(d.alignment.color);
  d.background.color = color(d.background.color, '#ffffff');
  d.background.transparent = !!d.background.transparent;
  d.background.radius = clamp(d.background.radius, 0, 0.5, 0);
  d.background.plate = clamp(d.background.plate, 0, 1, 0.88);
  d.logo.kind = oneOf(d.logo.kind, ['none', 'image', 'icon'], 'none');
  if (d.logo.kind === 'image' && !(d.logo.image && typeof d.logo.image.src === 'string')) d.logo.kind = 'none';
  d.logo.icon = oneOf(d.logo.icon, ICONS, 'star');
  d.logo.iconColor = color(d.logo.iconColor, '#15171a');
  d.logo.size = clamp(d.logo.size, 0.08, 0.4, 0.2);
  d.logo.offsetX = clamp(d.logo.offsetX, -0.4, 0.4, 0);
  d.logo.offsetY = clamp(d.logo.offsetY, -0.4, 0.4, 0);
  d.logo.margin = clamp(d.logo.margin, 0, 4, 1);
  d.logo.plate = oneOf(d.logo.plate, LOGO_PLATES, 'rounded');
  d.logo.plateColor = color(d.logo.plateColor, '#ffffff');
  d.logo.crop = oneOf(d.logo.crop, LOGO_CROPS, 'rounded');
  d.logo.zoom = clamp(d.logo.zoom, 1, 4, 1);
  d.logo.panX = clamp(d.logo.panX, -1, 1, 0);
  d.logo.panY = clamp(d.logo.panY, -1, 1, 0);
  d.logo.clear = !!d.logo.clear;
  d.frame.style = oneOf(d.frame.style, FRAME_STYLES, 'none');
  d.frame.color = color(d.frame.color, '#15171a');
  d.frame.textColor = color(d.frame.textColor, '#ffffff');
  d.frame.top = String(d.frame.top ?? '').slice(0, 40);
  d.frame.bottom = String(d.frame.bottom ?? '').slice(0, 40);
  d.frame.thickness = clamp(d.frame.thickness, 0.4, 3, 1.2);
  d.frame.font = oneOf(d.frame.font, ['sans', 'mono'], 'sans');
  d.output.px = Math.round(clamp(d.output.px, 128, 8192, 1024));
  d.output.mm = Math.round(clamp(d.output.mm, 8, 1000, 40) * 10) / 10;
  return d;
}
