// Del QR a geometría 3D imprimible. Módulo puro (sin DOM).
//
// Método: rejilla rectilínea conforme (las mismas líneas para todas las celdas, así no hay uniones en T) con
// una columna por celda: cada celda es un prisma [zb, zt]. Las líneas de la rejilla incluyen los límites de los
// módulos del QR (exactos, en mm) y líneas finas solo donde hay curvas (esquinas, anilla, orificio, texto).
// Cada pieza (base, módulos…) sale como malla indexada cerrada; los vértices se sueldan por índice de rejilla,
// no por distancia. Unidades: milímetros. Ejes: X a la derecha, Y hacia arriba en la imagen del QR, Z hacia arriba.
//
// Límites conocidos: los contornos curvos son escalones del tamaño de `detail`; no hay biselado.

import { DEFAULT_3D } from './params.js';

export class ModelError extends Error {}

const EPS = 1e-6;
const MAX_CELLS = 420000;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** Comprueba parámetros sin corregirlos: lo inválido se rechaza con ModelError. */
export function assertParams(p, qr) {
  const bad = (m) => {
    throw new ModelError(m);
  };
  if (!qr || !qr.size || !qr.modules) bad('Falta la matriz del QR.');
  for (const k of ['qrMm', 'margin', 'corner', 'base', 'relief', 'depth', 'rimWidth', 'rimHeight', 'holeD', 'holeWall', 'labelBand', 'detail', 'clearance']) {
    if (!fin(p[k])) bad(`El parámetro «${k}» no es un número válido.`);
  }
  if (p.qrMm <= 0) bad('El tamaño del QR debe ser mayor que 0 mm.');
  if (p.margin < 0) bad('El margen no puede ser negativo.');
  if (p.corner < 0) bad('El radio de las esquinas no puede ser negativo.');
  if (p.base <= 0) bad('El grosor de la base debe ser mayor que 0 mm.');
  if (p.relief <= 0) bad('La altura del relieve debe ser mayor que 0 mm.');
  if (p.detail < 0.05) bad('La resolución es demasiado fina (mínimo 0,05 mm).');
  if (p.rimWidth < 0 || p.rimHeight < 0) bad('El borde no puede tener medidas negativas.');
  if (p.clearance < 0) bad('La holgura no puede ser negativa.');
  if (p.style === 'engraved') {
    if (p.depth <= 0) bad('La profundidad del grabado debe ser mayor que 0 mm.');
    if (p.depth >= p.base) bad('El grabado no puede atravesar la base: la profundidad debe ser menor que el grosor.');
  }
  if (p.keychain) {
    if (p.holeD <= 0) bad('El diámetro del orificio debe ser mayor que 0 mm.');
    if (p.holeWall <= 0) bad('La distancia del orificio al borde debe ser mayor que 0 mm.');
  }
  if (p.shape !== 'rect' && p.shape !== 'circle') bad('Forma de placa desconocida.');
  if (p.style !== 'raised' && p.style !== 'engraved') bad('Estilo desconocido.');
  if (p.parts !== 'single' && p.parts !== 'separate') bad('Modo de piezas desconocido.');
}

function addRange(set, a, b, step) {
  if (b < a) [a, b] = [b, a];
  const n = Math.max(1, Math.ceil((b - a) / step - EPS));
  for (let i = 0; i <= n; i++) set.push(a + ((b - a) * i) / n);
}

