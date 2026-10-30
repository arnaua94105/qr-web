import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeText } from '../src/web/js/qr/encoder.js';
import { buildModel, ModelError, flatten, signedVolume } from '../src/web/js/model3d/mesh.js';
import { analyzeMesh, validateModel } from '../src/web/js/model3d/validate3d.js';
import { DEFAULT_3D, sanitize3D, PRESETS_3D } from '../src/web/js/model3d/params.js';
import { partsToStl, parseStl } from '../src/web/js/export/stl.js';
import { partsToObj, parseObj } from '../src/web/js/export/obj.js';
import { modelToGlb, parseGlb } from '../src/web/js/export/glb.js';

const qr = encodeText('https://example.com/qr-studio', { ecl: 'M' });
const darkCount = qr.modules.reduce((s, v) => s + (v === 1 ? 1 : 0), 0);
const flat = (extra = {}) => ({ ...DEFAULT_3D, corner: 0, ...extra });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

test('placa con relieve: malla cerrada, dimensiones y volumen exactos', () => {
  const p = flat();
  const model = buildModel(qr, p);
  assert.equal(model.parts.length, 1);
  const a = analyzeMesh(model.parts[0]);
  assert.equal(a.closed, true);
  assert.equal(a.shells, 1);
  assert.equal(a.degenerateTriangles, 0);
  const W = p.qrMm + 2 * p.margin;
  near(model.dims.x, W, 1e-3, 'ancho');
  near(model.dims.y, W, 1e-3, 'alto');
  near(model.dims.z, p.base + p.relief, 1e-3, 'grosor total');
  const m = p.qrMm / qr.size;
  const expected = W * W * p.base + darkCount * m * m * p.relief;
  near(model.parts[0].volume, expected, expected * 1e-4, 'volumen');
});

test('el QR 3D coincide con la matriz: módulo oscuro = relieve', () => {
  const p = flat();
  const model = buildModel(qr, p);
  const part = model.parts[0];
  const fl = flatten(part);
  // cada triángulo horizontal a altura base+relieve debe caer sobre un módulo oscuro
  const m = p.qrMm / qr.size, x0 = p.margin, yTop = p.margin + p.qrMm;
  let top = 0;
  for (let t = 0; t < fl.count; t += 3) {
    if (fl.normals[t * 3 + 2] < 0.99) continue;
    const z = fl.positions[t * 3 + 2];
    if (Math.abs(z - (p.base + p.relief)) > 1e-4) continue;
    top++;
    const cx = (fl.positions[t * 3] + fl.positions[(t + 1) * 3] + fl.positions[(t + 2) * 3]) / 3;
    const cy = (fl.positions[t * 3 + 1] + fl.positions[(t + 1) * 3 + 1] + fl.positions[(t + 2) * 3 + 1]) / 3;
    const rx = Math.floor((cx - x0) / m), ry = Math.floor((yTop - cy) / m);
    assert.equal(qr.modules[ry * qr.size + rx], 1, `triángulo alto sobre un módulo claro (${rx},${ry})`);
  }
  assert.ok(top >= darkCount * 2, 'faltan caras elevadas');
});

test('grabado: volumen = placa − módulos hundidos', () => {
  const p = flat({ style: 'engraved', base: 3, depth: 1.2 });
  const model = buildModel(qr, p);
  assert.equal(analyzeMesh(model.parts[0]).closed, true);
  const W = p.qrMm + 2 * p.margin, m = p.qrMm / qr.size;
  const expected = W * W * p.base - darkCount * m * m * p.depth;
  near(model.parts[0].volume, expected, expected * 1e-4, 'volumen');
  near(model.dims.z, p.base, 1e-3, 'altura');
});

test('dos piezas (relieve): base + módulos suman lo mismo que una pieza y son independientes', () => {
  const one = buildModel(qr, flat());
  const two = buildModel(qr, flat({ parts: 'separate' }));
  assert.equal(two.parts.length, 2);
  assert.deepEqual(two.parts.map((x) => x.id), ['base', 'ink']);
  const sum = two.parts[0].volume + two.parts[1].volume;
  near(sum, one.parts[0].volume, one.parts[0].volume * 1e-4, 'suma de volúmenes');
  for (const part of two.parts) assert.equal(analyzeMesh(part).closed, true, part.name);
  // los módulos apoyan exactamente sobre la base
  near(two.parts[1].bbox.min[2], DEFAULT_3D.base, 1e-6, 'z mínimo de los módulos');
  near(two.parts[1].bbox.max[2], DEFAULT_3D.base + DEFAULT_3D.relief, 1e-6, 'z máximo de los módulos');
  assert.ok(analyzeMesh(two.parts[1]).shells > 1, 'los módulos son piezas independientes unidas solo por la base');
});

