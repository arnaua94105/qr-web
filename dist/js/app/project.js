// Modelo de proyecto, saneado e importación/exportación de archivos. Módulo puro.
import { DEFAULT_DESIGN, sanitizeDesign, newDesign } from '../qr/design.js';
import { CONTENT_TYPE_BY_ID, defaultValues, CONTENT_TYPES } from '../qr/payloads.js';
import { DEFAULT_3D, sanitize3D } from '../model3d/params.js';

export const FORMAT = 'qr-studio-project';
export const VERSION = 1;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FIELD = 4000;
const DATA_IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_DATA_URI = 1.8 * 1024 * 1024;

export class ProjectError extends Error {}

export function newState(typeId = 'url', patch = {}) {
  const type = CONTENT_TYPE_BY_ID[typeId] ? typeId : 'url';
  const values = defaultValues(type);
  return {
    v: VERSION,
    name: 'Mi código QR',
    content: { type, values: { ...values, ...(patch.values || {}) } },
    design: sanitizeDesign(newDesign(patch.design || {})),
    model3d: sanitize3D(patch.model3d || DEFAULT_3D),
    template: patch.template || null,
  };
}

function cleanImage(img) {
  if (!img || typeof img !== 'object') return null;
  if (typeof img.src !== 'string' || !DATA_IMG.test(img.src) || img.src.length > MAX_DATA_URI) return null;
  const w = Number(img.w), h = Number(img.h);
  if (!(w > 0 && h > 0 && w <= 4096 && h <= 4096)) return null;
  return { src: img.src, w: Math.round(w), h: Math.round(h) };
}

/** Normaliza cualquier estado (de archivo, de plantilla o de almacenamiento) a uno válido. Nunca ejecuta nada. */
export function sanitizeState(input) {
  if (!input || typeof input !== 'object') throw new ProjectError('El proyecto no tiene contenido.');
  const type = input.content && CONTENT_TYPE_BY_ID[input.content.type] ? input.content.type : null;
  if (!type) throw new ProjectError('Tipo de contenido desconocido.');
  const defs = CONTENT_TYPE_BY_ID[type].fields;
  const values = defaultValues(type);
  const src = (input.content && input.content.values) || {};
  for (const f of defs) {
    const v = src[f.id];
    if (f.type === 'checkbox') values[f.id] = !!v;
    else if (typeof v === 'string') values[f.id] = v.slice(0, MAX_FIELD);
    else if (typeof v === 'number' && Number.isFinite(v)) values[f.id] = String(v);
  }
  const design = sanitizeDesign(input.design || {});
  design.logo.image = cleanImage(design.logo.image);
  design.background.image = cleanImage(design.background.image);
  if (design.logo.kind === 'image' && !design.logo.image) design.logo.kind = 'none';
  return {
    v: VERSION,
    name: String(input.name ?? 'Mi código QR').replace(/[\u0000-\u001f]/g, '').slice(0, 80) || 'Mi código QR',
    content: { type, values },
    design,
    model3d: sanitize3D(input.model3d || {}),
    template: typeof input.template === 'string' ? input.template.slice(0, 40) : null,
  };
}

export function exportProjectJson(state) {
  const rest = state;
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), project: rest }, null, 1);
}

export function parseProjectFile(text) {
  if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) throw new ProjectError('El archivo es demasiado grande (máximo 4 MB).');
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new ProjectError('El archivo no es un proyecto válido (JSON mal formado).');
  }
  if (!obj || obj.format !== FORMAT) throw new ProjectError('Este archivo no es un proyecto de QR Studio.');
  if (typeof obj.version !== 'number' || obj.version > VERSION) throw new ProjectError('El proyecto es de una versión más reciente de QR Studio.');
  return sanitizeState(obj.project);
}

export const TYPE_LIST = CONTENT_TYPES.map((t) => ({ id: t.id, label: t.label, long: t.long }));
export { DEFAULT_DESIGN };
