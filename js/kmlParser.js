window.SOS = window.SOS || {};
(function (S) {
  var COL = { building: '#39ff14', cottage: '#c8935a', tent: '#9aa8b8', solar: '#1e50c8', olive_zone: '#4a9a3a', hazard: '#e8c84a', medical: '#ff3c3c',
    security: '#00d9ff', gate: '#e8c84a', fence: '#77ffaa', field: '#2a7a2a', yard: '#445566', road: '#667788', assembly: '#00d9ff', vehicle: '#e8c84a' };
  var HT = { building: 6, cottage: 3, tent: 3.5, solar: 1.5, hazard: 3, medical: 4, security: 3, gate: 3, fence: 2.4, field: 0, yard: 0, road: 0, olive_zone: 0 };
  var ROOF = { building: 'flat', cottage: 'red_tile', tent: 'pyramid' };

  function hidden(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode)
      for (var i = 0; i < n.children.length; i++) {
        var c = n.children[i];
        if (c.localName === 'visibility' && c.textContent.trim() === '0') return true;
      }
    return false;
  }
  function ext(pm) {
    var o = {}, d = pm.getElementsByTagName('Data');
    for (var i = 0; i < d.length; i++) {
      var v = d[i].getElementsByTagName('value')[0];
      o[d[i].getAttribute('name')] = v ? v.textContent.trim() : '';
    }
    return o;
  }
  function coords(el) {
    var c = el.getElementsByTagName('coordinates')[0];
    if (!c) return [];
    return c.textContent.trim().split(/\s+/).map(function (s) { var p = s.split(',').map(Number); return { lon: p[0], lat: p[1] }; })
      .filter(function (p) { return isFinite(p.lon) && isFinite(p.lat); });
  }
  function area(p) { var a = 0; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return Math.abs(a) / 2; }
  function perim(p) { var s = 0; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; s += Math.hypot(q.x - p[i].x, q.y - p[i].y); } return s; }
  function cen(p) { var x = 0, y = 0; p.forEach(function (q) { x += q.x; y += q.y; }); return { x: x / p.length, y: y / p.length }; }
  function axis(p) {
    var sc = 0, ss = 0;
    for (var i = 0; i < p.length; i++) {
      var q = p[(i + 1) % p.length], dx = q.x - p[i].x, dy = q.y - p[i].y, l = Math.hypot(dx, dy), t = Math.atan2(dy, dx);
      sc += l * Math.cos(2 * t); ss += l * Math.sin(2 * t);
    }
    var o = 90 - 0.5 * Math.atan2(ss, sc) * 180 / Math.PI;
    while (o > 90) o -= 180; while (o <= -90) o += 180;
    return o;
  }
  function mm(a, k) { return a.reduce(function (r, p) { return [Math.min(r[0], p[k]), Math.max(r[1], p[k])]; }, [Infinity, -Infinity]); }

  S.KMLParser = {
    parse: function (xml) {
      var doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid KML/XML');
      var pms = doc.getElementsByTagName('Placemark'), raw = [], skipped = 0, i;
      for (i = 0; i < pms.length; i++) {
        var pm = pms[i];
        if (hidden(pm)) { skipped++; continue; }
        var poly = pm.getElementsByTagName('Polygon')[0], pt = pm.getElementsByTagName('Point')[0];
        if (!poly && !pt) continue;
        var cs = coords(poly ? (poly.getElementsByTagName('outerBoundaryIs')[0] || poly) : pt);
        if (!cs.length) continue;
        if (poly) {
          if (cs.length > 1 && cs[0].lon === cs[cs.length - 1].lon && cs[0].lat === cs[cs.length - 1].lat) cs.pop();
          if (cs.length < 3) continue;
        }
        var nm = pm.getElementsByTagName('name')[0];
        raw.push({ d: ext(pm), name: nm ? nm.textContent.trim() : '', poly: !!poly, cs: poly ? cs : [cs[0]], i: i });
      }
      if (!raw.length) throw new Error('No visible Placemarks found');
      var ref = raw.filter(function (r) { return r.d.category === 'fence'; }), hasFence = ref.length > 0;
      if (!hasFence) ref = raw;
      var all = []; ref.forEach(function (r) { all = all.concat(r.cs); });
      var lx = mm(all, 'lon'), ly = mm(all, 'lat');
      var oLon = (lx[0] + lx[1]) / 2, oLat = (ly[0] + ly[1]) / 2, kx = 111320 * Math.cos(oLat * Math.PI / 180);
      function proj(p) { return { x: (p.lon - oLon) * kx, y: (p.lat - oLat) * 110540 }; }
      var feats = [], fenceM = null;
      raw.forEach(function (r) {
        var d = r.d, cat = d.category || (r.poly ? 'building' : 'custom'), m = r.cs.map(proj);
        var floors = Math.max(1, parseInt(d.floors, 10) || 1);
        var h = parseFloat(d.height_m);
        if (!isFinite(h)) h = cat === 'building' ? 3 * floors : (HT[cat] != null ? HT[cat] : 3);
        var f = S.State.newFeature({
          id: d.feature_id || ('kml_' + r.i), ar_name: d.ar_name || '', en_name: d.en_name || r.name, category: cat,
          shapeType: r.poly ? 'extrude' : 'marker', geometryType: r.poly ? 'polygon' : 'point', coordsMetric: m,
          center: r.poly ? cen(m) : m[0], height_m: h, floors: floors, roofType: d.roof_type || ROOF[cat] || 'flat',
          hazard_flag: /^(1|true|yes)$/i.test(d.hazard_flag || '') || cat === 'hazard', color: COL[cat] || '#39ff14'
        });
        if (r.poly) { f.areaSqm = area(m); f.perimeterM = perim(m); }
        if (cat === 'fence' && r.poly && !fenceM) fenceM = m;
        feats.push(f);
      });
      var meta = { originLat: oLat, originLon: oLon };
      if (fenceM) { meta.areaSqm = area(fenceM); meta.perimeterM = perim(fenceM); meta.trueNorthOffsetDeg = axis(fenceM); }
      else {
        var px = all.map(proj), bx = mm(px, 'x'), by = mm(px, 'y'), w = bx[1] - bx[0], dd = by[1] - by[0];
        meta.areaSqm = w * dd; meta.perimeterM = 2 * (w + dd);
        meta.trueNorthOffsetDeg = axis([{ x: bx[0], y: by[0] }, { x: bx[1], y: by[0] }, { x: bx[1], y: by[1] }, { x: bx[0], y: by[1] }]);
      }
      return { meta: meta, features: feats, skipped: skipped };
    }
  };
})(window.SOS);
