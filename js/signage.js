window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', SANS = 'system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif';
  var ov, cv, ctx, W = 1, H = 1, dpr = 1, isOpen = false, built = false, mode = 'place';
  var view = { s: 4, ox: 0, oy: 0 }, ptrs = {}, drag = null, activePinId = null, icons = {};

  // =========================================================================
  // PURE-JS ZERO-DEPENDENCY ISO/IEC 18004 QR CODE ENCODER (V1..V10, EC-M)
  // =========================================================================
  var QR = (function () {
    var EXP = new Array(512), LOG = new Array(256), x = 1, i;
    for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    function mul(a, b) { return (!a || !b) ? 0 : EXP[LOG[a] + LOG[b]]; }
    function rsPoly(deg) {
      var p = [1], j, k, q;
      for (j = 0; j < deg; j++) {
        q = new Array(p.length + 1).fill(0);
        for (k = 0; k < p.length; k++) { q[k] ^= p[k]; q[k + 1] ^= mul(p[k], EXP[j]); }
        p = q;
      }
      return p;
    }
    function rsEnc(data, ecLen) {
      var gen = rsPoly(ecLen), msg = data.concat(new Array(ecLen).fill(0)), j, k, c;
      for (j = 0; j < data.length; j++) {
        c = msg[j];
        if (c) for (k = 1; k < gen.length; k++) msg[j + k] ^= mul(gen[k], c);
      }
      return msg.slice(data.length);
    }
    function fmtBits(ecBits, mask) {
      var d = (ecBits << 3) | mask, r = d << 10, j;
      for (j = 14; j >= 10; j--) if ((r >> j) & 1) r ^= 0x537 << (j - 10);
      return ((d << 10) | r) ^ 0x5412;
    }
    function verBits(v) {
      var r = v << 12, j;
      for (j = 17; j >= 12; j--) if ((r >> j) & 1) r ^= 0x1f25 << (j - 12);
      return (v << 12) | r;
    }
    function utf8(str) {
      var out = [], j, c;
      for (j = 0; j < str.length; j++) {
        c = str.charCodeAt(j);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
      return out;
    }
    var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
    var VER_M = [
      [1, 10, 1, 16, 0, 0], [2, 16, 1, 28, 0, 0], [3, 26, 1, 44, 0, 0], [4, 18, 2, 32, 0, 0], [5, 24, 2, 43, 0, 0],
      [6, 16, 4, 27, 0, 0], [7, 18, 4, 31, 0, 0], [8, 22, 2, 38, 2, 39], [9, 22, 3, 36, 2, 37], [10, 26, 4, 43, 1, 44]
    ];

    function encode(text) {
      var raw = utf8(String(text || '')), chosen = null, j, k, r, c;
      for (j = 0; j < VER_M.length; j++) {
        var vp = VER_M[j], cap = vp[2] * vp[3] + vp[4] * vp[5], ccb = vp[0] < 10 ? 8 : 16;
        if (4 + ccb + raw.length * 8 <= cap * 8) { chosen = vp; break; }
      }
      if (!chosen) return null;
      var v = chosen[0], ec = chosen[1], b1 = chosen[2], d1 = chosen[3], b2 = chosen[4], d2 = chosen[5];
      var dataCap = b1 * d1 + b2 * d2, ccBits = v < 10 ? 8 : 16, bits = [];
      function push(val, nb) { for (var b = nb - 1; b >= 0; b--) bits.push((val >> b) & 1); }
      push(4, 4); push(raw.length, ccBits);
      for (j = 0; j < raw.length; j++) push(raw[j], 8);
      var rem = dataCap * 8 - bits.length;
      for (j = 0; j < Math.min(4, rem); j++) bits.push(0);
      while (bits.length % 8 !== 0) bits.push(0);
      var dataCw = [];
      for (j = 0; j < bits.length; j += 8) {
        var val = 0;
        for (k = 0; k < 8; k++) val = (val << 1) | bits[j + k];
        dataCw.push(val);
      }
      var pad = [0xec, 0x11], pi = 0;
      while (dataCw.length < dataCap) { dataCw.push(pad[pi & 1]); pi++; }

      var blkD = [], blkE = [], idx = 0;
      for (j = 0; j < b1; j++) { var bd = dataCw.slice(idx, idx + d1); idx += d1; blkD.push(bd); blkE.push(rsEnc(bd, ec)); }
      for (j = 0; j < b2; j++) { var bd2 = dataCw.slice(idx, idx + d2); idx += d2; blkD.push(bd2); blkE.push(rsEnc(bd2, ec)); }
      var finalCw = [], maxD = Math.max(d1, d2);
      for (j = 0; j < maxD; j++) for (k = 0; k < blkD.length; k++) if (j < blkD[k].length) finalCw.push(blkD[k][j]);
      for (j = 0; j < ec; j++) for (k = 0; k < blkE.length; k++) finalCw.push(blkE[k][j]);

      var n = 17 + 4 * v, mat = [], func = [];
      for (r = 0; r < n; r++) { mat.push(new Array(n).fill(0)); func.push(new Array(n).fill(false)); }
      function setF(rr, cc, dark) { if (rr >= 0 && rr < n && cc >= 0 && cc < n) { mat[rr][cc] = dark ? 1 : 0; func[rr][cc] = true; } }
      [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (o) {
        for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
          var dark = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setF(o[0] + dr, o[1] + dc, dark);
        }
      });
      var al = ALIGN[v];
      for (j = 0; j < al.length; j++) for (k = 0; k < al.length; k++) {
        var ar = al[j], ac = al[k];
        if ((ar < 9 && ac < 9) || (ar < 9 && ac > n - 9) || (ar > n - 9 && ac < 9)) continue;
        for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) setF(ar + dr, ac + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
      for (j = 8; j < n - 8; j++) { setF(6, j, j % 2 === 0); setF(j, 6, j % 2 === 0); }
      setF(n - 8, 8, true);
      for (j = 0; j < 9; j++) { if (!func[8][j]) setF(8, j, false); if (!func[j][8]) setF(j, 8, false); }
      for (j = 0; j < 8; j++) { setF(8, n - 1 - j, false); if (!func[n - 1 - j][8]) setF(n - 1 - j, 8, false); }
      if (v >= 7) {
        var vb = verBits(v);
        for (j = 0; j < 18; j++) { var bt = (vb >> j) & 1, vr = (j / 3) | 0, vc = n - 11 + (j % 3); setF(vr, vc, bt); setF(vc, vr, bt); }
      }

      var allBits = [];
      for (j = 0; j < finalCw.length; j++) for (k = 7; k >= 0; k--) allBits.push((finalCw[j] >> k) & 1);
      var bi = 0, up = true, col = n - 1;
      while (col > 0) {
        if (col === 6) col--;
        for (j = 0; j < n; j++) {
          r = up ? (n - 1 - j) : j;
          for (var dc = 0; dc >= -1; dc--) {
            c = col + dc;
            if (!func[r][c]) { mat[r][c] = bi < allBits.length ? allBits[bi] : 0; bi++; }
          }
        }
        up = !up; col -= 2;
      }

      var coords1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
      var coords2 = [[n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8], [8, n - 8], [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1]];
      function maskCond(m, rr, cc) {
        if (m === 0) return (rr + cc) % 2 === 0;
        if (m === 1) return rr % 2 === 0;
        if (m === 2) return cc % 3 === 0;
        if (m === 3) return (rr + cc) % 3 === 0;
        if (m === 4) return (((rr / 2) | 0) + ((cc / 3) | 0)) % 2 === 0;
        if (m === 5) return ((rr * cc) % 2) + ((rr * cc) % 3) === 0;
        if (m === 6) return ((((rr * cc) % 2) + ((rr * cc) % 3)) % 2) === 0;
        return ((((rr + cc) % 2) + ((rr * cc) % 3)) % 2) === 0;
      }
      var bestGrid = null, bestPen = 1e18;
      for (var m = 0; m < 8; m++) {
        var g = mat.map(function (row) { return row.slice(); });
        for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (!func[r][c] && maskCond(m, r, c)) g[r][c] ^= 1;
        var fb = fmtBits(0, m);
        for (j = 0; j < 15; j++) {
          var b = (fb >> (14 - j)) & 1;
          g[coords1[j][0]][coords1[j][1]] = b;
          g[coords2[j][0]][coords2[j][1]] = b;
        }
        var pen = 0, dark = 0;
        for (r = 0; r < n; r++) {
          var run = 1;
          for (c = 0; c < n; c++) {
            dark += g[r][c];
            if (c > 0) { if (g[r][c] === g[r][c - 1]) { run++; if (run === 5) pen += 3; else if (run > 5) pen += 1; } else run = 1; }
            if (r < n - 1 && c < n - 1) { var s4 = g[r][c] + g[r][c + 1] + g[r + 1][c] + g[r + 1][c + 1]; if (s4 === 0 || s4 === 4) pen += 3; }
          }
        }
        pen += Math.abs(((dark * 20 / (n * n)) | 0) - 10) * 10;
        if (pen < bestPen) { bestPen = pen; bestGrid = g; }
      }
      return bestGrid;
    }

    function drawTo(c, text, x, y, size) {
      var grid = encode(text);
      if (!grid) return false;
      var n = grid.length, q = 3, mod = size / (n + 2 * q);
      c.fillStyle = '#ffffff'; c.fillRect(x, y, size, size);
      c.fillStyle = '#0f172a';
      for (var r = 0; r < n; r++) for (var cc = 0; cc < n; cc++) {
        if (grid[r][cc]) c.fillRect(x + (cc + q) * mod, y + (r + q) * mod, Math.ceil(mod), Math.ceil(mod));
      }
      return true;
    }
    return { encode: encode, drawTo: drawTo };
  })();

  // =========================================================================
  // CSS & HELPERS (AJ-GeoCAD CYBER HUD + DAYLIGHT COMPATIBLE)
  // =========================================================================
  function ensureCss() {
    if (document.getElementById('sos-signage-css')) return;
    var st = document.createElement('style');
    st.id = 'sos-signage-css';
    st.textContent =
      '.sg{position:fixed;inset:0;z-index:920;background:#060d18;color:#d9ecff;display:flex;flex-direction:column;font-family:' + MONO + '}' +
      '.sg.hide{display:none}' +
      '.sgtop{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#0a1626;border-bottom:1px solid #1b3b57;overflow-x:auto;flex-wrap:nowrap;flex-shrink:0}' +
      '.sgtop::-webkit-scrollbar{height:5px}.sgtop::-webkit-scrollbar-thumb{background:#1b3b57;border-radius:3px}' +
      '.sgt{color:#00ff9d;font-size:12px;letter-spacing:.5px;white-space:nowrap;margin-right:4px}' +
      '.sg button,.sg select,.sg input{font-family:' + MONO + ';font-size:11px;background:#040911;color:#d9ecff;border:1px solid #1b3b57;border-radius:4px;padding:5px 8px;outline:none}' +
      '.sg button{cursor:pointer;white-space:nowrap;flex-shrink:0}' +
      '.sg button:hover{border-color:#00e5ff;color:#fff}' +
      '.sg button.on{border-color:#00ff9d;color:#00ff9d;background:rgba(0,255,157,.12)}' +
      '.sg button.cy{border-color:#00e5ff;color:#00e5ff;background:rgba(0,229,255,.12)}' +
      '.sg button.dng{border-color:#ff4757;color:#ff4757}' +
      '.sg .sp{flex:1;min-width:8px}' +
      '.sgbody{display:flex;flex:1;min-height:0;overflow:hidden}' +
      '.sgside{width:280px;background:#0a1626;border-right:1px solid #1b3b57;padding:10px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex-shrink:0}' +
      '.sgside.r{border-right:0;border-left:1px solid #1b3b57;width:255px}' +
      '.sgside h4{margin:6px 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#78b5a0;border-bottom:1px solid #1b3b57;padding-bottom:2px}' +
      '.sgside label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#7f9bb5}' +
      '.sgside label.ck{flex-direction:row;align-items:center;gap:6px;color:#d9ecff;cursor:pointer}' +
      '.sg .row{display:flex;gap:5px;margin-top:2px}.sg .row button{flex:1}' +
      '.sg .mut{font-size:10px;color:#7f9bb5;line-height:1.45;margin:0;word-break:break-all}' +
      '.sgcv{flex:1;position:relative;min-width:0;min-height:0;background:#07111f;overflow:hidden}' +
      '#sgCv{width:100%;height:100%;display:block;touch-action:none}' +
      '.sgpin{padding:6px 8px;border:1px solid #1b3b57;border-radius:4px;background:#040911;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px}' +
      '.sgpin:hover{border-color:#00e5ff}.sgpin.sel{border-color:#00ff9d;background:rgba(0,255,157,.1);color:#fff}' +
      '.sgpin small{color:#7f9bb5;font-size:10px}' +
      '@media (max-width:900px){' +
        '.sgbody{flex-direction:column}' +
        '.sgside,.sgside.r{width:100%;max-height:175px;border:0;border-bottom:1px solid #1b3b57}' +
        '.sgside.r{border-bottom:0;border-top:1px solid #1b3b57;max-height:140px}' +
        '.sgcv{flex:1;min-height:240px}' +
      '}';
    document.head.appendChild(st);
  }

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function fmt(sec) { var m = Math.floor(sec / 60), s = Math.round(sec % 60); return m ? (m + 'm ' + (s < 10 ? '0' : '') + s + 's') : (s + 's'); }
  function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function cen(a) { var x = 0, y = 0; a.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / (a.length || 1), y: y / (a.length || 1) }; }
  function bb(a) { var b = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; a.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }); return b; }
  function signedArea(a) { var s = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length]; s += a[i].x * q.y - q.x * a[i].y; } return s / 2; }
  function area(a) { return Math.abs(signedArea(a)); }
  function featPts(f) {
    var r = (f.rotationDeg || 0) * D, c = Math.cos(r), n = Math.sin(r), m = f.center || { x: 0, y: 0 };
    return (f.coordsMetric || []).map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
  }
  function inP(x, y, a) {
    var r = false;
    for (var i = 0, j = a.length - 1; i < a.length; j = i++)
      if ((a[i].y > y) !== (a[j].y > y) && x < (a[j].x - a[i].x) * (y - a[i].y) / (a[j].y - a[i].y) + a[i].x) r = !r;
    return r;
  }
  function domAng(a) {
    var sx = 0, sy = 0;
    for (var i = 0; i < a.length; i++) {
      var q = a[(i + 1) % a.length], dx = q.x - a[i].x, dy = q.y - a[i].y, l = Math.hypot(dx, dy), t = Math.atan2(dy, dx);
      sx += l * Math.cos(2 * t); sy += l * Math.sin(2 * t);
    }
    return .5 * Math.atan2(sy, sx);
  }
  function hash(s) { var v = 7; for (var i = 0; i < s.length; i++) v = (v * 31 + s.charCodeAt(i)) >>> 0; return v; }
  function shade(hex, k) {
    if (!hex || hex[0] !== '#' || hex.length !== 7) return hex || '#888';
    var n = parseInt(hex.slice(1), 16);
    return 'rgb(' + cl((n >> 16 & 255) * k | 0, 0, 255) + ',' + cl((n >> 8 & 255) * k | 0, 0, 255) + ',' + cl((n & 255) * k | 0, 0, 255) + ')';
  }
  function customCol(f, defHex) {
    var c = (f.color || '').toLowerCase();
    if (f.customStyled || (c && c !== '#39ff14' && c !== '#00ff9d' && c !== '#3b4c5e')) return f.color || defHex;
    return defHex;
  }
  function offsetPoly(arr, dist) {
    var n = arr.length;
    if (n < 3 || !dist) return arr.slice();
    var wasCW = signedArea(arr) < 0, a = wasCW ? arr.slice().reverse() : arr.slice(), lines = [], i, k;
    for (i = 0; i < n; i++) {
      var p = a[i], q = a[(i + 1) % n], dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy);
      if (L < 1e-6) continue;
      var nx = dy / L, ny = -dx / L;
      lines.push({ x1: p.x + nx * dist, y1: p.y + ny * dist, ux: dx / L, uy: dy / L, nx: nx, ny: ny, orig: p });
    }
    var m = lines.length, out = [];
    for (k = 0; k < m; k++) {
      var l1 = lines[(k - 1 + m) % m], l2 = lines[k], den = l1.ux * l2.uy - l1.uy * l2.ux, ix, iy;
      if (Math.abs(den) < 1e-5) { ix = l2.x1; iy = l2.y1; }
      else {
        var t = ((l2.x1 - l1.x1) * l2.uy - (l2.y1 - l1.y1) * l2.ux) / den;
        ix = l1.x1 + t * l1.ux; iy = l1.y1 + t * l1.uy;
        if (Math.hypot(ix - l2.orig.x, iy - l2.orig.y) > Math.max(2, Math.abs(dist) * 3)) {
          ix = l2.orig.x + (l1.nx + l2.nx) * 0.5 * dist; iy = l2.orig.y + (l1.ny + l2.ny) * 0.5 * dist;
        }
      }
      out.push({ x: ix, y: iy });
    }
    return wasCW ? out.reverse() : out;
  }
  function iconOf(f) {
    var k = f.customIconBase64; if (!k) return null;
    var im = icons[k];
    if (!im) { im = icons[k] = new Image(); im.onload = function () { draw(); }; im.src = k; }
    return im.complete && im.naturalWidth ? im : null;
  }

  function ensureMeta() {
    if (!St.project.meta) St.project.meta = {};
    if (typeof St.project.meta.qrBaseUrl !== 'string') St.project.meta.qrBaseUrl = '';
    if (!Array.isArray(St.project.signagePins)) St.project.signagePins = [];
  }

  function newPin(o) {
    var idx = (St.project.signagePins || []).length + 1;
    return Object.assign({
      id: nid('pin'), locCode: 'zone_' + idx, en_name: 'Wall Sign ' + idx, ar_name: 'لوحة جدارية ' + idx,
      scope: 'exterior', view3D: true, featureId: null, floor: '1', x: 0, y: 0,
      facingDeg: 0, headsUp: true, paper: 'A3_L', dpi: 150, showQR: true, showFire: true, showShelling: true
    }, o || {});
  }

  function activePin() {
    ensureMeta();
    var pins = St.project.signagePins;
    for (var i = 0; i < pins.length; i++) if (pins[i].id === activePinId) return pins[i];
    if (pins.length) { activePinId = pins[0].id; return pins[0]; }
    var def = newPin({ locCode: 'main_point_1', en_name: 'Main Corridor Poster', ar_name: 'لوحة الممر الرئيسي' });
    pins.push(def); activePinId = def.id;
    return def;
  }

  function buildQrUrl(pin) {
    ensureMeta();
    var base = (St.project.meta.qrBaseUrl || '').trim();
    var code = encodeURIComponent((pin.locCode || pin.id).trim());
    if (!base) return '';
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'loc=' + code;
  }

  function interiorFootprint(featureId) {
    var f = (St.project.features || []).filter(function (x) { return x.id === featureId; })[0];
    var inter = St.project.interiors && St.project.interiors[featureId];
    if (!f || !inter || f.geometryType !== 'polygon' || f.coordsMetric.length < 3) return null;
    var w = featPts(f), cx = 0, cy = 0;
    w.forEach(function (p) { cx += p.x; cy += p.y; }); cx /= w.length; cy /= w.length;
    var a = inter.alignAngleRad || 0, ca = Math.cos(a), sa = Math.sin(a);
    var loc = w.map(function (p) { var dx = p.x - cx, dy = p.y - cy; return { x: dx * ca - dy * sa, y: dx * sa + dy * ca }; });
    return { f: f, inter: inter, loc: loc, bnd: bb(loc), alignAngleRad: a };
  }

  // =========================================================================
  // CONTEXT-AWARE ROUTE & EXTINGUISHER SOLVER
  // =========================================================================
  function solvePinContext(pin) {
    var out = { firePath: null, fireDist: 0, shellingPath: null, shellingDist: 0, nearestExt: null, extDist: 0 };
    if (pin.scope === 'interior') {
      var info = interiorFootprint(pin.featureId);
      if (!info) return out;
      var flData = (info.inter.floors && info.inter.floors[pin.floor]) || { rooms: [], walls: [], items: [] };
      var bestExit = null, dExit = 1e18, bestHaven = null, dHaven = 1e18, bestExt = null, dExt = 1e18;
      (flData.items || []).forEach(function (it) {
        var d = Math.hypot(it.x - pin.x, it.y - pin.y);
        if (it.type === 'emergency_exit' || it.type === 'main_entrance' || it.type === 'stairs') {
          var prio = it.type === 'emergency_exit' ? d * 0.85 : d;
          if (prio < dExit) { dExit = prio; bestExit = { x: it.x, y: it.y, dist: d, label: it.en_name || it.type.replace('_', ' ') }; }
        }
        if (it.type === 'safe_haven' && d < dHaven) { dHaven = d; bestHaven = { x: it.x, y: it.y, dist: d, label: it.en_name || 'Safe Haven' }; }
        if (it.type === 'extinguisher' && d < dExt) { dExt = d; bestExt = { x: it.x, y: it.y, dist: d }; }
      });
      if (bestExit) { out.firePath = [{ x: pin.x, y: pin.y }, { x: bestExit.x, y: bestExit.y }]; out.fireDist = bestExit.dist; }
      if (bestHaven) { out.shellingPath = [{ x: pin.x, y: pin.y }, { x: bestHaven.x, y: bestHaven.y }]; out.shellingDist = bestHaven.dist; }
      if (bestExt) { out.nearestExt = bestExt; out.extDist = bestExt.dist; }
      return out;
    }

    function solveExt(proto, goalMode) {
      var g = St.project.routes && St.project.routes[proto];
      if (!g || !g.nodes || !g.nodes.length || !S.Routing || !S.Routing.solveDijkstra) return null;
      var near = null, bd = 1e18;
      g.nodes.forEach(function (n) {
        if (n.blocked) return;
        var d = Math.hypot(n.x - pin.x, n.y - pin.y);
        if (d < bd) { bd = d; near = n; }
      });
      if (!near) return null;
      var res = S.Routing.solveDijkstra(proto, near.id, goalMode);
      if (!res.ok && proto === 'fire' && goalMode === 'assembly') res = S.Routing.solveDijkstra(proto, near.id, 'any');
      if (!res.ok) return null;
      var pts = [{ x: pin.x, y: pin.y }];
      res.nodeIds.forEach(function (id) {
        for (var i = 0; i < g.nodes.length; i++) if (g.nodes[i].id === id) { pts.push({ x: g.nodes[i].x, y: g.nodes[i].y }); break; }
      });
      return { pts: pts, dist: res.distance + bd };
    }
    var fr = solveExt('fire', 'assembly');
    if (fr) { out.firePath = fr.pts; out.fireDist = fr.dist; }
    var sh = solveExt('shelling', 'any');
    if (sh) { out.shellingPath = sh.pts; out.shellingDist = sh.dist; }

    var bestE = null, dE = 1e18;
    (St.project.features || []).forEach(function (f) {
      if (f.category === 'extinguisher' && f.visible !== false) {
        var p = f.coordsMetric[0] || f.center;
        var d = Math.hypot(p.x - pin.x, p.y - pin.y);
        if (d < dE) { dE = d; bestE = { x: p.x, y: p.y, dist: d }; }
      }
    });
    if (bestE) { out.nearestExt = bestE; out.extDist = bestE.dist; }
    return out;
  }

  // =========================================================================
