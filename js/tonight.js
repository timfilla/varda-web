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
  var pin = null;          // sticky highlight: {ra, dec, label}
  var lastArrs = {};       // arrays as last rendered, for search reveal
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

  function parseCoords(str) {
    var m = String(str).match(/-?\d+(?:\.\d+)?/g);
    if (!m || m.length < 2) return null;
    var lat = parseFloat(m[0]), lon = parseFloat(m[1]);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return [lat, lon];
  }
  function setCoordsBox() {
    root.querySelector('#t-coords').value =
      fmt4(VARDA.state.lat) + ', ' + fmt4(VARDA.state.lon);
  }

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
            '<label class="ctl-lab">Search</label>' +
            '<div class="ctl-row search-wrap">' +
              '<input id="t-search" class="input" type="text" placeholder="Star, planet, constellation, M 31\u2026" autocomplete="off">' +
              '<div id="t-dd" class="search-dd hidden"></div>' +
            '</div>' +
            '<div class="search-msg" id="t-search-msg"></div>' +
            '<label class="ctl-lab">Site</label>' +
            '<div class="ctl-row">' +
              '<select id="t-city" class="input"></select>' +
              '<button id="t-geo" class="btn btn-ghost" title="Use device location">\u25CE Locate</button>' +
            '</div>' +
            '<label class="ctl-lab">Coordinates</label>' +
            '<div class="ctl-row">' +
              '<input id="t-coords" class="input" type="text" placeholder="39.9612, -82.9988" ' +
                'title="Latitude, longitude \u2014 paste straight from Google Maps" autocomplete="off">' +
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
      VARDA.state.lat = c[1]; VARDA.state.lon = c[2];
      setCoordsBox();
      VARDA.state.locName = c[0];
      apply();
    };

    setCoordsBox();
    root.querySelector('#t-coords').onchange = function () {
      var c = parseCoords(this.value);
      if (c) {
        VARDA.state.lat = c[0]; VARDA.state.lon = c[1];
        sel.selectedIndex = 0; VARDA.state.locName = 'Custom site';
      }
      apply();   // re-normalizes the box either way
    };

    root.querySelector('#t-geo').onclick = function () {
      var btn = this; btn.textContent = '\u2026';
      if (!navigator.geolocation) { btn.textContent = 'Unavailable'; return; }
      navigator.geolocation.getCurrentPosition(function (p) {
        VARDA.state.lat = +p.coords.latitude;
        VARDA.state.lon = +p.coords.longitude;
        setCoordsBox();
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
      onSelect: function (o) {
        if (o) {
          setPin({ ra: o.ra, dec: o.dec, label: o.name || o.id });
          var r = findRow(o.name || o.id);
          if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } else setPin(null);
      }
    });

    VARDA.attachSearch(root.querySelector('#t-search'), root.querySelector('#t-dd'), function (entry) {
      var when = VARDA.state.when || new Date();
      var res = VARDA.catalog.resolveEntry(entry, when, VARDA.state.lat, VARDA.state.lon);
      var msg = root.querySelector('#t-search-msg');
      if (!res.visible) {
        msg.innerHTML = '<span class="err">\u26A0 ' + entry.label + ' is not visible at this time.</span>';
        setPin(null);
        return;
      }
      setPin({ ra: res.ra, dec: res.dec, label: entry.label });
      var keyByKind = { moon: 'solar', sun: 'solar', planet: 'solar',
                        star: 'stars', con: 'cons', dso: 'dsos' };
      var key = keyByKind[entry.kind];
      var arr = lastArrs[key] || [];
      var at = -1;
      for (var i = 0; i < arr.length; i++) {
        var o = arr[i];
        if ((o.name || o.id) === entry.label || (entry.id && o.id === entry.id)) { at = i; break; }
      }
      if (at < 0) {
        msg.innerHTML = '<span class="dim">Visible \u2014 pinned on the dome (not shown in the list).</span>';
        return;
      }
      msg.textContent = '';
      shown[key] = Math.max(shown[key] || PAGE, Math.ceil((at + 1) / PAGE) * PAGE);
      renderList();
      var rowEl = findRow(entry.label);
      if (rowEl) rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

  function findRow(label) {
    var rows = root.querySelectorAll('.obj-row');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset.obj === label) return rows[i];
    }
    return null;
  }
  function markPinned() {
    root.querySelectorAll('.obj-row').forEach(function (r) {
      r.classList.toggle('pinned', !!pin && r.dataset.obj === pin.label);
    });
  }
  function setPin(o) {
    pin = o;
    if (dome) { dome.highlight = o ? { ra: o.ra, dec: o.dec, label: o.label } : null; dome.draw(); }
    markPinned();
  }

  function syncWhenInput() {
    var d = VARDA.state.when || new Date();
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    root.querySelector('#t-when').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' +
      pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function apply() {
    var c = parseCoords(root.querySelector('#t-coords').value);
    if (c) {
      VARDA.state.lat = Math.max(-90, Math.min(90, c[0]));
      VARDA.state.lon = Math.max(-180, Math.min(180, c[1]));
    }
    setCoordsBox();
    shown = {};
    VARDA.saveState();

    var when = VARDA.state.when || new Date();
    data = C.visibleAt(when, VARDA.state.lat, VARDA.state.lon);

    dome.date = when; dome.lat = VARDA.state.lat; dome.lon = VARDA.state.lon;
    dome.highlight = pin ? { ra: pin.ra, dec: pin.dec, label: pin.label } : null;
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
    return '<div class="obj-row" data-obj="' + (o.name || o.id) +
      '" data-ra="' + o.ra.toFixed(3) + '" data-dec="' + o.dec.toFixed(3) + '">' +
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
    lastArrs.solar = solar;
    html += section('solar', 'Solar System', solar, function (o) {
      return row(o, (o.glyph ? o.glyph + ' ' : '') + o.name, o.detail);
    });
    var stars = data.stars.filter(f);
    lastArrs.stars = stars;
    html += section('stars', 'Bright Named Stars', stars, function (o) {
      return row(o, o.name, o.detail);
    });
    var cons = data.constellations;
    lastArrs.cons = cons;
    html += section('cons', 'Constellations', cons, function (o) {
      var lore = VARDA.LORE[o.id];
      return row(o, (lore ? lore.sym + ' ' : '') + o.name,
        (VARDA.CON_GEO[o.id].en !== o.name ? VARDA.CON_GEO[o.id].en + ' \u00B7 ' : '') + o.placing);
    });
    var dsos = data.dsos.filter(f);
    lastArrs.dsos = dsos;
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

    // hover previews on the dome; click pins (one at a time)
    L.querySelectorAll('.obj-row').forEach(function (r) {
      var obj = { ra: +r.dataset.ra, dec: +r.dataset.dec, label: r.dataset.obj };
      r.addEventListener('mouseenter', function () {
        if (pin) return;
        dome.highlight = obj; dome.draw();
      });
      r.addEventListener('mouseleave', function () {
        if (pin) return;
        dome.highlight = null; dome.draw();
      });
      r.addEventListener('click', function () {
        if (pin && pin.label === obj.label) setPin(null);
        else setPin(obj);
      });
    });
    markPinned();
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
