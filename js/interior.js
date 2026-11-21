window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', CATS = ['building', 'medical', 'security'];
  var ov, cv, ctx, propsEl, W = 1, H = 1, dpr = 1, fid = null, feat = null, data = null, fl = '1', tool = 'select', sel = null, snapG = .5,
    view = { s: 20, ox: 0, oy: 0 }, ptrs = {}, drag = null, tmp = null, hov = { x: 0, y: 0 }, undo = [], isOpen = false, loc = [], bnd = null, built = false, space = false;
  var TOOLS = [['select', 'Select / Edit'], ['pan', 'Pan'], ['#', 'Structure'], ['room', 'Room'], ['wall', 'Wall'], ['stairs', 'Staircase'],
    ['#', 'Openings'], ['main_entrance', 'Main Entrance'], ['emergency_exit', 'Emergency Exit'], ['door', 'Interior Door'], ['window', 'Window'],
    ['#', 'Safety'], ['safe_haven', 'Safe Haven Zone'], ['extinguisher', 'Fire Extinguisher'], ['fire_alarm', 'Fire Alarm'], ['smoke_detector', 'Smoke Detector'], ['first_aid', 'First Aid Kit'],
    ['#', 'Furniture'], ['desk', 'Desk'], ['chair', 'Chair'], ['meeting_table', 'Meeting Table'], ['cabinet', 'Cabinet'], ['medical_bed', 'Medical Bed']];
  var SZ = { stairs: [2.4, 4], main_entrance: [2, .3], emergency_exit: [1.2, .3], door: [1, .15], window: [1.5, .2], safe_haven: [4, 3], extinguisher: [.5, .5], fire_alarm: [.45, .45],
    smoke_detector: [.45, .45], first_aid: [.6, .6], desk: [1.4, .7], chair: [.5, .5], meeting_table: [2.4, 1.2], cabinet: [1, .45], medical_bed: [2, .9] };
  var WALLT = { door: 1, window: 1, main_entrance: 1, emergency_exit: 1 };
  var NAME = {}; TOOLS.forEach(function (t) { NAME[t[0]] = t[1]; });
  var HINT = { select: 'Click an element to edit. Drag to move, drag handles to resize, R rotates, Delete removes.', pan: 'Drag to pan. Wheel or pinch to zoom.',
    room: 'Drag a rectangle to create a room.', wall: 'Click two points to draw a partition wall.', safe_haven: 'Drag a rectangle to define the safe haven zone.' };

  function ensureCss() {
    if (document.getElementById('sos-interior-css')) return;
    var st = document.createElement('style');
    st.id = 'sos-interior-css';
    st.textContent =
      '.ix{position:fixed;inset:0;z-index:900;background:#080b10;color:#cfe8ff;display:flex;flex-direction:column;font-family:' + MONO + '}' +
      '.ix.hide{display:none}' +
      '.ixtop{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#0e141d;border-bottom:1px solid #1b2838;overflow-x:auto;flex-wrap:nowrap;flex-shrink:0}' +
      '.ixtop::-webkit-scrollbar{height:5px}.ixtop::-webkit-scrollbar-thumb{background:#1b2838;border-radius:3px}' +
      '.ixt{color:#39ff14;font-size:12px;letter-spacing:.5px;white-space:nowrap;margin-right:4px}' +
      '.ixtabs{display:flex;gap:4px;flex-shrink:0}' +
      '.ix button,.ix select,.ix input,.ixpk button,.ixpk select{font-family:' + MONO + ';font-size:11px;background:#0b1119;color:#cfe8ff;border:1px solid #1b2838;border-radius:4px;padding:5px 8px;outline:none}' +
      '.ix button,.ixpk button{cursor:pointer;white-space:nowrap;flex-shrink:0}' +
      '.ix button:hover,.ixpk button:hover{border-color:#00d9ff;color:#fff}' +
      '.ix button:disabled{opacity:.4;cursor:not-allowed}' +
      '.ix button.on{border-color:#39ff14;color:#39ff14;background:rgba(57,255,20,.12)}' +
      '.ix button.dng,.ixpk button.dng{border-color:#ff3c3c;color:#ff3c3c}' +
      '.ix button.dng:hover{background:rgba(255,60,60,.16)}' +
      '.ix .sp{flex:1;min-width:8px}' +
      '.ixbody{display:flex;flex:1;min-height:0;overflow:hidden}' +
      '.ixtools{width:185px;background:#0e141d;border-right:1px solid #1b2838;padding:8px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;flex-shrink:0}' +
      '.ixtools h4{margin:8px 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#00d9ff;border-bottom:1px solid #1b2838;padding-bottom:2px}' +
      '.ixtools button{text-align:left;width:100%}' +
      '.ixcv{flex:1;position:relative;min-width:0;min-height:0;background:#080b10;overflow:hidden}' +
      '#ixCv{width:100%;height:100%;display:block;touch-action:none}' +
      '.ixprops{width:230px;background:#0e141d;border-left:1px solid #1b2838;padding:10px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex-shrink:0}' +
      '.ixprops h3,.ixbox h3{margin:0 0 4px;font-size:12px;color:#39ff14;text-transform:uppercase;letter-spacing:.6px}' +
      '.ixprops label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#8fa6bc}' +
      '.ixprops input[type=color]{height:28px;padding:2px;cursor:pointer}' +
      '.ix .row,.ixpk .row{display:flex;gap:6px;margin-top:4px}' +
      '.ix .row button,.ixpk .row button{flex:1}' +
      '.ix .mut,.ixpk .mut{font-size:11px;color:#7a93a8;line-height:1.45;margin:0}' +
      '.ixpk{position:fixed;inset:0;z-index:950;background:rgba(4,7,12,.78);display:flex;align-items:center;justify-content:center;padding:16px;font-family:' + MONO + '}' +
      '.ixbox{background:#0e141d;border:1px solid #00d9ff;border-radius:6px;padding:16px;width:100%;max-width:360px;display:flex;flex-direction:column;gap:10px;box-shadow:0 0 24px rgba(0,217,255,.18);color:#cfe8ff}' +
      '.ixbox p{margin:0;font-size:12px;color:#9bb2c7;line-height:1.5}' +
      '@media (max-width:800px){' +
        '.ixbody{flex-direction:column}' +
        '.ixtools{width:100%;max-height:54px;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid #1b2838;align-items:center;padding:6px}' +
        '.ixtools h4{display:none}' +
        '.ixtools button{width:auto;text-align:center}' +
        '.ixcv{flex:1;min-height:220px}' +
        '.ixprops{width:100%;max-height:165px;border-left:0;border-top:1px solid #1b2838}' +
      '}';
    document.head.appendChild(st);
  }

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function FD() { return data.floors[fl]; }
  function nid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function snp(v) { return snapG ? Math.round(v / snapG) * snapG : v; }
  function sv(v) { return Math.max(snapG || .05, snapG ? Math.round(v / snapG) * snapG : v); }
  function w2s(x, y) { return [view.ox + x * view.s, view.oy - y * view.s]; }
  function s2w(px, py) { return { x: (px - view.ox) / view.s, y: (view.oy - py) / view.s }; }
  function ln(u, v) { ctx.beginPath(); ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); ctx.stroke(); }
  function txt(t, x, y, font, col, al, bl) { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = al || 'center'; ctx.textBaseline = bl || 'middle'; ctx.fillText(t, x, y); }
  function bbox(a) { var b = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; a.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }); return b; }
  function ensure() {
    var n = Math.max(1, feat.floors | 0);
    for (var i = 1; i <= n; i++) if (!data.floors[i]) data.floors[i] = { rooms: [], walls: [], items: [] };
    for (var k in data.floors) { var g = data.floors[k]; g.rooms = g.rooms || []; g.walls = g.walls || []; g.items = g.items || []; }
    if (!data.floors[fl]) fl = '1';
  }
  function pushU() { undo.push(JSON.stringify(data.floors)); if (undo.length > 30) undo.shift(); }
  function doUndo() { if (!undo.length) return; data.floors = JSON.parse(undo.pop()); sel = null; tmp = null; ensure(); tabs(); props(); commit(); }
  function commit() { St.emit('change'); draw(); }

  function setup(id) {
    if (!St.project.interiors) St.project.interiors = {};
    var f = St.project.features.filter(function (x) { return x.id === id; })[0];
    if (!f || f.geometryType !== 'polygon' || f.coordsMetric.length < 3) return false;
    var r = (f.rotationDeg || 0) * D, c = Math.cos(r), n = Math.sin(r), m = f.center, cx = 0, cy = 0, best = 0, ang = 0, i;
    var w = f.coordsMetric.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
    w.forEach(function (p) { cx += p.x; cy += p.y; }); cx /= w.length; cy /= w.length;
    for (i = 0; i < w.length; i++) { var q = w[(i + 1) % w.length], l = Math.hypot(q.x - w[i].x, q.y - w[i].y); if (l > best) { best = l; ang = Math.atan2(q.y - w[i].y, q.x - w[i].x); } }
    var a = -ang; while (a > Math.PI / 2) a -= Math.PI; while (a <= -Math.PI / 2) a += Math.PI;
    var d = St.project.interiors[id];
    if (!d || typeof d.alignAngleRad !== 'number') d = St.project.interiors[id] = { featureId: id, alignAngleRad: a, floors: {} };
    if (!d.floors) d.floors = {};
    feat = f; fid = id; data = d; a = d.alignAngleRad;
    var ca = Math.cos(a), sa = Math.sin(a);
    loc = w.map(function (p) { var dx = p.x - cx, dy = p.y - cy; return { x: dx * ca - dy * sa, y: dx * sa + dy * ca }; });
    bnd = bbox(loc); fl = '1'; sel = null; tmp = null; undo = []; ensure(); return true;
  }

  function nearWall(x, y) {
    var f = FD(), segs = [], best = null, bd = .8;
    loc.forEach(function (p, i) { var q = loc[(i + 1) % loc.length]; segs.push([p.x, p.y, q.x, q.y]); });
    f.walls.forEach(function (o) { segs.push([o.x1, o.y1, o.x2, o.y2]); });
    f.rooms.forEach(function (o) { var a = o.x - o.w / 2, b = o.x + o.w / 2, c = o.y - o.h / 2, d = o.y + o.h / 2; segs.push([a, c, b, c], [b, c, b, d], [b, d, a, d], [a, d, a, c]); });
    segs.forEach(function (s) {
      var dx = s[2] - s[0], dy = s[3] - s[1], l = dx * dx + dy * dy; if (l < 1e-6) return;
      var t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / l)), px = s[0] + t * dx, py = s[1] + t * dy, d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; best = { x: px, y: py, rot: ((Math.atan2(dy, dx) / D) % 360 + 360) % 360 }; }
    });
    return best;
  }
  function inItem(o, w, tol) {
    var a = o.rotationDeg * D, dx = w.x - o.x, dy = w.y - o.y, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(u) <= o.w / 2 + tol && Math.abs(v) <= o.h / 2 + tol;
  }
  function hit(w) {
    var f = FD(), tol = 8 / view.s, i, o;
    for (i = f.items.length - 1; i >= 0; i--) if (inItem(f.items[i], w, tol)) return { t: 'item', o: f.items[i] };
    for (i = f.walls.length - 1; i >= 0; i--) {
      o = f.walls[i]; var dx = o.x2 - o.x1, dy = o.y2 - o.y1, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((w.x - o.x1) * dx + (w.y - o.y1) * dy) / l));
      if (Math.hypot(w.x - o.x1 - t * dx, w.y - o.y1 - t * dy) < Math.max(.2, tol)) return { t: 'wall', o: o };
    }
    for (i = f.rooms.length - 1; i >= 0; i--) { o = f.rooms[i]; if (Math.abs(w.x - o.x) <= o.w / 2 && Math.abs(w.y - o.y) <= o.h / 2) return { t: 'room', o: o }; }
    return null;
  }
  function handles() {
    if (!sel) return []; var o = sel.o;
    if (sel.t === 'room') return [[o.x - o.w / 2, o.y - o.h / 2], [o.x + o.w / 2, o.y - o.h / 2], [o.x + o.w / 2, o.y + o.h / 2], [o.x - o.w / 2, o.y + o.h / 2]];
    if (sel.t === 'wall') return [[o.x1, o.y1], [o.x2, o.y2]];
    var a = o.rotationDeg * D, c = Math.cos(a), n = Math.sin(a);
    return [[o.x + o.w / 2 * c - o.h / 2 * n, o.y + o.w / 2 * n + o.h / 2 * c]];
  }
  function place(type, w) {
    var z = SZ[type], x = snp(w.x), y = snp(w.y), rot = 0, f = FD();
    if (WALLT[type]) { var s = nearWall(w.x, w.y); if (s) { x = s.x; y = s.y; rot = s.rot; } }
    var o = { id: nid('i'), type: type, x: x, y: y, w: z[0], h: z[1], rotationDeg: rot, en_name: '', ar_name: '' };
    f.items.push(o); sel = { t: 'item', o: o }; commit(); props();
  }
  function del() {
    if (!sel) return; pushU(); var f = FD(), k = sel.t === 'room' ? 'rooms' : sel.t === 'wall' ? 'walls' : 'items';
    f[k] = f[k].filter(function (o) { return o !== sel.o; }); sel = null; commit(); props();
  }
  function rot() {
    if (!sel) return; pushU(); var o = sel.o;
    if (sel.t === 'item') o.rotationDeg = (o.rotationDeg + 90) % 360;
    else if (sel.t === 'room') { var t = o.w; o.w = o.h; o.h = t; }
    else { var mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2, dx = (o.x2 - o.x1) / 2, dy = (o.y2 - o.y1) / 2; o.x1 = mx + dy; o.y1 = my - dx; o.x2 = mx - dy; o.y2 = my + dx; }
    commit(); props();
  }

  function tpl(name) {
    var f = FD(), b = bnd, m = .3, x0 = b.x0 + m, x1 = b.x1 - m, y0 = b.y0 + m, y1 = b.y1 - m, iw = x1 - x0, ih = y1 - y0, i, n;
    if (!name) return;
    if ((f.rooms.length + f.walls.length + f.items.length) && !confirm('Replace everything on Floor ' + fl + '?')) return;
    function R(cx, cy, w, hh, en, ar, col) { f.rooms.push({ id: nid('r'), x: cx, y: cy, w: w, h: hh, en_name: en, ar_name: ar, color: col || '#00d9ff' }); }
    function I(type, x, y) { f.items.push({ id: nid('i'), type: type, x: x, y: y, w: SZ[type][0], h: SZ[type][1], rotationDeg: 0, en_name: '', ar_name: '' }); }
    pushU(); f.rooms = []; f.walls = []; f.items = [];
    if (name === 'corridor') {
      var ch = Math.min(2.4, ih * .3), oh = (ih - ch) / 2; n = Math.max(1, Math.round(iw / 4)); var ow = iw / n;
      R((x0 + x1) / 2, (y0 + y1) / 2, iw, ch, 'Corridor', '\u0645\u0645\u0631', '#e8c84a');
      for (i = 0; i < n; i++) {
        R(x0 + ow * (i + .5), y1 - oh / 2, ow, oh, 'Office ' + (i + 1), '\u0645\u0643\u062a\u0628 ' + (i + 1));
        R(x0 + ow * (i + .5), y0 + oh / 2, ow, oh, 'Office ' + (n + i + 1), '\u0645\u0643\u062a\u0628 ' + (n + i + 1));
      }
    } else if (name === 'clinic') {
      var bh = ih * .4, th = ih - bh; n = Math.max(2, Math.round(iw / 4)); var cw = iw / n;
      R(x0 + iw * .15, y0 + bh / 2, iw * .3, bh, 'Reception', '\u0627\u0644\u0627\u0633\u062a\u0642\u0628\u0627\u0644', '#39ff14');
      R(x0 + iw * .65, y0 + bh / 2, iw * .7, bh, 'Waiting Area', '\u0642\u0627\u0639\u0629 \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631', '#e8c84a');
      for (i = 0; i < n; i++) { R(x0 + cw * (i + .5), y1 - th / 2, cw, th, 'Consultation ' + (i + 1), '\u063a\u0631\u0641\u0629 \u0643\u0634\u0641 ' + (i + 1)); I('medical_bed', x0 + cw * (i + .5), y1 - th / 2); }
      I('desk', x0 + iw * .15, y0 + bh / 2); I('first_aid', x0 + iw * .3 - .5, y0 + .5);
    }
    sel = null; commit(); props();
  }
  function copy1() {
    if (fl === '1') return; var f = FD();
    if ((f.rooms.length + f.walls.length + f.items.length) && !confirm('Replace Floor ' + fl + ' with the Floor 1 layout?')) return;
    pushU(); var c = JSON.parse(JSON.stringify(data.floors['1']));
    ['rooms', 'walls', 'items'].forEach(function (k) { c[k].forEach(function (o) { o.id = nid(k[0]); }); });
    data.floors[fl] = c; sel = null; commit(); props();
  }
  function addFloor() { if (St.snapshot) St.snapshot(); feat.floors = (feat.floors | 0) + 1; fl = String(feat.floors); ensure(); sel = null; tabs(); props(); commit(); }
  function exportPng() {
    if (!cv || !feat) return;
    var prevSel = sel, prevTmp = tmp; sel = null; tmp = null; draw();
    var a = document.createElement('a');
    a.download = (feat.en_name || feat.id).replace(/[^a-z0-9_-]+/gi, '_') + '_Floor' + fl + '.png';
    a.href = cv.toDataURL('image/png');
    a.click();
    sel = prevSel; tmp = prevTmp; draw();
  }

  function grid() {
    var st = [.5, 1, 2, 5, 10, 20].filter(function (v) { return v * view.s >= 12; })[0] || 20, a = s2w(0, H), b = s2w(W, 0), x, y;
    ctx.lineWidth = 1;
    for (x = Math.floor(a.x / st) * st; x <= b.x; x += st) { ctx.strokeStyle = Math.round(x / st) % 5 === 0 ? 'rgba(57,255,20,.18)' : 'rgba(57,255,20,.07)'; ln(w2s(x, a.y), w2s(x, b.y)); }
    for (y = Math.floor(a.y / st) * st; y <= b.y; y += st) { ctx.strokeStyle = Math.round(y / st) % 5 === 0 ? 'rgba(57,255,20,.18)' : 'rgba(57,255,20,.07)'; ln(w2s(a.x, y), w2s(b.x, y)); }
  }
  function path(a) { ctx.beginPath(); a.forEach(function (q, i) { var t = w2s(q.x, q.y); i ? ctx.lineTo(t[0], t[1]) : ctx.moveTo(t[0], t[1]); }); ctx.closePath(); }
  function item(o, ghost) {
    var s = view.s, c = w2s(o.x, o.y), w = o.w, hh = o.h, k = 1 / s, X = -w / 2, Y = -hh / 2, i, r = Math.max(w, hh) / 2;
    function R(f, st) { ctx.fillStyle = f; ctx.strokeStyle = st; ctx.fillRect(X, Y, w, hh); ctx.strokeRect(X, Y, w, hh); }
    ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(-o.rotationDeg * D); ctx.scale(s, s); if (ghost) ctx.globalAlpha = .35; ctx.lineWidth = 1.3 * k;
    switch (o.type) {
      case 'stairs':
        ctx.setLineDash(ghost ? [4 * k, 3 * k] : []); R('rgba(137,164,190,.18)', '#89a4be');
        var n = Math.max(3, Math.round(hh / .28)); ctx.beginPath(); for (i = 1; i < n; i++) { ctx.moveTo(X, Y + hh * i / n); ctx.lineTo(X + w, Y + hh * i / n); } ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, Y + hh * .85); ctx.lineTo(0, Y + hh * .15); ctx.moveTo(-.2, Y + hh * .15 + .3); ctx.lineTo(0, Y + hh * .15); ctx.lineTo(.2, Y + hh * .15 + .3); ctx.stroke(); break;
      case 'main_entrance': R('rgba(57,255,20,.45)', '#39ff14'); break;
      case 'emergency_exit': ctx.shadowColor = '#39ff14'; ctx.shadowBlur = 8; R('#39ff14', '#39ff14'); ctx.shadowBlur = 0; break;
      case 'door': R('#0e141d', '#0e141d'); ctx.strokeStyle = '#cfe8ff'; ctx.beginPath(); ctx.moveTo(X, 0); ctx.lineTo(X, -w); ctx.stroke(); ctx.beginPath(); ctx.arc(X, 0, w, -Math.PI / 2, 0); ctx.stroke(); break;
      case 'window': R('rgba(232,200,74,.55)', '#e8c84a'); ctx.beginPath(); ctx.moveTo(X, 0); ctx.lineTo(X + w, 0); ctx.stroke(); break;
      case 'safe_haven':
        ctx.fillStyle = 'rgba(0,217,255,.1)'; ctx.fillRect(X, Y, w, hh);
        ctx.save(); ctx.beginPath(); ctx.rect(X, Y, w, hh); ctx.clip(); ctx.strokeStyle = 'rgba(160,107,255,.55)'; ctx.beginPath();
        for (var q = -hh; q < w; q += .45) { ctx.moveTo(X + q, Y + hh); ctx.lineTo(X + q + hh, Y); } ctx.stroke(); ctx.restore();
        ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 2 * k; ctx.setLineDash([6 * k, 3 * k]); ctx.strokeRect(X, Y, w, hh); ctx.setLineDash([]); ctx.lineWidth = 1.5 * k;
        ctx.beginPath(); ctx.moveTo(0, -.45); ctx.lineTo(.35, -.3); ctx.lineTo(.3, .15); ctx.quadraticCurveTo(0, .5, -.3, .15); ctx.lineTo(-.35, -.3); ctx.closePath(); ctx.fillStyle = '#0e141d'; ctx.fill(); ctx.stroke(); break;
      case 'extinguisher': ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.fillStyle = '#ff3c3c'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(-r * .25, -r * .95, r * .5, r * .35); break;
      case 'fire_alarm': R('#ff3c3c', '#fff'); ctx.beginPath(); ctx.moveTo(X + w * .2, 0); ctx.lineTo(X + w * .8, 0); ctx.stroke(); break;
      case 'smoke_detector': ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.fillStyle = 'rgba(232,200,74,.25)'; ctx.fill(); ctx.strokeStyle = '#e8c84a'; ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, 6.3); ctx.fillStyle = '#e8c84a'; ctx.fill(); break;
      case 'first_aid': R('#0e141d', '#ff3c3c'); ctx.fillStyle = '#ff3c3c'; ctx.fillRect(-w * .12, -hh * .35, w * .24, hh * .7); ctx.fillRect(-w * .35, -hh * .12, w * .7, hh * .24); break;
      case 'desk': R('rgba(207,232,255,.12)', '#9ab'); ctx.strokeRect(X + w * .62, Y + hh * .1, w * .3, hh * .8); break;
      case 'chair': ctx.beginPath(); ctx.arc(0, 0, r * .8, 0, 6.3); ctx.fillStyle = 'rgba(207,232,255,.12)'; ctx.fill(); ctx.strokeStyle = '#9ab'; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r, -r * .9); ctx.lineTo(r, -r * .9); ctx.stroke(); break;
      case 'meeting_table': ctx.beginPath(); ctx.ellipse(0, 0, w / 2, hh / 2, 0, 0, 6.3); ctx.fillStyle = 'rgba(207,232,255,.12)'; ctx.fill(); ctx.strokeStyle = '#9ab'; ctx.stroke(); break;
      case 'cabinet': R('rgba(207,232,255,.12)', '#9ab'); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + w, Y + hh); ctx.moveTo(X + w, Y); ctx.lineTo(X, Y + hh); ctx.stroke(); break;
      case 'medical_bed': R('rgba(207,232,255,.12)', '#9ab'); ctx.strokeRect(X + .05, Y + .05, Math.min(.4, w * .25), hh - .1); ctx.fillStyle = '#ff3c3c'; ctx.fillRect(w * .1, -.04, .3, .08); ctx.fillRect(w * .1 + .11, -.15, .08, .3); break;
      default: R('rgba(207,232,255,.12)', '#9ab');
    }
    ctx.restore();
    if (ghost) return;
    var off = Math.max(w, hh) * s / 2 + 9;
    if (o.type === 'emergency_exit') txt('EXIT', c[0], c[1] - off + 2, 'bold 9px ' + MONO, '#39ff14');
    if (o.en_name && s > 14) txt(o.en_name, c[0], c[1] + off, '10px ' + MONO, '#cfe');
  }
  function draw() {
    if (!isOpen || !ctx) return;
    var s = view.s, f = FD();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#080b10'; ctx.fillRect(0, 0, W, H); ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.shadowBlur = 0;
    grid(); path(loc); ctx.fillStyle = '#0e141d'; ctx.fill();
    [String(+fl - 1), String(+fl + 1)].forEach(function (k) { var g = data.floors[k]; if (g) g.items.forEach(function (o) { if (o.type === 'stairs') item(o, 1); }); });
    f.rooms.forEach(function (o) {
      var a = w2s(o.x - o.w / 2, o.y + o.h / 2), pw = o.w * s, ph = o.h * s, col = o.color || '#00d9ff';
      ctx.globalAlpha = .14; ctx.fillStyle = col; ctx.fillRect(a[0], a[1], pw, ph); ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(a[0], a[1], pw, ph);
      if (pw > 46 && ph > 26) {
        var cx = a[0] + pw / 2, cy = a[1] + ph / 2;
        txt(o.en_name || '', cx, cy - 8, 'bold 11px ' + MONO, '#e6f3ff'); txt(o.ar_name || '', cx, cy + 5, '11px ' + MONO, '#e6f3ff'); txt((o.w * o.h).toFixed(1) + ' m\u00b2', cx, cy + 18, '10px ' + MONO, '#8fa');
      }
    });
    ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = Math.max(2, .15 * s); ctx.lineCap = 'round';
    f.walls.forEach(function (o) { ln(w2s(o.x1, o.y1), w2s(o.x2, o.y2)); }); ctx.lineCap = 'butt';
    f.items.forEach(function (o) { item(o, 0); });
    path(loc); ctx.strokeStyle = '#e6f3ff'; ctx.lineWidth = Math.max(3, .3 * s); ctx.stroke();
    if (s > 8) loc.forEach(function (p, j) {
      var q = loc[(j + 1) % loc.length], l = Math.hypot(q.x - p.x, q.y - p.y), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, d = Math.hypot(mx, my) || 1, t = w2s(mx, my);
      if (l > 1) txt(l.toFixed(2) + ' m', t[0] + mx / d * 16, t[1] - my / d * 16, '10px ' + MONO, '#7a93a8');
    });
    if (sel) {
      var o = sel.o, lab, c0;
      ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
      if (sel.t === 'wall') { ln(w2s(o.x1, o.y1), w2s(o.x2, o.y2)); lab = Math.hypot(o.x2 - o.x1, o.y2 - o.y1).toFixed(2) + ' m'; c0 = w2s((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2); c0[1] -= 14; }
      else {
        var a = (o.rotationDeg || 0) * D, c = Math.cos(a), n = Math.sin(a), hw = o.w / 2 + .05, hh = o.h / 2 + .05;
        path([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (q) { return { x: o.x + q[0] * c - q[1] * n, y: o.y + q[0] * n + q[1] * c }; })); ctx.stroke();
        lab = o.w.toFixed(2) + ' x ' + o.h.toFixed(2) + ' m'; c0 = w2s(o.x, o.y - Math.max(o.w, o.h) / 2 - .1); c0[1] += 12;
      }
      ctx.setLineDash([]);
      handles().forEach(function (q) { var t = w2s(q[0], q[1]); ctx.fillStyle = '#080b10'; ctx.fillRect(t[0] - 4, t[1] - 4, 8, 8); ctx.strokeRect(t[0] - 4, t[1] - 4, 8, 8); });
      txt(lab, c0[0], c0[1], 'bold 11px ' + MONO, '#e8c84a');
    }
    if (tmp) {
      ctx.strokeStyle = '#e8c84a'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
      if (tmp.wall) { ln(w2s(tmp.x1, tmp.y1), w2s(tmp.x2, tmp.y2)); var m = w2s((tmp.x1 + tmp.x2) / 2, (tmp.y1 + tmp.y2) / 2); txt(Math.hypot(tmp.x2 - tmp.x1, tmp.y2 - tmp.y1).toFixed(2) + ' m', m[0], m[1] - 12, 'bold 11px ' + MONO, '#e8c84a'); }
      else {
        var a1 = w2s(Math.min(tmp.x1, tmp.x2), Math.max(tmp.y1, tmp.y2)), rw = Math.abs(tmp.x2 - tmp.x1), rh = Math.abs(tmp.y2 - tmp.y1);
        ctx.strokeRect(a1[0], a1[1], rw * s, rh * s); txt(rw.toFixed(2) + ' x ' + rh.toFixed(2) + ' m  (' + (rw * rh).toFixed(1) + ' m\u00b2)', a1[0] + rw * s / 2, a1[1] - 10, 'bold 11px ' + MONO, '#e8c84a');
      }
      ctx.setLineDash([]);
    }
    var ang = data.alignAngleRad, cx0 = W - 40, cy0 = 40, nx = -Math.sin(ang), ny = Math.cos(ang);
    ctx.fillStyle = 'rgba(14,20,29,.88)'; ctx.strokeStyle = '#1b2838'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx0, cy0, 30, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff3c3c'; ln([cx0, cy0], [cx0 + nx * 20, cy0 - ny * 20]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#00d9ff'; ln([cx0, cy0], [cx0 - nx * 20, cy0 + ny * 20]);
    txt('N', cx0 + nx * 25, cy0 - ny * 25, 'bold 10px ' + MONO, '#ff3c3c');
    txt((feat.en_name || feat.id) + '  |  Floor ' + fl + '/' + Math.max(1, feat.floors | 0) + '  |  X ' + hov.x.toFixed(2) + '  Y ' + hov.y.toFixed(2) + ' m  |  Footprint ' + (bnd.x1 - bnd.x0).toFixed(1) + ' x ' + (bnd.y1 - bnd.y0).toFixed(1) + ' m',
      10, 10, '11px ' + MONO, '#00d9ff', 'left', 'top');
  }

  function props() {
    if (!propsEl) return;
    if (!sel) { propsEl.innerHTML = '<h3>Properties</h3><p class="mut">' + (HINT[tool] || 'Click on the plan to place ' + NAME[tool] + '. Esc returns to Select.') + '</p>'; return; }
    var o = sel.o, t = sel.t;
    function lab(l, k, v, ty, rtl) { return '<label>' + l + '<input type="' + ty + '" data-k="' + k + '" value="' + esc(v) + '"' + (rtl ? ' dir="rtl"' : '') + (ty === 'number' ? ' step="any"' : '') + '></label>'; }
    var s = '<h3>' + (t === 'item' ? NAME[o.type] : t === 'room' ? 'Room' : 'Wall') + '</h3>';
    if (t === 'wall') s += '<p class="mut">Length: ' + Math.hypot(o.x2 - o.x1, o.y2 - o.y1).toFixed(2) + ' m</p>';
    else {
      s += lab('EN name', 'en_name', o.en_name, 'text') + lab('AR name', 'ar_name', o.ar_name, 'text', 1);
      if (t === 'room') s += lab('Color', 'color', o.color || '#00d9ff', 'color');
      s += lab('Width (m)', 'w', o.w.toFixed(2), 'number') + lab('Depth (m)', 'h', o.h.toFixed(2), 'number');
      if (t === 'item') s += lab('Rotation (deg)', 'rotationDeg', o.rotationDeg, 'number');
    }
    s += '<div class="row"><button id="ixRot">Rotate 90 (R)</button><button id="ixDel" class="dng">Delete</button></div>';
    propsEl.innerHTML = s;
    [].forEach.call(propsEl.querySelectorAll('[data-k]'), function (i) {
      i.onchange = function () {
        pushU(); var k = i.dataset.k, v = i.type === 'number' ? (parseFloat(i.value) || 0) : i.value;
        if (k === 'w' || k === 'h') v = Math.max(.1, v);
        o[k] = v; commit();
      };
    });
    propsEl.querySelector('#ixRot').onclick = rot; propsEl.querySelector('#ixDel').onclick = del;
  }
  function tabs() {
    var n = Math.max(1, feat.floors | 0), s = '', i, el = ov.querySelector('#ixTabs');
    for (i = 1; i <= n; i++) s += '<button data-f="' + i + '"' + (String(i) === fl ? ' class="on"' : '') + '>Floor ' + i + '</button>';
    el.innerHTML = s;
    [].forEach.call(el.querySelectorAll('button'), function (b) { b.onclick = function () { fl = b.dataset.f; sel = null; tmp = null; tabs(); props(); draw(); }; });
    ov.querySelector('#ixCopy').disabled = fl === '1'; ov.querySelector('#ixTitle').textContent = 'FLOOR PLAN: ' + (feat.en_name || feat.id);
  }
  function setTool(t) {
    tool = t; tmp = null; [].forEach.call(ov.querySelectorAll('[data-t]'), function (b) { b.classList.toggle('on', b.dataset.t === t); });
    cv.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair'; if (!sel) props(); draw();
  }
  function fit() {
    var bw = Math.max(2, bnd.x1 - bnd.x0), bh = Math.max(2, bnd.y1 - bnd.y0);
    view.s = Math.max(4, Math.min(80, .8 * Math.min(W / bw, H / bh)));
    view.ox = W / 2 - (bnd.x0 + bnd.x1) / 2 * view.s; view.oy = H / 2 + (bnd.y0 + bnd.y1) / 2 * view.s;
  }
  function resize() {
    if (!cv) return; var r = cv.parentNode.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 3); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw();
  }
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function two() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  function bind() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId); var p = pos(e); ptrs[e.pointerId] = p;
      if (Object.keys(ptrs).length === 2) { var t = two(); drag = { m: 'pinch', d: t.d, s: view.s, w: s2w(t.x, t.y) }; tmp = null; return; }
      var w = s2w(p.x, p.y), sw = { x: snp(w.x), y: snp(w.y) }, i; hov = w;
      var panD = { m: 'pan', x: p.x, y: p.y, ox: view.ox, oy: view.oy };
      if (e.button === 1 || e.button === 2 || tool === 'pan' || space) { drag = panD; return; }
      if (tool === 'select') {
        var hs = handles();
        for (i = 0; i < hs.length; i++) if (Math.hypot(hs[i][0] - w.x, hs[i][1] - w.y) < 12 / view.s) { pushU(); drag = { m: 'handle', k: i, f: hs[(i + 2) % hs.length] }; return; }
        var hh = hit(w);
        if (hh) { sel = hh; props(); drag = { m: 'move', sx: w.x, sy: w.y, o0: JSON.parse(JSON.stringify(hh.o)), moved: false }; draw(); return; }
        sel = null; props(); drag = panD; draw(); return;
      }
      if (tool === 'room' || tool === 'safe_haven') { drag = { m: 'rect' }; tmp = { x1: sw.x, y1: sw.y, x2: sw.x, y2: sw.y }; return; }
      if (tool === 'wall') {
        if (!tmp) tmp = { x1: sw.x, y1: sw.y, x2: sw.x, y2: sw.y, wall: 1 };
        else {
          tmp.x2 = sw.x; tmp.y2 = sw.y;
          if (Math.hypot(tmp.x2 - tmp.x1, tmp.y2 - tmp.y1) > .05) { pushU(); var wl = { id: nid('w'), x1: tmp.x1, y1: tmp.y1, x2: tmp.x2, y2: tmp.y2 }; FD().walls.push(wl); sel = { t: 'wall', o: wl }; props(); }
          tmp = null; commit(); return;
        }
        draw(); return;
      }
      pushU(); place(tool, w);
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pos(e), w = s2w(p.x, p.y), sw = { x: snp(w.x), y: snp(w.y) }; if (ptrs[e.pointerId]) ptrs[e.pointerId] = p; hov = w;
      if (!drag) { if (tmp && tmp.wall) { tmp.x2 = sw.x; tmp.y2 = sw.y; } draw(); return; }
      if (drag.m === 'pan') { view.ox = drag.ox + p.x - drag.x; view.oy = drag.oy + p.y - drag.y; }
      else if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        var t = two(); view.s = Math.max(3, Math.min(150, drag.s * t.d / drag.d)); view.ox = t.x - drag.w.x * view.s; view.oy = t.y + drag.w.y * view.s;
      } else if (drag.m === 'rect') { tmp.x2 = sw.x; tmp.y2 = sw.y; }
      else if (drag.m === 'move') {
        if (!drag.moved) { pushU(); drag.moved = true; }
        var o = sel.o, o0 = drag.o0, dx = w.x - drag.sx, dy = w.y - drag.sy;
        if (sel.t === 'wall') {
          if (snapG) { dx = snp(o0.x1 + dx) - o0.x1; dy = snp(o0.y1 + dy) - o0.y1; }
          o.x1 = o0.x1 + dx; o.y1 = o0.y1 + dy; o.x2 = o0.x2 + dx; o.y2 = o0.y2 + dy;
        } else {
          var nx = snp(o0.x + dx), ny = snp(o0.y + dy); o.x = nx; o.y = ny;
          if (sel.t === 'item' && WALLT[o.type]) { var sn = nearWall(nx, ny); if (sn) { o.x = sn.x; o.y = sn.y; o.rotationDeg = sn.rot; } }
        }
      } else if (drag.m === 'handle') {
        var ob = sel.o;
        if (sel.t === 'room') { ob.x = (drag.f[0] + sw.x) / 2; ob.y = (drag.f[1] + sw.y) / 2; ob.w = Math.max(.2, Math.abs(sw.x - drag.f[0])); ob.h = Math.max(.2, Math.abs(sw.y - drag.f[1])); }
        else if (sel.t === 'wall') { if (drag.k === 0) { ob.x1 = sw.x; ob.y1 = sw.y; } else { ob.x2 = sw.x; ob.y2 = sw.y; } }
        else { var a = ob.rotationDeg * D, ddx = w.x - ob.x, ddy = w.y - ob.y; ob.w = sv(2 * Math.abs(ddx * Math.cos(a) + ddy * Math.sin(a))); ob.h = sv(2 * Math.abs(-ddx * Math.sin(a) + ddy * Math.cos(a))); }
      }
      draw();
    });
    function up(e) {
      delete ptrs[e.pointerId];
      if (drag && drag.m === 'rect' && tmp) {
        var rw = Math.abs(tmp.x2 - tmp.x1), rh = Math.abs(tmp.y2 - tmp.y1), cx = (tmp.x1 + tmp.x2) / 2, cy = (tmp.y1 + tmp.y2) / 2, f = FD(), o;
        if (rw >= .3 && rh >= .3) {
          pushU();
          if (tool === 'room') { o = { id: nid('r'), x: cx, y: cy, w: rw, h: rh, en_name: 'Room ' + (f.rooms.length + 1), ar_name: '', color: '#00d9ff' }; f.rooms.push(o); sel = { t: 'room', o: o }; }
          else { o = { id: nid('i'), type: 'safe_haven', x: cx, y: cy, w: rw, h: rh, rotationDeg: 0, en_name: 'Safe Haven', ar_name: '' }; f.items.push(o); sel = { t: 'item', o: o }; }
          props(); St.emit('change');
        }
        tmp = null;
      }
      if (drag && (drag.m === 'move' && drag.moved || drag.m === 'handle')) { props(); St.emit('change'); }
      if (!Object.keys(ptrs).length || (drag && drag.m === 'pinch')) drag = null;
      draw();
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault(); var p = pos(e), w = s2w(p.x, p.y); view.s = Math.max(3, Math.min(150, view.s * (e.deltaY < 0 ? 1.12 : .89))); view.ox = p.x - w.x * view.s; view.oy = p.y + w.y * view.s; draw();
    }, { passive: false });
  }
  function key(e) {
    if (!isOpen) return; var t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    if (e.key === 'Escape') { if (tmp || tool !== 'select') { tmp = null; setTool('select'); } else if (sel) { sel = null; props(); } draw(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
    else if (e.key === 'r' || e.key === 'R') rot();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    else if (e.key === ' ') { space = true; e.preventDefault(); }
  }
  function keyup(e) { if (e.key === ' ') space = false; }

  function build() {
    ensureCss();
    ov = h('div', 'ix hide');
    ov.innerHTML = '<div class="ixtop"><b class="ixt" id="ixTitle">FLOOR PLAN</b><span id="ixTabs" class="ixtabs"></span><button id="ixAdd">+ Add Floor</button><button id="ixCopy">Copy Floor 1</button>' +
      '<select id="ixTpl"><option value="">Templates...</option><option value="clear">Clear Floor</option><option value="corridor">Corridor + Offices</option><option value="clinic">Clinic Layout</option></select>' +
      '<select id="ixSnap"><option value=".5">Snap 0.5 m</option><option value=".25">Snap 0.25 m</option><option value="0">Snap Off</option></select>' +
      '<button id="ixUndo">Undo</button><button id="ixPng">Export PNG</button><span class="sp"></span><button id="ixClose" class="on">Save &amp; Close</button></div>' +
      '<div class="ixbody"><div class="ixtools" id="ixTools"></div><div class="ixcv"><canvas id="ixCv"></canvas></div><div class="ixprops" id="ixProps"></div></div>';
    document.body.appendChild(ov);
    var tl = ov.querySelector('#ixTools');
    TOOLS.forEach(function (t) { if (t[0] === '#') tl.appendChild(h('h4', null, t[1])); else { var b = h('button', null, t[1]); b.dataset.t = t[0]; b.onclick = function () { setTool(t[0]); }; tl.appendChild(b); } });
    cv = ov.querySelector('#ixCv'); ctx = cv.getContext('2d'); propsEl = ov.querySelector('#ixProps'); bind();
    ov.querySelector('#ixAdd').onclick = addFloor; ov.querySelector('#ixCopy').onclick = copy1; ov.querySelector('#ixUndo').onclick = doUndo; ov.querySelector('#ixPng').onclick = exportPng; ov.querySelector('#ixClose').onclick = close;
    ov.querySelector('#ixTpl').onchange = function () { var v = this.value; this.value = ''; tpl(v); };
    ov.querySelector('#ixSnap').onchange = function () { snapG = parseFloat(this.value) || 0; };
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode); else window.addEventListener('resize', resize);
    built = true;
  }
  function open(id) {
    if (!built) build();
    if (St.snapshot) St.snapshot();
    if (!setup(id)) { alert('Select a building, medical or security polygon first.'); return; }
    isOpen = true; ov.classList.remove('hide'); resize(); fit(); tabs(); setTool('select'); props();
    document.addEventListener('keydown', key); document.addEventListener('keyup', keyup); draw();
  }
  function close() {
    isOpen = false; ov.classList.add('hide'); document.removeEventListener('keydown', key); document.removeEventListener('keyup', keyup); St.emit('change');
  }
  function pick() {
    ensureCss();
    var fs = St.project.features.filter(function (f) { return CATS.indexOf(f.category) >= 0 && f.geometryType === 'polygon'; });
    var b = h('div', 'ixpk'), box = h('div', 'ixbox');
    if (!fs.length) box.innerHTML = '<h3>Interiors</h3><p>No building, medical or security features are loaded. Import a KML or add a Building first.</p><div class="row"><button id="pkX">OK</button></div>';
    else box.innerHTML = '<h3>Select a structure</h3><select id="pkS">' + fs.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc((f.en_name || f.id) + ' (' + f.category + ')') + '</option>'; }).join('') + '</select><div class="row"><button id="pkO" class="on">Open Floor Plan</button><button id="pkX">Cancel</button></div>';
    b.appendChild(box); document.body.appendChild(b);
    box.querySelector('#pkX').onclick = function () { b.remove(); };
    var o = box.querySelector('#pkO');
    if (o) o.onclick = function () { var v = box.querySelector('#pkS').value; b.remove(); open(v); };
  }

  S.Interior = { open: open, close: close, pick: pick, isOpen: function () { return isOpen; } };
})(window.SOS);
