/* ============================================================
   VARDA — explorer.js
   Free-roam sky chart: pan, zoom, switch projection mode,
   scrub time, inspect objects.
   ============================================================ */
var VARDA = window.VARDA || {};

VARDA.explorer = (function () {
  var A = VARDA.astro;
  var root, view, liveTimer = null;

  function build(container) {
    root = container;
    root.innerHTML =
      '<div class="explorer-layout">' +
        '<section class="panel explorer-panel">' +
          '<div class="panel-head">' +
            '<span class="panel-title">Sky Explorer</span>' +
            '<span class="panel-sub">drag to pan \u00B7 scroll to zoom \u00B7 click objects</span>' +
          '</div>' +
          '<div class="exp-toolbar">' +
            '<div class="seg" id="x-mode">' +
              '<button data-m="horizontal" class="on">Local sky</button>' +
              '<button data-m="equatorial">Star chart</button>' +
            '</div>' +
            '<input id="x-when" class="input" type="datetime-local">' +
            '<button id="x-now" class="btn btn-accent">Now</button>' +
            '<div class="toggles">' +
              '<label class="tog"><input type="checkbox" id="x-lines" checked> Lines</label>' +
              '<label class="tog"><input type="checkbox" id="x-labels" checked> Names</label>' +
              '<label class="tog"><input type="checkbox" id="x-dso" checked> Deep sky</label>' +
              '<label class="tog"><input type="checkbox" id="x-grid"> Grid</label>' +
            '</div>' +
            '<button id="x-reset" class="btn btn-ghost">Reset view</button>' +
            '<button id="x-fs" class="btn btn-ghost" title="Full screen">\u26F6 Full screen</button>' +
          '</div>' +
          '<div class="exp-canvas-wrap">' +
            '<canvas id="x-canvas" class="exp-canvas"></canvas>' +
            '<div id="x-card" class="info-card hidden"></div>' +
            '<div id="x-readout" class="readout mono"></div>' +
          '</div>' +
        '</section>' +
      '</div>';

    view = VARDA.SkyView(root.querySelector('#x-canvas'), {
      mode: 'horizontal', center: { az: 180, alt: 45 }, fov: 110,
      interactive: true, showGrid: false,
      lat: VARDA.state.lat, lon: VARDA.state.lon,
      onSelect: showCard
    });

    // mode segment
    root.querySelectorAll('#x-mode button').forEach(function (b) {
      b.onclick = function () {
        root.querySelectorAll('#x-mode button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        var m = b.dataset.m;
        if (m === view.mode) return;
        // keep looking at the same patch of sky across mode switches
        var jd = A.julianDate(view.date);
        if (m === 'equatorial') {
          // convert current alt-az center to ra/dec
          var lst = A.lst(jd, view.lon);
          var c = view.center, D2R = Math.PI / 180;
          var sinDec = Math.sin(view.lat * D2R) * Math.sin(c.alt * D2R) +
                       Math.cos(view.lat * D2R) * Math.cos(c.alt * D2R) * Math.cos(c.az * D2R);
          var dec = Math.asin(Math.max(-1, Math.min(1, sinDec))) / D2R;
          var H = Math.atan2(Math.sin(c.az * D2R),
                  Math.cos(c.az * D2R) * Math.sin(view.lat * D2R) -
                  Math.tan(c.alt * D2R) * Math.cos(view.lat * D2R)) / D2R + 180;
          view.center = { ra: A.rev(lst - H), dec: dec };
        } else {
          var p = A.altAz(view.center.ra, view.center.dec, jd, view.lat, view.lon, false);
          view.center = { az: p.az, alt: Math.max(-20, p.alt) };
        }
        view.mode = m;
        view.draw();
      };
    });

    var whenInput = root.querySelector('#x-when');
    function syncWhen() {
      var d = view.date;
      var pad = function (x) { return (x < 10 ? '0' : '') + x; };
      whenInput.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    whenInput.onchange = function () {
      if (whenInput.value) { view.date = new Date(whenInput.value); live = false; view.draw(); }
    };
    var live = true;
    root.querySelector('#x-now').onclick = function () {
      live = true; view.date = new Date(); syncWhen(); view.draw();
    };
    liveTimer = setInterval(function () {
      if (live && VARDA.app.activeTab === 'explorer') { view.date = new Date(); syncWhen(); view.draw(); }
    }, 60000);

    root.querySelector('#x-lines').onchange = function () { view.showLines = this.checked; view.draw(); };
    root.querySelector('#x-labels').onchange = function () {
      view.showStarLabels = view.showConLabels = this.checked; view.draw();
    };
    root.querySelector('#x-dso').onchange = function () { view.showDSO = this.checked; view.draw(); };
    root.querySelector('#x-grid').onchange = function () { view.showGrid = this.checked; view.draw(); };
    root.querySelector('#x-reset').onclick = function () {
      view.fov = 110;
      view.center = view.mode === 'horizontal' ? { az: 180, alt: 45 } : { ra: 90, dec: 20 };
      view.draw();
    };

    var fsWrap = root.querySelector('.exp-canvas-wrap');
    root.querySelector('#x-fs').onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (fsWrap.requestFullscreen) fsWrap.requestFullscreen();
    };
    document.addEventListener('fullscreenchange', function () {
      requestAnimationFrame(function () { if (view) view.draw(); });
    });
    window.addEventListener('resize', function () { if (view) view.draw(); });

    syncWhen();
    view.draw();
  }

  function showCard(o) {
    var card = root.querySelector('#x-card');
    if (!o) { card.classList.add('hidden'); updateReadout(null); return; }
    var jd = A.julianDate(view.date);
    var pos = A.altAz(o.ra, o.dec, jd, view.lat, view.lon);
    var html = '<button class="card-x" onclick="this.parentNode.classList.add(\'hidden\')">\u00D7</button>';

    if (o.kind === 'con') {
      var lore = VARDA.LORE[o.id], geo = VARDA.CON_GEO[o.id];
      var bs = VARDA.catalog.brightestIn(o.id);
      html += '<div class="card-kicker">CONSTELLATION</div>' +
        '<div class="card-title">' + (lore ? lore.sym + ' ' : '') + o.name + '</div>' +
        '<div class="card-sub">' + geo.gen + (geo.en !== o.name ? ' \u00B7 \u201C' + geo.en + '\u201D' : '') + '</div>' +
        (lore ? '<div class="card-body">' + lore.myth + '</div>' : '') +
        (bs && bs[4] ? '<div class="card-row"><b>Brightest star</b> ' + bs[4] + ' (mag ' + bs[2].toFixed(1) + ')</div>' : '');
    } else if (o.kind === 'star') {
      var conN = o.con && VARDA.CON_GEO[o.con] ? VARDA.CON_GEO[o.con].name : '';
      html += '<div class="card-kicker">STAR</div>' +
        '<div class="card-title">' + o.name + '</div>' +
        '<div class="card-sub">' + (o.bayer ? o.bayer + ' ' : '') + conN + '</div>' +
        '<div class="card-row"><b>Magnitude</b> ' + o.mag.toFixed(2) + '</div>' +
        '<div class="card-row"><b>Color index</b> B\u2212V ' + (+o.bv).toFixed(2) +
        ' <span class="dot" style="background:' + A.bvColor(o.bv) + '"></span></div>' +
        '<div class="card-row"><b>Visibility</b> ' + VARDA.catalog.gearForStarMag(o.mag).label + '</div>';
    } else if (o.kind === 'dso') {
      var g = VARDA.catalog.gearForDSO(o);
      html += '<div class="card-kicker">' + (o.tname || 'DEEP SKY').toUpperCase() + '</div>' +
        '<div class="card-title">' + (o.name || o.id) + '</div>' +
        (o.name && o.id !== o.name ? '<div class="card-sub">' + o.id + '</div>' : '') +
        '<div class="card-row"><b>Magnitude</b> ' + o.mag.toFixed(1) + '</div>' +
        (o.size ? '<div class="card-row"><b>Size</b> ' + o.size + '\u2032</div>' : '') +
        '<div class="card-row"><b>Visibility</b> ' + g.label + '</div>';
    } else if (o.kind === 'planet' || o.kind === 'moon' || o.kind === 'sun') {
      html += '<div class="card-kicker">SOLAR SYSTEM</div>' +
        '<div class="card-title">' + o.name + '</div>' +
        (o.detail ? '<div class="card-sub">' + o.detail + '</div>' : '') +
        (o.mag != null ? '<div class="card-row"><b>Magnitude</b> ' + o.mag.toFixed(1) + '</div>' : '') +
        (VARDA.PLANET_NOTES[o.name] ? '<div class="card-body">' + VARDA.PLANET_NOTES[o.name] + '</div>' : '');
    }
    html += '<div class="card-row mono">' + A.fmtRA(o.ra) + ' / ' + A.fmtDec(o.dec) +
      ' \u00B7 az ' + pos.az.toFixed(0) + '\u00B0 alt ' + pos.alt.toFixed(0) + '\u00B0</div>';
    card.innerHTML = html;
    card.classList.remove('hidden');
    updateReadout(o);
  }

  function updateReadout(o) {
    var r = root.querySelector('#x-readout');
    r.textContent = o ? ('TARGET: ' + (o.name || o.id)) : '';
  }

  return {
    build: build,
    refresh: function () {
      if (view) { view.lat = VARDA.state.lat; view.lon = VARDA.state.lon; view.draw(); }
    },
    goTo: function (ra, dec) {
      if (!view) return;
      view.mode = 'equatorial';
      root.querySelectorAll('#x-mode button').forEach(function (x) {
        x.classList.toggle('on', x.dataset.m === 'equatorial');
      });
      view.center = { ra: ra, dec: dec };
      view.fov = 40;
      view.draw();
    }
  };
})();

window.VARDA = VARDA;
