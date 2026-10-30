// Barrido de las 160 combinaciones versión x nivel, con datos a capacidad máxima.
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodeText, byteCapacity } from '../../src/web/js/qr/encoder.js';
const out = process.argv[2] ?? '/tmp/qrsweep';
mkdirSync(out, { recursive: true });
let s = 777; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const BYTE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~:/?#[]@!$&()*+,;=%';
const manifest = [];
for (let v = 1; v <= 40; v++) for (const ecl of ['L', 'M', 'Q', 'H']) {
  const cap = byteCapacity(v, { L: 0, M: 1, Q: 2, H: 3 }[ecl]);
  const text = Array.from({ length: cap }, () => BYTE[Math.floor(rnd() * BYTE.length)]).join('');
  const qr = encodeText(text, { ecl, minVersion: v, maxVersion: v });
  if (qr.version !== v) throw new Error('versión inesperada ' + qr.version + ' vs ' + v);
  for (const scale of (v > 25 ? [4, 5, 7] : [5, 8, 11])) {
    const quiet = 4, n = qr.size + quiet * 2, px = n * scale;
    const img = Buffer.alloc(px * px, 255);
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y * qr.size + x])
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) img[((y + quiet) * scale + dy) * px + (x + quiet) * scale + dx] = 0;
    const file = `${out}/v${String(v).padStart(2, '0')}${ecl}_s${scale}.pgm`;
    writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${px} ${px}\n255\n`), img]));
    manifest.push({ file, text, ecl, version: v, group: `v${v}${ecl}` });
  }
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest));
console.log('generadas', manifest.length);
