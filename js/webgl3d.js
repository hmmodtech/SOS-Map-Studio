window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180;
  var cv, hudEl, gl, prog, vbo, vCount = 0, active = false, dirtyGeo = true, dirtyDraw = true;
  var mode = 'orbit'; // 'orbit' | 'walk'
  var zBoost = 1.25, theme = 'cyber', keys = {}, ptrs = {}, drag = null;
  var cam = { cx: 0, cy: 0, dist: 115, yaw: 0, pitch: 48, fov: 48 };
  var walk = { x: 0, y: -35, z: 1.75, yaw: 0, pitch: -4 };

  var VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNorm;',
    'attribute vec3 aCol;',
    'uniform mat4 uMVP;',
    'uniform float uZBoost;',
    'uniform vec3 uEye;',
    'varying vec3 vNorm;',
    'varying vec3 vCol;',
    'varying float vDist;',
    'void main(){',
    '  vec3 p = vec3(aPos.x, aPos.y, aPos.z * uZBoost);',
    '  vNorm = normalize(vec3(aNorm.x, aNorm.y, aNorm.z / max(0.45, uZBoost)));',
    '  vCol = aCol;',
    '  vDist = length(p - uEye);',
    '  gl_Position = uMVP * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec3 vNorm;',
    'varying vec3 vCol;',
    'varying float vDist;',
    'uniform vec3 uSky;',
    'uniform float uAmb;',
    'uniform float uSun;',
    'void main(){',
    '  vec3 N = normalize(vNorm);',
    '  vec3 L = normalize(vec3(0.54, -0.42, 0.73));',
    '  float diff = max(dot(N, L), 0.0);',
    '  float hemi = 0.5 + 0.5 * N.z;',
    '  vec3 col = vCol * (uAmb + diff * uSun + hemi * 0.16);',
    '  float fog = clamp((vDist - 170.0) / 460.0, 0.0, 0.68);',
    '  col = mix(col, uSky, fog);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // --- Linear Algebra (Column-Major Mat4, Z-Up) ---
  function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function mPersp(fovy, asp, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function mLook(eye, ctr, up) {
    var z = norm(sub(eye, ctr)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  function mMul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }

  // --- Geometry & Ear-Clipping Triangulation ---
  function hexRgb(hex, k) {
    k = k == null ? 1 : k;
    if (!hex || hex[0] !== '#' || hex.length !== 7) return [0.5 * k, 0.55 * k, 0.6 * k];
    var n = parseInt(hex.slice(1), 16);
    return [cl(((n >> 16) & 255) / 255 * k, 0, 1), cl(((n >> 8) & 255) / 255 * k, 0, 1), cl((n & 255) / 255 * k, 0, 1)];
  }
  function cen(a) { var x = 0, y = 0; a.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / (a.length || 1), y: y / (a.length || 1) }; }
  function bb(a) { var b = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; a.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }); return b; }
  function sArea(a) { var s = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length]; s += a[i].x * q.y - q.x * a[i].y; } return s * 0.5; }
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
    return 0.5 * Math.atan2(sy, sx);
  }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function featPts(f) {
    var r = (f.rotationDeg || 0) * D, c = Math.cos(r), n = Math.sin(r), m = f.center || { x: 0, y: 0 };
    return (f.coordsMetric || []).map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
  }
  function cross2(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
  function ptInTri(p, a, b, c) { return cross2(a, b, p) >= -1e-6 && cross2(b, c, p) >= -1e-6 && cross2(c, a, p) >= -1e-6; }
  function triangulate(pts) {
    var clean = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (!clean.length || Math.hypot(p.x - clean[clean.length - 1].x, p.y - clean[clean.length - 1].y) > 1e-4) clean.push(p);
    }
    if (clean.length > 1 && Math.hypot(clean[0].x - clean[clean.length - 1].x, clean[0].y - clean[clean.length - 1].y) < 1e-4) clean.pop();
    if (clean.length < 3) return [];
    if (sArea(clean) < 0) clean.reverse();
    var idx = clean.map(function (_, k) { return k; }), tris = [], guard = 0;
    while (idx.length > 3 && guard++ < 1500) {
      var found = false, m = idx.length;
      for (var k = 0; k < m; k++) {
        var a = clean[idx[(k - 1 + m) % m]], b = clean[idx[k]], c = clean[idx[(k + 1) % m]];
        if (cross2(a, b, c) <= 1e-7) continue;
        var ok = true;
        for (var j = 0; j < m; j++) {
          if (j === (k - 1 + m) % m || j === k || j === (k + 1) % m) continue;
          if (ptInTri(clean[idx[j]], a, b, c)) { ok = false; break; }
        }
        if (ok) { tris.push([a, b, c]); idx.splice(k, 1); found = true; break; }
      }
      if (!found) { tris.push([clean[idx[0]], clean[idx[1]], clean[idx[2]]]); idx.splice(1, 1); }
    }
    if (idx.length === 3) tris.push([clean[idx[0]], clean[idx[1]], clean[idx[2]]]);
    return tris;
  }

  // --- Mesh Builder ---
  function buildScene() {
    var verts = [];
    var pr = theme === 'print';
    function tri(p1, p2, p3, col, nrm) {
      var n = nrm || norm(cross(sub(p2, p1), sub(p3, p1)));
      verts.push(
        p1[0], p1[1], p1[2], n[0], n[1], n[2], col[0], col[1], col[2],
        p2[0], p2[1], p2[2], n[0], n[1], n[2], col[0], col[1], col[2],
        p3[0], p3[1], p3[2], n[0], n[1], n[2], col[0], col[1], col[2]
      );
    }
    function quad(p1, p2, p3, p4, col, nrm) {
      var n = nrm || norm(cross(sub(p2, p1), sub(p3, p1)));
      tri(p1, p2, p3, col, n); tri(p1, p3, p4, col, n);
    }
    function flatPoly(pts, z, col) {
      var tris = triangulate(pts);
      for (var i = 0; i < tris.length; i++) {
        var t = tris[i];
        tri([t[0].x, t[0].y, z], [t[1].x, t[1].y, z], [t[2].x, t[2].y, z], col, [0, 0, 1]);
      }
    }
    function extrudePoly(pts, z0, z1, wallCol, roofCol, fl, winCol, doorCol) {
      var a = sArea(pts) < 0 ? pts.slice().reverse() : pts.slice();
      var n = a.length, maxLen = 0, doorIdx = 0;
      for (var i = 0; i < n; i++) {
        var p = a[i], q = a[(i + 1) % n], L = Math.hypot(q.x - p.x, q.y - p.y);
        if (L > maxLen) { maxLen = L; doorIdx = i; }
      }
      for (var j = 0; j < n; j++) {
        var p1 = a[j], p2 = a[(j + 1) % n], dx = p2.x - p1.x, dy = p2.y - p1.y, L2 = Math.hypot(dx, dy) || 1;
        var nx = dy / L2, ny = -dx / L2, wn = [nx, ny, 0];
        quad([p1.x, p1.y, z0], [p2.x, p2.y, z0], [p2.x, p2.y, z1], [p1.x, p1.y, z1], wallCol, wn);
        // Recessed blue window bands slightly proud of wall (+0.04m)
        if (winCol && L2 > 3.2 && z1 - z0 >= 2) {
          var ox = nx * 0.04, oy = ny * 0.04, floors = Math.max(1, fl | 0), h = z1 - z0;
          for (var k = 0; k < floors; k++) {
            var wz0 = z0 + h * (k + 0.30) / floors, wz1 = z0 + h * (k + 0.72) / floors;
            for (var s = 1.0; s < L2 - 2.0; s += 2.6) {
              var t0 = s / L2, t1 = (s + 1.45) / L2;
              quad(
                [p1.x + dx * t0 + ox, p1.y + dy * t0 + oy, wz0],
                [p1.x + dx * t1 + ox, p1.y + dy * t1 + oy, wz0],
                [p1.x + dx * t1 + ox, p1.y + dy * t1 + oy, wz1],
                [p1.x + dx * t0 + ox, p1.y + dy * t0 + oy, wz1],
                winCol, wn
              );
            }
          }
        }
        // Ground entrance door on longest facade
        if (doorCol && j === doorIdx && L2 > 3.0) {
          var dox = nx * 0.06, doy = ny * 0.06, dw = Math.min(1.8, L2 * 0.2), dh = Math.min(2.3, (z1 - z0) * 0.75);
          var tm0 = 0.5 - dw / (2 * L2), tm1 = 0.5 + dw / (2 * L2);
          quad(
            [p1.x + dx * tm0 + dox, p1.y + dy * tm0 + doy, z0 + 0.02],
            [p1.x + dx * tm1 + dox, p1.y + dy * tm1 + doy, z0 + 0.02],
            [p1.x + dx * tm1 + dox, p1.y + dy * tm1 + doy, z0 + dh],
            [p1.x + dx * tm0 + dox, p1.y + dy * tm0 + doy, z0 + dh],
            doorCol, wn
          );
        }
      }
      if (roofCol) flatPoly(a, z1, roofCol);
    }
    function box3(cx, cy, z0, w, d, h, ang, wallCol, roofCol, winCol) {
      var cs = Math.cos(ang), sn = Math.sin(ang);
      var cn = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(function (q) {
        return { x: cx + q[0] * cs - q[1] * sn, y: cy + q[0] * sn + q[1] * cs };
      });
      extrudePoly(cn, z0, z0 + h, wallCol, roofCol, 1, winCol, null);
    }
    function pyramidRoof(pts, z0, rise, col) {
      var a = sArea(pts) < 0 ? pts.slice().reverse() : pts.slice(), m = cen(a), ap = [m.x, m.y, z0 + rise];
      for (var i = 0; i < a.length; i++) {
        var p = a[i], q = a[(i + 1) % a.length];
        tri([p.x, p.y, z0], [q.x, q.y, z0], ap, col);
      }
    }
    function gableRoof(cn, z0, rise, roofCol, gableCol) {
      var r0 = [(cn[0].x + cn[3].x) / 2, (cn[0].y + cn[3].y) / 2, z0 + rise];
      var r1 = [(cn[1].x + cn[2].x) / 2, (cn[1].y + cn[2].y) / 2, z0 + rise];
      quad([cn[0].x, cn[0].y, z0], [cn[1].x, cn[1].y, z0], r1, r0, roofCol);
      quad([cn[2].x, cn[2].y, z0], [cn[3].x, cn[3].y, z0], r0, r1, roofCol);
      tri([cn[3].x, cn[3].y, z0], [cn[0].x, cn[0].y, z0], r0, gableCol);
      tri([cn[1].x, cn[1].y, z0], [cn[2].x, cn[2].y, z0], r1, gableCol);
    }
    function tree3(x, y, rad) {
      var trC = hexRgb('#6b4423'), lf1 = hexRgb(pr ? '#4b7330' : '#2d6a2d'), lf2 = hexRgb(pr ? '#679443' : '#3f8f2f');
      box3(x, y, 0, 0.45, 0.45, 2.0, 0, trC, trC, null);
      // 3D Octahedron canopy (8 triangles)
      var cz = 2.9, r = rad || 1.75, top = [x, y, cz + r * 0.85], bot = [x, y, cz - r * 0.55];
      var ring = [[x + r, y, cz], [x, y + r, cz], [x - r, y, cz], [x, y - r, cz]];
      for (var i = 0; i < 4; i++) {
        var p = ring[i], q = ring[(i + 1) % 4];
        tri(p, q, top, i % 2 ? lf2 : lf1);
        tri(q, p, bot, lf1);
      }
    }
    function cylinder3(cx, cy, z0, rad, h, col) {
      var segs = 10, ring = [];
      for (var i = 0; i < segs; i++) {
        var a = i / segs * Math.PI * 2;
        ring.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
      }
      extrudePoly(ring, z0, z0 + h, col, col, 1, null, null);
    }
    function ribbon3(ptsArr, z, halfW, col) {
      for (var i = 0; i < ptsArr.length - 1; i++) {
        var a = ptsArr[i], b = ptsArr[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        var nx = -dy / L * halfW, ny = dx / L * halfW;
        quad([a.x + nx, a.y + ny, z], [a.x - nx, a.y - ny, z], [b.x - nx, b.y - ny, z], [b.x + nx, b.y + ny, z], col, [0, 0, 1]);
      }
    }

    // 1. Wide outer terrain plane
    var fs = (St.project.features || []).filter(function (f) { return f.visible !== false; });
    var allPts = []; fs.forEach(function (f) { allPts = allPts.concat(f.coordsMetric || []); });
    var sb = allPts.length ? bb(allPts) : { x0: -60, x1: 60, y0: -60, y1: 60 };
    var gx = (sb.x0 + sb.x1) / 2, gy = (sb.y0 + sb.y1) / 2, pad = 260;
    var outerCol = hexRgb(pr ? '#efe7d6' : '#090e16');
    quad([gx - pad, gy - pad, -0.08], [gx + pad, gy - pad, -0.08], [gx + pad, gy + pad, -0.08], [gx - pad, gy + pad, -0.08], outerCol, [0, 0, 1]);

    // 2. Site Features
    fs.forEach(function (f) {
      var cat = f.category;
      if (f.geometryType === 'point') {
        var pt = f.coordsMetric[0] || f.center;
        if (cat === 'assembly') {
          cylinder3(pt.x, pt.y, 0.02, 5.5, 0.14, hexRgb(pr ? '#16a34a' : '#00d9ff'));
          cylinder3(pt.x, pt.y, 0.16, 1.4, 0.35, hexRgb('#ffffff'));
        } else if (cat === 'vehicle') {
          var r = (f.rotationDeg || 0) * D;
          box3(pt.x, pt.y, 0.25, 9.6, 2.5, 1.15, r, hexRgb('#1e5aa8'), hexRgb('#1e5aa8'), null);
          box3(pt.x, pt.y, 1.40, 9.5, 2.45, 1.55, r, hexRgb('#eef2f6'), hexRgb('#ffffff'), hexRgb('#3b6d9c'));
        } else if (cat === 'tree') {
          tree3(pt.x, pt.y, 1.8);
        } else if (cat === 'extinguisher') {
          cylinder3(pt.x, pt.y, 0, 0.45, 1.2, hexRgb('#dc2626'));
        } else if (cat === 'camera') {
          box3(pt.x, pt.y, 0, 0.25, 0.25, 3.2, 0, hexRgb('#64748b'), hexRgb('#64748b'), null);
          box3(pt.x, pt.y, 3.2, 0.8, 0.5, 0.45, 0, hexRgb('#00d9ff'), hexRgb('#00d9ff'), null);
        }
        return;
      }

      var a = featPts(f);
      if (a.length < 3) return;
      var h = +f.height_m || 0, fl = Math.max(1, f.floors | 0);

      if (cat === 'fence') {
        flatPoly(a, -0.02, hexRgb(pr ? '#f1dbb0' : '#0e1622'));
        var fh = h || 2.4, wCol = hexRgb(pr ? '#cec8bc' : '#1b3a24'), pCol = hexRgb(pr ? '#4b5563' : '#39ff14');
        for (var i = 0; i < a.length; i++) {
          var p = a[i], q = a[(i + 1) % a.length], L = Math.hypot(q.x - p.x, q.y - p.y) || 1, ang = Math.atan2(q.y - p.y, q.x - p.x);
          box3((p.x + q.x) / 2, (p.y + q.y) / 2, 0, L, 0.35, 0.85, ang, wCol, wCol, null);
          box3((p.x + q.x) / 2, (p.y + q.y) / 2, fh - 0.12, L, 0.14, 0.14, ang, pCol, pCol, null);
          var posts = Math.min(40, Math.max(2, Math.round(L / 7)));
          for (var k = 0; k < posts; k++) {
            var t = k / posts;
            box3(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, 0.8, 0.18, 0.18, fh - 0.8, ang, pCol, pCol, null);
          }
        }
      } else if (cat === 'road') {
        flatPoly(a, 0.03, hexRgb(pr ? '#d4d0c8' : '#1e293b'));
      } else if (cat === 'yard') {
        flatPoly(a, 0.01, hexRgb(pr ? '#e8d0a2' : '#141e2b'));
      } else if (cat === 'parking') {
        flatPoly(a, 0.03, hexRgb(pr ? '#9ca3af' : '#1e293b'));
        var pth = domAng(a), pcs = Math.cos(pth), psn = Math.sin(pth), pm = cen(a);
        function P2W(lx, ly) { return { x: pm.x + lx * pcs - ly * psn, y: pm.y + lx * psn + ly * pcs }; }
        var pb = bb(a.map(function (p) { var dx = p.x - pm.x, dy = p.y - pm.y; return { x: dx * pcs + dy * psn, y: -dx * psn + dy * pcs }; }));
        var cCols = ['#f8fafc', '#64748b', '#dc2626', '#1e3a8a'], ci = 0;
        for (var px = pb.x0 + 1.8; px <= pb.x1 - 1.8 && ci < 8; px += 3.0) {
          var cp = P2W(px, (pb.y0 + pb.y1) / 2);
          if (inP(cp.x, cp.y, a)) {
            box3(cp.x, cp.y, 0.1, 1.8, 3.8, 1.25, pth, hexRgb(cCols[ci % cCols.length]), hexRgb(cCols[ci % cCols.length]), null);
            ci++;
          }
        }
      } else if (cat === 'playground') {
        flatPoly(a, 0.03, hexRgb(pr ? '#e8ca8e' : '#2d2415'));
        var pgm = cen(a);
        box3(pgm.x - 1.5, pgm.y, 0, 0.25, 3.5, 2.2, 0, hexRgb('#334155'), hexRgb('#334155'), null);
        box3(pgm.x + 1.5, pgm.y, 0, 2.2, 1.2, 1.6, 0, hexRgb('#dc2626'), hexRgb('#f59e0b'), null);
      } else if (cat === 'field') {
        flatPoly(a, 0.04, hexRgb(pr ? '#3fa335' : '#166534'));
        var fth = domAng(a), fcs = Math.cos(fth), fsn = Math.sin(fth), fmc = cen(a);
        function F2W(lx, ly) { return { x: fmc.x + lx * fcs - ly * fsn, y: fmc.y + lx * fsn + ly * fcs }; }
        var fb = bb(a.map(function (p) { var dx = p.x - fmc.x, dy = p.y - fmc.y; return { x: dx * fcs + dy * fsn, y: -dx * fsn + dy * fcs }; }));
        var wLine = hexRgb('#ffffff'), fmx = (fb.x0 + fb.x1) / 2, fmy = (fb.y0 + fb.y1) / 2;
        box3(F2W(fmx, fmy).x, F2W(fmx, fmy).y, 0.05, 0.28, fb.y1 - fb.y0, 0.03, fth, wLine, wLine, null);
        a.forEach(function (p) { box3(p.x, p.y, 0, 0.2, 0.2, 3.2, 0, hexRgb('#cbd5e1'), hexRgb('#cbd5e1'), null); });
      } else if (cat === 'olive_zone') {
        flatPoly(a, 0.01, hexRgb(pr ? '#ebd4a2' : '#112214'));
        var ob = bb(a), cnt = Math.min(55, Math.max(6, Math.abs(sArea(a)) / 48 | 0)), sd = hash(f.id), tries = 0, placed = 0;
        while (placed < cnt && tries++ < cnt * 16) {
          sd = (sd * 1664525 + 1013904223) >>> 0; var rx = ob.x0 + sd / 4294967296 * (ob.x1 - ob.x0);
          sd = (sd * 1664525 + 1013904223) >>> 0; var ry = ob.y0 + sd / 4294967296 * (ob.y1 - ob.y0);
          if (inP(rx, ry, a)) { tree3(rx, ry, 1.65); placed++; }
        }
      } else if (cat === 'solar') {
        var sb2 = bb(a), sh0 = 0.7, sh1 = 2.0, sCol = hexRgb(pr ? '#1f4988' : '#1e50c8'), stCol = hexRgb('#64748b');
        var tris = triangulate(a);
        tris.forEach(function (t) {
          function sz(p) { return sh0 + (p.y - sb2.y0) / Math.max(1, sb2.y1 - sb2.y0) * (sh1 - sh0); }
          tri([t[0].x, t[0].y, sz(t[0])], [t[1].x, t[1].y, sz(t[1])], [t[2].x, t[2].y, sz(t[2])], sCol);
        });
        a.forEach(function (p) {
          var zh = sh0 + (p.y - sb2.y0) / Math.max(1, sb2.y1 - sb2.y0) * (sh1 - sh0);
          box3(p.x, p.y, 0, 0.22, 0.22, zh, 0, stCol, stCol, null);
        });
      } else if (cat === 'pool') {
        extrudePoly(a, 0, 0.55, hexRgb('#cbd5e1'), hexRgb('#22a6df'), 1, null, null);
        a.forEach(function (p) { box3(p.x, p.y, 0.5, 0.25, 0.25, 2.6, 0, hexRgb('#64748b'), hexRgb('#64748b'), null); });
        pyramidRoof(a, 2.8, 0.9, hexRgb('#bae6fd'));
      } else if (cat === 'hazard' || cat === 'diesel_tank') {
        var hh = h || 2.4;
        extrudePoly(a, 0, hh, hexRgb(pr ? '#8b95a1' : '#39424b'), hexRgb(pr ? '#cbd5e1' : '#4a5560'), 1, null, hexRgb('#dc2626'));
        var hm = cen(a);
        cylinder3(hm.x, hm.y, hh, Math.min(1.6, Math.sqrt(Math.abs(sArea(a))) * 0.25), 0.7, hexRgb('#e2e8f0'));
      } else if ((cat === 'tent' || cat === 'cottage') && (f.renderMode || (Math.abs(sArea(a)) > 45 ? 'auto' : 'solid')) === 'auto') {
        var cot = cat === 'cottage', u = cot ? 4 : 3.5, v = cot ? 3.2 : 3.5, px2 = u + (cot ? 1.8 : 1.4), py2 = v + (cot ? 2.2 : 1.4);
        var zth = domAng(a), zcs = Math.cos(zth), zsn = Math.sin(zth), zm = cen(a);
        function L2W(lx, ly) { return { x: zm.x + lx * zcs - ly * zsn, y: zm.y + lx * zsn + ly * zcs }; }
        var zb = bb(a.map(function (p) { var dx = p.x - zm.x, dy = p.y - zm.y; return { x: dx * zcs + dy * zsn, y: -dx * zsn + dy * zcs }; }));
        flatPoly(a, 0.02, hexRgb(pr ? '#e3cfa7' : '#141e2b'));
        var units = [];
        for (var zy = zb.y0 + v / 2 + 0.3; zy <= zb.y1 - v / 2 && units.length < 160; zy += py2)
          for (var zx = zb.x0 + u / 2 + 0.3; zx <= zb.x1 - u / 2 && units.length < 160; zx += px2) {
            var cn = [[-u / 2, -v / 2], [u / 2, -v / 2], [u / 2, v / 2], [-u / 2, v / 2]].map(function (q) { return L2W(zx + q[0], zy + q[1]); });
            if (cn.every(function (q) { return inP(q.x, q.y, a); })) units.push(cn);
          }
        if (!units.length) {
          var fu = Math.max(2.2, Math.min(u, (zb.x1 - zb.x0) * 0.6)), fv = Math.max(2.2, Math.min(v, (zb.y1 - zb.y0) * 0.6));
          units.push([[-fu / 2, -fv / 2], [fu / 2, -fv / 2], [fu / 2, fv / 2], [-fu / 2, fv / 2]].map(function (q) { return L2W(q[0], q[1]); }));
        }
        units.forEach(function (cn) {
          if (cot) {
            extrudePoly(cn, 0, 2.2, hexRgb(pr ? '#c88d55' : '#9c6838'), null, 1, null, hexRgb('#4a2f18'));
            gableRoof(cn, 2.2, 1.0, hexRgb(pr ? '#b56a35' : '#c0502d'), hexRgb(pr ? '#b87d48' : '#85552b'));
          } else {
            extrudePoly(cn, 0, 1.3, hexRgb(pr ? '#f1f3f0' : '#7b8a9b'), null, 1, null, null);
            gableRoof(cn, 1.3, 1.15, hexRgb(pr ? '#ffffff' : '#9aa8b8'), hexRgb(pr ? '#e2e6eb' : '#6f7e8f'));
          }
        });
      } else if (cat === 'medical') {
        extrudePoly(a, 0, h || 3.5, hexRgb(pr ? '#ede9e1' : '#7b3535'), null, 1, hexRgb('#5b8ec4'), hexRgb('#2b3440'));
        pyramidRoof(a, h || 3.5, 1.6, hexRgb('#d4423e'));
        var mm = cen(a);
        cylinder3(mm.x, mm.y, (h || 3.5) + 1.15, 1.3, 0.25, hexRgb('#ffffff'));
      } else if (cat === 'security') {
        extrudePoly(a, 0, h || 3.0, hexRgb(pr ? '#dedbd4' : '#3b4c5e'), null, 1, hexRgb('#4f8ec9'), hexRgb('#2b3440'));
        pyramidRoof(a, h || 3.0, 1.1, hexRgb('#c9413b'));
      } else if (cat === 'gate') {
        extrudePoly(a, 0, 1.6, hexRgb('#dc2626'), hexRgb('#ffffff'), 1, null, null);
      } else {
        // Multi-story or standard architectural building + parapet + rooftop solar & water tanks!
        var bh = h || 4.0, bWall = hexRgb(pr ? '#cfd7df' : '#3b4c5e'), bRoof = hexRgb(pr ? '#dfe5ec' : '#52687f');
        var bWin = hexRgb(pr ? '#3f7ec2' : '#00b4d8'), bDoor = hexRgb('#1e293b');
        extrudePoly(a, 0, bh, bWall, bRoof, fl, bWin, bDoor);
        if (f.roofType === 'red_tile' || f.roofType === 'pyramid') {
          pyramidRoof(a, bh, Math.max(1.4, bh * 0.3), hexRgb(f.roofType === 'red_tile' ? '#c94b3e' : '#64748b'));
        } else if (fl >= 2) {
          // Rooftop parapet wall + 2 solar panel banks + 2 water tanks
          var bth = domAng(a), bcs = Math.cos(bth), bsn = Math.sin(bth), bm = cen(a);
          for (var pi = 0; pi < a.length; pi++) {
            var pp = a[pi], pq = a[(pi + 1) % a.length], pL = Math.hypot(pq.x - pp.x, pq.y - pp.y), pang = Math.atan2(pq.y - pp.y, pq.x - pp.x);
            box3((pp.x + pq.x) / 2, (pp.y + pq.y) / 2, bh, pL, 0.32, 0.65, pang, bWall, bRoof, null);
          }
          var sOff = 3.2;
          box3(bm.x - sOff * bcs, bm.y - sOff * bsn, bh + 0.15, 4.2, 3.2, 0.35, bth, hexRgb('#1e3a8a'), hexRgb('#2563eb'), null);
          box3(bm.x + sOff * bcs, bm.y + sOff * bsn, bh + 0.15, 4.2, 3.2, 0.35, bth, hexRgb('#1e3a8a'), hexRgb('#2563eb'), null);
          cylinder3(bm.x - 1.2 * bsn, bm.y + 1.2 * bcs, bh + 0.05, 0.65, 1.35, hexRgb('#f8fafc'));
          cylinder3(bm.x - 1.2 * bsn + 1.5 * bcs, bm.y + 1.2 * bcs + 1.5 * bsn, bh + 0.05, 0.65, 1.35, hexRgb('#f8fafc'));
        }
      }
    });

    // 3. Elevated 3D Emergency Route Ribbons (Fire Green & Shelling Cyan)
    var rs = St.project.routes || {};
    [['fire', '#22c55e', 0.45], ['shelling', '#00d9ff', 0.62]].forEach(function (cfg) {
      var g = rs[cfg[0]];
      if (!g || !g.nodes || !g.edges) return;
      var col = hexRgb(cfg[1]);
      g.edges.forEach(function (e) {
        var na = g.nodes.filter(function (x) { return x.id === e.from; })[0];
        var nb = g.nodes.filter(function (x) { return x.id === e.to; })[0];
        if (!na || !nb) return;
        ribbon3([na, nb], cfg[2], 0.45, e.blocked ? hexRgb('#ef4444') : col);
      });
      g.nodes.forEach(function (n) {
        if (n.type === 'assembly' || n.type === 'safe_haven' || n.type === 'exit') {
          cylinder3(n.x, n.y, cfg[2], 1.1, 0.35, n.blocked ? hexRgb('#ef4444') : col);
        }
      });
    });

    var data = new Float32Array(verts);
    vCount = data.length / 9;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    dirtyGeo = false;
    dirtyDraw = true;
  }

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function initGL() {
    gl = cv.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }) || cv.getContext('experimental-webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    vbo = gl.createBuffer();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    return true;
  }

  function fitView() {
    var fs = St.project.features || [], all = [];
    fs.forEach(function (f) { all = all.concat(f.coordsMetric || []); });
    if (!all.length) { cam.cx = 0; cam.cy = 0; cam.dist = 110; cam.yaw = 0; cam.pitch = 48; return; }
    var b = bb(all), span = Math.max(40, Math.hypot(b.x1 - b.x0, b.y1 - b.y0));
    cam.cx = (b.x0 + b.x1) / 2; cam.cy = (b.y0 + b.y1) / 2;
    cam.dist = span * 0.95;
    cam.yaw = St.project.meta.trueNorthOffsetDeg || 0;
    cam.pitch = 48;
    // Place walk start near Main Gate or south entry looking into the village
    var gate = fs.filter(function (f) { return f.category === 'gate'; })[0];
    walk.x = gate ? gate.center.x : cam.cx;
    walk.y = gate ? gate.center.y : b.y0 + 4;
    walk.z = 1.75;
    walk.yaw = Math.atan2(cam.cx - walk.x, cam.cy - walk.y) / D;
    walk.pitch = -3;
    dirtyDraw = true;
  }

  function resize() {
    if (!cv || !gl) return;
    var r = cv.parentNode.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); dirtyDraw = true; }
  }

  function render() {
    if (!active || !gl) return;
    resize();
    if (dirtyGeo) buildScene();
    var pr = theme === 'print';
    var sky = pr ? [0.85, 0.91, 0.96] : [0.03, 0.05, 0.09];
    gl.clearColor(sky[0], sky[1], sky[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!vCount) return;

    var eye, ctr;
    if (mode === 'walk') {
      var wy = walk.yaw * D, wp = walk.pitch * D;
      eye = [walk.x, walk.y, walk.z];
      ctr = [walk.x + Math.sin(wy) * Math.cos(wp) * 10, walk.y + Math.cos(wy) * Math.cos(wp) * 10, walk.z + Math.sin(wp) * 10];
    } else {
      var a = cam.yaw * D, p = cl(cam.pitch, 4, 88) * D;
      var horiz = cam.dist * Math.sin(p), elev = cam.dist * Math.cos(p);
      // Matches engine.js yaw convention (yaw=0 looks from South toward North)
      eye = [cam.cx + Math.sin(a) * horiz, cam.cy - Math.cos(a) * horiz, Math.max(1.2, elev)];
      ctr = [cam.cx, cam.cy, 2.0 * zBoost];
    }

    var asp = cv.width / Math.max(1, cv.height);
    var proj = mPersp((mode === 'walk' ? 62 : cam.fov) * D, asp, 0.35, 1600);
    var viewM = mLook(eye, ctr, [0, 0, 1]);
    var mvp = mMul(proj, viewM);

    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    var stride = 9 * 4;
    var locP = gl.getAttribLocation(prog, 'aPos'), locN = gl.getAttribLocation(prog, 'aNorm'), locC = gl.getAttribLocation(prog, 'aCol');
    gl.enableVertexAttribArray(locP); gl.vertexAttribPointer(locP, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(locN); gl.vertexAttribPointer(locN, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(locC); gl.vertexAttribPointer(locC, 3, gl.FLOAT, false, stride, 24);

    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uMVP'), false, mvp);
    gl.uniform1f(gl.getUniformLocation(prog, 'uZBoost'), zBoost);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uEye'), new Float32Array(eye));
    gl.uniform3fv(gl.getUniformLocation(prog, 'uSky'), new Float32Array(sky));
    gl.uniform1f(gl.getUniformLocation(prog, 'uAmb'), pr ? 0.44 : 0.32);
    gl.uniform1f(gl.getUniformLocation(prog, 'uSun'), pr ? 0.56 : 0.65);

    gl.drawArrays(gl.TRIANGLES, 0, vCount);
    dirtyDraw = false;
  }

  function stepKeys() {
    if (!active) return;
    var moved = false;
    var spd = keys.shift ? 0.95 : 0.42;
    if (mode === 'walk') {
      var wy = walk.yaw * D, fx = Math.sin(wy), fy = Math.cos(wy), rx = Math.cos(wy), ry = -Math.sin(wy);
      if (keys.w || keys.arrowup) { walk.x += fx * spd; walk.y += fy * spd; moved = true; }
      if (keys.s || keys.arrowdown) { walk.x -= fx * spd; walk.y -= fy * spd; moved = true; }
      if (keys.d || keys.arrowright) { walk.x += rx * spd; walk.y += ry * spd; moved = true; }
      if (keys.a || keys.arrowleft) { walk.x -= rx * spd; walk.y -= ry * spd; moved = true; }
      if (keys.q) { walk.yaw = (walk.yaw - 1.8 + 360) % 360; moved = true; }
      if (keys.e) { walk.yaw = (walk.yaw + 1.8) % 360; moved = true; }
      if (keys[' ']) { walk.z = cl(walk.z + 0.25, 1.2, 60); moved = true; }
      if (keys.c) { walk.z = cl(walk.z - 0.25, 1.2, 60); moved = true; }
    } else {
      var a = cam.yaw * D, panSpd = cam.dist * 0.012;
      if (keys.w || keys.arrowup) { cam.cx -= Math.sin(a) * panSpd; cam.cy += Math.cos(a) * panSpd; moved = true; }
      if (keys.s || keys.arrowdown) { cam.cx += Math.sin(a) * panSpd; cam.cy -= Math.cos(a) * panSpd; moved = true; }
      if (keys.d || keys.arrowright) { cam.cx += Math.cos(a) * panSpd; cam.cy += Math.sin(a) * panSpd; moved = true; }
      if (keys.a || keys.arrowleft) { cam.cx -= Math.cos(a) * panSpd; cam.cy -= Math.sin(a) * panSpd; moved = true; }
      if (keys.q) { cam.yaw = (cam.yaw - 1.8 + 360) % 360; moved = true; }
      if (keys.e) { cam.yaw = (cam.yaw + 1.8) % 360; moved = true; }
    }
    if (moved) dirtyDraw = true;
  }

  function loop() {
    if (active) {
      stepKeys();
      if (dirtyGeo || dirtyDraw) render();
    }
    requestAnimationFrame(loop);
  }

  function updateHud() {
    if (!hudEl) return;
    hudEl.style.display = active ? 'flex' : 'none';
    var bw = hudEl.querySelector('#wgWalk'), pad = hudEl.querySelector('#wgPad'), tip = hudEl.querySelector('#wgTip');
    if (bw) { bw.textContent = mode === 'walk' ? 'Mode: Walk 1st-Person' : 'Mode: 360° GPU Orbit'; bw.className = mode === 'walk' ? 'on' : 'cy'; }
    if (pad) pad.style.display = mode === 'walk' ? 'grid' : 'none';
    if (tip) tip.textContent = mode === 'walk'
      ? 'WALK 1ST-PERSON: Drag=Look 360° | WASD/Arrows=Walk | Shift=Run | Space/C=Height'
      : 'GPU WEBGL 3D: Left-Drag=Orbit 360° (up to 88°) | Right/Shift-Drag=Pan | Wheel=Zoom';
  }

  function bindEvents() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    cv.addEventListener('pointerdown', function (e) {
      if (!active) return;
      cv.setPointerCapture(e.pointerId); var p = pos(e); ptrs[e.pointerId] = p;
      if (Object.keys(ptrs).length === 2) {
        var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]];
        drag = { m: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist: cam.dist }; return;
      }
      if (mode === 'walk') { drag = { m: 'look', x: p.x, y: p.y }; return; }
      if (e.button === 2 || e.shiftKey) { drag = { m: 'pan', x: p.x, y: p.y }; return; }
      drag = { m: 'orbit', x: p.x, y: p.y };
    });
    cv.addEventListener('pointermove', function (e) {
      if (!active || !drag) return;
      var p = pos(e); if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      if (drag.m === 'look') {
        walk.yaw = (walk.yaw + (p.x - drag.x) * 0.35 + 360) % 360;
        walk.pitch = cl(walk.pitch - (p.y - drag.y) * 0.28, -55, 65);
        drag.x = p.x; drag.y = p.y; dirtyDraw = true;
      } else if (drag.m === 'orbit') {
        cam.yaw = (cam.yaw + (p.x - drag.x) * 0.45 + 360) % 360;
        cam.pitch = cl(cam.pitch + (p.y - drag.y) * 0.35, 5, 88);
        drag.x = p.x; drag.y = p.y; dirtyDraw = true;
      } else if (drag.m === 'pan') {
        var a = cam.yaw * D, s = cam.dist * 0.0022, dx = (p.x - drag.x) * s, dy = (p.y - drag.y) * s;
        cam.cx += -dx * Math.cos(a) + dy * Math.sin(a);
        cam.cy += -dx * Math.sin(a) - dy * Math.cos(a);
        drag.x = p.x; drag.y = p.y; dirtyDraw = true;
      } else if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        var ks = Object.keys(ptrs), a2 = ptrs[ks[0]], b2 = ptrs[ks[1]], d2 = Math.hypot(a2.x - b2.x, a2.y - b2.y) || 1;
        cam.dist = cl(drag.dist * drag.d / d2, 8, 450); dirtyDraw = true;
      }
    });
    function up(e) { delete ptrs[e.pointerId]; if (!Object.keys(ptrs).length) drag = null; }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      if (!active) return;
      e.preventDefault();
      if (mode === 'walk') { walk.z = cl(walk.z + (e.deltaY < 0 ? 1.2 : -1.2), 1.4, 60); }
      else { cam.dist = cl(cam.dist * (e.deltaY < 0 ? 0.88 : 1.12), 8, 450); }
      dirtyDraw = true;
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      if (!active) return;
      var t = e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      var k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'c', ' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) {
        keys[k] = true;
        if (k === ' ' || k.indexOf('arrow') === 0) e.preventDefault();
      }
    });
    window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  }

  function buildHud() {
    hudEl = document.createElement('div');
    hudEl.id = 'wglHud';
    hudEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;flex-direction:column;justify-content:space-between;padding:10px;z-index:20;font-family:ui-monospace,Menlo,Consolas,monospace';
    hudEl.innerHTML =
      '<div style="display:flex;gap:6px;flex-wrap:wrap;pointer-events:auto">' +
        '<button id="wgWalk" class="cy">Mode: 360° GPU Orbit</button>' +
        '<button id="wgLow" title="Drop camera to street-level 80-deg">Street Angle (80°)</button>' +
        '<button id="wgFit">Reset View</button>' +
        '<button id="wgSnap" class="on">Snapshot PNG</button>' +
      '</div>' +
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px">' +
        '<div id="wgTip" style="background:rgba(8,11,16,.86);border:1px solid #00d9ff;color:#00d9ff;padding:5px 9px;border-radius:4px;font-size:10px"></div>' +
        '<div id="wgPad" style="display:none;grid-template-columns:repeat(3,38px);gap:4px;pointer-events:auto">' +
          '<span></span><button data-k="w">&#9650;</button><span></span>' +
          '<button data-k="a">&#9664;</button><button data-k="s">&#9660;</button><button data-k="d">&#9654;</button>' +
        '</div>' +
      '</div>';
    cv.parentNode.appendChild(hudEl);
    hudEl.querySelector('#wgWalk').onclick = function () { S.WebGL3D.toggleWalk(); };
    hudEl.querySelector('#wgLow').onclick = function () { mode = 'orbit'; cam.pitch = 80; cam.dist = Math.min(cam.dist, 75); updateHud(); dirtyDraw = true; };
    hudEl.querySelector('#wgFit').onclick = function () { fitView(); dirtyDraw = true; };
    hudEl.querySelector('#wgSnap').onclick = function () {
      render();
      var a = document.createElement('a'); a.download = 'SOS_WebGL_3D_View.png'; a.href = cv.toDataURL('image/png'); a.click();
    };
    [].forEach.call(hudEl.querySelectorAll('[data-k]'), function (b) {
      var k = b.dataset.k;
      b.addEventListener('pointerdown', function () { keys[k] = true; });
      b.addEventListener('pointerup', function () { keys[k] = false; });
      b.addEventListener('pointerleave', function () { keys[k] = false; });
    });
  }

  S.WebGL3D = {
    init: function (canvas) {
      cv = canvas;
      if (!initGL()) { gl = null; return false; }
      buildHud(); bindEvents();
      if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode); else window.addEventListener('resize', resize);
      St.on('change', function () { dirtyGeo = true; dirtyDraw = true; });
      loop();
      return true;
    },
    isSupported: function () { return !!gl; },
    isActive: function () { return active; },
    setActive: function (on) {
      if (on && !gl) { alert('WebGL is not supported on this browser/GPU. Staying on Canvas 3D+.'); return false; }
      active = !!on;
      cv.style.display = active ? 'block' : 'none';
      if (active) { dirtyGeo = true; fitView(); resize(); }
      updateHud();
      return active;
    },
    toggleWalk: function () {
      mode = mode === 'walk' ? 'orbit' : 'walk';
      updateHud(); dirtyDraw = true; return mode === 'walk';
    },
    isWalk: function () { return mode === 'walk'; },
    setTheme: function (t) { theme = t === 'print' ? 'print' : 'cyber'; dirtyGeo = true; dirtyDraw = true; },
    setDepthBoost: function (v) { zBoost = cl(+v || 1, 0.5, 3); dirtyDraw = true; },
    setYaw: function (v) { cam.yaw = +v || 0; dirtyDraw = true; },
    setPitch: function (v) { cam.pitch = cl(+v || 45, 5, 88); dirtyDraw = true; },
    fitView: fitView
  };
})(window.SOS);
