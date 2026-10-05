/* toc.js — scrollspy + outline bottom sheet (pi-cli-theme) */
(function () {
  var openBtn = document.getElementById('toc-open');
  var spies = Array.prototype.slice.call(document.querySelectorAll('.toc[data-scrollspy]'));
  if (!openBtn && !spies.length) { return; }

  /* ---------------- scrollspy: sync every outline (rail + sheet) ---------------- */

  var linkMap = {};
  var allLinks = [];

  spies.forEach(function (spy) {
    Array.prototype.slice.call(spy.querySelectorAll('a[href^="#"]')).forEach(function (a) {
      var id;
      try { id = decodeURIComponent(a.getAttribute('href').slice(1)); }
      catch (e) { return; }
      if (!document.getElementById(id)) { return; }
      allLinks.push(a);
      (linkMap[id] = linkMap[id] || []).push(a);
    });
  });

  var heads = Object.keys(linkMap)
    .map(function (id) { return document.getElementById(id); })
    .sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });

  var current = null;

  function setActive() {
    if (!heads.length) { return; }
    var pos = window.scrollY + 130;
    var best = null;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top + window.scrollY <= pos) { best = heads[i]; }
      else { break; }
    }
    var id = best ? best.id : null;
    if (id === current) { return; }
    current = id;

    allLinks.forEach(function (a) { a.classList.remove('active'); });
    if (id && linkMap[id]) {
      var links = linkMap[id];
      links.forEach(function (a) { a.classList.add('active'); });

      /* keep the desktop rail centered on the active item (only while visible) */
      var railInner = document.querySelector('.toc-inner');
      if (railInner && railInner.offsetParent !== null) {
        var link = links[0];
        var top = link.offsetTop - railInner.clientHeight / 2 + link.offsetHeight / 2;
        railInner.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(function () { setActive(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });
  setActive();

  /* ---------------- outline bottom sheet ---------------- */

  var sheet = document.getElementById('toc-sheet');
  var backdrop = document.getElementById('toc-backdrop');
  var closeBtn = document.getElementById('toc-close');

  function isOpen() {
    return !!(sheet && sheet.classList.contains('open'));
  }

  function openSheet() {
    if (!sheet) { return; }
    sheet.classList.add('open');
    if (backdrop) { backdrop.classList.add('open'); }
    if (openBtn) { openBtn.setAttribute('aria-expanded', 'true'); }

    setActive();
    var toc = sheet.querySelector('.toc');
    if (toc) {
      var link = toc.querySelector('a.active') || toc.querySelector('a');
      if (link) {
        toc.scrollTop = Math.max(0, link.offsetTop - toc.clientHeight / 2 + link.offsetHeight / 2);
      }
    }
    if (closeBtn) { closeBtn.focus(); }
  }

  function closeSheet() {
    if (!isOpen()) { return; }
    sheet.classList.remove('open');
    if (backdrop) { backdrop.classList.remove('open'); }
    if (openBtn) {
      openBtn.setAttribute('aria-expanded', 'false');
      if (openBtn.offsetParent !== null) { openBtn.focus(); }
    }
  }

  if (openBtn) { openBtn.addEventListener('click', openSheet); }
  if (closeBtn) { closeBtn.addEventListener('click', closeSheet); }
  if (backdrop) { backdrop.addEventListener('click', closeSheet); }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) { closeSheet(); }
  });

  if (sheet) {
    sheet.addEventListener('click', function (e) {
      if (e.target.closest('a')) { closeSheet(); }  /* jump + dismiss */
    });
  }
})();
