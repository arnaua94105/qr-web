// 3MF (núcleo): ZIP con modelo XML, unidades en milímetros, un objeto por pieza y colores base. Módulo puro.
import { makeZip } from './zip.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r = (v) => String(Math.round(v * 10000) / 10000);

export async function modelTo3mf(model, title = 'QR Studio') {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<model unit="millimeter" xml:lang="es-ES" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">');
  lines.push(`<metadata name="Title">${esc(title)}</metadata>`);
  lines.push('<metadata name="Application">QR Studio</metadata>');
  lines.push('<resources>');
  lines.push('<basematerials id="1">');
  for (const p of model.parts) lines.push(`<base name="${esc(p.name)}" displaycolor="${esc(p.color.toUpperCase())}FF"/>`);
  lines.push('</basematerials>');
  model.parts.forEach((p, i) => {
    lines.push(`<object id="${i + 2}" type="model" pid="1" pindex="${i}" name="${esc(p.name)}"><mesh><vertices>`);
    const P = p.positions;
    const vs = [];
    for (let k = 0; k < P.length; k += 3) vs.push(`<vertex x="${r(P[k])}" y="${r(P[k + 1])}" z="${r(P[k + 2])}"/>`);
    lines.push(vs.join(''));
    lines.push('</vertices><triangles>');
    const I = p.indices;
    const ts = [];
    for (let k = 0; k < I.length; k += 3) ts.push(`<triangle v1="${I[k]}" v2="${I[k + 1]}" v3="${I[k + 2]}"/>`);
    lines.push(ts.join(''));
    lines.push('</triangles></mesh></object>');
  });
  lines.push('</resources><build>');
  model.parts.forEach((_, i) => lines.push(`<item objectid="${i + 2}"/>`));
  lines.push('</build></model>');
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  return makeZip(
    [
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rels },
      { name: '3D/3dmodel.model', data: lines.join('\n') },
    ],
    { compress: true },
  );
}
