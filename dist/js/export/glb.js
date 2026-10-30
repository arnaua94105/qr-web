// glTF 2.0 binario (.glb). Módulo puro.
// glTF usa metros y eje Y hacia arriba: se convierte mm → m y (x, y, z) → (x, z, −y), que es un giro propio
// (no cambia la orientación de las caras). El modelo se centra en X/Z y apoya sobre el plano.
import { flatten } from '../model3d/mesh.js';

const hexToLinear = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255), 1];
};

export function modelToGlb(model, title = 'QR Studio') {
  const bb = model.bbox;
  const cxm = (bb.min[0] + bb.max[0]) / 2, cym = (bb.min[1] + bb.max[1]) / 2, z0 = bb.min[2];
  const bins = [];
  const bufferViews = [], accessors = [], meshes = [], nodes = [], materials = [];
  let byteLength = 0;
  model.parts.forEach((part, pi) => {
    const fl = flatten(part);
    const n = fl.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const x = (fl.positions[i * 3] - cxm) / 1000, y = (fl.positions[i * 3 + 1] - cym) / 1000, z = (fl.positions[i * 3 + 2] - z0) / 1000;
      const X = x, Y = z, Z = -y;
      pos[i * 3] = X; pos[i * 3 + 1] = Y; pos[i * 3 + 2] = Z;
      const nx = fl.normals[i * 3], ny = fl.normals[i * 3 + 1], nz = fl.normals[i * 3 + 2];
      nor[i * 3] = nx; nor[i * 3 + 1] = nz; nor[i * 3 + 2] = -ny;
      if (X < min[0]) min[0] = X; if (X > max[0]) max[0] = X;
      if (Y < min[1]) min[1] = Y; if (Y > max[1]) max[1] = Y;
      if (Z < min[2]) min[2] = Z; if (Z > max[2]) max[2] = Z;
    }
    for (const arr of [pos, nor]) {
      bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: arr.byteLength, target: 34962 });
      bins.push(new Uint8Array(arr.buffer));
      byteLength += arr.byteLength;
    }
    const bvP = bufferViews.length - 2, bvN = bufferViews.length - 1;
    accessors.push({ bufferView: bvP, componentType: 5126, count: n, type: 'VEC3', min, max });
    accessors.push({ bufferView: bvN, componentType: 5126, count: n, type: 'VEC3' });
    materials.push({ name: part.name, pbrMetallicRoughness: { baseColorFactor: hexToLinear(part.color), metallicFactor: 0, roughnessFactor: 0.55 } });
    meshes.push({ name: part.name, primitives: [{ attributes: { POSITION: accessors.length - 2, NORMAL: accessors.length - 1 }, material: pi, mode: 4 }] });
    nodes.push({ name: part.name, mesh: pi });
  });
  const json = {
    asset: { version: '2.0', generator: 'QR Studio', extras: { title, note: 'Modelo en milímetros convertido a metros (1 mm = 0,001).' } },
    scene: 0,
    scenes: [{ name: title, nodes: nodes.map((_, i) => i) }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength }],
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) {
    const t = new Uint8Array(jsonBytes.length + jpad).fill(0x20);
    t.set(jsonBytes);
    jsonBytes = t;
  }
  const binPad = (4 - (byteLength % 4)) % 4;
  const binLen = byteLength + binPad;
  const total = 12 + 8 + jsonBytes.length + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  dv.setUint32(o, binLen, true);
  dv.setUint32(o + 4, 0x004e4942, true); // BIN
  o += 8;
  for (const b of bins) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

export function parseGlb(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('No es un GLB');
  if (dv.getUint32(8, true) !== u8.length) throw new Error('Longitud del GLB incoherente');
  const jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
  const binStart = 20 + jl + 8;
  const binLen = dv.getUint32(20 + jl, true);
  return { json, bin: u8.subarray(binStart, binStart + binLen) };
}
