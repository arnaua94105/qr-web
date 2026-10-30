// Controles de formulario enlazados al estado (store). Cada control refleja SIEMPRE el estado real:
// al deshacer, aplicar una plantilla o importar un proyecto, todos se vuelven a sincronizar.
import { getPath } from './store.js';

export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

export const icon = (id, cls = 'icon') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#' + id);
  s.append(u);
  return s;
};

let uid = 0;
export const nextId = (p = 'f') => `${p}${++uid}`;

export class Binder {
  constructor(store) {
    this.store = store;
    this.items = [];
    this.unsub = store.subscribe(() => this.refresh());
  }
  dispose() {
    this.unsub();
    this.items = [];
  }
  refresh() {
    const st = this.store.get();
    for (const it of this.items) it.refresh(st);
  }
  add(wrapper, refresh, when) {
    this.items.push({
      refresh: (st) => {
        if (when) wrapper.hidden = !when(st);
        if (!when || !wrapper.hidden) refresh(st);
      },
    });
    this.items[this.items.length - 1].refresh(this.store.get());
    return wrapper;
  }

  field(label, control, { hint, id, when, className } = {}) {
    const wrap = h('div', { class: 'field' + (className ? ' ' + className : '') },
      label ? h('label', { for: id, class: 'field-label' }, label) : null, control, hint ? h('p', { class: 'field-hint' }, hint) : null);
    return this.add(wrap, () => {}, when);
  }

  range({ path, label, min, max, step = 1, format = (v) => String(v), scale = 1, when, hint, history = true }) {
    const id = nextId('r');
    const input = h('input', { type: 'range', id, min, max, step });
    const out = h('output', { for: id, class: 'range-out' });
    const wrap = h('div', { class: 'field' },
      h('div', { class: 'field-row' }, h('label', { for: id, class: 'field-label' }, label), out), input, hint ? h('p', { class: 'field-hint' }, hint) : null);
    const paint = () => {
      const pct = ((input.value - min) / (max - min)) * 100;
      input.style.setProperty('--fill', pct + '%');
    };
    input.addEventListener('input', () => {
      this.store.set(path, Number(input.value) * scale, { key: path, history });
    });
    return this.add(wrap, (st) => {
      const v = getPath(st, path);
      const shown = (Number(v) / scale);
      if (document.activeElement !== input || Number(input.value) !== shown) input.value = shown;
      out.textContent = format(Number(v));
      paint();
    }, when);
  }

