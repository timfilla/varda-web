/* ============================================================
   VARDA — render.js
   Canvas star-chart renderer. Stereographic projection with a
   proper 3-D camera basis, so horizontal (alt-az) views match
   what you actually see when you look up.
   ============================================================ */
var VARDA = window.VARDA || {};

VARDA.SkyView = function (canvas, opts) {
  var A = VARDA.astro;
  var D2R = Math.PI / 180;
  opts = opts || {};

  var self = {
    canvas: canvas,
    ctx: canvas.getContext('2d'),
    mode: opts.mode || 'horizontal',     // 'horizontal' | 'equatorial'
    center: opts.center || { az: 180, alt: 89.9 },   // or {ra,dec}
    fov: opts.fov || 185,
    date: opts.date || new Date(),
    lat: opts.lat || 40, lon: opts.lon || -83,
    showLines: opts.showLines !== false,
    showConLabels: opts.showConLabels !== false,
    showStarLabels: opts.showStarLabels !== false,
    showDSO: opts.showDSO !== false,
    showPlanets: opts.showPlanets !== false,
    showGrid: opts.showGrid || false,
    interactive: !!opts.interactive,
    onSelect: opts.onSelect || null,
    selected: null,
    hits: []
  };

  var css = getComputedStyle(document.documentElement);
  function v(name, fallback) { return (css.getPropertyValue(name) || fallback).trim() || fallback; }
  var COL = {
    skyTop: '#070a14', skyBot: '#0b1020',
    ground: '#0d1117', groundLine: v('--ion', '#f0b257'),
    line: 'rgba(99,216,200,0.34)', lineHi: 'rgba(99,216,200,0.9)',
    conLabel: 'rgba(99,216,200,0.55)', starLabel: 'rgba(237,242,255,0.78)',
    grid: 'rgba(139,150,181,0.14)', dso: v('--nebula', '#9d8cff'),
    cardinal: v('--ion', '#f0b257')
  };

  // ---------- camera ----------
  var cam = null;
  function dirHoriz(az, alt) {
    return [Math.cos(alt * D2R) * Math.sin(az * D2R),
            Math.cos(alt * D2R) * Math.cos(az * D2R),
            Math.sin(alt * D2R)];
  }
  function dirEq(ra, dec) {
    return [Math.cos(dec * D2R) * Math.sin(ra * D2R),
            Math.cos(dec * D2R) * Math.cos(ra * D2R),
            Math.sin(dec * D2R)];
  }
  function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function norm(a) {
    var l = Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]) || 1;
    return [a[0]/l, a[1]/l, a[2]/l];
  }

  function buildCamera(w, h) {
    var f, parity;
    if (self.mode === 'horizontal') {
      var alt = Math.min(89.9, Math.max(-30, self.center.alt));
      f = dirHoriz(self.center.az, alt);
      parity = 1;
    } else {
      f = dirEq(self.center.ra, Math.min(89.9, Math.max(-89.9, self.center.dec)));
      parity = -1; // star charts mirror: east (increasing RA) to the left
    }
    var r = norm(cross(f, [0, 0, 1]));
    if (!isFinite(r[0]) || (r[0] === 0 && r[1] === 0 && r[2] === 0)) r = [1, 0, 0];
    var u = norm(cross(r, f));
    var half = Math.min(w, h) / 2;
    var R = half / (2 * Math.tan(self.fov * D2R / 4));
    return { f: f, r: r, u: u, R: R, parity: parity, cx: w / 2, cy: h / 2 };
  }

  // LST cached per frame for RA/Dec -> alt-az conversion
  var frameLST = 0, sinLat = 0, cosLat = 0;
  function eqVecToHoriz(ra, dec) {
    var H = (frameLST - ra) * D2R;
    var sd = Math.sin(dec * D2R), cd = Math.cos(dec * D2R);
    var sinAlt = sinLat * sd + cosLat * cd * Math.cos(H);
    var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    var az = Math.atan2(Math.sin(H), Math.cos(H) * sinLat - (sd / cd) * cosLat) + Math.PI;
    return dirHoriz(az / D2R, alt / D2R);
  }

  function project(ra, dec) {
    var p = (self.mode === 'horizontal') ? eqVecToHoriz(ra, dec) : dirEq(ra, dec);
    var c = cam;
    var pf = p[0]*c.f[0] + p[1]*c.f[1] + p[2]*c.f[2];
    if (pf < 0.02) return null;
    var pr = p[0]*c.r[0] + p[1]*c.r[1] + p[2]*c.r[2];
    var pu = p[0]*c.u[0] + p[1]*c.u[1] + p[2]*c.u[2];
    var s = 2 / (1 + pf);
    return { x: c.cx + c.parity * pr * s * c.R, y: c.cy - pu * s * c.R, pf: pf };
  }
  function projectHoriz(az, alt) {
    var p = dirHoriz(az, alt), c = cam;
    var pf = p[0]*c.f[0] + p[1]*c.f[1] + p[2]*c.f[2];
    if (pf < 0.02) return null;
    var pr = p[0]*c.r[0] + p[1]*c.r[1] + p[2]*c.r[2];
    var pu = p[0]*c.u[0] + p[1]*c.u[1] + p[2]*c.u[2];
    var s = 2 / (1 + pf);
    return { x: c.cx + c.parity * pr * s * c.R, y: c.cy - pu * s * c.R, pf: pf };
  }

  // ---------- drawing ----------
  function starRadius(mag) {
    var r = (6.6 - mag) * 0.62 * Math.pow(60 / Math.max(self.fov, 14), 0.28);
    return Math.max(0.55, Math.min(8.5, r));
  }
  function magLimit() {
    if (self.fov > 130) return 5.3;
    if (self.fov > 70) return 5.8;
    return 6.6;
  }
  function labelMagLimit() {
    if (self.fov > 130) return 1.6;
    if (self.fov > 80) return 2.3;
    if (self.fov > 45) return 3.2;
    return 6.5;
  }

  /* Below-horizon veil: the sky under the horizon stays visible but
     blurred and dimmed, applied after everything has been drawn. */
  function applyHorizonVeil(ctx, w, h) {
    var pts = [], samples = 0;
    for (var az = 0; az <= 360; az += 2) {
      samples++;
      var p = projectHoriz(az, 0);
      if (p) pts.push(p);
    }
    var full = pts.length >= samples - 1;   // entire horizon circle in view
    var c = self.canvas;

    if (pts.length > 1 || self.center.alt < 0) {
      // snapshot current render for the blurred copy
      var off = document.createElement('canvas');
      off.width = c.width; off.height = c.height;
      off.getContext('2d').drawImage(c, 0, 0);

      ctx.save();
      ctx.beginPath();
      if (full) {
        ctx.rect(-10, -10, w + 20, h + 20);
        pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
        ctx.closePath();
        ctx.clip('evenodd');                 // region OUTSIDE the horizon circle
      } else if (pts.length > 1) {
        var seg = pts.slice().sort(function (a, b) { return a.x - b.x; });
        ctx.moveTo(seg[0].x - 400, seg[0].y);
        seg.forEach(function (p) { ctx.lineTo(p.x, p.y); });
        ctx.lineTo(seg[seg.length - 1].x + 400, seg[seg.length - 1].y);
        ctx.lineTo(w + 450, h + 450);
        ctx.lineTo(-450, h + 450);
        ctx.closePath();
        ctx.clip();                          // region below the horizon curve
      } else {
        ctx.rect(0, 0, w, h);                // horizon out of frame, all below
        ctx.clip();
      }
      try { ctx.filter = 'blur(3.5px)'; } catch (e) {}
      ctx.drawImage(off, 0, 0, w, h);
      try { ctx.filter = 'none'; } catch (e) {}
      ctx.fillStyle = 'rgba(5,8,15,0.55)';
      ctx.fillRect(-450, -450, w + 900, h + 900);
      ctx.restore();
    }

    // crisp horizon line on top
    if (pts.length > 1) {
      ctx.save();
      ctx.beginPath();
      pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      if (full) ctx.closePath();
      ctx.strokeStyle = 'rgba(240,178,87,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCardinals(ctx) {
    var dirs = [[0,'N'],[45,'NE'],[90,'E'],[135,'SE'],[180,'S'],[225,'SW'],[270,'W'],[315,'NW']];
    ctx.save();
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    dirs.forEach(function (d) {
      var p = projectHoriz(d[0], 1.2);
      if (p) {
        ctx.fillStyle = COL.cardinal;
        ctx.globalAlpha = d[1].length === 1 ? 0.95 : 0.5;
        ctx.fillText(d[1], p.x, p.y);
      }
    });
    ctx.restore();
  }

  function drawGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = COL.grid;
    ctx.lineWidth = 1;
    var step = 4;
    if (self.mode === 'horizontal') {
      [15, 30, 45, 60, 75].forEach(function (alt) {
        ctx.beginPath(); var started = false;
        for (var az = 0; az <= 360; az += step) {
          var p = projectHoriz(az, alt);
          if (p) { started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); started = true; }
          else started = false;
        }
        ctx.stroke();
      });
    } else {
      for (var dec = -60; dec <= 60; dec += 30) {
        ctx.beginPath(); var st = false;
        for (var ra = 0; ra <= 360; ra += step) {
          var p = project(ra, dec);
          if (p) { st ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); st = true; } else st = false;
        }
        ctx.stroke();
      }
      for (var r2 = 0; r2 < 360; r2 += 30) {
        ctx.beginPath(); var s2 = false;
        for (var d2 = -85; d2 <= 85; d2 += step) {
          var q = project(r2, d2);
          if (q) { s2 ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); s2 = true; } else s2 = false;
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawConstellations(ctx) {
    ctx.save();
    ctx.lineWidth = 1.1;
    ctx.lineJoin = 'round';
    Object.keys(VARDA.CON_GEO).forEach(function (cid) {
      var c = VARDA.CON_GEO[cid];
      var hi = self.selected && self.selected.kind === 'con' && self.selected.id === cid;
      ctx.strokeStyle = hi ? COL.lineHi : COL.line;
      ctx.lineWidth = hi ? 1.8 : 1.1;
      c.lines.forEach(function (seg) {
        ctx.beginPath(); var st = false;
        for (var i = 0; i < seg.length; i++) {
          var p = project(seg[i][0], seg[i][1]);
          if (p) { st ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); st = true; }
          else st = false;
        }
        ctx.stroke();
      });
      if (self.showConLabels && self.fov < 160) {
        var lp = project(c.label[0], c.label[1]);
        if (lp) {
          ctx.font = '600 10.5px Michroma, sans-serif';
          ctx.fillStyle = hi ? COL.lineHi : COL.conLabel;
          ctx.textAlign = 'center';
          ctx.fillText(c.name.toUpperCase(), lp.x, lp.y);
          if (self.interactive) self.hits.push({ x: lp.x, y: lp.y, r: 26,
            obj: { kind: 'con', id: cid, name: c.name, ra: c.label[0], dec: c.label[1] } });
        }
      }
    });
    ctx.restore();
  }

  function drawStars(ctx) {
    var lim = magLimit(), labLim = labelMagLimit();
    var stars = VARDA.STARS;
    ctx.save();
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      if (s[2] > lim) break; // sorted by magnitude
      var p = project(s[0], s[1]);
      if (!p) continue;
      var r = starRadius(s[2]);
      ctx.beginPath();
      ctx.fillStyle = A.bvColor(s[3]);
      if (s[2] < 1.2) {
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 7;
      } else ctx.shadowBlur = 0;
      ctx.arc(p.x, p.y, r, 0, 6.2832);
      ctx.fill();
      if (s[4]) {
        if (self.interactive) self.hits.push({ x: p.x, y: p.y, r: Math.max(10, r + 6),
          obj: { kind: 'star', name: s[4], mag: s[2], con: s[5], bayer: s[6], ra: s[0], dec: s[1], bv: s[3] } });
        if (self.showStarLabels && s[2] <= labLim) {
          ctx.shadowBlur = 0;
          ctx.font = '11px "Space Grotesk", sans-serif';
          ctx.fillStyle = COL.starLabel;
          ctx.textAlign = 'left';
          ctx.fillText(s[4], p.x + r + 3, p.y + 3);
        }
      }
    }
    ctx.restore();
  }

  function dsoIcon(ctx, p, d) {
    ctx.strokeStyle = COL.dso;
    ctx.fillStyle = COL.dso;
    ctx.lineWidth = 1.2;
    var r = 4.5;
    ctx.beginPath();
    if (d.type === 'gc') {           // globular: circle + cross
      ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.stroke();
      ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y);
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r); ctx.stroke();
    } else if (d.type === 'oc') {    // open cluster: dotted circle
      ctx.setLineDash([2, 2]); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    } else if ('g s s0 sd e i'.indexOf(d.type) >= 0) { // galaxy: ellipse
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(0.6); ctx.scale(1, 0.45);
      ctx.beginPath(); ctx.arc(0, 0, r + 0.5, 0, 6.2832); ctx.stroke(); ctx.restore();
    } else {                         // nebulae: diamond
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r, p.y); ctx.closePath(); ctx.stroke();
    }
  }

  function drawDSOs(ctx) {
    if (self.fov > 140) return;
    ctx.save();
    var maxRank = self.fov > 70 ? 2 : 5;
    VARDA.DSOS.forEach(function (d) {
      var g = VARDA.catalog.gearForDSO(d);
      if (g.rank > maxRank) return;
      var p = project(d.ra, d.dec);
      if (!p) return;
      dsoIcon(ctx, p, d);
      if (self.interactive) self.hits.push({ x: p.x, y: p.y, r: 10,
        obj: { kind: 'dso', id: d.id, name: d.name || d.id, tname: d.tname, mag: d.mag,
               ra: d.ra, dec: d.dec, type: d.type, size: d.size } });
      if (self.fov < 55 && (d.name || d.id.indexOf('M') === 0)) {
        ctx.font = '10px "Space Grotesk", sans-serif';
        ctx.fillStyle = 'rgba(157,140,255,0.8)';
        ctx.textAlign = 'left';
        ctx.fillText(d.name || d.id, p.x + 7, p.y + 3);
      }
    });
    ctx.restore();
  }

  function drawSolar(ctx, jd) {
    ctx.save();
    // Sun
    var s = A.sun(jd);
    var sp = project(s.ra, s.dec);
    if (sp) {
      ctx.beginPath();
      ctx.fillStyle = '#fff3c4';
      ctx.shadowColor = '#ffd76b'; ctx.shadowBlur = 18;
      ctx.arc(sp.x, sp.y, 9, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '11px "Space Grotesk"'; ctx.fillStyle = '#ffe9a8';
      ctx.fillText('Sun', sp.x + 12, sp.y + 4);
      if (self.interactive) self.hits.push({ x: sp.x, y: sp.y, r: 14,
        obj: { kind: 'sun', name: 'Sun', ra: s.ra, dec: s.dec } });
    }
    // Moon
    var m = A.moon(jd), ph = A.moonPhase(jd);
    var mp = project(m.ra, m.dec);
    if (mp) {
      ctx.beginPath();
      ctx.fillStyle = '#e8ecf5';
      ctx.shadowColor = '#cdd6e8'; ctx.shadowBlur = 10;
      ctx.arc(mp.x, mp.y, 7.5, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      // phase shading
      ctx.beginPath();
      ctx.fillStyle = 'rgba(10,14,26,0.82)';
      var k = ph.illumination;
      var sw = (1 - 2 * k) * 7.5;
      if (ph.waxing) {
        ctx.arc(mp.x, mp.y, 7.5, Math.PI / 2, 3 * Math.PI / 2);
        ctx.ellipse(mp.x, mp.y, Math.abs(sw), 7.5, 0, 3 * Math.PI / 2, Math.PI / 2, sw < 0);
      } else {
        ctx.arc(mp.x, mp.y, 7.5, -Math.PI / 2, Math.PI / 2);
        ctx.ellipse(mp.x, mp.y, Math.abs(sw), 7.5, 0, Math.PI / 2, 3 * Math.PI / 2, sw < 0);
      }
      ctx.fill();
      ctx.font = '11px "Space Grotesk"'; ctx.fillStyle = '#dfe6f5';
      ctx.fillText('Moon', mp.x + 11, mp.y + 4);
      if (self.interactive) self.hits.push({ x: mp.x, y: mp.y, r: 13,
        obj: { kind: 'moon', name: 'Moon', ra: m.ra, dec: m.dec, detail: ph.name } });
    }
    // Planets
    var PCOL = { Mercury: '#cdbfae', Venus: '#fff0cf', Mars: '#ff9d6f', Jupiter: '#f3d9a8',
                 Saturn: '#ecd9a0', Uranus: '#aee8e0', Neptune: '#8fb6ff' };
    A.allPlanets(jd).forEach(function (pl) {
      var p = project(pl.ra, pl.dec);
      if (!p) return;
      var r = Math.max(2.6, 5.5 - pl.mag * 0.7);
      ctx.beginPath();
      ctx.fillStyle = PCOL[pl.name];
      ctx.shadowColor = PCOL[pl.name]; ctx.shadowBlur = 8;
      ctx.arc(p.x, p.y, Math.min(r, 6), 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '10.5px "Space Grotesk"';
      ctx.fillStyle = PCOL[pl.name];
      ctx.fillText(pl.name, p.x + 8, p.y + 4);
      if (self.interactive) self.hits.push({ x: p.x, y: p.y, r: 12,
        obj: { kind: 'planet', name: pl.name, mag: pl.mag, ra: pl.ra, dec: pl.dec } });
    });
    ctx.restore();
  }

  // ---------- main draw ----------
  self.draw = function () {
    var c = self.canvas, ctx = self.ctx;
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var jd = A.julianDate(self.date);
    frameLST = A.lst(jd, self.lon);
    sinLat = Math.sin(self.lat * D2R); cosLat = Math.cos(self.lat * D2R);
    cam = buildCamera(w, h);
    self.hits = [];

    // background
    var grad = ctx.createRadialGradient(w/2, h/2, 10, w/2, h/2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, '#0a0f1f'); grad.addColorStop(1, '#05070d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (self.showGrid) drawGrid(ctx);
    if (self.showLines) drawConstellations(ctx);
    drawStars(ctx);
    if (self.showDSO) drawDSOs(ctx);
    if (self.showPlanets) drawSolar(ctx, jd);

    if (self.mode === 'horizontal') {
      applyHorizonVeil(ctx, w, h);
      drawCardinals(ctx);
    }
  };

  // ---------- interaction ----------
  if (self.interactive) {
    var drag = null;
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, moved: false,
               c: JSON.parse(JSON.stringify(self.center)) };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      var degPerPx = self.fov / Math.min(canvas.clientWidth, canvas.clientHeight);
      if (self.mode === 'horizontal') {
        var sc = Math.max(0.2, Math.cos(self.center.alt * D2R));
        self.center.az = A.rev(drag.c.az - dx * degPerPx / sc);
        self.center.alt = Math.max(-25, Math.min(89.9, drag.c.alt + dy * degPerPx));
      } else {
        var sc2 = Math.max(0.2, Math.cos(self.center.dec * D2R));
        self.center.ra = A.rev(drag.c.ra + dx * degPerPx / sc2);
        self.center.dec = Math.max(-89.5, Math.min(89.5, drag.c.dec + dy * degPerPx));
      }
      self.draw();
    });
    canvas.addEventListener('pointerup', function (e) {
      canvas.style.cursor = 'grab';
      if (drag && !drag.moved && self.onSelect) {
        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left, my = e.clientY - rect.top;
        var best = null, bd = 18;
        self.hits.forEach(function (hh) {
          var d = Math.hypot(hh.x - mx, hh.y - my);
          if (d < Math.max(bd, hh.r) && (!best || d < bd)) { best = hh.obj; bd = d; }
        });
        self.selected = best;
        self.onSelect(best);
        self.draw();
      }
      drag = null;
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var f = Math.exp(e.deltaY * 0.0013);
      self.fov = Math.max(12, Math.min(200, self.fov * f));
      self.draw();
    }, { passive: false });
  }

  return self;
};

