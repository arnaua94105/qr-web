// Consentimiento para tecnologías no esenciales (publicidad). Dos proveedores (site.config.json → consent.provider):
//  · "builtin": aviso propio. NO es un CMP certificado por Google: solo se cargan anuncios NO personalizados y solo tras
//    aceptar. Para publicidad personalizada en el EEE/Reino Unido/Suiza Google exige un CMP certificado.
//  · "google": se delega en el mensaje «Privacy & messaging» (CMP de Google) configurado en la cuenta de AdSense.
// Lo único que guarda la web sin consentimiento es lo que el usuario pide (proyectos en IndexedDB/localStorage).
import config from './site-config.js';
import { adsAvailable, startAds } from './ads.js';

const KEY = (config.consent && config.consent.storageKey) || 'qrs.consent.v1';
const provider = (config.consent && config.consent.provider) || 'builtin';

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && v.v === 1 ? v : null;
  } catch { return null; }
}
function write(ads) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ads: !!ads, ts: Date.now() })); } catch { /* sin almacenamiento */ }
}

let banner = null;
let dialog = null;

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
}

function apply(choice) {
  banner?.remove();
  banner = null;
  if (choice && adsAvailable()) startAds({ nonPersonalized: provider === 'builtin' });
}

function showBanner() {
  if (banner || dialog?.open) return;
  banner = el('section', { class: 'consent', role: 'region', 'aria-label': 'Aviso de cookies y publicidad' },
    el('h2', {}, 'Publicidad y cookies'),
    el('p', {}, 'Esta herramienta es gratuita y se financia con anuncios. Solo mostraremos anuncios (no personalizados) si lo aceptas; crear y descargar tus QR funciona igual en ambos casos. ',
      el('a', { href: '/legal/cookies/' }, 'Más información')),
    el('div', { class: 'consent-actions' },
      el('button', { class: 'btn btn-accent', type: 'button', onclick: () => { write(true); apply(true); } }, 'Aceptar publicidad'),
      el('button', { class: 'btn', type: 'button', onclick: () => { write(false); apply(false); } }, 'Rechazar'),
      el('button', { class: 'btn', type: 'button', onclick: () => openPreferences() }, 'Configurar')));
  document.body.append(banner);
}

export function openPreferences() {
  if (provider === 'google' && window.googlefc && window.googlefc.showRevocationMessage) {
    window.googlefc.showRevocationMessage();
    return;
  }
  const cur = read();
  dialog?.remove();
  const adsOn = adsAvailable();
  const sw = el('input', { type: 'checkbox', id: 'consent-ads', style: 'width:22px;height:22px;accent-color:#232323' });
  sw.checked = !!(cur && cur.ads);
  if (!adsOn) sw.disabled = true;
  dialog = el('dialog', { class: 'consent-dialog', 'aria-labelledby': 'consent-title' },
    el('h2', { id: 'consent-title' }, 'Preferencias de cookies'),
    el('div', { class: 'consent-row' }, el('div', {}, el('strong', {}, 'Esenciales'), el('p', {}, 'Guardan en tu navegador los proyectos y ajustes que tú creas (IndexedDB y localStorage). No se envían a ningún servidor. Siempre activas.')),
      el('input', { type: 'checkbox', checked: '', disabled: '', 'aria-label': 'Esenciales, siempre activas', style: 'width:22px;height:22px' })),
    el('div', { class: 'consent-row' }, el('div', {}, el('label', { for: 'consent-ads' }, el('strong', {}, 'Publicidad')),
      el('p', {}, adsOn ? 'Permite cargar anuncios de Google AdSense (no personalizados). Pueden usar cookies propias de Google.' : 'Ahora mismo este sitio no muestra publicidad, así que no hay nada que activar.')), sw),
    el('div', { class: 'consent-actions', style: 'margin-top:18px;display:flex;gap:10px;justify-content:flex-end' },
      el('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Cerrar'),
      el('button', { class: 'btn btn-ink', type: 'button', onclick: () => { write(sw.checked); apply(sw.checked); dialog.close(); if (!sw.checked && cur?.ads) location.reload(); } }, 'Guardar')));
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  banner?.remove(); banner = null;
  dialog.showModal();
}

export function initConsent() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-consent-open]')) { e.preventDefault(); openPreferences(); }
  });
  window.QRS = Object.assign(window.QRS || {}, { openConsent: openPreferences });
  if (!adsAvailable()) return;
  if (provider === 'google') { startAds({ nonPersonalized: false }); return; }
  const cur = read();
  if (!cur) showBanner();
  else apply(cur.ads);
}
