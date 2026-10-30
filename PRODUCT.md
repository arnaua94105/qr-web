# Product

<!-- impeccable:product-schema 1 -->

> Origen de este archivo: la entrevista de `impeccable init` no se hizo con preguntas. El usuario entregó un brief
> muy completo y pidió expresamente que no se le consultaran detalles menores. Todo lo de abajo está **inferido de ese
> brief** y no confirmado en una ronda de respuestas. Lo marcado con [pendiente] lo debe decidir el propietario.

## Platform

web

## Stack

Sitio estático de varias páginas con módulos ES nativos del navegador, sin dependencias de npm.
Motivo: en la sesión de construcción el registro de npm estaba bloqueado por la política de red, y el usuario eligió
expresamente la "versión sin dependencias". No es una preferencia de producto: el brief original prefería
React + TypeScript + Vite + Tailwind + Three.js. Migrar a ese stack en el futuro es posible porque la lógica
(QR, geometría, exportadores) vive en módulos puros sin DOM.

## Users

Personas sin conocimientos técnicos que necesitan un código QR: dueños de bares y tiendas, organizadores de eventos,
creadores de contenido, gente que fabrica objetos (llaveros, placas) con impresora 3D. Lo usan en el móvil y en el
ordenador, normalmente una sola vez por encargo y sin querer crear una cuenta.

## Product Purpose

Generar códigos QR reales, personalizarlos con libertad sin romper la lectura y convertir la matriz del QR en
geometría 3D imprimible. Éxito: el usuario descarga un archivo que funciona (PNG/SVG/PDF o STL/OBJ/GLB/3MF) y sabe
qué tan fiable es su lectura.

## Positioning

Un editor de QR gratuito, sin registro, que dice la verdad sobre la escaneabilidad (distingue "generado",
"verificado en simulación" y "requiere prueba con móvil") y que exporta geometría 3D construida a partir de la
matriz real del QR, con unidades en milímetros, piezas separadas para impresión a dos colores y validaciones de
imprimibilidad.

## Operating Context

Se usa en el navegador. Los datos del usuario (contenido del QR, logotipos, proyectos) se procesan en el propio
navegador y se guardan en IndexedDB/localStorage; no hay servidor ni sincronización en la nube. Los archivos
exportados acaban en una imprenta, en un PDF para imprimir o en un laminador de impresión 3D.

## Capabilities and Constraints

- Generación QR propia (modelo 2, versiones 1-40, corrección L/M/Q/H, modos numérico/alfanumérico/byte).
- Tipos de contenido: URL, texto, Wi-Fi, vCard, correo, teléfono, SMS, ubicación, evento, redes sociales, transferencia SEPA.
- Exportación 2D: SVG vectorial, PNG, PDF vectorial.
- Exportación 3D: STL binario, OBJ, GLB y 3MF, todos construidos por código propio.
- Sin cuentas, sin nube, sin pagos, sin IA conectada en la primera versión.
- El 3D es una malla de columnas (heightfield) con resolución en mm; los contornos curvos se aproximan con escalones
  de esa resolución. No hay biselado.
- Verificación de lectura real (cámara) imposible desde el servidor: se declara como "requiere prueba física".
- Idioma de la interfaz: español. [pendiente] otros idiomas.

## Brand Commitments

Nombre provisional: QR Studio. [pendiente] nombre definitivo, dominio, logotipo propio, datos de titular legal,
identificador de AdSense.

## Evidence on Hand

Ninguna prueba social, ninguna cifra de uso, ningún cliente. No se debe inventar ninguna. Los ejemplos de diseño
mostrados son contenido de demostración generado por el propio producto.

## Product Principles

1. La legibilidad del QR manda sobre la decoración, pero la advertencia nunca bloquea la creatividad.
2. Nada que parezca funcionar y no funcione: si un formato o función no está implementado, no se muestra como activo.
3. Los números físicos son milímetros reales y los archivos contienen geometría real.
4. Sin registro y sin enviar datos a ningún servidor para crear, previsualizar y descargar.
5. La publicidad nunca se confunde con controles ni interrumpe el editor.

## Accessibility & Inclusion

Uso por teclado completo, foco visible, contraste mínimo 4.5:1 en texto, `prefers-reduced-motion` respetado,
objetivos táctiles de 44px en móvil, alternativa 2D cuando WebGL no está disponible.
