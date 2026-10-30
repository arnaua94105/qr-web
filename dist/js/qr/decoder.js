// Decodificador de la MATRIZ de un QR (no de una imagen).
// Se usa para: (1) comprobar el codificador en los tests, (2) simular cuánta información
// puede tapar un logotipo y seguir recuperándose con la corrección de errores.
// Incluye corrección Reed-Solomon completa (Berlekamp-Massey + Chien + Forney).

import {
  ALPHANUMERIC_CHARSET,
  decodeFormatBits,
  getEccInfo,
  getFunctionMask,
  maskInverts,
} from './encoder.js';

// ------------------------------------------------------------- campo GF(256)
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
const div = (a, b) => {
  if (b === 0) throw new Error('División por cero en GF(256)');
  return a === 0 ? 0 : EXP[(LOG[a] + 255 - LOG[b]) % 255];
};

// ------------------------------------------------------------- Reed-Solomon

/** Evalúa en x un polinomio con el coeficiente de mayor grado primero. */
function polyEvalHigh(poly, x) {
  let y = 0;
  for (const c of poly) y = mul(y, x) ^ c;
  return y;
}

export function rsSyndromes(codeword, nsym) {
  const s = new Array(nsym);
  for (let i = 0; i < nsym; i++) s[i] = polyEvalHigh(codeword, EXP[i]);
  return s;
}

/**
 * Corrige un bloque (datos + ecc) in situ. Devuelve el número de palabras corregidas.
 * Lanza Error si no es recuperable.
 */
export function rsCorrect(codeword, nsym) {
  const synd = rsSyndromes(codeword, nsym);
  if (synd.every((v) => v === 0)) return 0;

  // Berlekamp-Massey (coeficientes de menor a mayor grado)
  let C = [1];
  let B = [1];
  let L = 0;
  let m = 1;
  let b = 1;
  for (let n = 0; n < nsym; n++) {
    let d = synd[n];
    for (let i = 1; i <= L; i++) d ^= mul(C[i] ?? 0, synd[n - i]);
    if (d === 0) {
      m++;
    } else {
      const T = C.slice();
      const coef = div(d, b);
      const need = B.length + m;
      while (C.length < need) C.push(0);
      for (let i = 0; i < B.length; i++) C[i + m] ^= mul(coef, B[i]);
      if (2 * L <= n) {
        L = n + 1 - L;
        B = T;
        b = d;
        m = 1;
      } else {
        m++;
      }
    }
  }
  while (C.length > 1 && C[C.length - 1] === 0) C.pop();
  if (L > nsym / 2 || C.length - 1 !== L) throw new Error('Bloque no recuperable');

  // Chien: posiciones k (potencia de x) con Λ(α^-k) = 0
  const n = codeword.length;
  const positions = [];
  for (let k = 0; k < n; k++) {
    let v = 0;
    const xinv = EXP[(255 - (k % 255)) % 255];
    let pw = 1;
    for (let i = 0; i < C.length; i++) {
      v ^= mul(C[i], pw);
      pw = mul(pw, xinv);
    }
    if (v === 0) positions.push(k);
  }
  if (positions.length !== L) throw new Error('Bloque no recuperable');

  // Evaluador Ω(x) = S(x)Λ(x) mod x^nsym
  const omega = new Array(nsym).fill(0);
  for (let i = 0; i < nsym; i++) {
    for (let j = 0; j < C.length && i + j < nsym; j++) omega[i + j] ^= mul(synd[i], C[j]);
  }
  for (const k of positions) {
    const X = EXP[k % 255];
    const xinv = EXP[(255 - (k % 255)) % 255];
    let om = 0;
    let pw = 1;
    for (let i = 0; i < omega.length; i++) {
      om ^= mul(omega[i], pw);
      pw = mul(pw, xinv);
    }
    // Λ'(x): términos de grado impar
    let lp = 0;
    pw = 1; // xinv^(i-1) para i impar: empieza en i=1 -> xinv^0
    for (let i = 1; i < C.length; i += 2) {
      lp ^= mul(C[i], pw);
      pw = mul(pw, mul(xinv, xinv));
    }
    if (lp === 0) throw new Error('Bloque no recuperable');
    const mag = mul(X, div(om, lp)); // b = 0
    codeword[n - 1 - k] ^= mag;
  }
  if (!rsSyndromes(codeword, nsym).every((v) => v === 0)) throw new Error('Bloque no recuperable');
  return positions.length;
}

