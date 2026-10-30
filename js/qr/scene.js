// Construye la "escena" de un QR: primitivas vectoriales en unidades de módulo.
// La misma escena alimenta la vista previa SVG, el PNG, el PDF y el simulador de lectura.
// Módulo puro (sin DOM).
//
// Primitivas:
//   { t:'path',  ops, fill, rule:'evenodd'|'nonzero', opacity? }
//   { t:'image', x, y, w, h, href, clip?: ops, opacity? }
//   { t:'text',  x, y, text, size, fill, family:'sans'|'mono', bold, anchor:'middle' }

import { getAlignmentPatternPositions } from './encoder.js';
import { rrect, circle, diamond, traceLoops, loopToPath, translateOps, scaleOps } from './path.js';
import { iconPath } from './icons.js';
import { textWidthEm } from './fontmetrics.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Centros de los patrones de alineación (excluye los que chocan con los localizadores). */
export function alignmentCenters(version) {
  if (version < 2) return [];
  const pos = getAlignmentPatternPositions(version);
  const last = pos.length - 1;
  const out = [];
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      out.push([pos[i], pos[j]]);
    }
  }
  return out;
}

function ringOps(x, y, outerSize, holeSize, shape) {
  const o = outerSize, h = holeSize, off = (o - h) / 2;
  if (shape === 'circle') {
    return [...circle(x + o / 2, y + o / 2, o / 2), ...circle(x + o / 2, y + o / 2, h / 2)];
  }
  const r = {
    square: [0, 0],
    rounded: [o * 0.29, h * 0.2],
    leaf: [o * 0.42, h * 0.4],
  }[shape] || [0, 0];
  if (shape === 'leaf') return [...rrect(x, y, o, o, [r[0], 0, r[0], 0]), ...rrect(x + off, y + off, h, h, [r[1], 0, r[1], 0])];
  return [...rrect(x, y, o, o, r[0]), ...rrect(x + off, y + off, h, h, r[1])];
}

function eyeOps(x, y, size, shape) {
  switch (shape) {
    case 'rounded': return rrect(x, y, size, size, size * 0.3);
    case 'circle': return circle(x + size / 2, y + size / 2, size / 2);
    case 'diamond': return diamond(x + size / 2, y + size / 2, size * 0.64);
    case 'leaf': return rrect(x, y, size, size, [size * 0.45, 0, size * 0.45, 0]);
    default: return rrect(x, y, size, size, 0);
  }
}

function logoPlateOps(shape, cx, cy, side) {
  const x = cx - side / 2, y = cy - side / 2;
  if (shape === 'circle') return circle(cx, cy, side / 2);
  if (shape === 'rounded') return rrect(x, y, side, side, side * 0.22);
  return rrect(x, y, side, side, 0);
}

/**
 * @param design diseño saneado (ver design.js)
 * @param qr resultado de encodeText
 */
