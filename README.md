# Landing de producción — Decoración de Fiestas y Eventos

Archivos listos para desplegar en cualquier hosting estático.

```
produccion/
├── index.html       Landing (variante A por defecto)
├── gracias.html     Página de confirmación post-compra
├── css/styles.css   Tokens en :root + estilos por sección
├── js/tracking.js   Hotmart src/sck + eventos analytics
├── js/main.js       Motion, countdown, carrusel, FAQ
└── img/             Fotos en webp optimizado
```

## Cambiar la URL de checkout
`js/tracking.js` → `CONFIG.checkoutBase`. Todos los botones `[data-checkout]`
se reescriben solos con `?src=` y `&sck=` al cargar la página.

## Alternar variante A/B
- Por URL: `index.html?v=B`
- Por defecto de la página: `<body data-variant="A|B">` en `index.html`.
- En B: se oculta la sección de bonos gratis (#bonos) y se muestran los
  order bumps dentro de la oferta (los bumps reales se configuran en el
  checkout de Hotmart con su `off=` correspondiente).

## Cambiar horas del deadline
`js/main.js` → `DEADLINE_HOURS` (48–72). El deadline se guarda por usuario
en `localStorage['ad_deadline']` y NO se reinicia al refrescar. Al expirar
se oculta el bloque de urgencia y aparece el mensaje configurado
(`.expired-msg` en `index.html`).

## IDs de tracking
- **GTM instalado**: contenedor `GTM-TQZQG9PZ` en `<head>` + noscript en `<body>`
  de ambas páginas, con `dataLayer` inicializado antes.
- Eventos dataLayer (tabla del spec): `page_view` {ad_src, ad_variant, utms},
  `checkout_click` {variante, boton, src, sck, value, currency},
  `vsl_50` (llamar `AD_fireVsl50()` desde el player al cruzar 50%),
  `purchase` (gracias.html, con transaction_id de Hotmart).
- Meta Pixel + CAPI: configurar en GTM (notas en el head de cada página);
  el Purchase real (con bumps) lo reporta el **webhook de Hotmart → CAPI**,
  dedupe por `event_id = transaction_id`.

## src / sck (Hotmart)
- `src`: canal detectado (metaads, googleads, igbio, fborg, email, whatsapp,
  manychat, igorg, googleorg, directo) — prioridad: `?src=` > UTMs > referrer.
  Se congela por sesión en `sessionStorage['ad_src']`.
- `sck`: `{variante}_{boton}_{campana}_{creativo}` — botones: hero, temario,
  oferta, bonos, urgencia, final, sticky, nav.

## Pendientes de contenido
- VSL: pegar embed en el slot comentado `<!-- VSL: pegar embed aquí -->` (hero).
- Testimonios reales: reemplazar los `.testi-ph` por `<img>` (con consentimiento).
- WhatsApp de soporte y URL del grupo de Facebook en `gracias.html`.
- Foto de vocera (sección "Quién te acompaña") cuando exista.

---

## Despliegue en Vercel (GitHub)

Sitio **estático**, sin build. En Vercel: Framework preset = **Other**,
Build Command = vacío, Output Directory = vacío, Root Directory = vacío.

`vercel.json` ya deja configurado:
- **cleanUrls** → la página de gracias queda en `/gracias` (sin `.html`).
  Es la URL que debes poner en Hotmart como página de confirmación.
- Cache largo para `/img`, cache corto para `/css` y `/js`.
- Cabeceras básicas de seguridad.

### Flujo de trabajo
1. Editas los archivos.
2. `git add . && git commit -m "descripción" && git push`
3. Vercel despliega solo. Cada rama genera su propia Preview URL.

### Probar la variante B sin tocar producción
```bash
git checkout -b variante-b
# ...cambios...
git push -u origin variante-b
```
Vercel genera una Preview URL para esa rama. Producción sigue en la variante A.

## Checklist antes de mandar tráfico
- [ ] VSL pegado en el bloque `.vsl` de `index.html`
- [ ] Enlaces reales de WhatsApp y grupo de Facebook en `gracias.html`
- [ ] Etiquetas creadas en GTM (contenedor `GTM-TQZQG9PZ`)
- [ ] URL de confirmación configurada en Hotmart → `https://TU-DOMINIO/gracias`
- [ ] Bonos rotulados como **BONO** dentro de Hotmart Club
- [ ] Verificar que los 8 botones abren el checkout con `src` y `sck`

