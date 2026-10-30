// Genera archivos de exportación reales en un directorio para verificarlos con herramientas externas.
import fs from 'node:fs';
import path from 'node:path';
import { encodeText } from '../../src/web/js/qr/encoder.js';
import { newDesign, sanitizeDesign } from '../../src/web/js/qr/design.js';
import { buildScene } from '../../src/web/js/qr/scene.js';
import { sceneToSvg } from '../../src/web/js/qr/svg.js';
import { buildModel } from '../../src/web/js/model3d/mesh.js';
import { DEFAULT_3D, PRESETS_3D } from '../../src/web/js/model3d/params.js';
import { partsToStl } from '../../src/web/js/export/stl.js';
import { partsToObj } from '../../src/web/js/export/obj.js';
import { modelToGlb } from '../../src/web/js/export/glb.js';
import { modelTo3mf } from '../../src/web/js/export/threemf.js';
import { rasterizeScene, toPgm } from '../../src/web/js/qr/softraster.js';
import { sceneToPdf } from '../../src/web/js/export/pdf.js';

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const manifest = { three: [], pdf: [], svg: [] };

const text = 'https://example.com/qr-studio?utm=prueba';
const qr = encodeText(text, { ecl: 'Q' });
for (const preset of PRESETS_3D) {
  for (const parts of ['single', 'separate']) {
    const p = { ...DEFAULT_3D, ...preset.patch, parts: preset.id === 'tag' ? 'single' : parts };
    const model = buildModel(qr, p, preset.id === 'tag' ? { labelMask: { cols: 30, rows: 6, data: Uint8Array.from({ length: 180 }, (_, i) => ((i % 30) % 3 === 0 ? 1 : 0)) } } : {});
    const id = `${preset.id}-${p.parts}`;
    model.parts.forEach((part) => fs.writeFileSync(path.join(out, `${id}-${part.id}.stl`), partsToStl(part)));
    fs.writeFileSync(path.join(out, `${id}.obj`), partsToObj(model.parts));
    fs.writeFileSync(path.join(out, `${id}.glb`), modelToGlb(model, id));
    fs.writeFileSync(path.join(out, `${id}.3mf`), await modelTo3mf(model, id));
    manifest.three.push({ id, parts: model.parts.map((x) => ({ id: x.id, tris: x.triangles, volume: x.volume, bbox: x.bbox })), dims: model.dims });
  }
}

const designs = {
  plain: {},
  rounded: { modules: { shape: 'rounded', color: '#1b1d20' }, finder: { outer: 'rounded', inner: 'circle' } },
  frame: { frame: { style: 'banner', top: 'ESCANÉAME', bottom: 'Café Luna — 2026', color: '#222222' } },
  card: { frame: { style: 'card', top: 'Menú', bottom: 'Carta digital', color: '#232323' }, background: { color: '#f3f3f3' } },
  icon: { qr: { ecl: 'H' }, logo: { kind: 'icon', icon: 'heart', size: 0.18 } },
};
for (const [name, patch] of Object.entries(designs)) {
  const d = sanitizeDesign(newDesign(patch));
  const q = encodeText(text, { ecl: d.qr.ecl });
  const scene = buildScene(d, q);
  fs.writeFileSync(path.join(out, `${name}.svg`), sceneToSvg(scene, { widthPx: 800 }));
  const pdf = await sceneToPdf(scene, { widthMm: 60, title: name });
  fs.writeFileSync(path.join(out, `${name}.pdf`), pdf);
  fs.writeFileSync(path.join(out, `${name}.pgm`), toPgm(rasterizeScene(scene, 12)));
  manifest.pdf.push({ name, text, readerLimited: name === 'rounded' });
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('generados', fs.readdirSync(out).length, 'archivos en', out);
