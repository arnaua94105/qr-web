// Portada: un QR real y un modelo 3D real dentro del titular.
import { newState } from './project.js';
import { renderState } from './render.js';
import { buildModel, flatten } from '../model3d/mesh.js';
import { sanitize3D } from '../model3d/params.js';
import { createViewer, webglSupported } from '../viewer/gl.js';

const st = newState('url', { values: { url: 'https://example.com' }, design: { modules: { shape: 'rounded' }, background: { color: '#a1ffcb' } } });
const out = renderState(st);
const q = document.getElementById('hero-qr');
if (out.ok && q) q.innerHTML = out.svg;
const t = document.getElementById('hero-3d');
if (out.ok && t && webglSupported()) {
  try {
    const params = sanitize3D({ qrMm: 40, margin: 4, base: 2, relief: 1.2, baseColor: '#ffffff', inkColor: '#a1ffcb' });
    const m = buildModel(out.qr, params);
    for (const p of m.parts) p.flat = flatten(p);
    const c = document.createElement('canvas');
    t.append(c);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const v = createViewer(c, { autoRotate: !reduce });
    v.setGrid(false);
    v.setModel(m);
    v.state.dist *= 0.85;
    addEventListener('pagehide', () => v.dispose());
  } catch { t.classList.remove('dark'); t.textContent = ''; }
}
