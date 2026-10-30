# Decisiones de diseño
- **Dirección (Taste Skill, semilla 1544609153):** «La frase es la composición». Bebas Neue (titulares), EB Garamond (texto), Inter (interfaz del editor); grises y un solo menta #a1ffcb; un único radio de 4 px.
- **Impeccable:** suelo de oficio aplicado a portada y páginas: sin eyebrows, sin texto en degradado, sin tarjetas anidadas, tipografía mínima de 13 px, áreas táctiles ≥ 40–44 px.
- **Emil Kowalski (movimiento):** `cubic-bezier(0.23,1,0.32,1)`, < 300 ms, `scale(.97)` al pulsar, `prefers-reduced-motion` respetado (también en el visor 3D y la rotación automática).
- **Imágenes:** capturas del visor 3D propio (`scripts/render-images.mjs`), sin recursos externos.
