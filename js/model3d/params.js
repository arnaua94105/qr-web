// Parámetros del modelo 3D (todas las longitudes en milímetros). Módulo puro.

export const STYLES = [
  ['raised', 'Relieve (módulos elevados)'],
  ['engraved', 'Grabado (módulos hundidos)'],
];
export const PART_MODES = [
  ['single', 'Una sola pieza'],
  ['separate', 'Piezas separadas (dos colores)'],
];
export const PLATE_SHAPES = [
  ['rect', 'Rectangular'],
  ['circle', 'Circular'],
];

export const DEFAULT_3D = Object.freeze({
  shape: 'rect',
  keychain: false,
  style: 'raised',
  parts: 'single',
  invert: false,
  qrMm: 40, // lado del símbolo QR (sin zona de silencio)
  margin: 6, // margen de placa alrededor del símbolo
  corner: 4, // radio de las esquinas
  base: 2, // grosor de la base
  relief: 1, // altura del relieve
  depth: 0.8, // profundidad del grabado
  rimWidth: 0, // borde elevado (0 = sin borde)
  rimHeight: 0.8,
  holeD: 5, // diámetro del orificio del llavero
  holeWall: 3, // distancia del orificio al borde
  label: '', // texto bajo el QR (solo placa rectangular)
  labelBand: 9, // altura de la banda de texto
  detail: 0.3, // resolución de la rejilla en curvas
  clearance: 0, // holgura entre piezas (solo grabado con piezas separadas)
  minFeature: 0.8, // detalle mínimo imprimible (aprox. 2 × boquilla de 0,4 mm)
  minThickness: 1, // grosor mínimo de pared
  baseColor: '#e9e7e1',
  inkColor: '#1b1d20',
});

const LIMITS = {
  qrMm: [10, 250],
  margin: [0, 60],
  corner: [0, 60],
  base: [0.2, 40],
  relief: [0.1, 20],
  depth: [0.1, 20],
  rimWidth: [0, 20],
  rimHeight: [0.1, 20],
  holeD: [1.5, 40],
  holeWall: [0.4, 20],
  labelBand: [3, 60],
  detail: [0.08, 2],
  clearance: [0, 2],
  minFeature: [0.1, 5],
  minThickness: [0.2, 10],
};

const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

/** Para la interfaz: lleva cada valor a su rango (no rechaza, corrige). */
export function sanitize3D(input) {
  const o = { ...DEFAULT_3D, ...(input || {}) };
  for (const [k, [a, b]] of Object.entries(LIMITS)) {
    const n = Number(o[k]);
    o[k] = Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : DEFAULT_3D[k];
  }
  o.shape = PLATE_SHAPES.some((s) => s[0] === o.shape) ? o.shape : 'rect';
  o.style = STYLES.some((s) => s[0] === o.style) ? o.style : 'raised';
  o.parts = PART_MODES.some((s) => s[0] === o.parts) ? o.parts : 'single';
  o.keychain = !!o.keychain;
  o.invert = !!o.invert;
  o.label = String(o.label ?? '').slice(0, 40);
  o.baseColor = hex(o.baseColor, DEFAULT_3D.baseColor);
  o.inkColor = hex(o.inkColor, DEFAULT_3D.inkColor);
  return o;
}

export const PRESETS_3D = [
  { id: 'plate', name: 'Placa', note: 'Placa rectangular con el QR en relieve.', patch: { shape: 'rect', keychain: false, style: 'raised', parts: 'single', corner: 4 } },
  { id: 'keychain', name: 'Llavero', note: 'Placa pequeña con anilla y orificio.', patch: { shape: 'rect', keychain: true, qrMm: 28, margin: 4, corner: 3, base: 2.4, relief: 0.8, style: 'raised', parts: 'single', holeD: 5, holeWall: 2.5 } },
  { id: 'engraved', name: 'Grabado', note: 'Módulos hundidos en la placa.', patch: { shape: 'rect', keychain: false, style: 'engraved', parts: 'single', base: 3, depth: 1.2 } },
  { id: 'twocolor', name: 'Dos colores', note: 'Base y módulos como piezas separadas.', patch: { shape: 'rect', keychain: false, style: 'raised', parts: 'separate', base: 2, relief: 0.8 } },
  { id: 'round', name: 'Medalla', note: 'Placa circular con borde elevado.', patch: { shape: 'circle', keychain: false, style: 'raised', parts: 'single', rimWidth: 1.6, rimHeight: 0.8, margin: 5 } },
  { id: 'tag', name: 'Etiqueta', note: 'Placa con texto bajo el código.', patch: { shape: 'rect', keychain: false, label: 'Escanéame', style: 'raised', parts: 'single' } },
];
