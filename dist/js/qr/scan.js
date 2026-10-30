// Escaneabilidad: avisos heurísticos y prueba de decodificación sobre el render real.
// Módulo puro. La prueba NO usa cámara: muestrea la imagen renderizada módulo a módulo y la
// decodifica con el decodificador propio. Distingue cuatro estados y nunca promete lectura universal.
import { decodeMatrix, simulateCover } from './decoder.js';
import { rasterizeScene } from './softraster.js';

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

/** Relación de contraste WCAG entre dos colores #rrggbb. */
export function contrastRatio(a, b) {
  const la = lum(a), lb = lum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Umbral por 2-medias iniciada en los extremos (robusta con dos tonos de oscuro, p. ej. módulos y localizadores de distinto color). */
function otsu(values) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!(hi > lo)) return 127;
  let c0 = lo, c1 = hi;
  for (let it = 0; it < 30; it++) {
    const t = (c0 + c1) / 2;
    let s0 = 0, n0 = 0, s1 = 0, n1 = 0;
    for (const v of values) {
      if (v < t) { s0 += v; n0++; } else { s1 += v; n1++; }
    }
    const n0c = n0 ? s0 / n0 : c0, n1c = n1 ? s1 / n1 : c1;
    if (Math.abs(n0c - c0) < 0.01 && Math.abs(n1c - c1) < 0.01) break;
    c0 = n0c;
    c1 = n1c;
  }
  return (c0 + c1) / 2;
}

/**
 * Prueba de decodificación sobre el render.
 * @returns {{center:{ok:boolean,mismatches:number,error?:string}, area:{ok:boolean,mismatches:number,error?:string}, ppm:number}}
 */
export function simulateScan(scene, qr, expectedText, opts = {}) {
  const ppm = opts.pxPerModule ?? 6;
  const { size } = qr;
  const { mx, my } = scene.layout;
  const img = rasterizeScene(scene, ppm);
  const sampleCenter = new Float32Array(size * size);
  const sampleArea = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px0 = Math.round((mx + x) * ppm), py0 = Math.round((my + y) * ppm);
      const pc = Math.min(img.w - 1, Math.floor((mx + x + 0.5) * ppm));
      const pr = Math.min(img.h - 1, Math.floor((my + y + 0.5) * ppm));
      sampleCenter[y * size + x] = img.data[pr * img.w + pc];
      let acc = 0, n = 0;
      for (let j = 0; j < ppm; j++) {
        for (let i = 0; i < ppm; i++) {
          const xx = px0 + i, yy = py0 + j;
          if (xx < img.w && yy < img.h) { acc += img.data[yy * img.w + xx]; n++; }
        }
      }
      sampleArea[y * size + x] = n ? acc / n : 255;
    }
  }
  const run = (samples) => {
    const covered = scene.covered;
    const considered = [];
    for (let i = 0; i < samples.length; i++) if (!covered[i]) considered.push(samples[i]);
    const thr = otsu(considered.length ? considered : samples);
    // Un módulo oscuro es más oscuro que el umbral; si los módulos son más claros que el fondo (QR invertido)
    // se invierte la decisión: se decide por qué lado del umbral cae la mayoría de los módulos de localizador.
    const finderDarkSide = samples[1 * size + 1 + 0] < thr || samples[3 * size + 3] < thr;
    const grid = new Uint8Array(size * size);
    for (let i = 0; i < grid.length; i++) {
      if (covered[i]) { grid[i] = 0; continue; }
      const isLow = samples[i] < thr;
      grid[i] = (finderDarkSide ? isLow : !isLow) ? 1 : 0;
    }
    // el centro del localizador (3,3) es un módulo oscuro: fija la polaridad
    if (!covered[3 * size + 3] && grid[3 * size + 3] === 0) for (let i = 0; i < grid.length; i++) if (!covered[i]) grid[i] ^= 1;
    let mismatches = 0;
    for (let i = 0; i < grid.length; i++) if (!covered[i] && grid[i] !== qr.modules[i]) mismatches++;
    try {
      const d = decodeMatrix(grid, size);
      const ok = d.text === expectedText;
      return { ok, mismatches, corrected: d.correctedCodewords, error: ok ? undefined : 'El texto decodificado no coincide' };
    } catch (e) {
      return { ok: false, mismatches, error: e.message };
    }
  };
  return { center: run(sampleCenter), area: run(sampleArea), ppm };
}

