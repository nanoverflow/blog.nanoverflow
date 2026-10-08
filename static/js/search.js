/*
 * Client-side search for pi-cli-theme: Fuse.js over /searchindex.json.
 * Terminal metaphor: query is a `grep -ri "pattern"` command, results are
 * rendered as the same ls-style file list used across the theme.
 */
(function () {
  'use strict';

  var script = document.getElementById('search-js');
  var input = document.getElementById('search-input');
  var statusEl = document.getElementById('search-status');
  var listEl = document.getElementById('search-results');
  if (!script || !input || !statusEl || !listEl) return;

  var INDEX_URL = script.getAttribute('data-index') || '/searchindex.json';
  var MAX_RESULTS = 20;
  var SNIPPET_RADIUS = 90;
  var fuse = null;
  var total = 0;
  var debounceTimer = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Wrap matched ranges (fuse [start, end] indices) in <mark>, escaping everything. */
  function markRanges(text, indices) {
    text = String(text);
    var out = '';
    var pos = 0;
    (indices || []).forEach(function (r) {
      var s = Math.max(r[0], pos);
      var e = r[1] + 1;
      if (s >= e || s >= text.length) return;
      out += escapeHtml(text.slice(pos, s)) + '<mark>' + escapeHtml(text.slice(s, e)) + '</mark>';
      pos = Math.min(e, text.length);
    });
    return out + escapeHtml(text.slice(pos));
  }

  /* Fuse reports matches per key; a multi-term query yields several entries. */
  function indicesFor(matches, key) {
    var all = [];
    (matches || []).forEach(function (m) {
      if (m.key === key && m.indices) all = all.concat(m.indices);
    });
    return all;
  }

  /* ±SNIPPET_RADIUS chars around the first content hit. */
  function excerpt(text, indices) {
    if (!indices.length) return escapeHtml(text.slice(0, SNIPPET_RADIUS * 2));
    var start = Math.max(0, indices[0][0] - SNIPPET_RADIUS);
    var end = Math.min(text.length, indices[0][1] + 1 + SNIPPET_RADIUS);
    var shifted = indices.map(function (r) { return [r[0] - start, r[1] - start]; });
    return (start > 0 ? '…' : '')
      + markRanges(text.slice(start, end), shifted)
      + (end < text.length ? '…' : '');
  }

  function row(doc, matches) {
    var date = /^(0001|----)/.test(doc.date) ? '----/--/--' : doc.date;
    var html = '<li>'
      + '<span class="perm" aria-hidden="true">-rw-r--r--</span>'
      + '<span class="fdate">' + escapeHtml(date) + '</span>'
      + '<a class="entry" href="' + escapeHtml(doc.href) + '">'
      + markRanges(doc.title, indicesFor(matches, 'title'))
      + '</a>';
    var desc = doc.description || '';
    if (desc) {
      desc = markRanges(desc, indicesFor(matches, 'description'));
    } else if (doc.content) {
      desc = excerpt(doc.content, indicesFor(matches, 'content'));
    }
    if (desc) html += '<div class="search-desc">' + desc + '</div>';
    return html + '</li>';
  }

  function render(query, results, ms) {
    if (!query) {
      statusEl.textContent = total + ' pages indexed — type a pattern';
      listEl.innerHTML = '';
      return;
    }
    if (!results.length) {
      statusEl.textContent = 'no matches · ' + ms + ' ms';
      listEl.innerHTML = '<li class="dim">grep: no matches for “' + escapeHtml(query) + '”</li>';
      return;
    }
    statusEl.textContent = results.length + ' hits (of ' + total + ' pages) · ' + ms + ' ms';
    listEl.innerHTML = results.map(function (r) { return row(r.item, r.matches); }).join('');
  }

  function run() {
    if (!fuse) return;
    var q = input.value.trim();
    try {
      var url = new URL(location.href);
      if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
      history.replaceState(null, '', url); /* keep ?q= shareable */
    } catch (e) { /* ignore */ }
    if (!q) { render('', [], ''); return; }
    var t0 = performance.now();
    var results = fuse.search(q, { limit: MAX_RESULTS });
    render(q, results, (performance.now() - t0).toFixed(1));
  }

  input.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, 120);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var first = listEl.querySelector('a.entry');
      if (first) location.href = first.href;
    } else if (e.key === 'Escape') {
      input.value = '';
      run();
    }
  });

  fetch(INDEX_URL)
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (docs) {
      total = docs.length;
      fuse = new Fuse(docs, {
        keys: [
          { name: 'title', weight: 3 },
          { name: 'description', weight: 2 },
          { name: 'tags', weight: 2 },
          { name: 'categories', weight: 1.5 },
          { name: 'keywords', weight: 2 },
          { name: 'content', weight: 1 }
        ],
        includeMatches: true,
        ignoreLocation: true,
        threshold: 0.35,
        minMatchCharLength: 2
      });
      var q = new URLSearchParams(location.search).get('q');
      if (q) input.value = q;
      run();
      input.focus();
    })
    .catch(function (err) {
      statusEl.textContent = 'failed to load ' + INDEX_URL + ' (' + err.message + ')';
    });
})();
