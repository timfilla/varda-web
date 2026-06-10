/* ============================================================
   VARDA — app.js
   Shell: shared state, tab routing, and the bridge console
   status band.
   ============================================================ */
var VARDA = window.VARDA || {};

VARDA.state = {
  lat: 40.0, lon: -83.0, locName: 'Columbus, OH',
  when: null,                // null = live "now"
  progress: {}               // constellation id -> mastery 0..3
};

VARDA.saveState = function () {
  try {
    localStorage.setItem('varda-state', JSON.stringify({
      lat: VARDA.state.lat, lon: VARDA.state.lon,
      locName: VARDA.state.locName, progress: VARDA.state.progress
    }));
  } catch (e) { /* private mode: progress simply won't persist */ }
};

VARDA.loadState = function () {
  try {
    var s = JSON.parse(localStorage.getItem('varda-state'));
    if (s) {
      if (isFinite(s.lat)) VARDA.state.lat = s.lat;
      if (isFinite(s.lon)) VARDA.state.lon = s.lon;
      if (s.locName) VARDA.state.locName = s.locName;
      if (s.progress) VARDA.state.progress = s.progress;
    }
  } catch (e) {}
};

VARDA.app = (function () {
  var A;
  var tabs = [
    { id: 'tonight',  label: 'Tonight',  sub: 'visibility scan' },
    { id: 'explorer', label: 'Explorer', sub: 'free navigation' },
    { id: 'academy',  label: 'Academy',  sub: 'constellation training' }
  ];
  var built = {};
  var app = { activeTab: 'tonight' };

  function $(s) { return document.querySelector(s); }

  app.init = function () {
    A = VARDA.astro;
    VARDA.loadState();

    // try geolocation once, silently, to improve the default site
    if (navigator.geolocation && !localStorage.getItem('varda-state')) {
      navigator.geolocation.getCurrentPosition(function (p) {
        VARDA.state.lat = +p.coords.latitude.toFixed(3);
        VARDA.state.lon = +p.coords.longitude.toFixed(3);
        VARDA.state.locName = 'My location';
        VARDA.saveState();
        refreshActive();
        var latIn = document.getElementById('t-lat'), lonIn = document.getElementById('t-lon');
        if (latIn) latIn.value = VARDA.state.lat;
        if (lonIn) lonIn.value = VARDA.state.lon;
      }, function () {}, { timeout: 6000 });
    }

    // nav rail: pills go ABOVE the footnote, at the top of the rail
    var rail = $('#nav-rail');
    var foot = rail.querySelector('.nav-foot');
    tabs.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'nav-pill' + (t.id === app.activeTab ? ' on' : '');
      b.innerHTML = '<span class="nav-label">' + t.label + '</span>' +
                    '<span class="nav-sub">' + t.sub + '</span>';
      b.onclick = function () { app.go(t.id); };
      b.dataset.tab = t.id;
      rail.insertBefore(b, foot);
    });

    app.go(app.activeTab);
    tickStatus();
    setInterval(tickStatus, 1000);
  };

  app.go = function (id) {
    app.activeTab = id;
    document.querySelectorAll('.nav-pill').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === id);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('hidden', v.id !== 'view-' + id);
    });
    var host = $('#view-' + id);
    if (!built[id]) {
      built[id] = true;
      if (id === 'tonight') VARDA.tonight.build(host);
      if (id === 'explorer') VARDA.explorer.build(host);
      if (id === 'academy') VARDA.learn.build(host);
    } else {
      refreshActive();
    }
  };

  function refreshActive() {
    if (app.activeTab === 'tonight' && built.tonight) VARDA.tonight.refresh();
    if (app.activeTab === 'explorer' && built.explorer) VARDA.explorer.refresh();
    if (app.activeTab === 'academy' && built.academy) VARDA.learn.refresh();
  }

  /* ---------- bridge console status band ---------- */
  function tickStatus() {
    var now = new Date();
    var jd = A.julianDate(now);
    var lst = A.lst(jd, VARDA.state.lon);
    var sky = A.skyState(jd, VARDA.state.lat, VARDA.state.lon);
    var ph = A.moonPhase(jd);

    $('#st-clock').textContent = now.toLocaleTimeString([], { hour12: false });
    $('#st-date').textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    $('#st-lst').textContent = A.fmtRA(lst);
    $('#st-sky').textContent = sky.label.toUpperCase();
    $('#st-sky').className = 'st-val sky-' + sky.key;
    $('#st-moon').textContent = ph.glyph + ' ' + Math.round(ph.illumination * 100) + '%';
    $('#st-site').textContent = VARDA.state.lat.toFixed(4) + '\u00B0, ' + VARDA.state.lon.toFixed(4) + '\u00B0';
  }

  return app;
})();

document.addEventListener('DOMContentLoaded', function () { VARDA.app.init(); });
window.VARDA = VARDA;