// ------------------------------------------------ disposición de palabras de código

/** Para cada módulo de datos, índice de la palabra de código (entrelazada) a la que pertenece, o -1. */
export function moduleCodewordMap(version) {
  const size = version * 4 + 17;
  const isFn = getFunctionMask(version);
  const map = new Int32Array(size * size).fill(-1);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y * size + x]) {
          map[y * size + x] = i >>> 3;
          i++;
        }
      }
    }
  }
  return map;
}

/** Reparte los índices entrelazados en bloques: devuelve, por bloque, la lista de índices y cuántos son de datos. */
export function blockLayout(version, ecl) {
  const { numBlocks, eccPerBlock, rawCodewords } = getEccInfo(version, ecl);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const blocks = Array.from({ length: numBlocks }, () => []);
  const longLen = shortLen + 1;
  let idx = 0;
  for (let i = 0; i < longLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i !== shortLen - eccPerBlock || j >= numShort) blocks[j].push(idx++);
    }
  }
  return blocks.map((indices, j) => ({
    indices,
    dataLen: shortLen - eccPerBlock + (j < numShort ? 0 : 1),
    eccLen: eccPerBlock,
  }));
}

// ----------------------------------------------------------------- decodificación

export class QrDecodeError extends Error {}

function readFormat(modules, size) {
  const get = (x, y) => (modules[y * size + x] ? 1 : 0);
  let raw1 = 0;
  for (let i = 0; i <= 5; i++) raw1 |= get(8, i) << i;
  raw1 |= get(8, 7) << 6;
  raw1 |= get(8, 8) << 7;
  raw1 |= get(7, 8) << 8;
  for (let i = 9; i < 15; i++) raw1 |= get(14 - i, 8) << i;
  let raw2 = 0;
  for (let i = 0; i < 8; i++) raw2 |= get(size - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) raw2 |= get(8, size - 15 + i) << i;
  const a = decodeFormatBits(raw1);
  const b = decodeFormatBits(raw2);
  const best = a && b ? (a.dist <= b.dist ? a : b) : (a ?? b);
  if (!best) throw new QrDecodeError('No se pudo leer la información de formato');
  return best;
}

/**
 * Decodifica una matriz (Uint8Array size*size, 1 = oscuro). Devuelve el texto y estadísticas.
 */
export function decodeMatrix(modulesIn, size) {
  if ((size - 17) % 4 !== 0 || size < 21 || size > 177) throw new QrDecodeError('Tamaño de matriz inválido');
  const version = (size - 17) / 4;
  const modules = Uint8Array.from(modulesIn);
  const { ecl, mask } = readFormat(modules, size);
  const isFn = getFunctionMask(version);
  // quitar máscara
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFn[y * size + x] && maskInverts(mask, x, y)) modules[y * size + x] ^= 1;
    }
  }
  // leer palabras de código
  const info = getEccInfo(version, ecl);
  const cw = new Array(info.rawCodewords).fill(0);
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y * size + x] && bit < info.rawCodewords * 8) {
          if (modules[y * size + x]) cw[bit >>> 3] |= 1 << (7 - (bit & 7));
          bit++;
        }
      }
    }
  }
  // corregir por bloques
  const layout = blockLayout(version, ecl);
  const data = [];
  let corrected = 0;
  let blocksWithErrors = 0;
  let worstBlockErrors = 0;
  for (const blk of layout) {
    const word = blk.indices.map((i) => cw[i]);
    let fixed;
    try {
      fixed = rsCorrect(word, blk.eccLen);
    } catch {
      throw new QrDecodeError('Demasiados errores: la corrección Reed-Solomon no puede recuperar el contenido');
    }
    if (fixed) {
      corrected += fixed;
      blocksWithErrors++;
      worstBlockErrors = Math.max(worstBlockErrors, fixed);
    }
    for (let i = 0; i < blk.dataLen; i++) data.push(word[i]);
  }
  const text = parseDataStream(data, version);
  return {
    text,
    version,
    ecl,
    mask,
    correctedCodewords: corrected,
    blocksWithErrors,
    worstBlockErrors,
    maxCorrectablePerBlock: Math.floor(info.eccPerBlock / 2),
  };
}