function dedupe(arr, tol = 1e-4) {
  arr.sort((a, b) => a - b);
  const out = [];
  for (const v of arr) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

/**
 * @param qr resultado de encodeText ({size, modules})
 * @param {object} params ver DEFAULT_3D
 * @param {{labelMask?:{cols:number,rows:number,data:Uint8Array}}} [opts] máscara del texto (1 = tinta), fila 0 arriba
 */
export function buildModel(qr, params, opts = {}) {
  const p = { ...DEFAULT_3D, ...params };
  assertParams(p, qr);
  const size = qr.size;
  const m = p.qrMm / size; // mm por módulo
  const circle = p.shape === 'circle';
  const mask = !circle && p.label.trim() && opts.labelMask && opts.labelMask.cols > 0 ? opts.labelMask : null;
  const band = mask ? p.labelBand : 0;

  // ------------------------------------------------------------ geometría de la placa
  let baseW, baseH;
  if (circle) baseW = baseH = Math.SQRT2 * p.qrMm + 2 * p.margin;
  else {
    baseW = p.qrMm + 2 * p.margin;
    baseH = p.qrMm + 2 * p.margin + band;
  }
  const r = Math.min(p.corner, baseW / 2, baseH / 2);
  const cx = baseW / 2;
  const R = p.holeD / 2 + p.holeWall; // radio de la anilla
  const earCy = baseH + R;
  const hasEar = p.keychain;
  const totalH = baseH + (hasEar ? 2 * R : 0);
  const qx0 = (baseW - p.qrMm) / 2;
  const qyTop = circle ? (baseH + p.qrMm) / 2 : band + p.margin + p.qrMm;

  const sdBase = (x, y) => {
    if (circle) return baseW / 2 - Math.hypot(x - baseW / 2, y - baseH / 2);
    const dx = Math.min(x, baseW - x), dy = Math.min(y, baseH - y);
    if (dx < r && dy < r) return r - Math.hypot(r - dx, r - dy);
    return Math.min(dx, dy);
  };
  const sdEar = (x, y) => {
    const circ = R - Math.hypot(x - cx, y - earCy);
    let rect = -Infinity;
    if (y <= earCy) rect = Math.min(R - Math.abs(x - cx), y - (baseH - 0.5));
    return Math.max(circ, rect);
  };
  const sdPlate = (x, y) => {
    let d = sdBase(x, y);
    if (hasEar) {
      d = Math.max(d, sdEar(x, y));
      d = Math.min(d, Math.hypot(x - cx, y - earCy) - p.holeD / 2); // orificio
    }
    return d;
  };

  // ------------------------------------------------------------ rejilla
  let detail = p.detail;
  let xs, ys;
  const clearOn = p.parts === 'separate' && p.style === 'engraved' && p.clearance > 0;
  const textBox = mask
    ? (() => {
        const h = band * 0.62;
        const aspect = mask.cols / mask.rows;
        let w = h * aspect;
        const maxW = baseW - 2 * Math.max(p.margin, 2);
        let hh = h;
        if (w > maxW) {
          w = maxW;
          hh = w / aspect;
        }
        return { x0: cx - w / 2, x1: cx + w / 2, y0: band / 2 - hh / 2, y1: band / 2 + hh / 2 };
      })()
    : null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const X = [0, baseW], Y = [0, totalH];
    // módulos del QR (exactos)
    for (let k = 0; k <= size; k++) {
      X.push(qx0 + k * m);
      Y.push(qyTop - k * m);
      if (clearOn) {
        X.push(qx0 + k * m - p.clearance, qx0 + k * m + p.clearance);
        Y.push(qyTop - k * m - p.clearance, qyTop - k * m + p.clearance);
      }
    }
    if (circle) {
      addRange(X, 0, baseW, detail);
      addRange(Y, 0, baseH, detail);
    } else if (r > 0) {
      addRange(X, 0, r, detail);
      addRange(X, baseW - r, baseW, detail);
      addRange(Y, 0, r, detail);
      addRange(Y, baseH - r, baseH, detail);
    }
    if (p.rimWidth > 0) {
      X.push(p.rimWidth, baseW - p.rimWidth);
      Y.push(p.rimWidth, baseH - p.rimWidth);
    }
    if (hasEar) {
      addRange(X, cx - R, cx + R, detail);
      addRange(Y, baseH - 0.5, baseH + 2 * R, detail);
      if (p.rimWidth > 0) {
        X.push(cx - R + p.rimWidth, cx + R - p.rimWidth);
        Y.push(baseH + 2 * R - p.rimWidth);
      }
    }
    if (textBox) {
      const step = Math.max(detail * 0.75, 0.12);
      addRange(X, textBox.x0, textBox.x1, step);
      addRange(Y, textBox.y0, textBox.y1, step);
    }
    xs = dedupe(X.filter((v) => v >= -EPS && v <= baseW + EPS));
    ys = dedupe(Y.filter((v) => v >= -EPS && v <= totalH + EPS));
    if ((xs.length - 1) * (ys.length - 1) <= MAX_CELLS) break;
    detail *= 1.4;
    if (attempt === 7) throw new ModelError('El modelo es demasiado detallado para generarlo. Aumenta la resolución (mm) o reduce el tamaño.');
  }
  const nx = xs.length - 1, ny = ys.length - 1;

  // ------------------------------------------------------------ clasificación de celdas
  const dark = (rx, ry) => {
    if (rx < 0 || ry < 0 || rx >= size || ry >= size) return false;
    const v = qr.modules[ry * size + rx] === 1;
    return p.invert ? !v : v;
  };
  const inlayAt = (x, y) => {
    // módulo oscuro, erosionado por la holgura en los bordes que lindan con claro
    const gx = (x - qx0) / m, gy = (qyTop - y) / m;
    const rx = Math.floor(gx), ry = Math.floor(gy);
    if (!dark(rx, ry)) return false;
    if (!clearOn) return true;
    const c = p.clearance;
    const fx = (gx - rx) * m, fy = (gy - ry) * m;
    if (fx < c && !dark(rx - 1, ry)) return false;
    if (m - fx < c && !dark(rx + 1, ry)) return false;
    if (fy < c && !dark(rx, ry - 1)) return false;
    if (m - fy < c && !dark(rx, ry + 1)) return false;
    return true;
  };
  const textAt = (x, y) => {
    if (!textBox || x < textBox.x0 || x >= textBox.x1 || y < textBox.y0 || y >= textBox.y1) return false;
    const u = Math.min(mask.cols - 1, Math.floor(((x - textBox.x0) / (textBox.x1 - textBox.x0)) * mask.cols));
    const v = Math.min(mask.rows - 1, Math.floor(((textBox.y1 - y) / (textBox.y1 - textBox.y0)) * mask.rows));
    return mask.data[v * mask.cols + u] === 1;
  };

  const single = p.parts === 'single';
  const raised = p.style === 'raised';
  const partDefs = single
    ? [{ id: 'body', name: 'Pieza única', color: p.baseColor }]
    : raised
      ? [{ id: 'base', name: 'Base', color: p.baseColor }, { id: 'ink', name: 'Módulos', color: p.inkColor }]
      : [{ id: 'base', name: 'Base', color: p.baseColor }, { id: 'ink', name: 'Relleno', color: p.inkColor }];
  const nc = nx * ny;
  const parts = partDefs.map((d) => ({ ...d, zb: new Float32Array(nc).fill(NaN), zt: new Float32Array(nc).fill(NaN) }));
  const T = p.base, H = p.relief, D = p.depth, RH = p.rimHeight;

  for (let j = 0; j < ny; j++) {
    const y = (ys[j] + ys[j + 1]) / 2;
    for (let i = 0; i < nx; i++) {
      const x = (xs[i] + xs[i + 1]) / 2;
      const sd = sdPlate(x, y);
      if (sd <= 0) continue;
      const idx = j * nx + i;
      const rim = p.rimWidth > 0 && sd < p.rimWidth;
      const ink = !rim && (inlayAt(x, y) || textAt(x, y));
      const rimTop = rim ? RH : 0;
      if (single) {
        parts[0].zb[idx] = 0;
        parts[0].zt[idx] = raised ? T + (ink ? H : 0) + rimTop : T - (ink ? D : 0) + rimTop;
      } else if (raised) {
        parts[0].zb[idx] = 0;
        parts[0].zt[idx] = T + rimTop;
        if (ink) {
          parts[1].zb[idx] = T;
          parts[1].zt[idx] = T + H;
        }
      } else if (ink) {
        parts[0].zb[idx] = 0;
        parts[0].zt[idx] = T - D;
        parts[1].zb[idx] = T - D;
        parts[1].zt[idx] = T;
      } else {
        // celda de base; bajo la holgura no hay relleno pero tampoco hueco extra: la base sigue a la altura T
        const gx = (x - qx0) / m, gy = (qyTop - y) / m;
        const wasDark = dark(Math.floor(gx), Math.floor(gy)) && !rim;
        parts[0].zb[idx] = 0;
        parts[0].zt[idx] = wasDark ? T - D : T + rimTop; // la holgura deja el hueco del cajeado entero
      }
    }
  }

  const out = parts
    .map((pt) => meshFromCells(pt, xs, ys, nx, ny))
    .filter((mm) => mm.triangles > 0);
  if (!out.length) throw new ModelError('La configuración no genera geometría.');

  const bbox = unionBox(out.map((o) => o.bbox));
  return {
    parts: out,
    bbox,
    dims: { x: bbox.max[0] - bbox.min[0], y: bbox.max[1] - bbox.min[1], z: bbox.max[2] - bbox.min[2] },
    info: {
      cells: nx * ny,
      gridX: nx,
      gridY: ny,
      detail,
      requestedDetail: p.detail,
      moduleMm: m,
      plate: { w: baseW, h: totalH, plateH: baseH, circle, earRadius: hasEar ? R : 0, earCenter: hasEar ? [cx, earCy] : null },
      qrBox: { x0: qx0, x1: qx0 + p.qrMm, y0: qyTop - p.qrMm, y1: qyTop },
      textBox,
      params: p,
    },
  };
}

