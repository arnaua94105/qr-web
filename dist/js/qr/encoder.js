// Codificador de códigos QR (modelo 2, versiones 1-40), sin dependencias.
// Módulo puro: no toca el DOM, funciona igual en el navegador y en Node.
//
// Estructura y tablas según ISO/IEC 18004. Las tablas de corrección de errores
// se comprueban en tests/encoder.test.mjs contra capacidades publicadas
// (p. ej. versión 40-L = 2953 bytes) y contra vectores de la norma.

/** Niveles de corrección de errores. */
export const ECL = Object.freeze({ L: 0, M: 1, Q: 2, H: 3 });
export const ECL_NAMES = ['L', 'M', 'Q', 'H'];
/** Porcentaje nominal de palabras de código recuperables. */
export const ECL_RECOVERY = [0.07, 0.15, 0.25, 0.3];

const ECL_FORMAT_BITS = [1, 0, 3, 2];

const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

const NUMERIC_REGEX = /^[0-9]*$/;
const ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+./:-]*$/;
export const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const MODES = {
  NUMERIC: { modeBits: 0x1, ccBits: [10, 12, 14] },
  ALPHANUMERIC: { modeBits: 0x2, ccBits: [9, 11, 13] },
  BYTE: { modeBits: 0x4, ccBits: [8, 16, 16] },
};

function ccBitsFor(mode, version) {
  return mode.ccBits[Math.floor((version + 7) / 17)];
}

// ---------------------------------------------------------------- bits

function appendBits(buf, value, len) {
  if (len < 0 || len > 31 || value >>> len !== 0) throw new RangeError('Valor fuera de rango');
  for (let i = len - 1; i >= 0; i--) buf.push((value >>> i) & 1);
}

function getBit(x, i) {
  return ((x >>> i) & 1) !== 0;
}

// ------------------------------------------------------------ segmentos

export function utf8Bytes(str) {
  return Array.from(new TextEncoder().encode(str));
}

export function makeBytes(data) {
  const bb = [];
  for (const b of data) appendBits(bb, b, 8);
  return { mode: MODES.BYTE, numChars: data.length, bitData: bb };
}

export function makeNumeric(digits) {
  if (!NUMERIC_REGEX.test(digits)) throw new RangeError('Cadena numérica inválida');
  const bb = [];
  for (let i = 0; i < digits.length; ) {
    const n = Math.min(digits.length - i, 3);
    appendBits(bb, parseInt(digits.substring(i, i + n), 10), n * 3 + 1);
    i += n;
  }
  return { mode: MODES.NUMERIC, numChars: digits.length, bitData: bb };
}

export function makeAlphanumeric(text) {
  if (!ALPHANUMERIC_REGEX.test(text)) throw new RangeError('Cadena alfanumérica inválida');
  const bb = [];
  let i;
  for (i = 0; i + 2 <= text.length; i += 2) {
    let temp = ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
    temp += ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
    appendBits(bb, temp, 11);
  }
  if (i < text.length) appendBits(bb, ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6);
  return { mode: MODES.ALPHANUMERIC, numChars: text.length, bitData: bb };
}

/** Elige el modo más compacto para toda la cadena. */
export function makeSegments(text) {
  if (text === '') return [];
  if (NUMERIC_REGEX.test(text)) return [makeNumeric(text)];
  if (ALPHANUMERIC_REGEX.test(text)) return [makeAlphanumeric(text)];
  return [makeBytes(utf8Bytes(text))];
}

function getTotalBits(segs, version) {
  let result = 0;
  for (const seg of segs) {
    const ccbits = ccBitsFor(seg.mode, version);
    if (seg.numChars >= 1 << ccbits) return Infinity;
    result += 4 + ccbits + seg.bitData.length;
  }
  return result;
}

// ------------------------------------------------------- tablas y utilidades

export function getNumRawDataModules(ver) {
  if (ver < MIN_VERSION || ver > MAX_VERSION) throw new RangeError('Versión fuera de rango');
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

export function getNumDataCodewords(ver, ecl) {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver]
  );
}

export function getEccInfo(ver, ecl) {
  return {
    eccPerBlock: ECC_CODEWORDS_PER_BLOCK[ecl][ver],
    numBlocks: NUM_ERROR_CORRECTION_BLOCKS[ecl][ver],
    rawCodewords: Math.floor(getNumRawDataModules(ver) / 8),
  };
}

export function getAlignmentPatternPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const size = ver * 4 + 17;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** Capacidad máxima en bytes (modo byte) de una versión y nivel. */
export function byteCapacity(ver, ecl) {
  const bits = getNumDataCodewords(ver, ecl) * 8 - 4 - ccBitsFor(MODES.BYTE, ver);
  return Math.max(0, Math.floor(bits / 8));
}

