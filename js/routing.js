window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  var ov, cv, ctx, propsEl, resEl, W = 1, H = 1, dpr = 1, isOpen = false, built = false;
  var proto = 'fire', tool = 'select', nodeType = 'waypoint', goalMode = 'assembly', overlayMode = 'both';
  var view = { s: 4, ox: 0, oy: 0 }, ptrs = {}, drag = null, hov = { x: 0, y: 0 }, space = false;
  var sel = null, connectFrom = null, testStartId = null, activePaths = { fire: null, shelling: null };

  var PCOL = { fire: '#39ff14', shelling: '#00d9ff' };
  var NCOL = { start: '#e8c84a', waypoint: '#8fa6bc', assembly: '#39ff14', exit: '#00ffaa', safe_haven: '#a06bff' };
  var NLAB = { start: 'Zone Start', waypoint: 'Waypoint', assembly: 'Assembly Point', exit: 'Exit / Bus', safe_haven: 'Safe Haven' };
  var HINT = {
    select: 'Click node/edge to inspect or drag nodes. Delete removes selected.',
    pan: 'Drag to pan. Wheel or pinch to zoom.',
    add_node: 'Click anywhere on the map to place a new node.',
    connect: 'Click Node A then Node B to connect (chains automatically; Esc stops).',
    block: 'Click any node or edge to simulate a blockage/hazard and test rerouting.',
    test: 'Click any node to compute shortest Dijkstra path & evacuation time.'
  };

  function ensureCss() {
    if (document.getElementById('sos-routing-css')) return;
    var st = document.createElement('style');
    st.id = 'sos-routing-css';
    st.textContent =
      '.rt{position:fixed;inset:0;z-index:910;background:#080b10;color:#cfe8ff;display:flex;flex-direction:column;font-family:' + MONO + '}' +
      '.rt.hide{display:none}' +
      '.rttop{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#0e141d;border-bottom:1px solid #1b2838;overflow-x:auto;flex-wrap:nowrap;flex-shrink:0}' +
      '.rttop::-webkit-scrollbar{height:5px}.rttop::-webkit-scrollbar-thumb{background:#1b2838;border-radius:3px}' +
      '.rtt{color:#39ff14;font-size:12px;letter-spacing:.5px;white-space:nowrap;margin-right:4px}' +
      '.rt button,.rt select,.rt input{font-family:' + MONO + ';font-size:11px;background:#0b1119;color:#cfe8ff;border:1px solid #1b2838;border-radius:4px;padding:5px 8px;outline:none}' +
      '.rt button{cursor:pointer;white-space:nowrap;flex-shrink:0}' +
      '.rt button:hover{border-color:#00d9ff;color:#fff}' +
      '.rt button.on{border-color:#39ff14;color:#39ff14;background:rgba(57,255,20,.12)}' +
      '.rt button.on-sh{border-color:#00d9ff;color:#00d9ff;background:rgba(0,217,255,.14)}' +
      '.rt button.dng{border-color:#ff3c3c;color:#ff3c3c}' +
      '.rt button.dng:hover{background:rgba(255,60,60,.16)}' +
      '.rt button.amb{border-color:#e8c84a;color:#e8c84a}' +
      '.rt .sp{flex:1;min-width:8px}' +
      '.rtbody{display:flex;flex:1;min-height:0;overflow:hidden}' +
      '.rttools{width:195px;background:#0e141d;border-right:1px solid #1b2838;padding:8px;overflow-y:auto;display:flex;flex-direction:column;gap:5px;flex-shrink:0}' +
      '.rttools h4,.rtprops h3{margin:8px 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#00d9ff;border-bottom:1px solid #1b2838;padding-bottom:2px}' +
      '.rtprops h3{color:#39ff14;font-size:11px;margin-top:0}' +
      '.rttools button{text-align:left;width:100%}' +
      '.rtcv{flex:1;position:relative;min-width:0;min-height:0;background:#080b10;overflow:hidden}' +
      '#rtCv{width:100%;height:100%;display:block;touch-action:none}' +
      '.rtprops{width:255px;background:#0e141d;border-left:1px solid #1b2838;padding:10px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex-shrink:0}' +
      '.rtprops label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#8fa6bc}' +
      '.rt .row{display:flex;gap:6px;margin-top:4px}.rt .row button{flex:1}' +
      '.rt .mut{font-size:11px;color:#7a93a8;line-height:1.45;margin:0}' +
      '.rtcard{background:#0b1119;border:1px solid #1b2838;border-radius:4px;padding:8px;font-size:11px;line-height:1.5}' +
      '.rtcard.ok{border-color:#39ff14}.rtcard.sh{border-color:#00d9ff}.rtcard.err{border-color:#ff3c3c;color:#ff8a8a}' +
      '.rtleg{display:flex;flex-wrap:wrap;gap:6px;font-size:10px;color:#9bb2c7;margin-top:4px}' +
      '.rtleg span{display:inline-flex;align-items:center;gap:4px}' +
      '.rtleg i{width:8px;height:8px;border-radius:50%;display:inline-block}' +
      '@media (max-width:800px){' +
        '.rtbody{flex-direction:column}' +
        '.rttools{width:100%;max-height:56px;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid #1b2838;align-items:center;padding:6px}' +
        '.rttools h4,.rttools .rtleg{display:none}' +
        '.rttools button{width:auto;text-align:center}' +
        '.rtcv{flex:1;min-height:220px}' +
        '.rtprops{width:100%;max-height:190px;border-left:0;border-top:1px solid #1b2838}' +
      '}';
    document.head.appendChild(st);
  }

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function fmt(sec) { var m = Math.floor(sec / 60), s = Math.round(sec % 60); return m ? (m + 'm ' + (s < 10 ? '0' : '') + s + 's') : (s + 's'); }

  function ensureRoutes() {
    if (!St.project.routes) St.project.routes = {};
    ['fire', 'shelling'].forEach(function (k) {
      if (!St.project.routes[k]) St.project.routes[k] = { nodes: [], edges: [] };
      if (!Array.isArray(St.project.routes[k].nodes)) St.project.routes[k].nodes = [];
      if (!Array.isArray(St.project.routes[k].edges)) St.project.routes[k].edges = [];
    });
    return St.project.routes;
  }
  function G(p) { return ensureRoutes()[p || proto]; }
  function nodeById(g, id) { for (var i = 0; i < g.nodes.length; i++) if (g.nodes[i].id === id) return g.nodes[i]; return null; }
  function edgeDist(g, e) {
    var a = nodeById(g, e.from), b = nodeById(g, e.to);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  }
  function featPts(f) {
    var r = (f.rotationDeg || 0) * D, c = Math.cos(r), n = Math.sin(r), m = f.center || { x: 0, y: 0 };
    return (f.coordsMetric || []).map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
  }
  function inPoly(x, y, a) {
    var r = false;
    for (var i = 0, j = a.length - 1; i < a.length; j = i++)
      if ((a[i].y > y) !== (a[j].y > y) && x < (a[j].x - a[i].x) * (y - a[i].y) / (a[j].y - a[i].y) + a[i].x) r = !r;
    return r;
  }
  function segCrossesPoly(a, b, poly) {
    var steps = 8;
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      if (inPoly(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, poly)) return true;
    }
    return false;
  }
  function w2s(x, y) { return [view.ox + x * view.s, view.oy - y * view.s]; }
  function s2w(px, py) { return { x: (px - view.ox) / view.s, y: (view.oy - py) / view.s }; }
  function ln(c, u, v) { c.beginPath(); c.moveTo(u[0], u[1]); c.lineTo(v[0], v[1]); c.stroke(); }

  // Dijkstra shortest path computation
  function solveDijkstra(protocol, startId, goalFilter) {
    var g = G(protocol), start = nodeById(g, startId);
    if (!start) return { ok: false, reason: 'Select a valid start node.' };
    if (start.blocked) return { ok: false, reason: 'Start node is currently blocked/hazardous.' };

    var goals = {};
    g.nodes.forEach(function (n) {
      if (n.blocked) return;
      if (protocol === 'fire') {
        if (goalFilter === 'assembly' && n.type === 'assembly') goals[n.id] = 1;
        else if (goalFilter === 'exit' && n.type === 'exit') goals[n.id] = 1;
        else if (goalFilter === 'any' && (n.type === 'assembly' || n.type === 'exit')) goals[n.id] = 1;
      } else {
        if (n.type === 'safe_haven') goals[n.id] = 1;
      }
    });
    if (!Object.keys(goals).length) {
      return { ok: false, reason: protocol === 'fire' ? 'No unblocked Assembly Point / Exit node found.' : 'No unblocked Safe Haven node found.' };
    }
    if (goals[start.id]) {
      return { ok: true, nodeIds: [start.id], distance: 0, t12: 0, t08: 0, target: start };
    }

    var adj = {};
    g.nodes.forEach(function (n) { if (!n.blocked) adj[n.id] = []; });
    g.edges.forEach(function (e) {
      if (e.blocked) return;
      var a = nodeById(g, e.from), b = nodeById(g, e.to);
      if (!a || !b || a.blocked || b.blocked) return;
      var d = Math.hypot(b.x - a.x, b.y - a.y);
      adj[a.id].push({ to: b.id, w: d });
      if (e.bidirectional !== false) adj[b.id].push({ to: a.id, w: d });
    });

    var dist = {}, prev = {}, vis = {};
    Object.keys(adj).forEach(function (id) { dist[id] = Infinity; });
    dist[start.id] = 0;

    while (true) {
      var u = null, best = Infinity;
      Object.keys(adj).forEach(function (id) {
        if (!vis[id] && dist[id] < best) { best = dist[id]; u = id; }
      });
      if (!u || best === Infinity) break;
      vis[u] = 1;
      adj[u].forEach(function (nb) {
        var alt = dist[u] + nb.w;
        if (alt < dist[nb.to]) { dist[nb.to] = alt; prev[nb.to] = u; }
      });
    }

    var bestGoal = null, bestDist = Infinity;
    Object.keys(goals).forEach(function (gid) {
      if (dist[gid] < bestDist) { bestDist = dist[gid]; bestGoal = gid; }
    });
    if (!bestGoal || bestDist === Infinity) {
      return { ok: false, reason: 'NO SAFE PATH AVAILABLE — ALL ROUTES BLOCKED OR DISCONNECTED.' };
    }

    var chain = [], cur = bestGoal;
    while (cur) { chain.unshift(cur); cur = prev[cur]; }
    return {
      ok: true,
      nodeIds: chain,
      distance: bestDist,
      t12: bestDist / 1.2,
      t08: bestDist / 0.8,
      target: nodeById(g, bestGoal)
    };
  }

  function recomputeActive() {
    var g = G(proto);
    if (testStartId && nodeById(g, testStartId)) {
      activePaths[proto] = solveDijkstra(proto, testStartId, goalMode);
    } else {
      activePaths[proto] = null;
    }
    renderResultCard();
    if (S.Engine && S.Engine.render) S.Engine.render();
  }

  function hasInteriorSafeHaven(fId) {
    var inter = St.project.interiors && St.project.interiors[fId];
    if (!inter || !inter.floors) return false;
    for (var k in inter.floors) {
      var items = inter.floors[k].items || [];
      for (var i = 0; i < items.length; i++) if (items[i].type === 'safe_haven') return true;
    }
    return false;
  }

  function autoSeed() {
    var fs = St.project.features || [];
    if (!fs.length) { alert('Import a KML or .sos.json first.'); return; }
    var g = G(proto);
    if (g.nodes.length && !confirm('Replace existing ' + proto.toUpperCase() + ' nodes & edges with auto-seeded nodes from site features?')) return;
    St.snapshot();
    g.nodes = []; g.edges = [];
    var seen = {};
    function pushNode(f, nType) {
      var pt = f.geometryType === 'point' ? (f.coordsMetric[0] || f.center) : f.center;
      if (!pt) return;
      var key = Math.round(pt.x) + '_' + Math.round(pt.y);
      if (seen[key]) return;
      seen[key] = 1;
      g.nodes.push({
        id: nid('n'), x: +pt.x.toFixed(2), y: +pt.y.toFixed(2), type: nType,
        en_name: f.en_name || f.id, ar_name: f.ar_name || '', featureId: f.id, blocked: false
      });
    }

    fs.forEach(function (f) {
      if (f.visible === false) return;
      var c = f.category;
      if (c === 'fence' || c === 'olive_zone' || c === 'solar' || c === 'hazard' || c === 'tree' || c === 'camera' || c === 'extinguisher') return;
      if (proto === 'fire') {
        if (c === 'assembly') pushNode(f, 'assembly');
        else if (c === 'gate' || c === 'vehicle') pushNode(f, 'exit');
        else if (c === 'building' || c === 'medical' || c === 'security' || c === 'cottage' || c === 'tent' || c === 'field') pushNode(f, 'start');
        else if (c === 'road' || c === 'yard') pushNode(f, 'waypoint');
      } else {
        if (hasInteriorSafeHaven(f.id) || (c === 'building' && ((f.floors | 0) >= 2 || f.hazard_flag === 'safe_haven'))) {
          pushNode(f, 'safe_haven');
        } else if (c === 'tent' || c === 'cottage' || c === 'medical' || c === 'security' || c === 'field' || c === 'gate' || c === 'assembly' || c === 'building') {
          pushNode(f, 'start');
        } else if (c === 'road' || c === 'yard') {
          pushNode(f, 'waypoint');
        }
      }
    });
    sel = null; connectFrom = null; testStartId = null; activePaths[proto] = null;
    St.emit('change'); refreshStartPicker(); renderResultCard(); props(); draw();
  }

  function autoConnect() {
    var g = G(proto), ns = g.nodes;
    if (ns.length < 2) { alert('Need at least 2 nodes first. Use Auto-Seed Nodes or Add Node.'); return; }
    if (g.edges.length && !confirm('Rebuild edges for ' + proto.toUpperCase() + ' network automatically?')) return;
    St.snapshot();
    g.edges = [];
    var hazards = (St.project.features || []).filter(function (f) {
      return f.geometryType === 'polygon' && (f.category === 'hazard' || f.hazard_flag === true || f.hazard_flag === 'high_fire');
    }).map(featPts);

    function edgeCost(a, b) {
      var d = Math.hypot(b.x - a.x, b.y - a.y);
      if (proto === 'fire') {
        for (var i = 0; i < hazards.length; i++) if (segCrossesPoly(a, b, hazards[i])) return d * 3.5;
      }
      return d;
    }
    var pairKey = {};
    function addEdge(a, b) {
      if (a.id === b.id) return;
      var k = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
      if (pairKey[k]) return;
      pairKey[k] = 1;
      g.edges.push({ id: nid('e'), from: a.id, to: b.id, blocked: false, bidirectional: true });
    }

    // 1. Minimum Spanning Tree (Prim) for guaranteed 100% connectivity
    var inTree = {}; inTree[ns[0].id] = 1;
    for (var step = 1; step < ns.length; step++) {
      var bestA = null, bestB = null, bestC = Infinity;
      for (var i = 0; i < ns.length; i++) {
        if (!inTree[ns[i].id]) continue;
        for (var j = 0; j < ns.length; j++) {
          if (inTree[ns[j].id]) continue;
          var cost = edgeCost(ns[i], ns[j]);
          if (cost < bestC) { bestC = cost; bestA = ns[i]; bestB = ns[j]; }
        }
      }
      if (bestA && bestB) { addEdge(bestA, bestB); inTree[bestB.id] = 1; }
    }

    // 2. Add 1 alternate short link per node (< 45m) to enable realistic rerouting when a corridor is blocked
    ns.forEach(function (a) {
      var cands = ns.filter(function (b) { return b.id !== a.id; }).map(function (b) {
        return { n: b, d: Math.hypot(b.x - a.x, b.y - a.y), c: edgeCost(a, b) };
      }).sort(function (u, v) { return u.c - v.c; });
      var added = 0;
      for (var m = 0; m < cands.length && added < 1; m++) {
        if (cands[m].d > 45) break;
        var b = cands[m].n;
        var k = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        if (!pairKey[k]) { addEdge(a, b); added++; }
      }
    });

    St.emit('change'); recomputeActive(); draw();
  }

  function clearBlockages() {
    var g = G(proto);
    St.snapshot();
    g.nodes.forEach(function (n) { n.blocked = false; });
    g.edges.forEach(function (e) { e.blocked = false; });
    St.emit('change'); recomputeActive(); props(); draw();
  }

  function hitNode(w) {
    var g = G(proto), tol = 14 / view.s;
    for (var i = g.nodes.length - 1; i >= 0; i--) {
      if (Math.hypot(g.nodes[i].x - w.x, g.nodes[i].y - w.y) <= tol) return g.nodes[i];
    }
    return null;
  }
  function hitEdge(w) {
    var g = G(proto), tol = 10 / view.s;
    for (var i = g.edges.length - 1; i >= 0; i--) {
      var e = g.edges[i], a = nodeById(g, e.from), b = nodeById(g, e.to);
      if (!a || !b) continue;
      var dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1;
      var t = Math.max(0, Math.min(1, ((w.x - a.x) * dx + (w.y - a.y) * dy) / l));
      if (Math.hypot(w.x - a.x - t * dx, w.y - a.y - t * dy) <= tol) return e;
    }
    return null;
  }

  function drawArrow(c, x1, y1, x2, y2, col, size) {
    var ang = Math.atan2(y2 - y1, x2 - x1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    c.save(); c.translate(mx, my); c.rotate(ang);
    c.fillStyle = col; c.beginPath();
    c.moveTo(size, 0); c.lineTo(-size * .7, -size * .6); c.lineTo(-size * .7, size * .6); c.closePath();
    c.fill(); c.restore();
  }

  function draw() {
    if (!isOpen || !ctx) return;
    var g = G(proto), pCol = PCOL[proto];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#080b10'; ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.setLineDash([]);

    // Metric grid
    var st = [5, 10, 20, 50, 100].filter(function (v) { return v * view.s >= 32; })[0] || 100;
    var a0 = s2w(0, H), b0 = s2w(W, 0), x, y;
    ctx.lineWidth = 1;
    for (x = Math.floor(a0.x / st) * st; x <= b0.x; x += st) { ctx.strokeStyle = 'rgba(57,255,20,.08)'; ln(ctx, w2s(x, a0.y), w2s(x, b0.y)); }
    for (y = Math.floor(a0.y / st) * st; y <= b0.y; y += st) { ctx.strokeStyle = 'rgba(57,255,20,.08)'; ln(ctx, w2s(a0.x, y), w2s(b0.x, y)); }

    // Site base polygons (2D schematic)
    (St.project.features || []).forEach(function (f) {
      if (f.visible === false) return;
      if (f.geometryType === 'polygon' && f.coordsMetric.length >= 3) {
        var ps = featPts(f).map(function (q) { return w2s(q.x, q.y); });
        ctx.beginPath(); ps.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
        if (f.category === 'fence') { ctx.strokeStyle = 'rgba(57,255,20,.45)'; ctx.lineWidth = 1.8; ctx.stroke(); }
        else if (f.category === 'hazard' || f.hazard_flag === true || f.hazard_flag === 'high_fire') {
          ctx.fillStyle = 'rgba(255,60,60,.25)'; ctx.fill(); ctx.strokeStyle = '#ff3c3c'; ctx.lineWidth = 1.5; ctx.stroke();
        } else if (f.category === 'building') {
          ctx.fillStyle = 'rgba(59,76,94,.55)'; ctx.fill(); ctx.strokeStyle = '#89a4be'; ctx.lineWidth = 1.2; ctx.stroke();
        } else if (f.category === 'medical') {
          ctx.fillStyle = 'rgba(255,60,60,.18)'; ctx.fill(); ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 1.2; ctx.stroke();
        } else if (f.category === 'field') {
          ctx.fillStyle = 'rgba(31,111,31,.25)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
        } else if (f.category === 'road' || f.category === 'yard') {
          ctx.fillStyle = 'rgba(138,160,181,.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(138,160,181,.25)'; ctx.lineWidth = 1; ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(14,20,29,.65)'; ctx.fill(); ctx.strokeStyle = 'rgba(138,160,181,.35)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
    });

    // Graph edges
    g.edges.forEach(function (e) {
      var a = nodeById(g, e.from), b = nodeById(g, e.to);
      if (!a || !b) return;
      var sa = w2s(a.x, a.y), sb = w2s(b.x, b.y);
      var isSel = sel && sel.t === 'edge' && sel.o === e;
      ctx.save();
      if (e.blocked) {
        ctx.strokeStyle = '#ff3c3c'; ctx.lineWidth = isSel ? 3.5 : 2.2; ctx.setLineDash([6, 4]);
      } else {
        ctx.strokeStyle = isSel ? '#e8c84a' : (proto === 'fire' ? 'rgba(57,255,20,.55)' : 'rgba(0,217,255,.55)');
        ctx.lineWidth = isSel ? 3.5 : 2;
      }
      ln(ctx, sa, sb);
      ctx.setLineDash([]);
      var mx = (sa[0] + sb[0]) / 2, my = (sa[1] + sb[1]) / 2;
      if (e.blocked) {
        ctx.strokeStyle = '#ff3c3c'; ctx.lineWidth = 2.5;
        ln(ctx, [mx - 6, my - 6], [mx + 6, my + 6]); ln(ctx, [mx + 6, my - 6], [mx - 6, my + 6]);
      } else if (view.s >= 2.2) {
        ctx.font = '9px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(8,11,16,.85)'; ctx.fillRect(mx - 18, my - 7, 36, 13);
        ctx.fillStyle = '#9bb2c7'; ctx.fillText(Math.hypot(b.x - a.x, b.y - a.y).toFixed(0) + 'm', mx, my);
      }
      ctx.restore();
    });

    // Active Dijkstra path highlight
    var ap = activePaths[proto];
    if (ap && ap.ok && ap.nodeIds.length >= 2) {
      ctx.save();
      ctx.strokeStyle = pCol; ctx.lineWidth = 4.5;
      ctx.shadowColor = pCol; ctx.shadowBlur = 12;
      ctx.setLineDash([12, 6]);
      ctx.lineDashOffset = -(Date.now() / 35 % 18);
      ctx.beginPath();
      ap.nodeIds.forEach(function (id, i) {
        var n = nodeById(g, id); if (!n) return;
        var sp = w2s(n.x, n.y);
        i ? ctx.lineTo(sp[0], sp[1]) : ctx.moveTo(sp[0], sp[1]);
      });
      ctx.stroke();
      ctx.setLineDash([]); ctx.shadowBlur = 0;
      for (var k = 0; k < ap.nodeIds.length - 1; k++) {
        var na = nodeById(g, ap.nodeIds[k]), nb = nodeById(g, ap.nodeIds[k + 1]);
        if (na && nb) {
          var p1 = w2s(na.x, na.y), p2 = w2s(nb.x, nb.y);
          drawArrow(ctx, p1[0], p1[1], p2[0], p2[1], pCol, 7);
        }
      }
      ctx.restore();
    }

    // Connect preview line
    if (tool === 'connect' && connectFrom) {
      var sf = w2s(connectFrom.x, connectFrom.y), sh = w2s(hov.x, hov.y);
      ctx.save(); ctx.strokeStyle = '#e8c84a'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ln(ctx, sf, sh); ctx.setLineDash([]);
      ctx.font = 'bold 10px ' + MONO; ctx.fillStyle = '#e8c84a'; ctx.textAlign = 'center';
      ctx.fillText(Math.hypot(hov.x - connectFrom.x, hov.y - connectFrom.y).toFixed(1) + ' m', (sf[0] + sh[0]) / 2, (sf[1] + sh[1]) / 2 - 8);
      ctx.restore();
    }

    // Graph nodes
    g.nodes.forEach(function (n) {
      var sp = w2s(n.x, n.y), isSel = sel && sel.t === 'node' && sel.o === n;
      var col = n.blocked ? '#ff3c3c' : (NCOL[n.type] || '#cfe8ff');
      var rad = (n.type === 'assembly' || n.type === 'safe_haven' || n.type === 'exit') ? 9 : 7;
      ctx.save();
      if (isSel || n === connectFrom || n.id === testStartId) {
        ctx.beginPath(); ctx.arc(sp[0], sp[1], rad + 5, 0, 6.3);
        ctx.strokeStyle = n.id === testStartId ? '#e8c84a' : '#00d9ff'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(sp[0], sp[1], rad, 0, 6.3);
      ctx.fillStyle = '#080b10'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.fillStyle = col; ctx.font = 'bold 9px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var sym = n.blocked ? 'X' : (n.type === 'assembly' ? 'A' : n.type === 'exit' ? 'E' : n.type === 'safe_haven' ? 'S' : n.type === 'start' ? '•' : '');
      if (sym) ctx.fillText(sym, sp[0], sp[1] + .5);
      if (n.en_name) {
        ctx.font = '10px ' + MONO;
        var tw = ctx.measureText(n.en_name).width + 8;
        ctx.fillStyle = 'rgba(8,11,16,.86)'; ctx.fillRect(sp[0] - tw / 2, sp[1] - rad - 16, tw, 13);
        ctx.fillStyle = n.blocked ? '#ff8a8a' : '#e6f3ff';
        ctx.fillText(n.en_name, sp[0], sp[1] - rad - 9.5);
      }
      ctx.restore();
    });

    // HUD top-left status
    ctx.font = '11px ' + MONO; ctx.fillStyle = pCol; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('PROTOCOL: ' + (proto === 'fire' ? 'FIRE EVACUATION (GREEN)' : 'SHELLING / SAFE HAVEN (CYAN)') +
      '  |  Nodes: ' + g.nodes.length + '  |  Edges: ' + g.edges.length + '  |  X ' + hov.x.toFixed(1) + ' Y ' + hov.y.toFixed(1) + ' m', 10, 10);
  }

  function animLoop() {
    if (isOpen && activePaths[proto] && activePaths[proto].ok) draw();
    if (isOpen) requestAnimationFrame(animLoop);
  }

  function renderResultCard() {
    if (!resEl) return;
    var ap = activePaths[proto];
    if (!ap) {
      resEl.innerHTML = '<div class="rtcard mut">Pick a Start Node or use the Test Path tool to calculate shortest route & evacuation time.</div>';
      return;
    }
    if (!ap.ok) {
      resEl.innerHTML = '<div class="rtcard err"><b>ROUTE ALERT:</b><br>' + esc(ap.reason) + '</div>';
      return;
    }
    var g = G(proto);
    var names = ap.nodeIds.map(function (id) { var n = nodeById(g, id); return n ? (n.en_name || n.type) : id; });
    resEl.innerHTML =
      '<div class="rtcard ' + (proto === 'fire' ? 'ok' : 'sh') + '">' +
      '<b>Target:</b> ' + esc(ap.target.en_name || NLAB[ap.target.type]) + '<br>' +
      '<b>Distance:</b> ' + ap.distance.toFixed(1) + ' m<br>' +
      '<b>Adults (1.2 m/s):</b> ' + fmt(ap.t12) + '<br>' +
      '<b>Children (0.8 m/s):</b> ' + fmt(ap.t08) + '<br>' +
      '<span class="mut">Path: ' + esc(names.join(' → ')) + '</span></div>';
  }

  function refreshStartPicker() {
    if (!ov) return;
    var selEl = ov.querySelector('#rtStartPick');
    if (!selEl) return;
    var g = G(proto);
    var opts = '<option value="">Test from node...</option>' + g.nodes.map(function (n) {
      return '<option value="' + esc(n.id) + '"' + (n.id === testStartId ? ' selected' : '') + '>' + esc((n.en_name || n.id) + ' [' + n.type + ']') + '</option>';
    }).join('');
    selEl.innerHTML = opts;
  }

  function props() {
    if (!propsEl) return;
    if (!sel) {
      propsEl.innerHTML = '<h3>Inspector</h3><p class="mut">' + (HINT[tool] || '') + '</p>';
      return;
    }
    var o = sel.o;
    if (sel.t === 'node') {
      var opts = Object.keys(NLAB).map(function (k) {
        return '<option value="' + k + '"' + (o.type === k ? ' selected' : '') + '>' + NLAB[k] + '</option>';
      }).join('');
      propsEl.innerHTML =
        '<h3>Node Properties</h3>' +
        '<label>EN Name<input type="text" id="rnEn" value="' + esc(o.en_name) + '"></label>' +
        '<label>AR Name<input type="text" id="rnAr" dir="rtl" value="' + esc(o.ar_name) + '"></label>' +
        '<label>Node Type<select id="rnTy">' + opts + '</select></label>' +
        '<p class="mut">Coords: X ' + o.x.toFixed(1) + ' m, Y ' + o.y.toFixed(1) + ' m</p>' +
        '<div class="row"><button id="rnBlk" class="' + (o.blocked ? 'dng' : 'amb') + '">' + (o.blocked ? 'Unblock Node' : 'Simulate Blocked') + '</button></div>' +
        '<div class="row"><button id="rnTest" class="on">Test Path From Here</button><button id="rnDel" class="dng">Delete</button></div>';
      propsEl.querySelector('#rnEn').onchange = function () { St.snapshot(); o.en_name = this.value; St.emit('change'); refreshStartPicker(); draw(); };
      propsEl.querySelector('#rnAr').onchange = function () { St.snapshot(); o.ar_name = this.value; St.emit('change'); };
      propsEl.querySelector('#rnTy').onchange = function () { St.snapshot(); o.type = this.value; St.emit('change'); refreshStartPicker(); recomputeActive(); draw(); };
      propsEl.querySelector('#rnBlk').onclick = function () { St.snapshot(); o.blocked = !o.blocked; St.emit('change'); recomputeActive(); props(); draw(); };
      propsEl.querySelector('#rnTest').onclick = function () { testStartId = o.id; refreshStartPicker(); recomputeActive(); draw(); };
      propsEl.querySelector('#rnDel').onclick = delSelected;
    } else {
      var g = G(proto), a = nodeById(g, o.from), b = nodeById(g, o.to);
      propsEl.innerHTML =
        '<h3>Edge Properties</h3>' +
        '<p class="mut">From: ' + esc(a ? a.en_name || a.id : '?') + '<br>To: ' + esc(b ? b.en_name || b.id : '?') + '<br>Length: ' + edgeDist(g, o).toFixed(1) + ' m</p>' +
        '<div class="row"><button id="reBlk" class="' + (o.blocked ? 'dng' : 'amb') + '">' + (o.blocked ? 'Unblock Corridor' : 'Simulate Blocked') + '</button></div>' +
        '<div class="row"><button id="reDel" class="dng">Delete Edge</button></div>';
      propsEl.querySelector('#reBlk').onclick = function () { St.snapshot(); o.blocked = !o.blocked; St.emit('change'); recomputeActive(); props(); draw(); };
      propsEl.querySelector('#reDel').onclick = delSelected;
    }
  }

  function delSelected() {
    if (!sel) return;
    var g = G(proto); St.snapshot();
    if (sel.t === 'node') {
      var id = sel.o.id;
      g.nodes = g.nodes.filter(function (n) { return n.id !== id; });
      g.edges = g.edges.filter(function (e) { return e.from !== id && e.to !== id; });
      if (testStartId === id) testStartId = null;
      if (connectFrom && connectFrom.id === id) connectFrom = null;
    } else {
      g.edges = g.edges.filter(function (e) { return e !== sel.o; });
    }
    sel = null; St.emit('change'); refreshStartPicker(); recomputeActive(); props(); draw();
  }

  function setTool(t) {
    tool = t; connectFrom = null;
    [].forEach.call(ov.querySelectorAll('[data-rt]'), function (b) { b.classList.toggle('on', b.dataset.rt === t); });
    cv.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
    if (!sel) props(); draw();
  }
  function setProto(p) {
    proto = p; sel = null; connectFrom = null;
    ov.querySelector('#rtFire').className = p === 'fire' ? 'on' : '';
    ov.querySelector('#rtShel').className = p === 'shelling' ? 'on-sh' : '';
    ov.querySelector('#rtGoal').style.display = p === 'fire' ? '' : 'none';
    refreshStartPicker(); recomputeActive(); props(); draw();
  }
  function fit() {
    var all = [];
    (St.project.features || []).forEach(function (f) { all = all.concat(f.coordsMetric || []); });
    G(proto).nodes.forEach(function (n) { all.push({ x: n.x, y: n.y }); });
    if (!all.length) { view.s = 4; view.ox = W / 2; view.oy = H / 2; return; }
    var x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    all.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    var bw = Math.max(20, x1 - x0), bh = Math.max(20, y1 - y0);
    view.s = Math.max(.5, Math.min(40, .82 * Math.min(W / bw, H / bh)));
    view.ox = W / 2 - (x0 + x1) / 2 * view.s; view.oy = H / 2 + (y0 + y1) / 2 * view.s;
  }
  function resize() {
    if (!cv) return;
    var r = cv.parentNode.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 3); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw();
  }
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function two() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  function bind() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId); var p = pos(e); ptrs[e.pointerId] = p;
      if (Object.keys(ptrs).length === 2) { var t = two(); drag = { m: 'pinch', d: t.d, s: view.s, w: s2w(t.x, t.y) }; return; }
      var w = s2w(p.x, p.y); hov = w;
      var panD = { m: 'pan', x: p.x, y: p.y, ox: view.ox, oy: view.oy };
      if (e.button === 1 || e.button === 2 || tool === 'pan' || space) { drag = panD; return; }
      var hn = hitNode(w), he = hn ? null : hitEdge(w), g = G(proto);

      if (tool === 'select') {
        if (hn) { sel = { t: 'node', o: hn }; props(); drag = { m: 'move', n: hn, sx: w.x, sy: w.y, x0: hn.x, y0: hn.y, moved: false }; draw(); return; }
        if (he) { sel = { t: 'edge', o: he }; props(); draw(); return; }
        sel = null; props(); drag = panD; draw(); return;
      }
      if (tool === 'add_node') {
        St.snapshot();
        var n = { id: nid('n'), x: +w.x.toFixed(2), y: +w.y.toFixed(2), type: nodeType, en_name: NLAB[nodeType] + ' ' + (g.nodes.length + 1), ar_name: '', featureId: null, blocked: false };
        g.nodes.push(n); sel = { t: 'node', o: n }; St.emit('change'); refreshStartPicker(); recomputeActive(); props(); draw(); return;
      }
      if (tool === 'connect') {
        if (!hn) { connectFrom = null; draw(); return; }
        if (!connectFrom) { connectFrom = hn; sel = { t: 'node', o: hn }; props(); draw(); return; }
        if (connectFrom.id !== hn.id) {
          var dup = g.edges.some(function (ed) { return (ed.from === connectFrom.id && ed.to === hn.id) || (ed.from === hn.id && ed.to === connectFrom.id); });
          if (!dup) {
            St.snapshot();
            var ne = { id: nid('e'), from: connectFrom.id, to: hn.id, blocked: false, bidirectional: true };
            g.edges.push(ne); sel = { t: 'edge', o: ne }; St.emit('change'); recomputeActive(); props();
          }
          connectFrom = hn;
        }
        draw(); return;
      }
      if (tool === 'block') {
        if (hn) { St.snapshot(); hn.blocked = !hn.blocked; sel = { t: 'node', o: hn }; St.emit('change'); recomputeActive(); props(); draw(); return; }
        if (he) { St.snapshot(); he.blocked = !he.blocked; sel = { t: 'edge', o: he }; St.emit('change'); recomputeActive(); props(); draw(); return; }
        drag = panD; return;
      }
      if (tool === 'test') {
        if (hn) { testStartId = hn.id; sel = { t: 'node', o: hn }; refreshStartPicker(); recomputeActive(); props(); draw(); return; }
        drag = panD; return;
      }
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pos(e), w = s2w(p.x, p.y); if (ptrs[e.pointerId]) ptrs[e.pointerId] = p; hov = w;
      if (!drag) { draw(); return; }
      if (drag.m === 'pan') { view.ox = drag.ox + p.x - drag.x; view.oy = drag.oy + p.y - drag.y; }
      else if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        var t = two(); view.s = Math.max(.4, Math.min(60, drag.s * t.d / drag.d)); view.ox = t.x - drag.w.x * view.s; view.oy = t.y + drag.w.y * view.s;
      } else if (drag.m === 'move') {
        if (!drag.moved) { St.snapshot(); drag.moved = true; }
        drag.n.x = +(drag.x0 + w.x - drag.sx).toFixed(2);
        drag.n.y = +(drag.y0 + w.y - drag.sy).toFixed(2);
        recomputeActive();
      }
      draw();
    });
    function up(e) {
      delete ptrs[e.pointerId];
      if (drag && drag.m === 'move' && drag.moved) { St.emit('change'); props(); }
      if (!Object.keys(ptrs).length || (drag && drag.m === 'pinch')) drag = null;
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault(); var p = pos(e), w = s2w(p.x, p.y);
      view.s = Math.max(.4, Math.min(60, view.s * (e.deltaY < 0 ? 1.12 : .89)));
      view.ox = p.x - w.x * view.s; view.oy = p.y + w.y * view.s; draw();
    }, { passive: false });
  }

  function key(e) {
    if (!isOpen) return;
    var t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    if (e.key === 'Escape') { connectFrom = null; if (tool !== 'select') setTool('select'); else { sel = null; props(); } draw(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSelected(); }
    else if (e.key === ' ') { space = true; e.preventDefault(); }
  }
  function keyup(e) { if (e.key === ' ') space = false; }

  function exportPng() {
    var prevSel = sel; sel = null; draw();
    var a = document.createElement('a');
    a.download = 'SOS_Routes_' + proto + '.png';
    a.href = cv.toDataURL('image/png');
    a.click();
    sel = prevSel; draw();
  }

  function build() {
    ensureCss();
    ov = h('div', 'rt hide');
    ov.innerHTML =
      '<div class="rttop">' +
        '<b class="rtt">EMERGENCY ROUTING STUDIO</b>' +
        '<button id="rtFire" class="on">Fire Evacuation (Green)</button>' +
        '<button id="rtShel">Shelling / Safe Haven (Cyan)</button>' +
        '<button id="rtSeed">Auto-Seed Nodes</button>' +
        '<button id="rtAuto">Auto-Connect</button>' +
        '<button id="rtUnblk" class="amb">Clear Blockages</button>' +
        '<button id="rtPng">Export PNG</button>' +
        '<span class="sp"></span>' +
        '<button id="rtClose" class="on">Save &amp; Close</button>' +
      '</div>' +
      '<div class="rtbody">' +
        '<div class="rttools">' +
          '<h4>Navigation</h4>' +
          '<button data-rt="select" class="on">Select / Move</button>' +
          '<button data-rt="pan">Pan</button>' +
          '<h4>Build Graph</h4>' +
          '<button data-rt="add_node">+ Add Node</button>' +
          '<select id="rtNType">' + Object.keys(NLAB).map(function (k) { return '<option value="' + k + '">' + NLAB[k] + '</option>'; }).join('') + '</select>' +
          '<button data-rt="connect">Connect Edge</button>' +
          '<h4>Simulation</h4>' +
          '<button data-rt="test">Test Path (Dijkstra)</button>' +
          '<button data-rt="block" class="dng">Block / Hazard Sim</button>' +
          '<h4>Legend</h4>' +
          '<div class="rtleg">' +
            '<span><i style="background:#e8c84a"></i>Start</span>' +
            '<span><i style="background:#8fa6bc"></i>Waypoint</span>' +
            '<span><i style="background:#39ff14"></i>Assembly</span>' +
            '<span><i style="background:#00ffaa"></i>Exit/Bus</span>' +
            '<span><i style="background:#a06bff"></i>Safe Haven</span>' +
            '<span><i style="background:#ff3c3c"></i>Blocked</span>' +
          '</div>' +
        '</div>' +
        '<div class="rtcv"><canvas id="rtCv"></canvas></div>' +
        '<div class="rtprops">' +
          '<h3>Dijkstra Path Tester</h3>' +
          '<label>Start Node<select id="rtStartPick"></select></label>' +
          '<label id="rtGoal">Fire Goal<select id="rtGoalSel"><option value="assembly">Nearest Assembly Point</option><option value="exit">Nearest Exit / Bus</option><option value="any">Any Safe Target</option></select></label>' +
          '<div id="rtRes"></div>' +
          '<div id="rtInsp"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    cv = ov.querySelector('#rtCv'); ctx = cv.getContext('2d');
    propsEl = ov.querySelector('#rtInsp'); resEl = ov.querySelector('#rtRes');
    bind();
    [].forEach.call(ov.querySelectorAll('[data-rt]'), function (b) { b.onclick = function () { setTool(b.dataset.rt); }; });
    ov.querySelector('#rtFire').onclick = function () { setProto('fire'); };
    ov.querySelector('#rtShel').onclick = function () { setProto('shelling'); };
    ov.querySelector('#rtSeed').onclick = autoSeed;
    ov.querySelector('#rtAuto').onclick = autoConnect;
    ov.querySelector('#rtUnblk').onclick = clearBlockages;
    ov.querySelector('#rtPng').onclick = exportPng;
    ov.querySelector('#rtClose').onclick = close;
    ov.querySelector('#rtNType').onchange = function () { nodeType = this.value; setTool('add_node'); };
    ov.querySelector('#rtStartPick').onchange = function () { testStartId = this.value || null; recomputeActive(); draw(); };
    ov.querySelector('#rtGoalSel').onchange = function () { goalMode = this.value; recomputeActive(); draw(); };
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode); else window.addEventListener('resize', resize);
    built = true;
  }

  function open() {
    ensureRoutes();
    if (!built) build();
    isOpen = true; ov.classList.remove('hide');
    resize(); fit(); setProto(proto); setTool('select');
    document.addEventListener('keydown', key); document.addEventListener('keyup', keyup);
    draw(); animLoop();
  }
  function close() {
    isOpen = false; ov.classList.add('hide');
    document.removeEventListener('keydown', key); document.removeEventListener('keyup', keyup);
    St.emit('change');
    if (S.Engine && S.Engine.render) S.Engine.render();
  }

  // Live 3D Isometric Overlay renderer called by engine.js
  function drawOn3D(c, P, sc) {
    if (overlayMode === 'off') return;
    var rs = ensureRoutes();
    var list = overlayMode === 'both' ? ['shelling', 'fire'] : [overlayMode];
    list.forEach(function (k) {
      var g = rs[k], col = PCOL[k];
      if (!g || !g.nodes.length) return;
      // Draw edges
      g.edges.forEach(function (e) {
        var a = nodeById(g, e.from), b = nodeById(g, e.to);
        if (!a || !b) return;
        var pa = P(a.x, a.y, 0.35), pb = P(b.x, b.y, 0.35);
        c.save();
        if (e.blocked) {
          c.strokeStyle = '#ff3c3c'; c.lineWidth = 2.2; c.setLineDash([5, 4]);
          ln(c, pa, pb); c.setLineDash([]);
          var mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
          c.lineWidth = 2.5; ln(c, [mx - 5, my - 5], [mx + 5, my + 5]); ln(c, [mx + 5, my - 5], [mx - 5, my + 5]);
        } else {
          c.strokeStyle = k === 'fire' ? 'rgba(57,255,20,.65)' : 'rgba(0,217,255,.65)';
          c.lineWidth = 2; c.setLineDash([6, 4]);
          ln(c, pa, pb);
        }
        c.restore();
      });
      // Draw active solved Dijkstra route with animated arrows
      var ap = activePaths[k];
      if (ap && ap.ok && ap.nodeIds.length >= 2) {
        c.save();
        c.strokeStyle = col; c.lineWidth = 4; c.shadowColor = col; c.shadowBlur = 10;
        c.setLineDash([10, 6]); c.lineDashOffset = -(Date.now() / 35 % 16);
        c.beginPath();
        ap.nodeIds.forEach(function (id, i) {
          var n = nodeById(g, id); if (!n) return;
          var pt = P(n.x, n.y, 0.55);
          i ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1]);
        });
        c.stroke(); c.setLineDash([]); c.shadowBlur = 0;
        for (var i = 0; i < ap.nodeIds.length - 1; i++) {
          var na = nodeById(g, ap.nodeIds[i]), nb = nodeById(g, ap.nodeIds[i + 1]);
          if (na && nb) {
            var p1 = P(na.x, na.y, 0.55), p2 = P(nb.x, nb.y, 0.55);
            drawArrow(c, p1[0], p1[1], p2[0], p2[1], col, 6);
          }
        }
        c.restore();
      }
      // Draw key nodes
      g.nodes.forEach(function (n) {
        var pt = P(n.x, n.y, 0.45);
        var nc = n.blocked ? '#ff3c3c' : (NCOL[n.type] || col);
        var rad = (n.type === 'assembly' || n.type === 'safe_haven' || n.type === 'exit') ? 6 : 4;
        c.save();
        c.beginPath(); c.arc(pt[0], pt[1], rad, 0, 6.3);
        c.fillStyle = '#080b10'; c.fill(); c.strokeStyle = nc; c.lineWidth = 2; c.stroke();
        c.restore();
      });
    });
  }

  function hasActiveAnim() {
    if (overlayMode === 'off') return false;
    if (overlayMode === 'fire') return !!(activePaths.fire && activePaths.fire.ok);
    if (overlayMode === 'shelling') return !!(activePaths.shelling && activePaths.shelling.ok);
    return !!((activePaths.fire && activePaths.fire.ok) || (activePaths.shelling && activePaths.shelling.ok));
  }

  St.on('change', function () {
    ensureRoutes();
    if (testStartId && !nodeById(G(proto), testStartId)) { testStartId = null; activePaths[proto] = null; }
  });

  S.Routing = {
    open: open,
    close: close,
    isOpen: function () { return isOpen; },
    setOverlayMode: function (m) { overlayMode = m || 'both'; if (S.Engine && S.Engine.render) S.Engine.render(); },
    getOverlayMode: function () { return overlayMode; },
    solveDijkstra: solveDijkstra,
    drawOn3D: drawOn3D,
    hasActiveAnim: hasActiveAnim
  };
})(window.SOS);
