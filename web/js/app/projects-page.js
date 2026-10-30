import { listProjects, saveProject, deleteProject, newId, backendName } from './storage.js';
import { parseProjectFile, exportProjectJson, ProjectError, MAX_FILE_BYTES } from './project.js';
import { renderState } from './render.js';
import { h, toast } from './ui.js';
import { downloadBytes, safeName } from '../export/download.js';

const list = document.getElementById('list'), empty = document.getElementById('empty');
backendName().then((n) => { document.getElementById('backend').textContent = n; }).catch(() => {});
const FAV = 'qrs.favs';
const favs = () => { try { return new Set(JSON.parse(localStorage.getItem(FAV) || '[]')); } catch { return new Set(); } };
const setFavs = (s) => { try { localStorage.setItem(FAV, JSON.stringify([...s])); } catch { /* sin almacenamiento */ } };

async function paint() {
  const items = (await listProjects()).sort((a, b) => (favs().has(b.id) - favs().has(a.id)) || b.updatedAt - a.updatedAt);
  empty.hidden = items.length > 0;
  list.replaceChildren(...items.map((p) => {
    let svg = '';
    try { const o = renderState(p.state); if (o.ok) svg = o.svg; } catch { /* sin miniatura */ }
    const fav = favs().has(p.id);
    const act = (label, fn, cls = 'btn btn-small') => h('button', { type: 'button', class: cls, onclick: fn }, label);
    return h('li', { class: 'card' },
      h('div', { class: 'thumb', html: svg }),
      h('div', { class: 'body' }, h('h2', {}, h('a', { class: 'stretch', href: `/crear/?proyecto=${encodeURIComponent(p.id)}` }, (fav ? '★ ' : '') + p.name)), h('p', {}, 'Modificado ' + new Date(p.updatedAt).toLocaleString('es-ES'))),
      h('div', { class: 'actions', style: 'position:relative;z-index:1' },
        act(fav ? 'Quitar favorito' : 'Favorito', () => { const s = favs(); fav ? s.delete(p.id) : s.add(p.id); setFavs(s); paint(); }),
        act('Renombrar', async () => { const n = prompt('Nuevo nombre', p.name); if (n && n.trim()) { await saveProject({ ...p, name: n.trim().slice(0, 80), state: { ...p.state, name: n.trim().slice(0, 80) } }); paint(); } }),
        act('Duplicar', async () => { await saveProject({ ...p, id: newId(), name: p.name + ' (copia)', createdAt: Date.now(), state: { ...p.state, name: p.name + ' (copia)' } }); paint(); }),
        act('Exportar', () => downloadBytes(new TextEncoder().encode(exportProjectJson(p.state)), safeName(p.name, 'proyecto') + '.qrstudio.json', 'application/json')),
        act('Eliminar', async () => { if (confirm(`¿Eliminar «${p.name}»? No se puede deshacer.`)) { await deleteProject(p.id); paint(); } })));
  }));
}
document.getElementById('import').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > MAX_FILE_BYTES) return toast('El archivo es demasiado grande.', { kind: 'bad' });
  try {
    const st = parseProjectFile(await f.text());
    await saveProject({ id: newId(), name: st.name, state: st });
    toast('Proyecto importado.', { kind: 'ok' });
    paint();
  } catch (err) { toast(err instanceof ProjectError ? err.message : 'No se pudo importar el archivo.', { kind: 'bad' }); }
});
paint();