test('dos piezas (grabado): el relleno encaja en el cajeado; con holgura es menor', () => {
  const p = { base: 3, depth: 1.2, style: 'engraved', parts: 'separate' };
  const tight = buildModel(qr, flat(p));
  const loose = buildModel(qr, flat({ ...p, clearance: 0.15 }));
  const single = buildModel(qr, flat({ ...p, parts: 'single' }));
  near(tight.parts[0].volume + tight.parts[1].volume, single.parts[0].volume + darkCount * (DEFAULT_3D.qrMm / qr.size) ** 2 * 1.2, 1, 'base + relleno = placa llena');
  assert.ok(loose.parts[1].volume < tight.parts[1].volume, 'la holgura reduce el relleno');
  // base igual en ambos (el cajeado no cambia)
  near(loose.parts[0].volume, tight.parts[0].volume, 1e-3, 'el cajeado no cambia con la holgura');
  for (const part of [...tight.parts, ...loose.parts]) assert.equal(analyzeMesh(part).closed, true);
  // relleno y cajeado a la misma profundidad
  near(tight.parts[1].bbox.min[2], 3 - 1.2, 1e-6, 'fondo del relleno');
  near(tight.parts[1].bbox.max[2], 3, 1e-6, 'tapa del relleno');
});

test('llavero: anilla con orificio y una sola pieza cerrada', () => {
  const p = { ...DEFAULT_3D, ...PRESETS_3D.find((x) => x.id === 'keychain').patch };
  const model = buildModel(qr, p);
  const a = analyzeMesh(model.parts[0]);
  assert.equal(a.closed, true);
  assert.equal(a.shells, 1);
  const R = p.holeD / 2 + p.holeWall;
  const baseH = p.qrMm + 2 * p.margin;
  near(model.dims.y, baseH + 2 * R, 1e-3, 'alto con anilla');
  assert.ok(model.info.plate.earCenter, 'tiene anilla');
  // el volumen es menor que el de la misma placa con anilla sin orificio: comprueba que hay hueco real
  const noHole = buildModel(qr, { ...p, holeD: 1.5, holeWall: R - 0.75 });
  assert.ok(model.parts[0].volume < noHole.parts[0].volume, 'el orificio quita material');
  // ningún triángulo del orificio invade el QR
  const fl = flatten(model.parts[0]);
  const hy = model.info.plate.earCenter[1];
  for (let t = 0; t < fl.count; t++) {
    const y = fl.positions[t * 3 + 1];
    const x = fl.positions[t * 3];
    const d = Math.hypot(x - model.info.plate.earCenter[0], y - hy);
    if (Math.abs(fl.normals[t * 3 + 2]) < 0.01 && d < p.holeD / 2 - 0.5) assert.fail('geometría dentro del orificio');
  }
});

test('medalla circular con borde elevado', () => {
  const p = { ...DEFAULT_3D, ...PRESETS_3D.find((x) => x.id === 'round').patch };
  const model = buildModel(qr, p);
  assert.equal(analyzeMesh(model.parts[0]).closed, true);
  const D = Math.SQRT2 * p.qrMm + 2 * p.margin;
  near(model.dims.x, D, p.detail * 1.5, 'diámetro');
  near(model.dims.z, p.base + Math.max(p.relief, p.rimHeight), 1e-3, 'altura con borde');
  const base = p.base * Math.PI * (D / 2) ** 2;
  assert.ok(model.parts[0].volume > base * 0.97 && model.parts[0].volume < base * 1.25, `volumen plausible ${model.parts[0].volume} vs ${base}`);
});

