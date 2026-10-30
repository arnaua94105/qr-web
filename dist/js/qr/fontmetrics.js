// Anchuras de glifo (en milésimas de em) de las fuentes estándar del PDF: Helvetica, Helvetica-Bold y Courier.
// Sirven para centrar y ajustar el texto del marco igual en SVG, PNG y PDF. Módulo puro.

const HELV = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278' + // 32-47
  ' 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556' + // 48-63
  ' 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778' + // 64-79
  ' 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556' + // 80-95
  ' 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556' + // 96-111
  ' 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'; // 112-126

const HELV_BOLD = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278' +
  ' 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611' +
  ' 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778' +
  ' 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556' +
  ' 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611' +
  ' 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584';

const toTable = (s) => s.split(' ').map(Number);
const TABLES = { sans: toTable(HELV), 'sans-bold': toTable(HELV_BOLD) };

/** Quita diacríticos para medir: á→a, ñ→n. */
function baseChar(ch) {
  const d = ch.normalize('NFD');
  return d.length > 1 ? d[0] : ch;
}

/** Anchura del texto en em (1 = el tamaño de fuente). family: 'sans' | 'mono'. */
export function textWidthEm(text, family = 'sans', bold = true) {
  let total = 0;
  for (const ch of String(text)) {
    if (family === 'mono') { total += 600; continue; }
    const t = TABLES[bold ? 'sans-bold' : 'sans'];
    const b = baseChar(ch);
    const c = b.charCodeAt(0);
    if (c >= 32 && c <= 126) total += t[c - 32];
    else if (ch === '¿') total += 611;
    else if (ch === '¡') total += 333;
    else if (ch === '€') total += 556;
    else if (ch === '—') total += 1000;
    else if (ch === '–') total += 556;
    else total += 556;
  }
  return total / 1000;
}

/** Caracteres que las fuentes estándar del PDF (WinAnsi) pueden dibujar. */
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
export function isWinAnsi(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.has(ch);
}

const WIN_MAP = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };

/** Texto → bytes WinAnsi (los caracteres no representables pasan a '?'). */
export function toWinAnsi(text) {
  const bytes = [];
  let lossy = false;
  for (const ch of String(text)) {
    if (WIN_MAP[ch] !== undefined) bytes.push(WIN_MAP[ch]);
    else if (isWinAnsi(ch)) bytes.push(ch.charCodeAt(0));
    else { bytes.push(0x3f); lossy = true; }
  }
  return { bytes, lossy };
}
