/* ============================================================
   VARDA — tonight.js
   "What can I see tonight": dome chart + categorized list +
   printable observing report.
   ============================================================ */
var VARDA = window.VARDA || {};

VARDA.tonight = (function () {
  var A = VARDA.astro, C = VARDA.catalog;
  var root, dome, data = null, refreshTimer = null;
  var gearSel = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true };
  var shown = {};
  var PAGE = 15;
  function fmt4(v) { return (+v).toFixed(4); }

  var CITIES = [
    ['Columbus, OH', 39.96, -83.00], ['Cleveland, OH', 41.50, -81.69],
    ['New York, NY', 40.71, -74.01], ['Chicago, IL', 41.88, -87.63],
    ['Denver, CO', 39.74, -104.99], ['Los Angeles, CA', 34.05, -118.24],
    ['Seattle, WA', 47.61, -122.33], ['Miami, FL', 25.76, -80.19],
    ['London, UK', 51.51, -0.13], ['Paris, France', 48.86, 2.35],
    ['Tokyo, Japan', 35.68, 139.69], ['Sydney, Australia', -33.87, 151.21],
    ['Cape Town, South Africa', -33.92, 18.42], ['S\u00E3o Paulo, Brazil', -23.55, -46.63]
  ];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function build(container) {
    root = container;
    root.innerHTML =
      '<div class="tonight-layout">' +
        '<section class="panel dome-panel">' +
          '<div class="panel-head"><span class="panel-title">Sky Dome</span>' +
            '<span class="panel-sub" id="t-dome-sub"></span></div>' +
          '<div class="dome-wrap" id="t-dome-wrap">' +
            '<canvas id="t-dome" class="dome-canvas"></canvas>' +
            '<button id="t-fs" class="fs-btn" title="Full screen">\u26F6</button>' +
          '</div>' +
          '<div class="dome-foot">Whole-sky view \u00B7 horizon at the rim \u00B7 zenith at center \u00B7 hold it overhead like a map</div>' +
        '</section>' +
        '<section class="panel controls-panel">' +
          '<div class="panel-head"><span class="panel-title">Observation Parameters</span></div>' +
          '<div class="ctl-grid">' +
            '<label class="ctl-lab">Site</label>' +
            '<div class="ctl-row">' +
              '<select id="t-city" class="input"></select>' +
              '<button id="t-geo" class="btn btn-ghost" title="Use device location">\u25CE Locate</button>' +
            '</div>' +
            '<label class="ctl-lab">Coordinates</label>' +
            '<div class="ctl-row">' +
              '<input id="t-lat" class="input input-s" type="number" step="0.0001" min="-90" max="90"> ' +
              '<input id="t-lon" class="input input-s" type="number" step="0.0001" min="-180" max="180">' +
            '</div>' +
            '<label class="ctl-lab">Time</label>' +
            '<div class="ctl-row">' +
              '<input id="t-when" class="input" type="datetime-local">' +
              '<button id="t-now" class="btn btn-accent">Now</button>' +
            '</div>' +
            '<label class="ctl-lab">Equipment</label>' +
            '<div class="ctl-row chips" id="t-chips"></div>' +
          '</div>' +
          '<div class="ctl-actions">' +
            '<button id="t-run" class="btn btn-primary">Scan the sky</button>' +
            '<button id="t-print" class="btn btn-ghost">\u{1F5A8} Print list</button>' +
          '</div>' +
          '<div id="t-summary" class="sum-box"></div>' +
        '</section>' +
        '<section class="panel list-panel" id="t-list"></section>' +
      '</div>' +
      '<div id="print-area"></div>';

    // city select
    var sel = root.querySelector('#t-city');
    sel.appendChild(el('option', null, 'Custom coordinates\u2026'));
    CITIES.forEach(function (c, i) {
      var o = el('option', null, c[0]); o.value = i; sel.appendChild(o);
    });
    sel.onchange = function () {
      if (sel.value === '' || sel.selectedIndex === 0) return;
      var c = CITIES[+sel.value];
      root.querySelector('#t-lat').value = fmt4(c[1]);
      root.querySelector('#t-lon').value = fmt4(c[2]);
      VARDA.state.locName = c[0];
      apply();
    };

    root.querySelector('#t-lat').value = fmt4(VARDA.state.lat);
    root.querySelector('#t-lon').value = fmt4(VARDA.state.lon);
    root.querySelector('#t-lat').onchange = root.querySelector('#t-lon').onchange = function () {
      sel.selectedIndex = 0; VARDA.state.locName = 'Custom site'; apply();
    };

    root.querySelector('#t-geo').onclick = function () {
      var btn = this; btn.textContent = '\u2026';
      if (!navigator.geolocation) { btn.textContent = 'Unavailable'; return; }
      navigator.geolocation.getCurrentPosition(function (p) {
        root.querySelector('#t-lat').value = fmt4(p.coords.latitude);
        root.querySelector('#t-lon').value = fmt4(p.coords.longitude);
        sel.selectedIndex = 0;
        VARDA.state.locName = 'My location';
        btn.innerHTML = '\u25CE Locate';
        apply();
      }, function () {
        btn.innerHTML = '\u25CE Blocked';
        setTimeout(function(){ btn.innerHTML = '\u25CE Locate'; }, 2200);
      }, { timeout: 8000 });
    };

    // time controls
    var whenInput = root.querySelector('#t-when');
    whenInput.onchange = function () {
      VARDA.state.when = whenInput.value ? new Date(whenInput.value) : null;
      apply();
    };
    root.querySelector('#t-now').onclick = function () {
      VARDA.state.when = null; syncWhenInput(); apply();
    };

    // gear chips: multi-select, all on by default
    var chips = root.querySelector('#t-chips');
    [['Naked eye', [0, 1]], ['Binoculars', [2]], ['Small scope', [3]],
     ['Mid scope', [4]], ['Large scope', [5]]].forEach(function (g) {
      var b = el('button', 'chip on', g[0]);
      b.setAttribute('aria-pressed', 'true');
      b.onclick = function () {
        var on = !b.classList.contains('on');
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
        g[1].forEach(function (r) { gearSel[r] = on; });
        shown = {};
        renderList();
      };
      chips.appendChild(b);
    });

    root.querySelector('#t-run').onclick = apply;
    root.querySelector('#t-print').onclick = printList;

    dome = VARDA.SkyView(root.querySelector('#t-dome'), {
      mode: 'horizontal', center: { az: 180, alt: 89.9 }, fov: 185,
      interactive: true, showGrid: false, showStarLabels: true,
      onSelect: function (o) { if (o) flashSelection(o); }
    });

    var fsWrap = root.querySelector('#t-dome-wrap');
    root.querySelector('#t-fs').onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (fsWrap.requestFullscreen) fsWrap.requestFullscreen();
    };
    document.addEventListener('fullscreenchange', function () {
      requestAnimationFrame(function () { if (dome) dome.draw(); });
    });
    window.addEventListener('resize', function () { if (dome) dome.draw(); });

    syncWhenInput();
    apply();
    refreshTimer = setInterval(function () {
      if (VARDA.state.when === null && VARDA.app.activeTab === 'tonight') { syncWhenInput(); apply(); }
    }, 60000);
  }

  function flashSelection(o) {
    var row = root.querySelector('[data-obj="' + (o.name || o.id) + '"]');
    if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.add('flash');
      setTimeout(function () { row.classList.remove('flash'); }, 1600); }
  }

  function syncWhenInput() {
    var d = VARDA.state.when || new Date();
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    root.querySelector('#t-when').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' +
      pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function apply() {
    var lat = parseFloat(root.querySelector('#t-lat').value);
    var lon = parseFloat(root.querySelector('#t-lon').value);
    if (isFinite(lat)) VARDA.state.lat = Math.max(-90, Math.min(90, lat));
    if (isFinite(lon)) VARDA.state.lon = Math.max(-180, Math.min(180, lon));
    root.querySelector('#t-lat').value = fmt4(VARDA.state.lat);
    root.querySelector('#t-lon').value = fmt4(VARDA.state.lon);
    shown = {};
    VARDA.saveState();

    var when = VARDA.state.when || new Date();
    data = C.visibleAt(when, VARDA.state.lat, VARDA.state.lon);

    dome.date = when; dome.lat = VARDA.state.lat; dome.lon = VARDA.state.lon;
    dome.draw();

    var m = data.meta;
    root.querySelector('#t-dome-sub').textContent =
      m.sky.label + ' \u00B7 LST ' + A.fmtRA(m.lst);

    // summary
    var sunNote = '';
    if (m.sky.key === 'day' || m.sky.key === 'civil') {
      var dark = A.nextSunEvent(when, VARDA.state.lat, VARDA.state.lon, -12, true);
      if (dark) sunNote = 'Good darkness from about <b>' +
        dark.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</b>. ';
    }
    var moonNote = m.moonUp
      ? 'Moon is up: ' + m.moonPhase.glyph + ' ' + m.moonPhase.name + ', ' +
        Math.round(m.moonPhase.illumination * 100) + '% lit' +
        (m.moonPhase.illumination > 0.6 ? ' \u2014 bright moonlight will wash out faint objects.' : '.')
      : 'Moon is below the horizon \u2014 good conditions for faint objects.';
    root.querySelector('#t-summary').innerHTML =
      '<div class="sum-line"><span class="sum-k">Sky</span>' + m.sky.label +
        ' (sun ' + (m.sky.sunAlt >= 0 ? '+' : '') + m.sky.sunAlt.toFixed(0) + '\u00B0)</div>' +
      '<div class="sum-line"><span class="sum-k">Moon</span>' + moonNote + '</div>' +
      (sunNote ? '<div class="sum-line"><span class="sum-k">Plan</span>' + sunNote + '</div>' : '') +
      '<div class="sum-line"><span class="sum-k">Count</span>' +
        data.solar.length + ' solar-system \u00B7 ' + data.stars.length + ' named stars \u00B7 ' +
        data.constellations.length + ' constellations \u00B7 ' + data.dsos.length + ' deep-sky</div>';

    renderList();
  }

  function gearTag(g) {
    return '<span class="gear g' + g.rank + '" title="' + g.label + '">' + g.short + '</span>';
  }
  function azaltStr(o) {
    return '<span class="mono">' + A.compass(o.az) + ' ' + o.az.toFixed(0) + '\u00B0 \u00B7 alt ' +
           o.alt.toFixed(0) + '\u00B0</span>';
  }

  function row(o, name, sub) {
    var low = o.alt < 15 ? ' <span class="low" title="Low on the horizon — needs an open view">low</span>' : '';
    return '<div class="obj-row" data-obj="' + (o.name || o.id) + '">' +
      '<div class="obj-main"><span class="obj-name">' + name + '</span>' +
      (sub ? '<span class="obj-sub">' + sub + '</span>' : '') + '</div>' +
      '<div class="obj-side">' + azaltStr(o) + low + ' ' + gearTag(o.gear) + '</div></div>';
  }

  function renderList() {
    if (!data) return;
    var L = root.querySelector('#t-list');
    var f = function (o) { return gearSel[o.gear.rank]; };
    var anyGear = [0, 1, 2, 3, 4, 5].some(function (r) { return gearSel[r]; });
    var html = '<div class="panel-head"><span class="panel-title">Visible Now</span>' +
      '<span class="panel-sub">' + (VARDA.state.locName || 'Custom site') + '</span></div>';

    function section(key, title, arr, rowFn) {
      if (!arr.length) return '';
      var lim = shown[key] || PAGE;
      var h = '<h3 class="list-h">' + title + ' <span class="count">' + arr.length + '</span></h3>';
      arr.slice(0, lim).forEach(function (o) { h += rowFn(o); });
      if (arr.length > lim) {
        var rem = arr.length - lim;
        h += '<button class="see-more" data-sec="' + key + '">See ' +
          Math.min(PAGE, rem) + ' more \u2193 <span class="dim">(' + rem + ' remaining)</span></button>';
      }
      return h;
    }

    var solar = data.solar.filter(f);
    html += section('solar', 'Solar System', solar, function (o) {
      return row(o, (o.glyph ? o.glyph + ' ' : '') + o.name, o.detail);
    });
    var stars = data.stars.filter(f);
    html += section('stars', 'Bright Named Stars', stars, function (o) {
      return row(o, o.name, o.detail);
    });
    var cons = data.constellations;
    html += section('cons', 'Constellations', cons, function (o) {
      var lore = VARDA.LORE[o.id];
      return row(o, (lore ? lore.sym + ' ' : '') + o.name,
        (VARDA.CON_GEO[o.id].en !== o.name ? VARDA.CON_GEO[o.id].en + ' \u00B7 ' : '') + o.placing);
    });
    var dsos = data.dsos.filter(f);
    html += section('dsos', 'Deep Sky', dsos, function (o) {
      return row(o, o.name, o.detail);
    });

    if (!anyGear) {
      html += '<div class="empty-note">No equipment selected \u2014 switch on at least one chip above to see objects.</div>';
    } else if (!solar.length && !stars.length && !cons.length && !dsos.length) {
      html += '<div class="empty-note">Nothing matches this equipment selection right now. Try widening it or picking a later hour.</div>';
    }
    L.innerHTML = html;
    L.querySelectorAll('.see-more').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.sec;
        shown[k] = (shown[k] || PAGE) + PAGE;
        renderList();
      };
    });
  }

  // ---------- printable report ----------
  function printList() {
    if (!data) return;
    var m = data.meta;
    var when = m.date;
    var f = function (o) { return gearSel[o.gear.rank]; };
    var fmt2 = function (x) { return x.toFixed(1); };

    function rows(arr, label) {
      if (!arr.length) return '';
      var h = '<tr class="p-section"><td colspan="5">' + label + '</td></tr>';
      arr.forEach(function (o) {
        h += '<tr><td>' + (o.name || o.id) + '</td><td>' + (o.detail || o.placing || '') + '</td>' +
          '<td class="p-num">' + fmt2(o.az) + '\u00B0 (' + A.compass(o.az) + ')</td>' +
          '<td class="p-num">' + fmt2(o.alt) + '\u00B0</td>' +
          '<td>' + o.gear.label + '</td></tr>';
      });
      return h;
    }

    var pa = document.getElementById('print-area');
    pa.innerHTML =
      '<div class="p-head">' +
        '<div class="p-brand">VARDA \u2014 NIGHT SKY OBSERVING LIST</div>' +
        '<div class="p-meta">' +
          'Site: ' + (VARDA.state.locName || 'Custom') + ' \u00B7 ' +
          'Lat ' + m.lat.toFixed(4) + '\u00B0, Lon ' + m.lon.toFixed(4) + '\u00B0<br>' +
          'Query time: ' + when.toLocaleString() + ' (local) \u00B7 ' + m.sky.label +
          ' \u00B7 LST ' + A.fmtRA(m.lst) + '<br>' +
          'Moon: ' + m.moonPhase.name + ', ' + Math.round(m.moonPhase.illumination * 100) + '% illuminated' +
          (m.moonUp ? ' (above horizon)' : ' (below horizon)') +
        '</div></div>' +
      '<table class="p-table"><thead><tr>' +
        '<th>Object</th><th>Notes</th><th>Azimuth</th><th>Altitude</th><th>Equipment</th>' +
      '</tr></thead><tbody>' +
        rows(data.solar.filter(f), 'Solar System') +
        rows(data.stars.filter(f), 'Bright Named Stars') +
        rows(data.constellations, 'Constellations') +
        rows(data.dsos.filter(f), 'Deep Sky Objects') +
      '</tbody></table>' +
      '<div class="p-foot">Azimuth measured from true north, eastward. Altitudes include atmospheric refraction. ' +
        'Generated by Varda \u2014 positions accurate to a few arcminutes; ideal for visual observing.</div>';
    window.print();
  }

  return { build: build, refresh: function () { if (root) apply(); } };
})();

window.VARDA = VARDA;