test('texto bajo el código: banda y máscara, grabado y elevado', () => {
  const cols = 40, rows = 8;
  const data = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) data[y * cols + x] = (x % 4 < 2) && y > 1 && y < 7 ? 1 : 0;
  const mask = { cols, rows, data };
  const plain = buildModel(qr, flat());
  const raised = buildModel(qr, flat({ label: 'Hola' }), { labelMask: mask });
  assert.ok(raised.dims.y > plain.dims.y + 8, 'la banda de texto añade altura');
  assert.ok(raised.parts[0].volume > plain.parts[0].volume, 'el texto elevado añade volumen');
  assert.equal(analyzeMesh(raised.parts[0]).closed, true);
  assert.ok(raised.info.textBox);
  const engr = buildModel(qr, flat({ label: 'Hola', style: 'engraved', base: 3, depth: 1 }), { labelMask: mask });
  const engrPlain = buildModel(qr, flat({ style: 'engraved', base: 3, depth: 1 }));
  assert.ok(engr.parts[0].volume < engrPlain.parts[0].volume + (engr.dims.y - engrPlain.dims.y) * engr.dims.x * 3, 'el texto grabado quita volumen');
  assert.equal(analyzeMesh(engr.parts[0]).closed, true);
});

test('parámetros inválidos se rechazan con ModelError', () => {
  const bads = [
    { qrMm: 0 }, { qrMm: -5 }, { base: 0 }, { relief: -1 }, { margin: -1 }, { corner: -2 }, { detail: 0.01 },
    { style: 'engraved', depth: 3, base: 2 }, { style: 'engraved', depth: 0 }, { keychain: true, holeD: 0 },
    { qrMm: NaN }, { shape: 'hexagono' }, { parts: 'tres' }, { clearance: -0.1 },
  ];
  for (const b of bads) assert.throws(() => buildModel(qr, { ...DEFAULT_3D, ...b }), ModelError, JSON.stringify(b));
  assert.throws(() => buildModel(null, DEFAULT_3D), ModelError);
  // sanitize3D (interfaz) corrige en lugar de rechazar
  const s = sanitize3D({ qrMm: -3, base: 'x', style: 'raro', baseColor: 'rojo' });
  assert.equal(s.qrMm, 10);
  assert.equal(s.base, DEFAULT_3D.base);
  assert.equal(s.style, 'raised');
  assert.equal(s.baseColor, DEFAULT_3D.baseColor);
});

test('versiones y niveles distintos generan modelos cerrados', () => {
  for (const [text, ecl] of [['1', 'L'], ['x'.repeat(120), 'Q'], ['WIFI:T:WPA;S:red;P:clave1234;;', 'H']]) {
    const q = encodeText(text, { ecl });
    for (const style of ['raised', 'engraved']) for (const parts of ['single', 'separate']) {
      const model = buildModel(q, { ...DEFAULT_3D, qrMm: 50, style, parts, base: 3, depth: 1, clearance: parts === 'separate' ? 0.1 : 0 });
      for (const part of model.parts) {
        const a = analyzeMesh(part);
        assert.equal(a.closed, true, `${text.slice(0, 8)} ${ecl} ${style} ${parts} ${part.name}`);
        assert.ok(part.volume > 0);
      }
    }
  }
});

test('validación de imprimibilidad: avisos y errores útiles', () => {
  const ok = buildModel(qr, DEFAULT_3D);
  const v = validateModel(ok, ok.info.params);
  assert.equal(v.checks.find((c) => c.id === 'closed').level, 'ok');
  assert.ok(['ok', 'warn'].includes(v.worst));
  const tiny = buildModel(qr, { ...DEFAULT_3D, qrMm: 9, margin: 1 });
  const vt = validateModel(tiny, tiny.info.params);
  assert.equal(vt.checks.find((c) => c.id === 'module').level, 'bad');
  assert.equal(vt.worst, 'bad');
  const thin = buildModel(qr, { ...DEFAULT_3D, base: 0.5, relief: 0.2 });
  const vth = validateModel(thin, thin.info.params);
  assert.equal(vth.checks.find((c) => c.id === 'base').level, 'bad');
  assert.equal(vth.checks.find((c) => c.id === 'relief').level, 'warn');
  const frail = buildModel(qr, { ...DEFAULT_3D, keychain: true, holeWall: 0.8 });
  assert.equal(validateModel(frail, frail.info.params).checks.find((c) => c.id === 'ring').level, 'warn');
  const big = buildModel(qr, { ...DEFAULT_3D, qrMm: 220, margin: 10 });
  assert.equal(validateModel(big, big.info.params).checks.find((c) => c.id === 'bed').level, 'warn');
});

test('analizador detecta una malla abierta y un volumen negativo', () => {
  const model = buildModel(qr, flat());
  const part = model.parts[0];
  const broken = { ...part, indices: part.indices.slice(3), volume: part.volume };
  assert.equal(analyzeMesh(broken).closed, false);
  // caras con la orientación invertida: el volumen firmado sale negativo
  const flip = Uint32Array.from(part.indices);
  for (let t = 0; t < flip.length; t += 3) [flip[t + 1], flip[t + 2]] = [flip[t + 2], flip[t + 1]];
  assert.ok(signedVolume(part.positions, flip) < 0);
  assert.ok(signedVolume(part.positions, part.indices) > 0);
});

