// Proyectos guardados en el navegador (IndexedDB, con localStorage como respaldo). Todo es local:
// no hay servidor ni sincronización. Si la persona borra los datos del sitio, los proyectos desaparecen.
const DB = 'qrstudio';
const LS_KEY = 'qrs.projects.v1';
const DRAFT_KEY = 'qrs.draft.v1';

let dbp = null;
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('sin IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('projects', { keyPath: 'id' });
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('bloqueado'));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
const tx = (db, store, mode, fn) => new Promise((resolve, reject) => {
  const t = db.transaction(store, mode);
  const r = fn(t.objectStore(store));
  t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error);
});

// ---- respaldo en localStorage
const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const lsWrite = (list) => { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); return true; } catch { return false; } };

export const newId = () => 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function backendName() {
  try { await openDb(); return 'indexeddb'; } catch { return 'localstorage'; }
}

export async function listProjects() {
  try {
    const db = await openDb();
    const all = await tx(db, 'projects', 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return lsRead().sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
export async function getProject(id) {
  try {
    const db = await openDb();
    return await tx(db, 'projects', 'readonly', (s) => s.get(id));
  } catch {
    return lsRead().find((p) => p.id === id);
  }
}
export async function saveProject(p) {
  const rec = { ...p, updatedAt: Date.now(), createdAt: p.createdAt || Date.now() };
  try {
    const db = await openDb();
    await tx(db, 'projects', 'readwrite', (s) => s.put(rec));
  } catch {
    const list = lsRead().filter((x) => x.id !== rec.id);
    list.push(rec);
    if (!lsWrite(list)) throw new Error('No hay espacio para guardar el proyecto en este navegador.');
  }
  return rec;
}
export async function deleteProject(id) {
  try {
    const db = await openDb();
    await tx(db, 'projects', 'readwrite', (s) => s.delete(id));
  } catch {
    lsWrite(lsRead().filter((p) => p.id !== id));
  }
}

// ---- borrador automático (pequeño, sin miniatura)
export async function saveDraft(state) {
  try {
    const db = await openDb();
    await tx(db, 'kv', 'readwrite', (s) => s.put(state, 'draft'));
  } catch {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* sin espacio */ }
  }
}
export async function loadDraft() {
  try {
    const db = await openDb();
    return (await tx(db, 'kv', 'readonly', (s) => s.get('draft'))) || null;
  } catch {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
  }
}
