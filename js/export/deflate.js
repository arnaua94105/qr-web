// Compresión zlib (FlateDecode) con CompressionStream si el entorno la tiene; si no, devuelve los datos tal cual.
export async function deflateZlib(u8) {
  if (typeof CompressionStream === 'undefined') return { data: u8, flate: false };
  try {
    const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'));
    const data = new Uint8Array(await new Response(stream).arrayBuffer());
    return data.length < u8.length ? { data, flate: true } : { data: u8, flate: false };
  } catch {
    return { data: u8, flate: false };
  }
}