  select({ path, label, options, when, hint }) {
    const id = nextId('s');
    const sel = h('select', { id }, options.map(([v, t]) => h('option', { value: v }, t)));
    sel.addEventListener('change', () => this.store.set(path, sel.value));
    const wrap = h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, label), h('div', { class: 'select-wrap' }, sel, icon('i-chevron', 'icon select-chev')), hint ? h('p', { class: 'field-hint' }, hint) : null);
    return this.add(wrap, (st) => { sel.value = String(getPath(st, path) ?? ''); }, when);
  }

  segmented({ path, label, options, when, hint, cols }) {
    const id = nextId('g');
    const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': id, style: cols ? `grid-template-columns:repeat(${cols},1fr)` : null });
    const btns = options.map(([v, t, svg]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-v': v, title: t, 'aria-label': svg ? t : null }, svg ? h('span', { class: 'seg-ico', html: svg }) : null, h('span', { class: svg ? 'seg-t' : null }, t));
      b.addEventListener('click', () => this.store.set(path, v));
      return b;
    });
    group.append(...btns);
    group.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const i = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const n = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
      btns[n].click();
      btns[n].focus();
    });
    const wrap = h('div', { class: 'field' }, h('span', { class: 'field-label', id }, label), group, hint ? h('p', { class: 'field-hint' }, hint) : null);
    return this.add(wrap, (st) => {
      const cur = String(getPath(st, path));
      btns.forEach((b) => {
        const on = b.dataset.v === cur;
        b.setAttribute('aria-checked', on);
        b.tabIndex = on ? 0 : -1;
      });
      if (!btns.some((b) => b.tabIndex === 0)) btns[0].tabIndex = 0;
    }, when);
  }

  toggle({ path, label, hint, when, invert = false }) {
    const id = nextId('t');
    const input = h('input', { type: 'checkbox', id, role: 'switch' });
    input.addEventListener('change', () => this.store.set(path, invert ? !input.checked : input.checked));
    const wrap = h('div', { class: 'field field-toggle' }, h('label', { for: id, class: 'toggle' }, input, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }), h('span', { class: 'toggle-text' }, label)), hint ? h('p', { class: 'field-hint' }, hint) : null);
    return this.add(wrap, (st) => { const v = !!getPath(st, path); input.checked = invert ? !v : v; }, when);
  }

  /** Color #rrggbb. Con `nullable`, null significa «igual que» otro color y se muestra con una casilla. */
  color({ path, label, nullable, nullLabel = 'Igual que los módulos', fallbackPath, when, hint }) {
    const id = nextId('c');
    const picker = h('input', { type: 'color', id, class: 'color-pick', 'aria-label': label });
    const hex = h('input', { type: 'text', class: 'color-hex', 'aria-label': label + ' (código hexadecimal)', maxlength: 7, spellcheck: 'false', autocomplete: 'off' });
    const same = nullable ? h('label', { class: 'check' }, h('input', { type: 'checkbox' }), h('span', {}, nullLabel)) : null;
    const set = (v) => this.store.set(path, v, { key: path });
    picker.addEventListener('input', () => { set(picker.value); });
    hex.addEventListener('input', () => {
      const v = hex.value.trim().startsWith('#') ? hex.value.trim() : '#' + hex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) set(v.toLowerCase());
    });
    hex.addEventListener('blur', () => this.refresh());
    if (same) same.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) this.store.set(path, null);
      else this.store.set(path, getPath(this.store.get(), fallbackPath) || '#000000');
    });
    const wrap = h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, label), h('div', { class: 'color-row' }, picker, hex), same, hint ? h('p', { class: 'field-hint' }, hint) : null);
    return this.add(wrap, (st) => {
      const v = getPath(st, path);
      const eff = v || getPath(st, fallbackPath) || '#000000';
      if (same) same.querySelector('input').checked = !v;
      picker.disabled = hex.disabled = !!(nullable && !v);
      wrap.classList.toggle('is-linked', !!(nullable && !v));
      picker.value = eff;
      if (document.activeElement !== hex) hex.value = eff;
    }, when);
  }

  text({ path, label, type = 'text', placeholder, maxlength, autocomplete, rows, when, hint, error, inputmode, requiredMark }) {
    const id = nextId('i');
    const tag = rows ? 'textarea' : 'input';
    const input = h(tag, { id, type: rows ? null : type, placeholder, maxlength, autocomplete: autocomplete || 'off', rows, inputmode, spellcheck: type === 'password' ? 'false' : null, autocapitalize: 'off' });
    const err = h('p', { class: 'field-error', id: id + '-e', role: 'alert' });
    let touched = false;
    input.addEventListener('input', () => { touched = true; this.store.set(path, input.value, { key: path }); });
    input.addEventListener('blur', () => { touched = true; this.refresh(); });
    const wrap = h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, label, requiredMark ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null), input, hint ? h('p', { class: 'field-hint' }, hint) : null, err);
    return this.add(wrap, (st) => {
      const v = getPath(st, path);
      const s = v == null ? '' : String(v);
      if (input.value !== s) input.value = s;
      const msg = error ? error(st) : '';
      const show = touched && !!msg;
      err.textContent = show ? msg : '';
      input.setAttribute('aria-invalid', show ? 'true' : 'false');
      if (show) input.setAttribute('aria-describedby', err.id); else input.removeAttribute('aria-describedby');
      wrap.classList.toggle('has-error', show);
    }, when);
  }
}

/** Mensajes breves (no modales). */
let toastTimer = 0;
export function toast(msg, { kind = 'info', ms = 3800 } = {}) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = h('div', { id: 'toast-host', class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  host.replaceChildren(h('div', { class: 'toast toast-' + kind }, msg));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.replaceChildren(), ms);
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}
