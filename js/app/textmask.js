// Máscara de texto (1 = tinta) para grabar o elevar etiquetas en el modelo 3D. Usa canvas 2D.
export function makeLabelMask(text, family = 'Inter, Helvetica, Arial, sans-serif') {
  const t = String(text || '').trim();
  if (!t) return null;
  const px = 96, pad = 6;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.font = `700 ${px}px ${family}`;
  const w = Math.ceil(ctx.measureText(t).width) + pad * 2;
  const hgt = Math.ceil(px * 1.25);
  c.width = Math.min(w, 4096);
  c.height = hgt;
  ctx.font = `700 ${px}px ${family}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  ctx.fillText(t, pad, px);
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  // recorta al rectángulo con tinta
  let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (img[(y * c.width + x) * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
  const data = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) data[y * cols + x] = img[((y + y0) * c.width + x + x0) * 4 + 3] > 127 ? 1 : 0;
  return { cols, rows, data };
}
