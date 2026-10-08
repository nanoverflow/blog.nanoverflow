/*
 * In-page find (vim style) for pi-cli-theme.
 *
 * On content pages (Hugo Kind "page": posts, columns, about — the flag comes
 * from the data-content-page attribute), "/" or "\" opens a find cmdline above
 * the status bar: Ctrl+F-grade case-insensitive substring search over the main
 * content. Matches may span inline elements (e.g. G<code>UI</code>): the text
 * of all nodes is concatenated, hits are located in the joined string, then
 * wrapped in <mark class="isearch"> element-by-element; a single hit may
 * therefore consist of several adjacent <mark>s that navigate as one.
 * enter/↓ jumps to the next hit, Shift+enter/N/↑ to the previous, esc closes.
 * Elsewhere "/" or "\" jumps to the global search page, and on /search/
 * itself it focuses the query input.
 */
(function () {
  'use strict';

  var script = document.getElementById('isearch-js');
  var isContentPage = !!(script && script.getAttribute('data-content-page') === 'true');
  var SEARCH_URL = (script && script.getAttribute('data-search-url')) || '/search/';

  var bar = null, input = null, countEl = null;
  var hits = [];       // [{ marks: [mark…] }]
  var allMarks = [];   // flat, for unwrapping
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
    keys.textContent = 'enter or ↓ next · ↑ prev · esc close';

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
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        go(-1);
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
    allMarks.forEach(function (m) {
      var p = m.parentNode;
      if (!p) return;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    });
    allMarks = [];
    hits = [];
    current = -1;
  }

  function collectTextNodes(root) {
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
    return nodes;
  }

  function highlight(q) {
    clearMarks();
    if (!q.length) { countEl.textContent = ''; return; }
    var root = document.querySelector('main.terminal');
    if (!root) return;

    var nodes = collectTextNodes(root);

    /* join all text and remember which node each character belongs to */
    var joined = '';
    var owner = []; // owner[i] = { node, offset } for joined[i]
    nodes.forEach(function (node) {
      var t = node.nodeValue;
      joined += t;
      for (var i = 0; i < t.length; i++) owner.push({ node: node, offset: i });
    });

    /* locate hits in the joined string */
    var lower = joined.toLowerCase();
    var ql = q.toLowerCase();
    var ranges = [];
    var idx = lower.indexOf(ql);
    while (idx !== -1) {
      ranges.push({ start: idx, end: idx + q.length });
      idx = lower.indexOf(ql, idx + 1);
    }
    if (!ranges.length) { countEl.textContent = 'no matches'; return; }

    /* wrap hits right-to-left so earlier offsets stay valid while splitting */
    for (var r = ranges.length - 1; r >= 0; r--) {
      var hit = ranges[r];

      /* group the hit's characters into per-node segments */
      var segs = [];
      for (var i = hit.start; i < hit.end; i++) {
        var o = owner[i];
        var last = segs[segs.length - 1];
        if (last && last.node === o.node && last.end === o.offset) last.end = o.offset + 1;
        else segs.push({ node: o.node, start: o.offset, end: o.offset + 1 });
      }

      var hitMarks = [];
      segs.forEach(function (s) {
        var m = document.createElement('mark');
        m.className = 'isearch';
        m.textContent = s.node.nodeValue.slice(s.start, s.end);
        var tail = s.node.splitText(s.end);
        s.node.parentNode.insertBefore(m, tail);
        hitMarks.push(m);
        allMarks.push(m);
      });
      hits.unshift({ marks: hitMarks });
    }

    current = -1;
    go(1);
  }

  function go(dir) {
    if (!hits.length) return;
    if (current >= 0 && hits[current]) {
      hits[current].marks.forEach(function (m) { m.classList.remove('current'); });
    }
    current = (current + dir + hits.length) % hits.length;
    var h = hits[current];
    h.marks.forEach(function (m) { m.classList.add('current'); });
    countEl.textContent = (current + 1) + '/' + hits.length;
    h.marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
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