function unionBox(boxes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], b.min[k]);
    max[k] = Math.max(max[k], b.max[k]);
  }
  return { min, max };
}

// ------------------------------------------------------------------ prismas -> malla cerrada

function meshFromCells(part, xs, ys, nx, ny) {
  const { zb, zt } = part;
  // niveles Z distintos de esta pieza
  const levelsSet = new Set();
  for (let k = 0; k < zt.length; k++) if (!Number.isNaN(zt[k])) {
    levelsSet.add(Math.round(zb[k] * 1e5) / 1e5);
    levelsSet.add(Math.round(zt[k] * 1e5) / 1e5);
  }
  const levels = [...levelsSet].sort((a, b) => a - b);
  const zl = levels.length;
  const zIdx = new Map(levels.map((z, i) => [z, i]));
  const zi = (z) => zIdx.get(Math.round(z * 1e5) / 1e5);
  const q = (v) => Math.round(v * 1e5) / 1e5;

  const vmap = new Map();
  const pos = [];
  const vert = (ix, iy, z) => {
    const zk = zi(z);
    const key = (ix * (ny + 1) + iy) * zl + zk;
    let id = vmap.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      vmap.set(key, id);
      pos.push(xs[ix], ys[iy], levels[zk]);
    }
    return id;
  };
  const idx = [];
  const quad = (a, b, c, d) => {
    idx.push(a, b, c, a, c, d);
  };
  const has = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !Number.isNaN(zt[j * nx + i]);

  // espacios de pared: tramos de [lo,hi] no cubiertos por el vecino, partidos en los niveles intermedios
  const spans = (lo, hi, nlo, nhi, hasN) => {
    const segs = [];
    if (!hasN) segs.push([lo, hi]);
    else {
      if (nlo > lo + 1e-5) segs.push([lo, Math.min(hi, nlo)]);
      if (nhi < hi - 1e-5) segs.push([Math.max(lo, nhi), hi]);
    }
    const out = [];
    for (const [a, b] of segs) {
      if (b - a < 1e-5) continue;
      const ia = zi(a), ib = zi(b);
      for (let k = ia; k < ib; k++) out.push([levels[k], levels[k + 1]]);
    }
    return out;
  };

  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i;
    if (Number.isNaN(zt[c])) continue;
    const lo = zb[c], hi = zt[c];
    // tapa y base
    quad(vert(i, j, hi), vert(i + 1, j, hi), vert(i + 1, j + 1, hi), vert(i, j + 1, hi));
    quad(vert(i, j, lo), vert(i, j + 1, lo), vert(i + 1, j + 1, lo), vert(i + 1, j, lo));
    // -x
    {
      const n = has(i - 1, j) ? j * nx + i - 1 : -1;
      for (const [a, b] of spans(lo, hi, n >= 0 ? zb[n] : 0, n >= 0 ? zt[n] : 0, n >= 0))
        quad(vert(i, j, a), vert(i, j, b), vert(i, j + 1, b), vert(i, j + 1, a));
    }
    // +x
    {
      const n = has(i + 1, j) ? j * nx + i + 1 : -1;
      for (const [a, b] of spans(lo, hi, n >= 0 ? zb[n] : 0, n >= 0 ? zt[n] : 0, n >= 0))
        quad(vert(i + 1, j, a), vert(i + 1, j + 1, a), vert(i + 1, j + 1, b), vert(i + 1, j, b));
    }
    // -y
    {
      const n = has(i, j - 1) ? (j - 1) * nx + i : -1;
      for (const [a, b] of spans(lo, hi, n >= 0 ? zb[n] : 0, n >= 0 ? zt[n] : 0, n >= 0))
        quad(vert(i, j, a), vert(i + 1, j, a), vert(i + 1, j, b), vert(i, j, b));
    }
    // +y
    {
      const n = has(i, j + 1) ? (j + 1) * nx + i : -1;
      for (const [a, b] of spans(lo, hi, n >= 0 ? zb[n] : 0, n >= 0 ? zt[n] : 0, n >= 0))
        quad(vert(i + 1, j + 1, a), vert(i, j + 1, a), vert(i, j + 1, b), vert(i + 1, j + 1, b));
    }
  }
  void q;

  const positions = Float32Array.from(pos);
  const indices = Uint32Array.from(idx);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < positions.length; k += 3) for (let a = 0; a < 3; a++) {
    if (positions[k + a] < min[a]) min[a] = positions[k + a];
    if (positions[k + a] > max[a]) max[a] = positions[k + a];
  }
  const triangles = indices.length / 3;
  return {
    id: part.id,
    name: part.name,
    color: part.color,
    positions,
    indices,
    triangles,
    vertices: positions.length / 3,
    bbox: { min, max },
    volume: signedVolume(positions, indices),
  };
}

export function signedVolume(positions, indices) {
  let v = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

/** Malla "plana" para dibujar y exportar: triángulos sin índices con normal por cara. */
export function flatten(part) {
  const { positions: P, indices: I } = part;
  const n = I.length;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  for (let t = 0; t < n; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) {
      const s = [a, b, c][k];
      const o = (t + k) * 3;
      pos[o] = P[s]; pos[o + 1] = P[s + 1]; pos[o + 2] = P[s + 2];
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
    }
  }
  return { positions: pos, normals: nor, count: n };
}
