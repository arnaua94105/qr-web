// Genera QR planos (sin estilos) como PGM + manifiesto, para decodificarlos con OpenCV.
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodeText } from '../../src/web/js/qr/encoder.js';

const out = process.argv[2] ?? '/tmp/qrv';
mkdirSync(out, { recursive: true });
const cases = [];
const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
const rndStr = (n, alphabet) => Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 $%*+-./:';
const BYTE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~:/?#[]@!$&()*+,;=%';
for (const ecl of ['L', 'M', 'Q', 'H']) {
  cases.push({ text: 'HELLO WORLD', ecl });
  cases.push({ text: '01234567890123456789', ecl });
  cases.push({ text: 'https://www.example.com/path?query=1&b=2', ecl });
  cases.push({ text: 'Ñandú, café y corazón ❤ 你好', ecl });
  for (const n of [10, 40, 90, 150, 300, 600]) cases.push({ text: rndStr(n, BYTE), ecl });
  for (const n of [30, 200, 500]) cases.push({ text: rndStr(n, ALNUM), ecl });
  for (const n of [50, 400]) cases.push({ text: rndStr(n, '0123456789'), ecl });
}
const manifest = [];
let i = 0;
for (const c of cases) {
  let qr;
  try { qr = encodeText(c.text, { ecl: c.ecl }); } catch (e) { manifest.push({ skipped: true, reason: e.message }); continue; }
  const scale = 8, quiet = 4, n = qr.size + quiet * 2, px = n * scale;
  const img = Buffer.alloc(px * px, 255);
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (!qr.modules[y * qr.size + x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) img[((y + quiet) * scale + dy) * px + (x + quiet) * scale + dx] = 0;
  }
  const file = `${out}/plain_${String(i++).padStart(3, '0')}.pgm`;
  writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${px} ${px}\n255\n`), img]));
  manifest.push({ file, text: c.text, ecl: c.ecl, version: qr.version, mask: qr.mask });
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest));
console.log('generados', manifest.filter(m => !m.skipped).length, 'omitidos', manifest.filter(m => m.skipped).length);
