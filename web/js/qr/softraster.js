// Rasterizador por software (escala de grises) de una escena. Sin DOM ni canvas: funciona
// igual en el navegador y en Node. Se usa para simular la lectura del QR y para las pruebas.
// No dibuja texto ni imágenes: esas zonas se tratan aparte (el logotipo se considera "cubierto").
import { flatten } from './path.js';

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rellena polilíneas cerradas con cobertura antialias (SS subfilas por píxel). */
function fillPolys(gray, W, H, polys, rule, color, alpha, SS = 4) {
  const edges = [];
  let minY = Infinity, maxY = -Infinity;
  for (const poly of polys) {
    const n = poly.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % n];
      if (y0 === y1) continue;
      const up = y1 < y0;
      const ya = up ? y1 : y0, yb = up ? y0 : y1;
      edges.push({ ya, yb, x: up ? x1 : x0, dx: (x1 - x0) / (y1 - y0), dir: up ? -1 : 1 });
      if (ya < minY) minY = ya;
      if (yb > maxY) maxY = yb;
    }
  }
  if (!edges.length) return;
  edges.sort((a, b) => a.ya - b.ya);
  const rowStart = Math.max(0, Math.floor(minY));
  const rowEnd = Math.min(H - 1, Math.ceil(maxY));
  const cov = new Float32Array(W);
  let next = 0;
  let active = [];
  for (let py = rowStart; py <= rowEnd; py++) {
    cov.fill(0);
    let any = false;
    for (let sub = 0; sub < SS; sub++) {
      const y = py + (sub + 0.5) / SS;
      while (next < edges.length && edges[next].ya <= y) active.push(edges[next++]);
      active = active.filter((e) => e.yb > y);
      if (!active.length) continue;
      const xs = [];
      for (const e of active) xs.push([e.x + (y - e.ya) * e.dx, e.dir]);
      xs.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += rule === 'evenodd' ? 1 : xs[i][1];
        const inside = rule === 'evenodd' ? wind % 2 !== 0 : wind !== 0;
        if (!inside) continue;
        const xa = Math.max(0, xs[i][0]), xb = Math.min(W, xs[i + 1][0]);
        if (xb <= xa) continue;
        any = true;
        const ia = Math.floor(xa), ib = Math.min(W - 1, Math.floor(xb));
        if (ia === ib) cov[ia] += (xb - xa) / SS;
        else {
          cov[ia] += (ia + 1 - xa) / SS;
          for (let x = ia + 1; x < ib; x++) cov[x] += 1 / SS;
          cov[ib] += (xb - ib) / SS;
        }
      }
    }
    if (!any) continue;
    const row = py * W;
    for (let x = 0; x < W; x++) {
      const c = cov[x];
      if (c > 0) {
        const a = Math.min(1, c) * alpha;
        gray[row + x] = gray[row + x] * (1 - a) + color * a;
      }
    }
  }
}

/**
 * Rasteriza la escena a escala de grises.
 * @param {object} scene
 * @param {number} pxPerUnit píxeles por módulo
 * @param {{background?:number}} [opts] gris de fondo para escenas con fondo transparente (por defecto 255)
 * @returns {{w:number,h:number,data:Float32Array,scale:number}}
 */
export function rasterizeScene(scene, pxPerUnit, opts = {}) {
  const w = Math.max(1, Math.ceil(scene.width * pxPerUnit));
  const h = Math.max(1, Math.ceil(scene.height * pxPerUnit));
  const data = new Float32Array(w * h).fill(opts.background ?? 255);
  for (const it of scene.items) {
    if (it.t !== 'path') continue;
    const polys = flatten(it.ops, 10).map((p) => p.map(([x, y]) => [x * pxPerUnit, y * pxPerUnit]));
    fillPolys(data, w, h, polys, it.rule, luminance(it.fill), it.opacity ?? 1);
  }
  return { w, h, data, scale: pxPerUnit };
}

/** Escribe la imagen como PGM binario (P5) para decodificadores externos. */
export function toPgm(img) {
  const head = Buffer.from(`P5\n${img.w} ${img.h}\n255\n`);
  const body = Buffer.alloc(img.w * img.h);
  for (let i = 0; i < body.length; i++) body[i] = Math.max(0, Math.min(255, Math.round(img.data[i])));
  return Buffer.concat([head, body]);
}
