// Carga segura de imágenes del usuario: se validan tipo y tamaño y SIEMPRE se vuelven a rasterizar en un canvas
// (PNG de ≤ 512 px). Así un SVG o un archivo manipulado no llega a incrustarse tal cual y el proyecto pesa poco.
export class ImageError extends Error {}

const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export async function fileToDataImage(file, { max = 512 } = {}) {
  if (!file) throw new ImageError('No se ha elegido ningún archivo.');
  if (!OK_TYPES.includes(file.type)) throw new ImageError('Formato no compatible. Usa PNG, JPG, WebP, GIF o SVG.');
  if (file.size > MAX_IMAGE_BYTES) throw new ImageError('La imagen pesa más de 6 MB.');
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new ImageError('El archivo no es una imagen válida.'));
      i.src = url;
    });
    const w0 = im.naturalWidth || 256, h0 = im.naturalHeight || 256;
    if (w0 < 8 || h0 < 8) throw new ImageError('La imagen es demasiado pequeña.');
    const s = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(im, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    let sum = 0, n = 0, transparent = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 40) {
        sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        n++;
      } else transparent++;
    }
    return { src: c.toDataURL('image/png'), w, h, avgLum: n ? sum / n / 255 : 1, transparentShare: transparent / (px.length / 4) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