// ------------------------------------------------------------ Reed-Solomon

export function gfMultiply(x, y) {
  if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError('Byte fuera de rango');
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

export function rsComputeDivisor(degree) {
  const result = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

export function rsComputeRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

// ------------------------------------------------------------------ matriz

function newFunctionMask(version) {
  const size = version * 4 + 17;
  const isFunction = new Uint8Array(size * size);
  const set = (x, y) => {
    if (x >= 0 && x < size && y >= 0 && y < size) isFunction[y * size + x] = 1;
  };
  for (let i = 0; i < size; i++) {
    set(6, i);
    set(i, 6);
  }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) set(cx + dx, cy + dy);
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const align = getAlignmentPatternPositions(version);
  const n = align.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy);
    }
  }
  // zonas de formato (se solapan con los separadores)
  for (let i = 0; i < 9; i++) {
    set(8, i);
    set(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    set(size - 1 - i, 8);
    set(8, size - 1 - i);
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        set(size - 11 + j, i);
        set(i, size - 11 + j);
      }
    }
  }
  return isFunction;
}

/** Máscara de módulos de función de una versión (1 = función). */
export function getFunctionMask(version) {
  return newFunctionMask(version);
}

class Builder {
  constructor(version, ecl) {
    this.version = version;
    this.ecl = ecl;
    this.size = version * 4 + 17;
    this.modules = new Uint8Array(this.size * this.size);
    this.isFunction = new Uint8Array(this.size * this.size);
  }
  setFn(x, y, dark) {
    this.modules[y * this.size + x] = dark ? 1 : 0;
    this.isFunction[y * this.size + x] = 1;
  }
  drawFunctionPatterns() {
    const size = this.size;
    for (let i = 0; i < size; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);
    const align = getAlignmentPatternPositions(this.version);
    const n = align.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlignment(align[i], align[j]);
      }
    }
    this.drawFormat(0);
    this.drawVersion();
  }
  drawFormat(mask) {
    const size = this.size;
    const data = (ECL_FORMAT_BITS[this.ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) this.setFn(8, i, getBit(bits, i));
    this.setFn(8, 7, getBit(bits, 6));
    this.setFn(8, 8, getBit(bits, 7));
    this.setFn(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++) this.setFn(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFn(8, size - 15 + i, getBit(bits, i));
    this.setFn(8, size - 8, true);
  }
  drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFn(a, b, color);
      this.setFn(b, a, color);
    }
  }
  drawFinder(x, y) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFn(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }
  drawAlignment(x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.setFn(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  drawCodewords(data) {
    const size = this.size;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y * size + x] && i < data.length * 8) {
            this.modules[y * size + x] = getBit(data[i >>> 3], 7 - (i & 7)) ? 1 : 0;
            i++;
          }
        }
      }
    }
  }
  applyMask(mask) {
    const size = this.size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (this.isFunction[y * size + x]) continue;
        if (maskInverts(mask, x, y)) this.modules[y * size + x] ^= 1;
      }
    }
  }
  penalty() {
    const size = this.size;
    const m = this.modules;
    let result = 0;
    // Regla 1 (filas y columnas) y regla 3
    for (let dir = 0; dir < 2; dir++) {
      for (let a = 0; a < size; a++) {
        let run = 1;
        let prev = dir === 0 ? m[a * size] : m[a];
        let line = '';
        for (let b = 0; b < size; b++) {
          const v = dir === 0 ? m[a * size + b] : m[b * size + a];
          line += v ? '1' : '0';
          if (b > 0) {
            if (v === prev) {
              run++;
              if (run === 5) result += 3;
              else if (run > 5) result++;
            } else {
              run = 1;
              prev = v;
            }
          }
        }
        let idx = -1;
        while ((idx = line.indexOf('10111010000', idx + 1)) !== -1) result += 40;
        idx = -1;
        while ((idx = line.indexOf('00001011101', idx + 1)) !== -1) result += 40;
      }
    }
    // Regla 2
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = m[y * size + x];
        if (c === m[y * size + x + 1] && c === m[(y + 1) * size + x] && c === m[(y + 1) * size + x + 1]) result += 3;
      }
    }
    // Regla 4
    let dark = 0;
    for (let i = 0; i < m.length; i++) dark += m[i];
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(0, k) * 10;
    return result;
  }
}

export function maskInverts(mask, x, y) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new RangeError('Máscara inválida');
  }
}

