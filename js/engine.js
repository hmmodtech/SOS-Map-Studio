window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, cv, ctx, W = 1, H = 1, dpr = 1, dirty = 1, hq = true, theme = 'cyber', tool = 'select', addType = 'building',
    sel = null, meas = [], hits = [], labels = [], mouse = { x: 0, y: 0 }, drag = null, ptrs = {}, icons = {};
  var cam = { cx: 0, cy: 0, zoom: 1, base: 3, yaw: 0, pitch: 45 };
  var layers = { fence: 1, build: 1, tent: 1, solar: 1, trees: 1, labels: 1, grid: 1, routes: 1 };
  var LAY = { fence: 'fence', building: 'build', medical: 'build', security: 'build', gate: 'build', assembly: 'build', vehicle: 'build', extinguisher: 'build',
    camera: 'build', custom: 'build', pool: 'build', cottage: 'tent', tent: 'tent', solar: 'solar', hazard: 'solar', diesel_tank: 'solar',
    olive_zone: 'trees', yard: 'trees', road: 'trees', field: 'trees', playground: 'trees', parking: 'trees', tree: 'trees' };
  var TIER = { yard: 0, road: 0, parking: 0, fence: 1, field: 1, playground: 1 };
  var DEF = {
    building: { w: 20, d: 12, h: 9, fl: 3, roof: 'flat', col: '#3b4c5e' },
    cottage: { w: 6, d: 5, h: 3, fl: 1, roof: 'red_tile', col: '#c8935a' },
    tent: { w: 8, d: 5, h: 3.5, fl: 1, roof: 'pyramid', col: '#9aa8b8' },
    pool: { w: 12, d: 6, h: 3.2, fl: 1, roof: 'quonset', col: '#2b88d8' },
    playground: { w: 10, d: 8, h: 2.2, fl: 1, roof: 'flat', col: '#d4a359' },
    parking: { w: 12, d: 7, h: 0.1, fl: 1, roof: 'flat', col: '#8d96a0' },
    diesel_tank: { w: 6, d: 4, h: 2.4, fl: 1, roof: 'flat', col: '#c8cfd6' },
    solar: { w: 12, d: 6, h: 1.5, fl: 1, roof: 'flat', col: '#1e50c8' }
  };
  var PCOL = { tree: '#3f8f2f', vehicle: '#e8c84a', extinguisher: '#ff3c3c', camera: '#00d9ff', custom: '#8aa0b5' };
  var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

  function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sc() { return cam.base * cam.zoom; }
  function isPr() { return theme === 'print'; }
  function P(x, y, z) {
    var a = cam.yaw * D, t = cam.pitch * D, dx = x - cam.cx, dy = y - cam.cy, s = sc(),
      rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
    return [W / 2 + rx * s, H / 2 - ry * s * Math.cos(t) - (z || 0) * s * Math.sin(t), ry];
  }
  function inv(sx, sy) {
    var a = cam.yaw * D, t = cam.pitch * D, s = sc(), rx = (sx - W / 2) / s, ry = -(sy - H / 2) / (s * Math.cos(t)), c = Math.cos(a), n = Math.sin(a);
    return { x: cam.cx + rx * c + ry * n, y: cam.cy - rx * n + ry * c };
  }
  function g0(p) { return P(p.x, p.y, 0); }
  function S2(p, z) { var q = P(p.x, p.y, z); return { x: q[0], y: q[1] }; }
  function path(a, close) { ctx.beginPath(); a.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); if (close) ctx.closePath(); }
  function fillPoly(a, fill, stroke) { path(a, 1); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }
  function line(u, v) { ctx.beginPath(); ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); ctx.stroke(); }
  function shade(hex, k) {
    if (!hex || hex[0] !== '#' || hex.length !== 7) return hex || '#888888';
    var n = parseInt(hex.slice(1), 16);
    return 'rgb(' + cl((n >> 16 & 255) * k | 0, 0, 255) + ',' + cl((n >> 8 & 255) * k | 0, 0, 255) + ',' + cl((n & 255) * k | 0, 0, 255) + ')';
  }
  function cen(a) { var x = 0, y = 0; a.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / a.length, y: y / a.length }; }
  function bb(a) { var b = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; a.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }); return b; }
  function area(a) { var s = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length]; s += a[i].x * q.y - q.x * a[i].y; } return Math.abs(s) / 2; }
  function inP(x, y, a) {
    var r = false;
    for (var i = 0, j = a.length - 1; i < a.length; j = i++)
      if ((a[i].y > y) !== (a[j].y > y) && x < (a[j].x - a[i].x) * (y - a[i].y) / (a[j].y - a[i].y) + a[i].x) r = !r;
    return r;
  }
  function dSeg(px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1, t = cl(((px - a.x) * dx + (py - a.y) * dy) / l, 0, 1);
    return Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
  }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function pts(f) {
    var r = (f.rotationDeg || 0) * D, c = Math.cos(r), n = Math.sin(r), m = f.center;
    return f.coordsMetric.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
  }
  function getSel() { return St.project.features.filter(function (f) { return f.id === sel; })[0] || null; }
  function icon(f) {
    var k = f.customIconBase64; if (!k) return null;
    var i = icons[k];
    if (!i) { i = icons[k] = new Image(); i.onload = function () { dirty = 1; }; i.src = k; }
    return i.complete && i.naturalWidth ? i : null;
  }
  function dropShadow(a, h) {
    if (!isPr() || !(h > 0.2)) return;
    var dx = h * 0.42, dy = -h * 0.34;
    fillPoly(a.map(function (p) { return P(p.x + dx, p.y + dy, 0); }), 'rgba(40,34,24,0.22)');
  }
  function drawCrescent(cx, cy, r) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#991b1b'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - r * 0.08, cy, r * 0.66, 0, 6.3); ctx.fillStyle = '#d62828'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.22, cy, r * 0.56, 0, 6.3); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  function isDiesel(f) {
    return f.category === 'diesel_tank' || (f.category === 'hazard' && /diesel|fuel|سولار/i.test((f.en_name || '') + ' ' + (f.ar_name || '') + ' ' + (f.id || '')));
  }

  function extrude(a, h, col, fl, o) {
    o = o || {};
    var pr = isPr(), n = a.length, ws = [], i, k, wk = o.wk || (pr ? .92 : .5),
      win = o.win === undefined ? (pr ? '#4f8ec9' : 'rgba(0,217,255,.5)') : o.win,
      ink = o.edge || (pr ? '#2b3440' : shade(col, 1));
    function at(w, t, z) { return P(w.p.x + (w.q.x - w.p.x) * t, w.p.y + (w.q.y - w.p.y) * t, z); }
    for (i = 0; i < n; i++) {
      var p = a[i], q = a[(i + 1) % n];
      ws.push({ p: p, q: q, d: P((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], L: Math.hypot(q.x - p.x, q.y - p.y), g: Math.atan2(q.y - p.y, q.x - p.x) + cam.yaw * D });
    }
    ws.sort(function (u, v) { return v.d - u.d; });
    ws.forEach(function (w) {
      fillPoly([at(w, 0, 0), at(w, 1, 0), at(w, 1, h), at(w, 0, h)], shade(col, wk * (.82 + .18 * Math.abs(Math.sin(w.g)))), ink);
      ctx.strokeStyle = o.ln || (pr ? '#475569' : shade(col, .85));
      for (k = 1; k < fl; k++) line(at(w, 0, h * k / fl), at(w, 1, h * k / fl));
      if (win && hq && w.L > 3 && sc() > 1.1)
        for (k = 0; k < fl; k++) for (var s = 1; s < w.L - 2; s += 2.6)
          fillPoly([at(w, s / w.L, h * (k + .28) / fl), at(w, (s + 1.4) / w.L, h * (k + .28) / fl), at(w, (s + 1.4) / w.L, h * (k + .72) / fl), at(w, s / w.L, h * (k + .72) / fl)], win, pr ? '#223244' : null);
      if (o.stripe) for (var s2 = 0, j = 0; s2 < w.L; s2++, j++) {
        var t0 = s2 / w.L, t1 = Math.min(1, (s2 + 1) / w.L);
        fillPoly([at(w, t0, h * .1), at(w, t1, h * .1), at(w, Math.min(1, t1 + .5 / w.L), h * .3), at(w, Math.min(1, t0 + .5 / w.L), h * .3)], j % 2 ? '#e8c84a' : '#ff3c3c');
      }
    });
  }
  function roof(a, h, col, type, rc) {
    var pr = isPr(), c = cen(a), n = a.length, i, ink = pr ? '#2b3440' : col;
    if (type === 'quonset') {
      for (i = 0; i < 5; i++) {
        var t = i / 5 * Math.PI / 2, s = Math.cos(t), z = h + Math.sin(t) * Math.max(1.4, h * .55);
        fillPoly(a.map(function (p) { return P(c.x + (p.x - c.x) * s, c.y + (p.y - c.y) * s, z); }), pr ? shade(rc || '#e9edf2', .88 + i * .03) : shade(col, .6 + i * .07), pr ? '#475569' : col);
      }
      return;
    }
    if (type === 'pyramid' || type === 'red_tile') {
      var ap = P(c.x, c.y, h + Math.max(1.4, h * .48)), es = [], red = type === 'red_tile';
      for (i = 0; i < n; i++) { var p = a[i], q = a[(i + 1) % n]; es.push({ p: p, q: q, d: P((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], i: i }); }
      es.sort(function (u, v) { return v.d - u.d; });
      es.forEach(function (e) {
        var fc = red ? shade(pr ? '#cf4b43' : '#c0502d', .82 + .07 * (e.i % 3)) : shade(rc || col, pr ? (.9 + .04 * (e.i % 3)) : (.7 + .1 * (e.i % 3)));
        fillPoly([P(e.p.x, e.p.y, h), P(e.q.x, e.q.y, h), ap], fc, pr ? '#333d47' : (red ? '#ff8a5c' : col));
      });
      return;
    }
    fillPoly(a.map(function (p) { return P(p.x, p.y, h); }), rc || shade(col, pr ? 1.04 : .8), pr ? '#2b3440' : (rc ? '#89a4be' : col));
  }
  function pulse(p) {
    if (isPr()) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, 6.3); ctx.fillStyle = '#e8c84a'; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#b91c1c'; ctx.stroke(); return;
    }
    var k = .5 + .5 * Math.sin(Date.now() / 350), r = 2.5 + 2 * k;
    ctx.beginPath(); ctx.arc(p[0], p[1], r + 2, 0, 6.3); ctx.fillStyle = 'rgba(255,60,60,' + (.15 + .25 * k) + ')'; ctx.fill();
    ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, 6.3); ctx.fillStyle = '#e8c84a'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#ff3c3c'; ctx.stroke();
  }
  function drawTreeAt(x, y, col, radM) {
    var pr = isPr(), s = sc(), r = Math.max(2.5, (radM || 1.7) * s);
    if (pr) {
      var sh = P(x + 1.1, y - 0.9, 0);
      ctx.beginPath(); ctx.arc(sh[0], sh[1], r * .95, 0, 6.3); ctx.fillStyle = 'rgba(45,40,28,0.22)'; ctx.fill();
      var u0 = P(x, y, 0), v0 = P(x, y, 1.8); ctx.strokeStyle = '#5c4028'; ctx.lineWidth = Math.max(1.5, .28 * s); line(u0, v0);
      var t0 = P(x, y, 2.7), t1 = P(x - .55, y + .3, 2.9), t2 = P(x + .5, y - .2, 3.0);
      ctx.lineWidth = .9;
      ctx.beginPath(); ctx.arc(t0[0], t0[1], r * .95, 0, 6.3); ctx.fillStyle = '#476b2d'; ctx.fill(); ctx.strokeStyle = '#283d19'; ctx.stroke();
      ctx.beginPath(); ctx.arc(t1[0], t1[1], r * .72, 0, 6.3); ctx.fillStyle = '#5c843c'; ctx.fill();
      ctx.beginPath(); ctx.arc(t2[0], t2[1], r * .62, 0, 6.3); ctx.fillStyle = '#739c4c'; ctx.fill();
      return;
    }
    var u = P(x, y, 0), v = P(x, y, 2.2); ctx.strokeStyle = '#6b4a2a'; line(u, v);
    ctx.beginPath(); ctx.arc(v[0], v[1], Math.max(2, (radM || 1.6) * s), 0, 6.3); ctx.fillStyle = col || '#3f8f2f'; ctx.fill();
  }
  function dpoint(f) {
    var pr = isPr(), p = f.coordsMetric[0] || f.center, c = f.color || '#39ff14', cat = f.category, s = sc(), r = (f.rotationDeg || 0) * D, i, u, v;
    if (cat === 'assembly') {
      var ring = [];
      for (i = 0; i < 36; i++) ring.push(P(p.x + 6 * Math.cos(i / 36 * 6.2832), p.y + 6 * Math.sin(i / 36 * 6.2832), 0));
      if (pr) {
        fillPoly(ring, 'rgba(22,163,74,0.22)', '#15803d');
        u = P(p.x, p.y, 0);
        ctx.beginPath(); ctx.arc(u[0], u[1], Math.max(9, 2.4 * s), 0, 6.3); ctx.fillStyle = '#15803d'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('A', u[0], u[1] + 4);
      } else {
        if (hq) { ctx.shadowColor = '#00d9ff'; ctx.shadowBlur = 14; }
        ctx.globalAlpha = .25; fillPoly(ring, '#00d9ff'); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 2; path(ring, 1); ctx.stroke(); ctx.shadowBlur = 0;
        u = P(p.x, p.y, 0); ctx.fillStyle = '#00d9ff'; ctx.font = 'bold 14px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('A', u[0], u[1] + 5);
      }
    } else if (cat === 'vehicle') {
      var cs = Math.cos(r), sn = Math.sin(r), box = [[-5, -1.25], [5, -1.25], [5, 1.25], [-5, 1.25]].map(function (q) { return { x: p.x + q[0] * cs - q[1] * sn, y: p.y + q[0] * sn + q[1] * cs }; });
      dropShadow(box, 3);
      if (pr) {
        extrude(box, 1.3, '#1e5aa8', 1, { wk: 1, edge: '#1b2838', win: null });
        var hi = box;
        extrude(hi, 2.9, '#eef2f6', 1, { wk: .96, edge: '#1b2838', win: '#3b6d9c' });
        roof(box, 2.9, '#ffffff', 'flat', '#f8fafc');
      } else {
        extrude(box, 3, c, 1); roof(box, 3, c, 'flat');
      }
    } else if (cat === 'tree') {
      drawTreeAt(p.x, p.y, c, 1.8);
    } else if (cat === 'extinguisher') {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, .9); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(4, .4 * s); ctx.strokeStyle = '#dc2626'; line(u, v); ctx.lineCap = 'butt'; ctx.lineWidth = 1.3;
    } else if (cat === 'camera') {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, 3.2); ctx.strokeStyle = pr ? '#475569' : '#8899aa'; line(u, v); ctx.fillStyle = pr ? '#1e293b' : c; ctx.fillRect(v[0] - 6, v[1] - 4, 12, 8);
    } else {
      u = P(p.x, p.y, 0); v = P(p.x, p.y, 2.5); ctx.strokeStyle = pr ? '#1e293b' : c; line(u, v); ctx.beginPath(); ctx.arc(v[0], v[1], 6, 0, 6.3); ctx.fillStyle = c; ctx.fill();
    }
  }
  function rmode(f) { return f.renderMode || (area(f.coordsMetric) > 45 ? 'auto' : 'solid'); }
  function bcol(f) { var c = (f.color || '').toLowerCase(); return !c || c === '#39ff14' ? '#3b4c5e' : f.color; }
  function domAng(a) {
    var sx = 0, sy = 0;
    for (var i = 0; i < a.length; i++) {
      var q = a[(i + 1) % a.length], dx = q.x - a[i].x, dy = q.y - a[i].y, l = Math.hypot(dx, dy), t = Math.atan2(dy, dx);
      sx += l * Math.cos(2 * t); sy += l * Math.sin(2 * t);
    }
    return .5 * Math.atan2(sy, sx);
  }
  function gable(cn, h, rise, c, roofA, roofB, edge) {
    var r0 = { x: (cn[0].x + cn[3].x) / 2, y: (cn[0].y + cn[3].y) / 2 }, r1 = { x: (cn[1].x + cn[2].x) / 2, y: (cn[1].y + cn[2].y) / 2 }, z = h + rise;
    var fs = [
      { v: [[cn[0], h], [cn[1], h], [r1, z], [r0, z]], c: roofA || '#b4502e' },
      { v: [[cn[3], h], [cn[2], h], [r1, z], [r0, z]], c: roofB || '#8e3d22' },
      { v: [[cn[0], h], [cn[3], h], [r0, z]], c: shade(c, .78) },
      { v: [[cn[1], h], [cn[2], h], [r1, z]], c: shade(c, .88) }
    ];
    fs.forEach(function (f) { f.p = f.v.map(function (e) { return P(e[0].x, e[0].y, e[1]); }); f.d = f.p.reduce(function (s, q) { return s + q[2]; }, 0) / f.p.length; });
    fs.sort(function (u, v) { return v.d - u.d; });
    fs.forEach(function (f) { fillPoly(f.p, f.c, edge || '#ff8a5c'); });
  }
  function zone(f, a, c) {
    var pr = isPr(), cot = f.category === 'cottage', u = cot ? 4 : 3.5, v = cot ? 3.2 : 3.5, px = u + (cot ? 1.8 : 1.4), py = v + (cot ? 2.2 : 1.4),
      th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a), us = [], x, y;
    function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
    var b = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
    if (pr) {
      fillPoly(a.map(g0), 'rgba(218,195,152,0.35)', 'rgba(130,115,90,0.45)');
    } else {
      ctx.globalAlpha = .16; fillPoly(a.map(g0), c); ctx.globalAlpha = 1;
      ctx.strokeStyle = c; ctx.setLineDash([5, 4]); path(a.map(g0), 1); ctx.stroke(); ctx.setLineDash([]);
    }
    for (y = b.y0 + v / 2 + .3; y <= b.y1 - v / 2 && us.length < 300; y += py)
      for (x = b.x0 + u / 2 + .3; x <= b.x1 - u / 2 && us.length < 300; x += px) {
        var cn = [[-u / 2, -v / 2], [u / 2, -v / 2], [u / 2, v / 2], [-u / 2, v / 2]].map(function (q) { return L2W(x + q[0], y + q[1]); });
        if (cn.every(function (q) { return inP(q.x, q.y, a); })) { var cc = L2W(x, y); us.push({ lx: x, ly: y, cn: cn, d: P(cc.x, cc.y, 0)[2] }); }
      }
    // Fallback for narrow polygons (e.g. Staff Tents West) so they never appear empty
    if (!us.length) {
      var fu = Math.max(2.2, Math.min(u, (b.x1 - b.x0) * .6)), fv = Math.max(2.2, Math.min(v, (b.y1 - b.y0) * .6));
      var fcn = [[-fu / 2, -fv / 2], [fu / 2, -fv / 2], [fu / 2, fv / 2], [-fu / 2, fv / 2]].map(function (q) { return L2W(q[0], q[1]); });
      us.push({ lx: 0, ly: 0, cn: fcn, d: P(m.x, m.y, 0)[2] });
    }
    if (cot) {
      ctx.globalAlpha = pr ? .75 : .55;
      us.forEach(function (o) { fillPoly([L2W(o.lx - u / 2, o.ly + v / 2), L2W(o.lx + u / 2, o.ly + v / 2), L2W(o.lx + u / 2, o.ly + v / 2 + 1.1), L2W(o.lx - u / 2, o.ly + v / 2 + 1.1)].map(function (q) { return P(q.x, q.y, 0); }), pr ? '#d1c8b8' : '#8a7a66'); });
      ctx.globalAlpha = 1;
    }
    us.sort(function (p, q) { return q.d - p.d; });
    us.forEach(function (o) {
      dropShadow(o.cn, cot ? 3.0 : 2.4);
      if (cot) {
        var wc = pr ? '#c88d55' : c;
        extrude(o.cn, 2.1, wc, 1, { wk: .95, edge: pr ? '#3c2918' : null, win: pr ? '#3c4d5e' : 'rgba(255,255,255,.22)' });
        gable(o.cn, 2.1, .9, wc, pr ? '#b26e38' : '#b4502e', pr ? '#8e5325' : '#8e3d22', pr ? '#3c2918' : '#ff8a5c');
      } else {
        var tc = pr ? '#f2f3f0' : c;
        extrude(o.cn, 1.2, tc, 1, { wk: pr ? .96 : .6, edge: pr ? '#475569' : null, win: null });
        if (f.roofType === 'quonset') roof(o.cn, 1.2, tc, 'quonset', pr ? '#ffffff' : null);
        else gable(o.cn, 1.2, 1.1, tc, pr ? '#ffffff' : shade(c, .8), pr ? '#dde2e8' : shade(c, .65), pr ? '#475569' : c);
      }
    });
  }
  function drawDiesel(a, hh) {
    var pr = isPr(), th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a);
    function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
    var b = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
    fillPoly(a.map(g0), pr ? '#cbd2d9' : '#252c34', pr ? '#475569' : '#ff3c3c');
    // Low security mesh perimeter
    ctx.strokeStyle = pr ? '#4b5563' : '#ff3c3c'; ctx.lineWidth = 1;
    path(a.map(function (p) { return P(p.x, p.y, 1.4); }), 1); ctx.stroke();
    a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, 1.4)); });
    // Horizontal cylindrical tank inside footprint
    var tw = Math.max(1.8, (b.x1 - b.x0) * .65), td = Math.max(1.2, Math.min(2.6, (b.y1 - b.y0) * .55));
    var tbox = [[-tw / 2, -td / 2], [tw / 2, -td / 2], [tw / 2, td / 2], [-tw / 2, td / 2]].map(function (q) { return L2W(q[0], q[1]); });
    dropShadow(tbox, hh);
    extrude(tbox, hh * .55, pr ? '#dde3e9' : '#586573', 1, { wk: .95, edge: pr ? '#2b3440' : '#ff3c3c', win: null, stripe: !pr });
    roof(tbox, hh * .55, pr ? '#eef2f6' : '#6c7a89', 'quonset', pr ? '#f8fafc' : '#7b8a99');
  }
  function drawPool(a, h) {
    var pr = isPr(), th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a);
    function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
    var b = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
    dropShadow(a, h);
    fillPoly(a.map(g0), pr ? '#d9dfe6' : '#1f364d', pr ? '#334155' : '#00d9ff');
    var iw = (b.x1 - b.x0) * .78, id = (b.y1 - b.y0) * .72;
    var water = [[-iw / 2, -id / 2], [iw / 2, -id / 2], [iw / 2, id / 2], [-iw / 2, id / 2]].map(function (q) { return P(L2W(q[0], q[1]).x, L2W(q[0], q[1]).y, .05); });
    fillPoly(water, '#22a6df', '#7dd3fc');
    // Translucent covered canopy ribs
    ctx.save(); ctx.globalAlpha = pr ? .42 : .28;
    roof(a, Math.max(1.2, h * .45), pr ? '#e2f2fc' : '#00d9ff', 'quonset', pr ? '#f0f9ff' : '#00d9ff');
    ctx.restore();
    ctx.strokeStyle = pr ? '#334155' : '#00d9ff'; ctx.lineWidth = 1.2;
    a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, Math.max(1.2, h * .45))); });
  }
  function drawPlayground(a) {
    var pr = isPr(), m = cen(a);
    fillPoly(a.map(g0), pr ? '#e8ca8e' : 'rgba(212,163,89,0.2)', pr ? '#785a3a' : '#e8c84a');
    ctx.strokeStyle = pr ? '#6b4f35' : '#e8c84a'; ctx.lineWidth = 1;
    path(a.map(function (p) { return P(p.x, p.y, 1.1); }), 1); ctx.stroke();
    a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, 1.1)); });
    // Mini swing frame & slide
    ctx.strokeStyle = pr ? '#334155' : '#e8c84a'; ctx.lineWidth = 1.6;
    line(P(m.x - 2, m.y - 1, 0), P(m.x - 2, m.y, 2.2)); line(P(m.x - 2, m.y + 1, 0), P(m.x - 2, m.y, 2.2));
    line(P(m.x + .5, m.y - 1, 0), P(m.x + .5, m.y, 2.2)); line(P(m.x + .5, m.y + 1, 0), P(m.x + .5, m.y, 2.2));
    line(P(m.x - 2, m.y, 2.2), P(m.x + .5, m.y, 2.2));
    ctx.strokeStyle = '#dc2626'; line(P(m.x + 2, m.y - .5, 1.8), P(m.x + 3.4, m.y + 1, 0));
  }
  function drawParking(a) {
    var pr = isPr(), th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a);
    function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
    var b = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
    fillPoly(a.map(g0), pr ? '#9ca3af' : 'rgba(100,116,139,0.3)', pr ? '#374151' : '#8aa0b5');
    var cols = ['#f8fafc', '#64748b', '#dc2626', '#cbd5e1', '#1e3a8a'], idx = 0;
    for (var x = b.x0 + 1.8; x <= b.x1 - 1.8 && idx < 10; x += 2.9) {
      var p1 = L2W(x - 1.3, b.y0 + .4), p2 = L2W(x - 1.3, b.y1 - .4);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; line(P(p1.x, p1.y, .02), P(p2.x, p2.y, .02));
      var car = [[-.9, -1.9], [.9, -1.9], [.9, 1.9], [-.9, 1.9]].map(function (q) { return L2W(x + q[0], (b.y0 + b.y1) / 2 + q[1]); });
      if (car.every(function (q) { return inP(q.x, q.y, a); })) {
        dropShadow(car, 1.3);
        var cc = cols[idx % cols.length];
        extrude(car, 1.1, cc, 1, { wk: .95, edge: '#1f2937', win: null });
        roof(car, 1.1, cc, 'flat', shade(cc, 1.05));
        idx++;
      }
    }
  }
  function draw(f) {
    if (f.geometryType === 'point') return dpoint(f);
    var pr = isPr(), a = pts(f), c = f.color || '#39ff14', h = +f.height_m || 0, cat = f.category, fl = Math.max(1, f.floors | 0), i, k, b, u, v;
    ctx.setLineDash([]); ctx.lineWidth = hq ? 1.2 : 1;
    if (cat === 'yard' || cat === 'road') {
      if (pr) fillPoly(a.map(g0), cat === 'road' ? '#d4d0c8' : '#e8d0a2', cat === 'road' ? '#7a756c' : '#c8b288');
      else { ctx.globalAlpha = .5; fillPoly(a.map(g0), shade(c, .6), c); ctx.globalAlpha = 1; }
    } else if (cat === 'parking') {
      drawParking(a);
    } else if (cat === 'playground') {
      drawPlayground(a);
    } else if (cat === 'pool') {
      drawPool(a, h || 3.2);
    } else if (cat === 'fence') {
      var fh = h || 2.4, n = a.length;
      ctx.strokeStyle = pr ? '#4b5563' : c; ctx.lineWidth = pr ? 1.4 : 1.2;
      if (pr) {
        // Low solid wall base + fence mesh posts
        extrude(a, 0.7, '#d1ccc2', 1, { wk: .95, edge: '#4b5563', win: null });
      }
      path(a.map(g0), 1); ctx.stroke(); path(a.map(function (p) { return P(p.x, p.y, fh); }), 1); ctx.stroke();
      ctx.globalAlpha = .45; path(a.map(function (p) { return P(p.x, p.y, fh * .65); }), 1); ctx.stroke(); ctx.globalAlpha = 1;
      for (i = 0; i < n; i++) {
        var p = a[i], q = a[(i + 1) % n], m = Math.min(400, Math.max(1, Math.round(Math.hypot(q.x - p.x, q.y - p.y) / 6)));
        for (k = 0; k < m; k++) { var t = k / m, x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t; line(P(x, y, 0), P(x, y, fh)); }
      }
    } else if (cat === 'field') {
      var th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), mc = cen(a);
      function F2W(lx, ly) { return { x: mc.x + lx * cs - ly * sn, y: mc.y + lx * sn + ly * cs }; }
      var fb = bb(a.map(function (p) { var dx = p.x - mc.x, dy = p.y - mc.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
      var fw = fb.x1 - fb.x0, fd = fb.y1 - fb.y0, mx = (fb.x0 + fb.x1) / 2, my = (fb.y0 + fb.y1) / 2;
      if (pr) fillPoly(a.map(g0), '#3fa335', '#ffffff');
      else { ctx.globalAlpha = .45; fillPoly(a.map(g0), '#1f6f1f'); ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; path(a.map(g0), 1); ctx.stroke(); }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
      // Halfway line + center circle + penalty boxes aligned to field orientation
      var l1 = F2W(mx, fb.y0), l2 = F2W(mx, fb.y1); line(P(l1.x, l1.y, .02), P(l2.x, l2.y, .02));
      var cr = Math.min(fw, fd) * .15, ring = [];
      for (i = 0; i < 32; i++) { var rp = F2W(mx + cr * Math.cos(i / 32 * 6.2832), my + cr * Math.sin(i / 32 * 6.2832)); ring.push(P(rp.x, rp.y, .02)); }
      path(ring, 1); ctx.stroke();
      var pw = fw * .16, pd = fd * .48;
      [[fb.x0, fb.x0 + pw], [fb.x1 - pw, fb.x1]].forEach(function (xs) {
        var box = [[xs[0], my - pd / 2], [xs[1], my - pd / 2], [xs[1], my + pd / 2], [xs[0], my + pd / 2]].map(function (q) { var wp = F2W(q[0], q[1]); return P(wp.x, wp.y, .02); });
        path(box, 1); ctx.stroke();
      });
      ctx.strokeStyle = pr ? 'rgba(55,65,81,.55)' : 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      path(a.map(function (p) { return P(p.x, p.y, 3); }), 1); ctx.stroke(); ctx.setLineDash([]);
      a.forEach(function (p) { line(P(p.x, p.y, 0), P(p.x, p.y, 3)); });
    } else if (cat === 'olive_zone') {
      if (pr) fillPoly(a.map(g0), '#ebd4a2', '#b09a70');
      else { ctx.globalAlpha = .25; fillPoly(a.map(g0), '#2f6f1f'); ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.setLineDash([5, 4]); path(a.map(g0), 1); ctx.stroke(); ctx.setLineDash([]); }
      b = bb(a); var cnt = Math.min(hq ? 90 : 25, Math.max(5, area(a) / 42 | 0)), sd = hash(f.id), tr = [], tries = 0;
      while (tr.length < cnt && tries++ < cnt * 20) {
        sd = (sd * 1664525 + 1013904223) >>> 0; var rx = b.x0 + sd / 4294967296 * (b.x1 - b.x0);
        sd = (sd * 1664525 + 1013904223) >>> 0; var ry = b.y0 + sd / 4294967296 * (b.y1 - b.y0);
        if (inP(rx, ry, a)) tr.push({ x: rx, y: ry, d: P(rx, ry, 0)[2] });
      }
      tr.sort(function (p, q) { return q.d - p.d; });
      tr.forEach(function (t) { drawTreeAt(t.x, t.y, '#3f8f2f', 1.65); });
    } else if (cat === 'solar') {
      b = bb(a); var tp = a.map(function (p) { return P(p.x, p.y, .5 + (p.y - b.y0) / Math.max(1, b.y1 - b.y0) * 1.3); });
      dropShadow(a, 1.4);
      ctx.strokeStyle = pr ? '#475569' : '#8899aa'; a.forEach(function (p, j) { line(P(p.x, p.y, 0), tp[j]); });
      fillPoly(tp, pr ? '#224a88' : '#10285f', pr ? '#1e293b' : '#3a7bff');
      if (pr && hq && tp.length >= 4) {
        ctx.strokeStyle = 'rgba(147,197,253,0.55)'; ctx.lineWidth = .8;
        for (i = 1; i <= 3; i++) {
          var t = i / 4;
          line([tp[0][0] + (tp[1][0] - tp[0][0]) * t, tp[0][1] + (tp[1][1] - tp[0][1]) * t], [tp[3][0] + (tp[2][0] - tp[3][0]) * t, tp[3][1] + (tp[2][1] - tp[3][1]) * t]);
          line([tp[0][0] + (tp[3][0] - tp[0][0]) * t, tp[0][1] + (tp[3][1] - tp[0][1]) * t], [tp[1][0] + (tp[2][0] - tp[1][0]) * t, tp[1][1] + (tp[2][1] - tp[1][1]) * t]);
        }
      }
    } else if (isDiesel(f)) {
      drawDiesel(a, h || 2.4);
    } else if (cat === 'hazard') {
      var hh = h || 3; dropShadow(a, hh);
      extrude(a, hh, pr ? '#5c6470' : '#2b3138', 1, { wk: 1, ln: '#4a5560', edge: pr ? '#1f2937' : '#4a5560', win: null, stripe: 1 });
      roof(a, hh, pr ? '#737c88' : '#2b3138', 'flat', pr ? '#858e9a' : '#39424b');
      ctx.strokeStyle = pr ? '#b91c1c' : '#ff3c3c'; path(a.map(function (p) { return P(p.x, p.y, hh); }), 1); ctx.stroke();
    } else if ((cat === 'tent' || cat === 'cottage') && rmode(f) === 'auto') {
      zone(f, a, c);
    } else {
      var bld = cat === 'building', wh = cat === 'tent' ? h * .45 : h;
      dropShadow(a, wh);
      if (pr && cat === 'medical') {
        extrude(a, wh, '#ede9e1', 1, { wk: .96, edge: '#2b3440', win: '#5b8ec4' });
        roof(a, wh, '#d4423e', 'red_tile');
        var cm = cen(a), um = P(cm.x, cm.y, wh + Math.max(1.4, wh * .48) * .55);
        drawCrescent(um[0], um[1], Math.max(6, cl(sc() * 2.2, 6, 16)));
      } else if (pr && cat === 'security') {
        extrude(a, wh, '#dedbd4', 1, { wk: .96, edge: '#2b3440', win: '#4f8ec9' });
        roof(a, wh, '#c9413b', 'red_tile');
      } else if (pr && cat === 'gate') {
        extrude(a, 1.4, '#dc2626', 1, { wk: 1, edge: '#1f2937', win: null, stripe: 1 });
        roof(a, 1.4, '#ffffff', 'flat', '#f8fafc');
      } else if (pr && cat === 'tent') {
        extrude(a, wh, '#f2f3f0', 1, { wk: .96, edge: '#475569', win: null });
        roof(a, wh, '#ffffff', f.roofType || 'pyramid', '#ffffff');
      } else {
        if (bld) c = pr ? '#cfd7df' : bcol(f);
        extrude(a, wh, c, cat === 'tent' ? 1 : fl, bld ? { wk: 1, ln: pr ? '#64748b' : '#89a4be', edge: pr ? '#2b3440' : '#6f8aa5', win: pr ? '#4b86c2' : 'rgba(137,164,190,.32)' } : null);
        roof(a, wh, c, f.roofType || 'flat', bld ? (pr ? '#dfe5ec' : '#52687f') : null);
        var cc = cen(a);
        if (cat === 'medical') { u = P(cc.x, cc.y, wh + .1); var z = Math.max(3, sc() * 1.2); ctx.fillStyle = '#ff3c3c'; ctx.fillRect(u[0] - z, u[1] - z / 3, 2 * z, 2 * z / 3); ctx.fillRect(u[0] - z / 3, u[1] - z, 2 * z / 3, 2 * z); }
        if (cat === 'security') { u = P(cc.x, cc.y, wh); v = P(cc.x, cc.y, wh + 2.5); ctx.strokeStyle = '#00d9ff'; line(u, v); ctx.beginPath(); ctx.arc(v[0], v[1], 4, 0, 6.3); ctx.fillStyle = '#00d9ff'; ctx.fill(); }
      }
    }
  }
  function drawFeature(f) {
    draw(f);
    var h = +f.height_m || 0, c = f.center, pt = f.geometryType === 'point', top = P(c.x, c.y, pt ? 3 : h), a = pt ? null : pts(f);
    if (f.hazard_flag === true || f.hazard_flag === 'high_fire' || f.category === 'hazard' || f.category === 'diesel_tank') pulse(pt ? top : P(a[0].x, a[0].y, h || 3));
    var im = icon(f), io = im ? cl(sc() * 4, 16, 48) : 0;
    if (im) ctx.drawImage(im, top[0] - io / 2, top[1] - io - 6, io, io * ((im.naturalHeight / im.naturalWidth) || 1));
    var hid = f.category === 'fence' || f.category === 'road' || f.category === 'yard';
    if (layers.labels && f.en_name && (!hid || f.id === sel)) labels.push({ f: f, x: top[0], y: top[1] - 14 - io, i: labels.length });
    if (pt) hits.push({ f: f, c: P(c.x, c.y, 1) });
    else hits.push({ f: f, edge: f.category === 'fence', a: a.map(function (p) { return S2(p, 0); }), b: a.map(function (p) { return S2(p, h); }) });
  }
  var LPRI = { assembly: 1, gate: 1, medical: 1, hazard: 1, diesel_tank: 1, building: 2, pool: 2, cottage: 3, tent: 3, playground: 3, parking: 4, solar: 4, olive_zone: 5 };
  var LTINT = { building: '#52687f', hazard: '#d97706', diesel_tank: '#b91c1c', assembly: '#15803d', gate: '#b45309', medical: '#dc2626', pool: '#0284c7', cottage: '#a16207', tent: '#64748b', playground: '#b45309', parking: '#475569', solar: '#1d4ed8', olive_zone: '#3f6212' };
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawLabels() {
    var pr = isPr(), placed = [], hh = 15;
    labels.forEach(function (l) { l.p = l.f.id === sel ? 0 : (LPRI[l.f.category] || 6); });
    labels.sort(function (a, b) { return a.p - b.p || b.i - a.i; });
    ctx.font = (pr ? 'bold ' : '') + '10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1; ctx.setLineDash([]);
    labels.forEach(function (l) {
      var t = l.f.en_name, w = ctx.measureText(t).width + 12, x = l.x - w / 2, y = l.y - hh / 2;
      if (x > W || x + w < 0 || y > H || y + hh < 0) return;
      var r = [x - 4, y - 4, w + 8, hh + 8];
      for (var i = 0; i < placed.length; i++) { var q = placed[i]; if (r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1]) return; }
      placed.push(r);
      rr(x, y, w, hh, 4);
      ctx.fillStyle = pr ? 'rgba(255,255,255,0.93)' : 'rgba(8,11,16,0.88)'; ctx.fill();
      ctx.strokeStyle = LTINT[l.f.category] || l.f.color || '#64748b'; ctx.stroke();
      ctx.fillStyle = pr ? '#111827' : '#e6f3ff'; ctx.fillText(t, l.x, l.y + .5);
    });
    ctx.textBaseline = 'alphabetic';
  }
  function vis(f) { return f.visible !== false && layers[LAY[f.category] || 'build']; }

  function grid() {
    var pr = isPr(), s = sc(), st = [5, 10, 20, 50, 100, 200, 500, 1000].filter(function (v) { return v * s >= 40; })[0] || 1000;
    var cs = [inv(0, 0), inv(W, 0), inv(0, H), inv(W, H)], b = bb(cs);
    while ((b.x1 - b.x0) / st > 120 || (b.y1 - b.y0) / st > 120) st *= 2;
    var x, y; ctx.lineWidth = 1;
    for (x = Math.floor(b.x0 / st) * st; x <= b.x1; x += st) {
      ctx.strokeStyle = pr ? (x === 0 ? 'rgba(100,85,65,.24)' : 'rgba(100,85,65,.1)') : (x === 0 ? 'rgba(57,255,20,.35)' : 'rgba(57,255,20,.1)');
      line(P(x, b.y0, 0), P(x, b.y1, 0));
    }
    for (y = Math.floor(b.y0 / st) * st; y <= b.y1; y += st) {
      ctx.strokeStyle = pr ? (y === 0 ? 'rgba(100,85,65,.24)' : 'rgba(100,85,65,.1)') : (y === 0 ? 'rgba(57,255,20,.35)' : 'rgba(57,255,20,.1)');
      line(P(b.x0, y, 0), P(b.x1, y, 0));
    }
  }
  function fmt(s) { var m = Math.floor(s / 60), x = Math.round(s % 60); return m + 'm ' + (x < 10 ? '0' : '') + x + 's'; }
  function minfo() { if (meas.length < 2) return null; var d = Math.hypot(meas[1].x - meas[0].x, meas[1].y - meas[0].y); return { d: d, t12: d / 1.2, t08: d / .8 }; }
  function overlays() {
    var pr = isPr(), s = sc(), t = cam.pitch * D, a = cam.yaw * D;
    if (meas.length) {
      ctx.strokeStyle = pr ? '#b45309' : '#e8c84a'; ctx.fillStyle = pr ? '#b45309' : '#e8c84a'; ctx.lineWidth = 2;
      var m = meas.map(function (p) { return P(p.x, p.y, 0); });
      if (m.length > 1) { ctx.setLineDash([6, 4]); path(m); ctx.stroke(); ctx.setLineDash([]); }
      m.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 6.3); ctx.fill(); });
      var mi = minfo();
      if (mi) {
        var tx = (m[0][0] + m[1][0]) / 2, ty = (m[0][1] + m[1][1]) / 2, txt = mi.d.toFixed(1) + ' m | ' + fmt(mi.t12) + ' @1.2 | ' + fmt(mi.t08) + ' @0.8';
        ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'center'; var tw = ctx.measureText(txt).width + 10;
        ctx.fillStyle = pr ? 'rgba(255,255,255,.94)' : 'rgba(8,11,16,.85)'; ctx.fillRect(tx - tw / 2, ty - 18, tw, 16);
        ctx.fillStyle = pr ? '#92400e' : '#e8c84a'; ctx.fillText(txt, tx, ty - 6);
      }
    }
    var cx = W - 44, cy = 44;
    ctx.lineWidth = 1.2; ctx.strokeStyle = pr ? '#475569' : '#1b2838'; ctx.fillStyle = pr ? 'rgba(255,255,255,.92)' : 'rgba(14,20,29,.85)';
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 6.3); ctx.fill(); ctx.stroke();
    [[0, 1, 'N'], [1, 0, 'E'], [0, -1, 'S'], [-1, 0, 'W']].forEach(function (d) {
      var rx = d[0] * Math.cos(a) - d[1] * Math.sin(a), ry = d[0] * Math.sin(a) + d[1] * Math.cos(a), ex = cx + rx * 20, ey = cy - ry * 20 * Math.cos(t), n = d[2] === 'N';
      ctx.strokeStyle = n ? '#dc2626' : (pr ? '#334155' : '#00d9ff'); ctx.lineWidth = n ? 2.5 : 1; line([cx, cy], [ex, ey]);
      ctx.fillStyle = n ? '#dc2626' : (pr ? '#1e293b' : '#00d9ff'); ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(d[2], cx + rx * 27, cy - ry * 27 * Math.cos(t) + 3);
    });
    var nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter(function (v) { return v * s >= 60; })[0] || 2000, px = nice * s;
    ctx.strokeStyle = pr ? '#1e293b' : '#39ff14'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, H - 16); ctx.lineTo(14 + px, H - 16); ctx.moveTo(14, H - 21); ctx.lineTo(14, H - 11); ctx.moveTo(14 + px, H - 21); ctx.lineTo(14 + px, H - 11); ctx.stroke();
    ctx.fillStyle = pr ? '#1e293b' : '#39ff14'; ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'left'; ctx.fillText(nice + ' m', 18, H - 24);
  }
  function render() {
    var pr = isPr();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pr ? '#f6f1e7' : '#080b10'; ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    if (layers.grid) grid();
    // In Print mode, paint sandy compound ground inside perimeter fence BEFORE Tier 0 roads/yards
    if (pr) {
      St.project.features.forEach(function (f) {
        if (f.category === 'fence' && f.geometryType === 'polygon' && f.visible !== false) {
          fillPoly(pts(f).map(g0), '#f1dbb0');
        }
      });
    }
    hits = []; labels = [];
    var list = St.project.features.filter(vis).map(function (f) {
      return { f: f, t: f.geometryType === 'point' ? 3 : (TIER[f.category] === undefined ? 2 : TIER[f.category]), d: P(f.center.x, f.center.y, 0)[2] };
    });
    list.sort(function (a, b) { return a.t - b.t || b.d - a.d; });
    list.forEach(function (o) { drawFeature(o.f); });
    if (layers.routes && S.Routing && S.Routing.drawOn3D) {
      ctx.save();
      if (pr) { ctx.shadowColor = 'rgba(15,23,42,0.75)'; ctx.shadowBlur = 3; }
      S.Routing.drawOn3D(ctx, P, sc);
      ctx.restore();
    }
    hits.forEach(function (h) {
      if (h.f.id !== sel) return;
      ctx.strokeStyle = pr ? '#0284c7' : '#00d9ff'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 3]);
      if (h.c) { ctx.beginPath(); ctx.arc(h.c[0], h.c[1], 14, 0, 6.3); ctx.stroke(); }
      else { path(h.a.map(function (p) { return [p.x, p.y]; }), 1); ctx.stroke(); path(h.b.map(function (p) { return [p.x, p.y]; }), 1); ctx.stroke(); }
      ctx.setLineDash([]);
    });
    drawLabels();
    overlays();
    St.emit('status', { x: mouse.x, y: mouse.y, zoom: cam.zoom, count: St.project.features.length, meta: St.project.meta });
  }
  function loop() {
    var hz = !isPr() && St.project.features.some(function (f) { return (f.hazard_flag === true || f.hazard_flag === 'high_fire' || f.category === 'hazard') && vis(f); });
    var rt = layers.routes && S.Routing && S.Routing.hasActiveAnim && S.Routing.hasActiveAnim();
    if (dirty || hz || rt) { dirty = 0; render(); }
    requestAnimationFrame(loop);
  }
  function resize() {
    var r = cv.parentNode.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = hq ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); dirty = 1;
  }
  function viewEvt() { St.emit('view', { yaw: cam.yaw, pitch: cam.pitch, north: Math.abs(cam.yaw % 360) < .5 }); dirty = 1; }
  function select(id) { sel = id; dirty = 1; St.emit('select', getSel()); }
  function hitAt(x, y) {
    for (var i = hits.length - 1; i >= 0; i--) {
      var h = hits[i];
      if (h.c) { if (Math.hypot(x - h.c[0], y - h.c[1]) < 16) return h; continue; }
      if (h.edge) { for (var j = 0; j < h.a.length; j++) if (dSeg(x, y, h.a[j], h.a[(j + 1) % h.a.length]) < 8) return h; continue; }
      if (inP(x, y, h.a) || inP(x, y, h.b)) return h;
    }
    return null;
  }
  function addAt(x, y) {
    var t = addType, d = DEF[t], f; St.snapshot();
    if (d) {
      var w = d.w / 2, e = d.d / 2;
      f = St.newFeature({ category: t, shapeType: 'extrude', geometryType: 'polygon', coordsMetric: [{ x: x - w, y: y - e }, { x: x + w, y: y - e }, { x: x + w, y: y + e }, { x: x - w, y: y + e }],
        center: { x: x, y: y }, height_m: d.h, floors: d.fl, roofType: d.roof, color: d.col, en_name: t.replace('_', ' '), renderMode: (t === 'tent' || t === 'cottage') ? 'solid' : undefined });
    } else {
      f = St.newFeature({ category: t, shapeType: 'marker', geometryType: 'point', coordsMetric: [{ x: x, y: y }], center: { x: x, y: y },
        height_m: t === 'tree' ? 4 : t === 'vehicle' ? 3 : 1, color: PCOL[t] || '#39ff14', en_name: t });
    }
    St.project.features.push(f); select(f.id); St.emit('change');
  }
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function two() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x) }; }

  function bind() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId); var p = pos(e); ptrs[e.pointerId] = p;
      if (Object.keys(ptrs).length === 2) { var t = two(); drag = { m: 'pinch', d: t.d, a: t.a, z: cam.zoom, y: cam.yaw }; return; }
      var w = inv(p.x, p.y);
      if (e.button === 2 || e.shiftKey) { drag = { m: 'orbit', x: p.x, y: p.y }; return; }
      if (tool === 'add') { addAt(w.x, w.y); return; }
      if (tool === 'measure') { if (meas.length >= 2) meas = []; meas.push(w); St.emit('measure', minfo()); dirty = 1; return; }
      if (tool === 'select') {
        var h = hitAt(p.x, p.y);
        if (h) { select(h.f.id); drag = { m: 'move', x: w.x, y: w.y, moved: false }; return; }
        select(null);
      }
      drag = { m: 'pan', x: p.x, y: p.y, cx: cam.cx, cy: cam.cy };
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pos(e), w; if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      w = inv(p.x, p.y); mouse = { x: w.x, y: w.y }; dirty = 1;
      if (!drag) return;
      if (drag.m === 'pan') { cam.cx = drag.cx; cam.cy = drag.cy; var a = inv(drag.x, drag.y), b = inv(p.x, p.y); cam.cx = drag.cx + a.x - b.x; cam.cy = drag.cy + a.y - b.y; }
      else if (drag.m === 'move') {
        if (!drag.moved) { St.snapshot(); drag.moved = true; }
        var f = getSel(); if (f) { var dx = w.x - drag.x, dy = w.y - drag.y; f.center.x += dx; f.center.y += dy; f.coordsMetric.forEach(function (q) { q.x += dx; q.y += dy; }); }
        drag.x = w.x; drag.y = w.y;
      } else if (drag.m === 'orbit') {
        cam.yaw = (((cam.yaw + (p.x - drag.x) * .5) % 360) + 360) % 360; cam.pitch = cl(cam.pitch + (p.y - drag.y) * .3, 0, 75); drag.x = p.x; drag.y = p.y; viewEvt();
      } else if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        var t = two(); cam.zoom = cl(drag.z * t.d / drag.d, .3, 5); cam.yaw = (((drag.y - (t.a - drag.a) / D) % 360) + 360) % 360; viewEvt();
      }
    });
    function up(e) { delete ptrs[e.pointerId]; if (!Object.keys(ptrs).length || (drag && drag.m === 'pinch')) { if (drag && drag.m === 'move' && drag.moved) St.emit('change'); drag = null; } }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); cam.zoom = cl(cam.zoom * (e.deltaY < 0 ? 1.1 : .9), .3, 5); dirty = 1; }, { passive: false });
  }

  S.Engine = {
    init: function (canvas) {
      cv = canvas; ctx = cv.getContext('2d'); bind(); resize();
      if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode); else window.addEventListener('resize', resize);
      St.on('change', function () { if (sel && !getSel()) select(null); dirty = 1; });
      this.fitView(); loop();
    },
    setTool: function (t) { tool = t; if (t !== 'measure') { meas = []; St.emit('measure', null); } cv.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair'; dirty = 1; },
    setAddType: function (t) { addType = t; },
    setYaw: function (v) { cam.yaw = +v; viewEvt(); },
    setPitch: function (v) { cam.pitch = cl(+v, 0, 75); viewEvt(); },
    setQuality: function (h) { hq = !!h; resize(); },
    isHQ: function () { return hq; },
    getTheme: function () { return theme; },
    setTheme: function (t) { theme = t === 'print' ? 'print' : 'cyber'; dirty = 1; return theme; },
    toggleTheme: function () { return this.setTheme(theme === 'print' ? 'cyber' : 'print'); },
    setLayer: function (k, v) { layers[k] = v ? 1 : 0; dirty = 1; },
    toggleNorthUp: function () {
      var off = St.project.meta.trueNorthOffsetDeg || 0;
      cam.yaw = Math.abs(cam.yaw % 360) < .5 ? ((off % 360) + 360) % 360 : 0; viewEvt(); return Math.abs(cam.yaw) < .5;
    },
    fitView: function () {
      var fs = St.project.features;
      if (!fs.length) { cam.cx = 0; cam.cy = 0; cam.base = 3; cam.zoom = 1; viewEvt(); return; }
      var all = []; fs.forEach(function (f) { all = all.concat(f.coordsMetric); });
      var b = bb(all), w = Math.max(20, b.x1 - b.x0), d = Math.max(20, b.y1 - b.y0);
      cam.cx = (b.x0 + b.x1) / 2; cam.cy = (b.y0 + b.y1) / 2; cam.base = .85 * Math.min(W / w, H / d); cam.zoom = 1; viewEvt();
    },
    select: select, getSelected: getSel,
    deleteSelected: function () {
      var f = getSel(); if (!f) return;
      St.project.features = St.project.features.filter(function (x) { return x !== f; }); sel = null; St.emit('select', null); St.emit('change');
    },
    sizeOf: function (f) { var b = bb(f.coordsMetric); return { w: b.x1 - b.x0, d: b.y1 - b.y0 }; },
    resizeSelected: function (w, d) {
      var f = getSel(); if (!f || f.geometryType !== 'polygon' || !(w > 0) || !(d > 0)) return;
      var s = this.sizeOf(f), kx = s.w ? w / s.w : 1, ky = s.d ? d / s.d : 1, c = f.center;
      f.coordsMetric = f.coordsMetric.map(function (p) { return { x: c.x + (p.x - c.x) * kx, y: c.y + (p.y - c.y) * ky }; }); dirty = 1;
    },
    attachIcon: function (file) {
      var f = getSel();
      return new Promise(function (res, rej) {
        if (!f) return rej(new Error('Select a feature first'));
        var r = new FileReader(); r.onerror = rej;
        r.onload = function () {
          var im = new Image(); im.onerror = function () { rej(new Error('Unsupported image')); };
          im.onload = function () {
            var m = 128, iw = im.width || m, ih = im.height || m, k = Math.min(1, m / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k)),
              c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h);
            var u = c.toDataURL('image/webp', .8); if (u.indexOf('data:image/webp') !== 0) u = c.toDataURL('image/png');
            St.snapshot(); f.customIconBase64 = u; St.emit('change'); res(u);
          };
          im.src = r.result;
        };
        r.readAsDataURL(file);
      });
    },
    clearIcon: function () { var f = getSel(); if (f) { St.snapshot(); f.customIconBase64 = null; St.emit('change'); } },
    getMeasure: minfo, fmt: fmt, renderModeOf: rmode, project: P, getCanvas: function () { return cv; },
    render: function () { dirty = 1; }
  };
})(window.SOS);
