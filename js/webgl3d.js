window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  var ov, cv, gl, prog, loc = {}, bufPos, bufNorm, bufCol, bufMat, vCount = 0, sCount = 0, hasStencil = false, initErr = '';
  var isOpen = false, built = false, dirtyMesh = true, rafId = 0, lastT = 0;
  var mode = 'orbit', theme = 'print', sunHour = 14.2, zBoost = 1.15, showRoutes = true, intFloor = 0;
  var cam = { tx: 0, ty: 0, tz: 2, dist: 95, yaw: 20, pitch: 52 };
  var fp = { x: 0, y: -25, z: 1.75, yaw: 0, pitch: 0 };
  var keys = {}, drag = null, ptrs = {}, W = 1, H = 1, dpr = 1;

  // =========================================================================
  // SHADERS (Precision header injected identically into BOTH VS & FS!)
  // =========================================================================
  var VS_BODY = [
    'attribute vec3 aPos;',
    'attribute vec3 aNorm;',
    'attribute vec3 aCol;',
    'attribute float aMat;',
    'uniform mat4 uMVP;',
    'uniform vec3 uSunDir;',
    'uniform float uShadowPass;',
    'varying vec3 vNorm;',
    'varying vec3 vCol;',
    'varying vec3 vWPos;',
    'varying float vMat;',
    'void main(){',
    '  vec3 p = aPos;',
    '  if(uShadowPass > 0.5){',
    '    float sz = max(0.22, uSunDir.z);',
    '    p.x = p.x - p.z * (uSunDir.x / sz);',
    '    p.y = p.y - p.z * (uSunDir.y / sz);',
    '    p.z = 0.04;',
    '  }',
    '  vWPos = p; vNorm = aNorm; vCol = aCol; vMat = aMat;',
    '  gl_Position = uMVP * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var FS_BODY = [
    'uniform vec3 uSunDir;',
    'uniform vec3 uCamPos;',
    'uniform vec3 uFogCol;',
    'uniform float uDark;',
    'uniform float uShadowPass;',
    'varying vec3 vNorm;',
    'varying vec3 vCol;',
    'varying vec3 vWPos;',
    'varying float vMat;',
    'float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main(){',
    '  if(uShadowPass > 0.5){',
    '    gl_FragColor = vec4(0.08, 0.07, 0.05, uDark > 0.5 ? 0.35 : 0.28);',
    '    return;',
    '  }',
    '  vec3 N = normalize(vNorm);',
    '  vec3 L = normalize(uSunDir);',
    '  vec3 V = normalize(uCamPos - vWPos);',
    '  vec3 col = vCol;',
    '  float specPow = 0.0;',
    '  int m = int(vMat + 0.5);',
    '  if(m == 1){',
    '    float n = hash2(floor(vWPos.xy * 1.8));',
    '    col *= 0.95 + 0.09 * n;',
    '  } else if(m == 2){',
    '    if(abs(N.z) < 0.5){',
    '      float u = abs(N.x) > abs(N.y) ? vWPos.y : vWPos.x;',
    '      float flY = fract(vWPos.z / 3.2);',
    '      float winX = fract(u / 2.5);',
    '      if(vWPos.z < 0.35){ col *= 0.72; }',
    '      else if(flY > 0.28 && flY < 0.74 && winX > 0.22 && winX < 0.78){',
    '        col = uDark > 0.5 ? vec3(0.05, 0.55, 0.78) : vec3(0.24, 0.48, 0.74);',
    '        specPow = 0.55;',
    '      } else if(flY < 0.07){ col *= 0.82; }',
    '    } else { col *= 0.96 + 0.06 * hash2(floor(vWPos.xy * 2.0)); }',
    '  } else if(m == 3){',
    '    float stripe = step(0.5, fract((vWPos.x + vWPos.y) * 0.14));',
    '    col *= 0.93 + 0.10 * stripe;',
    '  } else if(m == 4){',
    '    float rib = 0.92 + 0.12 * sin(vWPos.x * 5.0 + vWPos.y * 5.0);',
    '    col *= rib;',
    '  } else if(m == 5){',
    '    vec2 g = abs(fract(vWPos.xy * 1.2) - 0.5);',
    '    if(g.x > 0.45 || g.y > 0.45) col = vec3(0.75, 0.86, 0.98);',
    '    specPow = 0.65;',
    '  } else if(m == 6){',
    '    col *= 0.94 + 0.08 * sin(vWPos.x * 2.5 + vWPos.y * 2.5);',
    '    specPow = 0.7;',
    '  } else if(m == 7){',
    '    if(abs(N.z) < 0.5){',
    '      float pl = 0.91 + 0.12 * sin(vWPos.z * 16.0);',
    '      col *= pl;',
    '    }',
    '  }',
    '  if(m == 8){',
    '    gl_FragColor = vec4(col, 1.0); return;',
    '  }',
    '  float ndl = max(dot(N, L), 0.0);',
    '  vec3 skyCol = uDark > 0.5 ? vec3(0.18, 0.28, 0.42) : vec3(0.52, 0.58, 0.66);',
    '  vec3 gndCol = uDark > 0.5 ? vec3(0.08, 0.11, 0.16) : vec3(0.45, 0.39, 0.30);',
    '  vec3 hemi = mix(gndCol, skyCol, N.z * 0.5 + 0.5);',
    '  vec3 sunCol = uDark > 0.5 ? vec3(0.55, 0.75, 0.95) : vec3(1.0, 0.95, 0.85);',
    '  vec3 lit = col * (hemi * (uDark > 0.5 ? 0.65 : 0.55) + sunCol * ndl * (uDark > 0.5 ? 0.72 : 0.88));',
    '  if(specPow > 0.0 && ndl > 0.0){',
    '    vec3 H = normalize(L + V);',
    '    lit += sunCol * pow(max(dot(N, H), 0.0), 28.0) * specPow;',
    '  }',
    '  if(abs(N.z) < 0.6) lit *= mix(0.76, 1.0, smoothstep(0.0, 0.85, vWPos.z));',
    '  float dist = length(uCamPos - vWPos);',
    '  float fog = clamp((dist - 140.0) / 340.0, 0.0, 0.75);',
    '  lit = mix(lit, uFogCol, fog);',
    '  gl_FragColor = vec4(lit, 1.0);',
    '}'
  ].join('\n');

  // =========================================================================
  // MATRIX & GEOMETRY MATH (Z-UP RIGHT-HANDED)
  // =========================================================================
  function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vNorm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function mPersp(fovy, asp, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function mLookAt(eye, ctr, up) {
    var z = vNorm(vSub(eye, ctr)), x = vNorm(vCross(up, z)), y = vCross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -vDot(x, eye), -vDot(y, eye), -vDot(z, eye), 1];
  }
  function mMul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function hexRgb(hex) {
    if (!hex || hex[0] !== '#' || hex.length !== 7) return [0.7, 0.75, 0.8];
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function cen(a) { var x = 0, y = 0; a.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / (a.length || 1), y: y / (a.length || 1) }; }
  function bb(a) { var b = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; a.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }); return b; }
  function signedArea(a) { var s = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length]; s += a[i].x * q.y - q.x * a[i].y; } return s / 2; }
  function area(a) { return Math.abs(signedArea(a)); }
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
  function featPts(f) {
    var r = (f.rotationDeg || 0) * D, c = Math.cos(r), n = Math.sin(r), m = f.center || { x: 0, y: 0 };
    return (f.coordsMetric || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); })
      .map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
  }
  function hash(s) { s = String(s || 'x'); var v = 7; for (var i = 0; i < s.length; i++) v = (v * 31 + s.charCodeAt(i)) >>> 0; return v; }

  // Ear-clipping triangulator for concave KML polygons
  function triangulate(pts) {
    var cl = [], i;
    for (i = 0; i < pts.length; i++) {
      if (!cl.length || Math.hypot(pts[i].x - cl[cl.length - 1].x, pts[i].y - cl[cl.length - 1].y) > 1e-4) cl.push(pts[i]);
    }
    if (cl.length > 1 && Math.hypot(cl[0].x - cl[cl.length - 1].x, cl[0].y - cl[cl.length - 1].y) < 1e-4) cl.pop();
    if (cl.length < 3) return [];
    if (signedArea(cl) < 0) cl.reverse();
    function cr2(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    function inT(p, a, b, c) { return cr2(a, b, p) >= -1e-6 && cr2(b, c, p) >= -1e-6 && cr2(c, a, p) >= -1e-6; }
    var idx = cl.map(function (_, k) { return k; }), tris = [], guard = 0;
    while (idx.length > 3 && guard++ < 1500) {
      var found = false, m = idx.length;
      for (i = 0; i < m; i++) {
        var ia = idx[(i - 1 + m) % m], ib = idx[i], ic = idx[(i + 1) % m], a = cl[ia], b = cl[ib], c = cl[ic];
        if (cr2(a, b, c) <= 1e-6) continue;
        var ok = true;
        for (var j = 0; j < m; j++) {
          var k = idx[j]; if (k === ia || k === ib || k === ic) continue;
          if (inT(cl[k], a, b, c)) { ok = false; break; }
        }
        if (ok) { tris.push([a, b, c]); idx.splice(i, 1); found = true; break; }
      }
      if (!found) { tris.push([cl[idx[0]], cl[idx[1]], cl[idx[2]]]); idx.splice(1, 1); }
    }
    if (idx.length === 3) tris.push([cl[idx[0]], cl[idx[1]], cl[idx[2]]]);
    return tris;
  }

  // =========================================================================
  // 3D MESH BUILDER (SEPARATES GROUND vs SHADOW-CASTING 3D SOLIDS)
  // =========================================================================
  function buildSceneMesh() {
    var gPos = [], gNorm = [], gCol = [], gMat = [];
    var sPos = [], sNorm = [], sCol = [], sMat = [];
    var dk = theme === 'cyber';

    function pushTri(toShadow, a, b, c, col, mat) {
      var n = vCross(vSub(b, a), vSub(c, a));
      var l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-7) return;
      n = [n[0] / l, n[1] / l, n[2] / l];
      var P = toShadow ? sPos : gPos, N = toShadow ? sNorm : gNorm, C = toShadow ? sCol : gCol, M = toShadow ? sMat : gMat;
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      N.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
      C.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
      M.push(mat, mat, mat);
    }
    function quad(sh, a, b, c, d, col, mat) { pushTri(sh, a, b, c, col, mat); pushTri(sh, a, c, d, col, mat); }
    function flatPoly(sh, pts, z, col, mat) {
      triangulate(pts).forEach(function (t) { pushTri(sh, [t[0].x, t[0].y, z], [t[1].x, t[1].y, z], [t[2].x, t[2].y, z], col, mat); });
    }
    function box3(sh, cx, cy, z0, w, d, h, ang, col, mat) {
      if (w < 0.02 || d < 0.02 || h < 0.02) return;
      var cs = Math.cos(ang), sn = Math.sin(ang);
      var cn = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(function (q) { return { x: cx + q[0] * cs - q[1] * sn, y: cy + q[0] * sn + q[1] * cs }; });
      extrude3(sh, cn, z0, z0 + h, col, mat, true);
    }
    function extrude3(sh, pts, z0, z1, col, mat, capTop) {
      var a = signedArea(pts) < 0 ? pts.slice().reverse() : pts;
      for (var i = 0; i < a.length; i++) {
        var p = a[i], q = a[(i + 1) % a.length];
        quad(sh, [p.x, p.y, z0], [q.x, q.y, z0], [q.x, q.y, z1], [p.x, p.y, z1], col, mat);
      }
      if (capTop) flatPoly(sh, a, z1, col, mat);
    }
    function pyramidRoof(sh, pts, z0, rise, col, mat) {
      var a = signedArea(pts) < 0 ? pts.slice().reverse() : pts, m = cen(a), ap = [m.x, m.y, z0 + rise];
      for (var i = 0; i < a.length; i++) {
        var p = a[i], q = a[(i + 1) % a.length];
        pushTri(sh, [p.x, p.y, z0], [q.x, q.y, z0], ap, col, mat);
      }
    }
    function gableRoof(sh, cn, z0, rise, col, mat) {
      var r0 = [(cn[0].x + cn[3].x) / 2, (cn[0].y + cn[3].y) / 2, z0 + rise];
      var r1 = [(cn[1].x + cn[2].x) / 2, (cn[1].y + cn[2].y) / 2, z0 + rise];
      quad(sh, [cn[0].x, cn[0].y, z0], [cn[1].x, cn[1].y, z0], r1, r0, col, mat);
      quad(sh, [cn[2].x, cn[2].y, z0], [cn[3].x, cn[3].y, z0], r0, r1, col, mat);
      pushTri(sh, [cn[3].x, cn[3].y, z0], [cn[0].x, cn[0].y, z0], r0, col, mat);
      pushTri(sh, [cn[1].x, cn[1].y, z0], [cn[2].x, cn[2].y, z0], r1, col, mat);
    }
    function cylinder3(sh, cx, cy, z0, h, rad, segs, col, mat) {
      for (var i = 0; i < segs; i++) {
        var a0 = i / segs * 6.2832, a1 = (i + 1) / segs * 6.2832;
        var x0 = cx + rad * Math.cos(a0), y0 = cy + rad * Math.sin(a0), x1 = cx + rad * Math.cos(a1), y1 = cy + rad * Math.sin(a1);
        quad(sh, [x0, y0, z0], [x1, y1, z0], [x1, y1, z0 + h], [x0, y0, z0 + h], col, mat);
        pushTri(sh, [cx, cy, z0 + h], [x0, y0, z0 + h], [x1, y1, z0 + h], col, mat);
      }
    }
    function tree3(x, y) {
      cylinder3(true, x, y, 0, 2.0 * zBoost, 0.24, 6, hexRgb('#5c4028'), 0);
      var c1 = dk ? hexRgb('#2d6b2d') : hexRgb('#496e2e'), c2 = dk ? hexRgb('#3f8f2f') : hexRgb('#648d3f');
      cylinder3(true, x, y, 1.8 * zBoost, 1.5 * zBoost, 1.55, 7, c1, 4);
      cylinder3(true, x + 0.35, y - 0.25, 2.5 * zBoost, 1.1 * zBoost, 1.15, 6, c2, 4);
    }
    // 1. Wide Horizon Terrain Plane (non-shadow-casting ground)
    var fs = (St.project.features || []).filter(function (f) { return f.visible !== false; });
    var allPts = [];
    fs.forEach(function (f) { allPts = allPts.concat(featPts(f)); });
    var gb = allPts.length ? bb(allPts) : { x0: -60, x1: 60, y0: -60, y1: 60 };
    var gPad = 240, gCol = dk ? hexRgb('#090d14') : hexRgb('#efe4cf');
    quad(false, [gb.x0 - gPad, gb.y0 - gPad, -0.04], [gb.x1 + gPad, gb.y0 - gPad, -0.04], [gb.x1 + gPad, gb.y1 + gPad, -0.04], [gb.x0 - gPad, gb.y1 + gPad, -0.04], gCol, 1);

    // 2. Site Features
    fs.forEach(function (f) {
      var cat = f.category, h = Math.max(0.2, (+f.height_m || 2.5) * zBoost), fl = Math.max(1, f.floors | 0);
      if (f.geometryType === 'point') {
        var p = (f.coordsMetric && f.coordsMetric[0]) || f.center;
        if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
        if (cat === 'assembly') {
          cylinder3(false, p.x, p.y, 0.05, 0.14, 5.8, 20, hexRgb('#16a34a'), 0);
          cylinder3(true, p.x, p.y, 0.14, 3.2 * zBoost, 0.18, 8, hexRgb('#ffffff'), 0);
          box3(true, p.x, p.y, 3.0 * zBoost, 1.6, 0.25, 1.2, 0, hexRgb('#22c55e'), 8);
        } else if (cat === 'vehicle') {
          var ang = (f.rotationDeg || 0) * D;
          box3(true, p.x, p.y, 0.2, 10, 2.5, 1.2 * zBoost, ang, hexRgb('#1e5aa8'), 0);
          box3(true, p.x, p.y, 0.2 + 1.2 * zBoost, 9.8, 2.45, 1.6 * zBoost, ang, hexRgb('#eef2f6'), 2);
        } else if (cat === 'tree') {
          tree3(p.x, p.y);
        } else if (cat === 'extinguisher') {
          cylinder3(true, p.x, p.y, 0, 1.0 * zBoost, 0.25, 8, hexRgb('#dc2626'), 8);
        }
        return;
      }

      var a = featPts(f);
      if (a.length < 3) return;
      if (cat === 'fence') {
        flatPoly(false, a, 0.0, dk ? hexRgb('#101824') : hexRgb('#f1dbb0'), 1);
        var wallH = Math.min(1.1, h * 0.42);
        for (var i = 0; i < a.length; i++) {
          var p0 = a[i], p1 = a[(i + 1) % a.length], L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          if (L < 0.05) continue;
          var angF = Math.atan2(p1.y - p0.y, p1.x - p0.x);
          box3(true, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, 0, L, 0.32, wallH, angF, dk ? hexRgb('#1e2d3d') : hexRgb('#cfc9be'), 0);
          var posts = Math.min(120, Math.max(1, Math.round(L / 6)));
          for (var k = 0; k < posts; k++) {
            var t = k / posts;
            box3(true, p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, wallH, 0.14, 0.14, Math.max(0.5, h - wallH), 0, dk ? hexRgb('#39ff14') : hexRgb('#475569'), 0);
          }
          box3(true, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, h - 0.1, L, 0.1, 0.1, angF, dk ? hexRgb('#39ff14') : hexRgb('#475569'), 0);
        }
      } else if (cat === 'road') {
        flatPoly(false, a, 0.02, dk ? hexRgb('#1e293b') : hexRgb('#d4d0c8'), 1);
      } else if (cat === 'yard') {
        flatPoly(false, a, 0.015, dk ? hexRgb('#142030') : hexRgb('#e8d0a2'), 1);
      } else if (cat === 'parking') {
        flatPoly(false, a, 0.025, dk ? hexRgb('#1e293b') : hexRgb('#9ca3af'), 1);
      } else if (cat === 'playground') {
        flatPoly(false, a, 0.025, dk ? hexRgb('#2a2214') : hexRgb('#e6c789'), 1);
      } else if (cat === 'field') {
        flatPoly(false, a, 0.025, dk ? hexRgb('#14532d') : hexRgb('#3ca132'), 3);
        a.forEach(function (p) { cylinder3(true, p.x, p.y, 0, 3.0 * zBoost, 0.12, 6, hexRgb('#e2e8f0'), 0); });
      } else if (cat === 'olive_zone') {
        flatPoly(false, a, 0.015, dk ? hexRgb('#132216') : hexRgb('#ebd4a2'), 1);
        var ob = bb(a), cnt = Math.min(55, Math.max(5, (area(a) / 48) | 0)), sd = hash(f.id), tries = 0, placed = 0;
        while (placed < cnt && tries++ < cnt * 16) {
          sd = (sd * 1664525 + 1013904223) >>> 0; var rx = ob.x0 + sd / 4294967296 * (ob.x1 - ob.x0);
          sd = (sd * 1664525 + 1013904223) >>> 0; var ry = ob.y0 + sd / 4294967296 * (ob.y1 - ob.y0);
          if (inP(rx, ry, a)) { tree3(rx, ry); placed++; }
        }
      } else if (cat === 'solar') {
        var sb = bb(a), tp = a.map(function (p) { return [p.x, p.y, (0.6 + (p.y - sb.y0) / Math.max(1, sb.y1 - sb.y0) * 1.2) * zBoost]; });
        triangulate(a).forEach(function (t) {
          function zOf(q) { return (0.6 + (q.y - sb.y0) / Math.max(1, sb.y1 - sb.y0) * 1.2) * zBoost; }
          pushTri(true, [t[0].x, t[0].y, zOf(t[0])], [t[1].x, t[1].y, zOf(t[1])], [t[2].x, t[2].y, zOf(t[2])], hexRgb('#1d4482'), 5);
        });
        a.forEach(function (p, j) { cylinder3(true, p.x, p.y, 0, tp[j][2], 0.1, 5, hexRgb('#64748b'), 0); });
      } else if (cat === 'pool') {
        extrude3(true, a, 0, 0.45, hexRgb('#d9dfe6'), 0, false);
        flatPoly(false, a, 0.35, hexRgb('#22a6df'), 6);
        a.forEach(function (p) { cylinder3(true, p.x, p.y, 0, 2.8 * zBoost, 0.12, 6, hexRgb('#475569'), 0); });
      } else if (cat === 'hazard' || cat === 'diesel_tank') {
        var cmH = cen(a);
        flatPoly(false, a, 0.03, hexRgb('#cbd2d9'), 0);
        cylinder3(true, cmH.x, cmH.y, 0.1, Math.min(2.6 * zBoost, h), Math.max(1.2, Math.sqrt(area(a)) * 0.32), 12, hexRgb('#e2e8f0'), 0);
      } else if ((cat === 'tent' || cat === 'cottage') && (f.renderMode || (area(a) > 45 ? 'auto' : 'solid')) === 'auto') {
        var cot = cat === 'cottage', u = cot ? 4 : 3.5, v = cot ? 3.2 : 3.5, px = u + (cot ? 1.8 : 1.4), py = v + (cot ? 2.2 : 1.4);
        var th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a), cntU = 0;
        function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
        var zb = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
        for (var zy = zb.y0 + v / 2 + 0.3; zy <= zb.y1 - v / 2 && cntU < 180; zy += py) {
          for (var zx = zb.x0 + u / 2 + 0.3; zx <= zb.x1 - u / 2 && cntU < 180; zx += px) {
            var cn = [[-u / 2, -v / 2], [u / 2, -v / 2], [u / 2, v / 2], [-u / 2, v / 2]].map(function (q) { return L2W(zx + q[0], zy + q[1]); });
            if (cn.every(function (q) { return inP(q.x, q.y, a); })) {
              cntU++;
              if (cot) { extrude3(true, cn, 0, 2.2 * zBoost, hexRgb('#c88d55'), 7, false); gableRoof(true, cn, 2.2 * zBoost, 1.0 * zBoost, hexRgb('#b26e38'), 4); }
              else { extrude3(true, cn, 0, 1.3 * zBoost, hexRgb('#f2f3f0'), 0, false); gableRoof(true, cn, 1.3 * zBoost, 1.1 * zBoost, hexRgb('#ffffff'), 0); }
            }
          }
        }
        if (!cntU) {
          var fu = Math.max(2.2, Math.min(u, (zb.x1 - zb.x0) * 0.6)), fv = Math.max(2.2, Math.min(v, (zb.y1 - zb.y0) * 0.6));
          var fcn = [[-fu / 2, -fv / 2], [fu / 2, -fv / 2], [fu / 2, fv / 2], [-fu / 2, fv / 2]].map(function (q) { return L2W(q[0], q[1]); });
          if (cot) { extrude3(true, fcn, 0, 2.2 * zBoost, hexRgb('#c88d55'), 7, false); gableRoof(true, fcn, 2.2 * zBoost, 1.0 * zBoost, hexRgb('#b26e38'), 4); }
          else { extrude3(true, fcn, 0, 1.3 * zBoost, hexRgb('#f2f3f0'), 0, false); gableRoof(true, fcn, 1.3 * zBoost, 1.1 * zBoost, hexRgb('#ffffff'), 0); }
        }
      } else if (cat === 'medical') {
        extrude3(true, a, 0, h, hexRgb('#ede9e1'), 2, false);
        pyramidRoof(true, a, h, 1.8 * zBoost, hexRgb('#d4423e'), 4);
      } else if (cat === 'security') {
        extrude3(true, a, 0, h, hexRgb('#dedbd4'), 2, false);
        pyramidRoof(true, a, h, 1.4 * zBoost, hexRgb('#c9413b'), 4);
      } else if (cat === 'gate') {
        extrude3(true, a, 0, 1.6 * zBoost, hexRgb('#dc2626'), 0, true);
      } else {
        var inter = St.project.interiors && St.project.interiors[f.id];
        if (intFloor > 0 && inter && inter.floors && inter.floors[String(intFloor)]) {
          var flH = 3.2 * zBoost, zBase = (intFloor - 1) * flH;
          flatPoly(false, a, zBase + 0.04, hexRgb('#f1f5f9'), 0);
          extrude3(true, a, zBase, zBase + 0.9, dk ? hexRgb('#3b4c5e') : hexRgb('#cbd5e1'), 0, false);
          var g = inter.floors[String(intFloor)], cmI = cen(a), angI = -(inter.alignAngleRad || 0), ci = Math.cos(angI), si = Math.sin(angI);
          function I2W(lx, ly) { return { x: cmI.x + lx * ci - ly * si, y: cmI.y + lx * si + ly * ci }; }
          (g.rooms || []).forEach(function (rm) {
            var rPts = [[-rm.w / 2, -rm.h / 2], [rm.w / 2, -rm.h / 2], [rm.w / 2, rm.h / 2], [-rm.w / 2, rm.h / 2]].map(function (q) { return I2W(rm.x + q[0], rm.y + q[1]); });
            flatPoly(false, rPts, zBase + 0.07, hexRgb('#dbeafe'), 0);
          });
          (g.walls || []).forEach(function (wl) {
            var p1 = I2W(wl.x1, wl.y1), p2 = I2W(wl.x2, wl.y2), L = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (L > 0.1) box3(true, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, zBase, L, 0.2, 2.5 * zBoost, Math.atan2(p2.y - p1.y, p2.x - p1.x), hexRgb('#94a3b8'), 0);
          });
          (g.items || []).forEach(function (it) {
            var wp = I2W(it.x, it.y), ia = angI + (it.rotationDeg || 0) * D;
            if (it.type === 'safe_haven') box3(false, wp.x, wp.y, zBase + 0.08, it.w, it.h, 0.12, ia, hexRgb('#2563eb'), 8);
            else if (it.type === 'emergency_exit' || it.type === 'main_entrance') box3(true, wp.x, wp.y, zBase, it.w, 0.25, 2.2 * zBoost, ia, hexRgb('#16a34a'), 8);
            else if (it.type === 'extinguisher') cylinder3(true, wp.x, wp.y, zBase, 0.9 * zBoost, 0.22, 8, hexRgb('#dc2626'), 8);
            else if (it.type === 'stairs') box3(true, wp.x, wp.y, zBase, it.w, it.h, 1.4 * zBoost, ia, hexRgb('#64748b'), 0);
            else box3(true, wp.x, wp.y, zBase, it.w, it.h, 0.85 * zBoost, ia, hexRgb('#b48a60'), 7);
          });
        } else {
          var bCol = dk ? hexRgb('#3b4c5e') : hexRgb('#cfd7df');
          extrude3(true, a, 0, h, bCol, 2, true);
          if (cat === 'building' && (f.roofType || 'flat') === 'flat' && area(a) > 50) {
            for (var pi = 0; pi < a.length; pi++) {
              var q0 = a[pi], q1 = a[(pi + 1) % a.length], Lp = Math.hypot(q1.x - q0.x, q1.y - q0.y);
              if (Lp > 0.05) box3(true, (q0.x + q1.x) / 2, (q0.y + q1.y) / 2, h, Lp, 0.35, 0.65 * zBoost, Math.atan2(q1.y - q0.y, q1.x - q0.x), dk ? hexRgb('#52687f') : hexRgb('#e2e8f0'), 0);
            }
            if (fl >= 2) {
              var thB = domAng(a), cB = Math.cos(thB), sB = Math.sin(thB), mB = cen(a);
              function B2W(lx, ly) { return { x: mB.x + lx * cB - ly * sB, y: mB.y + lx * sB + ly * cB }; }
              [-2.8, 2.8].forEach(function (ox) {
                var pS = B2W(ox, 0);
                if (inP(pS.x, pS.y, a)) box3(true, pS.x, pS.y, h + 0.15, 4.4, 3.0, 0.45, thB, hexRgb('#1e4682'), 5);
              });
              var pT = B2W(6.2, 2.8);
              if (inP(pT.x, pT.y, a)) cylinder3(true, pT.x, pT.y, h + 0.05, 1.4 * zBoost, 0.65, 10, hexRgb('#f8fafc'), 0);
            }
          }
        }
      }
    });

    // 3. Elevated Glowing 3D Emergency Route Ribbons (Fire Green & Shelling Cyan)
    if (showRoutes && St.project.routes) {
      [['fire', '#22c55e', 0.45], ['shelling', '#00d9ff', 0.65]].forEach(function (pair) {
        var g = St.project.routes[pair[0]];
        if (!g || !g.nodes || !g.edges) return;
        var rc = hexRgb(pair[1]), zR = pair[2];
        g.edges.forEach(function (e) {
          if (e.blocked) return;
          var a = g.nodes.filter(function (n) { return n.id === e.from; })[0];
          var b = g.nodes.filter(function (n) { return n.id === e.to; })[0];
          if (!a || !b || a.blocked || b.blocked) return;
          var L = Math.hypot(b.x - a.x, b.y - a.y);
          if (L > 0.2) box3(false, (a.x + b.x) / 2, (a.y + b.y) / 2, zR, L, 0.65, 0.12, Math.atan2(b.y - a.y, b.x - a.x), rc, 8);
        });
      });
    }

    var gVerts = gPos.length / 3;
    sCount = sPos.length / 3;
    vCount = gVerts + sCount;

    var allP = new Float32Array(vCount * 3); allP.set(gPos, 0); allP.set(sPos, gPos.length);
    var allN = new Float32Array(vCount * 3); allN.set(gNorm, 0); allN.set(sNorm, gNorm.length);
    var allC = new Float32Array(vCount * 3); allC.set(gCol, 0); allC.set(sCol, gCol.length);
    var allM = new Float32Array(vCount); allM.set(gMat, 0); allM.set(sMat, gMat.length);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferData(gl.ARRAY_BUFFER, allP, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNorm); gl.bufferData(gl.ARRAY_BUFFER, allN, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufCol); gl.bufferData(gl.ARRAY_BUFFER, allC, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufMat); gl.bufferData(gl.ARRAY_BUFFER, allM, gl.STATIC_DRAW);
    dirtyMesh = false;
  }

  function setHud(msg, isErr) {
    var hud = ov && ov.querySelector('#glHud');
    if (!hud) return;
    hud.textContent = msg;
    hud.style.color = isErr ? '#ff3c3c' : '#39ff14';
    hud.style.borderColor = isErr ? '#ff3c3c' : '#1b2838';
  }

  function initGL() {
    initErr = '';
    gl = cv.getContext('webgl', { antialias: true, stencil: true, preserveDrawingBuffer: true }) ||
         cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (!gl) { initErr = 'WebGL not supported or hardware acceleration disabled in browser settings.'; setHud(initErr, true); return false; }
    hasStencil = !!(gl.getContextAttributes && gl.getContextAttributes().stencil);

    // Match float precision IDENTICALLY in both VS and FS (fixes ANGLE/Windows Chrome link error)
    var fmtH = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    var prec = (fmtH && fmtH.precision > 0) ? 'precision highp float;\n' : 'precision mediump float;\n';

    function sh(type, src, label) {
      var s = gl.createShader(type); gl.shaderSource(s, prec + src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        initErr = label + ' shader error: ' + gl.getShaderInfoLog(s);
        console.error(initErr); return null;
      }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, VS_BODY, 'Vertex'), fs = sh(gl.FRAGMENT_SHADER, FS_BODY, 'Fragment');
    if (!vs || !fs) { setHud(initErr, true); return false; }

    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      initErr = 'Program link error: ' + gl.getProgramInfoLog(prog);
      console.error(initErr); setHud(initErr, true); return false;
    }
    gl.useProgram(prog);
    ['aPos', 'aNorm', 'aCol', 'aMat'].forEach(function (k) {
      loc[k] = gl.getAttribLocation(prog, k);
      if (loc[k] >= 0) gl.enableVertexAttribArray(loc[k]);
    });
    ['uMVP', 'uSunDir', 'uCamPos', 'uFogCol', 'uDark', 'uShadowPass'].forEach(function (k) { loc[k] = gl.getUniformLocation(prog, k); });
    bufPos = gl.createBuffer(); bufNorm = gl.createBuffer(); bufCol = gl.createBuffer(); bufMat = gl.createBuffer();
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  function renderFrame(dt) {
    if (!gl || !prog || initErr) return;
    try {
      if (dirtyMesh) buildSceneMesh();

      var spd = (keys.Shift ? 14 : 7) * dt;
      if (mode === 'walk') {
        var fYaw = fp.yaw * D, fx = Math.sin(fYaw), fy = Math.cos(fYaw), rx = Math.cos(fYaw), ry = -Math.sin(fYaw);
        if (keys.KeyW || keys.ArrowUp) { fp.x += fx * spd; fp.y += fy * spd; }
        if (keys.KeyS || keys.ArrowDown) { fp.x -= fx * spd; fp.y -= fy * spd; }
        if (keys.KeyD || keys.ArrowRight) { fp.x += rx * spd; fp.y += ry * spd; }
        if (keys.KeyA || keys.ArrowLeft) { fp.x -= rx * spd; fp.y -= ry * spd; }
        if (keys.KeyQ) fp.yaw = (fp.yaw - 75 * dt + 360) % 360;
        if (keys.KeyE) fp.yaw = (fp.yaw + 75 * dt) % 360;
        if (keys.KeyR) fp.z = Math.min(25, fp.z + 4 * dt);
        if (keys.KeyF) fp.z = Math.max(1.5, fp.z - 4 * dt);
      } else {
        var oYaw = cam.yaw * D, pSpd = cam.dist * 0.55 * dt;
        var ox = Math.sin(oYaw), oy = Math.cos(oYaw), rrx = Math.cos(oYaw), rry = -Math.sin(oYaw);
        if (keys.KeyW || keys.ArrowUp) { cam.tx -= ox * pSpd; cam.ty += oy * pSpd; }
        if (keys.KeyS || keys.ArrowDown) { cam.tx += ox * pSpd; cam.ty -= oy * pSpd; }
        if (keys.KeyD || keys.ArrowRight) { cam.tx += rrx * pSpd; cam.ty += rry * pSpd; }
        if (keys.KeyA || keys.ArrowLeft) { cam.tx -= rrx * pSpd; cam.ty -= rry * pSpd; }
        if (keys.KeyQ) cam.yaw = (cam.yaw - 65 * dt + 360) % 360;
        if (keys.KeyE) cam.yaw = (cam.yaw + 65 * dt) % 360;
      }

      var sT = Math.max(0.05, Math.min(0.95, (sunHour - 6) / 12)) * Math.PI;
      var sunDir = vNorm([Math.cos(sT), -0.45, Math.max(0.24, Math.sin(sT) * 1.15)]);
      var dk = theme === 'cyber';
      var fog = dk ? [0.03, 0.05, 0.08] : [0.85, 0.90, 0.96];
      if (!dk && (sunHour < 8 || sunHour > 16.5)) fog = [0.95, 0.80, 0.68];

      var eye, ctr;
      if (mode === 'walk') {
        var wy = fp.yaw * D, wp = fp.pitch * D;
        eye = [fp.x, fp.y, fp.z];
        ctr = [fp.x + Math.sin(wy) * Math.cos(wp), fp.y + Math.cos(wy) * Math.cos(wp), fp.z + Math.sin(wp)];
      } else {
        var ya = cam.yaw * D, el = (90 - cam.pitch) * D;
        var horiz = cam.dist * Math.cos(el), vz = Math.max(1.2, cam.dist * Math.sin(el));
        eye = [cam.tx + horiz * Math.sin(ya), cam.ty - horiz * Math.cos(ya), cam.tz + vz];
        ctr = [cam.tx, cam.ty, cam.tz];
      }

      var proj = mPersp((mode === 'walk' ? 62 : 46) * D, W / Math.max(1, H), 0.35, 1400);
      var mvp = mMul(proj, mLookAt(eye, ctr, [0, 0, 1]));

      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(fog[0], fog[1], fog[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | (hasStencil ? gl.STENCIL_BUFFER_BIT : 0));
      gl.useProgram(prog);

      gl.uniformMatrix4fv(loc.uMVP, false, mvp);
      gl.uniform3fv(loc.uSunDir, sunDir);
      gl.uniform3fv(loc.uCamPos, eye);
      gl.uniform3fv(loc.uFogCol, fog);
      gl.uniform1f(loc.uDark, dk ? 1 : 0);

      if (loc.aPos >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0); }
      if (loc.aNorm >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bufNorm); gl.vertexAttribPointer(loc.aNorm, 3, gl.FLOAT, false, 0, 0); }
      if (loc.aCol >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bufCol); gl.vertexAttribPointer(loc.aCol, 3, gl.FLOAT, false, 0, 0); }
      if (loc.aMat >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bufMat); gl.vertexAttribPointer(loc.aMat, 1, gl.FLOAT, false, 0, 0); }

      gl.disable(gl.STENCIL_TEST);
      gl.uniform1f(loc.uShadowPass, 0);
      if (vCount > 0) gl.drawArrays(gl.TRIANGLES, 0, vCount);

      if (sCount > 0 && hasStencil) {
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.EQUAL, 0, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
        gl.depthMask(false);
        gl.uniform1f(loc.uShadowPass, 1);
        gl.drawArrays(gl.TRIANGLES, vCount - sCount, sCount);
        gl.depthMask(true);
        gl.disable(gl.STENCIL_TEST);
      }

      setHud(mode === 'walk'
        ? ('FIRST-PERSON WALK | Pos X ' + fp.x.toFixed(1) + ' Y ' + fp.y.toFixed(1) + ' Z ' + fp.z.toFixed(1) + 'm | WASD=Walk | Shift=Sprint | Drag=Look 360° | R/F=Height')
        : ('WEBGL 3D GPU | Orbit ' + Math.round(cam.yaw) + '° | Tilt ' + Math.round(cam.pitch) + '° | Tris ' + Math.round(vCount / 3) + ' | Left-Drag=Orbit | Right/Shift-Drag=Pan | Wheel=Zoom'), false);
    } catch (err) {
      console.error('WebGL3D error:', err);
      setHud('WebGL3D Runtime Error: ' + (err && err.message ? err.message : String(err)), true);
    }
  }

  function loop(ts) {
    if (!isOpen) return;
    var dt = Math.min(0.08, (ts - (lastT || ts)) / 1000); lastT = ts;
    renderFrame(dt);
    rafId = requestAnimationFrame(loop);
  }

  function resetCamera() {
    var fs = St.project.features || [], all = [];
    fs.forEach(function (f) { all = all.concat(featPts(f)); });
    var b = all.length ? bb(all) : { x0: -40, x1: 40, y0: -40, y1: 40 };
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, span = Math.max(35, Math.hypot(b.x1 - b.x0, b.y1 - b.y0));
    cam.tx = cx; cam.ty = cy; cam.tz = 2; cam.dist = span * 0.95;
    cam.yaw = St.project.meta.trueNorthOffsetDeg || 0; cam.pitch = 52;
    fp.x = cx; fp.y = b.y0 + 6; fp.z = 1.75; fp.yaw = 0; fp.pitch = 0;
  }

  function jumpToBuilding(fl) {
    intFloor = fl; dirtyMesh = true;
    var bld = (St.project.features || []).filter(function (f) { return St.project.interiors && St.project.interiors[f.id]; })[0];
    if (bld && fl > 0) {
      fp.x = bld.center.x; fp.y = bld.center.y - 2; fp.z = (fl - 1) * 3.2 * zBoost + 1.65;
      cam.tx = bld.center.x; cam.ty = bld.center.y; cam.tz = (fl - 1) * 3.2 * zBoost + 1; cam.dist = 26;
    } else if (fl === 0) { fp.z = 1.75; }
    syncUI();
  }

  function ensureCss() {
    if (document.getElementById('sos-webgl-css')) return;
    var st = document.createElement('style'); st.id = 'sos-webgl-css';
    st.textContent =
      '.gl3d{position:fixed;inset:0;z-index:940;background:#080b10;color:#cfe8ff;display:flex;flex-direction:column;font-family:' + MONO + '}' +
      '.gl3d.hide{display:none}' +
      '.gltop{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#0e141d;border-bottom:1px solid #1b2838;overflow-x:auto;flex-shrink:0}' +
      '.glt{color:#39ff14;font-size:12px;letter-spacing:.5px;white-space:nowrap;margin-right:4px}' +
      '.gl3d button,.gl3d select{font-family:' + MONO + ';font-size:11px;background:#0b1119;color:#cfe8ff;border:1px solid #1b2838;border-radius:4px;padding:5px 8px;cursor:pointer;white-space:nowrap}' +
      '.gl3d button:hover{border-color:#00d9ff;color:#fff}' +
      '.gl3d button.on{border-color:#39ff14;color:#39ff14;background:rgba(57,255,20,.14)}' +
      '.gl3d button.cy{border-color:#00d9ff;color:#00d9ff;background:rgba(0,217,255,.14)}' +
      '.gl3d label{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#8fa6bc;white-space:nowrap}' +
      '.gl3d input[type=range]{width:76px;accent-color:#39ff14}' +
      '.gl3d .sp{flex:1;min-width:6px}' +
      '.glstage{flex:1;position:relative;min-height:0;overflow:hidden}' +
      '#glCv{width:100%;height:100%;display:block;touch-action:none}' +
      '#glHud{position:absolute;bottom:10px;left:10px;background:rgba(8,11,16,.88);border:1px solid #1b2838;border-radius:4px;padding:5px 9px;font-size:10px;color:#39ff14;pointer-events:none;max-width:calc(100% - 20px)}' +
      '#glPad{position:absolute;bottom:44px;right:14px;display:none;grid-template-columns:repeat(3,40px);gap:4px}' +
      '#glPad.show{display:grid}#glPad button{height:40px;font-size:15px;font-weight:bold;background:rgba(14,20,29,.88)}';
    document.head.appendChild(st);
  }

  function syncUI() {
    if (!ov) return;
    ov.querySelector('#glOrbit').className = mode === 'orbit' ? 'on' : '';
    ov.querySelector('#glWalk').className = mode === 'walk' ? 'cy' : '';
    ov.querySelector('#glTheme').textContent = 'Theme: ' + (theme === 'print' ? 'Print' : 'Cyber');
    ov.querySelector('#glRoutes').className = showRoutes ? 'on' : '';
    ov.querySelector('#glSunV').textContent = Math.floor(sunHour) + ':00';
    ov.querySelector('#glBoostV').textContent = zBoost.toFixed(1) + 'x';
    ov.querySelector('#glFloor').value = String(intFloor);
    ov.querySelector('#glPad').classList.toggle('show', mode === 'walk');
  }

  function resize() {
    if (!cv) return;
    var r = cv.parentNode.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function two() { var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; }

  function bind() {
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId); var p = pos(e); ptrs[e.pointerId] = p;
      if (Object.keys(ptrs).length === 2) { drag = { m: 'pinch', d: two().d, dist: cam.dist }; return; }
      if (mode === 'walk') { drag = { m: 'look', x: p.x, y: p.y }; return; }
      if (e.button === 2 || e.button === 1 || e.shiftKey) { drag = { m: 'pan', x: p.x, y: p.y }; return; }
      drag = { m: 'orbit', x: p.x, y: p.y };
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pos(e); if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      if (!drag) return;
      if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) {
        cam.dist = Math.max(8, Math.min(280, drag.dist * drag.d / two().d)); return;
      }
      var dx = p.x - drag.x, dy = p.y - drag.y; drag.x = p.x; drag.y = p.y;
      if (drag.m === 'orbit') {
        cam.yaw = (cam.yaw + dx * 0.45 + 360) % 360;
        cam.pitch = Math.max(5, Math.min(85, cam.pitch + dy * 0.35));
      } else if (drag.m === 'pan') {
        var ya = cam.yaw * D, k = cam.dist * 0.0022;
        cam.tx += (-dx * Math.cos(ya) + dy * Math.sin(ya)) * k;
        cam.ty += (-dx * Math.sin(ya) - dy * Math.cos(ya)) * k;
      } else if (drag.m === 'look') {
        fp.yaw = (fp.yaw + dx * 0.32 + 360) % 360;
        fp.pitch = Math.max(-55, Math.min(60, fp.pitch - dy * 0.25));
      }
    });
    function up(e) { delete ptrs[e.pointerId]; if (!Object.keys(ptrs).length) drag = null; }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (mode === 'walk') {
        var wy = fp.yaw * D, st = e.deltaY < 0 ? 2.5 : -2.5;
        fp.x += Math.sin(wy) * st; fp.y += Math.cos(wy) * st;
      } else {
        cam.dist = Math.max(8, Math.min(280, cam.dist * (e.deltaY < 0 ? 0.9 : 1.12)));
      }
    }, { passive: false });
  }

  function onKeyDown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { close(); return; }
    keys[e.code] = true; if (e.shiftKey) keys.Shift = true;
  }
  function onKeyUp(e) { keys[e.code] = false; if (!e.shiftKey) keys.Shift = false; }

  function build() {
    ensureCss();
    ov = document.createElement('div'); ov.className = 'gl3d hide';
    ov.innerHTML =
      '<div class="gltop">' +
        '<b class="glt">WEBGL 3D GPU CINEMA</b>' +
        '<button id="glOrbit" class="on">Orbit 360&deg; (85&deg;)</button>' +
        '<button id="glWalk">First-Person Walk</button>' +
        '<label>Sun <span id="glSunV">14:00</span><input type="range" id="glSun" min="7" max="17.5" step="0.25" value="14.2"></label>' +
        '<label>3D Boost <span id="glBoostV">1.2x</span><input type="range" id="glBoost" min="1" max="2.5" step="0.1" value="1.15"></label>' +
        '<select id="glFloor" title="Walk inside building floor">' +
          '<option value="0">Exterior Roofs</option><option value="1">Cutaway Floor 1</option><option value="2">Cutaway Floor 2</option><option value="3">Cutaway Floor 3</option>' +
        '</select>' +
        '<button id="glTheme">Theme: Print</button>' +
        '<button id="glRoutes" class="on">Routes</button>' +
        '<button id="glReset">Reset</button>' +
        '<button id="glSnap" class="cy">Shot PNG</button>' +
        '<span class="sp"></span>' +
        '<button id="glClose" class="on">Back to CAD Studio</button>' +
      '</div>' +
      '<div class="glstage">' +
        '<canvas id="glCv"></canvas>' +
        '<div id="glHud">Initializing WebGL 3D GPU...</div>' +
        '<div id="glPad">' +
          '<span></span><button data-k="KeyW">&#8593;</button><span></span>' +
          '<button data-k="KeyA">&#8592;</button><button data-k="KeyS">&#8595;</button><button data-k="KeyD">&#8594;</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    cv = ov.querySelector('#glCv');
    bind();

    ov.querySelector('#glOrbit').onclick = function () { mode = 'orbit'; syncUI(); };
    ov.querySelector('#glWalk').onclick = function () { mode = 'walk'; syncUI(); };
    ov.querySelector('#glSun').oninput = function () { sunHour = +this.value; syncUI(); };
    ov.querySelector('#glBoost').oninput = function () { zBoost = +this.value; dirtyMesh = true; syncUI(); };
    ov.querySelector('#glFloor').onchange = function () { jumpToBuilding(+this.value); };
    ov.querySelector('#glTheme').onclick = function () { theme = theme === 'print' ? 'cyber' : 'print'; dirtyMesh = true; syncUI(); };
    ov.querySelector('#glRoutes').onclick = function () { showRoutes = !showRoutes; dirtyMesh = true; syncUI(); };
    ov.querySelector('#glReset').onclick = resetCamera;
    ov.querySelector('#glSnap').onclick = function () {
      renderFrame(0);
      var a = document.createElement('a'); a.download = 'SOS_WebGL_3D.png'; a.href = cv.toDataURL('image/png'); a.click();
    };
    ov.querySelector('#glClose').onclick = close;
    [].forEach.call(ov.querySelectorAll('#glPad button'), function (b) {
      var k = b.dataset.k;
      b.onpointerdown = function () { keys[k] = true; };
      b.onpointerup = b.onpointerleave = b.onpointercancel = function () { keys[k] = false; };
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode); else window.addEventListener('resize', resize);
    built = true;
  }

  function open() {
    if (!(St.project.features || []).length) { alert('Import KML or load .sos.json first.'); return; }
    if (S.Engine) { theme = S.Engine.getTheme(); zBoost = S.Engine.getZBoost(); }
    if (!built) build();
    isOpen = true; dirtyMesh = true; keys = {}; ov.classList.remove('hide');
    ov.querySelector('#glBoost').value = zBoost;
    resize(); resetCamera(); syncUI();
    if (!gl || !prog) initGL();
    document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
    renderFrame(0);
    lastT = 0; rafId = requestAnimationFrame(loop);
  }
  function close() {
    isOpen = false; keys = {}; if (rafId) cancelAnimationFrame(rafId);
    if (ov) ov.classList.add('hide');
    document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp);
  }

  St.on('change', function () { dirtyMesh = true; });
  S.WebGL3D = { open: open, close: close, isOpen: function () { return isOpen; } };
})(window.SOS);
