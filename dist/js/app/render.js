// Estado → QR → escena → SVG, con caché de la última generación. Módulo puro (sin DOM).
import { buildPayload } from '../qr/payloads.js';
import { encodeText } from '../qr/encoder.js';
import { buildScene } from '../qr/scene.js';
import { sceneToSvg } from '../qr/svg.js';
import { analyze } from '../qr/scan.js';
import { sanitizeDesign } from '../qr/design.js';

let lastKey = null, lastOut = null;

/** @returns {{ok:boolean, errors:object, notes:string[], text?:string, qr?:object, scene?:object, svg?:string, design:object, analysis?:object, fatal?:string}} */
export function renderState(state, { printMm } = {}) {
  const design = sanitizeDesign(state.design);
  const key = JSON.stringify([state.content, design, printMm || 0]);
  if (key === lastKey) return lastOut;
  const payload = buildPayload(state.content);
  let out;
  if (payload.text == null) {
    out = { ok: false, errors: payload.errors || {}, notes: payload.notes || [], design };
  } else {
    try {
      const qr = encodeText(payload.text, { ecl: design.qr.ecl, minVersion: design.qr.minVersion, mask: design.qr.mask });
      const scene = buildScene(design, qr);
      const svg = sceneToSvg(scene, { title: 'Código QR', desc: 'Código QR generado con QR Studio' });
      const analysis = analyze(design, qr, scene, { printMm });
      out = { ok: true, errors: {}, notes: payload.notes || [], text: payload.text, qr, scene, svg, design, analysis };
    } catch (e) {
      out = {
        ok: false,
        errors: {},
        notes: payload.notes || [],
        design,
        fatal: e && e.code === 'DATA_TOO_LONG' ? 'El contenido es demasiado largo para un QR con esta corrección de errores. Acórtalo o baja la corrección a L o M.' : 'No se pudo generar el código con estos ajustes.',
      };
    }
  }
  lastKey = key;
  lastOut = out;
  return out;
}
