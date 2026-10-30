import { loadDraft } from './storage.js';
import { newState, sanitizeState } from './project.js';
import { renderState } from './render.js';
import { sceneToPngBlob } from './raster.js';
import { makeZip } from '../export/zip.js';
import { downloadBytes, safeName } from '../export/download.js';
import { normalizeUrl } from '../qr/payloads.js';

const $ = (s) => document.getElementById(s);
const MAX = 200;
$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('msg'), go = $('go'), bar = $('bar');
  const lines = $('list').value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { msg.textContent = 'Pega al menos un enlace.'; return; }
  if (lines.length > MAX) { msg.textContent = `Hay ${lines.length} líneas; el máximo es ${MAX}.`; return; }
  go.disabled = true;
  let base;
  try { const d = await loadDraft(); base = d ? sanitizeState(d) : newState('url'); } catch { base = newState('url'); }
  const px = Number($('px').value) || 1024;
  const files = [], skipped = [], rows = ['archivo;nombre;enlace'];
  const used = new Set();
  let i = 0;
  for (const line of lines) {
    i++;
    const parts = line.split('|').map((s) => s.trim());
    const url = parts.length > 1 ? parts.slice(1).join('|').trim() : parts[0];
    const label = parts.length > 1 ? parts[0] : '';
    const n = normalizeUrl(url);
    if (n.error) { skipped.push(`${i}: ${line} → ${n.error}`); continue; }
    let name = safeName(label || n.url.replace(/^https?:\/\//, ''), 'qr');
    let k = 1, cand = name;
    while (used.has(cand)) cand = `${name}-${++k}`;
    used.add(cand); name = cand;
    const st = structuredClone(base);
    st.content = { type: 'url', values: { url: n.url } };
    const out = renderState(st);
    if (!out.ok) { skipped.push(`${i}: ${line} → ${out.fatal || 'no se pudo generar'}`); continue; }
    files.push({ name: `${name}.svg`, data: out.svg });
    files.push({ name: `${name}.png`, data: new Uint8Array(await (await sceneToPngBlob(out.scene, px)).arrayBuffer()) });
    rows.push(`${name};${(label || '').replace(/;/g, ',')};${n.url}`);
    bar.style.width = Math.round((i / lines.length) * 100) + '%';
    if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  go.disabled = false;
  if (!files.length) { msg.textContent = 'Ninguna línea era válida.\n' + skipped.join('\n'); return; }
  files.push({ name: 'indice.csv', data: '﻿' + rows.join('\r\n') + '\r\n' });
  downloadBytes(await makeZip(files), 'qr-lote.zip', 'application/zip');
  msg.textContent = `${files.length / 2 - 0.5 | 0} códigos generados.` + (skipped.length ? ` Omitidas ${skipped.length}: ` + skipped.join(' · ') : '');
});