export function buildScene(design, qr) {
  const { size } = qr;
  const Q = design.qr.quiet;
  const N = size + 2 * Q;
  const frame = design.frame;
  const bg = design.background;
  const items = [];

  // ---------------------------------------------------------------- maquetación
  let W = N, H = N, qx = 0, qy = 0;
  const fs = frame.style;
  const topText = frame.top.trim(), bottomText = frame.bottom.trim();
  const nTop = topText ? 1 : 0, nBot = bottomText ? 1 : 0;
  const bannerH = Math.max(3, N * 0.15);
  const gap = Math.max(0.8, N * 0.025);
  const cardPad = Math.max(2, N * 0.06);
  const cardText = N * 0.14;
  if (fs === 'border') {
    W = H = N + 2 * frame.thickness;
    qx = qy = frame.thickness;
  } else if (fs === 'banner') {
    H = N + nTop * (bannerH + gap) + nBot * (bannerH + gap);
    qy = nTop * (bannerH + gap);
  } else if (fs === 'card') {
    W = N + 2 * cardPad;
    H = N + 2 * cardPad + (nTop + nBot) * cardText;
    qx = cardPad;
    qy = cardPad + nTop * cardText;
  }
  const mx = qx + Q, my = qy + Q; // origen del módulo (0,0)
  const canvasRadius = bg.radius * Math.min(W, H);

  // ---------------------------------------------------------------- fondo y marco
  const hasBgImage = !!(bg.image && bg.image.src);
  if (fs === 'card') {
    items.push({ t: 'path', ops: rrect(0, 0, W, H, Math.max(canvasRadius, cardPad * 0.9)), fill: frame.color, rule: 'nonzero' });
    if (!bg.transparent) {
      items.push({ t: 'path', ops: rrect(qx, qy, N, N, Math.min(cardPad * 0.6, N * 0.06)), fill: bg.color, rule: 'nonzero' });
    }
  } else if (!bg.transparent) {
    items.push({ t: 'path', ops: rrect(0, 0, W, H, canvasRadius), fill: bg.color, rule: 'nonzero' });
  }
  if (hasBgImage) {
    const { w: iw, h: ih, src } = bg.image;
    const s = Math.max(W / iw, H / ih);
    const dw = iw * s, dh = ih * s;
    items.push({ t: 'image', x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh, href: src, clip: rrect(0, 0, W, H, canvasRadius) });
    if (bg.plate > 0) {
      items.push({ t: 'path', ops: rrect(qx, qy, N, N, Math.min(2, N * 0.04)), fill: bg.color, rule: 'nonzero', opacity: bg.plate });
    }
  }
  if (fs === 'border') {
    const t = frame.thickness;
    items.push({
      t: 'path',
      ops: [...rrect(0, 0, W, H, canvasRadius), ...rrect(t, t, N, N, Math.max(0, canvasRadius - t))],
      fill: frame.color,
      rule: 'evenodd',
    });
  }
  const textItems = [];
  const addBanner = (text, y, h, pill) => {
    if (pill) items.push({ t: 'path', ops: rrect(0, y, W, h, h * 0.28), fill: frame.color, rule: 'nonzero' });
    const maxW = W * 0.88;
    const em = textWidthEm(text, frame.font, true);
    const sizeFit = Math.min(h * 0.5, maxW / Math.max(em, 0.01));
    textItems.push({ t: 'text', x: W / 2, y: y + h / 2 + sizeFit * 0.35, text, size: sizeFit, fill: frame.textColor, family: frame.font, bold: true, anchor: 'middle' });
  };
  if (fs === 'banner') {
    if (nTop) addBanner(topText, 0, bannerH, true);
    if (nBot) addBanner(bottomText, qy + N + gap, bannerH, true);
  } else if (fs === 'card') {
    if (nTop) addBanner(topText, cardPad * 0.5, cardText, false);
    if (nBot) addBanner(bottomText, qy + N, cardText + cardPad * 0.5, false);
  }

  // ---------------------------------------------------------------- zonas especiales
  const draw = Uint8Array.from(qr.modules);
  const finders = [[0, 0], [size - 7, 0], [0, size - 7]];
  const inFinderZone = (x, y) => finders.some(([fx, fy]) => x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7);
  for (const [fx, fy] of finders) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) draw[(fy + y) * size + fx + x] = 0;
  const aligns = alignmentCenters(qr.version);
  const customAlign = design.alignment.shape !== 'same';
  if (customAlign) {
    for (const [cx, cy] of aligns) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) draw[(cy + y) * size + cx + x] = 0;
  }

  // ---------------------------------------------------------------- logotipo: zona cubierta
  const lg = design.logo;
  const covered = new Uint8Array(size * size);
  let logoMeta = null;
  let coversFinder = false;
  if (lg.kind !== 'none') {
    const side = lg.size * size;
    const cx = size / 2 + lg.offsetX * size;
    const cy = size / 2 + lg.offsetY * size;
    const plateSide = side + 2 * lg.margin;
    const circular = lg.plate === 'circle';
    const rad = plateSide / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let hit;
        if (circular) {
          const nx = clamp(cx, x, x + 1), ny = clamp(cy, y, y + 1);
          hit = (nx - cx) ** 2 + (ny - cy) ** 2 < rad * rad;
        } else {
          hit = x + 1 > cx - rad && x < cx + rad && y + 1 > cy - rad && y < cy + rad;
        }
        if (!hit) continue;
        if (inFinderZone(x, y)) { coversFinder = true; continue; }
        covered[y * size + x] = 1;
        if (lg.clear) draw[y * size + x] = 0;
      }
    }
    logoMeta = { cx, cy, side, plateSide };
  }

  // ---------------------------------------------------------------- módulos
  const mod = design.modules;
  const shape = mod.shape;
  const s = mod.scale;
  let modOps = [];
  let modRule = 'nonzero';
  const isDark = (x, y) => draw[y * size + x] === 1;
  const merged = (shape === 'square' || shape === 'rounded' || shape === 'liquid') && s >= 0.999;
  if (merged) {
    const rC = shape === 'square' ? 0 : mod.round;
    const rV = shape === 'liquid' ? mod.round : 0;
    for (const loop of traceLoops(isDark, size, size)) modOps.push(...loopToPath(loop, rC, rV, mx, my));
    modRule = 'evenodd';
  } else if (shape === 'bars-v' || shape === 'bars-h') {
    const vertical = shape === 'bars-v';
    const major = vertical ? size : size; // la rejilla es cuadrada
    const rr = (s / 2) * (mod.round / 0.5);
    for (let a = 0; a < major; a++) {
      let b = 0;
      while (b < major) {
        const x = vertical ? a : b, y = vertical ? b : a;
        if (!isDark(x, y)) { b++; continue; }
        let e = b;
        while (e + 1 < major && isDark(vertical ? a : e + 1, vertical ? e + 1 : a)) e++;
        const len = e - b + 1;
        const o = (1 - s) / 2;
        modOps.push(...(vertical ? rrect(mx + a + o, my + b, s, len, rr) : rrect(mx + b, my + a + o, len, s, rr)));
        b = e + 1;
      }
    }
  } else {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!isDark(x, y)) continue;
        const cx = mx + x + 0.5, cy = my + y + 0.5;
        const o = (1 - s) / 2;
        switch (shape) {
          case 'dots': modOps.push(...circle(cx, cy, s / 2)); break;
          case 'diamond': modOps.push(...diamond(cx, cy, Math.min(0.62, 0.6 * s + 0.05))); break;
          case 'leaf': modOps.push(...rrect(mx + x + o, my + y + o, s, s, [s * 0.5 * (mod.round / 0.5), 0, s * 0.5 * (mod.round / 0.5), 0])); break;
          case 'rounded':
          case 'liquid': modOps.push(...rrect(mx + x + o, my + y + o, s, s, s * mod.round)); break;
          default: modOps.push(...rrect(mx + x + o, my + y + o, s, s, 0));
        }
      }
    }
  }
  if (modOps.length) items.push({ t: 'path', ops: modOps, fill: mod.color, rule: modRule });

  // ---------------------------------------------------------------- localizadores
  const outerColor = design.finder.outerColor || mod.color;
  const innerColor = design.finder.innerColor || mod.color;
  const ringOpsAll = [], eyeOpsAll = [];
  for (const [fx, fy] of finders) {
    ringOpsAll.push(...ringOps(mx + fx, my + fy, 7, 5, design.finder.outer));
    eyeOpsAll.push(...eyeOps(mx + fx + 2, my + fy + 2, 3, design.finder.inner));
  }
  items.push({ t: 'path', ops: ringOpsAll, fill: outerColor, rule: 'evenodd' });
  items.push({ t: 'path', ops: eyeOpsAll, fill: innerColor, rule: 'nonzero' });

  // ---------------------------------------------------------------- alineación
  if (customAlign && aligns.length) {
    const col = design.alignment.color || mod.color;
    const ring = [], dots = [];
    const sh = design.alignment.shape;
    for (const [cx, cy] of aligns) {
      ring.push(...ringOps(mx + cx - 2, my + cy - 2, 5, 3, sh));
      if (sh === 'circle') dots.push(...circle(mx + cx + 0.5, my + cy + 0.5, 0.5));
      else if (sh === 'rounded') dots.push(...rrect(mx + cx, my + cy, 1, 1, 0.3));
      else dots.push(...rrect(mx + cx, my + cy, 1, 1, 0));
    }
    items.push({ t: 'path', ops: ring, fill: col, rule: 'evenodd' });
    items.push({ t: 'path', ops: dots, fill: col, rule: 'nonzero' });
  }

  // ---------------------------------------------------------------- logotipo
  if (logoMeta) {
    const { cx, cy, side, plateSide } = logoMeta;
    const ax = mx + cx, ay = my + cy;
    if (lg.plate !== 'none') {
      items.push({ t: 'path', ops: logoPlateOps(lg.plate, ax, ay, plateSide), fill: lg.plateColor, rule: 'nonzero' });
    }
    if (lg.kind === 'image' && lg.image) {
      const { w: iw, h: ih, src } = lg.image;
      const aspect = iw / ih;
      let dw = aspect >= 1 ? side : side * aspect;
      let dh = aspect >= 1 ? side / aspect : side;
      dw *= lg.zoom;
      dh *= lg.zoom;
      const px = lg.panX * side * 0.5, py = lg.panY * side * 0.5;
      items.push({
        t: 'image',
        x: ax - dw / 2 + px,
        y: ay - dh / 2 + py,
        w: dw,
        h: dh,
        href: src,
        clip: logoPlateOps(lg.crop, ax, ay, side),
      });
    } else if (lg.kind === 'icon') {
      const k = side * 0.82;
      items.push({
        t: 'path',
        ops: translateOps(scaleOps(iconPath(lg.icon), k), ax - k / 2, ay - k / 2),
        fill: lg.iconColor,
        rule: 'evenodd',
      });
    }
  }

  items.push(...textItems);

  return {
    width: W,
    height: H,
    items,
    layout: { W, H, qx, qy, N, Q, size, mx, my },
    covered,
    coversFinder,
    logo: logoMeta,
    background: bg.transparent ? null : bg.color,
    hasBgImage,
  };
}
