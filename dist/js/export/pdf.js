// Escena → PDF vectorial de una página. Módulo puro (la compresión usa CompressionStream si existe).
// Los módulos son trazados (no una imagen). Texto con fuentes estándar del PDF (Helvetica / Courier).
// Las imágenes de la persona (logotipo, fondo) se incrustan como píxeles RGB + máscara alfa: se pasan ya
// decodificadas en `opts.images` { [href]: { width, height, rgb: Uint8Array, alpha?: Uint8Array } }.
import { textWidthEm, toWinAnsi } from '../qr/fontmetrics.js';
import { deflateZlib } from './deflate.js';

const f = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const colorOps = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${f(((n >> 16) & 255) / 255)} ${f(((n >> 8) & 255) / 255)} ${f((n & 255) / 255)}`;
};
const enc = new TextEncoder();
const ascii = (s) => enc.encode(s);

function pathOps(ops) {
  let s = '';
  for (const op of ops) {
    if (op[0] === 'M') s += `${f(op[1])} ${f(op[2])} m\n`;
    else if (op[0] === 'L') s += `${f(op[1])} ${f(op[2])} l\n`;
    else if (op[0] === 'C') s += `${f(op[1])} ${f(op[2])} ${f(op[3])} ${f(op[4])} ${f(op[5])} ${f(op[6])} c\n`;
    else if (op[0] === 'Z') s += 'h\n';
  }
  return s;
}

/**
 * @param scene salida de buildScene
 * @param {{widthMm:number, title?:string, images?:object}} opts
 * @returns {Promise<Uint8Array>}
 */
export async function sceneToPdf(scene, opts) {
  const widthMm = opts.widthMm;
  const k = (widthMm * 72) / 25.4 / scene.width; // unidades de escena → puntos
  const pageW = scene.width * k, pageH = scene.height * k;
  const images = opts.images || {};

  const objects = []; // {dict:string, stream?:Uint8Array}
  const add = (dict, stream) => {
    objects.push({ dict, stream });
    return objects.length;
  };
  // 1 catálogo, 2 páginas, 3 página (se completan al final)
  add('');
  add('');
  add('');
  const fontIds = {
    F1: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    F2: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    F3: add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>'),
  };
  const gsIds = new Map();
  const gsFor = (a) => {
    const key = f(a);
    if (!gsIds.has(key)) gsIds.set(key, add(`<< /Type /ExtGState /ca ${key} /CA ${key} >>`));
    return { name: `GS${[...gsIds.keys()].indexOf(key)}`, key };
  };
  const imgIds = new Map();
  const imageFor = async (href) => {
    if (imgIds.has(href)) return imgIds.get(href);
    const im = images[href];
    if (!im) return null;
    let smask = '';
    if (im.alpha) {
      const a = await deflateZlib(im.alpha);
      const sid = add(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceGray /BitsPerComponent 8${a.flate ? ' /Filter /FlateDecode' : ''} /Length ${a.data.length} >>`, a.data);
      smask = ` /SMask ${sid} 0 R`;
    }
    const c = await deflateZlib(im.rgb);
    const id = add(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${smask}${c.flate ? ' /Filter /FlateDecode' : ''} /Length ${c.data.length} >>`, c.data);
    const entry = { id, name: `Im${imgIds.size}` };
    imgIds.set(href, entry);
    return entry;
  };

  // ------------------------------------------------------------ contenido
  let cs = `q\n${f(k)} 0 0 ${f(-k)} 0 ${f(pageH)} cm\n`; // origen arriba a la izquierda, unidades de escena
  let lossy = false;
  for (const it of scene.items) {
    if (it.t === 'path') {
      const a = it.opacity !== undefined && it.opacity < 1 ? gsFor(it.opacity) : null;
      cs += 'q\n';
      if (a) cs += `/${a.name} gs\n`;
      cs += `${colorOps(it.fill)} rg\n${pathOps(it.ops)}${it.rule === 'evenodd' ? 'f*' : 'f'}\nQ\n`;
    } else if (it.t === 'image') {
      const im = await imageFor(it.href);
      if (!im) continue;
      cs += 'q\n';
      if (it.clip) cs += `${pathOps(it.clip)}W n\n`;
      cs += `${f(it.w)} 0 0 ${f(-it.h)} ${f(it.x)} ${f(it.y + it.h)} cm\n/${im.name} Do\nQ\n`;
    } else if (it.t === 'text') {
      const mono = it.family === 'mono';
      const font = mono ? 'F3' : it.bold ? 'F2' : 'F1';
      const { bytes, lossy: l } = toWinAnsi(it.text);
      if (l) lossy = true;
      const w = textWidthEm(it.text, it.family || 'sans', !!it.bold) * it.size;
      const x = it.anchor === 'middle' ? it.x - w / 2 : it.anchor === 'end' ? it.x - w : it.x;
      const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
      cs += `BT\n/${font} 1 Tf\n${colorOps(it.fill)} rg\n${f(it.size)} 0 0 ${f(-it.size)} ${f(x)} ${f(it.y)} Tm\n<${hex}> Tj\nET\n`;
    }
  }
  cs += 'Q\n';
  const content = await deflateZlib(ascii(cs));
  const contentId = add(`<< ${content.flate ? '/Filter /FlateDecode ' : ''}/Length ${content.data.length} >>`, content.data);

  const xobj = [...imgIds.entries()].map(([, e]) => `/${e.name} ${e.id} 0 R`).join(' ');
  const gsDict = [...gsIds.entries()].map(([, id], i) => `/GS${i} ${id} 0 R`).join(' ');
  const resources = `<< /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R >>${xobj ? ` /XObject << ${xobj} >>` : ''}${gsDict ? ` /ExtGState << ${gsDict} >>` : ''} >>`;
  const infoId = add(`<< /Title (${pdfString(opts.title || 'Código QR')}) /Producer (QR Studio) /Creator (QR Studio) >>`);
  objects[0].dict = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1].dict = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[2].dict = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pageW)} ${f(pageH)}] /Resources ${resources} /Contents ${contentId} 0 R >>`;

  // ------------------------------------------------------------ serialización
  const chunks = [];
  let offset = 0;
  const push = (u8) => {
    chunks.push(u8);
    offset += u8.length;
  };
  push(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(offset);
    push(ascii(`${i + 1} 0 obj\n${o.dict}\n`));
    if (o.stream) {
      push(ascii('stream\n'));
      push(o.stream);
      push(ascii('\nendstream\n'));
    }
    push(ascii('endobj\n'));
  });
  const xrefAt = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  push(ascii(xref));
  const out = new Uint8Array(offset);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  out.lossyText = lossy;
  return out;
}

function pdfString(s) {
  const { bytes } = toWinAnsi(s);
  return bytes.map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? '\\' + String.fromCharCode(b) : b < 32 || b > 126 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b))).join('');
}
