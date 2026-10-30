// Tipos de contenido del QR: definición de campos, validación y construcción del texto a codificar.
// Módulo puro (sin DOM). Cada tipo expone build(valores) -> { text, errors, notes }.
// errors es { [campo]: mensaje }. Si hay errores, text es null.

// ------------------------------------------------------------------ utilidades

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

/** Escapa para WIFI: (\ ; , : ") según el formato de ZXing. */
export function escapeWifi(s) {
  return s.replace(/([\\;,:"])/g, '\\$1');
}

/** Escapa un valor de texto de vCard/iCalendar (RFC 6350 / RFC 5545). */
export function escapeVText(s) {
  return s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?(?:[/?#].*)?$/i;
const HOST_PORT_RE = /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})?(?:[/?#].*)?$/i;

/**
 * Normaliza y valida una URL. Devuelve { url, error, note }.
 * Si falta el esquema y parece un dominio, se antepone https:// y se avisa en note.
 */
export function normalizeUrl(input) {
  const raw = trim(input);
  if (!raw) return { error: 'Escribe una dirección web.' };
  if (/\s/.test(raw)) return { error: 'La dirección no puede contener espacios.' };
  let candidate = raw;
  let note;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    if (DOMAIN_RE.test(raw) || HOST_PORT_RE.test(raw)) {
      candidate = 'https://' + raw;
      note = 'Se ha añadido https:// al principio.';
    } else {
      return { error: 'No parece una dirección web válida. Ejemplo: https://tuweb.com' };
    }
  }
  let u;
  try {
    u = new URL(candidate);
  } catch {
    return { error: 'No parece una dirección web válida. Ejemplo: https://tuweb.com' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { error: 'Solo se admiten enlaces http:// o https://.' };
  }
  if (!u.hostname) return { error: 'Falta el nombre del sitio.' };
  return { url: candidate, note };
}

/** Comprueba un IBAN con el algoritmo mod-97 (ISO 13616). */
export function isValidIban(iban) {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const digits = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "2026-10-27T18:30" -> { date: '20261027', time: '183000' } o null. */
export function parseLocalDateTime(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(trim(s));
  if (!m) return null;
  const [_, y, mo, d, h = '00', mi = '00', se = '00'] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(mo) - 1 || dt.getDate() !== Number(d)) return null;
  return { date: `${y}${mo}${d}`, time: `${pad2(h)}${pad2(mi)}${pad2(se)}`, hasTime: m[4] !== undefined, ms: dt.getTime() };
}

const PHONE_RE = /^\+?[0-9][0-9 ()./-]{4,}$/;
function normalizePhone(s) {
  return trim(s).replace(/[ ()./-]/g, '');
}
function checkPhone(raw, errors, field, required = true) {
  const v = trim(raw);
  if (!v) {
    if (required) errors[field] = 'Escribe un número de teléfono.';
    return '';
  }
  if (!PHONE_RE.test(v)) {
    errors[field] = 'Usa solo cifras, espacios y un + inicial. Ejemplo: +34 600 123 456';
    return '';
  }
  const digits = normalizePhone(v);
  if (digits.replace('+', '').length < 5 || digits.replace('+', '').length > 15) {
    errors[field] = 'El número debe tener entre 5 y 15 cifras.';
    return '';
  }
  return digits;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

// ------------------------------------------------------------------ redes sociales

export const SOCIAL_NETWORKS = [
  { id: 'instagram', label: 'Instagram', prefix: 'https://instagram.com/', hint: 'tu_usuario', re: /^[A-Za-z0-9._]{1,30}$/ },
  { id: 'tiktok', label: 'TikTok', prefix: 'https://www.tiktok.com/@', hint: 'tu_usuario', re: /^[A-Za-z0-9._]{2,24}$/ },
  { id: 'x', label: 'X (Twitter)', prefix: 'https://x.com/', hint: 'tu_usuario', re: /^[A-Za-z0-9_]{1,15}$/ },
  { id: 'facebook', label: 'Facebook', prefix: 'https://facebook.com/', hint: 'tu.pagina', re: /^[A-Za-z0-9.]{5,50}$/ },
  { id: 'linkedin', label: 'LinkedIn', prefix: 'https://www.linkedin.com/in/', hint: 'tu-nombre', re: /^[A-Za-z0-9%-]{3,100}$/ },
  { id: 'youtube', label: 'YouTube', prefix: 'https://www.youtube.com/@', hint: 'tu_canal', re: /^[A-Za-z0-9._-]{3,30}$/ },
  { id: 'whatsapp', label: 'WhatsApp (chat)', prefix: 'https://wa.me/', hint: '34600123456', phone: true },
  { id: 'telegram', label: 'Telegram', prefix: 'https://t.me/', hint: 'tu_usuario', re: /^[A-Za-z0-9_]{5,32}$/ },
  { id: 'github', label: 'GitHub', prefix: 'https://github.com/', hint: 'tu-usuario', re: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/ },
  { id: 'twitch', label: 'Twitch', prefix: 'https://twitch.tv/', hint: 'tu_canal', re: /^[A-Za-z0-9_]{4,25}$/ },
  { id: 'threads', label: 'Threads', prefix: 'https://www.threads.net/@', hint: 'tu_usuario', re: /^[A-Za-z0-9._]{1,30}$/ },
  { id: 'bluesky', label: 'Bluesky', prefix: 'https://bsky.app/profile/', hint: 'usuario.bsky.social', re: /^[A-Za-z0-9.-]{3,253}$/ },
];

// ------------------------------------------------------------------ tipos

/**
 * Cada campo: { id, label, type: 'text'|'url'|'tel'|'email'|'textarea'|'select'|'checkbox'|'datetime'|'number'|'password',
 *   placeholder, options?, required?, hint?, showIf? (valores) => boolean, default? }
 */
export const CONTENT_TYPES = [
  {
    id: 'url',
    label: 'Enlace',
    long: 'Enlace a una página web',
    fields: [{ id: 'url', label: 'Dirección web', type: 'url', placeholder: 'https://tuweb.com', required: true, autocomplete: 'url' }],
    build(v) {
      const errors = {};
      const r = normalizeUrl(v.url);
      if (r.error) errors.url = r.error;
      return { text: errors.url ? null : r.url, errors, notes: r.note ? [r.note] : [] };
    },
    sample: { url: 'https://example.com/qr-studio' },
  },
  {
    id: 'text',
    label: 'Texto',
    long: 'Texto libre',
    fields: [{ id: 'text', label: 'Texto', type: 'textarea', placeholder: 'Escribe cualquier texto', required: true, rows: 4 }],
    build(v) {
      const errors = {};
      const t = typeof v.text === 'string' ? v.text : '';
      if (!t.trim()) errors.text = 'Escribe algún texto.';
      return { text: errors.text ? null : t, errors, notes: [] };
    },
    sample: { text: 'Hola desde QR Studio' },
  },
  {
    id: 'wifi',
    label: 'Wi-Fi',
    long: 'Conexión a una red Wi-Fi',
    fields: [
      { id: 'ssid', label: 'Nombre de la red (SSID)', type: 'text', required: true, placeholder: 'MiWiFi' },
      {
        id: 'security', label: 'Seguridad', type: 'select', default: 'WPA',
        options: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP (obsoleta)'], ['nopass', 'Sin contraseña']],
      },
      { id: 'password', label: 'Contraseña', type: 'password', showIf: (v) => v.security !== 'nopass', autocomplete: 'off' },
      { id: 'hidden', label: 'Red oculta', type: 'checkbox' },
    ],
    build(v) {
      const errors = {};
      const notes = [];
      const ssid = typeof v.ssid === 'string' ? v.ssid : '';
      const security = v.security || 'WPA';
      if (!ssid) errors.ssid = 'Escribe el nombre de la red.';
      else if (new TextEncoder().encode(ssid).length > 32) errors.ssid = 'El nombre de una red Wi-Fi no puede superar 32 bytes.';
      const pw = typeof v.password === 'string' ? v.password : '';
      if (security !== 'nopass') {
        if (!pw) errors.password = 'Escribe la contraseña o elige «Sin contraseña».';
        else if (security === 'WPA' && (pw.length < 8 || pw.length > 63)) errors.password = 'Una contraseña WPA debe tener entre 8 y 63 caracteres.';
      }
      if (security === 'WEP') notes.push('WEP es un cifrado inseguro y obsoleto: úsalo solo si no tienes otra opción.');
      if (Object.keys(errors).length) return { text: null, errors, notes };
      let s = `WIFI:T:${security === 'nopass' ? 'nopass' : security};S:${escapeWifi(ssid)};`;
      if (security !== 'nopass') s += `P:${escapeWifi(pw)};`;
      if (v.hidden) s += 'H:true;';
      s += ';';
      notes.push('Quien escanee este QR podrá leer la contraseña en texto: no lo publiques si la red es privada.');
      return { text: s, errors, notes };
    },
    sample: { ssid: 'CafeLuna', security: 'WPA', password: 'luna-2026-cafe' },
  },
  {
    id: 'vcard',
    label: 'Contacto',
    long: 'Tarjeta de contacto (vCard)',
    fields: [
      { id: 'first', label: 'Nombre', type: 'text', autocomplete: 'given-name' },
      { id: 'last', label: 'Apellidos', type: 'text', autocomplete: 'family-name' },
      { id: 'org', label: 'Empresa', type: 'text' },
      { id: 'title', label: 'Cargo', type: 'text' },
      { id: 'mobile', label: 'Móvil', type: 'tel', placeholder: '+34 600 123 456' },
      { id: 'phone', label: 'Teléfono de trabajo', type: 'tel' },
      { id: 'email', label: 'Correo electrónico', type: 'email' },
      { id: 'website', label: 'Sitio web', type: 'url' },
      { id: 'street', label: 'Calle y número', type: 'text' },
      { id: 'zip', label: 'Código postal', type: 'text' },
      { id: 'city', label: 'Ciudad', type: 'text' },
      { id: 'country', label: 'País', type: 'text' },
      { id: 'note', label: 'Nota', type: 'textarea', rows: 2 },
    ],
    build(v) {
      const errors = {};
      const first = trim(v.first), last = trim(v.last), org = trim(v.org);
      if (!first && !last && !org) errors.first = 'Escribe al menos un nombre o una empresa.';
      const mobile = checkPhone(v.mobile, errors, 'mobile', false);
      const phone = checkPhone(v.phone, errors, 'phone', false);
      const email = trim(v.email);
      if (email && !EMAIL_RE.test(email)) errors.email = 'El correo no parece válido.';
      let website = '';
      const notes = [];
      if (trim(v.website)) {
        const r = normalizeUrl(v.website);
        if (r.error) errors.website = r.error;
        else { website = r.url; if (r.note) notes.push(r.note); }
      }
      if (Object.keys(errors).length) return { text: null, errors, notes };
      const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
      lines.push(`N:${escapeVText(last)};${escapeVText(first)};;;`);
      lines.push(`FN:${escapeVText([first, last].filter(Boolean).join(' ') || org)}`);
      if (org) lines.push(`ORG:${escapeVText(org)}`);
      if (trim(v.title)) lines.push(`TITLE:${escapeVText(trim(v.title))}`);
      if (mobile) lines.push(`TEL;TYPE=CELL:${mobile}`);
      if (phone) lines.push(`TEL;TYPE=WORK,VOICE:${phone}`);
      if (email) lines.push(`EMAIL:${email}`);
      if (website) lines.push(`URL:${website}`);
      if (trim(v.street) || trim(v.city) || trim(v.zip) || trim(v.country)) {
        lines.push(`ADR;TYPE=WORK:;;${escapeVText(trim(v.street))};${escapeVText(trim(v.city))};;${escapeVText(trim(v.zip))};${escapeVText(trim(v.country))}`);
      }
      if (trim(v.note)) lines.push(`NOTE:${escapeVText(trim(v.note))}`);
      lines.push('END:VCARD');
      return { text: lines.join('\n'), errors, notes };
    },
    sample: { first: 'Lucía', last: 'Ortega', org: 'Estudio Faro', title: 'Diseñadora', mobile: '+34 600 123 456', email: 'lucia@example.com', website: 'example.com' },
  },
  {
    id: 'email',
    label: 'Correo',
    long: 'Correo electrónico',
    fields: [
      { id: 'to', label: 'Destinatario', type: 'email', required: true, placeholder: 'hola@tuweb.com' },
      { id: 'subject', label: 'Asunto', type: 'text' },
      { id: 'body', label: 'Mensaje', type: 'textarea', rows: 3 },
    ],
    build(v) {
      const errors = {};
      const to = trim(v.to);
      if (!to) errors.to = 'Escribe el correo del destinatario.';
      else if (!EMAIL_RE.test(to)) errors.to = 'El correo no parece válido.';
      if (Object.keys(errors).length) return { text: null, errors, notes: [] };
      const q = [];
      if (trim(v.subject)) q.push('subject=' + encodeURIComponent(trim(v.subject)));
      if (trim(v.body)) q.push('body=' + encodeURIComponent(v.body.trim()));
      return { text: `mailto:${to}${q.length ? '?' + q.join('&') : ''}`, errors, notes: [] };
    },
    sample: { to: 'hola@example.com', subject: 'Consulta desde el QR' },
  },
  {
    id: 'phone',
    label: 'Teléfono',
    long: 'Llamada telefónica',
    fields: [{ id: 'number', label: 'Número', type: 'tel', required: true, placeholder: '+34 600 123 456' }],
    build(v) {
      const errors = {};
      const n = checkPhone(v.number, errors, 'number', true);
      return { text: errors.number ? null : `tel:${n}`, errors, notes: [] };
    },
    sample: { number: '+34 600 123 456' },
  },
  {
    id: 'sms',
    label: 'SMS',
    long: 'Mensaje de texto (SMS)',
    fields: [
      { id: 'number', label: 'Número', type: 'tel', required: true, placeholder: '+34 600 123 456' },
      { id: 'message', label: 'Mensaje', type: 'textarea', rows: 3 },
    ],
    build(v) {
      const errors = {};
      const n = checkPhone(v.number, errors, 'number', true);
      if (errors.number) return { text: null, errors, notes: [] };
      const msg = trim(v.message);
      return { text: `sms:${n}${msg ? '?body=' + encodeURIComponent(msg) : ''}`, errors, notes: [] };
    },
    sample: { number: '+34 600 123 456', message: 'Hola, quiero más información' },
  },
  {
    id: 'geo',
    label: 'Ubicación',
    long: 'Ubicación en el mapa',
    fields: [
      {
        id: 'format', label: 'Formato', type: 'select', default: 'geo',
        options: [['geo', 'Coordenadas (abre la app de mapas)'], ['osm', 'Enlace de OpenStreetMap'], ['gmaps', 'Enlace de Google Maps'], ['link', 'Pegar un enlace de mapa propio']],
      },
      { id: 'lat', label: 'Latitud', type: 'number', placeholder: '40.4168', showIf: (v) => v.format !== 'link', hint: 'Entre −90 y 90, con punto decimal.' },
      { id: 'lng', label: 'Longitud', type: 'number', placeholder: '-3.7038', showIf: (v) => v.format !== 'link', hint: 'Entre −180 y 180.' },
      { id: 'link', label: 'Enlace del mapa', type: 'url', showIf: (v) => v.format === 'link', placeholder: 'https://maps.app.goo.gl/…' },
    ],
    build(v) {
      const errors = {};
      const format = v.format || 'geo';
      if (format === 'link') {
        const r = normalizeUrl(v.link);
        if (r.error) errors.link = r.error;
        return { text: errors.link ? null : r.url, errors, notes: r.note ? [r.note] : [] };
      }
      const parse = (x) => {
        const s = trim(String(x ?? '')).replace(',', '.');
        if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
        return Number(s);
      };
      const lat = parse(v.lat), lng = parse(v.lng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.lat = 'La latitud debe estar entre −90 y 90.';
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.lng = 'La longitud debe estar entre −180 y 180.';
      if (Object.keys(errors).length) return { text: null, errors, notes: [] };
      const a = lat.toFixed(6).replace(/\.?0+$/, '');
      const b = lng.toFixed(6).replace(/\.?0+$/, '');
      const text = format === 'osm' ? `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=17/${a}/${b}`
        : format === 'gmaps' ? `https://www.google.com/maps/search/?api=1&query=${a},${b}`
        : `geo:${a},${b}`;
      return { text, errors, notes: [] };
    },
    sample: { format: 'geo', lat: '40.4168', lng: '-3.7038' },
  },
  {
    id: 'event',
    label: 'Evento',
    long: 'Evento de calendario',
    fields: [
      { id: 'title', label: 'Título', type: 'text', required: true },
      { id: 'allDay', label: 'Todo el día', type: 'checkbox' },
      { id: 'start', label: 'Empieza', type: 'datetime', required: true },
      { id: 'end', label: 'Termina', type: 'datetime' },
      { id: 'location', label: 'Lugar', type: 'text' },
      { id: 'description', label: 'Descripción', type: 'textarea', rows: 3 },
    ],
    build(v) {
      const errors = {};
      if (!trim(v.title)) errors.title = 'Escribe el título del evento.';
      const s = parseLocalDateTime(v.start);
      if (!s) errors.start = 'Elige la fecha de inicio.';
      const allDay = !!v.allDay;
      let e = null;
      if (trim(v.end)) {
        e = parseLocalDateTime(v.end);
        if (!e) errors.end = 'La fecha de fin no es válida.';
        else if (s && e.ms < s.ms) errors.end = 'El evento no puede terminar antes de empezar.';
      }
      if (Object.keys(errors).length) return { text: null, errors, notes: [] };
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QR Studio//ES', 'BEGIN:VEVENT', `SUMMARY:${escapeVText(trim(v.title))}`];
      if (allDay) {
        lines.push(`DTSTART;VALUE=DATE:${s.date}`);
        if (e) lines.push(`DTEND;VALUE=DATE:${e.date}`);
      } else {
        lines.push(`DTSTART:${s.date}T${s.time}`);
        if (e) lines.push(`DTEND:${e.date}T${e.time}`);
      }
      if (trim(v.location)) lines.push(`LOCATION:${escapeVText(trim(v.location))}`);
      if (trim(v.description)) lines.push(`DESCRIPTION:${escapeVText(trim(v.description))}`);
      lines.push('END:VEVENT', 'END:VCALENDAR');
      return { text: lines.join('\n'), errors, notes: ['La hora se guarda sin zona horaria: cada móvil la interpreta como hora local.'] };
    },
    sample: { title: 'Inauguración', start: '2026-12-05T19:00', end: '2026-12-05T21:00', location: 'Calle Mayor 1' },
  },
  {
    id: 'social',
    label: 'Redes sociales',
    long: 'Perfil en una red social',
    fields: [
      { id: 'network', label: 'Red', type: 'select', default: 'instagram', options: SOCIAL_NETWORKS.map((n) => [n.id, n.label]) },
      { id: 'handle', label: 'Usuario', type: 'text', required: true, placeholder: 'tu_usuario', hint: 'Sin @ ni la dirección completa.' },
    ],
    build(v) {
      const errors = {};
      const net = SOCIAL_NETWORKS.find((n) => n.id === (v.network || 'instagram'));
      let h = trim(v.handle).replace(/^@/, '');
      if (!h) errors.handle = 'Escribe tu usuario.';
      else if (net.phone) {
        h = h.replace(/[ +()-]/g, '');
        if (!/^\d{6,15}$/.test(h)) errors.handle = 'Escribe el número con prefijo de país, solo cifras. Ejemplo: 34600123456';
      } else if (!net.re.test(h)) errors.handle = `Ese usuario no es válido en ${net.label}.`;
      return { text: errors.handle ? null : net.prefix + h, errors, notes: [] };
    },
    sample: { network: 'instagram', handle: 'qrstudio.demo' },
  },
  {
    id: 'sepa',
    label: 'Transferencia',
    long: 'Transferencia SEPA (EPC QR)',
    fields: [
      { id: 'name', label: 'Beneficiario', type: 'text', required: true },
      { id: 'iban', label: 'IBAN', type: 'text', required: true, placeholder: 'ES91 2100 0418 4502 0005 1332' },
      { id: 'bic', label: 'BIC (opcional)', type: 'text' },
      { id: 'amount', label: 'Importe en euros (opcional)', type: 'number', placeholder: '25.00' },
      { id: 'concept', label: 'Concepto (opcional)', type: 'text' },
    ],
    build(v) {
      const errors = {};
      const name = trim(v.name);
      if (!name) errors.name = 'Escribe el nombre del beneficiario.';
      else if (name.length > 70) errors.name = 'El nombre no puede superar 70 caracteres.';
      const iban = trim(v.iban).replace(/\s+/g, '').toUpperCase();
      if (!iban) errors.iban = 'Escribe el IBAN.';
      else if (!isValidIban(iban)) errors.iban = 'El IBAN no es válido (revisa los dígitos).';
      const bic = trim(v.bic).replace(/\s+/g, '').toUpperCase();
      if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) errors.bic = 'El BIC debe tener 8 u 11 caracteres.';
      let amount = '';
      const rawAmount = trim(String(v.amount ?? '')).replace(',', '.');
      if (rawAmount) {
        const n = Number(rawAmount);
        if (!/^\d+(\.\d{1,2})?$/.test(rawAmount) || !(n >= 0.01 && n <= 999999999.99)) errors.amount = 'Importe entre 0,01 y 999.999.999,99 con hasta 2 decimales.';
        else amount = 'EUR' + n.toFixed(2);
      }
      const concept = trim(v.concept);
      if (concept.length > 140) errors.concept = 'El concepto no puede superar 140 caracteres.';
      if (Object.keys(errors).length) return { text: null, errors, notes: [] };
      const text = ['BCD', '002', '1', 'SCT', bic, name, iban, amount, '', '', concept].join('\n');
      return { text, errors, notes: ['Formato EPC («Girocode») para transferencias SEPA. Comprueba con la app de tu banco que lo reconoce antes de imprimir.'] };
    },
    sample: { name: 'Asociación Ejemplo', iban: 'ES91 2100 0418 4502 0005 1332', amount: '25', concept: 'Cuota 2026' },
  },
];

export const CONTENT_TYPE_BY_ID = Object.fromEntries(CONTENT_TYPES.map((t) => [t.id, t]));

/** Valores iniciales (defaults de cada campo) de un tipo. */
export function defaultValues(typeId) {
  const t = CONTENT_TYPE_BY_ID[typeId];
  const out = {};
  for (const f of t.fields) out[f.id] = f.default !== undefined ? f.default : f.type === 'checkbox' ? false : '';
  return out;
}

/** Construye el texto a codificar para { type, values }. */
export function buildPayload(content) {
  const t = CONTENT_TYPE_BY_ID[content?.type];
  if (!t) return { text: null, errors: { _: 'Tipo de contenido desconocido.' }, notes: [] };
  return t.build(content.values || {});
}
