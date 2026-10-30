// Escena -> SVG. Vectorial: los módulos son trazados, no una imagen incrustada.
// Solo las imágenes que sube la persona (logotipo, fondo) van incrustadas como data URI.
import { pathToD, num } from './path.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONT_STACK = {
  sans: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  mono: '"Courier New", Courier, "Liberation Mono", monospace',
};

/**
 * @param {object} scene salida de buildScene
 * @param {{widthMm?:number, widthPx?:number, title?:string, desc?:string}} [opts]
 */
export function sceneToSvg(scene, opts = {}) {
  const { width: W, height: H } = scene;
  let sizeAttrs = '';
  if (opts.widthMm) sizeAttrs = ` width="${num(opts.widthMm)}mm" height="${num((opts.widthMm * H) / W)}mm"`;
  else if (opts.widthPx) sizeAttrs = ` width="${num(opts.widthPx)}" height="${num((opts.widthPx * H) / W)}"`;
  const parts = [];
  let clipId = 0;
  for (const it of scene.items) {
    if (it.t === 'path') {
      parts.push(
        `<path d="${pathToD(it.ops)}" fill="${it.fill}"${it.rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}${it.opacity !== undefined && it.opacity < 1 ? ` fill-opacity="${num(it.opacity)}"` : ''}/>`,
      );
    } else if (it.t === 'image') {
      const id = `c${clipId++}`;
      if (it.clip) parts.push(`<clipPath id="${id}"><path d="${pathToD(it.clip)}"/></clipPath>`);
      parts.push(
        `<image x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}" preserveAspectRatio="none" href="${esc(it.href)}"${it.clip ? ` clip-path="url(#${id})"` : ''}/>`,
      );
    } else if (it.t === 'text') {
      parts.push(
        `<text x="${num(it.x)}" y="${num(it.y)}" font-family='${FONT_STACK[it.family] || FONT_STACK.sans}' font-size="${num(it.size)}" font-weight="${it.bold ? 700 : 400}" text-anchor="${it.anchor || 'middle'}" fill="${it.fill}">${esc(it.text)}</text>`,
      );
    }
  }
  const title = opts.title ? `<title>${esc(opts.title)}</title>` : '';
  const desc = opts.desc ? `<desc>${esc(opts.desc)}</desc>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(W)} ${num(H)}"${sizeAttrs} role="img">${title}${desc}${parts.join('')}</svg>`;
}
