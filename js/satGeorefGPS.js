window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var WGS84_A = 6378137.0;
  var WGS84_F = 1 / 298.257223563;
  var WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;
  var WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);
  var UTM_K0 = 0.9996;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // =========================================================================
  // 1. LINEAR ALGEBRA & MATRIX HELPERS (PARTIAL PIVOTING — NUMERICALLY SAFE)
  // =========================================================================
  function solveLinearSystem(A, b) {
    var n = b.length;
    var M = new Array(n);
    for (var i = 0; i < n; i++) {
      M[i] = A[i].slice();
      M[i].push(b[i]);
    }
    for (var col = 0; col < n; col++) {
      var piv = col;
      var maxAbs = Math.abs(M[col][col]);
      for (var r = col + 1; r < n; r++) {
        var v = Math.abs(M[r][col]);
        if (v > maxAbs) { maxAbs = v; piv = r; }
      }
      if (maxAbs < 1e-12 || !isFinite(maxAbs)) return null;
      if (piv !== col) {
        var tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      }
      var div = M[col][col];
      for (var j = col; j <= n; j++) M[col][j] /= div;
      for (var row = 0; row < n; row++) {
        if (row === col) continue;
        var f = M[row][col];
        if (Math.abs(f) < 1e-15) continue;
        for (var c = col; c <= n; c++) M[row][c] -= f * M[col][c];
      }
    }
    var out = new Array(n);
    for (var k = 0; k < n; k++) {
      if (!isFinite(M[k][n])) return null;
      out[k] = M[k][n];
    }
    return out;
  }

  function mul3(A, B) {
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
      }
    }
    return C;
  }

  function inv3(M) {
    var a = M[0][0], b = M[0][1], c = M[0][2];
    var d = M[1][0], e = M[1][1], f = M[1][2];
    var g = M[2][0], h = M[2][1], i = M[2][2];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    var D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
    var G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
    var det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-14 || !isFinite(det)) return null;
    var invDet = 1 / det;
    return [
      [A * invDet, D * invDet, G * invDet],
      [B * invDet, E * invDet, H * invDet],
      [C * invDet, F * invDet, I * invDet]
    ];
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    var dLat = (lat2 - lat1) * DEG;
    var dLon = (lon2 - lon1) * DEG;
    var s1 = Math.sin(dLat / 2), s2 = Math.sin(dLon / 2);
    var a = s1 * s1 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * s2 * s2;
    return 2 * 6371008.8 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }

  // =========================================================================
  // 2. COORDINATE CONVERTERS (WGS84 DD / DMS / UTM / EPSG:3857) + SMART PARSER
  // =========================================================================
  function ddToDms(val, isLat) {
    var hemi = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
    var abs = Math.abs(val);
    var d = Math.floor(abs);
    var mFloat = (abs - d) * 60;
    var m = Math.floor(mFloat);
    var s = (mFloat - m) * 60;
    if (s >= 59.995) { s = 0; m += 1; }
    if (m >= 60) { m = 0; d += 1; }
    return d + '°' + String(m).padStart(2, '0') + "'" + s.toFixed(2).padStart(5, '0') + '"' + hemi;
  }

  function latLonToUTM(lat, lon) {
    var zone = Math.floor((lon + 180) / 6) + 1;
    var lon0 = ((zone - 1) * 6 - 180 + 3) * DEG;
    var phi = lat * DEG;
    var lam = lon * DEG;
    var sinP = Math.sin(phi), cosP = Math.cos(phi), tanP = Math.tan(phi);
    var N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinP * sinP);
    var T = tanP * tanP;
    var C = WGS84_EP2 * cosP * cosP;
    var A = cosP * (lam - lon0);
    var e2 = WGS84_E2, e4 = e2 * e2, e6 = e4 * e2;
    var M = WGS84_A * (
      (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi -
      (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi) +
      (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) -
      (35 * e6 / 3072) * Math.sin(6 * phi)
    );
    var easting = UTM_K0 * N * (
      A + (1 - T + C) * Math.pow(A, 3) / 6 +
      (5 - 18 * T + T * T + 72 * C - 58 * WGS84_EP2) * Math.pow(A, 5) / 120
    ) + 500000.0;
    var northing = UTM_K0 * (
      M + N * tanP * (
        A * A / 2 +
        (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 +
        (61 - 58 * T + T * T + 600 * C - 330 * WGS84_EP2) * Math.pow(A, 6) / 720
      )
    );
    var hemi = lat >= 0 ? 'N' : 'S';
    if (lat < 0) northing += 10000000.0;
    return { zone: zone, hemi: hemi, easting: easting, northing: northing };
  }

  function utmToLatLon(zone, hemi, easting, northing) {
    var x = easting - 500000.0;
    var y = (String(hemi).toUpperCase() === 'S') ? (northing - 10000000.0) : northing;
    var lon0 = ((zone - 1) * 6 - 180 + 3) * DEG;
    var e2 = WGS84_E2, e4 = e2 * e2, e6 = e4 * e2;
    var M = y / UTM_K0;
    var mu = M / (WGS84_A * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var e1_2 = e1 * e1, e1_3 = e1_2 * e1, e1_4 = e1_2 * e1_2;
    var phi1 = mu +
      (3 * e1 / 2 - 27 * e1_3 / 32) * Math.sin(2 * mu) +
      (21 * e1_2 / 16 - 55 * e1_4 / 32) * Math.sin(4 * mu) +
      (151 * e1_3 / 96) * Math.sin(6 * mu) +
      (1097 * e1_4 / 512) * Math.sin(8 * mu);
    var sin1 = Math.sin(phi1), cos1 = Math.cos(phi1), tan1 = Math.tan(phi1);
    var N1 = WGS84_A / Math.sqrt(1 - e2 * sin1 * sin1);
    var T1 = tan1 * tan1;
    var C1 = WGS84_EP2 * cos1 * cos1;
    var R1 = WGS84_A * (1 - e2) / Math.pow(1 - e2 * sin1 * sin1, 1.5);
    var D = x / (N1 * UTM_K0);
    var lat = phi1 - (N1 * tan1 / R1) * (
      D * D / 2 -
      (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * WGS84_EP2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * WGS84_EP2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
    );
    var lon = lon0 + (
      D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * WGS84_EP2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / cos1;
    return { lat: lat * RAD, lon: lon * RAD };
  }

  function latLonToWebMercator(lat, lon) {
    var clampedLat = clamp(lat, -85.05112878, 85.05112878);
    var x = lon * WGS84_A * DEG;
    var y = Math.log(Math.tan((90 + clampedLat) * DEG / 2)) * WGS84_A;
    return { x: x, y: y };
  }

  function webMercatorToLatLon(x, y) {
    var lon = (x / WGS84_A) * RAD;
    var lat = (2 * Math.atan(Math.exp(y / WGS84_A)) - Math.PI / 2) * RAD;
    return { lat: lat, lon: lon };
  }

  function normalizeArabicDigits(str) {
    return String(str || '').replace(/[٠-٩]/g, function (d) {
      return String(d.charCodeAt(0) - 1632);
    }).replace(/[۰-۹]/g, function (d) {
      return String(d.charCodeAt(0) - 1776);
    }).replace(/،/g, ',');
  }

  function parseSmartCoords(rawInput) {
    var s = normalizeArabicDigits(rawInput).trim();
    if (!s) return null;

    // 1. Google Maps URL patterns: @lat,lon | !3dlat!4dlon | q=lat,lon
    var g3d = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (g3d) return { lat: parseFloat(g3d[1]), lon: parseFloat(g3d[2]), format: 'GMaps URL' };
    var gAt = s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (gAt) return { lat: parseFloat(gAt[1]), lon: parseFloat(gAt[2]), format: 'GMaps @URL' };
    var gQ = s.match(/[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/i);
    if (gQ) return { lat: parseFloat(gQ[1]), lon: parseFloat(gQ[2]), format: 'Maps Link' };

    // 2. UTM string: e.g. "36N 622100 3469200" or "36R 622100.5, 3469200.2"
    var utmM = s.match(/^(\d{1,2})\s*([C-X])\s+(\d{5,7}(?:\.\d+)?)[,\s]+(\d{6,8}(?:\.\d+)?)$/i);
    if (utmM) {
      var z = parseInt(utmM[1], 10);
      var band = utmM[2].toUpperCase();
      var hemi = band >= 'N' ? 'N' : 'S';
      var ll = utmToLatLon(z, hemi, parseFloat(utmM[3]), parseFloat(utmM[4]));
      if (isFinite(ll.lat) && isFinite(ll.lon)) return { lat: ll.lat, lon: ll.lon, format: 'UTM ' + z + hemi };
    }

    // 3. DMS string: e.g. 31°21'04.5"N 34°17'04.2"E
    var dmsRe = /(\d{1,3})\s*[°d]\s*(\d{1,2})\s*['′m]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″s])?\s*([NSEW])/gi;
    var dmsMatches = [];
    var m;
    while ((m = dmsRe.exec(s)) !== null) {
      var dd = parseFloat(m[1]) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600;
      var h = m[4].toUpperCase();
      if (h === 'S' || h === 'W') dd = -dd;
      dmsMatches.push({ val: dd, h: h });
    }
    if (dmsMatches.length >= 2) {
      var latV = (dmsMatches[0].h === 'N' || dmsMatches[0].h === 'S') ? dmsMatches[0].val : dmsMatches[1].val;
      var lonV = (dmsMatches[0].h === 'E' || dmsMatches[0].h === 'W') ? dmsMatches[0].val : dmsMatches[1].val;
      if (Math.abs(latV) <= 90 && Math.abs(lonV) <= 180) return { lat: latV, lon: lonV, format: 'DMS' };
    }

    // 4. Plain Decimal Degrees: "31.351234, 34.284567" or "31.351234 34.284567"
    var ddM = s.match(/(-?\d{1,3}(?:\.\d+)?)\s*([NS])?\s*[,;\s]+\s*(-?\d{1,3}(?:\.\d+)?)\s*([EW])?/i);
    if (ddM) {
      var la = parseFloat(ddM[1]), lo = parseFloat(ddM[3]);
      if (ddM[2] && ddM[2].toUpperCase() === 'S') la = -Math.abs(la);
      if (ddM[4] && ddM[4].toUpperCase() === 'W') lo = -Math.abs(lo);
      if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lon: lo, format: 'WGS84 DD' };
    }
    return null;
  }

  function formatCoords(lat, lon, sys) {
    if (!isFinite(lat) || !isFinite(lon)) return '--';
    var mode = sys || 'dd';
    if (mode === 'dms') return ddToDms(lat, true) + ' , ' + ddToDms(lon, false);
    if (mode === 'utm') {
      var u = latLonToUTM(lat, lon);
      return 'UTM ' + u.zone + u.hemi + ' E:' + u.easting.toFixed(1) + ' N:' + u.northing.toFixed(1);
    }
    if (mode === 'mercator') {
      var wm = latLonToWebMercator(lat, lon);
      return '3857 X:' + wm.x.toFixed(1) + ' Y:' + wm.y.toFixed(1);
    }
    return lat.toFixed(6) + ', ' + lon.toFixed(6);
  }

  // =========================================================================
  // 3. 4-MODEL GEOREFERENCING SOLVER (SHIFT / SIMILARITY / AFFINE / HOMOGRAPHY)
  // =========================================================================
  function isCollinearMetric(pts) {
    if (pts.length < 3) return true;
    var p0 = pts[0], maxArea2 = 0, maxSpan = 0;
    for (var i = 1; i < pts.length; i++) {
      var d = Math.hypot(pts[i].e - p0.e, pts[i].n - p0.n);
      if (d > maxSpan) maxSpan = d;
      for (var j = i + 1; j < pts.length; j++) {
        var area2 = Math.abs((pts[i].e - p0.e) * (pts[j].n - p0.n) - (pts[j].e - p0.e) * (pts[i].n - p0.n));
        if (area2 > maxArea2) maxArea2 = area2;
      }
    }
    return maxSpan < 1e-3 || (maxArea2 / (maxSpan * maxSpan)) < 0.005;
  }

  function solveHomographyMatrix(pts) {
    // Hartley normalization for numerical stability
    var n = pts.length;
    var me = 0, mn = 0, mx = 0, my = 0;
    for (var i = 0; i < n; i++) { me += pts[i].e; mn += pts[i].n; mx += pts[i].x; my += pts[i].y; }
    me /= n; mn /= n; mx /= n; my /= n;
    var se = 0, sx = 0;
    for (var j = 0; j < n; j++) {
      se += Math.hypot(pts[j].e - me, pts[j].n - mn);
      sx += Math.hypot(pts[j].x - mx, pts[j].y - my);
    }
    se = (se / n) / Math.SQRT2;
    sx = (sx / n) / Math.SQRT2;
    if (se < 1e-6 || sx < 1e-6) return null;

    var ATA = [];
    var ATb = new Array(8).fill(0);
    for (var r = 0; r < 8; r++) ATA.push(new Array(8).fill(0));

    function accumRow(row, rhs) {
      for (var a = 0; a < 8; a++) {
        ATb[a] += row[a] * rhs;
        for (var b = 0; b < 8; b++) ATA[a][b] += row[a] * row[b];
      }
    }

    for (var k = 0; k < n; k++) {
      var u = (pts[k].e - me) / se;
      var v = (pts[k].n - mn) / se;
      var x = (pts[k].x - mx) / sx;
      var y = (pts[k].y - my) / sx;
      accumRow([u, v, 1, 0, 0, 0, -u * x, -v * x], x);
      accumRow([0, 0, 0, u, v, 1, -u * y, -v * y], y);
    }

    var h = solveLinearSystem(ATA, ATb);
    if (!h) return null;

    var Hnorm = [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1]
    ];
    var Ten = [
      [1 / se, 0, -me / se],
      [0, 1 / se, -mn / se],
      [0, 0, 1]
    ];
    var TxyInv = [
      [sx, 0, mx],
      [0, sx, my],
      [0, 0, 1]
    ];
    var H = mul3(TxyInv, mul3(Hnorm, Ten));
    if (Math.abs(H[2][2]) > 1e-12) {
      var div = H[2][2];
      for (var ri = 0; ri < 3; ri++) for (var ci = 0; ci < 3; ci++) H[ri][ci] /= div;
    }
    var Hinv = inv3(H);
    if (!Hinv) return null;
    return { H: H, Hinv: Hinv };
  }

  function solveGeoref(gcps, opts) {
    opts = opts || {};
    var requested = opts.modelType || 'auto';
    var active = (gcps || []).filter(function (g) {
      return g && g.enabled !== false && isFinite(g.x) && isFinite(g.y) && isFinite(g.lat) && isFinite(g.lon);
    });
    if (!active.length) return null;

    var lat0 = 0, lon0 = 0;
    active.forEach(function (g) { lat0 += g.lat; lon0 += g.lon; });
    lat0 /= active.length; lon0 /= active.length;
    var mPerDegLat = 111132.954 - 559.822 * Math.cos(2 * lat0 * DEG);
    var mPerDegLon = 111412.84 * Math.cos(lat0 * DEG) - 93.5 * Math.cos(3 * lat0 * DEG);

    var pts = active.map(function (g) {
      return {
        raw: g,
        e: (g.lon - lon0) * mPerDegLon,
        n: (g.lat - lat0) * mPerDegLat,
        x: g.x,
        y: g.y
      };
    });

    var chosen = requested;
    if (chosen === 'auto') {
      if (pts.length >= 4 && !isCollinearMetric(pts)) chosen = 'homography_4pt';
      else if (pts.length >= 3 && !isCollinearMetric(pts)) chosen = 'affine_3pt';
      else if (pts.length >= 2) chosen = 'similarity_2pt';
      else chosen = 'shift_1pt';
    }

    var warning = '';
    if (chosen === 'homography_4pt' && (pts.length < 4 || isCollinearMetric(pts))) {
      warning = 'Homography requires 4+ non-collinear GCPs; fell back to lower model.';
      chosen = (pts.length >= 3 && !isCollinearMetric(pts)) ? 'affine_3pt' : (pts.length >= 2 ? 'similarity_2pt' : 'shift_1pt');
    }
    if (chosen === 'affine_3pt' && (pts.length < 3 || isCollinearMetric(pts))) {
      warning = 'GCPs are nearly collinear or < 3; fell back to Similarity.';
      chosen = pts.length >= 2 ? 'similarity_2pt' : 'shift_1pt';
    }
    if (chosen === 'similarity_2pt' && pts.length < 2) {
      chosen = 'shift_1pt';
    }

    var H = null, Hinv = null;

    if (chosen === 'homography_4pt') {
      var hom = solveHomographyMatrix(pts);
      if (hom) { H = hom.H; Hinv = hom.Hinv; }
      else { chosen = 'affine_3pt'; warning = 'Homography unstable; switched to Affine.'; }
    }

    if (chosen === 'affine_3pt') {
      var ATA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      var ATbx = [0, 0, 0], ATby = [0, 0, 0];
      pts.forEach(function (pt) {
        var row = [pt.e, pt.n, 1];
        for (var r = 0; r < 3; r++) {
          ATbx[r] += row[r] * pt.x;
          ATby[r] += row[r] * pt.y;
          for (var c = 0; c < 3; c++) ATA[r][c] += row[r] * row[c];
        }
      });
      var wx = solveLinearSystem(ATA, ATbx);
      var wy = solveLinearSystem(ATA, ATby);
      if (wx && wy) {
        H = [[wx[0], wx[1], wx[2]], [wy[0], wy[1], wy[2]], [0, 0, 1]];
        Hinv = inv3(H);
      }
      if (!H || !Hinv) { chosen = 'similarity_2pt'; warning = 'Affine matrix singular; fell back to Similarity.'; }
    }

    if (chosen === 'similarity_2pt') {
      // Least-squares 4-DOF Similarity: x = p*e + q*n + cx, y = q*e - p*n + cy
      var S4 = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      var B4 = [0, 0, 0, 0];
      function addS(row, rhs) {
        for (var r = 0; r < 4; r++) {
          B4[r] += row[r] * rhs;
          for (var c = 0; c < 4; c++) S4[r][c] += row[r] * row[c];
        }
      }
      pts.forEach(function (pt) {
        addS([pt.e, pt.n, 1, 0], pt.x);
        addS([-pt.n, pt.e, 0, 1], pt.y);
      });
      var w4 = solveLinearSystem(S4, B4);
      if (w4) {
        H = [[w4[0], w4[1], w4[2]], [w4[1], -w4[0], w4[3]], [0, 0, 1]];
        Hinv = inv3(H);
      }
      if (!H || !Hinv) chosen = 'shift_1pt';
    }

    if (chosen === 'shift_1pt') {
      var pxPerM = (opts.fallbackPxPerMeter > 0) ? opts.fallbackPxPerMeter : 0;
      if (!(pxPerM > 0)) return null;
      var rad = ((opts.fallbackNorthDeg || 0) * DEG);
      var cs = Math.cos(rad) * pxPerM, sn = Math.sin(rad) * pxPerM;
      var p0 = pts[0];
      H = [[cs, sn, p0.x], [sn, -cs, p0.y], [0, 0, 1]];
      Hinv = inv3(H);
      if (!Hinv) return null;
    }

    function enToXY(e, n) {
      var w = H[2][0] * e + H[2][1] * n + H[2][2];
      if (Math.abs(w) < 1e-12) return null;
      return {
        x: (H[0][0] * e + H[0][1] * n + H[0][2]) / w,
        y: (H[1][0] * e + H[1][1] * n + H[1][2]) / w
      };
    }

    function xyToEN(x, y) {
      var w = Hinv[2][0] * x + Hinv[2][1] * y + Hinv[2][2];
      if (Math.abs(w) < 1e-12) return null;
      return {
        e: (Hinv[0][0] * x + Hinv[0][1] * y + Hinv[0][2]) / w,
        n: (Hinv[1][0] * x + Hinv[1][1] * y + Hinv[1][2]) / w
      };
    }

    function latLonToXY(lat, lon) {
      return enToXY((lon - lon0) * mPerDegLon, (lat - lat0) * mPerDegLat);
    }

    function xyToLatLon(x, y) {
      var en = xyToEN(x, y);
      if (!en) return null;
      return {
        lat: +(lat0 + en.n / mPerDegLat).toFixed(7),
        lon: +(lon0 + en.e / mPerDegLon).toFixed(7)
      };
    }

    // Local Jacobian at centroid (0,0) for accurate px/m and True North bearing
    var pC = enToXY(0, 0);
    var pE = enToXY(1, 0);
    var pN = enToXY(0, 1);
    var pxPerM_E = (pC && pE) ? Math.hypot(pE.x - pC.x, pE.y - pC.y) : 0;
    var pxPerM_N = (pC && pN) ? Math.hypot(pN.x - pC.x, pN.y - pC.y) : 0;
    var pxPerMeter = 0.5 * (pxPerM_E + pxPerM_N);
    var metersPerPx = pxPerMeter > 1e-9 ? (1 / pxPerMeter) : null;
    var northOffsetDeg = 0;
    if (pC && pN) {
      var vx = pN.x - pC.x, vy = pN.y - pC.y;
      northOffsetDeg = ((Math.atan2(vx, -vy) * RAD) % 360 + 360) % 360;
    }

    // Per-GCP Residuals & Total RMS
    var sqPx = 0, sqM = 0;
    var residuals = [];
    pts.forEach(function (pt) {
      var pred = enToXY(pt.e, pt.n);
      var rPx = pred ? Math.hypot(pred.x - pt.x, pred.y - pt.y) : 0;
      var rM = metersPerPx ? (rPx * metersPerPx) : 0;
      sqPx += rPx * rPx;
      sqM += rM * rM;
      residuals.push({ gcp: pt.raw, residualPx: +rPx.toFixed(2), residualM: +rM.toFixed(2) });
    });

    return {
      mode: chosen,
      activeCount: pts.length,
      lat0: lat0, lon0: lon0, mPerDegLat: mPerDegLat, mPerDegLon: mPerDegLon,
      H: H, Hinv: Hinv,
      pxPerMeter: +pxPerMeter.toFixed(5),
      metersPerPx: metersPerPx ? +metersPerPx.toFixed(6) : null,
      northOffsetDeg: +northOffsetDeg.toFixed(2),
      rmsPx: +Math.sqrt(sqPx / pts.length).toFixed(2),
      rmsM: +Math.sqrt(sqM / pts.length).toFixed(2),
      residuals: residuals,
      warning: warning,
      latLonToXY: latLonToXY,
      xyToLatLon: xyToLatLon,
      enToXY: enToXY,
      xyToEN: xyToEN
    };
  }

  // =========================================================================
  // 4. ARCGIS / QGIS / GOOGLE EARTH GEOREF EXPORTERS (.PGW + .PRJ + KML)
  // =========================================================================
  var WGS84_PRJ_WKT =
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
    'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

  function buildWorldFilePGW(model, imgW, imgH) {
    if (!model || !imgW || !imgH) return null;
    var ll00 = model.xyToLatLon(0, 0);
    var llW0 = model.xyToLatLon(imgW, 0);
    var ll0H = model.xyToLatLon(0, imgH);
    if (!ll00 || !llW0 || !ll0H) return null;
    var A = (llW0.lon - ll00.lon) / imgW;
    var D = (llW0.lat - ll00.lat) / imgW;
    var B = (ll0H.lon - ll00.lon) / imgH;
    var E = (ll0H.lat - ll00.lat) / imgH;
    var C = ll00.lon;
    var F = ll00.lat;
    return [A, D, B, E, C, F].map(function (v) { return v.toFixed(12); }).join('\r\n') + '\r\n';
  }

  function buildKmlGroundOverlay(model, imgW, imgH, imageHref, title) {
    if (!model || !imgW || !imgH) return null;
    // gx:LatLonQuad order: counter-clockwise starting at Lower-Left (BL -> BR -> TR -> TL)
    var bl = model.xyToLatLon(0, imgH);
    var br = model.xyToLatLon(imgW, imgH);
    var tr = model.xyToLatLon(imgW, 0);
    var tl = model.xyToLatLon(0, 0);
    if (!bl || !br || !tr || !tl) return null;
    var coords = [bl, br, tr, tl].map(function (p) { return p.lon + ',' + p.lat + ',0'; }).join(' ');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">\n' +
      '  <GroundOverlay>\n' +
      '    <name>' + esc(title || 'AJ-GeoCAD Georeferenced Map') + '</name>\n' +
      '    <Icon><href>' + esc(imageHref || 'Master_Clean_2D.png') + '</href></Icon>\n' +
      '    <gx:LatLonQuad><coordinates>' + coords + '</coordinates></gx:LatLonQuad>\n' +
      '  </GroundOverlay>\n' +
      '</kml>\n';
  }

  // =========================================================================
  // 5. UPGRADED LIVE GPS ENGINE (DIAGNOSTICS + KALMAN + AVERAGING + DRIFT FIX)
  // =========================================================================
  function createGpsEngine(callbacks) {
    callbacks = callbacks || {};
    var onFix = callbacks.onFix || function () {};
    var onError = callbacks.onError || function () {};
    var onTrackUpdate = callbacks.onTrackUpdate || function () {};

    var watchId = null;
    var active = false;
    var rawFix = null;
    var smoothFix = null;
    var driftOffset = { dLat: 0, dLon: 0, active: false, anchorLabel: '' };
    var cfg = { maxAccuracyM: 45, smoothingAlpha: 0.35 };
    var recordingTrack = false;
    var track = []; // [{lat, lon, accuracy, ts}]
    var lastError = '';

    function diagnoseEnvironment(cb) {
      var proto = (window.location && window.location.protocol) || '';
      var host = (window.location && window.location.hostname) || '';
      var secure = !!window.isSecureContext || proto === 'https:' || host === 'localhost' || host === '127.0.0.1';
      var hasGeo = 'geolocation' in navigator;
      var hasOrient = typeof window.DeviceOrientationEvent !== 'undefined';
      var issues = [];
      if (proto === 'file:') {
        issues.push('Opened via file:// — Android/iOS/Chrome block GPS & Compass on file://. Serve via localhost or HTTPS.');
      } else if (!secure) {
        issues.push('Insecure HTTP origin — GPS requires HTTPS or http://localhost.');
      }
      if (!hasGeo) issues.push('Browser does not expose navigator.geolocation.');
      var diag = {
        protocol: proto,
        hostname: host,
        isSecureContext: secure,
        hasGeolocation: hasGeo,
        hasCompassAPI: hasOrient,
        permissionState: 'unknown',
        issues: issues,
        ready: secure && hasGeo
      };
      if (navigator.permissions && navigator.permissions.query && hasGeo) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (res) {
          diag.permissionState = res.state;
          if (res.state === 'denied') {
            diag.issues.push('Location permission is DENIED in browser settings. Enable Location for this site.');
            diag.ready = false;
          }
          if (cb) cb(diag);
        }).catch(function () { if (cb) cb(diag); });
      } else {
        if (cb) cb(diag);
      }
      return diag;
    }

    function applyDrift(lat, lon) {
      return driftOffset.active
        ? { lat: lat + driftOffset.dLat, lon: lon + driftOffset.dLon }
        : { lat: lat, lon: lon };
    }

    function processPosition(pos) {
      var lat = pos.coords.latitude;
      var lon = pos.coords.longitude;
      var acc = (typeof pos.coords.accuracy === 'number' && pos.coords.accuracy > 0) ? pos.coords.accuracy : 99;
      var ts = pos.timestamp || Date.now();
      rawFix = { lat: lat, lon: lon, accuracy: acc, altitude: pos.coords.altitude, heading: pos.coords.heading, speed: pos.coords.speed, ts: ts };
      lastError = '';

      // Accuracy-weighted Kalman / EMA smoothing
      if (!smoothFix || acc <= 5 || haversineMeters(smoothFix.lat, smoothFix.lon, lat, lon) > Math.max(35, acc * 2)) {
        smoothFix = { lat: lat, lon: lon, accuracy: acc, ts: ts };
      } else {
        var weight = clamp(cfg.smoothingAlpha * (10 / Math.max(5, acc)), 0.08, 0.75);
        smoothFix = {
          lat: smoothFix.lat + (lat - smoothFix.lat) * weight,
          lon: smoothFix.lon + (lon - smoothFix.lon) * weight,
          accuracy: smoothFix.accuracy + (acc - smoothFix.accuracy) * 0.4,
          ts: ts
        };
      }

      var corr = applyDrift(smoothFix.lat, smoothFix.lon);
      var out = {
        lat: corr.lat,
        lon: corr.lon,
        rawLat: lat,
        rawLon: lon,
        accuracy: Math.round(acc * 10) / 10,
        degraded: acc > cfg.maxAccuracyM,
        driftApplied: driftOffset.active,
        ts: ts
      };

      if (recordingTrack && !out.degraded) {
        var prev = track[track.length - 1];
        if (!prev || haversineMeters(prev.lat, prev.lon, out.lat, out.lon) >= 2.0) {
          track.push({ lat: out.lat, lon: out.lon, accuracy: out.accuracy, ts: ts });
          onTrackUpdate(track);
        }
      }
      onFix(out);
    }

    function start() {
      var diag = diagnoseEnvironment();
      if (!diag.ready) {
        lastError = diag.issues.join(' ');
        onError(lastError, diag);
        return false;
      }
      if (active) return true;
      active = true;
      watchId = navigator.geolocation.watchPosition(
        processPosition,
        function (err) {
          lastError = (err && err.message) ? err.message : ('GPS Error #' + (err && err.code));
          onError(lastError, diag);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
      );
      return true;
    }

    function stop() {
      if (watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
      watchId = null;
      active = false;
    }

    function captureAveragedFix(sampleTarget, onProgress, onDone) {
      var target = clamp(parseInt(sampleTarget, 10) || 6, 2, 20);
      var diag = diagnoseEnvironment();
      if (!diag.ready) return onDone(new Error(diag.issues.join(' ')), null);

      var samples = [];
      var wid = null;
      var done = false;
      var timer = setTimeout(finish, 14000);

      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (wid !== null) navigator.geolocation.clearWatch(wid);
        if (!samples.length) return onDone(new Error('GPS averaging timed out without a fix.'), null);
        var wSum = 0, latSum = 0, lonSum = 0, bestAcc = Infinity;
        samples.forEach(function (s) {
          var w = 1 / Math.max(1, s.acc * s.acc);
          wSum += w;
          latSum += s.lat * w;
          lonSum += s.lon * w;
          if (s.acc < bestAcc) bestAcc = s.acc;
        });
        var avgLat = latSum / wSum;
        var avgLon = lonSum / wSum;
        var corr = applyDrift(avgLat, avgLon);
        onDone(null, {
          lat: +corr.lat.toFixed(7),
          lon: +corr.lon.toFixed(7),
          rawLat: +avgLat.toFixed(7),
          rawLon: +avgLon.toFixed(7),
          accuracy: +bestAcc.toFixed(1),
          sampleCount: samples.length
        });
      }

      wid = navigator.geolocation.watchPosition(
        function (pos) {
          var s = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            acc: Math.max(1, pos.coords.accuracy || 50)
          };
          samples.push(s);
          if (onProgress) onProgress(samples.length, target, s.acc);
          if (samples.length >= target) finish();
        },
        function (err) {
          if (!samples.length) {
            done = true; clearTimeout(timer);
            if (wid !== null) navigator.geolocation.clearWatch(wid);
            onDone(new Error((err && err.message) || 'GPS error'), null);
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
      );
    }

    function setDriftCalibration(trueLat, trueLon, label) {
      if (!rawFix) return null;
      driftOffset = {
        dLat: trueLat - rawFix.lat,
        dLon: trueLon - rawFix.lon,
        active: true,
        anchorLabel: label || 'Field Anchor'
      };
      var shiftM = haversineMeters(rawFix.lat, rawFix.lon, trueLat, trueLon);
      return { shiftMeters: +shiftM.toFixed(1), dLat: driftOffset.dLat, dLon: driftOffset.dLon };
    }

    function clearDriftCalibration() {
      driftOffset = { dLat: 0, dLon: 0, active: false, anchorLabel: '' };
    }

    function getTrackLengthMeters() {
      var sum = 0;
      for (var i = 1; i < track.length; i++) {
        sum += haversineMeters(track[i - 1].lat, track[i - 1].lon, track[i].lat, track[i].lon);
      }
      return sum;
    }

    function exportTrackGPX(name) {
      var ptsXml = track.map(function (p) {
        return '      <trkpt lat="' + p.lat.toFixed(7) + '" lon="' + p.lon.toFixed(7) + '"><time>' + new Date(p.ts).toISOString() + '</time></trkpt>';
      }).join('\n');
      return '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<gpx version="1.1" creator="AJ-GeoCAD Sat Studio" xmlns="http://www.topografix.com/GPX/1/1">\n' +
        '  <trk><name>' + esc(name || 'Field Track') + '</name><trkseg>\n' +
        ptsXml + '\n  </trkseg></trk>\n</gpx>\n';
    }

    return {
      diagnoseEnvironment: diagnoseEnvironment,
      start: start,
      stop: stop,
      isActive: function () { return active; },
      getCurrentFix: function () {
        if (!smoothFix) return null;
        var c = applyDrift(smoothFix.lat, smoothFix.lon);
        return { lat: c.lat, lon: c.lon, accuracy: Math.round(smoothFix.accuracy * 10) / 10, degraded: smoothFix.accuracy > cfg.maxAccuracyM, driftApplied: driftOffset.active };
      },
      getLastError: function () { return lastError; },
      setMaxAccuracy: function (m) { cfg.maxAccuracyM = clamp(+m || 45, 5, 500); },
      captureAveragedFix: captureAveragedFix,
      setDriftCalibration: setDriftCalibration,
      clearDriftCalibration: clearDriftCalibration,
      getDriftOffset: function () { return Object.assign({}, driftOffset); },
      startTrack: function () { recordingTrack = true; },
      stopTrack: function () { recordingTrack = false; },
      clearTrack: function () { track = []; onTrackUpdate(track); },
      isRecordingTrack: function () { return recordingTrack; },
      getTrack: function () { return track.slice(); },
      getTrackLengthMeters: getTrackLengthMeters,
      exportTrackGPX: exportTrackGPX
    };
  }

  // =========================================================================
  // 6. SMOOTHED LIVE COMPASS SENSOR (ANDROID + iOS + SCREEN ROTATION COMP)
  // =========================================================================
  function createCompassEngine(onHeading, onStatus) {
    var active = false;
    var heading = null;
    var gotEvent = false;
    var fallbackTimer = null;

    function screenAngle() {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
        return window.screen.orientation.angle;
      }
      return typeof window.orientation === 'number' ? window.orientation : 0;
    }

    function handler(ev) {
      var raw = null;
      if (typeof ev.webkitCompassHeading === 'number' && !isNaN(ev.webkitCompassHeading)) {
        raw = ev.webkitCompassHeading;
      } else if (typeof ev.alpha === 'number' && !isNaN(ev.alpha)) {
        raw = (360 - ev.alpha + screenAngle()) % 360;
      }
      if (raw === null) return;
      raw = ((raw % 360) + 360) % 360;
      gotEvent = true;
      if (heading === null) {
        heading = raw;
      } else {
        // Circular interpolation to avoid 359° -> 0° jump
        var diff = ((raw - heading + 540) % 360) - 180;
        heading = ((heading + diff * 0.25) % 360 + 360) % 360;
      }
      if (onHeading) onHeading(heading);
    }

    function stop() {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
      active = false;
      heading = null;
      gotEvent = false;
      if (onStatus) onStatus('off', '');
    }

    function start() {
      if (active) return Promise.resolve(true);
      if (typeof window.DeviceOrientationEvent === 'undefined') {
        if (onStatus) onStatus('unavailable', 'Compass API unavailable on this device/browser.');
        return Promise.resolve(false);
      }
      var permPromise = (typeof window.DeviceOrientationEvent.requestPermission === 'function')
        ? window.DeviceOrientationEvent.requestPermission()
        : Promise.resolve('granted');

      return permPromise.then(function (perm) {
        if (perm !== 'granted') {
          if (onStatus) onStatus('denied', 'Compass permission denied.');
          return false;
        }
        active = true;
        gotEvent = false;
        window.addEventListener('deviceorientationabsolute', handler, true);
        window.addEventListener('deviceorientation', handler, true);
        if (onStatus) onStatus('active', 'Compass active');
        fallbackTimer = setTimeout(function () {
          if (active && !gotEvent && onStatus) {
            onStatus('no_sensor', 'No magnetometer events received (requires phone + HTTPS/localhost).');
          }
        }, 2600);
        return true;
      }).catch(function () {
        if (onStatus) onStatus('denied', 'Compass permission failed.');
        return false;
      });
    }

    return {
      start: start,
      stop: stop,
      isActive: function () { return active; },
      getHeading: function () { return heading; }
    };
  }

  // =========================================================================
  // 7. ARCGIS GCP LINK TABLE UI RENDERER
  // =========================================================================
  function renderGcpLinkTable(container, opts) {
    if (!container) return;
    var gcps = (opts && opts.gcps) || [];
    var model = opts && opts.model;
    var modelType = (opts && opts.modelType) || 'auto';
    var cb = (opts && opts.callbacks) || {};

    var resMap = new Map();
    if (model && model.residuals) {
      model.residuals.forEach(function (r) { resMap.set(r.gcp, r); });
    }

    var rmsTxt = model
      ? ('Model: <b>' + esc(model.mode) + '</b> | RMS: <b>' + model.rmsPx + ' px</b>' + (model.rmsM ? (' (' + model.rmsM + ' m)') : '') + ' | Scale: <b>' + model.pxPerMeter + ' px/m</b> | North: <b>' + model.northOffsetDeg + '°</b>')
      : ('Active GCPs: <b>' + gcps.filter(function (g) { return g.enabled !== false; }).length + '</b> (Need ≥ 2 for Similarity, ≥ 3 Affine, ≥ 4 Homography)');

    var rowsHtml = gcps.length ? gcps.map(function (g, idx) {
      var r = resMap.get(g);
      var warnCol = (r && r.residualPx > 8) ? 'color:var(--sc-red,#ff3c3c);font-weight:700' : '';
      return '<tr>' +
        '<td><input type="checkbox" data-gtog="' + idx + '"' + (g.enabled !== false ? ' checked' : '') + '></td>' +
        '<td><b>' + esc(g.label || ('GCP-' + (idx + 1))) + '</b></td>' +
        '<td>' + Math.round(g.x) + ', ' + Math.round(g.y) + '</td>' +
        '<td>' + g.lat.toFixed(6) + ', ' + g.lon.toFixed(6) + '</td>' +
        '<td style="' + warnCol + '">' + (r ? (r.residualPx + ' px / ' + r.residualM + ' m') : '--') + '</td>' +
        '<td>' +
          '<button type="button" class="satc-qbtn" data-gzoom="' + idx + '" title="Focus">👁</button> ' +
          '<button type="button" class="satc-qbtn dng" data-gdel="' + idx + '" title="Delete">×</button>' +
        '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--sc-mut)">No GCPs yet. Select GCP Georef tool and click distinct map corners.</td></tr>';

    container.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">' +
        '<div>' + rmsTxt + (model && model.warning ? (' <span style="color:var(--sc-amber)">(' + esc(model.warning) + ')</span>') : '') + '</div>' +
        '<div style="display:flex;gap:5px;align-items:center">' +
          '<select id="scGcpModelSel" style="padding:3px 6px;font-size:10.5px">' +
            '<option value="auto"' + (modelType === 'auto' ? ' selected' : '') + '>Auto Best Model</option>' +
            '<option value="similarity_2pt"' + (modelType === 'similarity_2pt' ? ' selected' : '') + '>2-Pt Similarity</option>' +
            '<option value="affine_3pt"' + (modelType === 'affine_3pt' ? ' selected' : '') + '>3+ Pt Affine (LSQ)</option>' +
            '<option value="homography_4pt"' + (modelType === 'homography_4pt' ? ' selected' : '') + '>4+ Pt Homography</option>' +
          '</select>' +
          '<button type="button" class="satc-qbtn on" id="scGcpExpPgw"' + (model ? '' : ' disabled') + '>Export .PGW + .PRJ</button>' +
          '<button type="button" class="satc-qbtn" id="scGcpExpKml"' + (model ? '' : ' disabled') + '>Export KML Overlay</button>' +
        '</div>' +
      '</div>' +
      '<table class="satc-tbl"><thead><tr><th>On</th><th>GCP</th><th>Image (px)</th><th>WGS84 (Lat, Lon)</th><th>Residual</th><th>Act</th></tr></thead><tbody>' +
        rowsHtml +
      '</tbody></table>';

    var selEl = container.querySelector('#scGcpModelSel');
    if (selEl) selEl.onchange = function () { if (cb.onModelChange) cb.onModelChange(this.value); };
    var pgwBtn = container.querySelector('#scGcpExpPgw');
    if (pgwBtn) pgwBtn.onclick = function () { if (cb.onExportWorldFile) cb.onExportWorldFile(); };
    var kmlBtn = container.querySelector('#scGcpExpKml');
    if (kmlBtn) kmlBtn.onclick = function () { if (cb.onExportKmlOverlay) cb.onExportKmlOverlay(); };

    [].forEach.call(container.querySelectorAll('[data-gtog]'), function (el) {
      el.onchange = function () { if (cb.onToggle) cb.onToggle(+el.dataset.gtog, !!el.checked); };
    });
    [].forEach.call(container.querySelectorAll('[data-gzoom]'), function (el) {
      el.onclick = function () { if (cb.onZoom) cb.onZoom(+el.dataset.gzoom); };
    });
    [].forEach.call(container.querySelectorAll('[data-gdel]'), function (el) {
      el.onclick = function () { if (cb.onDelete) cb.onDelete(+el.dataset.gdel); };
    });
  }

  S.SatGeorefGPS = {
    WGS84_PRJ_WKT: WGS84_PRJ_WKT,
    haversineMeters: haversineMeters,
    ddToDms: ddToDms,
    latLonToUTM: latLonToUTM,
    utmToLatLon: utmToLatLon,
    latLonToWebMercator: latLonToWebMercator,
    webMercatorToLatLon: webMercatorToLatLon,
    parseSmartCoords: parseSmartCoords,
    formatCoords: formatCoords,
    solveGeoref: solveGeoref,
    buildWorldFilePGW: buildWorldFilePGW,
    buildKmlGroundOverlay: buildKmlGroundOverlay,
    createGpsEngine: createGpsEngine,
    createCompassEngine: createCompassEngine,
    renderGcpLinkTable: renderGcpLinkTable
  };
})(window.SOS);
