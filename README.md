# QR Studio

Generador de códigos QR personalizables y laboratorio 3D que convierte la matriz real del QR en modelos imprimibles. Sitio estático, **sin dependencias de npm** (Node 22 y un navegador moderno).

## Comandos
```
npm run build      # genera dist/ (sitemap, robots, ads.txt, páginas); falla si hay enlaces internos rotos
npm run serve      # sirve dist/ en http://localhost:4173  (node scripts/serve.mjs 4173)
npm test           # 38 pruebas unitarias (codificador/decodificador QR, 3D, exportadores, plantillas, proyectos)
node scripts/e2e.mjs   # extremo a extremo con Playwright/Chromium (servidor en marcha): 61 comprobaciones
node scripts/verify/gen_exports.mjs && python3 scripts/verify/check_exports.py   # verificación externa de STL/3MF/PDF
node scripts/render-images.mjs   # regenera las imágenes de la portada desde el visor 3D real
```

## Configuración pendiente (la pone el titular)
- `site.config.json` → `owner.*` (marcadores `[PENDIENTE: …]` que aparecen en las páginas legales) y `url`.
- Variables de entorno de build: `SITE_URL`, `QRS_ADSENSE_PUBLISHER` (`ca-pub-…`), `QRS_CONSENT_PROVIDER` (`builtin` | `google`).
- Identificadores de bloque en `adsense.slots` (ahora marcadores).

## Activar AdSense (pasos del titular)
1. Alta y aprobación del sitio en AdSense (no se afirma ninguna aprobación aquí).
2. Poner el identificador real en `QRS_ADSENSE_PUBLISHER` o `site.config.json`, y crear los bloques `home`, `article`, `resources`.
3. Reconstruir: `ads.txt` se genera con la forma `google.com, pub-…, DIRECT, f08c47fec0942fa0`.
4. UE/EEE: el gestor `builtin` **no es un CMP certificado** (solo anuncios no personalizados tras aceptar). Para personalizados, configura el mensaje «Privacy & messaging» de Google y usa `google`.
5. Revisa los textos legales con un profesional.

## Limitaciones conocidas
- Lectura: se verifica con decodificador propio y OpenCV; OpenCV no lee buscadores redondeados (la interfaz avisa). Siempre falta la prueba con móvil real.
- 3D: curvas en escalera (rejilla ortogonal), sin biseles. Las comprobaciones son reglas prácticas, no garantías de impresión. Sin comprobación general de autointersecciones.
- Proyectos: solo en el navegador (sin nube). El consentimiento de la `google` no se ha podido probar aquí.
- Stack: no se usó React/TS/Three.js (registros npm bloqueados); los módulos puros son migrables.
