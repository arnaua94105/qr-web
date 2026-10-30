// Geometría de trazados en "unidades de módulo". Módulo puro.
// Un trazado es un array de operaciones absolutas: ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Z'].

export const KAPPA = 0.5522847498307936;

/** Redondea a 3 decimales y quita ceros sobrantes. */
export function num(v) {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

export function pathToD(ops) {
  let d = '';
  for (const op of ops) {
    switch (op[0]) {
      case 'M': d += `M${num(op[1])} ${num(op[2])}`; break;
      case 'L': d += `L${num(op[1])} ${num(op[2])}`; break;
      case 'C': d += `C${num(op[1])} ${num(op[2])} ${num(op[3])} ${num(op[4])} ${num(op[5])} ${num(op[6])}`; break;
      case 'Z': d += 'Z'; break;
    }
  }
  return d;
}

/** Rectángulo con radios por esquina [tl, tr, br, bl]. Se limitan a la mitad del lado menor. */
export function rrect(x, y, w, h, radii = 0) {
  const lim = Math.min(w, h) / 2;
  const r = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, lim)));
  const ops = [['M', x + tl, y], ['L', x + w - tr, y]];
  if (tr) ops.push(['C', x + w - tr + tr * KAPPA, y, x + w, y + tr - tr * KAPPA, x + w, y + tr]);
  ops.push(['L', x + w, y + h - br]);
  if (br) ops.push(['C', x + w, y + h - br + br * KAPPA, x + w - br + br * KAPPA, y + h, x + w - br, y + h]);
  ops.push(['L', x + bl, y + h]);
  if (bl) ops.push(['C', x + bl - bl * KAPPA, y + h, x, y + h - bl + bl * KAPPA, x, y + h - bl]);
  ops.push(['L', x, y + tl]);
  if (tl) ops.push(['C', x, y + tl - tl * KAPPA, x + tl - tl * KAPPA, y, x + tl, y]);
  ops.push(['Z']);
  return ops;
}

export function circle(cx, cy, r) {
  const k = r * KAPPA;
  return [
    ['M', cx + r, cy],
    ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ['Z'],
  ];
}

export function diamond(cx, cy, r) {
  return [['M', cx, cy - r], ['L', cx + r, cy], ['L', cx, cy + r], ['L', cx - r, cy], ['Z']];
}

