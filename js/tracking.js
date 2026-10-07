/* ============================================================
   TRACKING — Hotmart src/sck + eventos de analytics
   El href real vive en el HTML; este módulo SOLO lo enriquece.
   Storage protegido: ningún SecurityError rompe la página.
   ============================================================ */
window.AD_TRACKING = (function () {
  'use strict';

  var CONFIG = { maxLen: 60 };
  var qs = new URLSearchParams(location.search);

  /* ---- Storage seguro con fallback en memoria ---- */
  var mem = {};
  function safeGet(store, k) {
    try { return window[store].getItem(k); } catch (e) { return mem[store + ':' + k] || null; }
  }
  function safeSet(store, k, v) {
    try { window[store].setItem(k, v); } catch (e) { mem[store + ':' + k] = v; }
  }

  // Sanitiza: solo a-z 0-9 _ -, minúsculas, máx 60
  function clean(v) {
    return String(v || '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, CONFIG.maxLen);
  }

  // ---- Variante A/B: ?v=B o data-variant en <body> ----
  function getVariant() {
    var v = (document.documentElement.dataset.variant || qs.get('v') || 'A').toUpperCase();
    return v === 'B' ? 'B' : 'A';
  }

  // ---- src: canal / fuente de tráfico ----
  function detectSrc() {
    var saved = safeGet('sessionStorage', 'ad_src');
    if (saved) return saved;
    var src;
    var explicit = qs.get('src');
    if (explicit) {
      src = clean(explicit);
    } else {
      var us = (qs.get('utm_source') || '').toLowerCase();
      var um = (qs.get('utm_medium') || '').toLowerCase();
      var paid = /paid|cpc|ads|ppc/.test(um);
      if (/facebook|instagram|^fb$|^ig$|meta/.test(us) && paid) src = 'metaads';
      else if (/google/.test(us) && paid) src = 'googleads';
      else if (/instagram|^ig$/.test(us)) src = 'igbio';
      else if (/facebook|^fb$/.test(us)) src = 'fborg';
      else if (/email|newsletter|mailingboss/.test(us) || /email/.test(um)) src = 'email';
      else if (/whatsapp/.test(us) || /whatsapp/.test(um)) src = 'whatsapp';
      else if (/manychat/.test(us) || /manychat/.test(um)) src = 'manychat';
      else {
        var ref = document.referrer || '';
        if (/instagram\./.test(ref)) src = 'igorg';
        else if (/facebook\.|fb\./.test(ref)) src = 'fborg';
        else if (/google\./.test(ref)) src = 'googleorg';
        else src = 'directo';
      }
    }
    safeSet('sessionStorage', 'ad_src', src);
    return src;
  }

  // ---- sck: {variante}_{boton}_{campana}_{creativo} ----
  function buildSck(boton) {
    var campana = clean(qs.get('utm_campaign')) || 'na';
    var creativo = clean(qs.get('utm_content')) || clean(qs.get('utm_term')) || 'na';
    return [getVariant(), clean(boton) || 'na', campana, creativo].join('_');
  }

  // Enriquece una URL base existente (el href del HTML) con src/sck.
  function enrich(baseHref, boton) {
    var u = new URL(baseHref, location.href);
    u.searchParams.set('src', detectSrc());
    u.searchParams.set('sck', buildSck(boton));
    // Las variantes usan checkouts distintos: A sin order bumps, B con ellos
    // (checkoutMode=10). Si B cayera en el checkout base no vería los bumps que
    // la landing le anuncia; si A cayera en el 10, vería extras pagos que no
    // le anunciamos.
    if (getVariant() === 'B') u.searchParams.set('checkoutMode', '10');
    else u.searchParams.delete('checkoutMode');
    return u.toString();
  }

  // ---- dataLayer: preservar UTMs originales para GA4 ----
  window.dataLayer = window.dataLayer || [];
  try {
    window.dataLayer.push({
      event: 'page_view',
      ad_src: detectSrc(),
      ad_variant: getVariant(),
      ad_sck_base: buildSck('page'),
      utm_source: qs.get('utm_source') || null,
      utm_medium: qs.get('utm_medium') || null,
      utm_campaign: qs.get('utm_campaign') || null,
      utm_content: qs.get('utm_content') || null,
      utm_term: qs.get('utm_term') || null
    });
  } catch (e) { /* nunca romper la página por tracking */ }

  // ---- Enriquecer todos los botones [data-checkout] ----
  function init() {
    document.querySelectorAll('[data-checkout]').forEach(function (a) {
      var boton = a.dataset.boton || 'na';
      try {
        var base = a.getAttribute('href');
        if (!base || base.charAt(0) === '#') return; // sin URL real: no tocar
        a.href = enrich(base, boton);
        a.rel = 'noopener';
      } catch (e) { /* href del HTML queda como fallback */ }
      a.addEventListener('click', function () {
        try {
          var payload = { variante: getVariant(), boton: boton, src: detectSrc(), sck: buildSck(boton) };
          window.dataLayer.push(Object.assign({ event: 'checkout_click', currency: 'USD', value: 27 }, payload));
          /* ⚠️ NO usar InitiateCheckout aquí. Hotmart ya lo dispara al cargar su
             checkout, y son momentos distintos del embudo: aquí es "hizo clic en
             el CTA", allá es "llegó al checkout". Con el mismo nombre, Meta los
             suma y el costo por pago iniciado aparece a la mitad del real.
             AddToCart deja el embudo limpio: ViewContent → AddToCart (clic en CTA,
             nuestro) → InitiateCheckout (checkout cargado, Hotmart) → Purchase
             (Hotmart, pixel + CAPI deduplicados). Decisión del 24/08/2026. */
          if (typeof fbq === 'function') fbq('track', 'AddToCart', Object.assign({ value: 27, currency: 'USD' }, payload));
          if (typeof gtag === 'function') gtag('event', 'begin_checkout', { currency: 'USD', value: 27, ad_meta: payload });
        } catch (e) { /* el click sigue navegando al href */ }
      });
    });
  }

  /* ---- ViewContent: señal de lectura real, no de rebote ----
     Se dispara UNA vez cuando la sección de oferta entra en pantalla.
     Distingue a quien leyó la propuesta de quien rebotó en el hero, y da
     un público de remarketing tibio muy por encima de "visitó la landing".
     Ojo: Hotmart también manda ViewContent, pero desde SU página de producto
     del marketplace — página que no está en este embudo, así que no chocan. */
  function initViewContent() {
    var el = document.getElementById('oferta');
    if (!el || !('IntersectionObserver' in window)) return;
    var yaDisparado = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || yaDisparado) return;
        yaDisparado = true;
        io.disconnect();
        try {
          var payload = { variante: getVariant(), src: detectSrc(), seccion: 'oferta' };
          window.dataLayer.push(Object.assign({ event: 'view_offer', currency: 'USD', value: 27 }, payload));
          if (typeof fbq === 'function') fbq('track', 'ViewContent', Object.assign({ value: 27, currency: 'USD' }, payload));
        } catch (e) { /* nunca romper la página por tracking */ }
      });
    }, { threshold: 0.4 });
    io.observe(el);
  }

  /* ---- vsl_50: la mitad del VSL vista (solo GA4, por dataLayer) ----
     El reproductor de vTurb no expone la duración, así que va fija aquí.
     ⚠️ Si se cambia el VSL en vTurb, actualizar VSL_SEGUNDOS.
     A Meta no se le manda nada: vTurb ya envía View0%…View95% al píxel
     1360065582424784 por su integración propia. */
  var VSL_SEGUNDOS = 237; // VSL v6 (el v5 dura casi lo mismo)
  function initVsl() {
    var intentos = 0, enviado = false;
    (function esperar() {
      var sp = window.smartplayer;
      if (!sp || !sp.instances || !sp.instances.length) {
        if (++intentos < 60) setTimeout(esperar, 500); // el player carga async: 30 s máx
        return;
      }
      sp.instances.forEach(function (p) {
        try {
          p.on('timeupdate', function (seg) {
            if (enviado || seg < VSL_SEGUNDOS / 2) return;
            enviado = true;
            window.dataLayer.push({ event: 'vsl_50', variante: getVariant(), src: detectSrc(), vsl_segundos: VSL_SEGUNDOS });
          });
        } catch (e) { /* nunca romper la página por tracking */ }
      });
    })();
  }

  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); initViewContent(); initVsl(); });
    else { init(); initViewContent(); initVsl(); }
  } catch (e) { /* fallback: hrefs del HTML */ }

  return { detectSrc: detectSrc, getVariant: getVariant, enrich: enrich, clean: clean, safeGet: safeGet, safeSet: safeSet };
})();