test('rendimiento: el modelo por defecto y uno circular fino se generan en tiempo razonable', () => {
  let t0 = performance.now();
  buildModel(qr, DEFAULT_3D);
  const t1 = performance.now() - t0;
  t0 = performance.now();
  const m = buildModel(qr, { ...DEFAULT_3D, shape: 'circle', detail: 0.2, rimWidth: 1.5 });
  const t2 = performance.now() - t0;
  assert.ok(t1 < 1500, `modelo por defecto: ${t1.toFixed(0)} ms`);
  assert.ok(t2 < 4000, `circular fino: ${t2.toFixed(0)} ms (${m.parts[0].triangles} triángulos)`);
});

test('STL: archivo binario coherente con la malla (triángulos, caja y volumen)', () => {
  const model = buildModel(qr, { ...DEFAULT_3D, parts: 'separate' });
  for (const part of model.parts) {
    const stl = partsToStl(part);
    const r = parseStl(stl);
    assert.equal(r.triangles, part.triangles);
    for (let k = 0; k < 3; k++) {
      near(r.min[k], part.bbox.min[k], 1e-3, 'mín ' + k);
      near(r.max[k], part.bbox.max[k], 1e-3, 'máx ' + k);
    }
    // volumen desde los triángulos del archivo
    let v = 0;
    for (let t = 0; t < r.triangles; t++) {
      const o = t * 9, T = r.tris;
      v += (T[o] * (T[o + 4] * T[o + 8] - T[o + 5] * T[o + 7]) - T[o + 1] * (T[o + 3] * T[o + 8] - T[o + 5] * T[o + 6]) + T[o + 2] * (T[o + 3] * T[o + 7] - T[o + 4] * T[o + 6])) / 6;
    }
    near(v, part.volume, part.volume * 1e-3, 'volumen desde el STL');
    assert.ok(!new TextDecoder().decode(stl.subarray(0, 5)).startsWith('solid'), 'un STL binario no debe empezar por «solid»');
  }
  const both = partsToStl(model.parts);
  assert.equal(parseStl(both).triangles, model.parts.reduce((s, p) => s + p.triangles, 0));
});

test('OBJ: vértices, caras e índices válidos', () => {
  const model = buildModel(qr, { ...DEFAULT_3D, parts: 'separate' });
  const r = parseObj(partsToObj(model.parts));
  assert.equal(r.objects, 2);
  assert.equal(r.vertices, model.parts.reduce((s, p) => s + p.vertices, 0));
  assert.equal(r.faces, model.parts.reduce((s, p) => s + p.triangles, 0));
  assert.equal(r.badIndices, 0);
});

test('GLB: cabecera, accesorios dentro del búfer, caja en metros y material por pieza', () => {
  const model = buildModel(qr, { ...DEFAULT_3D, parts: 'separate' });
  const glb = modelToGlb(model, 'Prueba');
  const { json, bin } = parseGlb(glb);
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.meshes.length, 2);
  assert.equal(json.materials.length, 2);
  assert.equal(glb.length % 4, 0);
  for (const a of json.accessors) {
    const bv = json.bufferViews[a.bufferView];
    assert.ok(bv.byteOffset + bv.byteLength <= bin.length, 'accesor fuera del búfer');
    assert.equal(a.count * 12, bv.byteLength);
  }
  const pos = json.accessors[0];
  const W = (DEFAULT_3D.qrMm + 2 * DEFAULT_3D.margin) / 1000;
  near(pos.max[0] - pos.min[0], W, 1e-6, 'ancho en metros');
  near(pos.min[1], 0, 1e-9, 'apoya en y=0');
  const dv = new DataView(bin.buffer, bin.byteOffset);
  for (const a of json.accessors.filter((x) => x.min)) {
    const bv = json.bufferViews[a.bufferView];
    for (let i = 0; i < a.count * 3; i++) {
      const v = dv.getFloat32(bv.byteOffset + i * 4, true);
      assert.ok(Number.isFinite(v));
      assert.ok(v >= a.min[i % 3] - 1e-9 && v <= a.max[i % 3] + 1e-9);
    }
  }
});