/** Polígono regular o estrella (puntos), girado para que un vértice apunte arriba. */
export function polygon(cx, cy, r, sides, inner = 0) {
  const ops = [];
  const n = inner ? sides * 2 : sides;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const rr = inner && i % 2 ? inner : r;
    ops.push([i ? 'L' : 'M', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  ops.push(['Z']);
  return ops;
}

export function translateOps(ops, dx, dy) {
  return ops.map((op) => {
    if (op[0] === 'Z') return op;
    const out = [op[0]];
    for (let i = 1; i < op.length; i += 2) out.push(op[i] + dx, op[i + 1] + dy);
    return out;
  });
}

export function scaleOps(ops, sx, sy = sx) {
  return ops.map((op) => {
    if (op[0] === 'Z') return op;
    const out = [op[0]];
    for (let i = 1; i < op.length; i += 2) out.push(op[i] * sx, op[i + 1] * sy);
    return out;
  });
}

/** Convierte un trazado en polilíneas (una por subtrazado). `steps` = segmentos por curva. */
export function flatten(ops, steps = 8) {
  const polys = [];
  let cur = null;
  let x = 0, y = 0;
  for (const op of ops) {
    if (op[0] === 'M') {
      cur = [[op[1], op[2]]];
      polys.push(cur);
      x = op[1]; y = op[2];
    } else if (op[0] === 'L') {
      cur.push([op[1], op[2]]);
      x = op[1]; y = op[2];
    } else if (op[0] === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        cur.push([
          u * u * u * x + 3 * u * u * t * op[1] + 3 * u * t * t * op[3] + t * t * t * op[5],
          u * u * u * y + 3 * u * u * t * op[2] + 3 * u * t * t * op[4] + t * t * t * op[6],
        ]);
      }
      x = op[5]; y = op[6];
    }
  }
  return polys;
}

// ---------------------------------------------------------------- contornos de una rejilla

/**
 * Traza los contornos de las celdas "oscuras" de una rejilla w×h.
 * Todos los bucles recorren el borde con la región a la derecha (sentido horario en pantalla
 * para contornos exteriores). En los contactos diagonales se separa cada celda de la otra.
 * @returns {Array<Array<[number,number]>>} bucles de vértices enteros sin puntos colineales.
 */
export function traceLoops(isDark, w, h) {
  const dark = (x, y) => x >= 0 && y >= 0 && x < w && y < h && isDark(x, y);
  const edges = []; // [x0,y0,x1,y1]
  const out = new Map(); // vértice -> índices de aristas que salen de él
  const key = (x, y) => y * (w + 2) + x;
  const add = (x0, y0, x1, y1) => {
    const i = edges.length;
    edges.push([x0, y0, x1, y1]);
    const k = key(x0, y0);
    const arr = out.get(k);
    if (arr) arr.push(i); else out.set(k, [i]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dark(x, y)) continue;
      if (!dark(x, y - 1)) add(x, y, x + 1, y);
      if (!dark(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!dark(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!dark(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const used = new Uint8Array(edges.length);
  const loops = [];
  // giro a la derecha (horario en pantalla): (dx,dy) -> (-dy,dx)
  for (let s = 0; s < edges.length; s++) {
    if (used[s]) continue;
    const pts = [];
    let e = s;
    for (;;) {
      used[e] = 1;
      const [x0, y0, x1, y1] = edges[e];
      pts.push([x0, y0]);
      const dx = x1 - x0, dy = y1 - y0;
      const cands = (out.get(key(x1, y1)) || []).filter((i) => !used[i] || i === s);
      if (!cands.length) break;
      let best = -1, bestScore = -9;
      for (const i of cands) {
        const [a, b, c, d] = edges[i];
        const ex = c - a, ey = d - b;
        const cross = dx * ey - dy * ex; // >0: giro a la derecha
        const dot = dx * ex + dy * ey;
        const score = cross > 0 ? 3 : dot > 0 ? 2 : 1;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best === s) break;
      e = best;
    }
    if (pts.length >= 4) loops.push(simplifyLoop(pts));
  }
  return loops;
}

function simplifyLoop(pts) {
  const n = pts.length;
  const res = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], c = pts[i], q = pts[(i + 1) % n];
    const cross = (c[0] - p[0]) * (q[1] - c[1]) - (c[1] - p[1]) * (q[0] - c[0]);
    if (cross !== 0) res.push(c);
  }
  return res;
}

/**
 * Convierte un bucle (región a la derecha) en un trazado con esquinas redondeadas.
 * rConvex: radio de las esquinas salientes; rConcave: radio de las entrantes. Ambos en módulos.
 */
export function loopToPath(loop, rConvex = 0, rConcave = 0, ox = 0, oy = 0) {
  const n = loop.length;
  const info = [];
  for (let i = 0; i < n; i++) {
    const p = loop[(i + n - 1) % n], c = loop[i], q = loop[(i + 1) % n];
    const lin = Math.abs(c[0] - p[0]) + Math.abs(c[1] - p[1]);
    const lout = Math.abs(q[0] - c[0]) + Math.abs(q[1] - c[1]);
    const din = [Math.sign(c[0] - p[0]), Math.sign(c[1] - p[1])];
    const dout = [Math.sign(q[0] - c[0]), Math.sign(q[1] - c[1])];
    const convex = din[0] * dout[1] - din[1] * dout[0] > 0;
    const r = Math.min(convex ? rConvex : rConcave, lin / 2, lout / 2);
    info.push({ c, din, dout, r });
  }
  const P = (x, y) => [x + ox, y + oy];
  const ops = [];
  const first = info[0];
  const startPt = P(first.c[0] + first.dout[0] * first.r, first.c[1] + first.dout[1] * first.r);
  ops.push(['M', ...startPt]);
  for (let k = 1; k <= n; k++) {
    const { c, din, dout, r } = info[k % n];
    const e = P(c[0] - din[0] * r, c[1] - din[1] * r);
    ops.push(['L', ...e]);
    if (r > 0) {
      const x = P(c[0] + dout[0] * r, c[1] + dout[1] * r);
      ops.push(['C', e[0] + din[0] * KAPPA * r, e[1] + din[1] * KAPPA * r, x[0] - dout[0] * KAPPA * r, x[1] - dout[1] * KAPPA * r, x[0], x[1]]);
    }
  }
  ops.push(['Z']);
  return ops;
}
