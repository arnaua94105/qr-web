// Plantillas: ajustes reales del diseño (no imágenes). Al aplicarlas el usuario puede seguir editando todo.
// Todas verifican contraste ≥ 4:1 entre módulos y fondo (lo comprueba tests/templates.test.mjs).
export const TEMPLATE_CATEGORIES = [
  ['todas', 'Todas'], ['negocio', 'Negocio'], ['estilo', 'Estilo'], ['eventos', 'Eventos y regalos'], ['3d', 'Para imprimir en 3D'],
];

export const TEMPLATES = [
  {
    id: 'minimal', name: 'Minimalista', category: 'estilo', tags: ['limpio', 'universal'],
    blurb: 'Módulos cuadrados, tinta negra y mucho aire. La opción más fiable.',
    sample: { type: 'url', values: { url: 'https://example.com' } },
    design: { modules: { shape: 'square', color: '#16181b' }, background: { color: '#ffffff' } },
  },
  {
    id: 'corporate', name: 'Corporativa', category: 'negocio', tags: ['empresa', 'tarjeta'],
    blurb: 'Esquinas suaves y una etiqueta de marca. Pensada para tarjetas y carteles.',
    sample: { type: 'vcard', values: { first: 'Lucía', last: 'Ortega', org: 'Estudio Faro', mobile: '+34 600 123 456', email: 'lucia@example.com' } },
    design: { qr: { ecl: 'Q' }, modules: { shape: 'rounded', color: '#14304f' }, finder: { outer: 'rounded', inner: 'rounded', outerColor: '#14304f', innerColor: '#14304f' }, background: { color: '#ffffff' }, frame: { style: 'banner', color: '#14304f', textColor: '#ffffff', bottom: 'ESCANÉAME' } },
  },
  {
    id: 'elegant', name: 'Elegante', category: 'estilo', tags: ['boda', 'lujo'],
    blurb: 'Módulos líquidos en tinta cálida sobre papel crema.',
    sample: { type: 'url', values: { url: 'https://example.com/boda' } },
    design: { modules: { shape: 'liquid', color: '#3a2a1c' }, finder: { outer: 'rounded', inner: 'circle' }, background: { color: '#f7f1e6' } },
  },
  {
    id: 'tech', name: 'Tecnológica', category: 'estilo', tags: ['oscuro', 'neón'],
    blurb: 'Fondo oscuro con módulos verdes. Invertida: pruébala con tu móvil.',
    sample: { type: 'url', values: { url: 'https://example.com/dev' } },
    design: { qr: { ecl: 'Q' }, modules: { shape: 'square', color: '#7dffb2' }, finder: { outer: 'square', inner: 'square' }, background: { color: '#0e1512' } },
  },
  {
    id: 'retro', name: 'Retro', category: 'estilo', tags: ['70s', 'cálido'],
    blurb: 'Puntos de tinta marrón sobre un naranja desvaído.',
    sample: { type: 'url', values: { url: 'https://example.com/retro' } },
    design: { modules: { shape: 'dots', scale: 0.92, color: '#4a1f0c' }, finder: { outer: 'circle', inner: 'circle', outerColor: '#8c2f0b', innerColor: '#8c2f0b' }, background: { color: '#f6d9a8' } },
  },
  {
    id: 'geometric', name: 'Geométrica', category: 'estilo', tags: ['rombos', 'patrón'],
    blurb: 'Rombos y hojas en los localizadores.',
    sample: { type: 'url', values: { url: 'https://example.com/geo' } },
    design: { qr: { ecl: 'Q' }, modules: { shape: 'diamond', scale: 1, color: '#1d2a62' }, finder: { outer: 'leaf', inner: 'diamond' }, background: { color: '#ffffff' } },
  },
  {
    id: 'mono', name: 'Monocromática', category: 'estilo', tags: ['grises', 'discreto'],
    blurb: 'Barras verticales en gris carbón.',
    sample: { type: 'url', values: { url: 'https://example.com/mono' } },
    design: { qr: { ecl: 'Q' }, modules: { shape: 'bars-v', scale: 0.95, color: '#2b2b2b' }, finder: { outer: 'square', inner: 'square' }, background: { color: '#efefef' } },
  },
  {
    id: 'colorful', name: 'Colorida', category: 'estilo', tags: ['alegre', 'juvenil'],
    blurb: 'Hojas violetas con localizadores magenta.',
    sample: { type: 'url', values: { url: 'https://example.com/fiesta' } },
    design: { qr: { ecl: 'Q' }, modules: { shape: 'leaf', color: '#4a1b8f' }, finder: { outer: 'leaf', inner: 'leaf', outerColor: '#b0125e', innerColor: '#b0125e' }, background: { color: '#fff6c9' } },
  },
  {
    id: 'restaurant', name: 'Restaurante', category: 'negocio', tags: ['carta', 'menú'],
    blurb: 'Tarjeta con «Nuestra carta» lista para mesas y escaparates.',
    sample: { type: 'url', values: { url: 'https://example.com/carta' } },
    design: { qr: { ecl: 'Q' }, modules: { shape: 'rounded', color: '#3b1a12' }, finder: { outer: 'rounded', inner: 'rounded' }, background: { color: '#fff8ee', radius: 0.04 }, frame: { style: 'card', color: '#8f2d17', textColor: '#ffffff', top: 'NUESTRA CARTA', bottom: 'Escanea y pide' } },
  },
  {
    id: 'event', name: 'Evento', category: 'eventos', tags: ['entrada', 'agenda'],
    blurb: 'Etiqueta superior e inferior para entradas y programas.',
    sample: { type: 'event', values: { title: 'Inauguración', start: '2026-12-05T19:00', end: '2026-12-05T21:00', location: 'Calle Mayor 1' } },
    design: { qr: { ecl: 'M' }, modules: { shape: 'rounded', color: '#101820' }, finder: { outer: 'rounded', inner: 'rounded' }, background: { color: '#ffffff' }, frame: { style: 'banner', color: '#101820', textColor: '#ffffff', top: 'ESTÁS INVITADO', bottom: 'AÑADIR AL CALENDARIO' } },
  },
  {
    id: 'social', name: 'Redes sociales', category: 'negocio', tags: ['instagram', 'perfil'],
    blurb: 'Corazón central y llamada a seguirte.',
    sample: { type: 'social', values: { network: 'instagram', handle: 'qrstudio.demo' } },
    design: { qr: { ecl: 'H' }, modules: { shape: 'dots', scale: 0.95, color: '#7a1450' }, finder: { outer: 'circle', inner: 'circle' }, background: { color: '#ffffff' }, logo: { kind: 'icon', icon: 'heart', iconColor: '#d4145a', size: 0.2, plate: 'circle', plateColor: '#ffffff' }, frame: { style: 'banner', color: '#7a1450', textColor: '#ffffff', bottom: 'SÍGUENOS' } },
  },
  {
    id: 'label', name: 'Etiqueta de producto', category: 'negocio', tags: ['envase', 'inventario'],
    blurb: 'Borde fino y módulos compactos para etiquetas pequeñas.',
    sample: { type: 'text', values: { text: 'LOTE-2026-0457' } },
    design: { qr: { ecl: 'M', quiet: 4 }, modules: { shape: 'square', color: '#000000' }, background: { color: '#ffffff' }, frame: { style: 'border', color: '#000000', thickness: 1 } },
  },
  {
    id: 'gift', name: 'Regalo', category: 'eventos', tags: ['mensaje', 'sorpresa'],
    blurb: 'Estrella central sobre un papel de regalo suave.',
    sample: { type: 'text', values: { text: 'Feliz cumpleaños. Abre el enlace de tu sorpresa.' } },
    design: { qr: { ecl: 'H' }, modules: { shape: 'rounded', color: '#8a1f2d' }, finder: { outer: 'rounded', inner: 'circle' }, background: { color: '#fff1ef', radius: 0.06 }, logo: { kind: 'icon', icon: 'star', iconColor: '#c4122f', size: 0.2, plate: 'rounded', plateColor: '#fff1ef' }, frame: { style: 'card', color: '#8a1f2d', textColor: '#ffffff', bottom: 'PARA TI' } },
  },
  {
    id: 'keyring', name: 'Llavero', category: '3d', tags: ['3d', 'llavero'],
    blurb: 'Alto contraste y módulos cuadrados, la base ideal para un llavero impreso.',
    sample: { type: 'url', values: { url: 'https://example.com/yo' } },
    design: { qr: { ecl: 'M', quiet: 2 }, modules: { shape: 'square', color: '#000000' }, background: { color: '#ffffff' } },
    model3d: { keychain: true, qrMm: 28, margin: 4, corner: 3, base: 2.4, relief: 0.8, holeD: 5, holeWall: 2.5, style: 'raised', parts: 'separate' },
  },
  {
    id: 'plate3d', name: 'Placa en relieve', category: '3d', tags: ['3d', 'placa'],
    blurb: 'Correcciones bajas para un QR menos denso y relieves más gruesos.',
    sample: { type: 'url', values: { url: 'https://example.com' } },
    design: { qr: { ecl: 'L', quiet: 2 }, modules: { shape: 'square', color: '#000000' }, background: { color: '#ffffff' } },
    model3d: { shape: 'rect', qrMm: 50, margin: 8, corner: 5, base: 2.4, relief: 1.2, style: 'raised', parts: 'separate', label: 'Escanéame' },
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** Estado completo de una plantilla; conserva el contenido actual si `keepContent` se indica. */
export function templateToPatch(t, keepContent) {
  return { design: t.design, model3d: t.model3d || {}, content: keepContent ? null : t.sample, template: t.id };
}
