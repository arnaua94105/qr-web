const $ = (s) => document.getElementById(s);
const toCm = { cm: 1, m: 100, in: 2.54 };
const f = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('es-ES');
function calc() {
  const d = Number($('dist').value) * toCm[$('du').value];
  const mods = Math.round(Number($('mods').value)), q = Math.max(0, Number($('quiet').value));
  if (!(d > 0) || !(mods >= 21 && mods <= 177)) { $('big').textContent = '—'; $('out').replaceChildren(); return; }
  const bySide = (d * 10) / 10; // mm = distancia(cm)*10/10 → regla d/10
  const byModule = mods * 0.33;
  const side = Math.max(bySide, byModule);
  const total = side + 2 * q * (side / mods);
  $('big').textContent = f(side / 10, 1) + ' cm';
  const rows = [['Lado del símbolo', `${f(side)} mm`], ['Con zona de silencio', `${f(total)} mm`], ['Tamaño de cada módulo', `${f(side / mods, 2)} mm`], ['Limita', byModule > bySide ? 'la densidad del código' : 'la distancia']];
  $('out').replaceChildren(...rows.flatMap(([a, b]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = a; dd.textContent = b; return [dt, dd]; }));
}
function conv() {
  const v = Number($('cv').value), u = $('cu').value;
  if (!Number.isFinite(v)) return;
  const mm = u === 'mm' ? v : u === 'cm' ? v * 10 : u === 'in' ? v * 25.4 : (v / 300) * 25.4;
  const rows = [['Milímetros', f(mm, 2)], ['Centímetros', f(mm / 10, 2)], ['Pulgadas', f(mm / 25.4, 3)], ['Píxeles a 300 ppp', f((mm / 25.4) * 300, 0)]];
  $('conv').replaceChildren(...rows.flatMap(([a, b]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = a; dd.textContent = b; return [dt, dd]; }));
}
['dist', 'du', 'mods', 'quiet'].forEach((i) => $(i).addEventListener('input', calc));
['cv', 'cu'].forEach((i) => $(i).addEventListener('input', conv));
calc(); conv();
