window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var D = Math.PI / 180;
  var MAX_LIVE_ASSET_EDGE = 1024;
  var MAX_CACHE_ENTRIES = 45;

  var assetCache = {};
  var cacheOrder = [];
  var silCache = {};
  var shadowBufCv = null;
  var grainTileCv = null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // 1-Click Photorealistic Presets
  var PRESETS = {
    flat_pitch: {
      label: 'Flat Pitch / Ground (0m, No Shadow)',
      elevationM: 0, shadowEnabled: false,
      filters: { brightness: 98, contrast: 95, saturation: 88, warmth: 8, blurPx: 0.4, grain: 6 }
    },
    tent_shade: {
      label: 'Tent / Shade Canopy (3.0m)',
      elevationM: 3.0, shadowEnabled: true,
      filters: { brightness: 96, contrast: 94, saturation: 90, warmth: 10, blurPx: 0.4, grain: 6 }
    },
    caravan_bldg: {
      label: 'Caravan / Building (4.8m)',
      elevationM: 4.8, shadowEnabled: true,
      filters: { brightness: 95, contrast: 96, saturation: 88, warmth: 10, blurPx: 0.5, grain: 8 }
    },
    cutout_match: {
      label: '1:1 Cutout Match (3.0m, Neutral)',
      elevationM: 3.0, shadowEnabled: true,
      filters: { brightness: 100, contrast: 100, saturation: 100, warmth: 0, blurPx: 0, grain: 0 }
    },
    reset: {
      label: 'Reset Filters (Default)',
      elevationM: null, shadowEnabled: null,
      filters: { brightness: 100, contrast: 100, saturation: 100, warmth: 0, blurPx: 0, grain: 0 }
    }
  };

  var SHADOW_COLORS = {
    desert: '#2a2118',  // Warm sandy soil shadow
    neutral: '#0f172a'  // Cool asphalt / concrete shadow
  };

  // Compass bearing helper (0=N, 90=E, 180=S, 270=W)
  function compassLabel(deg) {
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    var d = (((deg % 360) + 360) % 360);
    return dirs[Math.round(d / 45) % 8];
  }

  // Global shadow vector in image pixel coordinates (+X East, +Y South)
  function computeShadowVector(sun, elevationM, pxPerMeter) {
    var elev = Math.max(0, +elevationM || 0);
    var lenFac = Math.max(0, sun && sun.lengthFactor != null ? +sun.lengthFactor : 0.75);
    if (elev <= 0 || lenFac <= 0) return { dx: 0, dy: 0, distPx: 0, castDeg: 0 };
    var az = sun && sun.azimuthDeg != null ? +sun.azimuthDeg : 135;
    // Light comes FROM az, so shadow casts TOWARD az + 180
    var castDeg = ((az + 180) % 360 + 360) % 360;
    var rad = castDeg * D;
    var ppm = pxPerMeter > 0 ? pxPerMeter : 4.5; // fallback px/m if uncalibrated
    var distPx = elev * lenFac * ppm;
    return {
      dx: Math.sin(rad) * distPx,
      dy: -Math.cos(rad) * distPx,
      distPx: distPx,
      castDeg: castDeg
    };
  }

  // Deterministic monochrome sensor grain tile (128x128, zero flicker)
  function getGrainTile() {
    if (grainTileCv) return grainTileCv;
    grainTileCv = document.createElement('canvas');
    grainTileCv.width = 128; grainTileCv.height = 128;
    var gctx = grainTileCv.getContext('2d');
    var imgData = gctx.createImageData(128, 128), d = imgData.data;
    var seed = 133791;
    for (var i = 0; i < d.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      var v = (seed >>> 24) & 255;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    gctx.putImageData(imgData, 0, 0);
    return grainTileCv;
  }

  function evictIfNeeded() {
    while (cacheOrder.length > MAX_CACHE_ENTRIES) {
      var oldKey = cacheOrder.shift();
      var entry = assetCache[oldKey];
      if (entry && entry.canvas) { entry.canvas.width = 0; entry.canvas.height = 0; }
      delete assetCache[oldKey];
    }
  }

  // Cached per-asset silhouette tinted with global shadow color
  function getSilhouette(binId, im, colorHex, forExport) {
    var maxE = forExport ? 4096 : MAX_LIVE_ASSET_EDGE;
    var sc = Math.min(1, maxE / Math.max(1, im.naturalWidth, im.naturalHeight));
    var cw = Math.max(1, Math.round(im.naturalWidth * sc));
    var ch = Math.max(1, Math.round(im.naturalHeight * sc));
    var key = binId + '|' + colorHex + '|' + cw + 'x' + ch;
    if (silCache[key]) return silCache[key];

    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var g = c.getContext('2d');
    g.drawImage(im, 0, 0, cw, ch);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = colorHex || '#2a2118';
    g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'source-over';

    if (Object.keys(silCache).length > MAX_CACHE_ENTRIES) clearSilCache();
    silCache[key] = c;
    return c;
  }

  // Cached per-asset satellite-matched canvas (Brightness/Contrast/Sat/Warmth/Blur/Grain)
  function getFilteredAsset(asset, im, forExport) {
    var f = asset.filters || {};
    var br = clamp(f.brightness != null ? +f.brightness : 100, 40, 180);
    var ct = clamp(f.contrast != null ? +f.contrast : 100, 40, 180);
    var sa = clamp(f.saturation != null ? +f.saturation : 100, 0, 200);
    var wm = clamp(f.warmth != null ? +f.warmth : 0, -50, 50);
    var bl = clamp(f.blurPx != null ? +f.blurPx : 0, 0, 2.5);
    var gr = clamp(f.grain != null ? +f.grain : 0, 0, 40);

    // Fast path: no visual filters active
    if (br === 100 && ct === 100 && sa === 100 && wm === 0 && bl === 0 && gr === 0) {
      return { canvas: im, cw: im.naturalWidth, ch: im.naturalHeight, pad: 0 };
    }

    var maxE = forExport ? Math.max(im.naturalWidth, im.naturalHeight, Math.ceil(asset.wPx), Math.ceil(asset.hPx)) : MAX_LIVE_ASSET_EDGE;
    maxE = Math.min(maxE, 4096);
    var sc = Math.min(1, maxE / Math.max(1, im.naturalWidth, im.naturalHeight));
    var cw = Math.max(1, Math.round(im.naturalWidth * sc));
    var ch = Math.max(1, Math.round(im.naturalHeight * sc));
    var scaledBlur = +(bl * sc).toFixed(2);
    var pad = scaledBlur > 0 ? Math.ceil(scaledBlur * 3) + 1 : 0;

    var key = [asset.binId, cw, ch, br, ct, sa, wm, scaledBlur, gr].join('|');
    if (assetCache[key]) return assetCache[key];

    var c = document.createElement('canvas');
    c.width = cw + pad * 2;
    c.height = ch + pad * 2;
    var g = c.getContext('2d');

    // 1. Brightness, Contrast, Saturation & Satellite Sharpness Blur
    var fParts = [];
    if (br !== 100) fParts.push('brightness(' + br + '%)');
    if (ct !== 100) fParts.push('contrast(' + ct + '%)');
    if (sa !== 100) fParts.push('saturate(' + sa + '%)');
    if (scaledBlur > 0) fParts.push('blur(' + scaledBlur + 'px)');
    if (fParts.length && 'filter' in g) g.filter = fParts.join(' ');
    g.drawImage(im, pad, pad, cw, ch);
    g.filter = 'none';

    // 2. Warmth / Tint strictly inside asset alpha (source-atop)
    if (wm !== 0) {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = wm > 0 ? '#e59a4c' : '#4fa3e3';
      g.globalAlpha = (Math.abs(wm) / 50) * 0.28;
      g.fillRect(0, 0, c.width, c.height);
      g.restore();
    }

    // 3. Subtle Digital Sensor Grain strictly inside asset alpha (source-atop)
    if (gr > 0) {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = (gr / 40) * 0.22;
      var pat = g.createPattern(getGrainTile(), 'repeat');
      if (pat) {
        g.fillStyle = pat;
        g.fillRect(0, 0, c.width, c.height);
      }
      g.restore();
    }

    var out = { canvas: c, cw: cw, ch: ch, pad: pad };
    assetCache[key] = out;
    cacheOrder.push(key);
    evictIfNeeded();
    return out;
  }

  function drawSingleAsset(ctx, a, im, scale, ox, oy, layOp, forExport) {
    var entry = getFilteredAsset(a, im, forExport);
    var dw = a.wPx * scale, dh = a.hPx * scale;
    var padDw = entry.pad ? entry.pad * (dw / Math.max(1, entry.cw)) : 0;
    var padDh = entry.pad ? entry.pad * (dh / Math.max(1, entry.ch)) : 0;
    var sx = ox + a.x * scale, sy = oy + a.y * scale;

    ctx.save();
    ctx.globalAlpha = layOp * clamp(a.opacity != null ? a.opacity : 1, 0, 1);
    ctx.translate(sx, sy);
    if (a.rotationDeg) ctx.rotate(a.rotationDeg * D);
    if (a.flipX || a.flipY) ctx.scale(a.flipX ? -1 : 1, a.flipY ? -1 : 1);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(entry.canvas, -dw / 2 - padDw, -dh / 2 - padDh, dw + padDw * 2, dh + padDh * 2);
    ctx.restore();
  }

  // Unified Layer 03 Renderer (Reusable for Live Viewport AND Phase 4 High-Res Export)
  function renderLayer03(targetCtx, opts) {
    var assets = opts.assets || [];
    var imgsMap = opts.imgs || {};
    var sun = opts.sun || { azimuthDeg: 135, lengthFactor: 0.75, opacity: 0.38, blurPx: 4, color: '#2a2118' };
    var ppm = opts.pxPerMeter || 0;
    var layOp = clamp(opts.layerOpacity != null ? opts.layerOpacity : 1, 0, 1);
    var scale = opts.scale || 1;
    var ox = opts.ox || 0, oy = opts.oy || 0;
    var vw = Math.max(1, Math.ceil(opts.viewW || 1));
    var vh = Math.max(1, Math.ceil(opts.viewH || 1));
    var forExport = !!opts.forExport;

    var flatList = [], elevList = [];
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (!a.visible || !imgsMap[a.binId]) continue;
      if (a.shadowEnabled !== false && (+a.elevationM || 0) > 0) elevList.push(a);
      else flatList.push(a);
    }

    // PASS 1: Flat ground assets (pitches, roads, pads) sit beneath elevated shadows
    for (var f = 0; f < flatList.length; f++) {
      drawSingleAsset(targetCtx, flatList[f], imgsMap[flatList[f].binId], scale, ox, oy, layOp, forExport);
    }

    // PASS 2: Unified Global Sun Shadow Pass (Multiply, decoupled from asset rotation)
    var shOp = clamp(sun.opacity != null ? +sun.opacity : 0.38, 0, 0.9);
    var lenFac = Math.max(0, sun.lengthFactor != null ? +sun.lengthFactor : 0.75);
    if (elevList.length && shOp > 0.005 && lenFac > 0) {
      var blurScreen = Math.max(0, (+sun.blurPx || 0) * scale);
      var useUnifiedBuf = (vw * vh <= 18000000); // Unified anti-double-darken buffer up to ~18 MP
      var drewBuf = false;

      if (useUnifiedBuf) {
        try {
          if (!shadowBufCv) shadowBufCv = document.createElement('canvas');
          if (shadowBufCv.width !== vw || shadowBufCv.height !== vh) {
            shadowBufCv.width = vw; shadowBufCv.height = vh;
          }
          var sctx = shadowBufCv.getContext('2d');
          sctx.clearRect(0, 0, vw, vh);
          for (var j = 0; j < elevList.length; j++) {
            var ea = elevList[j];
            var vec = computeShadowVector(sun, ea.elevationM, ppm);
            var sil = getSilhouette(ea.binId, imgsMap[ea.binId], sun.color || '#2a2118', forExport);
            var sx = ox + (ea.x + vec.dx) * scale;
            var sy = oy + (ea.y + vec.dy) * scale;
            var dw = ea.wPx * scale, dh = ea.hPx * scale;
            sctx.save();
            sctx.globalAlpha = clamp(ea.opacity != null ? ea.opacity : 1, 0, 1);
            sctx.translate(sx, sy);
            if (ea.rotationDeg) sctx.rotate(ea.rotationDeg * D);
            if (ea.flipX || ea.flipY) sctx.scale(ea.flipX ? -1 : 1, ea.flipY ? -1 : 1);
            sctx.drawImage(sil, -dw / 2, -dh / 2, dw, dh);
            sctx.restore();
          }

          targetCtx.save();
          targetCtx.globalCompositeOperation = 'multiply';
          targetCtx.globalAlpha = shOp * layOp;
          if (blurScreen > 0.2 && 'filter' in targetCtx) targetCtx.filter = 'blur(' + blurScreen.toFixed(2) + 'px)';
          targetCtx.drawImage(shadowBufCv, 0, 0);
          targetCtx.filter = 'none';
          targetCtx.restore();
          drewBuf = true;
        } catch (bufErr) {
          if (shadowBufCv) { shadowBufCv.width = 0; shadowBufCv.height = 0; shadowBufCv = null; }
        }
      }

      // Fail-safe direct Multiply fallback (for ultra-large export canvases > 18 MP)
      if (!drewBuf) {
        targetCtx.save();
        targetCtx.globalCompositeOperation = 'multiply';
        if (blurScreen > 0.2 && 'filter' in targetCtx) targetCtx.filter = 'blur(' + blurScreen.toFixed(2) + 'px)';
        for (var k = 0; k < elevList.length; k++) {
          var ea2 = elevList[k];
          var vec2 = computeShadowVector(sun, ea2.elevationM, ppm);
          var sil2 = getSilhouette(ea2.binId, imgsMap[ea2.binId], sun.color || '#2a2118', forExport);
          var sx2 = ox + (ea2.x + vec2.dx) * scale;
          var sy2 = oy + (ea2.y + vec2.dy) * scale;
          var dw2 = ea2.wPx * scale, dh2 = ea2.hPx * scale;
          targetCtx.save();
          targetCtx.globalAlpha = shOp * layOp * clamp(ea2.opacity != null ? ea2.opacity : 1, 0, 1);
          targetCtx.translate(sx2, sy2);
          if (ea2.rotationDeg) targetCtx.rotate(ea2.rotationDeg * D);
          if (ea2.flipX || ea2.flipY) targetCtx.scale(ea2.flipX ? -1 : 1, ea2.flipY ? -1 : 1);
          targetCtx.drawImage(sil2, -dw2 / 2, -dh2 / 2, dw2, dh2);
          targetCtx.restore();
        }
        targetCtx.filter = 'none';
        targetCtx.restore();
      }
    }

    // PASS 3: Elevated assets rendered crisply on top of unified shadows
    for (var e = 0; e < elevList.length; e++) {
      drawSingleAsset(targetCtx, elevList[e], imgsMap[elevList[e].binId], scale, ox, oy, layOp, forExport);
    }
  }

  function clearSilCache() {
    Object.keys(silCache).forEach(function (k) {
      if (silCache[k]) { silCache[k].width = 0; silCache[k].height = 0; }
    });
    silCache = {};
  }

  function clearCache() {
    Object.keys(assetCache).forEach(function (k) {
      if (assetCache[k] && assetCache[k].canvas) {
        assetCache[k].canvas.width = 0; assetCache[k].canvas.height = 0;
      }
    });
    assetCache = {};
    cacheOrder = [];
    clearSilCache();
    if (shadowBufCv) { shadowBufCv.width = 0; shadowBufCv.height = 0; shadowBufCv = null; }
  }

  S.SatBlending = {
    PRESETS: PRESETS,
    SHADOW_COLORS: SHADOW_COLORS,
    compassLabel: compassLabel,
    computeShadowVector: computeShadowVector,
    renderLayer03: renderLayer03,
    clearCache: clearCache
  };
})(window.SOS);
