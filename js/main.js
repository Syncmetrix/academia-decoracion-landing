/* ============================================================
   MAIN — interacciones y motion de la landing
   Todo con transform/opacity · respeta prefers-reduced-motion
   ============================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DEADLINE_HOURS = 72; // ← horas del deadline funnel (48–72)

  /* ---- Storage seguro con fallback en memoria (file://, cookies bloqueadas) ---- */
  var mem = {};
  function safeGet(store, k) {
    try { return window[store].getItem(k); } catch (e) { return mem[store + ':' + k] || null; }
  }
  function safeSet(store, k, v) {
    try { window[store].setItem(k, v); } catch (e) { mem[store + ':' + k] = v; }
  }
  /* Un error en un bloque no debe tumbar los demás */
  function safe(name, fn) { try { fn(); } catch (e) { /* bloque '+name+' aislado */ } }


  /* ---- Barra de progreso de scroll ---- */
  var bar = document.getElementById('scroll-progress');

  /* ---- Header sticky + CTA sticky móvil ---- */
  var header = document.getElementById('site-header');
  var mcta = document.getElementById('mobile-cta');
  var hero = document.getElementById('hero');
  document.body.classList.add('has-sticky');

  /* ---- Temario: línea de progreso ---- */
  var stepsLine = document.querySelector('.steps-line');
  var stepsFill = stepsLine ? stepsLine.querySelector('i') : null;

  var ticking = false;
  function onScroll() {
    var y = window.scrollY;
    if (bar) {
      var h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    }
    var heroH = hero ? hero.offsetHeight : 600;
    if (header) header.classList.toggle('visible', y > heroH * 0.8);
    if (mcta) mcta.classList.toggle('visible', y > heroH * 0.9);
    if (stepsLine && stepsFill) {
      var r = stepsLine.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (innerHeight * 0.7 - r.top) / (r.height + innerHeight * 0.2)));
      stepsFill.style.height = (pct * 100) + '%';
    }
    if (!reduce) {
      document.querySelectorAll('[data-parallax]').forEach(function (el) {
        el.style.transform = 'translateY(' + (y * parseFloat(el.dataset.parallax) * 0.06) + 'px)';
      });
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { requestAnimationFrame(function(){ try { onScroll(); } catch(e){ ticking = false; } }); ticking = true; }
  }, { passive: true });
  safe('scroll-init', onScroll);

  /* ---- Reveal on scroll ---- */
  safe('reveal', function () {
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var d = parseInt(e.target.dataset.delay || '0', 10);
          setTimeout(function () { e.target.classList.add('in'); }, d);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }
  });

  /* ---- Hero: reveal palabra por palabra (solo el H1 visible) ---- */
  safe('heroWords', function heroWords() {
    var h1 = document.querySelector('.hero h1');
    if (!h1 || reduce) return;
    var target = [].filter.call(h1.querySelectorAll('span.h1-short, span.h1-long'), function (s) {
      return getComputedStyle(s).display !== 'none';
    })[0];
    if (!target) return;
    var frag = document.createDocumentFragment();
    [].forEach.call(target.childNodes, function walk(node) {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(function (w) {
          if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
          var s = document.createElement('span'); s.className = 'hero-word'; s.textContent = w; frag.appendChild(s);
        });
      } else { frag.appendChild(node.cloneNode(true)); }
    });
    target.innerHTML = ''; target.appendChild(frag);
    var words = target.querySelectorAll('.hero-word');
    words.forEach(function (w, i) { w.style.transitionDelay = (0.12 + i * 0.05) + 's'; });
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      words.forEach(function (w) { w.classList.add('in'); });
    }); });
  });

  /* ---- Contador +3.500 (una sola vez al entrar en viewport) ---- */
  safe('countUp', function countUp() {
    var els = document.querySelectorAll('[data-countup]');
    if (!els.length) return;
    if (reduce || !('IntersectionObserver' in window)) return; // el HTML ya trae el valor final
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io2.unobserve(e.target);
        var el = e.target, end = parseInt(el.dataset.countup, 10), t0 = performance.now();
        (function frame(t) {
          var p = Math.min(1, (t - t0) / 1400);
          el.textContent = '+' + Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString('es');
          if (p < 1) requestAnimationFrame(frame);
        })(t0);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io2.observe(el); });
  });

  /* ---- VSL: evento vsl_50 (50% visto) — se activa al pegar el embed ----
     Con YouTube: usar la IFrame API y en onStateChange muestrear getCurrentTime()/getDuration();
     con Vimeo: player.on('timeupdate', …). Al cruzar 50%: */
  window.AD_fireVsl50 = function () {
    if (window.__vsl50) return; window.__vsl50 = true;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'vsl_50' });
  };

  /* ---- Countdown: deadline funnel REAL por usuario ---- */
  safe('countdown', function countdown() {
    var box = document.getElementById('urgencia');
    if (!box) return;
    var KEY = 'ad_deadline';
    var deadline = parseInt(safeGet('localStorage', KEY) || '0', 10);
    if (!deadline || isNaN(deadline)) {
      deadline = Date.now() + DEADLINE_HOURS * 3600 * 1000;
      safeSet('localStorage', KEY, String(deadline));
    }
    var els = { d: document.getElementById('cd-d'), h: document.getElementById('cd-h'), m: document.getElementById('cd-m'), s: document.getElementById('cd-s') };
    function set(el, val) {
      var txt = String(val).padStart(2, '0');
      if (el.textContent !== txt) {
        el.textContent = txt;
        if (!reduce) { el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); }
      }
    }
    function tick() {
      var rem = deadline - Date.now();
      if (rem <= 0) {
        // Expirado: ocultar urgencia, mostrar mensaje configurado (sin countdown falso)
        document.body.classList.add('deadline-over');
        clearInterval(iv);
        return;
      }
      set(els.d, Math.floor(rem / 864e5));
      set(els.h, Math.floor(rem % 864e5 / 36e5));
      set(els.m, Math.floor(rem % 36e5 / 6e4));
      set(els.s, Math.floor(rem % 6e4 / 1e3));
    }
    tick();
    var iv = setInterval(function(){ try { tick(); } catch(e){ clearInterval(iv); } }, 1000);
  });

  /* ---- Bonos: tilt 3D suave en hover ---- */
  safe('tilt', function () {
  if (!reduce && matchMedia('(hover:hover)').matches) {
    document.querySelectorAll('.bono').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var rx = ((e.clientY - r.top) / r.height - 0.5) * -6;
        var ry = ((e.clientX - r.left) / r.width - 0.5) * 6;
        card.style.transform = 'perspective(500px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-4px)';
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }
  });

  /* ---- Testimonios: drag + snap + autoplay pausable ---- */
  safe('carousel', function carousel() {
    var track = document.getElementById('testi-track');
    if (!track) return;
    var down = false, sx = 0, sl = 0, paused = false, moved = false;
    track.addEventListener('pointerdown', function (e) { down = true; moved = false; paused = true; sx = e.clientX; sl = track.scrollLeft; track.style.cursor = 'grabbing'; });
    track.addEventListener('pointermove', function (e) { if (down) { if (Math.abs(e.clientX - sx) > 6) moved = true; track.scrollLeft = sl - (e.clientX - sx); } });
    track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      track.addEventListener(ev, function () { down = false; track.style.cursor = 'grab'; });
    });
    track.addEventListener('mouseenter', function () { paused = true; });
    track.addEventListener('mouseleave', function () { paused = false; });
    if (!reduce) {
      setInterval(function () {
        if (paused || document.hidden) return;
        var w = track.firstElementChild ? track.firstElementChild.offsetWidth + 18 : 340;
        var max = track.scrollWidth - track.clientWidth;
        track.scrollTo({ left: track.scrollLeft >= max - 10 ? 0 : track.scrollLeft + w, behavior: 'smooth' });
      }, 4000);
    }
  });

  /* ---- Testimonios: lightbox para ver la captura completa ---- */
  safe('lightbox', function () {
    document.querySelectorAll('.testi img').forEach(function (img) {
      img.addEventListener('click', function () {
        var o = document.createElement('div');
        o.setAttribute('role', 'dialog');
        o.setAttribute('aria-label', 'Testimonio ampliado — toca para cerrar');
        o.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(42,37,33,.9);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out';
        var big = document.createElement('img');
        big.src = img.src; big.alt = img.alt;
        big.style.cssText = 'max-width:min(540px,94vw);max-height:94vh;width:auto;height:auto;object-fit:contain;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.55);background:#fff';
        o.appendChild(big);
        function close() { o.remove(); document.removeEventListener('keydown', esc); }
        function esc(e) { if (e.key === 'Escape') close(); }
        o.addEventListener('click', close);
        document.addEventListener('keydown', esc);
        document.body.appendChild(o);
      });
    });
  });

  /* ---- FAQ acordeón ---- */
  safe('faq', function () {
  document.querySelectorAll('.faq').forEach(function (item) {
    var q = item.querySelector('button'), a = item.querySelector('.ans');
    if (!q || !a) return;
    q.setAttribute('aria-expanded', 'false');
    q.addEventListener('click', function () {
      var open = item.classList.toggle('open');
      a.style.maxHeight = open ? a.scrollHeight + 'px' : '0px';
      q.setAttribute('aria-expanded', String(open));
    });
  });
  });
})();
