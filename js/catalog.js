/* ============================================================
   VARDA — catalog.js
   Unified object catalog + visibility computation.
   ============================================================ */
var VARDA = window.VARDA || {};

VARDA.catalog = (function () {
  var A = VARDA.astro;

  // Equipment tiers (rank used for filtering/sorting)
  var GEAR = {
    EYE_EASY:   { rank: 0, label: 'Naked eye',                   short: 'Eye' },
    EYE_DARK:   { rank: 1, label: 'Naked eye \u00B7 dark skies', short: 'Eye*' },
    BINOC:      { rank: 2, label: 'Binoculars',                  short: 'Bino' },
    SCOPE_S:    { rank: 3, label: 'Small telescope \u00B7 60\u201390 mm',   short: 'Tel-S' },
    SCOPE_M:    { rank: 4, label: 'Mid telescope \u00B7 130\u2013200 mm',   short: 'Tel-M' },
    SCOPE_L:    { rank: 5, label: 'Large telescope \u00B7 250 mm+',        short: 'Tel-L' }
  };

  function gearForStarMag(mag) {
    if (mag <= 3.5) return GEAR.EYE_EASY;
    if (mag <= 5.7) return GEAR.EYE_DARK;
    if (mag <= 8.5) return GEAR.BINOC;
    return GEAR.SCOPE_S;
  }

  function gearForDSO(d) {
    // Effective magnitude: penalize low-surface-brightness galaxies & big nebulae
    var eff = d.mag;
    if ('g s s0 sd e i'.indexOf(d.type) >= 0 && d.size > 30) eff += 0.7;
    if (eff <= 4.0) return GEAR.EYE_EASY;
    if (eff <= 6.0) return GEAR.EYE_DARK;
    if (eff <= 8.0) return GEAR.BINOC;
    if (eff <= 9.7) return GEAR.SCOPE_S;
    if (eff <= 11.0) return GEAR.SCOPE_M;
    return GEAR.SCOPE_L;
  }

  function gearForPlanet(name, mag) {
    if (name === 'Neptune') return GEAR.BINOC;
    if (name === 'Uranus') return GEAR.EYE_DARK;
    return GEAR.EYE_EASY;
  }

  // Named bright stars for the Tonight list
  var listStars = null;
  function getListStars() {
    if (!listStars) {
      listStars = VARDA.STARS.filter(function (s) { return s[4] && s[2] <= 4.0; });
    }
    return listStars;
  }

  // Brightest star per constellation lookup (for lore cards)
  var conBright = null;
  function brightestIn(conId) {
    if (!conBright) {
      conBright = {};
      VARDA.STARS.forEach(function (s) {
        var c = s[5];
        if (!c) return;
        if (!conBright[c] || s[2] < conBright[c][2]) conBright[c] = s;
      });
    }
    return conBright[conId] || null;
  }

  /* Compute everything visible at the given moment & place.
     Returns { solar:[], stars:[], constellations:[], dsos:[], meta:{} } */
  function visibleAt(date, lat, lon) {
    var jd = A.julianDate(date);
    var out = { solar: [], stars: [], constellations: [], dsos: [] };

    function pos(ra, dec) { return A.altAz(ra, dec, jd, lat, lon); }

    // --- Solar system ---
    var moonP = A.moon(jd), phase = A.moonPhase(jd);
    var mp = pos(moonP.ra, moonP.dec);
    if (mp.alt > 0) {
      out.solar.push({
        kind: 'moon', name: 'Moon', alt: mp.alt, az: mp.az,
        mag: -12.7 + 12 * (1 - phase.illumination), // rough
        gear: GEAR.EYE_EASY,
        detail: phase.name + ' \u00B7 ' + Math.round(phase.illumination * 100) + '% lit',
        note: VARDA.PLANET_NOTES.Moon, ra: moonP.ra, dec: moonP.dec, glyph: phase.glyph
      });
    }
    A.allPlanets(jd).forEach(function (p) {
      var pp = pos(p.ra, p.dec);
      if (pp.alt > 0) {
        out.solar.push({
          kind: 'planet', name: p.name, alt: pp.alt, az: pp.az, mag: p.mag,
          gear: gearForPlanet(p.name, p.mag),
          detail: 'mag ' + p.mag.toFixed(1) + ' \u00B7 ' + p.distAU.toFixed(2) + ' AU',
          note: VARDA.PLANET_NOTES[p.name], ra: p.ra, dec: p.dec
        });
      }
    });
    out.solar.sort(function (a, b) { return a.mag - b.mag; });

    // --- Named stars ---
    getListStars().forEach(function (s) {
      var sp = pos(s[0], s[1]);
      if (sp.alt > 4) {
        out.stars.push({
          kind: 'star', name: s[4], alt: sp.alt, az: sp.az, mag: s[2],
          gear: gearForStarMag(s[2]),
          con: s[5], bayer: s[6], bv: s[3], ra: s[0], dec: s[1],
          detail: 'mag ' + s[2].toFixed(1) + (s[5] && VARDA.CON_GEO[s[5]] ? ' \u00B7 ' + VARDA.CON_GEO[s[5]].name : '')
        });
      }
    });
    out.stars.sort(function (a, b) { return a.mag - b.mag; });

    // --- Constellations ---
    Object.keys(VARDA.CON_GEO).forEach(function (cid) {
      var c = VARDA.CON_GEO[cid];
      var lp = pos(c.label[0], c.label[1]);
      // fraction of figure vertices above the horizon
      var up = 0, total = 0;
      c.lines.forEach(function (seg) {
        seg.forEach(function (pt) {
          total++;
          if (pos(pt[0], pt[1]).alt > 5) up++;
        });
      });
      var frac = total ? up / total : 0;
      if (lp.alt > 10 && frac > 0.45) {
        out.constellations.push({
          kind: 'con', id: cid, name: c.name, alt: lp.alt, az: lp.az,
          gear: GEAR.EYE_EASY, frac: frac,
          ra: c.label[0], dec: c.label[1],
          detail: c.en !== c.name ? c.en : (VARDA.LORE[cid] ? '' : ''),
          placing: lp.alt > 35 ? 'well placed' : (frac > 0.85 ? 'fully risen' : 'partly risen')
        });
      }
    });
    out.constellations.sort(function (a, b) { return b.alt - a.alt; });

    // --- Deep sky ---
    VARDA.DSOS.forEach(function (d) {
      var dp = pos(d.ra, d.dec);
      if (dp.alt > 12) {
        var g = gearForDSO(d);
        out.dsos.push({
          kind: 'dso', id: d.id, name: d.name || d.id, alt: dp.alt, az: dp.az,
          mag: d.mag, gear: g, type: d.type, tname: d.tname,
          ra: d.ra, dec: d.dec, size: d.size,
          detail: d.tname + ' \u00B7 mag ' + d.mag.toFixed(1) +
                  (d.name && d.id !== d.name ? ' \u00B7 ' + d.id : '')
        });
      }
    });
    out.dsos.sort(function (a, b) { return (a.gear.rank - b.gear.rank) || (a.mag - b.mag); });

    // --- Meta ---
    var state = A.skyState(jd, lat, lon);
    out.meta = {
      jd: jd, date: date, lat: lat, lon: lon,
      sky: state, lst: A.lst(jd, lon),
      moonPhase: phase, moonUp: mp.alt > 0, moonAlt: mp.alt
    };
    return out;
  }

  /* ---------- search ---------- */
  var sIndex = null;
  function searchIndex() {
    if (sIndex) return sIndex;
    sIndex = [];
    sIndex.push({ label: 'Moon', sub: 'Solar system', kind: 'moon', q: 'moon' });
    sIndex.push({ label: 'Sun', sub: 'Solar system \u00B7 daytime only', kind: 'sun', q: 'sun' });
    ['Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'].forEach(function (n) {
      sIndex.push({ label: n, sub: 'Planet', kind: 'planet', q: n.toLowerCase() });
    });
    VARDA.STARS.forEach(function (s) {
      if (!s[4]) return;
      var conN = s[5] && VARDA.CON_GEO[s[5]] ? VARDA.CON_GEO[s[5]].name : '';
      sIndex.push({ label: s[4], sub: 'Star \u00B7 mag ' + s[2].toFixed(1) + (conN ? ' \u00B7 ' + conN : ''),
                    kind: 'star', ra: s[0], dec: s[1], mag: s[2],
                    q: (s[4] + ' ' + (s[6] || '')).toLowerCase() });
    });
    Object.keys(VARDA.CON_GEO).forEach(function (cid) {
      var c = VARDA.CON_GEO[cid];
      sIndex.push({ label: c.name, sub: 'Constellation' + (c.en !== c.name ? ' \u00B7 ' + c.en : ''),
                    kind: 'con', id: cid, ra: c.label[0], dec: c.label[1],
                    q: (c.name + ' ' + c.en).toLowerCase() });
    });
    VARDA.DSOS.forEach(function (d) {
      var spaced = d.id.replace(/^([A-Za-z]+)\s?(\d+)$/, '$1 $2');   // M31 -> M 31
      var fused = d.id.replace(/\s+/g, '');                          // NGC 224 -> NGC224
      sIndex.push({ label: d.name || d.id, sub: d.tname + ' \u00B7 ' + d.id + ' \u00B7 mag ' + d.mag.toFixed(1),
                    kind: 'dso', id: d.id, ra: d.ra, dec: d.dec,
                    q: ((d.name || '') + ' ' + d.id + ' ' + spaced + ' ' + fused).toLowerCase() });
    });
    return sIndex;
  }

  /* Resolve a search entry to current position + visibility at date/place. */
  function resolveEntry(e, date, lat, lon) {
    var jd = A.julianDate(date);
    var ra = e.ra, dec = e.dec, minAlt = 4;
    if (e.kind === 'moon') { var m = A.moon(jd); ra = m.ra; dec = m.dec; minAlt = 0; }
    else if (e.kind === 'sun') { var s = A.sun(jd); ra = s.ra; dec = s.dec; minAlt = 0; }
    else if (e.kind === 'planet') { var p = A.planet(e.label, jd); ra = p.ra; dec = p.dec; minAlt = 0; }
    else if (e.kind === 'con') minAlt = 10;
    else if (e.kind === 'dso') minAlt = 12;
    var pos = A.altAz(ra, dec, jd, lat, lon);
    return { ra: ra, dec: dec, alt: pos.alt, az: pos.az,
             visible: pos.alt > minAlt, label: e.label, kind: e.kind };
  }

  return { GEAR: GEAR, visibleAt: visibleAt, gearForDSO: gearForDSO,
           gearForStarMag: gearForStarMag, brightestIn: brightestIn,
           getListStars: getListStars,
           searchIndex: searchIndex, resolveEntry: resolveEntry };
})();
