// Integración de Google AdSense para una web de varias páginas con módulos.
// - Nunca inventa identificadores: sin un ca-pub real (site.config.json) no carga nada y los huecos quedan ocultos.
// - Los huecos se rotulan «Publicidad» y viven solo en contenido informativo, nunca junto a controles del editor.
// - Una sola inicialización por hueco (WeakSet) y una sola carga del script.
import config from './site-config.js';

const SCRIPT_ID = 'qrs-adsense';
const pushed = new WeakSet();
let loading = null;

export function adsAvailable() {
  return !!(config.adsense && config.adsense.enabled && config.adsense.configured);
}

function loadScript() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) return resolve();
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.adsense.publisherId)}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('adsbygoogle bloqueado o no disponible'));
    document.head.appendChild(s);
  });
  return loading;
}

function fillSlot(el, nonPersonalized) {
  if (pushed.has(el)) return;
  const slotKey = el.dataset.slot;
  const slotId = config.adsense.slots && config.adsense.slots[slotKey];
  if (!slotId || /^0+\d$/.test(slotId)) {
    el.dataset.state = 'off'; // identificador de bloque aún sin configurar
    return;
  }
  pushed.add(el);
  const label = document.createElement('span');
  label.className = 'ad-label';
  label.textContent = 'Publicidad';
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.dataset.adClient = config.adsense.publisherId;
  ins.dataset.adSlot = slotId;
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';
  el.replaceChildren(label, ins);
  el.dataset.state = 'live';
  const mo = new MutationObserver(() => {
    if (ins.dataset.adStatus === 'unfilled') {
      el.dataset.state = 'off';
      mo.disconnect();
    }
  });
  mo.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
  try {
    window.adsbygoogle = window.adsbygoogle || [];
    if (nonPersonalized) window.adsbygoogle.requestNonPersonalizedAds = 1;
    window.adsbygoogle.push({});
  } catch (e) {
    el.dataset.state = 'off';
  }
}

/** Activa los huecos de la página. `nonPersonalized`: true cuando el consentimiento no es de un CMP certificado. */
export async function startAds({ nonPersonalized }) {
  if (!adsAvailable()) return false;
  const slots = [...document.querySelectorAll('.ad-slot[data-slot]')];
  if (!slots.length && !config.adsense.autoAds) return false;
  try {
    await loadScript();
  } catch {
    slots.forEach((s) => (s.dataset.state = 'off'));
    return false;
  }
  slots.forEach((el) => fillSlot(el, nonPersonalized));
  return true;
}
