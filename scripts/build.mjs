// Build estático sin dependencias: ensambla las páginas de src/pages con src/layout.html y copia src/web a dist/.
// Genera sitemap.xml, robots.txt, ads.txt, manifest y la configuración pública (js/app/site-config.js).
// Variables de entorno opcionales: SITE_URL, QRS_ADSENSE_PUBLISHER (ca-pub-…), QRS_CONSENT_PROVIDER (builtin|google).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
if (process.env.SITE_URL) config.url = process.env.SITE_URL.replace(/\/+$/, '');
if (process.env.QRS_ADSENSE_PUBLISHER) config.adsense.publisherId = process.env.QRS_ADSENSE_PUBLISHER;
if (process.env.QRS_CONSENT_PROVIDER) config.consent.provider = process.env.QRS_CONSENT_PROVIDER;
config.url = config.url.replace(/\/+$/, '');

const PLACEHOLDER_ID = /X{6,}/;
const adsReady = /^ca-pub-\d{10,20}$/.test(config.adsense.publisherId) && !PLACEHOLDER_ID.test(config.adsense.publisherId);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const today = new Date().toISOString().slice(0, 10);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(SRC, 'web'), OUT);

// ---------------------------------------------------------------- configuración pública para el navegador
const publicConfig = {
  name: config.name,
  url: config.url,
  adsense: { enabled: !!config.adsense.enabled && adsReady, publisherId: config.adsense.publisherId, slots: config.adsense.slots, autoAds: !!config.adsense.autoAds, configured: adsReady },
  consent: config.consent,
};
fs.mkdirSync(path.join(OUT, 'js/app'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'js/app/site-config.js'), `// Generado por scripts/build.mjs a partir de site.config.json. No editar a mano.\nexport default ${JSON.stringify(publicConfig, null, 2)};\n`);

// ---------------------------------------------------------------- páginas
const layout = fs.readFileSync(path.join(SRC, 'layout.html'), 'utf8');
const partials = Object.fromEntries(
  fs.readdirSync(path.join(SRC, 'partials')).map((f) => [f.replace(/\.html$/, ''), fs.readFileSync(path.join(SRC, 'partials', f), 'utf8')]),
);
const pageFiles = walk(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html'));
const pages = [];

function fill(tpl, vars, pagePath) {
  let out = tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    if (!(name in partials)) throw new Error(`Parcial desconocido: ${name}`);
    return partials[name];
  });
  out = out.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (k in vars) return vars[k];
    throw new Error(`Variable sin definir {{${k}}} en ${pagePath}`);
  });
  return out;
}

for (const file of pageFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`Falta <!--meta {...}--> en ${path.relative(ROOT, file)}`);
  const meta = JSON.parse(m[1].replace(/\{\{siteUrl\}\}/g, config.url));
  const body = raw.slice(m[0].length);
  for (const k of ['title', 'description', 'path']) if (!meta[k]) throw new Error(`Falta «${k}» en ${path.relative(ROOT, file)}`);
  const canonical = config.url + meta.path;
  const title = meta.rawTitle ? meta.title : `${meta.title} · ${config.name}`;
  const css = (meta.css || []).map((c) => `<link rel="stylesheet" href="/css/${c}.css">`).join('\n');
  const jsonld = (meta.schema ? (Array.isArray(meta.schema) ? meta.schema : [meta.schema]) : [])
    .map((s) => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`)
    .join('\n');
  const script = meta.script ? `<script type="module" src="/js/${meta.script}"></script>` : '';
  const header = fill(partials[meta.app ? 'header-app' : 'header'], { current: meta.path }, meta.path);
  const content = fill(body, { siteName: config.name, siteUrl: config.url, ownerLegal: esc(config.owner.legalName), ownerEmail: esc(config.owner.email), ownerTax: esc(config.owner.taxId), ownerAddress: esc(config.owner.address), ownerRegistry: esc(config.owner.registry), today }, meta.path);
  const html = fill(layout, {
    title: esc(title),
    description: esc(meta.description),
    canonical: esc(canonical),
    robots: meta.noindex ? '<meta name="robots" content="noindex, follow">' : '',
    ogtitle: esc(title),
    ogimage: esc(config.url + (meta.image || '/img/og.png')),
    css,
    jsonld,
    bodyClass: esc(meta.bodyClass || (meta.app ? 'is-app' : 'is-site')),
    header,
    content,
    footer: meta.app ? partials['footer-app'] : partials.footer,
    sprite: partials.sprite,
    script,
    siteName: config.name,
    siteUrl: config.url,
    current: meta.path,
  }, meta.path);
  const rel = meta.path === '/404.html' ? '404.html' : path.join(meta.path.replace(/^\//, ''), 'index.html');
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
  pages.push({ path: meta.path, noindex: !!meta.noindex, priority: meta.priority, file: dest });
}

// ---------------------------------------------------------------- sitemap, robots, ads.txt, manifest
const indexable = pages.filter((p) => !p.noindex && p.path !== '/404.html').sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(
  path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable
    .map((p) => `  <url><loc>${esc(config.url + p.path)}</loc><lastmod>${today}</lastmod>${p.priority ? `<priority>${p.priority}</priority>` : ''}</url>`)
    .join('\n')}\n</urlset>\n`,
);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /proyectos/\n\nSitemap: ${config.url}/sitemap.xml\n`);
const adsLine = `google.com, ${config.adsense.publisherId.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`;
fs.writeFileSync(
  path.join(OUT, 'ads.txt'),
  adsReady
    ? `${adsLine}\n`
    : `# MARCADOR: sustituye el identificador por el tuyo (el de AdSense sin el prefijo «ca-»: pub-1234567890123456).\n# Hasta entonces esta línea NO es válida. Fuente: https://support.google.com/adsense/answer/12171612\n${adsLine}\n`,
);
fs.writeFileSync(
  path.join(OUT, 'manifest.webmanifest'),
  JSON.stringify({ name: config.name, short_name: 'QR Studio', start_url: '/crear/', display: 'standalone', background_color: '#ffffff', theme_color: '#ffffff', lang: 'es', icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }, null, 2),
);

// ---------------------------------------------------------------- comprobación de enlaces internos
const exists = (href) => {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || clean === '/') return true;
  const p = path.join(OUT, clean);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return true;
  return fs.existsSync(path.join(p, 'index.html'));
};
let broken = 0;
for (const p of pages) {
  const html = fs.readFileSync(p.file, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?][^"]*|\/(?=["#?]))"/g)) {
    if (m[1].startsWith('//')) continue;
    if (!exists(m[1])) {
      console.error(`ENLACE ROTO en ${p.path}: ${m[1]}`);
      broken++;
    }
  }
}
console.log(`dist/ listo: ${pages.length} páginas, ${indexable.length} indexables · AdSense ${adsReady ? 'CONFIGURADO' : 'sin identificador real (marcador)'} · consentimiento: ${config.consent.provider}`);
if (broken && !process.argv.includes('--lenient')) {
  console.error(`${broken} enlaces internos rotos`);
  process.exit(1);
}