function addEccAndInterleave(version, ecl, data) {
  const { numBlocks, eccPerBlock, rawCodewords } = getEccInfo(version, ecl);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const blocks = [];
  const rsDiv = rsComputeDivisor(eccPerBlock);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - eccPerBlock + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsComputeRemainder(dat, rsDiv);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - eccPerBlock || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

// ---------------------------------------------------------------- API pública

/**
 * Codifica segmentos y devuelve la matriz QR.
 * @returns {{version:number,size:number,ecl:number,mask:number,modules:Uint8Array,isFunction:Uint8Array,dataCodewords:number[],codewords:number[],bitsUsed:number}}
 */
export function encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = false) {
  if (minVersion > maxVersion || minVersion < MIN_VERSION || maxVersion > MAX_VERSION) {
    throw new RangeError('Rango de versiones inválido');
  }
  let version;
  let usedBits;
  for (version = minVersion; ; version++) {
    const capacityBits = getNumDataCodewords(version, ecl) * 8;
    usedBits = getTotalBits(segs, version);
    if (usedBits <= capacityBits) break;
    if (version >= maxVersion) {
      const err = new RangeError('Los datos son demasiado largos para un QR con esta corrección de errores');
      err.code = 'DATA_TOO_LONG';
      throw err;
    }
  }
  if (boostEcl) {
    for (const newEcl of [ECL.M, ECL.Q, ECL.H]) {
      if (newEcl > ecl && usedBits <= getNumDataCodewords(version, newEcl) * 8) ecl = newEcl;
    }
  }
  const bb = [];
  for (const seg of segs) {
    appendBits(bb, seg.mode.modeBits, 4);
    appendBits(bb, seg.numChars, ccBitsFor(seg.mode, version));
    for (const b of seg.bitData) bb.push(b);
  }
  const capacityBits = getNumDataCodewords(version, ecl) * 8;
  appendBits(bb, 0, Math.min(4, capacityBits - bb.length));
  appendBits(bb, 0, (8 - (bb.length % 8)) % 8);
  for (let padByte = 0xec; bb.length < capacityBits; padByte ^= 0xec ^ 0x11) appendBits(bb, padByte, 8);
  const dataCodewords = new Array(bb.length / 8).fill(0);
  bb.forEach((b, i) => {
    dataCodewords[i >>> 3] |= b << (7 - (i & 7));
  });
  return buildMatrix(version, ecl, dataCodewords, mask, usedBits);
}

function buildMatrix(version, ecl, dataCodewords, mask, bitsUsed) {
  const b = new Builder(version, ecl);
  b.drawFunctionPatterns();
  const all = addEccAndInterleave(version, ecl, dataCodewords);
  b.drawCodewords(all);
  if (mask === -1) {
    let minPenalty = Infinity;
    for (let i = 0; i < 8; i++) {
      b.applyMask(i);
      b.drawFormat(i);
      const p = b.penalty();
      if (p < minPenalty) {
        mask = i;
        minPenalty = p;
      }
      b.applyMask(i); // deshacer
    }
  }
  if (mask < 0 || mask > 7) throw new RangeError('Máscara fuera de rango');
  b.applyMask(mask);
  b.drawFormat(mask);
  return {
    version,
    size: b.size,
    ecl,
    mask,
    modules: b.modules,
    isFunction: b.isFunction,
    dataCodewords,
    codewords: all,
    bitsUsed,
  };
}

/**
 * Codifica texto. Opciones: ecl ('L'|'M'|'Q'|'H' o número), minVersion, maxVersion, mask (-1 auto), boostEcl.
 */
export function encodeText(text, options = {}) {
  const ecl = typeof options.ecl === 'string' ? ECL[options.ecl] : (options.ecl ?? ECL.M);
  if (ecl === undefined || ecl < 0 || ecl > 3) throw new RangeError('Nivel de corrección inválido');
  return encodeSegments(
    makeSegments(String(text)),
    ecl,
    options.minVersion ?? 1,
    options.maxVersion ?? 40,
    options.mask ?? -1,
    options.boostEcl ?? false,
  );
}

export function getModule(qr, x, y) {
  return x >= 0 && y >= 0 && x < qr.size && y < qr.size ? qr.modules[y * qr.size + x] === 1 : false;
}

/** Recupera el índice de máscara y el nivel de una palabra de formato con hasta 3 bits erróneos. */
export function decodeFormatBits(raw) {
  let best = null;
  for (let ecl = 0; ecl < 4; ecl++) {
    for (let mask = 0; mask < 8; mask++) {
      const data = (ECL_FORMAT_BITS[ecl] << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const word = ((data << 10) | rem) ^ 0x5412;
      let x = word ^ raw;
      let dist = 0;
      while (x) {
        dist += x & 1;
        x >>>= 1;
      }
      if (best === null || dist < best.dist) best = { ecl, mask, dist };
    }
  }
  return best && best.dist <= 3 ? best : null;
}

export function formatWord(ecl, mask) {
  const data = (ECL_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

export { buildMatrix as _buildMatrixForTests, addEccAndInterleave as _interleaveForTests };
