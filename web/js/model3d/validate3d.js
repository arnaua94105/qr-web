// Comprobaciones de la malla y de la imprimibilidad. Módulo puro.
// Honestidad: son comprobaciones de la geometría generada y de reglas prácticas; no garantizan que la pieza
// salga bien en cualquier impresora, material o laminador.

/** Análisis topológico de una pieza (malla indexada). */
export function analyzeMesh(part) {
  const { positions: P, indices: I } = part;
  const nv = P.length / 3;
  const directed = new Map();
  const undirected = new Map();
  let degenerate = 0;
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
    const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area2 < 1e-9) degenerate++;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u * nv + v;
      directed.set(k, (directed.get(k) || 0) + 1);
      const lo = Math.min(u, v), hi = Math.max(u, v);
      const uk = lo * nv + hi;
      undirected.set(uk, (undirected.get(uk) || 0) + 1);
    }
    union(a, b);
    union(b, c);
  }
  let unmatched = 0;
  for (const [k, n] of directed) {
    const u = Math.floor(k / nv), v = k - u * nv;
    if ((directed.get(v * nv + u) || 0) !== n) unmatched += 1;
  }
  let nonManifold = 0, boundary = 0;
  for (const n of undirected.values()) {
    if (n > 2) nonManifold++;
    if (n === 1) boundary++;
  }
  const roots = new Set();
  const used = new Uint8Array(nv);
  for (let t = 0; t < I.length; t++) used[I[t]] = 1;
  for (let v = 0; v < nv; v++) if (used[v]) roots.add(find(v));
  return {
    closed: unmatched === 0 && boundary === 0,
    unmatchedEdges: unmatched,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold, // aristas compartidas por más de dos caras (contacto en diagonal): válido para laminadores
    degenerateTriangles: degenerate,
    shells: roots.size,
    volume: part.volume,
  };
}

const f1 = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
const f2 = (n) => (Math.round(n * 100) / 100).toString().replace('.', ',');

/**
 * @returns {{checks:{id,level,title,detail}[], worst:'ok'|'info'|'warn'|'bad', parts:object[]}}
 */