function parseDataStream(data, version) {
  let pos = 0;
  const total = data.length * 8;
  const read = (n) => {
    if (pos + n > total) throw new QrDecodeError('Flujo de datos truncado');
    let v = 0;
    for (let i = 0; i < n; i++, pos++) v = (v << 1) | ((data[pos >>> 3] >>> (7 - (pos & 7))) & 1);
    return v;
  };
  const ccIdx = Math.floor((version + 7) / 17);
  const parts = [];
  const bytes = [];
  const flushBytes = () => {
    if (bytes.length) {
      parts.push(new TextDecoder('utf-8').decode(Uint8Array.from(bytes)));
      bytes.length = 0;
    }
  };
  while (total - pos >= 4) {
    const mode = read(4);
    if (mode === 0) break;
    if (mode === 0x1) {
      let n = read([10, 12, 14][ccIdx]);
      let s = '';
      while (n >= 3) {
        s += String(read(10)).padStart(3, '0');
        n -= 3;
      }
      if (n === 2) s += String(read(7)).padStart(2, '0');
      else if (n === 1) s += String(read(4));
      flushBytes();
      parts.push(s);
    } else if (mode === 0x2) {
      let n = read([9, 11, 13][ccIdx]);
      let s = '';
      while (n >= 2) {
        const v = read(11);
        s += ALPHANUMERIC_CHARSET[Math.floor(v / 45)] + ALPHANUMERIC_CHARSET[v % 45];
        n -= 2;
      }
      if (n === 1) s += ALPHANUMERIC_CHARSET[read(6)];
      flushBytes();
      parts.push(s);
    } else if (mode === 0x4) {
      const n = read([8, 16, 16][ccIdx]);
      for (let i = 0; i < n; i++) bytes.push(read(8));
    } else if (mode === 0x7) {
      // ECI: se lee y se ignora (se asume UTF-8)
      const first = read(8);
      if ((first & 0x80) === 0) {
        /* 1 byte */
      } else if ((first & 0xc0) === 0x80) read(8);
      else read(16);
    } else {
      throw new QrDecodeError('Modo de datos no soportado por este decodificador (' + mode + ')');
    }
  }
  flushBytes();
  return parts.join('');
}

/**
 * Simula tapar módulos (p. ej. con un logotipo) y comprueba si el QR sigue decodificándose.
 * `covered` es un Uint8Array size*size (1 = módulo tapado). Los módulos tapados se
 * dibujan claros, que es lo que ocurre al recortar un hueco blanco para el logotipo.
 */
export function simulateCover(qr, covered) {
  const damaged = Uint8Array.from(qr.modules);
  let coveredDark = 0;
  let coveredTotal = 0;
  for (let i = 0; i < damaged.length; i++) {
    if (covered[i]) {
      coveredTotal++;
      if (damaged[i]) coveredDark++;
      damaged[i] = 0;
    }
  }
  const layout = blockLayout(qr.version, qr.ecl);
  const map = moduleCodewordMap(qr.version);
  const hitCw = new Set();
  for (let i = 0; i < covered.length; i++) if (covered[i] && map[i] >= 0) hitCw.add(map[i]);
  const info = getEccInfo(qr.version, qr.ecl);
  const t = Math.floor(info.eccPerBlock / 2);
  let worstBlock = 0;
  for (const blk of layout) {
    let n = 0;
    for (const idx of blk.indices) if (hitCw.has(idx)) n++;
    worstBlock = Math.max(worstBlock, n);
  }
  let recovered = false;
  let reason = '';
  let result = null;
  try {
    result = decodeMatrix(damaged, qr.size);
    recovered = true;
  } catch (e) {
    reason = e.message;
  }
  return {
    recovered,
    reason,
    coveredModules: coveredTotal,
    coveredDark,
    coveredFraction: coveredTotal / (qr.size * qr.size),
    affectedCodewords: hitCw.size,
    worstBlockAffected: worstBlock,
    correctablePerBlock: t,
    /** Carga de la corrección en el peor bloque (1 = justo en el límite). */
    eccLoad: t === 0 ? Infinity : worstBlock / t,
    decoded: result,
  };
}
