// Estado de la aplicación con deshacer/rehacer. Módulo puro (sin DOM).
// Los cambios continuos (arrastrar un control deslizante, teclear) se agrupan con `key` para que un solo «deshacer» los revierta.

export function getPath(obj, path) {
  let cur = obj;
  for (const k of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export function createStore(initial, { limit = 100, coalesceMs = 800, now = () => Date.now() } = {}) {
  let state = clone(initial);
  const past = [], future = [];
  const subs = new Set();
  let lastKey = null, lastAt = 0;
  const notify = (meta) => subs.forEach((fn) => fn(state, meta));
  return {
    get: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /** `mutate(draft)` modifica una copia del estado. */
    update(mutate, { key = null, history = true } = {}) {
      const draft = clone(state);
      mutate(draft);
      if (JSON.stringify(draft) === JSON.stringify(state)) return false;
      if (history) {
        const t = now();
        const coalesce = key && key === lastKey && t - lastAt < coalesceMs && past.length;
        if (!coalesce) {
          past.push(state);
          if (past.length > limit) past.shift();
        }
        lastKey = key;
        lastAt = t;
        future.length = 0;
      }
      state = draft;
      notify({ type: 'update', key });
      return true;
    },
    set(path, value, opts) {
      return this.update((d) => setPath(d, path, value), { key: opts?.key ?? path, history: opts?.history });
    },
    /** Sustituye todo el estado (cargar proyecto, plantilla…). */
    replace(next, { history = true } = {}) {
      if (history) {
        past.push(state);
        if (past.length > limit) past.shift();
        future.length = 0;
      } else {
        past.length = 0;
        future.length = 0;
      }
      state = clone(next);
      lastKey = null;
      notify({ type: 'replace' });
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undo() {
      if (!past.length) return false;
      future.push(state);
      state = past.pop();
      lastKey = null;
      notify({ type: 'undo' });
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(state);
      state = future.pop();
      lastKey = null;
      notify({ type: 'redo' });
      return true;
    },
    historySize: () => ({ past: past.length, future: future.length }),
  };
}