export function validateModel(model, p) {
  const checks = [];
  const add = (id, level, title, detail) => checks.push({ id, level, title, detail });
  const m = model.info.moduleMm;
  const T = p.base;

  // --- dimensiones
  const d = model.dims;
  add('size', 'info', `Tamaño final: ${f1(d.x)} × ${f1(d.y)} × ${f1(d.z)} mm`, `${model.parts.length} ${model.parts.length === 1 ? 'pieza' : 'piezas'} · módulo de ${f2(m)} mm.`);
  if (Math.max(d.x, d.y) > 220) add('bed', 'warn', 'Puede no caber en la cama de impresión', 'Muchas impresoras llegan a 220–256 mm de lado. Comprueba la tuya o reduce el tamaño.');

  // --- grosores
  if (T < p.minThickness) add('base', 'bad', `Base demasiado fina (${f2(T)} mm)`, `Por debajo de ${f1(p.minThickness)} mm la pieza se dobla o se despega. Aumenta el grosor de la base.`);
  else add('base', 'ok', `Grosor de base correcto (${f2(T)} mm)`, 'Suficiente para una pared rígida.');
  if (p.style === 'engraved') {
    const floor = T - p.depth;
    if (floor < p.minThickness) add('floor', 'bad', `Queda muy poca base bajo el grabado (${f2(floor)} mm)`, 'Reduce la profundidad o aumenta el grosor de la base.');
    if (p.depth < 0.4) add('depth', 'warn', `Grabado muy poco profundo (${f2(p.depth)} mm)`, 'A menos de 0,4 mm casi no se distingue sin cambio de color.');
  } else {
    if (p.relief < 0.4) add('relief', 'warn', `Relieve casi imperceptible (${f2(p.relief)} mm)`, 'Sin cambio de color, los módulos apenas se distinguen. Usa 0,6 mm o más, o piezas de dos colores.');
    else if (p.parts === 'single' && p.relief < 0.6) add('relief', 'info', `Relieve bajo (${f2(p.relief)} mm)`, 'Se lee mejor con una luz rasante o con dos colores.');
  }

  // --- detalle mínimo
  if (m < p.minFeature / 2) add('module', 'bad', `Módulos demasiado pequeños (${f2(m)} mm)`, `Menos de ${f2(p.minFeature / 2)} mm no se imprime con una boquilla normal. Aumenta el tamaño del QR o usa un contenido más corto.`);
  else if (m < p.minFeature) add('module', 'warn', `Módulos pequeños (${f2(m)} mm)`, `Quedan por debajo de ${f1(p.minFeature)} mm: probablemente salgan borrosos. Aumenta el lado del QR a ${f1(Math.ceil(p.minFeature * Math.round(p.qrMm / m)))} mm o más.`);
  else add('module', 'ok', `Módulos imprimibles (${f2(m)} mm)`, 'Por encima del detalle mínimo configurado.');

  // --- zona de silencio
  const quietNeeded = 4 * m;
  if (p.margin < 2 * m) add('quiet', 'warn', `Margen muy justo (${f1(p.margin)} mm = ${f1(p.margin / m)} módulos)`, `La norma pide 4 módulos (${f1(quietNeeded)} mm) de zona de silencio. Aumenta el margen.`);
  else if (p.margin < quietNeeded) add('quiet', 'info', `Margen algo corto (${f1(p.margin / m)} módulos)`, `Se recomiendan 4 módulos (${f1(quietNeeded)} mm).`);
  else add('quiet', 'ok', 'Zona de silencio suficiente', `${f1(p.margin / m)} módulos de margen.`);

  // --- anilla / orificio
  if (p.keychain) {
    const ring = p.holeWall;
    if (ring < Math.max(1.2, p.minThickness)) add('ring', 'warn', `Anilla frágil (${f1(ring)} mm de pared)`, 'Con menos de 1,2 mm la anilla se rompe al tirar. Aumenta la distancia al borde.');
    else add('ring', 'ok', `Anilla con ${f1(ring)} mm de pared`, `Orificio de ${f1(p.holeD)} mm de diámetro, fuera de la zona del QR.`);
    if (p.holeD < 3) add('hole', 'warn', `Orificio pequeño (${f1(p.holeD)} mm)`, 'Un aro estándar necesita 3–5 mm.');
  }
  if (p.rimWidth > 0 && p.rimWidth < p.minFeature) add('rim', 'warn', `Borde más fino que el detalle mínimo (${f1(p.rimWidth)} mm)`, 'Aumenta el ancho del borde.');

  // --- texto
  if (model.info.textBox) {
    const th = model.info.textBox.y1 - model.info.textBox.y0;
    if (th < 4) add('text', 'warn', `Texto pequeño (${f1(th)} mm de alto)`, 'Por debajo de 4 mm las letras se funden. Aumenta la banda o acorta el texto.');
    else add('text', 'ok', `Texto de ${f1(th)} mm de alto`, p.style === 'engraved' ? 'Grabado como los módulos.' : 'Elevado como los módulos.');
  } else if (p.label.trim() && p.shape === 'circle') {
    add('text', 'info', 'El texto solo está disponible en placa rectangular', 'Se ha omitido en la forma circular.');
  }

  // --- holgura
  if (p.parts === 'separate' && p.style === 'engraved') {
    if (p.clearance === 0) add('clear', 'info', 'Piezas sin holgura', 'Correcto para impresión multicolor en un solo laminador. Para piezas físicas que se encajan a mano añade 0,1–0,2 mm.');
    else if (p.clearance < 0.08) add('clear', 'warn', `Holgura (${f2(p.clearance)} mm) menor que la precisión habitual`, 'Las impresoras FDM rara vez bajan de 0,1 mm: las piezas podrían quedar soldadas.');
    else add('clear', 'ok', `Holgura de ${f2(p.clearance)} mm entre piezas`, 'Aplicada en los bordes del cajeado.');
  }

  // --- malla
  const reports = [];
  for (const part of model.parts) {
    const a = analyzeMesh(part);
    reports.push({ id: part.id, name: part.name, ...a, triangles: part.triangles });
  }
  const notClosed = reports.filter((r) => !r.closed);
  if (notClosed.length) add('closed', 'bad', 'La malla no está cerrada', `Piezas con aristas abiertas: ${notClosed.map((r) => r.name).join(', ')}.`);
  else add('closed', 'ok', 'Mallas cerradas (estancas)', 'Todas las aristas están compartidas por caras con orientación coherente.');
  const volBad = reports.filter((r) => !(r.volume > 0));
  if (volBad.length) add('volume', 'bad', 'Volumen no positivo', `Revisa la orientación de las caras en: ${volBad.map((r) => r.name).join(', ')}.`);
  const deg = reports.reduce((s, r) => s + r.degenerateTriangles, 0);
  if (deg) add('degenerate', 'warn', `${deg} triángulos degenerados`, 'Triángulos sin área; los laminadores suelen ignorarlos.');
  else add('degenerate', 'ok', 'Sin triángulos degenerados', '');
  for (const r of reports) {
    const body = model.parts.length === 1 || r.id === 'base' || r.id === 'body';
    if (body && r.shells > 1) add('shells-' + r.id, 'warn', `«${r.name}» tiene ${r.shells} piezas desconectadas`, 'Hay fragmentos que no tocan el cuerpo principal y no se imprimirían bien.');
  }
  const tri = reports.reduce((s, r) => s + r.triangles, 0);
  if (tri > 1500000) add('tri', 'warn', `Modelo muy pesado (${Math.round(tri / 1000)} k triángulos)`, 'Aumenta la resolución (mm) para aligerarlo.');
  if (model.info.detail > model.info.requestedDetail + 1e-9) add('detail', 'info', `Resolución ajustada a ${f2(model.info.detail)} mm`, 'El modelo pedía demasiadas celdas; se ha relajado automáticamente.');
  if (reports.some((r) => r.nonManifoldEdges)) add('diag', 'info', 'Módulos que se tocan en diagonal', 'Hay aristas compartidas por cuatro caras (contacto entre esquinas). Es geometría válida para los laminadores habituales.');
  add('intersect', 'info', 'Autointersecciones', 'La malla se construye con prismas sobre una rejilla común y no genera intersecciones; no se ha ejecutado una comprobación geométrica general.');

  const worst = checks.some((c) => c.level === 'bad') ? 'bad' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
  return { checks, worst, parts: reports };
}