/** Niveles de aviso: ok < info < warn < bad. */
export function analyze(design, qr, scene, opts = {}) {
  const checks = [];
  const add = (id, level, title, detail) => checks.push({ id, level, title, detail });
  const mod = design.modules.color;
  const bg = design.background;
  const printMm = opts.printMm ?? design.output.mm ?? 40;

  // --- contraste
  if (bg.transparent) {
    add('contrast', 'info', 'Fondo transparente', 'El contraste dependerá del color donde lo coloques. Pruébalo sobre su fondo final.');
  } else {
    const cr = contrastRatio(mod, bg.color);
    const modLight = lum(mod) > lum(bg.color);
    if (cr < 2.5) add('contrast', 'bad', `Contraste muy bajo (${cr.toFixed(1)}:1)`, 'Los módulos casi no se distinguen del fondo. Oscurece los módulos o aclara el fondo.');
    else if (cr < 4) add('contrast', 'warn', `Contraste justo (${cr.toFixed(1)}:1)`, 'Puede fallar con poca luz o en pantallas. Se recomienda 4:1 o más.');
    else add('contrast', 'ok', `Contraste correcto (${cr.toFixed(1)}:1)`, 'Los módulos se distinguen bien del fondo.');
    if (modLight) add('inverted', 'warn', 'Módulos más claros que el fondo', 'Algunos lectores antiguos no leen códigos invertidos. Los móviles actuales suelen hacerlo.');
  }
  for (const [label, col] of [['localizadores (marco)', design.finder.outerColor], ['localizadores (centro)', design.finder.innerColor], ['patrón de alineación', design.alignment.color]]) {
    if (col && !bg.transparent && contrastRatio(col, bg.color) < 3) add('contrast-' + label, 'warn', `Poco contraste en ${label}`, 'Esos elementos ayudan al lector a localizar el código: manténlos oscuros.');
  }
  if (design.finder.outer !== 'square') {
    const strong = design.finder.outer === 'circle';
    add(
      'finder-shape',
      strong ? 'warn' : 'info',
      strong ? 'Localizadores circulares: lectura menos universal' : 'Localizadores con esquinas redondeadas',
      'Muchos móviles los leen, pero algunos lectores no los reconocen (en nuestras pruebas, OpenCV no lee estos diseños aunque el código sea correcto). Pruébalo con tu móvil antes de imprimir.',
    );
  }
  if (scene.hasBgImage) {
    if (bg.plate < 0.8) add('bgimage', 'warn', 'Imagen de fondo visible bajo el código', 'Sube la opacidad de la placa tras el QR (80 % o más) para que la imagen no interfiera.');
    else add('bgimage', 'info', 'Imagen de fondo con placa', 'La placa protege el código; prueba el resultado con un móvil.');
  }

  // --- zona de silencio
  if (design.qr.quiet < 2) add('quiet', 'bad', 'Zona de silencio casi inexistente', 'La norma pide 4 módulos de margen. Con menos, muchos lectores no encuentran el código.');
  else if (design.qr.quiet < 4) add('quiet', 'warn', `Zona de silencio reducida (${design.qr.quiet} módulos)`, 'La norma recomienda 4 módulos. Funciona en muchos móviles, pero es un riesgo.');
  else add('quiet', 'ok', 'Zona de silencio correcta', `${design.qr.quiet} módulos de margen.`);

  // --- logotipo
  const lg = design.logo;
  if (lg.kind !== 'none') {
    const cover = simulateCover(qr, scene.covered);
    const pct = (cover.coveredFraction * 100).toFixed(1);
    if (scene.coversFinder) add('logo-finder', 'bad', 'El logotipo toca un localizador', 'Aleja o reduce el logotipo: las tres esquinas deben quedar completas.');
    if (lg.size > 0.3) add('logo-size', 'warn', 'Logotipo muy grande', 'Por encima del 30 % del lado, el riesgo de fallo sube mucho.');
    if (!cover.recovered) {
      add('logo', 'bad', `El logotipo tapa demasiado (${pct} % de los módulos)`, 'La corrección de errores no puede reconstruir el código. Reduce el logotipo o sube la corrección a Q/H.');
    } else if (cover.eccLoad > 0.7) {
      add('logo', 'warn', `El logotipo consume casi toda la corrección (${Math.round(cover.eccLoad * 100)} %)`, `Tapa el ${pct} % de los módulos. Funciona, pero sin margen ante rozaduras o mala luz.`);
    } else {
      add('logo', 'ok', `Logotipo compatible (tapa el ${pct} % de los módulos)`, `Usa el ${Math.round(cover.eccLoad * 100)} % de la capacidad de corrección en el peor bloque.`);
    }
    if (qr.ecl < 2) add('ecl-logo', 'warn', `Con logotipo conviene corrección Q o H (ahora ${'LMQH'[qr.ecl]})`, 'Una corrección más alta deja margen para el hueco del logotipo.');
  } else if (qr.ecl === 0) {
    add('ecl', 'info', 'Corrección L', 'Ocupa menos módulos pero tolera muy poco daño. Para impresos expuestos usa M o superior.');
  }

  // --- complejidad y tamaño de impresión
  const total = qr.size + 2 * design.qr.quiet;
  if (qr.version >= 20) add('density', 'warn', `Código muy denso (versión ${qr.version}, ${qr.size}×${qr.size})`, 'Acorta el contenido (por ejemplo, con un enlace corto) o usa una corrección menor.');
  else if (qr.version >= 12) add('density', 'info', `Código denso (versión ${qr.version})`, 'Necesita más tamaño al imprimir. Un enlace más corto lo simplifica.');
  else add('density', 'ok', `Complejidad razonable (versión ${qr.version}, ${qr.size}×${qr.size})`, 'Se lee bien incluso en tamaños pequeños.');
  const moduleMm = printMm / scene.width;
  const minMm = Math.ceil(scene.width * 0.4 * 10) / 10;
  if (moduleMm < 0.33) add('print', 'bad', `Tamaño de impresión demasiado pequeño (${moduleMm.toFixed(2)} mm por módulo)`, `Con este diseño imprímelo a ${Math.ceil(scene.width * 0.4)} mm o más de ancho.`);
  else if (moduleMm < 0.5) add('print', 'warn', `Tamaño de impresión ajustado (${moduleMm.toFixed(2)} mm por módulo)`, `Recomendado: al menos ${minMm.toFixed(0)} mm de ancho y una impresión nítida.`);
  else add('print', 'ok', `Tamaño de impresión suficiente (${moduleMm.toFixed(2)} mm por módulo)`, `A ${printMm} mm de ancho. Regla práctica: se lee desde unas 10 veces su ancho.`);

  // --- módulos pequeños
  const small = ['dots', 'diamond', 'bars-v', 'bars-h', 'leaf'].includes(design.modules.shape) && design.modules.scale < 0.7;
  if (small) add('shape', 'warn', 'Módulos muy pequeños dentro de su celda', 'Con menos tinta cuesta distinguirlos: sube el tamaño de módulo por encima del 70 %.');
  void total;

  const worst = checks.some((c) => c.level === 'bad') ? 'bad' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
  return { checks, worst, minPrintMm: minMm, moduleMm };
}

/** Estado global de la verificación, en las cuatro categorías que ve la persona. */
export function verdict(sim, analysis) {
  if (!sim) return { id: 'generated', label: 'Generado', detail: 'El código se ha generado correctamente. Aún no se ha comprobado su lectura.' };
  if (!sim.center.ok) {
    return { id: 'failed', label: 'No se decodifica en la prueba', detail: sim.center.error || 'La simulación no pudo leer el código. Revisa los avisos.' };
  }
  if (!sim.area.ok) {
    return { id: 'fragile', label: 'Frágil: se lee en nitidez perfecta, no con una cámara borrosa', detail: 'La decodificación pasa con muestreo exacto pero falla al promediar cada módulo. Haz los módulos más gruesos o sube el contraste.' };
  }
  void analysis;
  return { id: 'verified-sim', label: 'Decodificado en simulación', detail: 'El render se decodifica muestreando cada módulo (centro y media). No sustituye una prueba con un móvil real.' };
}
