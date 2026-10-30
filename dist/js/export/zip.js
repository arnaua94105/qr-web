// ZIP mínimo (método 0 «almacenado» o 8 «deflate» si el entorno tiene CompressionStream). Módulo puro.
// Se usa para el lote de QR, para las piezas 3D y como contenedor del formato 3MF.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function deflateRaw(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

const enc = new TextEncoder();

function dosDateTime(d) {
  const y = Math.max(1980, d.getFullYear());
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * @param {{name:string, data:Uint8Array|string}[]} files
 * @param {{compress?:boolean, date?:Date}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function makeZip(files, opts = {}) {
  const { time, date } = dosDateTime(opts.date || new Date());
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (u8) => {
    chunks.push(u8);
    offset += u8.length;
  };
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    let method = 0, body = data;
    if (opts.compress !== false && data.length > 64) {
      const z = await deflateRaw(data);
      if (z && z.length < data.length) {
        method = 8;
        body = z;
      }
    }
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // nombres en UTF-8
    head.setUint16(8, method, true);
    head.setUint16(10, time, true);
    head.setUint16(12, date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, body.length, true);
    head.setUint32(22, data.length, true);
    head.setUint16(26, nameBytes.length, true);
    head.setUint16(28, 0, true);
    const localOffset = offset;
    push(new Uint8Array(head.buffer));
    push(nameBytes);
    push(body);
    central.push({ nameBytes, crc, method, csize: body.length, usize: data.length, localOffset });
  }
  const cdStart = offset;
  for (const c of central) {
    const h = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x02014b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 20, true);
    h.setUint16(8, 0x0800, true);
    h.setUint16(10, c.method, true);
    h.setUint16(12, time, true);
    h.setUint16(14, date, true);
    h.setUint32(16, c.crc, true);
    h.setUint32(20, c.csize, true);
    h.setUint32(24, c.usize, true);
    h.setUint16(28, c.nameBytes.length, true);
    h.setUint32(42, c.localOffset, true);
    push(new Uint8Array(h.buffer));
    push(c.nameBytes);
  }
  const cdSize = offset - cdStart;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length, true);
  end.setUint16(10, central.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, cdStart, true);
  push(new Uint8Array(end.buffer));
  const out = new Uint8Array(offset);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
