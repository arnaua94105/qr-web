// Servidor estático mínimo para dist/ (sin dependencias). URLs limpias, 404 propio y tipos MIME correctos.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.argv.includes('--src') ? 'src/web' : 'dist');
const PORT = Number(process.env.PORT || process.argv.find((a) => /^\d+$/.test(a)) || 4173);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

export function createServer() {
  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let p = decodeURIComponent(url.pathname);
      let file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' + url.search }).end(); return; }
        file = path.join(file, 'index.html');
      }
      if (!fs.existsSync(file)) {
        const nf = path.join(ROOT, '404.html');
        res.writeHead(404, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
        res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'No encontrado');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500).end('Error interno');
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(PORT, () => console.log(`QR Studio en http://localhost:${PORT}/  (sirviendo ${path.relative(process.cwd(), ROOT)}/)`));
}
