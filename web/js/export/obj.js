// Wavefront OBJ (milímetros). Una «o» por pieza. Módulo puro. El OBJ no lleva colores sin archivo MTL.
const r = (v) => String(Math.round(v * 10000) / 10000);

export function partsToObj(parts, title = 'QR Studio') {
  const lines = [`# ${title}`, '# Unidades: milímetros', ''];
  let offset = 0;
  for (const part of parts) {
    lines.push(`o ${part.name.replace(/\s+/g, '_')}`);
    const P = part.positions;
    for (let i = 0; i < P.length; i += 3) lines.push(`v ${r(P[i])} ${r(P[i + 1])} ${r(P[i + 2])}`);
    const I = part.indices;
    for (let t = 0; t < I.length; t += 3) lines.push(`f ${I[t] + 1 + offset} ${I[t + 1] + 1 + offset} ${I[t + 2] + 1 + offset}`);
    offset += P.length / 3;
    lines.push('');
  }
  return lines.join('\n');
}

export function parseObj(text) {
  let v = 0, f = 0, o = 0, bad = 0;
  const nv = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      v++;
      nv.push(1);
    } else if (line.startsWith('f ')) {
      f++;
      for (const t of line.slice(2).trim().split(/\s+/)) {
        const i = parseInt(t, 10);
        if (!(i >= 1 && i <= v)) bad++;
      }
    } else if (line.startsWith('o ')) o++;
  }
  return { vertices: v, faces: f, objects: o, badIndices: bad };
}
