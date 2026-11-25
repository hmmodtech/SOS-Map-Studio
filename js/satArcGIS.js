window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var MONO = "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

  function uid(p) { return (p || 'gis') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Default ArcGIS-style category symbology
  var CATEGORIES = {
    building:  { label: 'Building',        ar: 'مبنى / منشأة',   color: '#38bdf8', fill: 'rgba(56,189,248,0.24)',  hatch: false, obstacle: true },
    tent:      { label: 'Tent / Shelter',  ar: 'خيمة / مأوى',    color: '#e2e8f0', fill: 'rgba(226,232,240,0.28)', hatch: false, obstacle: true },
    evac_route:{ label: 'Evacuation Route',ar: 'مسار إخلاء',     color: '#39ff14', fill: 'rgba(57,255,20,0.18)',   hatch: false, arrows: true },
    safe_zone: { label: 'Safe Assembly',   ar: 'نقطة تجمع آمنة', color: '#22c55e', fill: 'rgba(34,197,94,0.25)',   hatch: false },
    hazard:    { label: 'Hazard / UXO',    ar: 'منطقة خطر',      color: '#ff3c3c', fill: 'rgba(255,60,60,0.24)',   hatch: true },
    buffer:    { label: 'Buffer Ring',     ar: 'نطاق حماية',     color: '#e8c84a', fill: 'rgba(232,200,74,0.16)',  hatch: false, dashed: true },
    perimeter: { label: 'Perimeter / Wall',ar: 'سياج / حدود',    color: '#c084fc', fill: 'rgba(192,132,252,0.18)', hatch: false, obstacle: true },
    camera:    { label: 'Guard / Camera',  ar: 'حراسة / كاميرا', color: '#00e5ff', fill: 'rgba(0,229,255,0.25)',   hatch: false },
    generic:   { label: 'General Feature', ar: 'معلم عام',       color: '#f59e0b', fill: 'rgba(245,158,11,0.22)',  hatch: false }
  };

  // =========================================================================
  // 1. CORE 2D GEOMETRY, METRICS, BEARING, ORTHO & COGO
  // =========================================================================
  function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

  function signedArea(pts) {
    if (!pts || pts.length < 3) return 0;
    var sum = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return sum * 0.5;
  }

  function polyStats(pts, pxPerMeter) {
    if (!pts || !pts.length) return { areaPx: 0, perimeterPx: 0, lengthPx: 0, cx: 0, cy: 0, areaM2: 0, dunum: 0, perimeterM: 0, lengthM: 0 };
    if (pts.length === 1) {
      return { areaPx: 0, perimeterPx: 0, lengthPx: 0, cx: pts[0].x, cy: pts[0].y, areaM2: 0, dunum: 0, perimeterM: 0, lengthM: 0 };
    }
    var lenPx = 0;
    for (var i = 1; i < pts.length; i++) lenPx += dist(pts[i - 1], pts[i]);
    var perimPx = lenPx + (pts.length >= 3 ? dist(pts[pts.length - 1], pts[0]) : 0);
    var a2 = 0, cx = 0, cy = 0;
    if (pts.length >= 3) {
      for (var j = 0; j < pts.length; j++) {
        var p0 = pts[j], p1 = pts[(j + 1) % pts.length];
        var cr = p0.x * p1.y - p1.x * p0.y;
        a2 += cr;
        cx += (p0.x + p1.x) * cr;
        cy += (p0.y + p1.y) * cr;
      }
      a2 *= 0.5;
    }
    if (Math.abs(a2) < 1e-6) {
      cx = 0; cy = 0;
      pts.forEach(function (p) { cx += p.x; cy += p.y; });
      cx /= pts.length; cy /= pts.length;
    } else {
      cx /= (6 * a2); cy /= (6 * a2);
    }
    var areaPx = Math.abs(a2);
    var ppm = pxPerMeter > 0 ? pxPerMeter : 0;
    var areaM2 = ppm > 0 ? (areaPx / (ppm * ppm)) : 0;
    return {
      areaPx: areaPx,
      perimeterPx: perimPx,
      lengthPx: lenPx,
      cx: cx, cy: cy,
      areaM2: +areaM2.toFixed(2),
      dunum: +(areaM2 / 1000).toFixed(4),
      perimeterM: ppm > 0 ? +(perimPx / ppm).toFixed(2) : 0,
      lengthM: ppm > 0 ? +(lenPx / ppm).toFixed(2) : 0
    };
  }

  function bboxOf(pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].x < x0) x0 = pts[i].x;
      if (pts[i].y < y0) y0 = pts[i].y;
      if (pts[i].x > x1) x1 = pts[i].x;
      if (pts[i].y > y1) y1 = pts[i].y;
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  function pointInPolygon(pt, poly) {
    if (!poly || poly.length < 3) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y;
      var xj = poly[j].x, yj = poly[j].y;
      var inter = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-12) + xi);
      if (inter) inside = !inside;
    }
    return inside;
  }

  function segIntersect(a, b, c, d) {
    var rx = b.x - a.x, ry = b.y - a.y;
    var sx = d.x - c.x, sy = d.y - c.y;
    var den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-10) return null;
    var qpx = c.x - a.x, qpy = c.y - a.y;
    var t = (qpx * sy - qpy * sx) / den;
    var u = (qpx * ry - qpy * rx) / den;
    if (t >= -1e-7 && t <= 1 + 1e-7 && u >= -1e-7 && u <= 1 + 1e-7) {
      t = clamp(t, 0, 1); u = clamp(u, 0, 1);
      return { x: a.x + t * rx, y: a.y + t * ry, t: t, u: u };
    }
    return null;
  }

  function closestPointOnSegment(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-10) return { x: a.x, y: a.y, d: dist(p, a) };
    var t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
    var cx = a.x + t * dx, cy = a.y + t * dy;
    return { x: cx, y: cy, d: Math.hypot(p.x - cx, p.y - cy) };
  }

  function calcBearingDeg(p1, p2, northOffsetDeg) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var screenAz = ((Math.atan2(dx, -dy) * RAD) % 360 + 360) % 360;
    var geo = ((screenAz - (northOffsetDeg || 0)) % 360 + 360) % 360;
    return {
      bearingDeg: +geo.toFixed(1),
      backBearingDeg: +(((geo + 180) % 360)).toFixed(1),
      screenAzDeg: +screenAz.toFixed(1)
    };
  }

  function calcNorthOffsetFromLine(pStart, pNorthEnd, knownBearingDeg) {
    var dx = pNorthEnd.x - pStart.x, dy = pNorthEnd.y - pStart.y;
    if (Math.hypot(dx, dy) < 2) return null;
    var screenAz = ((Math.atan2(dx, -dy) * RAD) % 360 + 360) % 360;
    var off = ((screenAz - (knownBearingDeg || 0)) % 360 + 360) % 360;
    return +off.toFixed(2);
  }

  function cogoNextPoint(originPt, distMeters, bearingDeg, pxPerMeter, northOffsetDeg) {
    if (!(pxPerMeter > 0) || !(distMeters > 0)) return null;
    var dPx = distMeters * pxPerMeter;
    var theta = ((bearingDeg || 0) + (northOffsetDeg || 0)) * DEG;
    return {
      x: +(originPt.x + dPx * Math.sin(theta)).toFixed(2),
      y: +(originPt.y - dPx * Math.cos(theta)).toFixed(2)
    };
  }

  function applyOrtho(prevPt, curPt, stepDeg) {
    if (!prevPt) return curPt;
    var step = (stepDeg || 45) * DEG;
    var dx = curPt.x - prevPt.x, dy = curPt.y - prevPt.y;
    var r = Math.hypot(dx, dy);
    if (r < 1e-6) return curPt;
    var ang = Math.round(Math.atan2(dy, dx) / step) * step;
    return { x: +(prevPt.x + r * Math.cos(ang)).toFixed(2), y: +(prevPt.y + r * Math.sin(ang)).toFixed(2) };
  }

  // =========================================================================
  // 2. SNAPPING ENGINE (VERTEX / INTERSECTION / MIDPOINT / EDGE)
  // =========================================================================
  function snapPoint(imgPt, features, draftPts, tolImgPx, cfg) {
    cfg = cfg || { enabled: true, vertex: true, midpoint: true, edge: true, intersection: true };
    if (!cfg.enabled) return { x: imgPt.x, y: imgPt.y, snapped: false, type: '' };

    var bestV = null, bestVd = tolImgPx;
    var bestM = null, bestMd = tolImgPx * 0.9;
    var bestE = null, bestEd = tolImgPx * 0.85;
    var segs = [];

    function scanRing(pts, closed, fid) {
      if (!pts || !pts.length) return;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (cfg.vertex) {
          var dv = dist(imgPt, p);
          if (dv < bestVd) { bestVd = dv; bestV = { x: p.x, y: p.y, snapped: true, type: 'VERTEX', fid: fid }; }
        }
        var nextIdx = i + 1;
        if (nextIdx < pts.length || (closed && pts.length >= 3)) {
          var q = pts[nextIdx % pts.length];
          segs.push({ a: p, b: q, fid: fid });
          if (cfg.midpoint) {
            var mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
            var dm = dist(imgPt, mid);
            if (dm < bestMd) { bestMd = dm; bestM = { x: mid.x, y: mid.y, snapped: true, type: 'MIDPOINT', fid: fid }; }
          }
          if (cfg.edge) {
            var ce = closestPointOnSegment(imgPt, p, q);
            if (ce.d < bestEd) { bestEd = ce.d; bestE = { x: ce.x, y: ce.y, snapped: true, type: 'EDGE', fid: fid }; }
          }
        }
      }
    }

    (features || []).forEach(function (f) {
      if (!f || f.visible === false || !f.points) return;
      scanRing(f.points, f.geom === 'polygon' || f.geom === 'circle', f.id);
    });
    if (draftPts && draftPts.length) scanRing(draftPts, false, 'draft');

    if (bestV) return bestV;

    if (cfg.intersection && segs.length > 1 && segs.length <= 240) {
      var bestI = null, bestId = tolImgPx;
      for (var a = 0; a < segs.length; a++) {
        for (var b = a + 1; b < segs.length; b++) {
          if (segs[a].fid === segs[b].fid && Math.abs(a - b) <= 1) continue;
          var hit = segIntersect(segs[a].a, segs[a].b, segs[b].a, segs[b].b);
          if (hit) {
            var di = dist(imgPt, hit);
            if (di < bestId) { bestId = di; bestI = { x: hit.x, y: hit.y, snapped: true, type: 'INTERSECT' }; }
          }
        }
      }
      if (bestI) return bestI;
    }

    if (bestM) return bestM;
    if (bestE) return bestE;
    return { x: imgPt.x, y: imgPt.y, snapped: false, type: '' };
  }

  // =========================================================================
  // 3. TOPOLOGY TOOLS (SPLIT POLYGON / UNION / INTERSECT / ERASE-CLIP)
  // =========================================================================
  function clipPolyByHalfPlane(poly, a, b, keepPositive) {
    if (!poly || poly.length < 3) return [];
    var out = [];
    var dx = b.x - a.x, dy = b.y - a.y;
    function side(p) {
      var v = dx * (p.y - a.y) - dy * (p.x - a.x);
      return keepPositive ? v >= -1e-7 : v <= 1e-7;
    }
    function lineCross(p1, p2) {
      var s1 = dx * (p1.y - a.y) - dy * (p1.x - a.x);
      var s2 = dx * (p2.y - a.y) - dy * (p2.x - a.x);
      var t = s1 / ((s1 - s2) || 1e-12);
      return { x: +(p1.x + t * (p2.x - p1.x)).toFixed(3), y: +(p1.y + t * (p2.y - p1.y)).toFixed(3) };
    }
    for (var i = 0; i < poly.length; i++) {
      var cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
      var cIn = side(cur), pIn = side(prev);
      if (cIn) {
        if (!pIn) out.push(lineCross(prev, cur));
        out.push(cur);
      } else if (pIn) {
        out.push(lineCross(prev, cur));
      }
    }
    return out;
  }

  function splitPolygonByLine(poly, linePts) {
    if (!poly || poly.length < 3 || !linePts || linePts.length < 2) return null;
    var a = linePts[0], b = linePts[linePts.length - 1];
    if (dist(a, b) < 2) return null;
    var left = clipPolyByHalfPlane(poly, a, b, true);
    var right = clipPolyByHalfPlane(poly, a, b, false);
    if (left.length < 3 || right.length < 3) return null;
    if (Math.abs(signedArea(left)) < 4 || Math.abs(signedArea(right)) < 4) return null;
    return [left, right];
  }

  function ensureWinding(pts, positive) {
    var a = signedArea(pts);
    if ((positive && a < 0) || (!positive && a > 0)) return pts.slice().reverse();
    return pts.slice();
  }

  function subdivideRingAgainst(ringA, ringB) {
    var segs = [];
    for (var i = 0; i < ringA.length; i++) {
      var p1 = ringA[i], p2 = ringA[(i + 1) % ringA.length];
      var ts = [0, 1];
      for (var j = 0; j < ringB.length; j++) {
        var q1 = ringB[j], q2 = ringB[(j + 1) % ringB.length];
        var hit = segIntersect(p1, p2, q1, q2);
        if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6) ts.push(hit.t);
      }
      ts.sort(function (x, y) { return x - y; });
      var uniq = [ts[0]];
      for (var k = 1; k < ts.length; k++) {
        if (ts[k] - uniq[uniq.length - 1] > 1e-5) uniq.push(ts[k]);
      }
      for (var m = 0; m < uniq.length - 1; m++) {
        var t0 = uniq[m], t1 = uniq[m + 1];
        segs.push({
          a: { x: p1.x + (p2.x - p1.x) * t0, y: p1.y + (p2.y - p1.y) * t0 },
          b: { x: p1.x + (p2.x - p1.x) * t1, y: p1.y + (p2.y - p1.y) * t1 }
        });
      }
    }
    return segs;
  }

  function chainSegmentsToRings(segs) {
    var used = new Uint8Array(segs.length);
    var rings = [];
    var eps = 0.05;
    for (var i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      var ring = [segs[i].a, segs[i].b];
      var guard = 0;
      while (guard++ < segs.length + 2) {
        var tail = ring[ring.length - 1];
        if (dist(tail, ring[0]) <= eps && ring.length >= 4) {
          ring.pop();
          break;
        }
        var found = -1, bestD = eps;
        for (var j = 0; j < segs.length; j++) {
          if (used[j]) continue;
          var d = dist(tail, segs[j].a);
          if (d <= bestD) { bestD = d; found = j; }
        }
        if (found < 0) break;
        used[found] = 1;
        ring.push(segs[found].b);
      }
      if (ring.length >= 3 && Math.abs(signedArea(ring)) >= 2) {
        rings.push(ring.map(function (p) { return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; }));
      }
    }
    return rings;
  }

  // Boolean ops for simple polygons: 'union' | 'intersect' | 'difference' (A - B)
  function polygonBoolean(polyA, polyB, op) {
    if (!polyA || polyA.length < 3 || !polyB || polyB.length < 3) return [];
    var A = ensureWinding(polyA, true);
    // Tiny deterministic offset on B prevents exact vertex-on-edge singularity
    var B = ensureWinding(polyB, true).map(function (p) { return { x: p.x + 1e-4, y: p.y + 1.3e-4 }; });

    var segsA = subdivideRingAgainst(A, B);
    var segsB = subdivideRingAgainst(B, A);
    var kept = [];

    segsA.forEach(function (s) {
      var mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      var inB = pointInPolygon(mid, B);
      if (op === 'union' && !inB) kept.push(s);
      else if (op === 'intersect' && inB) kept.push(s);
      else if (op === 'difference' && !inB) kept.push(s);
    });

    segsB.forEach(function (s) {
      var mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      var inA = pointInPolygon(mid, A);
      if (op === 'union' && !inA) kept.push(s);
      else if (op === 'intersect' && inA) kept.push(s);
      else if (op === 'difference' && inA) kept.push({ a: s.b, b: s.a }); // reverse winding for cutout
    });

    return chainSegmentsToRings(kept);
  }

  // =========================================================================
  // 4. GEOPROCESSING TOOLBOX (BUFFER, RANGE RINGS, VIEWSHED, NEAREST, QUERIES)
  // =========================================================================
  function makeCirclePolygon(cx, cy, radiusPx, segments) {
    var n = Math.max(16, segments || 48);
    var pts = [];
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2;
      pts.push({ x: +(cx + Math.cos(ang) * radiusPx).toFixed(2), y: +(cy + Math.sin(ang) * radiusPx).toFixed(2) });
    }
    return pts;
  }

  function makeArcPoints(cx, cy, r, aStart, aEnd, steps) {
    var diff = aEnd - aStart;
    while (diff <= -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    var n = Math.max(2, steps || Math.ceil(Math.abs(diff) / (Math.PI / 10)));
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var a = aStart + (diff * i) / n;
      pts.push({ x: +(cx + Math.cos(a) * r).toFixed(2), y: +(cy + Math.sin(a) * r).toFixed(2) });
    }
    return pts;
  }

  function bufferGeometry(geomType, pts, radiusPx) {
    if (!pts || !pts.length || !(radiusPx > 0.5)) return null;
    if (geomType === 'point' || pts.length === 1) {
      return makeCirclePolygon(pts[0].x, pts[0].y, radiusPx, 48);
    }

    if (geomType === 'polyline' || pts.length === 2) {
      var left = [], right = [];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        var d = dist(a, b);
        if (d < 1e-4) continue;
        var nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
        left.push({ x: a.x + nx * radiusPx, y: a.y + ny * radiusPx });
        left.push({ x: b.x + nx * radiusPx, y: b.y + ny * radiusPx });
        right.push({ x: a.x - nx * radiusPx, y: a.y - ny * radiusPx });
        right.push({ x: b.x - nx * radiusPx, y: b.y - ny * radiusPx });
      }
      if (!left.length) return makeCirclePolygon(pts[0].x, pts[0].y, radiusPx, 36);
      var pFirst = pts[0], pLast = pts[pts.length - 1];
      var endA = Math.atan2(left[left.length - 1].y - pLast.y, left[left.length - 1].x - pLast.x);
      var endB = Math.atan2(right[right.length - 1].y - pLast.y, right[right.length - 1].x - pLast.x);
      var capEnd = makeArcPoints(pLast.x, pLast.y, radiusPx, endA, endB, 10);

      var stA = Math.atan2(right[0].y - pFirst.y, right[0].x - pFirst.x);
      var stB = Math.atan2(left[0].y - pFirst.y, left[0].x - pFirst.x);
      var capStart = makeArcPoints(pFirst.x, pFirst.y, radiusPx, stA, stB, 10);

      return left.concat(capEnd, right.reverse(), capStart).map(function (p) {
        return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) };
      });
    }

    // Polygon outward rounded-corner offset buffer
    var ring = ensureWinding(pts, true); // CW in Y-down screen space -> outward normal is (dy/d, -dx/d)
    var out = [];
    var n = ring.length;
    for (var k = 0; k < n; k++) {
      var prev = ring[(k - 1 + n) % n];
      var cur = ring[k];
      var next = ring[(k + 1) % n];
      var d1 = dist(prev, cur) || 1, d2 = dist(cur, next) || 1;
      var n1x = (cur.y - prev.y) / d1, n1y = -(cur.x - prev.x) / d1;
      var n2x = (next.y - cur.y) / d2, n2y = -(next.x - cur.x) / d2;
      var a1 = Math.atan2(n1y, n1x);
      var a2 = Math.atan2(n2y, n2x);
      var arc = makeArcPoints(cur.x, cur.y, radiusPx, a1, a2, 6);
      for (var m = 0; m < arc.length; m++) out.push(arc[m]);
    }
    return out;
  }

  function createMultiRingBuffers(feature, distancesM, pxPerMeter) {
    if (!feature || !(pxPerMeter > 0)) return [];
    var rings = [];
    var sorted = distancesM.slice().filter(function (v) { return v > 0; }).sort(function (a, b) { return b - a; });
    sorted.forEach(function (dM) {
      var poly = bufferGeometry(feature.geom, feature.points, dM * pxPerMeter);
      if (poly) {
        rings.push(createFeature({
          geom: 'polygon',
          category: 'buffer',
          name: (feature.name || feature.id) + ' Buffer ' + dM + 'm',
          points: poly,
          props: { sourceId: feature.id, bufferM: dM }
        }));
      }
    });
    return rings;
  }

  // 2D Building-Obstructed Line-of-Sight Viewshed Raycast
  function computeViewshed2D(origin, maxRadiusPx, obstaclePolys, rayCount) {
    var N = clamp(rayCount || 360, 72, 720);
    var obsSegs = [];
    (obstaclePolys || []).forEach(function (poly) {
      if (!poly || poly.length < 3) return;
      for (var i = 0; i < poly.length; i++) {
        obsSegs.push({ a: poly[i], b: poly[(i + 1) % poly.length] });
      }
    });

    var visPoly = [];
    var blindRays = [];
    var visR2Sum = 0;

    for (var k = 0; k < N; k++) {
      var ang = (k / N) * Math.PI * 2;
      var farPt = { x: origin.x + Math.cos(ang) * maxRadiusPx, y: origin.y + Math.sin(ang) * maxRadiusPx };
      var minT = 1.0;
      for (var s = 0; s < obsSegs.length; s++) {
        var hit = segIntersect(origin, farPt, obsSegs[s].a, obsSegs[s].b);
        if (hit && hit.t > 1e-4 && hit.t < minT) minT = hit.t;
      }
      var hitPt = {
        x: +(origin.x + (farPt.x - origin.x) * minT).toFixed(2),
        y: +(origin.y + (farPt.y - origin.y) * minT).toFixed(2)
      };
      visPoly.push(hitPt);
      visR2Sum += minT * minT;
      if (minT < 0.999) blindRays.push({ from: hitPt, to: farPt });
    }

    return {
      origin: origin,
      maxRadiusPx: maxRadiusPx,
      visiblePoly: visPoly,
      blindRays: blindRays,
      coveragePct: +((visR2Sum / N) * 100).toFixed(1)
    };
  }

  // Nearest Neighbor & Evacuation Distance Matrix (1.4 m/s brisk walk speed)
  function computeNearestEvacMatrix(sources, targets, pxPerMeter) {
    if (!sources.length || !targets.length) return [];
    var ppm = pxPerMeter > 0 ? pxPerMeter : 0;
    return sources.map(function (src) {
      var sc = polyStats(src.points, ppm);
      var best = null, bestD = Infinity;
      targets.forEach(function (tgt) {
        if (tgt.id === src.id) return;
        var tc = polyStats(tgt.points, ppm);
        var d = Math.hypot(tc.cx - sc.cx, tc.cy - sc.cy);
        if (d < bestD) { bestD = d; best = { target: tgt, tc: tc, dPx: d }; }
      });
      if (!best) return null;
      var dM = ppm > 0 ? +(best.dPx / ppm).toFixed(1) : 0;
      return {
        sourceId: src.id,
        sourceName: src.name || src.id,
        targetId: best.target.id,
        targetName: best.target.name || best.target.id,
        from: { x: sc.cx, y: sc.cy },
        to: { x: best.tc.cx, y: best.tc.cy },
        distPx: +best.dPx.toFixed(1),
        distM: dM,
        walkSec: ppm > 0 ? Math.round(dM / 1.4) : 0
      };
    }).filter(Boolean);
  }

  // Spatial Queries (Select by Location & Attributes)
  function featureMinDistPx(fA, fB) {
    var best = Infinity;
    for (var i = 0; i < fA.points.length; i++) {
      for (var j = 0; j < fB.points.length; j++) {
        var d = dist(fA.points[i], fB.points[j]);
        if (d < best) best = d;
      }
    }
    return best;
  }

  function featuresIntersect(fA, fB) {
    if (fA.geom === 'polygon' && fB.points.some(function (p) { return pointInPolygon(p, fA.points); })) return true;
    if (fB.geom === 'polygon' && fA.points.some(function (p) { return pointInPolygon(p, fB.points); })) return true;
    for (var i = 0; i < fA.points.length; i++) {
      var a1 = fA.points[i], a2 = fA.points[(i + 1) % fA.points.length];
      if (fA.geom === 'point' || (fA.geom === 'polyline' && i === fA.points.length - 1)) continue;
      for (var j = 0; j < fB.points.length; j++) {
        var b1 = fB.points[j], b2 = fB.points[(j + 1) % fB.points.length];
        if (fB.geom === 'point' || (fB.geom === 'polyline' && j === fB.points.length - 1)) continue;
        if (segIntersect(a1, a2, b1, b2)) return true;
      }
    }
    return false;
  }

  function selectByLocation(features, refFeature, relation, maxDistM, pxPerMeter) {
    if (!refFeature) return [];
    var maxPx = (maxDistM > 0 && pxPerMeter > 0) ? (maxDistM * pxPerMeter) : 0;
    return (features || []).filter(function (f) {
      if (f.id === refFeature.id) return false;
      if (relation === 'within') {
        return refFeature.geom === 'polygon' && f.points.every(function (p) { return pointInPolygon(p, refFeature.points); });
      }
      if (relation === 'contains') {
        return f.geom === 'polygon' && refFeature.points.every(function (p) { return pointInPolygon(p, f.points); });
      }
      if (relation === 'within_distance') {
        return featuresIntersect(f, refFeature) || featureMinDistPx(f, refFeature) <= maxPx;
      }
      return featuresIntersect(f, refFeature);
    }).map(function (f) { return f.id; });
  }

  function selectByAttribute(features, queryText, categoryFilter) {
    var q = String(queryText || '').trim().toLowerCase();
    return (features || []).filter(function (f) {
      if (categoryFilter && categoryFilter !== 'ALL' && f.category !== categoryFilter) return false;
      if (!q) return true;
      var hay = [f.id, f.name, f.category, f.notes, JSON.stringify(f.props || {})].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    }).map(function (f) { return f.id; });
  }

  // =========================================================================
  // 5. FEATURE MODEL + SYMBOLOGY, HEATMAP & GRATICULE CANVAS RENDERER
  // =========================================================================
  function createFeature(raw) {
    var cat = (raw && CATEGORIES[raw.category]) ? raw.category : 'generic';
    var st = CATEGORIES[cat];
    return {
      id: (raw && raw.id) || uid('gis'),
      geom: (raw && raw.geom) || 'polygon', // 'point' | 'polyline' | 'polygon' | 'circle'
      category: cat,
      name: (raw && raw.name) || (st.label + ' #' + Math.floor(Math.random() * 90 + 10)),
      notes: (raw && raw.notes) || '',
      color: (raw && raw.color) || st.color,
      fill: (raw && raw.fill) || st.fill,
      hatch: (raw && typeof raw.hatch === 'boolean') ? raw.hatch : !!st.hatch,
      arrows: (raw && typeof raw.arrows === 'boolean') ? raw.arrows : !!st.arrows,
      dashed: (raw && typeof raw.dashed === 'boolean') ? raw.dashed : !!st.dashed,
      obstacle: (raw && typeof raw.obstacle === 'boolean') ? raw.obstacle : !!st.obstacle,
      visible: (raw && raw.visible !== false),
      points: Array.isArray(raw && raw.points) ? raw.points.map(function (p) { return { x: +p.x, y: +p.y }; }) : [],
      props: Object.assign({}, (raw && raw.props) || {})
    };
  }

  // Thermal Color LUT for Heatmap
  var HEAT_LUT = (function () {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 1;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 256, 0);
    grd.addColorStop(0.0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.25, 'rgba(0,229,255,0.55)');
    grd.addColorStop(0.5, 'rgba(57,255,20,0.7)');
    grd.addColorStop(0.75, 'rgba(232,200,74,0.85)');
    grd.addColorStop(1.0, 'rgba(255,60,60,0.95)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 1);
    return g.getImageData(0, 0, 256, 1).data;
  })();

  function renderHeatmapOverlay(ctx, pointsImg, imgW, imgH, i2s, radiusPx, viewS) {
    if (!pointsImg || !pointsImg.length || !imgW || !imgH) return;
    var maxEdge = 360;
    var sc = Math.min(1, maxEdge / Math.max(imgW, imgH));
    var cw = Math.max(32, Math.round(imgW * sc));
    var ch = Math.max(32, Math.round(imgH * sc));
    var hc = document.createElement('canvas');
    hc.width = cw; hc.height = ch;
    var hg = hc.getContext('2d');
    var r = Math.max(6, (radiusPx || 45) * sc);

    pointsImg.forEach(function (pt) {
      var x = pt.x * sc, y = pt.y * sc;
      var grd = hg.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(0,0,0,0.45)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      hg.fillStyle = grd;
      hg.beginPath(); hg.arc(x, y, r, 0, Math.PI * 2); hg.fill();
    });

    var idata = hg.getImageData(0, 0, cw, ch);
    var d = idata.data;
    for (var i = 0; i < d.length; i += 4) {
      var a = d[i + 3];
      if (!a) continue;
      var li = a * 4;
      d[i] = HEAT_LUT[li];
      d[i + 1] = HEAT_LUT[li + 1];
      d[i + 2] = HEAT_LUT[li + 2];
      d[i + 3] = Math.round(HEAT_LUT[li + 3] * 0.78);
    }
    hg.putImageData(idata, 0, 0);
    var tl = i2s(0, 0);
    ctx.save();
    ctx.drawImage(hc, tl[0], tl[1], imgW * viewS, imgH * viewS);
    ctx.restore();
    hc.width = 0; hc.height = 0;
  }

  function makeHatchPattern(ctx, color) {
    var pc = document.createElement('canvas');
    pc.width = 12; pc.height = 12;
    var pg = pc.getContext('2d');
    pg.strokeStyle = color || '#ff3c3c';
    pg.lineWidth = 1.4;
    pg.beginPath();
    pg.moveTo(0, 12); pg.lineTo(12, 0);
    pg.moveTo(-6, 6); pg.lineTo(6, -6);
    pg.moveTo(6, 18); pg.lineTo(18, 6);
    pg.stroke();
    return ctx.createPattern(pc, 'repeat');
  }

  function renderGraticuleGrid(ctx, opts) {
    var imgW = opts.imgW, imgH = opts.imgH, i2s = opts.i2s, ppm = opts.pxPerMeter, model = opts.georefModel;
    if (!imgW || !imgH) return;
    var stepPx = ppm > 0 ? (ppm * (opts.gridStepM || 25)) : Math.max(64, Math.round(Math.min(imgW, imgH) / 10));
    if (stepPx * opts.viewS < 36) stepPx *= 2;
    if (stepPx * opts.viewS < 36) stepPx *= 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(0,229,255,0.22)';
    ctx.lineWidth = 1;
    ctx.font = 'bold 9.5px ' + MONO;
    ctx.fillStyle = 'rgba(0,229,255,0.85)';

    for (var x = 0; x <= imgW; x += stepPx) {
      var sTop = i2s(x, 0), sBot = i2s(x, imgH);
      ctx.beginPath(); ctx.moveTo(sTop[0], sTop[1]); ctx.lineTo(sBot[0], sBot[1]); ctx.stroke();
      var lblX = model ? (model.xyToLatLon(x, 0) ? model.xyToLatLon(x, 0).lon.toFixed(5) + '°E' : '') : (ppm > 0 ? Math.round(x / ppm) + 'm' : Math.round(x) + 'px');
      if (lblX) ctx.fillText(lblX, sTop[0] + 3, Math.max(38, sTop[1] + 12));
    }
    for (var y = 0; y <= imgH; y += stepPx) {
      var sL = i2s(0, y), sR = i2s(imgW, y);
      ctx.beginPath(); ctx.moveTo(sL[0], sL[1]); ctx.lineTo(sR[0], sR[1]); ctx.stroke();
      var lblY = model ? (model.xyToLatLon(0, y) ? model.xyToLatLon(0, y).lat.toFixed(5) + '°N' : '') : (ppm > 0 ? Math.round(y / ppm) + 'm' : Math.round(y) + 'px');
      if (lblY) ctx.fillText(lblY, Math.max(8, sL[0] + 4), sL[1] - 3);
    }
    ctx.restore();
  }

  function renderGisLayer(ctx, opts) {
    var features = opts.features || [];
    var i2s = opts.i2s;
    var ppm = opts.pxPerMeter || 0;
    var selectedIds = opts.selectedIds || [];
    var viewshed = opts.viewshed || null;
    var rangeRings = opts.rangeRings || null;
    var evacLinks = opts.evacLinks || [];

    if (opts.showGraticule) renderGraticuleGrid(ctx, opts);

    if (opts.showHeatmap) {
      var heatPts = [];
      features.forEach(function (f) {
        if (!f.visible || !f.points.length) return;
        var st = polyStats(f.points, ppm);
        heatPts.push({ x: st.cx, y: st.cy });
      });
      renderHeatmapOverlay(ctx, heatPts, opts.imgW, opts.imgH, i2s, ppm > 0 ? (18 * ppm) : 55, opts.viewS);
    }

    // Viewshed 2D overlay
    if (viewshed && viewshed.visiblePoly && viewshed.visiblePoly.length >= 3) {
      ctx.save();
      ctx.beginPath();
      viewshed.visiblePoly.forEach(function (p, i) {
        var sp = i2s(p.x, p.y);
        if (i === 0) ctx.moveTo(sp[0], sp[1]); else ctx.lineTo(sp[0], sp[1]);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(57,255,20,0.22)';
      ctx.fill();
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,60,60,0.38)';
      ctx.lineWidth = 1;
      for (var r = 0; r < viewshed.blindRays.length; r += 2) {
        var br = viewshed.blindRays[r];
        var sA = i2s(br.from.x, br.from.y), sB = i2s(br.to.x, br.to.y);
        ctx.beginPath(); ctx.moveTo(sA[0], sA[1]); ctx.lineTo(sB[0], sB[1]); ctx.stroke();
      }
      var so = i2s(viewshed.origin.x, viewshed.origin.y);
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath(); ctx.arc(so[0], so[1], 6, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 10px ' + MONO;
      ctx.fillText('LOS ' + viewshed.coveragePct + '%', so[0] + 9, so[1] - 6);
      ctx.restore();
    }

    // Range Rings & Azimuth Spider
    if (rangeRings && rangeRings.center && rangeRings.ringsM && ppm > 0) {
      var sc = i2s(rangeRings.center.x, rangeRings.center.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(232,200,74,0.75)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      var maxR = 0;
      rangeRings.ringsM.forEach(function (rm) {
        var rScr = rm * ppm * opts.viewS;
        if (rScr > maxR) maxR = rScr;
        ctx.beginPath(); ctx.arc(sc[0], sc[1], rScr, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#e8c84a'; ctx.font = 'bold 10px ' + MONO;
        ctx.fillText(rm + 'm', sc[0] + 4, sc[1] - rScr + 12);
      });
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(232,200,74,0.32)';
      for (var deg = 0; deg < 360; deg += 45) {
        var th = (deg + (opts.northOffsetDeg || 0)) * DEG;
        ctx.beginPath();
        ctx.moveTo(sc[0], sc[1]);
        ctx.lineTo(sc[0] + Math.sin(th) * maxR, sc[1] - Math.cos(th) * maxR);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Nearest Evacuation Matrix Connectors
    if (evacLinks.length) {
      ctx.save();
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.font = 'bold 10px ' + MONO;
      evacLinks.forEach(function (lk) {
        var a = i2s(lk.from.x, lk.from.y), b = i2s(lk.to.x, lk.to.y);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        var txt = lk.distM > 0 ? (lk.distM + 'm (~' + lk.walkSec + 's)') : (lk.distPx + 'px');
        ctx.fillStyle = 'rgba(8,11,16,0.88)'; ctx.fillRect(mx - 36, my - 8, 72, 16);
        ctx.fillStyle = '#39ff14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, mx, my);
      });
      ctx.restore();
    }

    // Vector Features
    features.forEach(function (f) {
      if (!f.visible || !f.points || !f.points.length) return;
      var isSel = selectedIds.indexOf(f.id) >= 0;
      var sPts = f.points.map(function (p) { return i2s(p.x, p.y); });

      ctx.save();
      if (f.geom === 'point' || sPts.length === 1) {
        var p = sPts[0];
        ctx.beginPath(); ctx.arc(p[0], p[1], isSel ? 8.5 : 6, 0, Math.PI * 2);
        ctx.fillStyle = f.color || '#00e5ff'; ctx.fill();
        ctx.lineWidth = isSel ? 2.6 : 1.6; ctx.strokeStyle = isSel ? '#ffffff' : '#080b10'; ctx.stroke();
      } else if (f.geom === 'polyline') {
        ctx.beginPath();
        sPts.forEach(function (sp, idx) { if (idx === 0) ctx.moveTo(sp[0], sp[1]); else ctx.lineTo(sp[0], sp[1]); });
        ctx.strokeStyle = '#080b10'; ctx.lineWidth = isSel ? 5.5 : 4; ctx.stroke();
        ctx.strokeStyle = isSel ? '#ffffff' : (f.color || '#39ff14'); ctx.lineWidth = isSel ? 3 : 2.2;
        if (f.dashed) ctx.setLineDash([7, 5]);
        ctx.stroke(); ctx.setLineDash([]);

        if (f.arrows && sPts.length >= 2) {
          for (var ai = 0; ai < sPts.length - 1; ai++) {
            var pA = sPts[ai], pB = sPts[ai + 1];
            var mx = (pA[0] + pB[0]) / 2, my = (pA[1] + pB[1]) / 2;
            var ang = Math.atan2(pB[1] - pA[1], pB[0] - pA[0]);
            ctx.save();
            ctx.translate(mx, my); ctx.rotate(ang);
            ctx.fillStyle = f.color || '#39ff14';
            ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
            ctx.restore();
          }
        }
      } else {
        ctx.beginPath();
        sPts.forEach(function (sp, idx) { if (idx === 0) ctx.moveTo(sp[0], sp[1]); else ctx.lineTo(sp[0], sp[1]); });
        ctx.closePath();
        ctx.fillStyle = f.hatch ? makeHatchPattern(ctx, f.color) : (f.fill || 'rgba(0,229,255,0.2)');
        ctx.fill();
        ctx.strokeStyle = '#080b10'; ctx.lineWidth = isSel ? 4.5 : 3.2; ctx.stroke();
        ctx.strokeStyle = isSel ? '#39ff14' : (f.color || '#00e5ff'); ctx.lineWidth = isSel ? 2.5 : 1.8;
        if (f.dashed) ctx.setLineDash([7, 5]);
        ctx.stroke(); ctx.setLineDash([]);
      }

      // Label badge
      var st = polyStats(f.points, ppm);
      var lblPt = i2s(st.cx, st.cy);
      var lbl = f.name || f.id;
      if (f.geom === 'polygon' && st.areaM2 > 0) lbl += ' (' + st.areaM2 + 'm²)';
      else if (f.geom === 'polyline' && st.lengthM > 0) lbl += ' (' + st.lengthM + 'm)';
      ctx.font = 'bold 10px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var tw = ctx.measureText(lbl).width + 10;
      var ly = f.geom === 'point' ? (lblPt[1] - 15) : lblPt[1];
      ctx.fillStyle = 'rgba(8,11,16,0.84)'; ctx.fillRect(lblPt[0] - tw / 2, ly - 8, tw, 16);
      ctx.strokeStyle = isSel ? '#39ff14' : (f.color || '#00e5ff'); ctx.lineWidth = 1;
      ctx.strokeRect(lblPt[0] - tw / 2, ly - 8, tw, 16);
      ctx.fillStyle = '#e2e8f0'; ctx.fillText(lbl, lblPt[0], ly + 0.5);
      ctx.restore();
    });
  }

  // =========================================================================
  // 6. FULL GIS I/O (GEOJSON / KML / GPX / CSV / WKT)
  // =========================================================================
  function ptToGeo(p, model) {
    if (model && model.xyToLatLon) {
      var ll = model.xyToLatLon(p.x, p.y);
      if (ll) return [ll.lon, ll.lat];
    }
    return [p.x, p.y];
  }

  function exportGeoJSON(features, model, pxPerMeter) {
    var fc = {
      type: 'FeatureCollection',
      crs: model ? 'EPSG:4326' : 'LOCAL_IMAGE_PIXELS',
      features: (features || []).map(function (f) {
        var st = polyStats(f.points, pxPerMeter);
        var geometry;
        if (f.geom === 'point' || f.points.length === 1) {
          geometry = { type: 'Point', coordinates: ptToGeo(f.points[0], model) };
        } else if (f.geom === 'polyline') {
          geometry = { type: 'LineString', coordinates: f.points.map(function (p) { return ptToGeo(p, model); }) };
        } else {
          var ring = f.points.map(function (p) { return ptToGeo(p, model); });
          if (ring.length) ring.push(ring[0]);
          geometry = { type: 'Polygon', coordinates: [ring] };
        }
        return {
          type: 'Feature',
          id: f.id,
          properties: Object.assign({
            id: f.id, name: f.name, category: f.category, notes: f.notes,
            color: f.color, areaM2: st.areaM2, perimeterM: st.perimeterM, lengthM: st.lengthM
          }, f.props || {}),
          geometry: geometry
        };
      })
    };
    return JSON.stringify(fc, null, 2);
  }

  function exportKML(features, model, docName) {
    var placemarks = (features || []).map(function (f) {
      var coords = f.points.map(function (p) {
        var g = ptToGeo(p, model);
        return g[0] + ',' + g[1] + ',0';
      });
      var geomXml = '';
      if (f.geom === 'point' || coords.length === 1) {
        geomXml = '<Point><coordinates>' + coords[0] + '</coordinates></Point>';
      } else if (f.geom === 'polyline') {
        geomXml = '<LineString><tessellate>1</tessellate><coordinates>' + coords.join(' ') + '</coordinates></LineString>';
      } else {
        coords.push(coords[0]);
        geomXml = '<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>' + coords.join(' ') + '</coordinates></LinearRing></outerBoundaryIs></Polygon>';
      }
      return '    <Placemark>\n' +
        '      <name>' + esc(f.name || f.id) + '</name>\n' +
        '      <description>' + esc((f.category || '') + (f.notes ? (' — ' + f.notes) : '')) + '</description>\n' +
        '      ' + geomXml + '\n' +
        '    </Placemark>';
    }).join('\n');

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2">\n' +
      '  <Document>\n' +
      '    <name>' + esc(docName || 'AJ-GeoCAD GIS Export') + '</name>\n' +
      placemarks + '\n' +
      '  </Document>\n</kml>\n';
  }

  function exportCSV(features, model, pxPerMeter) {
    var header = ['ID', 'Name', 'Category', 'Geometry', 'Area_m2', 'Perimeter_m', 'Length_m', 'Center_Lat', 'Center_Lon', 'Center_X_px', 'Center_Y_px', 'Notes'];
    var rows = [header.join(',')];
    (features || []).forEach(function (f) {
      var st = polyStats(f.points, pxPerMeter);
      var ll = (model && model.xyToLatLon) ? model.xyToLatLon(st.cx, st.cy) : null;
      var vals = [
        f.id, f.name, f.category, f.geom, st.areaM2, st.perimeterM, st.lengthM,
        ll ? ll.lat : '', ll ? ll.lon : '', st.cx.toFixed(1), st.cy.toFixed(1), f.notes || ''
      ].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; });
      rows.push(vals.join(','));
    });
    return '\uFEFF' + rows.join('\r\n'); // UTF-8 BOM for Arabic Excel support
  }

  function exportWKT(feature, model) {
    if (!feature || !feature.points.length) return '';
    var pts = feature.points.map(function (p) { var g = ptToGeo(p, model); return g[0] + ' ' + g[1]; });
    if (feature.geom === 'point' || pts.length === 1) return 'POINT (' + pts[0] + ')';
    if (feature.geom === 'polyline') return 'LINESTRING (' + pts.join(', ') + ')';
    pts.push(pts[0]);
    return 'POLYGON ((' + pts.join(', ') + '))';
  }

  function importGISFileText(fileName, text, model) {
    var ext = (fileName.split('.').pop() || '').toLowerCase();
    var out = [];

    function toImgPt(lon, lat) {
      if (model && model.latLonToXY && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        var xy = model.latLonToXY(lat, lon);
        if (xy) return { x: +xy.x.toFixed(2), y: +xy.y.toFixed(2) };
      }
      return { x: +lon, y: +lat };
    }

    if (ext === 'geojson' || ext === 'json') {
      var gj = JSON.parse(text);
      var list = gj.type === 'FeatureCollection' ? (gj.features || []) : (gj.type === 'Feature' ? [gj] : []);
      list.forEach(function (feat) {
        if (!feat || !feat.geometry) return;
        var g = feat.geometry, pr = feat.properties || {};
        if (g.type === 'Point') {
          out.push(createFeature({ geom: 'point', name: pr.name || pr.Name || 'Point', category: pr.category || 'generic', notes: pr.notes || '', points: [toImgPt(g.coordinates[0], g.coordinates[1])], props: pr }));
        } else if (g.type === 'LineString') {
          out.push(createFeature({ geom: 'polyline', name: pr.name || pr.Name || 'Line', category: pr.category || 'evac_route', notes: pr.notes || '', points: g.coordinates.map(function (c) { return toImgPt(c[0], c[1]); }), props: pr }));
        } else if (g.type === 'Polygon' && g.coordinates[0]) {
          var r = g.coordinates[0].slice();
          if (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
          out.push(createFeature({ geom: 'polygon', name: pr.name || pr.Name || 'Polygon', category: pr.category || 'generic', notes: pr.notes || '', points: r.map(function (c) { return toImgPt(c[0], c[1]); }), props: pr }));
        }
      });
      return out;
    }

    if (ext === 'kml') {
      var docXml = new DOMParser().parseFromString(text, 'application/xml');
      var pms = docXml.getElementsByTagName('Placemark');
      for (var i = 0; i < pms.length; i++) {
        var pm = pms[i];
        var nmEl = pm.getElementsByTagName('name')[0];
        var dsEl = pm.getElementsByTagName('description')[0];
        var cEl = pm.getElementsByTagName('coordinates')[0];
        if (!cEl) continue;
        var pts = cEl.textContent.trim().split(/\s+/).map(function (tok) {
          var parts = tok.split(',');
          return toImgPt(parseFloat(parts[0]), parseFloat(parts[1]));
        }).filter(function (p) { return isFinite(p.x) && isFinite(p.y); });
        if (!pts.length) continue;
        var isPoly = pm.getElementsByTagName('Polygon').length > 0;
        var isLine = pm.getElementsByTagName('LineString').length > 0;
        if (isPoly && pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 0.01) pts.pop();
        out.push(createFeature({
          geom: isPoly ? 'polygon' : (isLine ? 'polyline' : 'point'),
          name: (nmEl && nmEl.textContent.trim()) || ('KML #' + (i + 1)),
          notes: (dsEl && dsEl.textContent.trim()) || '',
          points: pts
        }));
      }
      return out;
    }

    if (ext === 'gpx') {
      var gpxXml = new DOMParser().parseFromString(text, 'application/xml');
      var wpts = gpxXml.getElementsByTagName('wpt');
      for (var w = 0; w < wpts.length; w++) {
        var lat = parseFloat(wpts[w].getAttribute('lat')), lon = parseFloat(wpts[w].getAttribute('lon'));
        var wn = wpts[w].getElementsByTagName('name')[0];
        if (isFinite(lat) && isFinite(lon)) {
          out.push(createFeature({ geom: 'point', name: (wn && wn.textContent.trim()) || ('GPX WPT ' + (w + 1)), points: [toImgPt(lon, lat)] }));
        }
      }
      var segs = gpxXml.getElementsByTagName('trkseg');
      for (var s = 0; s < segs.length; s++) {
        var tpts = segs[s].getElementsByTagName('trkpt');
        var linePts = [];
        for (var k = 0; k < tpts.length; k++) {
          var la = parseFloat(tpts[k].getAttribute('lat')), lo = parseFloat(tpts[k].getAttribute('lon'));
          if (isFinite(la) && isFinite(lo)) linePts.push(toImgPt(lo, la));
        }
        if (linePts.length >= 2) {
          out.push(createFeature({ geom: 'polyline', category: 'evac_route', name: 'GPX Track #' + (s + 1), points: linePts }));
        }
      }
      return out;
    }

    if (ext === 'csv') {
      var lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
      if (lines.length < 2) return out;
      var headers = lines[0].split(',').map(function (h) { return h.replace(/^"|"$/g, '').trim().toLowerCase(); });
      var latI = headers.findIndex(function (h) { return h === 'lat' || h === 'latitude' || h === 'center_lat' || h === 'y'; });
      var lonI = headers.findIndex(function (h) { return h === 'lon' || h === 'lng' || h === 'longitude' || h === 'center_lon' || h === 'x'; });
      var namI = headers.findIndex(function (h) { return h === 'name' || h === 'label' || h === 'title'; });
      if (latI < 0 || lonI < 0) return out;
      for (var r = 1; r < lines.length; r++) {
        var cols = lines[r].split(',').map(function (v) { return v.replace(/^"|"$/g, '').trim(); });
        var la2 = parseFloat(cols[latI]), lo2 = parseFloat(cols[lonI]);
        if (isFinite(la2) && isFinite(lo2)) {
          out.push(createFeature({ geom: 'point', name: (namI >= 0 && cols[namI]) || ('CSV #' + r), points: [toImgPt(lo2, la2)] }));
        }
      }
    }
    return out;
  }

  // =========================================================================
  // 7. INTERACTIVE ATTRIBUTE TABLE RENDERER (BOTTOM DRAWER)
  // =========================================================================
  function renderAttributeTable(container, opts) {
    if (!container) return;
    var features = (opts && opts.features) || [];
    var ppm = (opts && opts.pxPerMeter) || 0;
    var model = opts && opts.georefModel;
    var selectedIds = (opts && opts.selectedIds) || [];
    var filterTxt = (opts && opts.filterText) || '';
    var filterCat = (opts && opts.filterCat) || 'ALL';
    var cb = (opts && opts.callbacks) || {};

    var matchedIds = selectByAttribute(features, filterTxt, filterCat);
    var shown = features.filter(function (f) { return matchedIds.indexOf(f.id) >= 0; });

    var catOpts = '<option value="ALL">All Categories</option>' + Object.keys(CATEGORIES).map(function (k) {
      return '<option value="' + k + '"' + (filterCat === k ? ' selected' : '') + '>' + esc(CATEGORIES[k].label) + '</option>';
    }).join('');

    var rowsHtml = shown.length ? shown.map(function (f) {
      var st = polyStats(f.points, ppm);
      var ll = (model && model.xyToLatLon) ? model.xyToLatLon(st.cx, st.cy) : null;
      var isSel = selectedIds.indexOf(f.id) >= 0;
      return '<tr class="' + (isSel ? 'sel' : '') + '" data-atrid="' + esc(f.id) + '">' +
        '<td><input type="checkbox" data-atvis="' + esc(f.id) + '"' + (f.visible ? ' checked' : '') + '></td>' +
        '<td><b style="color:' + esc(f.color) + '">' + esc(f.name) + '</b></td>' +
        '<td>' + esc(f.category) + '</td>' +
        '<td>' + esc(f.geom) + '</td>' +
        '<td>' + (f.geom === 'polygon' ? (st.areaM2 + ' m²') : (f.geom === 'polyline' ? (st.lengthM + ' m') : '--')) + '</td>' +
        '<td>' + (ll ? (ll.lat.toFixed(5) + ', ' + ll.lon.toFixed(5)) : (Math.round(st.cx) + ', ' + Math.round(st.cy) + ' px')) + '</td>' +
        '<td>' + esc(f.notes || '') + '</td>' +
        '<td>' +
          '<button type="button" class="satc-qbtn" data-atzoom="' + esc(f.id) + '" title="Zoom">👁</button> ' +
          '<button type="button" class="satc-qbtn" data-atedit="' + esc(f.id) + '" title="Edit">✎</button> ' +
          '<button type="button" class="satc-qbtn dng" data-atdel="' + esc(f.id) + '" title="Delete">×</button>' +
        '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--sc-mut)">No GIS features match current filter.</td></tr>';

    container.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:6px">' +
        '<input type="text" id="scAtSearch" placeholder="Search attributes / name / notes..." value="' + esc(filterTxt) + '" style="flex:1;min-width:150px;padding:4px 7px;font-size:11px">' +
        '<select id="scAtCat" style="padding:4px 6px;font-size:11px">' + catOpts + '</select>' +
        '<button type="button" class="satc-qbtn on" id="scAtExpCsv">Export CSV</button>' +
        '<button type="button" class="satc-qbtn" id="scAtExpGeo">GeoJSON</button>' +
        '<button type="button" class="satc-qbtn" id="scAtExpKml">KML</button>' +
      '</div>' +
      '<table class="satc-tbl"><thead><tr><th>Vis</th><th>Name</th><th>Category</th><th>Geom</th><th>Metric</th><th>Coords</th><th>Notes</th><th>Act</th></tr></thead><tbody>' +
        rowsHtml +
      '</tbody></table>';

    container.querySelector('#scAtSearch').oninput = function () { if (cb.onFilter) cb.onFilter(this.value, container.querySelector('#scAtCat').value); };
    container.querySelector('#scAtCat').onchange = function () { if (cb.onFilter) cb.onFilter(container.querySelector('#scAtSearch').value, this.value); };
    container.querySelector('#scAtExpCsv').onclick = function () { if (cb.onExportCSV) cb.onExportCSV(); };
    container.querySelector('#scAtExpGeo').onclick = function () { if (cb.onExportGeoJSON) cb.onExportGeoJSON(); };
    container.querySelector('#scAtExpKml').onclick = function () { if (cb.onExportKML) cb.onExportKML(); };

    [].forEach.call(container.querySelectorAll('[data-atrid]'), function (tr) {
      tr.onclick = function (ev) {
        if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'BUTTON')) return;
        if (cb.onSelect) cb.onSelect(tr.dataset.atrid, ev.ctrlKey || ev.shiftKey);
      };
    });
    [].forEach.call(container.querySelectorAll('[data-atvis]'), function (el) {
      el.onchange = function () { if (cb.onToggleVis) cb.onToggleVis(el.dataset.atvis, !!el.checked); };
    });
    [].forEach.call(container.querySelectorAll('[data-atzoom]'), function (el) {
      el.onclick = function () { if (cb.onZoom) cb.onZoom(el.dataset.atzoom); };
    });
    [].forEach.call(container.querySelectorAll('[data-atedit]'), function (el) {
      el.onclick = function () { if (cb.onEdit) cb.onEdit(el.dataset.atedit); };
    });
    [].forEach.call(container.querySelectorAll('[data-atdel]'), function (el) {
      el.onclick = function () { if (cb.onDelete) cb.onDelete(el.dataset.atdel); };
    });
  }

  S.SatArcGIS = {
    CATEGORIES: CATEGORIES,
    createFeature: createFeature,
    polyStats: polyStats,
    bboxOf: bboxOf,
    pointInPolygon: pointInPolygon,
    calcBearingDeg: calcBearingDeg,
    calcNorthOffsetFromLine: calcNorthOffsetFromLine,
    cogoNextPoint: cogoNextPoint,
    applyOrtho: applyOrtho,
    snapPoint: snapPoint,
    splitPolygonByLine: splitPolygonByLine,
    polygonBoolean: polygonBoolean,
    makeCirclePolygon: makeCirclePolygon,
    bufferGeometry: bufferGeometry,
    createMultiRingBuffers: createMultiRingBuffers,
    computeViewshed2D: computeViewshed2D,
    computeNearestEvacMatrix: computeNearestEvacMatrix,
    selectByLocation: selectByLocation,
    selectByAttribute: selectByAttribute,
    renderGisLayer: renderGisLayer,
    renderAttributeTable: renderAttributeTable,
    exportGeoJSON: exportGeoJSON,
    exportKML: exportKML,
    exportCSV: exportCSV,
    exportWKT: exportWKT,
    importGISFileText: importGISFileText
  };
})(window.SOS);
