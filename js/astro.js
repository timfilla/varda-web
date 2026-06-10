/* ============================================================
   VARDA — astro.js
   Local astronomical computation. No network required.
   Algorithms: Meeus, Astronomical Algorithms (low-precision
   series) and JPL/Standish Keplerian elements (1800–2050 AD).
   Positional accuracy ~1–5 arcmin: ample for visual astronomy.
   ============================================================ */
var VARDA = window.VARDA || {};

VARDA.astro = (function () {
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function rev(x) { x = x % 360; return x < 0 ? x + 360 : x; }
  function sind(x) { return Math.sin(x * D2R); }
  function cosd(x) { return Math.cos(x * D2R); }
  function tand(x) { return Math.tan(x * D2R); }

  // ---- Time ----
  function julianDate(date) { return date.getTime() / 86400000 + 2440587.5; }
  function centuriesJ2000(jd) { return (jd - 2451545.0) / 36525; }

  function gmst(jd) {
    var T = centuriesJ2000(jd);
    return rev(280.46061837 + 360.98564736629 * (jd - 2451545.0) +
               0.000387933 * T * T - T * T * T / 38710000);
  }
  function lst(jd, lonEastDeg) { return rev(gmst(jd) + lonEastDeg); }

  function obliquity(jd) {
    var T = centuriesJ2000(jd);
    return 23.4392911 - 0.0130042 * T - 1.64e-7 * T * T;
  }

  // ---- Coordinate transforms ----
  function eclToEq(lonDeg, latDeg, jd) {
    var e = obliquity(jd);
    var ra = Math.atan2(sind(lonDeg) * cosd(e) - tand(latDeg) * sind(e), cosd(lonDeg)) * R2D;
    var dec = Math.asin(sind(latDeg) * cosd(e) + cosd(latDeg) * sind(e) * sind(lonDeg)) * R2D;
    return { ra: rev(ra), dec: dec };
  }

  // Apparent altitude refraction (Sæmundsson), arcminutes -> degrees
  function refraction(altDeg) {
    if (altDeg < -1.5) return 0;
    return 1.02 / tand(altDeg + 10.3 / (altDeg + 5.11)) / 60;
  }

  function altAz(raDeg, decDeg, jd, latDeg, lonEastDeg, refract) {
    var H = rev(lst(jd, lonEastDeg) - raDeg);
    var alt = Math.asin(sind(latDeg) * sind(decDeg) +
                        cosd(latDeg) * cosd(decDeg) * cosd(H)) * R2D;
    var az = Math.atan2(sind(H),
                        cosd(H) * sind(latDeg) - tand(decDeg) * cosd(latDeg)) * R2D + 180;
    if (refract !== false) alt += refraction(alt);
    return { alt: alt, az: rev(az) };
  }

  function compass(azDeg) {
    var pts = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return pts[Math.round(rev(azDeg) / 22.5) % 16];
  }

  // ---- Sun (Meeus ch. 25, low precision) ----
  function sun(jd) {
    var T = centuriesJ2000(jd);
    var L0 = rev(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    var M = rev(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    var e = 0.016708634 - 0.000042037 * T;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sind(M)
          + (0.019993 - 0.000101 * T) * sind(2 * M)
          + 0.000289 * sind(3 * M);
    var trueLon = rev(L0 + C);
    var v = M + C;
    var R = 1.000001018 * (1 - e * e) / (1 + e * cosd(v)); // AU
    var eq = eclToEq(trueLon, 0, jd);
    return { lon: trueLon, ra: eq.ra, dec: eq.dec, dist: R };
  }

  // ---- Moon (Meeus ch. 47, principal terms) ----
  function moon(jd) {
    var T = centuriesJ2000(jd);
    var Lp = rev(218.3164477 + 481267.88123421 * T);
    var D  = rev(297.8501921 + 445267.1114034 * T);
    var M  = rev(357.5291092 + 35999.0502909 * T);
    var Mp = rev(134.9633964 + 477198.8675055 * T);
    var F  = rev(93.2720950 + 483202.0175233 * T);

    var lon = Lp
      + 6.288774 * sind(Mp)
      + 1.274027 * sind(2 * D - Mp)
      + 0.658314 * sind(2 * D)
      + 0.213618 * sind(2 * Mp)
      - 0.185116 * sind(M)
      - 0.114332 * sind(2 * F)
      + 0.058793 * sind(2 * D - 2 * Mp)
      + 0.057066 * sind(2 * D - M - Mp)
      + 0.053322 * sind(2 * D + Mp)
      + 0.045758 * sind(2 * D - M)
      - 0.040923 * sind(M - Mp)
      - 0.034720 * sind(D)
      - 0.030383 * sind(M + Mp);

    var lat = 5.128122 * sind(F)
      + 0.280602 * sind(Mp + F)
      + 0.277693 * sind(Mp - F)
      + 0.173237 * sind(2 * D - F)
      + 0.055413 * sind(2 * D + F - Mp)
      + 0.046271 * sind(2 * D - F - Mp);

    var dist = 385000.56
      - 20905.355 * cosd(Mp)
      - 3699.111 * cosd(2 * D - Mp)
      - 2955.968 * cosd(2 * D)
      - 569.925 * cosd(2 * Mp); // km

    var eq = eclToEq(rev(lon), lat, jd);
    return { lon: rev(lon), lat: lat, ra: eq.ra, dec: eq.dec, distKm: dist };
  }

  // Moon phase: illuminated fraction + named phase + age description
  function moonPhase(jd) {
    var s = sun(jd), m = moon(jd);
    var elong = rev(m.lon - s.lon); // 0 = new, 180 = full, waxing 0->180
    var phaseAngle = 180 - elong;   // approx
    var illum = (1 + cosd(phaseAngle)) / 2;
    var names = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
                 'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
    var idx;
    if (elong < 22.5 || elong >= 337.5) idx = 0;
    else idx = Math.floor((elong + 22.5) / 45) % 8;
    var glyphs = ['\u{1F311}','\u{1F312}','\u{1F313}','\u{1F314}','\u{1F315}','\u{1F316}','\u{1F317}','\u{1F318}'];
    return { elongation: elong, illumination: illum, name: names[idx], glyph: glyphs[idx], waxing: elong < 180 };
  }

  // ---- Planets: JPL/Standish Keplerian elements, valid 1800–2050 ----
  // [a (AU), e, I (deg), L (deg), longPeri (deg), longNode (deg)] + per-century rates
  var ELEMENTS = {
    Mercury: { el: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
               rt: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081] },
    Venus:   { el: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
               rt: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418] },
    Earth:   { el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
               rt: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0] },
    Mars:    { el: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
               rt: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343] },
    Jupiter: { el: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
               rt: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
    Saturn:  { el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
               rt: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
    Uranus:  { el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
               rt: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589] },
    Neptune: { el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
               rt: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664] }
  };

  function keplerSolve(Mdeg, e) {
    var M = rev(Mdeg) * D2R;
    var E = e < 0.8 ? M : Math.PI;
    for (var i = 0; i < 30; i++) {
      var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-9) break;
    }
    return E;
  }

  // Heliocentric J2000 ecliptic rectangular coordinates (AU)
  function helio(planet, jd) {
    var T = centuriesJ2000(jd);
    var p = ELEMENTS[planet];
    var a = p.el[0] + p.rt[0] * T,
        e = p.el[1] + p.rt[1] * T,
        I = p.el[2] + p.rt[2] * T,
        L = p.el[3] + p.rt[3] * T,
        w_ = p.el[4] + p.rt[4] * T,   // longitude of perihelion
        O = p.el[5] + p.rt[5] * T;    // longitude of ascending node
    var w = w_ - O;                   // argument of perihelion
    var M = L - w_;
    var E = keplerSolve(M, e);
    var xp = a * (Math.cos(E) - e);
    var yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    var cw = cosd(w), sw = sind(w), cO = cosd(O), sO = sind(O), ci = cosd(I), si = sind(I);
    return {
      x: (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
      y: (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
      z: (sw * si) * xp + (cw * si) * yp,
      r: Math.sqrt(xp * xp + yp * yp)
    };
  }

  var MAG = {
    Mercury: function (r, d, i) { return -0.42 + 5 * Math.log10(r * d) + 0.0380 * i - 0.000273 * i * i + 0.000002 * i * i * i; },
    Venus:   function (r, d, i) { return -4.40 + 5 * Math.log10(r * d) + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i; },
    Mars:    function (r, d, i) { return -1.52 + 5 * Math.log10(r * d) + 0.016 * i; },
    Jupiter: function (r, d, i) { return -9.40 + 5 * Math.log10(r * d) + 0.005 * i; },
    Saturn:  function (r, d, i) { return -8.88 + 5 * Math.log10(r * d) + 0.044 * i - 0.30; }, // mean ring contribution folded in
    Uranus:  function (r, d) { return -7.19 + 5 * Math.log10(r * d); },
    Neptune: function (r, d) { return -6.87 + 5 * Math.log10(r * d); }
  };

  function planet(name, jd) {
    var pl = helio(name, jd);
    var ea = helio('Earth', jd);
    var gx = pl.x - ea.x, gy = pl.y - ea.y, gz = pl.z - ea.z;
    var delta = Math.sqrt(gx * gx + gy * gy + gz * gz);   // Earth distance, AU
    var lon = rev(Math.atan2(gy, gx) * R2D);
    var lat = Math.asin(gz / delta) * R2D;
    var eq = eclToEq(lon, lat, jd);
    // phase angle (sun-planet-earth)
    var cosi = (pl.r * pl.r + delta * delta - (ea.x*ea.x + ea.y*ea.y + ea.z*ea.z)) / (2 * pl.r * delta);
    cosi = Math.max(-1, Math.min(1, cosi));
    var i = Math.acos(cosi) * R2D;
    var mag = MAG[name](pl.r, delta, i);
    return { name: name, ra: eq.ra, dec: eq.dec, distAU: delta, mag: mag, phaseAngle: i, elongLon: lon };
  }

  function allPlanets(jd) {
    return ['Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'].map(function (n) {
      return planet(n, jd);
    });
  }

  // ---- Sky state: twilight classification ----
  function skyState(jd, lat, lon) {
    var s = sun(jd);
    var pos = altAz(s.ra, s.dec, jd, lat, lon, false);
    var a = pos.alt;
    var label, key;
    if (a > 0)        { label = 'Daylight';            key = 'day'; }
    else if (a > -6)  { label = 'Civil twilight';      key = 'civil'; }
    else if (a > -12) { label = 'Nautical twilight';   key = 'nautical'; }
    else if (a > -18) { label = 'Astronomical twilight'; key = 'astro'; }
    else              { label = 'Night';               key = 'night'; }
    return { sunAlt: a, sunAz: pos.az, label: label, key: key };
  }

  // Find next time sun crosses given altitude going down (set) within 24h, step search
  function nextSunEvent(date, lat, lon, targetAlt, descending) {
    var jd0 = julianDate(date);
    var prev = altAz(sun(jd0).ra, sun(jd0).dec, jd0, lat, lon, false).alt;
    for (var m = 5; m <= 1450; m += 5) {
      var jd = jd0 + m / 1440;
      var s = sun(jd);
      var a = altAz(s.ra, s.dec, jd, lat, lon, false).alt;
      var crossed = descending ? (prev > targetAlt && a <= targetAlt)
                               : (prev < targetAlt && a >= targetAlt);
      if (crossed) {
        // refine by bisection over the 5-minute bracket
        var lo = jd - 5 / 1440, hi = jd;
        for (var k = 0; k < 20; k++) {
          var mid = (lo + hi) / 2;
          var sm = sun(mid);
          var am = altAz(sm.ra, sm.dec, mid, lat, lon, false).alt;
          if (descending ? am > targetAlt : am < targetAlt) lo = mid; else hi = mid;
        }
        return new Date(((lo + hi) / 2 - 2440587.5) * 86400000);
      }
      prev = a;
    }
    return null;
  }

  // ---- Star color from B-V index ----
  function bvColor(bv) {
    bv = Math.max(-0.4, Math.min(2.0, +bv || 0.5));
    var t = (bv + 0.4) / 2.4; // 0..1 blue->red
    var r, g, b;
    if (t < 0.4) { r = 160 + t * 237; g = 190 + t * 162; b = 255; }
    else if (t < 0.65) { r = 255; g = 245 - (t - 0.4) * 120; b = 255 - (t - 0.4) * 360; }
    else { r = 255; g = 215 - (t - 0.65) * 170; b = 165 - (t - 0.65) * 270; }
    return 'rgb(' + Math.round(Math.min(255, r)) + ',' + Math.round(Math.max(120, Math.min(255, g))) + ',' + Math.round(Math.max(90, Math.min(255, b))) + ')';
  }

  function fmtRA(ra) {
    var h = ra / 15, hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh = (hh + 1) % 24; mm = 0; }
    return (hh < 10 ? '0' : '') + hh + 'h ' + (mm < 10 ? '0' : '') + mm + 'm';
  }
  function fmtDec(d) {
    var s = d < 0 ? '\u2212' : '+'; d = Math.abs(d);
    var dd = Math.floor(d), mm = Math.round((d - dd) * 60);
    if (mm === 60) { dd += 1; mm = 0; }
    return s + dd + '\u00B0 ' + (mm < 10 ? '0' : '') + mm + '\u2032';
  }
  function fmtDeg(x) { return x.toFixed(1) + '\u00B0'; }

  return {
    julianDate: julianDate, gmst: gmst, lst: lst,
    altAz: altAz, compass: compass, refraction: refraction,
    sun: sun, moon: moon, moonPhase: moonPhase,
    planet: planet, allPlanets: allPlanets,
    skyState: skyState, nextSunEvent: nextSunEvent,
    bvColor: bvColor, rev: rev,
    fmtRA: fmtRA, fmtDec: fmtDec, fmtDeg: fmtDeg
  };
})();
