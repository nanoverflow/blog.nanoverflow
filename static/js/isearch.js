/*
 * In-page find (vim style) for pi-cli-theme.
 *
 * On content pages (Hugo Kind "page": posts, columns, about — the flag comes
 * from the data-content-page attribute), "/" or "\" opens a find cmdline above the
 * status bar: case-insensitive substring match over the main content, all hits
 * wrapped in <mark class="isearch">, enter/n jumps to the next hit, N to the
 * previous, esc closes. Elsewhere "/" or "\" jumps to the global search page, and on
 * /search/ itself it focuses the query input.
 */
(function () {
  'use strict';

  var script = document.getElementById('isearch-js');
  var isContentPage = !!(script && script.getAttribute('data-content-page') === 'true');
  var SEARCH_URL = (script && script.getAttribute('data-search-url')) || '/search/';

  var bar = null, input = null, countEl = null;
  var marks = [];
  var current = -1;
  var debounceTimer = null;
  var open = false;

  function buildBar() {
    bar = document.createElement('div');
    bar.id = 'find-bar';
    bar.className = 'find-bar';
    bar.hidden = true;

    var prompt = document.createElement('span');
    prompt.className = 'find-prompt';
    prompt.setAttribute('aria-hidden', 'true');
    prompt.textContent = '/';

    input = document.createElement('input');
    input.id = 'find-input';
    input.className = 'find-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'pattern';
    input.setAttribute('aria-label', 'find in page');

    countEl = document.createElement('span');
    countEl.className = 'find-count dim';

    var keys = document.createElement('span');
    keys.className = 'find-keys dim';
    keys.textContent = 'enter next · N prev · esc close';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'status-btn';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'close find');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', closeFind);

    bar.appendChild(prompt);
    bar.appendChild(input);
    bar.appendChild(countEl);
    bar.appendChild(keys);
    bar.appendChild(closeBtn);
    document.body.appendChild(bar);

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { highlight(input.value.trim()); }, 150);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        go(e.shiftKey ? -1 : 1);
      }
    });
  }

  function openFind() {
    if (!bar) buildBar();
    open = true;
    bar.hidden = false;
    input.focus();
    input.select();
  }

  function closeFind() {
    open = false;
    clearMarks();
    input.value = '';
    countEl.textContent = '';
    bar.hidden = true;
  }

  function clearMarks() {
    marks.forEach(function (m) {
      var p = m.parentNode;
      if (!p) return;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    });
    marks = [];
    current = -1;
  }

  function highlight(q) {
    clearMarks();
    if (q.length < 2) { countEl.textContent = ''; return; }
    var root = document.querySelector('main.terminal');
    if (!root) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || !n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK' || tag === 'BUTTON') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);

    var ql = q.toLowerCase();
    nodes.forEach(function (node) {
      var text = node.nodeValue;
      var lower = text.toLowerCase();
      if (lower.indexOf(ql) === -1) return;
      var frag = document.createDocumentFragment();
      var pos = 0;
      var idx = lower.indexOf(ql);
      while (idx !== -1) {
        if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
        var m = document.createElement('mark');
        m.className = 'isearch';
        m.textContent = text.slice(idx, idx + q.length);
        frag.appendChild(m);
        marks.push(m);
        pos = idx + q.length;
        idx = lower.indexOf(ql, pos);
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    });

    current = -1;
    if (marks.length) go(1);
    else countEl.textContent = 'no matches';
  }

  function go(dir) {
    if (!marks.length) return;
    if (current >= 0 && marks[current]) marks[current].classList.remove('current');
    current = (current + dir + marks.length) % marks.length;
    var m = marks[current];
    m.classList.add('current');
    countEl.textContent = (current + 1) + '/' + marks.length;
    m.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  document.addEventListener('keydown', function (e) {
    /* "/" or "\" — route: focus global search input > in-page find > global search page */
    if ((e.key === '/' || e.key === '\\') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      var g = document.getElementById('search-input');
      if (g) { e.preventDefault(); g.focus(); g.select(); return; }
      e.preventDefault();
      if (isContentPage) openFind();
      else location.href = SEARCH_URL;
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); closeFind(); return; }
    var t = e.target;
    var inInput = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (inInput || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n') { e.preventDefault(); go(1); }
    else if (e.key === 'N') { e.preventDefault(); go(-1); }
  });
})();
