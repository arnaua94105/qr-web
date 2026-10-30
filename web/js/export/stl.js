// STL binario (milímetros). Módulo puro.
// El formato no guarda unidades ni colores: las unidades por convención son mm; cada pieza en un archivo aparte.

/** @param part {positions:Float32Array, indices:Uint32Array}  @param extra piezas adicionales a unir en el mismo archivo */
export function partsToStl(parts, label = 'QR Studio STL (mm)') {
  const list = Array.isArray(parts) ? parts : [parts];
  const tris = list.reduce((s, p) => s + p.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  const head = new TextEncoder().encode(label.replace(/^solid/i, 'QRS').slice(0, 79));
  new Uint8Array(buf, 0, 80).set(head);
  dv.setUint32(80, tris, true);
  let o = 84;
  for (const part of list) {
    const { positions: P, indices: I } = part;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / l, true);
      dv.setFloat32(o + 4, ny / l, true);
      dv.setFloat32(o + 8, nz / l, true);
      dv.setFloat32(o + 12, P[a], true);
      dv.setFloat32(o + 16, P[a + 1], true);
      dv.setFloat32(o + 20, P[a + 2], true);
      dv.setFloat32(o + 24, P[b], true);
      dv.setFloat32(o + 28, P[b + 1], true);
      dv.setFloat32(o + 32, P[b + 2], true);
      dv.setFloat32(o + 36, P[c], true);
      dv.setFloat32(o + 40, P[c + 1], true);
      dv.setFloat32(o + 44, P[c + 2], true);
      dv.setUint16(o + 48, 0, true);
      o += 50;
    }
  }
  return new Uint8Array(buf);
}

/** Lector de STL binario para pruebas: devuelve triángulos y comprueba que el tamaño es coherente. */
export function parseStl(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = dv.getUint32(80, true);
  if (84 + n * 50 !== u8.length) throw new Error(`STL incoherente: ${n} triángulos no caben en ${u8.length} bytes`);
  const tris = new Float32Array(n * 9);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k++) {
      const v = dv.getFloat32(o + k * 4, true);
      tris[t * 9 + k] = v;
      const ax = k % 3;
      if (v < min[ax]) min[ax] = v;
      if (v > max[ax]) max[ax] = v;
    }
  }
  return { triangles: n, tris, min, max };
}