/* ============================================================
   Constellation card renderer (Academy lessons & quizzes).
   stage: 'figure' | 'lines' | 'stars'
   ============================================================ */
VARDA.drawConstellationCard = function (canvas, conId, stage, opts) {
  opts = opts || {};
  var A = VARDA.astro, D2R = Math.PI / 180;
  var con = VARDA.CON_GEO[conId];
  if (!con) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // center = mean of unit vectors of all vertices (handles RA wraparound)
  var vx = 0, vy = 0, vz = 0, verts = [];
  con.lines.forEach(function (seg) {
    seg.forEach(function (pt) {
      var ra = pt[0] * D2R, dec = pt[1] * D2R;
      var x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
      vx += x; vy += y; vz += z;
      verts.push([pt[0], pt[1], x, y, z]);
    });
  });
  var n = Math.sqrt(vx*vx + vy*vy + vz*vz) || 1;
  vx /= n; vy /= n; vz /= n;
  var cRA = Math.atan2(vy, vx) / D2R, cDec = Math.asin(vz) / D2R;
  // max angular distance from center
  var maxAng = 4;
  verts.forEach(function (p) {
    var dot = Math.max(-1, Math.min(1, p[2]*vx + p[3]*vy + p[4]*vz));
    maxAng = Math.max(maxAng, Math.acos(dot) / D2R);
  });
  var fov = Math.min(110, Math.max(14, maxAng * 2.55));

  // mini stereographic camera (equatorial, east-left parity)
  var f = [Math.cos(cDec*D2R)*Math.sin(cRA*D2R), Math.cos(cDec*D2R)*Math.cos(cRA*D2R), Math.sin(cDec*D2R)];
  var r0 = [f[1], -f[0], 0];
  var rl = Math.hypot(r0[0], r0[1]) || 1; r0 = [r0[0]/rl, r0[1]/rl, 0];
  var u = [ -f[2]*r0[1], f[2]*r0[0], f[0]*r0[1] - f[1]*r0[0] ];
  var half = Math.min(w, h) / 2;
  var R = half / (2 * Math.tan(fov * D2R / 4));
  function prj(ra, dec) {
    var p = [Math.cos(dec*D2R)*Math.sin(ra*D2R), Math.cos(dec*D2R)*Math.cos(ra*D2R), Math.sin(dec*D2R)];
    var pf = p[0]*f[0] + p[1]*f[1] + p[2]*f[2];
    if (pf < 0.05) return null;
    var pr = p[0]*r0[0] + p[1]*r0[1] + p[2]*r0[2];
    var pu = p[0]*u[0] + p[1]*u[1] + p[2]*u[2];
    var s = 2 / (1 + pf);
    return { x: w/2 - pr * s * R, y: h/2 - pu * s * R };
  }

  // background
  ctx.fillStyle = '#070a13';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  var g = ctx.createRadialGradient(w/2, h/2, 4, w/2, h/2, Math.max(w,h)*0.66);
  g.addColorStop(0, 'rgba(20,28,52,0.55)'); g.addColorStop(1, 'rgba(7,10,19,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // surrounding field stars (context for 'figure' and 'stars' stages)
  if (opts.fieldStars !== false) {
    VARDA.STARS.forEach(function (s) {
      if (s[2] > 5.6) return;
      var p = prj(s[0], s[1]);
      if (!p || p.x < -5 || p.y < -5 || p.x > w + 5 || p.y > h + 5) return;
      var rr = Math.max(0.5, (6.4 - s[2]) * 0.66);
      ctx.beginPath();
      ctx.fillStyle = A.bvColor(s[3]);
      if (s[2] < 1.5) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6; } else ctx.shadowBlur = 0;
      ctx.arc(p.x, p.y, rr, 0, 6.2832);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  if (stage !== 'stars') {
    // figure lines
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stage === 'figure' ? 'rgba(99,216,200,0.85)' : 'rgba(99,216,200,0.6)';
    ctx.lineWidth = stage === 'figure' ? 2 : 1.4;
    if (stage === 'figure') { ctx.shadowColor = 'rgba(99,216,200,0.7)'; ctx.shadowBlur = 8; }
    con.lines.forEach(function (seg) {
      ctx.beginPath(); var st = false;
      seg.forEach(function (pt) {
        var p = prj(pt[0], pt[1]);
        if (p) { st ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); st = true; } else st = false;
      });
      ctx.stroke();
    });
    ctx.restore();
  }

  // The figure's own stars, drawn in every stage. Each line vertex is a real
  // star: match it to the catalog for true brightness and color.
  (function drawVertexStars() {
    var seen = {};
    verts.forEach(function (vtx) {
      var key = Math.round(vtx[0] * 10) + ':' + Math.round(vtx[1] * 10);
      if (seen[key]) return;
      seen[key] = true;
      var p = prj(vtx[0], vtx[1]);
      if (!p) return;
      // nearest catalog star within ~0.5 degrees
      var best = null, bestD = 0.5;
      for (var i = 0; i < VARDA.STARS.length; i++) {
        var s = VARDA.STARS[i];
        if (s[2] > 6.2) break;     // sorted by magnitude
        var dDec = Math.abs(s[1] - vtx[1]);
        if (dDec > 0.5) continue;
        var dRA = Math.abs(s[0] - vtx[0]); if (dRA > 180) dRA = 360 - dRA;
        var d = Math.hypot(dRA * Math.cos(vtx[1] * D2R), dDec);
        if (d < bestD) { bestD = d; best = s; }
      }
      var mag = best ? best[2] : 4.6;
      var col = best ? A.bvColor(best[3]) : '#dfe6f5';
      var rr = Math.max(1.1, (6.4 - mag) * 0.72);
      ctx.beginPath();
      ctx.fillStyle = col;
      if (mag < 1.8) { ctx.shadowColor = col; ctx.shadowBlur = 7; } else ctx.shadowBlur = 0;
      ctx.arc(p.x, p.y, rr, 0, 6.2832);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  })();

  if (opts.title) {
    ctx.save();
    ctx.font = '600 13px Michroma, sans-serif';
    ctx.fillStyle = 'rgba(240,178,87,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(opts.title.toUpperCase(), w / 2, h - 12);
    ctx.restore();
  }
};

window.VARDA = VARDA;
