window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, D = Math.PI / 180, MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', SANS = 'system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif';
  var ov, cv, lcv, lctx, gl, prog, loc = {}, bufPos, bufNorm, bufCol, bufMat;
  var gCount = 0, sCount = 0, tCount = 0, hasStencil = false, initErr = '';
  var isOpen = false, built = false, dirtyMesh = true, rafId = 0, lastT = 0;
  var mode = 'orbit', theme = 'print', sunHour = 14.2, zBoost = 1.15, showRoutes = true, showLabels = true, intFloor = 0;
  var cam = { tx: 0, ty: 0, tz: 2, dist: 95, yaw: 20, pitch: 52 };
  var fp = { x: 0, y: -25, z: 1.75, yaw: 0, pitch: 0 };
  var keys = {}, drag = null, ptrs = {}, W = 1, H = 1, dpr = 1;

  var VS_BODY =
    'attribute vec3 aPos;attribute vec3 aNorm;attribute vec3 aCol;attribute float aMat;' +
    'uniform mat4 uMVP;uniform vec3 uSunDir;uniform float uShadowPass;' +
    'varying vec3 vNorm;varying vec3 vCol;varying vec3 vWPos;varying float vMat;' +
    'void main(){vec3 p=aPos;' +
    'if(uShadowPass>0.5){float sz=max(0.22,uSunDir.z);p.x-=p.z*(uSunDir.x/sz);p.y-=p.z*(uSunDir.y/sz);p.z=0.04;}' +
    'vWPos=p;vNorm=aNorm;vCol=aCol;vMat=aMat;gl_Position=uMVP*vec4(p,1.0);}';

  var FS_BODY =
    'uniform vec3 uSunDir;uniform vec3 uCamPos;uniform vec3 uFogCol;uniform float uDark;uniform float uShadowPass;' +
    'varying vec3 vNorm;varying vec3 vCol;varying vec3 vWPos;varying float vMat;' +
    'float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'void main(){' +
    'if(uShadowPass>0.5){gl_FragColor=vec4(0.08,0.07,0.05,uDark>0.5?0.35:0.28);return;}' +
    'vec3 N=normalize(vNorm),L=normalize(uSunDir),V=normalize(uCamPos-vWPos),col=vCol;float sp=0.0,al=1.0;int m=int(vMat+0.5);' +
    'if(m==8){gl_FragColor=vec4(col,1.0);return;}' +
    'if(m==9){float u=abs(N.x)>abs(N.y)?vWPos.y:vWPos.x;float d1=abs(fract((u+vWPos.z)*2.4)-0.5),d2=abs(fract((u-vWPos.z)*2.4)-0.5);' +
    'float wire=(d1>0.36||d2>0.36)?1.0:0.0;gl_FragColor=vec4(mix(col*0.8,col,wire),wire>0.5?0.78:0.12);return;}' +
    'if(m==10){al=0.42;sp=0.55;}' +
    'if(m==11){gl_FragColor=vec4(col,uDark>0.5?0.34:0.16);return;}' +
    'if(m==1){col*=0.95+0.09*h2(floor(vWPos.xy*1.8));}' +
    'else if(m==2){if(abs(N.z)<0.5){float u=abs(N.x)>abs(N.y)?vWPos.y:vWPos.x,fy=fract(vWPos.z/3.2),wx=fract(u/2.5);' +
    'if(vWPos.z<0.35){col*=0.72;}else if(fy>0.28&&fy<0.74&&wx>0.22&&wx<0.78){col=uDark>0.5?vec3(0.05,0.55,0.78):vec3(0.24,0.48,0.74);sp=0.55;}' +
    'else if(fy<0.07){col*=0.82;}}else{col*=0.96+0.06*h2(floor(vWPos.xy*2.0));}}' +
    'else if(m==12){if(abs(N.z)<0.5){float u=abs(N.x)>abs(N.y)?vWPos.y:vWPos.x,fy=fract(vWPos.z/3.2),wx=fract(u/2.0);' +
    'if(fy>0.12&&fy<0.90&&wx>0.08&&wx<0.92){col=mix(col,vec3(0.22,0.56,0.82),0.65);sp=0.85;}else{col*=0.7;}}}' +
    'else if(m==3){col*=0.93+0.10*step(0.5,fract((vWPos.x+vWPos.y)*0.14));}' +
    'else if(m==4){col*=0.90+0.14*sin(vWPos.x*5.2+vWPos.y*5.2);}' +
    'else if(m==5){vec2 g=abs(fract(vWPos.xy*1.2)-0.5);if(g.x>0.45||g.y>0.45)col=vec3(0.75,0.86,0.98);sp=0.65;}' +
    'else if(m==6){col*=0.94+0.08*sin(vWPos.x*2.5+vWPos.y*2.5);sp=0.75;}' +
    'else if(m==7){if(abs(N.z)<0.5)col*=0.91+0.12*sin(vWPos.z*16.0);}' +
    'float ndl=max(dot(N,L),0.0);' +
    'vec3 sky=uDark>0.5?vec3(0.18,0.28,0.42):vec3(0.52,0.58,0.66),gnd=uDark>0.5?vec3(0.08,0.11,0.16):vec3(0.45,0.39,0.30);' +
    'vec3 sun=uDark>0.5?vec3(0.55,0.75,0.95):vec3(1.0,0.95,0.85);' +
    'vec3 lit=col*(mix(gnd,sky,N.z*0.5+0.5)*(uDark>0.5?0.65:0.55)+sun*ndl*(uDark>0.5?0.72:0.88));' +
    'if(sp>0.0&&ndl>0.0){vec3 H=normalize(L+V);lit+=sun*pow(max(dot(N,H),0.0),28.0)*sp;}' +
    'if(abs(N.z)<0.6&&m!=10)lit*=mix(0.76,1.0,smoothstep(0.0,0.85,vWPos.z));' +
    'float fog=clamp((length(uCamPos-vWPos)-140.0)/340.0,0.0,0.75);' +
    'gl_FragColor=vec4(mix(lit,uFogCol,fog),al);}';

  function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vNorm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function mPersp(fovy, asp, near, far) { var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far); return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]; }
  function mLookAt(eye, ctr, up) { var z = vNorm(vSub(eye, ctr)), x = vNorm(vCross(up, z)), y = vCross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -vDot(x, eye), -vDot(y, eye), -vDot(z, eye), 1]; }
  function mMul(a, b) {
    var o = new Float32Array(16), c, r;
    for (c = 0; c < 4; c++) for (r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function pack3(a, b, c) {
    var n1 = a.length, n2 = b.length, n3 = c.length, out = new Float32Array(n1 + n2 + n3), i;
    for (i = 0; i < n1; i++) out[i] = a[i];
    for (i = 0; i < n2; i++) out[n1 + i] = b[i];
    for (i = 0; i < n3; i++) out[n1 + n2 + i] = c[i];
    return out;
  }
  function hexRgb(hex) {
    if (!hex || hex[0] !== '#' || hex.length !== 7) return [0.7, 0.75, 0.8];
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function customCol(f, defHex) {
    var c = (f.color || '').toLowerCase();
    if (f.customStyled || (c && c !== '#39ff14' && c !== '#3b4c5e')) return hexRgb(f.color || defHex);
    return hexRgb(defHex);
  }
  function cen(a) { var x = 0, y = 0; a.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / (a.length || 1), y: y / (a.length || 1) }; }
  function bb(a) { var b = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; a.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }); return b; }
  function signedArea(a) { var s = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length]; s += a[i].x * q.y - q.x * a[i].y; } return s / 2; }
  function area(a) { return Math.abs(signedArea(a)); }
  function inP(x, y, a) { var r = false; for (var i = 0, j = a.length - 1; i < a.length; j = i++) if ((a[i].y > y) !== (a[j].y > y) && x < (a[j].x - a[i].x) * (y - a[i].y) / (a[j].y - a[i].y) + a[i].x) r = !r; return r; }
  function domAng(a) { var sx = 0, sy = 0; for (var i = 0; i < a.length; i++) { var q = a[(i + 1) % a.length], dx = q.x - a[i].x, dy = q.y - a[i].y, l = Math.hypot(dx, dy), t = Math.atan2(dy, dx); sx += l * Math.cos(2 * t); sy += l * Math.sin(2 * t); } return 0.5 * Math.atan2(sy, sx); }
  function featPts(f) {
    var r = (f.rotationDeg || 0) * D, c = Math.cos(r), n = Math.sin(r), m = f.center || { x: 0, y: 0 };
    return (f.coordsMetric || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); })
      .map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: m.x + dx * c - dy * n, y: m.y + dx * n + dy * c }; });
  }
  function hash(s) { s = String(s || 'x'); var v = 7; for (var i = 0; i < s.length; i++) v = (v * 31 + s.charCodeAt(i)) >>> 0; return v; }
  function triangulate(pts) {
    var cl = [], i;
    for (i = 0; i < pts.length; i++) if (!cl.length || Math.hypot(pts[i].x - cl[cl.length - 1].x, pts[i].y - cl[cl.length - 1].y) > 1e-4) cl.push(pts[i]);
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
        for (var j = 0; j < m; j++) { var k = idx[j]; if (k !== ia && k !== ib && k !== ic && inT(cl[k], a, b, c)) { ok = false; break; } }
        if (ok) { tris.push([a, b, c]); idx.splice(i, 1); found = true; break; }
      }
      if (!found) { tris.push([cl[idx[0]], cl[idx[1]], cl[idx[2]]]); idx.splice(1, 1); }
    }
    if (idx.length === 3) tris.push([cl[idx[0]], cl[idx[1]], cl[idx[2]]]);
    return tris;
  }

  function buildSceneMesh() {
    var bP = [[], [], []], bN = [[], [], []], bC = [[], [], []], bM = [[], [], []], dk = theme === 'cyber';
    function pushTri(bk, a, b, c, col, mat) {
      var n = vCross(vSub(b, a), vSub(c, a)), l = Math.hypot(n[0], n[1], n[2]);
      if (!isFinite(l) || l < 1e-7) return;
      n = [n[0] / l, n[1] / l, n[2] / l];
      bP[bk].push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      bN[bk].push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
      bC[bk].push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
      bM[bk].push(mat, mat, mat);
    }
    function quad(bk, a, b, c, d, col, mat) { pushTri(bk, a, b, c, col, mat); pushTri(bk, a, c, d, col, mat); }
    function flatPoly(bk, pts, z, col, mat) { triangulate(pts).forEach(function (t) { pushTri(bk, [t[0].x, t[0].y, z], [t[1].x, t[1].y, z], [t[2].x, t[2].y, z], col, mat); }); }
    function extrude3(bk, pts, z0, z1, col, mat, cap) {
      var a = signedArea(pts) < 0 ? pts.slice().reverse() : pts;
      for (var i = 0; i < a.length; i++) { var p = a[i], q = a[(i + 1) % a.length]; quad(bk, [p.x, p.y, z0], [q.x, q.y, z0], [q.x, q.y, z1], [p.x, p.y, z1], col, mat); }
      if (cap) flatPoly(bk, a, z1, col, mat);
    }
    function box3(bk, cx, cy, z0, w, d, h, ang, col, mat) {
      if (w < 0.02 || d < 0.02 || h < 0.02) return;
      var cs = Math.cos(ang), sn = Math.sin(ang);
      var cn = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(function (q) { return { x: cx + q[0] * cs - q[1] * sn, y: cy + q[0] * sn + q[1] * cs }; });
      extrude3(bk, cn, z0, z0 + h, col, mat, true);
    }
    function pyrRoof(bk, pts, z0, rise, col, mat) {
      var a = signedArea(pts) < 0 ? pts.slice().reverse() : pts, m = cen(a), ap = [m.x, m.y, z0 + rise];
      for (var i = 0; i < a.length; i++) { var p = a[i], q = a[(i + 1) % a.length]; pushTri(bk, [p.x, p.y, z0], [q.x, q.y, z0], ap, col, mat); }
    }
    function gabRoof(bk, cn, z0, rise, col, mat) {
      var r0 = [(cn[0].x + cn[3].x) / 2, (cn[0].y + cn[3].y) / 2, z0 + rise], r1 = [(cn[1].x + cn[2].x) / 2, (cn[1].y + cn[2].y) / 2, z0 + rise];
      quad(bk, [cn[0].x, cn[0].y, z0], [cn[1].x, cn[1].y, z0], r1, r0, col, mat);
      quad(bk, [cn[2].x, cn[2].y, z0], [cn[3].x, cn[3].y, z0], r0, r1, col, mat);
      pushTri(bk, [cn[3].x, cn[3].y, z0], [cn[0].x, cn[0].y, z0], r0, col, mat);
      pushTri(bk, [cn[1].x, cn[1].y, z0], [cn[2].x, cn[2].y, z0], r1, col, mat);
    }
    function archRoof(bk, a, z0, rise, col, mat) {
      var th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a), b = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
      function L(lx, ly, z) { return [m.x + lx * cs - ly * sn, m.y + lx * sn + ly * cs, z]; }
      var segs = 6, hw = (b.x1 - b.x0) / 2, hd = (b.y1 - b.y0) / 2, mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      for (var i = 0; i < segs; i++) {
        var a0 = (i / segs) * Math.PI, a1 = ((i + 1) / segs) * Math.PI;
        var y0 = my - Math.cos(a0) * hd, y1 = my - Math.cos(a1) * hd, zz0 = z0 + Math.sin(a0) * rise, zz1 = z0 + Math.sin(a1) * rise;
        quad(bk, L(mx - hw, y0, zz0), L(mx + hw, y0, zz0), L(mx + hw, y1, zz1), L(mx - hw, y1, zz1), col, mat);
      }
    }
    function dome3(bk, cx, cy, z0, rx, ry, rise, segs, rings, col, mat) {
      for (var r = 0; r < rings; r++) {
        var p0 = (r / rings) * (Math.PI / 2), p1 = ((r + 1) / rings) * (Math.PI / 2);
        var c0 = Math.cos(p0), s0 = Math.sin(p0), c1 = Math.cos(p1), s1 = Math.sin(p1);
        for (var i = 0; i < segs; i++) {
          var a0 = i / segs * 6.2832, a1 = (i + 1) / segs * 6.2832;
          var v00 = [cx + rx * c0 * Math.cos(a0), cy + ry * c0 * Math.sin(a0), z0 + rise * s0];
          var v10 = [cx + rx * c0 * Math.cos(a1), cy + ry * c0 * Math.sin(a1), z0 + rise * s0];
          if (r < rings - 1) {
            var v01 = [cx + rx * c1 * Math.cos(a0), cy + ry * c1 * Math.sin(a0), z0 + rise * s1];
            var v11 = [cx + rx * c1 * Math.cos(a1), cy + ry * c1 * Math.sin(a1), z0 + rise * s1];
            quad(bk, v00, v10, v11, v01, col, mat);
          } else {
            pushTri(bk, v00, v10, [cx, cy, z0 + rise], col, mat);
          }
        }
      }
    }
    function cyl3(bk, cx, cy, z0, h, rad, segs, col, mat) {
      for (var i = 0; i < segs; i++) {
        var a0 = i / segs * 6.2832, a1 = (i + 1) / segs * 6.2832;
        var x0 = cx + rad * Math.cos(a0), y0 = cy + rad * Math.sin(a0), x1 = cx + rad * Math.cos(a1), y1 = cy + rad * Math.sin(a1);
        quad(bk, [x0, y0, z0], [x1, y1, z0], [x1, y1, z0 + h], [x0, y0, z0 + h], col, mat);
        pushTri(bk, [cx, cy, z0 + h], [x0, y0, z0 + h], [x1, y1, z0 + h], col, mat);
      }
    }
    function drawTentUnit(cn, shape, wallCol, roofCol) {
      var m = cen(cn), b = bb(cn), rx = Math.max(1.2, (b.x1 - b.x0) / 2), ry = Math.max(1.2, (b.y1 - b.y0) / 2);
      if (shape === 'dome_round' || shape === 'dome_oct') {
        var segs = shape === 'dome_oct' ? 8 : 12, rad = Math.min(rx, ry), hW = 1.25 * zBoost, rH = 1.45 * zBoost;
        var ringPts = [];
        for (var i = 0; i < segs; i++) { var aa = i / segs * 6.2832; ringPts.push({ x: m.x + rad * Math.cos(aa), y: m.y + rad * Math.sin(aa) }); }
        extrude3(1, ringPts, 0, hW, wallCol, 0, false);
        dome3(1, m.x, m.y, hW, rad, rad, rH, segs, 4, roofCol, 0);
      } else if (shape === 'quonset') {
        extrude3(1, cn, 0, 0.8 * zBoost, wallCol, 0, false);
        archRoof(1, cn, 0.8 * zBoost, 1.5 * zBoost, roofCol, 0);
      } else if (shape === 'pyramid') {
        extrude3(1, cn, 0, 1.2 * zBoost, wallCol, 0, false);
        pyrRoof(1, cn, 1.2 * zBoost, 1.25 * zBoost, roofCol, 0);
      } else {
        extrude3(1, cn, 0, 1.2 * zBoost, wallCol, 0, false);
        gabRoof(1, cn, 1.2 * zBoost, 1.15 * zBoost, roofCol, 0);
      }
    }
    function drawFloodlight(x, y, hPole, lightCol, beamR) {
      var hh = Math.max(3, (hPole || 8) * zBoost), rad = Math.max(4, beamR || 13);
      cyl3(1, x, y, 0, hh, 0.14, 7, hexRgb('#475569'), 0);
      box3(1, x, y, hh, 1.1, 0.45, 0.4, 0, hexRgb('#1e293b'), 0);
      box3(1, x, y, hh - 0.1, 0.95, 0.35, 0.25, 0, lightCol, 8);
      var segs = 16;
      for (var i = 0; i < segs; i++) {
        var a0 = i / segs * 6.2832, a1 = (i + 1) / segs * 6.2832;
        pushTri(2, [x, y, 0.06], [x + rad * Math.cos(a0), y + rad * Math.sin(a0), 0.06], [x + rad * Math.cos(a1), y + rad * Math.sin(a1), 0.06], lightCol, 11);
      }
    }
    function drawMeshFence(a, mh) {
      var fh = Math.max(2.2, (mh || 3.0) * zBoost);
      for (var i = 0; i < a.length; i++) {
        var p0 = a[i], p1 = a[(i + 1) % a.length], L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (L < 0.1) continue;
        var ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        var posts = Math.min(40, Math.max(2, Math.round(L / 4.5)));
        for (var k = 0; k <= posts; k++) {
          var t = k / posts;
          cyl3(1, p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, 0, fh, 0.07, 5, hexRgb('#64748b'), 0);
        }
        box3(1, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, fh - 0.08, L, 0.08, 0.08, ang, hexRgb('#94a3b8'), 0);
        box3(1, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, fh * 0.5, L, 0.06, 0.06, ang, hexRgb('#94a3b8'), 0);
        quad(2, [p0.x, p0.y, 0.05], [p1.x, p1.y, 0.05], [p1.x, p1.y, fh], [p0.x, p0.y, fh], dk ? hexRgb('#00ff9d') : hexRgb('#475569'), 9);
      }
    }
    function tree3(x, y) {
      cyl3(1, x, y, 0, 2.0 * zBoost, 0.24, 6, hexRgb('#5c4028'), 0);
      cyl3(1, x, y, 1.8 * zBoost, 1.5 * zBoost, 1.55, 7, dk ? hexRgb('#2d6b2d') : hexRgb('#496e2e'), 4);
      cyl3(1, x + 0.35, y - 0.25, 2.5 * zBoost, 1.1 * zBoost, 1.15, 6, dk ? hexRgb('#3f8f2f') : hexRgb('#648d3f'), 4);
    }

    var fs = (St.project.features || []).filter(function (f) { return f.visible !== false; }), allPts = [];
    fs.forEach(function (f) { allPts = allPts.concat(featPts(f)); });
    var gb = allPts.length ? bb(allPts) : { x0: -60, x1: 60, y0: -60, y1: 60 }, gPad = 240;
    quad(0, [gb.x0 - gPad, gb.y0 - gPad, -0.04], [gb.x1 + gPad, gb.y0 - gPad, -0.04], [gb.x1 + gPad, gb.y1 + gPad, -0.04], [gb.x0 - gPad, gb.y1 + gPad, -0.04], dk ? hexRgb('#060d18') : hexRgb('#efe4cf'), 1);

    fs.forEach(function (f) {
      var cat = f.category, h = Math.max(0.2, (+f.height_m || 2.5) * zBoost), fl = Math.max(1, f.floors | 0);
      if (f.geometryType === 'point') {
        var p = (f.coordsMetric && f.coordsMetric[0]) || f.center;
        if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
        if (cat === 'assembly') { cyl3(0, p.x, p.y, 0.05, 0.14, 5.8, 20, hexRgb('#16a34a'), 0); cyl3(1, p.x, p.y, 0.14, 3.2 * zBoost, 0.18, 8, hexRgb('#ffffff'), 0); box3(1, p.x, p.y, 3.0 * zBoost, 1.6, 0.25, 1.2, 0, hexRgb('#22c55e'), 8); }
        else if (cat === 'vehicle') { var ang = (f.rotationDeg || 0) * D; box3(1, p.x, p.y, 0.2, 10, 2.5, 1.2 * zBoost, ang, hexRgb('#1e5aa8'), 0); box3(1, p.x, p.y, 0.2 + 1.2 * zBoost, 9.8, 2.45, 1.6 * zBoost, ang, hexRgb('#eef2f6'), 2); }
        else if (cat === 'tree') tree3(p.x, p.y);
        else if (cat === 'floodlight') drawFloodlight(p.x, p.y, +f.height_m || 8, hexRgb(f.color && f.color !== '#39ff14' ? f.color : '#fff3c4'), +f.lightRadius || 14);
        else if (cat === 'extinguisher') cyl3(1, p.x, p.y, 0, 1.0 * zBoost, 0.25, 8, hexRgb('#dc2626'), 8);
        return;
      }
      var a = featPts(f); if (a.length < 3) return;
      if (cat === 'fence') {
        flatPoly(0, a, 0.0, dk ? hexRgb('#0a1626') : hexRgb('#f1dbb0'), 1);
        var wH = Math.min(1.1, h * 0.42);
        for (var i = 0; i < a.length; i++) {
          var p0 = a[i], p1 = a[(i + 1) % a.length], L = Math.hypot(p1.x - p0.x, p1.y - p0.y); if (L < 0.05) continue;
          var angF = Math.atan2(p1.y - p0.y, p1.x - p0.x);
          box3(1, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, 0, L, 0.32, wH, angF, dk ? hexRgb('#162c44') : hexRgb('#cfc9be'), 0);
          var posts = Math.min(100, Math.max(1, Math.round(L / 6)));
          for (var k = 0; k < posts; k++) box3(1, p0.x + (p1.x - p0.x) * (k / posts), p0.y + (p1.y - p0.y) * (k / posts), wH, 0.14, 0.14, Math.max(0.5, h - wH), 0, dk ? hexRgb('#00ff9d') : hexRgb('#475569'), 0);
          box3(1, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, h - 0.1, L, 0.1, 0.1, angF, dk ? hexRgb('#00ff9d') : hexRgb('#475569'), 0);
        }
      } else if (cat === 'road') flatPoly(0, a, 0.02, dk ? hexRgb('#172a40') : hexRgb('#d4d0c8'), 1);
      else if (cat === 'yard' || cat === 'playground') {
        flatPoly(0, a, 0.02, cat === 'playground' ? (dk ? hexRgb('#2a2214') : hexRgb('#e6c789')) : (dk ? hexRgb('#102338') : hexRgb('#e8d0a2')), 1);
        if (f.meshFence) drawMeshFence(a, 2.5);
        if (f.fieldLights) a.slice(0, 4).forEach(function (cp) { drawFloodlight(cp.x, cp.y, 7.5, hexRgb('#fff3c4'), 12); });
      } else if (cat === 'parking') flatPoly(0, a, 0.025, dk ? hexRgb('#1b2e44') : hexRgb('#9ca3af'), 1);
      else if (cat === 'field') {
        flatPoly(0, a, 0.025, dk ? hexRgb('#14532d') : hexRgb('#3ca132'), 3);
        if (f.meshFence !== false) drawMeshFence(a, 3.0);
        if (f.fieldLights) {
          var step = Math.max(1, Math.floor(a.length / 4));
          for (var fi = 0; fi < 4 && fi * step < a.length; fi++) {
            var cp = a[fi * step];
            drawFloodlight(cp.x, cp.y, 9.5, hexRgb('#fff3c4'), 15);
          }
        }
      } else if (cat === 'olive_zone') {
        flatPoly(0, a, 0.015, dk ? hexRgb('#0e241b') : hexRgb('#ebd4a2'), 1);
        var ob = bb(a), cnt = Math.min(55, Math.max(5, (area(a) / 48) | 0)), sd = hash(f.id), tries = 0, pl = 0;
        while (pl < cnt && tries++ < cnt * 16) {
          sd = (sd * 1664525 + 1013904223) >>> 0; var rx = ob.x0 + sd / 4294967296 * (ob.x1 - ob.x0);
          sd = (sd * 1664525 + 1013904223) >>> 0; var ry = ob.y0 + sd / 4294967296 * (ob.y1 - ob.y0);
          if (inP(rx, ry, a)) { tree3(rx, ry); pl++; }
        }
      } else if (cat === 'solar') {
        var sb = bb(a);
        function zS(q) { return (0.6 + (q.y - sb.y0) / Math.max(1, sb.y1 - sb.y0) * 1.2) * zBoost; }
        triangulate(a).forEach(function (t) { pushTri(1, [t[0].x, t[0].y, zS(t[0])], [t[1].x, t[1].y, zS(t[1])], [t[2].x, t[2].y, zS(t[2])], hexRgb('#1d4482'), 5); });
        a.forEach(function (p) { cyl3(1, p.x, p.y, 0, zS(p), 0.1, 5, hexRgb('#64748b'), 0); });
      } else if (cat === 'pool') {
        var pCov = f.poolCover || 'arch', covCol = hexRgb(f.roofColor || '#e2f2fc');
        extrude3(1, a, 0, 0.5, hexRgb('#d9dfe6'), 0, false);
        flatPoly(0, a, 0.38, hexRgb('#1ca3e0'), 6);
        if (pCov === 'arch') {
          a.forEach(function (p) { cyl3(1, p.x, p.y, 0, 1.5 * zBoost, 0.12, 6, hexRgb('#475569'), 0); });
          archRoof(2, a, 1.4 * zBoost, 2.2 * zBoost, covCol, 10);
        } else if (pCov === 'sail') {
          a.forEach(function (p) { cyl3(1, p.x, p.y, 0, 2.8 * zBoost, 0.12, 6, hexRgb('#475569'), 0); });
          flatPoly(2, a, 2.75 * zBoost, covCol, 10);
        } else if (pCov === 'solid') {
          extrude3(1, a, 0.45, Math.max(2.8 * zBoost, h), customCol(f, '#d8dee6'), 2, false);
          archRoof(1, a, Math.max(2.8 * zBoost, h), 1.6 * zBoost, covCol, 4);
        }
      } else if (cat === 'hazard' || cat === 'diesel_tank') {
        var cmH = cen(a); flatPoly(0, a, 0.03, hexRgb('#cbd2d9'), 0);
        cyl3(1, cmH.x, cmH.y, 0.1, Math.min(2.6 * zBoost, h), Math.max(1.2, Math.sqrt(area(a)) * 0.32), 12, hexRgb('#e2e8f0'), 0);
      } else if (cat === 'tent') {
        var tShape = f.tentShape || (f.roofType === 'quonset' ? 'quonset' : f.roofType === 'dome' ? 'dome_round' : f.roofType === 'pyramid' ? 'pyramid' : 'gable');
        var tWall = customCol(f, '#f2f3f0'), tRoof = hexRgb(f.roofColor || '#ffffff');
        if ((f.renderMode || (area(a) > 45 ? 'auto' : 'solid')) === 'auto') {
          var u = 3.6, v = 3.6, px = 5.0, py = 5.0, th = domAng(a), cs = Math.cos(th), sn = Math.sin(th), m = cen(a), cntU = 0;
          function L2W(lx, ly) { return { x: m.x + lx * cs - ly * sn, y: m.y + lx * sn + ly * cs }; }
          var zb = bb(a.map(function (p) { var dx = p.x - m.x, dy = p.y - m.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; }));
          for (var zy = zb.y0 + v / 2 + 0.3; zy <= zb.y1 - v / 2 && cntU < 150; zy += py) {
            for (var zx = zb.x0 + u / 2 + 0.3; zx <= zb.x1 - u / 2 && cntU < 150; zx += px) {
              var cn = [[-u / 2, -v / 2], [u / 2, -v / 2], [u / 2, v / 2], [-u / 2, v / 2]].map(function (q) { return L2W(zx + q[0], zy + q[1]); });
              if (cn.every(function (q) { return inP(q.x, q.y, a); })) { cntU++; drawTentUnit(cn, tShape, tWall, tRoof); }
            }
          }
          if (!cntU) drawTentUnit(a, tShape, tWall, tRoof);
        } else {
          drawTentUnit(a, tShape, tWall, tRoof);
        }
      } else if (cat === 'cottage' && (f.renderMode || (area(a) > 45 ? 'auto' : 'solid')) === 'auto') {
        var cu = 4.0, cv2 = 3.2, cpx = 5.8, cpy = 5.4, cth = domAng(a), ccs = Math.cos(cth), csn = Math.sin(cth), cmc = cen(a), ccU = 0;
        var cwC = customCol(f, '#c88d55'), crC = hexRgb(f.roofColor || '#b26e38');
        function C2W(lx, ly) { return { x: cmc.x + lx * ccs - ly * csn, y: cmc.y + lx * csn + ly * ccs }; }
        var czb = bb(a.map(function (p) { var dx = p.x - cmc.x, dy = p.y - cmc.y; return { x: dx * ccs + dy * csn, y: -dx * csn + dy * ccs }; }));
        for (var czy = czb.y0 + cv2 / 2 + 0.3; czy <= czb.y1 - cv2 / 2 && ccU < 150; czy += cpy) {
          for (var czx = czb.x0 + cu / 2 + 0.3; czx <= czb.x1 - cu / 2 && ccU < 150; czx += cpx) {
            var ccn = [[-cu / 2, -cv2 / 2], [cu / 2, -cv2 / 2], [cu / 2, cv2 / 2], [-cu / 2, cv2 / 2]].map(function (q) { return C2W(czx + q[0], czy + q[1]); });
            if (ccn.every(function (q) { return inP(q.x, q.y, a); })) { ccU++; extrude3(1, ccn, 0, 2.2 * zBoost, cwC, 7, false); gabRoof(1, ccn, 2.2 * zBoost, 1.0 * zBoost, crC, 4); }
          }
        }
        if (!ccU) { extrude3(1, a, 0, 2.2 * zBoost, cwC, 7, false); pyrRoof(1, a, 2.2 * zBoost, 1.0 * zBoost, crC, 4); }
      } else if (cat === 'gate') {
        extrude3(1, a, 0, 1.6 * zBoost, customCol(f, '#dc2626'), 0, true);
      } else {
        var inter = St.project.interiors && St.project.interiors[f.id];
        if (intFloor > 0 && inter && inter.floors && inter.floors[String(intFloor)]) {
          var flH = 3.2 * zBoost, zB = (intFloor - 1) * flH, g = inter.floors[String(intFloor)], cmI = cen(a), angI = -(inter.alignAngleRad || 0), ci = Math.cos(angI), si = Math.sin(angI);
          function I2W(lx, ly) { return { x: cmI.x + lx * ci - ly * si, y: cmI.y + lx * si + ly * ci }; }
          flatPoly(0, a, zB + 0.04, hexRgb('#f1f5f9'), 0);
          extrude3(1, a, zB, zB + 0.9, customCol(f, '#cbd5e1'), 0, false);
          (g.rooms || []).forEach(function (rm) { flatPoly(0, [[-rm.w / 2, -rm.h / 2], [rm.w / 2, -rm.h / 2], [rm.w / 2, rm.h / 2], [-rm.w / 2, rm.h / 2]].map(function (q) { return I2W(rm.x + q[0], rm.y + q[1]); }), zB + 0.07, hexRgb('#dbeafe'), 0); });
          (g.walls || []).forEach(function (wl) { var p1 = I2W(wl.x1, wl.y1), p2 = I2W(wl.x2, wl.y2), L = Math.hypot(p2.x - p1.x, p2.y - p1.y); if (L > 0.1) box3(1, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, zB, L, 0.2, 2.5 * zBoost, Math.atan2(p2.y - p1.y, p2.x - p1.x), hexRgb('#94a3b8'), 0); });
          (g.items || []).forEach(function (it) {
            var wp = I2W(it.x, it.y), ia = angI + (it.rotationDeg || 0) * D;
            if (it.type === 'safe_haven') box3(0, wp.x, wp.y, zB + 0.08, it.w, it.h, 0.12, ia, hexRgb('#2563eb'), 8);
            else if (it.type === 'emergency_exit' || it.type === 'main_entrance') box3(1, wp.x, wp.y, zB, it.w, 0.25, 2.2 * zBoost, ia, hexRgb('#16a34a'), 8);
            else if (it.type === 'extinguisher') cyl3(1, wp.x, wp.y, zB, 0.9 * zBoost, 0.22, 8, hexRgb('#dc2626'), 8);
            else if (it.type === 'stairs') box3(1, wp.x, wp.y, zB, it.w, it.h, 1.4 * zBoost, ia, hexRgb('#64748b'), 0);
            else box3(1, wp.x, wp.y, zB, it.w, it.h, 0.85 * zBoost, ia, hexRgb('#b48a60'), 7);
          });
        } else {
          var defWall = cat === 'medical' ? '#ede9e1' : cat === 'security' ? '#dedbd4' : cat === 'cottage' ? '#c88d55' : (dk ? '#3b4c5e' : '#cfd7df');
          var rType = f.roofType || (cat === 'medical' || cat === 'security' ? 'red_tile' : 'flat');
          var defRoof = rType === 'red_tile' ? '#c93b32' : (cat === 'cottage' ? '#8e5325' : (dk ? '#52687f' : '#dfe5ec'));
          var wCol = customCol(f, defWall), rCol = hexRgb(f.roofColor || defRoof);
          var wMat = f.preset === 'glass_office' ? 12 : (cat === 'cottage' ? 7 : 2);
          var isFlat = rType === 'flat' || rType === 'flat_solar';
          extrude3(1, a, 0, h, wCol, wMat, isFlat);
          if (rType === 'red_tile' || rType === 'pyramid') {
            pyrRoof(1, a, h, Math.max(1.4, Math.min(3.4, Math.sqrt(area(a)) * 0.2)) * zBoost, rCol, rType === 'red_tile' ? 4 : 0);
          } else if (rType === 'gable') {
            var gth = domAng(a), gcs = Math.cos(gth), gsn = Math.sin(gth), gm = cen(a), gb2 = bb(a.map(function (p) { var dx = p.x - gm.x, dy = p.y - gm.y; return { x: dx * gcs + dy * gsn, y: -dx * gsn + dy * gcs }; }));
            var gcn = [[gb2.x0, gb2.y0], [gb2.x1, gb2.y0], [gb2.x1, gb2.y1], [gb2.x0, gb2.y1]].map(function (q) { return { x: gm.x + q[0] * gcs - q[1] * gsn, y: gm.y + q[0] * gsn + q[1] * gcs }; });
            gabRoof(1, gcn, h, Math.max(1.3, (gb2.y1 - gb2.y0) * 0.22) * zBoost, rCol, 4);
          } else if (rType === 'quonset') {
            archRoof(1, a, h, Math.max(1.5, Math.sqrt(area(a)) * 0.18) * zBoost, rCol, 4);
          } else if (rType === 'dome') {
            var dm = cen(a), db = bb(a);
            flatPoly(1, a, h, rCol, 0);
            dome3(1, dm.x, dm.y, h, (db.x1 - db.x0) * 0.44, (db.y1 - db.y0) * 0.44, Math.max(1.8, Math.min(db.x1 - db.x0, db.y1 - db.y0) * 0.35) * zBoost, 14, 5, rCol, 4);
          } else if (isFlat && area(a) > 45) {
            flatPoly(1, a, h + 0.02, rCol, 0);
            for (var pi = 0; pi < a.length; pi++) {
              var q0 = a[pi], q1 = a[(pi + 1) % a.length], Lp = Math.hypot(q1.x - q0.x, q1.y - q0.y);
              if (Lp > 0.05) box3(1, (q0.x + q1.x) / 2, (q0.y + q1.y) / 2, h, Lp, 0.35, 0.65 * zBoost, Math.atan2(q1.y - q0.y, q1.x - q0.x), rCol, 0);
            }
            if (rType === 'flat_solar' || (rType === 'flat' && fl >= 2 && f.preset !== 'glass_office')) {
              var thB = domAng(a), cB = Math.cos(thB), sB = Math.sin(thB), mB = cen(a);
              function B2W(lx, ly) { return { x: mB.x + lx * cB - ly * sB, y: mB.y + lx * sB + ly * cB }; }
              [-2.8, 2.8].forEach(function (ox) { var pS = B2W(ox, 0); if (inP(pS.x, pS.y, a)) box3(1, pS.x, pS.y, h + 0.15, 4.4, 3.0, 0.45, thB, hexRgb('#1e4682'), 5); });
              var pT = B2W(6.2, 2.8); if (inP(pT.x, pT.y, a)) cyl3(1, pT.x, pT.y, h + 0.05, 1.4 * zBoost, 0.65, 10, hexRgb('#f8fafc'), 0);
            }
          }
        }
      }
    });

    if (showRoutes && St.project.routes) {
      [['fire', '#22c55e', 0.45], ['shelling', '#00e5ff', 0.65]].forEach(function (pair) {
        var g = St.project.routes[pair[0]]; if (!g || !g.nodes || !g.edges) return;
        var rc = hexRgb(pair[1]), zR = pair[2];
        g.edges.forEach(function (e) {
          if (e.blocked) return;
          var a = g.nodes.filter(function (n) { return n.id === e.from; })[0], b = g.nodes.filter(function (n) { return n.id === e.to; })[0];
          if (!a || !b || a.blocked || b.blocked) return;
          var L = Math.hypot(b.x - a.x, b.y - a.y);
          if (L > 0.2) box3(0, (a.x + b.x) / 2, (a.y + b.y) / 2, zR, L, 0.65, 0.12, Math.atan2(b.y - a.y, b.x - a.x), rc, 8);
        });
      });
    }

    var allP = pack3(bP[0], bP[1], bP[2]), allN = pack3(bN[0], bN[1], bN[2]), allC = pack3(bC[0], bC[1], bC[2]), allM = pack3(bM[0], bM[1], bM[2]);
    gCount = Math.floor(bP[0].length / 3);
    sCount = Math.floor(bP[1].length / 3);
    tCount = Math.floor(bP[2].length / 3);
    var maxV = Math.floor(Math.min(allP.length / 3, allN.length / 3, allC.length / 3, allM.length));
    if (gCount + sCount + tCount > maxV) tCount = Math.max(0, maxV - gCount - sCount);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferData(gl.ARRAY_BUFFER, allP, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNorm); gl.bufferData(gl.ARRAY_BUFFER, allN, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufCol); gl.bufferData(gl.ARRAY_BUFFER, allC, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufMat); gl.bufferData(gl.ARRAY_BUFFER, allM, gl.STATIC_DRAW);
    dirtyMesh = false;
  }

  function drawLabels3D(mvp) {
    if (!lctx) return;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, H);
    if (!showLabels) return;
    var dk = theme === 'cyber', items = [], placed = [];
    (St.project.features || []).forEach(function (f) {
      if (f.visible === false || ['fence', 'road', 'yard', 'extinguisher', 'tree'].indexOf(f.category) >= 0) return;
      var txt = f.en_name || f.ar_name; if (!txt) return;
      var c = f.geometryType === 'point' ? ((f.coordsMetric && f.coordsMetric[0]) || f.center) : f.center;
      if (!c) return;
      var z = ((+f.height_m || 2.5) + (f.roofType === 'red_tile' || f.roofType === 'dome' ? 2.2 : 1.2)) * zBoost;
      var cx = mvp[0] * c.x + mvp[4] * c.y + mvp[8] * z + mvp[12];
      var cy = mvp[1] * c.x + mvp[5] * c.y + mvp[9] * z + mvp[13];
      var cz = mvp[2] * c.x + mvp[6] * c.y + mvp[10] * z + mvp[14];
      var cw = mvp[3] * c.x + mvp[7] * c.y + mvp[11] * z + mvp[15];
      if (cw <= 0.5) return;
      var nx = cx / cw, ny = cy / cw, nz = cz / cw;
      if (nz < -1 || nz > 1 || Math.abs(nx) > 1.02 || Math.abs(ny) > 1.02) return;
      items.push({ txt: txt, ar: f.ar_name && f.ar_name !== txt ? f.ar_name : '', x: (nx * 0.5 + 0.5) * W, y: (0.5 - ny * 0.5) * H, d: cw, cat: f.category });
    });
    items.sort(function (a, b) { return a.d - b.d; });
    lctx.font = 'bold 11px ' + SANS; lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
    items.forEach(function (it) {
      var label = it.ar ? (it.txt + ' • ' + it.ar) : it.txt;
      var tw = lctx.measureText(label).width + 14, th = 20, rx = it.x - tw / 2, ry = it.y - th - 4;
      for (var i = 0; i < placed.length; i++) {
        var q = placed[i];
        if (rx - 4 < q[0] + q[2] && rx + tw + 4 > q[0] && ry - 4 < q[1] + q[3] && ry + th + 4 > q[1]) return;
      }
      placed.push([rx, ry, tw, th]);
      lctx.fillStyle = dk ? 'rgba(6,13,24,0.88)' : 'rgba(255,255,255,0.92)';
      lctx.strokeStyle = it.cat === 'assembly' ? '#16a34a' : (it.cat === 'medical' ? '#dc2626' : (dk ? '#00ff9d' : '#1e3a5f'));
      lctx.lineWidth = 1.2;
      lctx.fillRect(rx, ry, tw, th); lctx.strokeRect(rx, ry, tw, th);
      lctx.fillStyle = dk ? '#d9ecff' : '#0f172a';
      lctx.fillText(label, it.x, ry + th / 2 + 0.5);
    });
  }

  function setHud(msg, isErr) {
    var hud = ov && ov.querySelector('#glHud'); if (!hud) return;
    hud.textContent = msg; hud.style.color = isErr ? '#ff4757' : '#00ff9d'; hud.style.borderColor = isErr ? '#ff4757' : '#1b3b57';
  }
  function initGL() {
    initErr = '';
    gl = cv.getContext('webgl', { antialias: true, stencil: true, preserveDrawingBuffer: true }) || cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (!gl) { initErr = 'WebGL not supported on this browser.'; setHud(initErr, true); return false; }
    hasStencil = !!(gl.getContextAttributes && gl.getContextAttributes().stencil);
    var fmtH = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    var prec = (fmtH && fmtH.precision > 0) ? 'precision highp float;\n' : 'precision mediump float;\n';
    function sh(type, src, label) {
      var s = gl.createShader(type); gl.shaderSource(s, prec + src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { initErr = label + ' shader error: ' + gl.getShaderInfoLog(s); return null; }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, VS_BODY, 'VS'), fs = sh(gl.FRAGMENT_SHADER, FS_BODY, 'FS');
    if (!vs || !fs) { setHud(initErr, true); return false; }
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { initErr = 'Link error: ' + gl.getProgramInfoLog(prog); setHud(initErr, true); return false; }
    gl.useProgram(prog);
    ['aPos', 'aNorm', 'aCol', 'aMat'].forEach(function (k) { loc[k] = gl.getAttribLocation(prog, k); if (loc[k] >= 0) gl.enableVertexAttribArray(loc[k]); });
    ['uMVP', 'uSunDir', 'uCamPos', 'uFogCol', 'uDark', 'uShadowPass'].forEach(function (k) { loc[k] = gl.getUniformLocation(prog, k); });
    bufPos = gl.createBuffer(); bufNorm = gl.createBuffer(); bufCol = gl.createBuffer(); bufMat = gl.createBuffer();
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  function renderFrame(dt) {
    if (!gl || !prog || initErr) return;
    var step = 'mesh';
    try {
      if (dirtyMesh) buildSceneMesh();
      step = 'cam';
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
        var oYaw = cam.yaw * D, pSpd = cam.dist * 0.55 * dt, ox = Math.sin(oYaw), oy = Math.cos(oYaw), rrx = Math.cos(oYaw), rry = -Math.sin(oYaw);
        if (keys.KeyW || keys.ArrowUp) { cam.tx -= ox * pSpd; cam.ty += oy * pSpd; }
        if (keys.KeyS || keys.ArrowDown) { cam.tx += ox * pSpd; cam.ty -= oy * pSpd; }
        if (keys.KeyD || keys.ArrowRight) { cam.tx += rrx * pSpd; cam.ty += rry * pSpd; }
        if (keys.KeyA || keys.ArrowLeft) { cam.tx -= rrx * pSpd; cam.ty -= rry * pSpd; }
        if (keys.KeyQ) cam.yaw = (cam.yaw - 65 * dt + 360) % 360;
        if (keys.KeyE) cam.yaw = (cam.yaw + 65 * dt) % 360;
      }

      var sT = Math.max(0.05, Math.min(0.95, (sunHour - 6) / 12)) * Math.PI;
      var sunDir = new Float32Array(vNorm([Math.cos(sT), -0.45, Math.max(0.24, Math.sin(sT) * 1.15)]));
      var dk = theme === 'cyber', fogArr = dk ? [0.025, 0.05, 0.095] : ((sunHour < 8 || sunHour > 16.5) ? [0.95, 0.80, 0.68] : [0.85, 0.90, 0.96]);
      var eye, ctr;
      if (mode === 'walk') {
        var wy = fp.yaw * D, wp = fp.pitch * D;
        eye = [fp.x, fp.y, fp.z]; ctr = [fp.x + Math.sin(wy) * Math.cos(wp), fp.y + Math.cos(wy) * Math.cos(wp), fp.z + Math.sin(wp)];
      } else {
        var ya = cam.yaw * D, el = (90 - cam.pitch) * D, horiz = cam.dist * Math.cos(el), vz = Math.max(1.2, cam.dist * Math.sin(el));
        eye = [cam.tx + horiz * Math.sin(ya), cam.ty - horiz * Math.cos(ya), cam.tz + vz]; ctr = [cam.tx, cam.ty, cam.tz];
      }
      var mvp = mMul(mPersp((mode === 'walk' ? 62 : 46) * D, W / Math.max(1, H), 0.35, 1400), mLookAt(eye, ctr, [0, 0, 1]));

      step = 'draw';
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(fogArr[0], fogArr[1], fogArr[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | (hasStencil ? gl.STENCIL_BUFFER_BIT : 0));
      gl.useProgram(prog);
      gl.uniformMatrix4fv(loc.uMVP, false, mvp);
      gl.uniform3fv(loc.uSunDir, sunDir);
      gl.uniform3fv(loc.uCamPos, new Float32Array(eye));
      gl.uniform3fv(loc.uFogCol, new Float32Array(fogArr));
      gl.uniform1f(loc.uDark, dk ? 1 : 0);

      if (loc.aPos >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0); }
      if (loc.aNorm >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bufNorm); gl.vertexAttribPointer(loc.aNorm, 3, gl.FLOAT, false, 0, 0); }
      if (loc.aCol >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bufCol); gl.vertexAttribPointer(loc.aCol, 3, gl.FLOAT, false, 0, 0); }
      if (loc.aMat >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, bufMat); gl.vertexAttribPointer(loc.aMat, 1, gl.FLOAT, false, 0, 0); }

      var opq = gCount + sCount;
      gl.disable(gl.STENCIL_TEST); gl.depthMask(true); gl.uniform1f(loc.uShadowPass, 0);
      if (opq > 0) gl.drawArrays(gl.TRIANGLES, 0, opq);
      if (sCount > 0 && hasStencil) {
        gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
        gl.depthMask(false); gl.uniform1f(loc.uShadowPass, 1); gl.drawArrays(gl.TRIANGLES, gCount, sCount);
        gl.disable(gl.STENCIL_TEST);
      }
      if (tCount > 0) {
        gl.depthMask(false); gl.uniform1f(loc.uShadowPass, 0); gl.drawArrays(gl.TRIANGLES, opq, tCount);
      }
      gl.depthMask(true);

      step = 'labels';
      drawLabels3D(mvp);

      setHud(mode === 'walk'
        ? ('AJ-GeoCAD WALK | X ' + fp.x.toFixed(1) + ' Y ' + fp.y.toFixed(1) + ' Z ' + fp.z.toFixed(1) + 'm | WASD=Walk | Drag=Look 360° | R/F=Height')
        : ('AJ-GeoCAD GPU | Orbit ' + Math.round(cam.yaw) + '° | Tilt ' + Math.round(cam.pitch) + '° | Tris ' + Math.round((opq + tCount) / 3) + ' | Drag=Orbit | Pinch/Wheel=Zoom'), false);
    } catch (err) {
      setHud('WebGL3D [' + step + '] Error: ' + (err && err.message ? err.message : String(err)), true);
    }
  }

  function loop(ts) { if (!isOpen) return; var dt = Math.min(0.08, (ts - (lastT || ts)) / 1000); lastT = ts; renderFrame(dt); rafId = requestAnimationFrame(loop); }
  function resetCamera() {
    var fs = St.project.features || [], all = []; fs.forEach(function (f) { all = all.concat(featPts(f)); });
    var b = all.length ? bb(all) : { x0: -40, x1: 40, y0: -40, y1: 40 }, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    cam.tx = cx; cam.ty = cy; cam.tz = 2; cam.dist = Math.max(35, Math.hypot(b.x1 - b.x0, b.y1 - b.y0)) * 0.95;
    cam.yaw = St.project.meta.trueNorthOffsetDeg || 0; cam.pitch = 52;
    fp.x = cx; fp.y = b.y0 + 6; fp.z = 1.75; fp.yaw = 0; fp.pitch = 0;
  }
  function jumpToBuilding(fl) {
    intFloor = fl; dirtyMesh = true;
    var bld = (St.project.features || []).filter(function (f) { return St.project.interiors && St.project.interiors[f.id]; })[0];
    if (bld && fl > 0) { fp.x = bld.center.x; fp.y = bld.center.y - 2; fp.z = (fl - 1) * 3.2 * zBoost + 1.65; cam.tx = bld.center.x; cam.ty = bld.center.y; cam.tz = (fl - 1) * 3.2 * zBoost + 1; cam.dist = 26; }
    else if (fl === 0) fp.z = 1.75;
    syncUI();
  }
  function ensureCss() {
    if (document.getElementById('sos-webgl-css')) return;
    var st = document.createElement('style'); st.id = 'sos-webgl-css';
    st.textContent =
      '.gl3d{position:fixed;inset:0;z-index:940;background:#060d18;color:#d9ecff;display:flex;flex-direction:column;font-family:' + MONO + '}.gl3d.hide{display:none}' +
      '.gltop{display:flex;align-items:center;gap:6px;padding:6px 10px;background:linear-gradient(180deg,#0c1c30,#07111f);border-bottom:1px solid #1b3b57;overflow-x:auto;flex-shrink:0}' +
      '.glt{background:linear-gradient(90deg,#00b4d8,#00ff9d);-webkit-background-clip:text;background-clip:text;color:transparent;font-size:12px;font-weight:800;letter-spacing:.6px;white-space:nowrap;margin-right:4px}' +
      '.gl3d button,.gl3d select{font-family:' + MONO + ';font-size:11px;background:#040911;color:#d9ecff;border:1px solid #1b3b57;border-radius:4px;padding:5px 8px;cursor:pointer;white-space:nowrap}' +
      '.gl3d button.on{border-color:#00ff9d;color:#00ff9d;background:rgba(0,255,157,.12);box-shadow:0 0 8px rgba(0,255,157,.22)}' +
      '.gl3d button.cy{border-color:#00e5ff;color:#00e5ff;background:rgba(0,229,255,.12)}' +
      '.gl3d label{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#7f9bb5;white-space:nowrap}.gl3d input[type=range]{width:70px;accent-color:#00ff9d}.gl3d .sp{flex:1;min-width:6px}' +
      '.glstage{flex:1;position:relative;min-height:0;overflow:hidden}#glCv,#glLbl{position:absolute;inset:0;width:100%;height:100%;display:block}#glCv{touch-action:none}#glLbl{pointer-events:none}' +
      '#glHud{position:absolute;bottom:10px;left:10px;background:rgba(6,13,24,.9);border:1px solid #1b3b57;border-radius:4px;padding:5px 9px;font-size:10px;color:#00ff9d;pointer-events:none;max-width:calc(100% - 20px)}' +
      '#glPad{position:absolute;bottom:44px;right:14px;display:none;grid-template-columns:repeat(3,40px);gap:4px}#glPad.show{display:grid}#glPad button{height:40px;font-size:15px;font-weight:bold;background:rgba(10,22,38,.88)}';
    document.head.appendChild(st);
  }
  function syncUI() {
    if (!ov) return;
    ov.querySelector('#glOrbit').className = mode === 'orbit' ? 'on' : '';
    ov.querySelector('#glWalk').className = mode === 'walk' ? 'cy' : '';
    ov.querySelector('#glTheme').textContent = 'Map: ' + (theme === 'print' ? 'Daylight' : 'Night');
    ov.querySelector('#glLblBtn').textContent = 'Labels: ' + (showLabels ? 'ON' : 'OFF');
    ov.querySelector('#glLblBtn').className = showLabels ? 'on' : '';
    ov.querySelector('#glRoutes').className = showRoutes ? 'on' : '';
    ov.querySelector('#glSunV').textContent = Math.floor(sunHour) + ':00';
    ov.querySelector('#glBoostV').textContent = zBoost.toFixed(1) + 'x';
    ov.querySelector('#glFloor').value = String(intFloor);
    ov.querySelector('#glPad').classList.toggle('show', mode === 'walk');
  }
  function resize() {
    if (!cv) return;
    var r = cv.parentNode.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (lcv) { lcv.width = cv.width; lcv.height = cv.height; }
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
      if (drag.m === 'pinch' && Object.keys(ptrs).length >= 2) { cam.dist = Math.max(8, Math.min(280, drag.dist * drag.d / two().d)); return; }
      var dx = p.x - drag.x, dy = p.y - drag.y; drag.x = p.x; drag.y = p.y;
      if (drag.m === 'orbit') { cam.yaw = (cam.yaw + dx * 0.45 + 360) % 360; cam.pitch = Math.max(5, Math.min(85, cam.pitch + dy * 0.35)); }
      else if (drag.m === 'pan') { var ya = cam.yaw * D, k = cam.dist * 0.0022; cam.tx += (-dx * Math.cos(ya) + dy * Math.sin(ya)) * k; cam.ty += (-dx * Math.sin(ya) - dy * Math.cos(ya)) * k; }
      else if (drag.m === 'look') { fp.yaw = (fp.yaw + dx * 0.32 + 360) % 360; fp.pitch = Math.max(-55, Math.min(60, fp.pitch - dy * 0.25)); }
    });
    function up(e) { delete ptrs[e.pointerId]; if (!Object.keys(ptrs).length) drag = null; }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (mode === 'walk') { var wy = fp.yaw * D, st = e.deltaY < 0 ? 2.5 : -2.5; fp.x += Math.sin(wy) * st; fp.y += Math.cos(wy) * st; }
      else cam.dist = Math.max(8, Math.min(280, cam.dist * (e.deltaY < 0 ? 0.9 : 1.12)));
    }, { passive: false });
  }
  function onKeyDown(e) { if (!isOpen) return; if (e.key === 'Escape') { close(); return; } keys[e.code] = true; if (e.shiftKey) keys.Shift = true; }
  function onKeyUp(e) { keys[e.code] = false; if (!e.shiftKey) keys.Shift = false; }

  function build() {
    ensureCss();
    ov = document.createElement('div'); ov.className = 'gl3d hide';
    ov.innerHTML =
      '<div class="gltop"><b class="glt">AJ-GeoCAD GPU 3D</b>' +
      '<button id="glOrbit" class="on">Orbit 360&deg;</button><button id="glWalk">Walk</button>' +
      '<label>Sun <span id="glSunV">14:00</span><input type="range" id="glSun" min="7" max="17.5" step="0.25" value="14.2"></label>' +
      '<label>Boost <span id="glBoostV">1.2x</span><input type="range" id="glBoost" min="1" max="2.5" step="0.1" value="1.15"></label>' +
      '<select id="glFloor"><option value="0">Exterior Roofs</option><option value="1">Floor 1</option><option value="2">Floor 2</option><option value="3">Floor 3</option></select>' +
      '<button id="glTheme">Map: Daylight</button><button id="glLblBtn" class="on">Labels: ON</button><button id="glRoutes" class="on">Routes</button>' +
      '<button id="glReset">Reset</button><button id="glSnap" class="cy">Shot PNG</button>' +
      '<span class="sp"></span><button id="glClose" class="on">Back</button></div>' +
      '<div class="glstage"><canvas id="glCv"></canvas><canvas id="glLbl"></canvas><div id="glHud">Loading WebGL...</div>' +
      '<div id="glPad"><span></span><button data-k="KeyW">&#8593;</button><span></span><button data-k="KeyA">&#8592;</button><button data-k="KeyS">&#8595;</button><button data-k="KeyD">&#8594;</button></div></div>';
    document.body.appendChild(ov);
    cv = ov.querySelector('#glCv'); lcv = ov.querySelector('#glLbl'); lctx = lcv.getContext('2d'); bind();
    ov.querySelector('#glOrbit').onclick = function () { mode = 'orbit'; syncUI(); };
    ov.querySelector('#glWalk').onclick = function () { mode = 'walk'; syncUI(); };
    ov.querySelector('#glSun').oninput = function () { sunHour = +this.value; syncUI(); };
    ov.querySelector('#glBoost').oninput = function () { zBoost = +this.value; dirtyMesh = true; syncUI(); };
    ov.querySelector('#glFloor').onchange = function () { jumpToBuilding(+this.value); };
    ov.querySelector('#glTheme').onclick = function () { theme = theme === 'print' ? 'cyber' : 'print'; dirtyMesh = true; syncUI(); };
    ov.querySelector('#glLblBtn').onclick = function () { showLabels = !showLabels; syncUI(); };
    ov.querySelector('#glRoutes').onclick = function () { showRoutes = !showRoutes; dirtyMesh = true; syncUI(); };
    ov.querySelector('#glReset').onclick = resetCamera;
    ov.querySelector('#glSnap').onclick = function () {
      renderFrame(0);
      var out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
      var octx = out.getContext('2d'); octx.drawImage(cv, 0, 0); if (showLabels && lcv) octx.drawImage(lcv, 0, 0);
      var a = document.createElement('a'); a.download = 'AJ_GeoCAD_3D.png'; a.href = out.toDataURL('image/png'); a.click();
    };
    ov.querySelector('#glClose').onclick = close;
    [].forEach.call(ov.querySelectorAll('#glPad button'), function (b) { var k = b.dataset.k; b.onpointerdown = function () { keys[k] = true; }; b.onpointerup = b.onpointerleave = b.onpointercancel = function () { keys[k] = false; }; });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentNode); else window.addEventListener('resize', resize);
    built = true;
  }
  function open() {
    if (!(St.project.features || []).length) { alert('Import KML or load project JSON first.'); return; }
    if (S.Engine) { theme = S.Engine.getTheme(); zBoost = S.Engine.getZBoost(); }
    if (!built) build();
    isOpen = true; dirtyMesh = true; keys = {}; ov.classList.remove('hide'); ov.querySelector('#glBoost').value = zBoost;
    resize(); resetCamera(); syncUI(); if (!gl || !prog) initGL();
    document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
    renderFrame(0); lastT = 0; rafId = requestAnimationFrame(loop);
  }
  function close() { isOpen = false; keys = {}; if (rafId) cancelAnimationFrame(rafId); if (ov) ov.classList.add('hide'); document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp); }
  St.on('change', function () { dirtyMesh = true; });
  S.WebGL3D = { open: open, close: close, isOpen: function () { return isOpen; } };
})(window.SOS);
