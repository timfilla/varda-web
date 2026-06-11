/* ============================================================
   VARDA — search.js
   Shared type-ahead search dropdown over the object catalog.
   ============================================================ */
var VARDA = window.VARDA || {};

/* attachSearch(input, ddEl, onPick)
   onPick receives the index entry; caller resolves position/visibility. */
VARDA.attachSearch = function (input, dd, onPick) {
  var idx = VARDA.catalog.searchIndex();
  var current = [];

  function hide() { dd.classList.add('hidden'); dd.innerHTML = ''; current = []; }

  function show(matches) {
    current = matches;
    if (!matches.length) {
      dd.innerHTML = '<div class="sd-empty">No matching objects</div>';
      dd.classList.remove('hidden');
      return;
    }
    dd.innerHTML = matches.map(function (m, i) {
      return '<button class="sd-item" data-i="' + i + '">' +
        '<span class="sd-name">' + m.label + '</span>' +
        '<span class="sd-sub">' + m.sub + '</span></button>';
    }).join('');
    dd.classList.remove('hidden');
    dd.querySelectorAll('.sd-item').forEach(function (b) {
      // mousedown so the pick lands before the input's blur hides the list
      b.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        pick(current[+b.dataset.i]);
      });
    });
  }

  function pick(entry) {
    if (!entry) return;
    input.value = entry.label;
    hide();
    onPick(entry);
  }

  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) { hide(); return; }
    var starts = [], contains = [];
    for (var i = 0; i < idx.length; i++) {
      var e = idx[i];
      var at = e.q.indexOf(q);
      if (at === 0 || e.q.indexOf(' ' + q) >= 0) starts.push(e);
      else if (at > 0) contains.push(e);
      if (starts.length >= 9) break;
    }
    show(starts.concat(contains).slice(0, 9));
  });

  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); pick(current[0]); }
    if (ev.key === 'Escape') hide();
  });
  input.addEventListener('blur', function () { setTimeout(hide, 150); });
};

window.VARDA = VARDA;
