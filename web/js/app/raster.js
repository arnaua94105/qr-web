// Dibujo de la escena en <canvas> (PNG) y preparación de imágenes para el PDF. Solo navegador.
import { sceneToPdf } from '../export/pdf.js';
import { pathToD } from '../qr/path.js';

const imgCache = new Map();
export function loadImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    im.src = src;
  });
  imgCache.set(src, p);
  return p;
}

const FONT = { sans: 'Helvetica, Arial, "Liberation Sans", sans-serif', mono: '"Courier New", Courier, monospace' };

/** @param {number} px ancho de salida en píxeles */
export async function sceneToCanvas(scene, px, { transparent = false } = {}) {
  const k = px / scene.width;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(scene.width * k));
  canvas.height = Math.max(1, Math.round(scene.height * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite dibujar en canvas.');
  ctx.scale(canvas.width / scene.width, canvas.height / scene.height);
  const imgs = new Map();
  for (const it of scene.items) if (it.t === 'image' && !imgs.has(it.href)) imgs.set(it.href, await loadImage(it.href));
  for (const it of scene.items) {
    if (it.t === 'path') {
      ctx.save();
      ctx.globalAlpha = it.opacity ?? 1;
      ctx.fillStyle = it.fill;
      ctx.fill(new Path2D(pathToD(it.ops)), it.rule === 'evenodd' ? 'evenodd' : 'nonzero');
      ctx.restore();
    } else if (it.t === 'image') {
      ctx.save();
      if (it.clip) ctx.clip(new Path2D(pathToD(it.clip)));
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgs.get(it.href), it.x, it.y, it.w, it.h);
      ctx.restore();
    } else if (it.t === 'text') {
      ctx.save();
      ctx.fillStyle = it.fill;
      ctx.font = `${it.bold ? 700 : 400} ${it.size}px ${FONT[it.family] || FONT.sans}`;
      ctx.textAlign = it.anchor === 'start' ? 'left' : it.anchor === 'end' ? 'right' : 'center';
      ctx.fillText(it.text, it.x, it.y);
      ctx.restore();
    }
  }
  void transparent;
  return canvas;
}

export async function sceneToPngBlob(scene, px, opts) {
  const canvas = await sceneToCanvas(scene, px, opts);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear el PNG'))), 'image/png'));
}

async function decodeForPdf(src) {
  const im = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(im, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const rgb = new Uint8Array(c.width * c.height * 3);
  const alpha = new Uint8Array(c.width * c.height);
  let hasAlpha = false;
  for (let i = 0, j = 0, a = 0; i < data.length; i += 4, j += 3, a++) {
    rgb[j] = data[i]; rgb[j + 1] = data[i + 1]; rgb[j + 2] = data[i + 2];
    alpha[a] = data[i + 3];
    if (data[i + 3] !== 255) hasAlpha = true;
  }
  return { width: c.width, height: c.height, rgb, alpha: hasAlpha ? alpha : null };
}

export async function sceneToPdfBytes(scene, widthMm, title) {
  const images = {};
  for (const it of scene.items) if (it.t === 'image' && !images[it.href]) images[it.href] = await decodeForPdf(it.href);
  return sceneToPdf(scene, { widthMm, title, images });
}
