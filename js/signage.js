window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', SANS = 'system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif';
  var ov, cv, ctx, W = 1, H = 1, dpr = 1, isOpen = false, built = false, mode = 'place';
  var view = { s: 4, ox: 0, oy: 0 }, ptrs = {}, drag = null, activePinId = null;

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
  // CSS & HELPERS
  // =========================================================================
  function ensureCss() {
    if (document.getElementById('sos-signage-css')) return;
    var st = document.createElement('style');
    st.id = 'sos-signage-css';
    st.textContent =
      '.sg{position:fixed;inset:0;z-index:920;background:#080b10;color:#cfe8ff;display:flex;flex-direction:column;font-family:' + MONO + '}' +
      '.sg.hide{display:none}' +
      '.sgtop{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#0e141d;border-bottom:1px solid #1b2838;overflow-x:auto;flex-wrap:nowrap;flex-shrink:0}' +
      '.sgtop::-webkit-scrollbar{height:5px}.sgtop::-webkit-scrollbar-thumb{background:#1b2838;border-radius:3px}' +
      '.sgt{color:#39ff14;font-size:12px;letter-spacing:.5px;white-space:nowrap;margin-right:4px}' +
      '.sg button,.sg select,.sg input{font-family:' + MONO + ';font-size:11px;background:#0b1119;color:#cfe8ff;border:1px solid #1b2838;border-radius:4px;padding:5px 8px;outline:none}' +
      '.sg button{cursor:pointer;white-space:nowrap;flex-shrink:0}' +
      '.sg button:hover{border-color:#00d9ff;color:#fff}' +
      '.sg button.on{border-color:#39ff14;color:#39ff14;background:rgba(57,255,20,.12)}' +
      '.sg button.cy{border-color:#00d9ff;color:#00d9ff;background:rgba(0,217,255,.12)}' +
      '.sg button.dng{border-color:#ff3c3c;color:#ff3c3c}' +
      '.sg .sp{flex:1;min-width:8px}' +
      '.sgbody{display:flex;flex:1;min-height:0;overflow:hidden}' +
      '.sgside{width:280px;background:#0e141d;border-right:1px solid #1b2838;padding:10px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex-shrink:0}' +
      '.sgside.r{border-right:0;border-left:1px solid #1b2838;width:255px}' +
      '.sgside h4{margin:6px 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#00d9ff;border-bottom:1px solid #1b2838;padding-bottom:2px}' +
      '.sgside label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#8fa6bc}' +
      '.sgside label.ck{flex-direction:row;align-items:center;gap:6px;color:#cfe8ff;cursor:pointer}' +
      '.sg .row{display:flex;gap:5px;margin-top:2px}.sg .row button{flex:1}' +
      '.sg .mut{font-size:10px;color:#7a93a8;line-height:1.45;margin:0;word-break:break-all}' +
      '.sgcv{flex:1;position:relative;min-width:0;min-height:0;background:#101620;overflow:hidden}' +
      '#sgCv{width:100%;height:100%;display:block;touch-action:none}' +
      '.sgpin{padding:6px 8px;border:1px solid #1b2838;border-radius:4px;background:#0b1119;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px}' +
      '.sgpin:hover{border-color:#00d9ff}.sgpin.sel{border-color:#39ff14;background:rgba(57,255,20,.1);color:#fff}' +
      '.sgpin small{color:#7a93a8;font-size:10px}' +
      '@media (max-width:900px){' +
        '.sgbody{flex-direction:column}' +
        '.sgside,.sgside.r{width:100%;max-height:175px;border:0;border-bottom:1px solid #1b2838}' +
        '.sgside.r{border-bottom:0;border-top:1px solid #1b2838;max-height:140px}' +
        '.sgcv{flex:1;min-height:240px}' +
      '}';
    document.head.appendChild(st);
  }

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function fmt(sec) { var m = Math.floor(sec / 60), s = Math.round(sec % 60); return m ? (m + 'm ' + (s < 10 ? '0' : '') + s + 's') : (s + 's'); }
  function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function cen(a) { var x = 0, y = 0; a.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / a.length, y: y / a.length }; }
  function bb(a) { var b = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; a.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }); return b; }
  function area(a) { var s = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length]; s += a[i].x * q.y - q.x * a[i].y; } return Math.abs(s) / 2; }
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

  function ensureMeta() {
    if (!St.project.meta) St.project.meta = {};
    if (typeof St.project.meta.qrBaseUrl !== 'string') St.project.meta.qrBaseUrl = '';
    if (!Array.isArray(St.project.signagePins)) St.project.signagePins = [];
  }

  function newPin(o) {
    var idx = (St.project.signagePins || []).length + 1;
    return Object.assign({
      id: nid('pin'),
      locCode: 'zone_' + idx,
      en_name: 'Wall Sign ' + idx,
      ar_name: 'لوحة جدارية ' + idx,
      scope: 'exterior',
      view3D: true,
      featureId: null,
      floor: '1',
      x: 0,
      y: 0,
      facingDeg: 0,
      headsUp: true,
      paper: 'A3_L',
      dpi: 150,
      showQR: true,
      showFire: true,
      showShelling: true
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
  // DAYLIGHT PRINT 3D ISOMETRIC & 2D PLAN RENDERER
  // =========================================================================
  function drawArrowHead(c, x1, y1, x2, y2, col, sz) {
    var ang = Math.atan2(y2 - y1, x2 - x1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    c.save(); c.translate(mx, my); c.rotate(ang);
    c.fillStyle = col; c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1, sz * 0.16);
    c.beginPath(); c.moveTo(sz, 0); c.lineTo(-sz * 0.72, -sz * 0.62); c.lineTo(-sz * 0.45, 0); c.lineTo(-sz * 0.72, sz * 0.62); c.closePath();
    c.fill(); c.stroke(); c.restore();
  }

  function drawYouAreHere(c, sx, sy, uScale, facingScreenRad) {
    var r = Math.max(10, 14 * uScale);
    c.save();
    c.beginPath(); c.arc(sx, sy, r * 1.75, 0, 6.3); c.fillStyle = 'rgba(220,38,38,0.18)'; c.fill();
    c.strokeStyle = '#dc2626'; c.lineWidth = Math.max(1.5, 2 * uScale); c.stroke();
    c.save(); c.translate(sx, sy); c.rotate(facingScreenRad);
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * 2.5, -Math.PI / 2 - 0.36, -Math.PI / 2 + 0.36); c.closePath();
    c.fillStyle = 'rgba(234,179,8,0.42)'; c.fill();
    c.strokeStyle = '#b45309'; c.lineWidth = Math.max(1.2, 1.5 * uScale);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r * 2.4); c.stroke();
    c.restore();
    c.beginPath(); c.arc(sx, sy, r * 0.9, 0, 6.3); c.fillStyle = '#dc2626'; c.fill();
    c.strokeStyle = '#facc15'; c.lineWidth = Math.max(2, 2.8 * uScale); c.stroke();
    c.beginPath(); c.arc(sx, sy, r * 0.3, 0, 6.3); c.fillStyle = '#ffffff'; c.fill();
    var fs = Math.max(10, Math.round(12 * uScale));
    c.font = 'bold ' + fs + 'px ' + SANS;
    var txt = 'أنت هنا • YOU ARE HERE';
    var tw = c.measureText(txt).width + 14 * uScale, bh = fs + 10 * uScale;
    c.fillStyle = '#b91c1c'; c.fillRect(sx - tw / 2, sy + r * 1.35, tw, bh);
    c.strokeStyle = '#facc15'; c.lineWidth = Math.max(1.2, 1.8 * uScale); c.strokeRect(sx - tw / 2, sy + r * 1.35, tw, bh);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(txt, sx, sy + r * 1.35 + bh / 2);
    c.restore();
  }

  function drawPrintCompass(c, cx, cy, rad, northAngRad) {
    var nx = -Math.sin(northAngRad), ny = Math.cos(northAngRad);
    c.save();
    c.beginPath(); c.arc(cx, cy, rad, 0, 6.3);
    c.fillStyle = 'rgba(255,255,255,0.95)'; c.fill();
    c.strokeStyle = '#1e293b'; c.lineWidth = Math.max(1.5, rad * 0.05); c.stroke();
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + nx * rad * 0.65, cy - ny * rad * 0.65);
    c.strokeStyle = '#dc2626'; c.lineWidth = Math.max(2.5, rad * 0.11); c.stroke();
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - nx * rad * 0.55, cy + ny * rad * 0.55);
    c.strokeStyle = '#475569'; c.lineWidth = Math.max(1.5, rad * 0.07); c.stroke();
    c.fillStyle = '#dc2626'; c.font = 'bold ' + Math.round(rad * 0.36) + 'px ' + MONO;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', cx + nx * rad * 0.82, cy - ny * rad * 0.82);
    c.restore();
  }

  function drawExteriorDaylightMap(c, rect, pin, ctxRes, rotRad, customView) {
    var x0 = rect.x, y0 = rect.y, rw = rect.w, rh = rect.h;
    var fs = (St.project.features || []).filter(function (f) { return f.visible !== false; });
    var use3D = pin.view3D !== false;
    var tilt = use3D ? (42 * D) : 0;
    var cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    var ca = Math.cos(rotRad), sa = Math.sin(rotRad);
    function rotPt(p) { return { x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }; }

    var s, ox, oy;
    if (customView) {
      s = customView.s; ox = customView.ox; oy = customView.oy;
    } else {
      var all = [];
      fs.forEach(function (f) { featPts(f).forEach(function (p) { all.push(rotPt(p)); }); });
      all.push(rotPt({ x: pin.x, y: pin.y }));
      var b = all.length ? bb(all) : { x0: -40, x1: 40, y0: -40, y1: 40 };
      var bw = Math.max(15, b.x1 - b.x0), bh = Math.max(15, (b.y1 - b.y0) * Math.max(0.55, cosT));
      s = 0.82 * Math.min(rw / bw, rh / bh);
      ox = x0 + rw / 2 - ((b.x0 + b.x1) / 2) * s;
      oy = y0 + rh / 2 + ((b.y0 + b.y1) / 2) * s * cosT;
    }
    function P3(x, y, z) {
      var q = rotPt({ x: x, y: y });
      return [ox + q.x * s, oy - q.y * s * cosT - (z || 0) * s * sinT, q.y];
    }
    function T(p) { return P3(p.x, p.y, 0); }
    var uScale = Math.max(0.7, Math.min(2.6, Math.min(rw, rh) / 680));

    c.save();
    c.beginPath(); c.rect(x0, y0, rw, rh); c.clip();
    c.fillStyle = '#f6f1e7'; c.fillRect(x0, y0, rw, rh);

    var st = [5, 10, 20, 50].filter(function (v) { return v * s >= 45; })[0] || 50;
    c.strokeStyle = 'rgba(100,85,65,0.1)'; c.lineWidth = Math.max(0.8, 0.8 * uScale);
    for (var gx = -300; gx <= 300; gx += st) {
      var p1 = P3(gx, -300, 0), p2 = P3(gx, 300, 0);
      c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke();
    }
    for (var gy = -300; gy <= 300; gy += st) {
      var q1 = P3(-300, gy, 0), q2 = P3(300, gy, 0);
      c.beginPath(); c.moveTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]); c.stroke();
    }

    function poly(arr, fill, stroke, lw) {
      c.beginPath();
      arr.forEach(function (pt, i) { i ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1]); });
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || Math.max(1, 1.2 * uScale); c.stroke(); }
    }
    function ln3(u, v) { c.beginPath(); c.moveTo(u[0], u[1]); c.lineTo(v[0], v[1]); c.stroke(); }
    function shadow3(a, h) {
      if (!use3D || !(h > 0.2)) return;
      poly(a.map(function (p) { return P3(p.x + h * 0.42, p.y - h * 0.34, 0); }), 'rgba(40,34,24,0.22)');
    }
    function ext3(a, h, col, fl, winCol, edgeCol) {
      if (!use3D || !(h > 0.1)) return;
      var ws = [];
      for (var i = 0; i < a.length; i++) {
        var p = a[i], q = a[(i + 1) % a.length];
        ws.push({ p: p, q: q, d: P3((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], L: Math.hypot(q.x - p.x, q.y - p.y) });
      }
      ws.sort(function (u, v) { return v.d - u.d; });
      ws.forEach(function (w) {
        function at(t, z) { return P3(w.p.x + (w.q.x - w.p.x) * t, w.p.y + (w.q.y - w.p.y) * t, z); }
        poly([at(0, 0), at(1, 0), at(1, h), at(0, h)], shade(col, 0.9), edgeCol || '#2b3440', Math.max(1, 1.1 * uScale));
        c.strokeStyle = '#64748b';
        for (var k = 1; k < fl; k++) ln3(at(0, h * k / fl), at(1, h * k / fl));
        if (winCol && w.L > 3 && s > 1.1) {
          for (var k2 = 0; k2 < fl; k2++) for (var sx = 1; sx < w.L - 2; sx += 2.6) {
            poly([at(sx / w.L, h * (k2 + .28) / fl), at((sx + 1.4) / w.L, h * (k2 + .28) / fl), at((sx + 1.4) / w.L, h * (k2 + .72) / fl), at(sx / w.L, h * (k2 + .72) / fl)], winCol, '#223244', 0.8);
          }
        }
      });
    }
    function roof3(a, h, col, type, rc) {
      var zh = use3D ? h : 0, cm = cen(a);
      if (type === 'quonset') {
        for (var i = 0; i < 4; i++) {
          var t = i / 4 * Math.PI / 2, sc2 = Math.cos(t), z = zh + (use3D ? Math.sin(t) * Math.max(1.2, h * 0.5) : 0);
          poly(a.map(function (p) { return P3(cm.x + (p.x - cm.x) * sc2, cm.y + (p.y - cm.y) * sc2, z); }), shade(rc || col, 0.9 + i * 0.03), '#475569');
        }
        return;
      }
      if (type === 'pyramid' || type === 'red_tile') {
        var ap = P3(cm.x, cm.y, zh + (use3D ? Math.max(1.4, h * 0.48) : 0)), es = [], red = type === 'red_tile';
        for (var j = 0; j < a.length; j++) { var p = a[j], q = a[(j + 1) % a.length]; es.push({ p: p, q: q, d: P3((p.x + q.x) / 2, (p.y + q.y) / 2, 0)[2], i: j }); }
        es.sort(function (u, v) { return v.d - u.d; });
        es.forEach(function (e) {
          poly([P3(e.p.x, e.p.y, zh), P3(e.q.x, e.q.y, zh), ap], red ? shade('#cf4b43', 0.84 + 0.06 * (e.i % 3)) : shade(rc || col, 0.9 + 0.04 * (e.i % 3)), '#333d47');
        });
        return;
      }
      poly(a.map(function (p) { return P3(p.x, p.y, zh); }), rc || shade(col, 1.04), '#2b3440');
    }
    function tree3(x, y) {
      var rad = Math.max(2.6, 1.65 * s);
      if (use3D) {
        var sh = P3(x + 1.1, y - 0.9, 0);
        c.beginPath(); c.arc(sh[0], sh[1], rad * 0.95, 0, 6.3); c.fillStyle = 'rgba(45,40,28,0.22)'; c.fill();
        c.strokeStyle = '#5c4028'; c.lineWidth = Math.max(1.4, 0.26 * s); ln3(P3(x, y, 0), P3(x, y, 2.5));
      }
      var v = P3(x, y, use3D ? 2.6 : 0);
      c.beginPath(); c.arc(v[0], v[1], rad * 0.95, 0, 6.3); c.fillStyle = '#476b2d'; c.fill(); c.strokeStyle = '#283d19'; c.lineWidth = 0.9; c.stroke();
      c.beginPath(); c.arc(v[0] - rad * 0.22, v[1] - rad * 0.2, rad * 0.62, 0, 6.3); c.fillStyle = '#6a9344'; c.fill();
    }

    // 1. Compound sandy terrain
    fs.forEach(function (f) {
      if (f.category === 'fence' && f.geometryType === 'polygon') poly(featPts(f).map(T), '#f1dbb0');
    });

    // 2. Depth-sorted features (supports both 3D Isometric and 2D Plan cleanly)
    var TIER = { yard: 0, road: 0, parking: 0, fence: 1, field: 1, playground: 1 };
    var list = fs.map(function (f) {
      return { f: f, t: f.geometryType === 'point' ? 3 : (TIER[f.category] === undefined ? 2 : TIER[f.category]), d: P3(f.center.x, f.center.y, 0)[2] };
    });
    list.sort(function (a, b) { return a.t - b.t || b.d - a.d; });

    list.forEach(function (item) {
      var f = item.f, cat = f.category;
      if (f.geometryType === 'point') {
        var pt = T(f.coordsMetric[0] || f.center);
        if (cat === 'assembly') {
          var rA = Math.max(10, 5.5 * s);
          c.beginPath(); c.arc(pt[0], pt[1], rA, 0, 6.3); c.fillStyle = 'rgba(22,163,74,0.24)'; c.fill();
          c.strokeStyle = '#15803d'; c.lineWidth = Math.max(2, 2.4 * uScale); c.stroke();
          c.beginPath(); c.arc(pt[0], pt[1], Math.max(8, 10 * uScale), 0, 6.3); c.fillStyle = '#15803d'; c.fill();
          c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.5, 2 * uScale); c.stroke();
          c.fillStyle = '#ffffff'; c.font = 'bold ' + Math.round(11 * uScale) + 'px ' + MONO; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('A', pt[0], pt[1] + 0.5);
        } else if (cat === 'vehicle') {
          var r = (f.rotationDeg || 0) * D, cs = Math.cos(r), sn = Math.sin(r), p0 = f.coordsMetric[0] || f.center;
          var box = [[-5, -1.25], [5, -1.25], [5, 1.25], [-5, 1.25]].map(function (q) { return { x: p0.x + q[0] * cs - q[1] * sn, y: p0.y + q[0] * sn + q[1] * cs }; });
          shadow3(box, 2.9); ext3(box, 1.3, '#1e5aa8', 1, null, '#1b2838'); ext3(box, 2.9, '#eef2f6', 1, '#3b6d9c', '#1b2838'); roof3(box, 2.9, '#fff', 'flat', '#f8fafc');
        } else if (cat === 'tree') {
          tree3((f.coordsMetric[0] || f.center).x, (f.coordsMetric[0] || f.center).y);
        } else if (cat === 'extinguisher') {
          var pe = P3((f.coordsMetric[0] || f.center).x, (f.coordsMetric[0] || f.center).y, use3D ? 0.9 : 0);
          var rE = Math.max(5, 7 * uScale);
          c.beginPath(); c.arc(pe[0], pe[1], rE, 0, 6.3); c.fillStyle = '#dc2626'; c.fill();
          c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.5, 1.8 * uScale); c.stroke();
          c.fillStyle = '#ffffff'; c.font = 'bold ' + Math.round(8 * uScale) + 'px ' + MONO; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('F', pe[0], pe[1] + 0.5);
        }
        return;
      }

      var a = featPts(f), pts2 = a.map(T), h = +f.height_m || 0, fl = Math.max(1, f.floors | 0);
      if (cat === 'road') poly(pts2, '#d4d0c8', '#7a756c');
      else if (cat === 'yard') poly(pts2, '#e8d0a2', '#c0aa80');
      else if (cat === 'parking') poly(pts2, '#9ca3af', '#374151');
      else if (cat === 'playground') poly(pts2, '#e8ca8e', '#785a3a');
      else if (cat === 'fence') {
        var fh = use3D ? (h || 2.4) : 0;
        if (use3D) ext3(a, 0.7, '#d1ccc2', 1, null, '#4b5563');
        c.strokeStyle = '#4b5563'; c.lineWidth = Math.max(1.6, 2 * uScale);
        poly(pts2, null, '#4b5563', Math.max(1.6, 2 * uScale));
        if (fh > 0) {
          poly(a.map(function (p) { return P3(p.x, p.y, fh); }), null, '#4b5563', 1.2);
          a.forEach(function (p) { ln3(P3(p.x, p.y, 0), P3(p.x, p.y, fh)); });
        }
      } else if (cat === 'field') {
        poly(pts2, '#3fa335', '#ffffff', Math.max(1.5, 1.8 * uScale));
        var th = domAng(a), cs2 = Math.cos(th), sn2 = Math.sin(th), mc = cen(a);
        function F2W(lx, ly) { return { x: mc.x + lx * cs2 - ly * sn2, y: mc.y + lx * sn2 + ly * cs2 }; }
        var fb = bb(a.map(function (p) { var dx = p.x - mc.x, dy = p.y - mc.y; return { x: dx * cs2 + dy * sn2, y: -dx * sn2 + dy * cs2 }; }));
        var fw = fb.x1 - fb.x0, fd = fb.y1 - fb.y0, mx = (fb.x0 + fb.x1) / 2, my = (fb.y0 + fb.y1) / 2;
        c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.2, 1.5 * uScale);
        ln3(P3(F2W(mx, fb.y0).x, F2W(mx, fb.y0).y, .02), P3(F2W(mx, fb.y1).x, F2W(mx, fb.y1).y, .02));
        var cr = Math.min(fw, fd) * 0.15, ring = [];
        for (var i = 0; i < 32; i++) { var rp = F2W(mx + cr * Math.cos(i / 32 * 6.2832), my + cr * Math.sin(i / 32 * 6.2832)); ring.push(P3(rp.x, rp.y, .02)); }
        poly(ring, null, '#ffffff', Math.max(1.2, 1.4 * uScale));
      } else if (cat === 'olive_zone') {
        poly(pts2, '#ebd4a2', '#b09a70');
        var ob = bb(a), cnt = Math.min(45, Math.max(5, (area(a) / 45) | 0)), sd = hash(f.id), tr = [], tries = 0;
        while (tr.length < cnt && tries++ < cnt * 15) {
          sd = (sd * 1664525 + 1013904223) >>> 0; var rx = ob.x0 + sd / 4294967296 * (ob.x1 - ob.x0);
          sd = (sd * 1664525 + 1013904223) >>> 0; var ry = ob.y0 + sd / 4294967296 * (ob.y1 - ob.y0);
          if (inP(rx, ry, a)) tr.push({ x: rx, y: ry, d: P3(rx, ry, 0)[2] });
        }
        tr.sort(function (p, q) { return q.d - p.d; });
        tr.forEach(function (t) { tree3(t.x, t.y); });
      } else if (cat === 'solar') {
        var sb = bb(a), tp = a.map(function (p) { return P3(p.x, p.y, use3D ? (.5 + (p.y - sb.y0) / Math.max(1, sb.y1 - sb.y0) * 1.3) : 0); });
        shadow3(a, 1.4);
        if (use3D) { c.strokeStyle = '#475569'; a.forEach(function (p, j) { ln3(P3(p.x, p.y, 0), tp[j]); }); }
        poly(tp, '#224a88', '#1e293b', Math.max(1.1, 1.4 * uScale));
      } else if (cat === 'pool') {
        shadow3(a, h || 3); poly(pts2, '#38bdf8', '#0369a1', Math.max(1.4, 1.8 * uScale));
        if (use3D) { c.save(); c.globalAlpha = 0.35; roof3(a, 1.8, '#e2f2fc', 'quonset', '#f0f9ff'); c.restore(); }
      } else if (cat === 'hazard' || cat === 'diesel_tank') {
        var hh = h || 2.4; shadow3(a, hh); ext3(a, hh * 0.65, '#cbd2d9', 1, null, '#b91c1c'); roof3(a, hh * 0.65, '#eef2f6', 'quonset', '#f8fafc');
      } else if ((cat === 'tent' || cat === 'cottage') && (f.renderMode || (area(f.coordsMetric) > 45 ? 'auto' : 'solid')) === 'auto') {
        var cot = cat === 'cottage', u = cot ? 4 : 3.5, v = cot ? 3.2 : 3.5, px = u + (cot ? 1.8 : 1.4), py = v + (cot ? 2.2 : 1.4),
          zth = domAng(a), zcs = Math.cos(zth), zsn = Math.sin(zth), zm = cen(a), us = [], zx, zy;
        function L2W(lx, ly) { return { x: zm.x + lx * zcs - ly * zsn, y: zm.y + lx * zsn + ly * zcs }; }
        var zb = bb(a.map(function (p) { var dx = p.x - zm.x, dy = p.y - zm.y; return { x: dx * zcs + dy * zsn, y: -dx * zsn + dy * zcs }; }));
        poly(pts2, 'rgba(218,195,152,0.35)', 'rgba(130,115,90,0.45)');
        for (zy = zb.y0 + v / 2 + .3; zy <= zb.y1 - v / 2 && us.length < 220; zy += py)
          for (zx = zb.x0 + u / 2 + .3; zx <= zb.x1 - u / 2 && us.length < 220; zx += px) {
            var cn = [[-u / 2, -v / 2], [u / 2, -v / 2], [u / 2, v / 2], [-u / 2, v / 2]].map(function (q) { return L2W(zx + q[0], zy + q[1]); });
            if (cn.every(function (q) { return inP(q.x, q.y, a); })) { var cc = L2W(zx, zy); us.push({ cn: cn, d: P3(cc.x, cc.y, 0)[2] }); }
          }
        if (!us.length) {
          var fu = Math.max(2.2, Math.min(u, (zb.x1 - zb.x0) * .6)), fv = Math.max(2.2, Math.min(v, (zb.y1 - zb.y0) * .6));
          us.push({ cn: [[-fu / 2, -fv / 2], [fu / 2, -fv / 2], [fu / 2, fv / 2], [-fu / 2, fv / 2]].map(function (q) { return L2W(q[0], q[1]); }), d: P3(zm.x, zm.y, 0)[2] });
        }
        us.sort(function (p, q) { return q.d - p.d; });
        us.forEach(function (o) {
          shadow3(o.cn, cot ? 3 : 2.4);
          if (cot) { ext3(o.cn, 2.1, '#c88d55', 1, null, '#3c2918'); roof3(o.cn, 2.1, '#b26e38', 'pyramid', '#b26e38'); }
          else { ext3(o.cn, 1.2, '#f2f3f0', 1, null, '#475569'); roof3(o.cn, 1.2, '#ffffff', 'pyramid', '#ffffff'); }
        });
      } else if (cat === 'medical') {
        shadow3(a, h); ext3(a, h, '#ede9e1', 1, '#5b8ec4', '#2b3440'); roof3(a, h, '#d4423e', 'red_tile');
        var cm = cen(a), um = P3(cm.x, cm.y, use3D ? (h + Math.max(1.4, h * 0.48) * 0.55) : 0), mcr = Math.max(6, Math.min(18 * uScale, 2.2 * s));
        c.beginPath(); c.arc(um[0], um[1], mcr, 0, 6.3); c.fillStyle = '#ffffff'; c.fill();
        c.beginPath(); c.arc(um[0] - mcr * 0.08, um[1], mcr * 0.65, 0, 6.3); c.fillStyle = '#d62828'; c.fill();
        c.beginPath(); c.arc(um[0] + mcr * 0.22, um[1], mcr * 0.55, 0, 6.3); c.fillStyle = '#ffffff'; c.fill();
      } else if (cat === 'security') {
        shadow3(a, h); ext3(a, h, '#dedbd4', 1, '#4f8ec9', '#2b3440'); roof3(a, h, '#c9413b', 'red_tile');
      } else if (cat === 'gate') {
        ext3(a, 1.4, '#dc2626', 1, null, '#1f2937'); roof3(a, 1.4, '#ffffff', 'flat', '#f8fafc');
      } else {
        shadow3(a, h); ext3(a, h, '#cfd7df', fl, '#4b86c2', '#2b3440'); roof3(a, h, '#cfd7df', f.roofType || 'flat', '#dfe5ec');
      }
    });

    // 3. Emergency Routes & Extinguisher Callout
    function drawRoutePoly(ptsArr, mainCol, casingCol, dash) {
      if (!ptsArr || ptsArr.length < 2) return;
      var sp = ptsArr.map(function (p) { return P3(p.x, p.y, use3D ? 0.55 : 0); });
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = casingCol; c.lineWidth = Math.max(5, 7.5 * uScale);
      if (dash) c.setLineDash(dash);
      c.beginPath(); sp.forEach(function (p, i) { i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.stroke();
      c.strokeStyle = mainCol; c.lineWidth = Math.max(3, 4.6 * uScale);
      c.beginPath(); sp.forEach(function (p, i) { i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.stroke();
      c.setLineDash([]);
      for (var i = 0; i < sp.length - 1; i++) {
        if (Math.hypot(sp[i + 1][0] - sp[i][0], sp[i + 1][1] - sp[i][1]) > 18 * uScale) {
          drawArrowHead(c, sp[i][0], sp[i][1], sp[i + 1][0], sp[i + 1][1], mainCol, Math.max(6, 9 * uScale));
        }
      }
      c.restore();
    }
    if (pin.showShelling && ctxRes.shellingPath) drawRoutePoly(ctxRes.shellingPath, '#2563eb', '#ffffff', [12 * uScale, 6 * uScale]);
    if (pin.showFire && ctxRes.firePath) drawRoutePoly(ctxRes.firePath, '#16a34a', '#ffffff', null);

    if (ctxRes.nearestExt) {
      var pPin = P3(pin.x, pin.y, use3D ? 0.6 : 0), pExt = P3(ctxRes.nearestExt.x, ctxRes.nearestExt.y, use3D ? 0.6 : 0);
      c.save(); c.strokeStyle = '#dc2626'; c.lineWidth = Math.max(1.5, 2 * uScale); c.setLineDash([5 * uScale, 4 * uScale]);
      ln3(pPin, pExt); c.setLineDash([]);
      c.beginPath(); c.arc(pExt[0], pExt[1], Math.max(9, 12 * uScale), 0, 6.3);
      c.strokeStyle = '#dc2626'; c.lineWidth = Math.max(2, 2.5 * uScale); c.stroke(); c.restore();
    }

    // 4. Collision-free bilingual labels
    var placed = [], lfs = Math.max(8, Math.round(10 * uScale)), lh = lfs + 6 * uScale;
    var pPinS = P3(pin.x, pin.y, use3D ? 0.6 : 0);
    placed.push([pPinS[0] - 75 * uScale, pPinS[1] - 25 * uScale, 150 * uScale, 65 * uScale]);
    c.font = 'bold ' + lfs + 'px ' + SANS; c.textAlign = 'center'; c.textBaseline = 'middle';
    fs.forEach(function (f) {
      if (f.category === 'fence' || f.category === 'road' || f.category === 'yard' || f.category === 'extinguisher') return;
      var txt = f.ar_name || f.en_name; if (!txt) return;
      var pt0 = f.geometryType === 'point' ? (f.coordsMetric[0] || f.center) : f.center;
      var z = use3D ? (f.geometryType === 'point' ? 2.5 : (+f.height_m || 2)) : 0;
      var pt = P3(pt0.x, pt0.y, z);
      var tw = c.measureText(txt).width + 10 * uScale;
      var rx = pt[0] - tw / 2, ry = pt[1] - lh - 4 * uScale;
      if (rx < x0 + 4 || rx + tw > x0 + rw - 4 || ry < y0 + 4 || ry + lh > y0 + rh - 4) return;
      for (var i = 0; i < placed.length; i++) {
        var q = placed[i];
        if (rx - 3 < q[0] + q[2] && rx + tw + 3 > q[0] && ry - 3 < q[1] + q[3] && ry + lh + 3 > q[1]) return;
      }
      placed.push([rx, ry, tw, lh]);
      c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillRect(rx, ry, tw, lh);
      c.strokeStyle = '#64748b'; c.lineWidth = Math.max(0.8, 1 * uScale); c.strokeRect(rx, ry, tw, lh);
      c.fillStyle = '#0f172a'; c.fillText(txt, pt[0], ry + lh / 2 + 0.5);
    });

    // 5. YOU ARE HERE pin, Compass & Metric Scale
    drawYouAreHere(c, pPinS[0], pPinS[1], uScale, pin.headsUp ? 0 : (pin.facingDeg * D));
    drawPrintCompass(c, x0 + rw - 38 * uScale, y0 + 38 * uScale, 26 * uScale, rotRad);
    var nice = [5, 10, 20, 50, 100].filter(function (v) { return v * s >= 55 * uScale; })[0] || 100;
    var spx = nice * s, sx0 = x0 + 18 * uScale, sy0 = y0 + rh - 18 * uScale;
    c.fillStyle = 'rgba(255,255,255,0.88)'; c.fillRect(sx0 - 6 * uScale, sy0 - 20 * uScale, spx + 12 * uScale, 26 * uScale);
    c.strokeStyle = '#0f172a'; c.lineWidth = Math.max(2, 2.2 * uScale);
    c.beginPath(); c.moveTo(sx0, sy0); c.lineTo(sx0 + spx, sy0); c.moveTo(sx0, sy0 - 5 * uScale); c.lineTo(sx0, sy0 + 4 * uScale); c.moveTo(sx0 + spx, sy0 - 5 * uScale); c.lineTo(sx0 + spx, sy0 + 4 * uScale); c.stroke();
    c.fillStyle = '#0f172a'; c.font = 'bold ' + Math.round(10 * uScale) + 'px ' + MONO; c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillText(nice + ' m', sx0 + 2, sy0 - 5 * uScale);

    c.restore();
    return { s: s, ox: ox, oy: oy, rotRad: rotRad };
  }

  function drawInteriorDaylightMap(c, rect, pin, ctxRes, rotRad, customView) {
    var x0 = rect.x, y0 = rect.y, rw = rect.w, rh = rect.h;
    var info = interiorFootprint(pin.featureId);
    var uScale = Math.max(0.7, Math.min(2.6, Math.min(rw, rh) / 680));
    c.save(); c.beginPath(); c.rect(x0, y0, rw, rh); c.clip();
    c.fillStyle = '#f8fafc'; c.fillRect(x0, y0, rw, rh);
    if (!info) {
      c.fillStyle = '#b91c1c'; c.font = 'bold ' + Math.round(14 * uScale) + 'px ' + SANS;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('No interior floor plan found. Open Interiors first.', x0 + rw / 2, y0 + rh / 2);
      c.restore(); return { s: 10, ox: x0 + rw / 2, oy: y0 + rh / 2, rotRad: 0 };
    }
    var ca = Math.cos(rotRad), sa = Math.sin(rotRad);
    function rotPt(p) { return { x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }; }
    var s, ox, oy;
    if (customView) { s = customView.s; ox = customView.ox; oy = customView.oy; }
    else {
      var b = bb(info.loc.map(rotPt));
      var bw = Math.max(4, b.x1 - b.x0), bh = Math.max(4, b.y1 - b.y0);
      s = 0.78 * Math.min(rw / bw, rh / bh);
      ox = x0 + rw / 2 - ((b.x0 + b.x1) / 2) * s;
      oy = y0 + rh / 2 + ((b.y0 + b.y1) / 2) * s;
    }
    function T(p) { var q = rotPt(p); return [ox + q.x * s, oy - q.y * s]; }
    var flData = (info.inter.floors && info.inter.floors[pin.floor]) || { rooms: [], walls: [], items: [] };

    c.beginPath(); info.loc.map(T).forEach(function (pt, i) { i ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1]); }); c.closePath();
    c.fillStyle = '#ffffff'; c.fill();

    (flData.rooms || []).forEach(function (rm) {
      var cs = [
        { x: rm.x - rm.w / 2, y: rm.y - rm.h / 2 }, { x: rm.x + rm.w / 2, y: rm.y - rm.h / 2 },
        { x: rm.x + rm.w / 2, y: rm.y + rm.h / 2 }, { x: rm.x - rm.w / 2, y: rm.y + rm.h / 2 }
      ].map(T);
      c.beginPath(); cs.forEach(function (pt, i) { i ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1]); }); c.closePath();
      c.fillStyle = 'rgba(226,232,240,0.55)'; c.fill(); c.strokeStyle = '#64748b'; c.lineWidth = Math.max(1.2, 1.4 * uScale); c.stroke();
      var mc = T(rm);
      c.fillStyle = '#0f172a'; c.font = 'bold ' + Math.max(9, Math.round(11 * uScale)) + 'px ' + SANS;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(rm.ar_name || rm.en_name || '', mc[0], mc[1]);
    });

    c.strokeStyle = '#334155'; c.lineWidth = Math.max(2, 0.16 * s); c.lineCap = 'round';
    (flData.walls || []).forEach(function (w) {
      var a = T({ x: w.x1, y: w.y1 }), b = T({ x: w.x2, y: w.y2 });
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    });

    (flData.items || []).forEach(function (it) {
      var pt = T(it), ang = -(it.rotationDeg || 0) * D - rotRad;
      c.save(); c.translate(pt[0], pt[1]); c.rotate(ang); c.scale(s, s);
      var X = -it.w / 2, Y = -it.h / 2;
      if (it.type === 'safe_haven') {
        c.fillStyle = 'rgba(37,99,235,0.18)'; c.fillRect(X, Y, it.w, it.h);
        c.strokeStyle = '#1d4ed8'; c.lineWidth = 2.2 / s; c.strokeRect(X, Y, it.w, it.h);
      } else if (it.type === 'emergency_exit' || it.type === 'main_entrance') {
        c.fillStyle = '#16a34a'; c.fillRect(X, Y, it.w, it.h);
      } else if (it.type === 'stairs') {
        c.fillStyle = '#cbd5e1'; c.strokeStyle = '#334155'; c.lineWidth = 1.4 / s;
        c.fillRect(X, Y, it.w, it.h); c.strokeRect(X, Y, it.w, it.h);
        for (var k = 1; k < 7; k++) { c.beginPath(); c.moveTo(X, Y + it.h * k / 7); c.lineTo(X + it.w, Y + it.h * k / 7); c.stroke(); }
      } else if (it.type === 'extinguisher' || it.type === 'fire_alarm') {
        c.beginPath(); c.arc(0, 0, Math.max(it.w, it.h) / 2, 0, 6.3); c.fillStyle = '#dc2626'; c.fill();
      } else if (it.type === 'window') {
        c.fillStyle = '#f59e0b'; c.fillRect(X, Y, it.w, it.h);
      } else {
        c.fillStyle = '#e2e8f0'; c.strokeStyle = '#64748b'; c.lineWidth = 1 / s; c.fillRect(X, Y, it.w, it.h); c.strokeRect(X, Y, it.w, it.h);
      }
      c.restore();
    });

    c.beginPath(); info.loc.map(T).forEach(function (pt, i) { i ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1]); }); c.closePath();
    c.strokeStyle = '#0f172a'; c.lineWidth = Math.max(3, 0.28 * s); c.stroke();

    function guide(arr, col, dash) {
      if (!arr || arr.length < 2) return;
      var sp = arr.map(T);
      c.save(); c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(5, 7 * uScale);
      if (dash) c.setLineDash(dash);
      c.beginPath(); c.moveTo(sp[0][0], sp[0][1]); c.lineTo(sp[1][0], sp[1][1]); c.stroke();
      c.strokeStyle = col; c.lineWidth = Math.max(3, 4.2 * uScale);
      c.beginPath(); c.moveTo(sp[0][0], sp[0][1]); c.lineTo(sp[1][0], sp[1][1]); c.stroke();
      c.setLineDash([]); drawArrowHead(c, sp[0][0], sp[0][1], sp[1][0], sp[1][1], col, Math.max(6, 9 * uScale));
      c.restore();
    }
    if (pin.showShelling && ctxRes.shellingPath) guide(ctxRes.shellingPath, '#2563eb', [10 * uScale, 6 * uScale]);
    if (pin.showFire && ctxRes.firePath) guide(ctxRes.firePath, '#16a34a', null);
    if (ctxRes.nearestExt) {
      var p1 = T({ x: pin.x, y: pin.y }), p2 = T(ctxRes.nearestExt);
      c.save(); c.strokeStyle = '#dc2626'; c.lineWidth = Math.max(1.5, 2 * uScale); c.setLineDash([5 * uScale, 4 * uScale]);
      c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke(); c.restore();
    }

    var pPinS = T({ x: pin.x, y: pin.y });
    drawYouAreHere(c, pPinS[0], pPinS[1], uScale, pin.headsUp ? 0 : (pin.facingDeg * D));
    drawPrintCompass(c, x0 + rw - 38 * uScale, y0 + 38 * uScale, 26 * uScale, info.alignAngleRad + rotRad);
    c.restore();
    return { s: s, ox: ox, oy: oy, rotRad: rotRad };
  }

  // =========================================================================
  // FULL PRINT-READY A3 / A4 BILINGUAL POSTER COMPOSER
  // =========================================================================
  var PAPERS = {
    A3_L: { w: 420, h: 297, label: 'A3 Landscape' },
    A3_P: { w: 297, h: 420, label: 'A3 Portrait' },
    A4_L: { w: 297, h: 210, label: 'A4 Landscape' },
    A4_P: { w: 210, h: 297, label: 'A4 Portrait' }
  };

  function composePoster(c, pw, ph, pin) {
    ensureMeta();
    var u = Math.min(pw, ph) / 1000;
    var pad = 28 * u, hdrH = 108 * u, land = pw >= ph;
    var ctxRes = solvePinContext(pin);
    var rotRad = pin.headsUp ? (pin.facingDeg * D) : 0;

    c.fillStyle = '#ffffff'; c.fillRect(0, 0, pw, ph);
    c.strokeStyle = '#0f172a'; c.lineWidth = Math.max(3, 5 * u);
    c.strokeRect(pad * 0.5, pad * 0.5, pw - pad, ph - pad);

    c.fillStyle = '#0f172a'; c.fillRect(pad, pad, pw - pad * 2, hdrH);
    c.fillStyle = '#16a34a'; c.fillRect(pad, pad + hdrH - 7 * u, (pw - pad * 2) * 0.5, 7 * u);
    c.fillStyle = '#2563eb'; c.fillRect(pad + (pw - pad * 2) * 0.5, pad + hdrH - 7 * u, (pw - pad * 2) * 0.5, 7 * u);

    c.fillStyle = '#ffffff'; c.textBaseline = 'middle';
    c.font = 'bold ' + Math.round(30 * u) + 'px ' + SANS;
    c.textAlign = 'left'; c.fillText('EMERGENCY EVACUATION PLAN', pad + 22 * u, pad + hdrH * 0.34);
    c.textAlign = 'right'; c.fillText('خطة الطوارئ والإخلاء', pw - pad - 22 * u, pad + hdrH * 0.34);

    var locSub = (pin.en_name || pin.locCode) + (pin.scope === 'interior' ? (' — Floor ' + pin.floor) : '');
    var locSubAr = (pin.ar_name || pin.en_name || pin.locCode) + (pin.scope === 'interior' ? (' — طابق ' + pin.floor) : '');
    c.fillStyle = '#facc15'; c.font = 'bold ' + Math.round(20 * u) + 'px ' + SANS;
    c.textAlign = 'left'; c.fillText('LOCATION: ' + locSub, pad + 22 * u, pad + hdrH * 0.72);
    c.textAlign = 'right'; c.fillText('الموقع: ' + locSubAr, pw - pad - 22 * u, pad + hdrH * 0.72);

    var bodyY = pad + hdrH + 16 * u, bodyH = ph - bodyY - pad;
    var mapRect, sideRect;
    if (land) {
      var sideW = Math.round((pw - pad * 2) * 0.27);
      mapRect = { x: pad, y: bodyY, w: pw - pad * 2 - sideW - 16 * u, h: bodyH };
      sideRect = { x: mapRect.x + mapRect.w + 16 * u, y: bodyY, w: sideW, h: bodyH };
    } else {
      var sideH = Math.round(bodyH * 0.28);
      mapRect = { x: pad, y: bodyY, w: pw - pad * 2, h: bodyH - sideH - 16 * u };
      sideRect = { x: pad, y: mapRect.y + mapRect.h + 16 * u, w: pw - pad * 2, h: sideH };
    }

    if (pin.scope === 'interior') drawInteriorDaylightMap(c, mapRect, pin, ctxRes, rotRad, null);
    else drawExteriorDaylightMap(c, mapRect, pin, ctxRes, rotRad, null);
    c.strokeStyle = '#334155'; c.lineWidth = Math.max(2, 2.5 * u);
    c.strokeRect(mapRect.x, mapRect.y, mapRect.w, mapRect.h);

    c.fillStyle = '#f8fafc'; c.fillRect(sideRect.x, sideRect.y, sideRect.w, sideRect.h);
    c.strokeStyle = '#cbd5e1'; c.lineWidth = Math.max(1.5, 2 * u);
    c.strokeRect(sideRect.x, sideRect.y, sideRect.w, sideRect.h);

    var sx = sideRect.x + 16 * u, sy = sideRect.y + 16 * u, sw = sideRect.w - 32 * u;
    var qrUrl = buildQrUrl(pin);
    var qrSize = land ? Math.min(sw * 0.72, sideRect.h * 0.27) : Math.min(sideRect.h - 46 * u, sw * 0.24);

    function drawActionBoxes(bx, by, bw) {
      var cy = by, boxH = 74 * u;
      c.fillStyle = '#dcfce7'; c.fillRect(bx, cy, bw, boxH);
      c.strokeStyle = '#15803d'; c.lineWidth = Math.max(1.5, 2 * u); c.strokeRect(bx, cy, bw, boxH);
      c.fillStyle = '#14532d'; c.textAlign = 'right'; c.textBaseline = 'top';
      c.font = 'bold ' + Math.round(16 * u) + 'px ' + SANS;
      c.fillText('حريق: اتبع المسار الأخضر لنقطة التجمع', bx + bw - 10 * u, cy + 8 * u);
      c.textAlign = 'left'; c.font = 'bold ' + Math.round(13 * u) + 'px ' + SANS;
      c.fillText('FIRE: Follow GREEN path to Assembly Point', bx + 10 * u, cy + 32 * u);
      c.fillStyle = '#166534'; c.font = Math.round(12 * u) + 'px ' + MONO;
      var fTxt = ctxRes.firePath ? ('Dist: ' + ctxRes.fireDist.toFixed(0) + 'm | ~' + fmt(ctxRes.fireDist / 0.8) + ' (children)') : 'Follow marked green exit signs';
      c.fillText(fTxt, bx + 10 * u, cy + 52 * u);
      cy += boxH + 10 * u;

      c.fillStyle = '#dbeafe'; c.fillRect(bx, cy, bw, boxH);
      c.strokeStyle = '#1d4ed8'; c.lineWidth = Math.max(1.5, 2 * u); c.strokeRect(bx, cy, bw, boxH);
      c.fillStyle = '#1e3a8a'; c.textAlign = 'right'; c.textBaseline = 'top';
      c.font = 'bold ' + Math.round(16 * u) + 'px ' + SANS;
      c.fillText('قصف / إطلاق نار: احتمِ بالمنطقة الزرقاء', bx + bw - 10 * u, cy + 8 * u);
      c.textAlign = 'left'; c.font = 'bold ' + Math.round(13 * u) + 'px ' + SANS;
      c.fillText('SHELLING: Move to BLUE Safe Haven', bx + 10 * u, cy + 32 * u);
      c.fillStyle = '#1e40af'; c.font = Math.round(12 * u) + 'px ' + MONO;
      var sTxt = ctxRes.shellingPath ? ('Dist: ' + ctxRes.shellingDist.toFixed(0) + 'm | ~' + fmt(ctxRes.shellingDist / 0.8) + ' (children)') : 'Stay low, away from glass windows';
      c.fillText(sTxt, bx + 10 * u, cy + 52 * u);
      return cy + boxH + 12 * u;
    }

    function drawLegend(lx, ly, lw) {
      var items = [
        ['#dc2626', 'أنت هنا / YOU ARE HERE'],
        ['#16a34a', 'مسار الحريق / Fire Route'],
        ['#2563eb', 'مسار الاحتماء / Safe Haven'],
        ['#15803d', 'نقطة التجمع / Assembly (A)'],
        ['#b91c1c', 'طفاية حريق / Extinguisher' + (ctxRes.nearestExt ? (' (' + ctxRes.extDist.toFixed(0) + 'm)') : '')],
        ['#d4423e', 'العيادة / Clinic']
      ];
      c.font = 'bold ' + Math.round(13 * u) + 'px ' + SANS; c.textBaseline = 'middle';
      var rowH = 26 * u;
      items.forEach(function (it, idx) {
        var ry = ly + idx * rowH;
        c.fillStyle = it[0]; c.fillRect(lx, ry - 7 * u, 16 * u, 14 * u);
        c.strokeStyle = '#0f172a'; c.lineWidth = Math.max(1, u); c.strokeRect(lx, ry - 7 * u, 16 * u, 14 * u);
        c.fillStyle = '#0f172a'; c.textAlign = 'left'; c.fillText(it[1], lx + 24 * u, ry);
      });
      return ly + items.length * rowH + 8 * u;
    }

    function drawQrBlock(qx, qy, qsz) {
      if (!pin.showQR) return;
      c.fillStyle = '#ffffff'; c.fillRect(qx - 8 * u, qy - 8 * u, qsz + 16 * u, qsz + 52 * u);
      c.strokeStyle = '#0f172a'; c.lineWidth = Math.max(1.5, 2 * u); c.strokeRect(qx - 8 * u, qy - 8 * u, qsz + 16 * u, qsz + 52 * u);
      if (qrUrl) {
        QR.drawTo(c, qrUrl, qx, qy, qsz);
      } else {
        c.fillStyle = '#f1f5f9'; c.fillRect(qx, qy, qsz, qsz);
        c.fillStyle = '#64748b'; c.font = 'bold ' + Math.round(12 * u) + 'px ' + MONO;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('SET QR URL', qx + qsz / 2, qy + qsz * 0.42);
        c.fillText('IN SETTINGS', qx + qsz / 2, qy + qsz * 0.58);
      }
      c.fillStyle = '#0f172a'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.font = 'bold ' + Math.round(12 * u) + 'px ' + SANS;
      c.fillText('امسح للخريطة التفاعلية • Scan Map', qx + qsz / 2, qy + qsz + 6 * u);
      c.fillStyle = '#475569'; c.font = Math.round(10 * u) + 'px ' + MONO;
      c.fillText('LOC: ' + (pin.locCode || pin.id), qx + qsz / 2, qy + qsz + 24 * u);
    }

    if (land) {
      var ny = drawActionBoxes(sx, sy, sw);
      ny = drawLegend(sx, ny + 6 * u, sw);
      var qx = sideRect.x + (sideRect.w - qrSize) / 2;
      var qy = Math.max(ny + 4 * u, sideRect.y + sideRect.h - qrSize - 58 * u);
      drawQrBlock(qx, qy, qrSize);
    } else {
      var colW = pin.showQR ? (sw - qrSize - 32 * u) * 0.54 : sw * 0.54;
      drawActionBoxes(sx, sy, colW);
      drawLegend(sx + colW + 16 * u, sy + 10 * u, sw - colW - (pin.showQR ? qrSize + 44 * u : 16 * u));
      if (pin.showQR) drawQrBlock(sideRect.x + sideRect.w - qrSize - 22 * u, sy + 6 * u, qrSize);
    }
  }

  // =========================================================================
  // INTERACTIVE CANVAS RENDER & POINTER HANDLING
  // =========================================================================
  function fit() {
    var pin = activePin(), all = [];
    if (pin.scope === 'interior') {
      var info = interiorFootprint(pin.featureId);
      if (info) all = info.loc;
    } else {
      (St.project.features || []).forEach(function (f) { all = all.concat(featPts(f)); });
    }
    if (!all.length) { view.s = 4; view.ox = W / 2; view.oy = H / 2; return; }
    var b = bb(all), bw = Math.max(10, b.x1 - b.x0), bh = Math.max(10, b.y1 - b.y0);
    view.s = Math.max(0.5, Math.min(60, 0.8 * Math.min(W / bw, H / bh)));
    view.ox = W / 2 - ((b.x0 + b.x1) / 2) * view.s;
    view.oy = H / 2 + ((b.y0 + b.y1) / 2) * view.s;
  }

  function s2w(px, py) { return { x: (px - view.ox) / view.s, y: (view.oy - py) / view.s }; }

  function draw() {
    if (!isOpen || !ctx) return;
    var pin = activePin();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#101620'; ctx.fillRect(0, 0, W, H);

    if (mode === 'preview') {
      var pp = PAPERS[pin.paper] || PAPERS.A3_L;
      var scale = Math.min((W - 28) / pp.w, (H - 28) / pp.h);
      var rw = pp.w * scale, rh = pp.h * scale, rx = (W - rw) / 2, ry = (H - rh) / 2;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 20;
      composePoster(ctx, rw, rh, pin);
      ctx.restore();
      return;
    }

    var ctxRes = solvePinContext(pin);
    var rect = { x: 0, y: 0, w: W, h: H };
    var placePin = Object.assign({}, pin, { view3D: false });
    if (pin.scope === 'interior') drawInteriorDaylightMap(ctx, rect, placePin, ctxRes, 0, view);
    else drawExteriorDaylightMap(ctx, rect, placePin, ctxRes, 0, view);

    ctx.fillStyle = 'rgba(8,11,16,0.88)'; ctx.fillRect(10, 10, Math.min(W - 20, 520), 26);
    ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 1; ctx.strokeRect(10, 10, Math.min(W - 20, 520), 26);
    ctx.fillStyle = '#39ff14'; ctx.font = 'bold 11px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('CLICK TO PLACE PIN • PREVIEW POSTER SHOWS FULL ' + (pin.view3D !== false ? '3D ISOMETRIC' : '2D PLAN'), 18, 23);
  }

  function exportPosterPng(pin) {
    var pp = PAPERS[pin.paper] || PAPERS.A3_L;
    var dpi = pin.dpi === 300 ? 300 : 150;
    var pw = Math.round(pp.w / 25.4 * dpi), ph = Math.round(pp.h / 25.4 * dpi);
    var off = document.createElement('canvas'); off.width = pw; off.height = ph;
    var octx = off.getContext('2d');
    composePoster(octx, pw, ph, pin);
    var a = document.createElement('a');
    a.download = 'SOS_Poster_' + (pin.locCode || pin.id).replace(/[^a-z0-9_-]+/gi, '_') + '_' + pin.paper + '_' + (pin.view3D !== false ? '3D_' : '2D_') + dpi + 'dpi.png';
    a.href = off.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove();
  }

  function batchExportAll() {
    ensureMeta();
    var pins = St.project.signagePins;
    if (!pins.length) return;
    if (pins.length > 1 && !confirm('Export ' + pins.length + ' poster PNG files now?')) return;
    pins.forEach(function (p, i) { setTimeout(function () { exportPosterPng(p); }, i * 450); });
  }

  // =========================================================================
  // UI BUILD & SYNC
  // =========================================================================
  function syncUI() {
    ensureMeta();
    var pin = activePin();
    ov.querySelector('#sgModePlace').className = mode === 'place' ? 'on' : '';
    ov.querySelector('#sgModePrev').className = mode === 'preview' ? 'cy' : '';

    var blds = Object.keys(St.project.interiors || {}).map(function (id) {
      var f = (St.project.features || []).filter(function (x) { return x.id === id; })[0];
      return { id: id, name: f ? (f.en_name || f.id) : id, floors: f ? Math.max(1, f.floors | 0) : 1 };
    });
    var bSel = ov.querySelector('#sgBld');
    bSel.innerHTML = blds.length
      ? blds.map(function (b) { return '<option value="' + esc(b.id) + '"' + (b.id === pin.featureId ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('')
      : '<option value="">(No interior plans saved yet)</option>';
    if (pin.scope === 'interior' && !pin.featureId && blds.length) pin.featureId = blds[0].id;

    var curB = blds.filter(function (b) { return b.id === pin.featureId; })[0];
    var fSel = ov.querySelector('#sgFlr');
    var nf = curB ? curB.floors : 1, fHtml = '';
    for (var i = 1; i <= nf; i++) fHtml += '<option value="' + i + '"' + (String(i) === String(pin.floor) ? ' selected' : '') + '>Floor ' + i + '</option>';
    fSel.innerHTML = fHtml;

    ov.querySelector('#sgScope').value = pin.scope;
    ov.querySelector('#sgView3D').value = pin.view3D !== false ? '3d' : '2d';
    ov.querySelector('#sgIntBox').style.display = pin.scope === 'interior' ? '' : 'none';
    ov.querySelector('#sgLoc').value = pin.locCode || '';
    ov.querySelector('#sgEn').value = pin.en_name || '';
    ov.querySelector('#sgAr').value = pin.ar_name || '';
    ov.querySelector('#sgFace').value = Math.round(pin.facingDeg || 0);
    ov.querySelector('#sgFaceV').textContent = Math.round(pin.facingDeg || 0);
    ov.querySelector('#sgHeads').checked = !!pin.headsUp;
    ov.querySelector('#sgPaper').value = pin.paper || 'A3_L';
    ov.querySelector('#sgDpi').value = String(pin.dpi || 150);
    ov.querySelector('#sgFire').checked = pin.showFire !== false;
    ov.querySelector('#sgShel').checked = pin.showShelling !== false;
    ov.querySelector('#sgQrOn').checked = pin.showQR !== false;
    ov.querySelector('#sgQrBase').value = St.project.meta.qrBaseUrl || '';
    var fullUrl = buildQrUrl(pin);
    ov.querySelector('#sgQrPreview').textContent = fullUrl ? ('Encoded QR: ' + fullUrl) : 'QR URL not set yet (configure once IT provides MikroTik address).';

    var listEl = ov.querySelector('#sgPins');
    listEl.innerHTML = St.project.signagePins.map(function (p) {
      return '<div class="sgpin' + (p.id === pin.id ? ' sel' : '') + '" data-pid="' + esc(p.id) + '">' +
        '<span>' + esc(p.en_name || p.locCode) + '</span><small>' + esc(p.scope === 'interior' ? ('F' + p.floor) : (p.view3D !== false ? '3D' : '2D')) + '</small></div>';
    }).join('');
    [].forEach.call(listEl.querySelectorAll('[data-pid]'), function (el) {
      el.onclick = function () { activePinId = el.dataset.pid; syncUI(); fit(); draw(); };
    });
  }

  function resize() {
    if (!cv) return;
    var r = cv.parentNode.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw();
  }
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function two() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  function bind() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      if (mode === 'preview') return;
      cv.setPointerCapture(e.pointerId); var p = pos(e); ptrs[e.pointerId] = p;
      if (Object.keys(ptrs).length === 2) { var t = two(); drag = { m: 'pinch', d: t.d, s: view.s, w: s2w(t.x, t.y) }; return; }
      if (e.button === 1 || e.button === 2 || e.shiftKey) { drag = { m: 'pan', x: p.x, y: p.y, ox: view.ox, oy: view.oy }; return; }
      var w = s2w(p.x, p.y), pin = activePin();
      St.snapshot();
      pin.x = +w.x.toFixed(2); pin.y = +w.y.toFixed(2);
      drag = { m: 'pin' };
      St.emit('change'); draw();
    });
    cv.addEventListener('pointermove', function (e) {
      if (mode === 'preview') return;
      var p = pos(e); if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      if (!drag) return;
      if (drag.m === 'pan') { view.ox = drag.ox + p.x - drag.x; view.oy = drag.oy + p.y - drag.y; draw(); }
      else if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        var t = two(); view.s = Math.max(0.4, Math.min(80, drag.s * t.d / drag.d));
        view.ox = t.x - drag.w.x * view.s; view.oy = t.y + drag.w.y * view.s; draw();
      } else if (drag.m === 'pin') {
        var w = s2w(p.x, p.y), pin = activePin();
        pin.x = +w.x.toFixed(2); pin.y = +w.y.toFixed(2); draw();
      }
    });
    function up(e) {
      delete ptrs[e.pointerId];
      if (drag && drag.m === 'pin') St.emit('change');
      if (!Object.keys(ptrs).length || (drag && drag.m === 'pinch')) drag = null;
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      if (mode === 'preview') return;
      e.preventDefault(); var p = pos(e), w = s2w(p.x, p.y);
      view.s = Math.max(0.4, Math.min(80, view.s * (e.deltaY < 0 ? 1.12 : 0.89)));
      view.ox = p.x - w.x * view.s; view.oy = p.y + w.y * view.s; draw();
    }, { passive: false });
  }

  function build() {
    ensureCss();
    ov = h('div', 'sg hide');
    ov.innerHTML =
      '<div class="sgtop">' +
        '<b class="sgt">WALL SIGNAGE GENERATOR (A3/A4 3D/2D)</b>' +
        '<button id="sgModePlace" class="on">1. Place Pin</button>' +
        '<button id="sgModePrev">2. Poster Preview</button>' +
        '<button id="sgFit">Fit Map</button>' +
        '<button id="sgExport" class="on">Export Poster PNG</button>' +
        '<button id="sgBatch" class="cy">Batch Export All</button>' +
        '<span class="sp"></span>' +
        '<button id="sgClose">Save &amp; Close</button>' +
      '</div>' +
      '<div class="sgbody">' +
        '<div class="sgside">' +
          '<h4>Poster Scope &amp; View Mode</h4>' +
          '<label>Map Scope<select id="sgScope"><option value="exterior">Exterior Site Map</option><option value="interior">Building Interior Floor</option></select></label>' +
          '<label>Poster Perspective<select id="sgView3D"><option value="3d">3D Isometric Coloured (Recommended)</option><option value="2d">2D Top-Down Architectural Plan</option></select></label>' +
          '<div id="sgIntBox"><label>Building<select id="sgBld"></select></label><label>Floor<select id="sgFlr"></select></label></div>' +
          '<label>Location Code (QR ?loc=)<input type="text" id="sgLoc" placeholder="e.g. office_f1"></label>' +
          '<label>EN Title<input type="text" id="sgEn"></label>' +
          '<label>AR Title<input type="text" id="sgAr" dir="rtl"></label>' +
          '<h4>Wall Orientation (Heads-Up)</h4>' +
          '<label>Viewer Facing Angle (<span id="sgFaceV">0</span>&deg;)<input type="range" id="sgFace" min="0" max="359" step="1" value="0"></label>' +
          '<label class="ck"><input type="checkbox" id="sgHeads" checked>Auto-Rotate Map (Heads-Up)</label>' +
          '<h4>Print &amp; Routes</h4>' +
          '<label>Paper Size<select id="sgPaper"><option value="A3_L">A3 Landscape (420x297mm)</option><option value="A3_P">A3 Portrait (297x420mm)</option><option value="A4_L">A4 Landscape (297x210mm)</option><option value="A4_P">A4 Portrait (210x297mm)</option></select></label>' +
          '<label>Resolution<select id="sgDpi"><option value="150">150 DPI (Fast / Mobile)</option><option value="300">300 DPI (Print Shop / Laptop)</option></select></label>' +
          '<label class="ck"><input type="checkbox" id="sgFire" checked>Show Fire Route (Green)</label>' +
          '<label class="ck"><input type="checkbox" id="sgShel" checked>Show Shelling Safe Haven (Blue)</label>' +
          '<h4>QR Settings (IT / MikroTik)</h4>' +
          '<label class="ck"><input type="checkbox" id="sgQrOn" checked>Include QR Code on Poster</label>' +
          '<label>Base URL (Editable Anytime)<input type="text" id="sgQrBase" placeholder="http://192.168.88.1/village.html"></label>' +
          '<div class="row"><button id="sgPreMT">192.168.88.1</button><button id="sgPreLoc">sos.local</button><button id="sgPreClr">Clear</button></div>' +
          '<p id="sgQrPreview" class="mut"></p>' +
        '</div>' +
        '<div class="sgcv"><canvas id="sgCv"></canvas></div>' +
        '<div class="sgside r">' +
          '<h4>Saved Wall Signage Pins</h4>' +
          '<div class="row"><button id="sgAddPin" class="on">+ New Pin</button><button id="sgDelPin" class="dng">Delete</button></div>' +
          '<div id="sgPins" style="display:flex;flex-direction:column;gap:5px"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    cv = ov.querySelector('#sgCv'); ctx = cv.getContext('2d'); bind();

    function upd(fn) { var pin = activePin(); fn(pin); St.emit('change'); syncUI(); draw(); }
    ov.querySelector('#sgModePlace').onclick = function () { mode = 'place'; syncUI(); draw(); };
    ov.querySelector('#sgModePrev').onclick = function () { mode = 'preview'; syncUI(); draw(); };
    ov.querySelector('#sgFit').onclick = function () { fit(); draw(); };
    ov.querySelector('#sgExport').onclick = function () { exportPosterPng(activePin()); };
    ov.querySelector('#sgBatch').onclick = batchExportAll;
    ov.querySelector('#sgClose').onclick = close;

    ov.querySelector('#sgScope').onchange = function () { var v = this.value; upd(function (p) { p.scope = v; if (v === 'interior') p.view3D = false; }); fit(); draw(); };
    ov.querySelector('#sgView3D').onchange = function () { var v = this.value === '3d'; upd(function (p) { p.view3D = v; }); };
    ov.querySelector('#sgBld').onchange = function () { var v = this.value; upd(function (p) { p.featureId = v; p.floor = '1'; p.x = 0; p.y = 0; }); fit(); draw(); };
    ov.querySelector('#sgFlr').onchange = function () { var v = this.value; upd(function (p) { p.floor = v; }); };
    ov.querySelector('#sgLoc').onchange = function () { var v = this.value.trim(); upd(function (p) { p.locCode = v || p.id; }); };
    ov.querySelector('#sgEn').onchange = function () { var v = this.value; upd(function (p) { p.en_name = v; }); };
    ov.querySelector('#sgAr').onchange = function () { var v = this.value; upd(function (p) { p.ar_name = v; }); };
    ov.querySelector('#sgFace').oninput = function () { var v = +this.value; activePin().facingDeg = v; ov.querySelector('#sgFaceV').textContent = v; draw(); };
    ov.querySelector('#sgFace').onchange = function () { St.emit('change'); };
    ov.querySelector('#sgHeads').onchange = function () { var v = this.checked; upd(function (p) { p.headsUp = v; }); };
    ov.querySelector('#sgPaper').onchange = function () { var v = this.value; upd(function (p) { p.paper = v; }); };
    ov.querySelector('#sgDpi').onchange = function () { var v = +this.value; upd(function (p) { p.dpi = v; }); };
    ov.querySelector('#sgFire').onchange = function () { var v = this.checked; upd(function (p) { p.showFire = v; }); };
    ov.querySelector('#sgShel').onchange = function () { var v = this.checked; upd(function (p) { p.showShelling = v; }); };
    ov.querySelector('#sgQrOn').onchange = function () { var v = this.checked; upd(function (p) { p.showQR = v; }); };
    ov.querySelector('#sgQrBase').onchange = function () { St.project.meta.qrBaseUrl = this.value.trim(); St.emit('change'); syncUI(); draw(); };
    ov.querySelector('#sgPreMT').onclick = function () { St.project.meta.qrBaseUrl = 'http://192.168.88.1/village.html'; St.emit('change'); syncUI(); draw(); };
    ov.querySelector('#sgPreLoc').onclick = function () { St.project.meta.qrBaseUrl = 'http://sos.local/village.html'; St.emit('change'); syncUI(); draw(); };
    ov.querySelector('#sgPreClr').onclick = function () { St.project.meta.qrBaseUrl = ''; St.emit('change'); syncUI(); draw(); };

    ov.querySelector('#sgAddPin').onclick = function () {
      St.snapshot();
      var p = newPin();
      St.project.signagePins.push(p); activePinId = p.id;
      St.emit('change'); syncUI(); fit(); draw();
    };
    ov.querySelector('#sgDelPin').onclick = function () {
      if (St.project.signagePins.length <= 1) { alert('At least one signage pin is kept. Edit it directly.'); return; }
      St.snapshot();
      St.project.signagePins = St.project.signagePins.filter(function (p) { return p.id !== activePinId; });
      activePinId = St.project.signagePins[0].id;
      St.emit('change'); syncUI(); fit(); draw();
    };

    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode); else window.addEventListener('resize', resize);
    built = true;
  }

  function open() {
    ensureMeta();
    if (!built) build();
    isOpen = true; mode = 'place'; ov.classList.remove('hide');
    resize(); syncUI(); fit(); draw();
  }
  function close() {
    isOpen = false; ov.classList.add('hide'); St.emit('change');
  }

  S.Signage = { open: open, close: close, isOpen: function () { return isOpen; }, encodeQR: QR.encode, drawQR: QR.drawTo };
})(window.SOS);
