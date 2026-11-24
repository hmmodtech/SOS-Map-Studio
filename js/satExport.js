window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  var SANS = 'system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif';
  var D = Math.PI / 180;
  var MAX_SAFE_EDGE = 16384;

  var PIN_CATS = {
    rec:  { label: 'Field / Recreation', ar: 'ملعب / ترفيه', color: '#16a34a' },
    bldg: { label: 'Building / Shade',   ar: 'مبنى / مظلة',  color: '#0284c7' },
    tent: { label: 'Tent / Caravan',     ar: 'خيمة / كرفان', color: '#d97706' },
    med:  { label: 'Clinic / Emergency', ar: 'عيادة / طوارئ', color: '#dc2626' },
    sec:  { label: 'Security / Gate',    ar: 'أمن / بوابة',  color: '#7c3aed' }
  };

  var PAPERS = {
    A3_L:   { w: 420, h: 297, label: 'A3 Landscape (42×29.7 cm)' },
    A3_P:   { w: 297, h: 420, label: 'A3 Portrait (29.7×42 cm)' },
    A2_L:   { w: 594, h: 420, label: 'A2 Landscape (59.4×42 cm)' },
    A2_P:   { w: 420, h: 594, label: 'A2 Portrait (42×59.4 cm)' },
    A1_L:   { w: 841, h: 594, label: 'A1 Landscape (84.1×59.4 cm)' },
    A1_P:   { w: 594, h: 841, label: 'A1 Portrait (59.4×84.1 cm)' },
    CUSTOM: { w: 600, h: 400, label: 'Custom Size (cm)' }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function paperMm(cfg) {
    var key = (cfg && cfg.paper) || 'A2_L';
    if (key === 'CUSTOM') {
      return {
        w: clamp((parseFloat(cfg.customWcm) || 60) * 10, 100, 2000),
        h: clamp((parseFloat(cfg.customHcm) || 40) * 10, 100, 2000),
        label: 'Custom'
      };
    }
    return PAPERS[key] || PAPERS.A2_L;
  }

  // Pre-Flight RAM, Max-Edge (<=16384px) & Source Effective DPI Estimator
  function estimateExport(cfg, baseW, baseH) {
    var mm = paperMm(cfg);
    var dpi = [150, 200, 300].indexOf(+cfg.dpi) >= 0 ? (+cfg.dpi) : 200;
    var pw = Math.max(1, Math.round((mm.w / 25.4) * dpi));
    var ph = Math.max(1, Math.round((mm.h / 25.4) * dpi));
    var maxEdge = Math.max(pw, ph);
    var mp = (pw * ph) / 1e6;
    var rawLayerMB = (pw * ph * 4) / (1024 * 1024);
    var estPeakMB = rawLayerMB * 4.5;

    var level = 'safe';
    var note = 'Safe for desktop export.';
    if (maxEdge > MAX_SAFE_EDGE) {
      level = 'block';
      note = 'BLOCKED: Edge (' + maxEdge + ' px) exceeds browser safe limit (' + MAX_SAFE_EDGE + ' px). Lower DPI or custom size.';
    } else if (mp > 50) {
      level = 'danger';
      note = 'HIGH RAM RISK (~' + Math.round(estPeakMB) + ' MB peak). Recommended cap for A1 wall posters: 200 DPI.';
    } else if (mp > 25) {
      level = 'warn';
      note = 'Moderate RAM (~' + Math.round(estPeakMB) + ' MB peak). Close heavy tabs / 3D view before exporting.';
    }

    // Effective source DPI inside the Contain map area (~74% of poster width or height)
    var effDpi = 0;
    if (baseW > 0 && baseH > 0) {
      var land = pw >= ph;
      var availWIn = (mm.w / 25.4) * (land ? 0.72 : 0.92);
      var availHIn = (mm.h / 25.4) * (land ? 0.80 : 0.64);
      var scaleIn = Math.min(availWIn / baseW, availHIn / baseH);
      effDpi = scaleIn > 0 ? Math.round(1 / scaleIn) : 0;
    }

    return {
      pw: pw, ph: ph, dpi: dpi, mmW: mm.w, mmH: mm.h,
      maxEdge: maxEdge, mp: mp, rawLayerMB: rawLayerMB, estPeakMB: estPeakMB,
      level: level, note: note, effDpi: effDpi
    };
  }

  function pinColor(pin) {
    if (pin && pin.color) return pin.color;
    var c = pin && PIN_CATS[pin.cat];
    return c ? c.color : '#0284c7';
  }

  // Draw a numbered map pin (reused for live viewport & high-res poster)
  function drawNumberedPin(ctx, sx, sy, num, color, rad, isSel, shortTag) {
    ctx.save();
    if (isSel) {
      ctx.beginPath(); ctx.arc(sx, sy, rad + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#f0c44d'; ctx.lineWidth = Math.max(2, rad * 0.2); ctx.stroke();
    }
    // Soft drop shadow for crisp visibility over satellite textures
    ctx.beginPath(); ctx.arc(sx, sy + rad * 0.14, rad * 1.06, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fill();

    ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.8, rad * 0.2); ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.max(10, Math.round(rad * 1.05)) + 'px ' + SANS;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(num), sx, sy + rad * 0.05);

    if (shortTag) {
      var fs = Math.max(9, Math.round(rad * 0.72));
      ctx.font = 'bold ' + fs + 'px ' + SANS;
      var tw = ctx.measureText(shortTag).width + rad * 0.9;
      var bh = fs + rad * 0.5;
      var bx = sx - tw / 2, by = sy + rad + Math.max(3, rad * 0.25);
      ctx.fillStyle = 'rgba(15,23,42,0.88)';
      ctx.fillRect(bx, by, tw, bh);
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, rad * 0.1);
      ctx.strokeRect(bx, by, tw, bh);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(shortTag, sx, by + bh / 2 + 0.5);
    }
    ctx.restore();
  }

  function drawNorthArrow(ctx, cx, cy, rad, northDeg, forPoster) {
    var a = (northDeg || 0) * D;
    var nx = Math.sin(a), ny = -Math.cos(a);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = forPoster ? 'rgba(255,255,255,0.95)' : 'rgba(6,13,24,0.88)';
    ctx.fill();
    ctx.strokeStyle = forPoster ? '#0f172a' : '#00e5ff';
    ctx.lineWidth = Math.max(1.5, rad * 0.06);
    ctx.stroke();

    // North red needle
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -rad * 0.68);
    ctx.lineTo(rad * 0.22, 0);
    ctx.lineTo(-rad * 0.22, 0);
    ctx.closePath();
    ctx.fillStyle = '#dc2626'; ctx.fill();
    // South dark/slate needle
    ctx.beginPath();
    ctx.moveTo(0, rad * 0.62);
    ctx.lineTo(rad * 0.20, 0);
    ctx.lineTo(-rad * 0.20, 0);
    ctx.closePath();
    ctx.fillStyle = forPoster ? '#334155' : '#94a3b8'; ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold ' + Math.max(9, Math.round(rad * 0.34)) + 'px ' + MONO;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', cx + nx * rad * 0.80, cy + ny * rad * 0.80);
    ctx.restore();
  }

  function drawPosterScaleBar(ctx, x0, y0, pxPerMeterOnCanvas, u) {
    if (!(pxPerMeterOnCanvas > 0)) return;
    var nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].filter(function (m) {
      return m * pxPerMeterOnCanvas >= 75 * u;
    })[0] || 1000;
    var barW = nice * pxPerMeterOnCanvas;
    var padX = 12 * u, bh = 38 * u;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillRect(x0, y0 - bh, barW + padX * 2, bh);
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = Math.max(1.2, 1.5 * u);
    ctx.strokeRect(x0, y0 - bh, barW + padX * 2, bh);

    var bx = x0 + padX, by = y0 - 11 * u, segH = 6 * u;
    // Alternating black/white cartographic bar (4 segments)
    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = (i % 2 === 0) ? '#0f172a' : '#ffffff';
      ctx.fillRect(bx + (barW * i / 4), by - segH, barW / 4, segH);
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = Math.max(0.8, u);
      ctx.strokeRect(bx + (barW * i / 4), by - segH, barW / 4, segH);
    }
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold ' + Math.max(10, Math.round(12 * u)) + 'px ' + MONO;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('0', bx, by - segH - 3 * u);
    ctx.textAlign = 'center';
    ctx.fillText((nice / 2) + ' m', bx + barW / 2, by - segH - 3 * u);
    ctx.textAlign = 'right';
    ctx.fillText(nice + ' m', bx + barW, by - segH - 3 * u);
    ctx.restore();
  }

  // Live Viewport Overlay Renderer (Layer 04 preview on interactive canvas)
  function drawLiveOverlays(ctx, opts) {
    var ov = opts.overlays || {};
    var pins = ov.pins || [];
    var i2s = opts.i2s;
    var selPinId = opts.selPinId;
    var layOp = clamp(opts.layerOpacity != null ? opts.layerOpacity : 1, 0, 1);

    ctx.save();
    ctx.globalAlpha = layOp;
    for (var i = 0; i < pins.length; i++) {
      var p = pins[i];
      var sp = i2s(p.x, p.y);
      var tag = p.showTag ? (p.labelAr || p.labelEn || '') : '';
      drawNumberedPin(ctx, sp[0], sp[1], i + 1, pinColor(p), 12, p.id === selPinId, tag);
    }
    if (ov.showNorth !== false) {
      drawNorthArrow(ctx, opts.viewW - 44, 48, 28, ov.northDeg || 0, false);
    }
    ctx.restore();
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function safeFileSlug(s) {
    return String(s || 'Site').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'Site';
  }

  // =========================================================================
  // DUAL EXPORT 1: Master_Clean_2D.png (Layers 1 + 2 + 3 ONLY, 1:1 Native px)
  // =========================================================================
  function exportMasterClean2D(data, onStatus) {
    var report = onStatus || function () {};
    var baseImg = data && data.baseImg;
    var doc = data && data.doc;
    if (!baseImg || !baseImg.naturalWidth) {
      report('Import 01_Base_Satellite first before exporting.', true);
      return;
    }
    var iw = baseImg.naturalWidth, ih = baseImg.naturalHeight;
    if (Math.max(iw, ih) > MAX_SAFE_EDGE) {
      report('Export blocked: base image edge (' + Math.max(iw, ih) + ' px) exceeds ' + MAX_SAFE_EDGE + ' px safe limit.', true);
      return;
    }

    var off = null, clnCv = null;
    try {
      report('Rendering Master_Clean_2D.png (Layers 1+2+3 at exact ' + iw + '×' + ih + ' px)...', false);
      off = document.createElement('canvas');
      off.width = iw; off.height = ih;
      var octx = off.getContext('2d');
      if (!octx) throw new Error('Canvas 2D context allocation failed.');

      // Layer 01: Base Satellite (Zero-Compression 1:1)
      octx.drawImage(baseImg, 0, 0, iw, ih);

      // Layer 02: Ground Cleanup (1:1 natural scale)
      if (doc.layers.cleanup.visible && data.renderCleanupTo) {
        clnCv = document.createElement('canvas');
        clnCv.width = iw; clnCv.height = ih;
        var cctx = clnCv.getContext('2d');
        data.renderCleanupTo(cctx, iw, ih, 1);
        octx.save();
        octx.globalAlpha = clamp(doc.layers.cleanup.opacity != null ? doc.layers.cleanup.opacity : 1, 0, 1);
        octx.drawImage(clnCv, 0, 0);
        octx.restore();
        clnCv.width = 0; clnCv.height = 0; clnCv = null;
      }

      // Layer 03: Movable Assets + Global Sun Shadow + Satellite Match Filters (1:1)
      if (doc.layers.assets.visible && S.SatBlending && S.SatBlending.renderLayer03) {
        S.SatBlending.renderLayer03(octx, {
          assets: doc.assets,
          imgs: data.assetImgs,
          sun: doc.sun,
          pxPerMeter: doc.calibration.pxPerMeter,
          layerOpacity: doc.layers.assets.opacity,
          scale: 1, ox: 0, oy: 0, viewW: iw, viewH: ih,
          forExport: true
        });
      }

      var slug = safeFileSlug(data.siteName);
      off.toBlob(function (blob) {
        if (off) { off.width = 0; off.height = 0; off = null; }
        if (!blob) {
          report('PNG encoding failed (browser memory limit). Close heavy tabs and retry.', true);
          return;
        }
        downloadBlob(blob, 'Master_Clean_2D_' + slug + '_' + iw + 'x' + ih + '.png');
        report('Exported Master_Clean_2D.png (' + iw + '×' + ih + ' px, ' + (blob.size / (1024 * 1024)).toFixed(2) + ' MB) — Ready as 3D Base Texture.', false);
      }, 'image/png');
    } catch (err) {
      if (clnCv) { clnCv.width = 0; clnCv.height = 0; }
      if (off) { off.width = 0; off.height = 0; }
      report('Master_Clean_2D export failed: ' + err.message, true);
    }
  }

  // =========================================================================
  // DUAL EXPORT 2: High-Res Print Poster (Layers 1+2+3+4, Contain Aspect)
  // =========================================================================
  function exportPosterPNG(data, cfg, onStatus) {
    var report = onStatus || function () {};
    var baseImg = data && data.baseImg;
    var doc = data && data.doc;
    if (!baseImg || !baseImg.naturalWidth) {
      report('Import 01_Base_Satellite first before exporting poster.', true);
      return;
    }
    var iw = baseImg.naturalWidth, ih = baseImg.naturalHeight;
    var est = estimateExport(cfg, iw, ih);

    if (est.level === 'block') {
      alert(est.note);
      report(est.note, true);
      return;
    }
    if (est.level === 'danger') {
      var proceed = confirm(
        'HIGH MEMORY WARNING:\n' +
        'Target Poster: ' + est.pw + ' × ' + est.ph + ' px (' + est.mp.toFixed(1) + ' MP @ ' + est.dpi + ' DPI)\n' +
        'Estimated Peak RAM: ~' + Math.round(est.estPeakMB) + ' MB\n\n' +
        'Recommendation: Use 200 DPI for A1 wall posters (sharp from >=1m viewing distance and >55% less RAM).\n\n' +
        'Click OK to attempt export anyway, or Cancel to adjust DPI.'
      );
      if (!proceed) return;
    }

    var off = null, clnCv = null;
    try {
      report('Composing high-res print poster (' + est.pw + '×' + est.ph + ' px @ ' + est.dpi + ' DPI)...', false);
      var pw = est.pw, ph = est.ph;
      var u = Math.min(pw, ph) / 1000;
      var land = pw >= ph;
      var ov = doc.overlays || {};
      var showOver = doc.layers.overlays.visible !== false;
      var pins = ov.pins || [];
      var hasLegendPanel = showOver && ov.showLegend !== false && pins.length > 0;

      off = document.createElement('canvas');
      off.width = pw; off.height = ph;
      var c = off.getContext('2d');
      if (!c) throw new Error('Poster canvas memory allocation failed.');

      // 1. Archival White Poster Background & Frame
      var pad = Math.round(24 * u);
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, pw, ph);
      c.strokeStyle = '#0f172a';
      c.lineWidth = Math.max(2, 4 * u);
      c.strokeRect(pad * 0.5, pad * 0.5, pw - pad, ph - pad);

      // 2. Bilingual Header Bar (if Overlays visible)
      var hdrH = showOver ? Math.round(86 * u) : 0;
      if (showOver) {
        c.fillStyle = '#0a1626';
        c.fillRect(pad, pad, pw - pad * 2, hdrH);
        c.fillStyle = '#00b4d8';
        c.fillRect(pad, pad + hdrH - 6 * u, (pw - pad * 2) * 0.5, 6 * u);
        c.fillStyle = '#00ff9d';
        c.fillRect(pad + (pw - pad * 2) * 0.5, pad + hdrH - 6 * u, (pw - pad * 2) * 0.5, 6 * u);

        var tEn = (ov.titleEn || data.siteName || 'SITE SATELLITE MAP').trim();
        var tAr = (ov.titleAr || '').trim();
        c.fillStyle = '#ffffff';
        c.textBaseline = 'middle';
        c.font = 'bold ' + Math.max(14, Math.round(28 * u)) + 'px ' + SANS;
        c.textAlign = 'left';
        c.fillText(tEn, pad + 20 * u, pad + hdrH * 0.48);
        if (tAr) {
          c.textAlign = 'right';
          c.fillText(tAr, pw - pad - 20 * u, pad + hdrH * 0.48);
        }
      }

      // 3. Layout Partitioning (Map Slot + Legend Panel using Margins)
      var footH = showOver ? Math.round(26 * u) : 0;
      var bodyY = pad + hdrH + (showOver ? Math.round(14 * u) : 0);
      var bodyH = ph - bodyY - pad - footH;
      var gap = Math.round(14 * u);
      var mapBox, legBox = null;

      if (hasLegendPanel) {
        if (land) {
          var legW = Math.round((pw - pad * 2) * 0.24);
          mapBox = { x: pad, y: bodyY, w: pw - pad * 2 - legW - gap, h: bodyH };
          legBox = { x: mapBox.x + mapBox.w + gap, y: bodyY, w: legW, h: bodyH };
        } else {
          var legH = Math.round(bodyH * 0.24);
          mapBox = { x: pad, y: bodyY, w: pw - pad * 2, h: bodyH - legH - gap };
          legBox = { x: pad, y: mapBox.y + mapBox.h + gap, w: pw - pad * 2, h: legH };
        }
      } else {
        mapBox = { x: pad, y: bodyY, w: pw - pad * 2, h: bodyH };
      }

      // Subtle neutral backdrop inside map frame
      c.fillStyle = '#f1f5f9';
      c.fillRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h);

      // 4. STRICT CONTAIN SCALING (Zero stretching, zero cropping)
      var mapScale = Math.min(mapBox.w / iw, mapBox.h / ih);
      var drawW = iw * mapScale, drawH = ih * mapScale;
      var imgX = mapBox.x + (mapBox.w - drawW) / 2;
      var imgY = mapBox.y + (mapBox.h - drawH) / 2;

      // Clip strictly to true satellite bounds while compositing Layers 1 + 2 + 3
      c.save();
      c.beginPath();
      c.rect(imgX, imgY, drawW, drawH);
      c.clip();

      // Layer 01: Base Satellite
      if (doc.layers.base.visible) {
        c.save();
        c.globalAlpha = clamp(doc.layers.base.opacity != null ? doc.layers.base.opacity : 1, 0, 1);
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(baseImg, imgX, imgY, drawW, drawH);
        c.restore();
      }

      // Layer 02: Ground Cleanup rendered at target poster scale (or 1:1 capped safely)
      if (doc.layers.cleanup.visible && data.renderCleanupTo) {
        var cw = Math.max(1, Math.min(MAX_SAFE_EDGE, Math.round(drawW)));
        var ch = Math.max(1, Math.min(MAX_SAFE_EDGE, Math.round(drawH)));
        clnCv = document.createElement('canvas');
        clnCv.width = cw; clnCv.height = ch;
        var cctx = clnCv.getContext('2d');
        data.renderCleanupTo(cctx, cw, ch, cw / iw);
        c.save();
        c.globalAlpha = clamp(doc.layers.cleanup.opacity != null ? doc.layers.cleanup.opacity : 1, 0, 1);
        c.drawImage(clnCv, imgX, imgY, drawW, drawH);
        c.restore();
        clnCv.width = 0; clnCv.height = 0; clnCv = null;
      }

      // Layer 03: Movable Assets + Global Sun Shadow + Satellite Match Filters
      if (doc.layers.assets.visible && S.SatBlending && S.SatBlending.renderLayer03) {
        S.SatBlending.renderLayer03(c, {
          assets: doc.assets,
          imgs: data.assetImgs,
          sun: doc.sun,
          pxPerMeter: doc.calibration.pxPerMeter,
          layerOpacity: doc.layers.assets.opacity,
          scale: mapScale,
          ox: imgX,
          oy: imgY,
          viewW: pw,
          viewH: ph,
          forExport: true
        });
      }
      c.restore();

      // Crisp border around satellite frame & map container
      c.strokeStyle = '#334155'; c.lineWidth = Math.max(1.5, 2 * u);
      c.strokeRect(imgX, imgY, drawW, drawH);
      c.strokeStyle = '#94a3b8'; c.lineWidth = Math.max(1, 1.4 * u);
      c.strokeRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h);

      // 5. Layer 04: Print Overlays (Numbered Pins, North Arrow, Scale Bar, Legend)
      if (showOver) {
        var pinRad = Math.max(11, Math.round(16 * u));
        for (var i = 0; i < pins.length; i++) {
          var p = pins[i];
          var px = imgX + p.x * mapScale;
          var py = imgY + p.y * mapScale;
          var tag = p.showTag ? (p.labelAr || p.labelEn || '') : '';
          drawNumberedPin(c, px, py, i + 1, pinColor(p), pinRad, false, tag);
        }

        if (ov.showNorth !== false) {
          var nRad = Math.max(22, Math.round(32 * u));
          drawNorthArrow(c, mapBox.x + mapBox.w - nRad - 16 * u, mapBox.y + nRad + 16 * u, nRad, ov.northDeg || 0, true);
        }

        if (ov.showScale !== false && doc.calibration.pxPerMeter > 0) {
          drawPosterScaleBar(c, mapBox.x + 16 * u, mapBox.y + mapBox.h - 16 * u, doc.calibration.pxPerMeter * mapScale, u);
        }

        if (legBox) {
          drawLegendPanel(c, legBox, pins, u, land);
        }

        // Metadata print footer
        c.fillStyle = '#475569';
        c.font = Math.max(9, Math.round(11 * u)) + 'px ' + MONO;
        c.textBaseline = 'bottom';
        c.textAlign = 'left';
        var scaleInfo = doc.calibration.pxPerMeter > 0 ? ('Calibrated: ' + doc.calibration.pxPerMeter.toFixed(2) + ' px/m') : 'Scale: Uncalibrated';
        c.fillText('AJ-GeoCAD Studio • ' + (cfg.paper || 'A2_L') + ' @ ' + est.dpi + ' DPI (' + pw + '×' + ph + ' px) • ' + scaleInfo, pad, ph - pad * 0.65);
        c.textAlign = 'right';
        c.fillText(new Date().toISOString().slice(0, 10), pw - pad, ph - pad * 0.65);
      }

      var slug = safeFileSlug(ov.titleEn || data.siteName);
      var fname = 'Poster_' + slug + '_' + (cfg.paper || 'A2_L') + '_' + est.dpi + 'dpi.png';

      off.toBlob(function (blob) {
        if (off) { off.width = 0; off.height = 0; off = null; }
        if (!blob) {
          report('Poster PNG encoding returned null (browser memory limit). Switch to 200 DPI or smaller size.', true);
          return;
        }
        downloadBlob(blob, fname);
        report('Exported ' + fname + ' (' + (blob.size / (1024 * 1024)).toFixed(2) + ' MB, Contain aspect preserved).', false);
      }, 'image/png');
    } catch (err) {
      if (clnCv) { clnCv.width = 0; clnCv.height = 0; }
      if (off) { off.width = 0; off.height = 0; }
      report('Poster export failed safely (Studio unaffected): ' + err.message, true);
    }
  }

  function drawLegendPanel(c, box, pins, u, isVertical) {
    c.save();
    c.fillStyle = '#f8fafc';
    c.fillRect(box.x, box.y, box.w, box.h);
    c.strokeStyle = '#cbd5e1'; c.lineWidth = Math.max(1.5, 2 * u);
    c.strokeRect(box.x, box.y, box.w, box.h);

    var hdrH = Math.round(36 * u);
    c.fillStyle = '#0f172a';
    c.fillRect(box.x, box.y, box.w, hdrH);
    c.fillStyle = '#ffffff';
    c.font = 'bold ' + Math.max(11, Math.round(14 * u)) + 'px ' + SANS;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText('KEY / LEGEND', box.x + 12 * u, box.y + hdrH / 2);
    c.textAlign = 'right';
    c.fillText('مفتاح الخريطة', box.x + box.w - 12 * u, box.y + hdrH / 2);

    var innerX = box.x + 12 * u, innerY = box.y + hdrH + 12 * u;
    var innerW = box.w - 24 * u, innerH = box.h - hdrH - 22 * u;
    var cols = isVertical ? 1 : (pins.length > 5 ? 3 : 2);
    var rowsPerCol = Math.max(1, Math.ceil(pins.length / cols));
    var colW = innerW / cols;
    var rowH = Math.min(44 * u, Math.max(22 * u, innerH / rowsPerCol));
    var badgeR = Math.min(12 * u, rowH * 0.36);

    for (var i = 0; i < pins.length; i++) {
      var p = pins[i];
      var colIdx = Math.floor(i / rowsPerCol);
      var rowIdx = i % rowsPerCol;
      var rx = innerX + colIdx * colW;
      var ry = innerY + rowIdx * rowH + rowH / 2;
      if (ry + badgeR > box.y + box.h - 6 * u) break;

      var col = pinColor(p);
      c.beginPath(); c.arc(rx + badgeR, ry, badgeR, 0, Math.PI * 2);
      c.fillStyle = col; c.fill();
      c.strokeStyle = '#0f172a'; c.lineWidth = Math.max(1, u); c.stroke();
      c.fillStyle = '#ffffff';
      c.font = 'bold ' + Math.max(9, Math.round(badgeR * 1.1)) + 'px ' + SANS;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(i + 1), rx + badgeR, ry + 0.5);

      var textX = rx + badgeR * 2 + 8 * u;
      var maxTxtW = colW - badgeR * 2 - 14 * u;
      var hasAr = !!(p.labelAr && p.labelAr.trim());
      var hasEn = !!(p.labelEn && p.labelEn.trim());

      c.fillStyle = '#0f172a';
      c.textAlign = 'left';
      if (hasEn && hasAr) {
        c.font = 'bold ' + Math.max(9, Math.round(12 * u)) + 'px ' + SANS;
        c.fillText(p.labelEn.trim(), textX, ry - rowH * 0.18, maxTxtW);
        c.fillStyle = '#334155';
        c.font = 'bold ' + Math.max(9, Math.round(12 * u)) + 'px ' + SANS;
        c.textAlign = 'right';
        c.fillText(p.labelAr.trim(), rx + colW - 6 * u, ry + rowH * 0.22, maxTxtW);
      } else {
        var single = (hasAr ? p.labelAr : (hasEn ? p.labelEn : ('Point #' + (i + 1)))).trim();
        c.font = 'bold ' + Math.max(9, Math.round(13 * u)) + 'px ' + SANS;
        c.textAlign = hasAr && !hasEn ? 'right' : 'left';
        c.fillText(single, hasAr && !hasEn ? (rx + colW - 6 * u) : textX, ry, maxTxtW);
      }
    }
    c.restore();
  }

  S.SatExport = {
    PIN_CATS: PIN_CATS,
    PAPERS: PAPERS,
    estimateExport: estimateExport,
    drawLiveOverlays: drawLiveOverlays,
    exportMasterClean2D: exportMasterClean2D,
    exportPosterPNG: exportPosterPNG
  };
})(window.SOS);
