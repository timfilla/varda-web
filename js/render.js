/* ============================================================
   VARDA — render.js (v2)
   Canvas star-chart renderer. Stereographic projection with a
   proper 3-D camera basis.

   Below-horizon treatment (horizontal mode), opts.horizonStyle:
     'veil' — blur + dim everything under the horizon (sky dome)
     'dim'  — figures, labels, planets and named stars remain,
              dimmed; the faint background starfield is culled
              (Explorer's local-sky mode)
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
    horizonStyle: opts.horizonStyle || 'veil',
    showLines: opts.showLines !== false,
    showConLabels: opts.showConLabels !== false,
    showStarLabels: opts.showStarLabels !== false,
    showDSO: opts.showDSO !== false,
    showPlanets: opts.showPlanets !== false,
    showGrid: opts.showGrid || false,
    interactive: !!opts.interactive,
    onSelect: opts.onSelect || null,
    selected: null,
    highlight: null,                     // {ra, dec, label} sticky marker
    hits: []
  };

  var css = getComputedStyle(document.documentElement);
  function v(name, fallback) { return (css.getPropertyValue(name) || fallback).trim() || fallback; }
  var COL = {
    line: 'rgba(99,216,200,0.34)', lineHi: 'rgba(99,216,200,0.9)',
    conLabel: 'rgba(99,216,200,0.55)', starLabel: 'rgba(237,242,255,0.78)',
    grid: 'rgba(139,150,181,0.14)', dso: v('--nebula', '#9d8cff'),
    cardinal: v('--ion', '#f0b257'), horizon: 'rgba(240,178,87,0.55)',
    highlight: v('--ion', '#f0b257')
  };
  var DIM_A = 0.34;   // alpha for below-horizon objects in 'dim' style

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
    var p, below = false;
    if (self.mode === 'horizontal') {
      p = eqVecToHoriz(ra, dec);
      below = p[2] < -0.0087;            // ~half a degree under the horizon
    } else {
      p = dirEq(ra, dec);
    }
    var c = cam;
    var pf = p[0]*c.f[0] + p[1]*c.f[1] + p[2]*c.f[2];
    if (pf < 0.02) return null;
    var pr = p[0]*c.r[0] + p[1]*c.r[1] + p[2]*c.r[2];
    var pu = p[0]*c.u[0] + p[1]*c.u[1] + p[2]*c.u[2];
    var s = 2 / (1 + pf);
    return { x: c.cx + c.parity * pr * s * c.R, y: c.cy - pu * s * c.R, pf: pf, below: below };
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
  function dimming() { return self.mode === 'horizontal' && self.horizonStyle === 'dim'; }

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

  /* Horizon as contiguous runs of projected points. A run breaks when the
     projection fails (behind camera) or jumps across the screen — this is
     what prevents the spurious straight chord across the view. */
  function horizonRuns(w, h) {
    var runs = [], cur = [], projected = 0, samples = 0;
    var jump = Math.max(w, h) * 0.45;
    for (var az = 0; az <= 360; az += 2) {
      samples++;
      var p = projectHoriz(az, 0);
      if (p) {
        projected++;
        if (cur.length) {
          var prev = cur[cur.length - 1];
          if (Math.hypot(p.x - prev.x, p.y - prev.y) > jump) { runs.push(cur); cur = []; }
        }
        cur.push(p);
      } else if (cur.length) { runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);
    // stitch the az=360/az=0 wraparound if both ends are visible
    if (runs.length > 1) {
      var first = runs[0], last = runs[runs.length - 1];
      var a = last[last.length - 1], b = first[0];
      if (Math.hypot(a.x - b.x, a.y - b.y) < jump * 0.2) {
        runs[0] = last.concat(first);
        runs.pop();
      }
    }
    return { runs: runs, full: projected >= samples - 1 && runs.length === 1 };
  }

  function strokeHorizon(ctx, hr) {
    ctx.save();
    ctx.strokeStyle = COL.horizon;
    ctx.lineWidth = 1.5;
    hr.runs.forEach(function (run) {
      if (run.length < 2) return;
      ctx.beginPath();
      run.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      if (hr.full) ctx.closePath();
      ctx.stroke();
    });
    ctx.restore();
  }

  /* 'veil' style: blur + dim everything below the horizon. */
  function applyHorizonVeil(ctx, w, h, hr) {
    var c = self.canvas;

    function snapshot() {
      var off = document.createElement('canvas');
      off.width = c.width; off.height = c.height;
      off.getContext('2d').drawImage(c, 0, 0);
      return off;
    }

    if (hr.full) {
      var off = snapshot();
      ctx.save();
      ctx.beginPath();
      ctx.rect(-10, -10, w + 20, h + 20);
      hr.runs[0].forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.closePath();
      ctx.clip('evenodd');                 // region OUTSIDE the horizon circle
      veilFill(ctx, off, w, h);
      ctx.restore();
      return;
    }

    var run = null;
    if (hr.runs.length) {
      run = hr.runs.reduce(function (a, b) { return b.length > a.length ? b : a; });
      if (run.length < 4) run = null;
    }

    if (!run) {
      // horizon not meaningfully in view: veil everything only if looking down
      if (self.center.alt < -5) {
        var offD = snapshot();
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
        veilFill(ctx, offD, w, h);
        ctx.restore();
      }
      return;
    }

    // reference point safely below the horizon, to know which side to fill
    var D = null, alts = [-12, -25, -45, -70];
    for (var i = 0; i < alts.length && !D; i++) D = projectHoriz(self.center.az, alts[i]);
    if (!D) return;

    var off3 = snapshot();
    var a0 = run[0], a1 = run[1], b1 = run[run.length - 2], b0 = run[run.length - 1];
    function ext(p, q) {  // extend p away from q by 2500px
      var dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy) || 1;
      return { x: p.x + dx / l * 2500, y: p.y + dy / l * 2500 };
    }
    var mid = run[Math.floor(run.length / 2)];
    var dl = Math.hypot(D.x - mid.x, D.y - mid.y) || 1;
    var F = { x: mid.x + (D.x - mid.x) / dl * 4000, y: mid.y + (D.y - mid.y) / dl * 4000 };
    ctx.save();
    ctx.beginPath();
    var e0 = ext(a0, a1), e1 = ext(b0, b1);
    ctx.moveTo(e0.x, e0.y);
    run.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(e1.x, e1.y);
    ctx.lineTo(F.x, F.y);
    ctx.closePath();
    ctx.clip();
    veilFill(ctx, off3, w, h);
    ctx.restore();
  }

  function veilFill(ctx, off, w, h) {
    try { ctx.filter = 'blur(3.5px)'; } catch (e) {}
    ctx.drawImage(off, 0, 0, w, h);
    try { ctx.filter = 'none'; } catch (e) {}
    ctx.fillStyle = 'rgba(5,8,15,0.55)';
    ctx.fillRect(-450, -450, w + 900, h + 900);
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
    var dim = dimming();
    ctx.save();
    ctx.lineJoin = 'round';
    Object.keys(VARDA.CON_GEO).forEach(function (cid) {
      var c = VARDA.CON_GEO[cid];
      var hi = self.selected && self.selected.kind === 'con' && self.selected.id === cid;
      var above = [], below = [];
      c.lines.forEach(function (seg) {
        var prev = null;
        seg.forEach(function (pt) {
          var p = project(pt[0], pt[1]);
          if (p && prev) {
            ((dim && p.below && prev.below) ? below : above).push([prev, p]);
          }
          prev = p;
        });
      });
      ctx.lineWidth = hi ? 1.8 : 1.1;
      ctx.strokeStyle = hi ? COL.lineHi : COL.line;
      if (above.length) {
        ctx.beginPath();
        above.forEach(function (pr) { ctx.moveTo(pr[0].x, pr[0].y); ctx.lineTo(pr[1].x, pr[1].y); });
        ctx.stroke();
      }
      if (below.length) {
        ctx.globalAlpha = DIM_A;
        ctx.beginPath();
        below.forEach(function (pr) { ctx.moveTo(pr[0].x, pr[0].y); ctx.lineTo(pr[1].x, pr[1].y); });
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (self.showConLabels && self.fov < 160) {
        var lp = project(c.label[0], c.label[1]);
        if (lp) {
          ctx.font = '600 10.5px Michroma, sans-serif';
          ctx.fillStyle = hi ? COL.lineHi : COL.conLabel;
          ctx.textAlign = 'center';
          ctx.globalAlpha = (dim && lp.below) ? 0.42 : 1;
          ctx.fillText(c.name.toUpperCase(), lp.x, lp.y);
          ctx.globalAlpha = 1;
          if (self.interactive) self.hits.push({ x: lp.x, y: lp.y, r: 26,
            obj: { kind: 'con', id: cid, name: c.name, ra: c.label[0], dec: c.label[1] } });
        }
      }
    });
    ctx.restore();
  }

  function drawStars(ctx) {
    var lim = magLimit(), labLim = labelMagLimit(), dim = dimming();
    var stars = VARDA.STARS;
    ctx.save();
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      if (s[2] > lim) break; // sorted by magnitude
      var p = project(s[0], s[1]);
      if (!p) continue;
      var under = dim && p.below;
      if (under && !s[4]) continue;       // no background starfield under the horizon
      var r = starRadius(s[2]);
      ctx.globalAlpha = under ? DIM_A : 1;
      ctx.beginPath();
      ctx.fillStyle = A.bvColor(s[3]);
      if (s[2] < 1.2 && !under) {
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
      ctx.globalAlpha = 1;
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
    var dim = dimming();
    ctx.save();
    var maxRank = self.fov > 70 ? 2 : 5;
    VARDA.DSOS.forEach(function (d) {
      var g = VARDA.catalog.gearForDSO(d);
      if (g.rank > maxRank) return;
      var p = project(d.ra, d.dec);
      if (!p) return;
      ctx.globalAlpha = (dim && p.below) ? DIM_A : 1;
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
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  function drawSolar(ctx, jd) {
    var dim = dimming();
    ctx.save();
    function alphaFor(p) { return (dim && p.below) ? 0.45 : 1; }
    // Sun
    var s = A.sun(jd);
    var sp = project(s.ra, s.dec);
    if (sp) {
      ctx.globalAlpha = alphaFor(sp);
      ctx.beginPath();
      ctx.fillStyle = '#fff3c4';
      ctx.shadowColor = '#ffd76b'; ctx.shadowBlur = 18;
      ctx.arc(sp.x, sp.y, 9, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '11px "Space Grotesk"'; ctx.fillStyle = '#ffe9a8';
      ctx.fillText('Sun', sp.x + 12, sp.y + 4);
      ctx.globalAlpha = 1;
      if (self.interactive) self.hits.push({ x: sp.x, y: sp.y, r: 14,
        obj: { kind: 'sun', name: 'Sun', ra: s.ra, dec: s.dec } });
    }
    // Moon
    var m = A.moon(jd), ph = A.moonPhase(jd);
    var mp = project(m.ra, m.dec);
    if (mp) {
      ctx.globalAlpha = alphaFor(mp);
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
      ctx.globalAlpha = 1;
      if (self.interactive) self.hits.push({ x: mp.x, y: mp.y, r: 13,
        obj: { kind: 'moon', name: 'Moon', ra: m.ra, dec: m.dec, detail: ph.name } });
    }
    // Planets
    var PCOL = { Mercury: '#cdbfae', Venus: '#fff0cf', Mars: '#ff9d6f', Jupiter: '#f3d9a8',
                 Saturn: '#ecd9a0', Uranus: '#aee8e0', Neptune: '#8fb6ff' };
    A.allPlanets(jd).forEach(function (pl) {
      var p = project(pl.ra, pl.dec);
      if (!p) return;
      ctx.globalAlpha = alphaFor(p);
      var r = Math.max(2.6, 5.5 - pl.mag * 0.7);
      ctx.beginPath();
      ctx.fillStyle = PCOL[pl.name];
      ctx.shadowColor = PCOL[pl.name]; ctx.shadowBlur = 8;
      ctx.arc(p.x, p.y, Math.min(r, 6), 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '10.5px "Space Grotesk"';
      ctx.fillStyle = PCOL[pl.name];
      ctx.fillText(pl.name, p.x + 8, p.y + 4);
      ctx.globalAlpha = 1;
      if (self.interactive) self.hits.push({ x: p.x, y: p.y, r: 12,
        obj: { kind: 'planet', name: pl.name, mag: pl.mag, ra: pl.ra, dec: pl.dec } });
    });
    ctx.restore();
  }

  function drawHighlight(ctx) {
    var hl = self.highlight;
    if (!hl) return;
    var p = project(hl.ra, hl.dec);
    if (!p) return;
    ctx.save();
    ctx.strokeStyle = COL.highlight;
    ctx.lineWidth = 1.6;
    var r = 14;
    // four arc segments — a targeting reticle, not a closed circle
    [0.25, 1.82, 3.39, 4.96].forEach(function (a0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, a0, a0 + 1.05);
      ctx.stroke();
    });
    // tick marks
    ctx.beginPath();
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
      ctx.moveTo(p.x + d[0] * (r + 3), p.y + d[1] * (r + 3));
      ctx.lineTo(p.x + d[0] * (r + 8), p.y + d[1] * (r + 8));
    });
    ctx.stroke();
    if (hl.label) {
      ctx.font = '600 11px Michroma, sans-serif';
      ctx.fillStyle = COL.highlight;
      ctx.textAlign = 'center';
      ctx.fillText(hl.label.toUpperCase(), p.x, p.y + r + 22);
    }
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
      var hr = horizonRuns(w, h);
      if (self.horizonStyle === 'veil') applyHorizonVeil(ctx, w, h, hr);
      strokeHorizon(ctx, hr);
      drawCardinals(ctx);
    }
    drawHighlight(ctx);
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
   stage: 'figure' (lines + figure stars) | 'stars' (figure stars)
   opts.fieldStars — include the surrounding background starfield
   opts.realistic  — real-sky stage: natural field, figure stars
                     only gently emphasized
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

  // surrounding field stars
  if (opts.fieldStars) {
    var fieldLim = opts.realistic ? 6.0 : 5.6;
    VARDA.STARS.forEach(function (s) {
      if (s[2] > fieldLim) return;
      var p = prj(s[0], s[1]);
      if (!p || p.x < -5 || p.y < -5 || p.x > w + 5 || p.y > h + 5) return;
      var rr = Math.max(0.5, (6.4 - s[2]) * 0.66);
      ctx.beginPath();
      ctx.fillStyle = A.bvColor(s[3]);
      if (s[2] < 1.5 && !opts.realistic) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6; }
      else ctx.shadowBlur = 0;
      ctx.arc(p.x, p.y, rr, 0, 6.2832);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  if (stage === 'figure') {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(99,216,200,0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(99,216,200,0.7)'; ctx.shadowBlur = 8;
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

  // The figure's own stars, in every stage. Each line vertex is a real star:
  // match it to the catalog for true brightness and color.
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
      var rr, glow;
      if (opts.realistic) {
        // real-sky stage: gentle emphasis only — slightly larger, soft glow
        rr = Math.max(0.9, (6.4 - mag) * 0.78);
        glow = mag < 3.8 ? 5 : 3;
      } else {
        rr = Math.max(1.1, (6.4 - mag) * 0.72);
        glow = mag < 1.8 ? 7 : 0;
      }
      ctx.beginPath();
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = glow;
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
