import { TEMPLATES, TEMPLATE_CATEGORIES } from './templates.js';
import { newState } from './project.js';
import { renderState } from './render.js';
import { mergeDesign, DEFAULT_DESIGN, sanitizeDesign } from '../qr/design.js';
import { h } from './ui.js';

const grid = document.getElementById('grid'), filters = document.getElementById('filters');
let cat = 'todas';
function thumb(t) {
  const st = newState(t.sample.type, { values: t.sample.values });
  st.design = sanitizeDesign(mergeDesign(DEFAULT_DESIGN, t.design));
  const out = renderState(st);
  return out.ok ? out.svg : '';
}
function paint() {
  grid.replaceChildren(...TEMPLATES.filter((t) => cat === 'todas' || t.category === cat).map((t) => h('li', { class: 'card' },
    h('div', { class: 'thumb', html: thumb(t) }),
    h('div', { class: 'body' }, h('h2', {}, h('a', { class: 'stretch', href: `/crear/?plantilla=${encodeURIComponent(t.id)}` }, t.name)), h('p', {}, t.blurb)))));
}
TEMPLATE_CATEGORIES.forEach(([id, label]) => {
  const b = h('button', { type: 'button', 'aria-pressed': String(id === cat) }, label);
  b.addEventListener('click', () => { cat = id; filters.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paint(); });
  filters.append(b);
});
paint();
