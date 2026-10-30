import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeText, byteCapacity, getNumDataCodewords, getNumRawDataModules, getAlignmentPatternPositions,
  rsComputeDivisor, rsComputeRemainder, makeSegments, ECL, formatWord, decodeFormatBits,
} from '../src/web/js/qr/encoder.js';
import { decodeMatrix, rsCorrect, simulateCover, moduleCodewordMap, blockLayout } from '../src/web/js/qr/decoder.js';

const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const hex = (a) => a.map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');

test('capacidades publicadas (ISO 18004, modo byte)', () => {
  // Valores de la tabla oficial de capacidades
  assert.equal(byteCapacity(1, ECL.L), 17);
  assert.equal(byteCapacity(1, ECL.M), 14);
  assert.equal(byteCapacity(1, ECL.Q), 11);
  assert.equal(byteCapacity(1, ECL.H), 7);
  assert.equal(byteCapacity(40, ECL.L), 2953);
  assert.equal(byteCapacity(40, ECL.M), 2331);
  assert.equal(byteCapacity(40, ECL.Q), 1663);
  assert.equal(byteCapacity(40, ECL.H), 1273);
  assert.equal(byteCapacity(10, ECL.M), 213);
});

test('módulos brutos y palabras de datos conocidos', () => {
  assert.equal(getNumRawDataModules(1), 208);
  assert.equal(getNumRawDataModules(2), 359);
  assert.equal(getNumRawDataModules(7), 1568);
  assert.equal(getNumRawDataModules(40), 29648);
  assert.equal(getNumDataCodewords(1, ECL.M), 16);
  assert.equal(getNumDataCodewords(5, ECL.Q), 62);
  assert.deepEqual(getAlignmentPatternPositions(2), [6, 18]);
  assert.deepEqual(getAlignmentPatternPositions(7), [6, 22, 38]);
  assert.deepEqual(getAlignmentPatternPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(getAlignmentPatternPositions(40), [6, 30, 58, 86, 114, 142, 170]);
});

test('vector de la norma: "01234567" versión 1-M (datos y ECC)', () => {
  const qr = encodeText('01234567', { ecl: 'M', minVersion: 1, maxVersion: 1 });
  assert.equal(hex(qr.dataCodewords), '10 20 0C 56 61 80 EC 11 EC 11 EC 11 EC 11 EC 11');
  assert.equal(hex(qr.codewords.slice(16)), 'A5 24 D4 C1 ED 36 C7 87 2C 55');
});

test('vector conocido: "HELLO WORLD" versión 1-Q (13 palabras de datos, 13 de ECC)', () => {
  const qr = encodeText('HELLO WORLD', { ecl: 'Q', minVersion: 1, maxVersion: 1 });
  assert.equal(qr.version, 1);
  assert.equal(hex(qr.dataCodewords), '20 5B 0B 78 D1 72 DC 4D 43 40 EC 11 EC');
  assert.equal(hex(qr.codewords.slice(13)), 'A8 48 16 52 D9 36 9C 00 2E 0F B4 7A 10');
});

test('vector conocido: "HELLO WORLD" versión 1-M (16 palabras de datos, 10 de ECC)', () => {
  const qr = encodeText('HELLO WORLD', { ecl: 'M', minVersion: 1, maxVersion: 1 });
  assert.equal(hex(qr.dataCodewords), '20 5B 0B 78 D1 72 DC 4D 43 40 EC 11 EC 11 EC 11');
  assert.equal(hex(qr.codewords.slice(16)), 'C4 23 27 77 EB D7 E7 E2 5D 17');
});

test('divisor de Reed-Solomon de grado 7 y resto de grado 10', () => {
  assert.deepEqual(rsComputeDivisor(7), [127, 122, 154, 164, 11, 68, 117]);
  const data = [0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d, 0x43, 0x40, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.equal(hex(rsComputeRemainder(data, rsComputeDivisor(10))), 'C4 23 27 77 EB D7 E7 E2 5D 17');
});

test('selección de modo de segmento', () => {
  assert.equal(makeSegments('12345')[0].mode.modeBits, 1);
  assert.equal(makeSegments('ABC 123')[0].mode.modeBits, 2);
  assert.equal(makeSegments('abc')[0].mode.modeBits, 4);
  assert.equal(makeSegments('').length, 0);
});

test('palabra de formato: valor conocido y recuperación con 3 bits erróneos', () => {
  // Nivel M (00), máscara 5 (101) -> 0x4F6... valor de la tabla de la norma: 100000011001110 con XOR ya aplicado
  assert.equal(formatWord(ECL.M, 5).toString(2).padStart(15, '0'), '100000011001110');
  const w = formatWord(ECL.Q, 3);
  const noisy = w ^ 0b000010000100001;
  assert.deepEqual(decodeFormatBits(noisy) && { e: decodeFormatBits(noisy).ecl, m: decodeFormatBits(noisy).mask }, { e: ECL.Q, m: 3 });
});

test('ida y vuelta: codificar y decodificar la matriz (todas las versiones, niveles y modos)', () => {
  const rnd = lcg(42);
  const byteAlpha = 'abcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&()*+,;=% ñáé你好';
  let checked = 0;
  for (let v = 1; v <= 40; v++) {
    for (const ecl of ['L', 'M', 'Q', 'H']) {
      const cap = byteCapacity(v, ECL[ecl]);
      const chars = Array.from({ length: Math.max(1, Math.floor(cap * 0.9)) }, () => byteAlpha[Math.floor(rnd() * byteAlpha.length)]);
      let text = chars.join('');
      // recortar hasta que quepa en bytes UTF-8
      while (new TextEncoder().encode(text).length > cap) text = text.slice(0, -1);
      const qr = encodeText(text, { ecl, minVersion: v, maxVersion: v });
      assert.equal(qr.version, v);
      const d = decodeMatrix(qr.modules, qr.size);
      assert.equal(d.text, text, `v${v}-${ecl}`);
      assert.equal(d.version, v);
      assert.equal(d.mask, qr.mask);
      assert.equal(d.correctedCodewords, 0);
      checked++;
    }
  }
  assert.equal(checked, 160);
});

test('ida y vuelta en modos numérico y alfanumérico', () => {
  for (const t of ['0', '12', '123', '0123456789012345678901234567890123456789', 'A', 'AB', 'ABC 123 $%*+-./:', 'HTTP://EXAMPLE.COM/ABC']) {
    for (const ecl of ['L', 'M', 'Q', 'H']) {
      const qr = encodeText(t, { ecl });
      assert.equal(decodeMatrix(qr.modules, qr.size).text, t);
    }
  }
});

test('las 8 máscaras producen QR decodificables', () => {
  for (let m = 0; m < 8; m++) {
    const qr = encodeText('Máscara ' + m, { ecl: 'M', mask: m });
    assert.equal(qr.mask, m);
    assert.equal(decodeMatrix(qr.modules, qr.size).text, 'Máscara ' + m);
  }
});

test('texto demasiado largo lanza error con código', () => {
  assert.throws(() => encodeText('x'.repeat(2954), { ecl: 'L' }), (e) => e.code === 'DATA_TOO_LONG');
  assert.doesNotThrow(() => encodeText('x'.repeat(2953), { ecl: 'L' }));
  assert.throws(() => encodeText('x', { ecl: 'Z' }), RangeError);
});

test('texto vacío genera un QR válido que decodifica a vacío', () => {
  const qr = encodeText('', { ecl: 'M' });
  assert.equal(qr.version, 1);
  assert.equal(decodeMatrix(qr.modules, qr.size).text, '');
});

test('Reed-Solomon corrige hasta t errores y rechaza más', () => {
  const rnd = lcg(7);
  const data = Array.from({ length: 40 }, () => Math.floor(rnd() * 256));
  const nsym = 20;
  const code = data.concat(rsComputeRemainder(data, rsComputeDivisor(nsym)));
  for (let errors = 0; errors <= 10; errors++) {
    for (let trial = 0; trial < 30; trial++) {
      const word = code.slice();
      const pos = new Set();
      while (pos.size < errors) pos.add(Math.floor(rnd() * word.length));
      for (const p of pos) word[p] ^= 1 + Math.floor(rnd() * 255);
      const fixed = rsCorrect(word, nsym);
      assert.equal(fixed, errors);
      assert.deepEqual(word, code);
    }
  }
  // 11 errores: debe fallar (o, rarísimamente, corregir a otra palabra de código, nunca a la original)
  let rejected = 0;
  for (let trial = 0; trial < 40; trial++) {
    const word = code.slice();
    const pos = new Set();
    while (pos.size < 11) pos.add(Math.floor(rnd() * word.length));
    for (const p of pos) word[p] ^= 1 + Math.floor(rnd() * 255);
    try {
      rsCorrect(word, nsym);
      assert.notDeepEqual(word, code.map((v, i) => v), 'no debe "recuperar" con 11 errores');
    } catch {
      rejected++;
    }
  }
  assert.ok(rejected >= 38, 'casi todos los casos con 11 errores deben rechazarse, fueron ' + rejected);
});

test('el QR sobrevive al daño máximo corregible: t palabras por bloque, todos sus módulos invertidos', () => {
  const rnd = lcg(99);
  for (const [text, ecl] of [['https://example.com/abc?x=1', 'H'], ['https://example.com/promo/otoño-2026', 'Q'], ['QR Studio '.repeat(9), 'M']]) {
    const qr = encodeText(text, { ecl });
    const map = moduleCodewordMap(qr.version);
    const layout = blockLayout(qr.version, qr.ecl);
    for (let trial = 0; trial < 10; trial++) {
      const bad = new Set();
      for (const b of layout) {
        const t = Math.floor(b.eccLen / 2);
        const pool = [...b.indices];
        for (let k = 0; k < t; k++) bad.add(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      }
      const m = Uint8Array.from(qr.modules);
      for (let i = 0; i < m.length; i++) if (map[i] >= 0 && bad.has(map[i])) m[i] ^= 1;
      const d = decodeMatrix(m, qr.size);
      assert.equal(d.text, text);
      assert.equal(d.correctedCodewords, bad.size);
    }
  }
});

test('con una palabra más de t en un bloque, el QR deja de ser recuperable', () => {
  const qr = encodeText('https://example.com/abc?x=1', { ecl: 'H' });
  const map = moduleCodewordMap(qr.version);
  const b = blockLayout(qr.version, qr.ecl)[0];
  const bad = new Set(b.indices.slice(0, Math.floor(b.eccLen / 2) + 1));
  const m = Uint8Array.from(qr.modules);
  for (let i = 0; i < m.length; i++) if (map[i] >= 0 && bad.has(map[i])) m[i] ^= 1;
  assert.throws(() => decodeMatrix(m, qr.size));
});

test('simulateCover: un hueco central pequeño se recupera; uno enorme no', () => {
  const qr = encodeText('https://example.com/promo/otoño-2026', { ecl: 'H' });
  const cover = (frac) => {
    const c = new Uint8Array(qr.size * qr.size);
    const side = Math.round(qr.size * Math.sqrt(frac));
    const o = Math.floor((qr.size - side) / 2);
    for (let y = o; y < o + side; y++) for (let x = o; x < o + side; x++) c[y * qr.size + x] = 1;
    return c;
  };
  const small = simulateCover(qr, cover(0.04));
  assert.equal(small.recovered, true);
  assert.equal(small.decoded.text, 'https://example.com/promo/otoño-2026');
  const huge = simulateCover(qr, cover(0.6));
  assert.equal(huge.recovered, false);
  assert.ok(huge.eccLoad > 1);
});
