// Worker: construye y valida el modelo 3D fuera del hilo principal.
import { buildModel } from '../model3d/mesh.js';
import { validateModel } from '../model3d/validate3d.js';
import { flatten } from '../model3d/mesh.js';

self.onmessage = (e) => {
  const { id, qr, params, labelMask } = e.data;
  try {
    const model = buildModel(qr, params, { labelMask });
    const report = validateModel(model, { ...params });
    const transfer = [];
    for (const p of model.parts) { p.flat = flatten(p); transfer.push(p.positions.buffer, p.indices.buffer, p.flat.positions.buffer, p.flat.normals.buffer); }
    self.postMessage({ id, ok: true, model, report }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err), kind: err && err.name });
  }
};
